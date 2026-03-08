---
description: Project-wide instructions for the büegame point-and-click game engine.
applyTo: "**"
---

# büegame — Agent Instructions

## Project Overview
büegame is a **static, browser-only, 2D point-and-click adventure game engine**. There is no server, no build step, no bundler — just ES modules served from files. Games are stored in `games/` as self-contained folders, each with its own JSON scripts and assets.

## Architecture

```
index.html              ← single entry point (game selector + engine)
css/style.css           ← all styles
js/
  main.js               ← bootstrap, game selector, wires subsystems together
  event-bus.js           ← pub/sub decoupling
  game-state.js          ← flags, current scene, history
  script-loader.js       ← fetches & caches JSON scripts
  scene-renderer.js      ← background, hotspot DOM elements, image overlays
  action-runner.js       ← walks action arrays, dispatches commands
  dialogue-ui.js         ← dialogue box with typewriter effect
  choice-ui.js           ← multiple-choice modal
  overlay-ui.js          ← title screen & pause menu
  sound-manager.js       ← audio playback, fade in/out
games/
  index.json             ← list of available game folder names
  playground/            ← example game
    _game.json           ← game manifest (title, startScene)
    intro.json           ← scene
    sounds/              ← audio assets
      common/            ← shared UI sounds (button-click, dialogue-click)
  lmaooo/               ← another game
    ...
```

## Key Conventions

### No build tools
All JS is vanilla ES-module (`type="module"`). No TypeScript, no bundler. Keep it simple — a layperson should be able to open `index.html` from a local server.

### Script format
Scene scripts are JSON files in each game's folder (e.g. `games/playground/`). Each has:
- `id` — unique scene identifier (matches filename)
- `background` / `backgroundColor` — visual backdrop
- `grid` — `{ "cols": N, "rows": N }` tile grid dimensions (default 16×9)
- `hotspots[]` — clickable regions with `{ id, x, y, w, h, label?, texture?, actions[] }` where `id` is a unique identifier (within the scene), `x`, `y` are tile coordinates and `w`, `h` are tile counts. Optional `label` shows a tooltip on hover. Optional `texture` renders an image snapped to the grid. Each click auto-increments the flag `{sceneId}.{id}.clicks`, so scripts can check click counts via conditions (e.g. `"if": "intro.beer.clicks >= 3"`) without manual `set` actions.
- `definitions` — `{ "name": [...actions] }` named action sequences callable via `{ "run": "name" }`. Supports recursion.
- `onEnter[]` — action array run when the scene is entered

### Action commands
Actions are objects in an array. Supported commands:
| Command | Example |
|---------|---------|
| Dialogue | `{ "say": "Hello!", "speaker": "Ada" }` — optional `"delay": N` (seconds) locks input & hides advance hint for N seconds |
| Choice | `{ "choice": { "prompt": "...", "options": [{ "text": "...", "actions": [...] }] } }` |
| Scene change | `{ "goto": "scene_id" }` |
| Set flag | `{ "set": { "flag_name": true } }` |
| Increment flag | `{ "set": { "flag_name": "+1" } }` — string `"+N"` / `"-N"` adds to current value (init 0) |
| Increment (clamped) | `{ "set": { "flag_name": { "add": 1, "max": 5 } } }` — increment with optional `min`/`max` clamp |
| Conditional (bool) | `{ "if": "flag_name", "then": [...], "else": [...] }` — truthiness check |
| Conditional (cmp) | `{ "if": "flag_name >= 3", "then": [...], "else": [...] }` — numeric comparison (`==`, `!=`, `>`, `>=`, `<`, `<=`) |
| Wait | `{ "wait": 500 }` |
| Custom event | `{ "emit": "event_name" }` |
| Run definition | `{ "run": "definition_name" }` |
| Exit actions | `{ "exit": true }` |
| Scene effect | `{ "effect": { "type": "fade-in", "seconds": 1, "blocking": false } }` — scene-level transition (fade-in / fade-out) |
| Play sound | `{ "playsound": { "id": "bgm", "path": "scripts/sounds/file.opus", "volume": 0.7, "fade": 1, "loop": true, "blocking": false } }` — `volume` (0–1, default 1), `fade` (seconds, default 0), `loop` (default false), `blocking` waits for fade-in to finish |
| Stop sound | `{ "stopsound": { "id": "bgm", "fade": 1, "blocking": true } }` — stops a playing sound by id; `fade` (seconds, default 0), `blocking` waits for fade-out to finish |

### Communication between modules
All modules communicate through `EventBus`. Never import one UI module from another — emit an event instead.

### DOM structure
All game UI lives inside `#game-container`. The `#scene-layer` holds backgrounds and hotspots. The `#ui-layer` holds overlays, dialogues, and choice modals, using `.hidden` class toggling.

## Coding Rules
1. **Vanilla JS only** — no frameworks, no dependencies.
2. **No 3D** — everything is 2D DOM-based.
3. **Keep scripts JSON** — don't embed JS logic in script files.
4. **Prefer events over imports** — use `bus.emit()` / `bus.on()` for cross-module communication.
5. When adding new action commands, add them to `ActionRunner.run()` and document them in this file's action table.
6. CSS lives in `css/style.css` — don't use inline styles in JS except for dynamic positioning (hotspots, images).
7. New UI components should follow the pattern: constructor takes `bus`, queries its own DOM elements, subscribes to relevant events.
