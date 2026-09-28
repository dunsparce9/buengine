import { escapeHtml } from '../core/state.js';
import {
  summarizeAction as schemaSummarizeAction,
  getBadges as schemaGetBadges,
} from '../../../js/shared/action-schema.js';
import { cloneAction, notifyEditorChange } from './utils.js';
import { beginSimpleReorderDrag } from './drag.js';
import { closeWindowsFor } from '../ui/floating-window.js';

// Single source of truth for summaries/badges lives in js/shared/action-schema.js.
// Re-exported here so existing `renderers.js` import sites keep working.
export const summarizeAction = schemaSummarizeAction;
export const getBadges = schemaGetBadges;

function getSceneSequences(viewCtx = {}) {
  return viewCtx.sceneData?.sequences || null;
}

function renderRudimentaryMarkdown(text) {
  let html = escapeHtml(text ?? '');
  const replacements = [
    [/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>'],
    [/__([\s\S]+?)__/g, '<u>$1</u>'],
    [/~~([\s\S]+?)~~/g, '<s>$1</s>'],
    [/\*([\s\S]+?)\*/g, '<em>$1</em>'],
  ];

  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement);
  }

  return html.replace(/\n/g, '<br>');
}

export function createActionRenderers(openActionEditor, {
  buildReadOnlyList,
  buildNestedList,
  pickActionType,
  createDefaultAction,
}) {
  function preventMouseFocus(button) {
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    return button;
  }

  function getRootEditorState(viewCtx = {}) {
    return viewCtx.editorState?.rootEditorState || viewCtx.editorState || null;
  }

  function notifyInlineEdit(viewCtx = {}) {
    const rootEditorState = getRootEditorState(viewCtx);
    if (!rootEditorState) return;
    notifyEditorChange(rootEditorState);
  }

  function commitInlineEdit(viewCtx = {}) {
    const rootEditorState = getRootEditorState(viewCtx);
    if (!rootEditorState) return;
    notifyInlineEdit(viewCtx);
    rootEditorState.rebuild();
  }

  function ensureChoiceOptions(choice) {
    return Array.isArray(choice.options) ? choice.options : [];
  }

  async function addChoiceOptionAction(opt, viewCtx = {}) {
    const rootEditorState = getRootEditorState(viewCtx);
    const type = await pickActionType?.(rootEditorState?.fw);
    if (!type || !rootEditorState?.fw.el.isConnected) return;
    if (!Array.isArray(opt.actions)) opt.actions = [];
    opt.actions.push(createDefaultAction(type));
    commitInlineEdit(viewCtx);
  }

  function buildActionList(actions, viewCtx = {}) {
    if (viewCtx.editorState && typeof buildNestedList === 'function') {
      return buildNestedList(actions, viewCtx.editorState, viewCtx);
    }
    return buildReadOnlyList(actions, viewCtx);
  }

  function createChoiceEmptyState(text) {
    const empty = document.createElement('div');
    empty.className = 'ae-empty ae-choice-empty';
    empty.textContent = text;
    return empty;
  }

  function getForkSequenceName(forkDef) {
    if (typeof forkDef === 'string') return forkDef;
    if (typeof forkDef?.run === 'string') return forkDef.run;
    return '';
  }

  function openSequence(sequenceName, viewCtx = {}) {
    const sequences = getSceneSequences(viewCtx);
    if (!(sequences && sequenceName in sequences)) return;
    const actions = sequences[sequenceName];
    openActionEditor(`${viewCtx.sceneId} — ${sequenceName}`, actions, {
      onChange: () => viewCtx.markDirty?.(viewCtx.sceneId),
      sceneId: viewCtx.sceneId,
      sceneData: viewCtx.sceneData,
      markDirty: viewCtx.markDirty,
      focusScene: viewCtx.focusScene,
    });
  }

  function renderActionBody(action, type, viewCtx = {}) {
    switch (type) {
      case 'say': return renderSay(action);
      case 'choice':
        return renderChoice(action.choice || {}, viewCtx);
      case 'goto': return renderGotoChip(action.goto, '#8ec07c', viewCtx);
      case 'set': return renderSet(action.set);
      case 'if': return renderIf(action, viewCtx);
      case 'loop': return renderLoop(action, viewCtx);
      case 'wait': return renderSimpleValue(`${action.wait} ms`);
      case 'emit': return renderChip(action.emit, '#b8bb26');
      case 'run': return renderRunChip(action.run, '#83a598', viewCtx);
      case 'fork': return renderFork(action.fork, '#8ec07c', viewCtx);
      case 'exit': return null;
      case 'show': return renderOverlay(action.show);
      case 'text': return renderTextAction(action.text);
      case 'hide': return renderOverlay(action.hide);
      case 'animate': return renderAnimate(action.animate);
      case 'playsound': return renderSound(action.playsound);
      case 'stopsound': return renderSound(action.stopsound);
      case 'item': return renderItem(action.item);
      default: return renderRawJson(action);
    }
  }

  function renderSay(action) {
    const body = document.createElement('div');
    body.className = 'ae-body ae-say-body';
    if (action.speaker) {
      const speaker = document.createElement('span');
      speaker.className = 'ae-speaker';
      if (action.accent) speaker.style.color = action.accent;
      speaker.textContent = action.speaker;
      body.appendChild(speaker);
    }
    const text = document.createElement('div');
    text.className = 'ae-say-text';
    text.innerHTML = renderRudimentaryMarkdown(action.say);
    body.appendChild(text);
    return body;
  }

  function renderChoice(choice, viewCtx = {}) {
    const body = document.createElement('div');
    body.className = 'ae-body ae-choice-body';
    if (choice.prompt) {
      const prompt = document.createElement('div');
      prompt.className = 'ae-choice-prompt';
      prompt.textContent = choice.prompt;
      body.appendChild(prompt);
    }
    const options = ensureChoiceOptions(choice);
    if (options.length > 0) {
      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'ae-choice-options';

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const optBlock = document.createElement('div');
        optBlock.className = 'ae-choice-option';
        optBlock.dataset.choiceIndex = i;

        const optHeader = document.createElement('div');
        optHeader.className = 'ae-choice-option-header';

        const dragHandle = document.createElement('span');
        dragHandle.className = 'ae-drag-handle ae-choice-drag-handle material-symbols-outlined';
        dragHandle.textContent = 'drag_indicator';
        dragHandle.title = 'Drag to reorder';
        dragHandle.addEventListener('mousedown', (event) => {
          beginChoiceOptionDrag(event, optBlock, optHeader, choice, i, viewCtx);
        });

        const idx = document.createElement('span');
        idx.className = 'ae-choice-option-idx';
        idx.textContent = i + 1;

        const text = document.createElement('span');
        text.className = 'ae-choice-option-text';
        text.textContent = opt.text || '—';

        optHeader.append(dragHandle, idx, text);

        if (viewCtx.editorState) {
          const headerActions = document.createElement('div');
          headerActions.className = 'ae-header-actions';

          const addBtn = document.createElement('button');
          addBtn.className = 'ae-header-btn ae-add-btn';
          preventMouseFocus(addBtn);
          addBtn.type = 'button';
          addBtn.title = 'Add action';
          addBtn.innerHTML = '<span class="material-symbols-outlined">add</span>';
          addBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            await addChoiceOptionAction(opt, viewCtx);
          });

          const cloneBtn = document.createElement('button');
          cloneBtn.className = 'ae-header-btn ae-clone-btn';
          preventMouseFocus(cloneBtn);
          cloneBtn.type = 'button';
          cloneBtn.title = 'Clone option';
          cloneBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
          cloneBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            choice.options.splice(i + 1, 0, cloneAction(opt));
            commitInlineEdit(viewCtx);
          });

          const editBtn = document.createElement('button');
          editBtn.className = 'ae-header-btn ae-edit-btn';
          preventMouseFocus(editBtn);
          editBtn.type = 'button';
          editBtn.title = 'Edit option text';
          editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
          editBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            beginChoiceTextEdit(opt, optHeader, editBtn, viewCtx);
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'ae-header-btn ae-delete-btn';
          preventMouseFocus(deleteBtn);
          deleteBtn.type = 'button';
          deleteBtn.title = 'Delete option';
          deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
          deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            closeWindowsFor(opt);
            choice.options.splice(i, 1);
            commitInlineEdit(viewCtx);
          });

          headerActions.append(addBtn, cloneBtn, editBtn, deleteBtn);
          optHeader.appendChild(headerActions);
        }

        optBlock.appendChild(optHeader);
        if (Array.isArray(opt.actions) && opt.actions.length > 0) {
          const nested = buildActionList(opt.actions, viewCtx);
          optBlock.appendChild(nested);
        } else if (viewCtx.editorState) {
          optBlock.appendChild(createChoiceEmptyState("Nothing interesting happens. Hover this option's header and click '+' to add actions."));
        }
        optionsWrap.appendChild(optBlock);
      }

      body.appendChild(optionsWrap);
    } else if (viewCtx.editorState) {
      body.appendChild(createChoiceEmptyState("No options. Hover this block's title and click '+' to add an option."));
    }
    return body;
  }

  function beginChoiceTextEdit(opt, optHeader, editBtn, viewCtx = {}) {
    if (!optHeader?.isConnected) return;
    if (optHeader.querySelector('.ae-choice-option-text-input')) return;

    const textEl = optHeader.querySelector('.ae-choice-option-text');
    if (!textEl) return;

    const currentText = opt.text || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ae-field-input ae-choice-option-text-input';
    input.value = currentText;
    input.placeholder = 'Choice text';

    const finish = (mode = 'commit') => {
      if (!input.isConnected) return;
      const nextText = mode === 'cancel' ? currentText : input.value;
      opt.text = nextText;
      notifyInlineEdit(viewCtx);
      editBtn.onclick = null;

      const nextTextEl = document.createElement('span');
      nextTextEl.className = 'ae-choice-option-text';
      nextTextEl.textContent = nextText || '—';
      input.replaceWith(nextTextEl);

      editBtn.title = 'Edit option text';
      editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';

      // Clicking the apply button moves focus onto it, which would keep the
      // header in :focus-within and leave the action buttons stuck visible.
      if (document.activeElement === editBtn) editBtn.blur();
    };

    editBtn.title = 'Apply option text';
    editBtn.innerHTML = '<span class="material-symbols-outlined">check</span>';
    editBtn.onclick = (event) => {
      event.stopPropagation();
      finish('commit');
      editBtn.onclick = null;
    };

    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('input', () => {
      opt.text = input.value;
      notifyInlineEdit(viewCtx);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish('commit');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish('cancel');
      }
    });
    input.addEventListener('blur', () => finish('commit'));

    textEl.replaceWith(input);
    input.focus();
    input.select();
  }

  function beginChoiceOptionDrag(event, optionEl, optionHeader, choice, optionIdx, viewCtx = {}) {
    const optionsContainer = optionEl.parentNode;
    if (!optionsContainer) return;
    // Same-container reorder via the shared drag engine (see drag.js);
    // the drop handler splices the option into place and rebuilds.
    beginSimpleReorderDrag(event, {
      sourceEl: optionEl,
      headerEl: optionHeader,
      container: optionsContainer,
      sourceIdx: optionIdx,
      getCount: () => ensureChoiceOptions(choice).length,
      rowSelector: '.ae-choice-option',
      indexAttr: 'choiceIndex',
      onDrop: (sourceIdx, dropIdx) => {
        const options = ensureChoiceOptions(choice);
        const [moved] = options.splice(sourceIdx, 1);
        let insertIdx = dropIdx;
        if (sourceIdx < insertIdx) insertIdx--;
        options.splice(insertIdx, 0, moved);
        commitInlineEdit(viewCtx);
      },
    });
  }

  function renderSet(setObj) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    for (const [flag, value] of Object.entries(setObj)) {
      const row = document.createElement('div');
      row.className = 'ae-set-row';
      const name = document.createElement('span');
      name.className = 'ae-flag-name';
      name.textContent = flag;
      const arrow = document.createElement('span');
      arrow.className = 'ae-set-arrow';
      arrow.textContent = '←';
      const val = document.createElement('span');
      val.className = 'ae-flag-value';
      if (typeof value === 'object' && value !== null) {
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
    body.className = 'ae-body ae-if-body';
    const cond = document.createElement('div');
    cond.className = 'ae-if-condition';
    cond.innerHTML = `<span class="ae-if-keyword">if</span> <code>${escapeHtml(action.if)}</code>`;
    body.appendChild(cond);
    if (Array.isArray(action.then) && action.then.length > 0) {
      const thenLabel = document.createElement('div');
      thenLabel.className = 'ae-branch-label ae-branch-then';
      thenLabel.textContent = 'then';
      body.appendChild(thenLabel);
      const thenList = buildActionList(action.then, viewCtx);
      body.appendChild(thenList);
    }
    if (Array.isArray(action.else) && action.else.length > 0) {
      const elseLabel = document.createElement('div');
      elseLabel.className = 'ae-branch-label ae-branch-else';
      elseLabel.textContent = 'else';
      body.appendChild(elseLabel);
      const elseList = buildActionList(action.else, viewCtx);
      body.appendChild(elseList);
    }
    return body;
  }

  function renderLoop(action, viewCtx = {}) {
    const body = document.createElement('div');
    body.className = 'ae-body ae-if-body';
    const cond = document.createElement('div');
    cond.className = 'ae-if-condition';
    cond.innerHTML = `<span class="ae-if-keyword">loop</span> <code>${escapeHtml(action.loop)}</code>`;
    body.appendChild(cond);
    const loopActions = Array.isArray(action.do) ? action.do : (Array.isArray(action.then) ? action.then : []);
    if (loopActions.length > 0) {
      const doLabel = document.createElement('div');
      doLabel.className = 'ae-branch-label ae-branch-loop';
      doLabel.textContent = 'do';
      body.appendChild(doLabel);
      const doList = buildActionList(loopActions, viewCtx);
      body.appendChild(doList);
    }
    return body;
  }

  function renderOverlay(data) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const props = [];
    if (data.id) props.push(['id', data.id]);
    if (data.texture) props.push(['texture', data.texture]);
    if (data.layer) props.push(['layer', data.layer]);
    if (data.scaling) props.push(['scaling', data.scaling]);
    for (const [k, v] of props) {
      const row = document.createElement('div');
      row.className = 'ae-prop-row';
      row.innerHTML = `<span class="ae-prop-key">${escapeHtml(k)}</span><span class="ae-prop-val">${escapeHtml(String(v))}</span>`;
      body.appendChild(row);
    }
    if (data.effect) {
      const effectBlock = renderEffect(data.effect);
      if (effectBlock) {
        const effectLabel = document.createElement('div');
        effectLabel.className = 'ae-sub-label';
        effectLabel.textContent = 'effect';
        body.append(effectLabel, effectBlock);
      }
    }
    return body;
  }

  function renderTextAction(data) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    if (data.text) {
      const preview = document.createElement('div');
      preview.className = 'ae-say-text';
      preview.innerHTML = renderRudimentaryMarkdown(data.text);
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
      row.className = 'ae-prop-row';
      row.innerHTML = `<span class="ae-prop-key">${escapeHtml(k)}</span><span class="ae-prop-val">${escapeHtml(String(v))}</span>`;
      body.appendChild(row);
    }
    if (data.effect) {
      const effectBlock = renderEffect(data.effect);
      if (effectBlock) {
        const effectLabel = document.createElement('div');
        effectLabel.className = 'ae-sub-label';
        effectLabel.textContent = 'effect';
        body.append(effectLabel, effectBlock);
      }
    }
    return body;
  }

  function renderAnimate(data = {}) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const scene = data.target === 'scene';
    const props = [['target', scene ? 'Scene' : data.id || '(target)'],
      ...Object.entries(data.to || {}).filter(([key]) => !scene || key === 'opacity')];
    if (data.from?.opacity != null) props.push(['starting opacity', data.from.opacity]);
    if (!scene && data.pivot) props.push(['pivot', data.pivot]);
    props.push(['duration', `${data.seconds ?? 1}s`], ['easing', data.easing || 'ease-in-out']);
    for (const [key, value] of props) {
      const row = document.createElement('div');
      row.className = 'ae-prop-row';
      row.innerHTML = `<span class="ae-prop-key">${escapeHtml(key)}</span><span class="ae-prop-val">${escapeHtml(String(value))}</span>`;
      body.appendChild(row);
    }
    return body;
  }

  function renderEffect(data) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const props = [];
    if (data.type) props.push(['type', data.type]);
    if (data.seconds != null) props.push(['seconds', data.seconds]);
    for (const [k, v] of props) {
      const row = document.createElement('div');
      row.className = 'ae-prop-row';
      row.innerHTML = `<span class="ae-prop-key">${escapeHtml(k)}</span><span class="ae-prop-val">${escapeHtml(String(v))}</span>`;
      body.appendChild(row);
    }
    return body;
  }

  function renderSound(data) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const props = [];
    if (data.id) props.push(['id', data.id]);
    if (data.path) props.push(['path', data.path]);
    if (data.volume != null) props.push(['volume', data.volume]);
    if (data.fade != null) props.push(['fade', `${data.fade}s`]);
    if (data.loop != null) props.push(['loop', data.loop]);
    for (const [k, v] of props) {
      const row = document.createElement('div');
      row.className = 'ae-prop-row';
      row.innerHTML = `<span class="ae-prop-key">${escapeHtml(k)}</span><span class="ae-prop-val">${escapeHtml(String(v))}</span>`;
      body.appendChild(row);
    }
    return body;
  }

  function renderItem(data) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const row = document.createElement('div');
    row.className = 'ae-set-row';
    const name = document.createElement('span');
    name.className = 'ae-flag-name';
    name.textContent = data.id || '(no id)';
    const arrow = document.createElement('span');
    arrow.className = 'ae-set-arrow';
    const qty = data.qty ?? 1;
    arrow.textContent = qty >= 0 ? '←' : '→';
    const val = document.createElement('span');
    val.className = 'ae-flag-value';
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
    body.className = 'ae-body';
    const chip = document.createElement('span');
    chip.className = 'ae-chip';
    chip.style.setProperty('--chip-color', color);
    chip.textContent = value;
    body.appendChild(chip);
    return body;
  }

  function renderGotoChip(sceneId, color, viewCtx = {}) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const canFocusScene = typeof viewCtx.focusScene === 'function' && !!sceneId;
    const chipTag = canFocusScene ? 'button' : 'span';
    const chip = document.createElement(chipTag);
    chip.className = 'ae-chip';
    chip.style.setProperty('--chip-color', color);
    chip.textContent = sceneId;
    if (canFocusScene) {
      chip.type = 'button';
      chip.title = `Focus scene: ${sceneId}`;
      chip.addEventListener('click', () => viewCtx.focusScene(sceneId));
    }
    body.appendChild(chip);
    return body;
  }

  function renderRunChip(sequenceName, color, viewCtx = {}) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const sequences = getSceneSequences(viewCtx);
    const canOpenSequence = !!(sequences && sequenceName in sequences);
    const chipTag = canOpenSequence ? 'button' : 'span';
    const chip = document.createElement(chipTag);
    chip.className = 'ae-chip';
    chip.style.setProperty('--chip-color', color);
    chip.textContent = sequenceName;
    if (canOpenSequence) {
      chip.type = 'button';
      chip.title = `Open sequence: ${sequenceName}`;
      chip.addEventListener('click', () => openSequence(sequenceName, viewCtx));
    }
    body.appendChild(chip);
    return body;
  }

  function renderFork(forkDef, color, viewCtx = {}) {
    const sequenceName = getForkSequenceName(forkDef);
    if (sequenceName) return renderRunChip(sequenceName, color, viewCtx);
    if (Array.isArray(forkDef?.actions)) {
      const body = document.createElement('div');
      body.className = 'ae-body ae-if-body';
      const label = document.createElement('div');
      label.className = 'ae-branch-label ae-branch-then';
      label.textContent = 'background';
      body.appendChild(label);
      const list = buildActionList(forkDef.actions, viewCtx);
      body.appendChild(list);
      return body;
    }
    return renderSimpleValue('background');
  }

  function renderSimpleValue(text) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const val = document.createElement('span');
    val.className = 'ae-simple-val';
    val.textContent = text;
    body.appendChild(val);
    return body;
  }

  function renderRawJson(action) {
    const body = document.createElement('div');
    body.className = 'ae-body';
    const pre = document.createElement('pre');
    pre.className = 'ae-raw';
    pre.textContent = JSON.stringify(action, null, 2);
    body.appendChild(pre);
    return body;
  }

  return { renderActionBody };
}

