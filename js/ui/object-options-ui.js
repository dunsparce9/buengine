/**
 * Scene object options context menu.
 */
import { ContextMenu } from './context-menu.js';

export class ObjectOptionsUI {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this.bus = bus;
    /** @type {import('./context-menu.js').ContextMenu} */
    this._menu = new ContextMenu();

    bus.on('object-options:show', (payload) => this._show(payload));
    bus.on('game:quit', () => this._close());
    bus.on('game:title', () => this._close());
    bus.on('scene:goto', () => this._close());
  }

  _show({ obj, options, clientX, clientY }) {
    if (!Array.isArray(options) || options.length === 0) return;

    this._menu.show({
      x: clientX,
      y: clientY,
      options: options.map((opt, index) => ({
        icon: opt?.icon,
        text: opt?.text || `Option ${index + 1}`,
        onClick: () => this.bus.emit('object:option', { obj, index }),
      })),
    });
  }

  _close() {
    this._menu.close();
  }
}
