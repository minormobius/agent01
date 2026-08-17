// pom.js — the pure half of /pom: what a plate is, where its pixels live, and
// how 7,581 of them get filtered, counted and laid out.
//
// DOM-free on purpose, so `photo/pom.selftest.mjs` can hold all of it to
// account in node. `app.js` is the only file that touches the document.
//
// ── WE HOST NOTHING ────────────────────────────────────────────────────────
// Every pixel on this page is served by whoever already holds the scan. What
// this repo carries is `data/index.json` — 600 kB of catalogue, no images —
// and the addressing rules below, which turn a NAL barcode into an <img src>
// with no lookup, no redirect and no API call.
//
// ⚠️ upload.wikimedia.org SERVES ELEVEN THUMBNAIL WIDTHS AND REJECTS THE REST.
// A hotlink at any other width is a **400**, not a resize: `250px-…` is a
// picture and `240px-…` is an error page. (Requests made *through* the
// MediaWiki API get rounded up for you; direct ones, which is all of these,
// do not.) `bucket()` is the only place a width is chosen, and the selftest
// asserts every URL this file can emit lands on the list — because the failure
// is a grid of broken frames that looks like the collection is gone.
// https://www.mediawiki.org/wiki/Common_thumbnail_sizes

export const COMMONS_WIDTHS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];

/** Source ids, as stored in the `src` column. */
export const COMMONS = 0;
export const IA = 1;

const IA_ITEM = 'usda-pomological-watercolor-collection';

/** The plates are ~2:3; that is the stand-in when a source gives no dimensions. */
export const DEFAULT_ASPECT = 0.66;

/** POM00000001 — the National Agricultural Library barcode, which is the id. */
export function barcode(id) {
  return `POM${String(id).padStart(8, '0')}`;
}

/** The smallest permitted Commons width that is at least `want`. */
export function bucket(want) {
  for (const w of COMMONS_WIDTHS) if (w >= want) return w;
  return COMMONS_WIDTHS[COMMONS_WIDTHS.length - 1];
}

/**
 * Commons shards by the md5 of the underscored filename: first hex character,
 * then the first two. `harvest-pom.mjs` precomputed the two characters into
 * the `shard` column, which is what lets a tile be a plain <img src> — no
 * md5 in the browser, and no trip through `Special:FilePath` (two redirects
 * per tile, 7,581 tiles).
 */
function commonsPath(row) {
  const file = `Pomological_Watercolor_${barcode(row.id)}.jpg`;
  return { dir: `${row.shard[0]}/${row.shard}`, file };
}

/** Grid- and lightbox-sized. `want` is snapped to a permitted width. */
export function thumbUrl(row, want) {
  if (row.src === IA) {
    // The IA mirror has exactly two renditions: a 126×192 derivative and the
    // ~8 MB original. Nothing in between, so a tile gets the small one and the
    // lightbox is told to expect the big one.
    return want <= 250
      ? `https://archive.org/download/${IA_ITEM}/${barcode(row.id)}_thumb.jpg`
      : `https://archive.org/download/${IA_ITEM}/${barcode(row.id)}.jpg`;
  }
  const { dir, file } = commonsPath(row);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}/${file}/${bucket(want)}px-${file}`;
}

/**
 * The same plate from the *other* archive.
 *
 * Both hold the same NAL scans under the same barcode, which is the quiet
 * benefit of an id that is a fact about the object rather than about a host:
 * when Commons will not serve a tile — it rate-limits clients it dislikes, and
 * says so with a reset connection rather than anything a page can read — the
 * Internet Archive has the identical plate one string substitution away.
 *
 * Only the direction that helps exists. Commons has 7,577 of these and IA has
 * 7,581, so an IA-sourced plate has no Commons copy to fall back to, and
 * pretending otherwise would swap a slow tile for a permanently broken one.
 */
export function mirrorUrl(row) {
  if (row.src === IA) return thumbUrl(row, 20);
  return `https://archive.org/download/${IA_ITEM}/${barcode(row.id)}_thumb.jpg`;
}

