/**
 * Renders a multiple-choice modal from a choice command.
 */
export class ChoiceUI {
  /**
   * @param {import('./event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this.bus = bus;
    this.modal  = document.getElementById('choice-modal');
    this.prompt = document.getElementById('choice-prompt');
    this.list   = document.getElementById('choice-list');
    this._basePath = '';

    this.bus.on('game:basepath', (bp) => { this._basePath = bp; });
    this.bus.on('choice:show', (data) => this.show(data));
  }

  show({ prompt, options, onPick }) {
    this.prompt.textContent = prompt;
    this.list.innerHTML = '';

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => {
        this.bus.emit('sound:play', { id: '__ui_btn', path: 'sounds/common/button-click.opus' });
        this.hide();
        onPick(opt);
      });
      this.list.appendChild(btn);
    }

    this.modal.classList.remove('hidden');
    void this.modal.offsetHeight; // force reflow so animation restarts
    this.modal.classList.add('choice-entering');
    setTimeout(() => this.modal.classList.remove('choice-entering'), 300);
  }

  hide() {
    this.modal.classList.add('hidden');
  }
}
