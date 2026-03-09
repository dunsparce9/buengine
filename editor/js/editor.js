/**
 * büegame editor — orchestrator
 *
 * Imports all editor modules, wires render hooks, and boots the app.
 */

import { state, hooks } from './state.js';
import { createFloatingWindow } from './floating-window.js';
import { discoverScripts } from './script-loader.js';
import { renderFileList, selectScript, initFilePanelDrop } from './file-panel.js';
import { renderViewport, initViewportInteractions } from './viewport.js';
import { renderProperties } from './properties.js';
import { initMenu } from './menu.js';
import { initResizeHandles } from './resize.js';
import {
  openFolder, buildTree, writeFile, writeFileBinary, readFileBinary,
  collectAllPaths, cacheAssetURLs, clearAssetCache, resolveAssetURL,
} from './fs-provider.js';
import { createZip, readZip } from './zip-utils.js';
import './action-viewer.js';

/* ── Wire render hooks ─────────────────────────── */
hooks.renderFileList   = renderFileList;
hooks.renderViewport   = renderViewport;
hooks.renderProperties = renderProperties;

function hasLoadedGame() {
  return Boolean(state.manifest && Object.keys(state.scripts).length);
}

function updateMenuVisibility() {
  const loaded = hasLoadedGame();
  for (const el of document.querySelectorAll('[data-requires-game]')) {
    el.hidden = !loaded;
    if (!loaded && el.classList.contains('open')) {
      el.classList.remove('open');
    }
  }
}

function isStandalonePWA() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateWindowTitle() {
  const appName = 'b\u00fcegame editor';
  const context = state.selectedPath || state.rootHandle?.name || '';

  if (!context) {
    document.title = appName;
    return;
  }
  // On many Chromium-based browsers, the PWA's name is already prepended - this prevents a duped name
  document.title = isStandalonePWA() ? context : `${appName} - ${context}`;
}
hooks.updateWindowTitle = updateWindowTitle;

function updateRunLabels() {
  const standalone = isStandalonePWA();
  const label = standalone ? 'Run in new window' : 'Run in new tab';
  const menuRunBtn = document.querySelector('[data-action="run-in-tab"]');
  const topRunBtn = document.getElementById('run-btn');
  if (menuRunBtn) {
    const textNode = [...menuRunBtn.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
    if (textNode) textNode.textContent = label;
  }
  if (topRunBtn) topRunBtn.title = label;
}

/* ── Toast notifications ───────────────────────── */
const toastContainer = document.getElementById('toast-container');

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  // Trigger animation
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove());
    // Fallback removal
    setTimeout(() => el.remove(), 500);
  }, 2500);
}
hooks.toast = showToast;

/* ── About window ──────────────────────────────── */
const aboutWindow = createFloatingWindow({
  title: 'About',
  icon: 'info',
  iconClass: 'material-symbols-outlined',
  width: 280,
  resizable: false,
});
{
  const c = aboutWindow.body;
  c.style.textAlign = 'center';
  c.style.padding = '20px 28px';
  const h = document.createElement('h2');
  h.textContent = 'b\u00fcegame editor';
  h.style.fontSize = '1.3rem';
  h.style.marginBottom = '6px';
  const p1 = document.createElement('p');
  p1.textContent = 'v0.1';
  p1.style.color = '#e1c8a4';
  const p2 = document.createElement('p');
  p2.textContent = 'All rights reserved?';
  p2.style.color = '#a89984';
  p2.style.fontSize = '12px';
  c.append(h, p1, p2);
}

/* ── Open Folder ───────────────────────────────── */

