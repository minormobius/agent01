/**
 * Minimal CARv1 + DAG-CBOR reader, enough to walk an ATProto repository
 * export offline.
 *
 * `com.atproto.sync.getRepo` hands back the principal's entire repository —
 * every collection, every record — as one CAR file in a single request. That
 * is strictly better than paging listRecords: one round trip instead of
 * hundreds, no rate limit to nurse, and the result is a local file you can
 * re-parse as often as you like without touching anyone's server again.
 *
 * The price is that you have to decode it yourself, which is what this is.
 * No dependencies, per repo convention.
 *
 * Layout, for anyone maintaining this:
 *
 *   CARv1  = varint(headerLen) header  then  repeated: varint(len) CID bytes
 *   header = dag-cbor { version: 1, roots: [CID] }
 *   root   = a signed commit { did, rev, data: CID(→ MST root), sig, … }
 *   MST    = prefix-compressed B-tree; keys are "collection/rkey" strings,
 *            values are CIDs pointing at the record blocks
 *
 * So: parse blocks → find the commit → walk the MST → decode records.
 */

// ─── varint ──────────────────────────────────────────────────────

/** Read an unsigned LEB128 varint. Returns [value, nextOffset]. */
export function readVarint(buf, pos) {
  let value = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error('varint runs past end of buffer');
    const byte = buf[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, pos];
    shift += 7;
    if (shift > 63) throw new Error('varint too long');
  }
}

