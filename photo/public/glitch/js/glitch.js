// glitch.js — the deterministic core: fields, operators, and the stack that
// runs them. DOM-free, so `photo/glitch.selftest.mjs` can prove under node that
// every operator is a pure function of (pixels, params, seed).
//
// THE TWO IDEAS THIS FILE IS BUILT ON
// -----------------------------------
// 1. SEEDED, NOT RANDOM. Nothing here calls Math.random(). Every "random"
//    decision comes from hashing (seed, op index, coordinate), so the same
//    recipe on the same photo always produces the same picture — bit for bit.
//    The seed becomes a steering wheel you can turn, not a slot machine.
//
// 2. WHERE IS SEPARATE FROM WHAT. Every operator is gated by a *field*: a 0..1
//    mask over the image, derived from the photo (luminance, edges), from
//    geometry (bands, radial, gradient), from seeded noise, or painted by hand.
//    That is what makes the glitch formable — "sort only the sky", "corrupt
//    only this band", "split channels only along hard edges" — instead of a
//    wall of sliders you shake until something lands.
//
// Operators are pure pixel maths, which is why they are testable and identical
// in every browser. The one genuinely codec-native operator, JPEG byte
// corruption, needs a real encoder and lives in codec.js; `unfilter` below is
// codec-native too but needs no encoder, because PNG's damage IS a predictor
// run backwards, and that is just arithmetic.

// ────────────────────────────────────────────────────────────── seeded ──

/** 32-bit string/number → uint32 seed. */
export function seedOf(s) {
  if (typeof s === 'number') return s >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Counter-based hash — the whole determinism story. Position-addressed rather
 * than stateful, so an operator can ask "what is the value at pixel i" in any
 * order, in any pass, and get the same answer.
 */
export function hash32(seed, a = 0, b = 0) {
  let h = (seed ^ Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x3b9dca3d) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform in [0,1) at a coordinate. */
export const rand = (seed, a = 0, b = 0) => hash32(seed, a, b) / 4294967296;

/** A stateful stream, for the places a sequence really is the natural shape. */
export function stream(seed) {
  let n = 0;
  return {
    next: () => rand(seed, n++, 0x9e37),
    int: (max) => Math.floor(rand(seed, n++, 0x85eb) * max),
    range: (lo, hi) => lo + rand(seed, n++, 0xc2b2) * (hi - lo),
  };
}

// value noise + fBm, both position-addressed
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const c = (i, j) => rand(seed, xi + i + 0x3f1, yi + j + 0x7a2);
  const a = c(0, 0), b = c(1, 0), d = c(0, 1), e = c(1, 1);
  return (a + (b - a) * xf) * (1 - yf) + (d + (e - d) * xf) * yf;
}
export function fbm(seed, x, y, octaves = 3) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    v += amp * vnoise(seed + o * 7919, x * f, y * f);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return v / norm;
}

// ─────────────────────────────────────────────────────────── the fields ──

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
/** soft threshold: 0 below lo, 1 above hi, smooth between */
const band = (v, lo, hi) => {
  if (hi <= lo) return v >= hi ? 1 : 0;
  return clamp01((v - lo) / (hi - lo));
};

export const FIELDS = {
  all: { label: 'everywhere', params: {} },
  luma: {
    label: 'by brightness',
    params: {
      lo: { min: 0, max: 1, step: 0.01, def: 0.35, label: 'from' },
      hi: { min: 0, max: 1, step: 0.01, def: 0.75, label: 'to' },
    },
  },
  edges: {
    label: 'along edges',
    params: {
      gain: { min: 0.2, max: 8, step: 0.1, def: 2.5, label: 'gain' },
      spread: { min: 0, max: 12, step: 1, def: 2, label: 'spread' },
    },
  },
  bands: {
    label: 'in bands',
    params: {
      count: { min: 1, max: 60, step: 1, def: 7, label: 'count' },
      duty: { min: 0.02, max: 1, step: 0.01, def: 0.4, label: 'width' },
      angle: { min: 0, max: 180, step: 1, def: 0, label: 'angle' },
      phase: { min: 0, max: 1, step: 0.01, def: 0, label: 'phase' },
      soft: { min: 0, max: 0.5, step: 0.01, def: 0.04, label: 'softness' },
    },
  },
  radial: {
    label: 'from a point',
    params: {
      cx: { min: 0, max: 1, step: 0.01, def: 0.5, label: 'x' },
      cy: { min: 0, max: 1, step: 0.01, def: 0.5, label: 'y' },
      radius: { min: 0.02, max: 1.4, step: 0.01, def: 0.45, label: 'radius' },
      feather: { min: 0.01, max: 1, step: 0.01, def: 0.3, label: 'feather' },
    },
  },
  gradient: {
    label: 'as a ramp',
    params: {
      angle: { min: 0, max: 360, step: 1, def: 90, label: 'angle' },
      lo: { min: 0, max: 1, step: 0.01, def: 0.1, label: 'from' },
      hi: { min: 0, max: 1, step: 0.01, def: 0.9, label: 'to' },
    },
  },
  noise: {
    label: 'in patches',
    params: {
      scale: { min: 1, max: 60, step: 0.5, def: 8, label: 'scale' },
      octaves: { min: 1, max: 5, step: 1, def: 3, label: 'detail' },
      lo: { min: 0, max: 1, step: 0.01, def: 0.4, label: 'from' },
      hi: { min: 0, max: 1, step: 0.01, def: 0.7, label: 'to' },
    },
  },
  paint: { label: 'where you painted', params: {} },
};

