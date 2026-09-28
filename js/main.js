import { EventBus }      from './core/event-bus.js';
import { GameState }     from './core/game-state.js';
import { ScriptLoader }  from './core/script-loader.js';
import { SceneRenderer } from './core/scene-renderer.js';
import { ActionRunner }  from './core/action-runner.js';
import { DialogueUI }    from './ui/dialogue-ui.js';
import { ChoiceUI }      from './ui/choice-ui.js';
import { OverlayUI }     from './ui/overlay-ui.js';
import { SoundManager }  from './core/sound-manager.js';
import { HudUI }         from './ui/hud-ui.js';
import { Inventory }       from './core/inventory.js';
import { InventoryUI }     from './ui/inventory-ui.js';
import { NotificationUI }  from './ui/notification-ui.js';
import { ObjectOptionsUI } from './ui/object-options-ui.js';
import { GameSelector }    from './ui/game-selector.js';
import { DebugHud }        from './ui/debug-hud.js';
import { Paths }           from './core/paths.js';
import { walkActions }     from './shared/script-data.js';

/* ── Bootstrap ──────────────────────────────────── */

const bus         = new EventBus();
const state       = new GameState();
const loader      = new ScriptLoader();        // basePath set by selectGame()
Paths.assetMap = loader.assetMap;
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
new InventoryUI(bus, inventory);
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
let transitionInProgress = false;
let interactionSerial = 0;

function reportEngineError(error) {
  console.error(error);
  bus.emit('notification:show', { title: 'Engine error', content: error.message || String(error) });
}
bus.on('engine:error', reportEngineError);

/**
 * Collect all `goto` scene IDs reachable from an action array (recursive).
 * @param {object[]} actions
 * @param {Set<string>} out
 */
function collectGotos(actions, out) {
  walkActions(actions, (action) => {
    if (action.goto) out.add(action.goto);
  });
}

function collectObjectGotos(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj.actions)) collectGotos(obj.actions, out);
  collectGotos(obj.onHover, out);
  if (Array.isArray(obj.options)) {
    for (const option of obj.options) collectGotos(option?.actions, out);
  }
}

