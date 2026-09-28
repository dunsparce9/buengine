/**
 * Right-side property inspector panel.
 */

import { state, dom, hooks, escapeHtml, markDirty, collectImagePaths, scriptPathFromId } from './state.js';
import { openActionEditor } from './action-editor.js';
import { findNode } from './fs-provider.js';
import { getFileExtension, getFileKind, isPreviewableMedia } from './file-types.js';
import { renderItemsProperties } from './items-viewer.js';
import { openOptionsModal, createDefaultObjectOption } from './options-editor.js';
import { openSequencesModal } from './sequence-editor.js';
import { selectScript } from './file-panel.js';
import { createSectionHeader } from './section-header.js';
import {
  addEditablePropGroup,
  addCompactEditablePropGroup,
  buildFieldRow,
} from './field-rows.js';

let _assetInfoRequestId = 0;

const SECTION_ICONS = {
  'Game manifest': 'sports_esports',
  'Scenes': 'movie',
  'Scene': 'landscape',
  'Objects': 'apps',
  'Object': 'category',
  'Position': 'open_with',
  'Texture': 'image',
  'Cursor': 'mouse',
  'File': 'draft',
  'Info': 'info',
  'Sequences': 'code',
  'onEnter': 'login',
  'Options': 'tune',
};


function focusSceneInEditor(sceneId) {
  if (!sceneId) return;
  const target = state.scripts[sceneId];
  if (!target || Array.isArray(target) || sceneId === '_game') return;
  selectScript(sceneId);
}

function createGroupTitle(title, options) {
  return createSectionHeader(title, {
    iconMap: SECTION_ICONS,
    ...options,
  });
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

  if (state.selectedObjectId) {
    const objects = data.objects;
    const obj = objects?.find(item => item.id === state.selectedObjectId);
    if (obj) {
      renderObjectProps(obj);
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
  ], dom.propsContent, createGroupTitle);

  if (data.scenes) {
    addPropGroup('Scenes', data.scenes.map((s, i) => [`[${i}]`, s]));
  }
}

function renderSceneProps(data) {
  const sceneId = state.selectedId;

  addEditablePropGroup('Scene', [
    {
      key: 'id',
      value: data.id ?? '',
      event: 'change',
      onChange: (value, input) => updateSceneId(data, sceneId, value, input),
    },
    {
      key: 'background',
      value: data.background ?? '',
      onChange: value => {
        data.background = value || undefined;
        markDirty(sceneId);
        hooks.renderViewport();
      },
    },
    {
      key: 'backgroundColor',
      value: data.backgroundColor ?? '',
      onChange: value => {
        data.backgroundColor = value || undefined;
        markDirty(sceneId);
        hooks.renderViewport();
      },
    },
  ], dom.propsContent, createGroupTitle);

  const grid = data.grid ||= { cols: 16, rows: 9 };
  addCompactEditablePropGroup('Grid', [
    {
      key: 'cols',
      value: grid.cols ?? 16,
      type: 'number',
      step: 1,
      min: 1,
      onChange: value => updateSceneGrid(data, sceneId, 'cols', value),
    },
    {
      key: 'rows',
      value: grid.rows ?? 9,
      type: 'number',
      step: 1,
      min: 1,
      onChange: value => updateSceneGrid(data, sceneId, 'rows', value),
    },
  ], dom.propsContent, createGroupTitle);

  const objects = data.objects;
  addPropGroup(`Objects (${objects?.length ?? 0})`,
    (objects || []).map(obj => [obj.id || '?', obj.label || '—'])
  );

  {
    if (!data.onEnter) data.onEnter = [];
    addActionLinkGroup('onEnter', [['actions', data.onEnter.length]],
      () => openActionEditor(`${data.id} — onEnter`, data.onEnter, {
        onChange: () => {
          markDirty(data.id);
          hooks.renderProperties();
        },
        sceneId: data.id,
        sceneData: data,
        markDirty,
        focusScene: focusSceneInEditor,
      })
    );
  }

  const sequences = data.sequences || {};
  const names = Object.keys(sequences);
  addSequencesGroup(data, names);
}

