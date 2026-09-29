/**
 * Walks through an action sequence and dispatches each command to the
 * appropriate UI/state subsystem.
 *
 * The canonical action-command reference lives in `AGENTS.md`
 * ("Action commands"). Keep that documentation in sync with the runner and
 * avoid maintaining a second full command list here.
 */
import { detectType } from '../shared/action-schema.js';
import { evaluateExpression, numericValue, compareValues } from '../shared/expressions.js';

/** Max iterations of a single `loop` statement before assuming an infinite loop. */
const MAX_LOOP_ITERATIONS = 10000;
/** Max frame-stack depth before recursive sequence expansion (`run`) is treated as runaway. */
const MAX_FRAME_DEPTH = 64;

export class ActionRunner {
  /**
   * @param {object} deps
   * @param {import('./event-bus.js').EventBus} deps.bus
   * @param {import('./game-state.js').GameState} deps.state
   * @param {import('./inventory.js').Inventory} deps.inventory
   */
  constructor({ bus, state, inventory, dialogs = { active: null, queue: [] }, animationFamily = null }) {
    this.bus = bus;
    this.state = state;
    this.inventory = inventory;
    this._dialogs = dialogs;
    // Family tokens keep completed forks' nonblocking tweens cancellable by the root.
    this._animationOwner = Symbol('animation owner');
    this._animationFamily = animationFamily ?? Symbol('animation family');
    this._ownsAnimationFamily = animationFamily == null;
    this._aborted = false;
    this._gotoFired = false;
    this._gotoTarget = null;
    this.running = false;
    /** Resolve function for the currently awaited blocking promise (dialogue, choice, animation, etc.). */
    this._pendingResolve = null;
    /** Resolvers waiting for the current run to fully unwind (see abort()). */
    this._unwindWaiters = [];
    /** @type {string|null} ID of the object whose actions are currently running (for "this" resolution). */
    this.currentObjectId = null;
    /** @type {Record<string, object[]>} Named action sequences from the current scene. */
    this.sequences = {};
    /** @type {Set<ActionRunner>} Child runners spawned via `fork`. */
    this._children = new Set();
  }

  /**
   * Cancel any running sequence (external).
   * Returns a promise that resolves once the aborted run — and every forked
   * child run — has fully unwound. Fire-and-forget callers may ignore it.
   */
  abort() {
    // running stays true until finally; callers must wait before reusing this runner.
    const selfWait = this.running
      ? new Promise(resolve => this._unwindWaiters.push(resolve))
      : null;
    const childWaits = [];
    this._aborted = true;
    this.bus.emit('entity:animate-cancel', this._ownsAnimationFamily
      ? { family: this._animationFamily } : { owner: this._animationOwner });
    for (const child of this._children) childWaits.push(child.abort());
    this._children.clear();
    // Resolve any pending blocking promise so the run() loop can unwind cleanly.
    const pending = this._pendingResolve;
    this._pendingResolve = null;
    if (pending) pending();
    if (!selfWait && childWaits.length === 0) return Promise.resolve();
    return Promise.all([selfWait, ...childWaits].filter(Boolean)).then(() => {});
  }

  /**
   * Execute an array of action commands sequentially.
   * @param {object[]} actions
   */
  async run(actions) {
    if (this.running) throw new Error('Action runner: another action chain is still running' + this._errorContext());
    this._aborted = false;
    this._gotoFired = false;
    this._gotoTarget = null;
    this.running = true;

    try {
      const frames = [{ actions, index: 0 }];

      while (frames.length) {
        if (this._aborted || this._gotoFired) return;

        const frame = frames[frames.length - 1];
        if (frame.index >= frame.actions.length) {
          if (frame.remaining != null) {
            frame.remaining -= 1;
            if (frame.remaining > 0) frame.index = 0;
            else frames.pop();
          } else if (frame.loopCondition && this._evalCondition(frame.loopCondition)) {
            frame.iterations += 1;
            if (frame.iterations > MAX_LOOP_ITERATIONS) {
              throw new Error(
                `Action runner: loop exceeded ${MAX_LOOP_ITERATIONS} iterations without its ` +
                `condition "${frame.loopCondition}" flipping — probable infinite loop` +
                this._errorContext()
              );
            }
            frame.index = 0;
          } else {
            frames.pop();
          }
          continue;
        }

        const action = frame.actions[frame.index++];

        const type = detectType(action);
        const shouldReturn = await this._dispatchAction(type, action, frames);
        if (shouldReturn) return;
      }
    } catch (error) {
      this.bus.emit('entity:animate-cancel', { owner: this._animationOwner });
      throw error;
    } finally {
      this.running = false;
      const waiters = this._unwindWaiters;
      this._unwindWaiters = [];
      for (const resolve of waiters) resolve();
      // Navigation starts only after this chain is fully unwound.
      if (!this._aborted && this._gotoFired && this._gotoTarget) {
        this.bus.emit('scene:goto', this._gotoTarget);
      }
    }
  }

