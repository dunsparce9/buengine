/**
 * Left-side file list panel — script discovery and selection.
 */

import { state, dom, hooks, escapeHtml } from './state.js';

export function renderFileList() {
  dom.fileList.innerHTML = '';

  const ids = ['_game', ...Object.keys(state.scripts).filter(id => id !== '_game')];

  for (const id of ids) {
    const li = document.createElement('li');
    const icon = id === '_game' ? '⚙️' : '🌎️';
    li.innerHTML = `<span class="file-icon">${icon}</span>${escapeHtml(id)}.json`;
    if (state.dirtySet.has(id)) li.classList.add('dirty');
    li.dataset.id = id;

    if (id === state.selectedId) li.classList.add('selected');

    li.addEventListener('click', () => selectScript(id));
    dom.fileList.appendChild(li);
  }
}

export function selectScript(id) {
  state.selectedId = id;
  state.selectedHs = null;
  renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
}
