import { ACTION_TYPES } from '../../../js/shared/action-schema.js';
import { setNestedValue, getNestedValue } from './utils.js';

const actionTabs = new WeakMap();
const lastTabs = new Map();
let nextFormId = 0;

function getLastTab(type) {
  if (!lastTabs.has(type)) {
    let tab;
    try { tab = localStorage.getItem(`buengine_ae_tab_${type}`); } catch { /* Keep preferences in memory if storage is unavailable. */ }
    lastTabs.set(type, tab);
  }
  return lastTabs.get(type);
}

function rememberTab(action, type, group) {
  actionTabs.set(action, group);
  lastTabs.set(type, group);
  try { localStorage.setItem(`buengine_ae_tab_${type}`, group); } catch { /* In-memory selection still persists across form rebuilds. */ }
}

export function createFormBuilders(openActionField) {
  function buildEditForm(action, type, ctx) {
    const form = document.createElement('div');
    form.className = 'ae-edit-form';
    const meta = ACTION_TYPES[type];
    const formId = `ae-form-${++nextFormId}`;
    let preferredTab = meta?.tabs ? actionTabs.get(action) || getLastTab(type) : null;
    let updateIndicators = () => {};
    const fieldCtx = {
      ...ctx,
      onFieldChange() {
        ctx.onFieldChange();
        updateIndicators();
      },
    };

    function appendFields(container, fields, headings = false) {
      let group;
      for (const field of fields) {
        if (headings && field.group && field.group !== group) {
          group = field.group;
          const heading = document.createElement('div');
          heading.className = 'ae-sub-label';
          heading.textContent = group;
          container.appendChild(heading);
        }
        container.appendChild(buildFieldRow(action, field, fieldCtx, renderFields));
      }
    }

    function renderTabs(fields, tabs) {
      const groups = new Set(tabs.map(tab => tab.group));
      appendFields(form, fields.filter(field => !groups.has(field.group)));
      const tabList = document.createElement('div');
      tabList.className = 'ae-field-tabs';
      tabList.setAttribute('role', 'tablist');
      tabList.setAttribute('aria-label', `${meta.label} properties`);
      const panel = document.createElement('div');
      panel.className = 'ae-field-tab-panel';
      panel.id = `${formId}-panel`;
      panel.setAttribute('role', 'tabpanel');
      const buttons = new Map();
      let selected = tabs.some(tab => tab.group === preferredTab) ? preferredTab : tabs[0].group;

      function showTab(group, remember = true, focus = false) {
        selected = group;
        if (remember) {
          preferredTab = group;
          rememberTab(action, type, group);
        }
        for (const [name, button] of buttons) {
          button.setAttribute('aria-selected', String(name === group));
          button.tabIndex = name === group ? 0 : -1;
        }
        panel.setAttribute('aria-labelledby', buttons.get(group).id);
        panel.replaceChildren();
        appendFields(panel, fields.filter(field => field.group === group));
        if (focus) buttons.get(group).focus();
      }

      updateIndicators = () => {
        for (const [group, button] of buttons) {
          const configured = fields.filter(field => field.group === group).some(field => {
            const value = getNestedValue(action, field.key);
            const defaultValue = getNestedValue(meta.defaults, field.key);
            if (field.type === 'boolean') return !!value !== !!defaultValue;
            return value != null && value !== '' && value !== defaultValue;
          });
          button.classList.toggle('ae-tab-configured', configured);
          const description = `${group}${configured ? ' — configured' : ''}`;
          button.dataset.tooltip = description;
          button.setAttribute('aria-label', description);
        }
      };

      tabs.forEach((tab, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ae-field-tab';
        button.id = `${formId}-tab-${index}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', panel.id);
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = tab.icon;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = tab.group;
        const dot = document.createElement('span');
        dot.className = 'ae-tab-dot';
        dot.setAttribute('aria-hidden', 'true');
        button.append(icon, label, dot);
        button.addEventListener('click', () => showTab(tab.group));
        button.addEventListener('keydown', event => {
          const current = tabs.findIndex(tab => tab.group === selected);
          let next;
          if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') next = (current + tabs.length - 1) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else return;
          event.preventDefault();
          showTab(tabs[next].group, true, true);
        });
        buttons.set(tab.group, button);
        tabList.appendChild(button);
      });
      form.append(tabList, panel);
      showTab(selected, false);
      updateIndicators();
    }

    function renderFields() {
      form.replaceChildren();
      updateIndicators = () => {};
      const fields = (meta?.fields || []).filter(field => !field.visibleWhen || field.visibleWhen(action));
      const tabs = (meta?.tabs || []).filter(tab => fields.some(field => field.group === tab.group));
      if (tabs.length) renderTabs(fields, tabs);
      else appendFields(form, fields, true);

      if (type === 'set') form.appendChild(buildSetEditor(action, ctx));
      if (type === 'if') form.appendChild(buildIfBranchesEditor(action, ctx));
      if (type === 'loop') form.appendChild(buildLoopEditor(action, ctx));
    }
    renderFields();

    return form;
  }

  function buildFieldRow(action, field, ctx, onLayoutChange) {
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
          opt.textContent = field.optionLabels?.[option] || option || '(none)';
          if (option === (value ?? '')) opt.selected = true;
          select.appendChild(opt);
        }
        select.addEventListener('change', () => {
          setNestedValue(action, field.key, select.value || undefined);
          ctx.onFieldChange();
          if (field.affectsLayout) onLayoutChange?.();
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
    const values = action.set && typeof action.set === 'object' ? action.set : {};

    function render() {
      wrap.innerHTML = '';
      for (const [flag, value] of Object.entries(values)) {
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
        removeBtn.dataset.tooltip = 'Remove';
        removeBtn.setAttribute('aria-label', 'Remove');

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
        action.set = values;
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
        openActionField(label, action, key, {
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
      return [];
    };

    const renderLabel = () => {
      btn.innerHTML = `<span class="material-symbols-outlined">list_alt</span> ${getLoopActions().length} action(s)`;
    };

    renderLabel();
    btn.addEventListener('click', () => {
      const key = Array.isArray(action.do) || !Array.isArray(action.then) ? 'do' : 'then';
      openActionField('do', action, key, {
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
