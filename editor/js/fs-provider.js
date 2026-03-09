/**
 * File system abstraction — supports in-memory (fetch) and native (File System Access API) modes.
 *
 * Native mode gives full read/write to a local game folder via showDirectoryPicker().
 * Memory mode (legacy) loads via fetch and keeps edits in-memory only.
 */

import { state, SCRIPTS_BASE } from './state.js';

/** Whether the browser supports the File System Access API. */
export const hasNativeFS = typeof window.showDirectoryPicker === 'function';

/* ── Open folder ───────────────────────────────── */

/**
 * Prompt user to pick a local game folder. Returns the handle or null if cancelled.
 */
export async function openFolder() {
  if (!hasNativeFS) {
    alert('Your browser does not support the File System Access API.\nPlease use Chrome or Edge.');
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.rootHandle = handle;
    state.fsMode = 'native';
    await buildTree();
    return handle;
  } catch (e) {
    if (e.name === 'AbortError') return null;
    throw e;
  }
}

/* ── Tree scanning ─────────────────────────────── */

/**
 * Recursively scan the root handle and populate state.fileTree.
 */
export async function buildTree() {
  if (state.fsMode !== 'native' || !state.rootHandle) return;
  state.fileTree = await _scanDir(state.rootHandle, '');
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

/**
 * Build a synthetic tree from known paths (for legacy/memory mode).
 * Accepts an array of relative path strings.
 */
export function buildSyntheticTree(paths) {
  const root = [];
  for (const p of paths) {
    const parts = p.split('/');
    let level = root;
    let current = '';
    for (let i = 0; i < parts.length; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      const isLast = i === parts.length - 1;
      let node = level.find(n => n.name === parts[i]);
      if (!node) {
        node = isLast
          ? { name: parts[i], path: current, type: 'file' }
          : { name: parts[i], path: current, type: 'dir', children: [] };
        level.push(node);
      }
      if (!isLast) level = node.children;
    }
  }
  _sortTree(root);
  return root;
}

function _sortTree(nodes) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) {
    if (n.children) _sortTree(n.children);
  }
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
  if (state.fsMode === 'native') {
    const node = findNode(path);
    if (!node || node.type !== 'file') throw new Error(`Not found: ${path}`);
    const file = await node.handle.getFile();
    return await file.text();
  }
  const res = await fetch(`${SCRIPTS_BASE}/${path}`);
  if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
  return await res.text();
}

export async function readFileBinary(path) {
  if (state.fsMode === 'native') {
    const node = findNode(path);
    if (!node || node.type !== 'file') throw new Error(`Not found: ${path}`);
    const file = await node.handle.getFile();
    return await file.arrayBuffer();
  }
  const res = await fetch(`${SCRIPTS_BASE}/${path}`);
  if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
  return await res.arrayBuffer();
}

/* ── Write ─────────────────────────────────────── */

async function _navigateToDir(pathParts, create = false) {
  let dir = state.rootHandle;
  for (const part of pathParts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

export async function writeFile(path, content) {
  if (state.fsMode !== 'native') throw new Error('Write requires native FS mode');
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();
  const dir = await _navigateToDir(parts, true);
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function writeFileBinary(path, data) {
  if (state.fsMode !== 'native') throw new Error('Write requires native FS mode');
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();
  const dir = await _navigateToDir(parts, true);
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/* ── Delete ────────────────────────────────────── */

export async function deleteEntry(path) {
  if (state.fsMode !== 'native') throw new Error('Delete requires native FS mode');
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  const dir = await _navigateToDir(parts);
  await dir.removeEntry(name, { recursive: true });
}

/* ── Create folder ─────────────────────────────── */

export async function createDir(path) {
  if (state.fsMode !== 'native') throw new Error('Create requires native FS mode');
  await _navigateToDir(path.split('/').filter(Boolean), true);
}

/* ── Move / Rename ─────────────────────────────── */

export async function moveEntry(oldPath, newPath) {
  if (state.fsMode !== 'native') throw new Error('Move requires native FS mode');
  const node = findNode(oldPath);
  if (!node) throw new Error(`Not found: ${oldPath}`);
  if (node.type === 'file') {
    const file = await node.handle.getFile();
    const buf = await file.arrayBuffer();
    await writeFileBinary(newPath, buf);
    await deleteEntry(oldPath);
  } else {
    await _copyDirRecursive(node, newPath);
    await deleteEntry(oldPath);
  }
}

async function _copyDirRecursive(node, destPath) {
  await createDir(destPath);
  for (const child of node.children) {
    const childDest = `${destPath}/${child.name}`;
    if (child.type === 'dir') {
      await _copyDirRecursive(child, childDest);
    } else {
      const file = await child.handle.getFile();
      const buf = await file.arrayBuffer();
      await writeFileBinary(childDest, buf);
    }
  }
}

export async function renameEntry(path, newName) {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  const newPath = parts.length ? `${parts.join('/')}/${newName}` : newName;
  await moveEntry(path, newPath);
  return newPath;
}

/* ── Asset URL cache ───────────────────────────── */

/**
 * Get a displayable URL for an asset path.
 * In native mode, creates (and caches) a blob URL.
 * In memory mode, returns the fetch URL.
 */
export async function resolveAssetURL(path) {
  if (state.fsMode !== 'native') return `${SCRIPTS_BASE}/${path}`;
  if (state.assetURLCache.has(path)) return state.assetURLCache.get(path);
  const node = findNode(path);
  if (!node || node.type !== 'file') return '';
  const file = await node.handle.getFile();
  const url = URL.createObjectURL(file);
  state.assetURLCache.set(path, url);
  return url;
}

/**
 * Synchronous URL lookup — returns cached URL or falls back to SCRIPTS_BASE.
 * Use for rendering contexts where async is impractical.
 */
export function resolveAssetURLSync(path) {
  if (state.fsMode !== 'native') return `${SCRIPTS_BASE}/${path}`;
  return state.assetURLCache.get(path) || '';
}

/** Pre-warm the asset URL cache for a set of paths. */
export async function cacheAssetURLs(paths) {
  if (state.fsMode !== 'native') return;
  await Promise.all(paths.map(p => resolveAssetURL(p)));
}

/** Revoke all cached blob URLs. */
export function clearAssetCache() {
  for (const url of state.assetURLCache.values()) {
    URL.revokeObjectURL(url);
  }
  state.assetURLCache.clear();
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
