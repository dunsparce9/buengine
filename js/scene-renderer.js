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
    this._cols = 16;
    this._rows = 9;

    this._tooltip = document.createElement('div');
    this._tooltip.className = 'hotspot-tooltip hidden';
    this.el.appendChild(this._tooltip);

    window.addEventListener('resize', () => this._fitToContainer());
  }

  /** Resize the scene layer to fit its parent while preserving the grid aspect ratio. */
  _fitToContainer() {
    const container = this.el.parentElement;
    if (!container) return;
    const sceneRatio = this._cols / this._rows;
    const availW = container.clientWidth;
    const availH = container.clientHeight;
    const containerRatio = availW / availH;

    let w, h;
    if (sceneRatio > containerRatio) {
      w = availW;
      h = availW / sceneRatio;
    } else {
      h = availH;
      w = availH * sceneRatio;
    }

    this.el.style.width  = `${Math.round(w)}px`;
    this.el.style.height = `${Math.round(h)}px`;
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
    this._cols = cols;
    this._rows = rows;
    this._fitToContainer();
    const tilePctW = 100 / cols;
    const tilePctH = 100 / rows;

    // Hotspots
    if (Array.isArray(scene.hotspots)) {
      for (const hs of scene.hotspots) {
        const div = document.createElement('div');
        div.className = 'hotspot';
        div.style.left   = `${hs.x * tilePctW}%`;
        div.style.top    = `${hs.y * tilePctH}%`;
        div.style.width  = `${hs.w * tilePctW}%`;
        div.style.height = `${hs.h * tilePctH}%`;

        if (hs.texture) {
          div.classList.add('hotspot-textured');
          div.style.backgroundImage = `url('${CSS.escape(hs.texture)}')`;
        }

        if (hs.cursor) div.style.cursor = hs.cursor;

        if (hs.label) {
          div.addEventListener('mouseenter', () => {
            this._tooltip.textContent = hs.label;
            this._tooltip.style.left = `${hs.x * tilePctW + (hs.w * tilePctW) / 2}%`;
            this._tooltip.style.top  = `${hs.y * tilePctH}%`;
            this._tooltip.classList.remove('hidden');
          });
          div.addEventListener('mouseleave', () => {
            this._tooltip.classList.add('hidden');
          });
        }

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
    this.el.style.width  = '';
    this.el.style.height = '';
    this.el.querySelectorAll('.hotspot').forEach(h => h.remove());
    this._tooltip.classList.add('hidden');
  }
}