  /* ── private helpers ──────────────────────────── */

  async _dispatchAction(type, action, frames) {
    switch (type) {
      case 'say': await this._say(action); break;
      case 'choice': {
        const option = await this._choice(action.choice);
        if (!this._aborted) this._pushFrame(frames, option?.actions, 'choice branch', true);
        break;
      }
      case 'wait': await this._delay(action.wait); break;
      case 'show': await this._show(action.show); break;
      case 'text': await this._text(action.text); break;
      case 'hide': await this._hide(action.hide); break;
      case 'animate': await this._animate(action.animate); break;
      case 'playsound': await this._playsound(action.playsound); break;
      case 'stopsound': await this._stopsound(action.stopsound); break;
      case 'set': this._applySet(action.set); break;
      case 'item': this._applyItem(action.item); break;
      case 'goto':
        this._gotoFired = true;
        this._gotoTarget = action.goto;
        return true;
      case 'if': {
        const branch = this._evalCondition(action.if) ? action.then : action.else;
        this._pushFrame(frames, branch, 'conditional branch');
        break;
      }
      case 'loop': {
        const actions = this._resolveLoopActions(action);
        if (typeof action.loop === 'number') {
          if (!Number.isSafeInteger(action.loop) || action.loop < 0 || action.loop > MAX_LOOP_ITERATIONS) {
            throw new Error(`Action runner: loop count must be an integer from 0 to ${MAX_LOOP_ITERATIONS}` + this._errorContext());
          }
          if (actions?.length && action.loop > 0) {
            this._checkFrameDepth(frames, 'loop');
            frames.push({ actions, index: 0, remaining: action.loop });
          }
        } else if (actions?.length && this._evalCondition(action.loop)) {
          this._checkFrameDepth(frames, 'loop');
          frames.push({ actions, index: 0, loopCondition: action.loop, iterations: 0 });
        }
        break;
      }
      case 'emit': this.bus.emit(action.emit, action.payload); break;
      case 'run':
        this._pushFrame(frames, this.sequences[action.run], `sequence "${action.run}"`);
        break;
      case 'fork': {
        const actions = this._resolveForkActions(action.fork);
        if (actions?.length) this._spawnChild(actions);
        break;
      }
      case 'exit': {
        // Exit ends the nearest choice branch; outside choices it ends the chain.
        const choiceIndex = frames.findLastIndex(frame => frame.choiceBranch);
        if (choiceIndex < 0) return true;
        frames.splice(choiceIndex);
        break;
      }
    }
    return false;
  }

  _pushFrame(frames, actions, context, choiceBranch = false) {
    if (!actions?.length) return;
    this._checkFrameDepth(frames, context);
    frames.push({ actions, index: 0, choiceBranch });
  }

