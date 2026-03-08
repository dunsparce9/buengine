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

    bus.on('scene:effect', (payload) => this._applyEffect(payload));
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
   * Preload all images used by a scene (background + hotspot textures).
   * Resolves once every image is loaded (or fails gracefully).
   * @param {object} scene  Parsed scene JSON
   * @returns {Promise<void>}
   */
  preload(scene) {
    const urls = [];
    if (scene.background) urls.push(scene.background);
    if (Array.isArray(scene.hotspots)) {
      for (const hs of scene.hotspots) {
        if (hs.texture) urls.push(hs.texture);
      }
    }
    if (urls.length === 0) return Promise.resolve();
    return Promise.all(urls.map(url => new Promise(resolve => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve; // don't block on broken images
      img.src = url;
    })));
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

  /**
   * Apply a visual effect to the entire scene layer.
   * @param {object} p
   * @param {string} p.type       "fade-in" | "fade-out"
   * @param {number} p.seconds    duration
   * @param {boolean} p.blocking  whether to block actions until done
   * @param {function} [p.onDone]
   */
  _applyEffect({ type, seconds = 1, blocking, onDone }) {
    if (type === 'fade-in' && seconds > 0) {
      this.el.style.transition = 'none';
      this.el.style.opacity = '0';
      this.el.offsetWidth; // force reflow
      this.el.style.transition = `opacity ${seconds}s ease`;
      this.el.style.opacity = '1';

      if (blocking) {
        this.el.addEventListener('transitionend', () => onDone?.(), { once: true });
      } else {
        onDone?.();
      }
    } else if (type === 'fade-out' && seconds > 0) {
      this.el.style.transition = `opacity ${seconds}s ease`;
      this.el.style.opacity = '0';

      if (blocking) {
        this.el.addEventListener('transitionend', () => onDone?.(), { once: true });
      } else {
        onDone?.();
      }
    } else {
      onDone?.();
    }
  }

  /** Remove all hotspots and background. */
  clear() {
    this.el.style.backgroundImage = '';
    this.el.style.backgroundColor = '#111';
    this.el.style.width  = '';
    this.el.style.height = '';
    this.el.style.opacity = '';
    this.el.style.transition = '';
    this.el.querySelectorAll('.hotspot').forEach(h => h.remove());
    this._tooltip.classList.add('hidden');
  }
}
