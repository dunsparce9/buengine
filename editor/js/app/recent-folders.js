const DB_NAME = 'buegame-editor';
const STORE_NAME = 'recent-folders';
const MAX_RECENT_FOLDERS = 8;

let dbPromise = null;
let recentFolders = [];
let openRecentFolder = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
  return dbPromise;
}

async function withStore(mode, fn) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result;
    tx.addEventListener('complete', () => resolve(result));
    tx.addEventListener('error', () => reject(tx.error));
    tx.addEventListener('abort', () => reject(tx.error || new Error('IndexedDB transaction aborted')));
    result = fn(store);
  });
}

function normalizeEntry(record) {
  if (!record || !record.handle) return null;
  return {
    id: record.id,
    name: record.name || record.handle.name || 'Unnamed folder',
    handle: record.handle,
    lastPath: typeof record.lastPath === 'string' ? record.lastPath : null,
    lastOpenedAt: record.lastOpenedAt || 0,
  };
}

function sortRecentFolders(entries) {
  return entries.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

function renderRecentFoldersMenu() {
  const panel = document.getElementById('menu-file-recent');
  const entry = document.getElementById('recent-folders-entry');
  if (!panel || !entry) return;

  panel.textContent = '';
  entry.hidden = false;

  if (!recentFolders.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-action menu-action-empty';
    empty.textContent = 'No recent folders';
    panel.appendChild(empty);
    return;
  }

  for (const folder of recentFolders) {
    const button = document.createElement('button');
    button.className = 'menu-action';
    button.dataset.action = 'open-recent-folder';
    button.dataset.recentId = folder.id;

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'folder';

    const label = document.createElement('span');
    label.textContent = folder.name;

    button.append(icon, label);
    panel.appendChild(button);
  }
}

async function readRecentFolders() {
  const records = await withStore('readonly', (store) => {
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
  });
  recentFolders = sortRecentFolders(records.map(normalizeEntry).filter(Boolean)).slice(0, MAX_RECENT_FOLDERS);
  renderRecentFoldersMenu();
  return recentFolders;
}

async function writeEntry(record) {
  await withStore('readwrite', (store) => {
    store.put(record);
  });
}

async function deleteEntry(id) {
  await withStore('readwrite', (store) => {
    store.delete(id);
  });
}

async function trimOverflow() {
  const overflow = recentFolders.slice(MAX_RECENT_FOLDERS);
  if (!overflow.length) return;
  for (const folder of overflow) {
    await deleteEntry(folder.id);
  }
  recentFolders = recentFolders.slice(0, MAX_RECENT_FOLDERS);
}

export async function initRecentFolders(onOpenRecentFolder) {
  openRecentFolder = onOpenRecentFolder;
  if (!('indexedDB' in window)) {
    renderRecentFoldersMenu();
    return;
  }

  try {
    await readRecentFolders();
  } catch (err) {
    console.warn('Failed to load recent folders', err);
    recentFolders = [];
    renderRecentFoldersMenu();
  }
}

export async function rememberRecentFolder(handle) {
  if (!handle || !('indexedDB' in window)) return;

  try {
    if (!recentFolders.length) await readRecentFolders();

    let existing = null;
    for (const folder of recentFolders) {
      if (typeof folder.handle?.isSameEntry === 'function' && await folder.handle.isSameEntry(handle)) {
        existing = folder;
        break;
      }
    }

    const record = {
      id: existing?.id || crypto.randomUUID(),
      name: handle.name || existing?.name || 'Unnamed folder',
      handle,
      lastPath: existing?.lastPath || null,
      lastOpenedAt: Date.now(),
    };

    await writeEntry(record);
    recentFolders = sortRecentFolders([
      record,
      ...recentFolders.filter(folder => folder.id !== record.id),
    ]);
    await trimOverflow();
    renderRecentFoldersMenu();
  } catch (err) {
    console.warn('Failed to store recent folder', err);
  }
}

export async function rememberRecentFolderSelection(handle, path) {
  if (!handle || !path || !('indexedDB' in window)) return;

  try {
    if (!recentFolders.length) await readRecentFolders();

    let existing = null;
    for (const folder of recentFolders) {
      if (typeof folder.handle?.isSameEntry === 'function' && await folder.handle.isSameEntry(handle)) {
        existing = folder;
        break;
      }
    }
    if (!existing || existing.lastPath === path) return;

    const record = {
      id: existing.id,
      name: existing.name,
      handle: existing.handle,
      lastPath: path,
      lastOpenedAt: existing.lastOpenedAt,
    };

    await writeEntry(record);
    recentFolders = recentFolders.map((folder) => folder.id === record.id ? record : folder);
  } catch (err) {
    console.warn('Failed to store recent folder selection', err);
  }
}

export async function handleOpenRecentFolder(button) {
  const id = button?.dataset?.recentId;
  if (!id || typeof openRecentFolder !== 'function') return;

  const folder = recentFolders.find(entry => entry.id === id);
  if (!folder) return;

  const opened = await openRecentFolder(folder);
  if (opened === false) return;
  await rememberRecentFolder(folder.handle);
}
