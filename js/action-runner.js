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
 *   { "show": "object_id" }    // show a scene object by id (string shorthand)
 *   { "show": "this" }         // show the object whose actions are running
 *   { "show": { "id": "...", "texture": "...", "scaling": "fill", "z": 10, "effect": { "type": "fade-in", "seconds": 2, "blocking": false } } }
 *   { "hide": "object_id" }    // hide a scene object by id (string shorthand)
 *   { "hide": "this" }         // hide the object whose actions are running
 *   { "hide": { "id": "...", "effect": { "type": "fade-out", "seconds": 1, "blocking": true } } }
 *   { "effect": { "type": "fade-in", "seconds": 1, "blocking": false } }  // scene-level transition
 *   { "playsound": { "id": "...", "path": "...", "volume": 0.7, "fade": 1, "loop": true, "blocking": false } }
 *   { "stopsound": { "id": "...", "fade": 1, "blocking": true } }
 *   { "item": { "id": "key", "qty": 1 } }   // add item (negative qty = remove)
 */
import { detectType } from './action-schema.js';

export class ActionRunner {
  /**
   * @param {object} deps
   * @param {import('./event-bus.js').EventBus} deps.bus
   * @param {import('./game-state.js').GameState} deps.state
   * @param {import('./inventory.js').Inventory} deps.inventory
   */
  constructor({ bus, state, inventory }) {
    this.bus = bus;
    this.state = state;
    this.inventory = inventory;
    this._aborted = false;
    this._exited = false;
    this._gotoFired = false;
    this._gotoTarget = null;
    this.running = false;
    /** Resolve function for the currently awaited blocking promise (dialogue, choice, effect, etc.). */
    this._pendingResolve = null;
    /** @type {string|null} ID of the object whose actions are currently running (for "this" resolution). */
    this.currentObjectId = null;
    /** @type {Record<string, object[]>} Named action sequences from the current scene. */
    this.definitions = {};
  }

  /** Cancel any running sequence (external). */
  abort() {
    this._aborted = true;
    this.running = false;
    // Resolve any pending blocking promise so the run() loop can unwind cleanly.
    const pending = this._pendingResolve;
    this._pendingResolve = null;
    if (pending) pending();
  }

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

        switch (detectType(action)) {
          case 'say':       await this._say(action); break;
          case 'choice':    await this._choice(action.choice); break;
          case 'goto':
            this._gotoFired = true;
            this._gotoTarget = action.goto;
            return; // scene change — emitted after the full chain unwinds
          case 'set':       this._applySet(action.set); break;
          case 'if': {
            const result = this._evalCondition(action.if);
            const branch = result ? action.then : action.else;
            if (branch) await this.run(branch, true);
            break;
          }
          case 'wait':      await this._delay(action.wait); break;
          case 'emit':      this.bus.emit(action.emit, action.payload); break;
          case 'run': {
            const def = this.definitions[action.run];
            if (def) await this.run(def, true);
            break;
          }
          case 'show':      await this._show(action.show); break;
          case 'hide':      await this._hide(action.hide); break;
          case 'effect':    await this._effect(action.effect); break;
          case 'playsound': await this._playsound(action.playsound); break;
          case 'stopsound': await this._stopsound(action.stopsound); break;
          case 'item':      this._applyItem(action.item); break;
          case 'exit':      this._exited = true; return;
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
      this._pendingResolve = resolve;
      this.bus.emit('dialogue:show', {
        speaker: action.speaker || '',
        accent: action.accent || null,
        text: action.say,
        delay: action.delay || 0,
        onDone: resolve,
      });
    });
  }

  _choice(choiceDef) {
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this.bus.emit('choice:show', {
        prompt: choiceDef.prompt || '',
        options: choiceDef.options,
        onPick: async (option) => {
          this._pendingResolve = null;
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
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      setTimeout(resolve, ms);
    });
  }

  _show(showDef) {
    if (typeof showDef === 'string') showDef = { id: showDef };
    if (showDef.id === 'this') showDef = { ...showDef, id: this.currentObjectId };
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this.bus.emit('overlay:show', { ...showDef, onDone: resolve });
    });
  }

  _hide(hideDef) {
    if (typeof hideDef === 'string') hideDef = { id: hideDef };
    if (hideDef.id === 'this') hideDef = { ...hideDef, id: this.currentObjectId };
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this.bus.emit('overlay:hide', { ...hideDef, onDone: resolve });
    });
  }

  _effect(effectDef) {
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this.bus.emit('scene:effect', { ...effectDef, onDone: resolve });
    });
  }

  _playsound(def) {
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this.bus.emit('sound:play', { ...def, onDone: resolve });
    });
  }

  _stopsound(def) {
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this.bus.emit('sound:stop', { ...def, onDone: resolve });
    });
  }

  /**
   * Apply an `item` action: add or remove items from inventory.
   * Positive qty adds, negative qty removes.
   */
  _applyItem(itemDef) {
    const id = itemDef.id;
    const qty = itemDef.qty ?? 1;
    if (qty > 0) {
      const ok = this.inventory.add(id, qty);
      if (ok) {
        const def = this.inventory.getDef(id);
        const name = def?.name ?? id;
        this.bus.emit('notification:show', {
          title: 'Inventory',
          icon: def?.icon,
          content: `${name} x ${qty}`,
          emit: 'inventory:open',
        });
      }
    } else if (qty < 0) {
      this.inventory.remove(id, Math.abs(qty));
    }
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
   * Resolve a variable name that may refer to a flag or an inventory property.
   * Supports:  items.<id>.qty  → inventory quantity
   *            anything else   → game-state flag
   */
  _resolveValue(name) {
    const itemMatch = /^items\.(.+?)\.qty$/.exec(name);
    if (itemMatch) return this.inventory.getQty(itemMatch[1]);
    return this.state.getFlag(name) ?? 0;
  }

  /**
   * Evaluate an `if` condition string.
   * - Plain name → truthiness check (backward-compatible).
   * - "flag op value" → numeric comparison.
   * Supports `items.<id>.qty` for inventory checks.
   */
  _evalCondition(expr) {
    const m = ActionRunner._CMP_RE.exec(expr);
    if (!m) {
      // Plain truthiness: check inventory shorthand or flag
      const itemMatch = /^items\.(.+?)\.qty$/.exec(expr);
      if (itemMatch) return this.inventory.getQty(itemMatch[1]) > 0;
      return this.state.hasFlag(expr);
    }

    const flag = this._resolveValue(m[1].trim());
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
