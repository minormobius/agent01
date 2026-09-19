// orbit/repo-scan.js — one repository in, one row of the closeness matrix out.
//
// WHAT IT IS FOR. The game's ring is a month of the seed's own reaching-out.
// The matrix is the other question: over the WHOLE history of every account in
// that ring, who spoke to whom first, and how much have they spoken since. That
// cannot come from the AppView — there is no "all interactions between A and B,
// ever" endpoint — so it comes from the repositories themselves, one 10-to-90 MB
// CAR at a time, thrown away as soon as its row is extracted.
//
// WHY IT IS NOT palm/car-stream.js. That reader keeps posts and drops
// everything else on the floor, which is right for stylometry and useless here:
// three of the five interaction kinds are likes and reposts, and likes usually
// outnumber posts several times over. So this reader keeps like and repost
// records too — but only their subject's DID, and only when that DID is one of
// the dozen accounts we are asking about. What it stores is bounded by the size
// of the ring, not by the size of the repo.
//
// The CBOR decoder, the varint reader, the CID length and the hex are IMPORTED
// from palm/car-stream.js rather than copied. There are already three CAR paths
// on this surface; this is not a fourth reader, it is a fourth filter over the
// same one. Fix a decoding bug there and it is fixed here.
//
// Runs unchanged in node and the browser. No dependencies, no WASM.

import { uvarint, cidLength, hex, decode } from '../palm/car-stream.js';

const TD = new TextDecoder('utf-8', { fatal: false });

// An MST node is a 2-entry map whose first key is the text "e" — the same
// three-byte sniff palm/car-stream.js uses. Keep them in step.
const MST_A2 = 0xa2, MST_61 = 0x61, MST_65 = 0x65;

const bytesOf = (s) => Array.from(s, (c) => c.charCodeAt(0));

// A record's $type is a CBOR text string, so it is preceded by its own length
// byte. Anchoring on that length byte is the whole trick: a LIKE contains the
// text "app.bsky.feed.post" inside subject.uri, but there it sits behind a '/'
// in a much longer string, never behind 0x72. Get this wrong and every like in
// the repo is counted as a post.
const MARKS = [
  { kind: 'post',   bytes: [0x72, ...bytesOf('app.bsky.feed.post')] },   // len 18
  { kind: 'like',   bytes: [0x72, ...bytesOf('app.bsky.feed.like')] },   // len 18
  { kind: 'repost', bytes: [0x74, ...bytesOf('app.bsky.feed.repost')] }, // len 20
];

export const COLLECTION = {
  post: 'app.bsky.feed.post',
  like: 'app.bsky.feed.like',
  repost: 'app.bsky.feed.repost',
};

/** The interaction kinds a row can carry. `mention` rides along inside a post. */
export const KINDS = ['reply', 'quote', 'repost', 'like', 'mention'];

/**
 * One pass over a block body: which record kind, if any, does it look like?
 * A prefilter only — the decoded record's own $type is what decides.
 */
export function sniff(b, from, to) {
  const last = to - 19;
  for (let i = from; i <= last; i++) {
    const c = b[i];
    if (c !== 0x72 && c !== 0x74) continue;
    for (const m of MARKS) {
      if (c !== m.bytes[0] || i + m.bytes.length > to) continue;
      let ok = true;
      for (let j = 1; j < m.bytes.length; j++) if (b[i + j] !== m.bytes[j]) { ok = false; break; }
      if (ok) return m.kind;
    }
  }
  return null;
}

/** `at://did:plc:xyz/app.bsky.feed.post/3k…` → `did:plc:xyz`. */
export function uriDid(uri) {
  if (typeof uri !== 'string') return null;
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri);
  return m ? m[1] : null;
}

/** The quoted post's uri, across both embed shapes. */
export function quoteUri(rec) {
  const e = rec && rec.embed;
  if (!e || typeof e !== 'object') return null;
  const t = e['$type'];
  let uri = null;
  if (t === 'app.bsky.embed.record' && e.record) uri = e.record.uri;
  else if (t === 'app.bsky.embed.recordWithMedia' && e.record && e.record.record) uri = e.record.record.uri;
  return (typeof uri === 'string' && uri.includes('/app.bsky.feed.post/')) ? uri : null;
}

/** Every DID this post @-mentions, from its facets. */
export function mentionDids(rec) {
  const out = [];
  for (const f of (Array.isArray(rec && rec.facets) ? rec.facets : [])) {
    for (const feat of (Array.isArray(f && f.features) ? f.features : [])) {
      if (feat && typeof feat['$type'] === 'string' && feat['$type'].endsWith('#mention') && typeof feat.did === 'string') out.push(feat.did);
    }
  }
  return out;
}

const emptyCell = () => ({ reply: 0, quote: 0, repost: 0, like: 0, mention: 0, total: 0 });

/**
 * Incremental reader. Feed it chunks, ask it for the row at the end.
 *
 *   const r = createPairReader(subjectDid, new Set(otherDids));
 *   for await (const chunk of body) r.push(chunk);
 *   const row = r.finish();
 */
