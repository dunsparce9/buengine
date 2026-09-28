/**
 * Shared ActionEditor viewer context (review phase 5, item 24).
 *
 * Previously every properties/viewport call site hand-built
 * `{ sceneId, sceneData, markDirty, focusScene }` inline (5+ copies).
 * There is now exactly one construction point per selection.
 */

import { state, markDirty } from './state.js';
import { selectScript } from '../panels/file-panel.js';

export function focusSceneInEditor(sceneId) {
  if (!sceneId) return;
  const target = state.scripts[sceneId];
  if (!target || Array.isArray(target) || sceneId === '_game') return;
  selectScript(sceneId);
}

/**
 * Build the viewer context for a scene's actions.
 * Returns a minimal `{ markDirty }` stub when there is no scene
 * (e.g. the items table) so callers can spread unconditionally.
 */
export function makeActionViewerContext(sceneData) {
  if (!sceneData || Array.isArray(sceneData)) return { markDirty };
  return {
    sceneId: sceneData.id,
    sceneData,
    markDirty,
    focusScene: focusSceneInEditor,
  };
}

/** Convenience: viewer context plus an onChange handler for openActionEditor. */
export function makeActionEditorOpts(sceneData, onChange) {
  return {
    onChange,
    ...makeActionViewerContext(sceneData),
  };
}
