/**
 * Action Viewer — read-only visual display of action arrays.
 *
 * Opens a floating window and renders each action as a styled block
 * with distinct icons and accent colours per action type.
 */

import { createFloatingWindow } from './floating-window.js';
import { escapeHtml } from './state.js';

/* ── Action type metadata ──────────────────────── */

const ACTION_META = {
  say:       { icon: 'chat_bubble',         color: '#83a598', label: 'Say' },
  choice:    { icon: 'account_tree',        color: '#d3869b', label: 'Choice' },
  goto:      { icon: 'exit_to_app',         color: '#8ec07c', label: 'Go to' },
  set:       { icon: 'flag',                color: '#fabd2f', label: 'Set flag' },
  if:        { icon: 'call_split',          color: '#fe8019', label: 'If' },
  wait:      { icon: 'hourglass_empty',     color: '#a89984', label: 'Wait' },
  emit:      { icon: 'cell_tower',          color: '#b8bb26', label: 'Emit' },
  run:       { icon: 'play_circle',         color: '#83a598', label: 'Run' },
  exit:      { icon: 'block',               color: '#fb4934', label: 'Exit' },
  show:      { icon: 'visibility',          color: '#d3869b', label: 'Show' },
  hide:      { icon: 'visibility_off',      color: '#928374', label: 'Hide' },
  effect:    { icon: 'auto_awesome',        color: '#b8bb26', label: 'Effect' },
  playsound: { icon: 'volume_up',           color: '#83a598', label: 'Play sound' },
  stopsound: { icon: 'volume_off',          color: '#928374', label: 'Stop sound' },
  unknown:   { icon: 'help_outline',        color: '#7c6f64', label: 'Unknown' },
};

/* ── Public API ────────────────────────────────── */

/**
 * Open the action viewer with the given action array.
 * Each call creates a new floating window so multiple can be open at once.
 * @param {string} title  Header text (e.g. "hotspot: torch → actions")
 * @param {Array}  actions  The action array to display
 */
export function openActionViewer(title, actions) {
  const fw = createFloatingWindow({
    title: title || 'Actions',
    icon: 'list_alt',
    iconClass: 'material-symbols-outlined',
    width: 460,
    height: 520,
    resizable: true,
  });

  if (!actions || actions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'av-empty';
    empty.textContent = 'No actions';
    fw.body.appendChild(empty);
    fw.open();
    return;
  }

  const list = renderActionList(actions);
  fw.body.appendChild(list);
  fw.open();
}

/* ── Rendering ─────────────────────────────────── */

function renderActionList(actions) {
  const container = document.createElement('div');
  container.className = 'av-list';
  for (let i = 0; i < actions.length; i++) {
    container.appendChild(renderAction(actions[i], i));
  }
  return container;
}

function renderAction(action, index) {
  const type = detectType(action);
  const meta = ACTION_META[type] || ACTION_META.unknown;

  const block = document.createElement('div');
  block.className = `av-block av-block-${type}`;
  block.style.setProperty('--av-accent', meta.color);

  // Header row: index + icon + label
  const header = document.createElement('div');
  header.className = 'av-block-header';

  const idx = document.createElement('span');
  idx.className = 'av-index';
  idx.textContent = index + 1;

  const icon = document.createElement('span');
  icon.className = 'av-icon material-symbols-outlined';
  icon.style.color = meta.color;
  icon.textContent = meta.icon;

  const label = document.createElement('span');
  label.className = 'av-label';
  label.textContent = meta.label;

  header.append(idx, icon, label);

  // Badges (blocking, delay, loop, etc.)
  const badges = getBadges(action, type);
  for (const badge of badges) {
    const el = document.createElement('span');
    el.className = 'av-badge';
    el.textContent = badge;
    header.appendChild(el);
  }

  block.appendChild(header);

  // Body content (type-specific)
  const body = renderActionBody(action, type);
  if (body) {
    block.appendChild(body);
  }

  return block;
}