/**
 * Build the 0..1 gate for one operator. `paint` is the hand-painted layer (or
 * null); `invert` flips the field; `paintMul` multiplies any field by the
 * painted layer, which is how "only inside my brush strokes" composes with
 * "only along edges".
 */
export function makeField(spec, rgba, W, H, seed, paint = null) {
  const type = spec?.type || 'all';
  const P = spec?.params || {};
  const def = (k) => (P[k] !== undefined ? P[k] : FIELDS[type]?.params?.[k]?.def ?? 0);
  const N = W * H;
  const f = new Float32Array(N);

  if (type === 'all') {
    f.fill(1);
  } else if (type === 'luma') {
    const lo = def('lo'), hi = def('hi');
    for (let i = 0, q = 0; i < N; i++, q += 4) {
      const l = (0.2126 * rgba[q] + 0.7152 * rgba[q + 1] + 0.0722 * rgba[q + 2]) / 255;
      // a band, not a threshold: peaks inside [lo,hi] and falls off outside
      f[i] = l < lo ? band(l, lo - 0.12, lo) : l > hi ? 1 - band(l, hi, hi + 0.12) : 1;
    }
  } else if (type === 'edges') {
    const gain = def('gain'), spread = def('spread') | 0;
    const lum = new Float32Array(N);
    for (let i = 0, q = 0; i < N; i++, q += 4) {
      lum[i] = (0.2126 * rgba[q] + 0.7152 * rgba[q + 1] + 0.0722 * rgba[q + 2]) / 255;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x < W - 1 ? x + 1 : W - 1;
        const ym = y > 0 ? y - 1 : 0, yp = y < H - 1 ? y + 1 : H - 1;
        const gx = lum[y * W + xp] - lum[y * W + xm];
        const gy = lum[yp * W + x] - lum[ym * W + x];
        f[y * W + x] = clamp01(Math.hypot(gx, gy) * gain);
      }
    }
    if (spread > 0) blurField(f, W, H, spread);
  } else if (type === 'bands') {
    const count = def('count'), duty = def('duty'), soft = def('soft');
    const a = (def('angle') * Math.PI) / 180, phase = def('phase');
    const ca = Math.cos(a), sa = Math.sin(a);
    const span = Math.abs(W * ca) + Math.abs(H * sa) || 1;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        const u = ((x * ca + y * sa) / span * count + phase) % 1;
        const t = u < 0 ? u + 1 : u;
        f[i] = soft <= 0
          ? (t < duty ? 1 : 0)
          : Math.min(band(t, -soft, soft) * (1 - band(t, duty - soft, duty + soft)), 1);
      }
    }
  } else if (type === 'radial') {
    const cx = def('cx') * W, cy = def('cy') * H;
    const r = def('radius') * Math.max(W, H) * 0.5, fe = Math.max(1e-4, def('feather')) * r;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) f[i] = 1 - band(Math.hypot(x - cx, y - cy), r - fe, r + fe);
    }
  } else if (type === 'gradient') {
    const a = (def('angle') * Math.PI) / 180, lo = def('lo'), hi = def('hi');
    const ca = Math.cos(a), sa = Math.sin(a);
    const span = Math.abs(W * ca) + Math.abs(H * sa) || 1;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        f[i] = band(Math.abs((x * ca + y * sa) / span), Math.min(lo, hi), Math.max(lo, hi));
      }
    }
  } else if (type === 'noise') {
    const s = def('scale'), oct = def('octaves') | 0, lo = def('lo'), hi = def('hi');
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        const v = fbm(seed ^ 0x5bf03635, (x / W) * s, (y / H) * s, oct);
        f[i] = band(v, Math.min(lo, hi), Math.max(lo, hi));
      }
    }
  } else if (type === 'paint') {
    if (paint) f.set(paint); else f.fill(0);
  } else {
    f.fill(1);
  }

  if (spec?.invert) for (let i = 0; i < N; i++) f[i] = 1 - f[i];
  if (spec?.paintMul && paint && type !== 'paint') for (let i = 0; i < N; i++) f[i] *= paint[i];
  return f;
}

/** separable box blur over a scalar field, used to spread the edge mask */
function blurField(f, W, H, r) {
  const tmp = new Float32Array(f.length);
  const win = r * 2 + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += f[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / win;
      acc -= f[y * W + Math.min(W - 1, Math.max(0, x - r))];
      acc += f[y * W + Math.min(W - 1, Math.max(0, x + r + 1))];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      f[y * W + x] = acc / win;
      acc -= tmp[Math.min(H - 1, Math.max(0, y - r)) * W + x];
      acc += tmp[Math.min(H - 1, Math.max(0, y + r + 1)) * W + x];
    }
  }
}

// ───────────────────────────────────────────────────────────── helpers ──

const lumaAt = (d, q) => 0.2126 * d[q] + 0.7152 * d[q + 1] + 0.0722 * d[q + 2];

function sampleWrap(src, W, H, x, y, dst, di) {
  const xi = ((x % W) + W) % W, yi = ((y % H) + H) % H;
  const si = (yi * W + xi) * 4;
  dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
}
function sampleClamp(src, W, H, x, y, dst, di) {
  const xi = x < 0 ? 0 : x >= W ? W - 1 : x, yi = y < 0 ? 0 : y >= H ? H - 1 : y;
  const si = ((yi | 0) * W + (xi | 0)) * 4;
  dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
}

// RGB ↔ YIQ, for the analogue-television operators
const rgb2yiq = (r, g, b) => [
  0.299 * r + 0.587 * g + 0.114 * b,
  0.5959 * r - 0.2746 * g - 0.3213 * b,
  0.2115 * r - 0.5227 * g + 0.3112 * b,
];
const yiq2rgb = (y, i, q) => [
  y + 0.956 * i + 0.619 * q,
  y - 0.272 * i - 0.647 * q,
  y - 1.106 * i + 1.703 * q,
];

