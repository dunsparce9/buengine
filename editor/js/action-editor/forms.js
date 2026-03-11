import { ACTION_TYPES } from '../../../js/action-schema.js';
import { setNestedValue, getNestedValue } from './utils.js';

export function createFormBuilders(openActionEditor) {
  function buildEditForm(action, type, ctx) {
    const form = document.createElement('div');
    form.className = 'ae-edit-form';

    const fields = ACTION_TYPES[type]?.fields;
    if (fields) {
      for (const field of fields) {
        form.appendChild(buildFieldRow(action, field, ctx));
      }
    }

    if (type === 'set') form.appendChild(buildSetEditor(action, ctx));
    if (type === 'choice') form.appendChild(buildChoiceEditor(action, ctx));
    if (type === 'if') form.appendChild(buildIfBranchesEditor(action, ctx));
    if (type === 'loop') form.appendChild(buildLoopEditor(action, ctx));

    return form;
  }

  function buildFieldRow(action, field, ctx) {
    const row = document.createElement('div');
    row.className = 'ae-field-row';

    const label = document.createElement('label');
    label.className = 'ae-field-label';
    label.textContent = field.label;
    if (field.required) {
      const required = document.createElement('span');
      required.className = 'ae-field-required';
      required.textContent = ' *';
      label.appendChild(required);
    }
    row.appendChild(label);

    const value = getNestedValue(action, field.key);

    switch (field.type) {
      case 'string': {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ae-field-input';
        input.value = value ?? '';
        if (field.fixed) input.readOnly = true;
        input.addEventListener('input', () => {
          setNestedValue(action, field.key, input.value || undefined);
          ctx.onFieldChange();
        });
        row.appendChild(input);
        break;
      }
      case 'textarea': {
        const textarea = document.createElement('textarea');
        textarea.className = 'ae-field-input ae-field-textarea';
        textarea.value = value ?? '';
        textarea.rows = 3;
        textarea.addEventListener('input', () => {
          setNestedValue(action, field.key, textarea.value || undefined);
          ctx.onFieldChange();
        });
        row.appendChild(textarea);
        break;
      }
      case 'number': {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'ae-field-input ae-field-number';
        input.value = value ?? '';
        if (field.step != null) input.step = field.step;
        if (field.min != null) input.min = field.min;
        if (field.max != null) input.max = field.max;
        input.addEventListener('input', () => {
          const nextValue = input.value === '' ? undefined : parseFloat(input.value);
          setNestedValue(action, field.key, nextValue);
          ctx.onFieldChange();
        });
        row.appendChild(input);
        break;
      }
      case 'boolean': {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ae-field-checkbox';
        checkbox.checked = !!value;
        if (field.fixed) checkbox.disabled = true;
        checkbox.addEventListener('change', () => {
          setNestedValue(action, field.key, checkbox.checked || undefined);
          ctx.onFieldChange();
        });
        row.appendChild(checkbox);
        break;
      }
      case 'select': {
        const select = document.createElement('select');
        select.className = 'ae-field-input ae-field-select';
        for (const option of (field.options || [])) {
          const opt = document.createElement('option');
          opt.value = option;
          opt.textContent = option || '(none)';
          if (option === (value ?? '')) opt.selected = true;
          select.appendChild(opt);
        }
        select.addEventListener('change', () => {
          setNestedValue(action, field.key, select.value || undefined);
          ctx.onFieldChange();
        });
        row.appendChild(select);
        break;
      }
      case 'color': {
        const wrap = document.createElement('div');
        wrap.className = 'ae-color-picker';

        const swatch = document.createElement('div');
        swatch.className = 'ae-color-swatch';
        const currentColor = value || field.defaultValue || '#ffffff';
        swatch.style.backgroundColor = currentColor;

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'ae-color-native';
        colorInput.value = currentColor;

        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'ae-field-input ae-color-hex';
        hexInput.value = value || '';
        hexInput.placeholder = field.defaultValue || '#ffffff';
        hexInput.maxLength = 7;

        swatch.addEventListener('click', () => colorInput.click());

        colorInput.addEventListener('input', () => {
          const nextColor = colorInput.value;
          swatch.style.backgroundColor = nextColor;
          hexInput.value = nextColor;
          const stored = nextColor === field.defaultValue ? undefined : nextColor;
          setNestedValue(action, field.key, stored);
          ctx.onFieldChange();
        });

        hexInput.addEventListener('change', () => {
          const raw = hexInput.value.trim();
          if (raw === '') {
            swatch.style.backgroundColor = field.defaultValue || '#ffffff';
            setNestedValue(action, field.key, undefined);
            ctx.onFieldChange();
            return;
          }
          if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
            swatch.style.backgroundColor = raw;
            colorInput.value = raw;
            const stored = raw === field.defaultValue ? undefined : raw;
            setNestedValue(action, field.key, stored);
            ctx.onFieldChange();
          } else {
            hexInput.value = value || '';
          }
        });

        wrap.append(swatch, colorInput, hexInput);
        row.appendChild(wrap);
        break;
      }
    }

    return row;
  }

  function buildSetEditor(action, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'ae-set-editor';
    if (!action.set || typeof action.set !== 'object') action.set = {};

    function render() {
      wrap.innerHTML = '';
      for (const [flag, value] of Object.entries(action.set)) {
        const row = document.createElement('div');
        row.className = 'ae-set-edit-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'ae-field-input';
        nameInput.value = flag;
        nameInput.placeholder = 'flag name';

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'ae-field-input';
        valueInput.value = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
        valueInput.placeholder = 'value';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'ae-mini-btn ae-mini-btn-danger';
        removeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
        removeBtn.title = 'Remove';

        nameInput.addEventListener('change', () => {
          const nextKey = nameInput.value.trim();
          if (!nextKey || nextKey === flag) return;
          const currentValue = action.set[flag];
          delete action.set[flag];
          action.set[nextKey] = currentValue;
          ctx.onFieldChange();
          render();
        });

        valueInput.addEventListener('change', () => {
          action.set[nameInput.value || flag] = parseSetValue(valueInput.value);
          ctx.onFieldChange();
        });

        removeBtn.addEventListener('click', () => {
          delete action.set[flag];
          ctx.onFieldChange();
          render();
        });

        row.append(nameInput, valueInput, removeBtn);
        wrap.appendChild(row);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'ae-mini-btn';
      addBtn.innerHTML = '<span class="material-symbols-outlined">add</span> Add flag';
      addBtn.addEventListener('click', () => {
        let name = 'new_flag';
        let suffix = 1;
        while (action.set[name]) name = `new_flag_${suffix++}`;
        action.set[name] = true;
        ctx.onFieldChange();
        render();
      });
      wrap.appendChild(addBtn);
    }

    render();
    return wrap;
  }

  function buildChoiceEditor(action, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'ae-choice-editor';
    if (!action.choice) action.choice = { prompt: '', options: [] };
    if (!action.choice.options) action.choice.options = [];

    function render() {
      wrap.innerHTML = '';
      const choiceOptions = action.choice.options;
      for (let i = 0; i < choiceOptions.length; i++) {
        const opt = choiceOptions[i];
        const row = document.createElement('div');
        row.className = 'ae-choice-edit-option';

        const header = document.createElement('div');
        header.className = 'ae-choice-edit-option-header';

        const badge = document.createElement('span');
        badge.className = 'ae-choice-option-idx';
        badge.textContent = i + 1;

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'ae-field-input';
        textInput.value = opt.text || '';
        textInput.placeholder = 'Option text';
        textInput.addEventListener('input', () => {
          opt.text = textInput.value;
          ctx.onFieldChange();
        });

        const actionsBtn = document.createElement('button');
        actionsBtn.className = 'ae-mini-btn';
        actionsBtn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${opt.actions?.length || 0}`;
        actionsBtn.title = 'Edit option actions';
        actionsBtn.addEventListener('click', () => {
          if (!opt.actions) opt.actions = [];
          openActionEditor(`Option ${i + 1}: ${opt.text || '…'}`, opt.actions, {
            onChange() {
              ctx.onFieldChange();
              actionsBtn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${opt.actions.length}`;
            },
            sceneId: ctx.opts.sceneId,
            sceneData: ctx.opts.sceneData,
            markDirty: ctx.opts.markDirty,
            focusScene: ctx.opts.focusScene,
          });
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'ae-mini-btn ae-mini-btn-danger';
        removeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
        removeBtn.addEventListener('click', () => {
          choiceOptions.splice(i, 1);
          ctx.onFieldChange();
          render();
        });

        header.append(badge, textInput, actionsBtn, removeBtn);
        row.appendChild(header);
        wrap.appendChild(row);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'ae-mini-btn';
      addBtn.innerHTML = '<span class="material-symbols-outlined">add</span> Add option';
      addBtn.addEventListener('click', () => {
        choiceOptions.push({ text: '', actions: [] });
        ctx.onFieldChange();
        render();
      });
      wrap.appendChild(addBtn);
    }

    render();
    return wrap;
  }

  function buildIfBranchesEditor(action, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'ae-if-editor';

    function branchRow(label, cssClass, key) {
      const row = document.createElement('div');
      row.className = 'ae-branch-edit-row';

      const labelEl = document.createElement('span');
      labelEl.className = `ae-branch-label ${cssClass}`;
      labelEl.textContent = label;

      const btn = document.createElement('button');
      btn.className = 'ae-mini-btn';
      btn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${action[key]?.length || 0} action(s)`;
      btn.addEventListener('click', () => {
        if (!action[key]) action[key] = [];
        openActionEditor(label, action[key], {
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

      row.append(labelEl, btn);
      return row;
    }

    wrap.appendChild(branchRow('then', 'ae-branch-then', 'then'));
    wrap.appendChild(branchRow('else', 'ae-branch-else', 'else'));
    return wrap;
  }

  function buildLoopEditor(action, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'ae-if-editor';

    const row = document.createElement('div');
    row.className = 'ae-branch-edit-row';

    const label = document.createElement('span');
    label.className = 'ae-branch-label ae-branch-loop';
    label.textContent = 'do';

    const btn = document.createElement('button');
    btn.className = 'ae-mini-btn';

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
      openActionEditor('do', loopActions, {
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

    row.append(label, btn);
    wrap.appendChild(row);
    return wrap;
  }

  return { buildEditForm };
}

function parseSetValue(raw) {
  const text = raw.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^[+-]\d+$/.test(text)) return text;
  const number = Number(text);
  if (!Number.isNaN(number) && text !== '') return number;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
