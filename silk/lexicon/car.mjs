// Minimal CAR v1 + DAG-CBOR reader. No dependencies.
//
// We do not walk the MST. Every record block is present in the CAR as its own
// block, so decoding every block and keeping the ones whose $type we want is
// both simpler and faster than traversing.

import { readFileSync } from 'node:fs';

function readVarint(buf, p) {
  let x = 0, s = 0;
  for (;;) {
    const b = buf[p++];
    x |= (b & 0x7f) * 2 ** s;
    if ((b & 0x80) === 0) return [x, p];
    s += 7;
  }
}

// ── DAG-CBOR ────────────────────────────────────────────────────────────────
const td = new TextDecoder();

function decode(buf, p) {
  const ib = buf[p++];
  const major = ib >> 5;
  const minor = ib & 0x1f;

  let len = minor;
  if (minor === 24) { len = buf[p]; p += 1; }
  else if (minor === 25) { len = buf.readUInt16BE(p); p += 2; }
  else if (minor === 26) { len = buf.readUInt32BE(p); p += 4; }
  else if (minor === 27) { len = Number(buf.readBigUInt64BE(p)); p += 8; }

  switch (major) {
    case 0: return [len, p];
    case 1: return [-1 - len, p];
    case 2: return [buf.subarray(p, p + len), p + len];
    case 3: return [td.decode(buf.subarray(p, p + len)), p + len];
    case 4: {
      const a = new Array(len);
      for (let i = 0; i < len; i++) { const [v, q] = decode(buf, p); a[i] = v; p = q; }
      return [a, p];
    }
    case 5: {
      const o = {};
      for (let i = 0; i < len; i++) {
        const [k, q] = decode(buf, p); p = q;
        const [v, r] = decode(buf, p); p = r;
        o[k] = v;
      }
      return [o, p];
    }
    case 6: { const [v, q] = decode(buf, p); return [v, q]; }   // tag 42 = CID; we don't need it
    case 7:
      if (minor === 20) return [false, p];
      if (minor === 21) return [true, p];
      if (minor === 22) return [null, p];
      if (minor === 26) { const v = buf.readFloatBE(p); return [v, p + 4]; }
      if (minor === 27) { const v = buf.readDoubleBE(p); return [v, p + 8]; }
      return [null, p];
    default: return [null, p];
  }
}

export function readCar(path, wantTypes) {
  const buf = readFileSync(path);
  let p = 0;
  let [hLen, q] = readVarint(buf, p);
  p = q + hLen;                                   // skip the header

  const out = [];
  let blocks = 0, failed = 0;
  while (p < buf.length) {
    let bLen;
    [bLen, q] = readVarint(buf, p);
    p = q;
    const end = p + bLen;
    if (end > buf.length) break;

    // CID: v1 is 0x01 <codec varint> <mh code varint> <mh len varint> <digest>
    let c = p;
    if (buf[c] === 0x12 && buf[c + 1] === 0x20) c += 34;        // CIDv0
    else {
      let v;
      [v, c] = readVarint(buf, c);                              // version
      [v, c] = readVarint(buf, c);                              // codec
      [v, c] = readVarint(buf, c);                              // multihash code
      let mhLen;
      [mhLen, c] = readVarint(buf, c);
      c += mhLen;
    }

    blocks++;
    try {
      const [val] = decode(buf, c);
      if (val && typeof val === 'object' && !Array.isArray(val)
          && wantTypes.has(val['$type'])) out.push(val);
    } catch { failed++; }
    p = end;
  }
  return { records: out, blocks, failed };
}
