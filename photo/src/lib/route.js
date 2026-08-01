// route.js — what page the address bar is asking for.
//
// This surface used to route on the fragment: `#/explore`, `#/thread`,
// `#/sleuth`, `#/codescan`. Four applications hiding behind one wildcard —
// which meant the server saw a single URL for all of them, none of them could
// be linked to as a place, and the address bar carried a `#` that told the
// reader nothing except that a framework was involved.
//
// They are real paths now. `worker.js` serves `index.html` for each one (it
// reads the same list, from `catalogue.js`), so `photo.mino.mobi/explore` is a
// URL you can type into a phone.
//
// Two consequences worth stating:
//
//   * **Navigation between tools is a real navigation.** These are not screens
//     of one app; they are four heavy, independent programs, one of which
//     carries DuckDB and another an OCR engine. A full load between them frees
//     everything the last one held, which is the behaviour you want on a phone.
//     So they are plain `<a href>`s and there is no client-side router here.
//   * **Old links still work.** `#/explore?u=alice` was a shareable URL until
//     this change, and someone has one. `normalizeLegacyHash` rewrites the
//     fragment form to the path form once, before anything reads the URL.

import { REACT_ROUTES } from './catalogue.js';

/**
 * Routes this surface used to serve and no longer does.
 *
 * `/thread` and `/sleuth` were never image tools — they read Bluesky text — and
 * they moved to `b.mino.mobi`, the surface that collects the Bluesky tools.
 * Every address they ever had still has to work: the plain path (handled by
 * `worker.js`, which 301s), and the fragment forms below, which the server
 * never sees because a fragment is not sent. So the client has to do it.
 *
 * The deep links are translated, not just the paths — `#/thread/<post url>`
 * became `?p=`, and `#/sleuth/<handle>` became `?u=`. A redirect that drops the
 * thing you were looking at is only half a redirect.
 */
export const MOVED = {
  thread: (rest, search) => {
    const params = new URLSearchParams(search.slice(1));
    if (rest) params.set('p', decodeURIComponent(rest));
    const q = params.toString();
    return `https://b.mino.mobi/thread/${q ? `?${q}` : ''}`;
  },
  sleuth: (rest, search) => {
    const params = new URLSearchParams(search.slice(1));
    if (rest) params.set('u', decodeURIComponent(rest).replace(/^@/, ''));
    const q = params.toString();
    return `https://b.mino.mobi/sleuth/${q ? `?${q}` : ''}`;
  },
};

/** `/explore` → `explore`. The landing page is `''`. */
export function routeName(pathname = '/') {
  return String(pathname || '/').replace(/^\/+|\/+$/g, '').toLowerCase();
}

/** Is this a route the React app owns? */
export function isAppRoute(pathname) {
  const name = routeName(pathname);
  return REACT_ROUTES.some((r) => routeName(r) === name);
}

/**
 * Translate a legacy fragment URL into the path it became, or null if there is
 * nothing to do. Pure so the selftest can hold every old shape against its new
 * one without a browser.
 *
 * `#/thread/<encoded post url>` is the one that is not a straight rename: the
 * thread reader took its deep link as a path segment inside the fragment, and
 * that becomes an ordinary query parameter.
 *
 * @param {string} pathname current path, e.g. `/`
 * @param {string} hash     current fragment, e.g. `#/explore?u=alice`
 * @returns {string|null}   the replacement URL, or null to leave it alone
 */
export function legacyHashTarget(pathname, hash) {
  const h = String(hash || '');
  if (!h.startsWith('#/')) return null;
  // Only rewrite from the root. A fragment on an already-real path is either
  // an anchor or somebody else's business.
  if (routeName(pathname) !== '') return null;

  const body = h.slice(2);
  const q = body.indexOf('?');
  const beforeQuery = q === -1 ? body : body.slice(0, q);
  const search = q === -1 ? '' : body.slice(q);

  const [head, ...rest] = beforeQuery.split('/');
  const name = head.toLowerCase();
  if (!name) return '/';

  // Gone to another surface: an absolute URL, deep link and all.
  if (MOVED[name]) return MOVED[name](rest.join('/'), search);

  if (!REACT_ROUTES.some((r) => routeName(r) === name)) return null;

  return `/${name}${search}`;
}

/**
 * Rewrite a legacy fragment URL in place, once, before anything reads it.
 *
 * A same-surface target is a `replaceState` — no navigation, the app just reads
 * the new path. A target on another surface has to be a real navigation, and
 * `replace` rather than `assign` so the dead address does not sit in the back
 * button waiting to bounce you again.
 */
export function normalizeLegacyHash(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return null;
  const target = legacyHashTarget(win.location.pathname, win.location.hash);
  if (!target) return null;
  if (/^https?:\/\//.test(target)) win.location.replace(target);
  else win.history.replaceState({}, '', target);
  return target;
}
