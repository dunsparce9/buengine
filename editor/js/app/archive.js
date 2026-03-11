import { state } from '../state.js';
import { discoverScripts } from '../script-loader.js';
import { renderFileList } from '../file-panel.js';
import { buildTree, writeFileBinary, readFileBinary, collectAllPaths } from '../fs-provider.js';
import { createZip, readZip } from '../zip-utils.js';
import { showToast } from './ui.js';
import { confirmDiscardUnsavedChanges } from './workspace.js';

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

  showToast('Preparing ZIP…');
  const files = [];
  for (const path of collectAllPaths()) {
    try {
      const buf = await readFileBinary(path);
      files.push({ path, data: new Uint8Array(buf) });
    } catch {}
  }

  const folderName = state.rootHandle?.name || 'game';
  const blob = createZip(files.map((file) => ({
    path: `${folderName}/${file.path}`,
    data: file.data,
  })));
  downloadBlob(blob, `${folderName}.zip`);
  showToast(`Exported ${files.length} files`);
}

export async function importZip() {
  if (!state.rootHandle) {
    showToast('No folder open (File → Open Folder)', 'error');
    return;
  }
  if (!await confirmDiscardUnsavedChanges(
    'You have unsaved changes. Importing a ZIP will reload the editor and discard them. Continue?'
  )) {
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const entries = readZip(buf);
      if (!entries.length) {
        showToast('ZIP is empty', 'error');
        return;
      }

      const prefix = findCommonPrefix(entries.map((entry) => entry.path));
      let count = 0;
      for (const entry of entries) {
        const relativePath = prefix ? entry.path.slice(prefix.length) : entry.path;
        if (!relativePath) continue;
        try {
          await writeFileBinary(relativePath, entry.data);
          count++;
        } catch (err) {
          showToast(`Failed: ${entry.path}: ${err.message}`, 'error');
        }
      }

      await buildTree();
      state.scripts = {};
      await discoverScripts();
      renderFileList();
      showToast(`Imported ${count} files from ZIP`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    }
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