function getSceneSequences(data) {
  return data?.sequences || {};
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

/** Walk a scene object and collect every string that looks like an image path. */
function collectAssetPaths(data) {
  const paths = new Set();
  (function walk(obj) {
    if (typeof obj === 'string') { if (IMAGE_EXT.test(obj)) paths.add(obj); return; }
    if (Array.isArray(obj)) { for (const item of obj) walk(item); return; }
    if (obj && typeof obj === 'object') { for (const v of Object.values(obj)) walk(v); }
  })(data);
  return paths;
}

/** Preload images referenced in a scene. Sounds load on demand. */
function preloadAssets(data) {
  const paths = collectAssetPaths(data);
  if (paths.size === 0) return Promise.resolve();
  return Promise.all([...paths].map(p => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = Paths.resolve(p);
    });
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

async function gotoScene(id, epoch = ++sceneEpoch) {
  transitionInProgress = true;
  try {
    await runner.abort();
    if (epoch !== sceneEpoch) return;
    const data = await loader.load(id);
    if (epoch !== sceneEpoch) return; // superseded by a newer transition
    await preloadAssets(data);
    if (epoch !== sceneEpoch) return; // superseded by a newer transition
    currentSceneData = data;
    runner.sequences = getSceneSequences(data);
    runner.currentObjectId = null;
    state.pushScene(id);
    bus.emit('overlay:clear');
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

    transitionInProgress = false;
    // Run the scene's entry actions, if any
    if (Array.isArray(data.onEnter) && epoch === sceneEpoch) {
      await runner.run(data.onEnter);
    }
  } finally {
    if (epoch === sceneEpoch) transitionInProgress = false;
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

/** All player interactions share the runner and the same interruption policy. */
async function runPlayerActions(actions, { object = null, interrupt = false, trackClick = true } = {}) {
  if (transitionInProgress || !currentSceneData) return;
  if (runner.running && (!interrupt || !actions?.length)) return;
  const serial = ++interactionSerial;
  const epoch = sceneEpoch;
  if (runner.running) await runner.abort();
  if (serial !== interactionSerial || epoch !== sceneEpoch || transitionInProgress) return;

  if (object && trackClick) trackObjectClick(object);
  if (!Array.isArray(actions)) return;
  runner.currentObjectId = object?.id || null;
  try {
    await runner.run(actions);
  } finally {
    if (serial === interactionSerial) runner.currentObjectId = null;
  }
}

function runObjectInteraction(obj, optionIndex = 0, interrupt = false) {
  const options = getObjectOptions(obj);
  if (options.length && !options[optionIndex]) return;
  const actions = options.length ? (options[optionIndex].actions || []) : obj?.actions;
  return runPlayerActions(actions, { object: obj, interrupt });
}

/* ── Player interactions ────────────────────────── */
bus.on('object:hover', obj => {
  if (!Array.isArray(obj.onHover) || !obj.onHover.length) return;
  runPlayerActions(obj.onHover, { object: obj, trackClick: false }).catch(reportEngineError);
});
bus.on('object:click', obj => {
  Promise.resolve(runObjectInteraction(obj)).catch(reportEngineError);
});
bus.on('object:option', ({ obj, index }) => {
  Promise.resolve(runObjectInteraction(obj, index, true)).catch(reportEngineError);
});
bus.on('inventory:interact', actions => {
  runPlayerActions(actions, { interrupt: true }).catch(reportEngineError);
});

bus.on('object:contextmenu', ({ obj, clientX, clientY }) => {
  const options = getObjectOptions(obj);
  if (!options.length) return;
  bus.emit('object-options:show', { obj, options, clientX, clientY });
});

/* ── Scene goto (from action runner) ────────────── */
bus.on('scene:goto', id => { gotoScene(id).catch(reportEngineError); });

/* ── Game selection (engine wiring) ─────────────── */

function selectGame(id) {
  const epoch = ++sceneEpoch;
  const basePath = `games/${id}`;
  loader.setBasePath(basePath);
  Paths.basePath = basePath;
  gameSelector.hide();
  showTitle(epoch);
}

/* ── Game lifecycle ─────────────────────────────── */

/** Load manifest and show title overlay (or skip straight to game). */
async function showTitle(epoch = sceneEpoch) {
  try {
    const manifest = await loader.load('_game');
    if (epoch !== sceneEpoch) return;
    if (manifest.skipTitleScreen) {
      bus.emit('game:start');
      return;
    }
    overlay.showTitle({ title: manifest.title, subtitle: manifest.subtitle });
  } catch (error) {
    if (epoch !== sceneEpoch) return;
    reportEngineError(error);
    overlay.showTitle({ title: 'b\u00fcengine', subtitle: 'A point-and-click adventure' });
  }
}

/* ── Shared boot (manifest → inventory → scene) ─── */

/**
 * Common boot sequence for game:start and the preview ?scene deep link:
 * configure inventory capacity from the manifest, load item definitions,
 * announce them to the HUD, then enter the requested scene.
 * @param {string} sceneId scene to enter ('' → manifest.startScene)
 * @param {{ reset?: boolean }} [opts]
 */
async function bootGame(sceneId, { reset = false } = {}) {
  const epoch = ++sceneEpoch;
  transitionInProgress = true;
  try {
    await runner.abort();
    if (epoch !== sceneEpoch) return;
    if (reset) {
      state.reset();
      inventory.reset();
    }
    const manifest = await loader.load('_game');
    if (epoch !== sceneEpoch) return;
    inventory.configure(manifest.inventory || 0);
    const defs = inventory.enabled ? await loader.load('items/items', { optional: true }) : [];
    if (epoch !== sceneEpoch) return;
    inventory.loadDefinitionsFromData(defs ?? []);
    bus.emit('hud:inventory-enabled', inventory.enabled);
    await gotoScene(sceneId || manifest.startScene || 'intro', epoch);
  } catch (error) {
    if (epoch === sceneEpoch) reportEngineError(error);
  } finally {
    if (epoch === sceneEpoch) transitionInProgress = false;
  }
}

/** Start a new game: reset state, load first scene. */
bus.on('game:start', () => bootGame('', { reset: true }));

/** Return to title screen. */
bus.on('game:title', () => {
  ++sceneEpoch;
  transitionInProgress = false;
  currentSceneData = null;
  runner.abort();
  overlay.hidePause();
  bus.emit('sound:stopall');
  scene.clear();
  hud.hide();
  showTitle();
});

/** Quit: return to the selector, unless this was launched from the local editor preview. */
bus.on('game:quit', () => {
  ++sceneEpoch;
  transitionInProgress = false;
  currentSceneData = null;
  runner.abort();
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
} else if (loader.isPreview && loader.has('_game')) {
  // Editor preview of a local folder — no game ID needed.
  const _sceneParam = _params.get('scene');
  if (_sceneParam) {
    // "Run current scene" — skip title, jump straight into the scene
    bootGame(_sceneParam);
  } else {
    showTitle();
  }
} else {
  gameSelector.show();
}
