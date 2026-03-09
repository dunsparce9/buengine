/**
 * HUD taskbar — top-right floating bar with game actions.
 * Buttons: Character Sheet, Inventory | Settings, Quit
 *
 * Emits on the bus:
 *   hud:charsheet   – open character sheet (no-op for now)
 *   hud:inventory   – open inventory       (no-op for now)
 *   hud:settings    – open settings         (no-op for now)
 *   game:quit       – return to game selector
 *
 * Listens:
 *   hud:show / hud:hide  – toggle visibility
 */
export class HudUI {
  /** @param {import('./event-bus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.el = document.getElementById('hud-bar');

    // Wire up each button via its data-hud attribute
    for (const btn of this.el.querySelectorAll('.hud-btn')) {
      btn.addEventListener('click', () => this._onButton(btn.dataset.hud));
    }

    // Engine integration
    this.bus.on('hud:show', () => this.show());
    this.bus.on('hud:hide', () => this.hide());
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  /** @param {string} action */
  _onButton(action) {
    switch (action) {
      case 'charsheet': this.bus.emit('hud:charsheet'); break;
      case 'inventory': this.bus.emit('hud:inventory'); break;
      case 'settings':  this.bus.emit('hud:settings');  break;
      case 'quit':      this.bus.emit('game:quit');      break;
    }
  }
}
