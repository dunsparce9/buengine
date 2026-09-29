import { walkScriptActions } from '../../../js/shared/script-data.js';

/**
 * Shared editor state, DOM references, and render hooks.
 *
 * Modules read/write `state.*` directly. Cross-module render calls
 * go through `hooks.*`, which the orchestrator (editor.js) wires up
 * after all modules are imported.
 *
 * Domain mutations live in `./scene-actions.js` (objects) and
 * `./items-actions.js` (inventory items) — review phase 5. This module
 * keeps pure state, DOM refs, hooks, and read-only queries.
 */

/* ── Mutable application state ─────────────────── */
export const state = {
  manifest:   null,       // parsed _game.json
  scripts:    {},         // id → parsed JSON
  selectedId: null,       // currently selected script id
  selectedObjectId: null, // currently selected object id
  selectedItem: null,     // currently selected item id in items/items
  dirtySet:   new Set(),  // script ids with unsaved edits
  pendingScriptRenames: new Map(), // new id -> old path for unsaved scene id renames

  /* ── File system ── */
  rootHandle:      null,          // FileSystemDirectoryHandle
  fileTree:        [],            // recursive tree of { name, path, type, handle?, children? }
  expandedFolders: new Set(['']), // folder paths currently expanded (root = '')
  selectedPath:    null,          // path of selected item in file tree
  assetURLCache:   new Map(),     // path → blob URL
};

/* ── DOM references ────────────────────────────── */
export const dom = {
  fileList:      document.getElementById('file-list'),
  viewportWrap:  document.getElementById('viewport'),
  viewport:      document.getElementById('viewport-scene'),

  propsContent:  document.getElementById('props-content'),
};

/* ── Render hooks (set by orchestrator) ────────── */
export const hooks = {
  renderFileList:   () => {},
  renderViewport:   () => {},
  renderProperties: () => {},
  updateWindowTitle: () => {},
  afterSave:        () => {},
  recordChange:     () => {},
  updateHistory:    () => {},
  historyRestored:  () => {},
};

/* ── Utilities ─────────────────────────────────── */

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function markDirty(id) {
  hooks.recordChange();
  if (!state.dirtySet.has(id)) {
    state.dirtySet.add(id);
    hooks.renderFileList();
  }
}

export function scriptPathFromId(id) {
  return id === '_game' ? '_game.json' : `${id}.json`;
}

/**
 * Collect all image paths referenced across loaded scripts.
 * Covers scene backgrounds, object textures, `show.texture` action refs,
 * and inventory item icons. Returns a sorted, deduplicated array of paths.
 *
 * This is the single implementation — callers must not keep a parallel
 * inline copy (review phase 5, item 22).
 */
export function collectImagePaths() {
  const paths = new Set();
  const visit = (action) => {
    if (action.show?.texture) paths.add(action.show.texture);
  };
  for (const data of Object.values(state.scripts)) {
    if (!data || typeof data !== 'object') continue;
    if (data.background) paths.add(data.background);
    // Item tables and scene objects both own image references and options.
    const entities = Array.isArray(data) ? data : (data.objects || []);
    for (const entity of entities) {
      if (!entity || typeof entity !== 'object') continue;
      if (entity.icon) paths.add(entity.icon);
      if (entity.texture) paths.add(entity.texture);
    }
    walkScriptActions(data, visit);
  }
  return [...paths].sort();
}
