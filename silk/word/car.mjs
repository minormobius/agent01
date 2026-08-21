// Minimal CAR v1 + DAG-CBOR reader. No dependencies, and no Node built-ins in
// the hot path — this same code runs in a Web Worker on whatever repo a visitor
// types in, so everything below is DataView over a Uint8Array.
//
// We do not walk the MST. Every record block is present in the CAR as its own
// block, so decoding every block and keeping the ones whose $type we want is
// both simpler and faster than traversing.

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

const td = new TextDecoder();

function decode(u8, dv, p) {
  const ib = u8[p++];
  const major = ib >> 5;
  const minor = ib & 0x1f;

  let len = minor;
  if (minor === 24) { len = u8[p]; p += 1; }
  else if (minor === 25) { len = dv.getUint16(p); p += 2; }
  else if (minor === 26) { len = dv.getUint32(p); p += 4; }
  else if (minor === 27) { len = Number(dv.getBigUint64(p)); p += 8; }

  switch (major) {
    case 0: return [len, p];
    case 1: return [-1 - len, p];
    case 2: return [u8.subarray(p, p + len), p + len];
    case 3: return [td.decode(u8.subarray(p, p + len)), p + len];
    case 4: {
      const a = new Array(len);
      for (let i = 0; i < len; i++) { const [v, q] = decode(u8, dv, p); a[i] = v; p = q; }
      return [a, p];
    }
    case 5: {
      const o = {};
      for (let i = 0; i < len; i++) {
        const [k, q] = decode(u8, dv, p); p = q;
        const [v, r] = decode(u8, dv, p); p = r;
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

// The one real entry point. `onProgress(fraction, blocks)` is called every few
// thousand blocks so a 91 MB repo can show a bar instead of freezing. It is
// handed the running block count rather than leaving the caller to reach for
// the return value — which is still in its temporal dead zone while this runs.
export function readCarBytes(u8, wantTypes, onProgress) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  let q;
  let hLen;
  [hLen, q] = readVarint(u8, p);
  p = q + hLen;                                   // skip the header

  const out = [];
  let blocks = 0;
  let failed = 0;
  while (p < u8.length) {
    let bLen;
    [bLen, q] = readVarint(u8, p);
    p = q;
    const end = p + bLen;
    if (end > u8.length) break;

    // CID: v1 is 0x01 <codec varint> <mh code varint> <mh len varint> <digest>
    let c = p;
    if (u8[c] === 0x12 && u8[c + 1] === 0x20) c += 34;          // CIDv0
    else {
      let v;
      [v, c] = readVarint(u8, c);                               // version
      [v, c] = readVarint(u8, c);                               // codec
      [v, c] = readVarint(u8, c);                               // multihash code
      let mhLen;
      [mhLen, c] = readVarint(u8, c);
      c += mhLen;
    }

    blocks++;
    try {
      const [val] = decode(u8, dv, c);
      if (val && typeof val === 'object' && !Array.isArray(val)
          && wantTypes.has(val['$type'])) out.push(val);
    } catch { failed++; }
    if (onProgress && (blocks & 8191) === 0) onProgress(p / u8.length, blocks);
    p = end;
  }
  if (onProgress) onProgress(1, blocks);
  return { records: out, blocks, failed };
}

// Node convenience wrapper. Kept out of the browser path on purpose: importing
// node:fs at module scope would break the worker.
export async function readCar(path, wantTypes, onProgress) {
  const { readFileSync } = await import('node:fs');
  const buf = readFileSync(path);
  return readCarBytes(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), wantTypes, onProgress);
}
