/**
 * Action Viewer & Editor — visual display and editing of action arrays.
 *
 * Opens a floating window and renders each action as a styled block
 * with distinct icons and accent colours per action type.
 * Supports inline editing, drag-to-reorder, add and delete.
 */

import { createFloatingWindow } from './floating-window.js';
import { escapeHtml } from './state.js';
import { ACTION_TYPES, detectType, createDefaultAction, getActionMeta } from '../../js/action-schema.js';

/* ── Action type metadata (derived from shared schema) ── */

/* ── Field schemas are now accessed via ACTION_TYPES[type].fields ── */

/* ── Open viewer registry (dedup by title) ─────── */

/** @type {Map<string, {key: string, fw: ReturnType<typeof createFloatingWindow>, actions: object[], opts: object, collapsed: boolean, editingIdx: number|null, rebuild: Function}>} */
const _openViewers = new Map();
let _dragState = null;
const _editableLists = new WeakMap();
const _emptyDropZones = new WeakMap();
let _dragAutoScrollRaf = 0;

function registerEditableList(container, viewerState) {
  _editableLists.set(container, viewerState);
}

function registerEmptyDropZone(emptyEl, viewerState) {
  _emptyDropZones.set(emptyEl, viewerState);
}

function beginActionDrag(e, block, viewerState) {
  if (e.button !== 0) return;
  const dragIdx = parseInt(block.dataset.index, 10);
  if (!Number.isInteger(dragIdx)) return;
  const header = block.querySelector('.av-block-header');
  if (!header) return;

  e.preventDefault();
  e.stopPropagation();

  cancelActionDrag();

  const headerRect = header.getBoundingClientRect();

  _dragState = {
    sourceViewer: viewerState,
    sourceIdx: dragIdx,
    sourceEl: block,
    previewEl: createActionDragPreview(header, headerRect),
    currentViewer: viewerState,
    dropIdx: dragIdx,
    indicator: null,
    emptyEl: null,
    clientX: e.clientX,
    clientY: e.clientY,
    previewOffsetX: e.clientX - headerRect.left,
    previewOffsetY: e.clientY - headerRect.top,
    scrollHost: block.closest('.fw-body'),
  };

  block.classList.add('av-dragging', 'av-drag-source-hidden');
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onActionDragMove);
  document.addEventListener('mouseup', onActionDragEnd);
  updateActionDragPreviewPosition(e.clientX, e.clientY);
  updateActionDragTarget(e.clientX, e.clientY);
  scheduleActionDragAutoScroll();
}

function onActionDragMove(e) {
  if (!_dragState) return;
  _dragState.clientX = e.clientX;
  _dragState.clientY = e.clientY;
  updateActionDragTarget(e.clientX, e.clientY);
}

function onActionDragEnd() {
  if (!_dragState) return;
  const { sourceViewer, sourceIdx, currentViewer, dropIdx } = _dragState;
  cancelActionDrag();
  if (currentViewer && Number.isInteger(dropIdx)) {
    moveActionBetweenViewers(sourceViewer, sourceIdx, currentViewer, dropIdx);
  }
}

function cancelActionDrag() {
  if (!_dragState) return;
  if (_dragState.sourceEl) _dragState.sourceEl.classList.remove('av-dragging', 'av-drag-source-hidden');
  if (_dragState.previewEl?.parentNode) _dragState.previewEl.remove();
  if (_dragState.indicator?.parentNode) _dragState.indicator.remove();
  if (_dragState.emptyEl) _dragState.emptyEl.classList.remove('av-drop-ready');
  _dragState.emptyEl = null;
  document.removeEventListener('mousemove', onActionDragMove);
  document.removeEventListener('mouseup', onActionDragEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  if (_dragAutoScrollRaf) {
    cancelAnimationFrame(_dragAutoScrollRaf);
    _dragAutoScrollRaf = 0;
  }
  _dragState = null;
}

function updateActionDragTarget(clientX, clientY) {
  if (!_dragState) return;
  updateActionDragPreviewPosition(clientX, clientY);
  const pointEl = document.elementFromPoint(clientX, clientY);
  const emptyEl = pointEl?.closest('.av-drop-empty.av-editable-empty');
  if (emptyEl && _emptyDropZones.has(emptyEl)) {
    const viewerState = _emptyDropZones.get(emptyEl);
    _dragState.currentViewer = viewerState;
    _dragState.dropIdx = 0;
    _dragState.scrollHost = emptyEl.closest('.fw-body');
    showActionDragEmptyState(emptyEl);
    return;
  }

  const container = pointEl?.closest('.av-editable-list');
  if (container && _editableLists.has(container)) {
    const viewerState = _editableLists.get(container);
    const dropIdx = getActionDragDropIndex(container, clientY, viewerState);
    _dragState.currentViewer = viewerState;
    _dragState.dropIdx = dropIdx;
    _dragState.scrollHost = container.closest('.fw-body');
    showActionDragIndicator(container, dropIdx);
  }
}

function getActionDragDropIndex(container, clientY, viewerState) {
  const blocks = Array.from(container.children).filter((child) =>
    child.classList?.contains('av-block') && child !== _dragState?.sourceEl
  );

  let targetIdx = viewerState.actions.length;
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    const blockIdx = parseInt(block.dataset.index, 10);
    if (!Number.isInteger(blockIdx)) continue;
    if (clientY < rect.top + rect.height / 2) return blockIdx;
    targetIdx = blockIdx + 1;
  }
  return targetIdx;
}

