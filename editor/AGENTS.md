---
description: Instructions for the büegame visual level editor.
applyTo: "editor/**"
---

# büegame Editor — Agent Instructions

## Overview
The editor is a **browser-only visual level editor** for büegame JSON scripts. It lives entirely inside `editor/` and is opened via `editor/index.html`. Like the game engine, there is no build step — just vanilla ES modules and static files.

It edits real folders on disk through the browser's File System Access API and keeps unsaved changes in memory until the user saves. The editor is a separate app from the runtime, but it intentionally shares the action schema with the engine.

## Testing and verification
No testing, no browser automation or CI steps (syntax checks are fine). The user handles in-browser verification.

## Architecture

```
editor/
  index.html              ← single entry point
  css/
    base.css              ← tokens, global resets, shared primitives
    layout.css            ← three-pane shell and sizing
    editor.css            ← high-level editor-specific styling
    file-panel.css        ← file tree visuals
    properties.css        ← inspector styling
    viewport.css          ← scene preview styling
    action-editor.css     ← Action Editor window + block styling
    floating-window.css   ← shared floating window chrome
    context-menu.css      ← menus
    items-viewer.css      ← inventory item editor
    menu.css              ← menu bar/dropdowns
    toast.css             ← toast notifications
  js/
    editor.js             ← thin entry module; imports app bootstrap
    app/
      index.js            ← editor bootstrap/wiring
      ui.js               ← title/menu visibility/about/toasts
      workspace.js        ← open folder + save flows
      archive.js          ← export/import JSON/ZIP flows
      preview.js          ← preview launch and asset URL staging
      pwa.js              ← install prompt + service worker update handling
    state.js              ← shared state, DOM refs, render hooks, utilities
    fs-provider.js        ← file system access via File System Access API
    zip-utils.js          ← minimal ZIP creation/extraction (no dependencies)
    floating-window.js    ← draggable/resizable floating panel component
    script-loader.js      ← fetch & cache JSON scripts (uses fs-provider)
    file-panel.js         ← left file tree panel + selection, DnD, context menu
    viewport.js           ← centre scene preview + object overlays
    properties.js         ← right property inspector panel
    context-menu.js       ← shared context menu component
    action-editor.js      ← stable public entry for AE
    action-editor/
      index.js            ← AE public implementation
      state.js            ← editor registry + drag state
      utils.js            ← nested value helpers + cleanup
      renderers.js        ← read-only action card renderers/summaries
      forms.js            ← schema-driven field editors + nested action editors
      drag.js             ← cross-window drag/reorder controller
    items-viewer.js       ← items/items.json editor UI
    confirm-dialog.js     ← modal confirmation dialog
    file-types.js         ← extension/kind/media helpers
    menu.js               ← top menu bar dropdown wiring
    resize.js             ← column resize handles
```

### Shared contract with runtime
- `../../js/action-schema.js` is the canonical action registry for both the engine and the editor.
- AE should derive labels, icons, colors, defaults, and editable fields from that shared schema.
- If an action type is added or changed, update:
  1. `js/action-runner.js` in the runtime
  2. `js/action-schema.js` shared metadata
  3. Any editor-specific rendering/editing logic in `editor/js/action-editor.js`

### File System

The editor operates exclusively via the **File System Access API** (`showDirectoryPicker()`). The user opens a local game folder, and the browser grants read/write access. All file operations (save, create, rename, delete, move) go through `fs-provider.js` which wraps `FileSystemDirectoryHandle` / `FileSystemFileHandle`.

Modules avoid circular imports by using a `hooks` object (in `state.js`) for cross-module render calls. The orchestrator (`editor.js`) sets `hooks.renderFileList`, `hooks.renderViewport`, `hooks.renderProperties`, `hooks.toast`, and `hooks.openFolder` after importing all modules.

## UI Layout