/** The scan itself — 4,000px tall, 6–9 MB. Only ever behind a click. */
export function fullUrl(row) {
  if (row.src === IA) return `https://archive.org/download/${IA_ITEM}/${barcode(row.id)}.jpg`;
  const { dir, file } = commonsPath(row);
  return `https://upload.wikimedia.org/wikipedia/commons/${dir}/${file}`;
}

/**
 * Where this plate can be read about. Three permalinks, all off-site:
 * the file page that carries the licence and the catalogue record, the
 * Internet Archive mirror of the same scan, and the National Agricultural
 * Library's own discovery interface (a search, not a deep link — NAL folded
 * the collection's original site into Primo and the per-plate URLs did not
 * survive; `usdawatercolors.nal.usda.gov/pom/catalog.xhtml?id=…`, which every
 * Commons record still cites as its source, has been a 502 for some time).
 */
export function links(row) {
  const code = barcode(row.id);
  return {
    commons: row.src === COMMONS
      ? `https://commons.wikimedia.org/wiki/File:Pomological_Watercolor_${code}.jpg` : '',
    ia: `https://archive.org/download/${IA_ITEM}/${code}.jpg`,
    nal: 'https://search.nal.usda.gov/discovery/search?query=any,contains,'
      + `${encodeURIComponent(code)}&vid=01NAL_INST:MAIN`,
    full: fullUrl(row),
  };
}

/** What `alt=` should say, and what the lightbox puts under the picture. */
export function caption(row) {
  const bits = [];
  if (row.variety) bits.push(row.variety);
  if (row.fruit) bits.push(bits.length ? `— ${row.fruit}` : row.fruit);
  let head = bits.join(' ');
  if (!head) head = row.desc || barcode(row.id);
  return head;
}

export function describe(row) {
  const parts = [caption(row)];
  if (row.sci) parts.push(`(${row.sci})`);
  if (row.place) parts.push(`· ${row.place}`);
  if (row.date) parts.push(`· ${row.date}`);
  if (row.artist) parts.push(`· painted by ${row.artist}`);
  return parts.join(' ');
}

// ── the index ──────────────────────────────────────────────────────────────

const DICT_COLS = ['fruit', 'sci', 'place', 'region', 'artist'];

/**
 * Columnar + dictionary-encoded on disk, row objects in memory.
 *
 * Both halves earn their keep: the packed form is 600 kB (137 kB over the
 * wire) where the same data as objects is 1.4 MB, and the whole point of this
 * page is that every plate is already in the tab — filtering 7,581 rows is a
 * frame, fetching them a screen at a time is a spinner between you and the
 * archive.
 */
export function unpack(packed) {
  const { cols, dicts, count } = packed;
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    const row = {
      i,
      id: cols.id[i],
      src: cols.src ? cols.src[i] : COMMONS,
      shard: cols.shard[i] || '',
      w: cols.w[i] || 0,
      h: cols.h[i] || 0,
      year: cols.year[i] || 0,
      date: cols.date[i] || '',
      variety: cols.variety[i] || '',
      note: cols.note ? (cols.note[i] || '') : '',
      desc: cols.desc[i] || '',
    };
    for (const k of DICT_COLS) {
      const idx = cols[k] ? cols[k][i] : -1;
      row[k] = idx >= 0 ? dicts[k][idx] : '';
    }
    row.aspect = row.w && row.h ? row.w / row.h : DEFAULT_ASPECT;
    rows[i] = row;
  }
  return { rows, dicts, count, source: packed.source || {}, years: yearExtent(rows) };
}

function yearExtent(rows) {
  let lo = Infinity; let hi = -Infinity;
  for (const r of rows) if (r.year) { if (r.year < lo) lo = r.year; if (r.year > hi) hi = r.year; }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
}

/** One lowercase haystack per row, built once and cached on the row. */
function haystack(row) {
  if (row._h === undefined) {
    row._h = [row.variety, row.fruit, row.sci, row.place, row.region, row.artist, row.desc,
      row.note, barcode(row.id), row.date].join(' ').toLowerCase();
  }
  return row._h;
}

export const EMPTY_STATE = {
  q: '', fruit: '', sci: '', artist: '', place: '', region: '',
  y0: 0, y1: 0, sort: 'id', id: 0,
};

