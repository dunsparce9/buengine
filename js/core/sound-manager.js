/**
 * Manages audio playback for the game engine.
 * Listens on the EventBus for sound commands and manages HTML audio elements.
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
    this._sounds = new Map();
    this._paused = false;
    this._preloaded = [];
    this._uiPaths = [];

    bus.on('sound:play',    (p)     => this._play(p));
    bus.on('sound:stop',    (p)     => this._stop(p));
    bus.on('sound:stopall', ()      => this._stopAll());
  }

  /** Speculatively preload common UI sounds so first-play has no network delay. */
  _preloadUISounds() {
    const paths = Object.values(UI_SOUNDS).map(({ path }) => Paths.resolve(path));
    if (paths.every((path, index) => path === this._uiPaths[index])) return;
    for (const audio of this._preloaded) audio.src = '';
    this._uiPaths = paths;
    this._preloaded = paths.map((path) => {
      const a = new Audio();
      a.preload = 'auto';
      a.src = path;
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
    audio.volume = fade > 0 ? 0 : volume;
    const entry = {
      audio,
      volume,
      fadeIn: fade,
      onDone: blocking && (fade > 0 || !loop) ? onDone : null,
      pausedByOverlay: this._paused,
      _wasPlaying: this._paused,
    };
    this._sounds.set(id, entry);
    // Install completion handlers before playback can finish or fail.
    audio.onended = audio.onerror = () => this._stopImmediate(id, entry);
    if (!this._paused) this._startPlayback(id, entry);
    if (!entry.onDone) onDone?.();
  }

  /** Start or resume this entry; stale play promises cannot alter a replacement. */
  _startPlayback(id, entry) {
    const pending = entry.audio.play();
    entry.playPromise = pending;
    pending.then(() => {
      if (entry.playPromise !== pending) return;
      entry.playPromise = null;
      if (this._sounds.get(id) !== entry || entry.stopping) return;
      if (entry.fadeIn > 0) {
        const seconds = entry.fadeIn;
        entry.fadeIn = 0;
        this._fadeVolume(entry, 0, entry.volume, seconds, () => this._complete(entry));
      }
    }).catch(() => {
      if (entry.playPromise !== pending) return;
      entry.playPromise = null;
      this._stopImmediate(id, entry);
    });
  }

  /** Consume the current command's completion once, including cancellation. */
  _complete(entry) {
    const onDone = entry.onDone;
    entry.onDone = null;
    onDone?.();
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

    // Supersede the play/previous stop command without running fade side effects.
    this._cancelEntryFade(entry);
    this._complete(entry);
    if (this._sounds.get(id) !== entry) { onDone?.(); return; }
    entry.stopping = true;
    entry.onDone = blocking ? onDone : null;
    if (fade > 0) {
      this._fadeVolume(entry, entry.audio.volume, 0, fade, () => {
        this._stopImmediate(id, entry);
      });
      if (!blocking) onDone?.();
    } else {
      this._stopImmediate(id, entry);
      if (!blocking) onDone?.();
    }
  }

  /** Cancel the timer only; natural fade completion may have removal side effects. */
  _cancelEntryFade(entry) {
    if (!entry.fade) return;
    clearInterval(entry.fade.timer);
    entry.fade = null;
  }

  /** Hard-stop and remove a sound by id. */
  _stopImmediate(id, entry = this._sounds.get(id)) {
    if (!entry || this._sounds.get(id) !== entry) return;
    this._cancelEntryFade(entry);
    this._sounds.delete(id);
    entry.playPromise = null;
    entry.audio.onended = entry.audio.onerror = null;
    entry.audio.pause();
    entry.audio.src = '';
    this._complete(entry);
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
    this._paused = true;
    for (const entry of this._sounds.values()) {
      const audio = entry.audio;
      if (entry.pausedByOverlay) continue;
      entry.pausedByOverlay = true;
      entry._wasPlaying = !audio.paused || !!entry.playPromise;
      // pause() can reject a pending play(). Only a fresh resume may restart it.
      entry.playPromise = null;
      audio.pause();
    }
  }

  /**
   * Restore every sound suspended by pauseAll(), including its unfinished fade.
   */
  resumeAll() {
    this._paused = false;
    for (const [id, entry] of this._sounds) {
      if (!entry.pausedByOverlay) continue;
      entry.pausedByOverlay = false;
      if (entry._wasPlaying) this._startPlayback(id, entry);
      delete entry._wasPlaying;
    }
  }

  /**
   * Linearly interpolate an entry's audio volume over `duration` seconds.
   * The interval is tracked on the entry so _stopImmediate/_stopAll can cancel it.
   * onDone runs only on natural completion; cancellation releases the command
   * separately through _complete(). Paused time does not advance the fade.
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

    this._cancelEntryFade(entry);

    const state = { timer: null };
    state.timer = setInterval(() => {
      if (entry.fade !== state || audio.paused || entry.pausedByOverlay) return;
      step++;
      if (step >= steps) {
        audio.volume = Math.max(0, Math.min(1, to));
        this._cancelEntryFade(entry);
        onDone?.();
      } else {
        audio.volume = Math.max(0, Math.min(1, from + delta * step));
      }
    }, interval);
    entry.fade = state;
  }
}
