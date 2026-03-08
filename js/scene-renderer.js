/**
 * Renders a scene: sets the background and creates clickable hotspot elements
 * positioned on a tile grid.
 */
export class SceneRenderer {
  /**
   * @param {HTMLElement} sceneLayer  #scene-layer element
   * @param {import('./event-bus.js').EventBus} bus
   */
  constructor(sceneLayer, bus) {
    this.el = sceneLayer;
    this.bus = bus;
  }

  /**
   * Render a scene object.
   * @param {object} scene  Parsed scene JSON
   */
  render(scene) {
    // Clear previous hotspots
    this.el.querySelectorAll('.hotspot').forEach(h => h.remove());

    // Background
    if (scene.background) {
      this.el.style.backgroundImage = `url('${CSS.escape(scene.background)}')`;
    } else {
      this.el.style.backgroundImage = '';
      this.el.style.backgroundColor = scene.backgroundColor || '#111';
    }

    // Grid dimensions (default 16×9)
    const cols = scene.grid?.cols ?? 16;
    const rows = scene.grid?.rows ?? 9;
    const containerW = this.el.clientWidth;
    const containerH = this.el.clientHeight;
    const tileW = containerW / cols;
    const tileH = containerH / rows;

    // Hotspots
    if (Array.isArray(scene.hotspots)) {
      for (const hs of scene.hotspots) {
        const div = document.createElement('div');
        div.className = 'hotspot';
        div.style.left   = `${hs.x * tileW}px`;
        div.style.top    = `${hs.y * tileH}px`;
        div.style.width  = `${hs.w * tileW}px`;
        div.style.height = `${hs.h * tileH}px`;

        if (hs.texture) {
          div.classList.add('hotspot-textured');
          div.style.backgroundImage = `url('${CSS.escape(hs.texture)}')`;
        }

        if (hs.cursor) div.style.cursor = hs.cursor;
        if (hs.label)  div.title = hs.label;

        div.addEventListener('click', () => {
          this.bus.emit('hotspot:click', hs);
        });

        this.el.appendChild(div);
      }
    }
  }

  /** Remove all hotspots and background. */
  clear() {
    this.el.style.backgroundImage = '';
    this.el.style.backgroundColor = '#111';
    this.el.querySelectorAll('.hotspot').forEach(h => h.remove());
  }
}
