/**
 * Manages inventory state: item definitions, held items, and capacity.
 *
 * The inventory is configured per-game via `_game.json`:
 *   "inventory": 12       → 12 slots
 *   "inventory": 0 / omit → inventory disabled
 *
 * Item definitions are loaded from `items/items.json` inside the game folder.
 *
 * Bus events emitted:
 *   inventory:changed          – fired after any add/remove
 *
 * Bus events listened:
 *   inventory:add   { id, qty }
 *   inventory:remove { id, qty }
 */
export class Inventory {
  /** @param {import('./event-bus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;

    /** Maximum inventory slots (0 = disabled). */
    this.capacity = 0;

    /** @type {Map<string, object>} Item definitions keyed by id. */
    this._defs = new Map();

    /** @type {Map<string, number>} Held items: id → quantity. */
    this._items = new Map();

    /** Base path for resolving asset URLs. */
    this._basePath = '';

    bus.on('game:basepath', (bp) => { this._basePath = bp; });
    bus.on('inventory:add', (p) => this.add(p.id, p.qty ?? 1));
    bus.on('inventory:remove', (p) => this.remove(p.id, p.qty ?? 1));
  }

  /** Whether the inventory feature is enabled for the current game. */
  get enabled() { return this.capacity > 0; }

  /**
   * Configure inventory from the game manifest.
   * @param {number} capacity  Slot count (0 = disabled)
   */
  configure(capacity) {
    this.capacity = capacity || 0;
  }

  /**
   * Load item definitions from the game's items/items.json.
   * @param {string} basePath  e.g. "games/playground"
   */
  async loadDefinitions(basePath) {
    this._defs.clear();
    if (!this.enabled) return;
    try {
      const res = await fetch(`${basePath}/items/items.json`);
      if (!res.ok) return;
      const defs = await res.json();
      for (const def of defs) {
        this._defs.set(def.id, def);
      }
    } catch { /* no item definitions — that's fine */ }
  }

  /** Get the definition object for an item id, or null. */
  getDef(id) {
    return this._defs.get(id) ?? null;
  }

  /** Get quantity of an item currently held (0 if none). */
  getQty(id) {
    return this._items.get(id) ?? 0;
  }

  /** Get all held items as an array of { id, qty, def }. */
  getAll() {
    const result = [];
    for (const [id, qty] of this._items) {
      result.push({ id, qty, def: this.getDef(id) });
    }
    return result;
  }

  /** Number of distinct item stacks currently held. */
  get usedSlots() {
    return this._items.size;
  }

  /**
   * Add items to inventory.
   * @param {string} id
   * @param {number} qty
   * @returns {boolean} true if added successfully
   */
  add(id, qty = 1) {
    if (!this.enabled || qty <= 0) return false;
    const def = this.getDef(id);
    const current = this.getQty(id);

    if (current === 0) {
      // New item — check capacity
      if (this._items.size >= this.capacity) return false;
    }

    if (def && !def.stackable && current > 0) return false;  // can't stack

    this._items.set(id, current + qty);
    this.bus.emit('inventory:changed');
    return true;
  }

  /**
   * Remove items from inventory.
   * @param {string} id
   * @param {number} qty
   * @returns {boolean} true if removed successfully
   */
  remove(id, qty = 1) {
    if (qty <= 0) return false;
    const current = this.getQty(id);
    if (current <= 0) return false;
    const newQty = current - qty;
    if (newQty <= 0) {
      this._items.delete(id);
    } else {
      this._items.set(id, newQty);
    }
    this.bus.emit('inventory:changed');
    return true;
  }

  /** Check if inventory has at least `qty` of item `id`. */
  has(id, qty = 1) {
    return this.getQty(id) >= qty;
  }

  /** Clear all held items (e.g. on new game). */
  reset() {
    this._items.clear();
    this._defs.clear();
    this.capacity = 0;
  }
}
