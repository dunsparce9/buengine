/**
 * Walks through an action sequence (array of command objects) and
 * dispatches behaviour to the appropriate UI / state subsystem.
 *
 * Supported commands:
 *   { "say": "Hello!", "speaker": "Ada" }
 *   { "choice": { "prompt": "What now?", "options": [ { "text": "Go left", "actions": [...] }, ... ] } }
 *   { "goto": "scene_id" }
 *   { "set": { "flag_name": value } }                          // boolean / any value
 *   { "set": { "flag_name": "+1" } }                           // increment by N (string "+N" / "-N")
 *   { "set": { "flag_name": { "add": 1, "max": 5 } } }        // increment with optional min/max clamp
 *   { "if": "flag_name", "then": [...], "else": [...] }        // truthiness check
 *   { "if": "flag_name >= 3", "then": [...], "else": [...] }   // numeric comparison (==, !=, >, >=, <, <=)
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

    try {
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
          this._applySet(action.set);
        } else if (action.if != null) {
          const result = this._evalCondition(action.if);
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
    } finally {
      if (!_nested) {
        this.running = false;
      }
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

  /**
   * Apply a `set` action, supporting booleans, direct values,
   * string increment ("+1", "-2"), and object increment ({ add, max, min }).
   */
  _applySet(setObj) {
    for (const [key, spec] of Object.entries(setObj)) {
      if (typeof spec === 'string' && /^[+-]\d+$/.test(spec)) {
        // String increment shorthand: "+1", "-3", etc.
        const delta = parseInt(spec, 10);
        const cur = this.state.getFlag(key) ?? 0;
        this.state.setFlag(key, cur + delta);
      } else if (typeof spec === 'object' && spec !== null && 'add' in spec) {
        // Object increment: { add: N, max?: N, min?: N }
        const cur = this.state.getFlag(key) ?? 0;
        let val = cur + spec.add;
        if (spec.max != null) val = Math.min(val, spec.max);
        if (spec.min != null) val = Math.max(val, spec.min);
        this.state.setFlag(key, val);
      } else {
        this.state.setFlag(key, spec);
      }
    }
  }

  /** @type {RegExp} Matches "flag_name op value" comparison expressions */
  static _CMP_RE = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

  /**
   * Evaluate an `if` condition string.
   * - Plain name → truthiness check (backward-compatible).
   * - "flag op value" → numeric comparison.
   */
  _evalCondition(expr) {
    const m = ActionRunner._CMP_RE.exec(expr);
    if (!m) return this.state.hasFlag(expr);

    const flag = this.state.getFlag(m[1].trim()) ?? 0;
    const val = Number(m[3].trim());
    switch (m[2]) {
      case '==': return flag === val;
      case '!=': return flag !== val;
      case '>':  return flag > val;
      case '>=': return flag >= val;
      case '<':  return flag < val;
      case '<=': return flag <= val;
      default:   return false;
    }
  }
}
