# büegame Editor TODO

## Must Address Before Further Dev
- [ ] Fix editor source-of-truth problems after file operations. Create / rename / move / delete / external drop must keep disk state, `state.scripts`, selection, and dirty tracking in sync.
- [ ] Make ZIP export use current in-memory state, not just files already written to disk.
- [ ] Fix Action Editor identity/deduping. Editor reuse is currently keyed by title alone, so generic nested titles like `then`, `else`, and `do` can reopen the wrong action list.
- [ ] Fix item option authoring so zero-action options are editable. A newly created option needs a way to open an empty action list immediately.
- [ ] Add undo/redo.
- [x] Standardize editor naming, state helpers, viewport code, properties, and file semantics on `objects`.
- [ ] Redesign preview mode so projects larger than a few MB do not fail on `localStorage` limits. This includes both edited JSON handoff and asset URL handoff strategy.
- [ ] Expose currently missing scene fields in the inspector, especially `id`, `background`, and `grid`.
- [ ] Add sequence management to the editor. Sequences cannot currently be created at all, and zero-action sequences are too easy to lose from the UI.
- [ ] Replace the current layer model with something coherent in the editor as well. If runtime moves to numbered / z-index-based layers, AE and inspectors need first-class support for that model.

## Smaller Gotchas / Structural Cleanup
- [ ] Make file discovery/loading rules less brittle. The editor currently special-cases top-level scenes plus `items/items.json`; expand this into a clearer, scalable script model.
- [ ] Fix selection behavior after rename/move/delete so the inspector and viewport cannot point at stale IDs or missing files.
- [ ] Make dirty-state handling trustworthy across imports, file operations, and preview/export flows.
- [ ] Count and display item defaults consistently. For example, `droppable` defaults should match runtime semantics in editor summaries.
- [ ] Reduce schema drift in editor forms. If a field is present in shared action metadata, the editor should either support it correctly or clearly omit it on purpose.
