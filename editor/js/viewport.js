/**
 * Centre viewport — scene preview with object overlays.
 * Supports: selection, pan/zoom, drag-to-move, drag-to-resize, drag-to-create, context menu.
 */

import { state, dom, hooks, markDirty, addObject, deleteObject, uniqueObjectId } from './state.js';
import { showContextMenu } from './context-menu.js';
import { resolveAssetURL, resolveAssetURLSync } from './fs-provider.js';
import { getFileKind, isPreviewableMedia } from './file-types.js';
import { renderItemsViewport } from './items-viewer.js';
import { openOptionsModal, createDefaultObjectOption } from './options-editor.js';

/* ── Drag state (module-scoped, survives re-renders) ── */
let _selectionBox = null; // { x, y, w, h } in grid units (for drag-to-create)
let _viewportSceneKey = null;
let _viewportCamera = createDefaultViewportCamera();

const PAN_DRAG_THRESHOLD = 4;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_SENSITIVITY = 0.0015;

function createDefaultViewportCamera() {
  return { zoom: 1, panX: 0, panY: 0 };
}

/* ── Helpers ───────────────────────────────────── */

function getSceneGrid() {
  const data = state.scripts[state.selectedId];
  return {
    cols: data?.grid?.cols ?? 16,
    rows: data?.grid?.rows ?? 9,
  };
}

function pxToGrid(clientX, clientY) {
  const rect = dom.viewport.getBoundingClientRect();
  const { cols, rows } = getSceneGrid();
  const gx = ((clientX - rect.left) / rect.width) * cols;
  const gy = ((clientY - rect.top) / rect.height) * rows;
  return { gx, gy };
}

function snapToGrid(v) {
  return Math.round(v);
}

function clampGrid(v, max) {
  return Math.max(0, Math.min(v, max));
}

function clampZoom(zoom) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

function getViewportSceneKey() {
  if (state.selectedPath && !state.selectedId) return `asset:${state.selectedPath}`;
  if (!state.selectedId) return 'empty';
  return `script:${state.selectedId}`;
}

function syncViewportSceneKey() {
  const nextKey = getViewportSceneKey();
  if (_viewportSceneKey === nextKey) return;
  _viewportSceneKey = nextKey;
  _viewportCamera = createDefaultViewportCamera();
  clearSelectionBox();
}

function isActiveSceneData(data = state.scripts[state.selectedId]) {
  return Boolean(state.selectedId && state.selectedId !== '_game' && data && !Array.isArray(data));
}

function setViewportPanning(active) {
  dom.viewportWrap.classList.toggle('viewport-is-panning', active);
}

function applyViewportCamera() {
  const { viewport, viewportWrap } = dom;
  if (!isActiveSceneData()) {
    viewport.style.transform = '';
    viewport.style.transformOrigin = '';
    viewportWrap.classList.remove('viewport-pan-enabled', 'viewport-is-panning');
    return;
  }

  viewport.style.transformOrigin = 'center center';
  viewport.style.transform = `translate(${_viewportCamera.panX}px, ${_viewportCamera.panY}px) scale(${_viewportCamera.zoom})`;
  viewportWrap.classList.add('viewport-pan-enabled');
}

function zoomViewportAt(clientX, clientY, nextZoom) {
  if (!isActiveSceneData()) return;
  const wrapperRect = dom.viewportWrap.getBoundingClientRect();
  const sceneRect = dom.viewport.getBoundingClientRect();
  const prevZoom = _viewportCamera.zoom;
  const clampedZoom = clampZoom(nextZoom);
  if (clampedZoom === prevZoom) return;

  const wrapperCenterX = wrapperRect.left + (wrapperRect.width / 2);
  const wrapperCenterY = wrapperRect.top + (wrapperRect.height / 2);
  const sceneCenterX = sceneRect.left + (sceneRect.width / 2);
  const sceneCenterY = sceneRect.top + (sceneRect.height / 2);

  const localX = (clientX - sceneCenterX) / prevZoom;
  const localY = (clientY - sceneCenterY) / prevZoom;

  const newCenterX = clientX - (localX * clampedZoom);
  const newCenterY = clientY - (localY * clampedZoom);

  _viewportCamera.zoom = clampedZoom;
  _viewportCamera.panX = newCenterX - wrapperCenterX;
  _viewportCamera.panY = newCenterY - wrapperCenterY;
  applyViewportCamera();
}