// ─────────────────────────────────────────────────────── the operators ──
//
// Each operator is `apply(src, out, W, H, P, ctx)`: read `src`, write `out`.
// The stack does the masked blend afterwards, so an operator never has to
// think about its own field — though several read `ctx.mask` anyway, because
// for them the mask means "where the interval is", not "how strong".

export const OPS = {

  sort: {
    label: 'pixel sort',
    note: 'Sorts runs of pixels. The classic: the mask says where a run may start and end, so the sort follows the picture instead of shredding it.',
    params: {
      axis: { type: 'enum', options: ['rows', 'columns'], def: 'rows', label: 'along' },
      key: { type: 'enum', options: ['brightness', 'hue', 'saturation', 'red', 'green', 'blue'], def: 'brightness', label: 'sort by' },
      lo: { min: 0, max: 1, step: 0.01, def: 0.25, label: 'threshold from' },
      hi: { min: 0, max: 1, step: 0.01, def: 0.8, label: 'threshold to' },
      maxRun: { min: 4, max: 600, step: 4, def: 220, label: 'longest run' },
      reverse: { type: 'bool', def: false, label: 'reverse' },
      byMask: { type: 'bool', def: false, label: 'intervals from mask' },
    },
    apply(src, out, W, H, P, ctx) {
      out.set(src);
      const N = W * H;
      const key = new Float32Array(N);
      for (let i = 0, q = 0; i < N; i++, q += 4) key[i] = sortKey(src, q, P.key);
      const rows = P.axis === 'rows';
      const outer = rows ? H : W, inner = rows ? W : H;
      const idx = new Int32Array(inner);
      const order = new Int32Array(inner);
      for (let o = 0; o < outer; o++) {
        let runStart = -1;
        for (let s = 0; s <= inner; s++) {
          const i = s < inner ? (rows ? o * W + s : s * W + o) : -1;
          const inRun = i >= 0 && (P.byMask
            ? ctx.mask[i] > 0.5
            : key[i] >= P.lo && key[i] <= P.hi);
          if (inRun && runStart < 0) runStart = s;
          const tooLong = runStart >= 0 && s - runStart >= P.maxRun;
          if ((!inRun || tooLong) && runStart >= 0) {
            sortRun(src, out, key, idx, order, rows, o, W, runStart, s, P.reverse);
            runStart = inRun && tooLong ? s : -1;
          }
        }
      }
      return out;
    },
  },

  unfilter: {
    label: 'png predictor',
    note: 'PNG stores each scanline as a prediction. Declare the wrong predictor and the decoder integrates the error down the image — the classic smear. This is exactly what a decoder does with a databent PNG, so it is the real artefact, not an imitation.',
    params: {
      mode: { type: 'enum', options: ['sub', 'up', 'average', 'paeth', 'mixed'], def: 'up', label: 'predictor' },
      rate: { min: 0, max: 1, step: 0.01, def: 0.35, label: 'lines affected' },
      bleed: { min: 0, max: 1, step: 0.01, def: 0.75, label: 'carry' },
    },
    apply(src, out, W, H, P, ctx) {
      out.set(src);
      const pick = (line) => (P.mode !== 'mixed' ? P.mode
        : ['sub', 'up', 'average', 'paeth'][hash32(ctx.seed, line, 0x1f7) & 3]);
      const carry = P.bleed;
      // horizontal predictors run along a row, vertical ones down a column
      for (let y = 0; y < H; y++) {
        const mode = pick(y);
        if (mode === 'sub' || mode === 'average' || mode === 'paeth') {
          if (rand(ctx.seed, y, 0x51ed) > P.rate) continue;
          for (let c = 0; c < 3; c++) {
            let prev = out[y * W * 4 + c];
            for (let x = 1; x < W; x++) {
              const q = (y * W + x) * 4 + c;
              const up = y > 0 ? out[((y - 1) * W + x) * 4 + c] : 0;
              const pred = mode === 'sub' ? prev
                : mode === 'average' ? (prev + up) / 2
                  : paeth(prev, up, y > 0 ? out[((y - 1) * W + x - 1) * 4 + c] : 0);
              const v = (src[q] + carry * pred) % 256;
              out[q] = v < 0 ? v + 256 : v;
              prev = out[q];
            }
          }
        } else {
          if (y === 0 || rand(ctx.seed, y, 0x51ed) > P.rate) continue;
          for (let x = 0; x < W; x++) {
            for (let c = 0; c < 3; c++) {
              const q = (y * W + x) * 4 + c;
              const v = (src[q] + carry * out[((y - 1) * W + x) * 4 + c]) % 256;
              out[q] = v < 0 ? v + 256 : v;
            }
          }
        }
      }
      return out;
    },
  },

  shift: {
    label: 'channel split',
    note: 'Displaces the colour channels against each other — the chromatic fringe that says "something went wrong in the signal path".',
    params: {
      spread: { min: 0, max: 80, step: 0.5, def: 8, label: 'spread' },
      angle: { min: 0, max: 360, step: 1, def: 0, label: 'angle' },
      curve: { min: -1, max: 1, step: 0.05, def: 0, label: 'green pull' },
      wrap: { type: 'bool', def: false, label: 'wrap edges' },
    },
    apply(src, out, W, H, P) {
      const a = (P.angle * Math.PI) / 180;
      const dx = Math.cos(a) * P.spread, dy = Math.sin(a) * P.spread;
      const offs = [[dx, dy], [dx * P.curve, dy * P.curve], [-dx, -dy]];
      const px = new Uint8ClampedArray(4);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const q = i * 4;
          for (let c = 0; c < 3; c++) {
            const sx = Math.round(x + offs[c][0]), sy = Math.round(y + offs[c][1]);
            (P.wrap ? sampleWrap : sampleClamp)(src, W, H, sx, sy, px, 0);
            out[q + c] = px[c];
          }
          out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  slice: {
    label: 'slice shift',
    note: 'Cuts the image into slices and slides them. Sizes and offsets come from the seed, so the same seed always shears the same way.',
    params: {
      axis: { type: 'enum', options: ['rows', 'columns'], def: 'rows', label: 'slice' },
      count: { min: 2, max: 200, step: 1, def: 26, label: 'slices' },
      shift: { min: 0, max: 300, step: 1, def: 40, label: 'max shift' },
      bias: { min: -1, max: 1, step: 0.05, def: 0, label: 'direction bias' },
      wrap: { type: 'bool', def: true, label: 'wrap edges' },
    },
    apply(src, out, W, H, P, ctx) {
      const rows = P.axis === 'rows';
      const span = rows ? H : W;
      const px = new Uint8ClampedArray(4);
      // slice boundaries from the seed: uneven, but the same every run
      const edges = [0];
      for (let i = 1; i < P.count; i++) {
        edges.push(Math.round(span * (i / P.count + (rand(ctx.seed, i, 0x2b7) - 0.5) * (0.7 / P.count))));
      }
      edges.push(span);
      const shiftOf = new Int32Array(span);
      for (let s = 0; s < P.count; s++) {
        const amt = Math.round(((rand(ctx.seed, s, 0x91a) * 2 - 1) + P.bias) * P.shift);
        for (let k = Math.max(0, edges[s]); k < Math.min(span, edges[s + 1]); k++) shiftOf[k] = amt;
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d = rows ? shiftOf[y] : shiftOf[x];
          const sx = rows ? x + d : x, sy = rows ? y : y + d;
          (P.wrap ? sampleWrap : sampleClamp)(src, W, H, sx, sy, px, 0);
          const q = (y * W + x) * 4;
          out[q] = px[0]; out[q + 1] = px[1]; out[q + 2] = px[2]; out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  stride: {
    label: 'wrong stride',
    note: 'Reads the pixel buffer with the wrong row length or the wrong bytes per pixel — the diagonal shear and rainbow drift you get from a mangled header.',
    params: {
      skew: { min: -8, max: 8, step: 0.05, def: 1, label: 'bytes per row off' },
      roll: { min: 0, max: 3, step: 1, def: 0, label: 'channel roll' },
      start: { min: 0, max: 1, step: 0.01, def: 0, label: 'start offset' },
    },
    apply(src, out, W, H, P) {
      const px = new Uint8ClampedArray(4);
      const off0 = Math.round(P.start * W);
      for (let y = 0; y < H; y++) {
        const d = Math.round(y * P.skew) + off0;
        for (let x = 0; x < W; x++) {
          sampleWrap(src, W, H, x + d, y, px, 0);
          const q = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) out[q + c] = px[(c + P.roll) % 3];
          out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  blocks: {
    label: 'compression damage',
    note: 'Real 8×8 DCT: transform, wreck the coefficients, transform back. Gives honest JPEG blocking and ringing — and unlike a real encoder, you choose which blocks suffer.',
    params: {
      quality: { min: 1, max: 100, step: 1, def: 18, label: 'quality' },
      damage: { min: 0, max: 1, step: 0.01, def: 0.25, label: 'blocks hit' },
      mode: { type: 'enum', options: ['coarsen', 'drop high', 'shuffle', 'dc drift'], def: 'dc drift', label: 'failure' },
      drift: { min: 0, max: 200, step: 1, def: 60, label: 'drift' },
    },
    apply(src, out, W, H, P, ctx) {
      out.set(src);
      const q0 = Math.max(1, (101 - P.quality) / 2);
      const blk = new Float32Array(64), co = new Float32Array(64);
      const bw = Math.ceil(W / 8), bh = Math.ceil(H / 8);
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          const hit = rand(ctx.seed, by * bw + bx, 0x77d) < P.damage;
          for (let c = 0; c < 3; c++) {
            for (let j = 0; j < 8; j++) {
              for (let i = 0; i < 8; i++) {
                const x = Math.min(W - 1, bx * 8 + i), y = Math.min(H - 1, by * 8 + j);
                blk[j * 8 + i] = src[(y * W + x) * 4 + c] - 128;
              }
            }
            dct8x8(blk, co);
            for (let k = 0; k < 64; k++) {
              const u = k & 7, v = k >> 3;
              const step = q0 * (1 + (u + v) * 0.6);
              co[k] = Math.round(co[k] / step) * step;             // always quantise
              if (!hit) continue;
              if (P.mode === 'drop high' && u + v > 2) co[k] = 0;
              else if (P.mode === 'shuffle' && k > 0) {
                const j2 = 1 + (hash32(ctx.seed, by * bw + bx, k) % 63);
                const t = co[k]; co[k] = co[j2]; co[j2] = t;
              } else if (P.mode === 'dc drift' && k === 0) {
                co[0] += (rand(ctx.seed, by * bw + bx, c) * 2 - 1) * P.drift;
              } else if (P.mode === 'coarsen') {
                co[k] = Math.round(co[k] / (step * 6)) * step * 6;
              }
            }
            idct8x8(co, blk);
            for (let j = 0; j < 8; j++) {
              for (let i = 0; i < 8; i++) {
                const x = bx * 8 + i, y = by * 8 + j;
                if (x >= W || y >= H) continue;
                out[(y * W + x) * 4 + c] = blk[j * 8 + i] + 128;
              }
            }
          }
        }
      }
      return out;
    },
  },

  bits: {
    label: 'bit plane',
    note: 'Images are numbers. Flip one bit of every one of them and the low planes turn to sand while the high planes tear the picture into posterised continents.',
    params: {
      plane: { min: 0, max: 7, step: 1, def: 6, label: 'plane' },
      mode: { type: 'enum', options: ['xor', 'zero', 'set', 'roll'], def: 'xor', label: 'do' },
      channel: { type: 'enum', options: ['all', 'red', 'green', 'blue'], def: 'all', label: 'channel' },
      grain: { min: 0, max: 1, step: 0.01, def: 0, label: 'scatter' },
    },
    apply(src, out, W, H, P, ctx) {
      out.set(src);
      const bit = 1 << P.plane;
      const first = P.channel === 'all' ? 0 : { red: 0, green: 1, blue: 2 }[P.channel];
      const last = P.channel === 'all' ? 2 : first;
      for (let i = 0, q = 0; i < W * H; i++, q += 4) {
        if (P.grain > 0 && rand(ctx.seed, i, 0x3ca) > 1 - P.grain) continue;
        for (let c = first; c <= last; c++) {
          const v = src[q + c];
          out[q + c] = P.mode === 'xor' ? v ^ bit
            : P.mode === 'zero' ? v & ~bit
              : P.mode === 'set' ? v | bit
                : ((v << 1) | (v >> 7)) & 255;
        }
      }
      return out;
    },
  },

  ntsc: {
    label: 'composite video',
    note: 'Encodes the picture onto an analogue colour subcarrier and decodes it wrong. Luma leaks into chroma as rainbow moiré, chroma leaks into luma as dot crawl — the artefacts of broadcast television, from first principles.',
    params: {
      phase: { min: -180, max: 180, step: 1, def: 25, label: 'phase error' },
      drift: { min: -20, max: 20, step: 0.5, def: 4, label: 'drift per line' },
      lumaBW: { min: 0, max: 12, step: 1, def: 2, label: 'luma filter' },
      chromaBW: { min: 1, max: 30, step: 1, def: 9, label: 'chroma filter' },
      crosstalk: { min: 0, max: 2, step: 0.05, def: 1, label: 'crosstalk' },
    },
    apply(src, out, W, H, P) {
      const fsc = 0.25;                       // subcarrier: quarter the sample rate
      const comp = new Float32Array(W);
      const iC = new Float32Array(W), qC = new Float32Array(W), yC = new Float32Array(W);
      for (let y = 0; y < H; y++) {
        const linePhase = ((y * P.drift) * Math.PI) / 180;
        for (let x = 0; x < W; x++) {
          const q = (y * W + x) * 4;
          const [Y, I, Q] = rgb2yiq(src[q], src[q + 1], src[q + 2]);
          const ph = 2 * Math.PI * fsc * x + linePhase;
          comp[x] = Y + P.crosstalk * (I * Math.cos(ph) + Q * Math.sin(ph));
        }
        // decode with the wrong reference phase
        const err = (P.phase * Math.PI) / 180;
        for (let x = 0; x < W; x++) {
          const ph = 2 * Math.PI * fsc * x + linePhase + err;
          iC[x] = 2 * comp[x] * Math.cos(ph);
          qC[x] = 2 * comp[x] * Math.sin(ph);
          yC[x] = comp[x];
        }
        boxRow(iC, P.chromaBW); boxRow(qC, P.chromaBW);
        if (P.lumaBW > 0) boxRow(yC, P.lumaBW);   // imperfect notch → dot crawl survives
        for (let x = 0; x < W; x++) {
          const [r, g, b] = yiq2rgb(yC[x], iC[x], qC[x]);
          const q = (y * W + x) * 4;
          out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  vhs: {
    label: 'tape damage',
    note: 'Tracking error: rows wander with vertical coherence, colour lags behind brightness, the head switch tears the bottom of the frame, and dropouts leave streaks.',
    params: {
      jitter: { min: 0, max: 60, step: 0.5, def: 8, label: 'tracking' },
      coherence: { min: 0, max: 40, step: 1, def: 8, label: 'coherence' },
      chromaLag: { min: 0, max: 40, step: 1, def: 6, label: 'colour lag' },
      headSwitch: { min: 0, max: 0.3, step: 0.005, def: 0.04, label: 'head switch' },
      dropouts: { min: 0, max: 1, step: 0.01, def: 0.15, label: 'dropouts' },
    },
    apply(src, out, W, H, P, ctx) {
      const rowShift = new Float32Array(H);
      for (let y = 0; y < H; y++) rowShift[y] = (rand(ctx.seed, y, 0x4d2) * 2 - 1) * P.jitter;
      if (P.coherence > 0) {
        const s = new Float32Array(H);
        const r = P.coherence | 0;
        for (let y = 0; y < H; y++) {
          let acc = 0, n = 0;
          for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { acc += rowShift[yy]; n++; } }
          s[y] = acc / n;
        }
        rowShift.set(s);
      }
      const sw = Math.max(0, H - Math.round(P.headSwitch * H));
      const px = new Uint8ClampedArray(4), px2 = new Uint8ClampedArray(4);
      for (let y = 0; y < H; y++) {
        let d = rowShift[y];
        if (y >= sw) d += (1 - (y - sw) / Math.max(1, H - sw)) * -60 + rand(ctx.seed, y, 0x9f) * 40;
        const drop = P.dropouts > 0 && rand(ctx.seed, y, 0xa11) < P.dropouts * 0.25;
        const dropX = drop ? Math.floor(rand(ctx.seed, y, 0xb22) * W) : -1;
        const dropLen = drop ? 10 + Math.floor(rand(ctx.seed, y, 0xc33) * W * 0.3) : 0;
        for (let x = 0; x < W; x++) {
          const q = (y * W + x) * 4;
          sampleClamp(src, W, H, Math.round(x + d), y, px, 0);
          sampleClamp(src, W, H, Math.round(x + d - P.chromaLag), y, px2, 0);
          const [Y] = rgb2yiq(px[0], px[1], px[2]);
          const [, I, Q] = rgb2yiq(px2[0], px2[1], px2[2]);
          let [r, g, b] = yiq2rgb(Y, I, Q);
          if (dropX >= 0 && x >= dropX && x < dropX + dropLen) {
            const n = rand(ctx.seed, y * W + x, 0xd44) * 255;
            r = g = b = n * 0.7 + 60;
          }
          out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  mosh: {
    label: 'datamosh',
    note: 'A still has no motion vectors, so we invent them from the picture and apply them over and over — the same runaway prediction that makes a moshed video bloom.',
    params: {
      steps: { min: 1, max: 24, step: 1, def: 7, label: 'iterations' },
      strength: { min: 0, max: 24, step: 0.5, def: 5, label: 'step size' },
      swirl: { min: -1, max: 1, step: 0.05, def: 0.6, label: 'swirl' },
      block: { min: 1, max: 32, step: 1, def: 8, label: 'block size' },
      decay: { min: 0, max: 1, step: 0.05, def: 0.85, label: 'decay' },
    },
    apply(src, out, W, H, P, ctx) {
      // motion field: image gradient, optionally rotated — blocky like macroblocks
      const bw = Math.ceil(W / P.block), bh = Math.ceil(H / P.block);
      const vx = new Float32Array(bw * bh), vy = new Float32Array(bw * bh);
      const at = (x, y) => lumaAt(src, ((y < 0 ? 0 : y >= H ? H - 1 : y) * W + (x < 0 ? 0 : x >= W ? W - 1 : x)) * 4);
      const s = Math.sin(P.swirl * Math.PI / 2), c = Math.cos(P.swirl * Math.PI / 2);
      const mag = new Float32Array(vx.length);
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          const x = bx * P.block + (P.block >> 1), y = by * P.block + (P.block >> 1);
          const gx = at(x + 1, y) - at(x - 1, y);
          const gy = at(x, y + 1) - at(x, y - 1);
          const k = by * bw + bx;
          vx[k] = gx * c - gy * s;
          vy[k] = gx * s + gy * c;
          mag[k] = Math.hypot(vx[k], vy[k]);
        }
      }
      // Normalise on a high percentile, not the maximum: one specular highlight
      // must not decide that the rest of the photograph barely moves. `step
      // size` is then honestly in pixels for most of the frame.
      const sorted = Array.from(mag).sort((a, b) => a - b);
      const ref = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] || 1;
      for (let k = 0; k < vx.length; k++) {
        const lim = 1.6;
        vx[k] = Math.max(-lim, Math.min(lim, vx[k] / ref));
        vy[k] = Math.max(-lim, Math.min(lim, vy[k] / ref));
      }
      let a = new Uint8ClampedArray(src), b = new Uint8ClampedArray(src.length);
      const px = new Uint8ClampedArray(4);
      let amp = P.strength;
      for (let step = 0; step < P.steps; step++) {
        for (let y = 0; y < H; y++) {
          const by = Math.min(bh - 1, (y / P.block) | 0);
          for (let x = 0; x < W; x++) {
            const bx = Math.min(bw - 1, (x / P.block) | 0);
            const k = by * bw + bx;
            sampleWrap(a, W, H, Math.round(x - vx[k] * amp), Math.round(y - vy[k] * amp), px, 0);
            const q = (y * W + x) * 4;
            b[q] = px[0]; b[q + 1] = px[1]; b[q + 2] = px[2]; b[q + 3] = a[q + 3];
          }
        }
        const t = a; a = b; b = t;
        amp *= P.decay;
      }
      out.set(a);
      void ctx;
      return out;
    },
  },

  posterize: {
    label: 'palette collapse',
    note: 'Too few colours and an ordered dither — the look of a display that cannot afford your photograph.',
    params: {
      levels: { min: 2, max: 32, step: 1, def: 4, label: 'levels' },
      dither: { min: 0, max: 1, step: 0.05, def: 0.7, label: 'dither' },
      matrix: { type: 'enum', options: ['4×4', '8×8', '2×2'], def: '4×4', label: 'matrix' },
      palette: { type: 'enum', options: ['none', 'gameboy', 'cga', 'mono', 'teletext'], def: 'none', label: 'palette' },
    },
    apply(src, out, W, H, P) {
      const M = P.matrix === '2×2' ? BAYER2 : P.matrix === '8×8' ? BAYER8 : BAYER4;
      const n = Math.sqrt(M.length) | 0;
      const pal = PALETTES[P.palette];
      const step = 255 / (P.levels - 1);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const q = i * 4;
          const t = (M[(y % n) * n + (x % n)] / (n * n) - 0.5) * step * P.dither;
          if (pal) {
            let best = 0, bd = Infinity;
            for (let k = 0; k < pal.length; k++) {
              const d = (src[q] + t - pal[k][0]) ** 2 + (src[q + 1] + t - pal[k][1]) ** 2 + (src[q + 2] + t - pal[k][2]) ** 2;
              if (d < bd) { bd = d; best = k; }
            }
            out[q] = pal[best][0]; out[q + 1] = pal[best][1]; out[q + 2] = pal[best][2];
          } else {
            for (let c = 0; c < 3; c++) out[q + c] = Math.round((src[q + c] + t) / step) * step;
          }
          out[q + 3] = src[q + 3];
        }
      }
      return out;
    },
  },

  echo: {
    label: 'ghosting',
    note: 'Multipath: the same picture arriving again, late and faint, the way a signal does when it bounces.',
    params: {
      taps: { min: 1, max: 8, step: 1, def: 3, label: 'ghosts' },
      delay: { min: 1, max: 200, step: 1, def: 26, label: 'delay' },
      decay: { min: 0.05, max: 0.95, step: 0.05, def: 0.55, label: 'decay' },
      angle: { min: 0, max: 360, step: 1, def: 0, label: 'angle' },
    },
    apply(src, out, W, H, P) {
      out.set(src);
      const a = (P.angle * Math.PI) / 180;
      const px = new Uint8ClampedArray(4);
      for (let t = 1; t <= P.taps; t++) {
        const w = Math.pow(P.decay, t);
        const dx = Math.round(Math.cos(a) * P.delay * t), dy = Math.round(Math.sin(a) * P.delay * t);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            sampleClamp(src, W, H, x - dx, y - dy, px, 0);
            const q = (y * W + x) * 4;
            for (let c = 0; c < 3; c++) out[q + c] = out[q + c] + px[c] * w * 0.6;
          }
        }
      }
      return out;
    },
  },
};

// ─────────────────────────────────────────────────── operator internals ──

function sortKey(d, q, key) {
  const r = d[q] / 255, g = d[q + 1] / 255, b = d[q + 2] / 255;
  if (key === 'red') return r;
  if (key === 'green') return g;
  if (key === 'blue') return b;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (key === 'saturation') return max === 0 ? 0 : (max - min) / max;
  if (key === 'hue') {
    if (max === min) return 0;
    const d2 = max - min;
    let h = max === r ? (g - b) / d2 % 6 : max === g ? (b - r) / d2 + 2 : (r - g) / d2 + 4;
    h /= 6;
    return h < 0 ? h + 1 : h;
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sortRun(src, out, key, idx, order, rows, o, W, from, to, reverse) {
  const n = to - from;
  if (n < 2) return;
  for (let k = 0; k < n; k++) idx[k] = from + k;
  const slice = Array.prototype.slice.call(idx, 0, n);
  slice.sort((a, b) => {
    const ia = rows ? o * W + a : a * W + o;
    const ib = rows ? o * W + b : b * W + o;
    return key[ia] - key[ib];
  });
  if (reverse) slice.reverse();
  for (let k = 0; k < n; k++) {
    const dst = rows ? o * W + (from + k) : (from + k) * W + o;
    const s = rows ? o * W + slice[k] : slice[k] * W + o;
    out[dst * 4] = src[s * 4];
    out[dst * 4 + 1] = src[s * 4 + 1];
    out[dst * 4 + 2] = src[s * 4 + 2];
    out[dst * 4 + 3] = src[s * 4 + 3];
  }
  void order;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function boxRow(row, r) {
  if (r < 1) return;
  const n = row.length, tmp = new Float32Array(n);
  let acc = 0;
  for (let x = -r; x <= r; x++) acc += row[Math.min(n - 1, Math.max(0, x))];
  const win = 2 * r + 1;
  for (let x = 0; x < n; x++) {
    tmp[x] = acc / win;
    acc -= row[Math.min(n - 1, Math.max(0, x - r))];
    acc += row[Math.min(n - 1, Math.max(0, x + r + 1))];
  }
  row.set(tmp);
}

const COS = (() => {
  const t = new Float32Array(64);
  for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) t[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  return t;
})();
const CU = (u) => (u === 0 ? Math.SQRT1_2 : 1);

export function dct8x8(inp, outp) {
  const tmp = new Float32Array(64);
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += inp[y * 8 + x] * COS[u * 8 + x];
      tmp[y * 8 + u] = 0.5 * CU(u) * s;
    }
  }
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[v * 8 + y];
      outp[v * 8 + u] = 0.5 * CU(v) * s;
    }
  }
  return outp;
}

export function idct8x8(inp, outp) {
  const tmp = new Float32Array(64);
  for (let v = 0; v < 8; v++) {
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += CU(u) * inp[v * 8 + u] * COS[u * 8 + x];
      tmp[v * 8 + x] = 0.5 * s;
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += CU(v) * tmp[v * 8 + x] * COS[v * 8 + y];
      outp[y * 8 + x] = 0.5 * s;
    }
  }
  return outp;
}

const BAYER2 = [0, 2, 3, 1];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER8 = (() => {
  const m = new Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let v = 0, mask = 4;
      for (let bit = 0; bit < 3; bit++, mask >>= 1) {
        const bx = (x & mask) ? 1 : 0, by = (y & mask) ? 1 : 0;
        v = (v << 2) | ((bx ^ by) * 2 + by);
      }
      m[y * 8 + x] = v;
    }
  }
  return m;
})();

const PALETTES = {
  none: null,
  gameboy: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]],
  cga: [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]],
  mono: [[0, 0, 0], [255, 255, 255]],
  teletext: [[0, 0, 0], [255, 0, 0], [0, 255, 0], [255, 255, 0],
    [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]],
};

