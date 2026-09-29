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
    this._lockDeadline = null;
    this._lockRemaining = 0;
    this._paused = false;
    this._index = 0;
    this._waitId = null;
    this._saved = null;
    /** @type {function|null} animationend handler for dialogue-entering */
    this._enterEnd = null;
    /** @type {function|null} animationend handler for dialogue-leaving */
    this._leaveEnd = null;

    this.box.addEventListener('click', () => this._advance());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this._paused && !this.box.classList.contains('hidden')
          && !e.target.closest?.('button, input, textarea, select, [contenteditable="true"]')) {
        e.preventDefault();
        this._advance();
      }
    });
    this.bus.on('dialogue:show', (data) => this.show(data));
    this.bus.on('dialogue:dismiss', () => this.dismiss());
    this.bus.on('overlay:paused', () => this._pause());
    this.bus.on('overlay:resumed', () => this._resume());
  }

  show({ speaker, accent, text, typewriterSpeed, delay, onDone, waitId }) {
    this._stopType();
    this._clearLock();
    this.box.style.setProperty('--dialogue-accent', accent || '#f0c040');
    this.speaker.textContent = speaker;
    this._fullText = text;
    this._onDone = onDone;
    this._waitId = waitId;
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
      this._lockRemaining = delay * 1000;
      this._startLock();
    }

    this._typewrite(text, typewriterSpeed);
    if (this._saved?.waitId === waitId) {
      const saved = this._saved;
      this._saved = null;
      clearInterval(this._timer);
      this._index = saved.index;
      this._typing = saved.typing;
      this.text.textContent = this._typing ? text.slice(0, this._index) : text;
      this._clearLock();
      if (saved.lockRemaining > 0) {
        this._locked = true;
        this.box.classList.add('dialogue-locked');
        this._lockRemaining = saved.lockRemaining;
        this._startLock();
      }
      if (this._typing) this._startTypeTimer();
      this.hint.classList.toggle('hidden', this._typing || this._locked);
      if (!this._typing && !this._locked) this.text.appendChild(this.hint);
    }
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
    this._waitId = null;
    if (cb) cb();
  }

  /* ── internals ───────────────────────────────── */

  _typewrite(str, speedMs = DEFAULT_TYPEWRITER_SPEED_MS) {
    const cadence = Number.isFinite(speedMs) ? Math.max(0, speedMs) : DEFAULT_TYPEWRITER_SPEED_MS;
    if (!str || cadence === 0) {
      this._typing = false;
      this._index = str?.length || 0;
      this.text.textContent = str || '';
      if (!this._locked) {
        this.text.appendChild(this.hint);
        this.hint.classList.remove('hidden');
      }
      return;
    }

    this._cadence = cadence;
    this._index = 0;
    this._typing = true;
    this.hint.classList.add('hidden');
    this._startTypeTimer();
  }

  _startTypeTimer() {
    if (this._paused) return;
    this._timer = setInterval(() => {
      if (this._index >= this._fullText.length) {
        this._stopType();
        return;
      }
      this.text.textContent += this._fullText[this._index++];
    }, this._cadence);
  }

  _stopType() {
    clearInterval(this._timer);
    this._typing = false;
    this._index = this._fullText.length;
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
    this._lockDeadline = null;
    this._lockRemaining = 0;
  }

  _startLock() {
    if (this._paused) return;
    this._lockDeadline = performance.now() + this._lockRemaining;
    this._lockTimer = setTimeout(() => {
      this._clearLock();
      if (!this._typing) {
        this.text.appendChild(this.hint);
        this.hint.classList.remove('hidden');
      }
    }, this._lockRemaining);
  }

  _pause() {
    if (this._paused) return;
    this._paused = true;
    clearInterval(this._timer);
    if (this._locked && this._lockDeadline != null) {
      this._lockRemaining = Math.max(0, this._lockDeadline - performance.now());
      this._lockDeadline = null;
      clearTimeout(this._lockTimer);
    }
  }

  _resume() {
    if (!this._paused) return;
    this._paused = false;
    if (this._typing) this._startTypeTimer();
    if (this._locked) this._startLock();
  }

  snapshot() {
    return this._waitId ? { waitId: this._waitId, index: this._index, typing: this._typing,
      lockRemaining: this._locked ? (this._lockDeadline == null ? this._lockRemaining
        : Math.max(0, this._lockDeadline - performance.now())) : 0 } : null;
  }

  restore(snapshot) { this._saved = snapshot; }

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
    if (this._paused) return;
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
      this._waitId = null;
      onDone?.();
    }
  }
}
