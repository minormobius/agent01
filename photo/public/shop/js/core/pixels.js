// pixels.js — the substrate every other file in /shop stands on: colour,
// blend modes, alpha compositing, and resampling. DOM-free, so the whole
// imaging core can be proved under node by `photo/shop.selftest.mjs`.
//
// TWO CONVENTIONS, HELD EVERYWHERE
// -------------------------------
// 1. A picture is a `Uint8ClampedArray` of W*H*4 **straight** (un-premultiplied)
//    sRGB bytes. Straight, not premultiplied, because every effect in the
//    registry — including the twelve inherited from /glitch — reads and writes
//    plain RGB, and silently changing what the numbers mean underneath them is
//    how a compositor grows dark fringes nobody can find later.
// 2. A mask is a `Float32Array` of W*H values in 0..1. Selections, layer masks,
//    brush strokes and effect fields are all the same object, which is why a
//    lasso can gate a Droste warp with no adapter in between.
//
// Compositing follows the W3C Compositing and Blending spec: the separable
// modes are per-channel functions B(backdrop, source), the four non-separable
// ones (hue/saturation/colour/luminosity) move whole colours through Lum/Sat
// with the clipping step that keeps the result in gamut. Getting `ClipColor`
// right is the difference between "luminosity" and "luminosity, plus posterised
// highlights".

export const CHANNELS = 4;

// ────────────────────────────────────────────────────────────── buffers ──

export const makeRGBA = (W, H) => new Uint8ClampedArray(W * H * 4);
export const makeMask = (W, H, v = 0) => {
  const m = new Float32Array(W * H);
  if (v) m.fill(v);
  return m;
};
export const cloneRGBA = (px) => new Uint8ClampedArray(px);
export const cloneMask = (m) => (m ? new Float32Array(m) : null);

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Rec.709 luma, 0..255 in, 0..255 out. The one brightness this file uses. */
export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ─────────────────────────────────────────────────────────────── colour ──

/** sRGB byte → linear-light 0..1. */
export function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Linear-light 0..1 → sRGB byte. */
export function linearToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp255(c * 255);
}

/** RGB 0..255 → HSL, h in 0..360, s and l in 0..1. */
export function rgbToHsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/** HSL → RGB 0..255. */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  if (s <= 0) { const v = l * 255; return [v, v, v]; }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** `#rrggbb` (or `#rgb`) → [r,g,b] 0..255. */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (c) =>
  '#' + [0, 1, 2].map((i) => Math.round(clamp255(c[i])).toString(16).padStart(2, '0')).join('');

// ────────────────────────────────────────────────────────── blend modes ──
//
// Separable modes: plain functions of one channel, operating on 0..1.

