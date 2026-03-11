/**
 * Shared editor state, DOM references, and render hooks.
 *
 * Modules read/write `state.*` directly. Cross-module render calls
 * go through `hooks.*`, which the orchestrator (editor.js) wires up
 * after all modules are imported.
 */

/* ── Mutable application state ─────────────────── */
export const state = {
  manifest:   null,       // parsed _game.json
  scripts:    {},         // id → parsed JSON
  selectedId: null,       // currently selected script id
  selectedObjectId: null, // currently selected object id
  selectedItem: null,     // currently selected item id in items/items
  dirtySet:   new Set(),  // script ids with unsaved edits

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

/** Get the objects array from scene data. */
function getObjectsArray(data) {
  return data?.objects;
}

/** Get or create the objects array on scene data. */
function ensureObjectsArray(data) {
  if (!data) return [];
  if (data.objects) return data.objects;
  data.objects = [];
  return data.objects;
}

/**
 * Collect all image paths referenced across loaded scripts.
 * Returns a sorted, deduplicated array of paths.
 */
export function collectImagePaths() {
  const paths = new Set();
  const getSceneSequences = (data) => data?.sequences || data?.definitions || {};
  const walkObjectActions = (obj, walkActions) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj.actions)) walkActions(obj.actions);
    if (Array.isArray(obj.options)) {
      for (const option of obj.options) walkActions(option?.actions);
    }
  };
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

/**
 * Delete an object from the currently selected scene.
 */
export function deleteObject(objectId) {
  const sceneId = state.selectedId;
  if (!sceneId) return;
  const data = state.scripts[sceneId];
  const objects = getObjectsArray(data);
  if (!objects) return;
  const idx = objects.findIndex(obj => obj.id === objectId);
  if (idx < 0) return;
  objects.splice(idx, 1);
  if (state.selectedObjectId === objectId) state.selectedObjectId = null;
  markDirty(sceneId);
  hooks.renderViewport();
  hooks.renderProperties();
}

/**
 * Add an object to the currently selected scene.
 */
export function addObject(obj) {
  const sceneId = state.selectedId;
  if (!sceneId) return;
  const data = state.scripts[sceneId];
  if (!data) return;
  const objects = ensureObjectsArray(data);
  objects.push(obj);
  state.selectedObjectId = obj.id;
  markDirty(sceneId);
  hooks.renderViewport();
  hooks.renderProperties();
}

/**
 * Generate a unique object id within the current scene.
 */
export function uniqueObjectId(base = 'object') {
  const data = state.scripts[state.selectedId];
  const objects = getObjectsArray(data) || [];
  const existing = new Set(objects.map(obj => obj.id));
  if (!existing.has(base)) return base;
  let i = 1;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function getItemsArray() {
  const data = state.scripts[state.selectedId];
  return Array.isArray(data) ? data : null;
}

export function uniqueItemId(base = 'item') {
  const items = getItemsArray() || [];
  const existing = new Set(items.map(item => item?.id).filter(Boolean));
  if (!existing.has(base)) return base;
  let i = 1;
  while (existing.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function addItemDefinition(item) {
  const items = getItemsArray();
  if (!items || !state.selectedId) return;
  items.push(item);
  state.selectedItem = item.id || null;
  markDirty(state.selectedId);
  hooks.renderViewport();
  hooks.renderProperties();
}

export function deleteItemDefinition(itemId) {
  const items = getItemsArray();
  if (!items || !state.selectedId) return;
  const idx = items.findIndex(item => item?.id === itemId);
  if (idx < 0) return;
  items.splice(idx, 1);

  if (state.selectedItem === itemId) {
    const fallback = items[Math.min(idx, items.length - 1)];
    state.selectedItem = fallback?.id || null;
  }

  markDirty(state.selectedId);
  hooks.renderViewport();
  hooks.renderProperties();
}
