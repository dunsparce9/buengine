/**
 * Game picker overlay: lists available games plus an editor shortcut.
 *
 * Bus events listened: none (selection is reported via the onSelect callback).
 *
 * DOM owned:
 *   #game-selector  overlay container
 *   #editor-entry   editor shortcut
 *   #game-list      game entries are rendered here
 */
export class GameSelector {
  /**
   * @param {(id: string) => void} onSelect called with the chosen game folder id
   */
  constructor(onSelect) {
    this.onSelect = onSelect;
    this.overlay = document.getElementById('game-selector');
    this.editorEntry = document.getElementById('editor-entry');
    this.listEl  = document.getElementById('game-list');

    this.editorEntry.addEventListener('click', () => {
      window.location.href = 'editor/index.html';
    });
  }

  /** Fetch games/index.json, render entries and reveal the overlay. */
  async show() {
    try {
      const res = await fetch('games/index.json');
      if (!res.ok) throw new Error('Failed to load game list');
      const gameIds = await res.json();

      // Fetch all manifests in parallel for display
      const entries = await Promise.all(gameIds.map(async (id) => {
        try {
          const r = await fetch(`games/${encodeURIComponent(id)}/_game.json`);
          return { id, manifest: await r.json() };
        } catch { return { id, manifest: {} }; }
      }));

      this.listEl.innerHTML = '';
      for (const { id, manifest } of entries) {
        const entry = document.createElement('button');
        entry.className = 'game-entry';
        entry.type = 'button';

        const icon = document.createElement('span');
        icon.className = 'game-entry-icon material-symbols-outlined';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'stadia_controller';
        entry.appendChild(icon);

        const copy = document.createElement('span');
        copy.className = 'game-entry-copy';
        const title = document.createElement('span');
        title.className = 'game-entry-title';
        title.textContent = manifest.title || id;
        copy.appendChild(title);
        if (manifest.subtitle) {
          const sub = document.createElement('span');
          sub.className = 'game-entry-subtitle';
          sub.textContent = manifest.subtitle;
          copy.appendChild(sub);
        }
        entry.appendChild(copy);
        entry.addEventListener('click', () => this.onSelect(id));
        this.listEl.appendChild(entry);
      }
    } catch {
      this.listEl.innerHTML = '<p style="opacity:0.7">No games found.</p>';
    }
    this.overlay.classList.remove('hidden');
  }

  /** Hide the overlay (after a game has been selected). */
  hide() {
    this.overlay.classList.add('hidden');
  }
}
