---
description: Instructions for the büegame visual level editor.
applyTo: "editor/**"
---

# büegame Editor — Agent Instructions

## Overview
The editor is a **browser-only visual level editor** for büegame JSON scripts. It lives entirely inside `editor/` and is opened via `editor/index.html`. Like the game engine, there is no build step — just vanilla ES modules and static files.

Current status: **v0.1 — Full file management with File System Access API**.

## Architecture

```
editor/
  index.html              ← single entry point
  css/editor.css          ← all editor styles (Gruvbox Dark palette)
  js/
    editor.js             ← orchestrator — wires modules, boots app
    state.js              ← shared state, DOM refs, render hooks, utilities
    fs-provider.js        ← file system abstraction (native FS + fetch fallback)
    zip-utils.js          ← minimal ZIP creation/extraction (no dependencies)
    floating-window.js    ← draggable/resizable floating panel component
    script-loader.js      ← fetch & cache JSON scripts (uses fs-provider)
    file-panel.js         ← left file tree panel + selection, DnD, context menu
    viewport.js           ← centre scene preview + hotspot overlays
    properties.js         ← right property inspector panel
    context-menu.js       ← shared context menu component
    action-viewer.js      ← action array viewer/editor floating window
    menu.js               ← top menu bar dropdown wiring
    resize.js             ← column resize handles
```

### Two file system modes

| Mode | Triggered by | Capabilities |
|------|-------------|----------------|
| **memory** (legacy) | `?game=playground` URL param | Read via `fetch()`, edits in-memory only. Flat script list. |
| **native** | File → Open Folder (File System Access API) | Full read/write to local disk. Complete folder tree. Drag-and-drop. Save/rename/delete. |

In **native mode**, the browser grants read/write access to a local game folder via `showDirectoryPicker()`. All file operations (save, create, rename, delete, move) go through `fs-provider.js` which wraps `FileSystemDirectoryHandle` / `FileSystemFileHandle`.

In **memory mode** (fallback), scripts are loaded via `fetch()` from `../games/{GAME_ID}/`. Edits stay in-memory. The file panel shows a flat list of loaded scripts plus an "Open Folder" button.

Modules avoid circular imports by using a `hooks` object (in `state.js`) for cross-module render calls. The orchestrator (`editor.js`) sets `hooks.renderFileList`, `hooks.renderViewport`, `hooks.renderProperties`, `hooks.toast`, and `hooks.openFolder` after importing all modules.

## UI Layout

```
┌─ #menu-bar ─────────────────────────────────────┐
│ File  Help                           [▶ Run]    │
├──────────┬──────────────────────┬───────────────┤
│ #file-   │ #viewport            │ #props-panel  │
│ panel    │                      │               │
│          │   #viewport-scene    │ #props-content│
│ (folder  │   (bg + hotspots)    │ (key/value    │
│  tree)   │                      │  inspector)   │
└──────────┴──────────────────────┴───────────────┘
```

- **Left panel** (`#file-panel` / `#file-list`) — folder tree (native mode) or flat script list (memory mode). Supports expand/collapse, drag-to-move, drag-from-OS, right-click context menu.
- **Viewport** (`#viewport-scene`) — sized dynamically to preserve the scene grid aspect ratio; shows background image and hotspot outlines.
- **Right panel** (`#props-panel` / `#props-content`) — property inspector. Read-only for scenes/hotspots; editable inputs for `_game.json` manifest fields.
- **Resize handles** — two draggable column dividers between panels (CSS vars `--left-w`, `--right-w`).

## Key State Variables

All mutable state lives in the `state` object exported from `state.js`:

| Field | Purpose |
|----------|---------|
| `state.manifest` | Parsed `_game.json` |
| `state.scripts` | `{ id → parsed JSON }` — cache of all loaded scripts |
| `state.selectedId` | Currently highlighted script id in the file panel |
| `state.selectedHs` | Currently highlighted hotspot id within the viewport |
| `state.dirtySet` | `Set` of script ids with unsaved edits |
| `state.fsMode` | `'memory'` (legacy fetch) or `'native'` (File System Access API) |
| `state.rootHandle` | `FileSystemDirectoryHandle` — only set in native mode |
| `state.fileTree` | Recursive array of `{ name, path, type, handle?, children? }` |
| `state.expandedFolders` | `Set` of folder paths currently expanded in the tree (root = `''`) |
| `state.selectedPath` | Path of the selected item in the file tree |
| `state.assetURLCache` | `Map<path, blobURL>` — cached blob URLs for native-mode assets |

