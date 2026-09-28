import { renderFileList, initFilePanelDrop } from '../panels/file-panel.js';
import { renderViewport, initViewportInteractions } from '../panels/viewport.js';
import { renderProperties } from '../panels/properties.js';
import { initMenu } from '../ui/menu.js';
import { initResizeHandles } from '../ui/resize.js';
import { hooks, state } from '../core/state.js';
import { deleteObject } from '../core/scene-actions.js';
import '../action-editor.js';

import { updateMenuVisibility, updateWindowTitle, openAboutWindow, hasUnsavedChanges, showToast } from './ui.js';
import { handleOpenFolder, handleOpenRecentFolder, saveCurrentFile, saveAllFiles, confirmDiscardUnsavedChanges } from './workspace.js';
import { exportCurrentJson, exportZip, importZip } from './archive.js';
import { runInNewTab, runCurrentScene } from './preview.js';
import { setupPWAInstall, installApp } from './pwa.js';
import { initRecentFolders, handleOpenRecentFolder as dispatchOpenRecentFolder } from './recent-folders.js';

hooks.renderFileList = renderFileList;
hooks.renderViewport = renderViewport;
hooks.renderProperties = renderProperties;

let suppressBeforeUnloadPrompt = false;

function allowNextInAppNavigation() {
  suppressBeforeUnloadPrompt = true;
  setTimeout(() => {
    suppressBeforeUnloadPrompt = false;
  }, 1000);
}

initMenu({
  'open-folder': handleOpenFolder,
  'open-recent-folder': dispatchOpenRecentFolder,
  save: saveCurrentFile,
  'save-all': saveAllFiles,
  'export-json': exportCurrentJson,
  'export-zip': exportZip,
  'import-zip': importZip,
  exit: async () => {
    if (!await confirmDiscardUnsavedChanges('You have unsaved changes. Leave the editor and discard them?')) {
      return;
    }
    allowNextInAppNavigation();
    window.location.href = '../index.html';
  },
  'install-app': installApp,
  about: openAboutWindow,
  'run-in-tab': runInNewTab,
  'run-scene': async () => {
    const launched = await runCurrentScene();
    if (!launched) showToast('Select a scene to run', 'error');
  },
});

document.getElementById('run-btn').addEventListener('click', runInNewTab);
document.getElementById('welcome-open-folder').addEventListener('click', handleOpenFolder);
document.getElementById('welcome-recent-projects').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-recent-id]');
  if (button) dispatchOpenRecentFolder(button);
});
setupPWAInstall();

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 's') {
    event.preventDefault();
    saveCurrentFile();
  }
  if (event.ctrlKey && event.shiftKey && event.key === 'S') {
    event.preventDefault();
    saveAllFiles();
  }
  if (event.ctrlKey && event.key === 'o') {
    event.preventDefault();
    handleOpenFolder();
  }
  if (event.key === 'Delete' && !isEditableTarget(event.target) && state.selectedObjectId) {
    event.preventDefault();
    deleteObject(state.selectedObjectId);
  }
});

initResizeHandles(renderViewport);
initViewportInteractions();
initFilePanelDrop();

window.addEventListener('resize', () => renderViewport());
window.addEventListener('beforeunload', (event) => {
  if (suppressBeforeUnloadPrompt) return;
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

(function boot() {
  initRecentFolders(handleOpenRecentFolder);
  updateWindowTitle();
  updateMenuVisibility();
  renderFileList();
})();
