/**
 * Fetches and caches JSON script files from ../scripts/.
 */

import { SCRIPTS_BASE, state } from './state.js';

export async function loadScript(id) {
  if (state.scripts[id]) return state.scripts[id];
  const url = `${SCRIPTS_BASE}/${encodeURIComponent(id)}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const data = await res.json();
  state.scripts[id] = data;
  return data;
}

export async function discoverScripts() {
  state.manifest = await loadScript('_game');

  const sceneIds = state.manifest.scenes
    ? state.manifest.scenes
    : [state.manifest.startScene || 'intro'];

  await Promise.all(sceneIds.map(id => loadScript(id).catch(() => null)));
}
