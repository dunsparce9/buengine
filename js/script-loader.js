/**
 * Loads JSON scene/script files from the scripts/ directory.
 * Caches loaded scripts so each file is fetched only once.
 */
export class ScriptLoader {
  constructor(basePath = 'scripts') {
    this.basePath = basePath;
    /** @type {Map<string, object>} */
    this._cache = new Map();
  }

  /**
   * Load a script by ID (filename without extension).
   * @param {string} id  e.g. "intro" loads scripts/intro.json
   * @returns {Promise<object>}
   */
  async load(id) {
    if (this._cache.has(id)) return this._cache.get(id);

    const url = `${this.basePath}/${encodeURIComponent(id)}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Script not found: ${url} (${res.status})`);
    const data = await res.json();
    this._cache.set(id, data);
    return data;
  }
}
