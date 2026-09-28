/**
 * Central game state: current scene, flags, visited history.
 * Persists nothing to disk by default — extend later for save/load.
 */
export class GameState {
  constructor() {
    this.currentScene = null;
    /** @type {Map<string, any>} */
    this.flags = new Map();
    /** @type {string[]} */
    this.history = [];
  }

  /** Set a named flag to a value. */
  setFlag(name, value = true) {
    this.flags.set(name, value);
  }

  /** Get a flag value (undefined if unset). */
  getFlag(name) {
    return this.flags.get(name);
  }

  /** Check a flag existence / truthiness. */
  hasFlag(name) {
    return !!this.flags.get(name);
  }

  /** Record that we entered a scene. */
  pushScene(sceneId) {
    this.currentScene = sceneId;
    this.history.push(sceneId);
  }

  /** Reset all state (e.g. new game). */
  reset() {
    this.currentScene = null;
    this.flags.clear();
    this.history.length = 0;
  }
}
