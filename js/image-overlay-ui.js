/**
 * Manages full-scene image overlays (show/hide with fade effects).
 *
 * Listens for:
 *   overlay:show  → create & animate in an image overlay
 *   overlay:hide  → animate out & remove an existing overlay
 */
export class ImageOverlayUI {
  /** @param {import('./event-bus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    /** @type {HTMLElement} */
    this._container = document.getElementById('scene-layer');
    /** @type {Map<string, HTMLElement>} active overlays keyed by id */
    this._overlays = new Map();

    bus.on('overlay:show', (payload) => this._show(payload));
    bus.on('overlay:hide', (payload) => this._hide(payload));
    bus.on('overlay:clear', ()       => this._clearAll());
  }

  /**
   * @param {object} p
   * @param {string} p.id
   * @param {string} p.texture
   * @param {string} [p.scaling]   "fill" | "contain" | "cover"
   * @param {object} [p.effect]    { type, seconds, blocking }
   * @param {function} [p.onDone]  called when the effect finishes (or immediately if no effect)
   */
  _show({ id, texture, scaling, effect, onDone }) {
    // Remove old overlay with same id if any
    this._remove(id);

    const el = document.createElement('div');
    el.className = 'image-overlay';
    el.dataset.overlayId = id;

    el.style.backgroundImage = `url('${CSS.escape(texture)}')`;

    if (scaling === 'fill' || scaling === 'cover') {
      el.style.backgroundSize = 'cover';
    } else if (scaling === 'contain') {
      el.style.backgroundSize = 'contain';
    }

    this._container.appendChild(el);
    this._overlays.set(id, el);

    if (effect?.type === 'fade-in' && effect.seconds > 0) {
      el.style.opacity = '0';
      el.style.transition = `opacity ${effect.seconds}s ease`;
      // Force reflow so the transition triggers
      el.offsetWidth; // eslint-disable-line no-unused-expressions
      el.style.opacity = '1';

      if (effect.blocking) {
        el.addEventListener('transitionend', () => onDone?.(), { once: true });
      } else {
        onDone?.();
      }
    } else {
      onDone?.();
    }
  }

  /**
   * @param {object} p
   * @param {string} p.id
   * @param {object} [p.effect]   { type, seconds, blocking }
   * @param {function} [p.onDone]
   */
  _hide({ id, effect, onDone }) {
    const el = this._overlays.get(id);
    if (!el) { onDone?.(); return; }

    if (effect?.type === 'fade-out' && effect.seconds > 0) {
      // Snapshot the current computed opacity and freeze it — this
      // cleanly interrupts any in-progress fade-in transition.
      const current = getComputedStyle(el).opacity;
      el.style.transition = 'none';
      el.style.opacity = current;
      el.offsetWidth; // force reflow to lock in the value

      // Now apply the fade-out from the frozen value
      el.style.transition = `opacity ${effect.seconds}s ease`;
      el.style.opacity = '0';

      const finish = () => { this._remove(id); onDone?.(); };

      if (effect.blocking) {
        el.addEventListener('transitionend', finish, { once: true });
      } else {
        onDone?.();
        el.addEventListener('transitionend', () => this._remove(id), { once: true });
      }
    } else {
      this._remove(id);
      onDone?.();
    }
  }

  _remove(id) {
    const el = this._overlays.get(id);
    if (el) { el.remove(); this._overlays.delete(id); }
  }

  _clearAll() {
    for (const [id] of this._overlays) this._remove(id);
  }
}