function showCreateObjectMenu(clientX, clientY, selection) {
  showContextMenu(clientX, clientY, [
    {
      icon: 'add_box',
      label: 'Create object',
      onClick: () => {
        const id = uniqueObjectId('object');
        addObject({ id, x: selection.x, y: selection.y, w: selection.w, h: selection.h, options: [createDefaultObjectOption()] });
      },
    },
  ]);
}

function openObjectOptionsManager(obj) {
  const sceneId = state.selectedId;
  if (!sceneId) return;
  const sceneData = state.scripts[sceneId];
  if (!sceneData || Array.isArray(sceneData)) return;
  openOptionsModal({
    target: obj,
    scriptId: sceneId,
    title: `${obj.id} — Options`,
    subtitle: obj.label || obj.id,
    modalKey: `${sceneId}:${obj.id}:options`,
    ownerLabel: obj.label || obj.id,
    actionViewerContext: {
      sceneId,
      sceneData,
      markDirty,
    },
    createDefaultOption: createDefaultObjectOption,
  });
}

/* ── Main render ───────────────────────────────── */

export function renderViewport() {
  const { viewport, viewportWrap } = dom;
  syncViewportSceneKey();

  // Clear previous object elements (keep selection box if present)
  viewport.querySelectorAll('.editor-media-preview, .editor-media-empty, .items-viewer').forEach(el => el.remove());
  viewport.querySelectorAll('.editor-object, .editor-resize-handle').forEach(el => el.remove());
  viewport.style.backgroundImage = '';
  viewport.style.backgroundColor = '#181825';
  viewport.style.width  = '';
  viewport.style.height = '';
  viewport.style.transform = '';
  viewport.style.transformOrigin = '';
  viewport.classList.remove('viewport-items-mode');
  viewportWrap.classList.remove('viewport-items-mode');
  viewportWrap.classList.remove('viewport-pan-enabled', 'viewport-is-panning');

  if (state.selectedPath && !state.selectedId) {
    viewport.classList.remove('hidden');
    renderMediaViewport(state.selectedPath);
    return;
  }

  if (!state.selectedId || !state.scripts[state.selectedId]) {
    viewport.classList.add('hidden');
    return;
  }
  viewport.classList.remove('hidden');
  const data = state.scripts[state.selectedId];

  if (state.selectedId === '_game') {
    viewport.classList.add('hidden');
    return;
  }

  // Items table (items/items.json is an array, not a scene)
  if (Array.isArray(data)) {
    viewportWrap.classList.add('viewport-items-mode');
    viewport.classList.add('viewport-items-mode');
    viewport.style.width = '100%';
    viewport.style.height = '100%';
    viewport.style.backgroundColor = '#1d2021';
    renderItemsViewport(data, viewport);
    return;
  }

  // Fit scene aspect ratio
  const cols = data.grid?.cols ?? 16;
  const rows = data.grid?.rows ?? 9;
  const sceneRatio = cols / rows;
  const pad = 24;
  const availW = viewportWrap.clientWidth  - pad * 2;
  const availH = viewportWrap.clientHeight - pad * 2;
  const containerRatio = availW / availH;

  let w, h;
  if (sceneRatio > containerRatio) {
    w = availW;
    h = availW / sceneRatio;
  } else {
    h = availH;
    w = availH * sceneRatio;
  }
  viewport.style.width  = `${Math.round(w)}px`;
  viewport.style.height = `${Math.round(h)}px`;

  // Background
  if (data.background) {
    const bgUrl = resolveAssetURLSync(data.background);
    if (bgUrl) viewport.style.backgroundImage = `url('${bgUrl}')`;
  } else {
    viewport.style.backgroundColor = data.backgroundColor || '#111';
  }

  // Objects
  const objects = data.objects;
  if (Array.isArray(objects)) {
    for (const obj of objects) {
      const div = document.createElement('div');
      div.className = 'editor-object';
      const selected = obj.id === state.selectedObjectId;
      if (selected) div.classList.add('selected');
      if (obj.highlight === false) div.classList.add('editor-object-highlight-disabled');

      div.style.left   = `${(obj.x / cols) * 100}%`;
      div.style.top    = `${(obj.y / rows) * 100}%`;
      div.style.width  = `${(obj.w / cols) * 100}%`;
      div.style.height = `${(obj.h / rows) * 100}%`;

      if (obj.texture) {
        div.classList.add('editor-object-textured');
        const texUrl = resolveAssetURLSync(obj.texture);
        if (texUrl) div.style.backgroundImage = `url('${texUrl}')`;
      }

      const label = document.createElement('span');
      label.className = 'editor-object-label';
      label.textContent = obj.id || obj.label || '';
      div.appendChild(label);

      // Click to select
      div.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (state.selectedObjectId !== obj.id) {
          startPanOrClickGesture(e, () => {
            clearSelectionBox();
            state.selectedObjectId = obj.id;
            renderViewport();
            hooks.renderProperties();
          });
          return;
        }
        clearSelectionBox();
        startMove(e, obj);
      });

      // Right-click on object
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.selectedObjectId = obj.id;
        clearSelectionBox();
        renderViewport();
        hooks.renderProperties();
        showContextMenu(e.clientX, e.clientY, [
          { icon: 'tune', label: 'Manage options', onClick: () => openObjectOptionsManager(obj) },
          { separator: true },
          { icon: 'delete', label: 'Delete object', danger: true, onClick: () => deleteObject(obj.id) },
        ]);
      });

      viewport.appendChild(div);

      // Add resize handles for selected object
      if (selected) {
        addResizeHandles(div, obj);
      }
    }
  }

  // Render selection box (drag-to-create preview)
  renderSelectionBoxEl();
  applyViewportCamera();
}

