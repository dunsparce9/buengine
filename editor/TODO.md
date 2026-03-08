# Editor TODO — Feature Parity with Game Engine

Status: **v0.0 MVP (read-only inspector + basic `_game.json` editing)**
Goal: Bring the editor up to parity with everything the game engine already supports.

---

## 1. Action Viewer / Editor: ALL DONE! You owe a BEER to CLAUDE

The biggest gap. All action arrays (`hotspot.actions`, `onEnter`, `definitions.*`) are shown as opaque **"N action(s)"** text. There is no way to inspect or edit the actual action logic.

- [x] **Action Viewer panel** — clicking an action count (hotspot actions, onEnter, definition) opens a read-only "Edit Actions" floating window / modal that displays every action in the array as a distinct visual block.
- [x] **Action editing** (post-MVP) — make the visual blocks editable: reorder, add, delete, edit fields inline

## 2. Properties Panel — Scene Fields

Currently read-only with no way to edit. Some fields aren't shown at all.

- [ ] **`background`** — editable text input (image path), ideally with a file picker or browse button
- [ ] **`backgroundColor`** — editable text input with colour preview swatch
- [ ] **`grid.cols` / `grid.rows`** — editable number inputs (viewport should update live)
- [ ] **`onEnter` actions** — show action list (not just count); clicking opens Action Viewer
- [ ] **`definitions`** — show each definition's action list (not just count); clicking opens Action Viewer

## 3. Properties Panel — Hotspot Fields

The hotspot inspector can edit `x/y/w/h` but everything else is read-only or hidden.

- [x] **`id`** — editable text input (with validation: unique within scene, no spaces)
- [x] **`label`** — editable text input
- [x] **`texture`** — combo box populated by images referenced in game scripts
- [x] **`cursor`** — dropdown of standard CSS cursor values
- [x] **`actions`** — show action list (not just count); clicking opens Action Viewer (works even when empty)

## 4. Properties Panel — Game Manifest (`_game.json`)

- [ ] **`skipTitleScreen`** — editable checkbox (boolean) — supported by engine but not shown at all
- [ ] **`scenes` array** — editable list (add/remove/reorder scene ids)

## 5. Hotspot Management

No way to create or remove hotspots from the editor.

- [x] **Add hotspot** — drag on viewport to form selection box (grid-snapped), right-click to create via context menu
- [x] **Delete hotspot** — right-click context menu AND properties panel button
- [x] **Drag to move** — click-drag a selected hotspot in the viewport to reposition (grid-snapped)
- [x] **Drag to resize** — drag corner/edge handles on selected hotspot to change w/h (grid-snapped)

## 6. Scene Management

No way to create, delete, or rename scenes.

- [ ] **Create new scene** — menu item or button; adds a new JSON file to the script list with sensible defaults
- [ ] **Delete scene** — remove a scene from the project (with confirmation)
- [ ] **Rename scene** — change the scene `id` (and filename)
- [ ] **Duplicate scene** — copy an existing scene as a starting point

## 7. Viewport Enhancements

The viewport is a passive preview — no interactive editing beyond hotspot selection.

- [ ] **Grid overlay toggle** — show/hide tile grid lines (the game engine has a debug grid; the editor should have one too)
- [ ] **Hotspot creation via click-drag** — draw a rectangle on the grid to define a new hotspot
- [ ] **Hotspot move via drag** — drag existing hotspots to new tile positions
- [ ] **Hotspot resize via handles** — corner/edge handles to change w/h
- [ ] **Overlay preview** — show `show`/`hide` image overlays in the viewport (currently not rendered)
- [ ] **Zoom / pan** — useful for large grids

## 8. Definitions Panel

Definitions are listed by name + action count but can't be managed.

- [ ] **View definition actions** — clicking a definition opens the Action Viewer for its action array
- [ ] **Create definition** — add a new named definition
- [ ] **Delete definition** — remove a definition
- [ ] **Rename definition** — change the definition key

## 9. Sound & Effect Preview

No way to preview audio or visual effects from the editor.

- [ ] **Play sound** — button next to `playsound` actions to hear the audio file
- [ ] **Preview effect** — button to preview fade-in / fade-out transitions in the viewport

## 10. Import / Save

Currently the editor is export-only (JSON blob download). No persistence to disk.

- [ ] **Import JSON** — load a scene file from disk into the editor
- [ ] **Save to disk** — write edited scripts back (requires a local server helper or File System Access API)
- [ ] **Undo / Redo** — action history for in-memory edits

## 11. Validation & Feedback

- [ ] **Flag reference validation** — warn when an `if` condition references a flag that is never `set` anywhere
- [ ] **Scene reference validation** — warn when a `goto` points to a scene id that doesn't exist
- [ ] **Definition reference validation** — warn when `run` refers to a non-existent definition
- [ ] **Duplicate id detection** — warn on duplicate hotspot ids within a scene
- [ ] **Missing field hints** — highlight when a hotspot has no actions, or a scene has no onEnter

---

## Priority Order (suggested)

1. **Action Viewer (read-only)** — #1 — the single biggest gap; unlocks script inspection
2. **Hotspot property editing** — #3 — id, label, texture, cursor, action viewer link
3. **Scene property editing** — #2 — background, backgroundColor, grid, onEnter/definitions viewer links
4. **Manifest fields** — #4 — skipTitleScreen, editable scenes list
5. **Hotspot CRUD** — #5 — add / delete hotspots
6. **Definitions management** — #8
7. **Scene CRUD** — #6
8. **Viewport interactivity** — #7 — drag-to-move, drag-to-resize, grid overlay
9. **Action editing** — #1 (editing part)
10. **Sound/effect preview** — #9
11. **Import / Save** — #10
12. **Validation** — #11
