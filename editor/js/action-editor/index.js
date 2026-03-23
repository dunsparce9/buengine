import { createFloatingWindow } from '../floating-window.js';
import { createEditorToolbar } from '../editor-toolbar.js';
import { ACTION_TYPES, detectType, createDefaultAction, getActionMeta } from '../../../js/action-schema.js';
import {
  getOpenEditor,
  setOpenEditor,
  deleteOpenEditor,
  registerEditableList,
  registerEmptyDropZone,
} from './state.js';
import {
  shortenText,
  cloneAction,
  notifyEditorChange,
  cleanAction,
  adjustEditingIdxAfterInsert,
  adjustEditingIdxAfterRemove,
} from './utils.js';
import { createActionRenderers, getBadges, renderCollapsedSummary } from './renderers.js';
import { createFormBuilders } from './forms.js';
import { createDragController } from './drag.js';

const inlineEditorStates = new WeakMap();

const renderers = createActionRenderers(openActionEditor, {
  buildReadOnlyList,
  buildNestedList,
  pickActionType,
  createDefaultAction,
});
const forms = createFormBuilders(openActionEditor);
const drag = createDragController({ moveActionBetweenEditors });

function preventMouseFocus(button) {
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  return button;
}

export function openActionEditor(title, actions, opts = {}) {
  const displayTitle = title || 'Actions';
  const editorKey = getEditorKey(displayTitle, actions, opts);
  const existing = getOpenEditor(editorKey);
  if (existing && !existing.fw.el.classList.contains('hidden')) {
    existing.actions = actions;
    existing.opts = opts;
    existing.fw.setSubtitle(displayTitle === 'Actions' ? '' : displayTitle);
    existing.fw.open();
    existing.fw.requestAttention();
    return;
  }

  const fw = createFloatingWindow({
    title: 'Actions',
    subtitle: displayTitle === 'Actions' ? '' : displayTitle,
    icon: 'list_alt',
    iconClass: 'material-symbols-outlined',
    width: 480,
    height: 540,
    resizable: true,
  });

  const editorState = {
    key: editorKey,
    fw,
    actions,
    opts,
    collapsed: true,
    editingIdx: null,
    pendingRevealIdx: null,
    rebuild() {
      fw.body.innerHTML = '';
      buildEditorContent(fw.body, editorState);
    },
  };
  editorState.rootEditorState = editorState;

  setOpenEditor(editorKey, editorState);
  fw.onClose(() => deleteOpenEditor(editorKey));
  editorState.rebuild();
  fw.open();
}

function getEditorKey(title, actions, opts) {
  if (opts.editorKey != null) return opts.editorKey;
  if (actions && (typeof actions === 'object' || typeof actions === 'function')) return actions;
  return title || 'Actions';
}

function moveActionBetweenEditors(sourceEditor, sourceIdx, targetEditor, targetIdx) {
  if (!sourceEditor || !targetEditor) return;
  if (sourceIdx == null || sourceIdx < 0 || sourceIdx >= sourceEditor.actions.length) return;

  if (sourceEditor === targetEditor) {
    const [item] = sourceEditor.actions.splice(sourceIdx, 1);
    let insertIdx = targetIdx;
    if (sourceIdx < insertIdx) insertIdx--;
    sourceEditor.actions.splice(insertIdx, 0, item);
    if (sourceEditor.editingIdx === sourceIdx) {
      sourceEditor.editingIdx = insertIdx;
    } else if (sourceEditor.editingIdx != null) {
      if (sourceIdx < sourceEditor.editingIdx && insertIdx >= sourceEditor.editingIdx) sourceEditor.editingIdx--;
      else if (sourceIdx > sourceEditor.editingIdx && insertIdx <= sourceEditor.editingIdx) sourceEditor.editingIdx++;
    }
    notifyEditorChange(sourceEditor);
    sourceEditor.rebuild();
    return;
  }

  const [item] = sourceEditor.actions.splice(sourceIdx, 1);
  adjustEditingIdxAfterRemove(sourceEditor, sourceIdx);
  targetEditor.actions.splice(targetIdx, 0, item);
  adjustEditingIdxAfterInsert(targetEditor, targetIdx);
  notifyEditorChange(sourceEditor);
  notifyEditorChange(targetEditor);
  sourceEditor.rebuild();
  targetEditor.rebuild();
}

function buildEditorContent(container, editorState) {
  container.appendChild(createEditorToolbar({
    collapsed: editorState.collapsed,
    onToggleCollapse: () => {
      editorState.collapsed = !editorState.collapsed;
      editorState.rebuild();
    },
    addLabel: 'Add',
    addTitle: 'Add action',
    addAriaLabel: 'Add action',
    onAdd: async () => {
      const type = await pickActionType(editorState.fw);
      if (!type) return;
      const nextIdx = editorState.actions.length;
      editorState.actions.push(createDefaultAction(type));
      editorState.editingIdx = nextIdx;
      editorState.pendingRevealIdx = nextIdx;
      notifyEditorChange(editorState);
      editorState.rebuild();
    },
    collapseTitleCollapsed: 'Expand actions',
    collapseTitleExpanded: 'Collapse actions',
    extraClassName: 'ae-toolbar',
  }));

  if (editorState.actions && editorState.actions.length > 0) {
    container.appendChild(buildEditableList(editorState));
    return;
  }

  const empty = document.createElement('div');
  empty.className = 'ae-empty ae-drop-empty ae-editable-empty';
  empty.textContent = 'No actions yet';
  registerEmptyDropZone(empty, editorState);
  container.appendChild(empty);
}

