/**
 * Title screen and pause screen management.
 */
export class OverlayUI {
  /**
   * @param {import('./event-bus.js').EventBus} bus
   */
  constructor(bus) {
    this.bus = bus;

    // Title screen elements
    this.title        = document.getElementById('title-screen');
    this.titleText    = document.getElementById('title-text');
    this.titleSub     = document.getElementById('title-subtitle');
    this.startBtn     = document.getElementById('title-start-btn');

    // Pause screen elements
    this.pause        = document.getElementById('pause-screen');
    this.resumeBtn    = document.getElementById('pause-resume-btn');
    this.toTitleBtn   = document.getElementById('pause-title-btn');

    // Bind buttons
    this.startBtn.addEventListener('click', () => {
      this.hideTitle();
      this.bus.emit('game:start');
    });
    this.resumeBtn.addEventListener('click', () => this.hidePause());
    this.toTitleBtn.addEventListener('click', () => {
      this.hidePause();
      this.bus.emit('game:title');
    });

    // Escape key toggles pause
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.title.classList.contains('hidden')) return;
        this.pause.classList.toggle('hidden');
      }
    });

    // Listen for engine events
    this.bus.on('overlay:title', (cfg) => this.showTitle(cfg));
    this.bus.on('overlay:pause', () => this.showPause());
  }

  showTitle(cfg = {}) {
    this.titleText.textContent = cfg.title || 'büeARG';
    this.titleSub.textContent  = cfg.subtitle || '';
    this.title.classList.remove('hidden');
    this.pause.classList.add('hidden');
  }

  hideTitle() {
    this.title.classList.add('hidden');
  }

  showPause() {
    this.pause.classList.remove('hidden');
  }

  hidePause() {
    this.pause.classList.add('hidden');
  }
}
