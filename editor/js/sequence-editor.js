/**
 * Scene sequences editor.
 */

import { hooks, markDirty } from './state.js';
import { createFloatingWindow } from './floating-window.js';
import { createEditorToolbar } from './editor-toolbar.js';
import { openActionEditor } from './action-editor.js';
import { showContextMenu } from './context-menu.js';
import { promptForConfirmation } from './confirm-dialog.js';

/** @type {Map<string, { fw: ReturnType<typeof createFloatingWindow>, state: object }>} */
const _openWindows = new Map();

export function openSequencesModal({
  sceneData,
  scriptId,
  modalKey = `${scriptId}:sequences`,
  onChange = null,
  actionViewerContext = {},
}) {
  const existing = _openWindows.get(modalKey);
  if (existing && !existing.fw.el.classList.contains('hidden')) {
    existing.fw.open();
    return existing.fw;
  }

  const fw = createFloatingWindow({
    title: 'Sequences',
    subtitle: sceneData?.id || scriptId || '',
    icon: 'code',
    iconClass: 'material-symbols-outlined',
    width: 500,
    height: 400,
    resizable: true,
  });

  fw.body.classList.add('options-editor-body');

  const windowState = {
    fw,
    collapsed: false,
    sceneData,
    scriptId,
    onChange,
    actionViewerContext,
    rebuild() {
      buildSequencesContent(fw.body, windowState);
    },
  };

  _openWindows.set(modalKey, { fw, state: windowState });
  fw.onClose(() => _openWindows.delete(modalKey));
  windowState.rebuild();
  fw.open();
  return fw;
}

function ensureSequencesObject(sceneData) {
  if (sceneData.sequences && typeof sceneData.sequences === 'object') return sceneData.sequences;
  if (sceneData.definitions && typeof sceneData.definitions === 'object') return sceneData.definitions;
  sceneData.sequences = {};
  return sceneData.sequences;
}

function notifyChange(scriptId, onChange) {
  markDirty(scriptId);
  hooks.renderViewport();
  hooks.renderProperties();
  onChange?.();
}

function buildSequencesContent(container, ctx) {
  const sequences = ensureSequencesObject(ctx.sceneData);
  const names = Object.keys(sequences);

  container.innerHTML = '';
  container.oncontextmenu = null;

  const toolbar = createEditorToolbar({
    collapsed: ctx.collapsed,
    onToggleCollapse: () => {
      ctx.collapsed = !ctx.collapsed;
      ctx.rebuild();
    },
    addLabel: 'Add',
    addTitle: 'Add sequence',
    addAriaLabel: 'Add sequence',
    onAdd: () => createNewSequence(ctx),
    collapseTitleCollapsed: 'Expand sequences',
    collapseTitleExpanded: 'Collapse sequences',
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
        showSequencesEmptyContextMenu(e.clientX, e.clientY, ctx);
      };

  const table = document.createElement('table');
  table.className = `items-options-table${ctx.collapsed ? ' items-options-table-compact' : ''}`;

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr>' +
    '<th class="sequences-th-name">Name</th>' +
    '<th>Actions</th>' +
    '</tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const actions = Array.isArray(sequences[name]) ? sequences[name] : (sequences[name] = []);

    const tr = document.createElement('tr');
    tr.className = 'items-options-row';
    if (!ctx.collapsed) {
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSequenceRowContextMenu(e.clientX, e.clientY, ctx, name);
      });
    }

    const tdName = document.createElement('td');
    tdName.className = 'sequences-td-name';
    if (ctx.collapsed) {
      const textValue = document.createElement('span');
      textValue.className = 'items-options-compact-text';
      textValue.textContent = name;
      tdName.appendChild(textValue);
    } else {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'items-options-input';
      nameInput.value = name;
      nameInput.placeholder = 'Sequence name';
      nameInput.addEventListener('change', () => renameSequence(ctx, name, nameInput));
      tdName.appendChild(nameInput);
    }
    tr.appendChild(tdName);

    const tdActions = document.createElement('td');
    tdActions.className = 'items-opt-td-actions';
    if (ctx.collapsed) {
      const count = document.createElement('span');
      count.className = 'items-options-compact-actions';
      count.textContent = `${actions.length} action${actions.length === 1 ? '' : 's'}`;
      tdActions.appendChild(count);
    } else {
      tdActions.appendChild(createActionsPill({
        sceneId: ctx.sceneData.id,
        name,
        actions,
        scriptId: ctx.scriptId,
        onChange: ctx.onChange,
        actionViewerContext: ctx.actionViewerContext,
      }));
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  content.appendChild(table);

  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'items-viewer-empty';
    if (ctx.collapsed) {
      empty.textContent = 'No sequences defined.';
    } else {
      empty.innerHTML = 'Sequences are a shared list of actions, reusable across objects or items.<br>Right-click (or click Add) to create a sequence.';
    }
    content.appendChild(empty);
  }
}

