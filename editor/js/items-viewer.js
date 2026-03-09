/**
 * Items table viewer — renders items/items.json as a rich table
 * in the viewport, with an options modal linking to Action Viewer.
 */

import { escapeHtml, markDirty } from './state.js';
import { resolveAssetURLSync } from './fs-provider.js';
import { createFloatingWindow } from './floating-window.js';
import { openActionViewer } from './action-viewer.js';

/**
 * Render the items table into the viewport element.
 * @param {Array} items  The parsed items array
 * @param {HTMLElement} viewport  The viewport element
 * @param {string} scriptId  The script id (e.g. 'items/items')
 */
export function renderItemsViewport(items, viewport) {
  const wrap = document.createElement('div');
  wrap.className = 'items-viewer';

  const heading = document.createElement('div');
  heading.className = 'items-viewer-heading';
  heading.innerHTML =
    '<span class="material-symbols-outlined items-viewer-heading-icon">inventory_2</span>' +
    `<span>Items</span>` +
    `<span class="items-viewer-count">${items.length}</span>`;
  wrap.appendChild(heading);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'items-viewer-empty';
    empty.textContent = 'No items defined';
    wrap.appendChild(empty);
    viewport.appendChild(wrap);
    return;
  }

  const table = document.createElement('table');
  table.className = 'items-table';

  // Header
  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr>' +
    '<th class="items-th-icon"></th>' +
    '<th>ID</th>' +
    '<th>Name</th>' +
    '<th>Stackable</th>' +
    '<th>Droppable</th>' +
    '<th>Options</th>' +
    '</tr>';
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  for (const item of items) {
    const tr = document.createElement('tr');

    // Icon
    const tdIcon = document.createElement('td');
    tdIcon.className = 'items-td-icon';
    if (item.icon) {
      const img = document.createElement('img');
      img.className = 'items-icon-img';
      const url = resolveAssetURLSync(item.icon);
      if (url) img.src = url;
      else img.src = item.icon;
      img.alt = item.name || item.id || '';
      img.draggable = false;
      tdIcon.appendChild(img);
    }
    tr.appendChild(tdIcon);

    // ID
    const tdId = document.createElement('td');
    tdId.className = 'items-td-id';
    tdId.textContent = item.id || '—';
    tr.appendChild(tdId);

    // Name
    const tdName = document.createElement('td');
    tdName.className = 'items-td-name';
    tdName.textContent = item.name || '—';
    tr.appendChild(tdName);

    // Stackable
    const tdStack = document.createElement('td');
    tdStack.className = 'items-td-bool';
    tdStack.innerHTML = item.stackable
      ? '<span class="items-bool-yes">&#10003;</span>'
      : '<span class="items-bool-no">&#10007;</span>';
    tr.appendChild(tdStack);

    // Droppable
    const tdDrop = document.createElement('td');
    tdDrop.className = 'items-td-bool';
    tdDrop.innerHTML = item.droppable
      ? '<span class="items-bool-yes">&#10003;</span>'
      : '<span class="items-bool-no">&#10007;</span>';
    tr.appendChild(tdDrop);

    // Options
    const tdOpts = document.createElement('td');
    tdOpts.className = 'items-td-options';
    const opts = item.options || [];
    if (opts.length > 0) {
      const pill = document.createElement('button');
      pill.className = 'items-options-pill';
      // Show first few option texts as preview
      const preview = opts.slice(0, 2).map(o => o.text || '…').join(', ');
      const more = opts.length > 2 ? `, +${opts.length - 2}` : '';
      pill.innerHTML =
        `<span class="material-symbols-outlined">tune</span>` +
        `<span class="items-options-pill-text">${escapeHtml(preview + more)}</span>` +
        `<span class="items-options-pill-count">${opts.length}</span>`;
      pill.addEventListener('click', () => openOptionsModal(item));
      tdOpts.appendChild(pill);
    } else {
      tdOpts.innerHTML = '<span class="items-no-options">—</span>';
    }
    tr.appendChild(tdOpts);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  viewport.appendChild(wrap);
}

/**
 * Render items summary into the properties panel.
 * @param {Array} items  The parsed items array
 * @param {HTMLElement} container  The props content element
 */
export function renderItemsProperties(items, container) {
  // Summary group
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = document.createElement('div');
  heading.className = 'prop-group-title';
  heading.textContent = 'Items';
  group.appendChild(heading);

  const rows = [
    ['count', String(items.length)],
    ['stackable', String(items.filter(i => i.stackable).length)],
    ['droppable', String(items.filter(i => i.droppable).length)],
  ];

  for (const [key, val] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML =
      `<span class="prop-key">${escapeHtml(key)}</span>` +
      `<span class="prop-val">${escapeHtml(val)}</span>`;
    group.appendChild(row);
  }

  container.appendChild(group);

  // Per-item listing
  const listGroup = document.createElement('div');
  listGroup.className = 'prop-group';

  const listHeading = document.createElement('div');
  listHeading.className = 'prop-group-title';
  listHeading.textContent = 'All items';
  listGroup.appendChild(listHeading);

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML =
      `<span class="prop-key">${escapeHtml(item.id || '?')}</span>` +
      `<span class="prop-val">${escapeHtml(item.name || '—')}</span>`;
    listGroup.appendChild(row);
  }

  container.appendChild(listGroup);
}

/* ── Options modal ─────────────────────────────── */

/** @type {Map<string, ReturnType<typeof createFloatingWindow>>} */
const _openModals = new Map();

function openOptionsModal(item) {
  const key = `${item.id} — Options`;

  const existing = _openModals.get(key);
  if (existing && !existing.el.classList.contains('hidden')) {
    existing.open();
    return;
  }

  const fw = createFloatingWindow({
    title: key,
    icon: 'tune',
    iconClass: 'material-symbols-outlined',
    width: 500,
    height: 400,
    resizable: true,
  });

  _openModals.set(key, fw);
  fw.onClose(() => _openModals.delete(key));

  buildOptionsContent(fw.body, item);
  fw.open();
}

function buildOptionsContent(container, item) {
  const opts = item.options || [];

  if (opts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'items-viewer-empty';
    empty.textContent = 'No options defined';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'items-options-table';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr>' +
    '<th class="items-opt-th-icon">Icon</th>' +
    '<th>Text</th>' +
    '<th>Actions</th>' +
    '</tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    const tr = document.createElement('tr');

    // Icon
    const tdIcon = document.createElement('td');
    tdIcon.className = 'items-opt-td-icon';
    tdIcon.textContent = opt.icon || '—';
    tr.appendChild(tdIcon);

    // Text
    const tdText = document.createElement('td');
    tdText.className = 'items-opt-td-text';
    tdText.textContent = opt.text || '—';
    tr.appendChild(tdText);

    // Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'items-opt-td-actions';
    const actions = opt.actions || [];
    if (actions.length > 0) {
      const pill = document.createElement('button');
      pill.className = 'av-mini-btn items-actions-pill';
      pill.innerHTML =
        `<span class="material-symbols-outlined">list_alt</span> ${actions.length}`;
      pill.title = `${actions.length} action(s)`;
      pill.addEventListener('click', () => {
        openActionViewer(
          `${item.name || item.id} — ${opt.text || 'Option ' + (i + 1)}`,
          actions,
          { onChange: () => markDirty('items/items') }
        );
      });
      tdActions.appendChild(pill);
    } else {
      tdActions.textContent = '—';
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);
}
