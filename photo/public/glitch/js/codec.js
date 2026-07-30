// codec.js — the one operator that is not pure maths: real JPEG bytes, really
// corrupted, decoded by the browser's own JPEG decoder.
//
// WHY THIS IS DIFFERENT FROM EVERYTHING IN glitch.js
// -------------------------------------------------
// The rest of the tool computes its artefacts. This one *causes* them: encode
// the picture as a JPEG, damage bytes inside the entropy-coded scan, and hand
// the wreckage back to the decoder. What comes out is the genuine article —
// the smear you get because JPEG codes DC coefficients differentially across
// blocks and packs Huffman symbols with no byte alignment, so one bad bit
// desynchronises the reader and every block after it inherits the error.
//
// Three honest consequences, all surfaced in the UI rather than hidden:
//
//   * It can fail. Some corruptions kill the decode outright. We retry with
//     different positions (seeded, so the retry is deterministic too) and
//     report if the decoder refused.
//   * Position is approximate. Byte offset in the scan maps only loosely to
//     position in the picture, because compressed data isn't uniform. So the
//     mask *aims* the damage, and — because the stack blends every operator
//     through its mask — it also decides where the damage is allowed to show.
//   * Browsers differ. Canvas JPEG encoders are not identical across engines,
//     so this operator is reproducible within a browser but not guaranteed
//     byte-identical between them. Everything in glitch.js is.

import { registerOp, hash32, rand } from './glitch.js';

const makeCanvas = (W, H) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c;
};

const toBlob = (canvas, type, quality) =>
  (canvas.convertToBlob
    ? canvas.convertToBlob({ type, quality })
    : new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, quality)));

async function encodeJpeg(rgba, W, H, quality) {
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = new ImageData(new Uint8ClampedArray(rgba), W, H);
  ctx.putImageData(img, 0, 0);
  const blob = await toBlob(c, 'image/jpeg', Math.max(0.01, Math.min(1, quality / 100)));
  return new Uint8Array(await blob.arrayBuffer());
}

async function decodeToPixels(bytes, W, H) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, W, H);
  if (bitmap.close) bitmap.close();
  return ctx.getImageData(0, 0, W, H).data;
}

/**
 * Walk the JPEG segment structure to find the entropy-coded scan — the only
 * region it is ever safe to damage. Touch a header and you don't get a glitch,
 * you get a decoder that refuses to open the file at all.
 */
export function scanRange(buf) {
  let i = 2;                                  // past SOI
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda) {                    // start of scan
      const len = (buf[i + 2] << 8) | buf[i + 3];
      const start = i + 2 + len;
      let end = buf.length;
      if (buf[end - 2] === 0xff && buf[end - 1] === 0xd9) end -= 2;   // keep EOI intact
      return { start, end };
    }
    if (marker === 0xff) { i++; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (!len) break;
    i += 2 + len;
  }
  return null;
}

/** Row weights from the mask, so the damage is aimed where the user pointed. */
function rowCdf(mask, W, H) {
  const rows = new Float64Array(H);
  let total = 0;
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) s += mask[y * W + x];
    rows[y] = s; total += s;
  }
  if (total <= 0) { rows.fill(1); total = H; }
  let acc = 0;
  for (let y = 0; y < H; y++) { acc += rows[y] / total; rows[y] = acc; }
  return rows;
}

const pickRow = (cdf, u) => {
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
  return lo;
};

/**
 * Damage `hits` bytes of the scan. Never touches 0xFF (a marker prefix) or the
 * byte after one (stuffing), because those aren't glitches, they're crashes.
 */
export function corrupt(buf, range, count, mode, seed, cdf, H, drift) {
  const bytes = buf.slice();
  const span = range.end - range.start;
  if (span <= 16) return { bytes, hits: 0 };
  let hits = 0;
  for (let k = 0; k < count; k++) {
    const row = pickRow(cdf, rand(seed, k, 0x31));
    const frac = (row + 0.5) / H + (rand(seed, k, 0x77) - 0.5) * drift;
    let pos = range.start + Math.floor(Math.min(0.999, Math.max(0, frac)) * span);
    // step off markers and stuffed bytes
    let guard = 0;
    while (guard++ < 96 && pos > range.start && pos < range.end - 1
      && (bytes[pos] === 0xff || bytes[pos - 1] === 0xff)) pos++;
    if (pos <= range.start || pos >= range.end - 1) continue;
    if (bytes[pos] === 0xff || bytes[pos - 1] === 0xff) continue;

    const h = hash32(seed, k, 0xa5);
    let v = bytes[pos];
    if (mode === 'bit flip') v ^= 1 << (h % 8);
    else if (mode === 'byte swap') v = h & 0xfe;
    else if (mode === 'zero') v = 0;
    else v = (v + 1 + (h % 200)) % 255;        // 'drift'
    if (v === 0xff) v = 0xfe;                  // never invent a marker
    bytes[pos] = v;
    hits++;
  }
  return { bytes, hits };
}

registerOp('jpeg', {
  label: 'jpeg databend',
  note: 'Encodes a real JPEG, corrupts bytes inside the scan, and lets the browser decode the wreckage. The genuine article: one bad bit desynchronises the entropy decoder and the error rides downstream. It can fail — retries are seeded, so failures are reproducible too.',
  async: true,
  params: {
    quality: { min: 1, max: 100, step: 1, def: 42, label: 'quality' },
    hits: { min: 1, max: 400, step: 1, def: 12, label: 'bytes hit' },
    mode: { type: 'enum', options: ['bit flip', 'byte swap', 'drift', 'zero'], def: 'bit flip', label: 'damage' },
    drift: { min: 0, max: 1, step: 0.01, def: 0.15, label: 'scatter' },
  },

  /**
   * @returns {{rgba: Uint8ClampedArray|null, note: string}} — `null` pixels
   * means the decoder refused every attempt, and the layer is a no-op.
   */
  async run(rgba, W, H, P, ctx) {
    let source;
    try {
      source = await encodeJpeg(rgba, W, H, P.quality);
    } catch (e) {
      return { rgba: null, note: `no jpeg encoder here (${e.message || e})` };
    }
    const range = scanRange(source);
    if (!range) return { rgba: null, note: 'could not find the scan — encoder wrote something unusual' };

    const cdf = rowCdf(ctx.mask, W, H);
    for (let attempt = 0; attempt < 4; attempt++) {
      // each retry is a fresh seed, so a failure is reproducible rather than lucky
      const seed = hash32(ctx.seed, attempt, 0xbe11);
      const count = Math.max(1, Math.round(P.hits / (attempt + 1)));
      const { bytes, hits } = corrupt(source, range, count, P.mode, seed, cdf, H, P.drift);
      if (!hits) continue;
      try {
        const out = await decodeToPixels(bytes, W, H);
        return {
          rgba: out,
          note: `${hits} byte${hits === 1 ? '' : 's'} hit${attempt ? ` · ${attempt} retr${attempt === 1 ? 'y' : 'ies'}` : ''}`,
        };
      } catch { /* decoder refused — fewer hits, different places */ }
    }
    return { rgba: null, note: 'the decoder refused every attempt — try fewer bytes or higher quality' };
  },
});

export { encodeJpeg, decodeToPixels };
