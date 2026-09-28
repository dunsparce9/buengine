/**
 * Right-side property inspector panel.
 */

import { state, dom, hooks, escapeHtml, markDirty, collectImagePaths } from '../core/state.js';
import { openActionField } from '../action-editor.js';
import { renameScene } from '../core/scene-actions.js';
import { closeWindowsFor } from '../ui/floating-window.js';
import { renderItemsProperties } from './items-viewer.js';
import { openOptionsModal, createDefaultObjectOption, getOptionsPreview } from '../editors/options-editor.js';
import { openSequencesModal } from '../editors/sequence-editor.js';
import { renderAssetProps } from './media-info.js';
import { makeActionViewerContext, makeActionEditorOpts } from '../core/action-context.js';
import { createSectionHeader } from '../ui/section-header.js';
import {
  addEditablePropGroup,
  addCompactEditablePropGroup,
  buildFieldRow,
} from '../ui/field-rows.js';

const SECTION_ICONS = {
  'Game manifest': 'sports_esports',
  'Scenes': 'movie',
  'Scene': 'landscape',
  'Objects': 'apps',
  'Object': 'category',
  'Position': 'open_with',
  'Texture': 'image',
  'Cursor': 'mouse',
  'Sequences': 'code',
  'onEnter': 'login',
  'Options': 'tune',
};

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

  const grid = data.grid || { cols: 16, rows: 9 };
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
    addActionLinkGroup('onEnter', [['actions', data.onEnter?.length || 0]],
      () => openActionField(`${data.id} — onEnter`, data, 'onEnter',
        makeActionEditorOpts(data, () => {
          markDirty(sceneId);
          hooks.renderProperties();
        })
      )
    );
  }

  const sequences = data.sequences || {};
  const names = Object.keys(sequences);
  addSequencesGroup(data, names);
}

async function updateSceneId(data, currentSceneId, raw, input) {
  const nextId = raw.trim().replace(/\s+/g, '_');
  const prevId = data.id || currentSceneId;

  if (!nextId) {
    input.value = prevId;
    input.classList.remove('prop-input-error');
    return;
  }

  if (nextId === prevId && nextId === currentSceneId) return;
  input.disabled = true;
  try {
    await renameScene(currentSceneId, nextId);
  } catch (err) {
    input.value = prevId;
    input.classList.add('prop-input-error');
    hooks.toast?.(`Rename failed: ${err.message}`, 'error');
  } finally {
    input.disabled = false;
  }
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
        closeWindowsFor(obj);
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
    const options = getOptionsPreview(obj);
    const openOptionsManager = () => {
      openOptionsModal({
        target: obj,
        scriptId: sceneId,
        title: `${obj.id} — Options`,
        subtitle: obj.label || obj.id,
        modalKey: `${sceneId}:${obj.id}:options`,
        ownerLabel: obj.label || obj.id,
        actionViewerContext: makeActionViewerContext(data),
        createDefaultOption: createDefaultObjectOption,
      });
    };
    addOptionsLinkGroup('Options', options, openOptionsManager, (optionIndex) => {
      const option = options[optionIndex];
      if (!option) return;
      openActionField(
        `${obj.label || obj.id} — ${option.text || `Option ${optionIndex + 1}`}`,
        option, 'actions',
        makeActionEditorOpts(data, () => {
          if (!Array.isArray(obj.options)) { obj.options = options; delete obj.actions; }
          markDirty(sceneId); hooks.renderProperties();
        })
      );
    });
  }
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

function addSequencesGroup(data, names) {
  const scriptId = state.selectedId;
  const group = document.createElement('div');
  group.className = 'prop-group';

  const openSequencesManager = () => openSequencesModal({
    sceneData: data,
    scriptId,
    modalKey: `${data.id}:sequences`,
    actionViewerContext: makeActionViewerContext(data),
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
    link.textContent = `${actions?.length || 0} action(s)`;
    link.addEventListener('click', () =>
      openActionField(`${data.id} — ${name}`, data.sequences, name,
        makeActionEditorOpts(data, () => {
          markDirty(scriptId);
          hooks.renderProperties();
        })
      )
    );

    row.append(keyEl, link);
    group.appendChild(row);
  }

  dom.propsContent.appendChild(group);
}