```
┌─ #menu-bar ─────────────────────────────────────┐
│ File  Help                           [▶ Run]    │
├──────────┬──────────────────────┬───────────────┤
│ #file-   │ #viewport            │ #props-panel  │
│ panel    │                      │               │
│          │   #viewport-scene    │ #props-content│
│ (folder  │   (bg + objects)     │ (key/value    │
│  tree)   │                      │  inspector)   │
└──────────┴──────────────────────┴───────────────┘
```

- **Left panel** (`#file-panel` / `#file-list`) — folder tree with expand/collapse, drag-to-move, drag-from-OS, right-click context menu.
- **Viewport** (`#viewport-scene`) — sized dynamically to preserve the scene grid aspect ratio; shows background image and object outlines.
- **Right panel** (`#props-panel` / `#props-content`) — property inspector. It edits `_game.json`, scene/object fields, inventory items, and opens AE for action arrays plus option-management modals for items/objects.
- **Resize handles** — two draggable column dividers between panels (CSS vars `--left-w`, `--right-w`).
- **Floating windows** (`.fw`) — reusable window system for AE, confirmation dialogs, about panel, and other transient tools.

## Key State Variables

All mutable state lives in the `state` object exported from `state.js`:

| Field | Purpose |
|----------|---------|
| `state.manifest` | Parsed `_game.json` |
| `state.scripts` | `{ id → parsed JSON }` — cache of all loaded scripts |
| `state.selectedId` | Currently highlighted script id in the file panel |
| `state.selectedObjectId` | Currently highlighted object id within the viewport |
| `state.selectedItem` | Currently selected inventory item when editing `items/items.json` |
| `state.dirtySet` | `Set` of script ids with unsaved edits |
| `state.rootHandle` | `FileSystemDirectoryHandle` from `showDirectoryPicker()` |
| `state.fileTree` | Recursive array of `{ name, path, type, handle?, children? }` |
| `state.expandedFolders` | `Set` of folder paths currently expanded in the tree (root = `''`) |
| `state.selectedPath` | Path of the selected item in the file tree |
| `state.assetURLCache` | `Map<path, blobURL>` — cached blob URLs for assets |

## Rendering Pipeline

Selection changes trigger a cascade: `selectScript(id)` → `renderFileList()` + `renderViewport()` + `renderProperties()`. Object clicks update `selectedObjectId` and re-render viewport + properties only.

The viewport computes pixel dimensions from the scene's `grid.cols` / `grid.rows` to maintain aspect ratio within the available container space. Objects are positioned as percentage offsets.

Most mutations follow the same pattern:
1. Change in-memory data under `state.scripts`
2. Call `markDirty(id)`
3. Re-render affected panes through hooks

Do not bypass that flow unless there is a clear reason.

## Action Editor (AE)

AE is the editor's action array UI rooted at `editor/js/action-editor.js` and implemented under `editor/js/action-editor/`. It is a central subsystem, not a minor helper.

- Opens floating windows for action arrays such as scene `onEnter`, object option actions, choice branches, loop bodies, and named `sequences`
- Deduplicates windows by title via an internal open-editor registry
- Mutates the provided action array in place and reports changes through `opts.onChange`
- Supports nested editors, inline field editing, add/delete, collapse, and drag-to-reorder
- Supports dragging actions between compatible open AE windows
- Uses shared schema metadata from `js/action-schema.js` for action cards and form generation

When editing AE-related code:
- Keep summaries, badges, and editor forms aligned with the shared schema
- Preserve in-place mutation semantics so calling modules keep live references
- Be careful with nested action arrays (`then`, `else`, `do`, choice option `actions`, sequences)
- Do not introduce a second source of truth for action defaults or labels

## Selection semantics

- Selecting a JSON script usually sets both `state.selectedPath` and `state.selectedId`
- Selecting a non-JSON asset sets `state.selectedPath` but clears `state.selectedId`
- Selecting an object within the viewport keeps the scene selected and sets `state.selectedObjectId`
- Selecting `items/items.json` routes properties rendering through `items-viewer.js`

