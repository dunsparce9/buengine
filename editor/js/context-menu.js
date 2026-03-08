/**
 * Shared context menu component.
 *
 * Usage:
 *   import { showContextMenu } from './context-menu.js';
 *   showContextMenu(e.clientX, e.clientY, [
 *     { icon: 'add', label: 'Create hotspot', onClick: () => { ... } },
 *     { separator: true },
 *     { icon: 'delete', label: 'Delete', danger: true, onClick: () => { ... } },
 *   ]);
 */

let _menu = null;
let _cleanup = null;

function ensureMenu() {
  if (_menu) return _menu;
  _menu = document.createElement('div');
  _menu.className = 'ctx-menu hidden';
  document.body.appendChild(_menu);
  return _menu;
}

function dismiss() {
  if (_menu) _menu.classList.add('hidden');
  if (_cleanup) { _cleanup(); _cleanup = null; }
}

/**
 * @param {number} x
 * @param {number} y
 * @param {Array<{icon?: string, label?: string, danger?: boolean, disabled?: boolean, onClick?: Function, separator?: boolean}>} items
 */
export function showContextMenu(x, y, items) {
  dismiss();
  const menu = ensureMenu();
  menu.innerHTML = '';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'ctx-item';
    if (item.danger) btn.classList.add('ctx-danger');
    if (item.disabled) btn.disabled = true;

    if (item.icon) {
      const ico = document.createElement('span');
      ico.className = 'material-symbols-outlined ctx-icon';
      ico.textContent = item.icon;
      btn.appendChild(ico);
    }

    const lbl = document.createElement('span');
    lbl.textContent = item.label || '';
    btn.appendChild(lbl);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
      if (item.onClick) item.onClick();
    });

    menu.appendChild(btn);
  }

  // Position — clamp to viewport
  menu.classList.remove('hidden');
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  menu.style.left = `${Math.min(x, window.innerWidth  - mw - 4)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight - mh - 4)}px`;

  // Close on next click anywhere
  function onClickAway(e) {
    if (menu.contains(e.target)) return;
    dismiss();
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') dismiss();
  }
  setTimeout(() => {
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKeyDown);
  }, 0);

  _cleanup = () => {
    document.removeEventListener('mousedown', onClickAway);
    document.removeEventListener('keydown', onKeyDown);
  };
}

export function hideContextMenu() {
  dismiss();
}
