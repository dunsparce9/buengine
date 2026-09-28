import { state } from '../core/state.js';
import { collectAllPaths, resolveAssetURL } from '../data/fs-provider.js';
import { isStandalonePWA, showToast } from './ui.js';

async function persistPreviewState() {
  const scripts = state.scripts;
  const root = state.rootHandle;
  const json = JSON.stringify(scripts);
  let assetMap = null;
  if (root) {
    assetMap = {};
    for (const path of collectAllPaths()) {
      if (path.endsWith('.json')) continue;
      try {
        const url = await resolveAssetURL(path);
        if (url) assetMap[path] = url;
      } catch {}
    }
  }
  if (state.scripts !== scripts || state.rootHandle !== root) throw new Error('Workspace changed while preparing preview');
  localStorage.setItem('buengine_editor_preview', json);
  if (assetMap) {
    localStorage.setItem('buengine_editor_assets', JSON.stringify(assetMap));
  } else {
    localStorage.removeItem('buengine_editor_assets');
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
  try {
    await persistPreviewState();
    openPreview();
  } catch (err) {
    showToast(`Preview failed: ${err.message}`, 'error');
  }
}

export async function runCurrentScene() {
  const sceneId = getSelectedSceneId();
  if (!sceneId) return false;

  try {
    await persistPreviewState();
    openPreview(`&scene=${encodeURIComponent(sceneId)}`);
    return true;
  } catch (err) {
    showToast(`Preview failed: ${err.message}`, 'error');
    return false;
  }
}
