/**
 * Left-side file panel — folder tree view with drag/drop and context menu.
 */

import { state, dom, hooks } from '../core/state.js';
import { resetHistory } from '../core/history.js';
import { showContextMenu } from '../ui/context-menu.js';
import { createFloatingWindow, closeWindowsFor } from '../ui/floating-window.js';
import { renameScene } from '../core/scene-actions.js';
import { loadScript } from '../data/script-store.js';
import { promptForConfirmation } from '../ui/confirm-dialog.js';
import { getFileExtension } from '../data/file-types.js';
import { rememberRecentFolderSelection } from '../app/recent-folders.js';
import {
  buildTree, deleteEntry, renameEntry, moveEntry, createDir,
  writeFileBinary, findNode,
} from '../data/fs-provider.js';

/* ── File type helpers ─────────────────────────── */

const EXT_ICONS = {
  json:  'data_object',
  png:   'image',
  jpg:   'image',
  jpeg:  'image',
  gif:   'image',
  webp:  'image',
  svg:   'image',
  opus:  'music_note',
  mp3:   'music_note',
  ogg:   'music_note',
  wav:   'music_note',
  flac:  'music_note',
  webm:  'movie',
  mp4:   'movie',
  txt:   'description',
  md:    'description',
  css:   'code',
  js:    'code',
  html:  'code',
};

function iconForFile(name) {
  if (name === '_game.json') return 'settings';
  const ext = getFileExtension(name);
  return EXT_ICONS[ext] || 'draft';
}

function isJsonFile(name) {
  return name.endsWith('.json');
}

function scriptIdFromPath(path) {
  for (const [id, originalPath] of state.pendingScriptRenames) {
    if (originalPath === path) return id;
  }
  // "intro.json" → "intro", "items/items.json" → "items/items"
  if (!path.endsWith('.json')) return null;
  return path.replace(/\.json$/, '');
}

function pathOwns(parent, path) {
  return path === parent || path.startsWith(`${parent}/`);
}

function captureWorkspace() {
  return { root: state.rootHandle, scripts: state.scripts };
}

function isCurrentWorkspace(workspace) {
  return state.rootHandle === workspace.root && state.scripts === workspace.scripts;
}

function assertSavedPath(path) {
  for (const id of state.dirtySet) {
    const diskPath = state.pendingScriptRenames.get(id) || `${id}.json`;
    if (pathOwns(path, diskPath)) throw new Error('Save changes in this file or folder before moving or renaming it.');
  }
}

function invalidatePath(path, workspace) {
  if (workspace && !isCurrentWorkspace(workspace)) return;
  for (const [id, data] of Object.entries(state.scripts)) {
    const diskPath = state.pendingScriptRenames.get(id) || `${id}.json`;
    if (!pathOwns(path, diskPath)) continue;
    closeWindowsFor(data);
    delete state.scripts[id];
    state.dirtySet.delete(id);
    state.pendingScriptRenames.delete(id);
    if (id === '_game') state.manifest = null;
  }
  if (state.selectedPath && pathOwns(path, state.selectedPath)) applySelection({ path: null });
  const cache = new Map(state.assetURLCache);
  for (const [assetPath, url] of cache) {
    if (!pathOwns(path, assetPath)) continue;
    URL.revokeObjectURL(url);
    cache.delete(assetPath);
  }
  state.assetURLCache = cache;
  state.scripts = { ...state.scripts };
  resetHistory();
  if (workspace) workspace.scripts = state.scripts;
  hooks.updateWindowTitle();
  hooks.renderViewport();
  hooks.renderProperties();
}

/* ── Public API ────────────────────────────────── */

export function renderFileList() {
  dom.fileList.innerHTML = '';

  if (state.fileTree.length) {
    renderTree(state.fileTree, dom.fileList, 0);
  } else {
    renderEmptyState();
  }
}

/**
 * Single selection cascade (review phase 5, item 22).
 *
 * `selectScript(id)`, `selectPath(path)` and the internal file-node click
 * all funnel through here so the selectedId/selectedPath/object/item reset
 * and the render cascade can't diverge again. Pass whichever side is known;
 * the other is derived. When both are given they are used as-is.
 */
