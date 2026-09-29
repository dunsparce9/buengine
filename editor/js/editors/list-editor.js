/**
 * Parameterized table-style list editor (review phase 5, item 19).
 *
 * This is the single implementation behind the item/object "Options" modal
 * and the scene "Sequences" modal, which were ~80% identical (floating-window
 * dedup, toolbar, table skeleton, collapsed mode, context menus, actions
 * pill). Both `options-editor.js` and `sequence-editor.js` are now thin
 * domain adapters over `openListModal()` below.
 *
 * CSS class names are intentionally shared (`options-editor-body`, etc.) so
 * no stylesheet changes are needed.
 */

import { hooks, markDirty } from '../core/state.js';
import { createFloatingWindow } from '../ui/floating-window.js';
import { createEditorToolbar } from '../ui/editor-toolbar.js';
import { showContextMenu } from '../ui/context-menu.js';

/** @type {Map<string, { fw: ReturnType<typeof createFloatingWindow>, state: object }>} */
const _openModals = new Map();

export function notifyListChange(scriptId, onChange) {
  markDirty(scriptId);
  onChange?.();
  hooks.renderViewport();
  hooks.renderProperties();
}

/**
 * Shared "N action(s)" pill button. The adapter supplies the click behavior
 * (usually opening the ActionEditor); `render` lets the opener refresh the
 * count without rebuilding the whole table.
 */
export function createActionsPill(initialCount, onClick) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'ae-mini-btn items-actions-pill';
  const render = (count = initialCount) => {
    pill.innerHTML = '<span class="material-symbols-outlined">list_alt</span> ' + count;
    pill.dataset.tooltip = `${count} action(s)`;
  };
  render(initialCount);
  pill.addEventListener('click', () => onClick(render));
  return pill;
}

export function showNewRowMenu(x, y, label, onCreate) {
  showContextMenu(x, y, [
    { icon: 'add_box', label, onClick: onCreate },
  ]);
}

export function showRowMenu(x, y, label, onCreate, onDelete) {
  showContextMenu(x, y, [
    { icon: 'add_box', label, onClick: onCreate },
    { separator: true },
    { icon: 'delete', label: 'Delete', danger: true, onClick: onDelete },
  ]);
}

/**
 * Open (or re-focus) a table-style floating list modal.
 *
 * @param {object} opts
 * @param {string} opts.modalKey unique dedup key
 * @param {string} [opts.title] floating-window title
 * @param {string} [opts.subtitle]
 * @param {string} [opts.icon] material-symbols icon name
 * @param {object} [opts.initialState] domain fields stored on the modal state
 * @param {(st: object, opts: object) => void} [opts.onReuse] refresh domain
 *   fields when the window is already open
 * @param {(st: object) => string} [opts.getSubtitle] recompute subtitle on reuse
 * @param {{label: string, className?: string}[]} opts.columns thead cells
 * @param {(st: object) => Array<any>} opts.getRows row identities
 * @param {(tr: HTMLElement, rowCtx: { modalState: object, row: any, index: number }) => void} opts.buildRowCells
 * @param {(content: HTMLElement, st: object) => void} opts.renderEmpty
 * @param {(x: number, y: number, st: object) => void} [opts.onEmptyContextMenu]
 * @param {(x: number, y: number, st: object, row: any, index: number) => void} [opts.onRowContextMenu]
 * @param {(st: object) => void} opts.onAdd
 * @param {string} [opts.addTitle]
 * @param {string} [opts.collapseTitleCollapsed]
 * @param {string} [opts.collapseTitleExpanded]
 */
export function openListModal({
  modalKey,
  title = 'List',
  subtitle = '',
  icon = 'tune',
  initialState = {},
  onReuse = null,
  getSubtitle = null,
  columns = [],
  getRows,
  buildRowCells,
  renderEmpty,
  onEmptyContextMenu = null,
  onRowContextMenu = null,
  onAdd,
  addTitle = 'Add',
  collapseTitleCollapsed = 'Expand',
  collapseTitleExpanded = 'Collapse',
}) {
  const existing = _openModals.get(modalKey);
  if (existing && !existing.fw.el.classList.contains('hidden')) {
    onReuse?.(existing.state, initialState);
    if (typeof getSubtitle === 'function') {
      existing.fw.setSubtitle(getSubtitle(existing.state));
    }
    existing.fw.open();
    existing.fw.requestAttention();
    return existing.fw;
  }

  const fw = createFloatingWindow({
    title,
    subtitle,
    icon,
    iconClass: 'material-symbols-outlined',
    width: 500,
    height: 400,
    resizable: true,
    owner: initialState.target || initialState.sceneData,
  });

  fw.body.classList.add('options-editor-body');

  const modalState = {
    fw,
    collapsed: false,
    ...initialState,
    rebuild() {
      buildListContent(fw.body, modalState);
    },
  };

  _openModals.set(modalKey, { fw, state: modalState });
  fw.onClose(() => {
    _openModals.delete(modalKey);
    fw.destroy();
  });
  fw.refresh = () => modalState.rebuild();
  modalState.rebuild();
  fw.open();
  return fw;

  function buildListContent(container, st) {
    container.innerHTML = '';
    container.oncontextmenu = null;

    const toolbar = createEditorToolbar({
      collapsed: st.collapsed,
      onToggleCollapse: () => {
        st.collapsed = !st.collapsed;
        st.rebuild();
      },
      addLabel: 'Add',
      addTitle,
      addAriaLabel: addTitle,
      onAdd: () => onAdd(st),
      collapseTitleCollapsed,
      collapseTitleExpanded,
      extraClassName: 'options-editor-toolbar',
    });
    container.appendChild(toolbar);

    const content = document.createElement('div');
    content.className = 'options-editor-content';
    container.appendChild(content);

    content.oncontextmenu = st.collapsed
      ? null
      : (e) => {
          const row = e.target.closest('.items-options-row');
          if (row) return;
          e.preventDefault();
          onEmptyContextMenu?.(e.clientX, e.clientY, st);
        };

    const table = document.createElement('table');
    table.className = `items-options-table${st.collapsed ? ' items-options-table-compact' : ''}`;

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const col of columns) {
      const th = document.createElement('th');
      if (col.className) th.className = col.className;
      th.textContent = col.label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const rows = getRows(st) || [];
    const tbody = document.createElement('tbody');
    for (let i = 0; i < rows.length; i++) {
      const tr = document.createElement('tr');
      tr.className = 'items-options-row';
      if (!st.collapsed && typeof onRowContextMenu === 'function') {
        const row = rows[i];
        const index = i;
        tr.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onRowContextMenu(e.clientX, e.clientY, st, row, index);
        });
      }
      buildRowCells(tr, { modalState: st, row: rows[i], index: i });
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    content.appendChild(table);

    if (!rows.length) renderEmpty(content, st);
  }
}
