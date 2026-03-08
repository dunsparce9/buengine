/**
 * Manages the dialogue box UI: show text, optional speaker name,
 * typewriter animation, and click-to-advance.
 */
export class DialogueUI {
  /**
   * @param {import('./event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this.bus = bus;
    this.box        = document.getElementById('dialogue-box');
    this.speaker    = document.getElementById('dialogue-speaker');
    this.text       = document.getElementById('dialogue-text');
    this.hint       = document.getElementById('dialogue-advance-hint');
    this.sceneLayer = document.getElementById('scene-layer');
    this._onDone  = null;
    this._typing  = false;
    this._fullText = '';
    this._timer   = null;

    this.box.addEventListener('click', () => this._advance());
    this.bus.on('dialogue:show', (data) => this.show(data));
  }

  show({ speaker, text, onDone }) {
    this._stopType();
    this.speaker.textContent = speaker;
    this._fullText = text;
    this._onDone = onDone;
    this.text.textContent = '';
    this.box.classList.remove('hidden');
    this.sceneLayer.classList.add('dialogue-active');
    this._typewrite(text);
  }

  hide() {
    this.box.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.sceneLayer.classList.remove('dialogue-active');
    this._stopType();
  }

  /* ── internals ───────────────────────────────── */

  _typewrite(str) {
    this._typing = true;
    this.hint.classList.add('hidden');
    let i = 0;
    this._timer = setInterval(() => {
      if (i >= str.length) {
        this._stopType();
        return;
      }
      this.text.textContent += str[i++];
    }, 30);
  }

  _stopType() {
    clearInterval(this._timer);
    this._typing = false;
    this.text.textContent = this._fullText;
    this.hint.classList.remove('hidden');
  }

  _advance() {
    if (this._typing) {
      // Skip to full text
      this._stopType();
    } else {
      this.hide();
      if (this._onDone) this._onDone();
    }
  }
}