const sep = {
  normal: (_b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  'color-dodge': (b, s) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  'color-burn': (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  'hard-light': (b, s) => (s <= 0.5 ? 2 * s * b : 1 - 2 * (1 - s) * (1 - b)),
  'soft-light': (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
  add: (b, s) => Math.min(1, b + s),
  subtract: (b, s) => Math.max(0, b - s),
  divide: (b, s) => (s <= 0 ? 1 : Math.min(1, b / s)),
  'linear-burn': (b, s) => Math.max(0, b + s - 1),
  'vivid-light': (b, s) => (s <= 0.5
    ? (s <= 0 ? 0 : b >= 1 ? 1 : 1 - Math.min(1, (1 - b) / (2 * s)))
    : (s >= 1 ? 1 : b <= 0 ? 0 : Math.min(1, b / (2 * (1 - s))))),
};

// Non-separable modes work on the whole colour. Lum/Sat per the spec, with
// ClipColor pulling an out-of-range result back toward its own luminosity
// instead of clipping each channel independently (which shifts hue).

const lum3 = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function clipColor(c) {
  const l = lum3(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  if (n < 0) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * l) / (l - n || 1e-9);
  if (x > 1) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * (1 - l)) / (x - l || 1e-9);
  return c;
}

function setLum(c, l) {
  const d = l - lum3(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

const sat3 = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

function setSat(c, s) {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]);
  const [mn, md, mx] = idx;
  const out = [0, 0, 0];
  if (c[mx] > c[mn]) {
    out[md] = ((c[md] - c[mn]) * s) / (c[mx] - c[mn]);
    out[mx] = s;
  }
  out[mn] = 0;
  return out;
}

const nonSep = {
  hue: (b, s) => setLum(setSat(s, sat3(b)), lum3(b)),
  saturation: (b, s) => setLum(setSat(b, sat3(s)), lum3(b)),
  color: (b, s) => setLum(s, lum3(b)),
  luminosity: (b, s) => setLum(b, lum3(s)),
};

/** Every mode the compositor understands, in menu order. */
export const BLEND_MODES = [
  'normal', 'dissolve',
  'darken', 'multiply', 'color-burn', 'linear-burn',
  'lighten', 'screen', 'color-dodge', 'add',
  'overlay', 'soft-light', 'hard-light', 'vivid-light',
  'difference', 'exclusion', 'subtract', 'divide',
  'hue', 'saturation', 'color', 'luminosity',
];

export const isSeparable = (mode) => !!sep[mode];

/**
 * One blended colour, all channels 0..1. Exposed for the selftest and for the
 * few effects that want a mode without a whole composite.
 */
export function blendPixel(mode, br, bg, bb, sr, sg, sb) {
  const f = sep[mode];
  if (f) return [f(br, sr), f(bg, sg), f(bb, sb)];
  const g = nonSep[mode];
  if (g) return g([br, bg, bb], [sr, sg, sb]);
  return [sr, sg, sb];
}

// ────────────────────────────────────────────────────────── compositing ──

/**
 * Composite `src` over `dst` in place, straight-alpha, W3C rules.
 *
 * `mask` (0..1 per pixel) and `opacity` both scale the source alpha, so a layer
 * mask, a selection and a layer's opacity slider are the same mechanism seen
 * three ways. `dissolve` is the one mode that is not a colour function — it
 * thresholds a seeded hash against the source alpha, which is why it needs a
 * seed and why it stays stable as you drag the opacity slider.
 */
export function compositeOver(dst, src, W, H, {
  mode = 'normal', opacity = 1, mask = null, seed = 0x5eed,
} = {}) {
  const N = W * H;
  const separable = sep[mode];
  const nonseparable = nonSep[mode];
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    let as = (src[q + 3] / 255) * opacity * (mask ? mask[i] : 1);
    if (as <= 0) continue;
    if (mode === 'dissolve') {
      as = hashUnit(seed, i) < as ? 1 : 0;
      if (as === 0) continue;
    }
    const ab = dst[q + 3] / 255;
    const ao = as + ab * (1 - as);
    if (ao <= 0) { dst[q + 3] = 0; continue; }

    const br = dst[q] / 255, bg = dst[q + 1] / 255, bb = dst[q + 2] / 255;
    const sr = src[q] / 255, sg = src[q + 1] / 255, sb = src[q + 2] / 255;

    let mr = sr, mg = sg, mb = sb;
    if (separable && mode !== 'normal') {
      mr = separable(br, sr); mg = separable(bg, sg); mb = separable(bb, sb);
    } else if (nonseparable) {
      const c = nonseparable([br, bg, bb], [sr, sg, sb]);
      mr = c[0]; mg = c[1]; mb = c[2];
    }
    // The backdrop only takes part where it exists: with ab = 0 the blend
    // result must fall back to the plain source, or every mode paints onto
    // transparency as if the void were black.
    mr = lerp(sr, mr, ab); mg = lerp(sg, mg, ab); mb = lerp(sb, mb, ab);

    dst[q] = ((as * mr + ab * (1 - as) * br) / ao) * 255;
    dst[q + 1] = ((as * mg + ab * (1 - as) * bg) / ao) * 255;
    dst[q + 2] = ((as * mb + ab * (1 - as) * bb) / ao) * 255;
    dst[q + 3] = ao * 255;
  }
  return dst;
}

/**
 * Blend `src` into `dst` **without changing coverage** — what an adjustment
 * layer does.
 *
 * This cannot be `compositeOver`, and the reason is worth stating because the
 * bug it causes is invisible on an opaque photograph: an adjustment layer's
 * output has exactly the same alpha as its input, so compositing it *over* its
 * own backdrop applies the source-over alpha rule twice. A pixel at 16% opacity
 * comes out at 29%, and a stack of adjustment layers slowly turns a soft edge
 * opaque. Here the colour is blended and the alpha is left alone.
 */
export function compositeAdjust(dst, src, W, H, { mode = 'normal', opacity = 1, mask = null } = {}) {
  const N = W * H;
  const separable = sep[mode];
  const nonseparable = nonSep[mode];
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    const a = opacity * (mask ? mask[i] : 1);
    if (a <= 0 || dst[q + 3] <= 0) continue;
    const br = dst[q] / 255, bg = dst[q + 1] / 255, bb = dst[q + 2] / 255;
    const sr = src[q] / 255, sg = src[q + 1] / 255, sb = src[q + 2] / 255;
    let mr = sr, mg = sg, mb = sb;
    if (separable && mode !== 'normal') {
      mr = separable(br, sr); mg = separable(bg, sg); mb = separable(bb, sb);
    } else if (nonseparable) {
      const c = nonseparable([br, bg, bb], [sr, sg, sb]);
      mr = c[0]; mg = c[1]; mb = c[2];
    } else if (mode === 'dissolve') {
      if (hashUnit(0x5eed, i) >= a) continue;
      mr = sr; mg = sg; mb = sb;
      dst[q] = mr * 255; dst[q + 1] = mg * 255; dst[q + 2] = mb * 255;
      continue;
    }
    dst[q] = lerp(br, mr, a) * 255;
    dst[q + 1] = lerp(bg, mg, a) * 255;
    dst[q + 2] = lerp(bb, mb, a) * 255;
  }
  return dst;
}