function renderActionBody(action, type) {
  switch (type) {
    case 'say':       return renderSay(action);
    case 'choice':    return renderChoice(action.choice);
    case 'goto':      return renderChip(action.goto, '#8ec07c');
    case 'set':       return renderSet(action.set);
    case 'if':        return renderIf(action);
    case 'wait':      return renderSimpleValue(`${action.wait} ms`);
    case 'emit':      return renderChip(action.emit, '#b8bb26');
    case 'run':       return renderChip(action.run, '#83a598');
    case 'exit':      return null;
    case 'show':      return renderOverlay(action.show);
    case 'hide':      return renderOverlay(action.hide);
    case 'effect':    return renderEffect(action.effect);
    case 'playsound': return renderSound(action.playsound);
    case 'stopsound': return renderSound(action.stopsound);
    default:          return renderRawJson(action);
  }
}

/* ── Type-specific renderers ───────────────────── */

function renderSay(action) {
  const body = document.createElement('div');
  body.className = 'av-body av-say-body';

  if (action.speaker) {
    const speaker = document.createElement('span');
    speaker.className = 'av-speaker';
    speaker.textContent = action.speaker;
    body.appendChild(speaker);
  }

  const text = document.createElement('div');
  text.className = 'av-say-text';
  text.textContent = action.say;
  body.appendChild(text);

  return body;
}

function renderChoice(choice) {
  const body = document.createElement('div');
  body.className = 'av-body av-choice-body';

  if (choice.prompt) {
    const prompt = document.createElement('div');
    prompt.className = 'av-choice-prompt';
    prompt.textContent = choice.prompt;
    body.appendChild(prompt);
  }

  if (Array.isArray(choice.options)) {
    for (let i = 0; i < choice.options.length; i++) {
      const opt = choice.options[i];
      const optBlock = document.createElement('div');
      optBlock.className = 'av-choice-option';

      const optHeader = document.createElement('div');
      optHeader.className = 'av-choice-option-header';
      optHeader.innerHTML =
        `<span class="av-choice-option-idx">${escapeHtml(String(i + 1))}</span>` +
        `<span class="av-choice-option-text">${escapeHtml(opt.text || '—')}</span>`;
      optBlock.appendChild(optHeader);

      if (Array.isArray(opt.actions) && opt.actions.length > 0) {
        const nested = renderActionList(opt.actions);
        nested.className += ' av-nested';
        optBlock.appendChild(nested);
      }

      body.appendChild(optBlock);
    }
  }

  return body;
}

function renderSet(setObj) {
  const body = document.createElement('div');
  body.className = 'av-body';

  for (const [flag, value] of Object.entries(setObj)) {
    const row = document.createElement('div');
    row.className = 'av-set-row';

    const name = document.createElement('span');
    name.className = 'av-flag-name';
    name.textContent = flag;

    const arrow = document.createElement('span');
    arrow.className = 'av-set-arrow';
    arrow.textContent = '←';

    const val = document.createElement('span');
    val.className = 'av-flag-value';
    if (typeof value === 'object' && value !== null) {
      // Clamped increment: { add: N, min?, max? }
      let desc = `add ${value.add ?? 0}`;
      if (value.min != null) desc += `, min ${value.min}`;
      if (value.max != null) desc += `, max ${value.max}`;
      val.textContent = desc;
    } else {
      val.textContent = String(value);
    }

    row.append(name, arrow, val);
    body.appendChild(row);
  }

  return body;
}

function renderIf(action) {
  const body = document.createElement('div');
  body.className = 'av-body av-if-body';

  const cond = document.createElement('div');
  cond.className = 'av-if-condition';
  cond.innerHTML = `<span class="av-if-keyword">if</span> <code>${escapeHtml(action.if)}</code>`;
  body.appendChild(cond);

  if (Array.isArray(action.then) && action.then.length > 0) {
    const thenLabel = document.createElement('div');
    thenLabel.className = 'av-branch-label av-branch-then';
    thenLabel.textContent = 'then';
    body.appendChild(thenLabel);

    const thenList = renderActionList(action.then);
    thenList.className += ' av-nested';
    body.appendChild(thenList);
  }

  if (Array.isArray(action.else) && action.else.length > 0) {
    const elseLabel = document.createElement('div');
    elseLabel.className = 'av-branch-label av-branch-else';
    elseLabel.textContent = 'else';
    body.appendChild(elseLabel);

    const elseList = renderActionList(action.else);
    elseList.className += ' av-nested';
    body.appendChild(elseList);
  }

  return body;
}

