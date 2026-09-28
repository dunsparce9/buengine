/**
 * File system provider — uses the File System Access API for local folder access.
 */

import { state } from './state.js';

/** Whether the browser supports the File System Access API. */
export const hasNativeFS = typeof window.showDirectoryPicker === 'function';

/* ── Open folder ───────────────────────────────── */

/**
 * Pick a local game folder without replacing the current workspace.
 * Returns the handle or null if cancelled.
 */
export async function openFolder() {
  if (!hasNativeFS) {
    alert('Your browser does not support the File System Access API.\nPlease use Chrome or Edge.');
    return null;
  }
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if (e.name === 'AbortError') return null;
    throw e;
  }
}

export async function openFolderHandle(handle) {
  state.rootHandle = handle;
  await buildTree();
  return handle;
}

export async function ensureHandlePermission(handle, mode = 'readwrite') {
  if (!handle) return false;
  if (typeof handle.queryPermission !== 'function') return true;

  const options = { mode };
  if (await handle.queryPermission(options) === 'granted') return true;
  if (typeof handle.requestPermission !== 'function') return false;
  return (await handle.requestPermission(options)) === 'granted';
}

/* ── Tree scanning ─────────────────────────────── */

/**
 * Recursively scan the root handle and populate state.fileTree.
 */
export async function buildTree(root = state.rootHandle) {
  if (!root) return;
  const scripts = state.scripts;
  const tree = await _scanDir(root, '');
  if (state.rootHandle === root && state.scripts === scripts) state.fileTree = tree;
}

async function _scanDir(dirHandle, basePath) {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const path = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === 'directory') {
      const children = await _scanDir(handle, path);
      entries.push({ name, path, type: 'dir', handle, children });
    } else {
      entries.push({ name, path, type: 'file', handle });
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/* ── Node lookup ───────────────────────────────── */

export function findNode(path) {
  const parts = path.split('/').filter(Boolean);
  let nodes = state.fileTree;
  for (let i = 0; i < parts.length; i++) {
    if (!nodes) return null;
    const node = nodes.find(n => n.name === parts[i]);
    if (!node) return null;
    if (i === parts.length - 1) return node;
    nodes = node.children;
  }
  return null;
}

/* ── Read ──────────────────────────────────────── */

export async function readFileText(path) {
  const node = findNode(path);
  if (!node || node.type !== 'file') throw new Error(`Not found: ${path}`);
  const file = await node.handle.getFile();
  return await file.text();
}

export async function readFileBinary(path) {
  const node = findNode(path);
  if (!node || node.type !== 'file') throw new Error(`Not found: ${path}`);
  const file = await node.handle.getFile();
  return await file.arrayBuffer();
}

/* ── Write ─────────────────────────────────────── */

async function _navigateToDir(pathParts, create = false, root = state.rootHandle) {
  let dir = root;
  for (const part of pathParts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

export async function writeFile(path, content, root = state.rootHandle) {
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();
  const dir = await _navigateToDir(parts, true, root);
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export const writeFileBinary = writeFile;

/* ── Delete ────────────────────────────────────── */

export async function deleteEntry(path, root = state.rootHandle) {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  const dir = await _navigateToDir(parts, false, root);
  await dir.removeEntry(name, { recursive: true });
}

/* ── Create folder ─────────────────────────────── */

export async function createDir(path, root = state.rootHandle) {
  await _navigateToDir(path.split('/').filter(Boolean), true, root);
}

/* ── Move / Rename ─────────────────────────────── */

export async function moveEntry(oldPath, newPath, root = state.rootHandle) {
  if (state.rootHandle !== root) throw new Error('Workspace changed before moving the entry.');
  const parts = newPath.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"\\|?*\x00-\x1f]/.test(part))) {
    throw new Error('Invalid destination path.');
  }
  if (newPath.toLowerCase() === oldPath.toLowerCase() || newPath.toLowerCase().startsWith(`${oldPath.toLowerCase()}/`)) {
    throw new Error('Cannot move an entry onto itself or into its own folder.');
  }
  let nodes = state.fileTree;
  for (let i = 0; nodes && i < parts.length; i++) {
    const existing = nodes.find(node => node.name.toLowerCase() === parts[i].toLowerCase());
    if (!existing) break;
    if (i === parts.length - 1) throw new Error(`Already exists: ${newPath}`);
    nodes = existing.children;
  }
  const node = findNode(oldPath);
  if (!node) throw new Error(`Not found: ${oldPath}`);
  if (node.type === 'file') {
    const file = await node.handle.getFile();
    const buf = await file.arrayBuffer();
    await writeFileBinary(newPath, buf, root);
    await deleteEntry(oldPath, root);
  } else {
    await _copyDirRecursive(node, newPath, root);
    await deleteEntry(oldPath, root);
  }
}

async function _copyDirRecursive(node, destPath, root) {
  await createDir(destPath, root);
  for (const child of node.children) {
    const childDest = `${destPath}/${child.name}`;
    if (child.type === 'dir') {
      await _copyDirRecursive(child, childDest, root);
    } else {
      const file = await child.handle.getFile();
      const buf = await file.arrayBuffer();
      await writeFileBinary(childDest, buf, root);
    }
  }
}

export async function renameEntry(path, newName, root = state.rootHandle) {
  if (!newName || /[/\\]/.test(newName)) throw new Error('Rename requires a filename, without a folder path.');
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  const newPath = parts.length ? `${parts.join('/')}/${newName}` : newName;
  await moveEntry(path, newPath, root);
  return newPath;
}

/* ── Asset URL cache ───────────────────────────── */

/**
 * Get a displayable blob URL for an asset path.
 */
export async function resolveAssetURL(path) {
  const cache = state.assetURLCache;
  if (cache.has(path)) return cache.get(path);
  const root = state.rootHandle;
  const node = findNode(path);
  if (!node || node.type !== 'file') return '';
  const file = await node.handle.getFile();
  if (state.rootHandle !== root || state.assetURLCache !== cache || findNode(path) !== node) return '';
  if (cache.has(path)) return cache.get(path);
  const url = URL.createObjectURL(file);
  cache.set(path, url);
  return url;
}

/**
 * Synchronous URL lookup — returns cached blob URL or empty string.
 */
export function resolveAssetURLSync(path) {
  return state.assetURLCache.get(path) || '';
}

/** Pre-warm the asset URL cache for a set of paths. */
export async function cacheAssetURLs(paths) {
  await Promise.all(paths.map(p => resolveAssetURL(p)));
}

/** Revoke all cached blob URLs. */
export function clearAssetCache() {
  for (const url of state.assetURLCache.values()) {
    URL.revokeObjectURL(url);
  }
  state.assetURLCache = new Map();
}

/* ── Collect all file paths from tree ──────────── */

export function collectAllPaths(tree = state.fileTree) {
  const paths = [];
  function walk(nodes) {
    for (const n of nodes) {
      if (n.type === 'file') paths.push(n.path);
      else if (n.children) walk(n.children);
    }
  }
  walk(tree);
  return paths;
}
