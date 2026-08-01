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

  if (!REACT_ROUTES.some((r) => routeName(r) === name)) return null;

  // #/thread/<url> → /thread?p=<url>
  if (name === 'thread' && rest.length && rest.join('/')) {
    const target = decodeURIComponent(rest.join('/'));
    const params = new URLSearchParams(search.slice(1));
    params.set('p', target);
    return `/thread?${params}`;
  }

  return `/${name}${search}`;
}

/** Rewrite a legacy fragment URL in place, once, before anything reads it. */
export function normalizeLegacyHash(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return null;
  const target = legacyHashTarget(win.location.pathname, win.location.hash);
  if (!target) return null;
  win.history.replaceState({}, '', target);
  return target;
}
