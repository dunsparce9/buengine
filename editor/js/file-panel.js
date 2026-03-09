/**
 * Left-side file panel — folder tree view with drag/drop and context menu.
 */

import { state, dom, hooks, escapeHtml } from './state.js';
import { showContextMenu } from './context-menu.js';
import { getFileExtension } from './file-types.js';
import {
  buildTree, deleteEntry, renameEntry, moveEntry, createDir,
  writeFileBinary, findNode,
} from './fs-provider.js';

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
  // "intro.json" → "intro", "items/items.json" → "items/items"
  if (!path.endsWith('.json')) return null;
  return path.replace(/\.json$/, '');
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

export function selectScript(id) {
  state.selectedId = id;
  state.selectedHs = null;
  // Sync selectedPath
  if (id === '_game') state.selectedPath = '_game.json';
  else if (id) state.selectedPath = `${id}.json`;
  renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
}

export function selectPath(path) {
  state.selectedPath = path;
  // If it's a JSON, also set selectedId for viewport/properties
  const sid = scriptIdFromPath(path);
  if (sid && state.scripts[sid]) {
    state.selectedId = sid;
  } else if (sid === '_game') {
    state.selectedId = '_game';
  } else {
    state.selectedId = null;
  }
  state.selectedHs = null;
  renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
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
    e.dataTransfer.setData('text/x-buegame-path', node.path);
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));

  parent.appendChild(li);
}

function selectFileNode(node) {
  const sid = scriptIdFromPath(node.path);
  if (sid !== null && state.scripts[sid]) {
    state.selectedId = sid;
  } else if (node.name === '_game.json') {
    state.selectedId = '_game';
  } else {
    state.selectedId = null;
  }
  state.selectedPath = node.path;
  state.selectedHs = null;
  renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
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
    const srcPath = e.dataTransfer.getData('text/x-buegame-path');
    if (srcPath) {
      const srcName = srcPath.split('/').pop();
      const destPath = folderPath ? `${folderPath}/${srcName}` : srcName;
      if (srcPath === destPath) return;
      try {
        await moveEntry(srcPath, destPath);
        await buildTree();
        renderFileList();
        hooks.toast?.(`Moved ${srcName}`);
      } catch (err) {
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

async function handleExternalDrop(files, targetFolder) {
  let count = 0;
  for (const file of files) {
    const destPath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
    try {
      const buf = await file.arrayBuffer();
      await writeFileBinary(destPath, buf);
      count++;
    } catch (err) {
      hooks.toast?.(`Failed to add ${file.name}: ${err.message}`, 'error');
    }
  }
  if (count) {
    await buildTree();
    renderFileList();
    hooks.toast?.(`Added ${count} file(s)`);
  }
}

/* ── External drag-and-drop zone (whole file panel) */

export function initFilePanelDrop() {
  const panel = document.getElementById('file-panel');

  panel.addEventListener('dragover', (e) => {
    // Only highlight for external files (not internal tree drags)
    if (e.dataTransfer.types.includes('text/x-buegame-path')) return;
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
    if (e.dataTransfer.types.includes('text/x-buegame-path')) return;
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    // Drop into root folder
    await handleExternalDrop(e.dataTransfer.files, '');
  });
}

/* ── Context menus ─────────────────────────────── */

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
  const name = prompt('New file name:');
  if (!name) return;
  const path = folderPath ? `${folderPath}/${name}` : name;
  try {
    const content = name.endsWith('.json') ? '{\n}\n' : '';
    const encoder = new TextEncoder();
    await writeFileBinary(path, encoder.encode(content));
    await buildTree();
    renderFileList();
    hooks.toast?.(`Created ${name}`);
  } catch (err) {
    hooks.toast?.(`Failed: ${err.message}`, 'error');
  }
}

async function promptNewFolder(parentPath) {
  const name = prompt('New folder name:');
  if (!name) return;
  const path = parentPath ? `${parentPath}/${name}` : name;
  try {
    await createDir(path);
    await buildTree();
    state.expandedFolders.add(path);
    renderFileList();
    hooks.toast?.(`Created folder ${name}`);
  } catch (err) {
    hooks.toast?.(`Failed: ${err.message}`, 'error');
  }
}

async function promptRename(node) {
  const newName = prompt('New name:', node.name);
  if (!newName || newName === node.name) return;
  try {
    const newPath = await renameEntry(node.path, newName);
    await buildTree();
    if (state.selectedPath === node.path) {
      state.selectedPath = newPath;
    }
    renderFileList();
    hooks.toast?.(`Renamed to ${newName}`);
  } catch (err) {
    hooks.toast?.(`Rename failed: ${err.message}`, 'error');
  }
}

async function confirmDelete(node) {
  const label = node.type === 'dir' ? `folder "${node.name}" and all its contents` : `"${node.name}"`;
  if (!confirm(`Delete ${label}?`)) return;
  try {
    await deleteEntry(node.path);
    if (state.selectedPath === node.path) {
      state.selectedPath = null;
      state.selectedId = null;
    }
    await buildTree();
    renderFileList();
    hooks.renderViewport();
    hooks.renderProperties();
    hooks.toast?.(`Deleted ${node.name}`);
  } catch (err) {
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
  // Use a file input as a paste mechanism
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.addEventListener('change', async () => {
    if (!input.files.length) return;
    await handleExternalDrop(input.files, folderPath);
  });
  input.click();
}