function buildEditableList(editorState) {
  const container = document.createElement('div');
  container.className = 'ae-list ae-editable-list';

  function renderBlocks() {
    container.innerHTML = '';
    for (let i = 0; i < editorState.actions.length; i++) {
      container.appendChild(buildEditableBlock(editorState.actions[i], i, {
        editorState,
        opts: editorState.opts,
        onClone(idx) {
          editorState.actions.splice(idx + 1, 0, cloneAction(editorState.actions[idx]));
          adjustEditingIdxAfterInsert(editorState, idx + 1);
          notifyEditorChange(editorState);
          renderBlocks();
        },
        onEdit(idx) {
          if (editorState.editingIdx === idx) {
            cleanAction(editorState.actions[idx], detectType(editorState.actions[idx]));
            editorState.editingIdx = null;
          } else {
            if (editorState.editingIdx != null) {
              cleanAction(editorState.actions[editorState.editingIdx], detectType(editorState.actions[editorState.editingIdx]));
            }
            editorState.editingIdx = idx;
          }
          renderBlocks();
        },
        onDelete(idx) {
          editorState.actions.splice(idx, 1);
          adjustEditingIdxAfterRemove(editorState, idx);
          notifyEditorChange(editorState);
          editorState.rebuild();
        },
        onFieldChange() {
          notifyEditorChange(editorState);
        },
      }));
    }
  }

  renderBlocks();
  registerEditableList(container, editorState);
  revealPendingAction(container, editorState);
  return container;
}

function revealPendingAction(container, editorState) {
  if (editorState.pendingRevealIdx == null) return;
  const targetIdx = editorState.pendingRevealIdx;
  editorState.pendingRevealIdx = null;

  requestAnimationFrame(() => {
    const block = container.querySelector(`.ae-block[data-index="${targetIdx}"]`);
    if (!block) return;

    block.scrollIntoView({ block: 'end', behavior: 'smooth' });

    const field = block.querySelector('input:not([type="checkbox"]), textarea, select, input[type="checkbox"]');
    if (!field) return;
    field.focus();
    if (typeof field.select === 'function' && field.tagName !== 'SELECT' && field.type !== 'checkbox') {
      field.select();
    }
  });
}

function buildEditableBlock(action, index, ctx) {
  const type = detectType(action);
  const meta = getActionMeta(type);
  const isEditing = ctx.editorState.editingIdx === index;
  const isCollapsed = ctx.editorState.collapsed && !isEditing;

  const block = document.createElement('div');
  block.className = `ae-block ae-block-${type}${isEditing ? ' ae-editing' : ''}`;
  block.style.setProperty('--ae-accent', meta.color);
  block.dataset.index = index;

  const header = document.createElement('div');
  header.className = 'ae-block-header';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'ae-drag-handle material-symbols-outlined';
  dragHandle.textContent = 'drag_indicator';
  dragHandle.addEventListener('mousedown', (event) => drag.beginActionDrag(event, block, ctx.editorState));

  const idx = document.createElement('span');
  idx.className = 'ae-index';
  idx.textContent = index + 1;

  const icon = document.createElement('span');
  icon.className = 'ae-icon material-symbols-outlined';
  icon.style.color = meta.color;
  icon.textContent = meta.icon;

  const label = document.createElement('span');
  label.className = 'ae-label';
  label.textContent = meta.label;

  header.append(dragHandle, idx, icon, label);

  if (isCollapsed) {
    const summary = renderCollapsedSummary(action, type, shortenText, {
      ...ctx.opts,
      openActionEditor,
    });
    header.appendChild(summary);
  }

  for (const badgeText of getBadges(action, type)) {
    const badge = document.createElement('span');
    badge.className = 'ae-badge';
    badge.textContent = badgeText;
    header.appendChild(badge);
  }

  const cloneBtn = document.createElement('button');
  cloneBtn.className = 'ae-header-btn ae-clone-btn';
  preventMouseFocus(cloneBtn);
  cloneBtn.title = 'Clone';
  cloneBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
  cloneBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    ctx.onClone(index);
  });

  const editBtn = document.createElement('button');
  editBtn.className = 'ae-header-btn ae-edit-btn';
  preventMouseFocus(editBtn);
  editBtn.title = isEditing ? 'Done' : 'Edit';
  editBtn.innerHTML = `<span class="material-symbols-outlined">${isEditing ? 'check' : 'edit'}</span>`;
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    ctx.onEdit(index);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'ae-header-btn ae-delete-btn';
  preventMouseFocus(delBtn);
  delBtn.title = 'Delete';
  delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  delBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    ctx.onDelete(index);
  });

  const actions = document.createElement('div');
  actions.className = 'ae-header-actions';
  if (type === 'choice') {
    const addBtn = document.createElement('button');
    addBtn.className = 'ae-header-btn ae-add-btn';
    preventMouseFocus(addBtn);
    addBtn.title = 'Add choice';
    addBtn.innerHTML = '<span class="material-symbols-outlined">add</span>';
    addBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!action.choice || typeof action.choice !== 'object') action.choice = { prompt: '', options: [] };
      if (!Array.isArray(action.choice.options)) action.choice.options = [];
      action.choice.options.push({ text: '', actions: [] });
      notifyEditorChange(ctx.editorState);
      ctx.editorState.rebuild();
    });
    actions.appendChild(addBtn);
  }

  actions.append(cloneBtn, editBtn, delBtn);

  header.appendChild(actions);
  block.appendChild(header);

  if (isEditing) {
    block.appendChild(forms.buildEditForm(action, type, ctx));
  } else if (!isCollapsed) {
    const body = renderers.renderActionBody(action, type, {
      ...ctx.opts,
      editorState: ctx.editorState,
    });
    if (body) block.appendChild(body);
  }

  return block;
}

