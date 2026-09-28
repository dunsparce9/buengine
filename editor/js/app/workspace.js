import { state, hooks, scriptPathFromId, collectImagePaths } from '../state.js';
import { discoverScripts } from '../script-store.js';
import { openFolder, openFolderHandle, ensureHandlePermission, writeFile, deleteEntry, buildTree, clearAssetCache, cacheAssetURLs, findNode } from '../fs-provider.js';
import { promptForConfirmation } from '../confirm-dialog.js';
import { renderFileList, selectScript, selectPath, expandFoldersForPath } from '../file-panel.js';
import { showToast, hasUnsavedChanges, updateMenuVisibility, updateWindowTitle } from './ui.js';
import { rememberRecentFolder } from './recent-folders.js';
import { closeTransientWindows } from '../floating-window.js';

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

  try {
    const handle = await openFolder();
    if (!handle) return;
    await loadWorkspaceFromHandle(handle, { remember: true });
  } catch (err) {
    showToast(`Failed to open folder: ${err.message}`, 'error');
  }
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

export async function loadWorkspaceFromHandle(handle, { remember = false, initialPath = null, notify = true } = {}) {
  closeTransientWindows();
  state.rootHandle = handle;
  state.fileTree = [];
  state.scripts = {};
  const workspace = { root: handle, scripts: state.scripts };
  state.selectedId = null;
  state.selectedObjectId = null;
  state.selectedItem = null;
  state.selectedPath = null;
  state.dirtySet.clear();
  state.pendingScriptRenames.clear();
  state.expandedFolders = new Set(['']);
  state.manifest = null;
  clearAssetCache();
  updateMenuVisibility();
  updateWindowTitle();
  renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();

  // Clear old controls before scanning, so they cannot save detached data into
  // the new folder. A failed scan leaves these clean panes in place.
  await openFolderHandle(handle);
  if (!isCurrentWorkspace(workspace)) return;

  let loadError = null;
  try {
    await discoverScripts();
  } catch (err) {
    loadError = err;
  }
  if (!isCurrentWorkspace(workspace)) return;

  // Pre-warm asset URLs for every referenced image (backgrounds, object
  // textures, show.texture overlays, item icons) via the single
  // state.collectImagePaths implementation.
  await cacheAssetURLs(collectImagePaths());
  if (!isCurrentWorkspace(workspace)) return;

  updateWindowTitle();
  updateMenuVisibility();
  renderFileList();
  restoreInitialSelection(initialPath);

  if (loadError) throw loadError;

  if (remember) await rememberRecentFolder(handle);
  if (!isCurrentWorkspace(workspace)) return;
  if (notify) showToast(`Opened ${handle.name}`);
}

function restoreInitialSelection(initialPath) {
  if (initialPath && findNode(initialPath)) {
    expandFoldersForPath(initialPath);
    renderFileList();
    selectPath(initialPath);
    return;
  }
  selectScript('_game');
}

hooks.openFolder = handleOpenFolder;

/** Write one script. Rename source deletion happens only after the full group saves. */
async function saveOne(id, workspace) {
  if (!isCurrentWorkspace(workspace)) return null;
  const data = workspace.scripts[id];
  if (!data) return null;
  const path = scriptPathFromId(id);
  try {
    const json = JSON.stringify(data, null, 2) + '\n';
    const originalPath = state.pendingScriptRenames.get(id);
    await writeFile(path, json, workspace.root);
    if (!isCurrentWorkspace(workspace)) return null;
    return { id, data, json, originalPath };
  } catch (err) {
    if (isCurrentWorkspace(workspace)) showToast(`Failed to save ${path}: ${err.message}`, 'error');
    return null;
  }
}

function isCurrentWorkspace({ root, scripts }) {
  return state.rootHandle === root && state.scripts === scripts;
}

function unchangedSinceWrite({ id, data, json, originalPath }) {
  return state.scripts[id] === data && state.pendingScriptRenames.get(id) === originalPath
    && JSON.stringify(data, null, 2) + '\n' === json;
}

export async function saveCurrentFile() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }

  // Renames also update other scripts' links; Save must keep those files together.
  if (state.pendingScriptRenames.size) return saveAllFiles();
  const id = state.selectedId;
  if (!id || !state.scripts[id]) return;
  if (!state.dirtySet.has(id)) {
    showToast('No changes to save');
    return;
  }

  const path = scriptPathFromId(id);
  const workspace = { root: state.rootHandle, scripts: state.scripts };
  const result = await saveOne(id, workspace);
  if (!result || !isCurrentWorkspace(workspace)) return;
  if (unchangedSinceWrite(result)) state.dirtySet.delete(id);
  else if (state.scripts[id]) state.dirtySet.add(id);
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

  const ids = [...state.dirtySet];
  const workspace = { root: state.rootHandle, scripts: state.scripts };
  const renameIds = ids.filter(id => state.pendingScriptRenames.has(id));
  const written = [];
  // Create the new scene files before writing links that point at them.
  for (const id of renameIds) {
    const result = await saveOne(id, workspace);
    if (!result || !isCurrentWorkspace(workspace)) return;
    written.push(result);
  }
  for (const id of ids.filter(id => !renameIds.includes(id))) {
    const result = await saveOne(id, workspace);
    if (!isCurrentWorkspace(workspace)) return;
    if (result) written.push(result);
  }
  for (const result of written) {
    if (!unchangedSinceWrite(result) && state.scripts[result.id]) state.dirtySet.add(result.id);
  }
  if (state.pendingScriptRenames.size && (written.length !== ids.length || written.some(result => !unchangedSinceWrite(result))
      || [...state.dirtySet].some(id => !ids.includes(id)))) {
    showToast('Save incomplete; scene renames remain pending. Retry Save.', 'error');
    return;
  }

  let saved = 0;
  let renamedAny = false;
  for (const result of written) {
    if (!isCurrentWorkspace(workspace)) return;
    if (!unchangedSinceWrite(result)) continue;
    const { id, originalPath } = result;
    if (originalPath) {
      try {
        await deleteEntry(originalPath, workspace.root);
        if (!isCurrentWorkspace(workspace)) return;
        const unchanged = unchangedSinceWrite(result);
        if (state.pendingScriptRenames.get(id) === originalPath) state.pendingScriptRenames.delete(id);
        renamedAny = true;
        if (!unchanged) {
          if (state.scripts[id]) state.dirtySet.add(id);
          continue;
        }
      } catch (err) {
        if (!isCurrentWorkspace(workspace)) return;
        showToast(`Saved ${id}, but could not remove ${originalPath}: ${err.message}`, 'error');
        continue;
      }
    }
    state.dirtySet.delete(id);
    saved++;
  }
  if (renamedAny) await buildTree(workspace.root);
  if (!isCurrentWorkspace(workspace)) return;
  renderFileList();
  showToast(`Saved ${saved} file(s)`);
}