// ─── CID ─────────────────────────────────────────────────────────

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC-4648 base32, lowercase, unpadded — the 'b' multibase. */
function base32(bytes) {
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

/**
 * Read a CID at `pos`. Handles CIDv0 (raw sha2-256 multihash) and CIDv1.
 * Returns [{ str, bytes }, nextOffset].
 */
export function readCid(buf, pos) {
  const start = pos;

  // CIDv0: a bare sha2-256 multihash, 0x12 0x20 followed by 32 bytes.
  if (buf[pos] === 0x12 && buf[pos + 1] === 0x20) {
    const bytes = buf.subarray(start, start + 34);
    return [{ str: `z${base32(bytes)}`, bytes }, start + 34];
  }

  let version, codec, hashCode, hashSize;
  [version, pos] = readVarint(buf, pos);
  if (version !== 1) throw new Error(`unsupported CID version ${version}`);
  [codec, pos] = readVarint(buf, pos);
  [hashCode, pos] = readVarint(buf, pos);
  [hashSize, pos] = readVarint(buf, pos);
  pos += hashSize;

  void codec;
  void hashCode;
  const bytes = buf.subarray(start, pos);
  return [{ str: `b${base32(bytes)}`, bytes }, pos];
}

// ─── DAG-CBOR ────────────────────────────────────────────────────

const textDecoder = new TextDecoder();

/** A CID reference inside a record, rendered the way dag-json does it. */
class CidLink {
  constructor(str) {
    this.$link = str;
  }
  toJSON() {
    return { $link: this.$link };
  }
}

/**
 * Read a CBOR head: returns [majorType, argument, nextOffset, additionalInfo].
 *
 * The raw `info` is returned alongside the decoded argument because major
 * type 7 needs it: there, info 27 means a float64, not the 64-bit integer
 * the same encoding denotes under every other major type.
 */
function readHead(buf, pos) {
  const byte = buf[pos++];
  const major = byte >> 5;
  const info = byte & 0x1f;

  if (info < 24) return [major, info, pos, info];
  if (info === 24) return [major, buf[pos], pos + 1, info];
  if (info === 25) return [major, (buf[pos] << 8) | buf[pos + 1], pos + 2, info];
  if (info === 26) {
    const v = buf[pos] * 2 ** 24 + (buf[pos + 1] << 16) + (buf[pos + 2] << 8) + buf[pos + 3];
    return [major, v, pos + 4, info];
  }
  if (info === 27) {
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(buf[pos + i]);
    return [major, v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v, pos + 8, info];
  }
  throw new Error(`bad CBOR additional info ${info}`);
}

/**
 * Decode one DAG-CBOR value. Returns [value, nextOffset].
 *
 * DAG-CBOR is a strict subset: no indefinite lengths, no bignums, and the
 * only tag is 42 (a CID). Anything else here is a malformed block, so it
 * throws rather than guessing.
 */
export function decodeCbor(buf, pos = 0) {
  const [major, arg, next, info] = readHead(buf, pos);
  pos = next;

  switch (major) {
    case 0:
      return [arg, pos];
    case 1:
      return [typeof arg === 'bigint' ? -1n - arg : -1 - arg, pos];
    case 2:
      return [buf.subarray(pos, pos + arg), pos + arg];
    case 3:
      return [textDecoder.decode(buf.subarray(pos, pos + arg)), pos + arg];
    case 4: {
      const arr = new Array(arg);
      for (let i = 0; i < arg; i++) [arr[i], pos] = decodeCbor(buf, pos);
      return [arr, pos];
    }
    case 5: {
      const obj = {};
      for (let i = 0; i < arg; i++) {
        let key, value;
        [key, pos] = decodeCbor(buf, pos);
        [value, pos] = decodeCbor(buf, pos);
        obj[key] = value;
      }
      return [obj, pos];
    }
    case 6: {
      if (arg !== 42) throw new Error(`unexpected CBOR tag ${arg}`);
      let inner;
      [inner, pos] = decodeCbor(buf, pos);
      // Tag 42 wraps a byte string carrying an identity multibase prefix
      // (a leading 0x00) ahead of the CID itself.
      const [cid] = readCid(inner.subarray(1), 0);
      return [new CidLink(cid.str), pos];
    }
    case 7:
      // info 27 is a float64 here; the eight bytes readHead just consumed
      // are its IEEE-754 encoding, not an integer argument.
      if (info === 27) {
        const view = new DataView(buf.buffer, buf.byteOffset + pos - 8, 8);
        return [view.getFloat64(0), pos];
      }
      if (info === 20) return [false, pos];
      if (info === 21) return [true, pos];
      if (info === 22) return [null, pos];
      throw new Error(`unsupported CBOR simple value ${info}`);
    default:
      throw new Error(`unreachable CBOR major type ${major}`);
  }
}

// ─── CAR ─────────────────────────────────────────────────────────

/**
 * Parse a CARv1 into its roots and a CID→bytes block index.
 *
 * Blocks are stored as subarray views, so this does not copy the 87MB; only
 * the blocks you actually decode cost anything.
 */
export function parseCar(buf) {
  let pos = 0;
  let headerLen;
  [headerLen, pos] = readVarint(buf, pos);

  const [header] = decodeCbor(buf.subarray(pos, pos + headerLen), 0);
  pos += headerLen;

  const roots = (header.roots ?? []).map((r) => r.$link);
  const blocks = new Map();

  while (pos < buf.length) {
    let len;
    [len, pos] = readVarint(buf, pos);
    const end = pos + len;
    let cid;
    [cid, pos] = readCid(buf, pos);
    blocks.set(cid.str, buf.subarray(pos, end));
    pos = end;
  }

  return { roots, blocks };
}

// ─── MST ─────────────────────────────────────────────────────────

/**
 * Walk the Merkle Search Tree in key order, yielding [path, valueCid].
 *
 * Keys are prefix-compressed against the previous key: each entry carries
 * `p`, how many bytes to keep from the key before it, and `k`, the bytes to
 * append. Entries interleave with right-hand subtrees (`t`); the whole
 * left subtree (`l`) precedes them.
 */
export function* walkMst(blocks, cidStr, prefix = '') {
  const raw = blocks.get(cidStr);
  if (!raw) return; // A partial export can reference blocks it does not carry.
  const [node] = decodeCbor(raw, 0);

  if (node.l) yield* walkMst(blocks, node.l.$link, prefix);

  let key = prefix;
  for (const entry of node.e ?? []) {
    key = key.slice(0, entry.p) + textDecoder.decode(entry.k);
    yield [key, entry.v.$link];
    if (entry.t) yield* walkMst(blocks, entry.t.$link, key);
  }
}

/**
 * Read a CAR buffer into records grouped by collection.
 * Returns { did, rev, collections: Map<collection, [{ rkey, value }]> }.
 */
export function readRepo(buf) {
  const { roots, blocks } = parseCar(buf);
  if (!roots.length) throw new Error('CAR has no root');

  const commitRaw = blocks.get(roots[0]);
  if (!commitRaw) throw new Error('CAR root block is missing');
  const [commit] = decodeCbor(commitRaw, 0);

  const collections = new Map();
  let total = 0;

  for (const [path, cidStr] of walkMst(blocks, commit.data.$link)) {
    const slash = path.indexOf('/');
    if (slash < 0) continue;
    const collection = path.slice(0, slash);
    const rkey = path.slice(slash + 1);

    const raw = blocks.get(cidStr);
    if (!raw) continue;
    const [value] = decodeCbor(raw, 0);

    if (!collections.has(collection)) collections.set(collection, []);
    collections.get(collection).push({ rkey, value });
    total++;
  }

  return { did: commit.did, rev: commit.rev, blocks: blocks.size, total, collections };
}
