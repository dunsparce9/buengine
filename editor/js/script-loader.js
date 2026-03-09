/**
 * Fetches and caches JSON script files.
 * Supports both fetch (memory mode) and File System Access API (native mode).
 */

import { SCRIPTS_BASE, state } from './state.js';
import { readFileText, collectAllPaths, buildSyntheticTree } from './fs-provider.js';

/**
 * Load a single script by id (without .json extension).
 */
export async function loadScript(id) {
  if (state.scripts[id]) return state.scripts[id];

  const path = `${id}.json`;
  let text;
  if (state.fsMode === 'native') {
    text = await readFileText(path);
  } else {
    const url = `${SCRIPTS_BASE}/${encodeURIComponent(id)}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
    text = await res.text();
  }
  const data = JSON.parse(text);
  state.scripts[id] = data;
  return data;
}

/**
 * Discover scripts. In native mode, scan the tree for all JSON files.
 * In memory mode, read _game.json and load declared scenes.
 */
export async function discoverScripts() {
  // Always load the manifest
  state.manifest = await loadScript('_game');

  if (state.fsMode === 'native') {
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
  } else {
    const sceneIds = state.manifest.scenes
      ? state.manifest.scenes
      : [state.manifest.startScene || 'intro'];

    await Promise.all(sceneIds.map(id => loadScript(id).catch(() => null)));

    // Build synthetic tree from known paths
    buildSyntheticTreeFromScripts();
  }
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

/**
 * In memory mode, build a synthetic file tree from loaded scripts and their references.
 */
function buildSyntheticTreeFromScripts() {
  const paths = new Set();
  paths.add('_game.json');

  for (const [id, data] of Object.entries(state.scripts)) {
    if (id !== '_game') paths.add(`${id}.json`);
    // Collect asset references
    if (data.background) paths.add(data.background);
    const objects = data.objects ?? data.hotspots;
    if (Array.isArray(objects)) {
      for (const obj of objects) {
        if (obj.texture) paths.add(obj.texture);
      }
    }
    collectActionPaths(data.onEnter, paths);
    if (data.definitions) {
      for (const acts of Object.values(data.definitions)) collectActionPaths(acts, paths);
    }
    if (Array.isArray(objects)) {
      for (const obj of objects) collectActionPaths(obj.actions, paths);
    }
  }

  state.fileTree = buildSyntheticTree([...paths]);
}

function collectActionPaths(actions, paths) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (a.show?.texture) paths.add(a.show.texture);
    if (a.playsound?.path) paths.add(a.playsound.path);
    if (Array.isArray(a.then)) collectActionPaths(a.then, paths);
    if (Array.isArray(a.else)) collectActionPaths(a.else, paths);
    if (a.choice?.options) {
      for (const o of a.choice.options) collectActionPaths(o.actions, paths);
    }
  }
}

