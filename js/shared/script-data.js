/** Shared helpers for the JSON game format; no UI or loading dependencies. */
export function normalizeSceneSequences(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object') return data;
  if (data.sequences || !data.definitions) return data;
  data.sequences = data.definitions;
  delete data.definitions;
  return data;
}

/** Visit actions and their inline children, without expanding named sequences. */
export function walkActions(actions, visit) {
  if (!Array.isArray(actions)) return;
  for (const action of actions) {
    visit(action);
    walkActions(action.then, visit);
    walkActions(action.else, visit);
    walkActions(action.do, visit);
    walkActions(action.fork, visit);
    walkActions(action.fork?.actions, visit);
    for (const option of action.choice?.options || []) {
      walkActions(option.actions, visit);
    }
  }
}

/** Whether JSON data owns a particular object/array (identity, not equality). */
export function containsReference(data, target) {
  const pending = [data];
  const seen = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (value === target) return true;
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    pending.push(...Object.values(value));
  }
  return false;
}

/** Visit every action owned by a scene or inventory item table. */
export function walkScriptActions(data, visit) {
  if (!data || typeof data !== 'object') return;
  walkActions(data.onEnter, visit);
  for (const actions of Object.values(data.sequences || {})) walkActions(actions, visit);
  for (const entity of Array.isArray(data) ? data : (data.objects || [])) {
    walkActions(entity.actions, visit);
    walkActions(entity.onHover, visit);
    for (const option of entity.options || []) walkActions(option.actions, visit);
  }
}
