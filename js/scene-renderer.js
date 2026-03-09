/**
 * Renders a scene: sets the background and creates clickable object elements
 * positioned on a tile grid.  Also manages runtime image overlays.
 *
 * Both scene-defined objects (formerly "hotspots") and runtime overlays
 * created by `show` actions are tracked in a unified entity map so that
 * `show` / `hide` actions work on any entity by id.
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

    /**
     * Unified entity registry.
     * Scene objects and runtime overlays are both tracked here.
     * @type {Map<string, { el: HTMLElement, def: object|null, runtime: boolean, visible: boolean }>}
     */
    this._entities = new Map();

    /** Base path for resolving relative asset URLs. */
    this._basePath = '';

    window.addEventListener('resize', () => this._fitToContainer());

    bus.on('game:basepath', (bp) => { this._basePath = bp; });
    bus.on('scene:effect',  (payload) => this._applyEffect(payload));
    bus.on('overlay:show',  (payload) => this._showEntity(payload));
    bus.on('overlay:hide',  (payload) => this._hideEntity(payload));
    bus.on('overlay:clear', ()        => this._clearRuntimeOverlays());
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

  /** Resolve a relative asset path against the game's base directory. */
  _resolve(path) {
    if (!this._basePath || !path) return path;
    return `${this._basePath}/${path}`;
  }

  /**
   * Render a scene object.
   * @param {object} scene  Parsed scene JSON
   */
  render(scene) {
    // Clear all tracked entities (scene objects + runtime overlays)
    this._clearAllEntities();
    // Safety net: remove any orphaned .hotspot elements
    this.el.querySelectorAll('.hotspot').forEach(h => h.remove());

    // Background
    if (scene.background) {
      this.el.style.backgroundImage = `url('${CSS.escape(this._resolve(scene.background))}')`;
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

    // Scene objects (backward-compat: fall back to "hotspots")
    const objects = scene.objects ?? scene.hotspots;
    if (Array.isArray(objects)) {
      for (const obj of objects) {
        const div = document.createElement('div');
        div.className = 'hotspot';
        div.dataset.objectId = obj.id;
        div.style.left   = `${obj.x * tilePctW}%`;
        div.style.top    = `${obj.y * tilePctH}%`;
        div.style.width  = `${obj.w * tilePctW}%`;
        div.style.height = `${obj.h * tilePctH}%`;

        if (obj.texture) {
          div.classList.add('hotspot-textured');
          div.style.backgroundImage = `url('${CSS.escape(this._resolve(obj.texture))}')`;
        }

        if (obj.cursor) div.style.cursor = obj.cursor;
        if (obj.z != null) div.style.zIndex = obj.z;

        // Visibility: objects default to visible unless `visible: false`
        const visible = obj.visible !== false;
        if (!visible) {
          div.style.opacity = '0';
          div.style.pointerEvents = 'none';
        }

        if (obj.label) {
          div.addEventListener('mouseenter', () => {
            this._tooltip.textContent = obj.label;
            this._tooltip.style.left = `${obj.x * tilePctW + (obj.w * tilePctW) / 2}%`;
            this._tooltip.style.top  = `${obj.y * tilePctH}%`;
            this._tooltip.classList.remove('hidden');
          });
          div.addEventListener('mouseleave', () => {
            this._tooltip.classList.add('hidden');
          });
        }

        div.addEventListener('click', () => {
          this.bus.emit('hotspot:click', obj);
        });

        this.el.appendChild(div);
        this._entities.set(obj.id, { el: div, def: obj, runtime: false, visible });
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

  /* ── Unified entity show/hide ────────────────── */

  /**
   * Show an entity.  If `id` matches a scene object, make it visible.
   * Otherwise, create a new fullscreen runtime overlay (requires `texture`).
   */
  _showEntity({ id, texture, scaling, z, effect, onDone }) {
    const entry = this._entities.get(id);

    if (entry) {
      // Existing entity — make visible
      const el = entry.el;
      entry.visible = true;
      el.style.pointerEvents = '';

      if (effect?.type === 'fade-in' && effect.seconds > 0) {
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.offsetWidth; // force reflow
        el.style.transition = `opacity ${effect.seconds}s ease`;
        el.style.opacity = '1';

        if (effect.blocking) {
          el.addEventListener('transitionend', () => onDone?.(), { once: true });
        } else {
          onDone?.();
        }
      } else {
        el.style.opacity = '';
        el.style.transition = '';
        onDone?.();
      }
      return;
    }

    if (texture) {
      // Runtime overlay — create new fullscreen element
      const el = document.createElement('div');
      el.className = 'image-overlay';
      el.dataset.objectId = id;
      el.style.backgroundImage = `url('${CSS.escape(this._resolve(texture))}')`;

      if (scaling === 'fill' || scaling === 'cover') {
        el.style.backgroundSize = 'cover';
      } else if (scaling === 'contain') {
        el.style.backgroundSize = 'contain';
      }

      if (z != null) el.style.zIndex = z;

      this.el.appendChild(el);
      this._entities.set(id, { el, def: null, runtime: true, visible: true });

      if (effect?.type === 'fade-in' && effect.seconds > 0) {
        el.style.opacity = '0';
        el.style.transition = `opacity ${effect.seconds}s ease`;
        el.offsetWidth; // force reflow
        el.style.opacity = '1';

        if (effect.blocking) {
          el.addEventListener('transitionend', () => onDone?.(), { once: true });
        } else {
          onDone?.();
        }
      } else {
        onDone?.();
      }
      return;
    }

    // No matching entity and no texture — nothing to show
    onDone?.();
  }

  /**
   * Hide an entity by id.  Scene objects stay in the DOM (can be re-shown).
   * Runtime overlays are removed from the DOM after the transition.
   */
  _hideEntity({ id, effect, onDone }) {
    const entry = this._entities.get(id);
    if (!entry) { onDone?.(); return; }

    const el = entry.el;

    const finish = () => {
      entry.visible = false;
      if (entry.runtime) {
        el.remove();
        this._entities.delete(id);
      } else {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    };

    if (effect?.type === 'fade-out' && effect.seconds > 0) {
      const current = getComputedStyle(el).opacity;
      el.style.transition = 'none';
      el.style.opacity = current;
      el.offsetWidth; // force reflow

      el.style.transition = `opacity ${effect.seconds}s ease`;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';

      if (effect.blocking) {
        el.addEventListener('transitionend', () => { finish(); onDone?.(); }, { once: true });
      } else {
        onDone?.();
        el.addEventListener('transitionend', finish, { once: true });
      }
    } else {
      finish();
      onDone?.();
    }
  }

  _removeEntity(id) {
    const entry = this._entities.get(id);
    if (entry) { entry.el.remove(); this._entities.delete(id); }
  }

  /** Remove only runtime overlays (used by overlay:clear). */
  _clearRuntimeOverlays() {
    for (const [id, entry] of this._entities) {
      if (entry.runtime) this._removeEntity(id);
    }
  }

  /** Remove all tracked entities (scene objects + runtime overlays). */
  _clearAllEntities() {
    for (const [id] of this._entities) this._removeEntity(id);
  }

  /** Remove all scene objects, overlays, and background. */
  clear() {
    this.el.style.backgroundImage = '';
    this.el.style.backgroundColor = '#111';
    this.el.style.width  = '';
    this.el.style.height = '';
    this.el.style.opacity = '';
    this.el.style.transition = '';
    this.el.querySelectorAll('.hotspot').forEach(h => h.remove());
    this._tooltip.classList.add('hidden');
    this._clearAllEntities();
  }
}
