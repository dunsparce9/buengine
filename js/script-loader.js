/**
 * Loads JSON scene/script files from the scripts/ directory.
 * Caches loaded scripts so each file is fetched only once.
 *
 * When the page is opened with ?preview, loads override data
 * from localStorage (set by the editor) instead of fetching files.
 */
export class ScriptLoader {
  constructor(basePath = '') {
    this.basePath = basePath;
    /** @type {Map<string, object>} */
    this._cache = new Map();

    // Editor preview mode: pre-populate cache from localStorage
    if (new URLSearchParams(location.search).has('preview')) {
      try {
        const raw = localStorage.getItem('buegame_editor_preview');
        if (raw) {
          const overrides = JSON.parse(raw);
          for (const [id, data] of Object.entries(overrides)) {
            this._cache.set(id, data);
          }
        }
      } catch { /* ignore corrupt data */ }
    }
  }

  /** Update the base path (e.g. when a different game is selected). */
  setBasePath(path) {
    this.basePath = path;
    this._cache.clear();
  }

  /**
   * Resolve a relative asset path against the current base.
   * @param {string} relativePath
   * @returns {string}
   */
  resolvePath(relativePath) {
    if (!this.basePath || !relativePath) return relativePath;
    return `${this.basePath}/${relativePath}`;
  }

  /**
   * Load a script by ID (filename without extension).
   * @param {string} id  e.g. "intro" → {basePath}/intro.json
   * @returns {Promise<object>}
   */
  async load(id) {
    if (this._cache.has(id)) return this._cache.get(id);

    const prefix = this.basePath ? `${this.basePath}/` : '';
    const url = `${prefix}${encodeURIComponent(id)}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Script not found: ${url} (${res.status})`);
    const data = await res.json();
    this._cache.set(id, data);
    return data;
  }
}
