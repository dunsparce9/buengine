/**
 * Top menu bar — dropdown toggles and action dispatch.
 */

/**
 * Wire up menu dropdowns and dispatch actions to the given handlers.
 * @param {Object<string, Function>} handlers  Maps `data-action` names to callbacks.
 */
export function initMenu(handlers) {
  // Toggle dropdowns
  for (const item of document.querySelectorAll('.menu-item')) {
    item.addEventListener('click', (e) => {
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
      const action = btn.dataset.action;
      if (handlers[action]) handlers[action]();
    });
  }
}
