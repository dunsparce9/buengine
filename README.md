## büengine!

Simple 2D point-and-click story engine & level editor.

### Building

Fully static website, no build steps.

### Source layout

- `js/main.js` — runtime entry point.
- `js/core/` — engine services, state, action execution, rendering, audio, and inventory.
- `js/ui/` — game UI components.
- `js/shared/` — action schema and script helpers used by runtime and editor.
- `editor/js/app/` — editor bootstrap, workspace, previews, and app lifecycle.
- `editor/js/core/` and `editor/js/data/` — editor state/mutations and file handling.
- `editor/js/panels/` and `editor/js/ui/` — editor panes and reusable UI components.
- `editor/js/editors/` and `editor/js/action-editor/` — list editors and Action Editor.
- `editor/tools/` — optional maintenance scripts.
- `games/` — self-contained game scripts and assets.

Both HTML entry points stay unchanged. After adding or moving editor modules, refresh
its offline asset list with `node editor/tools/generate-sw-precache.mjs`.

### Contributions

Every PR must include proof of beer: max 10 MB JPG showcasing one (1) standard can of beer that was consumed during PR creation.