  /** One cancellable wait per runner. Completion consumes its callback and cleanup. */
  _wait(start) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let cleanup;
      const settle = (value, error) => {
        if (settled) return;
        settled = true;
        if (this._pendingResolve === finish) this._pendingResolve = null;
        cleanup?.();
        if (error) reject(error);
        else resolve(value);
      };
      const finish = value => settle(value);
      const fail = error => settle(undefined, error);
      this._pendingResolve = finish;
      try {
        cleanup = start(finish, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  /** Main and forked chains take turns using the shared dialogue/choice UI. */
  _dialog(kind, data) {
    return this._wait((done, fail) => {
      const dialogs = this._dialogs;
      const job = { runner: this, kind, data, done, fail, completed: false };
      dialogs.queue.push(job);
      // Install cleanup before showing UI (a bus listener can complete synchronously).
      queueMicrotask(() => this._showNextDialog());
      return () => {
        const index = dialogs.queue.indexOf(job);
        if (index >= 0) dialogs.queue.splice(index, 1);
        if (dialogs.active === job) {
          dialogs.active = null;
          if (!job.completed) this.bus.emit(`${kind}:dismiss`);
        }
        this._showNextDialog();
      };
    });
  }

  _showNextDialog() {
    const dialogs = this._dialogs;
    if (dialogs.active || !dialogs.queue.length) return;
    const job = dialogs.active = dialogs.queue.shift();
    if (job.runner._aborted) { job.done(); return; }
    try {
      this.bus.emit(`${job.kind}:show`, {
        ...job.data,
        [job.kind === 'choice' ? 'onPick' : 'onDone']: value => {
          job.completed = true;
          job.done(value);
        },
      });
    } catch (error) {
      job.fail(error);
    }
  }

  _say(action) {
    return this._dialog('dialogue', {
      speaker: action.speaker || '',
      accent: action.accent || null,
      text: action.say,
      typewriterSpeed: action.typewriterSpeed,
      delay: action.delay || 0,
    });
  }

  _choice(choiceDef) {
    return this._dialog('choice', {
      prompt: choiceDef.prompt || '',
      options: choiceDef.options,
    });
  }

  _delay(ms) {
    return this._wait(done => {
      const timer = setTimeout(done, ms);
      return () => clearTimeout(timer);
    });
  }

  _resolveForkActions(forkDef) {
    if (typeof forkDef === 'string') return this.sequences[forkDef] ?? null;
    if (Array.isArray(forkDef)) return forkDef;
    if (Array.isArray(forkDef?.actions)) return forkDef.actions;
    if (typeof forkDef?.run === 'string') return this.sequences[forkDef.run] ?? null;
    return null;
  }

  _resolveLoopActions(action) {
    if (Array.isArray(action.do)) return action.do;
    if (Array.isArray(action.then)) return action.then;
    return null;
  }

  _spawnChild(actions) {
    const child = new ActionRunner({
      bus: this.bus,
      state: this.state,
      inventory: this.inventory,
      dialogs: this._dialogs,
      animationFamily: this._animationFamily,
    });
    child.sequences = this.sequences;
    child.currentObjectId = this.currentObjectId;
    this._children.add(child);
    child.run(actions).catch(error => this.bus.emit('engine:error', error)).finally(() => {
      this._children.delete(child);
    });
  }

  _show(showDef) {
    if (typeof showDef === 'string') showDef = { id: showDef };
    if (showDef.id === 'this') showDef = { ...showDef, id: this.currentObjectId };
    return this._wait(onDone => {
      this.bus.emit('overlay:show', { ...showDef, onDone });
    });
  }

  _text(textDef) {
    return this._wait(onDone => {
      this.bus.emit('overlay:show', { ...textDef, kind: 'text', onDone });
    });
  }

  _hide(hideDef) {
    if (typeof hideDef === 'string') hideDef = { id: hideDef };
    if (hideDef.id === 'this') hideDef = { ...hideDef, id: this.currentObjectId };
    return this._wait(onDone => {
      this.bus.emit('overlay:hide', { ...hideDef, onDone });
    });
  }

  _animate(def) {
    if (def.id === 'this') def = { ...def, id: this.currentObjectId };
    return this._wait(onDone => {
      this.bus.emit('entity:animate', { ...def, owner: this._animationOwner,
        family: this._animationFamily, onDone });
    });
  }

  _playsound(def) {
    return this._wait(onDone => {
      this.bus.emit('sound:play', { ...def, onDone });
    });
  }

  _stopsound(def) {
    return this._wait(onDone => {
      this.bus.emit('sound:stop', { ...def, onDone });
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
   * legacy increments and explicit expressions ({ expr, operation, max, min }).
   */
  _applySet(setObj) {
    for (const [key, spec] of Object.entries(setObj)) {
      if (spec && typeof spec === 'object' && Object.hasOwn(spec, 'expr')) {
        const operand = evaluateExpression(spec.expr, name => this._resolveExpressionReference(name));
        const operation = spec.operation || 'set';
        let value;
        if (operation === 'set') value = operand;
        else if (operation === 'add' || operation === 'subtract') {
          value = numericValue(numericValue(this.state.getFlag(key) ?? 0) +
            numericValue(operand) * (operation === 'subtract' ? -1 : 1));
        } else throw new Error(`Unknown flag operation: ${operation}`);
        if (spec.max != null) value = Math.min(numericValue(value), numericValue(spec.max));
        if (spec.min != null) value = Math.max(numericValue(value), numericValue(spec.min));
        this.state.setFlag(key, value);
      } else if (typeof spec === 'string' && /^[+-]\d+$/.test(spec)) {
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

  _resolveExpressionReference(name) {
    const item = /^items\.(.+?)\.qty$/.exec(name);
    return item ? this.inventory.getQty(item[1]) : (this.state.getFlag(name) ?? 0);
  }

  /** @type {RegExp} Matches "flag_name op value" comparison expressions */
  static _CMP_RE = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

  /**
   * Resolve a token inside a condition expression.
   * Supports booleans, numbers, inventory quantities, and game-state flags.
   */
  _resolveConditionOperand(token) {
    if (typeof token === 'boolean' || typeof token === 'number') return token;

    const text = String(token).trim();
    if (text === 'true') return true;
    if (text === 'false') return false;

    const num = Number(text);
    if (!Number.isNaN(num) && text !== '') return num;

    const itemMatch = /^items\.(.+?)\.qty$/.exec(text);
    if (itemMatch) return this.inventory.getQty(itemMatch[1]);

    return this.state.getFlag(text) ?? 0;
  }

  /** Describe where the runner currently is, for error messages. */
  _errorContext() {
    const scene = this.state?.currentScene ?? 'unknown scene';
    const obj = this.currentObjectId ? `, object "${this.currentObjectId}"` : '';
    return ` (scene "${scene}"${obj})`;
  }

  /**
   * Guard against runaway nesting of the frame stack (recursive `run`
   * expansion, deeply nested conditionals/loops).
   */
  _checkFrameDepth(frames, what) {
    if (frames.length >= MAX_FRAME_DEPTH) {
      throw new Error(
        `Action runner: nested action depth exceeded ${MAX_FRAME_DEPTH} frames while expanding ` +
        `${what} — probable recursive sequence expansion` + this._errorContext()
      );
    }
  }

  /**
   * Evaluate an `if`/`loop` condition.
   * - Plain name → truthiness check (unset flags read as 0 → false).
   * - "flag op value" → comparison with Number() coercion; booleans coerce
   *   to 1/0 (`true == 1` is true); two non-numeric strings compare as
   *   strings; any NaN operand makes the comparison false.
   * - `true` / `false` → literal boolean.
   * - "1 == 1" → literal comparison.
   * Supports `items.<id>.qty` for inventory checks.
   */
  _evalCondition(expr) {
    if (expr && typeof expr === 'object') {
      const resolve = name => this._resolveExpressionReference(name);
      const left = evaluateExpression(expr.left, resolve);
      if (expr.operator === 'truthy') return Boolean(left);
      if (expr.operator === 'falsy') return !left;
      return compareValues(left, expr.operator, evaluateExpression(expr.right, resolve));
    }
    if (typeof expr === 'boolean') return expr;

    const m = ActionRunner._CMP_RE.exec(expr);
    if (!m) {
      if (typeof expr === 'number') return expr !== 0;
      const text = String(expr).trim();
      if (text === 'true') return true;
      if (text === 'false') return false;
      if (text !== '' && !Number.isNaN(Number(text))) return Number(text) !== 0;

      // Plain truthiness: check inventory shorthand or flag
      // (unset flags read as numeric 0 → falsy)
      const itemMatch = /^items\.(.+?)\.qty$/.exec(text);
      if (itemMatch) return this.inventory.getQty(itemMatch[1]) > 0;
      const value = this.state.getFlag(text) ?? 0;
      return Boolean(value);
    }

    const left = this._resolveConditionOperand(m[1]);
    const right = this._resolveConditionOperand(m[3]);
    return compareValues(left, m[2], right);
  }
}
