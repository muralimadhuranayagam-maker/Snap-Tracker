const CACHE_NAME = 'snapserve-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let standard fetch proceed normally
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
