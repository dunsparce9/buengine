/**
 * Shared editor state, DOM references, and render hooks.
 *
 * Modules read/write `state.*` directly. Cross-module render calls
 * go through `hooks.*`, which the orchestrator (editor.js) wires up
 * after all modules are imported.
 */

const _params = new URLSearchParams(location.search);
export const GAME_ID = _params.get('game') || '';
export const SCRIPTS_BASE = GAME_ID ? `../games/${GAME_ID}` : '../scripts';

/* ── Mutable application state ─────────────────── */
export const state = {
  manifest:   null,       // parsed _game.json
  scripts:    {},         // id → parsed JSON
  selectedId: null,       // currently selected script id
  selectedHs: null,       // currently selected hotspot id
  dirtySet:   new Set(),  // script ids with unsaved edits
};

/* ── DOM references ────────────────────────────── */
export const dom = {
  fileList:      document.getElementById('file-list'),
  viewportWrap:  document.getElementById('viewport'),
  viewport:      document.getElementById('viewport-scene'),
  viewportEmpty: document.getElementById('viewport-empty'),
  propsContent:  document.getElementById('props-content'),
};

/* ── Render hooks (set by orchestrator) ────────── */
export const hooks = {
  renderFileList:   () => {},
  renderViewport:   () => {},
  renderProperties: () => {},
};

/* ── Utilities ─────────────────────────────────── */

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function markDirty(id) {
  if (!state.dirtySet.has(id)) {
    state.dirtySet.add(id);
    hooks.renderFileList();
  }
}
