import { state } from '../state.js';
import { collectAllPaths, resolveAssetURL } from '../fs-provider.js';
import { isStandalonePWA } from './ui.js';

async function persistPreviewState() {
  const overrides = {};
  for (const [id, data] of Object.entries(state.scripts)) {
    overrides[id] = data;
  }
  localStorage.setItem('buegame_editor_preview', JSON.stringify(overrides));

  if (state.rootHandle) {
    const assetMap = {};
    for (const path of collectAllPaths()) {
      if (path.endsWith('.json')) continue;
      try {
        const url = await resolveAssetURL(path);
        if (url) assetMap[path] = url;
      } catch {}
    }
    localStorage.setItem('buegame_editor_assets', JSON.stringify(assetMap));
  } else {
    localStorage.removeItem('buegame_editor_assets');
  }
}

function openPreview(query = '') {
  const features = isStandalonePWA() ? 'popup' : undefined;
  window.open(`../index.html?preview${query}`, '_blank', features);
}

function getSelectedSceneId() {
  const sceneId = state.selectedId;
  const data = sceneId ? state.scripts[sceneId] : null;
  if (!sceneId || sceneId === '_game' || Array.isArray(data) || !data) return null;
  return sceneId;
}

export async function runInNewTab() {
  await persistPreviewState();
  openPreview();
}

export async function runCurrentScene() {
  const sceneId = getSelectedSceneId();
  if (!sceneId) return false;

  await persistPreviewState();
  openPreview(`&scene=${encodeURIComponent(sceneId)}`);
  return true;
}
