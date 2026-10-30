/* Service Worker: precaches the app shell so the booth runs offline after one successful visit.
   Bump CACHE when you change any file, otherwise returning visitors keep the old version.
   CONFIG.cacheName in app.js must use the same version string. */
const CACHE = 'bsis2c-photobooth-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/favicon.svg',
  './assets/logo.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/fonts/press-start-2p-latin-400-normal.woff2',
  './assets/fonts/vt323-latin-400-normal.woff2',
  './assets/icons/alert.svg',
  './assets/icons/camera.svg',
  './assets/icons/check.svg',
  './assets/icons/chevron-left.svg',
  './assets/icons/download.svg',
  './assets/icons/lock.svg',
  './assets/icons/refresh.svg',
  './assets/icons/shield.svg',
  './assets/icons/spark.svg',
  './assets/icons/wifi-off.svg'
];

// Install fails (and nothing is claimed as cached) if any asset cannot be fetched.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Remove caches from older versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for our own files only. Camera streams and photos never pass through here
// (photos are in-memory canvases and Blob URLs, not network requests).
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then(hit => hit || fetch(request).catch(() => {
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
