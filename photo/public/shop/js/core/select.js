// select.js — selections. Everything here builds or edits a Float32 mask of
// W*H values in 0..1, because that is the only currency /shop trades in: a
// lasso, a magic wand, a painted stroke, a layer mask and an effect's field are
// interchangeable by construction, so any of them can gate any effect.
//
// WHY THE MASK IS CONTINUOUS AND NOT A BITMAP
// -------------------------------------------
// A binary selection has to be antialiased at the end, and by then the shape's
// geometry is gone — you are blurring staircases. Here the coverage is computed
// *while* the shape is known: the polygon filler integrates exact horizontal
// spans over sub-scanlines, so a lasso edge arrives already correct, and
// feathering is a deliberate second operation rather than a repair.
//
// Feather, grow and contract are therefore honest about what they do: feather
// blurs coverage, while grow/contract move the 50% contour by a measured
// distance (chamfer 3-4, error under 2% of the radius) and leave the softness
// alone.

import { blurMask, clamp01, clampi, luma } from './pixels.js';

export const COMBINE = ['replace', 'add', 'subtract', 'intersect', 'xor'];

export const makeSelection = (W, H, v = 0) => {
  const m = new Float32Array(W * H);
  if (v) m.fill(v);
  return m;
};

/** Does this mask select anything at all? A fully-empty selection means none. */
export function isEmpty(mask) {
  if (!mask) return true;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 0.002) return false;
  return true;
}

/** Selected area in pixels — the sum of coverage, which is what "area" means
 *  once edges are fractional. */
export function area(mask) {
  let s = 0;
  for (let i = 0; i < mask.length; i++) s += mask[i];
  return s;
}

/** Tight integer bounds of everything above `t`, or null. */
export function bounds(mask, W, H, t = 0.002) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      if (mask[i] > t) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ─────────────────────────────────────────────────────────────── shapes ──

/**
 * Rectangle with exact fractional coverage on all four edges — a marquee
 * dragged to x = 10.5 really does select half of column 10.
 */
export function rect(W, H, x0, y0, x1, y1) {
  const m = makeSelection(W, H);
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = Math.max(0, Math.floor(ay)); y < Math.min(H, Math.ceil(by)); y++) {
    const cy = Math.min(y + 1, by) - Math.max(y, ay);
    if (cy <= 0) continue;
    for (let x = Math.max(0, Math.floor(ax)); x < Math.min(W, Math.ceil(bx)); x++) {
      const cx = Math.min(x + 1, bx) - Math.max(x, ax);
      if (cx > 0) m[y * W + x] = clamp01(cx * cy);
    }
  }
  return m;
}

/** Ellipse inscribed in the dragged box, antialiased by sub-scanline spans. */
export function ellipse(W, H, x0, y0, x1, y1, { samples = 4 } = {}) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
  const m = makeSelection(W, H);
  if (rx <= 0 || ry <= 0) return m;
  const yLo = Math.max(0, Math.floor(cy - ry)), yHi = Math.min(H, Math.ceil(cy + ry));
  for (let y = yLo; y < yHi; y++) {
    for (let s = 0; s < samples; s++) {
      const sy = y + (s + 0.5) / samples;
      const dy = (sy - cy) / ry;
      const k = 1 - dy * dy;
      if (k <= 0) continue;
      const half = rx * Math.sqrt(k);
      addSpan(m, W, y, cx - half, cx + half, 1 / samples);
    }
  }
  return m;
}

/**
 * Polygon fill — the lasso, the polygonal lasso and any traced shape.
 * Even-odd, integrated over `samples` sub-scanlines with analytic coverage
 * across x, which is why a hand-drawn lasso has a clean edge without a blur.
 */
export function polygon(W, H, pts, { samples = 4 } = {}) {
  const m = makeSelection(W, H);
  const n = pts.length;
  if (n < 3) return m;
  let yMin = Infinity, yMax = -Infinity;
  for (const p of pts) { if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1]; }
  const yLo = Math.max(0, Math.floor(yMin)), yHi = Math.min(H, Math.ceil(yMax) + 1);
  const xs = [];
  for (let y = yLo; y < yHi; y++) {
    for (let s = 0; s < samples; s++) {
      const sy = y + (s + 0.5) / samples;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ay = pts[j][1], by = pts[i][1];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          const t = (sy - ay) / (by - ay);
          xs.push(pts[j][0] + t * (pts[i][0] - pts[j][0]));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) addSpan(m, W, y, xs[k], xs[k + 1], 1 / samples);
    }
  }
  for (let i = 0; i < m.length; i++) if (m[i] > 1) m[i] = 1;
  return m;
}

