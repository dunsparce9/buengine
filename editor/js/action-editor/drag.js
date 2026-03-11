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
