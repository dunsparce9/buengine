const CACHE_VERSION = 'd0246accf3e7cd13';
const RELEASE_BUILD = false;
const CORE_ASSETS = [
  './',
  '../assets/fonts/material-symbols-outlined.ttf',
  '../assets/images/seal.png',
  '../css/material-symbols.css',
  '../js/shared/action-schema.js',
  '../js/shared/expressions.js',
  '../js/shared/script-data.js',
  './assets/icon.svg',
  './css/action-editor.css',
  './css/base.css',
  './css/context-menu.css',
  './css/editor.css',
  './css/file-panel.css',
  './css/floating-window.css',
  './css/hover-tooltip.css',
  './css/items-viewer.css',
  './css/layout.css',
  './css/menu.css',
  './css/properties.css',
  './css/toast.css',
  './css/toolbars.css',
  './css/viewport.css',
  './css/welcome.css',
  './index.html',
  './js/action-editor.js',
  './js/action-editor/clipboard.js',
  './js/action-editor/drag.js',
  './js/action-editor/expression-input.js',
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
  './js/core/action-context.js',
  './js/core/history.js',
  './js/core/items-actions.js',
  './js/core/scene-actions.js',
  './js/core/state.js',
  './js/data/file-types.js',
  './js/data/fs-provider.js',
  './js/data/script-store.js',
  './js/data/zip-utils.js',
  './js/editor.js',
  './js/editors/list-editor.js',
  './js/editors/options-editor.js',
  './js/editors/sequence-editor.js',
  './js/panels/file-panel.js',
  './js/panels/items-viewer.js',
  './js/panels/media-info.js',
  './js/panels/properties.js',
  './js/panels/viewport.js',
  './js/ui/confirm-dialog.js',
  './js/ui/context-menu.js',
  './js/ui/editor-toolbar.js',
  './js/ui/field-rows.js',
  './js/ui/floating-window.js',
  './js/ui/hover-tooltip.js',
  './js/ui/menu.js',
  './js/ui/resize.js',
  './js/ui/section-header.js',
  './manifest.webmanifest',
];

// Scope separates source, dist, and other installations on the same origin.
const CACHE_PREFIX = `buengine-editor:${self.registration.scope}:`;
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const CORE_URLS = new Set(CORE_ASSETS.map((path) => new URL(path, self.location.href).href));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(
      CORE_ASSETS.map((path) => new Request(path, { cache: 'reload' }))
    ))
  );
  // Updates wait for the app to finish saving before it requests activation.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

async function serveCoreAsset(request, cacheURL) {
  const cache = await caches.open(CACHE_NAME);
  // Releases use a single installed snapshot; source stays fresh while editing.
  if (RELEASE_BUILD) {
    const cached = await cache.match(cacheURL);
    if (cached) return cached;
  }
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok && response.type !== 'opaque') {
      await cache.put(cacheURL, response.clone());
      return response;
    }
    // A failed deployment should not replace a working cached editor with a 404.
    return await cache.match(cacheURL) || response;
  } catch {
    const cached = await cache.match(cacheURL);
    if (cached) return cached;
    throw new Error(`No cached response for ${request.url}`);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Query strings on navigations should still open the offline editor shell.
  if (event.request.mode === 'navigate') url.search = '';
  if (!CORE_URLS.has(url.href)) return;
  event.respondWith(serveCoreAsset(event.request, url.href));
});
