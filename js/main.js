import { EventBus }      from './event-bus.js';
import { GameState }     from './game-state.js';
import { ScriptLoader }  from './script-loader.js';
import { SceneRenderer } from './scene-renderer.js';
import { ActionRunner }  from './action-runner.js';
import { DialogueUI }    from './dialogue-ui.js';
import { ChoiceUI }      from './choice-ui.js';
import { OverlayUI }     from './overlay-ui.js';

/* ── Bootstrap ──────────────────────────────────── */

const bus         = new EventBus();
const state       = new GameState();
const loader      = new ScriptLoader('scripts');
const scene       = new SceneRenderer(document.getElementById('scene-layer'), bus);
const runner      = new ActionRunner({ bus, state });
const gridOverlay = document.getElementById('grid-overlay');

// UI subsystems (they self-register on the bus)
new DialogueUI(bus);
new ChoiceUI(bus);
const overlay = new OverlayUI(bus);

/** Currently loaded scene data keyed by id. */
let currentSceneData = null;

/* ── Scene navigation ───────────────────────────── */

/**
 * Collect all `goto` scene IDs reachable from an action array (recursive).
 * @param {object[]} actions
 * @param {Set<string>} out
 */
function collectGotos(actions, out) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (a.goto) out.add(a.goto);
    if (a.then) collectGotos(a.then, out);
    if (a.else) collectGotos(a.else, out);
    if (a.choice?.options) {
      for (const opt of a.choice.options) collectGotos(opt.actions, out);
    }
  }
}

/** Fire-and-forget: preload JSON + images for scenes reachable from `data`. */
function preloadNeighbors(data) {
  const ids = new Set();
  if (Array.isArray(data.onEnter)) collectGotos(data.onEnter, ids);
  if (Array.isArray(data.hotspots)) {
    for (const hs of data.hotspots) collectGotos(hs.actions, ids);
  }
  if (data.definitions) {
    for (const actions of Object.values(data.definitions)) collectGotos(actions, ids);
  }
  for (const id of ids) {
    loader.load(id).then(d => scene.preload(d)).catch(() => {});
  }
}

async function gotoScene(id) {
  runner.abort();
  const data = await loader.load(id);
  currentSceneData = data;
  runner.definitions = data.definitions || {};
  state.pushScene(id);
  bus.emit('overlay:clear');
  await scene.preload(data);
  scene.render(data);
  debugScene.textContent = `Scene: ${id}`;

  // Keep grid overlay CSS vars in sync with the scene's tile dimensions
  const cols = data.grid?.cols ?? 16;
  const rows = data.grid?.rows ?? 9;
  gridOverlay.style.setProperty('--grid-cols', cols);
  gridOverlay.style.setProperty('--grid-rows', rows);

  // Preload neighboring scenes in the background
  preloadNeighbors(data);

  // Run the scene's entry actions, if any
  if (Array.isArray(data.onEnter)) {
    await runner.run(data.onEnter);
  }
}

/* ── Hotspot clicks → run attached actions ──────── */
bus.on('hotspot:click', async (hs) => {
  if (runner.running) return;
  // Auto-track clicks per hotspot ID: {scene}.{hotspot}.clicks
  if (hs.id) {
    const key = `${state.currentScene}.${hs.id}.clicks`;
    state.setFlag(key, (state.getFlag(key) ?? 0) + 1);
  }
  if (Array.isArray(hs.actions)) {
    await runner.run(hs.actions);
  }
});

/* ── Scene goto (from action runner) ────────────── */
bus.on('scene:goto', (id) => gotoScene(id));

/* ── Game lifecycle ─────────────────────────────── */

/** Load manifest and show title overlay (or skip straight to game). */
async function showTitle() {
  try {
    const manifest = await loader.load('_game');
    if (manifest.skipTitleScreen) {
      bus.emit('game:start');
      return;
    }
    overlay.showTitle({ title: manifest.title, subtitle: manifest.subtitle });
  } catch {
    overlay.showTitle({ title: 'büegame', subtitle: 'A point-and-click adventure' });
  }
}

/** Start a new game: reset state, load first scene. */
bus.on('game:start', async () => {
  state.reset();
  try {
    const manifest = await loader.load('_game');
    await gotoScene(manifest.startScene || 'intro');
  } catch {
    await gotoScene('intro');
  }
});

/** Return to title screen. */
bus.on('game:title', () => {
  runner.abort();
  scene.clear();
  showTitle();
});

/* ── Debug mode (key 1) ─────────────────────────── */
const debugBox     = document.getElementById('debug-box');
const debugTile    = document.getElementById('debug-tile');
const debugHotspot = document.getElementById('debug-hotspot');
const debugScene   = document.getElementById('debug-scene');
let debugActive = false;

document.addEventListener('keydown', (e) => {
  if (e.key === '1') {
    debugActive = !debugActive;
    gridOverlay.classList.toggle('hidden', !debugActive);
    debugBox.classList.toggle('hidden', !debugActive);
  }
});

const sceneLayer = document.getElementById('scene-layer');

sceneLayer.addEventListener('mousemove', (e) => {
  if (!debugActive || !currentSceneData) return;
  const rect = sceneLayer.getBoundingClientRect();
  const cols = currentSceneData.grid?.cols ?? 16;
  const rows = currentSceneData.grid?.rows ?? 9;
  const tileW = rect.width / cols;
  const tileH = rect.height / rows;
  const tileX = Math.floor((e.clientX - rect.left) / tileW);
  const tileY = Math.floor((e.clientY - rect.top) / tileH);
  debugTile.textContent = `Tile: ${tileX}, ${tileY}`;

  // Find hovered hotspot
  let hoveredLabel = '—';
  if (Array.isArray(currentSceneData.hotspots)) {
    for (const hs of currentSceneData.hotspots) {
      if (tileX >= hs.x && tileX < hs.x + hs.w &&
          tileY >= hs.y && tileY < hs.y + hs.h) {
        hoveredLabel = hs.id || hs.label || '(unnamed)';
        break;
      }
    }
  }
  debugHotspot.textContent = `Hotspot: ${hoveredLabel}`;
});

sceneLayer.addEventListener('mouseleave', () => {
  if (!debugActive) return;
  debugTile.textContent = 'Tile: —, —';
  debugHotspot.textContent = 'Hotspot: —';
});

/* ── Initial boot ───────────────────────────────── */
showTitle();
