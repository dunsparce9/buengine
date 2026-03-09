/**
 * Fetches and caches JSON script files from a local folder
 * via the File System Access API.
 */

import { state } from './state.js';
import { readFileText, collectAllPaths } from './fs-provider.js';

/**
 * Load a single script by id (without .json extension).
 */
export async function loadScript(id) {
  if (state.scripts[id]) return state.scripts[id];

  const path = `${id}.json`;
  const text = await readFileText(path);
  const data = JSON.parse(text);
  state.scripts[id] = data;
  return data;
}

/**
 * Discover scripts by scanning the file tree for all JSON files.
 */
export async function discoverScripts() {
  // Always load the manifest
  state.manifest = await loadScript('_game');

  // Load all top-level .json files (scenes) from the tree
  const jsonPaths = collectAllPaths().filter(p => p.endsWith('.json') && !p.includes('/'));
  await Promise.all(
    jsonPaths
      .map(p => p.replace(/\.json$/, ''))
      .filter(id => id !== '_game' && !state.scripts[id])
      .map(id => loadScript(id).catch(() => null))
  );
  // Also load items/items.json if it exists
  try { await loadNestedJson('items/items'); } catch {}
}

/**
 * Load a JSON file by path (with slashes), e.g. "items/items".
 */
async function loadNestedJson(id) {
  if (state.scripts[id]) return state.scripts[id];
  const path = `${id}.json`;
  const text = await readFileText(path);
  const data = JSON.parse(text);
  state.scripts[id] = data;
  return data;
}

