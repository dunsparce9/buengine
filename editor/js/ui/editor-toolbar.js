export function createEditorToolbar({
  collapsed = false,
  onToggleCollapse = null,
  onDeleteAll = null,
  deleteAllDisabled = false,
  onCopyAll = null,
  copyAllDisabled = false,
  onPaste = null,
  pasteDisabled = false,
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
    collapseBtn.dataset.tooltip = collapsed ? collapseTitleCollapsed : collapseTitleExpanded;
    collapseBtn.setAttribute('aria-label', collapsed ? collapseTitleCollapsed : collapseTitleExpanded);
    collapseBtn.innerHTML = `<span class="material-symbols-outlined">${collapsed ? 'unfold_more' : 'unfold_less'}</span>`;
    collapseBtn.addEventListener('click', onToggleCollapse);
    left.appendChild(collapseBtn);
  }

  for (const { handler, disabled, name, title, icon } of [
    { handler: onCopyAll, disabled: copyAllDisabled, name: 'copy', title: 'Copy all actions', icon: 'content_copy' },
    { handler: onPaste, disabled: pasteDisabled, name: 'paste', title: 'Paste actions', icon: 'content_paste' },
    { handler: onDeleteAll, disabled: deleteAllDisabled, name: 'delete', title: 'Delete all actions', icon: 'delete' },
  ]) {
    if (typeof handler !== 'function') continue;
    const button = document.createElement('button');
    button.className = `editor-toolbar-btn editor-toolbar-btn-${name}`;
    button.type = 'button';
    button.dataset.tooltip = title;
    button.setAttribute('aria-label', title);
    button.disabled = disabled;
    button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>`;
    button.addEventListener('click', handler);
    left.appendChild(button);
  }

  const right = document.createElement('div');
  right.className = 'editor-toolbar-group editor-toolbar-group-right';

  if (typeof onAdd === 'function') {
    const addBtn = document.createElement('button');
    addBtn.className = 'editor-toolbar-btn editor-toolbar-btn-add';
    addBtn.type = 'button';
    addBtn.dataset.tooltip = addTitle;
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
