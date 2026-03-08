# büegame Editor

A visual level editor for büegame scripts.

## Usage

Open `editor/index.html` in a browser (served from the project root), or click **Edit** on the game's title screen.

> The editor must be served via HTTP — `file://` won't work due to `fetch()` restrictions.

## Layout

| Area | Purpose |
|------|---------|
| **Top bar** | File and Help menus |
| **Left panel** | Lists all JSON scripts in the game (`_game.json` + scenes) |
| **Viewport** | Visual preview of the selected scene (background + hotspot outlines) |
| **Right panel** | Read-only property inspector for the selected object |

## Menus

- **File → Export JSON** — Downloads the currently viewed script as a `.json` file.
- **File → Exit** — Returns to the game's title screen.
- **Help → About** — Shows version info.

## Script discovery

The editor reads `_game.json` and discovers scene files from the `scenes` array.
If `scenes` is absent, only the `startScene` is listed.

## Version

v0.0 — MVP (read-only inspector, no editing)
