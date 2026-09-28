/** Numeric entity tweens, independent of DOM layout and action-chain blocking. */
const CURVES = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};
const PROPERTIES = ['x', 'y', 'w', 'h', 'rotation', 'scaleX', 'scaleY', 'opacity'];
const PIVOTS = {
  center: '50% 50%',
  'top-left': '0% 0%', 'top-center': '50% 0%', 'top-right': '100% 0%',
  'middle-left': '0% 50%', 'middle-center': '50% 50%', 'middle-right': '100% 50%',
  'bottom-left': '0% 100%', 'bottom-center': '50% 100%', 'bottom-right': '100% 100%',
};

function ease(progress, curve) {
  if (!curve || progress === 0 || progress === 1) return progress;
  const bezier = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2;
    if (bezier(t, curve[0], curve[2]) < progress) low = t;
    else high = t;
  }
  return bezier((low + high) / 2, curve[1], curve[3]);
}

export class EntityAnimator {
  constructor(bus, { getEntity, getState, applyState }) {
    this._getEntity = getEntity;
    this._getState = getState;
    this._applyState = applyState;
    this._jobs = new Set();
    this._paused = false;
    this._frame = null;
    bus.on('entity:animate', payload => this._start(payload));
    bus.on('entity:animate-cancel', ({ owner, family }) => {
      this._cancel(job => family != null ? job.family === family : job.owner === owner);
    });
    bus.on('overlay:paused', () => this._pause());
    bus.on('overlay:resumed', () => this._resume());
  }

  _start({ target = 'object', id, from = {}, to = {}, seconds = 1, easing = 'ease-in-out', pivot, blocking, owner, family, onDone }) {
    if (target !== 'object' && target !== 'scene') throw new Error(`Animate: unsupported target "${target}"`);
    const entry = this._getEntity(id, target);
    if (!entry) throw new Error(`Animate: entity "${id ?? 'this'}" does not exist`);
    if (!from || typeof from !== 'object' || Array.isArray(from)) throw new Error('Animate: from must be an object');
    if (!to || typeof to !== 'object' || Array.isArray(to)) throw new Error('Animate: to must be an object');
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Animate: seconds must be a non-negative number');
    if (easing !== 'linear' && !Object.hasOwn(CURVES, easing)) throw new Error(`Animate: unsupported easing "${easing}"`);
    if (target !== 'scene' && pivot != null && !Object.hasOwn(PIVOTS, pivot)) throw new Error(`Animate: unsupported pivot "${pivot}"`);
    const targets = {};
    for (const key of target === 'scene' ? ['opacity'] : [...PROPERTIES, 'scale']) {
      if (to[key] == null) continue;
      if (!Number.isFinite(to[key]) || ((key === 'w' || key === 'h') && to[key] < 0)) {
        throw new Error(`Animate: ${key} must be a finite${key === 'w' || key === 'h' ? ' non-negative' : ''} number`);
      }
      targets[key] = to[key];
    }
    for (const value of [targets.opacity, from.opacity]) {
      if (value != null && (!Number.isFinite(value) || value < 0 || value > 1)) {
        throw new Error('Animate: opacity must be a number between 0 and 1');
      }
    }
    if (from.opacity != null && targets.opacity == null) throw new Error('Animate: starting opacity requires a target opacity');
    if (targets.scale != null) {
      targets.scaleX ??= targets.scale;
      targets.scaleY ??= targets.scale;
      delete targets.scale;
    }
    const keys = Object.keys(targets);
    if (!keys.length) { onDone?.(); return; }
    const now = performance.now();
    if (!this._paused) this._advance(now);
    const state = this._getState(entry);
    // Replace only overlapping properties; other motion on this entity continues.
    for (const job of [...this._jobs]) {
      if (job.entry !== entry) continue;
      for (const key of keys) delete job.tracks[key];
      if (!Object.keys(job.tracks).length) this._finish(job);
    }
    if (target !== 'scene' && pivot != null) entry.el.style.transformOrigin = PIVOTS[pivot];
    if (keys.includes('opacity')) {
      // Clear an older CSS fade, retaining its currently displayed opacity.
      entry.el.style.transition = '';
      state.opacity = from.opacity ?? state.opacity;
      this._applyState(entry, ['opacity']);
    }
    if (seconds === 0) {
      Object.assign(state, targets);
      this._applyState(entry, keys);
      onDone?.();
      return;
    }
    const tracks = Object.fromEntries(keys.map(key => [key, [state[key], targets[key]]]));
    this._jobs.add({ entry, state, tracks, duration: seconds * 1000, elapsed: 0, updatedAt: now,
      curve: easing === 'linear' ? null : CURVES[easing], owner, family, onDone: blocking ? onDone : null });
    if (!blocking) onDone?.();
    this._schedule();
  }

  _schedule() {
    if (this._paused || this._frame != null || !this._jobs.size) return;
    this._frame = requestAnimationFrame(now => {
      this._frame = null;
      this._advance(now);
      this._schedule();
    });
  }

  _advance(now) {
    for (const job of [...this._jobs]) {
      if (!this._jobs.has(job)) continue;
      job.elapsed += Math.max(0, now - job.updatedAt);
      job.updatedAt = now;
      const progress = Math.min(1, job.elapsed / job.duration);
      const amount = ease(progress, job.curve);
      for (const [key, [from, to]] of Object.entries(job.tracks)) {
        job.state[key] = progress === 1 ? to : from + (to - from) * amount;
      }
      this._applyState(job.entry, Object.keys(job.tracks));
      if (progress === 1) this._finish(job);
    }
  }

  _finish(job) {
    if (!this._jobs.delete(job)) return;
    const done = job.onDone;
    job.onDone = null;
    done?.();
    if (!this._jobs.size && this._frame != null) {
      cancelAnimationFrame(this._frame);
      this._frame = null;
    }
  }

  _cancel(matches) {
    if (!this._paused) this._advance(performance.now());
    for (const job of [...this._jobs]) if (matches(job)) this._finish(job);
  }

  cancelEntity(entry) { this._cancel(job => job.entry === entry); }

  _pause() {
    if (this._paused) return;
    this._advance(performance.now());
    this._paused = true;
    if (this._frame != null) cancelAnimationFrame(this._frame);
    this._frame = null;
  }

  _resume() {
    if (!this._paused) return;
    this._paused = false;
    const now = performance.now();
    for (const job of this._jobs) job.updatedAt = now;
    this._schedule();
  }
}