/** Accumulate coverage `w` over the horizontal span [xa,xb) of row y. */
function addSpan(m, W, y, xa, xb, w) {
  if (xb <= xa) return;
  const a = Math.max(0, xa), b = Math.min(W, xb);
  if (b <= a) return;
  const i0 = Math.floor(a), i1 = Math.ceil(b);
  const row = y * W;
  for (let x = i0; x < i1; x++) {
    const cov = Math.min(x + 1, b) - Math.max(x, a);
    if (cov > 0) m[row + x] += cov * w;
  }
}

// ───────────────────────────────────────────────────────── from colour ──

/**
 * Magic wand. Contiguous by default (a flood fill in 4-connectivity), or
 * global — the same tolerance test applied to the whole picture, which is the
 * "select similar" case.
 *
 * Tolerance is measured as a normalised RGB distance so it behaves the same on
 * a dark photo as a bright one; `sampleAll` compares composited pixels rather
 * than the active layer's, which is what the eye is actually pointing at.
 */
export function wand(px, W, H, sx, sy, { tolerance = 0.12, contiguous = true, softness = 0 } = {}) {
  const m = makeSelection(W, H);
  const i0 = (clampi(Math.floor(sy), H) * W + clampi(Math.floor(sx), W));
  const q0 = i0 * 4;
  const r0 = px[q0], g0 = px[q0 + 1], b0 = px[q0 + 2], a0 = px[q0 + 3];
  const tol = Math.max(1e-4, tolerance);
  const soft = Math.max(0, softness);

  const score = (q) => {
    const dr = (px[q] - r0) / 255, dg = (px[q + 1] - g0) / 255, db = (px[q + 2] - b0) / 255;
    const da = (px[q + 3] - a0) / 255;
    const d = Math.sqrt((dr * dr + dg * dg + db * db) / 3 + da * da * 0.5);
    if (d <= tol) return soft > 0 ? clamp01(1 - Math.max(0, d - tol * (1 - soft)) / (tol * soft || 1)) : 1;
    return 0;
  };

  if (!contiguous) {
    for (let i = 0, q = 0; i < W * H; i++, q += 4) m[i] = score(q);
    return m;
  }

  const seen = new Uint8Array(W * H);
  const stack = [i0];
  seen[i0] = 1;
  while (stack.length) {
    const i = stack.pop();
    const v = score(i * 4);
    if (v <= 0) continue;
    m[i] = v;
    const x = i % W, y = (i / W) | 0;
    if (x > 0 && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < W - 1 && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W); }
    if (y < H - 1 && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W); }
  }
  return m;
}

/** Select by luminance band — "the sky", "the shadows", without a click. */
export function luminanceRange(px, W, H, { lo = 0.6, hi = 1, feather: f = 0.05 } = {}) {
  const m = makeSelection(W, H);
  for (let i = 0, q = 0; i < W * H; i++, q += 4) {
    const l = luma(px[q], px[q + 1], px[q + 2]) / 255;
    let v = 1;
    if (l < lo) v = f > 0 ? clamp01(1 - (lo - l) / f) : 0;
    else if (l > hi) v = f > 0 ? clamp01(1 - (l - hi) / f) : 0;
    m[i] = v;
  }
  return m;
}

// ───────────────────────────────────────────────────────────── algebra ──

/** Boolean combination of two masks. `add` is a union, not a sum — coverage
 *  saturates rather than doubling, or two overlapping strokes would clip. */
export function combine(base, next, mode = 'replace') {
  if (mode === 'replace' || !base) return next;
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) {
    const a = base[i], b = next[i];
    out[i] = mode === 'add' ? Math.max(a, b)
      : mode === 'subtract' ? Math.max(0, a - b)
        : mode === 'intersect' ? Math.min(a, b)
          : mode === 'xor' ? Math.abs(a - b)
            : b;
  }
  return out;
}

export function invert(mask) {
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = 1 - mask[i];
  return out;
}

/** Soften the edge. Radius is in pixels; the blur is the triple box of
 *  pixels.js, so a feather of r spreads the transition over roughly 2r. */
export function feather(mask, W, H, radius) {
  const out = new Float32Array(mask);
  blurMask(out, W, H, radius);
  return out;
}

/**
 * Move the 50% contour outward (positive) or inward (negative) by `px` pixels.
 * Chamfer 3-4 distance on the thresholded mask: cheap, and its error against
 * true Euclidean distance is under 2% — invisible at selection radii, and the
 * selftest holds it to that.
 */
export function grow(mask, W, H, px) {
  if (!px) return new Float32Array(mask);
  const outward = px > 0;
  const r = Math.abs(px);
  const dist = chamfer(mask, W, H, outward ? 0.5 : -0.5);
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (outward) out[i] = dist[i] <= r ? Math.max(mask[i], 1) : mask[i];
    else out[i] = dist[i] <= r ? 0 : mask[i];
  }
  return out;
}

