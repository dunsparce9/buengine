import {
  getDragState,
  setDragState,
  clearDragState,
  getDragAutoScrollRaf,
  setDragAutoScrollRaf,
  getEditableListEditor,
  getEmptyDropZoneEditor,
  hasEditableList,
  hasEmptyDropZone,
} from './state.js';

export function createDragController({ moveActionBetweenEditors }) {
  function beginActionDrag(event, block, editorState) {
    if (event.button !== 0) return;
    const dragIdx = parseInt(block.dataset.index, 10);
    if (!Number.isInteger(dragIdx)) return;
    const header = block.querySelector('.ae-block-header');
    if (!header) return;

    event.preventDefault();
    event.stopPropagation();
    cancelActionDrag();

    const headerRect = header.getBoundingClientRect();
    setDragState({
      sourceEditor: editorState,
      sourceIdx: dragIdx,
      sourceEl: block,
      previewEl: createActionDragPreview(header, headerRect),
      currentEditor: editorState,
      dropIdx: dragIdx,
      indicator: null,
      emptyEl: null,
      clientX: event.clientX,
      clientY: event.clientY,
      previewOffsetX: event.clientX - headerRect.left,
      previewOffsetY: event.clientY - headerRect.top,
      scrollHost: block.closest('.fw-body'),
    });

    block.classList.add('ae-dragging', 'ae-drag-source-hidden');
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onActionDragMove);
    document.addEventListener('mouseup', onActionDragEnd);
    updateActionDragPreviewPosition(event.clientX, event.clientY);
    updateActionDragTarget(event.clientX, event.clientY);
    scheduleActionDragAutoScroll();
  }

  function onActionDragMove(event) {
    const dragState = getDragState();
    if (!dragState) return;
    dragState.clientX = event.clientX;
    dragState.clientY = event.clientY;
    updateActionDragTarget(event.clientX, event.clientY);
  }

  function onActionDragEnd() {
    const dragState = getDragState();
    if (!dragState) return;
    const { sourceEditor, sourceIdx, currentEditor, dropIdx } = dragState;
    cancelActionDrag();
    if (currentEditor && Number.isInteger(dropIdx)) {
      moveActionBetweenEditors(sourceEditor, sourceIdx, currentEditor, dropIdx);
    }
  }

  function cancelActionDrag() {
    const dragState = getDragState();
    if (!dragState) return;
    if (dragState.sourceEl) dragState.sourceEl.classList.remove('ae-dragging', 'ae-drag-source-hidden');
    if (dragState.previewEl?.parentNode) dragState.previewEl.remove();
    if (dragState.indicator?.parentNode) dragState.indicator.remove();
    if (dragState.emptyEl) dragState.emptyEl.classList.remove('ae-drop-ready');
    dragState.emptyEl = null;

    document.removeEventListener('mousemove', onActionDragMove);
    document.removeEventListener('mouseup', onActionDragEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (getDragAutoScrollRaf()) {
      cancelAnimationFrame(getDragAutoScrollRaf());
      setDragAutoScrollRaf(0);
    }

    clearDragState();
  }

  function updateActionDragTarget(clientX, clientY) {
    const dragState = getDragState();
    if (!dragState) return;
    updateActionDragPreviewPosition(clientX, clientY);
    const pointEl = document.elementFromPoint(clientX, clientY);
    const emptyEl = pointEl?.closest('.ae-drop-empty.ae-editable-empty');
    if (emptyEl && hasEmptyDropZone(emptyEl)) {
      const editorState = getEmptyDropZoneEditor(emptyEl);
      dragState.currentEditor = editorState;
      dragState.dropIdx = 0;
      dragState.scrollHost = emptyEl.closest('.fw-body');
      showActionDragEmptyState(emptyEl);
      return;
    }

    const container = pointEl?.closest('.ae-editable-list');
    if (container && hasEditableList(container)) {
      const editorState = getEditableListEditor(container);
      const dropIdx = getActionDragDropIndex(container, clientY, editorState);
      dragState.currentEditor = editorState;
      dragState.dropIdx = dropIdx;
      dragState.scrollHost = container.closest('.fw-body');
      showActionDragIndicator(container, dropIdx);
    }
  }

  function getActionDragDropIndex(container, clientY, editorState) {
    const blocks = Array.from(container.children).filter((child) =>
      child.classList?.contains('ae-block') && child !== getDragState()?.sourceEl
    );

    let targetIdx = editorState.actions.length;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      const blockIdx = parseInt(block.dataset.index, 10);
      if (!Number.isInteger(blockIdx)) continue;
      if (clientY < rect.top + rect.height / 2) return blockIdx;
      targetIdx = blockIdx + 1;
    }
    return targetIdx;
  }

  function showActionDragIndicator(container, dropIdx) {
    const dragState = getDragState();
    if (!dragState) return;
    if (dragState.emptyEl) {
      dragState.emptyEl.classList.remove('ae-drop-ready');
      dragState.emptyEl = null;
    }
    if (!dragState.indicator) {
      dragState.indicator = document.createElement('div');
      dragState.indicator.className = 'ae-drop-indicator';
    }
    const blocks = Array.from(container.children).filter((child) =>
      child.classList?.contains('ae-block') && child !== dragState.sourceEl
    );
    const beforeNode = blocks.find((block) => parseInt(block.dataset.index, 10) >= dropIdx) || null;
    container.insertBefore(dragState.indicator, beforeNode);
  }

  function createActionDragPreview(header, rect) {
    const preview = header.cloneNode(true);
    preview.classList.add('ae-drag-preview');
    preview.style.width = `${Math.ceil(rect.width)}px`;
    document.body.appendChild(preview);
    return preview;
  }

  function updateActionDragPreviewPosition(clientX, clientY) {
    const dragState = getDragState();
    if (!dragState?.previewEl) return;
    dragState.previewEl.style.left = `${Math.round(clientX - dragState.previewOffsetX)}px`;
    dragState.previewEl.style.top = `${Math.round(clientY - dragState.previewOffsetY)}px`;
  }

  function showActionDragEmptyState(emptyEl) {
    const dragState = getDragState();
    if (!dragState) return;
    if (dragState.indicator?.parentNode) dragState.indicator.remove();
    if (dragState.emptyEl && dragState.emptyEl !== emptyEl) dragState.emptyEl.classList.remove('ae-drop-ready');
    dragState.emptyEl = emptyEl;
    emptyEl.classList.add('ae-drop-ready');
  }

  function scheduleActionDragAutoScroll() {
    if (getDragAutoScrollRaf()) return;

    const step = () => {
      setDragAutoScrollRaf(0);
      const dragState = getDragState();
      if (!dragState) return;

      const host = dragState.scrollHost;
      if (host) {
        const rect = host.getBoundingClientRect();
        const zone = Math.max(36, Math.min(72, rect.height * 0.18));
        let delta = 0;
        if (dragState.clientY < rect.top + zone) {
          delta = -Math.ceil((rect.top + zone - dragState.clientY) / 8);
        } else if (dragState.clientY > rect.bottom - zone) {
          delta = Math.ceil((dragState.clientY - (rect.bottom - zone)) / 8);
        }
        if (delta !== 0) {
          host.scrollTop += delta;
          updateActionDragTarget(dragState.clientX, dragState.clientY);
        }
      }

      if (getDragState()) scheduleActionDragAutoScroll();
    };

    setDragAutoScrollRaf(requestAnimationFrame(step));
  }

  return { beginActionDrag };
}

