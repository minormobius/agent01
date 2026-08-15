// palm/car-stream.js — pull the posts out of a repo without ever holding the repo.
//
// WHY THIS EXISTS. `b/` already had two CAR paths (coin/lexicon.js and lathe's
// `archive` source) and both do the same thing: buffer the entire download,
// concatenate it, hand it to the Rust/WASM parser, get back NDJSON for EVERY
// record in the repo, and `.split('\n')` that. For a small account it is fine.
// For a 90 MB / 50k-post repo it is roughly:
//
//     chunk array (90 MB) + contiguous copy (90 MB) + wasm linear memory (90 MB)
//   + NDJSON of all ~500k records as one JS string (UTF-16, so ~2x its bytes)
//   + the array of 500k strings that split() allocates
//
// ...which is where the tab dies. This module reads the CAR as it arrives, keeps
// only `app.bsky.feed.post` records, and drops every other block on the floor.
// Peak memory is one network chunk plus the posts themselves.
//
// WHY NO MST WALK. Prefix compression inside an MST node is node-LOCAL — see
// os/crates/car-parser/src/mst.rs, where `last_key` is reset at the top of every
// node. So each node decodes on its own and block order does not matter: collect
// key -> CID from whatever nodes stream past, collect CID -> record from the
// record blocks, and join at the end. No roots, no recursion, no block index.
//
// Runs unchanged in node and the browser. No dependencies.

const TD = new TextDecoder('utf-8', { fatal: false });

// ── varint ───────────────────────────────────────────────────────────────────
// Unsigned LEB128. Returns [value, nextOffset] or null when the buffer is short.
// Arithmetic rather than bit ops: `1 << 28` is fine but `1 << 35` is not, and a
// block length is allowed to exceed 32 bits on paper.
export function uvarint(b, p) {
  let x = 0, shift = 1;
  for (let i = 0; i < 9; i++) {
    if (p >= b.length) return null;
    const c = b[p++];
    x += (c & 0x7f) * shift;
    if (c < 0x80) return [x, p];
    shift *= 128;
  }
  throw new Error('varint too long');
}

// ── CID ──────────────────────────────────────────────────────────────────────
// Binary CID as it appears in a CAR block header. We only need its LENGTH (to
// find where the block payload starts) and its bytes (as an identity key). We
// never verify the digest — the PDS already did, and hashing 90 MB in JS to
// re-learn what the CAR told us would cost more than the parse.
export function cidLength(b, p) {
  const start = p;
  let r = uvarint(b, p);
  if (!r) return 0;
  const version = r[0];
  p = r[1];

  // CIDv0 is a bare sha2-256 multihash: 0x12 0x20 followed by 32 bytes.
  if (version === 0x12) return 34;
  if (version !== 1) return 0;

  r = uvarint(b, p); if (!r) return 0; p = r[1];            // codec
  r = uvarint(b, p); if (!r) return 0; p = r[1];            // hash function
  r = uvarint(b, p); if (!r) return 0; p = r[1];            // digest length
  const digestLen = r[0];
  return (p - start) + digestLen;
}

const HEX = [];
for (let i = 0; i < 256; i++) HEX.push(i.toString(16).padStart(2, '0'));
export function hex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i]];
  return s;
}

// ── DAG-CBOR ─────────────────────────────────────────────────────────────────
// The subset ATProto actually emits: uints, negative ints, byte strings, text,
// arrays, maps with text keys, tag 42 (CID), false/true/null and float64.
// Indefinite-length items are not valid DAG-CBOR, so they are an error here.
//
// A CID decodes to { $link: '<hex>' } so it compares as a plain string.
export function decode(b, p = 0) {
  const ib = b[p++];
  if (ib === undefined) throw new Error('cbor: truncated');
  const major = ib >> 5;
  const ai = ib & 0x1f;

  let val = ai;
  if (ai === 24) { val = b[p]; p += 1; }
  else if (ai === 25) { val = b[p] * 256 + b[p + 1]; p += 2; }
  else if (ai === 26) { val = b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3]; p += 4; }
  else if (ai === 27) {
    if (major === 7) {                                     // float64
      const dv = new DataView(b.buffer, b.byteOffset + p, 8);
      return [dv.getFloat64(0), p + 8];
    }
    const hi = b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3];
    const lo = b[p + 4] * 16777216 + b[p + 5] * 65536 + b[p + 6] * 256 + b[p + 7];
    val = hi * 4294967296 + lo; p += 8;
  }
  else if (ai > 27) throw new Error('cbor: bad additional info ' + ai);

  switch (major) {
    case 0: return [val, p];
    case 1: return [-1 - val, p];
    case 2: return [b.subarray(p, p + val), p + val];
    case 3: return [TD.decode(b.subarray(p, p + val)), p + val];
    case 4: {
      const arr = new Array(val);
      for (let i = 0; i < val; i++) { const r = decode(b, p); arr[i] = r[0]; p = r[1]; }
      return [arr, p];
    }
    case 5: {
      const obj = {};
      for (let i = 0; i < val; i++) {
        const k = decode(b, p); p = k[1];
        const v = decode(b, p); p = v[1];
        obj[k[0]] = v[0];
      }
      return [obj, p];
    }
    case 6: {
      const r = decode(b, p);
      if (val !== 42) return [r[0], r[1]];                 // unknown tag: pass through
      const raw = r[0];                                    // 0x00 multibase prefix + binary CID
      return [{ $link: hex(raw.subarray(raw[0] === 0 ? 1 : 0)) }, r[1]];
    }
    case 7:
      if (val === 20) return [false, p];
      if (val === 21) return [true, p];
      if (val === 22) return [null, p];
      if (val === 23) return [undefined, p];
      return [null, p];
  }
  throw new Error('cbor: unreachable');
}