function updateSceneId(data, currentSceneId, raw, input) {
  const nextId = raw.trim().replace(/\s+/g, '_');
  const prevId = data.id || currentSceneId;

  if (!nextId) {
    input.value = prevId;
    input.classList.remove('prop-input-error');
    return;
  }

  const collision = Object.keys(state.scripts).some(id => id !== currentSceneId && !id.includes('/') && id === nextId);
  if (nextId === '_game' || collision) {
    input.classList.add('prop-input-error');
    return;
  }

  input.classList.remove('prop-input-error');
  if (nextId === currentSceneId) {
    data.id = nextId;
    input.value = nextId;
    return;
  }

  const originalPath = state.pendingScriptRenames.get(currentSceneId) || scriptPathFromId(currentSceneId);
  state.pendingScriptRenames.delete(currentSceneId);
  state.pendingScriptRenames.set(nextId, originalPath);

  delete state.scripts[currentSceneId];
  state.scripts[nextId] = data;

  if (state.dirtySet.delete(currentSceneId)) {
    state.dirtySet.add(nextId);
  } else {
    markDirty(nextId);
  }

  data.id = nextId;
  state.selectedId = nextId;
  state.selectedPath = scriptPathFromId(nextId);
  input.value = nextId;

  hooks.updateWindowTitle();
  hooks.renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
}

function updateSceneGrid(data, sceneId, axis, raw) {
  const next = Number.parseInt(raw, 10);
  if (!Number.isFinite(next) || next < 1) return;
  data.grid ||= { cols: 16, rows: 9 };
  data.grid[axis] = next;
  markDirty(sceneId);
  hooks.renderViewport();
}

const STANDARD_CURSORS = [
  'auto', 'default', 'pointer', 'crosshair', 'move', 'text',
  'wait', 'help', 'not-allowed', 'grab', 'grabbing', 'zoom-in', 'zoom-out',
  'n-resize', 's-resize', 'e-resize', 'w-resize',
  'ne-resize', 'nw-resize', 'se-resize', 'sw-resize',
  'col-resize', 'row-resize', 'none',
];

function renderObjectProps(obj) {
  const sceneId = state.selectedId;
  const data = state.scripts[sceneId];

  function setObjectProp(prop, raw) {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) obj[prop] = v;
    markDirty(sceneId);
    hooks.renderViewport();
  }

  // ── Identity fields ──
  addEditablePropGroup('Object', [
    {
      key: 'id',
      value: obj.id || '',
      event: 'change',
      onChange: (value, input) => {
        const v = value.trim().replace(/\s+/g, '_');
        if (!v) { input.value = obj.id; return; }
        const others = (data.objects ?? []).filter(item => item !== obj);
        if (others.some(item => item.id === v)) {
          input.classList.add('prop-input-error');
          return;
        }
        input.classList.remove('prop-input-error');
        obj.id = v;
        input.value = v;
        state.selectedObjectId = v;
        markDirty(sceneId);
        hooks.renderViewport();
      },
    },
    {
      key: 'label',
      value: obj.label || '',
      onChange: value => {
        obj.label = value || undefined;
        markDirty(sceneId);
        hooks.renderViewport();
      },
    },
  ], dom.propsContent, createGroupTitle);

  // ── Position ──
  addCompactEditablePropGroup('Position', [
    { key: 'x', value: obj.x, type: 'number', step: 1, min: 0, onChange: v => setObjectProp('x', v) },
    { key: 'y', value: obj.y, type: 'number', step: 1, min: 0, onChange: v => setObjectProp('y', v) },
    { key: 'w', value: obj.w, type: 'number', step: 1, min: 1, onChange: v => setObjectProp('w', v) },
    { key: 'h', value: obj.h, type: 'number', step: 1, min: 1, onChange: v => setObjectProp('h', v) },
  ], dom.propsContent, createGroupTitle);

  // ── Texture — combo box ──
  addEditablePropGroup('Texture', [
    {
      key: 'src',
      value: obj.texture || '',
      type: 'datalist',
      listId: 'texture-datalist',
      options: collectImagePaths(),
      placeholder: '(none)',
      onChange: value => {
        obj.texture = value || undefined;
        markDirty(sceneId);
        hooks.renderViewport();
      },
    },
  ], dom.propsContent, createGroupTitle);

  // ── Cursor — select list ──
  addEditablePropGroup('Cursor', [
    {
      key: 'cursor',
      value: obj.cursor || '',
      type: 'select',
      // Empty value means "no cursor override" (default).
      options: [{ value: '', label: '(default)' }, ...STANDARD_CURSORS],
      event: 'change',
      onChange: value => {
        obj.cursor = value || undefined;
        markDirty(sceneId);
      },
    },
  ], dom.propsContent, createGroupTitle);

  // ── Visibility + highlight (no group heading, as before) ──
  {
    const group = document.createElement('div');
    group.className = 'prop-group';
    group.appendChild(buildFieldRow({
      key: 'visible',
      value: obj.visible !== false,
      type: 'checkbox',
      onChange: checked => {
        if (checked) {
          delete obj.visible;
        } else {
          obj.visible = false;
        }
        markDirty(sceneId);
        hooks.renderViewport();
      },
    }));
    group.appendChild(buildFieldRow({
      key: 'highlight',
      value: obj.highlight !== false,
      type: 'checkbox',
      onChange: checked => {
        if (checked) {
          delete obj.highlight;
        } else {
          obj.highlight = false;
        }
        markDirty(sceneId);
        hooks.renderViewport();
      },
    }));
    dom.propsContent.appendChild(group);
  }

  // ── Actions ──
  {
    const options = getObjectOptionsPreview(obj);
    const openOptionsManager = () => {
      openOptionsModal({
        target: obj,
        scriptId: sceneId,
        title: `${obj.id} — Options`,
        subtitle: obj.label || obj.id,
        modalKey: `${sceneId}:${obj.id}:options`,
        ownerLabel: obj.label || obj.id,
        actionViewerContext: {
          sceneId,
          sceneData: data,
          markDirty,
          focusScene: focusSceneInEditor,
        },
        createDefaultOption: createDefaultObjectOption,
      });
    };
    addOptionsLinkGroup('Options', options, openOptionsManager, (optionIndex) => {
      const liveOptions = ensureObjectOptions(obj, sceneId);
      const option = liveOptions[optionIndex];
      if (!option) return;
      if (!Array.isArray(option.actions)) option.actions = [];
      openActionEditor(
        `${obj.label || obj.id} — ${option.text || `Option ${optionIndex + 1}`}`,
        option.actions,
        {
          onChange: () => { markDirty(sceneId); hooks.renderProperties(); },
          sceneId,
          sceneData: data,
          markDirty,
          focusScene: focusSceneInEditor,
        }
      );
    });
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

  const heading = createGroupTitle(title);

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

  const heading = createGroupTitle(title);
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

  const heading = createGroupTitle(title);
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

function addOptionsLinkGroup(title, options, onManage, onOpenOptionActions) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = createGroupTitle(`${title} (${options.length})`, { onClick: onManage });
  group.appendChild(heading);

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'props-empty';
    empty.textContent = 'No options defined';
    group.appendChild(empty);
    dom.propsContent.appendChild(group);
    return;
  }

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const row = document.createElement('div');
    row.className = 'prop-row';
    const key = document.createElement('span');
    key.className = 'prop-key';
    key.textContent = opt.text || `Option ${i + 1}`;

    const meta = document.createElement('span');
    meta.className = 'prop-val prop-option-meta';

    const icon = document.createElement('span');
    icon.textContent = opt.icon || '—';

    const separator = document.createElement('span');
    separator.textContent = '·';

    const link = document.createElement('span');
    link.className = 'prop-action-link';
    link.textContent = `${Array.isArray(opt.actions) ? opt.actions.length : 0} action(s)`;
    link.addEventListener('click', () => onOpenOptionActions(i));

    meta.append(icon, separator, link);
    row.append(key, meta);
    group.appendChild(row);
  }

  dom.propsContent.appendChild(group);
}

