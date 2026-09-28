/**
 * Draggable column resize handles between the three editor panels.
 */

/**
 * @param {Function} onResize  Called after each resize drag move (to re-render viewport).
 */
export function initResizeHandles(onResize) {
  const layout  = document.getElementById('editor-layout');
  const handleL = document.getElementById('resize-left');
  const handleR = document.getElementById('resize-right');

  const MIN_W = 120; // px — minimum panel width

  function getColWidths() {
    const style = getComputedStyle(layout);
    const cols  = style.gridTemplateColumns.split(' ');
    return {
      left:  parseFloat(cols[0]),
      right: parseFloat(cols[4]),
    };
  }

  function makeDragger(handle, side) {
    let startX, startW;

    function onMove(e) {
      const dx    = e.clientX - startX;
      const total = layout.getBoundingClientRect().width;
      let w;

      if (side === 'left') {
        w = Math.max(MIN_W, Math.min(startW + dx, total * 0.5));
        layout.style.setProperty('--left-w', `${w}px`);
      } else {
        w = Math.max(MIN_W, Math.min(startW - dx, total * 0.5));
        layout.style.setProperty('--right-w', `${w}px`);
      }
      onResize();
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = side === 'left' ? getColWidths().left : getColWidths().right;
      handle.classList.add('dragging');
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  makeDragger(handleL, 'left');
  makeDragger(handleR, 'right');
}
