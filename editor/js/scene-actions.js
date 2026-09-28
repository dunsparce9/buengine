/**
 * Scene-object domain mutations (split out of state.js — review phase 5).
 *
 * Pure state (the `state` object, DOM refs, hooks) stays in `./state.js`;
 * anything that mutates scene objects lives here.
 */

import { state, hooks, markDirty } from './state.js';

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
