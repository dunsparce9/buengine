/**
 * Title screen and pause screen management.
 */
export class OverlayUI {
  /**
   * @param {import('../core/event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this.bus = bus;

    // Title screen elements
    this.title        = document.getElementById('title-screen');
    this.titleText    = document.getElementById('title-text');
    this.titleSub     = document.getElementById('title-subtitle');
    this.startBtn     = document.getElementById('title-start-btn');
    this.startLabel   = document.getElementById('title-start-label');
    this.newGameBtn   = document.getElementById('title-new-game-btn');
    this.hasSave = false;
    this._gameActive = false;
    this._saveAvailable = false;

    // Pause screen elements
    this.pause        = document.getElementById('pause-screen');
    this.resumeBtn    = document.getElementById('pause-resume-btn');
    this.toTitleBtn   = document.getElementById('pause-title-btn');
    this.saveBtn      = document.getElementById('pause-save-btn');
    this.loadBtn      = document.getElementById('pause-load-btn');
    this.saveStatus   = document.getElementById('pause-save-status');

    // Bind buttons
    this.startBtn.addEventListener('click', () => {
      this.hideTitle();
      this.bus.emit(this.hasSave ? 'game:continue' : 'game:start');
    });
    this.newGameBtn.addEventListener('click', () => {
      this.hideTitle();
      this.bus.emit('game:start');
    });
    this.saveBtn.addEventListener('click', () => this.bus.emit('game:save'));
    this.loadBtn.addEventListener('click', () => this.bus.emit('game:load'));
    this.resumeBtn.addEventListener('click', () => this.hidePause());
    this.toTitleBtn.addEventListener('click', () => {
      this.hidePause();
      this.bus.emit('game:title');
    });

    // Escape key toggles pause
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.isPaused) {
        const buttons = [...this.pause.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        e.preventDefault();
        buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (!this._gameActive) return;
        if (!this.title.classList.contains('hidden')) return;
        if (this.pause.classList.contains('hidden')) {
          this.showPause();
        } else {
          this.hidePause();
        }
      }
    });

    // Listen for engine events
    this.bus.on('overlay:title', (cfg) => this.showTitle(cfg));
    this.bus.on('overlay:pause', () => this.showPause());
    this.bus.on('game:active', active => {
      this._gameActive = active;
      this.saveBtn.disabled = !active;
      this.loadBtn.disabled = !active || !this._saveAvailable;
    });
    this.bus.on('save:available', available => {
      this._saveAvailable = available;
      this.loadBtn.disabled = !available || !this._gameActive;
    });
    this.bus.on('save:status', message => { this.saveStatus.textContent = message; });
  }

  showTitle(cfg = {}) {
    this.titleText.textContent = cfg.title || 'büengine';
    this.titleSub.textContent  = cfg.subtitle || '';
    this.hasSave = !!cfg.hasSave;
    this.startLabel.textContent = this.hasSave ? 'Continue' : 'Start';
    this.newGameBtn.classList.toggle('hidden', !this.hasSave);
    this.title.classList.remove('hidden');
    this.pause.classList.add('hidden');
  }

  hideTitle() {
    this.title.classList.add('hidden');
  }

  showPause() {
    if (!this._gameActive || this.isPaused) return;
    this.saveStatus.textContent = '';
    this._pauseFocus = document.activeElement;
    this.pause.classList.remove('hidden');
    this.bus.emit('overlay:paused');
    this.resumeBtn.focus({ preventScroll: true });
  }

  hidePause() {
    if (!this.isPaused) return;
    this.pause.classList.add('hidden');
    this.bus.emit('overlay:resumed');
    if (this._pauseFocus?.isConnected) this._pauseFocus.focus({ preventScroll: true });
    this._pauseFocus = null;
  }

  get isPaused() { return !this.pause.classList.contains('hidden'); }
}
