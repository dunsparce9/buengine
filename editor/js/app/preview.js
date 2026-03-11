import { state } from '../state.js';
import { collectAllPaths, resolveAssetURL } from '../fs-provider.js';
import { isStandalonePWA } from './ui.js';

export async function runInNewTab() {
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

  const features = isStandalonePWA() ? 'popup' : undefined;
  window.open('../index.html?preview', '_blank', features);
}
