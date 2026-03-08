---
description: Instructions for the büegame visual level editor.
applyTo: "editor/**"
---

# büegame Editor — Agent Instructions

## Overview
The editor is a **browser-only visual level editor** for büegame JSON scripts. It lives entirely inside `editor/` and is opened via `editor/index.html`. Like the game engine, there is no build step — just vanilla ES modules and static files.

Current status: **v0.0 — MVP (read-only inspector with limited `_game.json` editing)**.

## Architecture

```
editor/
  index.html          ← single entry point
  css/editor.css      ← all editor styles (Gruvbox Dark palette)
  js/editor.js        ← single monolithic module (all logic)
```

The editor loads scripts from `../scripts/` via `fetch()` and keeps them in an in-memory `scripts` map. It discovers available scenes via `_game.json` (`scenes` array or `startScene` fallback).

## UI Layout

```
┌─ #menu-bar ─────────────────────────────────────┐
│ File  Help                           [▶ Run]    │
├──────────┬──────────────────────┬───────────────┤
│ #file-   │ #viewport            │ #props-panel  │
│ panel    │                      │               │
│          │   #viewport-scene    │ #props-content│
│ (script  │   (bg + hotspots)    │ (key/value    │
│  list)   │                      │  inspector)   │
└──────────┴──────────────────────┴───────────────┘
```

- **Left panel** (`#file-panel` / `#file-list`) — clickable list of discovered scripts.
- **Viewport** (`#viewport-scene`) — sized dynamically to preserve the scene grid aspect ratio; shows background image and hotspot outlines.
- **Right panel** (`#props-panel` / `#props-content`) — property inspector. Read-only for scenes/hotspots; editable inputs for `_game.json` manifest fields.
- **Resize handles** — two draggable column dividers between panels (CSS vars `--left-w`, `--right-w`).

## Key State Variables

| Variable | Purpose |
|----------|---------|
| `manifest` | Parsed `_game.json` |
| `scripts` | `{ id → parsed JSON }` — cache of all loaded scripts |
| `selectedId` | Currently highlighted script id in the file panel |
| `selectedHs` | Currently highlighted hotspot id within the viewport |

## Rendering Pipeline

Selection changes trigger a cascade: `selectScript(id)` → `renderFileList()` + `renderViewport()` + `renderProperties()`. Hotspot clicks update `selectedHs` and re-render viewport + properties only.

The viewport computes pixel dimensions from the scene's `grid.cols` / `grid.rows` to maintain aspect ratio within the available container space. Hotspots are positioned as percentage offsets.

## Features

| Feature | Entry point |
|---------|-------------|
| Script discovery | `discoverScripts()` — reads `_game.json`, loads all scenes |
| Scene preview | `renderViewport()` — background + dashed hotspot outlines |
| Property inspector | `renderProperties()` → delegates to `renderGameProps` / `renderSceneProps` / `renderHotspotProps` |
| Editable fields | `addEditablePropGroup()` — direct-bind `<input>` to in-memory data |
| Export JSON | `exportCurrentJson()` — Blob download of current script |
| Run preview | Stores all edited scripts into `localStorage` key `buegame_editor_preview`, opens game in new tab with `?preview` |
| About modal | `#about-modal` with `.hidden` toggle |

## Coding Rules

1. **Same rules as the game engine** — vanilla JS, no frameworks, no build tools.
2. **Editor CSS goes in `editor/css/editor.css`** — do not touch `css/style.css` (that's the game).
3. **Editor JS goes in `editor/js/editor.js`** — currently a single module. If it grows large enough to split, follow the game's pattern: one file per concern, communicate via a shared event bus or direct imports (no global state beyond the existing top-level variables).
4. **Don't import game modules** — the editor is a separate app. It reads game scripts via `fetch()`, not by importing engine code.
5. **Colour palette** — the editor uses Gruvbox Dark (`#282828` bg, `#ebdbb2` fg, `#fe8019` accent, `#1d2021` panel bg, `#3c3836` borders). Keep new UI consistent.
6. **Hotspot visualisation** — dashed orange outlines (`.editor-hotspot`), yellow when selected. Labels are 10px overlays.
7. **Grid-aware positioning** — all hotspot coordinates are in tile units. Convert to percentages (`tile / cols * 100%`) for CSS positioning.
8. **Preview round-trip** — edits stay in memory. The Run button serialises everything to `localStorage` under `buegame_editor_preview`. The game should check for this on `?preview` and overlay the data.
9. **HTML escaping** — use `escapeHtml()` (DOM-based) when injecting user-provided text. Never use `innerHTML` with raw script data.
