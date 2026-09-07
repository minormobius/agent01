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

const CACHE = 'words-v6';

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
  // The crossword. Its answer list is what the generator needs, so a precached
  // /cross/ can still BUILD a puzzle on a train — it just cannot clue it, since
  // the clues come from /api/cross/clues. See crossClues in worker.js.
  '/cross/',
  '/cross/index.html',
  '/cross/styles.css',
  '/cross/app.js',
  '/cross/gen/lexicon.js',
  '/cross/gen/grid.js',
  '/cross/gen/fill.js',
  '/cross/gen/puzzle.js',
  '/cross/gen/clues.js',
  '/cross/gen/generate.worker.js',
  '/cross/dict/answers.txt',
];

/**
 * Which cached document answers a navigation. The surface has TWO apps under
 * one origin, and this used to be the string '/index.html' in both places —
 * which meant opening /cross/ overwrote the game's offline shell with the
 * crossword's, and then opening the game offline served the crossword.
 */
const shellFor = (pathname) => (pathname.startsWith('/cross') ? '/cross/index.html' : '/index.html');

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
      const shell = shellFor(url.pathname);
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(shell, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(shell)) || Response.error();
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

// ------------------------------------------------------- notifications ----
//
// The point of installing this thing: a game where the next move might come
// tomorrow is a game you will forget you are in. A push arrives whether or not
// the app is open, sets the app-icon badge, and taps through to that game.
//
// The BADGE is the quiet half — a number on the home-screen icon with no sound
// and no banner. It is set from three places (here, on push; in app.js, when
// the page notices it is your turn; and cleared when you take your turn), all
// of which have to agree, so the count is always "games where it is your turn"
// and never a running total of anything.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* keep going */ }
  const title = data.title || 'Your turn';
  const body = data.body || 'It is your move.';
  const code = data.code || '';

  event.waitUntil((async () => {
    // If a window is already open ON THIS GAME and visible, a banner is noise —
    // the board is right there and app.js has already redrawn it.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const looking = clients.some((c) => c.visibilityState === 'visible' && c.url.includes(`g=${code}`));

    await bumpBadge(code);
    for (const c of clients) c.postMessage({ type: 'turn', code });
    if (looking) return;

    await self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // One notification per game: a second push for the same game replaces the
      // first rather than stacking four "your turn" banners.
      tag: `words-${code}`,
      renotify: true,
      data: { url: data.url || (code ? `/?g=${code}` : '/') },
    });
  })());
});

/** Games waiting on this player, so the badge is a count and not a boolean. */
const WAITING = new Set();

async function bumpBadge(code) {
  if (code) WAITING.add(code);
  if (navigator.setAppBadge) {
    try { await navigator.setAppBadge(WAITING.size || 1); } catch { /* unsupported */ }
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse a window if there is one — opening a fourth copy of the game
    // because somebody tapped four notifications is its own kind of rude.
    for (const c of clients) {
      if ('focus' in c) {
        await c.focus();
        c.postMessage({ type: 'open', url });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

// The page tells us when a turn has been taken, so the badge can come down
// from the side that actually knows.
self.addEventListener('message', (event) => {
  const { type, code } = event.data || {};
  if (type === 'seen' && code) {
    WAITING.delete(code);
    if (navigator.clearAppBadge && WAITING.size === 0) navigator.clearAppBadge().catch(() => {});
    else if (navigator.setAppBadge && WAITING.size) navigator.setAppBadge(WAITING.size).catch(() => {});
  }
  if (type === 'waiting' && code) bumpBadge(code);
});
