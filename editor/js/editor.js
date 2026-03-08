/**
 * büegame editor — MVP
 *
 * Read-only level editor that loads scripts from ../scripts/,
 * shows a scene preview viewport, and a property inspector panel.
 */

const SCRIPTS_BASE = '../scripts';

/* ── DOM refs ──────────────────────────────────── */
const fileList       = document.getElementById('file-list');
const viewportWrap   = document.getElementById('viewport');
const viewport       = document.getElementById('viewport-scene');
const viewportEmpty  = document.getElementById('viewport-empty');
const propsContent   = document.getElementById('props-content');

/* ── State ─────────────────────────────────────── */
let manifest    = null;  // _game.json data
let scripts     = {};    // id → parsed JSON
let selectedId  = null;  // currently selected script id
let selectedHs  = null;  // currently selected hotspot id (within a scene)

/* ── Floating Window system ──────────────────── */

/**
 * Creates a draggable floating window.
 * @param {Object}  opts
 * @param {string}  opts.title
 * @param {string}  [opts.icon='']       Emoji or text icon
 * @param {number}  [opts.width=300]
 * @param {number}  [opts.height]        If omitted, auto-sized
 * @param {boolean} [opts.resizable=false]
 * @returns {{ el: HTMLElement, body: HTMLElement, open(): void, close(): void, destroy(): void }}
 */
function createFloatingWindow({ title, icon = '', width = 300, height, resizable = false }) {
  const el = document.createElement('div');
  el.className = 'fw hidden';
  el.style.width = `${width}px`;
  if (height != null) el.style.height = `${height}px`;

  // Header
  const header = document.createElement('div');
  header.className = 'fw-header';

  const iconEl = document.createElement('span');
  iconEl.className = 'fw-icon';
  iconEl.textContent = icon;

  const titleEl = document.createElement('span');
  titleEl.className = 'fw-title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'fw-close';
  closeBtn.textContent = '\u00d7';

  header.append(iconEl, titleEl, closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'fw-body';

  el.append(header, body);

  // -- Drag-to-move via header --
  let dragStartX, dragStartY, startLeft, startTop;

  function onDragMove(e) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    el.style.left = `${startLeft + dx}px`;
    el.style.top  = `${startTop + dy}px`;
  }
  function onDragUp() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  header.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn) return;
    e.preventDefault();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop  = rect.top;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
  });

  // -- Edge resize (if enabled) --
  if (resizable) {
    const edges = ['n','s','e','w','ne','nw','se','sw'];
    for (const edge of edges) {
      const handle = document.createElement('div');
      handle.className = `fw-resize fw-resize-${edge}`;
      el.appendChild(handle);

      let rsStartX, rsStartY, rsStartRect;

      function onResizeMove(e) {
        const dx = e.clientX - rsStartX;
        const dy = e.clientY - rsStartY;
        let { left, top, width: w, height: h } = rsStartRect;

        if (edge.includes('e')) w = Math.max(180, w + dx);
        if (edge.includes('w')) { w = Math.max(180, w - dx); left = rsStartRect.left + (rsStartRect.width - w); }
        if (edge.includes('s')) h = Math.max(100, h + dy);
        if (edge.includes('n')) { h = Math.max(100, h - dy); top = rsStartRect.top + (rsStartRect.height - h); }

        el.style.left   = `${left}px`;
        el.style.top    = `${top}px`;
        el.style.width  = `${w}px`;
        el.style.height = `${h}px`;
      }
      function onResizeUp() {
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rsStartX = e.clientX;
        rsStartY = e.clientY;
        rsStartRect = el.getBoundingClientRect();
        document.body.style.cursor = getComputedStyle(handle).cursor;
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeUp);
      });
    }
  }

  // -- Center on screen --
  function centerOnScreen() {
    const w = width;
    const h = height ?? el.offsetHeight;
    el.style.left = `${Math.max(0, (window.innerWidth  - w) / 2)}px`;
    el.style.top  = `${Math.max(0, (window.innerHeight - h) / 2)}px`;
  }

  function open() {
    el.classList.remove('hidden');
    centerOnScreen();
  }

  function close() {
    el.classList.add('hidden');
  }

  function destroy() {
    el.remove();
  }

  closeBtn.addEventListener('click', close);

  document.body.appendChild(el);

  return { el, body, open, close, destroy };
}

/* ── Script loading ────────────────────────────── */