async function handleOpenFolder() {
  const handle = await openFolder();
  if (!handle) return;

  // Clear previous state
  state.scripts = {};
  state.selectedId = null;
  state.selectedHs = null;
  state.selectedItem = null;
  state.selectedPath = null;
  state.dirtySet.clear();
  clearAssetCache();
  state.manifest = null;
  updateMenuVisibility();
  updateWindowTitle();

  // Load scripts from the newly opened folder
  try {
    await discoverScripts();
  } catch (err) {
    showToast(`Failed to load: ${err.message}`, 'error');
  }

  // Pre-cache asset URLs for images referenced in scripts
  const imagePaths = [];
  for (const data of Object.values(state.scripts)) {
    if (Array.isArray(data)) {
      // Items array — cache item icons
      for (const item of data) {
        if (item.icon) imagePaths.push(item.icon);
      }
      continue;
    }
    if (data.background) imagePaths.push(data.background);
    const objects = data.objects ?? data.hotspots;
    if (Array.isArray(objects)) {
      for (const obj of objects) {
        if (obj.texture) imagePaths.push(obj.texture);
      }
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

/* ── Save file ─────────────────────────────────── */

async function saveCurrentFile() {
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

async function saveAllFiles() {
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

/* ── Export JSON (legacy) ──────────────────────── */

function exportCurrentJson() {
  if (!state.selectedId || !state.scripts[state.selectedId]) return;
  const data = state.scripts[state.selectedId];
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${state.selectedId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Export ZIP ─────────────────────────────────── */

async function exportZip() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }

  // Export everything from the native folder
  showToast('Preparing ZIP\u2026');
  const allPaths = collectAllPaths();
  const files = [];
  for (const path of allPaths) {
    try {
      const buf = await readFileBinary(path);
      files.push({ path, data: new Uint8Array(buf) });
    } catch {}
  }
  const folderName = state.rootHandle?.name || 'game';
  const prefixedFiles = files.map(f => ({
    path: `${folderName}/${f.path}`,
    data: f.data,
  }));
  const blob = createZip(prefixedFiles);
  downloadBlob(blob, `${folderName}.zip`);
  showToast(`Exported ${files.length} files`);
}

/* ── Import ZIP ────────────────────────────────── */

async function importZip() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const entries = readZip(buf);
      if (!entries.length) {
        showToast('ZIP is empty', 'error');
        return;
      }

      // Strip common prefix if all files share one
      const prefix = findCommonPrefix(entries.map(e => e.path));

      let count = 0;
      for (const entry of entries) {
        const relativePath = prefix ? entry.path.slice(prefix.length) : entry.path;
        if (!relativePath) continue;
        try {
          await writeFileBinary(relativePath, entry.data);
          count++;
        } catch (err) {
          showToast(`Failed: ${entry.path}: ${err.message}`, 'error');
        }
      }

      // Reload
      await buildTree();
      state.scripts = {};
      await discoverScripts();
      renderFileList();
      showToast(`Imported ${count} files from ZIP`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    }
  });
  input.click();
}

function findCommonPrefix(paths) {
  if (paths.length === 0) return '';
  // Find shared directory prefix
  const parts0 = paths[0].split('/');
  let depth = 0;
  outer:
  for (let i = 0; i < parts0.length - 1; i++) {
    const segment = parts0[i];
    for (const p of paths) {
      const pp = p.split('/');
      if (pp[i] !== segment) break outer;
    }
    depth = i + 1;
  }
  if (depth === 0) return '';
  return parts0.slice(0, depth).join('/') + '/';
}

/* ── Download helper ───────────────────────────── */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Run in new tab ────────────────────────────── */
async function runInNewTab() {
  const overrides = {};
  for (const [id, data] of Object.entries(state.scripts)) {
    overrides[id] = data;
  }
  localStorage.setItem('buegame_editor_preview', JSON.stringify(overrides));

  // Create blob URLs for all non-JSON assets so the
  // game tab can load images/sounds from the local folder.
  if (state.rootHandle) {
    const assetMap = {};
    const allPaths = collectAllPaths();
    for (const path of allPaths) {
      if (path.endsWith('.json')) continue;
      try {
        const url = await resolveAssetURL(path);
        if (url) assetMap[path] = url;
      } catch { /* skip unreadable files */ }
    }
    localStorage.setItem('buegame_editor_assets', JSON.stringify(assetMap));
  } else {
    localStorage.removeItem('buegame_editor_assets');
  }

  if (isStandalonePWA()) {
    window.open('../index.html?preview', '_blank', 'popup');
    return;
  }
  window.open('../index.html?preview', '_blank');
}

let deferredInstallPrompt = null;

function updateInstallMenuVisibility() {
  const installBtn = document.getElementById('install-app-btn');
  const canInstall = Boolean(deferredInstallPrompt) && !isStandalonePWA();
  if (installBtn) installBtn.disabled = !canInstall;
}

function setupPWAInstall() {
  updateRunLabels();
  updateWindowTitle();
  updateInstallMenuVisibility();
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    updateRunLabels();
    updateWindowTitle();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallMenuVisibility();
    showToast('Editor installed successfully', 'info');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js');
    });
  }
}

async function installApp() {
  if (!deferredInstallPrompt) {
    showToast('Install prompt is not available in this browser/session', 'error');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallMenuVisibility();
}

/* ── Menu setup ────────────────────────────────── */
initMenu({
  'open-folder': handleOpenFolder,
  'save':        saveCurrentFile,
  'save-all':    saveAllFiles,
  'export-json': exportCurrentJson,
  'export-zip':  exportZip,
  'import-zip':  importZip,
  'exit':        () => {
    window.location.href = '../index.html';
  },
  'install-app': installApp,
  'about':       () => aboutWindow.open(),
  'run-in-tab':  runInNewTab,
});
document.getElementById('run-btn').addEventListener('click', runInNewTab);
setupPWAInstall();

/* ── Keyboard shortcuts ────────────────────────── */
document.addEventListener('keydown', (e) => {
  // Ctrl+S → Save current file
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveCurrentFile();
  }
  // Ctrl+Shift+S → Save all
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    saveAllFiles();
  }
  // Ctrl+O → Open folder
  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault();
    handleOpenFolder();
  }
});

/* ── Resize handles ────────────────────────────── */
initResizeHandles(renderViewport);

/* ── Viewport interactions (create/move/resize) ── */
initViewportInteractions();

/* ── File panel drag-and-drop ──────────────────── */
initFilePanelDrop();

/* ── Viewport resize ───────────────────────────── */
window.addEventListener('resize', () => renderViewport());

/* ── Boot ──────────────────────────────────────── */
(async () => {
  updateWindowTitle();
  updateMenuVisibility();
  renderFileList();
})();
