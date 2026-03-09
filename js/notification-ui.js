/**
 * Toast-style notification system.
 *
 * Layout:
 *   [TITLE (small caps)]
 *   [ICON]  [CONTENT]
 *   [DESCRIPTION]           ← optional
 *
 * Bus events listened:
 *   notification:show  { title, icon?, content, description?, emit?, payload? }
 *     title       – heading text (rendered in small caps)
 *     icon        – optional image URL
 *     content     – main line of text
 *     description – optional secondary line
 *     emit        – optional bus event to emit when clicked
 *     payload     – optional event payload emitted when clicked
 */
export class NotificationUI {
  /** @param {import('./event-bus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.el = document.getElementById('notification-container');
    this._basePath = '';
    this._assetMap = null;

    bus.on('game:basepath', (bp) => { this._basePath = bp; });
    bus.on('game:assetmap', (map) => { this._assetMap = map; });
    bus.on('notification:show', (data) => this._show(data));
  }

  /** Resolve a relative notification icon path. */
  _resolve(path) {
    if (this._assetMap && path && this._assetMap.has(path)) return this._assetMap.get(path);
    if (!this._basePath || !path) return path;
    return `${this._basePath}/${path}`;
  }

  /**
   * Display a notification toast.
   * @param {{ title: string, icon?: string, content: string, description?: string, emit?: string, payload?: unknown }} data
   */
  _show({ title, icon, content, description, emit, payload }) {
    const toast = document.createElement('div');
    toast.className = 'notif-toast';

    if (emit) {
      toast.classList.add('notif-clickable');
      toast.tabIndex = 0;
      toast.setAttribute('role', 'button');
      const activate = () => {
        this.bus.emit(emit, payload);
        toast.remove();
      };
      toast.addEventListener('click', activate);
      toast.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    }

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
      img.src = this._resolve(icon);
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
