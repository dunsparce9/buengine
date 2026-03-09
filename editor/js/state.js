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
  manifest:     null,       // parsed _game.json
  scripts:      {},         // id → parsed JSON
  selectedId:   null,       // currently selected script id
  selectedHs:   null,       // currently selected hotspot id
  dirtySet:     new Set(),  // script ids with unsaved edits
  scriptsBase:  SCRIPTS_BASE,
  assetUrls:    {},         // relative path -> blob/data URL (for local folder mode)
  localSource:  null,       // in-memory script source when loading from local folder
  gameId:       GAME_ID,
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

export function resolveAssetPath(relativePath) {
  if (!relativePath) return relativePath;
  if (state.assetUrls[relativePath]) return state.assetUrls[relativePath];
  if (!state.scriptsBase) return relativePath;
  return `${state.scriptsBase}/${relativePath}`;
}

export function setFolderSource({ scripts, assetUrls, gameTitle }) {
  state.localSource = { scripts };
  state.assetUrls = assetUrls || {};
  state.scriptsBase = '';
  state.gameId = '';
  state.scripts = {};
  state.manifest = null;
  state.selectedId = null;
  state.selectedHs = null;
  state.dirtySet.clear();
  document.title = gameTitle ? `büegame editor — ${gameTitle}` : 'büegame editor';
}

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

/** Get the objects array from scene data (supports both "objects" and "hotspots" keys). */
function getObjectsArray(data) {
  return data?.objects ?? data?.hotspots;
}

/** Get or create the objects array on scene data. */
function ensureObjectsArray(data) {
  if (!data) return [];
  if (data.objects) return data.objects;
  if (data.hotspots) return data.hotspots;
  data.objects = [];
  return data.objects;
}

/**
 * Collect all image paths referenced across loaded scripts.
 * Returns a sorted, deduplicated array of paths.
 */
export function collectImagePaths() {
  const paths = new Set();
  for (const data of Object.values(state.scripts)) {
    if (data.background) paths.add(data.background);
    const objects = getObjectsArray(data);
    if (Array.isArray(objects)) {
      for (const obj of objects) {
        if (obj.texture) paths.add(obj.texture);
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
    if (Array.isArray(objects)) {
      for (const obj of objects) walkActions(obj.actions);
    }
  }
  return [...paths].sort();
}

/**
 * Delete an object from the currently selected scene.
 */
export function deleteHotspot(hsId) {
  const sceneId = state.selectedId;
  if (!sceneId) return;
  const data = state.scripts[sceneId];
  const objects = getObjectsArray(data);
  if (!objects) return;
  const idx = objects.findIndex(h => h.id === hsId);
  if (idx < 0) return;
  objects.splice(idx, 1);
  if (state.selectedHs === hsId) state.selectedHs = null;
  markDirty(sceneId);
  hooks.renderViewport();
  hooks.renderProperties();
}

/**
 * Add an object to the currently selected scene.
 */
export function addHotspot(hs) {
  const sceneId = state.selectedId;
  if (!sceneId) return;
  const data = state.scripts[sceneId];
  if (!data) return;
  const objects = ensureObjectsArray(data);
  objects.push(hs);
  state.selectedHs = hs.id;
  markDirty(sceneId);
  hooks.renderViewport();
  hooks.renderProperties();
}

/**
 * Generate a unique object id within the current scene.
 */
export function uniqueHotspotId(base = 'object') {
  const data = state.scripts[state.selectedId];
  const objects = getObjectsArray(data) || [];
  const existing = new Set(objects.map(h => h.id));
  if (!existing.has(base)) return base;
  let i = 1;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
