/** Delegated editor tooltips, styled after izci's HoverTooltip component. */
export function initHoverTooltips() {
  const tooltip = document.createElement('div');
  tooltip.id = 'editor-hover-tooltip';
  tooltip.className = 'hover-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltip);

  let anchor = null;
  const observer = new MutationObserver((records) => {
    if (records.every(({ target }) => tooltip.contains(target))) return;
    if (!anchor?.isConnected || !anchor.getClientRects().length
      || anchor.closest('[hidden], .hidden')
      || getComputedStyle(anchor).visibility === 'hidden'
      || !anchor.dataset.tooltip) {
      hide();
    } else {
      position();
    }
  });

  function position() {
    if (!anchor) return;
    const text = anchor.dataset.tooltip;
    if (tooltip.textContent !== text) tooltip.textContent = text;
    const rect = anchor.getBoundingClientRect();
    const inset = 6;
    const gap = 4;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const above = rect.bottom + gap + height > window.innerHeight - inset;
    const left = rect.right - width;
    const top = above ? rect.top - height - gap : rect.bottom + gap;
    tooltip.classList.toggle('is-above', above);
    tooltip.style.left = `${Math.max(inset, Math.min(left, window.innerWidth - width - inset))}px`;
    tooltip.style.top = `${Math.max(inset, Math.min(top, window.innerHeight - height - inset))}px`;
  }

  function hide() {
    observer.disconnect();
    if (anchor) {
      const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/)
        .filter((id) => id && id !== tooltip.id);
      if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
      else anchor.removeAttribute('aria-describedby');
    }
    anchor = null;
    tooltip.classList.remove('is-visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  function show(target) {
    if (!(target instanceof Element)) return;
    const next = target.closest('[data-tooltip]');
    if (!next?.dataset.tooltip) return;
    if (anchor === next) return;
    hide();
    anchor = next;
    const ids = new Set((anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(tooltip.id);
    anchor.setAttribute('aria-describedby', [...ids].join(' '));
    position();
    tooltip.setAttribute('aria-hidden', 'false');
    tooltip.classList.add('is-visible');
    // Watch only while visible, so closed/rebuilt windows cannot leave stale hints.
    observer.observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-tooltip', 'class', 'style', 'hidden'],
    });
  }

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'touch') show(event.target);
  });
  document.addEventListener('pointerout', (event) => {
    if (anchor && !anchor.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('focusin', (event) => {
    if (event.target.matches(':focus-visible')) show(event.target);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  }, true);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('dragstart', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
}
