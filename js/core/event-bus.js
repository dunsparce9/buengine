/**
 * Minimal publish / subscribe event bus.
 * Used to decouple engine subsystems.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }

  /** Emit an event with optional payload. */
  emit(event, payload) {
    const fns = this._listeners.get(event);
    if (fns) fns.forEach(fn => fn(payload));
  }
}
