/**
 * Shared action type schema — single source of truth for both engine and editor.
 *
 * Each action type is defined once here with:
 *   - key:      the JSON property that identifies the type
 *   - icon:     Material Symbols icon name (for editor UI)
 *   - color:    accent colour (for editor UI)
 *   - label:    human-readable name
 *   - quip:     short editor-facing description
 *   - fields:   array of field descriptors (for editor forms / validation)
 *   - defaults: template object returned by createDefaultAction()
 *   - summary:  (action, shorten) => one-line collapsed summary text
 *   - badges:   (action) => string[] header badges (e.g. "blocking", "loop")
 *
 * Engine imports: detectType (shared command detection order)
 * Editor imports: ACTION_TYPES, detectType, createDefaultAction, getActionMeta,
 *   summarizeAction, getBadges
 */

const targetsObject = action => action.animate?.target !== 'scene';

export const UNKNOWN_ACTION_META = {
  icon: 'help_outline',
  color: '#7c6f64',
  label: 'Unknown',
  quip: 'do something useful',
  fields: [],
};

/* ── Canonical type registry ───────────────────── */

export const ACTION_TYPES = {
  say: {
    icon: 'chat_bubble',
    color: '#83a598',
    label: 'Say',
    quip: 'show a dialogue box',
    fields: [
      { key: 'say',     label: 'Text',      type: 'textarea', required: true },
      { key: 'speaker', label: 'Speaker',   type: 'string' },
      { key: 'accent',  label: 'Accent',    type: 'color', defaultValue: '#f0c040' },
      { key: 'typewriterSpeed', label: 'Typewriter speed (ms)', type: 'number', min: 0, step: 5 },
      { key: 'delay',   label: 'Delay (s)', type: 'number', step: 0.5 },
    ],
    defaults: { say: '', speaker: '' },
    summary: (action, shorten) => shorten(action.say || '(empty dialogue)'),
    badges: (action) => {
      const out = [];
      if (action.delay) out.push(`delay ${action.delay}s`);
      if (action.typewriterSpeed != null) out.push(`type ${action.typewriterSpeed}ms`);
      return out;
    },
  },

  choice: {
    icon: 'account_tree',
    color: '#d3869b',
    label: 'Choice',
    quip: 'offer a branching choice',
    fields: [
      { key: 'choice.prompt', label: 'Prompt', type: 'string' },
    ],
    defaults: { choice: { prompt: '', options: [] } },
    summary: (action, shorten) => {
      const count = action.choice?.options?.length || 0;
      const prompt = shorten(action.choice?.prompt || '');
      return prompt ? `${prompt} | ${count} option(s)` : `${count} option(s)`;
    },
    badges: () => [],
  },

  goto: {
    icon: 'exit_to_app',
    color: '#8ec07c',
    label: 'Go to',
    quip: 'jump to another scene',
    fields: [
      { key: 'goto', label: 'Scene ID', type: 'string', required: true },
    ],
    defaults: { goto: '' },
    summary: (action) => action.goto || '(scene)',
    badges: () => [],
  },

  set: {
    icon: 'flag',
    color: '#fabd2f',
    label: 'Set flag',
    quip: 'flip or count flags',
    fields: [],
    defaults: { set: {} },
    summary: (action) => {
      const keys = Object.keys(action.set || {});
      return keys.length ? keys.join(', ') : 'No flags';
    },
    badges: () => [],
  },

  if: {
    icon: 'call_split',
    color: '#fe8019',
    label: 'If',
    quip: 'branch on a condition',
    fields: [
      { key: 'if', label: 'Condition', type: 'string', required: true },
    ],
    defaults: { if: '', then: [], else: [] },
    summary: (action) => `${action.if || '(condition)'} | then ${action.then?.length || 0} | else ${action.else?.length || 0}`,
    badges: () => [],
  },

  loop: {
    icon: 'repeat',
    color: '#b16286',
    label: 'Loop',
    quip: 'repeat while a condition holds',
    fields: [
      { key: 'loop', label: 'Condition', type: 'string', required: true },
    ],
    defaults: { loop: '', do: [] },
    summary: (action) => {
      const loopActions = Array.isArray(action.do) ? action.do : (Array.isArray(action.then) ? action.then : []);
      return `${action.loop || '(condition)'} | do ${loopActions.length}`;
    },
    badges: () => [],
  },

  wait: {
    icon: 'hourglass_empty',
    color: '#a89984',
    label: 'Wait',
    quip: 'pause for a moment',
    fields: [
      { key: 'wait', label: 'Duration (ms)', type: 'number', required: true, step: 100 },
    ],
    defaults: { wait: 500 },
    summary: (action) => `${action.wait ?? 0} ms`,
    badges: () => [],
  },

  emit: {
    icon: 'cell_tower',
    color: '#b8bb26',
    label: 'Emit',
    quip: 'broadcast an event',
    fields: [
      { key: 'emit', label: 'Event name', type: 'string', required: true },
    ],
    defaults: { emit: '' },
    summary: (action) => action.emit || '(event)',
    badges: () => [],
  },

  run: {
    icon: 'play_circle',
    color: '#83a598',
    label: 'Run',
    quip: 'run a sequence',
    fields: [
      { key: 'run', label: 'Sequence', type: 'string', required: true },
    ],
    defaults: { run: '' },
    summary: (action) => action.run || '(sequence)',
    badges: () => [],
  },

  fork: {
    icon: 'fork_right',
    color: '#8ec07c',
    label: 'Fork',
    quip: 'start a background sequence',
    fields: [
      { key: 'fork.run', label: 'Sequence', type: 'string', required: true },
    ],
    defaults: { fork: { run: '' } },
    summary: (action) => {
      if (typeof action.fork === 'string') return action.fork;
      if (typeof action.fork?.run === 'string') return action.fork.run;
      if (Array.isArray(action.fork?.actions)) return `${action.fork.actions.length} background action(s)`;
      return 'Background actions';
    },
    badges: () => [],
  },

  exit: {
    icon: 'block',
    color: '#fb4934',
    label: 'Exit',
    quip: 'stop this action chain',
    fields: [
      { key: 'exit', label: 'Exit', type: 'boolean', fixed: true },
    ],
    defaults: { exit: true },
    summary: () => 'Stop here',
    badges: () => [],
  },

  show: {
    icon: 'visibility',
    color: '#d3869b',
    label: 'Show',
    quip: 'reveal something on screen',
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
    summary: (action) => action.show?.id || action.show?.texture || String(action.show || '(target)'),
    badges: (action) => (action.show?.effect?.blocking ? ['blocking'] : []),
  },

  text: {
    icon: 'title',
    color: '#fabd2f',
    label: 'Text',
    quip: 'place text on screen',
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
    summary: (action, shorten) => {
      const id = action.text?.id;
      const text = shorten(action.text?.text || '(empty text)');
      return id ? `${id} | ${text}` : text;
    },
    badges: () => [],
  },

  hide: {
    icon: 'visibility_off',
    color: '#928374',
    label: 'Hide',
    quip: 'make something disappear',
    fields: [
      { key: 'hide.id',              label: 'ID',              type: 'string', required: true },
      { key: 'hide.effect.type',     label: 'Effect type',     type: 'select', options: ['', 'fade-in', 'fade-out'] },
      { key: 'hide.effect.seconds',  label: 'Effect secs',     type: 'number', step: 0.5 },
      { key: 'hide.effect.blocking', label: 'Effect blocking', type: 'boolean' },
    ],
    defaults: { hide: { id: '' } },
    summary: (action) => action.hide?.id || String(action.hide || '(target)'),
    badges: (action) => (action.hide?.effect?.blocking ? ['blocking'] : []),
  },

  animate: {
    icon: 'animation',
    color: '#8ec07c',
    label: 'Animate',
    quip: 'move, transform, or fade objects and scenes',
    tabs: [
      { group: 'Move', icon: 'open_with' },
      { group: 'Rotate', icon: 'rotate_right' },
      { group: 'Scale', icon: 'zoom_out_map' },
      { group: 'Resize', icon: 'aspect_ratio' },
      { group: 'Fade', icon: 'opacity' },
      { group: 'Timing', icon: 'schedule' },
    ],
    fields: [
      { key: 'animate.target', label: 'Target', type: 'select', options: ['object', 'scene'], optionLabels: { object: 'Object', scene: 'Scene' }, affectsLayout: true, group: 'Target' },
      { key: 'animate.id', label: 'ID (or this)', type: 'string', required: true, group: 'Target', visibleWhen: targetsObject },
      { key: 'animate.to.x', label: 'X (grid)', type: 'number', step: 0.1, group: 'Move', visibleWhen: targetsObject },
      { key: 'animate.to.y', label: 'Y (grid)', type: 'number', step: 0.1, group: 'Move', visibleWhen: targetsObject },
      { key: 'animate.to.rotation', label: 'Rotation (degrees)', type: 'number', step: 1, group: 'Rotate', visibleWhen: targetsObject },
      { key: 'animate.pivot', label: 'Pivot', type: 'select', options: ['', 'center', 'top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'], group: 'Rotate', visibleWhen: targetsObject },
      { key: 'animate.to.scale', label: 'Scale (multiplier)', type: 'number', step: 0.1, group: 'Scale', visibleWhen: targetsObject },
      { key: 'animate.to.scaleX', label: 'Scale X (override)', type: 'number', step: 0.1, group: 'Scale', visibleWhen: targetsObject },
      { key: 'animate.to.scaleY', label: 'Scale Y (override)', type: 'number', step: 0.1, group: 'Scale', visibleWhen: targetsObject },
      { key: 'animate.to.w', label: 'Width (grid)', type: 'number', min: 0, step: 0.1, group: 'Resize', visibleWhen: targetsObject },
      { key: 'animate.to.h', label: 'Height (grid)', type: 'number', min: 0, step: 0.1, group: 'Resize', visibleWhen: targetsObject },
      { key: 'animate.from.opacity', label: 'Starting opacity (optional)', type: 'number', min: 0, max: 1, step: 0.1, group: 'Fade' },
      { key: 'animate.to.opacity', label: 'Opacity (0–1)', type: 'number', min: 0, max: 1, step: 0.1, group: 'Fade' },
      { key: 'animate.seconds', label: 'Duration (s; 0 = instant)', type: 'number', min: 0, step: 0.1, group: 'Timing' },
      { key: 'animate.easing', label: 'Easing', type: 'select', options: ['', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'], group: 'Timing' },
      { key: 'animate.blocking', label: 'Blocking', type: 'boolean', group: 'Timing' },
    ],
    defaults: { animate: { target: 'object', id: 'this', to: {}, seconds: 1, easing: 'ease-in-out', blocking: true } },
    summary: (action) => {
      const data = action.animate || {};
      const scene = data.target === 'scene';
      const props = Object.entries(data.to || {}).filter(([key]) => !scene || key === 'opacity')
        .map(([key, value]) => `${key} ${value}${key === 'opacity' && data.from?.opacity != null ? ` (from ${data.from.opacity})` : ''}`).join(', ');
      return `${scene ? 'Scene' : data.id || '(target)'} → ${props || '(no changes)'} | ${data.seconds ?? 1}s`;
    },
    badges: (action) => action.animate?.blocking ? ['blocking'] : [],
  },

  playsound: {
    icon: 'volume_up',
    color: '#83a598',
    label: 'Play sound',
    quip: 'start a sound cue',
    fields: [
      { key: 'playsound.id',       label: 'ID',       type: 'string', required: true },
      { key: 'playsound.path',     label: 'Path',     type: 'string' },
      { key: 'playsound.volume',   label: 'Volume',   type: 'number', step: 0.1, min: 0, max: 1 },
      { key: 'playsound.fade',     label: 'Fade (s)', type: 'number', step: 0.5 },
      { key: 'playsound.loop',     label: 'Loop',     type: 'boolean' },
      { key: 'playsound.blocking', label: 'Blocking', type: 'boolean' },
    ],
    defaults: { playsound: { id: '', path: '' } },
    summary: (action) => action.playsound?.id || action.playsound?.path || '(sound)',
    badges: (action) => {
      const out = [];
      if (action.playsound?.loop) out.push('loop');
      if (action.playsound?.blocking) out.push('blocking');
      return out;
    },
  },

  stopsound: {
    icon: 'volume_off',
    color: '#928374',
    label: 'Stop sound',
    quip: 'cut the current sound',
    fields: [
      { key: 'stopsound.id',       label: 'ID',       type: 'string', required: true },
      { key: 'stopsound.fade',     label: 'Fade (s)', type: 'number', step: 0.5 },
      { key: 'stopsound.blocking', label: 'Blocking', type: 'boolean' },
    ],
    defaults: { stopsound: { id: '' } },
    summary: (action) => action.stopsound?.id || '(sound)',
    badges: (action) => (action.stopsound?.blocking ? ['blocking'] : []),
  },

  item: {
    icon: 'inventory_2',
    color: '#d79921',
    label: 'Item',
    quip: 'manage items',
    fields: [
      { key: 'item.id',  label: 'Item ID',  type: 'string', required: true },
      { key: 'item.qty', label: 'Quantity',  type: 'number', step: 1 },
    ],
    defaults: { item: { id: '', qty: 1 } },
    summary: (action) => `${action.item?.id || '(item)'} x ${action.item?.qty ?? 1}`,
    badges: () => [],
  },
};

/* ── Detection order (registry insertion order) ── */

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

/**
 * Default text shortener used when the caller omits `shortenText`
 * (mirrors the editor's shortenText: collapse whitespace, truncate to 52).
 */
function defaultShorten(text, max = 52) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

/**
 * One-line collapsed summary for an action card.
 * Single source of truth — the editor's renderers delegate here so adding
 * an action type only touches this file (+ the runner).
 * When a type carries no `summary`, falls back to its first schema field,
 * then to raw JSON.
 */
export function summarizeAction(action, type, shortenText) {
  const shorten = typeof shortenText === 'function' ? shortenText : defaultShorten;
  const meta = ACTION_TYPES[type];
  if (typeof meta?.summary === 'function') {
    try {
      return meta.summary(action, shorten) ?? '';
    } catch {
      return '';
    }
  }
  if (meta?.fields?.length) {
    try {
      const firstKey = meta.fields[0].key;
      const value = firstKey.split('.').reduce(
        (cur, part) => (cur != null && typeof cur === 'object' ? cur[part] : undefined),
        action
      );
      if (value != null && typeof value !== 'object') return shorten(String(value));
    } catch { /* fall through to JSON */ }
  }
  try {
    return shorten(JSON.stringify(action));
  } catch {
    return '';
  }
}

/**
 * Header badges for an action card (e.g. "blocking", "loop").
 * Single source of truth — the editor's renderers delegate here.
 */
export function getBadges(action, type) {
  const meta = ACTION_TYPES[type];
  if (typeof meta?.badges === 'function') {
    try {
      return meta.badges(action) || [];
    } catch {
      return [];
    }
  }
  return [];
}