/* ── Generic single-list reorder drag (review phase 5, item 20) ──────────
 *
 * The choice-option drag in renderers.js duplicated the action-drag engine
 * (~130 lines: clone preview, drop indicator, elementFromPoint targeting,
 * auto-scroll). This standalone helper parameterizes the row/container
 * selectors so both call sites share one implementation. The cross-editor
 * action drag above keeps its own empty-drop-zone logic; this covers the
 * simpler same-container reorder case.
 */

let _simpleDragState = null;
let _simpleDragRaf = 0;

/**
 * Begin a same-container reorder drag.
 *
 * @param {MouseEvent} event mousedown event on the drag handle
 * @param {object} opts
 * @param {HTMLElement} opts.sourceEl row element being dragged
 * @param {HTMLElement} opts.headerEl header to clone as the drag preview
 * @param {HTMLElement} opts.container row container
 * @param {number} opts.sourceIdx dragged row index
 * @param {() => number} opts.getCount total row count (for end-of-list drops)
 * @param {string} [opts.rowSelector] row CSS class for hit-testing
 * @param {string} [opts.indexAttr] dataset key holding the row index
 * @param {(from: number, to: number) => void} opts.onDrop called on mouseup
 */
export function beginSimpleReorderDrag(event, {
  sourceEl,
  headerEl,
  container,
  sourceIdx,
  getCount,
  rowSelector = '.ae-choice-option',
  indexAttr = 'choiceIndex',
  onDrop,
}) {
  if (event.button !== 0) return;
  if (!sourceEl || !container) return;

  event.preventDefault();
  event.stopPropagation();
  cancelSimpleReorderDrag();

  const headerRect = headerEl.getBoundingClientRect();
  const previewEl = headerEl.cloneNode(true);
  previewEl.classList.add('ae-drag-preview');
  previewEl.style.width = `${Math.ceil(headerRect.width)}px`;
  document.body.appendChild(previewEl);

  _simpleDragState = {
    sourceEl,
    container,
    sourceIdx,
    dropIdx: sourceIdx,
    getCount,
    rowSelector,
    indexAttr,
    onDrop,
    previewEl,
    indicator: null,
    clientX: event.clientX,
    clientY: event.clientY,
    previewOffsetX: event.clientX - headerRect.left,
    previewOffsetY: event.clientY - headerRect.top,
    scrollHost: sourceEl.closest('.fw-body'),
  };

  sourceEl.classList.add('ae-dragging', 'ae-drag-source-hidden');
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onSimpleReorderMove);
  document.addEventListener('mouseup', onSimpleReorderEnd);
  updateSimpleReorderTarget(event.clientX, event.clientY);
  scheduleSimpleReorderAutoScroll();
}