/**
 * Every term must match somewhere, but not necessarily in the same field —
 * "arnold peach 1936" is a reasonable thing to type and matches nothing under
 * a whole-string test.
 */
export function matchesQuery(row, terms) {
  if (!terms.length) return true;
  const h = haystack(row);
  for (const t of terms) if (!h.includes(t)) return false;
  return true;
}

export function terms(q) {
  return String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
}

/** Indices into `index.rows`, filtered and sorted. */
export function select(index, state) {
  const s = { ...EMPTY_STATE, ...state };
  const t = terms(s.q);
  const out = [];
  for (const row of index.rows) {
    if (s.fruit && row.fruit !== s.fruit) continue;
    if (s.sci && row.sci !== s.sci) continue;
    if (s.artist && row.artist !== s.artist) continue;
    if (s.place && row.place !== s.place) continue;
    if (s.region && row.region !== s.region) continue;
    // An undated plate is excluded by *any* year narrowing rather than kept as
    // a freebie: a range that silently carries 371 unknowns is a lie about what
    // is on screen. With no range set, everything is in.
    if (s.y0 || s.y1) {
      if (!row.year) continue;
      if (s.y0 && row.year < s.y0) continue;
      if (s.y1 && row.year > s.y1) continue;
    }
    if (!matchesQuery(row, t)) continue;
    out.push(row.i);
  }
  return sortIds(index, out, s.sort);
}

const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export const SORTS = {
  id: 'barcode',
  year: 'earliest first',
  '-year': 'latest first',
  fruit: 'fruit',
  variety: 'variety A–Z',
  artist: 'artist',
};

export function sortIds(index, ids, sort) {
  const r = index.rows;
  // A stable tiebreak on the barcode everywhere, so two sorts of the same set
  // never disagree about the order of equal rows — which reads as the grid
  // shuffling itself for no reason when you toggle a facet.
  const by = (key) => (a, b) => {
    const va = r[a][key] || ''; const vb = r[b][key] || '';
    if (va === vb) return r[a].id - r[b].id;
    if (!va) return 1;
    if (!vb) return -1;
    return COLLATOR.compare(va, vb) || r[a].id - r[b].id;
  };
  const sorted = ids.slice();
  switch (sort) {
    case 'year': sorted.sort((a, b) => (r[a].year || 9999) - (r[b].year || 9999) || r[a].id - r[b].id); break;
    case '-year': sorted.sort((a, b) => (r[b].year || 0) - (r[a].year || 0) || r[a].id - r[b].id); break;
    case 'fruit': sorted.sort(by('fruit')); break;
    case 'variety': sorted.sort(by('variety')); break;
    case 'artist': sorted.sort(by('artist')); break;
    default: sorted.sort((a, b) => r[a].id - r[b].id);
  }
  return sorted;
}

/**
 * Counts for one facet over a set of rows, most numerous first.
 *
 * Counted over the *currently selected* rows, so the numbers beside "peaches"
 * answer "how many of what I am looking at", not "how many in the collection".
 * A facet whose own value is fixed would otherwise report 1 for every other
 * option and be useless for the next move.
 */