function showActionDragIndicator(container, dropIdx) {
  if (!_dragState) return;
  if (_dragState.emptyEl) {
    _dragState.emptyEl.classList.remove('av-drop-ready');
    _dragState.emptyEl = null;
  }
  if (!_dragState.indicator) {
    _dragState.indicator = document.createElement('div');
    _dragState.indicator.className = 'av-drop-indicator';
  }

  const blocks = Array.from(container.children).filter((child) =>
    child.classList?.contains('av-block') && child !== _dragState?.sourceEl
  );
  const beforeNode = blocks.find((block) => parseInt(block.dataset.index, 10) >= dropIdx) || null;
  container.insertBefore(_dragState.indicator, beforeNode);
}

function createActionDragPreview(header, rect) {
  const preview = header.cloneNode(true);
  preview.classList.add('av-drag-preview');
  preview.style.width = `${Math.ceil(rect.width)}px`;
  document.body.appendChild(preview);
  return preview;
}

function updateActionDragPreviewPosition(clientX, clientY) {
  if (!_dragState?.previewEl) return;
  _dragState.previewEl.style.left = `${Math.round(clientX - _dragState.previewOffsetX)}px`;
  _dragState.previewEl.style.top = `${Math.round(clientY - _dragState.previewOffsetY)}px`;
}

function showActionDragEmptyState(emptyEl) {
  if (!_dragState) return;
  if (_dragState.indicator?.parentNode) _dragState.indicator.remove();
  if (_dragState.emptyEl && _dragState.emptyEl !== emptyEl) {
    _dragState.emptyEl.classList.remove('av-drop-ready');
  }
  _dragState.emptyEl = emptyEl;
  emptyEl.classList.add('av-drop-ready');
}

function scheduleActionDragAutoScroll() {
  if (_dragAutoScrollRaf) return;

  const step = () => {
    _dragAutoScrollRaf = 0;
    if (!_dragState) return;

    const host = _dragState.scrollHost;
    if (host) {
      const rect = host.getBoundingClientRect();
      const zone = Math.max(36, Math.min(72, rect.height * 0.18));
      let delta = 0;
      if (_dragState.clientY < rect.top + zone) {
        delta = -Math.ceil((rect.top + zone - _dragState.clientY) / 8);
      } else if (_dragState.clientY > rect.bottom - zone) {
        delta = Math.ceil((_dragState.clientY - (rect.bottom - zone)) / 8);
      }

      if (delta !== 0) {
        host.scrollTop += delta;
        updateActionDragTarget(_dragState.clientX, _dragState.clientY);
      }
    }

    if (_dragState) scheduleActionDragAutoScroll();
  };

  _dragAutoScrollRaf = requestAnimationFrame(step);
}

/* ── Public API ────────────────────────────────── */

/**
 * Open the action viewer/editor for the given action array.
 * @param {string}   title    Header text
 * @param {Array}    actions  The action array (mutated in place on edits)
 * @param {Object}   [opts]
 * @param {Function} [opts.onChange]  Called after any mutation
 */
export function openActionViewer(title, actions, opts = {}) {
  const key = title || 'Actions';

  const existing = _openViewers.get(key);
  if (existing && !existing.fw.el.classList.contains('hidden')) {
    existing.fw.open();
    return;
  }

  const fw = createFloatingWindow({
    title: key,
    icon: 'list_alt',
    iconClass: 'material-symbols-outlined',
    width: 480,
    height: 540,
    resizable: true,
  });

  const viewerState = {
    key,
    fw,
    actions,
    opts,
    collapsed: false,
    editingIdx: null,
    rebuild() {
      fw.body.innerHTML = '';
      buildEditorContent(fw.body, viewerState);
    },
  };

  _openViewers.set(key, viewerState);
  fw.onClose(() => _openViewers.delete(key));

  viewerState.rebuild();
  fw.open();
}

/* ── View-mode body renderer ───────────────────── */

function renderActionBody(action, type, viewCtx = {}) {
  switch (type) {
    case 'say':       return renderSay(action);
    case 'choice':    return renderChoice(action.choice, viewCtx);
    case 'goto':      return renderGotoChip(action.goto, '#8ec07c', viewCtx);
    case 'set':       return renderSet(action.set);
    case 'if':        return renderIf(action, viewCtx);
    case 'loop':      return renderLoop(action, viewCtx);
    case 'wait':      return renderSimpleValue(`${action.wait} ms`);
    case 'emit':      return renderChip(action.emit, '#b8bb26');
    case 'run':       return renderRunChip(action.run, '#83a598', viewCtx);
    case 'fork':      return renderFork(action.fork, '#8ec07c', viewCtx);
    case 'exit':      return null;
    case 'show':      return renderOverlay(action.show);
    case 'text':      return renderTextAction(action.text);
    case 'hide':      return renderOverlay(action.hide);
    case 'effect':    return renderEffect(action.effect);
    case 'playsound': return renderSound(action.playsound);
    case 'stopsound': return renderSound(action.stopsound);
    case 'item':      return renderItem(action.item);
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
    if (action.accent) speaker.style.color = action.accent;
    speaker.textContent = action.speaker;
    body.appendChild(speaker);
  }

  const text = document.createElement('div');
  text.className = 'av-say-text';
  text.textContent = action.say;
  body.appendChild(text);

  return body;
}

