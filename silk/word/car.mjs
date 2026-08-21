// Minimal CAR v1 + DAG-CBOR reader. No dependencies, and no Node built-ins in
// the hot path — this same code runs in a Web Worker on whatever repo a visitor
// types in, so everything below is DataView over a Uint8Array.
//
// We do not walk the MST. Every record block is present in the CAR as its own
// block, so reading every block and keeping the ones whose $type we want is
// both simpler and faster than traversing.
//
// IT IS INCREMENTAL, AND THAT IS THE WHOLE POINT. The first version took the
// finished 91 MB buffer and returned an array of every post record in it, which
// meant a peak of the download (91 MB) plus the concatenated copy (91 MB) plus
// every record as a live JS object — facets, embeds, langs and all — for the
// length of the analysis. That is hundreds of megabytes for a big account and
// it is why the tab died. `createCarParser` is fed chunks as they arrive, holds
// nothing but the tail of an incomplete block, and hands each record to a
// callback that is expected to take what it wants and let it go.
//
// Two things make it cheap as well as small:
//
//   skip()          walks a CBOR value without building it. An MST node is a
//                   large array of entries with CIDs and keys and none of it is
//                   wanted; there are roughly twice as many of those as there
//                   are records.
//   keep            names the fields worth decoding. For a post that is $type,
//                   text, createdAt and reply — facets and embeds are usually
//                   the bulk of the record and are never looked at.

function readVarint(u8, p) {
  let x = 0;
  let s = 0;
  for (;;) {
    const b = u8[p++];
    x += (b & 0x7f) * 2 ** s;
    if ((b & 0x80) === 0) return [x, p];
    s += 7;
  }
}

// Bounds-checked: returns null when the buffer stops mid-varint, which is the
// normal case at the end of every chunk.
function tryVarint(u8, p, end) {
  let x = 0;
  let s = 0;
  while (p < end) {
    const b = u8[p++];
    x += (b & 0x7f) * 2 ** s;
    if ((b & 0x80) === 0) return [x, p];
    s += 7;
    if (s > 63) return null;
  }
  return null;
}

const td = new TextDecoder();

// Major 7 returns before the length bytes are consumed: for a float the "length"
// IS the payload, and reading it as a length and then reading the float after it
// walks four bytes too far. (The old single-function decoder had that wrong too.
// It never showed, because DAG-CBOR forbids float32 and an ATProto post record
// contains no floats at all — but it would have corrupted the first one it met.)
function head(u8, dv, p) {
  const ib = u8[p++];
  const major = ib >> 5;
  const minor = ib & 0x1f;
  if (major === 7) return [7, 0, p, minor];
  let len = minor;
  if (minor === 24) { len = u8[p]; p += 1; }
  else if (minor === 25) { len = dv.getUint16(p); p += 2; }
  else if (minor === 26) { len = dv.getUint32(p); p += 4; }
  else if (minor === 27) { len = Number(dv.getBigUint64(p)); p += 8; }
  return [major, len, p, minor];
}

function decode(u8, dv, p) {
  const [major, len, q, minor] = head(u8, dv, p);
  p = q;
  switch (major) {
    case 0: return [len, p];
    case 1: return [-1 - len, p];
    case 2: return [u8.subarray(p, p + len), p + len];
    case 3: return [td.decode(u8.subarray(p, p + len)), p + len];
    case 4: {
      const a = new Array(len);
      for (let i = 0; i < len; i++) { const [v, r] = decode(u8, dv, p); a[i] = v; p = r; }
      return [a, p];
    }
    case 5: {
      const o = {};
      for (let i = 0; i < len; i++) {
        const [k, q1] = decode(u8, dv, p); p = q1;
        const [v, q2] = decode(u8, dv, p); p = q2;
        o[k] = v;
      }
      return [o, p];
    }
    case 6: return decode(u8, dv, p);              // tag 42 = CID; we never need it
    case 7:
      if (minor === 20) return [false, p];
      if (minor === 21) return [true, p];
      if (minor === 22) return [null, p];
      if (minor === 26) return [dv.getFloat32(p), p + 4];
      if (minor === 27) return [dv.getFloat64(p), p + 8];
      return [null, p];
    default: return [null, p];
  }
}

// Walk past a value, allocating nothing.
function skip(u8, dv, p) {
  const [major, len, q, minor] = head(u8, dv, p);
  p = q;
  switch (major) {
    case 0: case 1: return p;
    case 2: case 3: return p + len;
    case 4: for (let i = 0; i < len; i++) p = skip(u8, dv, p); return p;
    case 5: for (let i = 0; i < len; i++) { p = skip(u8, dv, p); p = skip(u8, dv, p); } return p;
    case 6: return skip(u8, dv, p);
    case 7:
      if (minor === 26) return p + 4;
      if (minor === 27) return p + 8;
      return p;
    default: return p;
  }
}

// A record, or null if this block is not one we want. Bails the moment `$type`
// turns out to be uninteresting, and never builds a field outside `keep`.
function decodeRecord(u8, dv, p, wantTypes, keep) {
  const [major, len, q] = head(u8, dv, p);
  if (major !== 5) return null;                     // records are maps
  p = q;
  let out = null;
  let typed = false;
  for (let i = 0; i < len; i++) {
    const [k, r] = decode(u8, dv, p);
    p = r;
    if (typeof k !== 'string') return null;
    if (k === '$type') {
      const [v, s] = decode(u8, dv, p);
      p = s;
      if (!wantTypes.has(v)) return null;           // the early exit that pays
      typed = true;
      (out ||= {})['$type'] = v;
    } else if (!keep || keep.has(k)) {
      const [v, s] = decode(u8, dv, p);
      p = s;
      (out ||= {})[k] = v;
    } else {
      p = skip(u8, dv, p);
    }
  }
  return typed ? out : null;
}

