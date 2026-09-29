/**
 * Scene sequences editor.
 *
 * Thin domain adapter over `list-editor.js`: window lifecycle,
 * table skeleton, add field and the actions pill
 * live in one place; only sequence-name handling stays here.
 */

import { openActionField } from '../action-editor.js';
import { closeWindowsFor } from '../ui/floating-window.js';
import { walkScriptActions } from '../../../js/shared/script-data.js';
import { state, hooks } from '../core/state.js';
import { loadScript } from '../data/script-store.js';
import { findNode } from '../data/fs-provider.js';
import { promptForConfirmation } from '../ui/confirm-dialog.js';
import {
  openListModal,
  createActionsPill,
  notifyListChange,
  showNewRowMenu,
  showRowMenu,
} from './list-editor.js';

export function openSequencesModal({
  sceneData,
  scriptId,
  modalKey = `${scriptId}:sequences`,
  onChange = null,
  actionViewerContext = {},
}) {
  return openListModal({
    modalKey,
    title: 'Sequences',
    subtitle: sceneData?.id || scriptId || '',
    icon: 'code',
    initialState: { sceneData, scriptId, onChange, actionViewerContext },
    onReuse: (st, next) => {
      st.sceneData = next.sceneData;
      st.scriptId = next.scriptId;
      st.onChange = next.onChange;
      st.actionViewerContext = next.actionViewerContext;
    },
    getSubtitle: (st) => st.sceneData?.id || st.scriptId || '',
    columns: [
      { label: 'Name', className: 'sequences-th-name' },
      { label: 'Actions' },
    ],
    getRows: (st) => Object.keys(st.sceneData.sequences || {}),
    buildRowCells: (tr, { modalState: st, row: name }) =>
      buildSequenceRowCells(tr, st, name),
    renderEmpty: (content) => {
      const empty = document.createElement('div');
      empty.className = 'items-viewer-empty';
      empty.textContent = 'Sequences are a shared list of actions, reusable across objects or items.';
      content.appendChild(empty);
    },
    onEmptyContextMenu: (x, y, st) =>
      showNewRowMenu(x, y, 'New sequence', () => createNewSequence(st)),
    onRowContextMenu: (x, y, st, name) =>
      showRowMenu(x, y, 'New sequence', () => createNewSequence(st), () => confirmDeleteSequence(st, name)),
    onAdd: (st) => createNewSequence(st),
    addTitle: 'Add sequence',
  });
}

function ensureSequencesObject(sceneData) {
  if (sceneData.sequences && typeof sceneData.sequences === 'object') return sceneData.sequences;
  sceneData.sequences = {};
  return sceneData.sequences;
}

function buildSequenceRowCells(tr, st, name) {
  const sequences = st.sceneData.sequences;
  const actions = Array.isArray(sequences[name]) ? sequences[name] : [];

  const tdName = document.createElement('td');
  tdName.className = 'sequences-td-name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'items-options-input';
  nameInput.value = name;
  nameInput.placeholder = 'Sequence name';
  nameInput.addEventListener('change', () => renameSequence(st, name, nameInput));
  tdName.appendChild(nameInput);
  tr.appendChild(tdName);

  const tdActions = document.createElement('td');
  tdActions.className = 'items-opt-td-actions';
  tdActions.appendChild(createSequenceActionsPill({
    sceneId: st.sceneData.id,
    name,
    actions,
    sequences,
    scriptId: st.scriptId,
    onChange: st.onChange,
    actionViewerContext: st.actionViewerContext,
  }));
  tr.appendChild(tdActions);
}

function createSequenceActionsPill({ sceneId, name, actions, sequences, scriptId, onChange, actionViewerContext }) {
  return createActionsPill(actions.length, (renderPill) => {
    openActionField(`${sceneId} — ${name}`, sequences, name, {
      ...actionViewerContext,
      onChange: () => {
        renderPill(sequences[name].length);
        notifyListChange(scriptId, onChange);
      },
    });
  });
}

function createNewSequence(st) {
  const sequences = ensureSequencesObject(st.sceneData);
  const name = getNextSequenceName(sequences);
  sequences[name] = [];
  notifyListChange(st.scriptId, st.onChange);
  st.rebuild();
}

async function renameSequence(st, prevName, input) {
  const sequences = ensureSequencesObject(st.sceneData);
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

  input.disabled = true;
  let items;
  try {
    if (findNode('items/items.json')) items = await loadScript('items/items');
    if (!st.fw.el.isConnected || state.scripts[st.scriptId] !== st.sceneData) return;
  } catch (err) {
    input.value = prevName;
    hooks.toast?.(`Rename failed: ${err.message}`, 'error');
    return;
  } finally {
    input.disabled = false;
  }
  if (!(prevName in sequences) || nextName in sequences) {
    st.rebuild();
    return;
  }
  const actions = sequences[prevName];
  // Draft editors belong to the sequence table until their first edit.
  closeWindowsFor(sequences);
  delete sequences[prevName];
  sequences[nextName] = actions;
  const rewrite = data => {
    walkScriptActions(data, action => {
      if (action.run === prevName) action.run = nextName;
      if (action.fork === prevName) action.fork = nextName;
      if (action.fork?.run === prevName) action.fork.run = nextName;
    });
  };
  rewrite(st.sceneData);
  let sharedItemReference = false;
  walkScriptActions(items, action => {
    if (action.run === prevName || action.fork === prevName || action.fork?.run === prevName) sharedItemReference = true;
  });
  // Item actions resolve sequences in the active scene. Keep their shared
  // name working here without rewriting their meaning in other scenes.
  if (sharedItemReference) sequences[prevName] = [{ run: nextName }];
  input.classList.remove('prop-input-error');
  input.value = nextName;
  notifyListChange(st.scriptId, st.onChange);
  st.rebuild();
}

async function confirmDeleteSequence(st, name) {
  const sequences = ensureSequencesObject(st.sceneData);
  const actions = Array.isArray(sequences[name]) ? sequences[name] : [];
  if (actions.length > 0) {
    const confirmed = await promptForConfirmation({
      title: 'Delete sequence?',
      icon: 'warning',
      message: `Sequence "${name}" has ${actions.length} action${actions.length === 1 ? '' : 's'}. Delete it anyway?`,
      confirmLabel: 'Delete',
    });
    if (!confirmed || !st.fw.el.isConnected) return;
  }

  deleteSequence(st, name);
}

function deleteSequence(st, name) {
  const sequences = ensureSequencesObject(st.sceneData);
  closeWindowsFor(sequences);
  delete sequences[name];
  notifyListChange(st.scriptId, st.onChange);
  st.rebuild();
}

function getNextSequenceName(sequences) {
  let index = 1;
  while (`sequence_${index}` in sequences) index += 1;
  return `sequence_${index}`;
}
