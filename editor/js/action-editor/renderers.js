import { formatCondition, formatSetValue } from '../../../js/shared/expressions.js';
import { escapeHtml } from '../core/state.js';
import {
  summarizeAction as schemaSummarizeAction,
  getBadges as schemaGetBadges,
  getActionMeta,
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
  appendActionToField,
  registerEmptyActionField,
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
    appendActionToField(opt, 'actions', createDefaultAction(type));
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

  function createEmptyAddAction(onAdd, owner, key, viewCtx) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ae-empty-add-action';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'add';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, 'Add action');
    preventMouseFocus(button);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onAdd();
    });
    registerEmptyActionField(button, owner, key, viewCtx);
    return button;
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
        dragHandle.dataset.tooltip = 'Drag to reorder';
        dragHandle.addEventListener('mousedown', (event) => {
          beginChoiceOptionDrag(event, optBlock, optHeader, choice, i, viewCtx);
        });

        const idx = document.createElement('span');
        idx.className = 'ae-choice-option-idx';
        idx.textContent = i + 1;

        const position = document.createElement('span');
        position.className = 'ae-action-position';
        position.append(idx, dragHandle);

        const text = document.createElement('span');
        text.className = 'ae-choice-option-text';
        text.textContent = opt.text || '—';

        optHeader.append(position, text);

        if (viewCtx.editorState) {
          const headerActions = document.createElement('div');
          headerActions.className = 'ae-header-actions';

          const addBtn = document.createElement('button');
          addBtn.className = 'ae-header-btn ae-add-btn';
          preventMouseFocus(addBtn);
          addBtn.type = 'button';
          addBtn.dataset.tooltip = 'Add action';
          addBtn.setAttribute('aria-label', 'Add action');
          addBtn.innerHTML = '<span class="material-symbols-outlined">add</span>';
          addBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            await addChoiceOptionAction(opt, viewCtx);
          });

          const cloneBtn = document.createElement('button');
          cloneBtn.className = 'ae-header-btn ae-clone-btn';
          preventMouseFocus(cloneBtn);
          cloneBtn.type = 'button';
          cloneBtn.dataset.tooltip = 'Clone option';
          cloneBtn.setAttribute('aria-label', 'Clone option');
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
          editBtn.dataset.tooltip = 'Edit option text';
          editBtn.setAttribute('aria-label', 'Edit option text');
          editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
          editBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            beginChoiceTextEdit(opt, optHeader, editBtn, viewCtx);
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'ae-header-btn ae-delete-btn';
          preventMouseFocus(deleteBtn);
          deleteBtn.type = 'button';
          deleteBtn.dataset.tooltip = 'Delete option';
          deleteBtn.setAttribute('aria-label', 'Delete option');
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
          optBlock.appendChild(createEmptyAddAction(() => addChoiceOptionAction(opt, viewCtx), opt, 'actions', viewCtx));
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

      editBtn.dataset.tooltip = 'Edit option text';
      editBtn.setAttribute('aria-label', 'Edit option text');
      editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';

      // Clicking the apply button moves focus onto it, which would keep the
      // header in :focus-within and leave the action buttons stuck visible.
      if (document.activeElement === editBtn) editBtn.blur();
    };

    editBtn.dataset.tooltip = 'Apply option text';
    editBtn.setAttribute('aria-label', 'Apply option text');
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
      val.textContent = formatSetValue(value);
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
    cond.innerHTML = `<span class="ae-if-keyword">if</span> <code>${escapeHtml(formatCondition(action.if))}</code>`;
    body.appendChild(cond);
    for (const key of ['then', 'else']) {
      const actions = Array.isArray(action[key]) ? action[key] : [];
      if (!viewCtx.editorState && actions.length === 0) continue;

      const branch = document.createElement('div');
      branch.className = 'ae-if-branch';
      const header = document.createElement('div');
      header.className = 'ae-branch-header';
      const label = document.createElement('span');
      label.className = `ae-branch-label ae-branch-${key}`;
      label.textContent = key;
      header.appendChild(label);

      const addAction = async () => {
        const rootEditorState = getRootEditorState(viewCtx);
        const type = await pickActionType?.(rootEditorState?.fw);
        if (!type || !rootEditorState?.fw.el.isConnected || !header.isConnected) return;
        appendActionToField(action, key, createDefaultAction(type));
        commitInlineEdit(viewCtx);
      };

      if (viewCtx.editorState) {
        header.tabIndex = 0;
        const headerActions = document.createElement('div');
        headerActions.className = 'ae-header-actions';
        const addBtn = document.createElement('button');
        addBtn.className = 'ae-header-btn ae-add-btn';
        preventMouseFocus(addBtn);
        addBtn.type = 'button';
        addBtn.dataset.tooltip = `Add ${key} action`;
        addBtn.setAttribute('aria-label', `Add ${key} action`);
        addBtn.innerHTML = '<span class="material-symbols-outlined">add</span>';
        addBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          addAction();
        });
        headerActions.appendChild(addBtn);
        header.appendChild(headerActions);
      }

      branch.appendChild(header);
      if (actions.length > 0) {
        branch.appendChild(buildActionList(actions, viewCtx));
      } else {
        branch.appendChild(createEmptyAddAction(addAction, action, key, viewCtx));
      }
      body.appendChild(branch);
    }
    return body;
  }

  function renderLoop(action, viewCtx = {}) {
    const body = document.createElement('div');
    body.className = 'ae-body ae-if-body';
    const cond = document.createElement('div');
    cond.className = 'ae-if-condition';
    const repeat = typeof action.loop === 'number' ? `${action.loop} times` : formatCondition(action.loop);
    cond.innerHTML = `<span class="ae-if-keyword">loop</span> <code>${escapeHtml(repeat)}</code>`;
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
    if (data.layer && data.layer !== 'overlay') props.push(['layer', data.layer]);
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
    if (data.position?.anchor && data.position.anchor !== getActionMeta('text').defaults.text.position.anchor) props.push(['anchor', data.position.anchor]);
    if (data.position?.x != null && data.position.x !== '') props.push(['x', data.position.x]);
    if (data.position?.y != null && data.position.y !== '') props.push(['y', data.position.y]);
    const defaultColor = getActionMeta('text').fields.find(field => field.key === 'text.color').defaultValue;
    if (data.color && data.color !== defaultColor) props.push(['color', data.color]);
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
    const defaults = getActionMeta('animate').defaults.animate;
    const props = [];
    if (scene || (data.id && data.id !== defaults.id)) props.push(['target', scene ? 'Scene' : data.id]);
    props.push(...Object.entries(data.to || {}).filter(([key]) => !scene || key === 'opacity'));
    if (data.from?.opacity != null) props.push(['starting opacity', data.from.opacity]);
    if (!scene && data.pivot) props.push(['pivot', data.pivot]);
    if (data.seconds != null && data.seconds !== defaults.seconds) props.push(['duration', `${data.seconds}s`]);
    if (data.easing && data.easing !== defaults.easing) props.push(['easing', data.easing]);
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
    if (data.volume != null && data.volume !== 1) props.push(['volume', data.volume]);
    if (data.fade != null && data.fade !== 0) props.push(['fade', `${data.fade}s`]);
    if (data.loop) props.push(['loop', data.loop]);
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
      chip.dataset.tooltip = `Focus scene: ${sceneId}`;
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
      chip.dataset.tooltip = `Open sequence: ${sequenceName}`;
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
    el.dataset.tooltip = title;
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
  }
  return el;
}
