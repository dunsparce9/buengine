# KISS review — 2026-09-28

The static ES-module architecture is still a good fit. The drift is concentrated
in execution indirection, duplicated knowledge of the JSON format, and lifecycle
ownership. File count alone is a poor measure of simplicity: merging the editor
into a few huge files would make changes harder to reason about.

This review covers the runtime, editor bootstrap and persistence, scene viewport,
property inspector, Action Editor, floating windows, and shared format/schema.
Findings below are from source inspection, not browser reproduction. Verification
is limited to JavaScript syntax checks and diff inspection, per AGENTS.md.

## Changes made

| Area | Simplification | Behavior retained or corrected |
| --- | --- | --- |
| Runtime dispatch | Replace schema `engine.kind`/`engine.method`/argument descriptors and their assertion layer with a direct switch in ActionRunner. | Same commands, detection precedence, blocking calls, branching, loop/recursion guards, sequences, and forks. Editor metadata remains shared. |
| JSON format | Put legacy sequence normalization and inline action traversal in `js/shared/script-data.js`. | Runtime and editor use the same normalization. Image discovery now includes inline forks in scenes and item options. Named sequences are scanned separately, not recursively expanded by the walker. |
| Object interactions | Select option or legacy actions once, then use one execution path. | Left-click gating, right-click interruption, first-option selection, click counters, and `this` context. |
| Scene lifecycle | Await abort completion; publish scene state after loading/preloading; remove the stale onEnter completion's abort. Invalidate pending scene loads on title/quit. | An older transition cannot abort a newer scene's runner after its own entry actions unwind. |
| Asset paths and loading | Use Paths for preloading; remove the loader's duplicate asset resolver and the audio branches that did no preloading. Replace cache on game selection and capture it per fetch. | Preview asset URLs are initialized for both local preview and preview with a game ID. Old fetches cannot populate the next game's cache. |
| Action Editor state | Export the three actual registries; keep action-drag state in its controller. | Deduplication, inline-list registration, empty drop zones, and cross-window dragging; remove a layer of one-line accessors. |
| Floating windows | Destroy transient editors, list windows, and dismissed pickers/dialogs when closed. Consume close callbacks before invoking them. | Animations and window deduplication remain; closed windows no longer accumulate hidden DOM. Recursive close/destroy callbacks are avoided. About remains reusable. |
| Editor persistence | Reuse findNode for selection restoration and one file writer for text/binary; serialize scripts directly for preview. | Same save, file lookup, and preview payloads. |
| Completion handling | Use the existing transition timeout fallback for entity fade-in; consume the dialogue completion callback. | Blocking fades can finish when no transition event occurs; completed dialogue callbacks are not retained. |
| Offline editor | Precache the two shared modules and update the generator and cache version. | Shared imports are available on a fresh offline editor installation. |

No dependencies, build step, game-script migration, or new UI flows were added.

## Follow-up fixes — all seven risk areas addressed

### 1. Action-chain ownership

Player actions now go through one main.js policy: regular object clicks keep the
busy gate, while right-click and inventory interactions interrupt after awaiting
abort. Generation checks discard superseded interaction requests and game boots.
A runner rejects overlapping runs and stays running until finally. Choice branches
now use its existing frame stack, retaining branch-scoped exit behavior and making
the depth guard cover choices too. Forked runners share a small FIFO for interactive
prompts; abort removes only the cancelling chain's queued/active prompt. Passive
fork actions remain concurrent. Cancellable waits consume their callback and
clear wait timers instead of retaining stale resolvers.

### 2. Audio lifecycle

Each sound entry owns one completion callback, released once on stop, replacement,
end, or error. Cancelling a fade only cancels its timer. Natural stop-fade completion
removes the sound explicitly. Pause freezes fade progress and new sounds defer
playback until resume. Stale playback promises cannot affect resumed/replaced
entries, and UI sound preloads refresh when resolved game/preview URLs change.

### 3. Detached editor data