export function renderCollapsedSummary(action, type, shortenText, viewCtx = {}) {
  const summaryText = schemaSummarizeAction(action, type, shortenText);
  let onClick = null;
  let title = '';

  if (type === 'goto' && typeof viewCtx.focusScene === 'function' && action.goto) {
    onClick = () => viewCtx.focusScene(action.goto);
    title = `Focus scene: ${action.goto}`;
  } else if (type === 'run' && getSceneSequences(viewCtx) && action.run in getSceneSequences(viewCtx)) {
    onClick = () => viewCtx.openActionEditor?.(`${viewCtx.sceneId} — ${action.run}`, getSceneSequences(viewCtx)[action.run], {
      onChange: () => viewCtx.markDirty?.(viewCtx.sceneId),
      sceneId: viewCtx.sceneId,
      sceneData: viewCtx.sceneData,
      markDirty: viewCtx.markDirty,
      focusScene: viewCtx.focusScene,
    });
    title = `Open sequence: ${action.run}`;
  } else if (type === 'fork') {
    const sequenceName = typeof action.fork === 'string' ? action.fork : action.fork?.run;
    const sequences = getSceneSequences(viewCtx);
    if (sequenceName && sequences && sequenceName in sequences) {
      onClick = () => viewCtx.openActionEditor?.(`${viewCtx.sceneId} — ${sequenceName}`, sequences[sequenceName], {
        onChange: () => viewCtx.markDirty?.(viewCtx.sceneId),
        sceneId: viewCtx.sceneId,
        sceneData: viewCtx.sceneData,
        markDirty: viewCtx.markDirty,
        focusScene: viewCtx.focusScene,
      });
      title = `Open sequence: ${sequenceName}`;
    }
  }

  const el = document.createElement(onClick ? 'button' : 'span');
  el.className = `ae-summary${onClick ? ' ae-summary-link' : ''}`;
  if (type === 'text') {
    el.innerHTML = renderRudimentaryMarkdown(summaryText);
  } else {
    el.textContent = summaryText;
  }
  if (onClick) {
    el.type = 'button';
    el.title = title;
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
  }
  return el;
}
