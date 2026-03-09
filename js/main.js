import { EventBus }      from './event-bus.js';
import { GameState }     from './game-state.js';
import { ScriptLoader }  from './script-loader.js';
import { SceneRenderer } from './scene-renderer.js';
import { ActionRunner }  from './action-runner.js';
import { DialogueUI }    from './dialogue-ui.js';
import { ChoiceUI }      from './choice-ui.js';
import { OverlayUI }     from './overlay-ui.js';
import { SoundManager }  from './sound-manager.js';
import { HudUI }         from './hud-ui.js';
import { Inventory }       from './inventory.js';
import { InventoryUI }     from './inventory-ui.js';
import { NotificationUI }  from './notification-ui.js';

/* ── Bootstrap ──────────────────────────────────── */

const bus         = new EventBus();
const state       = new GameState();
const loader      = new ScriptLoader();        // basePath set by selectGame()
const inventory   = new Inventory(bus);
const scene       = new SceneRenderer(document.getElementById('scene-layer'), bus);
const runner      = new ActionRunner({ bus, state, inventory });
const gridOverlay = document.getElementById('grid-overlay');

// UI subsystems (they self-register on the bus)
new DialogueUI(bus);
new ChoiceUI(bus);
const overlay = new OverlayUI(bus);
new SoundManager(bus);
const hud = new HudUI(bus);
const inventoryUI = new InventoryUI(bus, inventory, runner);
new NotificationUI(bus);

/** Currently loaded scene data keyed by id. */
let currentSceneData = null;

/* ── Game selector ──────────────────────────────── */
const selectorOverlay = document.getElementById('game-selector');
const gameListEl      = document.getElementById('game-list');

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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const FILE_EXT  = /\.(png|jpe?g|gif|webp|svg|bmp|opus|mp3|ogg|wav|webm|m4a|aac|flac)$/i;

/** Walk a scene object and collect every string that looks like an asset path. */
function collectAssetPaths(data) {
  const paths = new Set();
  (function walk(obj) {
    if (typeof obj === 'string') { if (FILE_EXT.test(obj)) paths.add(obj); return; }
    if (Array.isArray(obj)) { for (const item of obj) walk(item); return; }
    if (obj && typeof obj === 'object') { for (const v of Object.values(obj)) walk(v); }
  })(data);
  return paths;
}

/** Preload all assets referenced in a scene (images + sounds). */
function preloadAssets(data) {
  const paths = collectAssetPaths(data);
  if (paths.size === 0) return Promise.resolve();
  return Promise.all([...paths].map(p => {
    const url = loader.resolvePath(p);
    if (IMAGE_EXT.test(p)) {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = img.onerror = resolve;
        img.src = url;
      });
    }
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    return Promise.resolve();
  }));
}

/** Fire-and-forget: preload JSON + assets for scenes reachable from `data`. */
function preloadNeighbors(data) {
  const ids = new Set();
  if (Array.isArray(data.onEnter)) collectGotos(data.onEnter, ids);
  const objects = data.objects ?? data.hotspots;
  if (Array.isArray(objects)) {
    for (const obj of objects) collectGotos(obj.actions, ids);
  }
  if (data.definitions) {
    for (const actions of Object.values(data.definitions)) collectGotos(actions, ids);
  }
  for (const id of ids) {
    loader.load(id).then(d => preloadAssets(d)).catch(() => {});
  }
}