// ───────────────────────────────────────────────────────────── the stack ──

/**
 * Add an operator from outside this file. codec.js uses it to register the
 * JPEG databender, which needs a real encoder and so cannot be pure — it is
 * marked `async` and carries `run()` instead of `apply()`. Everything else in
 * the system (defaults, fields, recipes, the UI) then treats it like any other
 * operator, which is the point.
 */
export function registerOp(id, spec) {
  OPS[id] = spec;
  return spec;
}

/** Default parameter block for an operator, straight from its schema. */
export function defaults(opId) {
  const spec = OPS[opId];
  const P = {};
  for (const [k, d] of Object.entries(spec.params)) P[k] = d.def;
  return P;
}

export function defaultField(type = 'all') {
  const P = {};
  for (const [k, d] of Object.entries(FIELDS[type].params)) P[k] = d.def;
  return { type, params: P, invert: false, paintMul: false };
}

/** A fresh stack entry. */
export function makeLayer(opId) {
  return { op: opId, on: true, amount: 1, seed: 0, field: defaultField('all'), params: defaults(opId) };
}

/**
 * A layer's seed: derived from the recipe seed AND the layer's position, so
 * two copies of one operator in a stack don't glitch in lockstep, and its own
 * `seed` nudge lets you reroll a single layer without disturbing the others.
 */
