// filters.js — the adjustments that need neighbours: blurs, sharpening,
// stylisers, and the optical effects that are really "blur, then put it back
// differently". Same registry contract as adjust.js: read `src`, write `out`,
// never blend.
//
// ONE THING TO KNOW BEFORE EDITING ANY BLUR HERE
// ----------------------------------------------
// Every blur premultiplies alpha before averaging and un-premultiplies after.
// Blurring straight RGB pulls the (meaningless) colour of transparent pixels
// into visible ones and produces a dark halo around anything cut out — the
// classic "why does my mask have a grey fringe". Premultiplying is the fix, and
// it is why `blurRGBA` looks more complicated than a box filter needs to.
//
// Radii are in pixels at full resolution. Where a filter is O(r²) — median,
// kuwahara — the radius is capped in the schema rather than in the code, so the
// UI can never offer a setting that hangs the tab.

import {
  clamp01, clamp255, hashUnit, hexToRgb, linearToSrgb, luma, sampleBilinear,
  srgbToLinear, clampi,
} from './pixels.js';

// ───────────────────────────────────────────────────────── blur kernels ──

/** Normalised 1-D Gaussian, truncated at 3σ. */
export function gaussKernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  const s2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / s2); k[i + r] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return { k, r };
}

/**
 * Separable Gaussian on premultiplied RGBA. Separable because a 2-D Gaussian
 * factorises exactly — two 1-D passes are the same filter as one 2-D kernel at
 * a fraction of the cost, and that is a theorem, not an approximation.
 */
export function blurRGBA(src, W, H, sigma, out) {
  const N = W * H;
  if (sigma <= 0.05) { out.set(src); return out; }
  const { k, r } = gaussKernel(sigma);
  const pr = new Float32Array(N), pg = new Float32Array(N), pb = new Float32Array(N), pa = new Float32Array(N);
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    const a = src[q + 3] / 255;
    pr[i] = src[q] * a; pg[i] = src[q + 1] * a; pb[i] = src[q + 2] * a; pa[i] = a;
  }
  const tr = new Float32Array(N), tg = new Float32Array(N), tb = new Float32Array(N), ta = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (let t = -r; t <= r; t++) {
        const j = y * W + clampi(x + t, W), w = k[t + r];
        ar += pr[j] * w; ag += pg[j] * w; ab += pb[j] * w; aa += pa[j] * w;
      }
      const i = y * W + x;
      tr[i] = ar; tg[i] = ag; tb[i] = ab; ta[i] = aa;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (let t = -r; t <= r; t++) {
        const j = clampi(y + t, H) * W + x, w = k[t + r];
        ar += tr[j] * w; ag += tg[j] * w; ab += tb[j] * w; aa += ta[j] * w;
      }
      const i = y * W + x, q = i * 4;
      out[q + 3] = aa * 255;
      if (aa > 1e-6) { out[q] = ar / aa; out[q + 1] = ag / aa; out[q + 2] = ab / aa; }
      else { out[q] = 0; out[q + 1] = 0; out[q + 2] = 0; }
    }
  }
  return out;
}

/** Luminance plane, 0..255 — the input to every local-contrast filter here. */
export function lumaPlane(src, N) {
  const l = new Float32Array(N);
  for (let i = 0, q = 0; i < N; i++, q += 4) l[i] = luma(src[q], src[q + 1], src[q + 2]);
  return l;
}

function blurPlane(plane, W, H, sigma) {
  const N = W * H;
  if (sigma <= 0.05) return plane;
  const { k, r } = gaussKernel(sigma);
  const tmp = new Float32Array(N), out = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let t = -r; t <= r; t++) a += plane[y * W + clampi(x + t, W)] * k[t + r];
      tmp[y * W + x] = a;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let t = -r; t <= r; t++) a += tmp[clampi(y + t, H) * W + x] * k[t + r];
      out[y * W + x] = a;
    }
  }
  return out;
}

