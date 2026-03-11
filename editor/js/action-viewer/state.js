const openViewers = new Map();
const editableLists = new WeakMap();
const emptyDropZones = new WeakMap();

let dragState = null;
let dragAutoScrollRaf = 0;

export function getOpenViewer(key) {
  return openViewers.get(key) || null;
}

export function setOpenViewer(key, viewerState) {
  openViewers.set(key, viewerState);
}

export function deleteOpenViewer(key) {
  openViewers.delete(key);
}

export function registerEditableList(container, viewerState) {
  editableLists.set(container, viewerState);
}

export function getEditableListViewer(container) {
  return editableLists.get(container) || null;
}

export function registerEmptyDropZone(emptyEl, viewerState) {
  emptyDropZones.set(emptyEl, viewerState);
}

export function getEmptyDropZoneViewer(emptyEl) {
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
