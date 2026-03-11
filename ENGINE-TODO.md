# büegame Engine TODO

## Must Address Before Further Dev
- [ ] Remove `hotspot` naming and backward compatibility entirely. Standardize on `objects` across runtime, editor, schema assumptions, docs, and sample JSON handling.
- [ ] Redesign preview mode so large projects do not depend on `localStorage` payloads. Current preview transport will fail once edited JSON + asset mappings get big enough; replace it with a scalable handoff.
- [ ] Fix preview/runtime support for nested JSON script paths. The runtime loader currently URI-encodes slash-based IDs, which blocks expansion beyond top-level scenes outside preview mode.
- [ ] Add a safe first-interaction audio gate. Games that skip the title screen or build a custom title flow can currently hit browser autoplay restrictions before the player clicks anything.
- [ ] Replace the current layer model with something coherent. `show.layer` exists in shared schema, but runtime behavior does not really implement it; move to explicit numeric layering / z-index semantics and keep schema, runner, renderer, and editor aligned.
- [ ] Make inventory-triggered actions safe against runner state collisions. Item option actions currently execute on the shared `ActionRunner`, which is fragile once multiple action flows overlap.

## Smaller Gotchas / Structural Cleanup
- [ ] Tighten audio lifecycle management. Finished sounds should be cleaned up, and fade timers should not keep running against sounds that were already stopped/replaced.
- [ ] Audit shared action-schema parity regularly. There is already drift between fields exposed in the editor and what the runtime actually honors.
- [ ] Keep runtime docs aligned with the actual engine surface after the `objects` rename, preview redesign, and layer changes.

