import { escapeHtml } from '../state.js';

function getSceneSequences(viewCtx = {}) {
  return viewCtx.sceneData?.sequences || viewCtx.sceneData?.definitions || null;
}

export function createActionRenderers(openActionEditor, buildReadOnlyList) {
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
      case 'choice': return renderChoice(action.choice, viewCtx);
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
      case 'effect': return renderEffect(action.effect);
      case 'playsound': return renderSound(action.playsound);
      case 'stopsound': return renderSound(action.stopsound);
      case 'item': return renderItem(action.item);
      default: return renderRawJson(action);
    }
  }

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
      chip.addEventListener('click', () => viewCtx.focusScene(sceneId));
    }
    body.appendChild(chip);
    return body;
  }

  function renderRunChip(sequenceName, color, viewCtx = {}) {
    const body = document.createElement('div');
    body.className = 'av-body';
    const sequences = getSceneSequences(viewCtx);
    const canOpenSequence = !!(sequences && sequenceName in sequences);
    const chipTag = canOpenSequence ? 'button' : 'span';
    const chip = document.createElement(chipTag);
    chip.className = 'av-chip';
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

  return { renderActionBody };
}

export function renderCollapsedSummary(action, type, shortenText, viewCtx = {}) {
  const summaryText = summarizeAction(action, type, shortenText);
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
  el.className = `av-summary${onClick ? ' av-summary-link' : ''}`;
  el.textContent = summaryText;
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

export function getBadges(action, type) {
  const badges = [];
  if (type === 'say' && action.delay) badges.push(`delay ${action.delay}s`);
  if (type === 'effect' && action.effect?.blocking) badges.push('blocking');
  if (type === 'playsound') {
    const data = action.playsound;
    if (data?.loop) badges.push('loop');
    if (data?.blocking) badges.push('blocking');
  }
  if (type === 'stopsound' && action.stopsound?.blocking) badges.push('blocking');
  if (type === 'show' && action.show?.effect?.blocking) badges.push('blocking');
  if (type === 'hide' && action.hide?.effect?.blocking) badges.push('blocking');
  return badges;
}

export function summarizeAction(action, type, shortenText) {
  switch (type) {
    case 'say': return shortenText(action.say || '(empty dialogue)');
    case 'choice': {
      const count = action.choice?.options?.length || 0;
      return `${shortenText(action.choice?.prompt || 'Choice')} | ${count} option(s)`;
    }
    case 'goto': return action.goto || '(scene)';
    case 'set': {
      const keys = Object.keys(action.set || {});
      return keys.length ? keys.join(', ') : 'No flags';
    }
    case 'if': return `${action.if || '(condition)'} | then ${action.then?.length || 0} | else ${action.else?.length || 0}`;
    case 'loop': {
      const loopActions = Array.isArray(action.do) ? action.do : (Array.isArray(action.then) ? action.then : []);
      return `${action.loop || '(condition)'} | do ${loopActions.length}`;
    }
    case 'wait': return `${action.wait ?? 0} ms`;
    case 'emit': return action.emit || '(event)';
    case 'run': return action.run || '(sequence)';
    case 'fork':
      if (typeof action.fork === 'string') return action.fork;
      if (typeof action.fork?.run === 'string') return action.fork.run;
      if (Array.isArray(action.fork?.actions)) return `${action.fork.actions.length} background action(s)`;
      return 'Background actions';
    case 'exit': return 'Stop here';
    case 'show': return action.show?.id || action.show?.texture || String(action.show || '(target)');
    case 'text': {
      const id = action.text?.id;
      const text = shortenText(action.text?.text || '(empty text)');
      return id ? `${id} | ${text}` : text;
    }
    case 'hide': return action.hide?.id || String(action.hide || '(target)');
    case 'effect': return `${action.effect?.type || 'effect'}${action.effect?.seconds != null ? ` ${action.effect.seconds}s` : ''}`;
    case 'playsound': return action.playsound?.id || action.playsound?.path || '(sound)';
    case 'stopsound': return action.stopsound?.id || '(sound)';
    case 'item': return `${action.item?.id || '(item)'} x ${action.item?.qty ?? 1}`;
    default: return shortenText(JSON.stringify(action));
  }
}
