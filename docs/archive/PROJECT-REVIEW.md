# büengine — Code Quality Review & Resurrection Plan

*Generated 2026-08-21 from a 4-way parallel subagent review (runtime core, runtime UI,
editor shell/file layer, heavy editor modules) plus orchestrator verification of all
critical findings. ~10.6k lines JS across `js/` (runtime) and `editor/js/` (editor).*

---

## 1. Overall health

The architecture is better than "vibecoded" suggests: EventBus decoupling holds (no
UI-module cross-imports), `js/action-schema.js` really is a shared single source of truth,
the runner's schema-driven dispatch is well designed, and all 50 JS files pass `node --check`.
No TODO/FIXME debt markers, only 3 console.* calls.

The problems are concentrated in four buckets:

1. **Async lifecycle bugs** — blocking transitions can deadlock the engine; goto races;
   one-microtask abort handshake.
2. **Copy-paste divergence** — path resolution ×4–5, context menu ×2, drag engine ×2,
   list editors ×2, selection cascade ×3, field-row builders ×2, modal singleton ×3.
3. **God modules** — `main.js` (450, four jobs), `properties.js` (922, five jobs),
   editor `state.js` (state + DOM + utils + domain mutations).
4. **Silent-maintenance traps** — hand-curated SW precache drifting out of sync,
   per-type switches in `renderers.js`, schema↔runner coupling via private method names.

---

## 2. Verified critical bugs (fix first)

All confirmed against source by the orchestrator, not just reported.

| # | Bug | Where | Effect |
|---|-----|-------|--------|
| B1 | Blocking fades rely solely on `transitionend`; a second consecutive fade-out (opacity already 0 → no transition runs) never fires it | `js/scene-renderer.js` `_applyEffect` (~184–209), `_applyFadeOut` (~500) | Engine hangs until next `abort()`. Add a `setTimeout(seconds*1000+50)` fallback race. |
| B2 | Scene-level `fade-out` leaves `opacity:0` on `el`; `render()` never resets it (only `clear()` does) | `scene-renderer.js` render vs clear | Next scene after fade-out→goto renders invisible unless scripted to fade-in. Reset opacity/transition at top of `render()`. |
| B3 | `encodeURIComponent(id)` encodes `/` → `items%2Fitems.json`; rejected by default Apache config | `js/script-loader.js:82`, called with slashed paths from `main.js:323/437` | Preview-mode item defs fail on some static servers. Encode per segment. Same encoding flaw blocks future nested scene paths (`foo/bar`). |
| B4 | Escape-pause toggles DOM directly without emitting anything on the bus | `js/overlay-ui.js:33-39` | Audio keeps playing, scripts keep running while paused. Route through bus (`overlay:pause` / resume event). |
| B5 | Object-interaction interrupt = `abort(); await Promise.resolve()` | `main.js:183-200` | Aborted chain can interleave with the new chain (double dialogue writes). Needs real completion handshake (generation token or abort-returning-promise). |
| B6 | Concurrent `gotoScene` calls race across `await loader.load()` | `main.js` gotoScene + fire-and-forget `scene:goto` | Loser's `onEnter` may run against wrong scene data. Add a scene epoch/generation counter checked after each await. |
| B7 | No loop/recursion guards: `{loop}` with never-flipping condition spins forever; recursive `run` grows frames unbounded | `js/action-runner.js` frame loop | Page hang with no error. Cap iterations / frame depth, throw a descriptive error. |
| B8 | Condition semantics inconsistent: unset flag is falsy for truthiness but `0` for comparisons; strict `==` after coercion makes `true == 1` false | `js/action-runner.js:335,366` | `"if": "score >= 1"` and `"if": "score"` disagree for unset flags — surprising for script authors. Pick one story, document in AGENTS.md. |

Secondary correctness items (lower urgency): sound fades via untracked 60fps `setInterval`
mutating possibly-detached elements (`sound-manager.js`); `blocking:true` + `loop:true`
silently degrades to fire-and-forget; audio "preload" is a no-op that creates and drops
`new Audio()` objects (`main.js:109-112`); dialogue `hide()` leaves `_onDone` dangling.

---

## 3. Structural debt (what makes changes hard)

