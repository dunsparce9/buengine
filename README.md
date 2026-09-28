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
