/**
 * Asset media-metadata inspector (extracted from properties.js — review phase 5).
 *
 * Renders the File/Info groups for a selected non-script asset and lazily
 * resolves size, mime, dates, image dimensions and audio/video duration.
 */

import { state, dom, escapeHtml } from '../core/state.js';
import { findNode } from '../data/fs-provider.js';
import { getFileExtension, getFileKind, isPreviewableMedia } from '../data/file-types.js';
import { createSectionHeader } from '../ui/section-header.js';

let _assetInfoRequestId = 0;

const MEDIA_SECTION_ICONS = {
  'File': 'draft',
  'Info': 'info',
};

function createMediaGroupTitle(title, options) {
  return createSectionHeader(title, {
    iconMap: MEDIA_SECTION_ICONS,
    ...options,
  });
}

export function renderAssetProps(path) {
  const kind = getFileKind(path);
  const name = path.split('/').pop() || path;
  const preview = isPreviewableMedia(path) ? 'Yes' : 'No';

  addMediaPropGroup('File', [
    ['name', name],
    ['path', path],
    ['type', kind],
    ['extension', getFileExtension(path) || '—'],
    ['preview', preview],
  ]);

  const detailsGroup = createAsyncPropGroup('Info', 'Loading file info...');
  dom.propsContent.appendChild(detailsGroup.group);
  void loadAssetInfo(path, kind, detailsGroup);
}

function addMediaPropGroup(title, rows) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  group.appendChild(createMediaGroupTitle(title));

  for (const [key, val] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML =
      `<span class="prop-key">${escapeHtml(String(key))}</span>` +
      `<span class="prop-val">${escapeHtml(String(val))}</span>`;
    group.appendChild(row);
  }

  dom.propsContent.appendChild(group);
}

async function loadAssetInfo(path, kind, detailsGroup) {
  const requestId = ++_assetInfoRequestId;

  try {
    const file = await readSelectedFile(path);
    if (!file || requestId !== _assetInfoRequestId) return;
    if (state.selectedPath !== path || state.selectedId) return;

    const rows = [
      ['size', formatBytes(file.size)],
      ['mime', file.type || inferMime(path)],
      ['modified', formatDate(file.lastModified)],
    ];

    if (kind === 'image') {
      const meta = await readImageInfo(file, path);
      if (requestId !== _assetInfoRequestId || state.selectedPath !== path || state.selectedId) return;
      if (meta) rows.push(['dimensions', `${meta.width} × ${meta.height}`]);
    } else if (kind === 'audio' || kind === 'video') {
      const meta = await readMediaInfo(file, kind);
      if (requestId !== _assetInfoRequestId || state.selectedPath !== path || state.selectedId) return;
      if (meta) {
        rows.push(['duration', formatDuration(meta.duration)]);
        if (kind === 'video' && meta.width && meta.height) {
          rows.push(['dimensions', `${meta.width} × ${meta.height}`]);
        }
      }
    }

    setAsyncPropRows(detailsGroup, rows);
  } catch (err) {
    if (requestId !== _assetInfoRequestId) return;
    setAsyncPropMessage(detailsGroup, `Unable to read file info: ${err.message}`);
  }
}

async function readSelectedFile(path) {
  const node = findNode(path);
  if (!node || node.type !== 'file') return null;
  return await node.handle.getFile();
}

function readImageInfo(file, path) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
    img.alt = path;
  });
}

function readMediaInfo(file, kind) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done({
      duration: el.duration,
      width: 'videoWidth' in el ? el.videoWidth : 0,
      height: 'videoHeight' in el ? el.videoHeight : 0,
    });
    el.onerror = () => done(null);
    el.src = url;
  });
}

function createAsyncPropGroup(title, message) {
  const group = document.createElement('div');
  group.className = 'prop-group';

  const heading = createMediaGroupTitle(title);

  const body = document.createElement('div');
  body.className = 'prop-async-body';
  body.textContent = message;

  group.append(heading, body);
  return { group, body };
}

function setAsyncPropRows(target, rows) {
  target.body.innerHTML = '';
  for (const [key, val] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML =
      `<span class="prop-key">${escapeHtml(String(key))}</span>` +
      `<span class="prop-val">${escapeHtml(String(val))}</span>`;
    target.body.appendChild(row);
  }
}

function setAsyncPropMessage(target, message) {
  target.body.textContent = message;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    return `${hours}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function inferMime(path) {
  const ext = getFileExtension(path);
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    opus: 'audio/ogg',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    webm: 'video/webm',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return map[ext] || '—';
}