// ── block classification ─────────────────────────────────────────────────────
// Decoding all ~500k blocks in a big repo would cost more than the download, so
// each block is sniffed first and only candidates are decoded.
//
// An MST node is exactly {"e": [...], "l": <cid|null>}. DAG-CBOR sorts map keys
// by length then bytes, so "e" precedes "l" and every node starts with the three
// bytes A2 61 65 — map(2), text(1), 'e'.
const MST_A2 = 0xa2, MST_61 = 0x61, MST_65 = 0x65;

// A post record carries $type: "app.bsky.feed.post". In DAG-CBOR that value is
// a text string of length 18, so it is preceded by 0x72. Anchoring on the length
// byte is what separates a real post from a LIKE, whose subject.uri merely
// CONTAINS "app.bsky.feed.post" inside a much longer at:// string — and likes
// usually outnumber posts several times over.
const POST_MARK = [0x72, ...Array.from('app.bsky.feed.post', (c) => c.charCodeAt(0))];

function hasMark(b, from, to, mark) {
  const first = mark[0], last = to - mark.length;
  outer:
  for (let i = from; i <= last; i++) {
    if (b[i] !== first) continue;
    for (let j = 1; j < mark.length; j++) if (b[i + j] !== mark[j]) continue outer;
    return true;
  }
  return false;
}

const POST_COLLECTION = 'app.bsky.feed.post';
const KEY_PREFIX = POST_COLLECTION + '/';

// The at:// URI of a reply parent, reduced to the DID of whoever wrote it.
function uriDid(uri) {
  if (typeof uri !== 'string') return null;
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri);
  return m ? m[1] : null;
}

function embedKind(embed) {
  if (!embed || typeof embed !== 'object') return null;
  const t = embed['$type'];
  if (typeof t !== 'string') return null;
  if (t.includes('images') || t.includes('gallery')) return 'image';
  if (t.includes('video')) return 'video';
  if (t.includes('external')) return 'link';
  if (t.includes('record')) return 'quote';
  return 'other';
}

/**
 * Reduce a decoded post record to the fields the readings actually use.
 * Deliberately lossy — this is what bounds memory on a 50k-post repo.
 */
function shrinkPost(rec) {
  const facets = Array.isArray(rec.facets) ? rec.facets : [];
  let links = 0, mentions = 0, tags = 0;
  for (const f of facets) {
    for (const feat of (Array.isArray(f.features) ? f.features : [])) {
      const t = feat && feat['$type'];
      if (typeof t !== 'string') continue;
      if (t.endsWith('#link')) links++;
      else if (t.endsWith('#mention')) mentions++;
      else if (t.endsWith('#tag')) tags++;
    }
  }
  return {
    rkey: null,                                            // filled in from the MST
    text: typeof rec.text === 'string' ? rec.text : '',
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : null,
    lang: Array.isArray(rec.langs) && rec.langs.length ? String(rec.langs[0]) : null,
    replyTo: rec.reply && rec.reply.parent ? uriDid(rec.reply.parent.uri) : null,
    isReply: !!(rec.reply && rec.reply.parent),
    embed: embedKind(rec.embed),
    links, mentions, tags,
  };
}

// ── the reader ───────────────────────────────────────────────────────────────

/**
 * Incremental CAR reader. Feed it chunks; ask it for posts at the end.
 *
 *   const r = createReader();
 *   for await (const chunk of stream) r.push(chunk);
 *   const { posts, collections, bytes } = r.finish();
 */
