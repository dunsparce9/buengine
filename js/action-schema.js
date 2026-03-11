/**
 * Shared action type schema — single source of truth for both engine and editor.
 *
 * Each action type is defined once here with:
 *   - key:      the JSON property that identifies the type
 *   - icon:     Material Symbols icon name (for editor UI)
 *   - color:    accent colour (for editor UI)
 *   - label:    human-readable name
 *   - fields:   array of field descriptors (for editor forms / validation)
 *   - defaults: template object returned by createDefaultAction()
 *
 * Engine imports: detectType, ACTION_TYPES (for reference)
 * Editor imports: ACTION_TYPES, detectType, createDefaultAction
 */

/* ── Canonical type registry ───────────────────── */

export const ACTION_TYPES = {
  say: {
    icon: 'chat_bubble',
    color: '#83a598',
    label: 'Say',
    fields: [
      { key: 'say',     label: 'Text',      type: 'textarea', required: true },
      { key: 'speaker', label: 'Speaker',   type: 'string' },
      { key: 'accent',  label: 'Accent',    type: 'color', defaultValue: '#f0c040' },
      { key: 'delay',   label: 'Delay (s)', type: 'number', step: 0.5 },
    ],
    defaults: { say: '', speaker: '' },
  },

  choice: {
    icon: 'account_tree',
    color: '#d3869b',
    label: 'Choice',
    fields: [
      { key: 'choice.prompt', label: 'Prompt', type: 'string' },
    ],
    defaults: { choice: { prompt: '', options: [{ text: '', actions: [] }] } },
  },

  goto: {
    icon: 'exit_to_app',
    color: '#8ec07c',
    label: 'Go to',
    fields: [
      { key: 'goto', label: 'Scene ID', type: 'string', required: true },
    ],
    defaults: { goto: '' },
  },

  set: {
    icon: 'flag',
    color: '#fabd2f',
    label: 'Set flag',
    fields: [],
    defaults: { set: {} },
  },

  if: {
    icon: 'call_split',
    color: '#fe8019',
    label: 'If',
    fields: [
      { key: 'if', label: 'Condition', type: 'string', required: true },
    ],
    defaults: { if: '', then: [], else: [] },
  },

  wait: {
    icon: 'hourglass_empty',
    color: '#a89984',
    label: 'Wait',
    fields: [
      { key: 'wait', label: 'Duration (ms)', type: 'number', required: true, step: 100 },
    ],
    defaults: { wait: 500 },
  },

  emit: {
    icon: 'cell_tower',
    color: '#b8bb26',
    label: 'Emit',
    fields: [
      { key: 'emit', label: 'Event name', type: 'string', required: true },
    ],
    defaults: { emit: '' },
  },

  run: {
    icon: 'play_circle',
    color: '#83a598',
    label: 'Run',
    fields: [
      { key: 'run', label: 'Definition', type: 'string', required: true },
    ],
    defaults: { run: '' },
  },

  fork: {
    icon: 'fork_right',
    color: '#8ec07c',
    label: 'Fork',
    fields: [
      { key: 'fork.run', label: 'Definition', type: 'string', required: true },
    ],
    defaults: { fork: { run: '' } },
  },

  exit: {
    icon: 'block',
    color: '#fb4934',
    label: 'Exit',
    fields: [
      { key: 'exit', label: 'Exit', type: 'boolean', fixed: true },
    ],
    defaults: { exit: true },
  },

  show: {
    icon: 'visibility',
    color: '#d3869b',
    label: 'Show',
    fields: [
      { key: 'show.id',              label: 'ID',              type: 'string', required: true },
      { key: 'show.texture',         label: 'Texture',         type: 'string' },
      { key: 'show.layer',           label: 'Layer',           type: 'select', options: ['', 'overlay', 'background'] },
      { key: 'show.scaling',         label: 'Scaling',         type: 'select', options: ['', 'fill', 'contain', 'cover'] },
      { key: 'show.effect.type',     label: 'Effect type',     type: 'select', options: ['', 'fade-in', 'fade-out'] },
      { key: 'show.effect.seconds',  label: 'Effect secs',     type: 'number', step: 0.5 },
      { key: 'show.effect.blocking', label: 'Effect blocking', type: 'boolean' },
    ],
    defaults: { show: { id: '' } },
  },

  hide: {
    icon: 'visibility_off',
    color: '#928374',
    label: 'Hide',
    fields: [
      { key: 'hide.id',              label: 'ID',              type: 'string', required: true },
      { key: 'hide.effect.type',     label: 'Effect type',     type: 'select', options: ['', 'fade-in', 'fade-out'] },
      { key: 'hide.effect.seconds',  label: 'Effect secs',     type: 'number', step: 0.5 },
      { key: 'hide.effect.blocking', label: 'Effect blocking', type: 'boolean' },
    ],
    defaults: { hide: { id: '' } },
  },

  effect: {
    icon: 'auto_awesome',
    color: '#b8bb26',
    label: 'Effect',
    fields: [
      { key: 'effect.type',     label: 'Type',         type: 'select', options: ['', 'fade-in', 'fade-out'], required: true },
      { key: 'effect.seconds',  label: 'Duration (s)', type: 'number', step: 0.5 },
      { key: 'effect.blocking', label: 'Blocking',     type: 'boolean' },
    ],
    defaults: { effect: { type: 'fade-in', seconds: 1 } },
  },

  playsound: {
    icon: 'volume_up',
    color: '#83a598',
    label: 'Play sound',
    fields: [
      { key: 'playsound.id',       label: 'ID',       type: 'string', required: true },
      { key: 'playsound.path',     label: 'Path',     type: 'string' },
      { key: 'playsound.volume',   label: 'Volume',   type: 'number', step: 0.1, min: 0, max: 1 },
      { key: 'playsound.fade',     label: 'Fade (s)', type: 'number', step: 0.5 },
      { key: 'playsound.loop',     label: 'Loop',     type: 'boolean' },
      { key: 'playsound.blocking', label: 'Blocking', type: 'boolean' },
    ],
    defaults: { playsound: { id: '', path: '' } },
  },

  stopsound: {
    icon: 'volume_off',
    color: '#928374',
    label: 'Stop sound',
    fields: [
      { key: 'stopsound.id',       label: 'ID',       type: 'string', required: true },
      { key: 'stopsound.fade',     label: 'Fade (s)', type: 'number', step: 0.5 },
      { key: 'stopsound.blocking', label: 'Blocking', type: 'boolean' },
    ],
    defaults: { stopsound: { id: '' } },
  },

  item: {
    icon: 'inventory_2',
    color: '#d79921',
    label: 'Item',
    fields: [
      { key: 'item.id',  label: 'Item ID',  type: 'string', required: true },
      { key: 'item.qty', label: 'Quantity',  type: 'number', step: 1 },
    ],
    defaults: { item: { id: '', qty: 1 } },
  },
};

/* ── Detection order (matches engine's if/else chain exactly) ── */

const _TYPE_KEYS = Object.keys(ACTION_TYPES);

/**
 * Detect the action type from an action object.
 * Returns a key from ACTION_TYPES, or 'unknown'.
 */
export function detectType(action) {
  for (const key of _TYPE_KEYS) {
    if (action[key] != null) return key;
  }
  return 'unknown';
}

/**
 * Create a default action object for a given type.
 * Returns a deep clone so callers can mutate freely.
 */
export function createDefaultAction(type) {
  const def = ACTION_TYPES[type];
  return def ? structuredClone(def.defaults) : {};
}
