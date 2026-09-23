// orbit/matrix.js — the closeness matrix: assembly, reading, and the permalink.
//
// A row is one person's repository, read once and thrown away. Cell (i, j) is
// what person i did TO person j across their whole history: the first time they
// replied, and how much they have interacted since. The matrix is directed on
// purpose — "who spoke first" has no meaning symmetrised, and the interesting
// asymmetries (one person always replying, the other never answering) are the
// part a heat map can actually show you.
//
// THE PERMALINK IS THE POINT. Filling this thing costs thirteen full repository
// downloads — hundreds of megabytes on the reader's own connection, minutes of
// it. An object that expensive should survive being closed. So the whole state
// packs into a URL fragment: deflate-raw, base64url, no server, nothing stored
// anywhere. Post TEXT is deliberately left out and re-fetched from the AppView
// on open — 169 cells of text would be 50 KB of fragment, where 169 rkeys are
// under three, and a post that has since been deleted then reads as deleted
// instead of as a quotation from a ghost.
//
// Pure. No DOM, no network. Gated by orbit.selftest.mjs.

export const VERSION = 1;
export const KIND_CODE = { none: 0, reply: 1, quote: 2 };
export const CODE_KIND = ['none', 'reply', 'quote'];

/** Fresh state for a seed and its ring. Index 0 is always the seed. */
export function newState(seed, ring) {
  const people = [seed, ...ring].map((p) => ({
    did: p.did, handle: p.handle || p.did, displayName: p.displayName || '', avatar: p.avatar || null,
  }));
  return { v: VERSION, people, rows: [], cells: {}, at: Math.floor(Date.now() / 1000) };
}

export const key = (i, j) => `${i},${j}`;
export const indexOf = (state, did) => state.people.findIndex((p) => p.did === did);
export const size = (state) => state.people.length;

/**
 * Fold one repository's extract (from repo-scan.js) into the matrix as a row.
 * Rows are recorded in `rows` so a half-finished matrix can say which of its
 * blanks are "no interaction" and which are "not read yet" — a distinction the
 * heat map would otherwise get wrong in the most flattering direction.
 */
export function applyRow(state, extract) {
  const i = indexOf(state, extract.did);
  if (i < 0) return state;
  for (let j = 0; j < state.people.length; j++) {
    if (j === i) continue;
    const did = state.people[j].did;
    const c = extract.counts && extract.counts[did];
    const f = extract.first && extract.first[did];
    if (!c && !f) continue;
    state.cells[key(i, j)] = {
      counts: c ? { reply: c.reply | 0, quote: c.quote | 0, repost: c.repost | 0, like: c.like | 0, mention: c.mention | 0, total: c.total | 0 } : null,
      first: f ? { kind: f.kind, rkey: f.rkey || null, createdAt: f.createdAt || null, text: f.text || '' } : null,
    };
  }
  if (!state.rows.includes(i)) state.rows.push(i);
  state.rows.sort((a, b) => a - b);
  return state;
}

export const hasRow = (state, i) => state.rows.includes(i);
export const cell = (state, i, j) => state.cells[key(i, j)] || null;

/** `at://` uri of the first-contact post in cell (i, j), if there is one. */
export function firstUri(state, i, j) {
  const c = cell(state, i, j);
  if (!c || !c.first || !c.first.rkey) return null;
  return `at://${state.people[i].did}/app.bsky.feed.post/${c.first.rkey}`;
}

/** Progress, for the UI and for deciding whether the matrix is worth sharing. */
export function progress(state) {
  return { done: state.rows.length, total: state.people.length };
}

/**
 * The biggest interaction volume in the matrix, for scaling the heat. Computed
 * rather than fixed because one pair in a circle is routinely an order of
 * magnitude above the rest, and a fixed ceiling would flatten everyone else to
 * the same pale square.
 */
export function maxVolume(state) {
  let max = 0;
  for (const k in state.cells) {
    const c = state.cells[k];
    if (c && c.counts && c.counts.total > max) max = c.counts.total;
  }
  return max;
}

