/**
 * Renders a multiple-choice modal from a choice command.
 */
import { UI_SOUNDS } from './sound-manager.js';

export class ChoiceUI {
  /**
   * @param {import('./event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this.bus = bus;
    this.modal  = document.getElementById('choice-modal');
    this.prompt = document.getElementById('choice-prompt');
    this.list   = document.getElementById('choice-list');
    /** @type {function|null} animationend handler for choice-entering */
    this._enterEnd = null;

    this.bus.on('choice:show', (data) => this.show(data));
    this.bus.on('choice:dismiss', () => this.dismiss());
  }

  show({ prompt, options, onPick }) {
    this.prompt.textContent = prompt;
    this.list.innerHTML = '';

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => {
        this.bus.emit('sound:play', UI_SOUNDS.buttonClick);
        this.hide();
        onPick(opt);
      });
      this.list.appendChild(btn);
    }

    this._clearEnterEnd();
    this.modal.classList.remove('hidden');
    void this.modal.offsetHeight; // force reflow so animation restarts
    this.modal.classList.add('choice-entering');
    this._enterEnd = (e) => {
      if (e.target !== this.modal) return; // ignore bubbled child animations
      this._clearEnterEnd();
      this.modal.classList.remove('choice-entering');
    };
    this.modal.addEventListener('animationend', this._enterEnd);
  }

  hide() {
    this._clearEnterEnd();
    this.modal.classList.remove('choice-entering');
    this.modal.classList.add('hidden');
  }

  /** Force-dismiss the choice modal immediately. */
  dismiss() {
    this._clearEnterEnd();
    this.modal.classList.remove('choice-entering');
    this.modal.classList.add('hidden');
    this.list.innerHTML = '';
  }

  /** Detach a pending choice-entering animationend listener, if any. */
  _clearEnterEnd() {
    if (!this._enterEnd) return;
    this.modal.removeEventListener('animationend', this._enterEnd);
    this._enterEnd = null;
  }
}
