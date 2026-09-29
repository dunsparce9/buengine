# büengine agent docs

büengine is a static, browser-only 2D point-and-click adventure engine.

## Core principles

- Vanilla JS and ES modules; no TypeScript, frameworks, browser dependencies, or backend.
- Source must work from a static server without installing dependencies. Node.js 22+ and esbuild are for optional release tooling (`npm run build`). Never edit generated `dist/` files.
- Games are self-contained folders under `games/`; `playground/` is the main example game.
- Runtime modules communicate through `EventBus`. UI emits events; it does not start action runners or import other UI classes. Shared helpers are fine.
- The editor is a separate app. Read `editor/AGENTS.md` for editor work; keep editor-only behavior under `editor/`.

## Ownership

- `js/main.js`: bootstrap, navigation, player interaction routing.
- `js/core/`: engine state, scripts, actions, rendering, animation, audio, inventory.
- `js/ui/`: player UI; `css/` contains styles split by concern.
- `js/shared/action-schema.js`: canonical action metadata, defaults, fields, summaries, badges.
- `js/shared/script-data.js`: shared JSON normalization and action traversal.
- Action changes must update runtime execution and the shared schema. Dispatch commands directly by type; do not add a second action language or duplicate registries.

## Runtime invariants

- Preserve runner unwinding, abort ownership, fork concurrency, and shared dialogue/choice queuing. Busy left-clicks/hover are ignored; menu interactions wait for interruption to finish.
- Report failures through `engine:error`; failed entry actions must not silently redirect.
- Pause freezes animations/audio fades. Cancellation releases blocking waits without firing natural-completion effects. Replacement affects only overlapping animation properties.
- Runtime poses must not mutate cached scene JSON. Scene re-entry resets geometry/opacity; hit regions follow transformed objects. Scene fades affect only the scene layer.
- Keep script units consistent: geometry in tiles, `wait` in milliseconds, fades/animation/dialogue delay in seconds. Preserve condition semantics and loop/recursion guards.

## Working rules

- No tests, browser automation, or CI steps. Syntax checks are fine; the user verifies in-browser.
- After changing editor web assets, precached shared dependencies (including the schema, script helpers, or `assets/images/seal.png`), or worker logic, run `node editor/tools/generate-sw-precache.mjs`.
- Keep agent docs small: durable constraints, ownership boundaries, and workflows only. No API catalogs, feature inventories, implementation trivia, or changelogs.
