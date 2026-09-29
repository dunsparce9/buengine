import { detectType } from '../../../js/shared/action-schema.js';
import { walkActions } from '../../../js/shared/script-data.js';

// A session-local clipboard shared by all Action Editor windows.
let clipboardText = '';

export function copyActions(actions) {
  clipboardText = JSON.stringify(actions);
}

export function readActionClipboard() {
  try {
    const actions = JSON.parse(clipboardText);
    if (!Array.isArray(actions) || !actions.length) return null;
    let valid = true;
    walkActions(actions, action => {
      if (!action || typeof action !== 'object' || Array.isArray(action)
        || detectType(action) === 'unknown') valid = false;
      for (const key of ['then', 'else', 'do']) {
        if (action?.[key] != null && !Array.isArray(action[key])) valid = false;
      }
    });
    return valid ? actions : null;
  } catch {
    return null;
  }
}
