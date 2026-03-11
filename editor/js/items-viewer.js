/**
 * Items viewer/editor for items/items.json.
 */

import {
  state,
  hooks,
  escapeHtml,
  markDirty,
  addItemDefinition,
  deleteItemDefinition,
  uniqueItemId,
} from './state.js';
import { resolveAssetURLSync } from './fs-provider.js';
import { showContextMenu } from './context-menu.js';
import { openOptionsModal } from './options-editor.js';
import { openActionEditor } from './action-editor.js';
import { createSectionHeader } from './section-header.js';

const ITEM_SECTION_ICONS = {
  'Items': 'inventory_2',
  'Item': 'category',
  'Flags': 'flag',
  'Options': 'tune',
};

function createGroupTitle(title, options) {
  return createSectionHeader(title, {
    iconMap: ITEM_SECTION_ICONS,
    ...options,
  });
}

export function renderItemsViewport(items, viewport) {
  syncSelectedItem(items);

  const wrap = document.createElement('div');
  wrap.className = 'items-viewer';

  const header = document.createElement('div');
  header.className = 'items-viewer-heading';
  header.innerHTML =
    '<span class="material-symbols-outlined items-viewer-heading-icon">inventory_2</span>' +
    '<span>Items</span>' +
    `<span class="items-viewer-count">${items.length}</span>`;
  wrap.appendChild(header);

  wrap.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.items-list-row');
    if (row) return;
    e.preventDefault();
    showEmptyItemsContextMenu(e.clientX, e.clientY);
  });

  const list = document.createElement('div');
  list.className = 'items-list';

  if (!items.length) {
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.className = 'items-viewer-empty items-viewer-empty-action';
    empty.innerHTML =
      '<span class="material-symbols-outlined">add_box</span>' +
      '<span>No items defined. Right-click or click here to create one.</span>';
    empty.addEventListener('click', createNewItem);
    list.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'items-table';

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

    const tbody = document.createElement('tbody');
    for (const item of items) {
      tbody.appendChild(createItemRow(item));
    }
    table.appendChild(tbody);
    list.appendChild(table);
  }

  wrap.appendChild(list);
  viewport.appendChild(wrap);
}

export function renderItemsProperties(items, container) {
  syncSelectedItem(items);

  const selected = items.find(item => item?.id === state.selectedItem) || null;
  if (!selected) {
    renderItemsSummary(items, container);
    return;
  }

  renderSelectedItemEditor(selected, items, container);
}

export function openItemOptionsModal(item) {
  const scriptId = state.selectedId || 'items/items';
  openOptionsModal({
    target: item,
    scriptId,
    title: `${item.id} — Options`,
    subtitle: item.name || item.id,
    modalKey: `${scriptId}:${item.id}:options`,
    ownerLabel: item.name || item.id,
  });
}

function syncSelectedItem(items) {
  if (!items.length) {
    state.selectedItem = null;
    return;
  }
  if (state.selectedItem && items.some(item => item?.id === state.selectedItem)) return;
  state.selectedItem = items[0]?.id || null;
}

function createItemRow(item) {
  const row = document.createElement('tr');
  row.className = 'items-list-row';
  row.dataset.itemId = item.id || '';
  if (item.id === state.selectedItem) row.classList.add('selected');

  row.addEventListener('click', () => {
    state.selectedItem = item.id || null;
    hooks.renderViewport();
    hooks.renderProperties();
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.selectedItem = item.id || null;
    hooks.renderViewport();
    hooks.renderProperties();
    showItemContextMenu(e.clientX, e.clientY, item);
  });

  const tdIcon = document.createElement('td');
  tdIcon.className = 'items-td-icon';
  if (item.icon) {
    const img = document.createElement('img');
    img.className = 'items-icon-img';
    const url = resolveAssetURLSync(item.icon);
    img.src = url || item.icon;
    img.alt = item.name || item.id || '';
    img.draggable = false;
    tdIcon.appendChild(img);
  } else {
    tdIcon.innerHTML = '<span class="material-symbols-outlined items-icon-fallback">deployed_code</span>';
  }
  row.appendChild(tdIcon);

  const tdId = document.createElement('td');
  tdId.className = 'items-td-id';
  tdId.textContent = item.id || '—';
  row.appendChild(tdId);

  const tdName = document.createElement('td');
  tdName.className = 'items-td-name';
  tdName.textContent = item.name || '—';
  row.appendChild(tdName);

  const tdStack = document.createElement('td');
  tdStack.className = 'items-td-bool';
  tdStack.innerHTML = renderBoolCell(item.stackable);
  row.appendChild(tdStack);

  const tdDrop = document.createElement('td');
  tdDrop.className = 'items-td-bool';
  tdDrop.innerHTML = renderBoolCell(item.droppable !== false);
  row.appendChild(tdDrop);

  const tdOptions = document.createElement('td');
  tdOptions.className = 'items-td-options';
  const opts = item.options || [];
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'items-options-pill';
  const preview = opts.length
    ? opts.slice(0, 2).map(opt => opt.text || '…').join(', ')
    : 'No options';
  const more = opts.length > 2 ? `, +${opts.length - 2}` : '';
  pill.innerHTML =
    '<span class="material-symbols-outlined">tune</span>' +
    `<span class="items-options-pill-text">${escapeHtml(preview + more)}</span>` +
    `<span class="items-options-pill-count">${opts.length}</span>`;
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    openItemOptionsModal(item);
  });
  tdOptions.appendChild(pill);
  row.appendChild(tdOptions);
  return row;
}

function renderBoolCell(enabled) {
  return enabled
    ? '<span class="items-bool-yes">&#10003;</span>'
    : '<span class="items-bool-no">&#10007;</span>';
}

