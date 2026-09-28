/**
 * Shared options modal/editor for items and scene objects.
 *
 * Thin domain adapter over the parameterized `list-editor.js` (review
 * phase 5): window lifecycle, toolbar, table skeleton and the actions pill
 * live in one place; only option-row rendering stays here.
 */

import { openActionEditor } from './action-editor.js';
import {
  openListModal,
  createActionsPill,
  notifyListChange,
  showNewRowMenu,
  showRowMenu,
} from './list-editor.js';

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
  subtitle = '',
  modalKey = title,
  ownerLabel = title,
  onChange = null,
  actionViewerContext = {},
  createDefaultOption = () => createOption(),
}) {
  const initialState = { target, scriptId, ownerLabel, onChange, actionViewerContext, createDefaultOption, title, subtitle };
  return openListModal({
    modalKey,
    title: 'Options',
    subtitle: subtitle || getOptionsSubtitle(title),
    icon: 'tune',
    initialState,
    onReuse: (st, next) => {
      st.target = next.target;
      st.scriptId = next.scriptId;
      st.ownerLabel = next.ownerLabel;
      st.onChange = next.onChange;
      st.actionViewerContext = next.actionViewerContext;
      st.createDefaultOption = next.createDefaultOption;
      st.title = next.title;
      st.subtitle = next.subtitle;
    },
    getSubtitle: (st) => st.subtitle || getOptionsSubtitle(st.title),
    columns: [
      { label: 'Icon', className: 'items-opt-th-icon' },
      { label: 'Text' },
      { label: 'Actions' },
    ],
    getRows: (st) => getOptions(st.target),
    buildRowCells: (tr, { modalState: st, row: opt, index: i }) =>
      buildOptionRowCells(tr, st, opt, i),
    renderEmpty: (content, st) => {
      const empty = document.createElement('div');
      empty.className = 'items-viewer-empty';
      empty.textContent = st.collapsed
        ? 'No options defined.'
        : 'No options defined. Right-click to create one.';
      content.appendChild(empty);
    },
    onEmptyContextMenu: (x, y, st) =>
      showNewRowMenu(x, y, 'New option', () => createNewOption(st)),
    onRowContextMenu: (x, y, st, _row, index) =>
      showRowMenu(x, y, 'New option', () => createNewOption(st), () => deleteOption(st, index)),
    onAdd: (st) => createNewOption(st),
    addTitle: 'Add option',
    collapseTitleCollapsed: 'Expand options',
    collapseTitleExpanded: 'Collapse options',
  });
}

function getOptionsSubtitle(title) {
  const label = String(title || '').replace(/\s*[—-]\s*Options\s*$/i, '').trim();
  return label && label.toLowerCase() !== 'options' ? label : '';
}

function getOptions(target) {
  if (!Array.isArray(target.options)) target.options = [];
  return target.options;
}

function buildOptionRowCells(tr, st, opt, i) {
  const { scriptId, ownerLabel, onChange, actionViewerContext } = st;

  const tdIcon = document.createElement('td');
  tdIcon.className = 'items-opt-td-icon';
  if (st.collapsed) {
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
      notifyListChange(scriptId, onChange);
    });
    tdIcon.appendChild(iconInput);
  }
  tr.appendChild(tdIcon);

  const tdText = document.createElement('td');
  tdText.className = 'items-opt-td-text';
  if (st.collapsed) {
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
      notifyListChange(scriptId, onChange);
    });
    tdText.appendChild(textInput);
  }
  tr.appendChild(tdText);

  const tdActions = document.createElement('td');
  tdActions.className = 'items-opt-td-actions';
  const actions = Array.isArray(opt.actions) ? opt.actions : (opt.actions = []);
  if (st.collapsed) {
    const count = document.createElement('span');
    count.className = 'items-options-compact-actions';
    count.textContent = `${actions.length} action${actions.length === 1 ? '' : 's'}`;
    tdActions.appendChild(count);
  } else {
    tdActions.appendChild(createOptionActionsPill({
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
}

function createOptionActionsPill({
  ownerLabel,
  optionIndex,
  option,
  actions,
  scriptId,
  onChange,
  actionViewerContext,
}) {
  return createActionsPill(actions.length, (renderPill) => {
    openActionEditor(
      `${ownerLabel} — ${option.text || 'Option ' + (optionIndex + 1)}`,
      actions,
      {
        ...actionViewerContext,
        onChange: () => {
          renderPill(actions.length);
          notifyListChange(scriptId, onChange);
        },
      }
    );
  });
}

function createNewOption(st) {
  getOptions(st.target).push(st.createDefaultOption());
  notifyListChange(st.scriptId, st.onChange);
  st.rebuild();
}

function deleteOption(st, index) {
  const options = getOptions(st.target);
  if (index < 0 || index >= options.length) return;
  options.splice(index, 1);
  notifyListChange(st.scriptId, st.onChange);
  st.rebuild();
}
