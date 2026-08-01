// filters.js — the gallery's filter and sort rules, lifted out of the component.
//
// This was ~40 lines inside a `useMemo` in App.jsx, which meant the only way to
// find out whether "portrait" really excluded squares was to open a browser and
// squint. It is pure, so it belongs somewhere `photo.selftest.mjs` can reach it.
//
// The two lookups it needs — an image's colour regions and its like count —
// arrive as functions rather than imports. That keeps the module free of the
// module-level caches in colors.js and engagement.js, which is what makes it
// testable at all, and it documents the dependency instead of hiding it.

export const DEFAULT_FILTERS = {
  aspect: 'all',
  altText: 'all',
  color: 'all',
  did: 'all',
  blobType: 'all',
  dateFrom: '',
  dateTo: '',
  source: 'all', // all | posts | uploads
};

// Landscape and portrait are deliberately not complements: a 1:1 photograph is
// neither, and the 5% dead band stops a 1.01 ratio from being called landscape.
const SQUARE_LO = 0.95;
const SQUARE_HI = 1.05;

export function matchesFilters(item, filters, colorRegions = null) {
  if (filters.source === 'posts' && item.source !== 'post') return false;
  if (filters.source === 'uploads' && item.source !== 'arena') return false;

  if (filters.blobType !== 'all' && item.type !== filters.blobType) return false;
  if (filters.did !== 'all' && item.did !== filters.did) return false;

  if (filters.altText === 'has' && !item.alt) return false;
  if (filters.altText === 'missing' && item.alt) return false;

  // Only images that declared an aspect ratio can be filtered by shape; one
  // that didn't is kept rather than guessed at.
  if (filters.aspect !== 'all' && item.aspectRatio) {
    const ratio = item.aspectRatio.width / item.aspectRatio.height;
    if (filters.aspect === 'landscape' && ratio <= SQUARE_HI) return false;
    if (filters.aspect === 'portrait' && ratio >= SQUARE_LO) return false;
    if (filters.aspect === 'square' && (ratio < SQUARE_LO || ratio > SQUARE_HI)) return false;
  }

  if (filters.color !== 'all' && colorRegions) {
    const regions = colorRegions(item);
    // No palette for this image yet — keep it. Dropping un-sampled images would
    // make the grid empty out as extraction runs, which reads as a bug.
    if (regions && !regions.has(filters.color)) return false;
  }

  if (filters.dateFrom && item.createdAt && item.createdAt.slice(0, 10) < filters.dateFrom) return false;
  if (filters.dateTo && item.createdAt && item.createdAt.slice(0, 10) > filters.dateTo) return false;

  return true;
}

export function applyFilters(media, filters, colorRegions = null) {
  return media.filter((item) => matchesFilters(item, filters, colorRegions));
}

/**
 * `media` arrives newest-first (the SQL orders it that way), so "oldest" is a
 * reverse rather than a re-sort. "most liked" needs the engagement lookup and
 * silently falls back to date order when it hasn't been fetched.
 */
export function sortMedia(media, sortBy, engagementFor = null) {
  if (sortBy === 'oldest') return [...media].reverse();
  if (sortBy === 'most-liked' && engagementFor) {
    return [...media].sort((a, b) => (engagementFor(b)?.likeCount ?? 0) - (engagementFor(a)?.likeCount ?? 0));
  }
  return media;
}

/** The date bounds of a collection, for the date-picker's min/max. */
export function dateRangeOf(media) {
  if (!media.length) return null;
  let min = null;
  let max = null;
  for (const item of media) {
    const d = (item.createdAt || '').slice(0, 10);
    if (!d) continue;
    if (min === null || d < min) min = d;
    if (max === null || d > max) max = d;
  }
  return min === null ? null : { min, max };
}

/**
 * Post images, videos and uploads into one list. Sorted with a plain string
 * compare — ISO 8601 sorts lexicographically, and `localeCompare` is ~9× slower
 * for an answer that is identical on this input.
 */
export function mergeMedia({ images = [], videos = [], uploads = [] }) {
  const all = [
    ...images.map((i) => ({ ...i, type: 'image', source: 'post' })),
    ...videos.map((v) => ({ ...v, type: 'video', source: 'post' })),
    ...uploads.map((i) => ({ ...i, type: 'image', source: 'arena' })),
  ];
  return all.sort((a, b) => {
    const x = a.createdAt || '';
    const y = b.createdAt || '';
    return x < y ? 1 : x > y ? -1 : 0;
  });
}
