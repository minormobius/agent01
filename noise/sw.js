const CACHE = "noise-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./docs.html",
  "./manifest.json",
  "./icon-192.svg",
  "./icon-512.svg"
];

// Install — cache all assets
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network-first, fall back to cache
self.addEventListener("fetch", e => {
  if (e.request.url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match(e.request))
    );
  }
});
