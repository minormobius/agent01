/**
 * An animated-GIF encoder, in about 300 lines and with no dependencies.
 *
 * It exists because a dweet is a *moving* thing and every other way of taking
 * one out of this page loses the motion. What it is NOT is a way to put the
 * motion into a Bluesky post — see the note at the foot of this file, and
 * `dweet/CLAUDE.md`. It is the portable artifact: a GIF plays in a chat, a
 * wiki, a blog, a Mastodon post and a README, none of which need this site.
 *
 * Pure: no DOM, no canvas, no globals. Frames go in as raw RGBA byte arrays
 * and a `Uint8Array` of GIF87a/89a comes out. That is what makes
 * `gif.selftest.mjs` able to encode a known image, decode it back with an
 * independently written decoder, and compare — which is the only honest test
 * for a format whose failure mode is a file that looks fine in a hex dump and
 * renders as garbage.
 *
 * Three parts, in the order they run:
 *
 *   1. PALETTE   median-cut over a 5:5:5 histogram of every frame, so one
 *                global table serves the whole animation. A per-frame local
 *                table would track colour better and cost 768 bytes a frame
 *                plus a palette rebuild; at these sizes that is the wrong
 *                trade.
 *   2. QUANTISE  nearest palette entry per pixel, through a 32768-entry cache
 *                so the O(256) search runs once per distinct 5-bit colour
 *                instead of once per pixel. With Bayer 4x4 ordered dithering,
 *                which is what keeps a shader's gradient from banding into
 *                stripes.
 *   3. LZW       GIF's variable-width LZW, 100-byte sub-blocks.
 */

/** GIF delays are centiseconds. Below 2 most renderers clamp to 10 — a real
 *  historical quirk, not a spec rule, and the reason 50fps GIFs play slowly. */
const MIN_DELAY_CS = 2;

/** 4x4 Bayer threshold matrix, normalised to [-0.5, 0.5). */
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map((v) => v / 16 - 0.5);

/**
 * Encode a sequence of RGBA frames as one animated GIF.
 *
 * @param {object} o
 * @param {number} o.width
 * @param {number} o.height
 * @param {ArrayLike<number>[]} o.frames  RGBA, width*height*4 each
 * @param {number} [o.delayMs=80]         per frame
 * @param {number} [o.colors=256]         palette size, 2..256
 * @param {boolean} [o.dither=true]
 * @param {number} [o.loop=0]             0 = forever
 * @returns {Uint8Array}
 */
export function encodeGif({
  width, height, frames, delayMs = 80, colors = 256, dither = true, loop = 0,
}) {
  if (!frames || !frames.length) throw new Error('no frames');
  const n = width * height;
  for (const f of frames) {
    if (f.length !== n * 4) throw new Error(`frame is ${f.length} bytes, expected ${n * 4}`);
  }
  const want = Math.max(2, Math.min(256, colors | 0));
  const palette = buildPalette(frames, want);
  // The colour table length must be a power of two: 2, 4, 8 … 256.
  const tableSize = Math.max(2, 1 << Math.ceil(Math.log2(Math.max(2, palette.length / 3))));
  const minCodeSize = Math.max(2, Math.log2(tableSize));

  const out = new ByteSink();
  header(out, width, height, palette, tableSize, loop, frames.length);

  const cache = new Int16Array(32768).fill(-1);
  const delayCs = Math.max(MIN_DELAY_CS, Math.round(delayMs / 10));

  for (const rgba of frames) {
    const idx = quantise(rgba, width, height, palette, cache, dither);
    graphicControl(out, delayCs);
    imageDescriptor(out, width, height);
    lzw(out, idx, minCodeSize);
  }

  out.byte(0x3b);                       // trailer
  return out.done();
}

/** What `encodeGif` will produce, without producing it. */
export function gifFrameCount(seconds, fps) {
  return Math.max(1, Math.round(seconds * fps));
}

// ── 1. palette ────────────────────────────────────────────────────

/**
 * Median cut over a 5:5:5 histogram.
 *
 * Histogramming first is what makes this affordable: a 2-second capture is
 * millions of pixels but at most 32,768 distinct bins, and the cut only ever
 * has to sort bins. Each box keeps the SUM of the true 8-bit channels, so the
 * chosen colour is the real weighted centroid of the pixels in it rather than
 * the centre of a 5-bit bucket.
 */