### Runtime
- **`main.js` god module**: bootstrap + game-selector UI (built inline, violating the
  UI-component convention) + object-interaction policy + debug HUD + lifecycle. The
  inventory bootstrap block is copy-pasted between `game:start` and the `?scene` preview
  IIFE and has already diverged.
- **Encapsulation breaches**: direct reads of `loader._cache` (main.js:424); external
  assignment of `runner.sequences` / `runner.currentObjectId`.
- **Path resolution triplicated**: `ScriptLoader.resolvePath`, `SceneRenderer._resolve`,
  plus `_basePath`/`_assetMap` synced over two extra bus events. Same resolver fields +
  `_resolve()` also duplicated verbatim into sound-manager, notification-ui, inventory-ui.
- **Schema↔runner coupling** via private method-name strings (`engine.method: '_say'`);
  renaming silently breaks dispatch. Stale comment about a removed if/else chain in
  action-schema.js.
- **EventBus hardening needed eventually**: no error isolation (one throwing listener kills
  later ones), no `off` usage anywhere (fine today, matters when listeners become dynamic).
- Orphan bus events: `hud:charsheet`, `hud:settings` emitted with no listener (dead HUD
  buttons); `hud:show/hide`, `inventory:add/remove/open`, `overlay:title/pause` have exactly
  one listener each (fine, but the contract lives only in comments).
- Hardcoded UI-sound paths in 3 places (`__ui_dlg`, `__ui_btn`); animation timing coupled
  by magic numbers (JS 300ms setTimeout vs CSS 0.3s) while inventory.css uses `animationend`.

### Editor
- **SW precache drift (verified)**: missing from CORE_ASSETS: `js/app/recent-folders.js`,
  `js/confirm-dialog.js`, `js/editor-toolbar.js`, `js/section-header.js`,
  `js/sequence-editor.js`, `css/toolbars.css`. `cache.addAll` is atomic — one bad URL kills
  install; network-first fetch makes the curated list nearly pointless anyway.
- **`options-editor.js` ≈ `sequence-editor.js`**: ~80% identical incl. byte-for-byte
  `createActionsPill()`; both borrow `items-*` CSS classnames.
- **Two parallel drag engines**: `action-editor/drag.js` vs ~160 lines inside
  `renderers.js` (choice-option drag) — same clone/indicator/elementFromPoint/auto-scroll.
- **Three ad-hoc field stacks outside AE**: `properties.js::addEditablePropGroup` forked in
  `items-viewer.js` (fork exists because original lacks checkbox/select support);
  object inspector hand-rolls rows instead.
- **Cost of adding an action type: 4–6 sites** (schema, runner, renderActionBody switch,
  summarize switch, badges, forms special-case). Schema carries fields but no summary/badge
  templates — three parallel switches must stay in sync by hand.
- **Selection cascade ×3** in file-panel.js (already subtly divergent); save logic ×2 in
  workspace.js; image-path collection ×2 (workspace's inline copy already misses
  `show.texture` refs vs `state.collectImagePaths`); modal singleton pattern ×3;
  markdown renderer duplicated runtime/editor.
- **`properties.js` (922)** contains a ~250-line async media-metadata subsystem unrelated
  to inspecting. **Editor `state.js`** mixes pure state with domain mutations.
- **`sequences || definitions` fallback appears in 5 places** though script-loader already
  normalizes — mostly dead defensive code.
- Minor verified items: zip import doesn't sanitize entry paths (zip-slip-guard);
  `persistPreviewState` has no localStorage quota handling; unthrottled full
  `renderViewport()` per mousemove in resize.js; `loadNestedJson()` identical to
  `loadScript()`; editor script-loader name-collides with the runtime one.

---

## 4. Resurrection plan

Ordered so each phase removes friction for the next. Phases 1–3 are bug-fixing and can be
shipped independently; phases 4–6 are the malleability work. Functional gaps from the old
ENGINE-TODO.md / EDITOR-TODO.md (deleted) that still matter are folded in here directly:
preview-mode localStorage limits (item 26), nested-scene path loading (item 3),
audio autoplay gate and layer-model rework remain open engine-side design items not
covered by this quality pass.

