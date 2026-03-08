/**
 * Manages audio playback for the game engine.
 * Listens on the EventBus for sound commands and drives the Web Audio API.
 *
 * Bus events:
 *   sound:play  { id, path, volume?, fade?, loop?, blocking?, onDone }
 *   sound:stop  { id, fade?, blocking?, onDone }
 */
export class SoundManager {
  /** @param {import('./event-bus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    /** @type {Map<string, { audio: HTMLAudioElement, fade?: number }>} */
    this._sounds = new Map();

    /** Base path for resolving relative sound URLs. */
    this._basePath = '';

    bus.on('game:basepath', (bp) => {
      this._basePath = bp;
      this._preloadUISounds();
    });
    bus.on('sound:play', (p) => this._play(p));
    bus.on('sound:stop', (p) => this._stop(p));
  }

  /** Resolve a relative sound path against the game's base directory. */
  _resolve(path) {
    if (!this._basePath || !path) return path;
    return `${this._basePath}/${path}`;
  }

  /** Speculatively preload common UI sounds so first-play has no network delay. */
  _preloadUISounds() {
    /** @type {HTMLAudioElement[]} Keep references to prevent GC before load completes. */
    this._preloaded = [];
    const paths = [
      'sounds/common/button-click.opus',
      'sounds/common/dialogue-click.opus',
    ];
    for (const path of paths) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = this._resolve(path);
      this._preloaded.push(audio);
    }
  }

  /**
   * @param {object} p
   * @param {string} p.id
   * @param {string} p.path
   * @param {number} [p.volume=1]
   * @param {number} [p.fade=0]      fade-in duration in seconds
   * @param {boolean} [p.loop=false]
   * @param {boolean} [p.blocking=false]
   * @param {function} [p.onDone]
   */
  _play({ id, path, volume = 1, fade = 0, loop = false, blocking = false, onDone }) {
    // Stop any existing sound with this id first
    this._stopImmediate(id);

    const audio = new Audio(this._resolve(path));
    audio.loop = loop;

    if (fade > 0) {
      audio.volume = 0;
      audio.play().then(() => {
        this._fadeVolume(audio, 0, volume, fade, blocking ? onDone : null);
      }).catch(() => onDone?.());

      if (!blocking) onDone?.();
    } else {
      audio.volume = volume;

      if (blocking && !loop) {
        // Blocking non-looping sound: wait for playback to finish
        audio.play().then(() => {
          audio.addEventListener('ended', () => onDone?.(), { once: true });
        }).catch(() => onDone?.());
      } else {
        // Non-blocking (or looping+blocking): fire-and-forget
        audio.play().catch(() => {});
        onDone?.();
      }
    }

    this._sounds.set(id, { audio });
  }

  /**
   * @param {object} p
   * @param {string} p.id
   * @param {number} [p.fade=0]      fade-out duration in seconds
   * @param {boolean} [p.blocking=false]
   * @param {function} [p.onDone]
   */
  _stop({ id, fade = 0, blocking = false, onDone }) {
    const entry = this._sounds.get(id);
    if (!entry) { onDone?.(); return; }

    if (fade > 0) {
      this._fadeVolume(entry.audio, entry.audio.volume, 0, fade, () => {
        this._stopImmediate(id);
        if (blocking) onDone?.();
      });
      if (!blocking) onDone?.();
    } else {
      this._stopImmediate(id);
      onDone?.();
    }
  }

  /** Hard-stop and remove a sound by id. */
  _stopImmediate(id) {
    const entry = this._sounds.get(id);
    if (!entry) return;
    entry.audio.pause();
    entry.audio.src = '';
    this._sounds.delete(id);
  }

  /**
   * Linearly interpolate an audio element's volume over `duration` seconds.
   * @param {HTMLAudioElement} audio
   * @param {number} from
   * @param {number} to
   * @param {number} duration  seconds
   * @param {function|null} onDone  called when fade completes
   */
  _fadeVolume(audio, from, to, duration, onDone) {
    const steps = Math.max(1, Math.round(duration * 60)); // ~60 fps
    const interval = (duration * 1000) / steps;
    const delta = (to - from) / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      if (step >= steps) {
        audio.volume = Math.max(0, Math.min(1, to));
        clearInterval(timer);
        onDone?.();
      } else {
        audio.volume = Math.max(0, Math.min(1, from + delta * step));
      }
    }, interval);
  }
}
