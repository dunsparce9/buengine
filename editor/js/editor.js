/**
 * büegame editor — orchestrator
 *
 * Imports all editor modules, wires render hooks, and boots the app.
 */

import { state, hooks } from './state.js';
import { createFloatingWindow } from './floating-window.js';
import { discoverScripts } from './script-loader.js';
import { renderFileList, selectScript } from './file-panel.js';
import { renderViewport } from './viewport.js';
import { renderProperties } from './properties.js';
import { initMenu } from './menu.js';
import { initResizeHandles } from './resize.js';
import './action-viewer.js';

/* ── Wire render hooks ─────────────────────────── */
hooks.renderFileList   = renderFileList;
hooks.renderViewport   = renderViewport;
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
  h.textContent = 'b\u00fcegame editor';
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
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${state.selectedId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Run in new tab ────────────────────────────── */
function runInNewTab() {
  const overrides = {};
  for (const [id, data] of Object.entries(state.scripts)) {
    overrides[id] = data;
  }
  localStorage.setItem('buegame_editor_preview', JSON.stringify(overrides));
  window.open('../index.html?preview', '_blank');
}

/* ── Menu setup ────────────────────────────────── */
initMenu({
  export:       exportCurrentJson,
  exit:         () => { window.location.href = '../index.html'; },
  about:        () => aboutWindow.open(),
  'run-in-tab': runInNewTab,
});
document.getElementById('run-btn').addEventListener('click', runInNewTab);

/* ── Resize handles ────────────────────────────── */
initResizeHandles(renderViewport);

/* ── Viewport resize ───────────────────────────── */
window.addEventListener('resize', () => renderViewport());

/* ── Boot ──────────────────────────────────────── */
(async () => {
  await discoverScripts();
  renderFileList();
  selectScript('_game');
})();