export function facet(index, ids, key, limit = 0) {
  const counts = new Map();
  for (const i of ids) {
    const v = index.rows[i][key];
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const out = [...counts].sort((a, b) => b[1] - a[1] || COLLATOR.compare(a[0], b[0]));
  return limit ? out.slice(0, limit) : out;
}

/** [year, count] over the collection's whole span, gaps included as zeroes. */
export function histogram(index, ids) {
  const [lo, hi] = index.years;
  if (!lo) return [];
  const counts = new Array(hi - lo + 1).fill(0);
  let undated = 0;
  for (const i of ids) {
    const y = index.rows[i].year;
    if (!y) { undated++; continue; }
    counts[y - lo]++;
  }
  const bars = counts.map((n, k) => [lo + k, n]);
  bars.undated = undated;
  return bars;
}

// ── layout ─────────────────────────────────────────────────────────────────

/**
 * Justified rows — the Flickr layout. Fill a row with plates at their true
 * aspect ratios, then scale the row so it spans the container exactly.
 *
 * A uniform grid was the obvious thing and it is wrong for this collection:
 * these are plates of wildly different trim, and cropping them to a common
 * box is a decision about someone's painting made by a stylesheet. Here the
 * only thing that varies is how much width a plate is given.
 *
 * Pure, and it returns the full plan for every row — which is what makes the
 * grid virtualisable: `app.js` renders only the rows the viewport crosses,
 * and 7,581 tiles cost the same as 40.
 */
export function justify(aspects, width, target, gap) {
  const rows = [];
  // One return shape, always. The early exit used to hand back a bare array
  // while the normal path returned `{rows, height}`, so an empty result made
  // every caller read `.rows` off an Array and get `undefined`.
  if (!aspects.length || width <= 0) return { rows, height: 0 };
  let start = 0;
  let sum = 0;
  let y = 0;
  const flush = (end, last) => {
    const n = end - start;
    if (!n) return;
    const avail = width - gap * (n - 1);
    // The last row keeps the target height rather than stretching a lone plate
    // across the page — a single tile scaled to full width is a poster, not a
    // row, and it reads as a bug every time.
    const h = last ? Math.min(target, avail / sum) : avail / sum;
    rows.push({ from: start, to: end, y, h });
    y += h + gap;
    start = end;
    sum = 0;
  };
  for (let i = 0; i < aspects.length; i++) {
    sum += aspects[i] || DEFAULT_ASPECT;
    const n = i - start + 1;
    if (sum * target + gap * (n - 1) >= width) flush(i + 1, false);
  }
  flush(aspects.length, true);
  return { rows, height: y > 0 ? y - gap : 0 };
}

/** Which laid-out rows a scroll window crosses, plus an overscan margin. */
export function visibleRows(plan, top, height, overscan = 2) {
  const { rows } = plan;
  if (!rows.length) return [0, 0];
  let lo = 0; let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].y + rows[mid].h < top) lo = mid + 1; else hi = mid;
  }
  let end = lo;
  while (end < rows.length && rows[end].y <= top + height) end++;
  return [Math.max(0, lo - overscan), Math.min(rows.length, end + overscan)];
}

// ── the address bar ────────────────────────────────────────────────────────

const NUMERIC = new Set(['y0', 'y1', 'id']);

export function encodeState(state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(EMPTY_STATE)) {
    const cur = state[k];
    if (cur === undefined || cur === null || cur === v) continue;
    if (NUMERIC.has(k) && !Number(cur)) continue;
    p.set(k, String(cur));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function parseState(search) {
  const p = new URLSearchParams(search || '');
  const out = { ...EMPTY_STATE };
  for (const k of Object.keys(EMPTY_STATE)) {
    if (!p.has(k)) continue;
    out[k] = NUMERIC.has(k) ? Number(p.get(k)) || 0 : p.get(k);
  }
  if (!SORTS[out.sort]) out.sort = 'id';
  if (out.y0 && out.y1 && out.y0 > out.y1) { const t = out.y0; out.y0 = out.y1; out.y1 = t; }
  return out;
}

// ── the two doors every picture on this surface offers ─────────────────────
//
// `photo/CLAUDE.md`: shop is "I know what I want to do to this", bloom is
// "I don't, show me", and both hang off every picture the surface shows.
// These plates are 4,000px public-domain paintings — the best input either
// tool has ever been handed — so they get the same pair.
//
// Neither URL is proxied. `/api/img` exists for `cdn.bsky.app`, which serves
// no `access-control-allow-origin` and so cannot be read back off a canvas;
// upload.wikimedia.org and archive.org both answer `*`, so shop and bloom can
// read these pixels directly. Routing them through the proxy would put the
// bytes on our worker for no reason at all.

export function shopUrl(row, want = 1280) {
  const p = new URLSearchParams({ u: thumbUrl(row, want), alt: describe(row) });
  return `/shop/?${p}`;
}

export function bloomUrl(row, want = 1280) {
  return `/bloom/?u=${encodeURIComponent(thumbUrl(row, want))}`;
}
