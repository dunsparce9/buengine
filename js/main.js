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
import { ObjectOptionsUI } from './object-options-ui.js';
import { GameSelector }    from './game-selector.js';
import { DebugHud }        from './debug-hud.js';
import { Paths }           from './paths.js';

/* ── Bootstrap ──────────────────────────────────── */

const bus         = new EventBus();
const state       = new GameState();
const loader      = new ScriptLoader();        // basePath set by selectGame()
const inventory   = new Inventory(bus);
const scene       = new SceneRenderer(document.getElementById('scene-layer'), bus);
const runner      = new ActionRunner({ bus, state, inventory });
const gridOverlay = document.getElementById('grid-overlay');
const gameContainer = document.getElementById('game-container');

// UI subsystems (they self-register on the bus)
new DialogueUI(bus);
new ChoiceUI(bus);
const overlay = new OverlayUI(bus);
const sound   = new SoundManager(bus);
const hud = new HudUI(bus);
const inventoryUI = new InventoryUI(bus, inventory, runner);
new NotificationUI(bus);
new ObjectOptionsUI(bus);

// Plain UI components wired via callbacks instead of the bus
const gameSelector = new GameSelector((id) => selectGame(id));

/** Currently loaded scene data keyed by id. */
let currentSceneData = null;
const debugHud = new DebugHud(() => currentSceneData);

gameContainer.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

/* ── Pause ↔ audio lifecycle ────────────────────── */
bus.on('overlay:paused',  () => sound.pauseAll());
bus.on('overlay:resumed', () => sound.resumeAll());

/* ── Scene navigation ───────────────────────────── */

/**
 * Monotonic scene-transition generation counter. Every gotoScene() bumps it
 * and captures its own value; after each await, a stale generation means a
 * newer transition superseded this one and it must bail out silently.
 */
let sceneEpoch = 0;

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
    if (a.do) collectGotos(a.do, out);
    if (Array.isArray(a.fork)) collectGotos(a.fork, out);
    if (Array.isArray(a.fork?.actions)) collectGotos(a.fork.actions, out);
    if (a.choice?.options) {
      for (const opt of a.choice.options) collectGotos(opt.actions, out);
    }
  }
}

function collectObjectGotos(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj.actions)) collectGotos(obj.actions, out);
  if (Array.isArray(obj.options)) {
    for (const option of obj.options) collectGotos(option?.actions, out);
  }
}

function getSceneSequences(data) {
  return data?.sequences || {};
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
    // Non-image assets (audio etc.) are not preloaded; the sound manager
    // fetches them on demand.
    return Promise.resolve();
  }));
}

/** Fire-and-forget: preload JSON + assets for scenes reachable from `data`. */
function preloadNeighbors(data) {
  const ids = new Set();
  if (Array.isArray(data.onEnter)) collectGotos(data.onEnter, ids);
  const objects = data.objects;
  if (Array.isArray(objects)) {
    for (const obj of objects) collectObjectGotos(obj, ids);
  }
  const sequences = getSceneSequences(data);
  for (const actions of Object.values(sequences)) {
    collectGotos(actions, ids);
  }
  for (const id of ids) {
    loader.load(id).then(d => preloadAssets(d)).catch(() => {});
  }
}

async function gotoScene(id) {
  const epoch = ++sceneEpoch;
  runner.abort();
  const data = await loader.load(id);
  if (epoch !== sceneEpoch) return; // superseded by a newer transition
  currentSceneData = data;
  runner.sequences = getSceneSequences(data);
  state.pushScene(id);
  bus.emit('overlay:clear');
  await preloadAssets(data);
  if (epoch !== sceneEpoch) return; // superseded by a newer transition
  scene.render(data);
  debugHud.setScene(id);

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
  if (Array.isArray(data.onEnter) && epoch === sceneEpoch) {
    await runner.run(data.onEnter);
    if (epoch !== sceneEpoch) {
      // Superseded mid-onEnter: stop anything of ours still running.
      runner.abort();
      return;
    }
  }
}

function getObjectOptions(obj) {
  return Array.isArray(obj?.options) ? obj.options : [];
}

function trackObjectClick(obj) {
  if (!obj?.id) return;
  const key = `${state.currentScene}.${obj.id}.clicks`;
  state.setFlag(key, (state.getFlag(key) ?? 0) + 1);
}