## Rendering Pipeline

Selection changes trigger a cascade: `selectScript(id)` → `renderFileList()` + `renderViewport()` + `renderProperties()`. Hotspot clicks update `selectedHs` and re-render viewport + properties only.

The viewport computes pixel dimensions from the scene's `grid.cols` / `grid.rows` to maintain aspect ratio within the available container space. Hotspots are positioned as percentage offsets.

## Features

| Feature | Module | Entry point |
|---------|--------|-------------|
| Open local folder | `fs-provider.js` | `openFolder()` — `showDirectoryPicker()`, scans tree, enables native mode |
| Save / Save All | `editor.js` | `saveCurrentFile()` / `saveAllFiles()` — writes JSON to disk (native mode) |
| Export ZIP | `editor.js` + `zip-utils.js` | `exportZip()` — packages all files into a downloadable ZIP |
| Import ZIP | `editor.js` + `zip-utils.js` | `importZip()` — extracts ZIP into the open folder (native mode) |
| File tree | `file-panel.js` | `renderFileList()` — folder tree with expand/collapse, type icons |
| Drag-and-drop files | `file-panel.js` | Drop from OS to add files, drag within tree to move between folders |
| File context menu | `file-panel.js` | Right-click → Rename, Delete, Copy Path, Download, New File/Folder |
| Script discovery | `script-loader.js` | `discoverScripts()` — reads `_game.json`, loads all scenes |
| Scene preview | `viewport.js` | `renderViewport()` — background + dashed hotspot outlines |
| Property inspector | `properties.js` | `renderProperties()` → delegates to `renderGameProps` / `renderSceneProps` / `renderHotspotProps` |
| Editable fields | `properties.js` | `addEditablePropGroup()` — direct-bind `<input>` to in-memory data |
| Export JSON | `editor.js` | `exportCurrentJson()` — Blob download of current script |
| Run preview | `editor.js` | Stores all edited scripts into `localStorage` key `buegame_editor_preview`, opens game in new tab with `?preview` |
| Floating windows | `floating-window.js` | `createFloatingWindow()` — draggable, optionally resizable panels (`.fw`) |
| Toast notifications | `editor.js` | `showToast(msg, type)` — bottom-center transient messages |
| Keyboard shortcuts | `editor.js` | Ctrl+S (save), Ctrl+Shift+S (save all), Ctrl+O (open folder) |

## Coding Rules

1. **Same rules as the game engine** — vanilla JS, no frameworks, no build tools.
2. **Editor CSS goes in `editor/css/editor.css`** — do not touch `css/style.css` (that's the game).
3. **Editor JS goes in `editor/js/`** — one file per concern. Shared state lives in `state.js`. Cross-module render calls go through `hooks` (set by the orchestrator `editor.js`). Direct imports are fine for non-circular dependencies.
4. **Don't import game modules** — the editor is a separate app. It reads game scripts via `fs-provider.js` (native mode) or `fetch()` (memory mode), not by importing engine code.
5. **Colour palette** — the editor uses Gruvbox Dark (`#282828` bg, `#ebdbb2` fg, `#fe8019` accent, `#1d2021` panel bg, `#3c3836` borders). Keep new UI consistent.
6. **Hotspot visualisation** — dashed orange outlines (`.editor-hotspot`), yellow when selected. Labels are 10px overlays.
7. **Grid-aware positioning** — all hotspot coordinates are in tile units. Convert to percentages (`tile / cols * 100%`) for CSS positioning.
8. **Preview round-trip** — edits stay in memory. The Run button serialises everything to `localStorage` under `buegame_editor_preview`. The game should check for this on `?preview` and overlay the data.
9. **HTML escaping** — use `escapeHtml()` (DOM-based) when injecting user-provided text. Never use `innerHTML` with raw script data.