### Phase 1 — Stop the bleeding (engine correctness)
1. transitionend fallback timer for every blocking fade (B1) — smallest diff, biggest hang-class win.
2. Reset scene opacity/transition in `SceneRenderer.render()` (B2).
3. Per-segment URL encoding in ScriptLoader.load (B3).
4. Loop/frame-depth guards in ActionRunner (B7).
5. Escape-pause goes through the bus; pause stops audio (B4).
6. Decide + document flag semantics for unset flags; make truthiness and comparison agree (B8).

### Phase 2 — Deterministic lifecycles
7. Generation token on scene transitions: bump epoch in `gotoScene`, check after every await (B6).
8. Replace the microtask abort handshake with an abort that returns a completion promise (B5).
9. Harden SoundManager: track/cancel fade intervals on stop; drop the fake audio preload in main.js.

### Phase 3 — De-duplicate shared primitives (runtime)
10. One asset-path resolver module; inject into renderer/sound/notification/inventory UIs;
    delete the `_assetMap` bus-sync hack.
11. Shared ContextMenu helper (object-options-ui + inventory-ui currently duplicate ~90%,
    including double global listeners).
12. Centralize UI sound constants in sound-manager; standardize exit animations on `animationend`.
13. Split main.js: `game-selector.js` (UI component), `bootstrap/wiring` stays, debug HUD out.
    Kill the copy-pasted inventory bootstrap.

### Phase 4 — Schema-driven everywhere (kills the N-sites problem)
14. Add `summary`/`badge` derivation to `js/action-schema.js` (or derive from `fields[0]`);
    delete the parallel switches in `renderers.js`.
15. Boot-time assertion: runner verifies every `engine.method` exists on itself; fix stale comment.
16. Merge the two `addEditablePropGroup`s into one field-row builder supporting
    text/number/checkbox/select/datalist; use it for the object inspector too.
17. Trust script-loader's normalization; delete the 5 scattered `|| definitions` fallbacks
    (keep exactly one normalization point).

### Phase 5 — Editor consolidation
18. Regenerate SW precache from disk (tiny buildless node script writing sw.js, or
    cache-on-demand only); fixes the 6 missing files permanently.
19. Merge options-editor + sequence-editor into one parameterized list-editor module.
20. Fold choice-option drag into `action-editor/drag.js`.
21. Extract media-metadata subsystem from properties.js into its own module.
22. Collapse file-panel's three selection functions into one `applySelection()`; extract
    `saveOne(id)` in workspace.js; keep only `state.collectImagePaths`.
23. Split editor state.js: pure state vs domain mutations (scene-actions/items-actions).
24. Hoist `actionViewerContext` construction to one place per selection.
25. Rename editor script-loader → script-store.js; dedupe loadNestedJson/loadScript.

### Phase 6 — Hardening & hygiene (as convenient)
26. Zip-slip guard in archive.js import; quota-aware persistPreviewState.
27. rAF-throttle viewport re-renders (resize.js, window resize).
28. Bus error isolation + dev-mode ambiguity warning in detectType.
29. Doc sweep: AGENTS.md architecture tree (editor.js role, section-header/editor-toolbar/
    sequence-editor missing), stale schema comments, dead HUD buttons (implement or remove),
    `CSS.escape` → proper URL encoding in url() strings.
30. Optional: a zero-config `eslint --no-eslintrc`-style syntax/lint gate runnable locally;
    keep the no-build promise (lint is dev-only tooling, not a build step).

### Explicitly NOT recommended
- Framework/bundler adoption — the static ES-module model is a feature and the codebase
  supports it fine.
- TypeScript migration — JSDoc annotations are already present and consistent; a
  `// @ts-check` pass would give 80% of the value with zero build step if ever wanted.
- Rewriting ActionRunner — the frame-stack design is good; it needs guards, not replacement.

## 5. Suggested working order

Phases 1–2 first (every fix is small, isolated, and eliminates the "engine randomly
freezes" class). Then Phase 3 item 13 (split main.js) unlocks comfortable work on
everything else. Phases 4–5 are where "add an action type" drops from 6 touch-points to 2.
Verify each phase in-browser (per project convention) before moving on.