function renderChoice(choice, viewCtx = {}) {
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
        const nested = buildReadOnlyList(opt.actions, viewCtx);
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

function renderIf(action, viewCtx = {}) {
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

    const thenList = buildReadOnlyList(action.then, viewCtx);
    thenList.className += ' av-nested';
    body.appendChild(thenList);
  }

  if (Array.isArray(action.else) && action.else.length > 0) {
    const elseLabel = document.createElement('div');
    elseLabel.className = 'av-branch-label av-branch-else';
    elseLabel.textContent = 'else';
    body.appendChild(elseLabel);

    const elseList = buildReadOnlyList(action.else, viewCtx);
    elseList.className += ' av-nested';
    body.appendChild(elseList);
  }

  return body;
}

function renderLoop(action, viewCtx = {}) {
  const body = document.createElement('div');
  body.className = 'av-body av-if-body';

  const cond = document.createElement('div');
  cond.className = 'av-if-condition';
  cond.innerHTML = `<span class="av-if-keyword">loop</span> <code>${escapeHtml(action.loop)}</code>`;
  body.appendChild(cond);

  const loopActions = Array.isArray(action.do) ? action.do : (Array.isArray(action.then) ? action.then : []);
  if (loopActions.length > 0) {
    const doLabel = document.createElement('div');
    doLabel.className = 'av-branch-label av-branch-loop';
    doLabel.textContent = 'do';
    body.appendChild(doLabel);

    const doList = buildReadOnlyList(loopActions, viewCtx);
    doList.className += ' av-nested';
    body.appendChild(doList);
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

function renderTextAction(data) {
  const body = document.createElement('div');
  body.className = 'av-body';

  if (data.text) {
    const preview = document.createElement('div');
    preview.className = 'av-say-text';
    preview.textContent = data.text;
    body.appendChild(preview);
  }

  const props = [];
  if (data.id) props.push(['id', data.id]);
  if (data.position?.anchor) props.push(['anchor', data.position.anchor]);
  if (data.position?.x != null && data.position.x !== '') props.push(['x', data.position.x]);
  if (data.position?.y != null && data.position.y !== '') props.push(['y', data.position.y]);
  if (data.color) props.push(['color', data.color]);
  if (data.fontFamily) props.push(['fontFamily', data.fontFamily]);
  if (data.fontSize) props.push(['fontSize', data.fontSize]);
  if (data.backgroundColor) props.push(['backgroundColor', data.backgroundColor]);

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

function renderItem(data) {
  const body = document.createElement('div');
  body.className = 'av-body';

  const row = document.createElement('div');
  row.className = 'av-set-row';

  const name = document.createElement('span');
  name.className = 'av-flag-name';
  name.textContent = data.id || '(no id)';

  const arrow = document.createElement('span');
  arrow.className = 'av-set-arrow';
  const qty = data.qty ?? 1;
  arrow.textContent = qty >= 0 ? '←' : '→';

  const val = document.createElement('span');
  val.className = 'av-flag-value';
  if (qty >= 0) {
    val.textContent = `+${qty}`;
    val.style.color = '#b8bb26';
  } else {
    val.textContent = String(qty);
    val.style.color = '#fb4934';
  }

  row.append(name, arrow, val);
  body.appendChild(row);

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


function renderGotoChip(sceneId, color, viewCtx = {}) {
  const body = document.createElement('div');
  body.className = 'av-body';

  const canFocusScene = typeof viewCtx.focusScene === 'function' && !!sceneId;
  const chipTag = canFocusScene ? 'button' : 'span';
  const chip = document.createElement(chipTag);
  chip.className = 'av-chip';
  chip.style.setProperty('--chip-color', color);
  chip.textContent = sceneId;

  if (canFocusScene) {
    chip.type = 'button';
    chip.title = `Focus scene: ${sceneId}`;
    chip.addEventListener('click', () => {
      viewCtx.focusScene(sceneId);
    });
  }

  body.appendChild(chip);
  return body;
}

function renderRunChip(defName, color, viewCtx = {}) {
  const body = document.createElement('div');
  body.className = 'av-body';

  const canOpenDefinition = !!(viewCtx.sceneData?.definitions && defName in viewCtx.sceneData.definitions);
  const chipTag = canOpenDefinition ? 'button' : 'span';
  const chip = document.createElement(chipTag);
  chip.className = 'av-chip';
  chip.style.setProperty('--chip-color', color);
  chip.textContent = defName;

  if (canOpenDefinition) {
    chip.type = 'button';
    chip.title = `Open definition: ${defName}`;
    chip.addEventListener('click', () => {
      const actions = viewCtx.sceneData.definitions[defName];
      openActionViewer(`${viewCtx.sceneId} — ${defName}`, actions, {
        onChange: () => viewCtx.markDirty?.(viewCtx.sceneId),
        sceneId: viewCtx.sceneId,
        sceneData: viewCtx.sceneData,
        markDirty: viewCtx.markDirty,
        focusScene: viewCtx.focusScene,
      });
    });
  }

  body.appendChild(chip);
  return body;
}

function renderFork(forkDef, color, viewCtx = {}) {
  if (typeof forkDef === 'string') {
    return renderRunChip(forkDef, color, viewCtx);
  }

  if (typeof forkDef?.run === 'string') {
    return renderRunChip(forkDef.run, color, viewCtx);
  }

  if (Array.isArray(forkDef?.actions)) {
    const body = document.createElement('div');
    body.className = 'av-body av-if-body';

    const label = document.createElement('div');
    label.className = 'av-branch-label av-branch-then';
    label.textContent = 'background';
    body.appendChild(label);

    const list = buildReadOnlyList(forkDef.actions, viewCtx);
    list.className += ' av-nested';
    body.appendChild(list);
    return body;
  }

  return renderSimpleValue('background');
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

function summarizeAction(action, type) {
  switch (type) {
    case 'say':
      return shortenText(action.say || '(empty dialogue)');
    case 'choice': {
      const count = action.choice?.options?.length || 0;
      return `${shortenText(action.choice?.prompt || 'Choice')} | ${count} option(s)`;
    }
    case 'goto':
      return action.goto || '(scene)';
    case 'set': {
      const keys = Object.keys(action.set || {});
      return keys.length ? keys.join(', ') : 'No flags';
    }
    case 'if':
      return `${action.if || '(condition)'} | then ${action.then?.length || 0} | else ${action.else?.length || 0}`;
    case 'loop': {
      const loopActions = Array.isArray(action.do) ? action.do : (Array.isArray(action.then) ? action.then : []);
      return `${action.loop || '(condition)'} | do ${loopActions.length}`;
    }
    case 'wait':
      return `${action.wait ?? 0} ms`;
    case 'emit':
      return action.emit || '(event)';
    case 'run':
      return action.run || '(definition)';
    case 'fork':
      if (typeof action.fork === 'string') return action.fork;
      if (typeof action.fork?.run === 'string') return action.fork.run;
      if (Array.isArray(action.fork?.actions)) return `${action.fork.actions.length} background action(s)`;
      return 'Background actions';
    case 'exit':
      return 'Stop here';
    case 'show':
      return action.show?.id || action.show?.texture || String(action.show || '(target)');
    case 'hide':
      return action.hide?.id || String(action.hide || '(target)');
    case 'effect':
      return `${action.effect?.type || 'effect'}${action.effect?.seconds != null ? ` ${action.effect.seconds}s` : ''}`;
    case 'playsound':
      return action.playsound?.id || action.playsound?.path || '(sound)';
    case 'stopsound':
      return action.stopsound?.id || '(sound)';
    case 'item':
      return `${action.item?.id || '(item)'} x ${action.item?.qty ?? 1}`;
    default:
      return shortenText(JSON.stringify(action));
  }
}

function shortenText(text, max = 52) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

function notifyViewerChange(viewerState) {
  viewerState.opts.onChange?.();
}

function adjustEditingIdxAfterRemove(viewerState, idx) {
  if (viewerState.editingIdx === idx) viewerState.editingIdx = null;
  else if (viewerState.editingIdx != null && viewerState.editingIdx > idx) viewerState.editingIdx--;
}

function adjustEditingIdxAfterInsert(viewerState, idx) {
  if (viewerState.editingIdx != null && viewerState.editingIdx >= idx) viewerState.editingIdx++;
}

function moveActionBetweenViewers(sourceViewer, sourceIdx, targetViewer, targetIdx) {
  if (!sourceViewer || !targetViewer) return;
  if (sourceIdx == null || sourceIdx < 0 || sourceIdx >= sourceViewer.actions.length) return;

  if (sourceViewer === targetViewer) {
    const [item] = sourceViewer.actions.splice(sourceIdx, 1);
    let insertIdx = targetIdx;
    if (sourceIdx < insertIdx) insertIdx--;
    sourceViewer.actions.splice(insertIdx, 0, item);
    if (sourceViewer.editingIdx === sourceIdx) {
      sourceViewer.editingIdx = insertIdx;
    } else if (sourceViewer.editingIdx != null) {
      if (sourceIdx < sourceViewer.editingIdx && insertIdx >= sourceViewer.editingIdx) sourceViewer.editingIdx--;
      else if (sourceIdx > sourceViewer.editingIdx && insertIdx <= sourceViewer.editingIdx) sourceViewer.editingIdx++;
    }
    notifyViewerChange(sourceViewer);
    sourceViewer.rebuild();
    return;
  }

  const [item] = sourceViewer.actions.splice(sourceIdx, 1);
  adjustEditingIdxAfterRemove(sourceViewer, sourceIdx);
  targetViewer.actions.splice(targetIdx, 0, item);
  adjustEditingIdxAfterInsert(targetViewer, targetIdx);
  notifyViewerChange(sourceViewer);
  notifyViewerChange(targetViewer);
  sourceViewer.rebuild();
  targetViewer.rebuild();
}

/* ── Editor content builder ────────────────────── */

function buildEditorContent(container, viewerState) {
  const toolbar = document.createElement('div');
  toolbar.className = 'av-toolbar';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'av-toolbar-btn av-toolbar-btn-collapse';
  collapseBtn.type = 'button';
  collapseBtn.title = viewerState.collapsed ? 'Expand actions' : 'Collapse actions';
  collapseBtn.setAttribute('aria-label', viewerState.collapsed ? 'Expand actions' : 'Collapse actions');
  collapseBtn.innerHTML = `<span class="material-symbols-outlined">${viewerState.collapsed ? 'unfold_more' : 'unfold_less'}</span>`;
  collapseBtn.addEventListener('click', () => {
    viewerState.collapsed = !viewerState.collapsed;
    viewerState.rebuild();
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'av-toolbar-btn av-toolbar-btn-add';
  addBtn.type = 'button';
  addBtn.title = 'Add action';
  addBtn.setAttribute('aria-label', 'Add action');
  addBtn.innerHTML = '<span class="material-symbols-outlined">add_circle</span>';
  addBtn.addEventListener('click', async () => {
    const type = await pickActionType(viewerState.fw);
    if (!type) return;
    viewerState.actions.push(createDefaultAction(type));
    notifyViewerChange(viewerState);
    viewerState.rebuild();
  });

  const left = document.createElement('div');
  left.className = 'av-toolbar-group av-toolbar-group-left';
  left.appendChild(collapseBtn);

  const right = document.createElement('div');
  right.className = 'av-toolbar-group av-toolbar-group-right';
  right.appendChild(addBtn);

  toolbar.append(left, right);
  container.appendChild(toolbar);

  if (viewerState.actions && viewerState.actions.length > 0) {
    const list = buildEditableList(viewerState);
    container.appendChild(list);
  } else {
    const empty = document.createElement('div');
    empty.className = 'av-empty av-drop-empty av-editable-empty';
    empty.textContent = _dragState ? 'Drop actions here' : 'No actions yet';
    setupEmptyDropZone(empty, viewerState);
    container.appendChild(empty);
  }
}

/* ── Editable list with drag-and-drop ──────────── */

function buildEditableList(viewerState) {
  const container = document.createElement('div');
  container.className = 'av-list av-editable-list';

  function cloneAction(action) {
    if (typeof structuredClone === 'function') return structuredClone(action);
    return JSON.parse(JSON.stringify(action));
  }

  function renderBlocks() {
    container.innerHTML = '';
    for (let i = 0; i < viewerState.actions.length; i++) {
      container.appendChild(buildEditableBlock(viewerState.actions[i], i, {
        viewerState,
        opts: viewerState.opts,
        onClone(idx) {
          viewerState.actions.splice(idx + 1, 0, cloneAction(viewerState.actions[idx]));
          adjustEditingIdxAfterInsert(viewerState, idx + 1);
          notifyViewerChange(viewerState);
          renderBlocks();
        },
        onEdit(idx) {
          if (viewerState.editingIdx === idx) {
            cleanAction(viewerState.actions[idx], detectType(viewerState.actions[idx]));
            viewerState.editingIdx = null;
          } else {
            if (viewerState.editingIdx != null) {
              cleanAction(viewerState.actions[viewerState.editingIdx], detectType(viewerState.actions[viewerState.editingIdx]));
            }
            viewerState.editingIdx = idx;
          }
          renderBlocks();
        },
        onDelete(idx) {
          viewerState.actions.splice(idx, 1);
          adjustEditingIdxAfterRemove(viewerState, idx);
          notifyViewerChange(viewerState);
          viewerState.rebuild();
        },
        onFieldChange() {
          notifyViewerChange(viewerState);
        },
      }));
    }
  }

  renderBlocks();
  setupDragAndDrop(container, viewerState);

  return container;
}

/* ── Single editable action block ──────────────── */

function buildEditableBlock(action, index, ctx) {
  const type = detectType(action);
  const meta = getActionMeta(type);
  const isEditing = ctx.viewerState.editingIdx === index;
  const isCollapsed = ctx.viewerState.collapsed && !isEditing;

  const block = document.createElement('div');
  block.className = `av-block av-block-${type}${isEditing ? ' av-editing' : ''}`;
  block.style.setProperty('--av-accent', meta.color);
  block.dataset.index = index;

  const header = document.createElement('div');
  header.className = 'av-block-header';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'av-drag-handle material-symbols-outlined';
  dragHandle.textContent = 'drag_indicator';
  dragHandle.addEventListener('mousedown', (e) => beginActionDrag(e, block, ctx.viewerState));

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

  header.append(dragHandle, idx, icon, label);

  if (isCollapsed) {
    const summary = document.createElement('span');
    summary.className = 'av-summary';
    summary.textContent = summarizeAction(action, type);
    header.appendChild(summary);
  }

  const badges = getBadges(action, type);
  for (const b of badges) {
    const el = document.createElement('span');
    el.className = 'av-badge';
    el.textContent = b;
    header.appendChild(el);
  }

  const cloneBtn = document.createElement('button');
  cloneBtn.className = 'av-header-btn av-clone-btn';
  cloneBtn.title = 'Clone';
  cloneBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
  cloneBtn.addEventListener('click', (e) => { e.stopPropagation(); ctx.onClone(index); });

  const editBtn = document.createElement('button');
  editBtn.className = 'av-header-btn av-edit-btn';
  editBtn.title = isEditing ? 'Done' : 'Edit';
  editBtn.innerHTML = `<span class="material-symbols-outlined">${isEditing ? 'check' : 'edit'}</span>`;
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); ctx.onEdit(index); });

  const delBtn = document.createElement('button');
  delBtn.className = 'av-header-btn av-delete-btn';
  delBtn.title = 'Delete';
  delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); ctx.onDelete(index); });

  header.append(cloneBtn, editBtn, delBtn);
  block.appendChild(header);

  if (isEditing) {
    block.appendChild(buildEditForm(action, type, ctx));
  } else if (!isCollapsed) {
    const body = renderActionBody(action, type, ctx.opts);
    if (body) block.appendChild(body);
  }

  return block;
}

/* ── Edit form builder ─────────────────────────── */

function buildEditForm(action, type, ctx) {
  const form = document.createElement('div');
  form.className = 'av-edit-form';

  const fields = ACTION_TYPES[type]?.fields;
  if (fields) {
    for (const field of fields) {
      form.appendChild(buildFieldRow(action, field, ctx));
    }
  }

  if (type === 'set')    form.appendChild(buildSetEditor(action, ctx));
  if (type === 'choice') form.appendChild(buildChoiceEditor(action, ctx));
  if (type === 'if')     form.appendChild(buildIfBranchesEditor(action, ctx));
  if (type === 'loop')   form.appendChild(buildLoopEditor(action, ctx));

  return form;
}

function buildFieldRow(action, field, ctx) {
  const row = document.createElement('div');
  row.className = 'av-field-row';

  const lbl = document.createElement('label');
  lbl.className = 'av-field-label';
  lbl.textContent = field.label;
  if (field.required) {
    const req = document.createElement('span');
    req.className = 'av-field-required';
    req.textContent = ' *';
    lbl.appendChild(req);
  }
  row.appendChild(lbl);

  const val = getNestedValue(action, field.key);

  switch (field.type) {
    case 'string': {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'av-field-input';
      inp.value = val ?? '';
      if (field.fixed) inp.readOnly = true;
      inp.addEventListener('input', () => {
        setNestedValue(action, field.key, inp.value || undefined);
        ctx.onFieldChange();
      });
      row.appendChild(inp);
      break;
    }
    case 'textarea': {
      const ta = document.createElement('textarea');
      ta.className = 'av-field-input av-field-textarea';
      ta.value = val ?? '';
      ta.rows = 3;
      ta.addEventListener('input', () => {
        setNestedValue(action, field.key, ta.value || undefined);
        ctx.onFieldChange();
      });
      row.appendChild(ta);
      break;
    }
    case 'number': {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'av-field-input av-field-number';
      inp.value = val ?? '';
      if (field.step != null) inp.step = field.step;
      if (field.min  != null) inp.min  = field.min;
      if (field.max  != null) inp.max  = field.max;
      inp.addEventListener('input', () => {
        const v = inp.value === '' ? undefined : parseFloat(inp.value);
        setNestedValue(action, field.key, v);
        ctx.onFieldChange();
      });
      row.appendChild(inp);
      break;
    }
    case 'boolean': {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'av-field-checkbox';
      cb.checked = !!val;
      if (field.fixed) cb.disabled = true;
      cb.addEventListener('change', () => {
        setNestedValue(action, field.key, cb.checked || undefined);
        ctx.onFieldChange();
      });
      row.appendChild(cb);
      break;
    }
    case 'select': {
      const sel = document.createElement('select');
      sel.className = 'av-field-input av-field-select';
      for (const opt of (field.options || [])) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt || '(none)';
        if (opt === (val ?? '')) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        setNestedValue(action, field.key, sel.value || undefined);
        ctx.onFieldChange();
      });
      row.appendChild(sel);
      break;
    }
    case 'color': {
      const wrap = document.createElement('div');
      wrap.className = 'av-color-picker';

      const swatch = document.createElement('div');
      swatch.className = 'av-color-swatch';
      const currentColor = val || field.defaultValue || '#ffffff';
      swatch.style.backgroundColor = currentColor;

      const colorInp = document.createElement('input');
      colorInp.type = 'color';
      colorInp.className = 'av-color-native';
      colorInp.value = currentColor;

      const hexInp = document.createElement('input');
      hexInp.type = 'text';
      hexInp.className = 'av-field-input av-color-hex';
      hexInp.value = val || '';
      hexInp.placeholder = field.defaultValue || '#ffffff';
      hexInp.maxLength = 7;

      swatch.addEventListener('click', () => colorInp.click());

      colorInp.addEventListener('input', () => {
        const c = colorInp.value;
        swatch.style.backgroundColor = c;
        hexInp.value = c;
        const store = c === field.defaultValue ? undefined : c;
        setNestedValue(action, field.key, store);
        ctx.onFieldChange();
      });

      hexInp.addEventListener('change', () => {
        const raw = hexInp.value.trim();
        if (raw === '') {
          swatch.style.backgroundColor = field.defaultValue || '#ffffff';
          setNestedValue(action, field.key, undefined);
          ctx.onFieldChange();
          return;
        }
        if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
          swatch.style.backgroundColor = raw;
          colorInp.value = raw;
          const store = raw === field.defaultValue ? undefined : raw;
          setNestedValue(action, field.key, store);
          ctx.onFieldChange();
        } else {
          hexInp.value = val || '';
        }
      });

      wrap.append(swatch, colorInp, hexInp);
      row.appendChild(wrap);
      break;
    }
  }

  return row;
}

