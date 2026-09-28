import { UI_SOUNDS } from '../core/sound-manager.js';

const DEFAULT_TYPEWRITER_SPEED_MS = 30;

/**
 * Manages the dialogue box UI: show text, optional speaker name,
 * typewriter animation, and click-to-advance.
 */
export class DialogueUI {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
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
    /** @type {function|null} animationend handler for dialogue-entering */
    this._enterEnd = null;
    /** @type {function|null} animationend handler for dialogue-leaving */
    this._leaveEnd = null;

    this.box.addEventListener('click', () => this._advance());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.box.classList.contains('hidden')) {
        e.preventDefault();
        this._advance();
      }
    });
    this.bus.on('dialogue:show', (data) => this.show(data));
    this.bus.on('dialogue:dismiss', () => this.dismiss());
  }

  show({ speaker, accent, text, typewriterSpeed, delay, onDone }) {
    this._stopType();
    this._clearLock();
    this.box.style.setProperty('--dialogue-accent', accent || '#f0c040');
    this.speaker.textContent = speaker;
    this._fullText = text;
    this._onDone = onDone;
    this.text.textContent = '';

    const wasHidden = this.box.classList.contains('hidden');
    // Cancel any pending enter/leave animation from a previous show/hide
    this._clearEnterEnd();
    this._clearLeaveEnd();
    this.box.classList.remove('hidden', 'dialogue-leaving');
    this.sceneLayer.classList.add('dialogue-active');

    if (wasHidden) {
      void this.box.offsetHeight; // force reflow so animation restarts
      this.box.classList.add('dialogue-entering');
      this._enterEnd = (e) => {
        if (e.target !== this.box) return; // ignore bubbled child animations
        this._clearEnterEnd();
        this.box.classList.remove('dialogue-entering');
      };
      this.box.addEventListener('animationend', this._enterEnd);
    }

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

    this._typewrite(text, typewriterSpeed);
  }

  hide() {
    if (this.box.classList.contains('hidden')) return;
    this._stopType();
    this.hint.classList.add('hidden');
    this.sceneLayer.classList.remove('dialogue-active');
    this._clearLock();
    this._clearEnterEnd();
    this.box.classList.remove('dialogue-entering');
    this.box.classList.add('dialogue-leaving');
    this._leaveEnd = (e) => {
      if (e.target !== this.box) return; // ignore bubbled child animations
      this._clearLeaveEnd();
      if (!this.box.isConnected) return;
      this.box.classList.remove('dialogue-leaving');
      this.box.classList.add('hidden');
    };
    this.box.addEventListener('animationend', this._leaveEnd);
  }

  /** Force-dismiss the dialogue immediately (no animation). Resolves the pending onDone callback. */
  dismiss() {
    this._stopType();
    this._clearLock();
    this._clearEnterEnd();
    this._clearLeaveEnd();
    this.hint.classList.add('hidden');
    this.sceneLayer.classList.remove('dialogue-active');
    this.box.classList.remove('dialogue-entering', 'dialogue-leaving');
    this.box.classList.add('hidden');
    const cb = this._onDone;
    this._onDone = null;
    if (cb) cb();
  }

  /* ── internals ───────────────────────────────── */

  _typewrite(str, speedMs = DEFAULT_TYPEWRITER_SPEED_MS) {
    const cadence = Number.isFinite(speedMs) ? Math.max(0, speedMs) : DEFAULT_TYPEWRITER_SPEED_MS;
    if (!str || cadence === 0) {
      this._typing = false;
      this.text.textContent = str || '';
      if (!this._locked) {
        this.text.appendChild(this.hint);
        this.hint.classList.remove('hidden');
      }
      return;
    }

    this._typing = true;
    this.hint.classList.add('hidden');
    let i = 0;
    this._timer = setInterval(() => {
      if (i >= str.length) {
        this._stopType();
        return;
      }
      this.text.textContent += str[i++];
    }, cadence);
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

  /** Detach a pending dialogue-entering animationend listener, if any. */
  _clearEnterEnd() {
    if (!this._enterEnd) return;
    this.box.removeEventListener('animationend', this._enterEnd);
    this._enterEnd = null;
  }

  /** Detach a pending dialogue-leaving animationend listener, if any. */
  _clearLeaveEnd() {
    if (!this._leaveEnd) return;
    this.box.removeEventListener('animationend', this._leaveEnd);
    this._leaveEnd = null;
  }

  _advance() {
    if (this._locked) return;
    if (this.box.classList.contains('dialogue-leaving')) return;
    if (this._typing) {
      // Skip to full text — no click sound for skip
      this._stopType();
    } else {
      this.bus.emit('sound:play', UI_SOUNDS.dialogueClick);
      this.hide();
      const onDone = this._onDone;
      this._onDone = null;
      onDone?.();
    }
  }
}