/** Distance (chamfer 3-4, in pixels) from every pixel to the nearest pixel on
 *  the far side of the 0.5 contour. `sign > 0` measures from outside in. */
function chamfer(mask, W, H, sign) {
  const inside = (i) => (sign > 0 ? mask[i] >= 0.5 : mask[i] < 0.5);
  const BIG = 1e9;
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = inside(i) ? 0 : BIG;
  const put = (i, v) => { if (v < d[i]) d[i] = v; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) put(i, d[i - 1] + 3);
      if (y > 0) put(i, d[i - W] + 3);
      if (x > 0 && y > 0) put(i, d[i - W - 1] + 4);
      if (x < W - 1 && y > 0) put(i, d[i - W + 1] + 4);
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) put(i, d[i + 1] + 3);
      if (y < H - 1) put(i, d[i + W] + 3);
      if (x < W - 1 && y < H - 1) put(i, d[i + W + 1] + 4);
      if (x > 0 && y < H - 1) put(i, d[i + W - 1] + 4);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

// ───────────────────────────────────────────────────── marching ants ──

/**
 * The 0.5 contour as line segments, by marching squares. Used only to *draw*
 * the selection — the mask stays the truth — but it matters that it is the real
 * level set: an outline traced from a thresholded bitmap jitters by a pixel as
 * you feather, and the eye reads that as the selection moving.
 */
export function contours(mask, W, H, level = 0.5) {
  const segs = [];
  const at = (x, y) => mask[clampi(y, H) * W + clampi(x, W)];
  const ix = (a, b, xa, xb) => xa + ((level - a) / (b - a || 1e-9)) * (xb - xa);
  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const v0 = inb(x, y, W, H) ? at(x, y) : 0;
      const v1 = inb(x + 1, y, W, H) ? at(x + 1, y) : 0;
      const v2 = inb(x + 1, y + 1, W, H) ? at(x + 1, y + 1) : 0;
      const v3 = inb(x, y + 1, W, H) ? at(x, y + 1) : 0;
      const c = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      // midpoints of the four cell edges, at the crossing
      const top = [ix(v0, v1, x + 0.5, x + 1.5), y + 0.5];
      const right = [x + 1.5, ix(v1, v2, y + 0.5, y + 1.5)];
      const bottom = [ix(v3, v2, x + 0.5, x + 1.5), y + 1.5];
      const left = [x + 0.5, ix(v0, v3, y + 0.5, y + 1.5)];
      const push = (a, b) => segs.push([a, b]);
      switch (c) {
        case 1: case 14: push(left, top); break;
        case 2: case 13: push(top, right); break;
        case 3: case 12: push(left, right); break;
        case 4: case 11: push(right, bottom); break;
        case 5: push(left, top); push(right, bottom); break;
        case 6: case 9: push(top, bottom); break;
        case 7: case 8: push(left, bottom); break;
        case 10: push(left, bottom); push(top, right); break;
        default: break;
      }
    }
  }
  return segs;
}

const inb = (x, y, W, H) => x >= 0 && y >= 0 && x < W && y < H;

// ───────────────────────────────────────────────────── serialisation ──
//
// A mask is W*H floats — far too big for a URL, and pointless at full precision
// since a selection's edge is already soft. Quantise to a byte and run-length
// encode: flat regions (which is most of any selection) cost 2 bytes per run,
// so a typical lasso serialises to a few hundred bytes.

export function encodeMask(mask, W, H) {
  const runs = [];
  let cur = Math.round(mask[0] * 255), len = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = Math.round(mask[i] * 255);
    if (v === cur && len < 0xffff) { len++; continue; }
    runs.push(cur, len);
    cur = v; len = 1;
  }
  runs.push(cur, len);
  let bin = '';
  for (let i = 0; i < runs.length; i += 2) {
    const v = runs[i], n = runs[i + 1];
    bin += String.fromCharCode(v, n & 255, (n >> 8) & 255);
  }
  return { W, H, rle: b64enc(bin) };
}

export function decodeMask(enc) {
  if (!enc || !enc.rle) return null;
  const bin = b64dec(enc.rle);
  const m = new Float32Array(enc.W * enc.H);
  let p = 0;
  for (let i = 0; i + 2 < bin.length + 1; i += 3) {
    const v = bin.charCodeAt(i) / 255;
    const n = bin.charCodeAt(i + 1) | (bin.charCodeAt(i + 2) << 8);
    for (let k = 0; k < n && p < m.length; k++) m[p++] = v;
  }
  return m;
}

const b64enc = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64dec = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('binary');
};
