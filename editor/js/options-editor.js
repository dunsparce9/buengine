/**
 * Shared options modal/editor for items and scene objects.
 */

import { hooks, markDirty } from './state.js';
import { createFloatingWindow } from './floating-window.js';
import { createEditorToolbar } from './editor-toolbar.js';
import { openActionEditor } from './action-editor.js';
import { showContextMenu } from './context-menu.js';

/** @type {Map<string, { fw: ReturnType<typeof createFloatingWindow>, state: object }>} */
const _openModals = new Map();

export function createOption({ text = 'New option', icon = '', actions = [] } = {}) {
  return { text, icon, actions };
}

export function createDefaultObjectOption() {
  return createOption({ text: 'Interact' });
}

export function openOptionsModal({
  target,
  scriptId,
  title,
  modalKey = title,
  ownerLabel = title,
  onChange = null,
  actionViewerContext = {},
  createDefaultOption = () => createOption(),
}) {
  const existing = _openModals.get(modalKey);
  if (existing && !existing.fw.el.classList.contains('hidden')) {
    existing.fw.open();
    return existing.fw;
  }

  const fw = createFloatingWindow({
    title: 'Options',
    subtitle: getOptionsSubtitle(title),
    icon: 'tune',
    iconClass: 'material-symbols-outlined',
    width: 500,
    height: 400,
    resizable: true,
  });

  fw.body.classList.add('options-editor-body');

  const modalState = {
    fw,
    collapsed: false,
    target,
    scriptId,
    ownerLabel,
    onChange,
    actionViewerContext,
    createDefaultOption,
    rebuild() {
      buildOptionsContent(fw.body, modalState);
    },
  };

  _openModals.set(modalKey, { fw, state: modalState });
  fw.onClose(() => _openModals.delete(modalKey));
  modalState.rebuild();
  fw.open();
  return fw;
}

function getOptionsSubtitle(title) {
  const label = String(title || '').replace(/\s*[—-]\s*Options\s*$/i, '').trim();
  return label && label.toLowerCase() !== 'options' ? label : '';
}

function notifyChange(scriptId, onChange) {
  markDirty(scriptId);
  hooks.renderViewport();
  hooks.renderProperties();
  onChange?.();
}

function getOptions(target) {
  if (!Array.isArray(target.options)) target.options = [];
  return target.options;
}

