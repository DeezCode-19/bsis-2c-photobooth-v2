/* Service Worker: precaches the app shell so the booth runs offline after one successful visit.
   Bump CACHE when you change any file, otherwise returning visitors keep the old version. */
const CACHE = 'bsis2c-photobooth-v4';
const ASSETS = ['./','./index.html','./style.css','./app.js','./manifest.json',
  './assets/favicon.svg','./assets/icon-192.png','./assets/icon-512.png',
  './assets/fonts/space-grotesk-latin-500-normal.woff2','./assets/fonts/space-grotesk-latin-700-normal.woff2'];

// Install fails (and nothing is claimed as cached) if any asset cannot be fetched.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Remove caches from older versions.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache-first for our own files only. Camera streams and photos never pass through here
// (photos are in-memory canvases/Blob URLs, not network requests).
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit ||
    fetch(req).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
