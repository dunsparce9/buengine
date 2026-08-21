/**
 * Manages audio playback for the game engine.
 * Listens on the EventBus for sound commands and drives the Web Audio API.
 *
 * Bus events:
 *   sound:play  { id, path, volume?, fade?, loop?, blocking?, onDone }
 *   sound:stop  { id, fade?, blocking?, onDone }
 *   sound:stopall
 *   overlay:paused  /  overlay:resumed  (subscribed in main.js → pauseAll/resumeAll)
 */
import { Paths } from './paths.js';

/** Shared UI click sounds — single source of truth for id + path. */
export const UI_SOUNDS = {
  buttonClick:   { id: '__ui_btn', path: 'sounds/common/button-click.opus' },
  dialogueClick: { id: '__ui_dlg', path: 'sounds/common/dialogue-click.opus' },
};

export class SoundManager {
  /** @param {import('./event-bus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    /** @type {Map<string, { audio: HTMLAudioElement, fade?: {timer: number, onDone: function|null, finished: boolean}, _wasPlaying?: boolean, _pausedVolume?: number }>} */
    this._sounds = new Map();
    /** Set once UI sounds have been speculatively preloaded. */
    this._uiPreloaded = false;

    bus.on('sound:play',    (p)     => this._play(p));
    bus.on('sound:stop',    (p)     => this._stop(p));
    bus.on('sound:stopall', ()      => this._stopAll());
  }

  /** Speculatively preload common UI sounds so first-play has no network delay. */
  _preloadUISounds() {
    if (this._uiPreloaded) return;
    this._uiPreloaded = true;
    this._preloaded = Object.values(UI_SOUNDS).map(({ path }) => {
      const a = new Audio();
      a.preload = 'auto';
      a.src = Paths.resolve(path);
      return a;
    });
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
    this._preloadUISounds();
    // Stop any existing sound with this id first
    this._stopImmediate(id);

    const audio = new Audio(Paths.resolve(path));
    audio.loop = loop;

    if (fade > 0) {
      audio.volume = 0;
      audio.play().then(() => {
        const entry = this._sounds.get(id);
        if (!entry || entry.audio !== audio) {
          // Sound was stopped/replaced before play resolved — don't strand the chain
          if (blocking) onDone?.();
          return;
        }
        this._fadeVolume(entry, 0, volume, fade, blocking ? onDone : null);
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
      this._fadeVolume(entry, entry.audio.volume, 0, fade, () => {
        this._stopImmediate(id);
        if (blocking) onDone?.();
      });
      if (!blocking) onDone?.();
    } else {
      this._stopImmediate(id);
      onDone?.();
    }
  }

  /** Cancel any live fade on an entry; fires its onDone exactly once so blocking chains never hang. */
  _cancelEntryFade(entry) {
    const fade = entry.fade;
    if (!fade || fade.finished) return;
    fade.finished = true;
    clearInterval(fade.timer);
    entry.fade = null;
    fade.onDone?.();
  }

  /** Hard-stop and remove a sound by id. */
  _stopImmediate(id) {
    const entry = this._sounds.get(id);
    if (!entry) return;
    // Kill any live fade first (its onDone still fires once, keeping blocking chains alive)
    this._cancelEntryFade(entry);
    entry.audio.pause();
    entry.audio.src = '';
    this._sounds.delete(id);
  }

  /** Stop all currently playing sounds immediately. */
  _stopAll() {
    for (const id of [...this._sounds.keys()]) {
      this._stopImmediate(id);
    }
  }

  /**
   * Suspend every active sound in place (pause playback, remember state)
   * so it can be restored later by resumeAll().
   */
  pauseAll() {
    for (const entry of this._sounds.values()) {
      const audio = entry.audio;
      entry._wasPlaying = !audio.paused;
      entry._pausedVolume = audio.volume;
      audio.pause();
    }
  }

  /**
   * Restore every sound suspended by pauseAll(): rewind volume to its
   * pre-pause level and resume playback where it left off.
   */
  resumeAll() {
    for (const entry of this._sounds.values()) {
      const audio = entry.audio;
      if (entry._pausedVolume !== undefined) audio.volume = entry._pausedVolume;
      if (entry._wasPlaying && audio.paused) {
        audio.play().catch(() => {});
      }
      delete entry._wasPlaying;
      delete entry._pausedVolume;
    }
  }

  /**
   * Linearly interpolate an entry's audio volume over `duration` seconds.
   * The interval is tracked on the entry so _stopImmediate/_stopAll can cancel it.
   * onDone fires exactly once — on natural completion or forced cancellation.
   * @param {{audio: HTMLAudioElement, fade?: object}} entry  sound entry from this._sounds
   * @param {number} from
   * @param {number} to
   * @param {number} duration  seconds
   * @param {function|null} onDone  called when fade completes
   */
  _fadeVolume(entry, from, to, duration, onDone) {
    const audio = entry.audio;
    const steps = Math.max(1, Math.round(duration * 60)); // ~60 fps
    const interval = (duration * 1000) / steps;
    const delta = (to - from) / steps;
    let step = 0;

    // A new fade on the same entry supersedes any previous one (its onDone still fires once)
    this._cancelEntryFade(entry);

    const state = { timer: null, onDone, finished: false };
    const finish = () => {
      if (state.finished) return; // never fire onDone twice
      state.finished = true;
      clearInterval(state.timer);
      if (entry.fade === state) entry.fade = null;
      onDone?.();
    };
    state.timer = setInterval(() => {
      if (state.finished) return; // cancelled mid-tick
      step++;
      if (step >= steps) {
        audio.volume = Math.max(0, Math.min(1, to));
        finish();
      } else if (!audio.paused) {
        // Don't fight a global pause — resumeAll() restores volume itself
        audio.volume = Math.max(0, Math.min(1, from + delta * step));
      }
    }, interval);
    entry.fade = state;
  }
}
