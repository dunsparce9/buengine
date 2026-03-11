/**
 * Shared confirmation dialog for in-editor destructive actions.
 */

import { createFloatingWindow } from './floating-window.js';

export function promptForConfirmation({
  title,
  icon,
  message,
  confirmLabel = 'OK',
  confirmClass = 'name-modal-btn-danger',
}) {
  return new Promise(resolve => {
    let resolved = false;
    const fw = createFloatingWindow({
      title,
      icon,
      iconClass: 'material-symbols-outlined',
      width: 360,
      resizable: false,
      modal: true,
    });

    const wrap = document.createElement('div');
    wrap.className = 'confirm-modal';
    wrap.tabIndex = -1;

    const messageEl = document.createElement('p');
    messageEl.className = 'confirm-modal-message';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'name-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'name-modal-btn name-modal-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      fw.destroy();
      resolve(false);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `name-modal-btn ${confirmClass}`;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      fw.destroy();
      resolve(true);
    });

    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
    });

    actions.append(cancelBtn, confirmBtn);
    wrap.append(messageEl, actions);
    fw.body.appendChild(wrap);
    fw.onClose(() => {
      if (resolved) return;
      resolved = true;
      resolve(false);
    });

    fw.open();
    requestAnimationFrame(() => confirmBtn.focus());
  });
}
