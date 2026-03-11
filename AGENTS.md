---
description: Project-wide instructions for the büegame point-and-click game engine.
applyTo: "**"
---

# büegame — Agent Instructions

## Project Overview
büegame is a **static, browser-only, 2D point-and-click adventure game engine**. There is no server, no build step, no bundler — just ES modules served from files. Games are stored in `games/` as self-contained folders, each with its own JSON scripts and assets.

## Testing and verification
No testing, browser automation or CI steps (syntax checks are fine). The user handles in-browser verification.

## Architecture

```
index.html              ← single entry point (game selector + engine)
css/style.css           ← all styles
js/
  main.js               ← bootstrap, game selector, wires subsystems together
  event-bus.js           ← pub/sub decoupling
  game-state.js          ← flags, current scene, history
  script-loader.js       ← fetches & caches JSON scripts
  scene-renderer.js      ← background, scene objects, show/hide entity system
  action-schema.js       ← **shared** action type registry (fields, metadata, defaults)
  action-runner.js       ← walks action arrays, dispatches commands
  dialogue-ui.js         ← dialogue box with typewriter effect
  choice-ui.js           ← multiple-choice modal
  overlay-ui.js          ← title screen & pause menu
  sound-manager.js       ← audio playback, fade in/out
  inventory.js           ← inventory state, item definitions, add/remove
  inventory-ui.js        ← inventory floating window (grid/list), context menu
games/
  index.json             ← list of available game folder names
  playground/            ← example game (main testing ground, fleshed-out)
    _game.json           ← game manifest (title, startScene, inventory)
    intro.json           ← scene
    items/               ← item definitions
      items.json         ← array of item definition objects
    sounds/              ← audio assets
      common/            ← shared UI sounds (button-click, dialogue-click)
  lmaooo/                ← another game (tiny, just to test game picker system)
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
- `objects[]` — scene objects (clickable regions, decorative images, etc.) with `{ id, x, y, w, h, label?, texture?, visible?, z?, actions[] }`. `id` is unique within the scene; `x`, `y` are tile coordinates; `w`, `h` are tile counts. Optional `label` shows a tooltip on hover. Optional `texture` renders an image snapped to the grid. Optional `visible: false` starts the object hidden (can be revealed via `show` action or in `onEnter`). Optional `z` sets the CSS z-index for stacking control. Each click auto-increments the flag `{sceneId}.{id}.clicks`, so scripts can check click counts via conditions (e.g. `"if": "intro.beer.clicks >= 3"`) without manual `set` actions. (Legacy key `hotspots[]` is still accepted for backward compatibility.)
- `definitions` — `{ "name": [...actions] }` named action sequences callable via `{ "run": "name" }`. `run` expands them inline at that point in the action list, so blocking behavior still comes from the individual actions inside the definition. Supports recursion.
- `onEnter[]` — action array run when the scene is entered

### Action commands
Actions are objects in an array. Supported commands:
| Command | Example |
|---------|---------|
| Dialogue | `{ "say": "Hello!", "speaker": "Ada", "accent": "#f0c040" }` — optional `"delay": N` (seconds) locks input & hides advance hint for N seconds |
| Choice | `{ "choice": { "prompt": "...", "options": [{ "text": "...", "actions": [...] }] } }` |
| Scene change | `{ "goto": "scene_id" }` |
| Set flag | `{ "set": { "flag_name": true } }` |
| Increment flag | `{ "set": { "flag_name": "+1" } }` — string `"+N"` / `"-N"` adds to current value (init 0) |
| Increment (clamped) | `{ "set": { "flag_name": { "add": 1, "max": 5 } } }` — increment with optional `min`/`max` clamp |
| Conditional (bool) | `{ "if": "flag_name", "then": [...], "else": [...] }` — truthiness check |
| Conditional (cmp) | `{ "if": "flag_name >= 3", "then": [...], "else": [...] }` — numeric comparison (`==`, `!=`, `>`, `>=`, `<`, `<=`) |
| Loop | `{ "loop": "flag_name < 3", "do": [...] }` — repeats the nested actions while the condition stays true |
| Wait | `{ "wait": 500 }` |
| Custom event | `{ "emit": "event_name" }` |
| Run definition | `{ "run": "definition_name" }` — expands the definition inline; it is not its own blocking layer |
| Fork definition | `{ "fork": "definition_name" }` or `{ "fork": { "run": "definition_name" } }` — starts a detached background action chain. Use this for passive timed sequences (flashcards, fades, sound cues) that should continue while the main chain waits on dialogue/choice |
| Exit actions | `{ "exit": true }` |
| Show object | `{ "show": "object_id" }` — string shorthand to make a scene object visible. Use `"this"` to reference the object whose actions are running. Full form: `{ "show": { "id": "...", "texture": "...", "scaling": "fill", "z": 10, "effect": { "type": "fade-in", "seconds": 2, "blocking": false } } }` — if `id` matches a scene object, makes it visible; otherwise creates a fullscreen runtime overlay (requires `texture`) |
| Text block | `{ "text": { "id": "hud", "text": "**Hello**", "color": "#ffffff", "fontFamily": "Georgia, serif", "fontSize": "24px", "backgroundColor": "#101010", "position": { "anchor": "bottom-center", "x": "0%", "y": "5%" }, "effect": { "type": "fade-in", "seconds": 1, "blocking": false } } }` — creates a runtime text entity. Supports rudimentary markdown: `**bold**`, `*italics*`, `__underline__`, `~~strikethrough~~`. `position.x` / `position.y` accept percentages of the scene viewport; values without `%` are treated as grid coordinates and snapped to the current scene grid. Leaving `backgroundColor` empty keeps the text background transparent. `anchor` can be any of `top-left`, `top-center`, `top-right`, `middle-left`, `middle-center`, `middle-right`, `bottom-left`, `bottom-center`, `bottom-right` |
| Hide object | `{ "hide": "object_id" }` — string shorthand to hide a scene object. Use `"this"` for self-reference. Full form: `{ "hide": { "id": "...", "effect": { "type": "fade-out", "seconds": 1, "blocking": true } } }` — scene objects stay in DOM (can be re-shown); runtime image/text overlays are removed |
| Scene effect | `{ "effect": { "type": "fade-in", "seconds": 1, "blocking": false } }` — scene-level transition (fade-in / fade-out) |
| Play sound | `{ "playsound": { "id": "bgm", "path": "scripts/sounds/file.opus", "volume": 0.7, "fade": 1, "loop": true, "blocking": false } }` — `volume` (0–1, default 1), `fade` (seconds, default 0), `loop` (default false), `blocking` waits for fade-in to finish |
| Stop sound | `{ "stopsound": { "id": "bgm", "fade": 1, "blocking": true } }` — stops a playing sound by id; `fade` (seconds, default 0), `blocking` waits for fade-out to finish |
| Item add/remove | `{ "item": { "id": "key", "qty": 1 } }` — adds item to inventory (negative `qty` removes). Requires inventory enabled in `_game.json` |

### Inventory system

Configured per-game in `_game.json`:
- `"inventory": 12` — enables inventory with 12 slots
- `"inventory": 0` or omitted — inventory disabled (HUD button hidden)

Item definitions live in `items/items.json` inside each game folder. Each item:
```json
{
  "id": "seal",
  "name": "Seal",
  "icon": "images/items/seal.png",
  "stackable": false,
  "droppable": true,
  "options": [
    { "text": "Stare at", "icon": "👁️", "actions": [{ "say": "...", "speaker": "..." }] }
  ]
}
```

Scripts can check inventory via conditions: `"if": "items.key.qty >= 1"` (uses `items.<id>.qty` syntax in `if` blocks). Truthiness check `"if": "items.key.qty"` returns true if qty > 0.

The inventory UI is a draggable floating window with Grid and List display modes. Right-click items for defined options or Drop.

### Communication between modules
All modules communicate through `EventBus`. Never import one UI module from another — emit an event instead.

### DOM structure
All game UI lives inside `#game-container`. The `#scene-layer` holds backgrounds and scene objects. The `#ui-layer` holds overlays, dialogues, and choice modals, using `.hidden` class toggling.

## Coding Rules
1. **Vanilla JS only** — no frameworks, no dependencies.
2. **No 3D** — everything is 2D DOM-based.
3. **Keep scripts JSON** — don't embed JS logic in script files.
4. **Prefer events over imports** — use `bus.emit()` / `bus.on()` for cross-module communication.
5. When adding new action commands, add them to `ActionRunner.run()` and document them in this file's action table.
6. CSS lives in `css/style.css` — don't use inline styles in JS except for dynamic positioning (objects, images).
7. New UI components should follow the pattern: constructor takes `bus`, queries its own DOM elements, subscribes to relevant events.
