---
description: Project-wide instructions for the büengine point-and-click game engine.
applyTo: "**"
---

# büengine — Agent Instructions

## Project Overview
büengine is a **static, browser-only, 2D point-and-click adventure game engine**. There is no server, no build step, no bundler — just ES modules served from files. Games are stored in `games/` as self-contained folders, each with its own JSON scripts and assets.

## Testing and verification
No testing, no browser automation or CI steps (syntax checks are fine). The user handles in-browser verification.

## Architecture

```
index.html              ← single entry point (game selector + engine)
css/style.css           ← import index for the split stylesheets in css/ (base, scene, dialogue, choice, overlay, hud, inventory, notifications, debug)
js/
  main.js               ← bootstrap, scene navigation, object-click routing, wires subsystems together
  event-bus.js           ← pub/sub decoupling
  game-state.js          ← flags, current scene, history
  script-loader.js       ← fetches & caches JSON scripts
  scene-renderer.js      ← background, scene objects, show/hide entity system
  action-schema.js       ← **shared** action type registry (fields, metadata, defaults)
  action-runner.js       ← walks action arrays, dispatches commands
  dialogue-ui.js         ← dialogue box with typewriter effect
  choice-ui.js           ← multiple-choice modal
  object-options-ui.js   ← scene-object right-click options menu
  overlay-ui.js          ← title screen & pause menu
  hud-ui.js              ← HUD taskbar (e.g. inventory button visibility)
  notification-ui.js     ← toast notifications
  sound-manager.js       ← audio playback, fade in/out
  inventory.js           ← inventory state, item definitions, add/remove
  inventory-ui.js        ← inventory floating window (grid/list), context menu
  paths.js               ← shared asset-path resolver (basePath + preview assetMap)
  context-menu.js        ← shared `.inv-ctx` context menu (buttons, separators, positioning)
  game-selector.js       ← game picker overlay UI
  debug-hud.js           ← debug HUD (key "1": grid overlay + tile/object readout)
editor/
  AGENTS.md              ← editor-specific instructions
games/
  index.json             ← list of available game folder names
  playground/            ← example game (main testing ground, fleshed-out)
    _game.json           ← game manifest (title, startScene, inventory)
    intro.json           ← scene (also abode.json, ending.json, ...)
    images/              ← scene/object/item artwork
    items/               ← item definitions
      items.json         ← array of item definition objects
    sounds/              ← audio assets (introbg.opus, objects/, common/)
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
- `background` / `backgroundColor` — visual backdrop (when both are set, the image wins and `backgroundColor` is ignored)
- `grid` — `{ "cols": N, "rows": N }` tile grid dimensions (default 16×9)
- `elements` — e.g. `"elements": ["hud"]` controls HUD visibility for the scene
- `objects[]` — scene objects (clickable regions, decorative images, etc.) with `{ id, x, y, w, h, label?, texture?, visible?, highlight?, cursor?, z?, options? }`. `id` is unique within the scene; `x`, `y` are tile coordinates; `w`, `h` are tile counts. Optional `label` shows a tooltip on hover. Optional `texture` renders an image snapped to the grid. Optional `visible: false` starts the object hidden (can be revealed via `show` action or in `onEnter`). Optional `highlight: false` disables the hover highlight (dashed border for plain objects, glow for textured objects). Optional `cursor` sets the CSS cursor on hover. Optional `z` sets the CSS z-index for stacking control. `options[]` uses the same shape as inventory item options: `{ text, icon?, actions[] }`. Left-click runs the first option; right-click opens the object options menu. Each executed object interaction auto-increments the flag `{sceneId}.{id}.clicks` **before** the actions run (so `clicks == 1` is true on the first click), so scripts can check repeat interactions via conditions (e.g. `"if": "intro.beer.clicks >= 3"`). Legacy object-level `actions[]` are still accepted for backward compatibility.
- `sequences` — `{ "name": [...actions] }` named action sequences callable via `{ "run": "name" }`. `run` expands them inline at that point in the action list, so blocking behavior still comes from the individual actions inside the sequence. Supports nesting/recursion up to the 64-frame guard (see below).
- `onEnter[]` — action array run when the scene is entered

### Runtime vs editor
- `js/` contains the runtime engine used by players.
- `editor/` is a separate static app used to inspect and edit game folders via the browser File System Access API.
- The runtime and editor intentionally share `js/action-schema.js` as the single source of truth for action metadata, defaults, labels, and field definitions.
- If an action type changes, update both the runtime execution path (`js/action-runner.js`) and the shared schema (`js/action-schema.js`) so the editor stays in sync automatically.

### Action commands
Actions are objects in an array. Supported commands:
| Command | Example |
|---------|---------|
| Dialogue | `{ "say": "Hello!", "speaker": "Ada", "accent": "#f0c040" }` — optional `"typewriterSpeed": N` (milliseconds per character, `0` = instant) and `"delay": N` (seconds) locks input & hides advance hint for N seconds |
| Choice | `{ "choice": { "prompt": "...", "options": [{ "text": "...", "actions": [...] }] } }` |
| Scene change | `{ "goto": "scene_id" }` |
| Set flag | `{ "set": { "flag_name": true } }` |
| Increment flag | `{ "set": { "flag_name": "+1" } }` — string `"+N"` / `"-N"` adds to current value (init 0) |
| Increment (clamped) | `{ "set": { "flag_name": { "add": 1, "max": 5 } } }` — increment with optional `min`/`max` clamp |
| Conditional (bool) | `{ "if": "flag_name", "then": [...], "else": [...] }` — truthiness check |
| Conditional (cmp) | `{ "if": "flag_name >= 3", "then": [...], "else": [...] }` — numeric comparison (`==`, `!=`, `>`, `>=`, `<`, `<=`) |
| Loop | `{ "loop": "flag_name < 3", "do": [...] }` — repeats the nested actions while the condition stays true (`then` is accepted as an alias for `do`) |
| Wait | `{ "wait": 500 }` — duration in **milliseconds** |
| Custom event | `{ "emit": "event_name" }` — optional `"payload"` is passed through to listeners |
| Run sequence | `{ "run": "sequence_name" }` — expands the sequence inline; it is not its own blocking layer |
| Fork sequence | `{ "fork": "sequence_name" }`, `{ "fork": { "run": "sequence_name" } }`, `{ "fork": { "actions": [...] } }`, or `{ "fork": [...] }` — starts a detached background action chain. Use this for passive timed sequences (flashcards, fades, sound cues) that should continue while the main chain waits on dialogue/choice |
| Exit actions | `{ "exit": true }` |
| Show object | `{ "show": "object_id" }` — string shorthand to make a scene object visible. Use `"this"` to reference the object whose actions are running. Full form: `{ "show": { "id": "...", "texture": "...", "layer": "overlay", "scaling": "fill", "z": 10, "effect": { "type": "fade-in", "seconds": 2, "blocking": false } } }` — if `id` matches a scene object, makes it visible; otherwise creates a runtime image/text entity. `layer: "background"` places it behind objects; `layer: "overlay"` places it above objects while still allowing clicks to pass through to scene objects underneath |
| Text block | `{ "text": { "id": "hud", "text": "**Hello**", "color": "#ffffff", "fontFamily": "Georgia, serif", "fontSize": "24px", "backgroundColor": "#101010", "position": { "anchor": "bottom-center", "x": "0%", "y": "5%" }, "effect": { "type": "fade-in", "seconds": 1, "blocking": false } } }` — creates a runtime text entity. Supports rudimentary markdown: `**bold**`, `*italics*`, `__underline__`, `~~strikethrough~~`. `position.x` / `position.y` accept percentages of the scene viewport; values without `%` are treated as grid coordinates and snapped to the current scene grid. Leaving `backgroundColor` empty keeps the text background transparent. `anchor` can be any of `top-left`, `top-center`, `top-right`, `middle-left`, `middle-center`, `middle-right`, `bottom-left`, `bottom-center`, `bottom-right` |
| Hide object | `{ "hide": "object_id" }` — string shorthand to hide a scene object. Use `"this"` for self-reference. Full form: `{ "hide": { "id": "...", "effect": { "type": "fade-out", "seconds": 1, "blocking": true } } }` — scene objects stay in DOM (can be re-shown); runtime image/text overlays are removed |
| Scene effect | `{ "effect": { "type": "fade-in", "seconds": 1, "blocking": false } }` — scene-level transition (fade-in / fade-out) |
| Play sound | `{ "playsound": { "id": "bgm", "path": "sounds/file.opus", "volume": 0.7, "fade": 1, "loop": true, "blocking": false } }` — `path` is game-relative (e.g. `"sounds/introbg.opus"`). `volume` (0–1, default 1), `fade` (seconds, default 0), `loop` (default false), `blocking` waits for fade-in to finish — or, when `fade` is 0 and `loop` is false, for playback to end |
| Stop sound | `{ "stopsound": { "id": "bgm", "fade": 1, "blocking": true } }` — stops a playing sound by id; `fade` (seconds, default 0), `blocking` waits for fade-out to finish |
| Item add/remove | `{ "item": { "id": "key", "qty": 1 } }` — adds item to inventory (negative `qty` removes). Requires inventory enabled in `_game.json` |

**Condition semantics & safety guards:** Unset flags read as numeric `0` everywhere. Plain truthiness checks (`"if": "flag"`) treat unset or `0` as false. In comparisons (`==`, `!=`, `>`, `>=`, `<`, `<=`) operands are coerced with `Number()`, so booleans become `1`/`0` (`true == 1` is true); only when *both* sides are non-numeric strings do they compare lexicographically, and if either side coerces to `NaN` the comparison is false. Two guards prevent hangs: a `loop` whose condition never flips throws an Error after **10,000 iterations**, and frame nesting reaching **64 frames** (e.g. runaway recursive `{ "run": ... }`) throws an Error about recursive sequence expansion — both name the scene/condition where they fired.

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

The inventory UI is a draggable floating window with Grid and List display modes. Right-click items for defined options or Drop (Drop is hidden when the item sets `"droppable": false`).

### Communication between modules
Runtime behavior flows over `EventBus`. UI modules never import each other's classes — but they may import shared helpers (`paths.js`, `context-menu.js`, `action-schema.js`, `UI_SOUNDS` from `sound-manager.js`). Prefer `bus.emit()` / `bus.on()` for cross-module behavior.

### DOM structure
All game UI lives inside `#game-container`. The `#scene-layer` holds backgrounds and scene objects. The `#ui-layer` holds overlays, dialogues, and choice modals, using `.hidden` class toggling.

## Editor

The editor has its own separate instructions at `editor/AGENTS.md`. Refer to this file for editor-specific keywords: "editor:", "AE", "menubar", "panels" etc.

## Coding Rules

1. **Vanilla JS only** — no frameworks, no dependencies.
2. **Prefer events over imports** — use `bus.emit()` / `bus.on()` for cross-module communication.
3. New UI components should follow the pattern: most take `bus`, query their own DOM elements, and subscribe to relevant events (a few take extra/different deps — e.g. `InventoryUI(bus, inventory, runner)`, `GameSelector(onSelect)`, `DebugHud(getSceneData)`).
4. Editor-only code lives under `editor/` and should not be bolted into runtime modules unless the feature is genuinely shared.
5. Shared action metadata belongs in `js/action-schema.js`; do not fork separate action registries for engine vs editor. Summaries and header badges are derived there too (`summarizeAction`/`getBadges`) — the editor delegates instead of keeping parallel switches.
6. Update this file (`buengine/AGENTS.md`) after significant **engine-side** changes if necessary. **If editor-side, remember editor has its own `editor/AGENTS.md`!**