/* ── Set flag editor ───────────────────────────── */

function buildSetEditor(action, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'av-set-editor';
  if (!action.set || typeof action.set !== 'object') action.set = {};

  function render() {
    wrap.innerHTML = '';
    for (const [flag, value] of Object.entries(action.set)) {
      const row = document.createElement('div');
      row.className = 'av-set-edit-row';

      const nameInp = document.createElement('input');
      nameInp.type = 'text';
      nameInp.className = 'av-field-input';
      nameInp.value = flag;
      nameInp.placeholder = 'flag name';

      const valInp = document.createElement('input');
      valInp.type = 'text';
      valInp.className = 'av-field-input';
      valInp.value = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
      valInp.placeholder = 'value';

      const rmBtn = document.createElement('button');
      rmBtn.className = 'av-mini-btn av-mini-btn-danger';
      rmBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
      rmBtn.title = 'Remove';

      nameInp.addEventListener('change', () => {
        const nk = nameInp.value.trim();
        if (!nk || nk === flag) return;
        const v = action.set[flag];
        delete action.set[flag];
        action.set[nk] = v;
        ctx.onFieldChange();
        render();
      });

      valInp.addEventListener('change', () => {
        action.set[nameInp.value || flag] = parseSetValue(valInp.value);
        ctx.onFieldChange();
      });

      rmBtn.addEventListener('click', () => {
        delete action.set[flag];
        ctx.onFieldChange();
        render();
      });

      row.append(nameInp, valInp, rmBtn);
      wrap.appendChild(row);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'av-mini-btn';
    addBtn.innerHTML = '<span class="material-symbols-outlined">add</span> Add flag';
    addBtn.addEventListener('click', () => {
      let n = 'new_flag'; let i = 1;
      while (action.set[n]) n = `new_flag_${i++}`;
      action.set[n] = true;
      ctx.onFieldChange();
      render();
    });
    wrap.appendChild(addBtn);
  }

  render();
  return wrap;
}

function parseSetValue(raw) {
  const s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^[+-]\d+$/.test(s)) return s;
  const n = Number(s);
  if (!isNaN(n) && s !== '') return n;
  try { return JSON.parse(s); } catch { /* ignore */ }
  return s;
}

