export function createSectionHeader(title, {
  iconMap = null,
  onClick = null,
} = {}) {
  const heading = document.createElement('div');
  heading.className = 'prop-group-title';

  const label = String(title);
  const iconName = resolveSectionIcon(label, iconMap);
  if (iconName) {
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined prop-group-title-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconName;
    heading.appendChild(icon);
  }

  if (typeof onClick === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'prop-group-title-button';
    button.addEventListener('click', onClick);

    const text = document.createElement('span');
    text.className = 'prop-group-title-text';
    text.textContent = label;

    const chevron = document.createElement('span');
    chevron.className = 'material-symbols-outlined prop-group-title-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = 'chevron_right';

    button.append(text, chevron);
    heading.appendChild(button);
    return heading;
  }

  const text = document.createElement('span');
  text.className = 'prop-group-title-text';
  text.textContent = label;
  heading.appendChild(text);
  return heading;
}

function resolveSectionIcon(label, iconMap) {
  if (!iconMap) return '';
  const match = Object.entries(iconMap).find(([prefix]) => label === prefix || label.startsWith(`${prefix} (`));
  return match ? match[1] : '';
}
