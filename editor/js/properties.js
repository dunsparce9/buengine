/**
 * Right-side property inspector panel.
 */

import { state, dom, hooks, escapeHtml, markDirty, collectImagePaths, deleteHotspot } from './state.js';
import { openActionViewer } from './action-viewer.js';
import { findNode } from './fs-provider.js';
import { getFileExtension, getFileKind, isPreviewableMedia } from './file-types.js';
import { renderItemsProperties } from './items-viewer.js';
import { selectScript } from './file-panel.js';

let _assetInfoRequestId = 0;


function focusSceneInEditor(sceneId) {
  if (!sceneId) return;
  const target = state.scripts[sceneId];
  if (!target || Array.isArray(target) || sceneId === '_game') return;
  selectScript(sceneId);
}


export function renderProperties() {
  dom.propsContent.innerHTML = '';

  if (state.selectedPath && !state.selectedId) {
    renderAssetProps(state.selectedPath);
    return;
  }

  if (!state.selectedId || !state.scripts[state.selectedId]) {
    dom.propsContent.innerHTML = '<div class="props-empty">Nothing selected</div>';
    return;
  }

  const data = state.scripts[state.selectedId];

  if (state.selectedId === '_game') {
    renderGameProps(data);
    return;
  }

  if (Array.isArray(data)) {
    renderItemsProperties(data, dom.propsContent);
    return;
  }

  if (state.selectedHs) {
    const objects = data.objects ?? data.hotspots;
    const hs = objects?.find(h => h.id === state.selectedHs);
    if (hs) {
      renderHotspotProps(hs);
      return;
    }
  }

  renderSceneProps(data);
}

/* ── Per-type renderers ────────────────────────── */

function renderGameProps(data) {
  addEditablePropGroup('Game manifest', [
    { key: 'title',      value: data.title      ?? '', onChange: v => { data.title = v; markDirty('_game'); } },
    { key: 'subtitle',   value: data.subtitle   ?? '', onChange: v => { data.subtitle = v; markDirty('_game'); } },
    { key: 'startScene', value: data.startScene ?? '', onChange: v => { data.startScene = v; markDirty('_game'); } },
  ]);

  if (data.scenes) {
    addPropGroup('Scenes', data.scenes.map((s, i) => [`[${i}]`, s]));
  }
}

function renderSceneProps(data) {
  addPropGroup('Scene', [
    ['id',              data.id || '—'],
    ['background',      data.background || '—'],
    ['backgroundColor', data.backgroundColor || '—'],
    ['grid',            data.grid ? `${data.grid.cols} × ${data.grid.rows}` : '16 × 9'],
  ]);

  const objects = data.objects ?? data.hotspots;
  addPropGroup(`Objects (${objects?.length ?? 0})`,
    (objects || []).map(hs => [hs.id || '?', hs.label || '—'])
  );

  {
    if (!data.onEnter) data.onEnter = [];
    addActionLinkGroup('onEnter', [['actions', data.onEnter.length]],
      () => openActionViewer(`${data.id} — onEnter`, data.onEnter, {
        onChange: () => markDirty(data.id),
        sceneId: data.id,
        sceneData: data,
        markDirty,
        focusScene: focusSceneInEditor,
      })
    );
  }

  if (data.definitions) {
    const names = Object.keys(data.definitions);
    addDefinitionsGroup(data, names);
  }
}

const STANDARD_CURSORS = [
  'auto', 'default', 'pointer', 'crosshair', 'move', 'text',
  'wait', 'help', 'not-allowed', 'grab', 'grabbing', 'zoom-in', 'zoom-out',
  'n-resize', 's-resize', 'e-resize', 'w-resize',
  'ne-resize', 'nw-resize', 'se-resize', 'sw-resize',
  'col-resize', 'row-resize', 'none',
];

