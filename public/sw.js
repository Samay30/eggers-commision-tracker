// Eggers Commission Tracker service worker.
// Deliberately conservative: this app shows sensitive comp data, so we NEVER
// cache HTML pages or API responses. We only pre-cache static, non-sensitive
// assets (icons, manifest, offline page) and serve an offline fallback when a
// navigation fails. This is enough to make the app installable while keeping
// private data out of the cache.

const CACHE = 'ees-static-v1';
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: always go to the network (fresh, authenticated data).
  // If offline, show the offline fallback. Never cache the HTML itself.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  // Never touch API or auth traffic.
  if (url.pathname.startsWith('/api/')) return;

  // Static same-origin assets: cache-first is safe and fast.
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return res;
      }))
    );
  }
});
