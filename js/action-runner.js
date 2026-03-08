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
 *   { "show": { "id": "...", "texture": "...", "layer": "overlay", "scaling": "fill", "effect": { "type": "fade-in", "seconds": 2, "blocking": false } } }
 *   { "hide": { "id": "...", "effect": { "type": "fade-out", "seconds": 1, "blocking": true } } }
 *   { "effect": { "type": "fade-in", "seconds": 1, "blocking": false } }  // scene-level transition
 *   { "playsound": { "id": "...", "path": "...", "volume": 0.7, "fade": 1, "loop": true, "blocking": false } }
 *   { "stopsound": { "id": "...", "fade": 1, "blocking": true } }
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
    this._gotoFired = false;
    this._gotoTarget = null;
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
      this._gotoFired = false;
      this._gotoTarget = null;
      this.running = true;
    }

    try {
      for (const action of actions) {
        if (this._aborted || this._exited || this._gotoFired) return;

        if (action.say != null) {
          await this._say(action);
        } else if (action.choice) {
          await this._choice(action.choice);
        } else if (action.goto) {
          this._gotoFired = true;
          this._gotoTarget = action.goto;
          return; // scene change — emitted after the full chain unwinds
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
        } else if (action.show) {
          await this._show(action.show);
        } else if (action.hide) {
          await this._hide(action.hide);
        } else if (action.effect) {
          await this._effect(action.effect);
        } else if (action.playsound) {
          await this._playsound(action.playsound);
        } else if (action.stopsound) {
          await this._stopsound(action.stopsound);
        } else if (action.exit != null) {
          this._exited = true;
          return;
        }
      }
    } finally {
      if (!_nested) {
        this.running = false;
        // Emit scene change only after the entire action chain has unwound,
        // so gotoScene's fresh runner.run() can't reset flags mid-unwind.
        if (this._gotoFired && this._gotoTarget) {
          this.bus.emit('scene:goto', this._gotoTarget);
        }
      }
    }
  }

  /* ── private helpers ──────────────────────────── */

  _say(action) {
    return new Promise(resolve => {
      this.bus.emit('dialogue:show', {
        speaker: action.speaker || '',
        text: action.say,
        delay: action.delay || 0,
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
          // `exit` inside a choice branch should only break out of that
          // branch, not kill the parent sequence.
          // But if a goto fired, keep everything stopped — we're changing scenes.
          if (!this._gotoFired) this._exited = false;
          resolve();
        },
      });
    });
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  _show(showDef) {
    return new Promise(resolve => {
      this.bus.emit('overlay:show', { ...showDef, onDone: resolve });
    });
  }

  _hide(hideDef) {
    return new Promise(resolve => {
      this.bus.emit('overlay:hide', { ...hideDef, onDone: resolve });
    });
  }

  _effect(effectDef) {
    return new Promise(resolve => {
      this.bus.emit('scene:effect', { ...effectDef, onDone: resolve });
    });
  }

  _playsound(def) {
    return new Promise(resolve => {
      this.bus.emit('sound:play', { ...def, onDone: resolve });
    });
  }

  _stopsound(def) {
    return new Promise(resolve => {
      this.bus.emit('sound:stop', { ...def, onDone: resolve });
    });
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
