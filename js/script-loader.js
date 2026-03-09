/**
 * Loads and caches scene JSON scripts for the engine.
 *
 * Base path is set by `setBasePath()` when a game is selected.
 * When the page is opened with ?preview, loads override data
 * from localStorage key `buegame_editor_preview`.
 */
export class ScriptLoader {
  constructor() {
    /** @type {string} */
    this.basePath = '';
    /** @type {Map<string, object>} */
    this._cache = new Map();
    /** @type {Map<string, object>|null} */
    this._previewOverrides = null;
    /** @type {Map<string, string>} */
    this._previewAssetUrls = new Map();

    // Editor preview mode: pre-populate cache from localStorage
    if (new URLSearchParams(location.search).has('preview')) {
      try {
        const raw = localStorage.getItem('buegame_editor_preview');
        if (raw) {
          const parsed = JSON.parse(raw);
          const scripts = parsed?.scripts ?? parsed;
          const assetUrls = parsed?.assetUrls ?? {};
          this._previewOverrides = new Map(Object.entries(scripts));
          this._previewAssetUrls = new Map(Object.entries(assetUrls));
          for (const [id, data] of this._previewOverrides) {
            this._cache.set(id, data);
          }
        }
      } catch {
        /* ignore corrupt data */
      }
    }
  }

  /** Update the base path (e.g. when a different game is selected). */
  setBasePath(path) {
    this.basePath = path;
    this._cache.clear();
    // Re-apply editor preview overrides that were wiped by clear()
    if (this._previewOverrides) {
      for (const [id, data] of this._previewOverrides) {
        this._cache.set(id, data);
      }
    }
  }

  /**
   * Resolve a relative asset path against the current source.
   * @param {string} relativePath
   * @returns {string}
   */
  resolvePath(relativePath) {
    if (!relativePath) return relativePath;
    if (this._previewAssetUrls.has(relativePath)) {
      return this._previewAssetUrls.get(relativePath);
    }
    if (!this.basePath) return relativePath;
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
