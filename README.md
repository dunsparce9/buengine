## büengine!

Simple 2D point-and-click story engine & level editor.

### Building

Development runs directly from the source: serve this folder with any local static
server and open `index.html` or `editor/index.html`.

For a smaller release, install Node.js 22+ and run:

```sh
npm ci
npm run build
```

Serve or upload the contents of `dist/`. The build recreates that folder, bundles
and minifies runtime/editor JS and CSS with esbuild, emits hashed filenames and
source maps, and rewrites the copied HTML to use them. Game folders and public
assets are copied with their existing paths. The result is still a static website;
Node is only needed to generate it. Relative URLs support hosting under a subfolder.

The build also generates `dist/editor/sw.js` from the emitted editor assets.
Deploy the complete output together, including that worker. Configure the host to
revalidate `editor/sw.js` and HTML (`Cache-Control: no-cache`); hashed bundles can
use long-lived immutable caching.

### Editor offline cache and updates

For source development, refresh the editor's offline list/version after changing
editor assets or precached shared dependencies:

```sh
npm run precache
```

This command needs no esbuild installation and is also available as
`node editor/tools/generate-sw-precache.mjs`. Release builds generate their own
precache automatically without rewriting the source worker.

Cache versions are derived from file contents and worker logic. Source mode fetches
fresh assets first, with an offline fallback. Release mode serves its installed
editor snapshot from cache, checks for updates on opening/focus, and activates the
new snapshot once edits are saved. Unsaved edits defer activation and reload; Save
All or returning to a clean editor completes a pending update. First installation
does not force a reload. Cache cleanup is limited to this editor's URL scope.

The offline cache covers the editor, including its local icon font. Runtime preview
tabs and games still need the host; the external Google font is optional offline.

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
- `tools/build.mjs` — optional esbuild release packaging.
- `games/` — self-contained game scripts and assets.

Source HTML entry points keep using the original ES modules and stylesheets.

### Animation

In the Action Editor, add **Animate** and choose **Object** or **Scene** as the target.
For objects, fill in the properties to change and leave the others blank. Use an
object ID, `this` inside an object interaction, or the ID of an existing image/text
entity created by Show/Text.

Animation fields are split into icon pills (Move, Rotate, Scale, Resize, Fade, Timing).
A dot marks configured fields or timing changed from the defaults. The editor
remembers your last selected pill; Target stays visible above the pills.

```json
{
  "animate": {
    "id": "this",
    "to": { "x": 8, "y": 4, "rotation": 90, "scale": 1.5 },
    "seconds": 1,
    "easing": "ease-in-out",
    "blocking": true
  }
}
```

Targets are absolute: position and `w`/`h` are in grid units (fractions allowed),
rotation is in degrees, and scale is a multiplier of the entity's current layout
size. `scaleX`/`scaleY` override uniform `scale`. Text positions remain offsets from
the text's existing anchor. Rotation/scale use the center pivot by default; `pivot`
also accepts anchors such as `top-left` or `bottom-center` and persists until changed.

Scene mode fades the entire scene, including its objects and runtime overlays.
Opacity is between 0 (transparent) and 1 (opaque). A fade-out sets target opacity
to 0; a fade-in sets starting opacity to 0 and target opacity to 1:

```json
{
  "animate": {
    "target": "scene",
    "from": { "opacity": 0 },
    "to": { "opacity": 1 },
    "seconds": 1,
    "blocking": true
  }
}
```

Leave starting opacity blank to fade from the currently displayed opacity. Object
mode supports the same opacity controls alongside movement and transforms. Scene
mode uses opacity only and ignores any retained object ID/geometry fields.

Show/Hide/Text retain their embedded fade settings.

Duration defaults to one second; zero applies immediately. Easing supports
`linear`, `ease`, `ease-in`, `ease-out`, and `ease-in-out` (the default). Blocking
waits for completion; uncheck it to continue the chain during motion. New editor
cards have Blocking checked; omitted `blocking` in JSON means nonblocking.

Animations pause with the game and retain their final pose until scene re-entry.
New animations replace overlapping properties from their current values, while
other properties continue. Interrupting a running chain cancels its animations at
their current pose; removing an entity or leaving the scene also cancels motion.
Use named sequences and Fork for multi-step/background choreography.

### Contributions

Every PR must include proof of beer: max 10 MB JPG showcasing one (1) standard can of beer that was consumed during PR creation.