function renderMediaViewport(path) {
  const kind = getFileKind(path);
  if (!isPreviewableMedia(path)) {
    renderUnsupportedMedia(path);
    return;
  }

  const { viewport, viewportWrap } = dom;
  viewport.style.width = `${Math.max(320, viewportWrap.clientWidth - 48)}px`;
  viewport.style.height = `${Math.max(220, viewportWrap.clientHeight - 48)}px`;
  viewport.style.backgroundColor = '#11111b';

  const wrap = document.createElement('div');
  wrap.className = 'editor-media-preview';

  const url = resolveAssetURLSync(path);
  if (url) {
    wrap.appendChild(createMediaEl(kind, path, url));
    viewport.appendChild(wrap);
    return;
  }

  const loading = document.createElement('div');
  loading.className = 'editor-media-empty';
  loading.textContent = 'Loading preview...';
  wrap.appendChild(loading);
  viewport.appendChild(wrap);

  resolveAssetURL(path).then((resolved) => {
    if (!resolved) return;
    if (state.selectedPath !== path || state.selectedId) return;
    hooks.renderViewport();
  }).catch(() => {
    if (state.selectedPath !== path || state.selectedId) return;
    loading.textContent = 'Preview unavailable';
  });
}

function createMediaEl(kind, path, url) {
  if (kind === 'image') {
    const img = document.createElement('img');
    img.className = 'editor-media-preview-el editor-media-image';
    img.src = url;
    img.alt = path.split('/').pop() || 'image preview';
    img.draggable = false;
    return img;
  }

  if (kind === 'audio') {
    const audio = document.createElement('audio');
    audio.className = 'editor-media-preview-el editor-media-audio';
    audio.src = url;
    audio.controls = true;
    audio.preload = 'metadata';
    return audio;
  }

  const video = document.createElement('video');
  video.className = 'editor-media-preview-el editor-media-video';
  video.src = url;
  video.controls = true;
  video.preload = 'metadata';
  return video;
}

