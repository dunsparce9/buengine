const CACHE_NAME = 'buengine-editor-v7';
const CORE_ASSETS = [
  './',
  './assets/icon.svg',
  './css/action-editor.css',
  './css/base.css',
  './css/context-menu.css',
  './css/editor.css',
  './css/file-panel.css',
  './css/floating-window.css',
  './css/items-viewer.css',
  './css/layout.css',
  './css/menu.css',
  './css/properties.css',
  './css/toast.css',
  './css/toolbars.css',
  './css/viewport.css',
  './index.html',
  './js/action-context.js',
  './js/action-editor.js',
  './js/action-editor/drag.js',
  './js/action-editor/forms.js',
  './js/action-editor/index.js',
  './js/action-editor/renderers.js',
  './js/action-editor/state.js',
  './js/action-editor/utils.js',
  './js/app/archive.js',
  './js/app/index.js',
  './js/app/preview.js',
  './js/app/pwa.js',
  './js/app/recent-folders.js',
  './js/app/ui.js',
  './js/app/workspace.js',
  './js/confirm-dialog.js',
  './js/context-menu.js',
  './js/editor-toolbar.js',
  './js/editor.js',
  './js/field-rows.js',
  './js/file-panel.js',
  './js/file-types.js',
  './js/floating-window.js',
  './js/fs-provider.js',
  './js/items-actions.js',
  './js/items-viewer.js',
  './js/list-editor.js',
  './js/media-info.js',
  './js/menu.js',
  './js/options-editor.js',
  './js/properties.js',
  './js/resize.js',
  './js/scene-actions.js',
  './js/script-store.js',
  './js/section-header.js',
  './js/sequence-editor.js',
  './js/state.js',
  './js/viewport.js',
  './js/zip-utils.js',
  './manifest.webmanifest',
  '../js/action-schema.js',
  '../js/script-data.js',
];

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function shouldCache(request, response) {
  return request.method === 'GET' && response.ok && response.type !== 'opaque';
}

async function cacheResponse(request, response) {
  if (!shouldCache(request, response)) return response;
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return cacheResponse(request, response);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`No cached response for ${request.url}`);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(event.request));
});
