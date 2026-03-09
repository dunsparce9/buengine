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
    /** @type {Map<string, object>|null} */
    this._previewOverrides = null;
    /** @type {Map<string, string>|null} path → blob URL for local assets */
    this._assetMap = null;

    // Editor preview mode: pre-populate cache from localStorage
    if (new URLSearchParams(location.search).has('preview')) {
      try {
        const raw = localStorage.getItem('buegame_editor_preview');
        if (raw) {
          const overrides = JSON.parse(raw);
          this._previewOverrides = new Map(Object.entries(overrides));
          for (const [id, data] of this._previewOverrides) {
            this._cache.set(id, data);
          }
        }
      } catch { /* ignore corrupt data */ }

      // Load asset blob URL mapping (set by editor for local folders)
      try {
        const rawAssets = localStorage.getItem('buegame_editor_assets');
        if (rawAssets) {
          this._assetMap = new Map(Object.entries(JSON.parse(rawAssets)));
        }
      } catch { /* ignore */ }
    }
  }

  /** Whether running in editor preview mode. */
  get isPreview() { return this._previewOverrides !== null; }

  /** Asset blob URL map (or null if not in local-folder preview mode). */
  get assetMap() { return this._assetMap; }

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
   * Resolve a relative asset path against the current base.
   * In preview mode, checks the asset blob URL map first.
   * @param {string} relativePath
   * @returns {string}
   */
  resolvePath(relativePath) {
    if (this._assetMap && relativePath && this._assetMap.has(relativePath)) {
      return this._assetMap.get(relativePath);
    }
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
