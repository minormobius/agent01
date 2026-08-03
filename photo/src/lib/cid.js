// cid.js — blob references, normalised.
//
// A blob ref in an ATProto record is usually already a CID string
// (`bafkrei…`), but older records and some PDS implementations hand back the
// bare SHA-256 hex of the blob instead. Both have to end up as a CIDv1 the
// PDS and the CDN will accept.
//
// Lifted out of App.jsx unchanged, because it was correct and untested — the
// two facts that make code dangerous to touch. `photo.selftest.mjs` now decodes
// a real CID back to its hash and re-encodes it, so the next person can.

// base32, RFC 4648, lowercase, unpadded — the `b` multibase prefix.
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 0x1f];
  return out;
}

export function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error(`not base32: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/**
 * Raw SHA-256 hex → CIDv1. The four leading bytes are the whole story:
 * `01` CIDv1, `55` raw codec, `12` sha2-256, `20` 32 bytes of digest.
 */
export function hexToCidV1Raw(hex) {
  const hashBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    hashBytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  const cidBytes = new Uint8Array(4 + hashBytes.length);
  cidBytes[0] = 0x01;
  cidBytes[1] = 0x55;
  cidBytes[2] = 0x12;
  cidBytes[3] = 0x20;
  cidBytes.set(hashBytes, 4);
  return 'b' + base32Encode(cidBytes);
}

/**
 * Whatever the record gave us → something a `getBlob` call will accept.
 *
 * **Test the hex form first.** The original ordering asked "does it start with
 * `b` or `Q` and run past 40 characters?" before checking for hex — and a
 * sha-256 digest beginning with the nibble `b` satisfies that, so roughly one
 * blob in sixteen was declared to be already-a-CID and passed through
 * unconverted, producing a URL the PDS rejects. The two forms are unambiguous
 * in the other order: a bare digest is exactly 64 hex characters, while a raw
 * CIDv1 is 59 characters and contains letters outside `[0-9a-f]` in practice.
 */
export function ensureCid(raw) {
  if (!raw) return '';
  if (/^[0-9a-f]{64}$/i.test(raw)) return hexToCidV1Raw(raw);
  if (/^[bQ]/.test(raw) && raw.length > 40) return raw; // already CIDv1 or CIDv0
  return raw;
}

/**
 * The `$link` dance — the key shows up in three shapes across PDS versions.
 *
 * **The string case is checked first**, and it has to be: `'abc'.link` is
 * `String.prototype.link`, a legacy HTML-wrapper method that exists on every
 * string. Reaching for `ref.link` before ruling out a string ref therefore
 * returns a *function*, which then gets stringified into an image URL.
 */
export function cidFromRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  return ref.$link ?? ref['$link'] ?? ref.link ?? null;
}
