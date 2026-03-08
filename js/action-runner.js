/**
 * Walks through an action sequence (array of command objects) and
 * dispatches behaviour to the appropriate UI / state subsystem.
 *
 * Supported commands:
 *   { "say": "Hello!", "speaker": "Ada" }
 *   { "choice": { "prompt": "What now?", "options": [ { "text": "Go left", "actions": [...] }, ... ] } }
 *   { "goto": "scene_id" }
 *   { "set": { "flag_name": value } }
 *   { "if": "flag_name", "then": [...], "else": [...] }
 *   { "wait": 500 }            // milliseconds
 *   { "emit": "custom:event" } // fire a bus event
 *   { "run": "definition_name" } // call a named definition (supports recursion)
 *   { "exit": true }           // stop the entire action chain
 */
export class ActionRunner {
  /**
   * @param {object} deps
   * @param {import('./event-bus.js').EventBus} deps.bus
   * @param {import('./game-state.js').GameState} deps.state
   */
  constructor({ bus, state }) {
    this.bus = bus;
    this.state = state;
    this._aborted = false;
    this._exited = false;
    this.running = false;
    /** @type {Record<string, object[]>} Named action sequences from the current scene. */
    this.definitions = {};
  }

  /** Cancel any running sequence (external). */
  abort() { this._aborted = true; this.running = false; }

  /**
   * Execute an array of action commands sequentially.
   * @param {object[]} actions
   * @param {boolean}  [_nested=false]  Internal flag — true when called recursively.
   */
  async run(actions, _nested = false) {
    if (!_nested) {
      this._aborted = false;
      this._exited = false;
      this.running = true;
    }

    for (const action of actions) {
      if (this._aborted || this._exited) return;

      if (action.say != null) {
        await this._say(action);
      } else if (action.choice) {
        await this._choice(action.choice);
      } else if (action.goto) {
        this.bus.emit('scene:goto', action.goto);
        return; // scene change ends this sequence
      } else if (action.set) {
        for (const [k, v] of Object.entries(action.set)) {
          this.state.setFlag(k, v);
        }
      } else if (action.if != null) {
        const result = this.state.hasFlag(action.if);
        const branch = result ? action.then : action.else;
        if (branch) await this.run(branch, true);
      } else if (action.wait) {
        await this._delay(action.wait);
      } else if (action.emit) {
        this.bus.emit(action.emit, action.payload);
      } else if (action.run) {
        const def = this.definitions[action.run];
        if (def) await this.run(def, true);
      } else if (action.exit != null) {
        this._exited = true;
        return;
      }
    }

    if (!_nested) {
      this.running = false;
    }
  }

  /* ── private helpers ──────────────────────────── */

  _say(action) {
    return new Promise(resolve => {
      this.bus.emit('dialogue:show', {
        speaker: action.speaker || '',
        text: action.say,
        onDone: resolve,
      });
    });
  }

  _choice(choiceDef) {
    return new Promise(resolve => {
      this.bus.emit('choice:show', {
        prompt: choiceDef.prompt || '',
        options: choiceDef.options,
        onPick: async (option) => {
          if (option.actions) await this.run(option.actions, true);
          resolve();
        },
      });
    });
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
