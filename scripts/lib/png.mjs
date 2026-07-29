// png.mjs — just enough PNG to answer "did anything render?"
//
// WHY DECODE AT ALL. The smoke test proves a page throws no errors. It does not
// prove the page shows anything, and those are different failures: a build that
// renders a blank rectangle passes every gate we have, publishes, and the
// requester is the one who finds out. Twice now the fix took several extra
// turns because "nothing renders now" had to travel back through Bluesky.
//
// WHY NOT JUST LOOK AT THE FILE SIZE. A flat-colour PNG compresses to a few
// kilobytes and a busy one does not, so size correlates — but it also correlates
// with a dark page, a photo background, and a canvas full of noise. It would
// have to be tuned per site, which is another way of saying it would be wrong.
// Pixels are the actual question, so read the pixels.
//
// SCOPE: 8-bit non-interlaced RGB/RGBA/grey, which is what headless Chromium
// writes. Anything else throws rather than guessing — an "image decoder" that
// silently mis-reads a format would report a blank page for a fine one, and a
// false alarm here costs somebody a build.

import { inflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** colour type → samples per pixel */
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** @returns {{width:number,height:number,channels:number,data:Buffer}} */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) {
    throw new Error('not a PNG');
  }
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  const idat = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; colour = body[9]; interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len; // length + type + data + crc
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');
  const channels = CHANNELS[colour];
  if (!channels) throw new Error(`unsupported colour type ${colour}`);
  if (!width || !height) throw new Error('no IHDR');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Each scanline is prefixed with a filter byte, and every filter is defined
  // against the ALREADY-RECONSTRUCTED bytes above and to the left. Skipping this
  // and reading `raw` directly is the classic mistake: the numbers look like
  // pixels and are noise, so a flat page would score as busy.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;      // left
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;                    // up
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0; // up-left
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown filter ${filter} on row ${y}`);
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** How much of the image is its single most common colour, and how many
 *  distinct colours it has. Sampled on a grid rather than every pixel: a
 *  1200x800 screenshot is a million pixels and the answer does not change.
 *
 *  Colours are quantised to 4 bits per channel. Without it, an anti-aliased
 *  gradient background scores as thousands of "distinct colours" and a genuinely
 *  empty page looks busy. */
export function inkStats(img, { step = 4, bits = 4 } = {}) {
  const shift = 8 - bits;
  const counts = new Map();
  let n = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = y * img.width * img.channels + x * img.channels;
      const key = img.channels >= 3
        ? ((img.data[i] >> shift) << (bits * 2)) | ((img.data[i + 1] >> shift) << bits) | (img.data[i + 2] >> shift)
        : (img.data[i] >> shift);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      n++;
    }
  }
  let top = 0;
  for (const v of counts.values()) if (v > top) top = v;
  return { sampled: n, distinct: counts.size, topShare: n ? top / n : 1 };
}

/** THE THRESHOLD, MEASURED RATHER THAN CHOSEN.
 *
 *  Screenshotted the published estate at 1200x800 and a deliberately empty page
 *  for contrast:
 *
 *    empty <body style="background:#0e0e11">   distinct   1   topShare 1.0000
 *    tube-stacker (sparsest real page)         distinct  67   topShare 0.9511
 *    typical real page                         distinct 117-333  topShare 0.25-0.94
 *
 *  So the two populations are nowhere near each other, and the threshold sits in
 *  the gap with room on both sides. It is deliberately biased toward silence: a
 *  false alarm costs somebody a working build and teaches the next agent to
 *  distrust the report, which is worse than missing one blank page. */
export function looksBlank(stats) {
  return stats.topShare >= 0.99 && stats.distinct < 8;
}