export function applySelection({ id = undefined, path = undefined } = {}) {
  let nextId = id;
  let nextPath = path;

  if (nextPath !== undefined && nextId === undefined) {
    const sid = scriptIdFromPath(nextPath);
    nextId = sid && (state.scripts[sid] || sid === '_game') ? sid : null;
  } else if (nextId !== undefined && nextPath === undefined) {
    if (nextId === '_game') nextPath = '_game.json';
    else if (nextId) nextPath = `${nextId}.json`;
    else nextPath = null;
  }

  state.selectedId = nextId ?? null;
  state.selectedPath = nextPath ?? null;
  state.selectedObjectId = null;
  state.selectedItem = null;
  hooks.updateWindowTitle();
  renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
  persistCurrentSelection();
}

export function selectScript(id) {
  applySelection({ id });
}

export function selectPath(path) {
  applySelection({ path });
}

export function expandFoldersForPath(path) {
  if (!path) return;
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return;

  let current = '';
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    state.expandedFolders.add(current);
  }
}

/* ── Empty state ────────────────────────────────── */

function renderEmptyState() {
  const btn = document.createElement('li');
  btn.className = 'tree-open-folder-btn';
  btn.innerHTML =
    '<span class="material-symbols-outlined tree-icon">folder_open</span>' +
    '<span class="tree-label">Open local folder\u2026</span>';
  btn.addEventListener('click', () => hooks.openFolder?.());
  dom.fileList.appendChild(btn);
}

/* ── Tree rendering (native mode) ──────────────── */

function renderTree(nodes, parent, depth) {
  for (const node of nodes) {
    if (node.type === 'dir') {
      renderFolderNode(node, parent, depth);
    } else {
      renderFileNode(node, parent, depth);
    }
  }
}

function renderFolderNode(node, parent, depth) {
  const li = document.createElement('li');
  li.className = `tree-folder tree-depth-${Math.min(depth, 6)}`;
  const expanded = state.expandedFolders.has(node.path);
  if (expanded) li.classList.add('expanded');
  li.dataset.path = node.path;

  // Header row
  const row = document.createElement('div');
  row.className = 'tree-row';

  const arrow = document.createElement('span');
  arrow.className = 'tree-arrow material-symbols-outlined';
  arrow.textContent = expanded ? 'expand_more' : 'chevron_right';

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined tree-icon tree-icon-folder';
  icon.textContent = expanded ? 'folder_open' : 'folder';

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.name;

  row.append(arrow, icon, label);
  li.appendChild(row);

  // Toggle expand on click
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    if (expanded) state.expandedFolders.delete(node.path);
    else state.expandedFolders.add(node.path);
    renderFileList();
  });

  // Context menu
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showFolderContextMenu(e.clientX, e.clientY, node);
  });

  // Drop target
  setupDropTarget(row, node.path);

  // Children
  if (expanded && node.children?.length) {
    const ul = document.createElement('ul');
    ul.className = 'tree-children';
    renderTree(node.children, ul, depth + 1);
    li.appendChild(ul);
  }

  parent.appendChild(li);
}

function renderFileNode(node, parent, depth) {
  const li = document.createElement('li');
  li.className = `tree-file tree-depth-${Math.min(depth, 6)}`;
  li.dataset.path = node.path;

  const sid = scriptIdFromPath(node.path);
  if (sid && state.dirtySet.has(sid)) li.classList.add('dirty');
  if (node.path === state.selectedPath) li.classList.add('selected');

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined tree-icon';
  icon.textContent = iconForFile(node.name);

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.name;

  li.append(icon, label);

  // Click to select
  li.addEventListener('click', (e) => {
    e.stopPropagation();
    selectFileNode(node);
  });

  // Context menu
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showFileContextMenu(e.clientX, e.clientY, node);
  });

  // Draggable for moving
  li.draggable = true;
  li.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/x-buengine-path', node.path);
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));

  parent.appendChild(li);
}

async function selectFileNode(node) {
  const workspace = captureWorkspace();
  const id = scriptIdFromPath(node.path);
  if (id) {
    try { await loadScript(id); }
    catch (err) { hooks.toast?.(`Could not open JSON: ${err.message}`, 'error'); return; }
    if (!isCurrentWorkspace(workspace)) return;
  }
  applySelection({ path: node.path });
}

