/**
 * bsky.mino.mobi — service worker.
 *
 * The point of installing this app is NOT offline caching of posts: the posts
 * already live in IndexedDB (lib/cache.js), which is the archive the whole
 * surface is built around. This worker exists to make the SHELL available
 * without a network, so that opening the app on a plane shows you the ~month of
 * history your browser has been quietly accumulating, instead of a dinosaur.
 *
 * Three rules, and the first one is a security rule rather than a caching one.
 *
 * 1. NEVER touch /api/*. `/api/feedgen` forwards the reader's own service-auth
 *    JWT and returns THEIR personalised feed. Cache Storage is per-origin, not
 *    per-account, so caching that response would hand one reader's For You to
 *    whoever opens the app next on a shared phone — and would outlive a token
 *    that is deliberately valid for about a minute. There is no cache policy
 *    that makes this safe; the only correct answer is to stay out of the way.
 *
 * 2. Never touch cross-origin. Images from cdn.bsky.app, the public AppView,
 *    Constellation, the PDS, auth.mino.mobi — all of it is either already
 *    HTTP-cached, or is authenticated, or is the live tail that must not be
 *    stale. Opaque cross-origin responses also cost far more storage than they
 *    look like they do, and this origin's quota belongs to the archive.
 *
 * 3. Never serve a stale document. Navigations are network-first so a deploy
 *    reaches installed users on the next launch; the cache is the fallback for
 *    when there is genuinely no network.
 *
 * There is no skipWaiting() here on purpose. This app is one module graph:
 * activating a new worker under a page that already imported the old app.js
 * can mix versions inside a single session. So a new worker waits, and app.js
 * surfaces an explicit "update ready" button — see registerServiceWorker().
 */

const VERSION = 'v1';
const CACHE = `bsky-shell-${VERSION}`;

/**
 * The shell. Kept explicit rather than crawled, because a service worker cannot
 * parse import graphs — and kept honest by lib/sw.selftest.mjs, which fails if
 * a module exists that this list does not name.
 */
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/lib/actions.js',
  '/lib/archive.js',
  '/lib/apikey.js',
  '/lib/blobs.js',
  '/lib/cache.js',
  '/lib/compose.js',
  '/lib/feedgen.js',
  '/lib/lightbox.js',
  '/lib/sha256.js',
  '/lib/paper.js',
  '/lib/prefs.js',
  '/lib/rulefeed.js',
  '/lib/share.js',
  '/lib/sources.js',
  '/lib/theme.js',
  '/lib/tid.js',
  '/lib/typeahead.js',
  '/packages/atproto/bsky.js',
  '/packages/atproto/constellation.js',
  '/packages/atproto/jetstream.js',
  '/packages/oauth-client/auth.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Individually, not addAll: addAll is atomic, so one 404 on one module
    // would silently leave the app with no offline shell at all.
    await Promise.all(SHELL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('bsky-shell-') && k !== CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// app.js asks for this when the reader taps "update ready".
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // rule 2
  if (url.pathname.startsWith('/api/')) return;      // rule 1

  // Rule 3 — documents come from the network when there is one. An OAuth
  // callback lands here carrying ?code=…; it must never be answered from a
  // cache, and it must never be written to one.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (!url.search) {
          const cache = await caches.open(CACHE);
          cache.put('/index.html', fresh.clone());
        }
        return fresh;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: stale-while-revalidate. Serve what we have instantly,
  // refresh it in the background for next launch.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
