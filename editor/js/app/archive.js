import { state } from '../state.js';
import { writeFileBinary, readFileBinary, collectAllPaths } from '../fs-provider.js';
import { createZip, readZip } from '../zip-utils.js';
import { showToast } from './ui.js';
import { confirmDiscardUnsavedChanges, loadWorkspaceFromHandle } from './workspace.js';
import { closeTransientWindows } from '../floating-window.js';

export function exportCurrentJson() {
  if (!state.selectedId || !state.scripts[state.selectedId]) return;
  const data = state.scripts[state.selectedId];
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${state.selectedId}.json`);
}

export async function exportZip() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }

  try {
    showToast('Preparing ZIP…');
    const rootHandle = state.rootHandle;
    const files = [];
    for (const path of collectAllPaths()) {
      if (state.rootHandle !== rootHandle) throw new Error('The open folder changed during export');
      const buf = await readFileBinary(path);
      files.push({ path, data: new Uint8Array(buf) });
    }

    const folderName = rootHandle.name || 'game';
    const blob = createZip(files.map((file) => ({
      path: `${folderName}/${file.path}`,
      data: file.data,
    })));
    downloadBlob(blob, `${folderName}.zip`);
    showToast(`Exported ${files.length} files`);
  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error');
  }
}

export async function importZip() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }
  const rootHandle = state.rootHandle;
  const scripts = state.scripts;
  const isCurrentWorkspace = () => state.rootHandle === rootHandle && state.scripts === scripts;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    let count = 0;
    let writeStarted = false;
    let importError = null;
    try {
      const buf = await file.arrayBuffer();
      const entries = readZip(buf);
      if (!entries.length) {
        showToast('ZIP is empty', 'error');
        return;
      }
      if (!isCurrentWorkspace()) throw new Error('The workspace changed; select the ZIP again');
      if (!await confirmDiscardUnsavedChanges(
        'You have unsaved changes. Importing a ZIP will reload the editor and discard them. Continue?'
      )) return;
      if (!isCurrentWorkspace()) throw new Error('The workspace changed; select the ZIP again');

      const prefix = findCommonPrefix(entries.map((entry) => entry.path));
      closeTransientWindows();
      for (const entry of entries) {
        const relativePath = prefix ? entry.path.slice(prefix.length) : entry.path;
        if (!relativePath) continue;
        if (!isCurrentWorkspace()) throw new Error('The workspace changed during import');
        writeStarted = true;
        try {
          await writeFileBinary(relativePath, entry.data, rootHandle);
        } catch (err) {
          throw new Error(`${relativePath}: ${err.message}`);
        }
        count++;
      }
    } catch (err) {
      importError = err;
    }

    // A failed write can still change disk contents. Reload that workspace too,
    // so cached scripts and editing windows cannot overwrite partial imports.
    if (writeStarted && isCurrentWorkspace()) {
      try {
        await loadWorkspaceFromHandle(rootHandle, { notify: false });
      } catch (err) {
        importError = importError || err;
      }
    }
    if (importError) showToast(`Import failed after ${count} files: ${importError.message}`, 'error');
    else showToast(`Imported ${count} files from ZIP`);
  });
  input.click();
}

function findCommonPrefix(paths) {
  if (paths.length === 0) return '';
  const parts0 = paths[0].split('/');
  let depth = 0;

  outer:
  for (let i = 0; i < parts0.length - 1; i++) {
    const segment = parts0[i];
    for (const path of paths) {
      const parts = path.split('/');
      if (parts[i] !== segment) break outer;
    }
    depth = i + 1;
  }

  if (depth === 0) return '';
  return `${parts0.slice(0, depth).join('/')}/`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