export const seedFor = (base, index, layerSeed = 0) =>
  (base ^ hash32(base, index + 1, layerSeed | 0)) >>> 0;

/** The gate for one layer, given the pixels it is about to act on. */
export const fieldFor = (layer, cur, W, H, seed, paint) =>
  makeField(layer.field, cur, W, H, seed, paint);

/**
 * Blend an operator's output back over its input through the mask. This one
 * function is what "where is separate from what" means: every operator, pure
 * or codec-native, is confined by the same rule, and outside the mask the
 * source survives byte for byte.
 */
export function blend(cur, next, mask, amount, N) {
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    const m = mask[i] * amount;
    if (m >= 1) {
      cur[q] = next[q]; cur[q + 1] = next[q + 1]; cur[q + 2] = next[q + 2];
    } else if (m > 0) {
      cur[q] = lerp(cur[q], next[q], m);
      cur[q + 1] = lerp(cur[q + 1], next[q + 1], m);
      cur[q + 2] = lerp(cur[q + 2], next[q + 2], m);
    }
  }
  return cur;
}

/** Run one pure layer in place. Returns the mask it used, for callers that care. */
export function applyLayer(cur, W, H, layer, seed, paint = null, scratch = null) {
  const spec = OPS[layer.op];
  if (!spec || spec.async) return null;
  const N = W * H;
  const out = scratch || new Uint8ClampedArray(N * 4);
  const mask = fieldFor(layer, cur, W, H, seed, paint);
  const P = { ...defaults(layer.op), ...layer.params };
  out.set(cur);
  spec.apply(cur, out, W, H, P, { seed, mask, index: 0 });
  blend(cur, out, mask, layer.amount ?? 1, N);
  return mask;
}