function persistCurrentSelection() {
  if (!state.rootHandle || !state.selectedPath) return;
  void rememberRecentFolderSelection(state.rootHandle, state.selectedPath);
}

/* ── Drag-and-drop onto folders ────────────────── */

function setupDropTarget(el, folderPath) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drop-target');
  });

  el.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    el.classList.remove('drop-target');
  });

  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drop-target');

    // Internal move (file dragged within tree)
    const srcPath = e.dataTransfer.getData('text/x-buengine-path');
    if (srcPath) {
      const srcName = srcPath.split('/').pop();
      const destPath = folderPath ? `${folderPath}/${srcName}` : srcName;
      if (srcPath === destPath) return;
      const workspace = captureWorkspace();
      try {
        assertSavedPath(srcPath);
        const selected = state.selectedPath && pathOwns(srcPath, state.selectedPath) ? state.selectedPath : null;
        await moveEntry(srcPath, destPath, workspace.root);
        if (!isCurrentWorkspace(workspace)) return;
        invalidatePath(srcPath, workspace);
        await buildTree(workspace.root);
        if (!isCurrentWorkspace(workspace)) return;
        if (selected) {
          const moved = findNode(destPath + selected.slice(srcPath.length));
          if (moved?.type === 'file') await selectFileNode(moved);
        }
        if (!isCurrentWorkspace(workspace)) return;
        renderFileList();
        hooks.toast?.(`Moved ${srcName}`);
      } catch (err) {
        if (!isCurrentWorkspace(workspace)) return;
        hooks.toast?.(`Move failed: ${err.message}`, 'error');
      }
      return;
    }

    // External drop (files from OS)
    if (e.dataTransfer.files.length) {
      await handleExternalDrop(e.dataTransfer.files, folderPath);
    }
  });
}

