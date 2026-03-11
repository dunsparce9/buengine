/**
 * Centre viewport — scene preview with hotspot overlays.
 * Supports: selection, drag-to-move, drag-to-resize, drag-to-create, context menu.
 */

import { state, dom, hooks, markDirty, addHotspot, deleteHotspot, uniqueHotspotId } from './state.js';
import { showContextMenu } from './context-menu.js';
import { resolveAssetURL, resolveAssetURLSync } from './fs-provider.js';
import { getFileKind, isPreviewableMedia } from './file-types.js';
import { renderItemsViewport } from './items-viewer.js';
import { createDefaultObjectOption } from './options-editor.js';

/* ── Drag state (module-scoped, survives re-renders) ── */
let _selectionBox = null; // { x, y, w, h } in grid units (for drag-to-create)

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

/* ── Main render ───────────────────────────────── */

export function renderViewport() {
  const { viewport, viewportWrap } = dom;

  // Clear previous hotspot elements (keep selection box if present)
  viewport.querySelectorAll('.editor-media-preview, .editor-media-empty, .items-viewer').forEach(el => el.remove());
  viewport.querySelectorAll('.editor-hotspot, .editor-resize-handle').forEach(el => el.remove());
  viewport.style.backgroundImage = '';
  viewport.style.backgroundColor = '#181825';
  viewport.style.width  = '';
  viewport.style.height = '';
  viewport.classList.remove('viewport-items-mode');
  viewportWrap.classList.remove('viewport-items-mode');

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

  // Objects (supports both "objects" and "hotspots" keys)
  const objects = data.objects ?? data.hotspots;
  if (Array.isArray(objects)) {
    for (const hs of objects) {
      const div = document.createElement('div');
      div.className = 'editor-hotspot';
      const selected = hs.id === state.selectedHs;
      if (selected) div.classList.add('selected');

      div.style.left   = `${(hs.x / cols) * 100}%`;
      div.style.top    = `${(hs.y / rows) * 100}%`;
      div.style.width  = `${(hs.w / cols) * 100}%`;
      div.style.height = `${(hs.h / rows) * 100}%`;

      if (hs.texture) {
        div.classList.add('editor-hotspot-textured');
        const texUrl = resolveAssetURLSync(hs.texture);
        if (texUrl) div.style.backgroundImage = `url('${texUrl}')`;
      }

      const label = document.createElement('span');
      label.className = 'editor-hotspot-label';
      label.textContent = hs.id || hs.label || '';
      div.appendChild(label);

      // Click to select
      div.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        // If not already selected, just select
        if (state.selectedHs !== hs.id) {
          clearSelectionBox();
          state.selectedHs = hs.id;
          renderViewport();
          hooks.renderProperties();
          return;
        }
        // Already selected — start drag-to-move
        startMove(e, hs);
      });

      // Right-click on hotspot
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.selectedHs = hs.id;
        clearSelectionBox();
        renderViewport();
        hooks.renderProperties();
        showContextMenu(e.clientX, e.clientY, [
          { icon: 'delete', label: 'Delete hotspot', danger: true, onClick: () => deleteHotspot(hs.id) },
        ]);
      });

      viewport.appendChild(div);

      // Add resize handles for selected hotspot
      if (selected) {
        addResizeHandles(div, hs);
      }
    }
  }

  // Render selection box (drag-to-create preview)
  renderSelectionBoxEl();
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

/* ── Resize handles on selected hotspot ────────── */

const RESIZE_EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function addResizeHandles(hsEl, hs) {
  for (const edge of RESIZE_EDGES) {
    const handle = document.createElement('div');
    handle.className = `editor-resize-handle editor-resize-${edge}`;
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      startResize(e, hs, edge);
    });
    hsEl.appendChild(handle);
  }
}

/* ── Drag to move ──────────────────────────────── */

function startMove(e, hs) {
  e.preventDefault();
  const { gx, gy } = pxToGrid(e.clientX, e.clientY);
  const offsetX = gx - hs.x;
  const offsetY = gy - hs.y;
  const { cols, rows } = getSceneGrid();
  const sceneId = state.selectedId;

  function onMove(e) {
    const { gx, gy } = pxToGrid(e.clientX, e.clientY);
    let nx = snapToGrid(gx - offsetX);
    let ny = snapToGrid(gy - offsetY);
    nx = clampGrid(nx, cols - hs.w);
    ny = clampGrid(ny, rows - hs.h);
    if (nx !== hs.x || ny !== hs.y) {
      hs.x = nx;
      hs.y = ny;
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

function startResize(e, hs, edge) {
  const startX = hs.x, startY = hs.y, startW = hs.w, startH = hs.h;
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

    if (hs.x !== nx || hs.y !== ny || hs.w !== nw || hs.h !== nh) {
      hs.x = nx; hs.y = ny; hs.w = nw; hs.h = nh;
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

  // Right-click on selection box → context menu
  box.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sel = { ..._selectionBox };
    showContextMenu(e.clientX, e.clientY, [
      {
        icon: 'add_box',
        label: 'Create hotspot',
        onClick: () => {
          const id = uniqueHotspotId('hotspot');
          addHotspot({ id, x: sel.x, y: sel.y, w: sel.w, h: sel.h, options: [createDefaultObjectOption()] });
          clearSelectionBox();
        },
      },
    ]);
  });

  dom.viewport.appendChild(box);
}

/* ── Viewport mouse handlers (installed once) ──── */

let _viewportWired = false;

export function initViewportInteractions() {
  if (_viewportWired) return;
  _viewportWired = true;

  const vp = dom.viewport;

  // Mousedown on empty viewport area — either deselect or start selection drag
  vp.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // Only start creation drag if clicking on the viewport background itself
    if (e.target !== vp) return;

    const data = state.scripts[state.selectedId];
    if (!data || state.selectedId === '_game') return;

    // Deselect current hotspot
    if (state.selectedHs) {
      state.selectedHs = null;
      renderViewport();
      hooks.renderProperties();
    }

    // Start drag-to-create
    const { gx, gy } = pxToGrid(e.clientX, e.clientY);
    const { cols, rows } = getSceneGrid();
    const startCol = clampGrid(snapToGrid(gx), cols - 1);
    const startRow = clampGrid(snapToGrid(gy), rows - 1);

    clearSelectionBox();

    function onMove(ev) {
      const { gx: cx, gy: cy } = pxToGrid(ev.clientX, ev.clientY);
      const endCol = clampGrid(snapToGrid(cx), cols);
      const endRow = clampGrid(snapToGrid(cy), rows);

      const x = Math.min(startCol, endCol);
      const y = Math.min(startRow, endRow);
      const w = Math.max(1, Math.abs(endCol - startCol));
      const h = Math.max(1, Math.abs(endRow - startRow));

      _selectionBox = { x, y, w, h };
      renderSelectionBoxEl();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // If the user just clicked (no drag), clear selection box
      if (!_selectionBox || (_selectionBox.w <= 0 && _selectionBox.h <= 0)) {
        clearSelectionBox();
      }
    }

    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Right-click on viewport background (not on hotspot or selection) — context menu
  vp.addEventListener('contextmenu', (e) => {
    // Let hotspot/selection box handlers take priority (they stopPropagation)
    e.preventDefault();
  });
}