export function createPairReader(subjectDid, targets, { onProgress } = {}) {
  const want = targets instanceof Set ? targets : new Set(targets || []);
  want.delete(subjectDid);                                  // nobody interacts with themselves

  let carry = new Uint8Array(0);
  let headerRead = false;
  let bytes = 0, blocks = 0, posts = 0, records = 0;

  const counts = new Map();                                 // targetDid -> cell
  const kept = new Map();                                   // targetDid -> first contact
  const rkeys = new Map();                                  // cidHex -> rkey (posts only)

  const cell = (did) => {
    let c = counts.get(did);
    if (!c) { c = emptyCell(); counts.set(did, c); }
    return c;
  };
  const bump = (did, kind) => {
    if (!did || !want.has(did)) return;
    const c = cell(did);
    c[kind]++; c.total++;
  };

  // The earliest reply from the subject to a target — or, when they have never
  // replied at all, the earliest quote, flagged as one. A reply outranks a
  // quote whatever the dates say: the question is "when did you first speak to
  // them", and a quote is speaking ABOUT someone.
  //
  // createdAt is self-reported and occasionally a lie (see /groom's note on
  // future-dated records). It is the only timestamp a repo record carries, so
  // "first" here is a claim about the record, not about wall-clock truth.
  //
  // Keyed by TARGET, not by CID, because one post can reply to one person and
  // quote another — keying by CID silently dropped the second of those.
  const offer = (cid, target, kind, rec) => {
    if (!target || !want.has(target)) return;
    const at = typeof rec.createdAt === 'string' ? rec.createdAt : '';
    const best = kept.get(target);
    if (best) {
      const better = (kind === 'reply' && best.kind !== 'reply')
        || (kind === best.kind && at && (!best.createdAt || at < best.createdAt));
      if (!better) return;
    }
    kept.set(target, { cid, kind, createdAt: at, text: (typeof rec.text === 'string' ? rec.text : '').slice(0, 400) });
  };

  function readMstNode(node) {
    const entries = node && node.e;
    if (!Array.isArray(entries)) return;
    let last = '';
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const suffix = e.k;
      if (!(suffix instanceof Uint8Array)) continue;
      const p = typeof e.p === 'number' ? e.p : 0;
      // Prefix compression is node-LOCAL: `last` resets with every node, which
      // is exactly why this reader never has to walk the tree in order.
      const key = (p > 0 && p <= last.length ? last.slice(0, p) : '') + TD.decode(suffix);
      last = key;
      if (key.startsWith('app.bsky.feed.post/') && e.v && e.v.$link) {
        rkeys.set(e.v.$link, key.slice('app.bsky.feed.post/'.length));
      }
    }
  }

  function handle(cid, rec) {
    const t = rec && rec['$type'];
    if (t === COLLECTION.like || t === COLLECTION.repost) {
      const did = uriDid(rec.subject && rec.subject.uri);
      bump(did, t === COLLECTION.like ? 'like' : 'repost');
      records++;
      return;
    }
    if (t !== COLLECTION.post) return;
    posts++; records++;
    const parent = rec.reply && rec.reply.parent ? uriDid(rec.reply.parent.uri) : null;
    if (parent) { bump(parent, 'reply'); offer(cid, parent, 'reply', rec); }
    const q = uriDid(quoteUri(rec));
    if (q) { bump(q, 'quote'); offer(cid, q, 'quote', rec); }
    for (const m of mentionDids(rec)) bump(m, 'mention');
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

      const cl = cidLength(b, dataStart);
      if (cl <= 0 || dataStart + cl > end) { pos = end; blocks++; continue; }
      const bodyStart = dataStart + cl;

      if (b[bodyStart] === MST_A2 && b[bodyStart + 1] === MST_61 && b[bodyStart + 2] === MST_65) {
        try { readMstNode(decode(b, bodyStart)[0]); } catch { /* a bad node costs us its keys */ }
      } else if (sniff(b, bodyStart, end)) {
        try { handle(hex(b.subarray(dataStart, dataStart + cl)), decode(b, bodyStart)[0]); } catch { /* skip */ }
      }
      pos = end; blocks++;
    }
  }

  return {
    push(chunk) {
      bytes += chunk.length;
      let b;
      if (carry.length === 0) b = chunk;
      else { b = new Uint8Array(carry.length + chunk.length); b.set(carry, 0); b.set(chunk, carry.length); }
      const used = consume(b);
      carry = used >= b.length ? new Uint8Array(0) : b.slice(used);
      if (onProgress) onProgress({ bytes, blocks, posts });
    },
    bytesRead() { return bytes; },

    finish() {
      const first = {};
      for (const [target, k] of kept) {
        const rkey = rkeys.get(k.cid) || null;
        first[target] = {
          kind: k.kind,
          rkey,
          createdAt: k.createdAt || null,
          text: k.text,
          uri: rkey ? `at://${subjectDid}/app.bsky.feed.post/${rkey}` : null,
        };
      }
      const out = {
        did: subjectDid,
        counts: Object.fromEntries([...counts].map(([d, c]) => [d, c])),
        first,
        posts, records, bytes, blocks,
      };
      kept.clear(); rkeys.clear(); counts.clear(); carry = new Uint8Array(0);
      return out;
    },
  };
}

/** Convenience for tests: read a CAR already in memory. */
export function readPairs(bytes, subjectDid, targets) {
  const r = createPairReader(subjectDid, targets);
  r.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return r.finish();
}

/**
 * Stream one repo off its PDS and throw it away. `getRepo` is public and
 * unauthenticated — no token is ever sent — and nothing larger than one network
 * chunk plus this row is ever held.
 */
export async function scanRepo(pds, did, targets, { onProgress, signal } = {}) {
  const url = `${String(pds).replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`getRepo failed (${res.status})`);
  const total = parseInt(res.headers.get('content-length') || '0', 10) || null;
  const reader = createPairReader(did, targets, {
    onProgress: onProgress ? (p) => onProgress({ ...p, total }) : undefined,
  });
  const body = res.body.getReader();
  for (;;) {
    const { done, value } = await body.read();
    if (done) break;
    reader.push(value);
  }
  return reader.finish();
}
