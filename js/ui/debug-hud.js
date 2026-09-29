/**
 * Debug HUD (toggle with key "1").
 *
 * Shows/hides the grid overlay and a readout box with the current scene id,
 * the hovered tile coordinates and the hovered scene object.
 *
 * DOM owned:
 *   #grid-overlay  visibility toggle only (grid CSS vars stay in main.js)
 *   #debug-box     readout container
 *   #debug-tile    hovered tile coordinates
 *   #debug-object  hovered scene object
 *   #debug-scene   current scene id (updated via setScene())
 */
export class DebugHud {
  /**
   * @param {() => object|null} getSceneData accessor for the loaded scene data
   *   ({ grid, objects }); null while no scene is active
   */
  constructor(getSceneData) {
    this.getSceneData = getSceneData;
    this.active = false;

    this.gridOverlay = document.getElementById('grid-overlay');
    this.debugBox    = document.getElementById('debug-box');
    this.debugTile   = document.getElementById('debug-tile');
    this.debugObject = document.getElementById('debug-object');
    this.debugScene  = document.getElementById('debug-scene');
    this.sceneLayer  = document.getElementById('scene-layer');

    document.addEventListener('keydown', (e) => {
      if (e.key === '1') {
        this.active = !this.active;
        this.gridOverlay.classList.toggle('hidden', !this.active);
        this.debugBox.classList.toggle('hidden', !this.active);
      }
    });

    this.sceneLayer.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.sceneLayer.addEventListener('mouseleave', () => this._onMouseLeave());
  }

  /** Update the scene readout (called once a scene has finished loading). */
  setScene(id) {
    this.debugScene.textContent = `Scene: ${id}`;
  }

  restore(active) {
    this.active = active;
    this.gridOverlay.classList.toggle('hidden', !active);
    this.debugBox.classList.toggle('hidden', !active);
  }

  /** @private */
  _onMouseMove(e) {
    const data = this.getSceneData();
    if (!this.active || !data) return;
    const rect = this.sceneLayer.getBoundingClientRect();
    const cols = data.grid?.cols ?? 16;
    const rows = data.grid?.rows ?? 9;
    const tileW = rect.width / cols;
    const tileH = rect.height / rows;
    const tileX = Math.floor((e.clientX - rect.left) / tileW);
    const tileY = Math.floor((e.clientY - rect.top) / tileH);
    this.debugTile.textContent = `Tile: ${tileX}, ${tileY}`;

    // Find hovered object
    let hoveredLabel = '\u2014';
    const objectEl = e.target.closest('.scene-object');
    if (objectEl && this.sceneLayer.contains(objectEl)) hoveredLabel = objectEl.dataset.objectId || '(unnamed)';
    this.debugObject.textContent = `Object: ${hoveredLabel}`;
  }

  /** @private */
  _onMouseLeave() {
    if (!this.active) return;
    this.debugTile.textContent = 'Tile: \u2014, \u2014';
    this.debugObject.textContent = 'Object: \u2014';
  }
}
