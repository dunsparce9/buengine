import { EventBus }      from './event-bus.js';
import { GameState }     from './game-state.js';
import { ScriptLoader }  from './script-loader.js';
import { SceneRenderer } from './scene-renderer.js';
import { ActionRunner }  from './action-runner.js';
import { DialogueUI }    from './dialogue-ui.js';
import { ChoiceUI }      from './choice-ui.js';
import { OverlayUI }     from './overlay-ui.js';

/* ── Bootstrap ──────────────────────────────────── */

const bus    = new EventBus();
const state  = new GameState();
const loader = new ScriptLoader('scripts');
const scene  = new SceneRenderer(document.getElementById('scene-layer'), bus);
const runner = new ActionRunner({ bus, state });

// UI subsystems (they self-register on the bus)
new DialogueUI(bus);
new ChoiceUI(bus);
const overlay = new OverlayUI(bus);

/** Currently loaded scene data keyed by id. */
let currentSceneData = null;

/* ── Scene navigation ───────────────────────────── */

async function gotoScene(id) {
  runner.abort();
  const data = await loader.load(id);
  currentSceneData = data;
  state.pushScene(id);
  scene.render(data);

  // Run the scene's entry actions, if any
  if (Array.isArray(data.onEnter)) {
    await runner.run(data.onEnter);
  }
}

/* ── Hotspot clicks → run attached actions ──────── */
bus.on('hotspot:click', async (hs) => {
  if (runner.running) return;
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
    overlay.showTitle({ title: 'büeARG', subtitle: 'A point-and-click adventure' });
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

/* ── Initial boot ───────────────────────────────── */
showTitle();
