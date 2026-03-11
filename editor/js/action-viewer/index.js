import { createFloatingWindow } from '../floating-window.js';
import { ACTION_TYPES, detectType, createDefaultAction, getActionMeta } from '../../../js/action-schema.js';
import {
  getOpenViewer,
  setOpenViewer,
  deleteOpenViewer,
  registerEditableList,
  registerEmptyDropZone,
} from './state.js';
import {
  shortenText,
  cloneAction,
  notifyViewerChange,
  cleanAction,
  adjustEditingIdxAfterInsert,
  adjustEditingIdxAfterRemove,
} from './utils.js';
import { createActionRenderers, getBadges, summarizeAction } from './renderers.js';
import { createFormBuilders } from './forms.js';
import { createDragController } from './drag.js';

const renderers = createActionRenderers(openActionViewer, buildReadOnlyList);
const forms = createFormBuilders(openActionViewer);
const drag = createDragController({ moveActionBetweenViewers });

export function openActionViewer(title, actions, opts = {}) {
  const key = title || 'Actions';
  const existing = getOpenViewer(key);
  if (existing && !existing.fw.el.classList.contains('hidden')) {
    existing.fw.open();
    return;
  }

  const fw = createFloatingWindow({
    title: key,
    icon: 'list_alt',
    iconClass: 'material-symbols-outlined',
    width: 480,
    height: 540,
    resizable: true,
  });

  const viewerState = {
    key,
    fw,
    actions,
    opts,
    collapsed: false,
    editingIdx: null,
    rebuild() {
      fw.body.innerHTML = '';
      buildEditorContent(fw.body, viewerState);
    },
  };

  setOpenViewer(key, viewerState);
  fw.onClose(() => deleteOpenViewer(key));
  viewerState.rebuild();
  fw.open();
}

function moveActionBetweenViewers(sourceViewer, sourceIdx, targetViewer, targetIdx) {
  if (!sourceViewer || !targetViewer) return;
  if (sourceIdx == null || sourceIdx < 0 || sourceIdx >= sourceViewer.actions.length) return;

  if (sourceViewer === targetViewer) {
    const [item] = sourceViewer.actions.splice(sourceIdx, 1);
    let insertIdx = targetIdx;
    if (sourceIdx < insertIdx) insertIdx--;
    sourceViewer.actions.splice(insertIdx, 0, item);
    if (sourceViewer.editingIdx === sourceIdx) {
      sourceViewer.editingIdx = insertIdx;
    } else if (sourceViewer.editingIdx != null) {
      if (sourceIdx < sourceViewer.editingIdx && insertIdx >= sourceViewer.editingIdx) sourceViewer.editingIdx--;
      else if (sourceIdx > sourceViewer.editingIdx && insertIdx <= sourceViewer.editingIdx) sourceViewer.editingIdx++;
    }
    notifyViewerChange(sourceViewer);
    sourceViewer.rebuild();
    return;
  }

  const [item] = sourceViewer.actions.splice(sourceIdx, 1);
  adjustEditingIdxAfterRemove(sourceViewer, sourceIdx);
  targetViewer.actions.splice(targetIdx, 0, item);
  adjustEditingIdxAfterInsert(targetViewer, targetIdx);
  notifyViewerChange(sourceViewer);
  notifyViewerChange(targetViewer);
  sourceViewer.rebuild();
  targetViewer.rebuild();
}

