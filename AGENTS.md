---
description: Project-wide instructions for the büeARG point-and-click game engine.
applyTo: "**"
---

# büeARG — Agent Instructions

## Project Overview
büeARG is a **static, browser-only, 2D point-and-click adventure game engine**. There is no server, no build step, no bundler — just ES modules served from files. The game is entirely data-driven by JSON "script" files in `scripts/`.

## Architecture

```
index.html              ← single entry point
css/style.css           ← all styles
js/
  main.js               ← bootstrap, wires subsystems together
  event-bus.js           ← pub/sub decoupling
  game-state.js          ← flags, current scene, history
  script-loader.js       ← fetches & caches JSON scripts
  scene-renderer.js      ← background + hotspot DOM elements
  action-runner.js       ← walks action arrays, dispatches commands
  dialogue-ui.js         ← dialogue box with typewriter effect
  choice-ui.js           ← multiple-choice modal
  overlay-ui.js          ← title screen & pause menu
scripts/
  _game.json             ← game manifest (title, startScene)
  intro.json             ← example scene
  hallway.json           ← example scene
```

## Key Conventions

### No build tools
All JS is vanilla ES-module (`type="module"`). No TypeScript, no bundler. Keep it simple — a layperson should be able to open `index.html` from a local server.

### Script format
Scene scripts are JSON files in `scripts/`. Each has:
- `id` — unique scene identifier (matches filename)
- `background` / `backgroundColor` — visual backdrop
- `grid` — `{ "cols": N, "rows": N }` tile grid dimensions (default 16×9)
- `hotspots[]` — clickable regions with `{ x, y, w, h, label, texture?, actions[] }` where `x`, `y` are tile coordinates and `w`, `h` are tile counts. Optional `texture` renders an image snapped to the grid.
- `definitions` — `{ "name": [...actions] }` named action sequences callable via `{ "run": "name" }`. Supports recursion.
- `onEnter[]` — action array run when the scene is entered

### Action commands
Actions are objects in an array. Supported commands:
| Command | Example |
|---------|---------|
| Dialogue | `{ "say": "Hello!", "speaker": "Ada" }` |
| Choice | `{ "choice": { "prompt": "...", "options": [{ "text": "...", "actions": [...] }] } }` |
| Scene change | `{ "goto": "scene_id" }` |
| Set flag | `{ "set": { "flag_name": true } }` |
| Conditional | `{ "if": "flag_name", "then": [...], "else": [...] }` |
| Wait | `{ "wait": 500 }` |
| Custom event | `{ "emit": "event_name" }` |
| Run definition | `{ "run": "definition_name" }` |
| Exit actions | `{ "exit": true }` |

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