async function runObjectInteraction(obj, optionIndex = 0, { interruptIfRunning = false } = {}) {
  const options = getObjectOptions(obj);

  if (options.length > 0) {
    const option = options[optionIndex];
    if (!option) return;
    const actions = Array.isArray(option.actions) ? option.actions : [];
    if (runner.running) {
      if (!interruptIfRunning) return;
      if (!actions.length) return;
      await runner.abort(); // handshake: wait for the old chain to fully unwind
    }
    trackObjectClick(obj);
    runner.currentObjectId = obj.id || null;
    try {
      await runner.run(actions);
    } finally {
      runner.currentObjectId = null;
    }
    return;
  }

  if (runner.running) {
    if (!interruptIfRunning) return;
    if (!Array.isArray(obj?.actions) || obj.actions.length === 0) return;
    await runner.abort(); // handshake: wait for the old chain to fully unwind
  }

  trackObjectClick(obj);
  if (Array.isArray(obj?.actions)) {
    runner.currentObjectId = obj.id || null;
    try {
      await runner.run(obj.actions);
    } finally {
      runner.currentObjectId = null;
    }
  }
}

/* ── Object clicks → run attached actions/options ───── */
bus.on('object:click', async (obj) => {
  await runObjectInteraction(obj, 0);
});

bus.on('object:option', async ({ obj, index }) => {
  await runObjectInteraction(obj, index, { interruptIfRunning: true });
});

bus.on('object:contextmenu', ({ obj, clientX, clientY }) => {
  const options = getObjectOptions(obj);
  if (!options.length) return;
  bus.emit('object-options:show', { obj, options, clientX, clientY });
});

/* ── Scene goto (from action runner) ────────────── */
bus.on('scene:goto', (id) => gotoScene(id));

/* ── Game selection (engine wiring) ─────────────── */

function selectGame(id) {
  const basePath = `games/${id}`;
  loader.setBasePath(basePath);
  Paths.basePath = basePath;
  gameSelector.hide();
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
    overlay.showTitle({ title: 'b\u00fcengine', subtitle: 'A point-and-click adventure' });
  }
}

/* ── Shared boot (manifest → inventory → scene) ─── */

/**
 * Common boot sequence for game:start and the preview ?scene deep link:
 * configure inventory capacity from the manifest, load item definitions,
 * announce them to the HUD, then enter the requested scene.
 * @param {string} sceneId scene to enter ('' → manifest.startScene)
 * @param {{ reset?: boolean, softFail?: boolean }} [opts]
 *   reset    – reset game state + inventory first (fresh game start)
 *   softFail – resolve silently when boot fails (editor-preview ?scene boot);
 *              otherwise fall back to gotoScene('intro')
 */
async function bootGame(sceneId, { reset = false, softFail = false } = {}) {
  if (reset) {
    state.reset();
    inventory.reset();
  }
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
        const pending = inventory.loadDefinitions(loader.basePath);
        if (softFail) await pending.catch(() => {});
        else await pending;
      }
    } else {
      await inventory.loadDefinitions(loader.basePath);
    }

    bus.emit('hud:inventory-enabled', inventory.enabled);
    await gotoScene(sceneId || manifest.startScene || 'intro');
  } catch {
    if (!softFail) await gotoScene('intro');
  }
}

/** Start a new game: reset state, load first scene. */
bus.on('game:start', () => bootGame('', { reset: true }));

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

/** Quit: return to the selector, unless this was launched from the local editor preview. */
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
  if (loader.isPreview && loader.assetMap) {
    window.close();
    return;
  }
  gameSelector.show();
});

/* ── Initial boot ───────────────────────────────── */
const _params = new URLSearchParams(location.search);
const _urlGame = _params.get('game');

if (_urlGame) {
  selectGame(_urlGame);
} else if (loader.isPreview && loader._cache.has('_game')) {
  // Editor preview of a local folder — no game ID needed.
  // Point the shared resolver at the editor asset blob URLs.
  if (loader.assetMap) { Paths.assetMap = loader.assetMap; }

  const _sceneParam = _params.get('scene');
  if (_sceneParam) {
    // "Run current scene" — skip title, jump straight into the scene
    bootGame(_sceneParam, { softFail: true });
  } else {
    showTitle();
  }
} else {
  gameSelector.show();
}