/**
 * Run a recipe over an image. Pure: same (rgba, recipe, paint) in, same bytes
 * out, every time, in any engine. Operators marked `async` (the codec-native
 * ones, which need a real encoder) are skipped here and noted in the log — the
 * app drives those itself; see codec.js.
 */
export function render(rgba, W, H, recipe, { paint = null, onStep = null } = {}) {
  const N = W * H;
  const cur = new Uint8ClampedArray(rgba);
  const scratch = new Uint8ClampedArray(N * 4);
  const base = seedOf(recipe.seed ?? 'glitch');
  const log = [];

  (recipe.ops || []).forEach((layer, index) => {
    const spec = OPS[layer.op];
    if (!spec) return;
    if (!layer.on) { log.push({ op: layer.op, ms: 0, skipped: 'off' }); return; }
    if (spec.async) { log.push({ op: layer.op, ms: 0, skipped: 'async' }); return; }
    const t0 = now();
    applyLayer(cur, W, H, layer, seedFor(base, index, layer.seed), paint, scratch);
    log.push({ op: layer.op, ms: now() - t0 });
    if (onStep) onStep(index, layer.op);
  });

  return { rgba: cur, width: W, height: H, log };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

// ──────────────────────────────────────────────────────────── the recipe ──
//
// An output nobody can reproduce is a slot machine, not a tool. The recipe is
// the whole state of the machine — ops, params, fields, seed — and it round
// trips through a URL-safe string.

export const RECIPE_VERSION = 1;

export function normalise(recipe) {
  return {
    v: RECIPE_VERSION,
    seed: String(recipe.seed ?? 'glitch'),
    ops: (recipe.ops || []).filter((l) => OPS[l.op]).map((l) => ({
      op: l.op,
      on: l.on !== false,
      amount: clamp01(l.amount ?? 1),
      seed: l.seed | 0,
      field: {
        type: FIELDS[l.field?.type] ? l.field.type : 'all',
        params: { ...(l.field?.params || {}) },
        invert: !!l.field?.invert,
        paintMul: !!l.field?.paintMul,
      },
      params: { ...defaults(l.op), ...(l.params || {}) },
    })),
  };
}

const b64u = {
  enc: (s) => btoaImpl(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => atobImpl(s.replace(/-/g, '+').replace(/_/g, '/')),
};
const btoaImpl = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'));
const atobImpl = (s) => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'));

export function encodeRecipe(recipe) {
  const json = JSON.stringify(normalise(recipe));
  let bin = '';
  for (const ch of unescape(encodeURIComponent(json))) bin += ch;
  return b64u.enc(bin);
}

export function decodeRecipe(str) {
  const json = decodeURIComponent(escape(b64u.dec(str)));
  return normalise(JSON.parse(json));
}