async function handleExternalDrop(files, targetFolder, workspace = captureWorkspace()) {
  let count = 0;
  for (const file of files) {
    const destPath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
    try {
      if (!isCurrentWorkspace(workspace)) return;
      assertSavedPath(destPath);
      const buf = await file.arrayBuffer();
      if (!isCurrentWorkspace(workspace)) return;
      assertSavedPath(destPath);
      await writeFileBinary(destPath, buf, workspace.root);
      if (!isCurrentWorkspace(workspace)) return;
      invalidatePath(destPath, workspace);
      count++;
    } catch (err) {
      if (!isCurrentWorkspace(workspace)) return;
      hooks.toast?.(`Failed to add ${file.name}: ${err.message}`, 'error');
    }
  }
  if (count) {
    await buildTree(workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    renderFileList();
    hooks.toast?.(`Added ${count} file${count === 1 ? '' : 's'}`);
  }
}

/* ── External drag-and-drop zone (whole file panel) */

export function initFilePanelDrop() {
  const panel = document.getElementById('file-panel');

  panel.addEventListener('dragover', (e) => {
    // Only highlight for external files (not internal tree drags)
    if (e.dataTransfer.types.includes('text/x-buengine-path')) return;
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    panel.classList.add('drop-active');
  });

  panel.addEventListener('dragleave', (e) => {
    if (!panel.contains(e.relatedTarget)) {
      panel.classList.remove('drop-active');
    }
  });

  panel.addEventListener('drop', async (e) => {
    panel.classList.remove('drop-active');
    if (e.dataTransfer.types.includes('text/x-buengine-path')) return;
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    // Drop into root folder
    await handleExternalDrop(e.dataTransfer.files, '');
  });

  panel.addEventListener('contextmenu', (e) => {
    const clickedTreeItem = e.target.closest('.tree-file, .tree-row, .tree-open-folder-btn');
    if (clickedTreeItem) return;
    if (!state.rootHandle) return;
    e.preventDefault();
    showRootContextMenu(e.clientX, e.clientY);
  });
}

/* ── Context menus ─────────────────────────────── */

function showRootContextMenu(x, y) {
  showContextMenu(x, y, [
    { icon: 'note_add', label: 'New file…', onClick: () => promptNewFile('') },
    { icon: 'create_new_folder', label: 'New folder…', onClick: () => promptNewFolder('') },
    { separator: true },
    { icon: 'content_paste', label: 'Paste file…', onClick: () => pasteFileInto('') },
  ]);
}

function showFolderContextMenu(x, y, node) {
  showContextMenu(x, y, [
    { icon: 'note_add', label: 'New file\u2026', onClick: () => promptNewFile(node.path) },
    { icon: 'create_new_folder', label: 'New folder\u2026', onClick: () => promptNewFolder(node.path) },
    { separator: true },
    { icon: 'content_paste', label: 'Paste file\u2026', onClick: () => pasteFileInto(node.path) },
    { separator: true },
    { icon: 'drive_file_rename_outline', label: 'Rename\u2026', onClick: () => promptRename(node) },
    { icon: 'content_copy', label: 'Copy path', onClick: () => copyToClipboard(node.path) },
    { separator: true },
    { icon: 'delete', label: 'Delete folder', danger: true, onClick: () => confirmDelete(node) },
  ]);
}

function showFileContextMenu(x, y, node) {
  showContextMenu(x, y, [
    { icon: 'drive_file_rename_outline', label: 'Rename\u2026', onClick: () => promptRename(node) },
    { icon: 'content_copy', label: 'Copy path', onClick: () => copyToClipboard(node.path) },
    { separator: true },
    { icon: 'file_download', label: 'Download', onClick: () => downloadFile(node) },
    { separator: true },
    { icon: 'delete', label: 'Delete', danger: true, onClick: () => confirmDelete(node) },
  ]);
}

/* ── Context menu actions ──────────────────────── */

async function promptNewFile(folderPath) {
  const workspace = captureWorkspace();
  const input = await promptForName({
    title: 'New File',
    icon: 'note_add',
    label: 'File name',
    value: 'untitled.json',
    confirmLabel: 'Create',
  });
  if (!input || !isCurrentWorkspace(workspace)) return;
  const name = normalizeNewFileName(input);
  if (!name) return;
  const path = folderPath ? `${folderPath}/${name}` : name;
  try {
    if (findNode(path)) throw new Error(`Already exists: ${path}`);
    const content = name.endsWith('.json') ? '{\n}\n' : '';
    const encoder = new TextEncoder();
    await writeFileBinary(path, encoder.encode(content), workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    await buildTree(workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    renderFileList();
    hooks.toast?.(`Created ${name}`);
  } catch (err) {
    if (!isCurrentWorkspace(workspace)) return;
    hooks.toast?.(`Failed: ${err.message}`, 'error');
  }
}

function normalizeNewFileName(input) {
  const name = input.trim();
  if (!name) return '';
  return name.includes('.') ? name : `${name}.json`;
}

async function promptNewFolder(parentPath) {
  const workspace = captureWorkspace();
  const name = await promptForName({
    title: 'New Folder',
    icon: 'create_new_folder',
    label: 'Folder name',
    value: '',
    confirmLabel: 'Create',
  });
  if (!name || !isCurrentWorkspace(workspace)) return;
  const trimmedName = name.trim();
  if (!trimmedName) return;
  const path = parentPath ? `${parentPath}/${trimmedName}` : trimmedName;
  try {
    await createDir(path, workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    await buildTree(workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    state.expandedFolders.add(path);
    renderFileList();
    hooks.toast?.(`Created folder ${trimmedName}`);
  } catch (err) {
    if (!isCurrentWorkspace(workspace)) return;
    hooks.toast?.(`Failed: ${err.message}`, 'error');
  }
}

async function promptRename(node) {
  const workspace = captureWorkspace();
  const newName = await promptForName({
    title: node.type === 'dir' ? 'Rename Folder' : 'Rename File',
    icon: 'drive_file_rename_outline',
    label: 'Name',
    value: node.name,
    confirmLabel: 'Rename',
  });
  const trimmedName = newName?.trim();
  if (!trimmedName || trimmedName === node.name) return;
  try {
    if (!isCurrentWorkspace(workspace)) return;
    const id = scriptIdFromPath(node.path);
    const data = id && state.scripts[id];
    if (data && id !== '_game' && !node.path.includes('/') && !Array.isArray(data)) {
      if (!trimmedName.endsWith('.json')) throw new Error('Scene files must keep the .json extension.');
      await renameScene(id, trimmedName.slice(0, -5));
      if (!isCurrentWorkspace(workspace)) return;
      hooks.toast?.('Scene renamed. Save to apply the file and link changes.');
      return;
    }
    assertSavedPath(node.path);
    const selected = state.selectedPath && pathOwns(node.path, state.selectedPath) ? state.selectedPath : null;
    const newPath = await renameEntry(node.path, trimmedName, workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    invalidatePath(node.path, workspace);
    await buildTree(workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    if (selected) {
      const renamed = findNode(newPath + selected.slice(node.path.length));
      if (renamed?.type === 'file') await selectFileNode(renamed);
    }
    if (!isCurrentWorkspace(workspace)) return;
    renderFileList();
    hooks.toast?.(`Renamed to ${trimmedName}`);
  } catch (err) {
    if (!isCurrentWorkspace(workspace)) return;
    hooks.toast?.(`Rename failed: ${err.message}`, 'error');
  }
}

function promptForName({ title, icon, label, value = '', confirmLabel = 'OK' }) {
  return new Promise(resolve => {
    let resolved = false;
    const fw = createFloatingWindow({
      title,
      icon,
      iconClass: 'material-symbols-outlined',
      width: 360,
      resizable: false,
      modal: true,
    });

    const form = document.createElement('form');
    form.className = 'name-modal-form';

    const labelEl = document.createElement('label');
    labelEl.className = 'name-modal-label';
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.className = 'name-modal-input';
    input.type = 'text';
    input.value = value;
    input.spellcheck = false;
    input.autocomplete = 'off';

    const actions = document.createElement('div');
    actions.className = 'name-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'name-modal-btn name-modal-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      fw.destroy();
      resolve(null);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'submit';
    confirmBtn.className = 'name-modal-btn name-modal-btn-primary';
    confirmBtn.textContent = confirmLabel;

    actions.append(cancelBtn, confirmBtn);
    form.append(labelEl, input, actions);
    fw.body.appendChild(form);
    fw.onClose(() => {
      if (resolved) return;
      resolved = true;
      fw.destroy();
      resolve(null);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (resolved) return;
      resolved = true;
      const submittedValue = input.value.trim();
      fw.destroy();
      resolve(submittedValue || null);
    });

    fw.open();
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

async function confirmDelete(node) {
  const workspace = captureWorkspace();
  const label = node.type === 'dir' ? `folder "${node.name}" and all its contents` : `"${node.name}"`;
  const confirmed = await promptForConfirmation({
    title: node.type === 'dir' ? 'Delete Folder' : 'Delete File',
    icon: 'delete',
    message: `Delete ${label}?`,
    confirmLabel: 'Delete',
  });
  if (!confirmed || !isCurrentWorkspace(workspace)) return;
  try {
    await deleteEntry(node.path, workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    invalidatePath(node.path, workspace);
    if (state.selectedPath === node.path) {
      state.selectedPath = null;
      state.selectedId = null;
      hooks.updateWindowTitle();
    }
    await buildTree(workspace.root);
    if (!isCurrentWorkspace(workspace)) return;
    renderFileList();
    hooks.renderViewport();
    hooks.renderProperties();
    hooks.toast?.(`Deleted ${node.name}`);
  } catch (err) {
    if (!isCurrentWorkspace(workspace)) return;
    hooks.toast?.(`Delete failed: ${err.message}`, 'error');
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => hooks.toast?.('Copied to clipboard'),
    () => hooks.toast?.('Copy failed', 'error')
  );
}

async function downloadFile(node) {
  try {
    const file = await node.handle.getFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = node.name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    hooks.toast?.(`Download failed: ${err.message}`, 'error');
  }
}

async function pasteFileInto(folderPath) {
  const workspace = captureWorkspace();
  // Use a file input as a paste mechanism
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.addEventListener('change', async () => {
    if (!input.files.length || !isCurrentWorkspace(workspace)) return;
    await handleExternalDrop(input.files, folderPath, workspace);
  });
  input.click();
}
