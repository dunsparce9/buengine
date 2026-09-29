/** Automatic and manual snapshots, scoped to the game and hosting directory. */
export class SaveStore {
  constructor() {
    this.game = null;
    this._prefix = `buengine_save_v1:${new URL('.', location.href).pathname}:`;
  }

  select(game) { this.game = game; }

  read(slot = 'auto') {
    if (!this.game) return null;
    const raw = localStorage.getItem(this._prefix + this.game + ':' + slot);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (save.version !== 1 || save.game !== this.game || !save.state?.currentScene
        || !Array.isArray(save.state.flags) || !Array.isArray(save.state.history)
        || !save.sceneData || !Array.isArray(save.scene?.entities)
        || !Array.isArray(save.inventory?.items) || !Array.isArray(save.inventory?.definitions)
        || !Array.isArray(save.runner?.children) || !Array.isArray(save.runner?.frames)
        || !Array.isArray(save.scene.animations) || !Array.isArray(save.scripts)
        || !save.ui?.inventory || !Array.isArray(save.sound)) {
      throw new Error('This game save is invalid or uses an unsupported format.');
    }
    return save;
  }

  write(snapshot, slot = 'auto') {
    if (!this.game) return false;
    localStorage.setItem(this._prefix + this.game + ':' + slot,
      JSON.stringify({ ...snapshot, version: 1, game: this.game, savedAt: Date.now() }));
    return true;
  }

  clear() {
    if (this.game) {
      localStorage.removeItem(this._prefix + this.game + ':auto');
      localStorage.removeItem(this._prefix + this.game + ':manual');
    }
  }
}
