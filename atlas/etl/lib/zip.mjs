// zip.mjs — a minimal ZIP reader over a Buffer. No dependencies.
//
// WHY: every primary boundary source in this pipeline (Census TIGER/cartographic,
// Statistics Canada, INEGI Marco Geoestadístico) ships as a zipped shapefile,
// and node has no zip reader in core. It has `zlib.inflateRaw`, which is the
// only hard part of DEFLATE-compressed ZIP, so the rest is header parsing.
//
// Supports: stored (method 0) and deflate (method 8), ZIP64 end-of-central-
// directory locator (the INEGI archives are large enough to matter one day).
// Does NOT support: encryption, multi-disk, or data descriptors without a
// central directory — none of which appear in government open data.

import { inflateRawSync } from 'node:zlib';

const EOCD_SIG   = 0x06054b50;
const EOCD64_SIG = 0x06064b50;
const LOC64_SIG  = 0x07064b50;
const CEN_SIG    = 0x02014b50;

/** Locate the end-of-central-directory record by scanning backwards. */
function findEOCD(buf) {
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('zip: end-of-central-directory not found');
}

/**
 * Read a ZIP archive's central directory.
 * @returns {Array<{name:string, method:number, compressedSize:number, size:number, offset:number}>}
 */
export function listZip(buf) {
  const eocd = findEOCD(buf);
  let count  = buf.readUInt16LE(eocd + 10);
  let cenOff = buf.readUInt32LE(eocd + 16);

  // ZIP64: the 32-bit fields saturate; the real values live in the ZIP64 EOCD.
  if (cenOff === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === LOC64_SIG) {
      const z64 = Number(buf.readBigUInt64LE(loc + 8));
      if (buf.readUInt32LE(z64) === EOCD64_SIG) {
        count  = Number(buf.readBigUInt64LE(z64 + 32));
        cenOff = Number(buf.readBigUInt64LE(z64 + 48));
      }
    }
  }

  const entries = [];
  let p = cenOff;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const method   = buf.readUInt16LE(p + 10);
    const csize    = buf.readUInt32LE(p + 20);
    const size     = buf.readUInt32LE(p + 24);
    const nameLen  = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen   = buf.readUInt16LE(p + 32);
    let   offset   = buf.readUInt32LE(p + 42);
    const name     = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // ZIP64 extended information extra field (0x0001) overrides saturated fields.
    if (size === 0xffffffff || csize === 0xffffffff || offset === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = buf.readUInt16LE(e), len = buf.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (size   === 0xffffffff) q += 8;
          if (csize  === 0xffffffff) q += 8;
          if (offset === 0xffffffff) offset = Number(buf.readBigUInt64LE(q));
          break;
        }
        e += 4 + len;
      }
    }
    entries.push({ name, method, compressedSize: csize, size, offset });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return entries;
}

/** Extract one entry's bytes. */
export function readEntry(buf, entry) {
  // The local file header repeats name/extra with possibly DIFFERENT extra
  // lengths than the central directory, so the data offset must be read here.
  const nameLen  = buf.readUInt16LE(entry.offset + 26);
  const extraLen = buf.readUInt16LE(entry.offset + 28);
  const start    = entry.offset + 30 + nameLen + extraLen;
  const raw      = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`zip: unsupported compression method ${entry.method} for ${entry.name}`);
}

/** Extract every entry whose name matches `re`, as a { name: Buffer } map. */
export function extract(buf, re = /./) {
  const out = {};
  for (const e of listZip(buf)) {
    if (e.name.endsWith('/')) continue;
    if (re.test(e.name)) out[e.name] = readEntry(buf, e);
  }
  return out;
}