function buildOptionsContent(container, ctx) {
  const {
    target,
    scriptId,
    ownerLabel,
    onChange,
    actionViewerContext,
    createDefaultOption,
  } = ctx;
  const options = getOptions(target);

  container.innerHTML = '';
  container.oncontextmenu = null;

  const toolbar = createEditorToolbar({
    collapsed: ctx.collapsed,
    onToggleCollapse: () => {
      ctx.collapsed = !ctx.collapsed;
      ctx.rebuild();
    },
    addLabel: 'Add',
    addTitle: 'Add option',
    addAriaLabel: 'Add option',
    onAdd: () => createNewOption(ctx),
    collapseTitleCollapsed: 'Expand options',
    collapseTitleExpanded: 'Collapse options',
    extraClassName: 'options-editor-toolbar',
  });
  container.appendChild(toolbar);

  const content = document.createElement('div');
  content.className = 'options-editor-content';
  container.appendChild(content);

  content.oncontextmenu = ctx.collapsed
    ? null
    : (e) => {
        const row = e.target.closest('.items-options-row');
        if (row) return;
        e.preventDefault();
        showOptionsEmptyContextMenu(e.clientX, e.clientY, ctx);
      };

  const table = document.createElement('table');
  table.className = `items-options-table${ctx.collapsed ? ' items-options-table-compact' : ''}`;

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr>' +
    '<th class="items-opt-th-icon">Icon</th>' +
    '<th>Text</th>' +
    '<th>Actions</th>' +
    '</tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const tr = document.createElement('tr');
    tr.className = 'items-options-row';
    if (!ctx.collapsed) {
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showOptionRowContextMenu(e.clientX, e.clientY, ctx, i);
      });
    }

    const tdIcon = document.createElement('td');
    tdIcon.className = 'items-opt-td-icon';
    if (ctx.collapsed) {
      const iconText = document.createElement('span');
      iconText.className = 'items-options-compact-text items-options-compact-icon';
      iconText.textContent = opt.icon || '—';
      tdIcon.appendChild(iconText);
    } else {
      const iconInput = document.createElement('input');
      iconInput.type = 'text';
      iconInput.className = 'items-options-input items-options-icon-input';
      iconInput.value = opt.icon || '';
      iconInput.placeholder = 'Icon';
      iconInput.addEventListener('input', () => {
        opt.icon = iconInput.value || undefined;
        notifyChange(scriptId, onChange);
      });
      tdIcon.appendChild(iconInput);
    }
    tr.appendChild(tdIcon);

    const tdText = document.createElement('td');
    tdText.className = 'items-opt-td-text';
    if (ctx.collapsed) {
      const textValue = document.createElement('span');
      textValue.className = 'items-options-compact-text';
      textValue.textContent = opt.text || `Option ${i + 1}`;
      tdText.appendChild(textValue);
    } else {
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.className = 'items-options-input';
      textInput.value = opt.text || '';
      textInput.placeholder = 'Option text';
      textInput.addEventListener('input', () => {
        opt.text = textInput.value || undefined;
        notifyChange(scriptId, onChange);
      });
      tdText.appendChild(textInput);
    }
    tr.appendChild(tdText);

    const tdActions = document.createElement('td');
    tdActions.className = 'items-opt-td-actions';
    const actions = Array.isArray(opt.actions) ? opt.actions : (opt.actions = []);
    if (ctx.collapsed) {
      const count = document.createElement('span');
      count.className = 'items-options-compact-actions';
      count.textContent = `${actions.length} action${actions.length === 1 ? '' : 's'}`;
      tdActions.appendChild(count);
    } else {
      tdActions.appendChild(createActionsPill({
        ownerLabel,
        optionIndex: i,
        option: opt,
        actions,
        scriptId,
        onChange,
        actionViewerContext,
      }));
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  content.appendChild(table);

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'items-viewer-empty';
    empty.textContent = ctx.collapsed
      ? 'No options defined.'
      : 'No options defined. Right-click to create one.';
    content.appendChild(empty);
  }

  function createActionsPill({
    ownerLabel,
    optionIndex,
    option,
    actions,
    scriptId,
    onChange,
    actionViewerContext,
  }) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'ae-mini-btn items-actions-pill';
    pill.innerHTML = '<span class="material-symbols-outlined">list_alt</span> ' + actions.length;
    pill.title = `${actions.length} action(s)`;
    pill.addEventListener('click', () => {
      openActionEditor(
        `${ownerLabel} — ${option.text || 'Option ' + (optionIndex + 1)}`,
        actions,
        {
          ...actionViewerContext,
          onChange: () => notifyChange(scriptId, onChange),
        }
      );
    });
    return pill;
  }

  function showOptionsEmptyContextMenu(x, y, ctx) {
    showContextMenu(x, y, [
      { icon: 'add_box', label: 'New option', onClick: () => createNewOption(ctx) },
    ]);
  }

  function showOptionRowContextMenu(x, y, ctx, index) {
    showContextMenu(x, y, [
      { icon: 'add_box', label: 'New option', onClick: () => createNewOption(ctx) },
      { separator: true },
      { icon: 'delete', label: 'Delete', danger: true, onClick: () => deleteOption(ctx, index) },
    ]);
  }

  function createNewOption(ctx) {
    getOptions(ctx.target).push(ctx.createDefaultOption());
    notifyChange(ctx.scriptId, ctx.onChange);
    ctx.rebuild();
  }

  function deleteOption(ctx, index) {
    const options = getOptions(ctx.target);
    if (index < 0 || index >= options.length) return;
    options.splice(index, 1);
    notifyChange(ctx.scriptId, ctx.onChange);
    ctx.rebuild();
  }
}