function renderHotspotProps(hs) {
  const sceneId = state.selectedId;
  const data = state.scripts[sceneId];

  function setHsProp(prop, raw) {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) hs[prop] = v;
    markDirty(sceneId);
    hooks.renderViewport();
  }

  // ── Identity fields ──
  {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const heading = document.createElement('div');
    heading.className = 'prop-group-title';
    heading.textContent = 'Object';
    group.appendChild(heading);

    // id — editable with uniqueness validation
    {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const label = document.createElement('span');
      label.className = 'prop-key';
      label.textContent = 'id';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'prop-input';
      input.value = hs.id || '';
      input.addEventListener('change', () => {
        const v = input.value.trim().replace(/\s+/g, '_');
        if (!v) { input.value = hs.id; return; }
        const others = (data.objects ?? data.hotspots ?? []).filter(h => h !== hs);
        if (others.some(h => h.id === v)) {
          input.classList.add('prop-input-error');
          return;
        }
        input.classList.remove('prop-input-error');
        const oldId = hs.id;
        hs.id = v;
        input.value = v;
        state.selectedHs = v;
        markDirty(sceneId);
        hooks.renderViewport();
      });
      row.append(label, input);
      group.appendChild(row);
    }

    // label — editable
    {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const label = document.createElement('span');
      label.className = 'prop-key';
      label.textContent = 'label';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'prop-input';
      input.value = hs.label || '';
      input.addEventListener('input', () => {
        hs.label = input.value || undefined;
        markDirty(sceneId);
        hooks.renderViewport();
      });
      row.append(label, input);
      group.appendChild(row);
    }

    dom.propsContent.appendChild(group);
  }

  // ── Position ──
  addEditablePropGroup('Position', [
    { key: 'x', value: hs.x, type: 'number', step: 1, min: 0, onChange: v => setHsProp('x', v) },
    { key: 'y', value: hs.y, type: 'number', step: 1, min: 0, onChange: v => setHsProp('y', v) },
    { key: 'w', value: hs.w, type: 'number', step: 1, min: 1, onChange: v => setHsProp('w', v) },
    { key: 'h', value: hs.h, type: 'number', step: 1, min: 1, onChange: v => setHsProp('h', v) },
  ]);

  // ── Texture — combo box ──
  {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const heading = document.createElement('div');
    heading.className = 'prop-group-title';
    heading.textContent = 'Texture';
    group.appendChild(heading);

    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('span');
    label.className = 'prop-key';
    label.textContent = 'src';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.setAttribute('list', 'texture-datalist');
    input.value = hs.texture || '';
    input.placeholder = '(none)';
    input.addEventListener('input', () => {
      hs.texture = input.value || undefined;
      markDirty(sceneId);
      hooks.renderViewport();
    });

    // Populate datalist with known images
    let datalist = document.getElementById('texture-datalist');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'texture-datalist';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    for (const p of collectImagePaths()) {
      const opt = document.createElement('option');
      opt.value = p;
      datalist.appendChild(opt);
    }

    row.append(label, input);
    group.appendChild(row);
    dom.propsContent.appendChild(group);
  }

  // ── Cursor — select list ──
  {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const heading = document.createElement('div');
    heading.className = 'prop-group-title';
    heading.textContent = 'Cursor';
    group.appendChild(heading);

    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('span');
    label.className = 'prop-key';
    label.textContent = 'cursor';

    const sel = document.createElement('select');
    sel.className = 'prop-input prop-select';

    // "(default)" option means no cursor override
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = '(default)';
    sel.appendChild(defOpt);

    for (const c of STANDARD_CURSORS) {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      if (c === (hs.cursor || '')) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      hs.cursor = sel.value || undefined;
      markDirty(sceneId);
    });

    row.append(label, sel);
    group.appendChild(row);
    dom.propsContent.appendChild(group);
  }

  // ── Visibility ──
  {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const row = document.createElement('div');
    row.className = 'prop-row';
    const label = document.createElement('span');
    label.className = 'prop-key';
    label.textContent = 'visible';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'prop-checkbox';
    input.checked = hs.visible !== false;
    input.addEventListener('change', () => {
      if (input.checked) {
        delete hs.visible;
      } else {
        hs.visible = false;
      }
      markDirty(sceneId);
      hooks.renderViewport();
    });
    row.append(label, input);
    group.appendChild(row);
    dom.propsContent.appendChild(group);
  }

  // ── Actions ──
  {
    if (!hs.actions) hs.actions = [];
    addActionLinkGroup('Actions', [['count', hs.actions.length]],
      () => openActionViewer(`${hs.id} — actions`, hs.actions, {
        onChange: () => { markDirty(sceneId); hooks.renderProperties(); },
        sceneId,
        sceneData: data,
        markDirty,
        focusScene: focusSceneInEditor,
      })
    );
  }

  // ── Delete object button ──
  {
    const group = document.createElement('div');
    group.className = 'prop-group';
    const btn = document.createElement('button');
    btn.className = 'prop-danger-btn';
    btn.innerHTML = '<span class="material-symbols-outlined">delete</span> Delete object';
    btn.addEventListener('click', () => deleteHotspot(hs.id));
    group.appendChild(btn);
    dom.propsContent.appendChild(group);
  }
}

function renderAssetProps(path) {
  const kind = getFileKind(path);
  const name = path.split('/').pop() || path;
  const preview = isPreviewableMedia(path) ? 'Yes' : 'No';

  addPropGroup('File', [
    ['name', name],
    ['path', path],
    ['type', kind],
    ['extension', getFileExtension(path) || '—'],
    ['preview', preview],
  ]);

  const detailsGroup = createAsyncPropGroup('Info', 'Loading file info...');
  dom.propsContent.appendChild(detailsGroup.group);
  loadAssetInfo(path, kind, detailsGroup);
}