function createActionsPill({ sceneId, name, actions, scriptId, onChange, actionViewerContext }) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'ae-mini-btn items-actions-pill';
  pill.innerHTML = '<span class="material-symbols-outlined">list_alt</span> ' + actions.length;
  pill.title = `${actions.length} action(s)`;
  pill.addEventListener('click', () => {
    openActionEditor(`${sceneId} — ${name}`, actions, {
      ...actionViewerContext,
      onChange: () => notifyChange(scriptId, onChange),
    });
  });
  return pill;
}

function showSequencesEmptyContextMenu(x, y, ctx) {
  showContextMenu(x, y, [
    { icon: 'add_box', label: 'New sequence', onClick: () => createNewSequence(ctx) },
  ]);
}

function showSequenceRowContextMenu(x, y, ctx, name) {
  showContextMenu(x, y, [
    { icon: 'add_box', label: 'New sequence', onClick: () => createNewSequence(ctx) },
    { separator: true },
    { icon: 'delete', label: 'Delete', danger: true, onClick: () => confirmDeleteSequence(ctx, name) },
  ]);
}

function createNewSequence(ctx) {
  const sequences = ensureSequencesObject(ctx.sceneData);
  const name = getNextSequenceName(sequences);
  sequences[name] = [];
  notifyChange(ctx.scriptId, ctx.onChange);
  ctx.rebuild();
}

function renameSequence(ctx, prevName, input) {
  const sequences = ensureSequencesObject(ctx.sceneData);
  const nextName = String(input.value || '').trim().replace(/\s+/g, '_');
  if (!nextName) {
    input.value = prevName;
    return;
  }
  if (nextName === prevName) return;
  if (nextName in sequences) {
    input.value = prevName;
    input.classList.add('prop-input-error');
    return;
  }

  const actions = sequences[prevName];
  delete sequences[prevName];
  sequences[nextName] = actions;
  input.classList.remove('prop-input-error');
  input.value = nextName;
  notifyChange(ctx.scriptId, ctx.onChange);
  ctx.rebuild();
}

async function confirmDeleteSequence(ctx, name) {
  const sequences = ensureSequencesObject(ctx.sceneData);
  const actions = Array.isArray(sequences[name]) ? sequences[name] : [];
  if (actions.length > 0) {
    const confirmed = await promptForConfirmation({
      title: 'Delete sequence?',
      icon: 'warning',
      message: `Sequence "${name}" has ${actions.length} action${actions.length === 1 ? '' : 's'}. Delete it anyway?`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
  }

  deleteSequence(ctx, name);
}

function deleteSequence(ctx, name) {
  const sequences = ensureSequencesObject(ctx.sceneData);
  delete sequences[name];
  notifyChange(ctx.scriptId, ctx.onChange);
  ctx.rebuild();
}

function getNextSequenceName(sequences) {
  let index = 1;
  while (`sequence_${index}` in sequences) index += 1;
  return `sequence_${index}`;
}
