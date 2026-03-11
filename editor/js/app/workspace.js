import { state, hooks } from '../state.js';
import { discoverScripts } from '../script-loader.js';
import { openFolder, writeFile, clearAssetCache, cacheAssetURLs } from '../fs-provider.js';
import { promptForConfirmation } from '../confirm-dialog.js';
import { renderFileList, selectScript } from '../file-panel.js';
import { showToast, hasUnsavedChanges, updateMenuVisibility, updateWindowTitle } from './ui.js';

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

  state.scripts = {};
  state.selectedId = null;
  state.selectedHs = null;
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
    const objects = data.objects ?? data.hotspots;
    if (!Array.isArray(objects)) continue;
    for (const obj of objects) {
      if (obj.texture) imagePaths.push(obj.texture);
    }
  }
  await cacheAssetURLs(imagePaths);

  updateWindowTitle();
  updateMenuVisibility();
  renderFileList();
  selectScript('_game');
  showToast(`Opened ${handle.name}`);
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