// A block whose length header says it is bigger than this is a corrupt frame,
// not a record: buffering towards it would swallow the rest of the stream.
const MAX_BLOCK = 8 * 1024 * 1024;
const EMPTY = new Uint8Array(0);

/**
 * Incremental CAR reader. `push(chunk)` as many times as you like, then
 * `end()`. Every matching record goes to `onRecord`, which must take what it
 * wants from it and NOT RETAIN IT: byte-string fields (CIDs, notably) are
 * subarray views onto the chunk you pushed, and a caller streaming from a
 * reused read buffer would find them rewritten underneath it. Strings are
 * decoded copies and are safe to keep.
 */
export function createCarParser({ wantTypes, keep = null, onRecord, onProgress }) {
  let buf = EMPTY;              // an incomplete block's bytes, and nothing else
  let headerDone = false;
  let broken = false;
  let bytes = 0;                // total pushed
  let blocks = 0;
  let failed = 0;
  let records = 0;

  function push(chunk) {
    bytes += chunk.length;
    if (broken) return;
    // No copy in the common case: a chunk that begins on a block boundary is
    // parsed where it lies.
    const work = buf.length ? concat(buf, chunk) : chunk;
    const n = work.length;
    const dv = new DataView(work.buffer, work.byteOffset, work.byteLength);
    let p = 0;

    for (;;) {
      if (!headerDone) {
        const h = tryVarint(work, p, n);
        if (!h) break;
        if (h[0] > MAX_BLOCK) { broken = true; break; }
        if (h[1] + h[0] > n) break;
        p = h[1] + h[0];
        headerDone = true;
        continue;
      }
      const v = tryVarint(work, p, n);
      if (!v) break;
      const [bLen, q] = v;
      if (bLen > MAX_BLOCK) { broken = true; break; }
      if (q + bLen > n) break;                      // block not all here yet
      const blockEnd = q + bLen;

      // CID: v1 is 0x01 <codec varint> <mh code varint> <mh len varint> <digest>
      let c = q;
      if (work[c] === 0x12 && work[c + 1] === 0x20) c += 34;      // CIDv0
      else {
        let x;
        [x, c] = readVarint(work, c);                             // version
        [x, c] = readVarint(work, c);                             // codec
        [x, c] = readVarint(work, c);                             // multihash code
        let mhLen;
        [mhLen, c] = readVarint(work, c);
        c += mhLen;
      }

      blocks++;
      try {
        const rec = c < blockEnd ? decodeRecord(work, dv, c, wantTypes, keep) : null;
        if (rec) { records++; onRecord(rec); }
      } catch { failed++; }
      if (onProgress && (blocks & 8191) === 0) onProgress(bytes, blocks);
      p = blockEnd;
    }

    // Keep only the tail — at most one block, which is kilobytes.
    buf = p < n ? work.slice(p) : EMPTY;
  }

  function end() {
    if (onProgress) onProgress(bytes, blocks);
    const leftover = buf.length;
    buf = EMPTY;
    return { blocks, failed, records, bytes, leftover, broken };
  }

  return { push, end, get blocks() { return blocks; }, get bytes() { return bytes; } };
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Whole-buffer convenience over the same parser. Returns every matching record,
 * so it is the memory-hungry shape by definition — use it for fixtures and
 * tests, not for a stranger's repo. `onProgress(fraction, blocks)` is handed
 * the running block count rather than leaving the caller to reach for the
 * return value, which is still in its temporal dead zone while this runs.
 */
export function readCarBytes(u8, wantTypes, onProgress, keep = null) {
  const out = [];
  const total = u8.length || 1;
  const parser = createCarParser({
    wantTypes,
    keep,
    onRecord: (r) => out.push(r),
    onProgress: onProgress ? (bytes, blocks) => onProgress(bytes / total, blocks) : undefined,
  });
  parser.push(u8);
  const { blocks, failed } = parser.end();
  return { records: out, blocks, failed };
}

/**
 * Node: stream a CAR off disk through a parser without ever holding the file.
 * Kept out of the browser path on purpose — importing node:fs at module scope
 * would break the worker.
 */
export async function streamCarFile(path, parser, chunkSize = 1 << 20) {
  const { open } = await import('node:fs/promises');
  const fh = await open(path, 'r');
  try {
    for (;;) {
      // A FRESH buffer each read, deliberately. Reusing one works today and
      // would be free, but byte-string fields alias the chunk, so the day
      // something downstream retains a CID the node build would corrupt
      // quietly while the browser — which gets fresh chunks from fetch — stayed
      // correct. A divergence between the two callers is the one bug this
      // surface is organised to prevent.
      const buf = Buffer.allocUnsafe(chunkSize);
      const { bytesRead } = await fh.read(buf, 0, chunkSize, null);
      if (!bytesRead) break;
      parser.push(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead));
    }
  } finally {
    await fh.close();
  }
  return parser.end();
}

/** Node convenience wrapper that does hold everything. Fixtures only. */
export async function readCar(path, wantTypes, onProgress) {
  const { readFileSync } = await import('node:fs');
  const buf = readFileSync(path);
  return readCarBytes(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), wantTypes, onProgress);
}
