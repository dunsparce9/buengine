export function createEditorToolbar({
  collapsed = false,
  onToggleCollapse = null,
  addLabel = 'Add',
  addTitle = 'Add',
  addAriaLabel = addTitle,
  onAdd = null,
  collapseTitleCollapsed = 'Expand',
  collapseTitleExpanded = 'Collapse',
  extraClassName = '',
} = {}) {
  const toolbar = document.createElement('div');
  toolbar.className = `editor-toolbar${extraClassName ? ` ${extraClassName}` : ''}`;

  const left = document.createElement('div');
  left.className = 'editor-toolbar-group editor-toolbar-group-left';

  if (typeof onToggleCollapse === 'function') {
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'editor-toolbar-btn editor-toolbar-btn-collapse';
    collapseBtn.type = 'button';
    collapseBtn.title = collapsed ? collapseTitleCollapsed : collapseTitleExpanded;
    collapseBtn.setAttribute('aria-label', collapsed ? collapseTitleCollapsed : collapseTitleExpanded);
    collapseBtn.innerHTML = `<span class="material-symbols-outlined">${collapsed ? 'unfold_more' : 'unfold_less'}</span>`;
    collapseBtn.addEventListener('click', onToggleCollapse);
    left.appendChild(collapseBtn);
  }

  const right = document.createElement('div');
  right.className = 'editor-toolbar-group editor-toolbar-group-right';

  if (typeof onAdd === 'function') {
    const addBtn = document.createElement('button');
    addBtn.className = 'editor-toolbar-btn editor-toolbar-btn-add';
    addBtn.type = 'button';
    addBtn.title = addTitle;
    addBtn.setAttribute('aria-label', addAriaLabel);
    addBtn.innerHTML =
      '<span class="material-symbols-outlined">add_circle</span>' +
      `<span class="editor-toolbar-btn-label">${addLabel}</span>`;
    addBtn.addEventListener('click', onAdd);
    right.appendChild(addBtn);
  }

  toolbar.append(left, right);
  return toolbar;
}