function onSimpleReorderMove(event) {
  if (!_simpleDragState) return;
  _simpleDragState.clientX = event.clientX;
  _simpleDragState.clientY = event.clientY;
  updateSimpleReorderTarget(event.clientX, event.clientY);
}

function onSimpleReorderEnd() {
  if (!_simpleDragState) return;
  const { sourceIdx, dropIdx, onDrop } = _simpleDragState;
  cancelSimpleReorderDrag();
  if (!Number.isInteger(dropIdx)) return;
  if (dropIdx === sourceIdx || dropIdx === sourceIdx + 1) return;
  onDrop?.(sourceIdx, dropIdx);
}

export function cancelSimpleReorderDrag() {
  if (!_simpleDragState) return;
  if (_simpleDragState.sourceEl) {
    _simpleDragState.sourceEl.classList.remove('ae-dragging', 'ae-drag-source-hidden');
  }
  if (_simpleDragState.previewEl?.parentNode) _simpleDragState.previewEl.remove();
  if (_simpleDragState.indicator?.parentNode) _simpleDragState.indicator.remove();

  document.removeEventListener('mousemove', onSimpleReorderMove);
  document.removeEventListener('mouseup', onSimpleReorderEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  if (_simpleDragRaf) {
    cancelAnimationFrame(_simpleDragRaf);
    _simpleDragRaf = 0;
  }

  _simpleDragState = null;
}

function updateSimpleReorderTarget(clientX, clientY) {
  if (!_simpleDragState) return;
  const st = _simpleDragState;
  if (st.previewEl) {
    st.previewEl.style.left = `${Math.round(clientX - st.previewOffsetX)}px`;
    st.previewEl.style.top = `${Math.round(clientY - st.previewOffsetY)}px`;
  }

  const pointEl = document.elementFromPoint(clientX, clientY);
  if (!pointEl || !st.container.contains(pointEl)) return;
  const container = st.container;

  const blocks = Array.from(container.children).filter((child) =>
    child.classList?.contains(st.rowSelector.replace(/^\./, '')) && child !== st.sourceEl
  );

  let dropIdx = st.getCount();
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    const blockIdx = parseInt(block.dataset[st.indexAttr], 10);
    if (!Number.isInteger(blockIdx)) continue;
    if (clientY < rect.top + rect.height / 2) {
      dropIdx = blockIdx;
      break;
    }
    dropIdx = blockIdx + 1;
  }

  st.dropIdx = dropIdx;
  showSimpleReorderIndicator(container, dropIdx);
}

function showSimpleReorderIndicator(container, dropIdx) {
  const st = _simpleDragState;
  if (!st) return;
  if (!st.indicator) {
    st.indicator = document.createElement('div');
    st.indicator.className = 'ae-drop-indicator';
  }

  const rowClass = st.rowSelector.replace(/^\./, '');
  const blocks = Array.from(container.children).filter((child) =>
    child.classList?.contains(rowClass) && child !== st.sourceEl
  );
  const beforeNode = blocks.find((block) => parseInt(block.dataset[st.indexAttr], 10) >= dropIdx) || null;
  container.insertBefore(st.indicator, beforeNode);
}

function scheduleSimpleReorderAutoScroll() {
  if (_simpleDragRaf) return;

  const step = () => {
    _simpleDragRaf = 0;
    if (!_simpleDragState) return;

    const host = _simpleDragState.scrollHost;
    if (host) {
      const rect = host.getBoundingClientRect();
      const zone = Math.max(36, Math.min(72, rect.height * 0.18));
      let delta = 0;
      if (_simpleDragState.clientY < rect.top + zone) {
        delta = -Math.ceil((rect.top + zone - _simpleDragState.clientY) / 8);
      } else if (_simpleDragState.clientY > rect.bottom - zone) {
        delta = Math.ceil((_simpleDragState.clientY - (rect.bottom - zone)) / 8);
      }
      if (delta !== 0) {
        host.scrollTop += delta;
        updateSimpleReorderTarget(_simpleDragState.clientX, _simpleDragState.clientY);
      }
    }

    if (_simpleDragState) _simpleDragRaf = requestAnimationFrame(step);
  };

  _simpleDragRaf = requestAnimationFrame(step);
}