function renderOverlay(data) {
  const body = document.createElement('div');
  body.className = 'av-body';

  const props = [];
  if (data.id) props.push(['id', data.id]);
  if (data.texture) props.push(['texture', data.texture]);
  if (data.layer) props.push(['layer', data.layer]);
  if (data.scaling) props.push(['scaling', data.scaling]);

  for (const [k, v] of props) {
    const row = document.createElement('div');
    row.className = 'av-prop-row';
    row.innerHTML = `<span class="av-prop-key">${escapeHtml(k)}</span><span class="av-prop-val">${escapeHtml(String(v))}</span>`;
    body.appendChild(row);
  }

  if (data.effect) {
    const effectBlock = renderEffect(data.effect);
    if (effectBlock) {
      const effectLabel = document.createElement('div');
      effectLabel.className = 'av-sub-label';
      effectLabel.textContent = 'effect';
      body.append(effectLabel, effectBlock);
    }
  }

  return body;
}

function renderEffect(data) {
  const body = document.createElement('div');
  body.className = 'av-body';

  const props = [];
  if (data.type) props.push(['type', data.type]);
  if (data.seconds != null) props.push(['seconds', data.seconds]);

  for (const [k, v] of props) {
    const row = document.createElement('div');
    row.className = 'av-prop-row';
    row.innerHTML = `<span class="av-prop-key">${escapeHtml(k)}</span><span class="av-prop-val">${escapeHtml(String(v))}</span>`;
    body.appendChild(row);
  }

  return body;
}

function renderSound(data) {
  const body = document.createElement('div');
  body.className = 'av-body';

  const props = [];
  if (data.id) props.push(['id', data.id]);
  if (data.path) props.push(['path', data.path]);
  if (data.volume != null) props.push(['volume', data.volume]);
  if (data.fade != null) props.push(['fade', `${data.fade}s`]);
  if (data.loop != null) props.push(['loop', data.loop]);

  for (const [k, v] of props) {
    const row = document.createElement('div');
    row.className = 'av-prop-row';
    row.innerHTML = `<span class="av-prop-key">${escapeHtml(k)}</span><span class="av-prop-val">${escapeHtml(String(v))}</span>`;
    body.appendChild(row);
  }

  return body;
}

function renderChip(value, color) {
  const body = document.createElement('div');
  body.className = 'av-body';
  const chip = document.createElement('span');
  chip.className = 'av-chip';
  chip.style.setProperty('--chip-color', color);
  chip.textContent = value;
  body.appendChild(chip);
  return body;
}

function renderSimpleValue(text) {
  const body = document.createElement('div');
  body.className = 'av-body';
  const val = document.createElement('span');
  val.className = 'av-simple-val';
  val.textContent = text;
  body.appendChild(val);
  return body;
}

function renderRawJson(action) {
  const body = document.createElement('div');
  body.className = 'av-body';
  const pre = document.createElement('pre');
  pre.className = 'av-raw';
  pre.textContent = JSON.stringify(action, null, 2);
  body.appendChild(pre);
  return body;
}

/* ── Helpers ───────────────────────────────────── */

function detectType(action) {
  if (action.say != null)       return 'say';
  if (action.choice != null)    return 'choice';
  if (action.goto != null)      return 'goto';
  if (action.set != null)       return 'set';
  if (action.if != null)        return 'if';
  if (action.wait != null)      return 'wait';
  if (action.emit != null)      return 'emit';
  if (action.run != null)       return 'run';
  if (action.exit != null)      return 'exit';
  if (action.show != null)      return 'show';
  if (action.hide != null)      return 'hide';
  if (action.effect != null)    return 'effect';
  if (action.playsound != null) return 'playsound';
  if (action.stopsound != null) return 'stopsound';
  return 'unknown';
}

function getBadges(action, type) {
  const badges = [];

  if (type === 'say' && action.delay) {
    badges.push(`delay ${action.delay}s`);
  }

  if (type === 'effect') {
    if (action.effect?.blocking) badges.push('blocking');
  }

  if (type === 'playsound') {
    const d = action.playsound;
    if (d?.loop) badges.push('loop');
    if (d?.blocking) badges.push('blocking');
  }

  if (type === 'stopsound') {
    if (action.stopsound?.blocking) badges.push('blocking');
  }

  if (type === 'show' && action.show?.effect?.blocking) badges.push('blocking');
  if (type === 'hide' && action.hide?.effect?.blocking) badges.push('blocking');

  return badges;
}
