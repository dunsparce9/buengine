/**
 * Shared action type schema — single source of truth for both engine and editor.
 *
 * Each action type is defined once here with:
 *   - key:      the JSON property that identifies the type
 *   - icon:     Material Symbols icon name (for editor UI)
 *   - color:    accent colour (for editor UI)
 *   - label:    human-readable name
 *   - quip:     short editor-facing description
 *   - engine:   execution metadata used by ActionRunner dispatch
 *   - fields:   array of field descriptors (for editor forms / validation)
 *   - defaults: template object returned by createDefaultAction()
 *
 * Engine imports: detectType, ACTION_TYPES, getActionMeta (for reference)
 * Editor imports: ACTION_TYPES, detectType, createDefaultAction, getActionMeta
 */

export const UNKNOWN_ACTION_META = {
  icon: 'help_outline',
  color: '#7c6f64',
  label: 'Unknown',
  quip: 'do something useful',
  engine: { kind: 'noop' },
  fields: [],
};

/* ── Canonical type registry ───────────────────── */

export const ACTION_TYPES = {
  say: {
    icon: 'chat_bubble',
    color: '#83a598',
    label: 'Say',
    quip: 'show a dialogue box',
    engine: { kind: 'await', method: '_say', arg: 'action' },
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
    quip: 'offer a branching choice',
    engine: { kind: 'await', method: '_choice', arg: 'choice' },
    fields: [
      { key: 'choice.prompt', label: 'Prompt', type: 'string' },
    ],
    defaults: { choice: { prompt: '', options: [{ text: '', actions: [] }] } },
  },

  goto: {
    icon: 'exit_to_app',
    color: '#8ec07c',
    label: 'Go to',
    quip: 'jump to another scene',
    engine: { kind: 'goto', arg: 'goto' },
    fields: [
      { key: 'goto', label: 'Scene ID', type: 'string', required: true },
    ],
    defaults: { goto: '' },
  },

  set: {
    icon: 'flag',
    color: '#fabd2f',
    label: 'Set flag',
    quip: 'flip or count flags',
    engine: { kind: 'call', method: '_applySet', arg: 'set' },
    fields: [],
    defaults: { set: {} },
  },

  if: {
    icon: 'call_split',
    color: '#fe8019',
    label: 'If',
    quip: 'branch on a condition',
    engine: { kind: 'branch', condition: 'if', trueActions: 'then', falseActions: 'else' },
    fields: [
      { key: 'if', label: 'Condition', type: 'string', required: true },
    ],
    defaults: { if: '', then: [], else: [] },
  },

  loop: {
    icon: 'repeat',
    color: '#b16286',
    label: 'Loop',
    quip: 'repeat while a condition holds',
    engine: { kind: 'loop', condition: 'loop' },
    fields: [
      { key: 'loop', label: 'Condition', type: 'string', required: true },
    ],
    defaults: { loop: '', do: [] },
  },

  wait: {
    icon: 'hourglass_empty',
    color: '#a89984',
    label: 'Wait',
    quip: 'pause for a moment',
    engine: { kind: 'await', method: '_delay', arg: 'wait' },
    fields: [
      { key: 'wait', label: 'Duration (ms)', type: 'number', required: true, step: 100 },
    ],
    defaults: { wait: 500 },
  },

  emit: {
    icon: 'cell_tower',
    color: '#b8bb26',
    label: 'Emit',
    quip: 'broadcast an event',
    engine: { kind: 'emit', event: 'emit', payload: 'payload' },
    fields: [
      { key: 'emit', label: 'Event name', type: 'string', required: true },
    ],
    defaults: { emit: '' },
  },

  run: {
    icon: 'play_circle',
    color: '#83a598',
    label: 'Run',
    quip: 'run a definition',
    engine: { kind: 'run-definition', arg: 'run' },
    fields: [
      { key: 'run', label: 'Definition', type: 'string', required: true },
    ],
    defaults: { run: '' },
  },

  fork: {
    icon: 'fork_right',
    color: '#8ec07c',
    label: 'Fork',
    quip: 'start a background sequence',
    engine: { kind: 'fork', arg: 'fork' },
    fields: [
      { key: 'fork.run', label: 'Definition', type: 'string', required: true },
    ],
    defaults: { fork: { run: '' } },
  },

  exit: {
    icon: 'block',
    color: '#fb4934',
    label: 'Exit',
    quip: 'stop this action chain',
    engine: { kind: 'exit' },
    fields: [
      { key: 'exit', label: 'Exit', type: 'boolean', fixed: true },
    ],
    defaults: { exit: true },
  },

  show: {
    icon: 'visibility',
    color: '#d3869b',
    label: 'Show',
    quip: 'reveal something on screen',
    engine: { kind: 'await', method: '_show', arg: 'show' },
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

  text: {
    icon: 'title',
    color: '#fabd2f',
    label: 'Text',
    quip: 'place text on screen',
    engine: { kind: 'await', method: '_text', arg: 'text' },
    fields: [
      { key: 'text.id',                    label: 'ID',                type: 'string', required: true },
      { key: 'text.text',                  label: 'Text',              type: 'textarea', required: true },
      { key: 'text.color',                 label: 'Color',             type: 'color', defaultValue: '#ffffff' },
      { key: 'text.fontFamily',            label: 'Font family',       type: 'string' },
      { key: 'text.fontSize',              label: 'Font size',         type: 'string' },
      { key: 'text.backgroundColor',       label: 'Background color',  type: 'color' },
      { key: 'text.position.anchor',       label: 'Anchor',            type: 'select', options: ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] },
      { key: 'text.position.x',            label: 'X (% or grid)',     type: 'string' },
      { key: 'text.position.y',            label: 'Y (% or grid)',     type: 'string' },
      { key: 'text.effect.type',           label: 'Effect type',       type: 'select', options: ['', 'fade-in', 'fade-out'] },
      { key: 'text.effect.seconds',        label: 'Effect secs',       type: 'number', step: 0.5 },
      { key: 'text.effect.blocking',       label: 'Effect blocking',   type: 'boolean' },
    ],
    defaults: { text: { id: '', text: '', position: { anchor: 'top-left' } } },
  },

  hide: {
    icon: 'visibility_off',
    color: '#928374',
    label: 'Hide',
    quip: 'make something disappear',
    engine: { kind: 'await', method: '_hide', arg: 'hide' },
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
    quip: 'fade the whole scene',
    engine: { kind: 'await', method: '_effect', arg: 'effect' },
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
    quip: 'start a sound cue',
    engine: { kind: 'await', method: '_playsound', arg: 'playsound' },
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
    quip: 'cut the current sound',
    engine: { kind: 'await', method: '_stopsound', arg: 'stopsound' },
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
    quip: 'manage items',
    engine: { kind: 'call', method: '_applyItem', arg: 'item' },
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

/**
 * Resolve metadata for a type, falling back to shared unknown metadata.
 */
export function getActionMeta(type) {
  return ACTION_TYPES[type] || UNKNOWN_ACTION_META;
}