function getObjectOptionsPreview(obj) {
  if (Array.isArray(obj.options)) return obj.options;
  if (Array.isArray(obj.actions)) {
    return [{
      ...createDefaultObjectOption(),
      actions: obj.actions,
    }];
  }
  return [];
}

function ensureObjectOptions(obj, sceneId) {
  if (Array.isArray(obj.options)) return obj.options;
  if (Array.isArray(obj.actions)) {
    obj.options = [{
      ...createDefaultObjectOption(),
      actions: obj.actions,
    }];
    delete obj.actions;
    markDirty(sceneId);
    hooks.renderViewport();
    hooks.renderProperties();
    return obj.options;
  }
  obj.options = [createDefaultObjectOption()];
  markDirty(sceneId);
  hooks.renderViewport();
  hooks.renderProperties();
  return obj.options;
}

function addSequencesGroup(data, names) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const openSequencesManager = () => openSequencesModal({
    sceneData: data,
    scriptId: data.id,
    modalKey: `${data.id}:sequences`,
    actionViewerContext: {
      sceneId: data.id,
      sceneData: data,
      markDirty,
      focusScene: focusSceneInEditor,
    },
  });

  const heading = createGroupTitle(`Sequences (${names.length})`, { onClick: openSequencesManager });
  group.appendChild(heading);

  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'props-empty';
    empty.textContent = 'No sequences defined.';
    group.appendChild(empty);
    dom.propsContent.appendChild(group);
    return;
  }

  for (const name of names) {
    const actions = data.sequences[name];
    const row = document.createElement('div');
    row.className = 'prop-row';

    const keyEl = document.createElement('span');
    keyEl.className = 'prop-key';
    keyEl.textContent = name;

    const link = document.createElement('span');
    link.className = 'prop-action-link';
    link.textContent = `${actions.length} action(s)`;
    link.addEventListener('click', () =>
      openActionEditor(`${data.id} — ${name}`, actions, {
        onChange: () => {
          markDirty(data.id);
          hooks.renderProperties();
        },
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