function renderItemsSummary(items, container) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = createGroupTitle('Items');
  group.appendChild(heading);

  const rows = [
    ['count', String(items.length)],
    ['stackable', String(items.filter(item => item?.stackable).length)],
    ['droppable', String(items.filter(item => item?.droppable).length)],
  ];

  for (const [key, value] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML =
      `<span class="prop-key">${escapeHtml(key)}</span>` +
      `<span class="prop-val">${escapeHtml(value)}</span>`;
    group.appendChild(row);
  }

  const help = document.createElement('div');
  help.className = 'props-empty';
  help.textContent = items.length
    ? 'Select an item in the center pane to edit it.'
    : 'Right-click the center pane to create an item.';
  group.appendChild(help);

  container.appendChild(group);
}

function renderSelectedItemEditor(item, items, container) {
  const scriptId = state.selectedId || 'items/items';

  addEditablePropGroup('Item', [
    {
      key: 'id',
      value: item.id ?? '',
      event: 'change',
      onChange: (value, input) => {
        const nextId = value.trim().replace(/\s+/g, '_');
        if (!nextId) {
          input.value = item.id || '';
          return;
        }
        const clash = items.some(other => other !== item && other?.id === nextId);
        if (clash) {
          input.classList.add('prop-input-error');
          return;
        }
        input.classList.remove('prop-input-error');
        item.id = nextId;
        state.selectedItem = nextId;
        input.value = nextId;
        markDirty(scriptId);
        hooks.renderViewport();
        hooks.renderProperties();
      },
    },
    {
      key: 'name',
      value: item.name ?? '',
      event: 'input',
      onChange: value => {
        item.name = value;
        markDirty(scriptId);
        hooks.renderViewport();
      },
    },
    {
      key: 'icon',
      value: item.icon ?? '',
      placeholder: '(none)',
      event: 'input',
      onChange: value => {
        item.icon = value || undefined;
        markDirty(scriptId);
        hooks.renderViewport();
      },
    },
  ], container);

  addEditablePropGroup('Flags', [
    {
      key: 'stackable',
      value: Boolean(item.stackable),
      type: 'checkbox',
      onChange: value => {
        item.stackable = Boolean(value);
        markDirty(scriptId);
        hooks.renderViewport();
      },
    },
    {
      key: 'droppable',
      value: item.droppable !== false,
      type: 'checkbox',
      onChange: value => {
        item.droppable = Boolean(value);
        markDirty(scriptId);
        hooks.renderViewport();
      },
    },
  ], container);

  renderReadonlyOptions(item, container, scriptId);
}

function renderReadonlyOptions(item, container, scriptId) {
  const ownerLabel = item.name || item.id;
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = createGroupTitle(`Options (${(item.options || []).length})`, {
    onClick: () => openItemOptionsModal(item),
  });
  group.appendChild(heading);

  const options = item.options || [];
  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'props-empty';
    empty.textContent = 'No options defined';
    group.appendChild(empty);
    container.appendChild(group);
    return;
  }

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const row = document.createElement('div');
    row.className = 'prop-row';

    const key = document.createElement('span');
    key.className = 'prop-key';
    key.textContent = opt.text || `Option ${i + 1}`;

    const meta = document.createElement('span');
    meta.className = 'prop-val prop-option-meta';

    const icon = document.createElement('span');
    icon.textContent = opt.icon || '—';

    const separator = document.createElement('span');
    separator.textContent = '·';

    const link = document.createElement('span');
    link.className = 'prop-action-link';
    link.textContent = `${Array.isArray(opt.actions) ? opt.actions.length : 0} action(s)`;
    link.addEventListener('click', () => {
      const actions = Array.isArray(opt.actions) ? opt.actions : (opt.actions = []);
      openActionEditor(
        `${ownerLabel} — ${opt.text || 'Option ' + (i + 1)}`,
        actions,
        {
          onChange: () => {
            markDirty(scriptId);
            hooks.renderViewport();
            hooks.renderProperties();
          },
        }
      );
    });

    meta.append(icon, separator, link);
    row.append(key, meta);
    group.appendChild(row);
  }

  container.appendChild(group);
}

function addEditablePropGroup(title, fields, container) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = createGroupTitle(title);
  group.appendChild(heading);

  for (const field of fields) {
    const row = document.createElement('label');
    row.className = 'prop-row';

    const key = document.createElement('span');
    key.className = 'prop-key';
    key.textContent = field.key;

    let input;
    if (field.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'prop-checkbox';
      input.checked = Boolean(field.value);
      input.addEventListener('change', () => field.onChange?.(input.checked, input));
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      input.className = 'prop-input';
      input.value = field.value ?? '';
      if (field.placeholder) input.placeholder = field.placeholder;
      const eventName = field.event || 'change';
      input.addEventListener(eventName, () => field.onChange?.(input.value, input));
      if (eventName !== 'input') {
        input.addEventListener('input', () => input.classList.remove('prop-input-error'));
      }
    }

    row.append(key, input);
    group.appendChild(row);
  }

  container.appendChild(group);
}

function createNewItem() {
  addItemDefinition({
    id: uniqueItemId('item'),
    name: 'New Item',
    stackable: false,
    droppable: true,
    options: [],
  });
}

function showEmptyItemsContextMenu(x, y) {
  showContextMenu(x, y, [
    { icon: 'add_box', label: 'New item', onClick: createNewItem },
  ]);
}

function showItemContextMenu(x, y, item) {
  showContextMenu(x, y, [
    { icon: 'add_box', label: 'New item', onClick: createNewItem },
    { separator: true },
    { icon: 'delete', label: 'Delete', danger: true, onClick: () => deleteItemDefinition(item.id) },
  ]);
}
