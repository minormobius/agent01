// days/repoindex.js — every record in a repo, counted into the day it was made.
//
// Streams the CAR (com.atproto.sync.getRepo, public, unauthenticated) and keeps
// almost nothing:
//
//   EVERY record's key (`collection/rkey`) comes from the MST nodes, and almost
//   every rkey is a TID — the microsecond the record was minted. So each key is
//   COUNTED into its day the moment its node streams past, and then dropped.
//   The calendar costs a Map of days, whatever the size of the repo.
//
//   POSTS are the one record type a day view shows from the repo itself, so
//   post records are decoded and kept (text, reply or not, embed kind). Likes,
//   reposts and follows are not decoded at all: a day's worth is fetched when
//   that day is opened (listRecords with a TID cursor, see dayRecords()).
//
// Measured 2026-11-23 on a 90 MB / 245k-record repo: keeping a summary of
// every record instead cost a 623 MB heap — a dead phone tab. Hence this.
//
// Block framing and CBOR decoding are palm's (b/palm/car-stream.js); the post
// sniff is orbit's (b/orbit/repo-scan.js): a 0x72 length byte + the 18-char
// type, which a like's subject URI can never produce. A fix there is a fix here.

import { uvarint, cidLength, hex, decode } from '../palm/car-stream.js';
import { sniff } from '../orbit/repo-scan.js';

const TD = new TextDecoder('utf-8', { fatal: false });
const S32 = '234567abcdefghijklmnopqrstuvwxyz';
const MIN_T = Date.parse('2022-11-01T00:00:00Z');   // before Bluesky's first records
const POST = 'app.bsky.feed.post';

/** A TID record key → ms since epoch, or NaN if it is not a TID. */
export function tidTime(rkey) {
  if (typeof rkey !== 'string' || rkey.length !== 13 || !/^[234567a-j][234567a-z]{12}$/.test(rkey)) return NaN;
  let v = 0n;
  for (const c of rkey) v = v * 32n + BigInt(S32.indexOf(c));
  return Number((v >> 10n) / 1000n);
}

/** ms → the TID that sorts exactly there (clock id 0). The listRecords cursor for a moment. */
export function tidAt(ms) {
  let v = BigInt(Math.max(0, Math.floor(ms))) * 1000n << 10n;
  let s = '';
  for (let i = 0; i < 13; i++) { s = S32[Number(v & 31n)] + s; v >>= 5n; }
  return s;
}

/** Whether a TID time is believable for a Bluesky record. */
export const plausible = (t, now = Date.now()) => Number.isFinite(t) && t >= MIN_T && t <= now + 86400000;