export function buildPalette(frames, want) {
  const count = new Uint32Array(32768);
  const sumR = new Float64Array(32768);
  const sumG = new Float64Array(32768);
  const sumB = new Float64Array(32768);

  for (const f of frames) {
    for (let i = 0; i < f.length; i += 4) {
      const r = f[i], g = f[i + 1], b = f[i + 2];
      const bin = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      count[bin]++;
      sumR[bin] += r; sumG[bin] += g; sumB[bin] += b;
    }
  }

  const bins = [];
  for (let bin = 0; bin < 32768; bin++) if (count[bin]) bins.push(bin);
  if (!bins.length) return [0, 0, 0];

  let boxes = [{ bins, from: 0, to: bins.length }];
  while (boxes.length < want) {
    // Split the box with the widest channel spread. Splitting the box with the
    // most PIXELS instead is the other common choice and is worse here: one
    // flat background can hold 90% of the pixels and would eat the whole
    // palette while the moving part of the frame got two entries.
    let best = -1, bestSpread = 0, bestChan = 0;
    for (let i = 0; i < boxes.length; i++) {
      const s = spread(boxes[i]);
      if (s.width > bestSpread) { bestSpread = s.width; best = i; bestChan = s.chan; }
    }
    if (best < 0 || bestSpread === 0) break;       // every box is one colour
    const box = boxes[best];
    const sub = box.bins.slice(box.from, box.to);
    sub.sort((a, b) => chan(a, bestChan) - chan(b, bestChan));
    for (let i = 0; i < sub.length; i++) box.bins[box.from + i] = sub[i];

    // Cut at the weighted median, so both halves carry a similar number of
    // pixels. Cutting at the midpoint of the range gives near-empty boxes
    // whenever the distribution is lopsided, which it always is.
    let total = 0;
    for (let i = box.from; i < box.to; i++) total += count[box.bins[i]];
    let acc = 0, cut = box.from;
    for (let i = box.from; i < box.to - 1; i++) {
      acc += count[box.bins[i]];
      cut = i + 1;
      if (acc * 2 >= total) break;
    }
    boxes.splice(best, 1,
      { bins: box.bins, from: box.from, to: cut },
      { bins: box.bins, from: cut, to: box.to });
  }

  const palette = [];
  for (const box of boxes) {
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = box.from; i < box.to; i++) {
      const bin = box.bins[i];
      r += sumR[bin]; g += sumG[bin]; b += sumB[bin]; w += count[bin];
    }
    if (!w) continue;
    palette.push(clamp8(r / w), clamp8(g / w), clamp8(b / w));
  }
  return palette;

  function spread(box) {
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let i = box.from; i < box.to; i++) {
      const bin = box.bins[i];
      const c = [(bin >> 10) & 31, (bin >> 5) & 31, bin & 31];
      for (let k = 0; k < 3; k++) {
        if (c[k] < lo[k]) lo[k] = c[k];
        if (c[k] > hi[k]) hi[k] = c[k];
      }
    }
    let chanBest = 0, widthBest = -1;
    for (let k = 0; k < 3; k++) {
      // Green is weighted because the eye resolves it best; a palette that
      // spends its cuts on blue detail looks worse at the same entry count.
      const w = (hi[k] - lo[k]) * (k === 1 ? 1.4 : 1);
      if (w > widthBest) { widthBest = w; chanBest = k; }
    }
    return { width: widthBest, chan: chanBest };
  }
  function chan(bin, k) { return k === 0 ? (bin >> 10) & 31 : k === 1 ? (bin >> 5) & 31 : bin & 31; }
}

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

// ── 2. quantise ───────────────────────────────────────────────────

/**
 * RGBA -> palette indices.
 *
 * @param {ArrayLike<number>} rgba
 * @param {Int16Array} cache  32768 entries, -1 = unknown. Shared across frames
 *   on purpose: a palette is global, so a colour resolved in frame 1 is still
 *   resolved in frame 40, and the O(256) search runs a few thousand times for
 *   a whole animation instead of millions.
 */
export function quantise(rgba, width, height, palette, cache, dither) {
  const size = palette.length / 3;
  const out = new Uint8Array(width * height);
  // The dither amplitude is the average palette step, so a fine palette
  // dithers gently and a coarse one dithers hard. A fixed amplitude either
  // does nothing at 256 colours or shreds the image at 16.
  const amp = dither ? Math.min(48, 220 / Math.max(2, Math.cbrt(size))) : 0;

  for (let y = 0, p = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++) {
      const i = p * 4;
      let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (amp) {
        const d = BAYER4[(y & 3) * 4 + (x & 3)] * amp;
        r = r + d; g = g + d; b = b + d;
        r = r < 0 ? 0 : r > 255 ? 255 : r;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        b = b < 0 ? 0 : b > 255 ? 255 : b;
      }
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let k = cache[key];
      if (k < 0) {
        k = nearest(palette, size, r, g, b);
        cache[key] = k;
      }
      out[p] = k;
    }
  }
  return out;
}

