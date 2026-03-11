/**
 * Shared options modal/editor for items and scene objects.
 */

import { hooks, markDirty } from './state.js';
import { createFloatingWindow } from './floating-window.js';
import { openActionEditor } from './action-editor.js';
import { showContextMenu } from './context-menu.js';

/** @type {Map<string, ReturnType<typeof createFloatingWindow>>} */
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
  if (existing && !existing.el.classList.contains('hidden')) {
    existing.open();
    return existing;
  }

  const fw = createFloatingWindow({
    title,
    icon: 'tune',
    iconClass: 'material-symbols-outlined',
    width: 500,
    height: 400,
    resizable: true,
  });

  _openModals.set(modalKey, fw);
  fw.onClose(() => _openModals.delete(modalKey));
  fw.body.classList.add('options-editor-body');

  buildOptionsContent(fw.body, {
    target,
    scriptId,
    ownerLabel,
    onChange,
    actionViewerContext,
    createDefaultOption,
  });
  fw.open();
  return fw;
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
  container.oncontextmenu = (e) => {
    const row = e.target.closest('.items-options-row');
    if (row) return;
    e.preventDefault();
    showOptionsEmptyContextMenu(e.clientX, e.clientY, ctx, container);
  };

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
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const tr = document.createElement('tr');
    tr.className = 'items-options-row';
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showOptionRowContextMenu(e.clientX, e.clientY, ctx, i, container);
    });

    const tdIcon = document.createElement('td');
    tdIcon.className = 'items-opt-td-icon';
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
    tr.appendChild(tdIcon);

    const tdText = document.createElement('td');
    tdText.className = 'items-opt-td-text';
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
    tr.appendChild(tdText);

    const tdActions = document.createElement('td');
    tdActions.className = 'items-opt-td-actions';
    const actions = Array.isArray(opt.actions) ? opt.actions : (opt.actions = []);
    if (actions.length > 0) {
      tdActions.appendChild(createActionsPill({
        ownerLabel,
        optionIndex: i,
        option: opt,
        actions,
        scriptId,
        onChange,
        actionViewerContext,
      }));
    } else {
      const pill = createActionsPill({
        ownerLabel,
        optionIndex: i,
        option: opt,
        actions,
        scriptId,
        onChange,
        actionViewerContext,
      });
      pill.title = 'Edit actions';
      tdActions.appendChild(pill);
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'items-viewer-empty';
    empty.textContent = 'No options defined. Right-click to create one.';
    container.appendChild(empty);
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
    pill.className = 'av-mini-btn items-actions-pill';
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

  function showOptionsEmptyContextMenu(x, y, ctx, container) {
    showContextMenu(x, y, [
      { icon: 'add_box', label: 'New option', onClick: () => createNewOption(ctx, container) },
    ]);
  }

  function showOptionRowContextMenu(x, y, ctx, index, container) {
    showContextMenu(x, y, [
      { icon: 'add_box', label: 'New option', onClick: () => createNewOption(ctx, container) },
      { separator: true },
      { icon: 'delete', label: 'Delete', danger: true, onClick: () => deleteOption(ctx, index, container) },
    ]);
  }

  function createNewOption(ctx, container) {
    getOptions(ctx.target).push(ctx.createDefaultOption());
    notifyChange(ctx.scriptId, ctx.onChange);
    buildOptionsContent(container, ctx);
  }

  function deleteOption(ctx, index, container) {
    const options = getOptions(ctx.target);
    if (index < 0 || index >= options.length) return;
    options.splice(index, 1);
    notifyChange(ctx.scriptId, ctx.onChange);
    buildOptionsContent(container, ctx);
  }
}
