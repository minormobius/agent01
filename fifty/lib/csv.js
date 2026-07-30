// fifty/lib/csv.js — CSV reading and the review-import mappings (concept 20).
//
// Letterboxd and Goodreads both hand you a CSV on request. That export is the
// only write-free way to get someone's review history out of either service,
// so it is the sync direction that can actually be built — and it means the
// whole import runs in the browser with nothing uploaded anywhere.

/** A real CSV parser: quoted fields, embedded commas, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');   // strip a BOM if Excel touched it

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Rows → objects keyed by the header row. */
export function toObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

// ────────────────────────────────────────────────────── mappings ──

export const REVIEW_COLLECTION = 'com.minomobi.fifty.review';

/**
 * A source is recognised by its header columns rather than by filename, since
 * people rename downloads. Each maps one export row to the common review shape.
 */
export const SOURCES = [
  {
    id: 'letterboxd-reviews',
    label: 'Letterboxd — reviews.csv',
    detect: (h) => h.includes('Letterboxd URI') && h.includes('Review'),
    subject: 'movie',
    map: (r) => ({
      title: r.Name,
      year: Number(r.Year) || undefined,
      rating: r.Rating ? Number(r.Rating) : null,        // out of 5, halves allowed
      ratingScale: 5,
      reviewedAt: r['Watched Date'] || r.Date || '',
      body: r.Review || '',
      rewatch: /yes/i.test(r.Rewatch || ''),
      canonical: r['Letterboxd URI'] || '',
      tags: (r.Tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    }),
  },
  {
    id: 'letterboxd-ratings',
    label: 'Letterboxd — ratings.csv',
    detect: (h) => h.includes('Letterboxd URI') && h.includes('Rating') && !h.includes('Review'),
    subject: 'movie',
    map: (r) => ({
      title: r.Name,
      year: Number(r.Year) || undefined,
      rating: r.Rating ? Number(r.Rating) : null,
      ratingScale: 5,
      reviewedAt: r.Date || '',
      body: '',
      canonical: r['Letterboxd URI'] || '',
      tags: [],
    }),
  },
  {
    id: 'goodreads',
    label: 'Goodreads — library export',
    detect: (h) => h.includes('Book Id') && h.includes('My Rating'),
    subject: 'book',
    map: (r) => ({
      title: r.Title,
      creator: r.Author || '',
      year: Number((r['Original Publication Year'] || r['Year Published'] || '').slice(0, 4)) || undefined,
      rating: Number(r['My Rating']) || null,
      ratingScale: 5,
      reviewedAt: r['Date Read'] || r['Date Added'] || '',
      body: (r['My Review'] || '').replace(/<br\s*\/?>/gi, '\n'),
      shelf: r['Exclusive Shelf'] || '',
      canonical: r['Book Id'] ? `https://www.goodreads.com/book/show/${r['Book Id']}` : '',
      isbn: (r.ISBN13 || r.ISBN || '').replace(/[="]/g, '') || undefined,
      tags: (r.Bookshelves || '').split(',').map((t) => t.trim()).filter(Boolean),
    }),
  },
  {
    id: 'generic',
    label: 'Generic — title / rating / review',
    detect: (h) => h.some((c) => /^title$/i.test(c)) && h.some((c) => /^rating$/i.test(c)),
    subject: 'thing',
    map: (r) => {
      const get = (name) => {
        const k = Object.keys(r).find((c) => c.toLowerCase() === name);
        return k ? r[k] : '';
      };
      return {
        title: get('title'),
        creator: get('author') || get('creator') || '',
        rating: Number(get('rating')) || null,
        ratingScale: 5,
        reviewedAt: get('date') || '',
        body: get('review') || '',
        canonical: get('url') || '',
        tags: [],
      };
    },
  },
];

export function detectSource(objects) {
  if (!objects.length) return null;
  const header = Object.keys(objects[0]);
  return SOURCES.find((s) => s.detect(header)) || null;
}

/**
 * Normalise a mapped row into a review record. Ratings become a 0–10 integer
 * so a 4/5 from Letterboxd and a 4/5 from Goodreads are the same number, while
 * `originalRating` keeps what the source actually said.
 */
export function toRecord(mapped, source) {
  const normalised = mapped.rating == null
    ? null
    : Math.round((mapped.rating / (mapped.ratingScale || 5)) * 10);

  return {
    $type: REVIEW_COLLECTION,
    subject: {
      type: source.subject,
      title: mapped.title || '',
      creator: mapped.creator || undefined,
      year: mapped.year,
      identifiers: mapped.isbn ? { isbn: mapped.isbn } : undefined,
      canonical: mapped.canonical || undefined,
    },
    rating: normalised,
    ratingScale: 10,
    originalRating: mapped.rating == null ? undefined : {
      value: mapped.rating, scale: mapped.ratingScale || 5, source: source.id,
    },
    body: mapped.body || undefined,
    tags: (mapped.tags || []).length ? mapped.tags : undefined,
    reviewedAt: normaliseDate(mapped.reviewedAt),
    importedFrom: source.id,
    createdAt: new Date().toISOString(),
  };
}

function normaliseDate(v) {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(+d)) return undefined;
  return d.toISOString();
}

/** Import summary numbers for the UI. */
export function summarise(records) {
  const rated = records.filter((r) => r.rating != null);
  const withText = records.filter((r) => r.body && r.body.length > 2);
  const histogram = Array.from({ length: 11 }, () => 0);
  for (const r of rated) histogram[r.rating] = (histogram[r.rating] || 0) + 1;
  const mean = rated.length
    ? rated.reduce((s, r) => s + r.rating, 0) / rated.length
    : null;
  const years = records
    .map((r) => (r.reviewedAt || '').slice(0, 4))
    .filter((y) => /^\d{4}$/.test(y));
  const byYear = {};
  for (const y of years) byYear[y] = (byYear[y] || 0) + 1;
  return { total: records.length, rated: rated.length, withText: withText.length, histogram, mean, byYear };
}
