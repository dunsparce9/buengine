/**
 * Inventory-item domain mutations (split out of state.js — review phase 5).
 *
 * Pure state (the `state` object, DOM refs, hooks) stays in `./state.js`;
 * anything that mutates the items table lives here.
 */

import { state, hooks, markDirty } from './state.js';

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