/* ── Choice editor ─────────────────────────────── */

function buildChoiceEditor(action, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'av-choice-editor';
  if (!action.choice) action.choice = { prompt: '', options: [] };
  if (!action.choice.options) action.choice.options = [];

  function render() {
    wrap.innerHTML = '';
    const choiceOpts = action.choice.options;
    for (let i = 0; i < choiceOpts.length; i++) {
      const opt = choiceOpts[i];
      const row = document.createElement('div');
      row.className = 'av-choice-edit-option';

      const hdr = document.createElement('div');
      hdr.className = 'av-choice-edit-option-header';

      const badge = document.createElement('span');
      badge.className = 'av-choice-option-idx';
      badge.textContent = i + 1;

      const textInp = document.createElement('input');
      textInp.type = 'text';
      textInp.className = 'av-field-input';
      textInp.value = opt.text || '';
      textInp.placeholder = 'Option text';
      textInp.addEventListener('input', () => {
        opt.text = textInp.value;
        ctx.onFieldChange();
      });

      const actBtn = document.createElement('button');
      actBtn.className = 'av-mini-btn';
      actBtn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${opt.actions?.length || 0}`;
      actBtn.title = 'Edit option actions';
      actBtn.addEventListener('click', () => {
        if (!opt.actions) opt.actions = [];
        openActionViewer(`Option ${i + 1}: ${opt.text || '\u2026'}`, opt.actions, {
          onChange() {
            ctx.onFieldChange();
            actBtn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${opt.actions.length}`;
          },
          sceneId: ctx.opts.sceneId,
          sceneData: ctx.opts.sceneData,
          markDirty: ctx.opts.markDirty,
          focusScene: ctx.opts.focusScene,
        });
      });

      const rmBtn = document.createElement('button');
      rmBtn.className = 'av-mini-btn av-mini-btn-danger';
      rmBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
      rmBtn.addEventListener('click', () => {
        choiceOpts.splice(i, 1);
        ctx.onFieldChange();
        render();
      });

      hdr.append(badge, textInp, actBtn, rmBtn);
      row.appendChild(hdr);
      wrap.appendChild(row);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'av-mini-btn';
    addBtn.innerHTML = '<span class="material-symbols-outlined">add</span> Add option';
    addBtn.addEventListener('click', () => {
      choiceOpts.push({ text: '', actions: [] });
      ctx.onFieldChange();
      render();
    });
    wrap.appendChild(addBtn);
  }

  render();
  return wrap;
}

