---
description: Instructions for the büengine visual level editor.
applyTo: "editor/**"
---

# büengine Editor

## Overview
A visual level editor for büengine games. It lives entirely inside `editor/` and is opened via `editor/index.html`. Like the game engine, there is no build step — just vanilla ES modules and static files.

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
    editor.css            ← `@import` aggregator for the other stylesheets (no rules of its own)
    toolbars.css          ← editor toolbar styling
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
      index.js            ← bootstrap/wiring, menu/resize/shortcuts
      ui.js               ← title/menu visibility/about/toasts
      workspace.js        ← open folder + save flows
      archive.js          ← export/import JSON/ZIP flows
      preview.js          ← preview launch and asset URL staging
      pwa.js              ← install prompt + service worker updates
      recent-folders.js   ← recent-folder IDB bookkeeping
    core/
      state.js            ← shared state, DOM refs, render hooks, read-only queries
      scene-actions.js    ← scene/object mutations and rename links
      items-actions.js    ← inventory-item mutations
      action-context.js   ← Action Editor viewer contexts + focusScene helper
    data/
      fs-provider.js      ← File System Access API wrapper
      script-store.js     ← JSON discovery/loading/cache; single loadScript for all paths
      file-types.js       ← extension/kind/media helpers
      zip-utils.js        ← minimal ZIP creation/extraction
    panels/
      file-panel.js       ← file tree, selection cascade, drag/drop, context menu
      viewport.js         ← scene preview + object overlays
      properties.js       ← property inspector and renderer routing
      items-viewer.js     ← inventory item editor UI
      media-info.js       ← asset inspector + media metadata
    ui/
      floating-window.js  ← draggable/resizable floating panels
      field-rows.js       ← shared inspector field-row builders
      section-header.js   ← collapsible inspector section headers
      editor-toolbar.js   ← reusable editor toolbar
      context-menu.js     ← shared editor context menu
      confirm-dialog.js   ← confirmation modal
      menu.js             ← menu bar/dropdown wiring
      resize.js           ← column resize handles
    editors/
      list-editor.js      ← parameterized table-list modal
      options-editor.js   ← item/object options adapter over list-editor
      sequence-editor.js  ← scene sequences adapter over list-editor
    action-editor.js      ← stable public entry, re-exports action-editor/index.js
    action-editor/
      index.js            ← AE implementation
      state.js            ← editor/list registries
      utils.js            ← nested value helpers + change notifications
      renderers.js        ← action cards; summaries/badges come from shared schema
      forms.js            ← schema-driven fields + nested action editors
      drag.js             ← cross-window action drag + shared reorder engine
  tools/
    generate-sw-precache.mjs ← dev-only script regenerating sw.js CORE_ASSETS
```

### Shared contract with runtime
- `js/shared/script-data.js` shares legacy sequence normalization and inline action traversal with the runtime.
- `js/shared/action-schema.js` is the canonical action registry for both the engine and the editor.
- AE should derive labels, icons, colors, defaults, summaries, badges, and editable fields from that shared schema.
- If an action type is added or changed, update:
  1. `js/core/action-runner.js` in the runtime
  2. `js/shared/action-schema.js` shared metadata (including `summary`/`badges`)
  3. Any editor-specific rendering/editing logic under `editor/js/action-editor/` (rich card bodies and nested editors only — summaries/badges follow the schema automatically; `action-editor.js` itself is just a re-export of `openActionEditor`)

### File System

The editor operates exclusively via the **File System Access API** (`showDirectoryPicker()`). The user opens a local game folder, and the browser grants read/write access. All file operations (save, create, rename, delete, move) go through `data/fs-provider.js` which wraps `FileSystemDirectoryHandle` / `FileSystemFileHandle`.

Modules avoid circular imports by using a `hooks` object (in `core/state.js`) for cross-module render calls. The orchestrator (`js/app/index.js` — `js/editor.js` is just a thin `import './app/index.js'`) sets `hooks.renderFileList`, `hooks.renderViewport`, and `hooks.renderProperties`; `app/ui.js` sets `hooks.updateWindowTitle` and `hooks.toast`; `app/workspace.js` sets `hooks.openFolder`.

## UI Layout

```
┌─ #menu-bar ─────────────────────────────────────┐
│ File  Run  Help                      [▶ Run]    │
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

