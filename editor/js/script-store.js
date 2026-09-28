/**
 * Fetches and caches JSON script files from a local folder
 * via the File System Access API.
 *
 * normalizeSceneSequences() below is the single normalization point for
 * the legacy `definitions` → `sequences` migration: every load path runs
 * through it, so all other modules must use `.sequences` directly and not
 * re-implement a `|| definitions` fallback.
 *
 * (Renamed from `script-loader.js` in review phase 5: the old name
 * collided with the runtime `js/script-loader.js`. A single `loadScript()`
 * handles both top-level ids and slashed nested paths such as
 * `items/items` — there is no separate `loadNestedJson` anymore.)
 */

import { state } from './state.js';
import { readFileText, collectAllPaths } from './fs-provider.js';

export function normalizeSceneSequences(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object') return data;
  if (data.sequences || !data.definitions) return data;
  data.sequences = data.definitions;
  delete data.definitions;
  return data;
}

/**
 * Load a single script by id. `id` is the path without the `.json`
 * extension, so both `"intro"` and nested `"items/items"` work.
 */
export async function loadScript(id) {
  if (state.scripts[id]) return state.scripts[id];

  const path = `${id}.json`;
  const text = await readFileText(path);
  const data = normalizeSceneSequences(JSON.parse(text));
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
  try { await loadScript('items/items'); } catch {}
}