export function createReader({ onProgress } = {}) {
  let carry = new Uint8Array(0);       // bytes of an incomplete trailing block
  let headerRead = false;
  let bytes = 0, blocks = 0;

  const records = new Map();           // cidHex -> shrunk post
  const rkeys = new Map();             // cidHex -> rkey
  const collections = new Map();       // collection -> record count

  function tally(key) {
    const slash = key.indexOf('/');
    const col = slash < 0 ? key : key.slice(0, slash);
    collections.set(col, (collections.get(col) || 0) + 1);
  }

  // An MST node: harvest key -> CID for posts, and per-collection counts for
  // everything else. Prefix compression is relative to the previous entry in
  // THIS node only.
  function readMstNode(node) {
    const entries = node && node.e;
    if (!Array.isArray(entries)) return false;
    let last = '';
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const suffix = e.k;
      if (!(suffix instanceof Uint8Array)) continue;
      const p = typeof e.p === 'number' ? e.p : 0;
      const key = (p > 0 && p <= last.length ? last.slice(0, p) : '') + TD.decode(suffix);
      last = key;
      tally(key);
      if (key.startsWith(KEY_PREFIX) && e.v && e.v.$link) {
        rkeys.set(e.v.$link, key.slice(KEY_PREFIX.length));
      }
    }
    return true;
  }

  function consume(b) {
    let pos = 0;

    if (!headerRead) {
      const h = uvarint(b, pos);
      if (!h) return pos;
      const [hlen, hstart] = h;
      if (hstart + hlen > b.length) return pos;            // wait for more
      pos = hstart + hlen;                                 // the header tells us nothing we need
      headerRead = true;
    }

    for (;;) {
      const r = uvarint(b, pos);
      if (!r) return pos;
      const [len, dataStart] = r;
      const end = dataStart + len;
      if (end > b.length) return pos;                      // incomplete block

      const cl = cidLength(b, dataStart);
      if (cl <= 0 || dataStart + cl > end) {               // unparseable — skip the block
        pos = end; blocks++;
        continue;
      }
      const cid = hex(b.subarray(dataStart, dataStart + cl));
      const bodyStart = dataStart + cl;

      if (b[bodyStart] === MST_A2 && b[bodyStart + 1] === MST_61 && b[bodyStart + 2] === MST_65) {
        try { readMstNode(decode(b, bodyStart)[0]); } catch { /* a bad node costs us its keys */ }
      } else if (hasMark(b, bodyStart, end, POST_MARK)) {
        try {
          const rec = decode(b, bodyStart)[0];
          if (rec && rec['$type'] === POST_COLLECTION) records.set(cid, shrinkPost(rec));
        } catch { /* skip */ }
      }

      pos = end;
      blocks++;
    }
  }

  return {
    push(chunk) {
      bytes += chunk.length;
      // Splice the incomplete tail from last time onto the new chunk. `carry` is
      // always smaller than one block, so this copy is proportional to the chunk.
      let b;
      if (carry.length === 0) b = chunk;
      else {
        b = new Uint8Array(carry.length + chunk.length);
        b.set(carry, 0); b.set(chunk, carry.length);
      }
      const used = consume(b);
      carry = used >= b.length ? new Uint8Array(0) : b.slice(used);
      if (onProgress) onProgress({ bytes, posts: records.size, blocks });
    },

    // Pulled rather than pushed, so a UI can repaint on its own clock instead of
    // once per network chunk — a 90 MB repo arrives in thousands of them.
    bytesRead() { return bytes; },
    postsFound() { return records.size; },

    finish() {
      const posts = [];
      for (const [cid, p] of records) {
        p.rkey = rkeys.get(cid) || null;
        posts.push(p);
      }
      // createdAt is self-reported and occasionally a lie, but it is the only
      // timestamp in a repo record. Sort by it and let the readings judge it.
      posts.sort((a, x) => String(a.createdAt || '').localeCompare(String(x.createdAt || '')));
      records.clear(); rkeys.clear(); carry = new Uint8Array(0);
      return {
        posts,
        collections: Object.fromEntries([...collections].sort((a, b2) => b2[1] - a[1])),
        bytes, blocks,
      };
    },
  };
}

/** Convenience for tests and node: read a whole CAR already in memory. */
export function readCar(bytes, opts) {
  const r = createReader(opts);
  r.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return r.finish();
}

/**
 * Stream a repo straight off a PDS. Never holds more than one chunk plus the
 * posts. `getRepo` is public and unauthenticated — no token is sent.
 */
export async function streamRepo(pds, did, { onProgress, signal } = {}) {
  const url = `${String(pds).replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`getRepo failed (${res.status})`);

  const total = parseInt(res.headers.get('content-length') || '0', 10) || null;
  const reader = createReader({
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