All mutable state lives in the `state` object exported from `core/state.js`:

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
| `state.pendingScriptRenames` | `Map` backing the scene-id rename flow |

## Rendering Pipeline

Selection changes trigger a cascade: `applySelection()` in panels/file-panel.js → `renderFileList()` + `renderViewport()` + `renderProperties()` (`selectScript(id)` / `selectPath(path)` are thin wrappers). Object clicks update `selectedObjectId` and re-render viewport + properties only.

The viewport computes pixel dimensions from the scene's `grid.cols` / `grid.rows` to maintain aspect ratio within the available container space. Objects are positioned as percentage offsets.

Most mutations follow the same pattern:
1. Change in-memory data under `state.scripts`
2. Call `markDirty(id)`
3. Re-render affected panes through hooks

Do not bypass that flow unless there is a clear reason.

## Action Editor (AE)

AE is the editor's action array UI with stable entry `editor/js/action-editor.js` (a re-export) and implementation under `editor/js/action-editor/`. It is a central subsystem, not a minor helper.

- Opens floating windows for action arrays such as scene `onEnter`, object option actions, choice branches, loop bodies, and named `sequences`
- Deduplicates windows via internal open-editor registry; transient Action Editor and list windows destroy their DOM when closed
- Mutates the provided action array in place and reports changes through `opts.onChange`
- Supports nested editors, inline field editing, add/delete, collapse, and drag-to-reorder
- Supports dragging actions between compatible open AE windows
- Uses shared schema metadata from `js/shared/action-schema.js` for action cards and form generation

When editing AE-related code:
- Keep summaries, badges, and editor forms aligned with the shared schema
- Preserve in-place mutation semantics so calling modules keep live references
- Be careful with nested action arrays (`then`, `else`, `do`, choice option `actions`, sequences)
- Do not introduce a second source of truth for action defaults or labels

### Editing lifecycle and persistence

- Inspection is read-only. `openActionField()` keeps missing arrays as drafts until the first edit; rendering or clicking Edit/Done must not normalize saved data.
- Floating windows own a model. Close affected windows on deletion/rename/replacement, and close all transient windows before workspace replacement or import. Async loads and writes must retain their original workspace ownership.
- Reject action moves into their own descendants, including unattached draft branches.
- Scene renames update `goto`, `startScene`, and manifest scene links across loaded JSON. Save groups pending renames: write new scenes and changed links before deleting old scene files; preserve pending work after failure.
- Sequence renames update local `run`/`fork` references. Shared inventory references retain an old-name compatibility alias in the renamed scene because item sequence lookup depends on the active scene.
- File moves/renames/replacements require affected edits to be saved first, and invalidate affected script/asset caches and editors.
- ZIP import supports uncompressed STORE archives only. Validate before writing and report unsupported formats, invalid archives, and I/O errors. Reload after partial imports; multi-file saving/import does not provide transactional rollback.

## Selection semantics

- Selecting a JSON script usually sets both `state.selectedPath` and `state.selectedId`
- Selecting a non-JSON asset sets `state.selectedPath` but clears `state.selectedId`
- Selecting an object within the viewport keeps the scene selected and sets `state.selectedObjectId`
- Selecting `items/items.json` routes properties rendering through `panels/items-viewer.js` (the router keys off the data being an array, not the literal path)

## Features

