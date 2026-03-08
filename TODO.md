# büegame TODO

## Engine / Core
- [ ] **Save / Load system** — Serialize `GameState` (flags, current scene, history) to `localStorage`; add Save/Load buttons to the pause menu.
- [ ] **Inventory system** — Items collected via `{ "pickup": "key" }` action; inventory bar UI; use-item-on-hotspot interactions.
- [ ] **Audio** — `{ "play_sound": "door_creak.ogg" }` and `{ "play_music": "ambient.ogg" }` actions; volume control in pause menu.
- [ ] **Transition effects** — Fade-to-black / crossfade between scene changes.
- [ ] **Typewriter speed setting** — Allow scripts to control text speed (`"speed": "slow"`) and let the player set a preference.

## Script System
- [ ] **Script validator** — CLI or in-browser tool that checks JSON scripts for missing fields, broken `goto` references, unreachable scenes, etc.
- [ ] **Variable interpolation in dialogue** — `"say": "Hello, {player_name}!"` pulls from flags.
- [ ] **Composite conditions** — Extend `if` to support `{ "if": {"and": ["flag_a", "flag_b"]}, ... }` and `or`/`not`.
- [ ] **Timed actions** — Auto-advance dialogue after N seconds if player doesn't click.
- [ ] **Sprite/image overlay action** — `{ "show_image": { "src": "...", "x": ..., "y": ..., "id": "..." } }` to place images on the scene layer.

## UI / UX
- [ ] **Responsive scaling** — Scale the game canvas to fit different screen sizes while preserving aspect ratio.
- [ ] **Accessibility** — Keyboard navigation for choices; ARIA labels on hotspots; high-contrast mode.
- [ ] **Settings panel** — Text speed, volume, fullscreen toggle.
- [ ] **Animated hotspot highlights** — Pulse or glow effect so players can discover clickable areas.
- [ ] **Dialogue log** — Scrollable history of past dialogue lines.

## Content / Art
- [ ] **Background art** — Replace solid-colour scenes with illustrated backgrounds.
- [ ] **Character portraits** — Show speaker portrait next to dialogue box.
- [ ] **Sound effects & music** — Source or create audio assets.
- [ ] **Expand demo story** — Add more scenes and branching paths beyond the intro/hallway.

## Tooling / DX
- [ ] **Hot-reload** — File watcher (or polling) that reloads the current scene when a script JSON changes.
- [ ] **Scene graph visualizer** — Generate a clickable flowchart of all scenes and their `goto` connections.
- [ ] **Script editor** — In-browser form-based editor that writes valid scene JSON (aimed at non-coders).
