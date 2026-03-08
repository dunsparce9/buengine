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

/**
 * Collect all image paths referenced across loaded scripts.
 * Returns a sorted, deduplicated array of paths.
 */
export function collectImagePaths() {
  const paths = new Set();
  for (const data of Object.values(state.scripts)) {
    if (data.background) paths.add(data.background);
    if (Array.isArray(data.hotspots)) {
      for (const hs of data.hotspots) {
        if (hs.texture) paths.add(hs.texture);
      }
    }
    // Walk actions for show.texture references
    const walkActions = (actions) => {
      if (!Array.isArray(actions)) return;
      for (const a of actions) {
        if (a.show?.texture) paths.add(a.show.texture);
        if (Array.isArray(a.then)) walkActions(a.then);
        if (Array.isArray(a.else)) walkActions(a.else);
        if (a.choice?.options) {
          for (const o of a.choice.options) walkActions(o.actions);
        }
      }
    };
    if (Array.isArray(data.onEnter)) walkActions(data.onEnter);
    if (data.definitions) {
      for (const acts of Object.values(data.definitions)) walkActions(acts);
    }
    if (Array.isArray(data.hotspots)) {
      for (const hs of data.hotspots) walkActions(hs.actions);
    }
  }
  return [...paths].sort();
}

/**
 * Delete a hotspot from the currently selected scene.
 */
export function deleteHotspot(hsId) {
  const sceneId = state.selectedId;
  if (!sceneId) return;
  const data = state.scripts[sceneId];
  if (!data?.hotspots) return;
  const idx = data.hotspots.findIndex(h => h.id === hsId);
  if (idx < 0) return;
  data.hotspots.splice(idx, 1);
  if (state.selectedHs === hsId) state.selectedHs = null;
  markDirty(sceneId);
  hooks.renderViewport();
  hooks.renderProperties();
}

/**
 * Add a hotspot to the currently selected scene.
 */
export function addHotspot(hs) {
  const sceneId = state.selectedId;
  if (!sceneId) return;
  const data = state.scripts[sceneId];
  if (!data) return;
  if (!data.hotspots) data.hotspots = [];
  data.hotspots.push(hs);
  state.selectedHs = hs.id;
  markDirty(sceneId);
  hooks.renderViewport();
  hooks.renderProperties();
}

/**
 * Generate a unique hotspot id within the current scene.
 */
export function uniqueHotspotId(base = 'hotspot') {
  const data = state.scripts[state.selectedId];
  const existing = new Set((data?.hotspots || []).map(h => h.id));
  if (!existing.has(base)) return base;
  let i = 1;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
