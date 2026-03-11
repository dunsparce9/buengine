import { state, hooks } from '../state.js';
import { createFloatingWindow } from '../floating-window.js';

const toastContainer = document.getElementById('toast-container');

const aboutWindow = createFloatingWindow({
  title: 'About',
  icon: 'info',
  iconClass: 'material-symbols-outlined',
  width: 280,
  resizable: false,
});

{
  const content = aboutWindow.body;
  content.style.textAlign = 'center';
  content.style.padding = '20px 28px';

  const heading = document.createElement('h2');
  heading.textContent = 'büegame editor';
  heading.style.fontSize = '1.3rem';
  heading.style.marginBottom = '6px';

  const version = document.createElement('p');
  version.textContent = 'v0.1';
  version.style.color = '#e1c8a4';

  const copyright = document.createElement('p');
  copyright.textContent = 'All rights reserved?';
  copyright.style.color = '#a89984';
  copyright.style.fontSize = '12px';

  content.append(heading, version, copyright);
}

export function hasLoadedGame() {
  return Boolean(state.manifest && Object.keys(state.scripts).length);
}

export function hasUnsavedChanges() {
  return state.dirtySet.size > 0;
}

export function updateMenuVisibility() {
  const loaded = hasLoadedGame();
  for (const el of document.querySelectorAll('[data-requires-game]')) {
    el.hidden = !loaded;
    if (!loaded && el.classList.contains('open')) el.classList.remove('open');
  }
}

export function isStandalonePWA() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function updateWindowTitle() {
  const appName = 'büegame editor';
  const context = state.selectedPath || state.rootHandle?.name || '';

  if (!context) {
    document.title = appName;
    return;
  }

  document.title = isStandalonePWA() ? context : `${appName} - ${context}`;
}

hooks.updateWindowTitle = updateWindowTitle;

export function updateRunLabels() {
  const label = isStandalonePWA() ? 'Run in new window' : 'Run in new tab';
  const menuRunBtn = document.querySelector('[data-action="run-in-tab"]');
  const topRunBtn = document.getElementById('run-btn');

  if (menuRunBtn) {
    const textNode = [...menuRunBtn.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
    );
    if (textNode) textNode.textContent = label;
  }

  if (topRunBtn) topRunBtn.title = label;
}

export function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove());
    setTimeout(() => el.remove(), 500);
  }, 2500);
}

hooks.toast = showToast;

export function openAboutWindow() {
  aboutWindow.open();
}
