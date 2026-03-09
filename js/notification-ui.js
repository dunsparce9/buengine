/**
 * Toast-style notification system.
 *
 * Layout:
 *   [TITLE (small caps)]
 *   [ICON]  [CONTENT]
 *   [DESCRIPTION]           ← optional
 *
 * Bus events listened:
 *   notification:show  { title, icon?, content, description? }
 *     title       – heading text (rendered in small caps)
 *     icon        – optional image URL
 *     content     – main line of text
 *     description – optional secondary line
 */
export class NotificationUI {
  /** @param {import('./event-bus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.el = document.getElementById('notification-container');

    bus.on('notification:show', (data) => this._show(data));
  }

  /**
   * Display a notification toast.
   * @param {{ title: string, icon?: string, content: string, description?: string }} data
   */
  _show({ title, icon, content, description }) {
    const toast = document.createElement('div');
    toast.className = 'notif-toast';

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'notif-title';
    titleEl.textContent = title;
    toast.appendChild(titleEl);

    // Body row: icon + content
    const body = document.createElement('div');
    body.className = 'notif-body';

    if (icon) {
      const img = document.createElement('img');
      img.className = 'notif-icon';
      img.src = icon;
      img.alt = '';
      img.draggable = false;
      body.appendChild(img);
    }

    const contentEl = document.createElement('span');
    contentEl.className = 'notif-content';
    contentEl.textContent = content;
    body.appendChild(contentEl);

    toast.appendChild(body);

    // Description (optional)
    if (description) {
      const desc = document.createElement('div');
      desc.className = 'notif-desc';
      desc.textContent = description;
      toast.appendChild(desc);
    }

    this.el.appendChild(toast);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => toast.classList.add('notif-entering'));

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      toast.classList.remove('notif-entering');
      toast.classList.add('notif-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3000);
  }
}