function nearest(palette, size, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let k = 0; k < size; k++) {
    const dr = r - palette[k * 3], dg = g - palette[k * 3 + 1], db = b - palette[k * 3 + 2];
    // Weighted like the split above, and for the same reason.
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) { bestD = d; best = k; if (d === 0) break; }
  }
  return best;
}

// ── 3. LZW, and the container around it ───────────────────────────

class ByteSink {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  byte(v) {
    if (this.n === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = v & 255;
  }
  short(v) { this.byte(v); this.byte(v >> 8); }
  bytes(arr) { for (const v of arr) this.byte(v); }
  ascii(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  done() { return this.buf.slice(0, this.n); }
}

function header(out, width, height, palette, tableSize, loop, frameCount) {
  out.ascii('GIF89a');
  out.short(width);
  out.short(height);
  // global table present | 8-bit colour resolution | not sorted | size
  out.byte(0x80 | 0x70 | (Math.log2(tableSize) - 1));
  out.byte(0);                                   // background index
  out.byte(0);                                   // pixel aspect ratio: square
  for (let i = 0; i < tableSize * 3; i++) out.byte(palette[i] ?? 0);

  // A single-frame GIF with a Netscape block is legal but pointless, and some
  // tools treat the loop extension as the marker that a file is animated.
  if (frameCount > 1) {
    out.byte(0x21); out.byte(0xff); out.byte(11);
    out.ascii('NETSCAPE2.0');
    out.byte(3); out.byte(1);
    out.short(loop);                             // 0 = forever
    out.byte(0);
  }
}

function graphicControl(out, delayCs) {
  out.byte(0x21); out.byte(0xf9); out.byte(4);
  // No transparency, and disposal 1 (leave in place): every frame here is a
  // full opaque frame, so there is nothing to dispose to.
  out.byte(0x04);
  out.short(delayCs);
  out.byte(0);                                   // transparent index (unused)
  out.byte(0);
}

function imageDescriptor(out, width, height) {
  out.byte(0x2c);
  out.short(0); out.short(0);                    // left, top
  out.short(width); out.short(height);
  out.byte(0);                                   // no local table, not interlaced
}

/**
 * GIF's variable-width LZW.
 *
 * The code-width rule is the part that goes wrong silently: the encoder must
 * widen the code exactly one step before the decoder would, or the whole
 * stream shears and the file decodes to noise from that byte onward. The
 * selftest decodes what this writes, which is the only way to be sure.
 */
export function lzw(out, indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let table = new Map();

  // Sub-blocks: at most 255 bytes each, terminated by a zero-length block.
  const block = [];
  let bits = 0, bitCount = 0;

  const flushBlock = () => {
    if (!block.length) return;
    out.byte(block.length);
    out.bytes(block);
    block.length = 0;
  };
  const emit = (code) => {
    bits |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      block.push(bits & 255);
      bits >>= 8;
      bitCount -= 8;
      if (block.length === 255) flushBlock();
    }
  };

  out.byte(minCodeSize);
  emit(clearCode);

  let cur = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (cur << 8) | k;
    const found = table.get(key);
    if (found !== undefined) { cur = found; continue; }
    emit(cur);
    if (nextCode === 4096) {
      emit(clearCode);
      table = new Map();
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (nextCode >= (1 << codeSize)) codeSize++;
      table.set(key, nextCode++);
    }
    cur = k;
  }
  emit(cur);
  emit(eoiCode);

  if (bitCount > 0) {
    block.push(bits & 255);
    if (block.length === 255) flushBlock();
  }
  flushBlock();
  out.byte(0);                                   // block terminator
}

/**
 * Why this is not how a dweet gets posted to Bluesky.
 *
 * Measured 2026-09-22, not assumed:
 *
 *   • `app.bsky.embed.images` blobs are never served as uploaded. The AppView
 *     hands out `cdn.bsky.app/img/...` URLs and that CDN is a transcoder — the
 *     bare URL answers `image/webp`, `@jpeg` answers `image/jpeg`, `@png`
 *     answers `image/png`. Its output format is chosen by the READER's client.
 *   • The official composer re-encodes every picture to `SaveFormat.JPEG`
 *     before upload (`social-app/src/state/gallery.ts`).
 *   • Motion in the Bluesky app is an `app.bsky.embed.external` PLAYER, keyed
 *     on an allowlist of hosts — tenor, giphy, klipy and the video sites
 *     (`social-app/src/lib/strings/embed-player.ts`). It is a host allowlist,
 *     not a content type, so no file we upload can join it.
 *
 * So a GIF posted as a Bluesky image is a still, and the still is better made
 * as a still. The in-feed animated path is `app.bsky.embed.video`, which needs
 * a transcode through `app.bsky.video.uploadVideo` — see `dweet/CLAUDE.md`.
 */