async function loadAssetInfo(path, kind, detailsGroup) {
  const requestId = ++_assetInfoRequestId;

  try {
    const file = await readSelectedFile(path);
    if (!file || requestId !== _assetInfoRequestId) return;
    if (state.selectedPath !== path || state.selectedId) return;

    const rows = [
      ['size', formatBytes(file.size)],
      ['mime', file.type || inferMime(path)],
      ['modified', formatDate(file.lastModified)],
    ];

    if (kind === 'image') {
      const meta = await readImageInfo(file, path);
      if (requestId !== _assetInfoRequestId || state.selectedPath !== path || state.selectedId) return;
      if (meta) rows.push(['dimensions', `${meta.width} × ${meta.height}`]);
    } else if (kind === 'audio' || kind === 'video') {
      const meta = await readMediaInfo(file, kind);
      if (requestId !== _assetInfoRequestId || state.selectedPath !== path || state.selectedId) return;
      if (meta) {
        rows.push(['duration', formatDuration(meta.duration)]);
        if (kind === 'video' && meta.width && meta.height) {
          rows.push(['dimensions', `${meta.width} × ${meta.height}`]);
        }
      }
    }

    setAsyncPropRows(detailsGroup, rows);
  } catch (err) {
    if (requestId !== _assetInfoRequestId) return;
    setAsyncPropMessage(detailsGroup, `Unable to read file info: ${err.message}`);
  }
}

async function readSelectedFile(path) {
  const node = findNode(path);
  if (!node || node.type !== 'file') return null;
  return await node.handle.getFile();
}

function readImageInfo(file, path) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
    img.alt = path;
  });
}

function readMediaInfo(file, kind) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done({
      duration: el.duration,
      width: 'videoWidth' in el ? el.videoWidth : 0,
      height: 'videoHeight' in el ? el.videoHeight : 0,
    });
    el.onerror = () => done(null);
    el.src = url;
  });
}

function createAsyncPropGroup(title, message) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = document.createElement('div');
  heading.className = 'prop-group-title';
  heading.textContent = title;

  const body = document.createElement('div');
  body.className = 'prop-async-body';
  body.textContent = message;

  group.append(heading, body);
  return { group, body };
}

function setAsyncPropRows(target, rows) {
  target.body.innerHTML = '';
  for (const [key, val] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML =
      `<span class="prop-key">${escapeHtml(String(key))}</span>` +
      `<span class="prop-val">${escapeHtml(String(val))}</span>`;
    target.body.appendChild(row);
  }
}

function setAsyncPropMessage(target, message) {
  target.body.textContent = message;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    return `${hours}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function inferMime(path) {
  const ext = getFileExtension(path);
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    opus: 'audio/ogg',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    webm: 'video/webm',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return map[ext] || '—';
}

/* ── Property group helpers ────────────────────── */

function addPropGroup(title, rows) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = document.createElement('div');
  heading.className = 'prop-group-title';
  heading.textContent = title;
  group.appendChild(heading);

  for (const [key, val] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML =
      `<span class="prop-key">${escapeHtml(String(key))}</span>` +
      `<span class="prop-val">${escapeHtml(String(val))}</span>`;
    group.appendChild(row);
  }

  dom.propsContent.appendChild(group);
}

function addActionLinkGroup(title, rows, onClick) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = document.createElement('div');
  heading.className = 'prop-group-title';
  heading.textContent = title;
  group.appendChild(heading);

  for (const [key, count] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const keyEl = document.createElement('span');
    keyEl.className = 'prop-key';
    keyEl.textContent = key;

    const link = document.createElement('span');
    link.className = 'prop-action-link';
    link.textContent = `${count} action(s)`;
    link.addEventListener('click', onClick);

    row.append(keyEl, link);
    group.appendChild(row);
  }

  dom.propsContent.appendChild(group);
}

function addDefinitionsGroup(data, names) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = document.createElement('div');
  heading.className = 'prop-group-title';
  heading.textContent = `Definitions (${names.length})`;
  group.appendChild(heading);

  for (const name of names) {
    const actions = data.definitions[name];
    const row = document.createElement('div');
    row.className = 'prop-row';

    const keyEl = document.createElement('span');
    keyEl.className = 'prop-key';
    keyEl.textContent = name;

    const link = document.createElement('span');
    link.className = 'prop-action-link';
    link.textContent = `${actions.length} action(s)`;
    link.addEventListener('click', () =>
      openActionViewer(`${data.id} — ${name}`, actions, {
        onChange: () => markDirty(data.id),
        sceneId: data.id,
        sceneData: data,
        markDirty,
        focusScene: focusSceneInEditor,
      })
    );

    row.append(keyEl, link);
    group.appendChild(row);
  }

  dom.propsContent.appendChild(group);
}

function addEditablePropGroup(title, fields) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = document.createElement('div');
  heading.className = 'prop-group-title';
  heading.textContent = title;
  group.appendChild(heading);

  for (const { key, value, type, step, min, max, onChange } of fields) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('span');
    label.className = 'prop-key';
    label.textContent = key;

    const input = document.createElement('input');
    input.type = type || 'text';
    input.className = 'prop-input';
    input.value = value;
    if (step != null) input.step = step;
    if (min  != null) input.min  = min;
    if (max  != null) input.max  = max;
    input.addEventListener('input', () => onChange(input.value));

    row.appendChild(label);
    row.appendChild(input);
    group.appendChild(row);
  }

  dom.propsContent.appendChild(group);
}
