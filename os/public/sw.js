// Service worker for PDS Shell PWA
const CACHE_NAME = 'pds-os-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('fetch', (event) => {
  // Pass through all XRPC/API calls
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/xrpc/') || url.hostname !== self.location.hostname) {
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
