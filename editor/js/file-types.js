const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const AUDIO_EXTS = new Set(['opus', 'mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac']);
const VIDEO_EXTS = new Set(['webm', 'mp4', 'mov']);

export function getFileExtension(path = '') {
  const name = path.split('/').pop() || '';
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function getFileKind(path = '') {
  const ext = getFileExtension(path);
  if (ext === 'json') return 'json';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'other';
}

export function isPreviewableMedia(path = '') {
  const kind = getFileKind(path);
  return kind === 'image' || kind === 'audio' || kind === 'video';
}