async function loadScript(id) {
  if (scripts[id]) return scripts[id];
  const url = `${SCRIPTS_BASE}/${encodeURIComponent(id)}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const data = await res.json();
  scripts[id] = data;
  return data;
}

async function discoverScripts() {
  manifest = await loadScript('_game');

  // Use explicit scenes list if present, else fall back to startScene only
  const sceneIds = manifest.scenes
    ? manifest.scenes
    : [manifest.startScene || 'intro'];

  // Load all scenes in parallel
  await Promise.all(sceneIds.map(id => loadScript(id).catch(() => null)));
}

/* ── File panel ────────────────────────────────── */

function renderFileList() {
  fileList.innerHTML = '';

  // Always show _game first
  const ids = ['_game', ...Object.keys(scripts).filter(id => id !== '_game')];

  for (const id of ids) {
    const li = document.createElement('li');
    const icon = id === '_game' ? '⚙️' : '🌎️';
    li.innerHTML = `<span class="file-icon">${icon}</span>${id}.json`;
    li.dataset.id = id;

    if (id === selectedId) li.classList.add('selected');

    li.addEventListener('click', () => selectScript(id));
    fileList.appendChild(li);
  }
}

function selectScript(id) {
  selectedId = id;
  selectedHs = null;
  renderFileList();
  renderViewport();
  renderProperties();
}

/* ── Viewport ──────────────────────────────────── */

function renderViewport() {
  // Clear previous
  viewport.querySelectorAll('.editor-hotspot').forEach(el => el.remove());
  viewport.style.backgroundImage = '';
  viewport.style.backgroundColor = '#181825';
  viewport.style.width  = '';
  viewport.style.height = '';
  viewportEmpty.classList.toggle('hidden', !!selectedId);

  if (!selectedId || !scripts[selectedId]) return;
  const data = scripts[selectedId];

  // _game.json has no visual scene
  if (selectedId === '_game') {
    viewport.style.backgroundColor = '#11111b';
    return;
  }

  // Fit scene aspect ratio inside available container space
  const cols = data.grid?.cols ?? 16;
  const rows = data.grid?.rows ?? 9;
  const sceneRatio = cols / rows;
  const pad = 24; // matches #viewport padding
  const availW = viewportWrap.clientWidth  - pad * 2;
  const availH = viewportWrap.clientHeight - pad * 2;
  const containerRatio = availW / availH;

  let w, h;
  if (sceneRatio > containerRatio) {
    // scene is wider than container — fit to width
    w = availW;
    h = availW / sceneRatio;
  } else {
    // scene is taller — fit to height
    h = availH;
    w = availH * sceneRatio;
  }
  viewport.style.width  = `${Math.round(w)}px`;
  viewport.style.height = `${Math.round(h)}px`;

  // Background
  if (data.background) {
    viewport.style.backgroundImage = `url('${SCRIPTS_BASE}/${data.background.replace(/^scripts\//, '')}')`;
  } else {
    viewport.style.backgroundColor = data.backgroundColor || '#111';
  }

  // Hotspots
  if (Array.isArray(data.hotspots)) {
    for (const hs of data.hotspots) {
      const div = document.createElement('div');
      div.className = 'editor-hotspot';
      if (hs.id === selectedHs) div.classList.add('selected');

      // Position as percentage of viewport
      div.style.left   = `${(hs.x / cols) * 100}%`;
      div.style.top    = `${(hs.y / rows) * 100}%`;
      div.style.width  = `${(hs.w / cols) * 100}%`;
      div.style.height = `${(hs.h / rows) * 100}%`;

      const label = document.createElement('span');
      label.className = 'editor-hotspot-label';
      label.textContent = hs.id || hs.label || '';
      div.appendChild(label);

      div.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedHs = hs.id;
        renderViewport();
        renderProperties();
      });

      viewport.appendChild(div);
    }
  }

  // Click viewport background to deselect hotspot
  viewport.addEventListener('click', () => {
    if (selectedHs) {
      selectedHs = null;
      renderViewport();
      renderProperties();
    }
  }, { once: true });
}

/* ── Properties panel ──────────────────────────── */

function renderProperties() {
  propsContent.innerHTML = '';

  if (!selectedId || !scripts[selectedId]) {
    propsContent.innerHTML = '<div class="props-empty">Nothing selected</div>';
    return;
  }

  const data = scripts[selectedId];

  if (selectedId === '_game') {
    renderGameProps(data);
    return;
  }

  // A scene is selected
  if (selectedHs) {
    const hs = data.hotspots?.find(h => h.id === selectedHs);
    if (hs) {
      renderHotspotProps(hs);
      return;
    }
  }

  // Show scene-level properties
  renderSceneProps(data);
}

function renderGameProps(data) {
  addEditablePropGroup('Game manifest', [
    { key: 'title',      value: data.title      ?? '', onChange: v => { data.title = v; } },
    { key: 'subtitle',   value: data.subtitle   ?? '', onChange: v => { data.subtitle = v; } },
    { key: 'startScene', value: data.startScene ?? '', onChange: v => { data.startScene = v; } },
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
    addPropGroup('onEnter', [['actions', `${data.onEnter.length} action(s)`]]);
  }

  if (data.definitions) {
    const names = Object.keys(data.definitions);
    addPropGroup(`Definitions (${names.length})`,
      names.map(n => [n, `${data.definitions[n].length} action(s)`])
    );
  }
}

function renderHotspotProps(hs) {
  addPropGroup('Hotspot', [
    ['id',    hs.id    || '—'],
    ['label', hs.label || '—'],
  ]);
  addPropGroup('Position', [
    ['x', hs.x],
    ['y', hs.y],
    ['w', hs.w],
    ['h', hs.h],
  ]);
  if (hs.texture) {
    addPropGroup('Texture', [['src', hs.texture]]);
  }
  if (hs.actions?.length) {
    addPropGroup('Actions', [['count', `${hs.actions.length} action(s)`]]);
  }
}

/** Utility: append a labelled property group to the panel. */
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

  propsContent.appendChild(group);
}

/** Utility: append an editable property group to the panel. */
function addEditablePropGroup(title, fields) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = document.createElement('div');
  heading.className = 'prop-group-title';
  heading.textContent = title;
  group.appendChild(heading);

  for (const { key, value, onChange } of fields) {
    const row = document.createElement('div');
    row.className = 'prop-row';

    const label = document.createElement('span');
    label.className = 'prop-key';
    label.textContent = key;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));

    row.appendChild(label);
    row.appendChild(input);
    group.appendChild(row);
  }

  propsContent.appendChild(group);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* ── Menu bar ──────────────────────────────────── */

// Toggle dropdowns
for (const item of document.querySelectorAll('.menu-item')) {
  item.addEventListener('click', (e) => {
    // Close other menus
    document.querySelectorAll('.menu-item.open').forEach(m => {
      if (m !== item) m.classList.remove('open');
    });
    item.classList.toggle('open');
    e.stopPropagation();
  });

  // While any menu is open, hovering switches to this one
  item.addEventListener('mouseenter', () => {
    const anyOpen = document.querySelector('.menu-item.open');
    if (anyOpen && anyOpen !== item) {
      anyOpen.classList.remove('open');
      item.classList.add('open');
    }
  });
}

// Close menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
});

// Menu actions
for (const btn of document.querySelectorAll('.menu-action')) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
    handleMenuAction(btn.dataset.action);
  });
}

function handleMenuAction(action) {
  switch (action) {
    case 'export':
      exportCurrentJson();
      break;
    case 'exit':
      window.location.href = '../index.html';
      break;
    case 'about':
      aboutWindow.open();
      break;
    case 'run-in-tab':
      runInNewTab();
      break;
  }
}

/* ── Export ─────────────────────────────────────── */

function exportCurrentJson() {
  if (!selectedId || !scripts[selectedId]) return;
  const data = scripts[selectedId];
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${selectedId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── About window ────────────────────────────── */
const aboutWindow = createFloatingWindow({
  title: 'About',
  icon: 'ℹ️',
  width: 280,
  resizable: false,
});
{
  const c = aboutWindow.body;
  c.style.textAlign = 'center';
  c.style.padding = '20px 28px';
  const h = document.createElement('h2');
  h.textContent = 'b\u00fcegame editor';
  h.style.fontSize = '1.3rem';
  h.style.marginBottom = '6px';
  const p = document.createElement('p');
  p.textContent = 'v0.0';
  p.style.color = '#a89984';
  c.append(h, p);
}

/* ── Run in new tab ────────────────────────────── */
function runInNewTab() {
  const overrides = {};
  for (const [id, data] of Object.entries(scripts)) {
    overrides[id] = data;
  }
  localStorage.setItem('buegame_editor_preview', JSON.stringify(overrides));
  window.open('../index.html?preview', '_blank');
}

document.getElementById('run-btn').addEventListener('click', runInNewTab);

/* ── Panel resize handles ──────────────────────── */
(function initResizeHandles() {
  const layout    = document.getElementById('editor-layout');
  const handleL   = document.getElementById('resize-left');
  const handleR   = document.getElementById('resize-right');

  const MIN_W = 120;   // px — minimum panel width

  function getColWidths() {
    const style  = getComputedStyle(layout);
    const cols   = style.gridTemplateColumns.split(' ');
    // cols: [leftW, 5px, 1fr≈Npx, 5px, rightW]
    return {
      left:  parseFloat(cols[0]),
      right: parseFloat(cols[4]),
    };
  }

  function makeDragger(handle, side) {
    let startX, startW;

    function onMove(e) {
      const dx    = e.clientX - startX;
      const total = layout.getBoundingClientRect().width;
      let w;

      if (side === 'left') {
        w = Math.max(MIN_W, Math.min(startW + dx, total * 0.5));
        layout.style.setProperty('--left-w', `${w}px`);
      } else {
        w = Math.max(MIN_W, Math.min(startW - dx, total * 0.5));
        layout.style.setProperty('--right-w', `${w}px`);
      }
      renderViewport();
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = side === 'left' ? getColWidths().left : getColWidths().right;
      handle.classList.add('dragging');
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  makeDragger(handleL, 'left');
  makeDragger(handleR, 'right');
})();

/* ── Viewport resize ───────────────────────────── */
window.addEventListener('resize', () => renderViewport());

/* ── Boot ──────────────────────────────────────── */
(async () => {
  await discoverScripts();
  renderFileList();
  // Auto-select _game on launch
  selectScript('_game');
})();