function buildReadOnlyList(actions, viewCtx = {}) {
  const container = document.createElement('div');
  container.className = 'ae-list';
  for (let i = 0; i < actions.length; i++) {
    const type = detectType(actions[i]);
    const meta = getActionMeta(type);
    const block = document.createElement('div');
    block.className = `ae-block ae-block-${type}`;
    block.style.setProperty('--ae-accent', meta.color);

    const header = document.createElement('div');
    header.className = 'ae-block-header';
    const idxEl = document.createElement('span');
    idxEl.className = 'ae-index';
    idxEl.textContent = i + 1;
    const iconEl = document.createElement('span');
    iconEl.className = 'ae-icon material-symbols-outlined';
    iconEl.style.color = meta.color;
    iconEl.textContent = meta.icon;
    const labelEl = document.createElement('span');
    labelEl.className = 'ae-label';
    labelEl.textContent = meta.label;
    header.append(idxEl, iconEl, labelEl);

    for (const badgeText of getBadges(actions[i], type)) {
      const badge = document.createElement('span');
      badge.className = 'ae-badge';
      badge.textContent = badgeText;
      header.appendChild(badge);
    }

    block.appendChild(header);
    const body = renderers.renderActionBody(actions[i], type, viewCtx);
    if (body) block.appendChild(body);
    container.appendChild(block);
  }
  return container;
}

function buildNestedList(actions, parentEditorState, viewCtx = {}) {
  const editorState = getInlineEditorState(actions, parentEditorState, viewCtx);
  return buildEditableList(editorState);
}

function getInlineEditorState(actions, parentEditorState, viewCtx = {}) {
  let editorState = inlineEditorStates.get(actions);
  if (!editorState) {
    editorState = {
      key: actions,
      actions,
      opts: {},
      collapsed: false,
      editingIdx: null,
      pendingRevealIdx: null,
      rebuild() {
        editorState.rootEditorState?.rebuild();
      },
    };
    inlineEditorStates.set(actions, editorState);
  }

  const rootEditorState = parentEditorState.rootEditorState || parentEditorState;
  editorState.actions = actions;
  editorState.opts = {
    ...rootEditorState.opts,
    ...viewCtx,
  };
  editorState.collapsed = rootEditorState.collapsed;
  editorState.rootEditorState = rootEditorState;
  return editorState;
}

function pickActionType(parentFw) {
  return new Promise((resolve) => {
    let resolved = false;
    const fw = createFloatingWindow({
      title: 'Actions',
      subtitle: 'Add action...',
      icon: 'add_circle',
      iconClass: 'material-symbols-outlined',
      width: 420,
      height: 480,
      resizable: false,
      modal: true,
      closeOnBackdrop: true,
      parent: parentFw,
    });

    const list = document.createElement('div');
    list.className = 'ae-type-list';

    for (const [type, meta] of Object.entries(ACTION_TYPES)) {
      const row = document.createElement('button');
      row.className = 'ae-type-row';
      row.style.setProperty('--ae-accent', meta.color);

      const icon = document.createElement('span');
      icon.className = 'ae-type-row-icon material-symbols-outlined';
      icon.style.color = meta.color;
      icon.textContent = meta.icon;

      const label = document.createElement('span');
      label.className = 'ae-type-row-label';
      label.textContent = meta.label;

      const quip = document.createElement('span');
      quip.className = 'ae-type-row-quip';
      quip.textContent = meta.quip;

      row.append(icon, label, quip);
      row.addEventListener('click', () => {
        if (resolved) return;
        resolved = true;
        fw.destroy();
        resolve(type);
      });
      list.appendChild(row);
    }

    fw.body.style.padding = '12px';
    fw.body.appendChild(list);
    fw.onClose(() => {
      if (resolved) return;
      resolved = true;
      resolve(null);
    });
    fw.open();
  });
}
