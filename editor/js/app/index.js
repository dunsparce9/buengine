import { renderFileList, initFilePanelDrop } from '../file-panel.js';
import { renderViewport, initViewportInteractions } from '../viewport.js';
import { renderProperties } from '../properties.js';
import { initMenu } from '../menu.js';
import { initResizeHandles } from '../resize.js';
import { hooks, state, deleteObject } from '../state.js';
import '../action-viewer.js';

import { updateMenuVisibility, updateWindowTitle, openAboutWindow, hasUnsavedChanges } from './ui.js';
import { handleOpenFolder, saveCurrentFile, saveAllFiles, confirmDiscardUnsavedChanges } from './workspace.js';
import { exportCurrentJson, exportZip, importZip } from './archive.js';
import { runInNewTab } from './preview.js';
import { setupPWAInstall, installApp } from './pwa.js';

hooks.renderFileList = renderFileList;
hooks.renderViewport = renderViewport;
hooks.renderProperties = renderProperties;

initMenu({
  'open-folder': handleOpenFolder,
  save: saveCurrentFile,
  'save-all': saveAllFiles,
  'export-json': exportCurrentJson,
  'export-zip': exportZip,
  'import-zip': importZip,
  exit: async () => {
    if (!await confirmDiscardUnsavedChanges('You have unsaved changes. Leave the editor and discard them?')) {
      return;
    }
    window.location.href = '../index.html';
  },
  'install-app': installApp,
  about: openAboutWindow,
  'run-in-tab': runInNewTab,
});

document.getElementById('run-btn').addEventListener('click', runInNewTab);
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
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

(function boot() {
  updateWindowTitle();
  updateMenuVisibility();
  renderFileList();
})();
