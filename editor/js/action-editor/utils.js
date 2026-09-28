export function shortenText(text, max = 52) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

export function cloneAction(action) {
  if (typeof structuredClone === 'function') return structuredClone(action);
  return JSON.parse(JSON.stringify(action));
}

export function getNestedValue(obj, path) {
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

export function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  if (value === undefined) delete cur[parts[parts.length - 1]];
  else cur[parts[parts.length - 1]] = value;
}

export function notifyEditorChange(editorState) {
  editorState.opts.onChange?.();
}

export function adjustEditingIdxAfterRemove(editorState, idx) {
  if (editorState.editingIdx === idx) editorState.editingIdx = null;
  else if (editorState.editingIdx != null && editorState.editingIdx > idx) editorState.editingIdx--;
}

export function adjustEditingIdxAfterInsert(editorState, idx) {
  if (editorState.editingIdx != null && editorState.editingIdx >= idx) editorState.editingIdx++;
}