function buildEditorContent(container, viewerState) {
  const toolbar = document.createElement('div');
  toolbar.className = 'av-toolbar';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'av-toolbar-btn av-toolbar-btn-collapse';
  collapseBtn.type = 'button';
  collapseBtn.title = viewerState.collapsed ? 'Expand actions' : 'Collapse actions';
  collapseBtn.setAttribute('aria-label', viewerState.collapsed ? 'Expand actions' : 'Collapse actions');
  collapseBtn.innerHTML = `<span class="material-symbols-outlined">${viewerState.collapsed ? 'unfold_more' : 'unfold_less'}</span>`;
  collapseBtn.addEventListener('click', () => {
    viewerState.collapsed = !viewerState.collapsed;
    viewerState.rebuild();
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'av-toolbar-btn av-toolbar-btn-add';
  addBtn.type = 'button';
  addBtn.title = 'Add action';
  addBtn.setAttribute('aria-label', 'Add action');
  addBtn.innerHTML = '<span class="material-symbols-outlined">add_circle</span>';
  addBtn.addEventListener('click', async () => {
    const type = await pickActionType(viewerState.fw);
    if (!type) return;
    viewerState.actions.push(createDefaultAction(type));
    notifyViewerChange(viewerState);
    viewerState.rebuild();
  });

  const left = document.createElement('div');
  left.className = 'av-toolbar-group av-toolbar-group-left';
  left.appendChild(collapseBtn);

  const right = document.createElement('div');
  right.className = 'av-toolbar-group av-toolbar-group-right';
  right.appendChild(addBtn);

  toolbar.append(left, right);
  container.appendChild(toolbar);

  if (viewerState.actions && viewerState.actions.length > 0) {
    container.appendChild(buildEditableList(viewerState));
    return;
  }

  const empty = document.createElement('div');
  empty.className = 'av-empty av-drop-empty av-editable-empty';
  empty.textContent = 'No actions yet';
  registerEmptyDropZone(empty, viewerState);
  container.appendChild(empty);
}

function buildEditableList(viewerState) {
  const container = document.createElement('div');
  container.className = 'av-list av-editable-list';

  function renderBlocks() {
    container.innerHTML = '';
    for (let i = 0; i < viewerState.actions.length; i++) {
      container.appendChild(buildEditableBlock(viewerState.actions[i], i, {
        viewerState,
        opts: viewerState.opts,
        onClone(idx) {
          viewerState.actions.splice(idx + 1, 0, cloneAction(viewerState.actions[idx]));
          adjustEditingIdxAfterInsert(viewerState, idx + 1);
          notifyViewerChange(viewerState);
          renderBlocks();
        },
        onEdit(idx) {
          if (viewerState.editingIdx === idx) {
            cleanAction(viewerState.actions[idx], detectType(viewerState.actions[idx]));
            viewerState.editingIdx = null;
          } else {
            if (viewerState.editingIdx != null) {
              cleanAction(viewerState.actions[viewerState.editingIdx], detectType(viewerState.actions[viewerState.editingIdx]));
            }
            viewerState.editingIdx = idx;
          }
          renderBlocks();
        },
        onDelete(idx) {
          viewerState.actions.splice(idx, 1);
          adjustEditingIdxAfterRemove(viewerState, idx);
          notifyViewerChange(viewerState);
          viewerState.rebuild();
        },
        onFieldChange() {
          notifyViewerChange(viewerState);
        },
      }));
    }
  }

  renderBlocks();
  registerEditableList(container, viewerState);
  return container;
}

function buildEditableBlock(action, index, ctx) {
  const type = detectType(action);
  const meta = getActionMeta(type);
  const isEditing = ctx.viewerState.editingIdx === index;
  const isCollapsed = ctx.viewerState.collapsed && !isEditing;

  const block = document.createElement('div');
  block.className = `av-block av-block-${type}${isEditing ? ' av-editing' : ''}`;
  block.style.setProperty('--av-accent', meta.color);
  block.dataset.index = index;

  const header = document.createElement('div');
  header.className = 'av-block-header';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'av-drag-handle material-symbols-outlined';
  dragHandle.textContent = 'drag_indicator';
  dragHandle.addEventListener('mousedown', (event) => drag.beginActionDrag(event, block, ctx.viewerState));

  const idx = document.createElement('span');
  idx.className = 'av-index';
  idx.textContent = index + 1;

  const icon = document.createElement('span');
  icon.className = 'av-icon material-symbols-outlined';
  icon.style.color = meta.color;
  icon.textContent = meta.icon;

  const label = document.createElement('span');
  label.className = 'av-label';
  label.textContent = meta.label;

  header.append(dragHandle, idx, icon, label);

  if (isCollapsed) {
    const summary = document.createElement('span');
    summary.className = 'av-summary';
    summary.textContent = summarizeAction(action, type, shortenText);
    header.appendChild(summary);
  }

  for (const badgeText of getBadges(action, type)) {
    const badge = document.createElement('span');
    badge.className = 'av-badge';
    badge.textContent = badgeText;
    header.appendChild(badge);
  }

  const cloneBtn = document.createElement('button');
  cloneBtn.className = 'av-header-btn av-clone-btn';
  cloneBtn.title = 'Clone';
  cloneBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
  cloneBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    ctx.onClone(index);
  });

  const editBtn = document.createElement('button');
  editBtn.className = 'av-header-btn av-edit-btn';
  editBtn.title = isEditing ? 'Done' : 'Edit';
  editBtn.innerHTML = `<span class="material-symbols-outlined">${isEditing ? 'check' : 'edit'}</span>`;
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    ctx.onEdit(index);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'av-header-btn av-delete-btn';
  delBtn.title = 'Delete';
  delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  delBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    ctx.onDelete(index);
  });

  const actions = document.createElement('div');
  actions.className = 'av-header-actions';
  actions.append(cloneBtn, editBtn, delBtn);

  header.appendChild(actions);
  block.appendChild(header);

  if (isEditing) {
    block.appendChild(forms.buildEditForm(action, type, ctx));
  } else if (!isCollapsed) {
    const body = renderers.renderActionBody(action, type, ctx.opts);
    if (body) block.appendChild(body);
  }

  return block;
}

function buildReadOnlyList(actions, viewCtx = {}) {
  const container = document.createElement('div');
  container.className = 'av-list';
  for (let i = 0; i < actions.length; i++) {
    const type = detectType(actions[i]);
    const meta = getActionMeta(type);
    const block = document.createElement('div');
    block.className = `av-block av-block-${type}`;
    block.style.setProperty('--av-accent', meta.color);

    const header = document.createElement('div');
    header.className = 'av-block-header';
    const idxEl = document.createElement('span');
    idxEl.className = 'av-index';
    idxEl.textContent = i + 1;
    const iconEl = document.createElement('span');
    iconEl.className = 'av-icon material-symbols-outlined';
    iconEl.style.color = meta.color;
    iconEl.textContent = meta.icon;
    const labelEl = document.createElement('span');
    labelEl.className = 'av-label';
    labelEl.textContent = meta.label;
    header.append(idxEl, iconEl, labelEl);

    for (const badgeText of getBadges(actions[i], type)) {
      const badge = document.createElement('span');
      badge.className = 'av-badge';
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

function pickActionType(parentFw) {
  return new Promise((resolve) => {
    let resolved = false;
    const fw = createFloatingWindow({
      title: 'Add Action',
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
    list.className = 'av-type-list';

    for (const [type, meta] of Object.entries(ACTION_TYPES)) {
      const row = document.createElement('button');
      row.className = 'av-type-row';
      row.style.setProperty('--av-accent', meta.color);

      const icon = document.createElement('span');
      icon.className = 'av-type-row-icon material-symbols-outlined';
      icon.style.color = meta.color;
      icon.textContent = meta.icon;

      const label = document.createElement('span');
      label.className = 'av-type-row-label';
      label.textContent = meta.label;

      const quip = document.createElement('span');
      quip.className = 'av-type-row-quip';
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
