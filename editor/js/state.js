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
  const getSceneSequences = (data) => data?.sequences || {};
  const walkObjectActions = (obj, walkActions) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj.actions)) walkActions(obj.actions);
    if (Array.isArray(obj.options)) {
      for (const option of obj.options) walkActions(option?.actions);
    }
  };
  for (const data of Object.values(state.scripts)) {
    // Items table (items/items.json is an array, not a scene)
    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        if (item.icon) paths.add(item.icon);
      }
      // Item option actions may still reference show.texture overlays.
      const walkItemActions = (actions) => {
        if (!Array.isArray(actions)) return;
        for (const a of actions) {
          if (a.show?.texture) paths.add(a.show.texture);
          if (Array.isArray(a.then)) walkItemActions(a.then);
          if (Array.isArray(a.else)) walkItemActions(a.else);
          if (Array.isArray(a.do)) walkItemActions(a.do);
          if (a.choice?.options) {
            for (const o of a.choice.options) walkItemActions(o.actions);
          }
        }
      };
      for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        if (Array.isArray(item.options)) {
          for (const option of item.options) walkItemActions(option?.actions);
        }
      }
      continue;
    }
    if (data.background) paths.add(data.background);
    const objects = data?.objects;
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
        if (Array.isArray(a.do)) walkActions(a.do);
        if (a.choice?.options) {
          for (const o of a.choice.options) walkActions(o.actions);
        }
      }
    };
    if (Array.isArray(data.onEnter)) walkActions(data.onEnter);
    for (const acts of Object.values(getSceneSequences(data))) {
      walkActions(acts);
    }
    if (Array.isArray(objects)) {
      for (const obj of objects) walkObjectActions(obj, walkActions);
    }
  }
  return [...paths].sort();
}
