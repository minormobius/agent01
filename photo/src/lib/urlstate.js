// urlstate.js — the gallery's state, in the address bar.
//
// Every other tool on this surface round-trips its whole state through the URL:
// /glass takes `?u=`, /glitch and /shop encode an entire recipe, /lens the same.
// The explorer could not share so much as a handle — you could sync an account,
// filter to portraits with alt text, and the URL would still say `#/`.
//
// The encoding is readable on purpose. A recipe is opaque because it is a
// hundred parameters; this is four or five, and
//
//   /explore?u=alice.bsky.social&aspect=portrait&alt=has&sort=most-liked
//
// is a URL someone can edit by hand, which is worth more here than being short.
// Defaults are omitted, so a plain `/explore` stays plain.
//
// This lived in the fragment until the tools got real paths. `decodeState`
// still reads from the first `?` onwards, so it accepts the old
// `#/explore?u=…` form as well as the new `?u=…` — which matters, because a
// link shared before the change arrives as the former.

import { DEFAULT_FILTERS } from './filters.js';

// Wire key ↔ filter key. The short names are the ones that end up in the URL.
const FILTER_KEYS = {
  aspect: 'aspect',
  alt: 'altText',
  color: 'color',
  who: 'did',
  type: 'blobType',
  from: 'dateFrom',
  to: 'dateTo',
  src: 'source',
};

export const DEFAULT_SORT = 'newest';

/**
 * @param {object} state `{ handles: string[], filters, sortBy }`
 * @returns {string} the query string, e.g. `?u=a.bsky.social&aspect=portrait`,
 *   or `''` when every value is at its default
 */
export function encodeState({ handles = [], filters = DEFAULT_FILTERS, sortBy = DEFAULT_SORT } = {}) {
  const params = new URLSearchParams();
  for (const h of handles) if (h) params.append('u', h);
  for (const [wire, key] of Object.entries(FILTER_KEYS)) {
    const value = filters?.[key];
    if (value === undefined || value === null) continue;
    if (value === DEFAULT_FILTERS[key]) continue; // defaults stay out of the URL
    params.set(wire, String(value));
  }
  if (sortBy && sortBy !== DEFAULT_SORT) params.set('sort', sortBy);
  const q = params.toString();
  return q ? `?${q}` : '';
}

/**
 * The inverse. Unknown keys and unknown values are dropped rather than trusted —
 * this string came from an address bar, and a bogus `aspect=🐛` should give you
 * the default view, not an empty grid.
 */
export function decodeState(search) {
  const raw = String(search || '');
  const qIndex = raw.indexOf('?');
  const params = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : raw);

  const handles = params.getAll('u').map((h) => h.trim().replace(/^@/, '')).filter(Boolean);

  const filters = { ...DEFAULT_FILTERS };
  for (const [wire, key] of Object.entries(FILTER_KEYS)) {
    if (!params.has(wire)) continue;
    const value = params.get(wire);
    if (ALLOWED[key] && !ALLOWED[key].includes(value)) continue;
    if (key === 'dateFrom' || key === 'dateTo') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    }
    filters[key] = value;
  }

  const sort = params.get('sort');
  const sortBy = SORTS.includes(sort) ? sort : DEFAULT_SORT;

  return { handles, filters, sortBy };
}

export const SORTS = ['newest', 'oldest', 'most-liked'];

const ALLOWED = {
  aspect: ['all', 'landscape', 'portrait', 'square'],
  altText: ['all', 'has', 'missing'],
  blobType: ['all', 'image', 'video'],
  source: ['all', 'posts', 'uploads'],
  // `color` and `did` are open sets — validated by the UI, not by a list here.
};

/** Replace the query string without pushing a history entry — filter changes
 *  are not navigation, and one back-press should leave the gallery, not undo a
 *  pill. */
export function replaceQuery(search) {
  if (typeof window === 'undefined') return;
  if (window.location.search === search) return;
  const url = `${window.location.pathname}${search}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}
