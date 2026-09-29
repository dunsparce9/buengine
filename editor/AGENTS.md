# büengine editor agent docs

The editor is a separate static app at `editor/index.html`. Root instructions also apply.

## Ownership and UI

- Keep editor JS under `editor/js/` and styles split by concern under `editor/css/`. Do not import runtime UI behavior.
- `app/` owns bootstrap, workspace/save flows, archives, preview, and PWA integration; `core/` owns state and mutations; `data/` owns file access and script loading; `panels/`, `ui/`, and `editors/` own presentation.
- Shared mutable state lives in `core/state.js`; use its `hooks` for cross-module rendering to avoid cycles. Keep entry modules thin.
- `action-editor.js` is the public AE entry; implementation lives in `action-editor/`. Derive action metadata and forms from the shared schema, and traversal/normalization from shared script helpers.
- Preserve Gruvbox Dark styling and tile-based object coordinates. Editor hints use `data-tooltip`, not native `title`; icon buttons need explicit `aria-label` values.

## Editing and persistence

- All disk operations go through `data/fs-provider.js` and the File System Access API. Edits stay in memory until Save; every persistent mutation marks its owner dirty and refreshes affected panes.
- Inspection is read-only. Missing action arrays remain drafts until edited; opening/closing editors must not normalize saved data.
- AE mutates arrays in place and reports changes through `onChange`. Preserve live references, nested branches, and cross-window drag behavior; reject moves into an action's descendants, including draft branches.
- Windows own models. Close affected windows on deletion/rename/replacement and all transient windows before workspace replacement/import. Async work retains its original workspace ownership.
- Scene renames update scene links; save new files and changed links before deleting old files. Preserve pending work after failure. Sequence renames update local references and retain aliases needed by shared inventory actions.
- Save affected edits before file moves/renames/replacements; invalidate affected caches and editors.
- Validate ZIP imports before writing; only STORE archives are supported. Report errors and reload after partial imports. Multi-file writes have no transactional rollback.
- Preview stages in-memory scripts/assets in `localStorage` for runtime `?preview`; do not save to disk as a side effect.

## Offline updates

- After editor web-asset, precached dependency, or worker changes, run `node editor/tools/generate-sw-precache.mjs` (root `npm run precache`). Add new shared imports to the generator's dependency list. Do not manually bump cache versions or edit generated release output.
- Keep the worker at its stable editor URL, caches scoped to its registration, and caching limited to known core assets. Preserve source network-first and release snapshot-first behavior.
- Never activate updates automatically during install. Activate/reload only when clean; protect dirty tabs from activation elsewhere and retry pending updates after successful saves. First-time worker control must not reload. Runtime previews remain outside the editor worker scope.

## Working rules

- No tests, browser automation, or CI steps; syntax checks are fine. The user verifies in-browser.
- Keep this file an operating guide. Update only durable editor constraints, ownership boundaries, or workflows; omit feature inventories and per-file trivia.
