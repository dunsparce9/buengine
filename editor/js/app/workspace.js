import { state, hooks, scriptPathFromId, collectImagePaths } from '../state.js';
import { discoverScripts } from '../script-store.js';
import { openFolder, openFolderHandle, ensureHandlePermission, writeFile, deleteEntry, buildTree, clearAssetCache, cacheAssetURLs } from '../fs-provider.js';
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
  state.pendingScriptRenames.clear();
  state.manifest = null;
  clearAssetCache();

  updateMenuVisibility();
  updateWindowTitle();

  try {
    await discoverScripts();
  } catch (err) {
    showToast(`Failed to load: ${err.message}`, 'error');
  }

  // Pre-warm asset URLs for every referenced image (backgrounds, object
  // textures, show.texture overlays, item icons) via the single
  // state.collectImagePaths implementation.
  await cacheAssetURLs(collectImagePaths());

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

/**
 * Write one script id to disk, handling pending scene-id renames.
 * Returns 'renamed' when the old file was removed too, true on a plain
 * save, false on failure (toast already shown). Pure save logic shared by
 * saveCurrentFile/saveAllFiles (review phase 5, item 22).
 */
async function saveOne(id) {
  const data = state.scripts[id];
  if (!data) return false;
  const path = scriptPathFromId(id);
  const renamedFrom = state.pendingScriptRenames.get(id);
  try {
    await writeFile(path, JSON.stringify(data, null, 2) + '\n');
    if (renamedFrom && renamedFrom !== path) {
      await deleteEntry(renamedFrom);
      state.pendingScriptRenames.delete(id);
      return 'renamed';
    }
    return true;
  } catch (err) {
    showToast(`Failed to save ${path}: ${err.message}`, 'error');
    return false;
  }
}

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

  const path = scriptPathFromId(id);
  const result = await saveOne(id);
  if (!result) return;
  if (result === 'renamed') await buildTree();
  state.dirtySet.delete(id);
  renderFileList();
  showToast(`Saved ${path}`);
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
  let renamedAny = false;
  for (const id of [...state.dirtySet]) {
    const result = await saveOne(id);
    if (!result) continue;
    if (result === 'renamed') renamedAny = true;
    state.dirtySet.delete(id);
    saved++;
  }

  if (renamedAny) await buildTree();
  renderFileList();
  showToast(`Saved ${saved} file(s)`);
}
