import { parseExpression } from '../../../js/shared/expressions.js';
import { walkScriptActions } from '../../../js/shared/script-data.js';
import { state } from '../core/state.js';

let nextExpressionId = 0;

function availableReferences(ctx) {
  const names = new Set();
  function inspect(value) {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\{([^{}]+)\}/g)) names.add(match[1].trim());
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) inspect(child);
    }
  }
  const scripts = new Set([...Object.values(state.scripts), ctx.opts?.sceneData]);
  for (const script of scripts) {
    walkScriptActions(script, action => {
      for (const key of Object.keys(action.set || {})) names.add(key);
      for (const condition of [action.if, typeof action.loop === 'string' ? action.loop : null]) {
        if (typeof condition !== 'string') continue;
        const operands = condition.split(/==|!=|>=|<=|>|</);
        for (const operand of operands) {
          const name = operand.trim();
          if (/^[\w.]+$/.test(name) && !['true', 'false'].includes(name) && Number.isNaN(Number(name))) names.add(name);
        }
      }
      inspect(action);
    });
  }
  const items = state.scripts['items/items'];
  for (const item of Array.isArray(items) ? items : []) {
    if (item.id) names.add(`items.${item.id}.qty`);
  }
  return [...names].filter(name => name && !/[{}]/.test(name)).sort();
}

/** An expression textbox and local insertion guide, owned by its action form. */
export function buildExpressionInput(value, label, ctx, onCommit, { raw = false, guideHost = null } = {}) {
  const id = `ae-expression-${++nextExpressionId}`;
  const wrap = document.createElement('div');
  wrap.className = 'ae-expression';
  const line = document.createElement('div');
  line.className = 'ae-expression-line';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ae-field-input';
  input.value = value;
  input.placeholder = raw ? 'JSON value' : 'Value or expression';
  input.setAttribute('aria-label', label);
  const error = document.createElement('div');
  error.className = 'ae-expression-error';
  error.id = `${id}-error`;
  input.setAttribute('aria-describedby', error.id);
  error.setAttribute('aria-live', 'polite');
  function validate() {
    try {
      if (raw) JSON.parse(input.value);
      else parseExpression(input.value);
      error.textContent = '';
      input.setAttribute('aria-invalid', 'false');
      return true;
    } catch (failure) {
      error.textContent = `${failure.message} Changes have not been applied.`;
      input.setAttribute('aria-invalid', 'true');
      return false;
    }
  }
  input.addEventListener('input', validate);
  input.addEventListener('change', () => { if (validate()) onCommit(input.value); });
  line.appendChild(input);
  wrap.append(line, error);
  if (raw) return { element: wrap, input, validate };

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ae-mini-btn';
  button.textContent = '…';
  button.setAttribute('aria-label', `Expression guide for ${label}`);
  button.dataset.tooltip = 'Insert a variable or operator';
  button.setAttribute('aria-expanded', 'false');
  line.appendChild(button);
  const guide = document.createElement('div');
  guide.className = 'ae-expression-guide';
  guide.id = `${id}-guide`;
  guide.setAttribute('role', 'group');
  guide.setAttribute('aria-label', 'Expression guide');
  button.setAttribute('aria-controls', guide.id);
  guide.hidden = true;
  const help = document.createElement('div');
  help.textContent = 'Use {flag} for variables, "quotes" for text. Examples: {score} + 1, !{enabled}.';
  guide.appendChild(help);
  const referenceInput = document.createElement('input');
  referenceInput.className = 'ae-field-input';
  referenceInput.placeholder = 'Find or enter a flag name';
  referenceInput.setAttribute('aria-label', 'Variable name');
  const references = document.createElement('div');
  references.className = 'ae-expression-references';
  let start = input.value.length, end = start;
  function rememberSelection() { start = input.selectionStart; end = input.selectionEnd; }
  input.addEventListener('select', rememberSelection);
  input.addEventListener('keyup', rememberSelection);
  input.addEventListener('click', rememberSelection);
  input.addEventListener('blur', rememberSelection);
  function insert(text) {
    input.setRangeText(text, start, end, 'end');
    input.focus();
    rememberSelection();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function insertButton(label, text, container) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'ae-mini-btn';
    option.textContent = label;
    option.addEventListener('click', () => insert(text));
    container.appendChild(option);
  }
  function showReferences() {
    references.replaceChildren();
    const query = referenceInput.value.trim();
    const names = availableReferences(ctx).filter(name => name.toLowerCase().includes(query.toLowerCase()));
    if (query && !/[{}]/.test(query) && !names.includes(query)) names.unshift(query);
    for (const name of names) insertButton(`{${name}}`, `{${name}}`, references);
  }
  referenceInput.addEventListener('input', showReferences);
  referenceInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && referenceInput.value.trim() && !/[{}]/.test(referenceInput.value)) {
      event.preventDefault();
      insert(`{${referenceInput.value.trim()}}`);
    }
  });
  guide.append(referenceInput, references);
  const operators = document.createElement('div');
  operators.className = 'ae-expression-operators';
  for (const [name, text] of [
    ['Add +', ' + '], ['Subtract −', ' - '], ['Multiply ×', ' * '], ['Divide ÷', ' / '], ['Remainder %', ' % '],
    ['Not !', '!'], ['And &&', ' && '], ['Or ||', ' || '],
    ['Equal ==', ' == '], ['Not equal !=', ' != '], ['Greater >', ' > '], ['At least >=', ' >= '],
    ['Less <', ' < '], ['At most <=', ' <= '], ['(', '('], [')', ')'], ['true', 'true'], ['false', 'false'], ['Text ""', '""'],
  ]) insertButton(name, text, operators);
  guide.appendChild(operators);
  if (!guideHost) wrap.appendChild(guide);
  function toggle(open) {
    if (guideHost) {
      if (open) {
        for (const other of guideHost.querySelectorAll(':scope > .ae-expression-guide')) {
          if (other !== guide) other.dispatchEvent(new Event('guide:close'));
        }
        guideHost.appendChild(guide);
      } else guide.remove();
    }
    guide.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }
  guide.addEventListener('guide:close', () => toggle(false));
  button.addEventListener('click', () => { showReferences(); toggle(guide.hidden); });
  guide.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); toggle(false); button.focus(); }
  });
  return { element: wrap, input, validate, closeGuide: () => toggle(false) };
}
