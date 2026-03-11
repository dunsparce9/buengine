/**
 * Top menu bar — dropdown toggles and action dispatch.
 */

/**
 * Wire up menu dropdowns and dispatch actions to the given handlers.
 * @param {Object<string, Function>} handlers  Maps `data-action` names to callbacks.
 */
export function initMenu(handlers) {
  const items = [...document.querySelectorAll('.menu-item')];
  const closeMenus = () => {
    document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
  };
  const openMenu = (item) => {
    items.forEach(menuItem => {
      menuItem.classList.toggle('open', menuItem === item);
    });
  };

  let pointerMenuMode = false;

  for (const item of items) {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pointerMenuMode = true;
      openMenu(item);
      e.preventDefault();
      e.stopPropagation();
    });

    // While a menu is open, moving across the bar should switch menus.
    item.addEventListener('mouseenter', () => {
      const anyOpen = document.querySelector('.menu-item.open');
      if (pointerMenuMode && anyOpen !== item) {
        openMenu(item);
        return;
      }
      if (anyOpen && anyOpen !== item) {
        openMenu(item);
      }
    });
  }

  document.addEventListener('pointerup', () => {
    pointerMenuMode = false;
  });

  // Close menus on outside click/pointer interaction.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#menu-bar')) return;
    closeMenus();
    pointerMenuMode = false;
  });

  // Menu actions
  for (const btn of document.querySelectorAll('.menu-action')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenus();
      pointerMenuMode = false;
      const action = btn.dataset.action;
      if (handlers[action]) handlers[action]();
    });
  }
}