const copy = (src, out) => { out.set(src); return out; };

// ────────────────────────────────────────────────────────── the entries ──

export const FILTERS = {

  blur: {
    label: 'blur',
    note: 'Five blurs that share one control. Gaussian is the honest defocus; motion smears along a line; zoom and spin smear along the polar directions from a centre, which is what a camera does when you pull the zoom or turn the body during the exposure.',
    params: {
      mode: { type: 'enum', options: ['gaussian', 'box', 'motion', 'zoom', 'spin'], def: 'gaussian', label: 'kind' },
      radius: { min: 0, max: 80, step: 0.5, def: 0, label: 'radius' },
      angle: { min: 0, max: 360, step: 1, def: 0, label: 'angle (motion)' },
      cx: { min: 0, max: 1, step: 0.01, def: 0.5, label: 'centre x' },
      cy: { min: 0, max: 1, step: 0.01, def: 0.5, label: 'centre y' },
      steps: { min: 4, max: 64, step: 1, def: 24, label: 'samples' },
    },
    apply(src, out, W, H, P) {
      if (P.radius <= 0) return copy(src, out);
      if (P.mode === 'gaussian') return blurRGBA(src, W, H, P.radius / 2, out);
      if (P.mode === 'box') {
        // three box passes ≈ Gaussian; kept separate because the flat kernel is
        // what gives the hard-edged "cheap blur" look some stacks want
        const t = new Uint8ClampedArray(src.length);
        boxRGBA(src, W, H, Math.round(P.radius), t);
        boxRGBA(t, W, H, Math.round(P.radius), out);
        return out;
      }
      const n = Math.max(2, P.steps | 0);
      const cx = P.cx * W, cy = P.cy * H;
      const rad = (P.angle * Math.PI) / 180;
      const dx = Math.cos(rad) * P.radius, dy = Math.sin(rad) * P.radius;
      const px = [0, 0, 0, 0];
      for (let y = 0, q = 0; y < H; y++) {
        for (let x = 0; x < W; x++, q += 4) {
          let ar = 0, ag = 0, ab = 0, aa = 0;
          for (let s = 0; s < n; s++) {
            const t = s / (n - 1) - 0.5;
            let sx, sy;
            if (P.mode === 'motion') { sx = x + dx * t; sy = y + dy * t; }
            else {
              const vx = x - cx, vy = y - cy;
              const dist = Math.hypot(vx, vy);
              if (P.mode === 'zoom') {
                const k = 1 + (t * P.radius) / Math.max(1, Math.max(W, H) / 2);
                sx = cx + vx * k; sy = cy + vy * k;
              } else {
                const a = Math.atan2(vy, vx) + (t * P.radius) / Math.max(1, dist);
                sx = cx + Math.cos(a) * dist; sy = cy + Math.sin(a) * dist;
              }
            }
            sampleBilinear(src, W, H, clampi(sx, W), clampi(sy, H), px);
            const w = px[3] / 255;
            ar += px[0] * w; ag += px[1] * w; ab += px[2] * w; aa += w;
          }
          out[q + 3] = (aa / n) * 255;
          if (aa > 1e-6) { out[q] = ar / aa; out[q + 1] = ag / aa; out[q + 2] = ab / aa; }
          else { out[q] = src[q]; out[q + 1] = src[q + 1]; out[q + 2] = src[q + 2]; }
        }
      }
      return out;
    },
  },

  sharpen: {
    label: 'unsharp mask',
    note: 'Sharpening is subtraction: blur a copy, and add back what the blur destroyed. The threshold is the part that matters on a photograph — below it the difference is assumed to be noise and left alone, so skin and sky stay smooth while edges get their bite.',
    params: {
      amount: { min: 0, max: 3, step: 0.01, def: 0, label: 'amount' },
      radius: { min: 0.3, max: 20, step: 0.1, def: 1.5, label: 'radius' },
      threshold: { min: 0, max: 0.3, step: 0.005, def: 0, label: 'threshold' },
    },
    apply(src, out, W, H, P) {
      if (P.amount <= 0) return copy(src, out);
      const N = W * H;
      const blurred = new Uint8ClampedArray(src.length);
      blurRGBA(src, W, H, P.radius, blurred);
      const th = P.threshold * 255;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        for (let c = 0; c < 3; c++) {
          const d = src[q + c] - blurred[q + c];
          out[q + c] = Math.abs(d) <= th ? src[q + c] : src[q + c] + d * P.amount;
        }
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  clarity: {
    label: 'clarity',
    note: 'Unsharp mask at a radius large enough to stop being sharpening: it moves midtone local contrast rather than edges, which is what makes a hazy landscape sit up. Negative values are the soft-focus filter — the same maths, run backwards.',
    params: {
      amount: { min: -1, max: 1, step: 0.01, def: 0, label: 'clarity' },
      radius: { min: 5, max: 120, step: 1, def: 30, label: 'radius' },
    },
    apply(src, out, W, H, P) {
      if (P.amount === 0) return copy(src, out);
      const N = W * H;
      const l = lumaPlane(src, N);
      const lb = blurPlane(l, W, H, P.radius / 2);
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        // midtone-weighted, so the push fades out in the deepest shadows and
        // brightest highlights where it would only clip
        const t = clamp01(l[i] / 255);
        const w = 1 - Math.abs(t - 0.5) * 2;
        const d = (l[i] - lb[i]) * P.amount * (0.35 + 0.65 * w);
        for (let c = 0; c < 3; c++) out[q + c] = src[q + c] + d;
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  shadows: {
    label: 'shadows / highlights',
    note: 'Two local tone curves driven by a blurred copy of the picture, so "is this a shadow" is answered by the region rather than the pixel. That is the whole difference between recovering a backlit face and just raising the black point.',
    params: {
      shadows: { min: -1, max: 1, step: 0.01, def: 0, label: 'shadows' },
      highlights: { min: -1, max: 1, step: 0.01, def: 0, label: 'highlights' },
      radius: { min: 5, max: 200, step: 1, def: 50, label: 'radius' },
    },
    apply(src, out, W, H, P) {
      if (!P.shadows && !P.highlights) return copy(src, out);
      const N = W * H;
      const lb = blurPlane(lumaPlane(src, N), W, H, P.radius / 2);
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const t = clamp01(lb[i] / 255);
        const ws = Math.pow(1 - t, 2), wh = Math.pow(t, 2);
        const k = 1 + P.shadows * ws * 1.6 - P.highlights * wh * 0.9;
        for (let c = 0; c < 3; c++) {
          const v = srgbToLinear(src[q + c]) * k;
          out[q + c] = linearToSrgb(v);
        }
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  median: {
    label: 'median',
    note: 'Replace every pixel with the median of its neighbourhood. Unlike a blur it removes speckle without moving edges — the median of a step is still a step — which is why it is the denoiser that does not turn a photograph into a painting, until you turn the radius up and it does.',
    params: {
      radius: { min: 0, max: 6, step: 1, def: 0, label: 'radius' },
      channel: { type: 'enum', options: ['rgb', 'luma'], def: 'rgb', label: 'on' },
    },
    apply(src, out, W, H, P) {
      const r = P.radius | 0;
      if (r <= 0) return copy(src, out);
      const buf = new Float32Array((2 * r + 1) * (2 * r + 1));
      for (let y = 0, q = 0; y < H; y++) {
        for (let x = 0; x < W; x++, q += 4) {
          if (P.channel === 'luma') {
            let n = 0;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const j = (clampi(y + dy, H) * W + clampi(x + dx, W)) * 4;
                buf[n++] = luma(src[j], src[j + 1], src[j + 2]);
              }
            }
            const med = medianOf(buf, n);
            const cur = luma(src[q], src[q + 1], src[q + 2]);
            const d = med - cur;
            for (let c = 0; c < 3; c++) out[q + c] = src[q + c] + d;
          } else {
            for (let c = 0; c < 3; c++) {
              let n = 0;
              for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                  buf[n++] = src[(clampi(y + dy, H) * W + clampi(x + dx, W)) * 4 + c];
                }
              }
              out[q + c] = medianOf(buf, n);
            }
          }
          out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  kuwahara: {
    label: 'oil paint (kuwahara)',
    note: 'For each pixel, look at four overlapping quadrants and take the mean of whichever has the least variance. Because it always copies from a *flat* neighbourhood it sharpens edges while flattening interiors — the reason this reads as brush strokes rather than as blur.',
    params: { radius: { min: 1, max: 8, step: 1, def: 3, label: 'brush' } },
    apply(src, out, W, H, P) {
      const r = Math.max(1, P.radius | 0);
      const quads = [[-r, 0, -r, 0], [0, r, -r, 0], [-r, 0, 0, r], [0, r, 0, r]];
      for (let y = 0, q = 0; y < H; y++) {
        for (let x = 0; x < W; x++, q += 4) {
          let best = Infinity, br = 0, bg = 0, bb = 0;
          for (const [x0, x1, y0, y1] of quads) {
            let sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0, n = 0;
            for (let dy = y0; dy <= y1; dy++) {
              for (let dx = x0; dx <= x1; dx++) {
                const j = (clampi(y + dy, H) * W + clampi(x + dx, W)) * 4;
                const l = luma(src[j], src[j + 1], src[j + 2]);
                sr += src[j]; sg += src[j + 1]; sb += src[j + 2];
                sl += l; sl2 += l * l; n++;
              }
            }
            const varr = sl2 / n - (sl / n) * (sl / n);
            if (varr < best) { best = varr; br = sr / n; bg = sg / n; bb = sb / n; }
          }
          out[q] = br; out[q + 1] = bg; out[q + 2] = bb; out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  edges: {
    label: 'edges',
    note: 'Sobel gradients. Outline shows their magnitude, emboss shows their component along a light direction, and "keep colour" multiplies the picture by the edge strength instead of replacing it — the ink-drawing look.',
    params: {
      mode: { type: 'enum', options: ['outline', 'emboss', 'keep colour'], def: 'outline', label: 'mode' },
      gain: { min: 0.1, max: 10, step: 0.1, def: 2, label: 'gain' },
      angle: { min: 0, max: 360, step: 1, def: 135, label: 'light angle' },
      invert: { type: 'bool', def: false, label: 'invert' },
    },
    apply(src, out, W, H, P) {
      const N = W * H;
      const l = lumaPlane(src, N);
      const rad = (P.angle * Math.PI) / 180;
      const lx = Math.cos(rad), ly = Math.sin(rad);
      for (let y = 0, q = 0; y < H; y++) {
        for (let x = 0; x < W; x++, q += 4) {
          const xm = clampi(x - 1, W), xp = clampi(x + 1, W);
          const ym = clampi(y - 1, H) * W, yp = clampi(y + 1, H) * W, yc = y * W;
          const gx = (l[ym + xp] + 2 * l[yc + xp] + l[yp + xp])
            - (l[ym + xm] + 2 * l[yc + xm] + l[yp + xm]);
          const gy = (l[yp + xm] + 2 * l[yp + x] + l[yp + xp])
            - (l[ym + xm] + 2 * l[ym + x] + l[ym + xp]);
          let v;
          if (P.mode === 'emboss') v = 128 + (gx * lx + gy * ly) * P.gain * 0.25;
          else v = Math.hypot(gx, gy) * P.gain * 0.25;
          if (P.invert) v = 255 - v;
          if (P.mode === 'keep colour') {
            const k = clamp01(v / 255);
            for (let c = 0; c < 3; c++) out[q + c] = src[q + c] * k;
          } else {
            out[q] = out[q + 1] = out[q + 2] = v;
          }
          out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  pixelate: {
    label: 'pixelate',
    note: 'Average over a cell and paint the cell flat. Circles keep the same averages but draw them as dots on the background colour, which is a mosaic rather than a downsample.',
    params: {
      size: { min: 2, max: 128, step: 1, def: 12, label: 'cell' },
      shape: { type: 'enum', options: ['square', 'circle'], def: 'square', label: 'shape' },
      gap: { min: 0, max: 0.6, step: 0.02, def: 0, label: 'gap' },
    },
    apply(src, out, W, H, P) {
      const s = Math.max(2, P.size | 0);
      const rad = (s / 2) * (1 - P.gap);
      for (let by = 0; by < H; by += s) {
        for (let bx = 0; bx < W; bx += s) {
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          const yEnd = Math.min(H, by + s), xEnd = Math.min(W, bx + s);
          for (let y = by; y < yEnd; y++) {
            for (let x = bx; x < xEnd; x++) {
              const j = (y * W + x) * 4;
              r += src[j]; g += src[j + 1]; b += src[j + 2]; a += src[j + 3]; n++;
            }
          }
          r /= n; g /= n; b /= n; a /= n;
          const cx = bx + s / 2, cy = by + s / 2;
          for (let y = by; y < yEnd; y++) {
            for (let x = bx; x < xEnd; x++) {
              const q = (y * W + x) * 4;
              const inside = P.shape === 'square'
                ? Math.abs(x + 0.5 - cx) <= rad && Math.abs(y + 0.5 - cy) <= rad
                : Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad;
              if (inside) { out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = a; }
              else { out[q] = 0; out[q + 1] = 0; out[q + 2] = 0; out[q + 3] = P.gap > 0 ? 0 : a; }
            }
          }
        }
      }
      return out;
    },
  },

  halftone: {
    label: 'halftone',
    note: 'A print screen: rotated dot grids whose dot area carries the tone. The four-colour mode uses the classic screen angles (15°, 75°, 0°, 45°) — chosen because those separations put the rosette where the eye reads it as texture rather than as moiré.',
    params: {
      mode: { type: 'enum', options: ['mono', 'cmyk'], def: 'mono', label: 'mode' },
      cell: { min: 2, max: 40, step: 0.5, def: 6, label: 'cell' },
      angle: { min: 0, max: 90, step: 1, def: 45, label: 'angle' },
      sharpness: { min: 0.2, max: 8, step: 0.1, def: 2, label: 'dot edge' },
      ink: { type: 'color', def: '#000000', label: 'ink (mono)' },
      paper: { type: 'color', def: '#ffffff', label: 'paper' },
    },
    apply(src, out, W, H, P) {
      const N = W * H;
      const [pr, pg, pb] = hexToRgb(P.paper);
      const [ir, ig, ib] = hexToRgb(P.ink);
      const screens = P.mode === 'mono'
        ? [{ a: P.angle, get: (q) => 1 - luma(src[q], src[q + 1], src[q + 2]) / 255, col: [ir, ig, ib] }]
        : [
          { a: 15, get: (q) => 1 - src[q] / 255, col: [0, 255, 255] },
          { a: 75, get: (q) => 1 - src[q + 1] / 255, col: [255, 0, 255] },
          { a: 0, get: (q) => 1 - src[q + 2] / 255, col: [255, 255, 0] },
        ];
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const x = i % W, y = (i / W) | 0;
        let r = pr, g = pg, b = pb;
        for (const s of screens) {
          const rad = (s.a * Math.PI) / 180;
          const u = (x * Math.cos(rad) + y * Math.sin(rad)) / P.cell;
          const v = (-x * Math.sin(rad) + y * Math.cos(rad)) / P.cell;
          const du = u - Math.floor(u) - 0.5, dv = v - Math.floor(v) - 0.5;
          const d = Math.hypot(du, dv);
          const t = s.get(q);
          // dot radius from tone: area ∝ tone, so radius ∝ √tone
          const rr = Math.sqrt(Math.max(0, t)) * 0.72;
          const cov = clamp01((rr - d) * P.sharpness * P.cell * 0.5 + 0.5) * (t > 0.002 ? 1 : 0);
          r = r * (1 - cov) + (s.col[0] * cov * (P.mode === 'mono' ? 1 : r / 255));
          g = g * (1 - cov) + (s.col[1] * cov * (P.mode === 'mono' ? 1 : g / 255));
          b = b * (1 - cov) + (s.col[2] * cov * (P.mode === 'mono' ? 1 : b / 255));
        }
        out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  dither: {
    label: 'dither',
    note: 'Quantise to a few levels and hide the error. Ordered uses a Bayer matrix — deterministic, tiling, the look of an old display; diffusion pushes each pixel\'s error onto its unvisited neighbours (Floyd–Steinberg), which resolves finer but is sequential, so its result depends on scan order by construction.',
    params: {
      mode: { type: 'enum', options: ['ordered', 'diffusion'], def: 'ordered', label: 'mode' },
      levels: { min: 2, max: 16, step: 1, def: 2, label: 'levels' },
      matrix: { type: 'enum', options: ['2', '4', '8'], def: '4', label: 'bayer size' },
      mono: { type: 'bool', def: false, label: 'monochrome' },
    },
    apply(src, out, W, H, P) {
      const N = W * H;
      const n = Math.max(2, P.levels | 0) - 1;
      const step = 255 / n;
      if (P.mode === 'ordered') {
        const size = parseInt(P.matrix, 10);
        const m = bayer(size);
        for (let i = 0, q = 0; i < N; i++, q += 4) {
          const x = i % W, y = (i / W) | 0;
          const t = (m[(y % size) * size + (x % size)] + 0.5) / (size * size) - 0.5;
          if (P.mono) {
            const v = luma(src[q], src[q + 1], src[q + 2]) + t * step;
            const o = Math.round(v / step) * step;
            out[q] = out[q + 1] = out[q + 2] = o;
          } else {
            for (let c = 0; c < 3; c++) out[q + c] = Math.round((src[q + c] + t * step) / step) * step;
          }
          out[q + 3] = src[q + 3];
        }
        return out;
      }
      const buf = new Float32Array(N * 3);
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        if (P.mono) { const l = luma(src[q], src[q + 1], src[q + 2]); buf[i * 3] = buf[i * 3 + 1] = buf[i * 3 + 2] = l; }
        else for (let c = 0; c < 3; c++) buf[i * 3 + c] = src[q + c];
      }
      const push = (i, c, e, w) => { if (i >= 0 && i < N) buf[i * 3 + c] += e * w; };
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          for (let c = 0; c < 3; c++) {
            const old = buf[i * 3 + c];
            const nv = Math.round(old / step) * step;
            buf[i * 3 + c] = nv;
            const e = old - nv;
            if (x + 1 < W) push(i + 1, c, e, 7 / 16);
            if (y + 1 < H) {
              if (x > 0) push(i + W - 1, c, e, 3 / 16);
              push(i + W, c, e, 5 / 16);
              if (x + 1 < W) push(i + W + 1, c, e, 1 / 16);
            }
          }
        }
      }
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        for (let c = 0; c < 3; c++) out[q + c] = buf[i * 3 + c];
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  grain: {
    label: 'grain',
    note: 'Seeded, so a grain you liked comes back. Film grain is strongest in the midtones and almost absent in blown highlights, and the midtone weighting here follows that — uniform noise reads as sensor noise, which is a different (and uglier) thing.',
    params: {
      amount: { min: 0, max: 1, step: 0.01, def: 0, label: 'amount' },
      size: { min: 1, max: 8, step: 0.5, def: 1, label: 'size' },
      chroma: { min: 0, max: 1, step: 0.01, def: 0, label: 'colour noise' },
      shadowBias: { type: 'bool', def: true, label: 'midtone weighted' },
    },
    apply(src, out, W, H, P, ctx) {
      if (P.amount <= 0) return copy(src, out);
      const N = W * H;
      const seed = (ctx?.seed ?? 1) >>> 0;
      const s = Math.max(1, P.size);
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const x = Math.floor((i % W) / s), y = Math.floor(((i / W) | 0) / s);
        const gi = y * Math.ceil(W / s) + x;
        const n = hashUnit(seed, gi) * 2 - 1;
        const l = luma(src[q], src[q + 1], src[q + 2]) / 255;
        const w = P.shadowBias ? 1 - Math.abs(l - 0.45) * 1.4 : 1;
        const k = P.amount * 64 * Math.max(0, w);
        for (let c = 0; c < 3; c++) {
          const cn = P.chroma > 0 ? (hashUnit(seed ^ (c + 1) * 0x9e3779b9, gi) * 2 - 1) : n;
          out[q + c] = src[q + c] + (n * (1 - P.chroma) + cn * P.chroma) * k;
        }
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  vignette: {
    label: 'vignette',
    note: 'Darken (or lighten) toward the corners. Roundness interpolates between a circle and the frame\'s own aspect, because a circular vignette on a wide crop darkens the short edges long before the corners.',
    params: {
      amount: { min: -1, max: 1, step: 0.01, def: 0, label: 'amount' },
      radius: { min: 0.1, max: 1.6, step: 0.01, def: 0.75, label: 'radius' },
      feather: { min: 0.01, max: 1.5, step: 0.01, def: 0.5, label: 'feather' },
      roundness: { min: 0, max: 1, step: 0.01, def: 1, label: 'roundness' },
      color: { type: 'color', def: '#000000', label: 'colour' },
    },
    apply(src, out, W, H, P) {
      if (P.amount === 0) return copy(src, out);
      const [vr, vg, vb] = hexToRgb(P.color);
      const N = W * H;
      // roundness 1 measures distance in a circle (x scaled by the aspect so a
      // wide frame's corners are the far points); roundness 0 measures it in
      // the frame's own rectangle, which reaches every corner at once.
      const ar = W / H;
      const kx = 1 + (ar - 1) * P.roundness;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const x = (i % W) / W - 0.5, y = ((i / W) | 0) / H - 0.5;
        // normalised so d = 1 exactly at the corners, whatever the aspect
        const d = Math.hypot(x * kx, y) / (0.5 * Math.hypot(kx, 1));
        const t = clamp01((d - P.radius) / P.feather);
        const k = t * Math.abs(P.amount);
        if (P.amount > 0) {
          for (let c = 0; c < 3; c++) out[q + c] = src[q + c] + ([vr, vg, vb][c] - src[q + c]) * k;
        } else {
          for (let c = 0; c < 3; c++) out[q + c] = src[q + c] + (255 - src[q + c]) * k;
        }
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  bloom: {
    label: 'bloom',
    note: 'Take what is brighter than the threshold, blur it wide, and add it back in linear light. Adding in linear is what makes it look like light spilling rather than like a white veil laid over the picture.',
    params: {
      threshold: { min: 0, max: 1, step: 0.01, def: 0.75, label: 'threshold' },
      radius: { min: 1, max: 120, step: 1, def: 24, label: 'spread' },
      strength: { min: 0, max: 2, step: 0.01, def: 0, label: 'strength' },
      tint: { type: 'color', def: '#ffffff', label: 'tint' },
    },
    apply(src, out, W, H, P) {
      if (P.strength <= 0) return copy(src, out);
      const N = W * H;
      const bright = new Uint8ClampedArray(src.length);
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const l = luma(src[q], src[q + 1], src[q + 2]) / 255;
        const k = clamp01((l - P.threshold) / Math.max(1e-4, 1 - P.threshold));
        bright[q] = src[q] * k; bright[q + 1] = src[q + 1] * k; bright[q + 2] = src[q + 2] * k;
        bright[q + 3] = 255;
      }
      const glow = new Uint8ClampedArray(src.length);
      blurRGBA(bright, W, H, P.radius / 2, glow);
      const [tr, tg, tb] = hexToRgb(P.tint);
      const tint = [tr / 255, tg / 255, tb / 255];
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        for (let c = 0; c < 3; c++) {
          const v = srgbToLinear(src[q + c]) + srgbToLinear(glow[q + c]) * P.strength * tint[c];
          out[q + c] = linearToSrgb(v);
        }
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  aberration: {
    label: 'chromatic aberration',
    note: 'Real lenses focus red and blue at slightly different magnifications, so the fringing grows from the centre outward — that is what "lateral" reproduces. The plain offset is the other kind: a flat channel shift, which is a printing error rather than an optical one.',
    params: {
      lateral: { min: -20, max: 20, step: 0.1, def: 0, label: 'lateral' },
      offset: { min: -20, max: 20, step: 0.1, def: 0, label: 'offset' },
      angle: { min: 0, max: 360, step: 1, def: 0, label: 'offset angle' },
    },
    apply(src, out, W, H, P) {
      if (!P.lateral && !P.offset) return copy(src, out);
      const cx = W / 2, cy = H / 2;
      const rad = (P.angle * Math.PI) / 180;
      const ox = Math.cos(rad) * P.offset, oy = Math.sin(rad) * P.offset;
      const unit = Math.max(W, H) / 2;
      const px = [0, 0, 0, 0];
      for (let y = 0, q = 0; y < H; y++) {
        for (let x = 0; x < W; x++, q += 4) {
          for (let c = 0; c < 3; c++) {
            const dir = c === 0 ? 1 : c === 2 ? -1 : 0;
            const k = 1 + (dir * P.lateral) / unit;
            const sx = cx + (x - cx) * k + dir * ox;
            const sy = cy + (y - cy) * k + dir * oy;
            sampleBilinear(src, W, H, sx, sy, px);
            out[q + c] = px[c];
          }
          out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },
};

// ─────────────────────────────────────────────────────────── internals ──

function boxRGBA(src, W, H, r, out) {
  if (r <= 0) { out.set(src); return out; }
  const N = W * H;
  const tmp = new Float32Array(N * 4);
  const win = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[(y * W + clampi(x, W)) * 4 + c];
      for (let x = 0; x < W; x++) {
        tmp[(y * W + x) * 4 + c] = acc / win;
        acc += src[(y * W + clampi(x + r + 1, W)) * 4 + c] - src[(y * W + clampi(x - r, W)) * 4 + c];
      }
    }
  }
  for (let x = 0; x < W; x++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[(clampi(y, H) * W + x) * 4 + c];
      for (let y = 0; y < H; y++) {
        out[(y * W + x) * 4 + c] = acc / win;
        acc += tmp[(clampi(y + r + 1, H) * W + x) * 4 + c] - tmp[(clampi(y - r, H) * W + x) * 4 + c];
      }
    }
  }
  return out;
}

function medianOf(buf, n) {
  const a = Array.prototype.slice.call(buf, 0, n).sort((x, y) => x - y);
  return a[n >> 1];
}

/** Bayer threshold matrix of the given power-of-two size. */
export function bayer(size) {
  let m = [0];
  let n = 1;
  while (n < size) {
    const next = new Array(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y * n + x] * 4;
        next[(y) * 2 * n + x] = v;
        next[(y) * 2 * n + x + n] = v + 2;
        next[(y + n) * 2 * n + x] = v + 3;
        next[(y + n) * 2 * n + x + n] = v + 1;
      }
    }
    m = next; n *= 2;
  }
  return m;
}
