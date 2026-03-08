/**
 * Right-side property inspector panel.
 */

import { state, dom, hooks, escapeHtml, markDirty } from './state.js';
import { openActionViewer } from './action-viewer.js';

export function renderProperties() {
  dom.propsContent.innerHTML = '';

  if (!state.selectedId || !state.scripts[state.selectedId]) {
    dom.propsContent.innerHTML = '<div class="props-empty">Nothing selected</div>';
    return;
  }

  const data = state.scripts[state.selectedId];

  if (state.selectedId === '_game') {
    renderGameProps(data);
    return;
  }

  if (state.selectedHs) {
    const hs = data.hotspots?.find(h => h.id === state.selectedHs);
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

  addPropGroup(`Hotspots (${data.hotspots?.length ?? 0})`,
    (data.hotspots || []).map(hs => [hs.id || '?', hs.label || '—'])
  );

  if (data.onEnter?.length) {
    addActionLinkGroup('onEnter', [['actions', data.onEnter.length]],
      () => openActionViewer(`${data.id} — onEnter`, data.onEnter)
    );
  }

  if (data.definitions) {
    const names = Object.keys(data.definitions);
    addDefinitionsGroup(data, names);
  }
}

function renderHotspotProps(hs) {
  const sceneId = state.selectedId;

  function setHsProp(prop, raw) {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) hs[prop] = v;
    markDirty(sceneId);
    hooks.renderViewport();
  }

  addPropGroup('Hotspot', [
    ['id',    hs.id    || '—'],
    ['label', hs.label || '—'],
  ]);
  addEditablePropGroup('Position', [
    { key: 'x', value: hs.x, type: 'number', step: 1, min: 0, onChange: v => setHsProp('x', v) },
    { key: 'y', value: hs.y, type: 'number', step: 1, min: 0, onChange: v => setHsProp('y', v) },
    { key: 'w', value: hs.w, type: 'number', step: 1, min: 1, onChange: v => setHsProp('w', v) },
    { key: 'h', value: hs.h, type: 'number', step: 1, min: 1, onChange: v => setHsProp('h', v) },
  ]);
  if (hs.texture) {
    addPropGroup('Texture', [['src', hs.texture]]);
  }
  if (hs.actions?.length) {
    addActionLinkGroup('Actions', [['count', hs.actions.length]],
      () => openActionViewer(`${hs.id} — actions`, hs.actions)
    );
  }
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
      openActionViewer(`${data.id} — ${name}`, actions)
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
