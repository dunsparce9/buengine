const CACHE_NAME = 'buegame-editor-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/editor.css',
  './css/base.css',
  './css/menu.css',
  './css/layout.css',
  './css/file-panel.css',
  './css/viewport.css',
  './css/properties.css',
  './css/floating-window.css',
  './css/items-viewer.css',
  './css/action-viewer.css',
  './css/context-menu.css',
  './css/toast.css',
  './assets/icon.svg',
  './js/editor.js',
  './js/app/index.js',
  './js/app/ui.js',
  './js/app/workspace.js',
  './js/app/archive.js',
  './js/app/preview.js',
  './js/app/pwa.js',
  './js/state.js',
  './js/menu.js',
  './js/resize.js',
  './js/context-menu.js',
  './js/floating-window.js',
  './js/items-viewer.js',
  './js/options-editor.js',
  './js/action-viewer.js',
  './js/action-viewer/index.js',
  './js/action-viewer/state.js',
  './js/action-viewer/utils.js',
  './js/action-viewer/renderers.js',
  './js/action-viewer/forms.js',
  './js/action-viewer/drag.js',
  './js/file-panel.js',
  './js/properties.js',
  './js/viewport.js',
  './js/script-loader.js',
  './js/fs-provider.js',
  './js/file-types.js',
  './js/zip-utils.js'
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