## Features

| Feature | Module | Entry point |
|---------|--------|-------------|
| Open local folder | `fs-provider.js` | `openFolder()` — `showDirectoryPicker()`, scans tree |
| Save / Save All | `app/workspace.js` | `saveCurrentFile()` / `saveAllFiles()` — writes JSON to disk |
| Export ZIP | `app/archive.js` + `zip-utils.js` | `exportZip()` — packages all files into a downloadable ZIP |
| Import ZIP | `app/archive.js` + `zip-utils.js` | `importZip()` — extracts ZIP into the open folder |
| File tree | `file-panel.js` | `renderFileList()` — folder tree with expand/collapse, type icons |
| Drag-and-drop files | `file-panel.js` | Drop from OS to add files, drag within tree to move between folders |
| File context menu | `file-panel.js` | Right-click → Rename, Delete, Copy Path, Download, New File/Folder |
| Script discovery | `script-loader.js` | `discoverScripts()` — reads `_game.json`, loads all scenes |
| Scene preview | `viewport.js` | `renderViewport()` — background + dashed object outlines |
| Property inspector | `properties.js` | `renderProperties()` → delegates to game / scene / object / asset / items renderers |
| Editable fields | `properties.js` | `addEditablePropGroup()` — direct-bind `<input>` to in-memory data |
| Action Editor | `action-editor/` | `openActionEditor()` — floating action list editor for arrays |
| Items editor | `items-viewer.js` | `renderItemsProperties()` — inventory item editing |
| Export JSON | `app/archive.js` | `exportCurrentJson()` — Blob download of current script |
| Run preview | `app/preview.js` | Stores all edited scripts into `localStorage` key `buegame_editor_preview`, opens game in new tab with `?preview` |
| Floating windows | `floating-window.js` | `createFloatingWindow()` — draggable, optionally resizable panels (`.fw`) |
| Toast notifications | `app/ui.js` | `showToast(msg, type)` — bottom-center transient messages |
| Keyboard shortcuts | `app/index.js` | Ctrl+S (save), Ctrl+Shift+S (save all), Ctrl+O (open folder) |

## Coding Rules

1. **Same rules as the game engine** — vanilla JS, no frameworks, no build tools.
2. **Editor CSS stays in `editor/css/`** — use the existing split files by concern; do not dump everything into one stylesheet and do not touch `css/style.css` unless the runtime itself needs changes.
3. **Editor JS goes in `editor/js/`** — one file per concern. Shared state lives in `state.js`. Cross-module render calls go through `hooks` (set by the orchestrator `editor.js`) where that avoids cycles.
4. **Do not couple editor code to runtime UI modules** — the editor is a separate app. Shared logic should live in neutral modules like `js/action-schema.js`, not by importing runtime-only UI behavior.
5. **Colour palette** — the editor uses Gruvbox Dark (`#282828` bg, `#ebdbb2` fg, `#fe8019` accent, `#1d2021` panel bg, `#3c3836` borders). Keep new UI consistent.
6. **Object visualisation** — dashed orange outlines (`.editor-object`), yellow when selected. Labels are 10px overlays.
7. **Grid-aware positioning** — all object coordinates are in tile units. Convert to percentages (`tile / cols * 100%`) for CSS positioning.
8. **Preview round-trip** — edits stay in memory. The Run button serialises everything to `localStorage` under `buegame_editor_preview`. The game should check for this on `?preview` and overlay the data.
9. **HTML escaping** — use `escapeHtml()` (DOM-based) when injecting user-provided text. Never use `innerHTML` with raw script data.
10. **Dirty-state discipline** — any edit that changes persistent data should mark the relevant script dirty so Save / Save All remain trustworthy.
11. **AE changes are high-impact** — if you change action editing behavior, check nested arrays, drag/drop, and schema-derived field rendering, not just the top-level happy path.