function renderUnsupportedMedia(path) {
  const { viewport, viewportWrap } = dom;
  viewport.style.width = `${Math.max(320, viewportWrap.clientWidth - 48)}px`;
  viewport.style.height = `${Math.max(220, viewportWrap.clientHeight - 48)}px`;
  viewport.style.backgroundColor = '#11111b';

  const empty = document.createElement('div');
  empty.className = 'editor-media-empty';
  empty.textContent = `No preview for ${path.split('/').pop() || path}`;
  viewport.appendChild(empty);
}

/* ── Resize handles on selected object ─────────── */

const RESIZE_EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function addResizeHandles(objectEl, obj) {
  for (const edge of RESIZE_EDGES) {
    const handle = document.createElement('div');
    handle.className = `editor-resize-handle editor-resize-${edge}`;
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      startResize(e, obj, edge);
    });
    objectEl.appendChild(handle);
  }
}

/* ── Drag to move ──────────────────────────────── */

function startMove(e, obj) {
  e.preventDefault();
  const { gx, gy } = pxToGrid(e.clientX, e.clientY);
  const offsetX = gx - obj.x;
  const offsetY = gy - obj.y;
  const { cols, rows } = getSceneGrid();
  const sceneId = state.selectedId;

  function onMove(e) {
    const { gx, gy } = pxToGrid(e.clientX, e.clientY);
    let nx = snapToGrid(gx - offsetX);
    let ny = snapToGrid(gy - offsetY);
    nx = clampGrid(nx, cols - obj.w);
    ny = clampGrid(ny, rows - obj.h);
    if (nx !== obj.x || ny !== obj.y) {
      obj.x = nx;
      obj.y = ny;
      markDirty(sceneId);
      renderViewport();
    }
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    hooks.renderProperties();
  }

  document.body.style.cursor = 'move';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── Drag to resize ────────────────────────────── */

function startResize(e, obj, edge) {
  const startX = obj.x, startY = obj.y, startW = obj.w, startH = obj.h;
  const { cols, rows } = getSceneGrid();
  const sceneId = state.selectedId;
  const { gx: startGx, gy: startGy } = pxToGrid(e.clientX, e.clientY);

  function onMove(ev) {
    const { gx, gy } = pxToGrid(ev.clientX, ev.clientY);
    const dx = snapToGrid(gx - startGx);
    const dy = snapToGrid(gy - startGy);

    let nx = startX, ny = startY, nw = startW, nh = startH;

    if (edge.includes('e')) nw = Math.max(1, startW + dx);
    if (edge.includes('w')) { nw = Math.max(1, startW - dx); nx = startX + (startW - nw); }
    if (edge.includes('s')) nh = Math.max(1, startH + dy);
    if (edge.includes('n')) { nh = Math.max(1, startH - dy); ny = startY + (startH - nh); }

    // Clamp to grid bounds
    nx = clampGrid(nx, cols - 1);
    ny = clampGrid(ny, rows - 1);
    if (nx + nw > cols) nw = cols - nx;
    if (ny + nh > rows) nh = rows - ny;

    if (obj.x !== nx || obj.y !== ny || obj.w !== nw || obj.h !== nh) {
      obj.x = nx; obj.y = ny; obj.w = nw; obj.h = nh;
      markDirty(sceneId);
      renderViewport();
    }
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    hooks.renderProperties();
  }

  document.body.style.cursor = getComputedStyle(e.target).cursor;
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── Selection box (drag-to-create) ────────────── */

function clearSelectionBox() {
  _selectionBox = null;
  const existing = dom.viewport.querySelector('.editor-selection-box');
  if (existing) existing.remove();
}

function renderSelectionBoxEl() {
  // Remove stale element
  const old = dom.viewport.querySelector('.editor-selection-box');
  if (old) old.remove();

  if (!_selectionBox) return;
  const { cols, rows } = getSceneGrid();
  const box = document.createElement('div');
  box.className = 'editor-selection-box';
  box.style.left   = `${(_selectionBox.x / cols) * 100}%`;
  box.style.top    = `${(_selectionBox.y / rows) * 100}%`;
  box.style.width  = `${(_selectionBox.w / cols) * 100}%`;
  box.style.height = `${(_selectionBox.h / rows) * 100}%`;

  dom.viewport.appendChild(box);
}

/* ── Viewport mouse handlers (installed once) ──── */

function startPanDrag(startEvent, initialMoveEvent = null) {
  const startClientX = startEvent.clientX;
  const startClientY = startEvent.clientY;
  const startPanX = _viewportCamera.panX;
  const startPanY = _viewportCamera.panY;

  setViewportPanning(true);
  document.body.style.userSelect = 'none';

  function onMove(moveEvent) {
    _viewportCamera.panX = startPanX + (moveEvent.clientX - startClientX);
    _viewportCamera.panY = startPanY + (moveEvent.clientY - startClientY);
    applyViewportCamera();
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = '';
    setViewportPanning(false);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  if (initialMoveEvent) onMove(initialMoveEvent);
}

function startPanOrClickGesture(startEvent, onClick) {
  const startClientX = startEvent.clientX;
  const startClientY = startEvent.clientY;
  let didPan = false;

  function onMove(moveEvent) {
    if (didPan) return;
    const dx = moveEvent.clientX - startClientX;
    const dy = moveEvent.clientY - startClientY;
    if (Math.hypot(dx, dy) < PAN_DRAG_THRESHOLD) return;
    didPan = true;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    startPanDrag(startEvent, moveEvent);
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (!didPan) onClick();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function startSelectionDrag(startEvent) {
  startEvent.preventDefault();
  const { cols, rows } = getSceneGrid();
  const { gx, gy } = pxToGrid(startEvent.clientX, startEvent.clientY);
  const startCol = clampGrid(snapToGrid(gx), cols - 1);
  const startRow = clampGrid(snapToGrid(gy), rows - 1);
  let dragged = false;

  clearSelectionBox();

  function onMove(moveEvent) {
    const { gx: cx, gy: cy } = pxToGrid(moveEvent.clientX, moveEvent.clientY);
    const endCol = clampGrid(snapToGrid(cx), cols);
    const endRow = clampGrid(snapToGrid(cy), rows);
    const x = Math.min(startCol, endCol);
    const y = Math.min(startRow, endRow);
    const w = Math.max(1, Math.abs(endCol - startCol));
    const h = Math.max(1, Math.abs(endRow - startRow));
    dragged = dragged || Math.hypot(moveEvent.clientX - startEvent.clientX, moveEvent.clientY - startEvent.clientY) >= PAN_DRAG_THRESHOLD;
    _selectionBox = { x, y, w, h };
    renderSelectionBoxEl();
  }

  function onUp(upEvent) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = '';
    if (!dragged || !_selectionBox) {
      clearSelectionBox();
      return;
    }

    const selection = { ..._selectionBox };
    clearSelectionBox();
    showCreateObjectMenu(upEvent.clientX, upEvent.clientY, selection);
  }

  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

let _viewportWired = false;

export function initViewportInteractions() {
  if (_viewportWired) return;
  _viewportWired = true;

  const { viewport: sceneEl, viewportWrap: wrapEl } = dom;

  // Left mouse: pan by drag anywhere in the viewport wrapper, click background to clear selection.
  wrapEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!isActiveSceneData()) return;
    if (e.target.closest('.editor-resize-handle')) return;

    startPanOrClickGesture(e, () => {
      if (!state.selectedObjectId && !_selectionBox) return;
      state.selectedObjectId = null;
      clearSelectionBox();
      renderViewport();
      hooks.renderProperties();
    });
  });

  // Wheel zoom is bound to the wrapper so it still works in the outer deadzone.
  wrapEl.addEventListener('wheel', (e) => {
    if (!isActiveSceneData()) return;
    e.preventDefault();
    const nextZoom = _viewportCamera.zoom * Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
    zoomViewportAt(e.clientX, e.clientY, nextZoom);
  }, { passive: false });

  sceneEl.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    if (!isActiveSceneData()) return;
    if (e.target !== sceneEl) return;
    startSelectionDrag(e);
  });

  wrapEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}