async function gotoScene(id) {
  runner.abort();
  const data = await loader.load(id);
  currentSceneData = data;
  runner.definitions = data.definitions || {};
  state.pushScene(id);
  bus.emit('overlay:clear');
  await preloadAssets(data);
  scene.render(data);
  debugScene.textContent = `Scene: ${id}`;

  // Show or hide the HUD based on the scene's elements list
  const elements = Array.isArray(data.elements) ? data.elements : [];
  bus.emit(elements.includes('hud') ? 'hud:show' : 'hud:hide');

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

/* ── Object clicks → run attached actions ────────── */
bus.on('hotspot:click', async (obj) => {
  if (runner.running) return;
  // Auto-track clicks per object ID: {scene}.{object}.clicks
  if (obj.id) {
    const key = `${state.currentScene}.${obj.id}.clicks`;
    state.setFlag(key, (state.getFlag(key) ?? 0) + 1);
  }
  if (Array.isArray(obj.actions)) {
    runner.currentObjectId = obj.id || null;
    await runner.run(obj.actions);
    runner.currentObjectId = null;
  }
});

/* ── Scene goto (from action runner) ────────────── */
bus.on('scene:goto', (id) => gotoScene(id));

/* ── Game selector ──────────────────────────────── */

async function showGameSelector() {
  try {
    const res = await fetch('games/index.json');
    if (!res.ok) throw new Error('Failed to load game list');
    const gameIds = await res.json();

    // Fetch all manifests in parallel for display
    const entries = await Promise.all(gameIds.map(async (id) => {
      try {
        const r = await fetch(`games/${encodeURIComponent(id)}/_game.json`);
        return { id, manifest: await r.json() };
      } catch { return { id, manifest: {} }; }
    }));

    gameListEl.innerHTML = '';
    for (const { id, manifest } of entries) {
      const entry = document.createElement('div');
      entry.className = 'game-entry';
      const title = document.createElement('div');
      title.className = 'game-entry-title';
      title.textContent = manifest.title || id;
      entry.appendChild(title);
      if (manifest.subtitle) {
        const sub = document.createElement('div');
        sub.className = 'game-entry-subtitle';
        sub.textContent = manifest.subtitle;
        entry.appendChild(sub);
      }
      entry.addEventListener('click', () => selectGame(id));
      gameListEl.appendChild(entry);
    }
  } catch {
    gameListEl.innerHTML = '<p style="opacity:0.7">No games found.</p>';
  }
  selectorOverlay.classList.remove('hidden');
}

function selectGame(id) {
  const basePath = `games/${id}`;
  loader.setBasePath(basePath);
  bus.emit('game:basepath', basePath);
  selectorOverlay.classList.add('hidden');
  showTitle();
}

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
  inventory.reset();
  try {
    const manifest = await loader.load('_game');
    const invCapacity = manifest.inventory || 0;
    inventory.configure(invCapacity);

    // In preview mode, item definitions may be in the script cache
    if (loader.isPreview) {
      try {
        const defs = await loader.load('items/items');
        inventory.loadDefinitionsFromData(defs);
      } catch {
        await inventory.loadDefinitions(loader.basePath);
      }
    } else {
      await inventory.loadDefinitions(loader.basePath);
    }

    bus.emit('hud:inventory-enabled', inventory.enabled);
    await gotoScene(manifest.startScene || 'intro');
  } catch {
    await gotoScene('intro');
  }
});

/** Return to title screen. */
bus.on('game:title', () => {
  runner.abort();
  bus.emit('dialogue:dismiss');
  bus.emit('choice:dismiss');
  bus.emit('sound:stopall');
  scene.clear();
  hud.hide();
  showTitle();
});

/** Quit: return to game selector. */
bus.on('game:quit', () => {
  runner.abort();
  bus.emit('dialogue:dismiss');
  bus.emit('choice:dismiss');
  bus.emit('sound:stopall');
  scene.clear();
  hud.hide();
  overlay.hideTitle();
  overlay.hidePause();
  state.reset();
  inventory.reset();
  showGameSelector();
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

  // Find hovered object
  let hoveredLabel = '—';
  const sceneObjects = currentSceneData.objects ?? currentSceneData.hotspots;
  if (Array.isArray(sceneObjects)) {
    for (const obj of sceneObjects) {
      if (tileX >= obj.x && tileX < obj.x + obj.w &&
          tileY >= obj.y && tileY < obj.y + obj.h) {
        hoveredLabel = obj.id || obj.label || '(unnamed)';
        break;
      }
    }
  }
  debugHotspot.textContent = `Object: ${hoveredLabel}`;
});

sceneLayer.addEventListener('mouseleave', () => {
  if (!debugActive) return;
  debugTile.textContent = 'Tile: —, —';
  debugHotspot.textContent = 'Object: —';
});

/* ── Initial boot ───────────────────────────────── */
const _params = new URLSearchParams(location.search);
const _urlGame = _params.get('game');

if (_urlGame) {
  selectGame(_urlGame);
} else if (loader.isPreview && loader._cache.has('_game')) {
  // Editor preview of a local folder — no game ID needed.
  // Broadcast the asset map so renderers can resolve blob URLs.
  if (loader.assetMap) bus.emit('game:assetmap', loader.assetMap);
  showTitle();
} else {
  showGameSelector();
}