/* ── If branches editor ────────────────────────── */

function buildIfBranchesEditor(action, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'av-if-editor';

  function branchRow(label, cssClass, key) {
    const row = document.createElement('div');
    row.className = 'av-branch-edit-row';
    const lbl = document.createElement('span');
    lbl.className = `av-branch-label ${cssClass}`;
    lbl.textContent = label;
    const btn = document.createElement('button');
    btn.className = 'av-mini-btn';
    btn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${action[key]?.length || 0} action(s)`;
    btn.addEventListener('click', () => {
      if (!action[key]) action[key] = [];
      openActionViewer(label, action[key], {
        onChange() {
          ctx.onFieldChange();
          btn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${action[key].length} action(s)`;
        },
        sceneId: ctx.opts.sceneId,
        sceneData: ctx.opts.sceneData,
        markDirty: ctx.opts.markDirty,
        focusScene: ctx.opts.focusScene,
      });
    });
    row.append(lbl, btn);
    return row;
  }

  wrap.appendChild(branchRow('then', 'av-branch-then', 'then'));
  wrap.appendChild(branchRow('else', 'av-branch-else', 'else'));
  return wrap;
}

function buildLoopEditor(action, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'av-if-editor';

  const row = document.createElement('div');
  row.className = 'av-branch-edit-row';

  const lbl = document.createElement('span');
  lbl.className = 'av-branch-label av-branch-loop';
  lbl.textContent = 'do';

  const btn = document.createElement('button');
  btn.className = 'av-mini-btn';
  const getLoopActions = () => {
    if (Array.isArray(action.do)) return action.do;
    if (Array.isArray(action.then)) return action.then;
    action.do = [];
    return action.do;
  };
  const renderLabel = () => {
    btn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${getLoopActions().length} action(s)`;
  };
  renderLabel();
  btn.addEventListener('click', () => {
    const loopActions = getLoopActions();
    openActionViewer('do', loopActions, {
      onChange() {
        ctx.onFieldChange();
        renderLabel();
      },
      sceneId: ctx.opts.sceneId,
      sceneData: ctx.opts.sceneData,
      markDirty: ctx.opts.markDirty,
      focusScene: ctx.opts.focusScene,
    });
  });

  row.append(lbl, btn);
  wrap.appendChild(row);
  return wrap;
}

/* ── Type picker modal ─────────────────────────── */

function pickActionType(parentFw) {
  return new Promise(resolve => {
    let resolved = false;
    const fw = createFloatingWindow({
      title: 'Add Action',
      icon: 'add_circle',
      iconClass: 'material-symbols-outlined',
      width: 420,
      height: 480,
      resizable: false,
      modal: true,
      closeOnBackdrop: true,
      parent: parentFw,
    });

    const list = document.createElement('div');
    list.className = 'av-type-list';

    for (const [type, meta] of Object.entries(ACTION_TYPES)) {
      const row = document.createElement('button');
      row.className = 'av-type-row';
      row.style.setProperty('--av-accent', meta.color);

      const ci = document.createElement('span');
      ci.className = 'av-type-row-icon material-symbols-outlined';
      ci.style.color = meta.color;
      ci.textContent = meta.icon;

      const cl = document.createElement('span');
      cl.className = 'av-type-row-label';
      cl.textContent = meta.label;

      const quip = document.createElement('span');
      quip.className = 'av-type-row-quip';
      quip.textContent = meta.quip;

      row.append(ci, cl, quip);
      row.addEventListener('click', () => {
        if (resolved) return;
        resolved = true;
        fw.destroy();
        resolve(type);
      });
      list.appendChild(row);
    }

    fw.body.style.padding = '12px';
    fw.body.appendChild(list);
    fw.onClose(() => { if (!resolved) { resolved = true; resolve(null); } });
    fw.open();
  });
}

/* ── Drag-and-drop reorder ─────────────────────── */

function setupDragAndDrop(container, viewerState) {
  registerEditableList(container, viewerState);
}

function setupEmptyDropZone(emptyEl, viewerState) {
  registerEmptyDropZone(emptyEl, viewerState);
}

/* ── Read-only action list (nested views) ──────── */

function buildReadOnlyList(actions, viewCtx = {}) {
  const c = document.createElement('div');
  c.className = 'av-list';
  for (let i = 0; i < actions.length; i++) {
    const type = detectType(actions[i]);
    const meta = getActionMeta(type);
    const block = document.createElement('div');
    block.className = `av-block av-block-${type}`;
    block.style.setProperty('--av-accent', meta.color);
    const hdr = document.createElement('div');
    hdr.className = 'av-block-header';
    const idxEl = document.createElement('span');
    idxEl.className = 'av-index';
    idxEl.textContent = i + 1;
    const iconEl = document.createElement('span');
    iconEl.className = 'av-icon material-symbols-outlined';
    iconEl.style.color = meta.color;
    iconEl.textContent = meta.icon;
    const lblEl = document.createElement('span');
    lblEl.className = 'av-label';
    lblEl.textContent = meta.label;
    hdr.append(idxEl, iconEl, lblEl);
    const bgs = getBadges(actions[i], type);
    for (const b of bgs) {
      const el = document.createElement('span');
      el.className = 'av-badge';
      el.textContent = b;
      hdr.appendChild(el);
    }
    block.appendChild(hdr);
    const body = renderActionBody(actions[i], type, viewCtx);
    if (body) block.appendChild(body);
    c.appendChild(block);
  }
  return c;
}

/* ── Nested value helpers ──────────────────────── */

function getNestedValue(obj, path) {
  let cur = obj;
  for (const p of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  if (value === undefined) delete cur[parts[parts.length - 1]];
  else cur[parts[parts.length - 1]] = value;
}

/* ── Post-edit cleanup ─────────────────────────── */

function cleanAction(action, type) {
  const fields = ACTION_TYPES[type]?.fields;
  if (!fields) return;
  for (const field of fields) {
    if (field.required) continue;
    const v = getNestedValue(action, field.key);
    if (v === undefined || v === '' || v === null || (field.type === 'boolean' && v === false)) {
      setNestedValue(action, field.key, undefined);
    }
  }
  cleanEmptyObjects(action);
}

function cleanEmptyObjects(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      cleanEmptyObjects(obj[k]);
      if (Object.keys(obj[k]).length === 0) delete obj[k];
    } else if (obj[k] === undefined) {
      delete obj[k];
    }
  }
}
