// io.js — getting pictures in and out. The only file in /shop that knows about
// files, blobs, canvases or the clipboard.
//
// TWO THINGS WORTH KNOWING
// -----------------------
// * **The recipe rides inside the exported PNG.** A `tEXt` chunk named
//   `shop-recipe` carries the whole document — layers, stacks, parameters,
//   masks — so a file found on a disk two years from now can still say how it
//   was made, and dropping it back on this page reopens it as a project.
//   *copy image* cannot do that: the browser re-encodes the bitmap on the way
//   to the clipboard and drops unknown chunks. The UI says so rather than
//   pretending otherwise.
// * **`ClipboardItem` gets the blob as a pending promise.** Awaiting the blob
//   first and *then* writing loses the user-gesture permission in Safari, and
//   the copy silently fails. Hand it the promise; resolve it later.

import { makeRGBA } from '../core/pixels.js';

export const RECIPE_KEY = 'shop-recipe';

// ─────────────────────────────────────────────────────────────── input ──

/** Decode any image the browser can read into raw RGBA at its own size. */
export async function decodeImage(blobOrUrl) {
  const bmp = await createImageBitmap(
    typeof blobOrUrl === 'string' ? await (await fetch(blobOrUrl)).blob() : blobOrUrl,
  );
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return { px: new Uint8ClampedArray(img.data), W: c.width, H: c.height };
}

/** Scale so the longest side is at most `maxSide`, with a box filter. */
export function capSize({ px, W, H }, maxSide) {
  if (Math.max(W, H) <= maxSide) return { px, W, H };
  const k = maxSide / Math.max(W, H);
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(new ImageData(px, W, H), 0, 0);
  const d = document.createElement('canvas');
  d.width = w; d.height = h;
  const dc = d.getContext('2d', { willReadFrequently: true });
  dc.imageSmoothingEnabled = true;
  dc.imageSmoothingQuality = 'high';
  dc.drawImage(c, 0, 0, w, h);
  return { px: new Uint8ClampedArray(dc.getImageData(0, 0, w, h).data), W: w, H: h };
}

/** Draw a picture into a document-sized buffer, centred, without scaling. */
export function place(px, W, H, docW, docH) {
  const out = makeRGBA(docW, docH);
  const ox = Math.round((docW - W) / 2), oy = Math.round((docH - H) / 2);
  for (let y = 0; y < H; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= docH) continue;
    for (let x = 0; x < W; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= docW) continue;
      const s = (y * W + x) * 4, d = (dy * docW + dx) * 4;
      out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────── output ──

export function toCanvas(px, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(new ImageData(px, W, H), 0, 0);
  return c;
}

export const toBlob = (px, W, H, type = 'image/png', quality) =>
  new Promise((res) => toCanvas(px, W, H).toBlob(res, type, quality));

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Put the picture on the clipboard. Must be called straight from a gesture. */
export function copyImage(px, W, H) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return Promise.reject(new Error('this browser has no image clipboard'));
  }
  return navigator.clipboard.write([
    new ClipboardItem({ 'image/png': toBlob(px, W, H) }),
  ]);
}

// ─────────────────────────────────────────────────────── PNG metadata ──

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Insert a `tEXt` chunk immediately after IHDR, where readers expect it. */
export async function withPNGText(blob, key, value) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return blob;
  const ihdrLen = readU32(buf, 8);
  const insertAt = 8 + 4 + 4 + ihdrLen + 4;

  const text = new TextEncoder().encode(`${key}\0${value}`);
  const chunk = new Uint8Array(12 + text.length);
  writeU32(chunk, 0, text.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // 'tEXt'
  chunk.set(text, 8);
  writeU32(chunk, 8 + text.length, crc32(chunk.subarray(4, 8 + text.length)));

  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(buf.subarray(insertAt), insertAt + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

/** Read a `tEXt` value back out, or null. */
export async function readPNGText(blob, key) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf[0] !== 137 || buf[1] !== 80) return null;
  let p = 8;
  const dec = new TextDecoder();
  while (p + 8 <= buf.length) {
    const len = readU32(buf, p);
    const type = dec.decode(buf.subarray(p + 4, p + 8));
    if (type === 'tEXt') {
      const data = buf.subarray(p + 8, p + 8 + len);
      const zero = data.indexOf(0);
      if (zero > 0 && dec.decode(data.subarray(0, zero)) === key) {
        return dec.decode(data.subarray(zero + 1));
      }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

const readU32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
function writeU32(b, i, v) {
  b[i] = (v >>> 24) & 255; b[i + 1] = (v >>> 16) & 255; b[i + 2] = (v >>> 8) & 255; b[i + 3] = v & 255;
}

// ───────────────────────────────────────────────────────────── projects ──

/**
 * A project is the serialised document with each raster layer's pixels as a
 * PNG data URL. PNG rather than raw bytes because it is lossless *and*
 * compressed — a mostly-transparent layer costs kilobytes instead of the 15 MB
 * its buffer occupies in memory.
 */
export async function encodeLayerPixels(px, W, H) {
  const blob = await toBlob(px, W, H);
  return await blobToDataURL(blob);
}

export async function decodeLayerPixels(dataUrl) {
  return await decodeImage(await (await fetch(dataUrl)).blob());
}

const blobToDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/** A test pattern, for trying the tools without a photograph to hand. */
export function testPattern(W = 900, H = 600) {
  const px = makeRGBA(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4;
      const u = x / W, v = y / H;
      // colour wheel over a tonal ramp, plus a hard-edged grid to make blurs,
      // sharpening and dithering legible at a glance
      const h = (Math.atan2(v - 0.5, u - 0.5) / (Math.PI * 2) + 1) % 1;
      const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2.2);
      const [cr, cg, cb] = hsv(h * 360, r, 0.35 + 0.65 * (1 - v));
      const grid = (x % 60 < 2 || y % 60 < 2) ? 0.35 : 1;
      px[q] = cr * grid; px[q + 1] = cg * grid; px[q + 2] = cb * grid; px[q + 3] = 255;
    }
  }
  return { px, W, H };
}

function hsv(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