/** Position-addressed hash in 0..1 — the same trick /glitch runs on. */
export function hashUnit(seed, i) {
  let h = (seed ^ Math.imul(i | 0, 0x27d4eb2d)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x3b9dca3d) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Blend `next` back over `cur` through a mask — the effect-stack counterpart of
 * `compositeOver`, and the guarantee the selftest checks for every effect:
 * where the mask is 0 the source survives byte for byte, alpha included.
 */
export function blendMasked(cur, next, mask, amount, N) {
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    const m = (mask ? mask[i] : 1) * amount;
    if (m <= 0) continue;
    if (m >= 1) {
      cur[q] = next[q]; cur[q + 1] = next[q + 1];
      cur[q + 2] = next[q + 2]; cur[q + 3] = next[q + 3];
    } else {
      cur[q] = lerp(cur[q], next[q], m);
      cur[q + 1] = lerp(cur[q + 1], next[q + 1], m);
      cur[q + 2] = lerp(cur[q + 2], next[q + 2], m);
      cur[q + 3] = lerp(cur[q + 3], next[q + 3], m);
    }
  }
  return cur;
}

/** Multiply a layer's alpha by a mask — how a clipping group is enforced. */
export function applyAlphaMask(px, mask, N) {
  for (let i = 0, q = 3; i < N; i++, q += 4) px[q] = px[q] * mask[i];
  return px;
}

/** The alpha channel as a mask, for clipping to the layer beneath. */
export function alphaOf(px, N) {
  const m = new Float32Array(N);
  for (let i = 0, q = 3; i < N; i++, q += 4) m[i] = px[q] / 255;
  return m;
}

// ─────────────────────────────────────────────────────────── resampling ──

/** Bilinear read with transparent edges. Writes 4 channels into `out`. */
export function sampleBilinear(px, W, H, x, y, out) {
  if (x < -1 || y < -1 || x > W || y > H) { out[0] = out[1] = out[2] = out[3] = 0; return out; }
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const cx = (v) => (v < 0 ? 0 : v > W - 1 ? W - 1 : v);
  const cy = (v) => (v < 0 ? 0 : v > H - 1 ? H - 1 : v);
  const xa = cx(x0), xb = cx(x0 + 1), ya = cy(y0), yb = cy(y0 + 1);
  const i00 = (ya * W + xa) * 4, i10 = (ya * W + xb) * 4;
  const i01 = (yb * W + xa) * 4, i11 = (yb * W + xb) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy, w11 = fx * fy;
  for (let c = 0; c < 4; c++) {
    out[c] = px[i00 + c] * w00 + px[i10 + c] * w10 + px[i01 + c] * w01 + px[i11 + c] * w11;
  }
  return out;
}

export const IDENTITY_TRANSFORM = { x: 0, y: 0, scale: 1, rotate: 0, flipH: false, flipV: false };

