/**
 * büegame editor — orchestrator
 *
 * Imports all editor modules, wires render hooks, and boots the app.
 */

import { state, hooks, setFolderSource } from './state.js';
import { createFloatingWindow } from './floating-window.js';
import { discoverScripts } from './script-loader.js';
import { renderFileList, selectScript } from './file-panel.js';
import { renderViewport, initViewportInteractions } from './viewport.js';
import { renderProperties } from './properties.js';
import { initMenu } from './menu.js';
import { initResizeHandles } from './resize.js';
import './action-viewer.js';

/* ── Wire render hooks ─────────────────────────── */
hooks.renderFileList = renderFileList;
hooks.renderViewport = renderViewport;
hooks.renderProperties = renderProperties;

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
  h.textContent = 'büegame editor';
  h.style.fontSize = '1.3rem';
  h.style.marginBottom = '6px';
  const p1 = document.createElement('p');
  p1.textContent = 'v0.0';
  p1.style.color = '#e1c8a4';
  const p2 = document.createElement('p');
  p2.textContent = 'All rights reserved?';
  p2.style.color = '#a89984';
  p2.style.fontSize = '12px';
  c.append(h, p1, p2);
}

/* ── Export ─────────────────────────────────────── */
function exportCurrentJson() {
  if (!state.selectedId || !state.scripts[state.selectedId]) return;
  const data = state.scripts[state.selectedId];
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.selectedId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Local folder load ─────────────────────────── */
async function walkDirectoryEntries(dirHandle, prefix, out) {
  for await (const entry of dirHandle.values()) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      await walkDirectoryEntries(entry, rel, out);
    } else {
      out.push({ path: rel, handle: entry });
    }
  }
}

function normalizeRelPath(path) {
  return path.replace(/^\.\//, '').replace(/\\/g, '/');
}

async function loadFromDirectoryHandle(dirHandle) {
  const files = [];
  await walkDirectoryEntries(dirHandle, '', files);

  const scripts = {};
  const assetUrls = {};

  for (const f of files) {
    const relPath = normalizeRelPath(f.path);
    const file = await f.handle.getFile();

    if (/\.json$/i.test(relPath)) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const id = relPath === '_game.json' ? '_game' : relPath.replace(/\.json$/i, '').split('/').pop();
        scripts[id] = data;
      } catch {
        // Ignore invalid JSON files in non-script folders.
      }
      continue;
    }

    const url = URL.createObjectURL(file);
    assetUrls[relPath] = url;
  }

  if (!scripts._game) throw new Error('This folder is missing _game.json at its root.');

  setFolderSource({
    scripts,
    assetUrls,
    gameTitle: scripts._game.title || dirHandle.name,
  });

  await discoverScripts();
  renderFileList();
  if (state.scripts._game) {
    selectScript('_game');
  } else {
    state.selectedId = null;
    renderViewport();
    renderProperties();
  }
}

async function loadFromFileList(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  const rawPaths = files.map(f => normalizeRelPath(f.webkitRelativePath || f.name));
  const rootPrefix = rawPaths.length && rawPaths.every(p => p.includes('/'))
    ? rawPaths[0].split('/')[0]
    : '';

  const stripRoot = (p) => {
    if (!rootPrefix || !p.startsWith(`${rootPrefix}/`)) return p;
    return p.slice(rootPrefix.length + 1);
  };

  const scripts = {};
  const assetUrls = {};

  for (const file of files) {
    const rel = stripRoot(normalizeRelPath(file.webkitRelativePath || file.name));

    if (/\.json$/i.test(rel)) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const id = rel === '_game.json' ? '_game' : rel.replace(/\.json$/i, '').split('/').pop();
        scripts[id] = data;
      } catch {
        // Ignore invalid JSON files.
      }
      continue;
    }

    assetUrls[rel] = URL.createObjectURL(file);
  }

  if (!scripts._game) throw new Error('Selected folder does not contain _game.json at its root.');

  setFolderSource({
    scripts,
    assetUrls,
    gameTitle: scripts._game.title,
  });

  await discoverScripts();
  renderFileList();
  selectScript('_game');
}

async function openLocalFolder() {
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker();
      await loadFromDirectoryHandle(dir);
      return;
    } catch {
      return;
    }
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('webkitdirectory', '');
  input.multiple = true;
  input.addEventListener('change', async () => {
    if (!input.files?.length) return;
    await loadFromFileList(input.files);
  }, { once: true });
  input.click();
}

/* ── Run in new tab ────────────────────────────── */
function runInNewTab() {
  const scripts = {};
  for (const [id, data] of Object.entries(state.scripts)) {
    scripts[id] = data;
  }

  localStorage.setItem('buegame_editor_preview', JSON.stringify({
    scripts,
    assetUrls: state.assetUrls,
    gameId: state.gameId || '',
  }));

  const params = new URLSearchParams({ preview: '' });
  if (state.gameId) params.set('game', state.gameId);
  window.open(`../index.html?${params}`, '_blank');
}

/* ── Menu setup ────────────────────────────────── */
initMenu({
  export: exportCurrentJson,
  'open-folder': openLocalFolder,
  exit: () => {
    const params = new URLSearchParams();
    if (state.gameId) params.set('game', state.gameId);
    const qs = params.toString();
    window.location.href = qs ? `../index.html?${qs}` : '../index.html';
  },
  about: () => aboutWindow.open(),
  'run-in-tab': runInNewTab,
});
document.getElementById('run-btn').addEventListener('click', runInNewTab);

/* ── Resize handles ────────────────────────────── */
initResizeHandles(renderViewport);

/* ── Viewport interactions (create/move/resize) ── */
initViewportInteractions();

/* ── Viewport resize ───────────────────────────── */
window.addEventListener('resize', () => renderViewport());

/* ── Boot ──────────────────────────────────────── */
(async () => {
  await discoverScripts();
  renderFileList();
  if (state.scripts._game) {
    selectScript('_game');
  } else {
    state.selectedId = null;
    renderViewport();
    renderProperties();
  }
})();
