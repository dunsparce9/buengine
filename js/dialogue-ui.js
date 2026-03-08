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
    this._locked  = false;
    this._lockTimer = null;
    this._basePath = '';

    this.bus.on('game:basepath', (bp) => { this._basePath = bp; });
    this.box.addEventListener('click', () => this._advance());
    this.bus.on('dialogue:show', (data) => this.show(data));
  }

  show({ speaker, text, delay, onDone }) {
    this._stopType();
    this._clearLock();
    this.speaker.textContent = speaker;
    this._fullText = text;
    this._onDone = onDone;
    this.text.textContent = '';
    this.box.classList.remove('hidden');
    this.sceneLayer.classList.add('dialogue-active');
    this._typewrite(text);

    if (delay > 0) {
      this._locked = true;
      this.box.classList.add('dialogue-locked');
      this.hint.classList.add('hidden');
      this._lockTimer = setTimeout(() => {
        this._clearLock();
        if (!this._typing) {
          this.text.appendChild(this.hint);
          this.hint.classList.remove('hidden');
        }
      }, delay * 1000);
    }
  }

  hide() {
    this.box.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.sceneLayer.classList.remove('dialogue-active');
    this._stopType();
    this._clearLock();
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
    if (!this._locked) {
      this.text.appendChild(this.hint);
      this.hint.classList.remove('hidden');
    }
  }

  _clearLock() {
    clearTimeout(this._lockTimer);
    this._locked = false;
    this.box.classList.remove('dialogue-locked');
  }

  _advance() {
    if (this._locked) return;
    if (this._typing) {
      // Skip to full text — no click sound for skip
      this._stopType();
    } else {
      this.bus.emit('sound:play', { id: '__ui_dlg', path: 'sounds/common/dialogue-click.opus' });
      this.hide();
      if (this._onDone) this._onDone();
    }
  }
}
