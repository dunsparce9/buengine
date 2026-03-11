/**
 * Scene object options context menu.
 */
export class ObjectOptionsUI {
  /**
   * @param {import('./event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this.bus = bus;
    /** @type {HTMLElement|null} */
    this._ctxEl = null;

    bus.on('object-options:show', (payload) => this._show(payload));
    bus.on('game:quit', () => this._close());
    bus.on('game:title', () => this._close());
    bus.on('scene:goto', () => this._close());

    document.addEventListener('click', (e) => {
      if (this._ctxEl && !this._ctxEl.contains(e.target)) this._close();
    });
    document.addEventListener('contextmenu', (e) => {
      if (this._ctxEl && !this._ctxEl.contains(e.target)) this._close();
    });
  }

  _show({ obj, options, clientX, clientY }) {
    this._close();
    if (!Array.isArray(options) || options.length === 0) return;

    const menu = document.createElement('div');
    menu.className = 'inv-ctx';

    options.forEach((opt, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inv-ctx-btn';
      btn.textContent = (opt?.icon ? opt.icon + ' ' : '') + (opt?.text || `Option ${index + 1}`);
      btn.addEventListener('click', () => {
        this._close();
        this.bus.emit('object:option', { obj, index });
      });
      menu.appendChild(btn);
    });

    const uiLayer = document.getElementById('ui-layer');
    uiLayer.appendChild(menu);

    const container = document.getElementById('game-container');
    const cRect = container.getBoundingClientRect();
    const scale = cRect.width / container.offsetWidth;
    let x = (clientX - cRect.left) / scale;
    let y = (clientY - cRect.top) / scale;

    requestAnimationFrame(() => {
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      if (x + mw > container.offsetWidth) x = container.offsetWidth - mw - 4;
      if (y + mh > container.offsetHeight) y = container.offsetHeight - mh - 4;
      menu.style.left = `${Math.max(0, x)}px`;
      menu.style.top = `${Math.max(0, y)}px`;
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    this._ctxEl = menu;
  }

  _close() {
    if (!this._ctxEl) return;
    this._ctxEl.remove();
    this._ctxEl = null;
  }
}
