/**
 * Top menu bar — dropdown toggles and action dispatch.
 */

/**
 * Wire up menu dropdowns and dispatch actions to the given handlers.
 * @param {Object<string, Function>} handlers  Maps `data-action` names to callbacks.
 */
export function initMenu(handlers) {
  const menuBar = document.getElementById('menu-bar');
  const items = [...document.querySelectorAll('.menu-item')];
  const submenuItems = [...document.querySelectorAll('.menu-submenu-item')];
  const getActionButtons = () => [...document.querySelectorAll('.menu-action[data-action]')];
  const closeMenus = () => {
    document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
    submenuItems.forEach(item => item.classList.remove('open'));
  };
  const openMenu = (item) => {
    items.forEach(menuItem => {
      menuItem.classList.toggle('open', menuItem === item);
    });
    submenuItems.forEach(submenuItem => submenuItem.classList.remove('open'));
  };
  const closeSubmenus = () => {
    submenuItems.forEach(item => item.classList.remove('open'));
  };
  const dispatchAction = (btn) => {
    if (!btn || btn.disabled) return;
    closeMenus();
    pointerMenuMode = false;
    const action = btn.dataset.action;
    if (handlers[action]) handlers[action](btn);
  };
  const setHoveredAction = (btn) => {
    getActionButtons().forEach(actionBtn => {
      actionBtn.classList.toggle('menu-hover', actionBtn === btn);
    });
  };

  let pointerMenuMode = false;
  let pointerPressed = false;
  let suppressedClickButton = null;

  for (const item of items) {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pointerMenuMode = true;
      pointerPressed = true;
      openMenu(item);
      setHoveredAction(null);
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

  menuBar.addEventListener('pointerover', (e) => {
    const btn = e.target.closest('.menu-action[data-action]');
    if (!btn || !pointerPressed) return;
    setHoveredAction(btn.disabled ? null : btn);
  });

  menuBar.addEventListener('pointerout', (e) => {
    if (!pointerPressed) return;
    const btn = e.target.closest('.menu-action[data-action]');
    if (!btn) return;
    if (btn.contains(e.relatedTarget)) return;
    setHoveredAction(null);
  });

  for (const item of submenuItems) {
    item.addEventListener('mouseenter', () => {
      if (!item.closest('.menu-item.open')) return;
      submenuItems.forEach(submenuItem => submenuItem.classList.toggle('open', submenuItem === item));
    });
  }

  menuBar.addEventListener('pointermove', (e) => {
    const openMenuItem = e.target.closest('.menu-item.open');
    if (!openMenuItem) return;

    const insideSubmenu = e.target.closest('.menu-submenu-item');
    if (insideSubmenu) return;

    const hoveredAction = e.target.closest('.menu-action');
    if (hoveredAction) closeSubmenus();
  });

  document.addEventListener('pointerup', (e) => {
    if (pointerPressed && pointerMenuMode) {
      const actionButton = e.target.closest('.menu-action[data-action]');
      if (actionButton) {
        suppressedClickButton = actionButton;
      }
      dispatchAction(actionButton);
    }
    pointerPressed = false;
    pointerMenuMode = false;
    setHoveredAction(null);
  });

  // Close menus on outside click/pointer interaction.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#menu-bar')) return;
    closeMenus();
    pointerPressed = false;
    pointerMenuMode = false;
    setHoveredAction(null);
  });

  menuBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.menu-action[data-action]');
    if (!btn) return;
    if (suppressedClickButton === btn) {
      suppressedClickButton = null;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    suppressedClickButton = null;
    e.stopPropagation();
    dispatchAction(btn);
  });
}