| Feature | Module | Entry point |
|---------|--------|-------------|
| Open local folder | `data/fs-provider.js` | `openFolder()` — `showDirectoryPicker()`, scans tree |
| Save / Save All | `app/workspace.js` | `saveCurrentFile()` / `saveAllFiles()` — writes JSON to disk |
| Export ZIP | `app/archive.js` + `data/zip-utils.js` | `exportZip()` — packages all files into a downloadable ZIP |
| Import ZIP | `app/archive.js` + `data/zip-utils.js` | `importZip()` — extracts ZIP into the open folder |
| File tree | `panels/file-panel.js` | `renderFileList()` — folder tree with expand/collapse, type icons |
| Drag-and-drop files | `panels/file-panel.js` | Drop from OS to add files, drag within tree to move between folders |
| File context menu | `panels/file-panel.js` | Right-click file → Rename, Copy Path, Download, Delete; folders/root also offer New File/Folder (plus Paste on folders) |
| Script discovery | `data/script-store.js` | `discoverScripts()` — reads `_game.json`, loads top-level `*.json` scenes + `items/items` (single `loadScript`, no `loadNestedJson`) |
| Scene preview | `panels/viewport.js` | `renderViewport()` — background + dashed object outlines |
| Property inspector | `panels/properties.js` | `renderProperties()` → delegates to game / scene / object / asset / items renderers |
| Editable fields | `ui/field-rows.js` | `addEditablePropGroup()` — shared text/number/checkbox/select/datalist rows binding `<input>` to in-memory data |
| Action Editor | `action-editor/` | `openActionEditor()` — floating action list editor for arrays |
| Items editor | `panels/items-viewer.js` | `renderItemsProperties()` — inventory item editing |
| Export JSON | `app/archive.js` | `exportCurrentJson()` — Blob download of current script |
| Run preview | `app/preview.js` | Serialises edited scripts to `localStorage` (`buengine_editor_preview` + staged-asset key `buengine_editor_assets`), opens game in new tab with `?preview` (`runCurrentScene()` adds `&scene=` for the current scene) |
| Floating windows | `ui/floating-window.js` | `createFloatingWindow()` — draggable, optionally resizable panels (`.fw`) |
| Toast notifications | `app/ui.js` | `showToast(msg, type)` — bottom-center transient messages |
| Keyboard shortcuts | `app/index.js` | Ctrl+S (save), Ctrl+Shift+S (save all), Ctrl+O (open folder), Delete (delete selected object) |

## Coding Rules

1. **Same rules as the game engine** — vanilla JS, no frameworks, no build tools.
2. **Editor CSS stays in `editor/css/`** — use the existing split files by concern; do not dump everything into one stylesheet and do not touch `css/style.css` unless the runtime itself needs changes.
3. **Editor JS goes in `editor/js/`** — one file per concern, grouped into `core/`, `data/`, `panels/`, `ui/`, `editors/`, `app/`, and `action-editor/`. Keep the entry modules at the root. Shared state lives in `core/state.js`. Cross-module render calls go through `hooks` (set by the orchestrator `app/index.js`) where that avoids cycles.
4. **Do not couple editor code to runtime UI modules** — the editor is a separate app. Shared logic should live in neutral modules like `js/shared/action-schema.js`, not by importing runtime-only UI behavior.
5. **Colour palette** — the editor uses Gruvbox Dark (`#282828` bg, `#ebdbb2` fg, `#fe8019` accent, `#1d2021` panel bg, `#3c3836` borders). Keep new UI consistent.
6. **Object visualisation** — dashed orange outlines (`.editor-object`), yellow when selected. Labels are 10px overlays.
7. **Grid-aware positioning** — all object coordinates are in tile units. Convert to percentages (`tile / cols * 100%`) for CSS positioning.
8. **Preview round-trip** — edits stay in memory. The Run button serialises everything to `localStorage` (`buengine_editor_preview` for scripts, `buengine_editor_assets` for staged assets). The game checks for these on `?preview` and overlays the data.
9. **Dirty-state discipline** — any edit that changes persistent data should mark the relevant script dirty so Save / Save All remain trustworthy.
10. **AE changes are high-impact** — if you change action editing behavior, check nested arrays, drag/drop, and schema-derived field rendering, not just the top-level happy path.
11. **Offline dependencies** — `tools/generate-sw-precache.mjs` includes editor files and the shared `js/shared/action-schema.js` / `js/shared/script-data.js` modules. Update its shared list when introducing another cross-app import.
12. **Agent documentation updates** - Update this file (`editor/AGENTS.md`) after significant or otherwise notable changes, as deemed necessary.
