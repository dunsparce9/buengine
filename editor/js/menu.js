/**
 * Top menu bar — dropdown toggles and action dispatch.
 */

/**
 * Wire up menu dropdowns and dispatch actions to the given handlers.
 * @param {Object<string, Function>} handlers  Maps `data-action` names to callbacks.
 */
export function initMenu(handlers) {
  const items = [...document.querySelectorAll('.menu-item')];
  const actionButtons = [...document.querySelectorAll('.menu-action')];
  const closeMenus = () => {
    document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
  };
  const openMenu = (item) => {
    items.forEach(menuItem => {
      menuItem.classList.toggle('open', menuItem === item);
    });
  };
  const dispatchAction = (btn) => {
    if (!btn || btn.disabled) return;
    closeMenus();
    pointerMenuMode = false;
    const action = btn.dataset.action;
    if (handlers[action]) handlers[action]();
  };
  const setHoveredAction = (btn) => {
    actionButtons.forEach(actionBtn => {
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

  for (const btn of actionButtons) {
    btn.addEventListener('pointerenter', () => {
      if (!pointerPressed) return;
      setHoveredAction(btn.disabled ? null : btn);
    });

    btn.addEventListener('pointerleave', () => {
      if (!pointerPressed) return;
      setHoveredAction(null);
    });
  }

  document.addEventListener('pointerup', (e) => {
    if (pointerPressed && pointerMenuMode) {
      const actionButton = e.target.closest('.menu-action');
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

  // Menu actions
  for (const btn of actionButtons) {
    btn.addEventListener('click', (e) => {
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
}
