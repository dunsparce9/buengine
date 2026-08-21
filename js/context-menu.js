/**
 * Shared context menu — `.inv-ctx` popup with buttons, appended to #ui-layer
 * and positioned scale-aware inside #game-container.
 *
 * Option shape:
 *   { icon?, text, className?, onClick }  – a button
 *   { separator: true }                   – a .inv-ctx-sep divider
 *
 * Button clicks close the menu first, then run onClick.
 * One set of document-level click/contextmenu outside-close listeners per instance.
 */
export class ContextMenu {
  constructor() {
    /** @type {HTMLElement|null} Active menu element */
    this._el = null;
    /** @type {function|null} Called after the menu closes */
    this._onClose = null;

    // Close on any click outside the menu
    const outside = (e) => {
      if (this._el && !this._el.contains(e.target)) this.close();
    };
    this._onDocClick = outside;
    this._onDocCtx = outside;
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('contextmenu', this._onDocCtx);
  }

  /**
   * Show the menu at viewport coordinates.
   * @param {object} p
   * @param {Array<{icon?: string, text?: string, className?: string, onClick?: function, separator?: boolean}>} p.options
   * @param {number} p.x  clientX
   * @param {number} p.y  clientY
   * @param {function} [p.onClose]  invoked after close (pick or outside click)
   */
  show({ options, x, y, onClose }) {
    this.close();

    const menu = document.createElement('div');
    menu.className = 'inv-ctx';

    for (const opt of options ?? []) {
      if (opt.separator) {
        const sep = document.createElement('div');
        sep.className = 'inv-ctx-sep';
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-ctx-btn' + (opt.className ? ` ${opt.className}` : '');
      btn.textContent = (opt.icon ? opt.icon + ' ' : '') + opt.text;
      btn.addEventListener('click', () => {
        this.close();
        opt.onClick?.();
      });
      menu.appendChild(btn);
    }

    document.getElementById('ui-layer').appendChild(menu);

    // Position at pointer, clamped inside game-container (account for CSS scale)
    const container = document.getElementById('game-container');
    const cRect = container.getBoundingClientRect();
    const scale = cRect.width / container.offsetWidth;
    let mx = (x - cRect.left) / scale;
    let my = (y - cRect.top) / scale;
    menu.style.left = `${mx}px`;
    menu.style.top = `${my}px`;

    // Wait for layout to clamp properly
    requestAnimationFrame(() => {
      if (this._el !== menu) return; // superseded by a newer show()
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      if (mx + mw > container.offsetWidth) mx = container.offsetWidth - mw - 4;
      if (my + mh > container.offsetHeight) my = container.offsetHeight - mh - 4;
      menu.style.left = `${Math.max(0, mx)}px`;
      menu.style.top = `${Math.max(0, my)}px`;
    });

    this._el = menu;
    this._onClose = onClose || null;
  }

  /** Remove the menu (no-op when not open). Fires onClose exactly once. */
  close() {
    if (!this._el) return;
    this._el.remove();
    this._el = null;
    const cb = this._onClose;
    this._onClose = null;
    cb?.();
  }
}