export const isIdentityTransform = (t) => !t
  || (!t.x && !t.y && (t.scale ?? 1) === 1 && !t.rotate && !t.flipH && !t.flipV);

/**
 * Draw a layer's pixels into a document-sized buffer through its transform.
 * Inverse-mapped (output pixel → source point) so no gaps open up, and the
 * identity case short-circuits to a copy — a layer nobody has moved must come
 * back bit-identical, or every stack would resample itself on every render.
 */
export function drawTransformed(dst, src, sw, sh, W, H, t) {
  if (isIdentityTransform(t) && sw === W && sh === H) { dst.set(src); return dst; }
  const scale = t?.scale ?? 1;
  const rad = ((t?.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);
  const ox = (t?.x ?? 0), oy = (t?.y ?? 0);
  const scx = sw / 2, scy = sh / 2;
  const dcx = W / 2, dcy = H / 2;
  const inv = scale === 0 ? 0 : 1 / scale;
  const out = [0, 0, 0, 0];
  for (let y = 0, q = 0; y < H; y++) {
    for (let x = 0; x < W; x++, q += 4) {
      let dx = x + 0.5 - dcx - ox, dy = y + 0.5 - dcy - oy;
      let rx = (dx * cos - dy * sin) * inv;
      let ry = (dx * sin + dy * cos) * inv;
      if (t?.flipH) rx = -rx;
      if (t?.flipV) ry = -ry;
      sampleBilinear(src, sw, sh, rx + scx - 0.5, ry + scy - 0.5, out);
      dst[q] = out[0]; dst[q + 1] = out[1]; dst[q + 2] = out[2]; dst[q + 3] = out[3];
    }
  }
  return dst;
}

/** Box-average resize — used for thumbnails and for the preview proxy. */
export function resize(src, sw, sh, dw, dh) {
  const dst = makeRGBA(dw, dh);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * yr), y1 = Math.max(y0 + 1, Math.floor((y + 1) * yr));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * xr), x1 = Math.max(x0 + 1, Math.floor((x + 1) * xr));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < Math.min(y1, sh); sy++) {
        for (let sx = x0; sx < Math.min(x1, sw); sx++) {
          const q = (sy * sw + sx) * 4;
          const w = src[q + 3] / 255;
          r += src[q] * w; g += src[q + 1] * w; b += src[q + 2] * w;
          a += src[q + 3]; n += w; // colour averaged weighted by coverage
        }
      }
      const count = (Math.min(y1, sh) - y0) * (Math.min(x1, sw) - x0) || 1;
      const q = (y * dw + x) * 4;
      const k = n || 1;
      dst[q] = r / k; dst[q + 1] = g / k; dst[q + 2] = b / k;
      dst[q + 3] = a / count;
    }
  }
  return dst;
}

/** A flat colour field, alpha included. */
export function fill(px, W, H, [r, g, b], a = 255) {
  for (let q = 0; q < W * H * 4; q += 4) {
    px[q] = r; px[q + 1] = g; px[q + 2] = b; px[q + 3] = a;
  }
  return px;
}

// ────────────────────────────────────────────────────────── mask blur ──

/**
 * Separable box blur repeated three times ≈ a Gaussian, on a Float32 mask.
 * Three passes because the triple box is where the box-blur series is already
 * within ~3% of a true Gaussian, and this runs on every feather drag.
 */
export function blurMask(mask, W, H, radius) {
  if (radius <= 0) return mask;
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(mask.length);
  for (let pass = 0; pass < 3; pass++) {
    boxH(mask, tmp, W, H, r);
    boxV(tmp, mask, W, H, r);
  }
  return mask;
}

function boxH(src, dst, W, H, r) {
  const win = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clampi(x, W)];
    for (let x = 0; x < W; x++) {
      dst[row + x] = acc / win;
      acc += src[row + clampi(x + r + 1, W)] - src[row + clampi(x - r, W)];
    }
  }
}

function boxV(src, dst, W, H, r) {
  const win = 2 * r + 1;
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += src[clampi(y, H) * W + x];
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = acc / win;
      acc += src[clampi(y + r + 1, H) * W + x] - src[clampi(y - r, H) * W + x];
    }
  }
}

const clampi = (v, n) => (v < 0 ? 0 : v > n - 1 ? n - 1 : v);
export { clampi };