Floating windows track their owning model. Workspace replacement/import closes
transient windows synchronously; owner deletion/rename closes affected editors and
child pickers. Destroy also cleans up active drag/resize handling. Async script and
asset loads capture their workspace/cache so old requests cannot populate the next
workspace. Folder picking leaves the current workspace intact until the loader
clears old controls before scanning. Saves and file moves retain their original
folder; edits made during a save remain dirty. Preview preparation also checks
workspace ownership before publishing its snapshot. About remains reusable.

### 4. Read-only inspection

Inspector, Action Editor, options, and sequence rendering use read-only defaults.
Missing action arrays remain local drafts until an actual edit attaches them and
marks the script dirty. Edit/Done no longer performs implicit schema cleanup.
Legacy object actions convert to options on the first edit, preserving their
existing action arrays. Unchecking/editing fields still makes persistent changes
through the normal dirty flow.

### 5. Rename references and saving

Scene renaming loads JSON files, including nested files, before rewriting goto and
manifest links, validates filename/collision constraints, and closes stale editors.
Save Current delegates to the grouped save while a scene rename is pending. New
scene files are written before their updated links; original scene files are
removed only after the entire dirty group writes successfully. Failures leave
renames pending for retry. This is recoverable staged saving, not an atomic
multi-file filesystem transaction.

Sequence renames update run/fork references owned by the scene. Item actions resolve
sequence names against whichever scene is active, so a shared item reference keeps
a compatibility alias under the old name in the renamed scene. Rewriting that
item globally could otherwise break another scene using the same name.

### 6. Cyclic Action Editor drag

Moving an action into an array/model it owns is rejected before splice. The guard
also covers unattached draft branches, where the target array is not yet part of
the saved JSON tree. Normal reordering and cross-window moves retain live array
references and dirty callbacks.

### 7. ZIP and error contracts

ZIP import explicitly supports uncompressed STORE archives and rejects unsupported
compression, encryption, split archives, and ZIP64 before writing. Headers,
boundaries, filenames, sizes, CRCs, duplicate/conflicting paths, and file overlaps
are validated. Export reports read failure instead of downloading a partial ZIP;
UTF-8 filenames are marked correctly. Import uses the same full workspace reload
as opening a folder, even after partial disk-write failure, and reports the actual
failure. Import does not provide transactional rollback of files already written.

Runtime entry/fork errors are visible through engine:error notifications and the
console; failed entry actions no longer silently redirect to intro. Optional item
definitions tolerate only a missing file; malformed JSON and I/O failures surface.
The editor reports required workspace-load errors instead of claiming success.

These fixes preserve the vanilla static architecture. They were reviewed in source
and syntax-checked; the browser scenarios below remain unverified by the agent.

## What to keep simple

- Keep EventBus small. It does not need dependency injection, middleware, or a
  second command bus. Explicit events for cross-module behavior are sufficient.
- Keep the shared action schema for fields, defaults, summaries, and badges.
  Runtime execution belongs in the runner, not a declarative dispatch language.
- Keep shared field rows, floating windows, and the options/sequences table
  builder: each removes actual repeated DOM/lifecycle work used today.
- Keep the runtime and editor UIs separate. Similar-looking menus and windows
  have different lifecycles and styling; forcing a universal widget layer is
  unlikely to pay for itself.
- Keep the frame stack and safety guards. They serve real sequence/loop behavior;
  replacing them with recursive calls would trade visible code for hidden state.
- Extract helpers when a format rule or behavior is actually repeated. Avoid
  files whose only purpose is forwarding one method call or wrapping map access.
- Large renderers are not automatically architectural failures. Split by a real
  concern when editing becomes difficult, rather than imposing a line-count cap.

## Browser verification for the user

Check entry actions and scene goto; object left-click/right-click interruption
and click counters; nested choice/loop/run/fork actions; image/text blocking fades;
inventory options; Action Editor nested editing and cross-window dragging;
closing/reopening action and list windows; cancelling confirmation/name/action
pickers; save/rename and preview; and the installed editor after its service
worker updates. Also check interrupted inventory interactions, simultaneous fork
prompts, audio stop/replacement/pause, deletion with nested editors open, renaming
scenes with links in other files, sequence aliases used by items, refused descendant
drags, and valid/unsupported ZIP imports. These checks were not run by the agent.
