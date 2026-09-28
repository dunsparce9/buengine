/**
 * Shared asset-path resolver singleton.
 * basePath is set by main.js when a game is selected; assetMap holds
 * editor-preview blob URLs and takes priority over basePath.
 */
export const Paths = {
  /** Base path of the current game folder (e.g. "games/playground"). */
  basePath: '',
  /** @type {Map<string, string>|null} Preview asset blob URL map. */
  assetMap: null,

  /**
   * Resolve a relative asset path against the game's base directory.
   * @param {string} path
   * @returns {string}
   */
  resolve(path) {
    if (this.assetMap && path && this.assetMap.has(path)) return this.assetMap.get(path);
    if (!this.basePath || !path) return path;
    return `${this.basePath}/${path}`;
  },
};
