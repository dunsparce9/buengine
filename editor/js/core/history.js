import { state, hooks } from './state.js';
import { captureWindowRefresh } from '../ui/floating-window.js';

const LIMIT = 100;
let workspace = null;
let current = new Map();
let saved = new Map();
let renames = new Map();
let undoStack = [];
let redoStack = [];
let pending = false;
let groupDepth = 0;

// Store values alongside their original containers. Restoring these containers
// preserves action-array and object identities, including cross-window moves.
function capture(value) {
  if (value === null || typeof value !== 'object') return { value };
  return {
    ref: value,
    entries: Object.entries(value).map(([key, child]) => [key, capture(child)]),
    length: Array.isArray(value) ? value.length : null,
  };
}

function restore(snapshot) {
  if (!snapshot.ref) return snapshot.value;
  const target = snapshot.ref;
  for (const key of Object.keys(target)) delete target[key];
  if (snapshot.length !== null) target.length = snapshot.length;
  for (const [key, child] of snapshot.entries) target[key] = restore(child);
  return target;
}

function scriptSnapshot(data) {
  return { tree: capture(data), json: JSON.stringify(data) };
}

export function resetHistory() {
  workspace = state.scripts;
  current = new Map(Object.entries(state.scripts).map(([id, data]) => [id, scriptSnapshot(data)]));
  saved = new Map([...current].filter(([id]) => !state.dirtySet.has(id))
    .map(([id, snapshot]) => [id, snapshot.json]));
  renames = new Map(state.pendingScriptRenames);
  undoStack = [];
  redoStack = [];
  pending = false;
  groupDepth = 0;
  hooks.updateHistory();
}

export function trackLoadedScript(id) {
  if (workspace !== state.scripts) resetHistory();
  const snapshot = scriptSnapshot(state.scripts[id]);
  current.set(id, snapshot);
  saved.set(id, snapshot.json);
}

function recordChange() {
  if (workspace !== state.scripts) resetHistory();
  if (pending) return;
  pending = true;
  queueMicrotask(flushHistory);
}

export function flushHistory() {
  if (!pending || groupDepth) return;
  pending = false;
  if (workspace !== state.scripts) { resetHistory(); return; }
  const changes = [];
  for (const id of new Set([...current.keys(), ...Object.keys(state.scripts)])) {
    const before = current.get(id);
    const data = state.scripts[id];
    if (before?.json === (data === undefined ? undefined : JSON.stringify(data))) continue;
    const after = data === undefined ? undefined : scriptSnapshot(data);
    changes.push({ id, before, after });
    if (after) current.set(id, after);
    else current.delete(id);
  }
  if (!changes.length) return;
  undoStack.push({ changes, beforeRenames: renames, afterRenames: new Map(state.pendingScriptRenames) });
  renames = new Map(state.pendingScriptRenames);
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack = [];
  hooks.updateHistory();
}

export function beginHistoryGroup() {
  flushHistory();
  groupDepth++;
  hooks.updateHistory();
}

export function endHistoryGroup() {
  if (groupDepth) groupDepth--;
  flushHistory();
  hooks.updateHistory();
}

export function noteSavedScript(id, json) {
  flushHistory();
  saved.set(id, JSON.stringify(JSON.parse(json)));
}

export function canUndo() { return !groupDepth && (pending || undoStack.length > 0); }
export function canRedo() { return !groupDepth && !pending && redoStack.length > 0; }

function apply(entry, direction) {
  const selectedOwner = state.scripts[state.selectedId];
  const selectedObject = selectedOwner?.objects?.find(obj => obj.id === state.selectedObjectId);
  const selectedItem = Array.isArray(selectedOwner) ? selectedOwner.find(item => item.id === state.selectedItem) : null;
  const owners = entry.changes.map(({ id }) => state.scripts[id]).filter(Boolean);
  const refreshWindows = captureWindowRefresh(owners);
  for (const change of entry.changes) {
    const snapshot = change[direction];
    if (snapshot) {
      state.scripts[change.id] = restore(snapshot.tree);
      current.set(change.id, snapshot);
    } else {
      delete state.scripts[change.id];
      current.delete(change.id);
    }
  }
  state.pendingScriptRenames = new Map(direction === 'before' ? entry.beforeRenames : entry.afterRenames);
  renames = new Map(state.pendingScriptRenames);
  state.manifest = state.scripts._game || null;
  for (const { id } of entry.changes) {
    const snapshot = current.get(id);
    if (snapshot && (snapshot.json !== saved.get(id) || state.pendingScriptRenames.has(id))) state.dirtySet.add(id);
    else state.dirtySet.delete(id);
  }
  // Follow a renamed scene by its model identity.
  if (selectedOwner && owners.includes(selectedOwner)) {
    const id = Object.keys(state.scripts).find(id => state.scripts[id] === selectedOwner);
    state.selectedId = id || null;
    state.selectedPath = id ? `${id}.json` : null;
  }
  if (state.selectedId && !state.scripts[state.selectedId]) {
    state.selectedId = null;
    state.selectedPath = null;
  }
  const selected = state.scripts[state.selectedId];
  if (selectedObject && selected?.objects?.includes(selectedObject)) state.selectedObjectId = selectedObject.id;
  if (selectedItem && Array.isArray(selected) && selected.includes(selectedItem)) state.selectedItem = selectedItem.id;
  if (!selected?.objects?.some(obj => obj.id === state.selectedObjectId)) state.selectedObjectId = null;
  if (!Array.isArray(selected) || !selected.some(item => item.id === state.selectedItem)) state.selectedItem = null;
  const restoredModels = new Set();
  const collectModels = snapshot => {
    if (!snapshot?.ref) return;
    restoredModels.add(snapshot.ref);
    for (const [, child] of snapshot.entries) collectModels(child);
  };
  for (const change of entry.changes) {
    collectModels(change.before?.tree);
    collectModels(change.after?.tree);
  }
  hooks.historyRestored(restoredModels);
  refreshWindows(entry.changes.map(({ id }) => state.scripts[id]).filter(Boolean));
  hooks.updateWindowTitle();
  hooks.renderFileList();
  hooks.renderViewport();
  hooks.renderProperties();
  hooks.updateHistory();
}

export function undo() {
  flushHistory();
  if (!canUndo()) return;
  const entry = undoStack.pop();
  redoStack.push(entry);
  apply(entry, 'before');
}

export function redo() {
  flushHistory();
  if (!canRedo()) return;
  const entry = redoStack.pop();
  undoStack.push(entry);
  apply(entry, 'after');
}

hooks.recordChange = recordChange;
