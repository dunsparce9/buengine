/** Loads and caches JSON scripts from the local game folder.
 * Legacy sequence names are normalized by the shared JSON-format helper.
 */

import { state } from '../core/state.js';
import { readFileText, collectAllPaths, findNode } from './fs-provider.js';

import { normalizeSceneSequences } from '../../../js/shared/script-data.js';
export { normalizeSceneSequences } from '../../../js/shared/script-data.js';

/**
 * Load a single script by id. `id` is the path without the `.json`
 * extension, so both `"intro"` and nested `"items/items"` work.
 */
export async function loadScript(id) {
  if (state.scripts[id]) return state.scripts[id];
  const scripts = state.scripts;
  const root = state.rootHandle;

  const path = `${id}.json`;
  const node = findNode(path);
  const text = await readFileText(path);
  const data = normalizeSceneSequences(JSON.parse(text));
  if (state.scripts !== scripts || state.rootHandle !== root || findNode(path) !== node) {
    throw new Error('Workspace changed while loading JSON.');
  }
  if (scripts[id]) return scripts[id];
  scripts[id] = data;
  return data;
}

/**
 * Discover scripts by scanning the file tree for all JSON files.
 */
export async function discoverScripts() {
  const scripts = state.scripts;
  const root = state.rootHandle;
  // Always load the manifest
  const manifest = await loadScript('_game');
  if (state.scripts !== scripts || state.rootHandle !== root) throw new Error('Workspace changed while loading JSON.');
  state.manifest = manifest;

  // Load all top-level .json files (scenes) from the tree
  const jsonPaths = collectAllPaths().filter(p => p.endsWith('.json') && !p.includes('/'));
  if (collectAllPaths().includes('items/items.json')) jsonPaths.push('items/items.json');
  await Promise.all(
    jsonPaths
      .map(p => p.replace(/\.json$/, ''))
      .filter(id => id !== '_game' && !scripts[id])
      .map(id => loadScript(id))
  );
}