/** The viewer's local calendar day, as YYYY-MM-DD. */
export function localDay(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function embedKind(e) {
  const t = e && e.$type || '';
  if (!t) return null;
  if (t.includes('recordWithMedia')) return 'quote+media';
  if (t.includes('embed.record')) return 'quote';
  if (t.includes('images')) return 'images';
  if (t.includes('video')) return 'video';
  if (t.includes('external')) return 'link';
  return null;
}

/**
 * A push-driven reader: push() each network chunk, finish() at the end.
 * finish() → {
 *   days: Map<'YYYY-MM-DD', {[collection]: n}>,
 *   posts: [{ rkey, t, text, reply, embed }]  oldest first,
 *   first, last,                                 ms of the earliest and latest dated record
 *   collections: {[collection]: n},              every record
 *   undated: {[collection]: n},                  non-TID keys (profile 'self', custom rkeys)
 *   bytes, blocks
 * }
 */
export function createIndexer({ now = Date.now(), dayOf = localDay } = {}) {
  let carry = new Uint8Array(0), headerRead = false, bytes = 0, blocks = 0;
  const days = new Map(), collections = {}, undated = {};
  const postKeys = new Map();      // cidHex -> rkey, posts only
  const postBodies = new Map();    // cidHex -> {text, reply, embed, createdAt}
  let first = Infinity, last = -Infinity;

  function count(key) {
    const slash = key.indexOf('/');
    if (slash < 0) return null;
    const col = key.slice(0, slash), rkey = key.slice(slash + 1);
    collections[col] = (collections[col] || 0) + 1;
    const t = tidTime(rkey);
    if (!plausible(t, now)) { undated[col] = (undated[col] || 0) + 1; return null; }
    const d = dayOf(t);
    let row = days.get(d);
    if (!row) { row = {}; days.set(d, row); }
    row[col] = (row[col] || 0) + 1;
    if (t < first) first = t;
    if (t > last) last = t;
    return col === POST ? rkey : null;
  }

  function readMstNode(node) {
    const entries = node && node.e;
    if (!Array.isArray(entries)) return;
    let prev = '';
    for (const e of entries) {
      if (!e || typeof e !== 'object' || !(e.k instanceof Uint8Array)) continue;
      const p = typeof e.p === 'number' ? e.p : 0;
      const key = (p > 0 && p <= prev.length ? prev.slice(0, p) : '') + TD.decode(e.k);
      prev = key;
      const postRkey = count(key);
      if (postRkey && e.v && e.v.$link) postKeys.set(e.v.$link, postRkey);
    }
  }

  function consume(b) {
    let pos = 0;
    if (!headerRead) {
      const h = uvarint(b, pos);
      if (!h) return pos;
      const [hlen, hstart] = h;
      if (hstart + hlen > b.length) return pos;
      pos = hstart + hlen;
      headerRead = true;
    }
    for (;;) {
      const r = uvarint(b, pos);
      if (!r) return pos;
      const [len, dataStart] = r;
      const end = dataStart + len;
      if (end > b.length) return pos;
      blocks++;
      const cl = cidLength(b, dataStart);
      if (cl <= 0 || dataStart + cl > end) { pos = end; continue; }
      const s = dataStart + cl;
      try {
        if (b[s] === 0xa2 && b[s + 1] === 0x61 && b[s + 2] === 0x65) {        // MST node: {e: …}
          readMstNode(decode(b, s)[0]);
        } else if (sniff(b, s, end) === 'post') {
          const rec = decode(b, s)[0];
          if (rec && rec.$type === POST) {
            postBodies.set(hex(b.subarray(dataStart, s)), {
              text: typeof rec.text === 'string' ? rec.text.slice(0, 3000) : '',
              reply: !!(rec.reply && rec.reply.parent),
              embed: embedKind(rec.embed),
            });
          }
        }
      } catch { /* an unreadable block costs that block only */ }
      pos = end;
    }
  }

  return {
    push(chunk) {
      bytes += chunk.length;
      let b;
      if (!carry.length) b = chunk;
      else { b = new Uint8Array(carry.length + chunk.length); b.set(carry, 0); b.set(chunk, carry.length); }
      const used = consume(b);
      carry = used >= b.length ? new Uint8Array(0) : b.slice(used);
    },
    bytesRead: () => bytes,
    finish() {
      const posts = [];
      for (const [cid, rkey] of postKeys) {
        const body = postBodies.get(cid);
        posts.push({ rkey, t: tidTime(rkey), ...(body || { text: null, reply: false, embed: null }) });
      }
      posts.sort((a, b) => a.t - b.t);
      postKeys.clear(); postBodies.clear(); carry = new Uint8Array(0);
      return { days, posts, first, last, collections, undated, bytes, blocks };
    },
  };
}

/** Stream a repo off its PDS into an index. */
export async function indexRepo(pds, did, { onProgress, signal, dayOf } = {}) {
  const url = `${String(pds).replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`could not download the repo (${res.status})`);
  const total = parseInt(res.headers.get('content-length') || '0', 10) || null;
  const ix = createIndexer({ dayOf });
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    ix.push(value);
    if (onProgress) onProgress({ bytes: ix.bytesRead(), total });
  }
  return ix.finish();
}

/**
 * One collection's records between two moments, newest first, straight from
 * the PDS. listRecords is ordered by rkey and a TID rkey is a time, so the
 * cursor `tidAt(end)` starts exactly at the end of the window and paging stops
 * the moment a record falls before its start. A day of likes is one request.
 */
export async function dayRecords(pds, did, collection, start, end, { limit = 300, pages = 10, signal } = {}) {
  const out = [];
  let cursor = tidAt(end);
  for (let page = 0; page < pages && out.length < limit; page++) {
    const u = `${String(pds).replace(/\/$/, '')}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}`
      + `&collection=${encodeURIComponent(collection)}&limit=100&cursor=${encodeURIComponent(cursor)}`;
    const r = await fetch(u, { signal });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    let past = false;
    for (const rec of j.records || []) {
      const rkey = rec.uri.split('/').pop();
      const t = tidTime(rkey);
      if (!Number.isFinite(t)) continue;
      if (t < start) { past = true; break; }
      if (t < end) out.push({ rkey, t, value: rec.value });
    }
    if (past || !j.cursor) break;
    cursor = j.cursor;
  }
  return out;
}
