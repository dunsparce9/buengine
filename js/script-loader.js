/**
 * Loads JSON scene/script files from the selected game directory.
 * Caches loaded scripts so each file is fetched only once.
 *
 * When the page is opened with ?preview, loads override data
 * from localStorage (set by the editor) instead of fetching files.
 */
import { normalizeSceneSequences } from './script-data.js';
export { normalizeSceneSequences } from './script-data.js';

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
        const raw = localStorage.getItem('buengine_editor_preview');
        if (raw) {
          const overrides = JSON.parse(raw);
          this._previewOverrides = new Map(Object.entries(overrides));
          for (const [id, data] of this._previewOverrides) {
            this._cache.set(id, normalizeSceneSequences(data));
          }
        }
      } catch { /* ignore corrupt data */ }

      // Load asset blob URL mapping (set by editor for local folders)
      try {
        const rawAssets = localStorage.getItem('buengine_editor_assets');
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
    // A fresh cache also isolates fetches still completing for the previous game.
    this._cache = new Map(this._previewOverrides || []);
  }

  /** Whether a script is already available (including preview overrides). */
  has(id) { return this._cache.has(id); }

  /**
   * Load a script by ID (filename without extension).
   * @param {string} id  e.g. "intro" → {basePath}/intro.json
   * @param {{ optional?: boolean }} [opts] Missing optional scripts return null.
   * @returns {Promise<object|null>}
   */
  async load(id, { optional = false } = {}) {
    const cache = this._cache;
    if (cache.has(id)) return cache.get(id);

    const prefix = this.basePath ? `${this.basePath}/` : '';
    // Encode each path segment separately so nested ids like "items/items.json"
    // keep their "/" separators instead of producing "%2F" URLs.
    const encodedId = id.split('/').map(encodeURIComponent).join('/');
    const url = `${prefix}${encodedId}.json`;
    const res = await fetch(url);
    if (optional && res.status === 404) return null;
    if (!res.ok) throw new Error(`Script not found: ${url} (${res.status})`);
    const data = normalizeSceneSequences(await res.json());
    cache.set(id, data);
    return data;
  }
}
