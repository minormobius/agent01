// Service worker — the part that makes "install this" mean something.
//
// The shell and the whole rules engine are precached, and so is the 475 KiB
// lexicon: with those on disk the offline game is not a degraded mode, it is
// the same game. `/api/*` is never cached — an online game's position is the
// one thing that must not be served stale, and a cached 200 for somebody's
// move would be worse than an honest failure.
//
// CACHE is versioned. Bump it whenever a precached file changes, or installed
// players keep the old engine while the site moves on. That is the single
// maintenance obligation this file carries.

const CACHE = 'words-v3';

const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/engine/rng.js',
  '/engine/tiles.js',
  '/engine/board.js',
  '/engine/dawg.js',
  '/engine/rules.js',
  '/engine/movegen.js',
  '/engine/game.js',
  '/engine/ai.js',
  '/dict/lexicon.dawg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One miss must not fail the whole install, or a single renamed asset
    // leaves the app with no offline mode at all.
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Live game state is never served from a cache.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first so a deployed change shows up, falling back to
  // the cached shell so opening the app on a train still works.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: cache first. These are versioned by CACHE, not by URL.
  event.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    try {
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
