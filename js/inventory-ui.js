/**
 * Inventory UI — floating window with a Grid / List display mode toggle.
 *
 * Grid mode shows item icons with qty badges.
 * List mode shows icon, name, ID, and qty in rows.
 *
 * Right-click on an item opens a context menu with item-defined
 * options plus "Drop" (if droppable).
 *
 * Listens:
 *   hud:inventory      – toggle the inventory window
 *   inventory:open     – open the inventory window
 *   inventory:changed   – refresh contents
 *   game:quit / game:title – close window
 *
 * Emits:
 *   inventory:remove { id, qty }  – when dropping an item
 */
export class InventoryUI {
  /**
   * @param {import('./event-bus.js').EventBus} bus
   * @param {import('./inventory.js').Inventory} inventory
   * @param {import('./action-runner.js').ActionRunner} runner
   */
  constructor(bus, inventory, runner) {
    this.bus = bus;
    this.inventory = inventory;
    this.runner = runner;
    this._mode = 'grid';  // 'grid' | 'list'
    this._win = null;
    this._open = false;

    /** Base path for resolving item icon URLs. */
    this._basePath = '';
    /** @type {Map<string, string>|null} Preview asset blob URL map. */
    this._assetMap = null;

    bus.on('game:basepath', (bp) => { this._basePath = bp; });
    bus.on('game:assetmap', (map) => { this._assetMap = map; });
    bus.on('hud:inventory', () => this.toggle());
    bus.on('inventory:open', () => this.open());
    bus.on('inventory:changed', () => { if (this._open) this._render(); });
    bus.on('game:quit', () => this.close());
    bus.on('game:title', () => this.close());

    // Close context menu on any click outside
    document.addEventListener('click', () => this._closeCtx());
    document.addEventListener('contextmenu', (e) => {
      // If clicking outside the context menu, close it
      if (this._ctxEl && !this._ctxEl.contains(e.target)) {
        this._closeCtx();
      }
    });

    /** @type {HTMLElement|null} Active context menu element */
    this._ctxEl = null;
  }

  /** Resolve a relative item icon path. */
  _resolve(path) {
    if (this._assetMap && path && this._assetMap.has(path)) return this._assetMap.get(path);
    if (!this._basePath || !path) return path;
    return `${this._basePath}/${path}`;
  }

  toggle() {
    if (!this.inventory.enabled) return;
    if (this._open) { this.close(); } else { this.open(); }
  }

  open() {
    if (!this.inventory.enabled) return;
    if (this._open) return;
    this._open = true;
    this._createWindow();
    this._render();
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._closeCtx();
    if (this._win) {
      const winEl = this._win.el;
      winEl.classList.remove('inv-window-opening');
      winEl.classList.add('inv-window-closing');
      winEl.addEventListener('animationend', () => {
        if (!winEl.isConnected) return;
        winEl.remove();
      }, { once: true });
      this._win = null;
    }
  }

  /* ── Window creation (reuses floating-window pattern) ── */

