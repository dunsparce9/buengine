/**
 * Draggable (optionally resizable) floating window component.
 */

let _zTop = 1000;
function bringToFront(el) {
  el.style.zIndex = ++_zTop;
}

/**
 * @param {Object}  opts
 * @param {string}  opts.title
 * @param {string}  [opts.icon='']
 * @param {string}  [opts.iconClass='']
 * @param {number}  [opts.width=300]
 * @param {number}  [opts.height]        If omitted, auto-sized
 * @param {boolean} [opts.resizable=false]
 * @returns {{ el: HTMLElement, body: HTMLElement, open(): void, close(): void, destroy(): void }}
 */
export function createFloatingWindow({ title, icon = '', iconClass = '', width = 300, height, resizable = false }) {
  const el = document.createElement('div');
  el.className = 'fw hidden';
  el.style.width = `${width}px`;
  if (height != null) el.style.height = `${height}px`;

  // Header
  const header = document.createElement('div');
  header.className = 'fw-header';

  const iconEl = document.createElement('span');
  iconEl.className = iconClass ? `fw-icon ${iconClass}` : 'fw-icon';
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

  // -- Bring to front on click --
  el.addEventListener('mousedown', () => bringToFront(el));

  // -- Drag-to-move via header --
  let dragStartX, dragStartY, startLeft, startTop;

  function onDragMove(e) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const newLeft = Math.min(Math.max(0, startLeft + dx), window.innerWidth  - el.offsetWidth);
    const newTop  = Math.min(Math.max(0, startTop  + dy), window.innerHeight - el.offsetHeight);
    el.style.left = `${newLeft}px`;
    el.style.top  = `${newTop}px`;
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

        // Clamp to viewport
        if (left < 0)                         { w = Math.max(180, w + left); left = 0; }
        if (top  < 0)                         { h = Math.max(100, h + top);  top  = 0; }
        if (left + w > window.innerWidth)  w = Math.max(180, window.innerWidth  - left);
        if (top  + h > window.innerHeight) h = Math.max(100, window.innerHeight - top);

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
    bringToFront(el);
  }

  let _onClose = null;

  function close() {
    el.classList.add('hidden');
    if (_onClose) _onClose();
  }

  function destroy() {
    el.remove();
    if (_onClose) _onClose();
  }

  function onClose(fn) {
    _onClose = fn;
  }

  closeBtn.addEventListener('click', close);

  document.body.appendChild(el);

  return { el, body, open, close, destroy, onClose };
}
