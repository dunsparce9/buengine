/**
 * Shared property-inspector field-row builder.
 *
 * Single source of truth for the right-panel `.prop-row` editors, merging
 * the previously forked `addEditablePropGroup` implementations from
 * `properties.js` (text/number only) and `items-viewer.js` (which added
 * checkbox support). Supports text / number / checkbox / select / datalist.
 *
 * Callers keep their own group-title rendering (different icon maps) and
 * pass a `createGroupTitle(title)` callback; the row/input construction
 * lives here so new input types only need one implementation.
 */

function normalizeOptions(options) {
  return (options || []).map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );
}

function ensureDatalist(listId, options) {
  let datalist = document.getElementById(listId);
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = listId;
    document.body.appendChild(datalist);
  }
  datalist.innerHTML = '';
  for (const opt of normalizeOptions(options)) {
    const el = document.createElement('option');
    el.value = opt.value;
    if (opt.label && opt.label !== opt.value) el.label = opt.label;
    datalist.appendChild(el);
  }
  return datalist;
}

/**
 * Build the input/select element for a field descriptor.
 * @param {object} field
 *   { key, value, type, options, listId, placeholder, step, min, max,
 *     event, disabled, onChange }
 * @param {{ compact?: boolean }} [opts]
 */
export function buildFieldInput(field, { compact = false } = {}) {
  const type = field.type || 'text';
  const inputClass = `prop-input${compact ? ' prop-compact-input' : ''}`;

  if (type === 'checkbox') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'prop-checkbox';
    input.checked = Boolean(field.value);
    if (field.disabled) input.disabled = true;
    input.addEventListener('change', () => field.onChange?.(input.checked, input));
    return input;
  }

  if (type === 'select') {
    const sel = document.createElement('select');
    sel.className = `${inputClass} prop-select`;
    if (field.disabled) sel.disabled = true;
    for (const opt of normalizeOptions(field.options)) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label || '(none)';
      if (opt.value === (field.value ?? '')) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => field.onChange?.(sel.value, sel));
    return sel;
  }

  if (type === 'datalist') {
    const listId = field.listId || `${field.key}-datalist`;
    if (field.options) ensureDatalist(listId, field.options);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = inputClass;
    input.setAttribute('list', listId);
    input.value = field.value ?? '';
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.disabled) input.disabled = true;
    const eventName = field.event || 'input';
    input.addEventListener(eventName, () => field.onChange?.(input.value, input));
    if (eventName !== 'input') {
      input.addEventListener('input', () => input.classList.remove('prop-input-error'));
    }
    return input;
  }

  // text | number (and any other plain <input> type)
  const input = document.createElement('input');
  input.type = type;
  input.className = inputClass;
  input.value = field.value ?? '';
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.step != null) input.step = field.step;
  if (field.min != null) input.min = field.min;
  if (field.max != null) input.max = field.max;
  if (field.disabled) input.disabled = true;
  const eventName = field.event || 'input';
  input.addEventListener(eventName, () => field.onChange?.(input.value, input));
  if (eventName !== 'input') {
    input.addEventListener('input', () => input.classList.remove('prop-input-error'));
  }
  return input;
}

/**
 * Build a single `.prop-row` (label span + input) for a field descriptor.
 */
export function buildFieldRow(field) {
  const row = document.createElement(field.type === 'checkbox' ? 'label' : 'div');
  row.className = 'prop-row';

  const label = document.createElement('span');
  label.className = 'prop-key';
  label.textContent = field.label ?? field.key;

  const input = buildFieldInput(field);
  row.append(label, input);
  return row;
}

function createGroupShell(title, createGroupTitle) {
  const group = document.createElement('div');
  group.className = 'prop-group';
  if (typeof createGroupTitle === 'function') {
    group.appendChild(createGroupTitle(title));
  } else {
    const heading = document.createElement('div');
    heading.className = 'prop-group-title';
    heading.textContent = title;
    group.appendChild(heading);
  }
  return group;
}

/**
 * Append an editable property group to `container`.
 * @param {string} title
 * @param {object[]} fields  field descriptors (see buildFieldInput)
 * @param {Element} container
 * @param {(title: string) => Element} [createGroupTitle]
 */
export function addEditablePropGroup(title, fields, container, createGroupTitle) {
  const group = createGroupShell(title, createGroupTitle);
  for (const field of fields) group.appendChild(buildFieldRow(field));
  container.appendChild(group);
  return group;
}

/**
 * Compact variant (grid cells with small uppercase keys), same input support.
 */
export function addCompactEditablePropGroup(title, fields, container, createGroupTitle) {
  const group = createGroupShell(title, createGroupTitle);
  const row = document.createElement('div');
  row.className = 'prop-compact-grid';
  for (const field of fields) {
    const cell = document.createElement('label');
    cell.className = 'prop-compact-cell';
    const label = document.createElement('span');
    label.className = 'prop-compact-key';
    label.textContent = field.label ?? field.key;
    const input = buildFieldInput(field, { compact: true });
    cell.append(label, input);
    row.appendChild(cell);
  }
  group.appendChild(row);
  container.appendChild(group);
  return group;
}
