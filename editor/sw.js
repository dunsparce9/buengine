const CACHE_NAME = 'buegame-editor-v1';
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
  './js/state.js',
  './js/menu.js',
  './js/resize.js',
  './js/context-menu.js',
  './js/floating-window.js',
  './js/items-viewer.js',
  './js/action-viewer.js',
  './js/file-panel.js',
  './js/properties.js',
  './js/viewport.js',
  './js/script-loader.js',
  './js/fs-provider.js',
  './js/file-types.js',
  './js/zip-utils.js'
];

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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
