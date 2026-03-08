/**
 * Centre viewport — scene preview with hotspot overlays.
 */

import { SCRIPTS_BASE, state, dom, hooks } from './state.js';

export function renderViewport() {
  const { viewport, viewportWrap, viewportEmpty } = dom;

  // Clear previous
  viewport.querySelectorAll('.editor-hotspot').forEach(el => el.remove());
  viewport.style.backgroundImage = '';
  viewport.style.backgroundColor = '#181825';
  viewport.style.width  = '';
  viewport.style.height = '';
  viewportEmpty.classList.toggle('hidden', !!state.selectedId);

  if (!state.selectedId || !state.scripts[state.selectedId]) return;
  const data = state.scripts[state.selectedId];

  // _game.json has no visual scene
  if (state.selectedId === '_game') {
    viewport.style.backgroundColor = '#11111b';
    return;
  }

  // Fit scene aspect ratio inside available container space
  const cols = data.grid?.cols ?? 16;
  const rows = data.grid?.rows ?? 9;
  const sceneRatio = cols / rows;
  const pad = 24; // matches #viewport padding
  const availW = viewportWrap.clientWidth  - pad * 2;
  const availH = viewportWrap.clientHeight - pad * 2;
  const containerRatio = availW / availH;

  let w, h;
  if (sceneRatio > containerRatio) {
    w = availW;
    h = availW / sceneRatio;
  } else {
    h = availH;
    w = availH * sceneRatio;
  }
  viewport.style.width  = `${Math.round(w)}px`;
  viewport.style.height = `${Math.round(h)}px`;

  // Background
  if (data.background) {
    viewport.style.backgroundImage = `url('${SCRIPTS_BASE}/${data.background}')`;
  } else {
    viewport.style.backgroundColor = data.backgroundColor || '#111';
  }

  // Hotspots
  if (Array.isArray(data.hotspots)) {
    for (const hs of data.hotspots) {
      const div = document.createElement('div');
      div.className = 'editor-hotspot';
      if (hs.id === state.selectedHs) div.classList.add('selected');

      div.style.left   = `${(hs.x / cols) * 100}%`;
      div.style.top    = `${(hs.y / rows) * 100}%`;
      div.style.width  = `${(hs.w / cols) * 100}%`;
      div.style.height = `${(hs.h / rows) * 100}%`;

      if (hs.texture) {
        div.classList.add('editor-hotspot-textured');
        div.style.backgroundImage = `url('${SCRIPTS_BASE}/${hs.texture}')`;
      }

      const label = document.createElement('span');
      label.className = 'editor-hotspot-label';
      label.textContent = hs.id || hs.label || '';
      div.appendChild(label);

      div.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedHs = hs.id;
        renderViewport();
        hooks.renderProperties();
      });

      viewport.appendChild(div);
    }
  }

  // Click viewport background to deselect hotspot
  viewport.addEventListener('click', () => {
    if (state.selectedHs) {
      state.selectedHs = null;
      renderViewport();
      hooks.renderProperties();
    }
  }, { once: true });
}
