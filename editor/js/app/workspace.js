import { state, hooks } from '../state.js';
import { discoverScripts } from '../script-loader.js';
import { openFolder, openFolderHandle, ensureHandlePermission, writeFile, clearAssetCache, cacheAssetURLs } from '../fs-provider.js';
import { promptForConfirmation } from '../confirm-dialog.js';
import { renderFileList, selectScript, selectPath, expandFoldersForPath } from '../file-panel.js';
import { showToast, hasUnsavedChanges, updateMenuVisibility, updateWindowTitle } from './ui.js';
import { rememberRecentFolder } from './recent-folders.js';

export async function confirmDiscardUnsavedChanges(message = 'You have unsaved changes. Discard them?') {
  if (!hasUnsavedChanges()) return true;
  return promptForConfirmation({
    title: 'Unsaved Changes',
    icon: 'warning',
    message,
    confirmLabel: 'Discard',
  });
}

export async function handleOpenFolder() {
  if (!await confirmDiscardUnsavedChanges('You have unsaved changes. Open a different folder and discard them?')) {
    return;
  }

  const handle = await openFolder();
  if (!handle) return;
  await loadWorkspaceFromHandle(handle, { remember: true, treeReady: true });
}

export async function handleOpenRecentFolder(folder) {
  if (!folder?.handle) return false;
  if (!await confirmDiscardUnsavedChanges('You have unsaved changes. Open a different folder and discard them?')) {
    return false;
  }

  let permitted = false;
  try {
    permitted = await ensureHandlePermission(folder.handle, 'readwrite');
  } catch (err) {
    showToast(`Failed to reopen ${folder.name}: ${err.message}`, 'error');
    return false;
  }

  if (!permitted) {
    showToast(`Permission denied for ${folder.name}`, 'error');
    return false;
  }

  try {
    await loadWorkspaceFromHandle(folder.handle, {
      remember: true,
      initialPath: folder.lastPath || null,
    });
    return true;
  } catch (err) {
    showToast(`Failed to reopen ${folder.name}: ${err.message}`, 'error');
    return false;
  }
}

async function loadWorkspaceFromHandle(handle, { remember = false, treeReady = false, initialPath = null } = {}) {
  if (!treeReady) await openFolderHandle(handle);

  state.scripts = {};
  state.selectedId = null;
  state.selectedObjectId = null;
  state.selectedItem = null;
  state.selectedPath = null;
  state.dirtySet.clear();
  state.manifest = null;
  clearAssetCache();

  updateMenuVisibility();
  updateWindowTitle();

  try {
    await discoverScripts();
  } catch (err) {
    showToast(`Failed to load: ${err.message}`, 'error');
  }

  const imagePaths = [];
  for (const data of Object.values(state.scripts)) {
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.icon) imagePaths.push(item.icon);
      }
      continue;
    }
    if (data.background) imagePaths.push(data.background);
    const objects = data.objects;
    if (!Array.isArray(objects)) continue;
    for (const obj of objects) {
      if (obj.texture) imagePaths.push(obj.texture);
    }
  }
  await cacheAssetURLs(imagePaths);

  updateWindowTitle();
  updateMenuVisibility();
  renderFileList();
  restoreInitialSelection(initialPath);

  if (remember) await rememberRecentFolder(handle);
  showToast(`Opened ${handle.name}`);
}

function restoreInitialSelection(initialPath) {
  if (initialPath && pathExists(initialPath)) {
    expandFoldersForPath(initialPath);
    renderFileList();
    selectPath(initialPath);
    return;
  }
  selectScript('_game');
}

function pathExists(path) {
  if (!path) return false;
  const parts = path.split('/').filter(Boolean);
  let nodes = state.fileTree;

  for (let i = 0; i < parts.length; i++) {
    const node = nodes.find((entry) => entry.name === parts[i]);
    if (!node) return false;
    if (i === parts.length - 1) return true;
    if (node.type !== 'dir' || !Array.isArray(node.children)) return false;
    nodes = node.children;
  }

  return false;
}

hooks.openFolder = handleOpenFolder;

export async function saveCurrentFile() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }

  const id = state.selectedId;
  if (!id || !state.scripts[id]) return;
  if (!state.dirtySet.has(id)) {
    showToast('No changes to save');
    return;
  }

  const data = state.scripts[id];
  const json = JSON.stringify(data, null, 2) + '\n';
  const path = id === '_game' ? '_game.json' : `${id}.json`;

  try {
    await writeFile(path, json);
    state.dirtySet.delete(id);
    renderFileList();
    showToast(`Saved ${path}`);
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

export async function saveAllFiles() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }
  if (state.dirtySet.size === 0) {
    showToast('Nothing to save');
    return;
  }

  let saved = 0;
  for (const id of [...state.dirtySet]) {
    const data = state.scripts[id];
    if (!data) continue;
    const json = JSON.stringify(data, null, 2) + '\n';
    const path = id === '_game' ? '_game.json' : `${id}.json`;
    try {
      await writeFile(path, json);
      state.dirtySet.delete(id);
      saved++;
    } catch (err) {
      showToast(`Failed to save ${path}: ${err.message}`, 'error');
    }
  }

  renderFileList();
  showToast(`Saved ${saved} file(s)`);
}
