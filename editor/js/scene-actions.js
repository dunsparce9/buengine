/**
 * Scene-object domain mutations (split out of state.js — review phase 5).
 *
 * Pure state (the `state` object, DOM refs, hooks) stays in `./state.js`;
 * anything that mutates scene objects lives here.
 */

import { state, hooks, markDirty } from './state.js';
import { closeWindowsFor } from './floating-window.js';
import { collectAllPaths, findNode } from './fs-provider.js';
import { loadScript } from './script-store.js';
import { walkScriptActions } from '../../js/script-data.js';

/** Rename a scene and its links together; disk changes follow the normal Save flow. */
export async function renameScene(currentId, nextId) {
  const data = state.scripts[currentId];
  if (!data || Array.isArray(data)) throw new Error('Select a scene to rename.');
  if (!nextId || nextId === '_game' || /^[. ]+$/.test(nextId)
      || /[<>:"/\\|?*\x00-\x1f]/.test(nextId) || /[. ]$/.test(nextId)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(nextId)) {
    throw new Error('Scene id must be a valid filename without a folder or extension.');
  }
  const path = `${nextId}.json`;
  const originalPath = state.pendingScriptRenames.get(currentId) || `${currentId}.json`;
  if (nextId !== currentId && nextId.toLowerCase() === currentId.toLowerCase()) {
    throw new Error('Case-only scene renames are not supported.');
  }
  if (nextId !== currentId && (nextId in state.scripts
      || (findNode(path) && path !== originalPath)
      || Object.keys(state.scripts).some(id => id !== currentId && id.toLowerCase() === nextId.toLowerCase())
      || collectAllPaths().some(file => file !== originalPath && file.toLowerCase() === path.toLowerCase())
      || [...state.pendingScriptRenames].some(([id, oldPath]) => id !== currentId && oldPath === path))) {
    throw new Error(`Scene "${nextId}" already exists.`);
  }

  // Links can live in nested files that have not been selected yet.
  const scripts = state.scripts;
  const renamedPaths = new Set(state.pendingScriptRenames.values());
  await Promise.all(collectAllPaths().filter(path => path.endsWith('.json') && !renamedPaths.has(path))
    .map(path => loadScript(path.slice(0, -5))));
  if (state.scripts !== scripts || state.scripts[currentId] !== data) throw new Error('Workspace changed during rename.');
  const previousNames = new Set([currentId, data.id].filter(value => typeof value === 'string' && value));
  closeWindowsFor(data);
  for (const [id, script] of Object.entries(scripts)) {
    let changed = false;
    if (id === '_game') {
      if (previousNames.has(script.startScene)) { script.startScene = nextId; changed = true; }
      if (Array.isArray(script.scenes)) {
        script.scenes = script.scenes.map(value => {
          if (!previousNames.has(value)) return value;
          changed = true;
          return nextId;
        });
      }
    }
    walkScriptActions(script, action => {
      if (previousNames.has(action.goto)) { action.goto = nextId; changed = true; }
    });
    if (changed) markDirty(id);
  }
  if (nextId !== currentId) {
    state.pendingScriptRenames.delete(currentId);
    if (originalPath !== path) state.pendingScriptRenames.set(nextId, originalPath);
    delete scripts[currentId];
    scripts[nextId] = data;
    state.dirtySet.delete(currentId);
  }
  data.id = nextId;
  markDirty(nextId);
  if (state.selectedId === currentId) {
    state.selectedId = nextId;
    state.selectedPath = path;
  }
  hooks.updateWindowTitle();
  hooks.renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
}

/** Get the objects array from scene data (no creation). */
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
  closeWindowsFor(objects[idx]);
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