  _createWindow() {
    if (this._win) { this._win.el.remove(); this._win = null; }

    const el = document.createElement('div');
    el.className = 'inv-window inv-window-opening';

    // Header
    const header = document.createElement('div');
    header.className = 'inv-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'inv-title';
    titleEl.innerHTML = '<span class="material-symbols-outlined inv-title-icon" aria-hidden="true">inventory_2</span><span>Inventory</span>';

    const controls = document.createElement('span');
    controls.className = 'inv-controls';

    const modeBtn = document.createElement('button');
    modeBtn.className = 'inv-control-btn inv-mode-btn';
    this._applyModeButtonState(modeBtn);
    modeBtn.addEventListener('click', () => {
      this._mode = this._mode === 'grid' ? 'list' : 'grid';
      this._render();
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'inv-control-btn inv-close-btn';
    closeBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
    closeBtn.title = 'Close inventory';
    closeBtn.setAttribute('aria-label', 'Close inventory');
    closeBtn.addEventListener('click', () => this.close());

    controls.append(modeBtn, closeBtn);
    header.append(titleEl, controls);

    // Body
    const body = document.createElement('div');
    body.className = 'inv-body';

    el.append(header, body);

    // Drag-to-move via header
    this._initDrag(el, header, closeBtn);

    // Add to the UI layer inside game-container
    const uiLayer = document.getElementById('ui-layer');
    uiLayer.appendChild(el);

    // Center within game-container (use offset dimensions for local coords)
    requestAnimationFrame(() => {
      const container = document.getElementById('game-container');
      el.style.left = `${(container.offsetWidth - el.offsetWidth) / 2}px`;
      el.style.top = `${(container.offsetHeight - el.offsetHeight) / 2}px`;
    });

    el.addEventListener('animationend', () => {
      el.classList.remove('inv-window-opening');
    }, { once: true });

    this._win = { el, body, modeBtn };
  }

  _initDrag(el, header, closeBtn) {
    let dragStartX, dragStartY, startLeft, startTop, scale;

    const onDragMove = (e) => {
      const dx = (e.clientX - dragStartX) / scale;
      const dy = (e.clientY - dragStartY) / scale;
      el.style.left = `${startLeft + dx}px`;
      el.style.top = `${startTop + dy}px`;
    };
    const onDragUp = () => {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragUp);
    };
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.inv-control-btn')) return;
      e.preventDefault();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      // Compute current scale factor (game-container may be CSS-transformed)
      const container = document.getElementById('game-container');
      scale = container.getBoundingClientRect().width / container.offsetWidth;
      startLeft = parseFloat(el.style.left) || 0;
      startTop = parseFloat(el.style.top) || 0;
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragUp);
    });
  }

  /* ── Rendering ──────────────────────────────── */

  _render() {
    if (!this._win) return;
    const body = this._win.body;
    body.innerHTML = '';
    this._applyModeButtonState(this._win.modeBtn);

    const items = this.inventory.getAll();

    if (this._mode === 'grid') {
      this._renderGrid(body, items);
    } else {
      this._renderList(body, items);
    }
  }

  _applyModeButtonState(button) {
    if (!button) return;
    const nextMode = this._mode === 'grid' ? 'list' : 'grid';
    const icon = nextMode === 'grid' ? 'grid_view' : 'view_list';
    const label = nextMode === 'grid' ? 'Switch to grid view' : 'Switch to list view';
    button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>`;
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  _renderGrid(body, items) {
    const grid = document.createElement('div');
    grid.className = 'inv-grid';

    // Render filled slots
    for (const { id, qty, def } of items) {
      const cell = document.createElement('div');
      cell.className = 'inv-grid-cell';
      cell.title = def?.name ?? id;

      if (def?.icon) {
        const img = document.createElement('img');
        img.className = 'inv-grid-icon';
        img.src = this._resolve(def.icon);
        img.alt = def.name ?? id;
        img.draggable = false;
        cell.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'inv-grid-placeholder';
        placeholder.textContent = id.charAt(0).toUpperCase();
        cell.appendChild(placeholder);
      }

      if (qty > 1) {
        const badge = document.createElement('span');
        badge.className = 'inv-grid-qty';
        badge.textContent = qty;
        cell.appendChild(badge);
      }

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showCtx(e, id);
      });

      grid.appendChild(cell);
    }

    // Empty slots to fill capacity
    const empty = this.inventory.capacity - items.length;
    for (let i = 0; i < empty; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-grid-cell inv-grid-empty';
      grid.appendChild(cell);
    }

    body.appendChild(grid);
  }

  _renderList(body, items) {
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inv-list-empty';
      empty.textContent = 'Inventory is empty.';
      body.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'inv-list-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th></th><th>Name</th><th>ID</th><th>Qty</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const { id, qty, def } of items) {
      const tr = document.createElement('tr');
      tr.className = 'inv-list-row';

      // Icon cell
      const tdIcon = document.createElement('td');
      tdIcon.className = 'inv-list-icon-cell';
      if (def?.icon) {
        const img = document.createElement('img');
        img.className = 'inv-list-icon';
        img.src = this._resolve(def.icon);
        img.alt = def?.name ?? id;
        img.draggable = false;
        tdIcon.appendChild(img);
      }
      tr.appendChild(tdIcon);

      // Name
      const tdName = document.createElement('td');
      tdName.textContent = def?.name ?? id;
      tr.appendChild(tdName);

      // ID
      const tdId = document.createElement('td');
      tdId.className = 'inv-list-id';
      tdId.textContent = id;
      tr.appendChild(tdId);

      // Qty
      const tdQty = document.createElement('td');
      tdQty.textContent = qty;
      tr.appendChild(tdQty);

      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showCtx(e, id);
      });

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  }

  /* ── Context menu ───────────────────────────── */

  _showCtx(e, itemId) {
    this._closeCtx();
    const def = this.inventory.getDef(itemId);

    const menu = document.createElement('div');
    menu.className = 'inv-ctx';

    // Item-defined options
    if (def?.options) {
      for (const opt of def.options) {
        const btn = document.createElement('button');
        btn.className = 'inv-ctx-btn';
        btn.textContent = (opt.icon ? opt.icon + ' ' : '') + opt.text;
        btn.addEventListener('click', async () => {
          this._closeCtx();
          if (opt.actions) {
            await this.runner.run(opt.actions);
          }
        });
        menu.appendChild(btn);
      }
    }

    // Drop option
    if (!def || def.droppable !== false) {
      if (menu.children.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'inv-ctx-sep';
        menu.appendChild(sep);
      }
      const dropBtn = document.createElement('button');
      dropBtn.className = 'inv-ctx-btn inv-ctx-drop';
      dropBtn.textContent = '🗑️ Drop';
      dropBtn.addEventListener('click', () => {
        this._closeCtx();
        this.inventory.remove(itemId, 1);
      });
      menu.appendChild(dropBtn);
    }

    // Position relative to the UI layer
    const uiLayer = document.getElementById('ui-layer');
    uiLayer.appendChild(menu);

    // Position at mouse, clamped inside game-container (account for CSS scale)
    const container = document.getElementById('game-container');
    const cRect = container.getBoundingClientRect();
    const scale = cRect.width / container.offsetWidth;
    let x = (e.clientX - cRect.left) / scale;
    let y = (e.clientY - cRect.top) / scale;

    // Wait for layout to clamp properly
    requestAnimationFrame(() => {
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      if (x + mw > container.offsetWidth) x = container.offsetWidth - mw - 4;
      if (y + mh > container.offsetHeight) y = container.offsetHeight - mh - 4;
      menu.style.left = `${Math.max(0, x)}px`;
      menu.style.top = `${Math.max(0, y)}px`;
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    this._ctxEl = menu;
  }

  _closeCtx() {
    if (this._ctxEl) {
      this._ctxEl.remove();
      this._ctxEl = null;
    }
  }
}
