const openEditors = new Map();
const editableLists = new WeakMap();
const emptyDropZones = new WeakMap();

let dragState = null;
let dragAutoScrollRaf = 0;

export function getOpenEditor(key) {
  return openEditors.get(key) || null;
}

export function setOpenEditor(key, editorState) {
  openEditors.set(key, editorState);
}

export function deleteOpenEditor(key) {
  openEditors.delete(key);
}

export function registerEditableList(container, editorState) {
  editableLists.set(container, editorState);
}

export function getEditableListEditor(container) {
  return editableLists.get(container) || null;
}

export function registerEmptyDropZone(emptyEl, editorState) {
  emptyDropZones.set(emptyEl, editorState);
}

export function getEmptyDropZoneEditor(emptyEl) {
  return emptyDropZones.get(emptyEl) || null;
}

export function hasEditableList(container) {
  return editableLists.has(container);
}

export function hasEmptyDropZone(emptyEl) {
  return emptyDropZones.has(emptyEl);
}

export function getDragState() {
  return dragState;
}

export function setDragState(nextState) {
  dragState = nextState;
}

export function clearDragState() {
  dragState = null;
}

export function getDragAutoScrollRaf() {
  return dragAutoScrollRaf;
}

export function setDragAutoScrollRaf(rafId) {
  dragAutoScrollRaf = rafId;
}