/** Oldest and newest first-contact dates present, for scaling the date view. */
export function dateRange(state) {
  let lo = null, hi = null;
  for (const k in state.cells) {
    const f = state.cells[k] && state.cells[k].first;
    const t = f && f.createdAt ? Date.parse(f.createdAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (lo === null || t < lo) lo = t;
    if (hi === null || t > hi) hi = t;
  }
  return { lo, hi };
}

/**
 * Per-pair reciprocity, over pairs where BOTH rows were read — the only pairs
 * where "they never answered" can be told apart from "we have not looked".
 * `lead` is how many days the opener spoke before the answer came back, or null
 * when only one direction ever happened.
 */
export function pairs(state) {
  const out = [];
  const n = state.people.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!hasRow(state, i) || !hasRow(state, j)) continue;
      const a = cell(state, i, j), b = cell(state, j, i);
      const av = a && a.counts ? a.counts.total : 0;
      const bv = b && b.counts ? b.counts.total : 0;
      const at = a && a.first && a.first.createdAt ? Date.parse(a.first.createdAt) : null;
      const bt = b && b.first && b.first.createdAt ? Date.parse(b.first.createdAt) : null;
      let opener = null, lead = null;
      if (Number.isFinite(at) && Number.isFinite(bt)) { opener = at <= bt ? i : j; lead = Math.abs(at - bt) / 86400000; }
      else if (Number.isFinite(at)) opener = i;
      else if (Number.isFinite(bt)) opener = j;
      out.push({ i, j, volume: av + bv, balance: (av + bv) ? (av - bv) / (av + bv) : 0, opener, lead, first: Math.min(at ?? Infinity, bt ?? Infinity) });
    }
  }
  return out.sort((x, y) => y.volume - x.volume);
}

// ── the permalink codec ──────────────────────────────────────────────────────

/** State → the compact array form that goes into the URL. Drops post text. */
export function pack(state) {
  const cells = [];
  for (const k in state.cells) {
    const [i, j] = k.split(',').map(Number);
    const c = state.cells[k];
    const co = c.counts || { reply: 0, quote: 0, repost: 0, like: 0, mention: 0 };
    const f = c.first;
    cells.push([
      i, j, co.reply | 0, co.quote | 0, co.repost | 0, co.like | 0, co.mention | 0,
      f ? (KIND_CODE[f.kind] || 0) : 0,
      f && f.rkey ? f.rkey : '',
      f && f.createdAt ? Math.floor(Date.parse(f.createdAt) / 60000) || 0 : 0,
    ]);
  }
  return {
    v: VERSION,
    d: state.people.map((p) => p.did),
    h: state.people.map((p) => p.handle || ''),
    r: state.rows.slice(),
    c: cells,
    t: state.at || Math.floor(Date.now() / 1000),
  };
}

/** The compact form → state. Text comes back empty; the page rehydrates it. */
export function unpack(p) {
  if (!p || p.v !== VERSION) throw new Error('unrecognised matrix version');
  const people = (p.d || []).map((did, i) => ({ did, handle: (p.h || [])[i] || did, displayName: '', avatar: null }));
  const cells = {};
  for (const row of (p.c || [])) {
    const [i, j, reply, quote, repost, like, mention, kindCode, rkey, mins] = row;
    const total = (reply | 0) + (quote | 0) + (repost | 0) + (like | 0) + (mention | 0);
    cells[key(i, j)] = {
      counts: { reply: reply | 0, quote: quote | 0, repost: repost | 0, like: like | 0, mention: mention | 0, total },
      first: kindCode ? {
        kind: CODE_KIND[kindCode] || 'reply',
        rkey: rkey || null,
        createdAt: mins ? new Date(mins * 60000).toISOString() : null,
        text: '',
      } : null,
    };
  }
  return { v: VERSION, people, rows: (p.r || []).slice(), cells, at: p.t || 0 };
}

// base64url over raw bytes — no padding, URL- and fragment-safe.
export function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = (typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64'));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    const s = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function through(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** State → the fragment payload. */
export async function encodeState(state) {
  const json = new TextEncoder().encode(JSON.stringify(pack(state)));
  return b64urlEncode(await through(json, new CompressionStream('deflate-raw')));
}

/** The fragment payload → state. Throws on anything it does not recognise. */
export async function decodeState(payload) {
  const raw = await through(b64urlDecode(payload), new DecompressionStream('deflate-raw'));
  return unpack(JSON.parse(new TextDecoder().decode(raw)));
}
