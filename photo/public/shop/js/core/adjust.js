// adjust.js — the tonal and colour adjustments: the half of a darkroom that
// looks at one pixel at a time. Every entry here matches the registry contract
// `apply(src, out, W, H, P, ctx)` — read `src`, write `out`, never blend (the
// stack does that through the mask).
//
// THREE RULES THAT KEEP THESE HONEST
// ----------------------------------
// 1. **Identity is exact.** At its default parameters every adjustment must
//    return its input byte for byte. That is not politeness: an effect stack is
//    only editable if adding a layer and leaving it alone changes nothing, and
//    `shop.selftest.mjs` fails any entry that drifts.
// 2. **Light-like operations happen in light.** Exposure and gradient-map
//    interpolation run in linear light, where doubling the number really is
//    doubling the photons; contrast, levels and curves run on the encoded
//    values, because that is the space their controls were designed in and
//    where a mid-grey pivot means what a photographer expects.
// 3. **Alpha is not colour.** Nothing here touches the alpha channel. A
//    transparent pixel keeps its (meaningless) colour, so an adjustment layer
//    cannot manufacture edges out of transparency.

import {
  clamp01, clamp255, hexToRgb, hslToRgb, linearToSrgb, luma, rgbToHsl, srgbToLinear,
} from './pixels.js';

// ─────────────────────────────────────────────────────────────── curves ──

/**
 * A monotone cubic (Fritsch–Carlson) through the control points, sampled to a
 * 256-entry LUT. Monotone matters: an ordinary spline through a steep
 * shadow-lift point overshoots, and the overshoot shows up as a dark halo
 * inside bright areas — a curve tool that inverts locally is worse than none.
 */
export function curveLUT(points) {
  const pts = (points && points.length >= 2 ? points : [[0, 0], [1, 1]])
    .map((p) => [clamp01(p[0]), clamp01(p[1])])
    .sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i];
    d[i] = h > 1e-9 ? (ys[i + 1] - ys[i]) / h : 0;
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  const lut = new Uint8ClampedArray(256);
  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    if (h <= 1e-9) { lut[i] = clamp255(ys[seg] * 255); continue; }
    const t = clamp01((x - xs[seg]) / h);
    const t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[seg]
      + (t3 - 2 * t2 + t) * h * m[seg]
      + (-2 * t3 + 3 * t2) * ys[seg + 1]
      + (t3 - t2) * h * m[seg + 1];
    lut[i] = clamp255(y * 255);
  }
  return lut;
}

/** Run three channel LUTs (or one shared) over the picture. */
function applyLUT(src, out, N, lr, lg = lr, lb = lr) {
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    out[q] = lr[src[q]];
    out[q + 1] = lg[src[q + 1]];
    out[q + 2] = lb[src[q + 2]];
    out[q + 3] = src[q + 3];
  }
  return out;
}

const identityLUT = (() => {
  const l = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) l[i] = i;
  return l;
})();

// Hue families, for adjustments that target one band of colour. Centres in
// degrees; the weight falls off over half the gap to the neighbouring family,
// so the six bands sum to 1 everywhere and a saturation push cannot leave a
// seam between "reds" and "yellows".
const FAMILIES = {
  all: null, reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300,
};

function familyWeight(h, centre) {
  if (centre == null) return 1;
  let d = Math.abs(((h - centre + 540) % 360) - 180);
  d = 180 - d; // distance in degrees, 0 at the centre
  return d >= 60 ? 0 : Math.cos((d / 60) * (Math.PI / 2)) ** 2;
}

// ────────────────────────────────────────────────────────── the entries ──

export const ADJUSTMENTS = {

  exposure: {
    label: 'exposure',
    note: 'Stops of light, applied where light lives — linear — so +1 stop is exactly twice the photons and highlights roll the way the sensor would have recorded them. The offset is added after, in linear too, which is how you lift a black point without also lifting the whole curve.',
    params: {
      stops: { min: -5, max: 5, step: 0.01, def: 0, label: 'exposure (stops)' },
      offset: { min: -0.2, max: 0.2, step: 0.001, def: 0, label: 'offset' },
      gamma: { min: 0.2, max: 3, step: 0.01, def: 1, label: 'gamma' },
    },
    apply(src, out, W, H, P) {
      const g = Math.pow(2, P.stops);
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        let v = srgbToLinear(i) * g + P.offset;
        if (v < 0) v = 0;
        if (P.gamma !== 1) v = Math.pow(v, 1 / P.gamma);
        lut[i] = linearToSrgb(v);
      }
      return applyLUT(src, out, W * H, lut);
    },
  },

  levels: {
    label: 'levels',
    note: 'The four numbers every scan needs: where black starts, where white starts, the midtone gamma between them, and the output range they land in. Point the input black at the darkest pixel that should be black and the picture snaps into place — no curve required.',
    params: {
      channel: { type: 'enum', options: ['rgb', 'red', 'green', 'blue'], def: 'rgb', label: 'channel' },
      inLo: { min: 0, max: 1, step: 0.002, def: 0, label: 'input black' },
      inHi: { min: 0, max: 1, step: 0.002, def: 1, label: 'input white' },
      gamma: { min: 0.1, max: 5, step: 0.01, def: 1, label: 'gamma' },
      outLo: { min: 0, max: 1, step: 0.002, def: 0, label: 'output black' },
      outHi: { min: 0, max: 1, step: 0.002, def: 1, label: 'output white' },
    },
    apply(src, out, W, H, P) {
      const span = Math.max(1e-6, P.inHi - P.inLo);
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        let v = clamp01((i / 255 - P.inLo) / span);
        if (P.gamma !== 1) v = Math.pow(v, 1 / P.gamma);
        lut[i] = clamp255((P.outLo + v * (P.outHi - P.outLo)) * 255);
      }
      const c = P.channel;
      return applyLUT(src, out, W * H,
        c === 'rgb' || c === 'red' ? lut : identityLUT,
        c === 'rgb' || c === 'green' ? lut : identityLUT,
        c === 'rgb' || c === 'blue' ? lut : identityLUT);
    },
  },

  curves: {
    label: 'curves',
    note: 'Drag the line. Every other tonal control in this list is a curve with the shape chosen for you; this is the one where you choose it. Monotone interpolation, so a steep lift never overshoots into a halo.',
    params: {
      channel: { type: 'enum', options: ['rgb', 'red', 'green', 'blue'], def: 'rgb', label: 'channel' },
      curve: { type: 'curve', def: [[0, 0], [1, 1]], label: 'curve' },
    },
    apply(src, out, W, H, P) {
      const lut = curveLUT(P.curve);
      const c = P.channel;
      return applyLUT(src, out, W * H,
        c === 'rgb' || c === 'red' ? lut : identityLUT,
        c === 'rgb' || c === 'green' ? lut : identityLUT,
        c === 'rgb' || c === 'blue' ? lut : identityLUT);
    },
  },

  contrast: {
    label: 'brightness / contrast',
    note: 'Contrast pivots around the chosen mid-grey rather than around zero, so raising it darkens shadows and brightens highlights instead of just brightening everything.',
    params: {
      brightness: { min: -1, max: 1, step: 0.01, def: 0, label: 'brightness' },
      contrast: { min: -1, max: 1, step: 0.01, def: 0, label: 'contrast' },
      pivot: { min: 0.1, max: 0.9, step: 0.01, def: 0.5, label: 'pivot' },
    },
    apply(src, out, W, H, P) {
      // tan()-shaped so the slider stays useful at both ends: gentle near 0,
      // steep as it approaches 1, and never actually vertical.
      const k = Math.tan(((clamp01((P.contrast + 1) / 2)) * 0.9995 + 0.00025) * Math.PI / 2);
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        let v = i / 255 + P.brightness;
        v = (v - P.pivot) * k + P.pivot;
        lut[i] = clamp255(v * 255);
      }
      return applyLUT(src, out, W * H, lut);
    },
  },

  hsl: {
    label: 'hue / saturation',
    note: 'Rotate, saturate and lighten — optionally only one family of colours. The families overlap and their weights sum to one, so pushing "the reds" cannot leave a hard seam where red stops being red.',
    params: {
      range: { type: 'enum', options: Object.keys(FAMILIES), def: 'all', label: 'affect' },
      hue: { min: -180, max: 180, step: 1, def: 0, label: 'hue shift' },
      sat: { min: -1, max: 1, step: 0.01, def: 0, label: 'saturation' },
      light: { min: -1, max: 1, step: 0.01, def: 0, label: 'lightness' },
    },
    apply(src, out, W, H, P) {
      const centre = FAMILIES[P.range];
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const [h, s, l] = rgbToHsl(src[q], src[q + 1], src[q + 2]);
        const w = familyWeight(h, centre);
        if (w <= 0) {
          out[q] = src[q]; out[q + 1] = src[q + 1]; out[q + 2] = src[q + 2]; out[q + 3] = src[q + 3];
          continue;
        }
        const ns = clamp01(P.sat >= 0 ? s + (1 - s) * P.sat * w : s * (1 + P.sat * w));
        const nl = clamp01(P.light >= 0 ? l + (1 - l) * P.light * w : l * (1 + P.light * w));
        const [r, g, b] = hslToRgb(h + P.hue * w, ns, nl);
        out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  vibrance: {
    label: 'vibrance',
    note: 'Saturation that leaves the already-saturated alone: the push is scaled by (1 − s), so muted colours come up and a red jumper does not turn into a stop sign. Skin protection additionally holds back the orange band, where oversaturation reads instantly as wrong.',
    params: {
      amount: { min: -1, max: 1, step: 0.01, def: 0, label: 'vibrance' },
      skin: { type: 'bool', def: true, label: 'protect skin' },
    },
    apply(src, out, W, H, P) {
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const [h, s, l] = rgbToHsl(src[q], src[q + 1], src[q + 2]);
        let k = P.amount * (P.amount > 0 ? 1 - s : 1);
        if (P.skin && k > 0) k *= 1 - 0.7 * familyWeight(h, 30);
        const [r, g, b] = hslToRgb(h, clamp01(s + (1 - s) * k), l);
        out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  temperature: {
    label: 'temperature / tint',
    note: 'Warm–cool along blue↔amber and the perpendicular green↔magenta, applied in linear light and then renormalised to hold luminance — so correcting a cast does not also change the exposure.',
    params: {
      temp: { min: -1, max: 1, step: 0.01, def: 0, label: 'temperature' },
      tint: { min: -1, max: 1, step: 0.01, def: 0, label: 'tint' },
    },
    apply(src, out, W, H, P) {
      const kr = 1 + 0.35 * P.temp, kb = 1 - 0.35 * P.temp;
      const kg = 1 + 0.25 * P.tint, km = 1 - 0.12 * P.tint;
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const r0 = srgbToLinear(src[q]), g0 = srgbToLinear(src[q + 1]), b0 = srgbToLinear(src[q + 2]);
        let r = r0 * kr * km, g = g0 * kg, b = b0 * kb * km;
        const l0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
        const l1 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (l1 > 1e-6) { const s = l0 / l1; r *= s; g *= s; b *= s; }
        out[q] = linearToSrgb(r); out[q + 1] = linearToSrgb(g); out[q + 2] = linearToSrgb(b);
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  mixer: {
    label: 'channel mixer',
    note: 'Each output channel is a weighted sum of the three inputs. The identity is the diagonal; swapping two rows swaps two channels; the monochrome switch just makes all three rows equal.',
    params: {
      rr: { min: -2, max: 2, step: 0.01, def: 1, label: 'R ← R' },
      rg: { min: -2, max: 2, step: 0.01, def: 0, label: 'R ← G' },
      rb: { min: -2, max: 2, step: 0.01, def: 0, label: 'R ← B' },
      gr: { min: -2, max: 2, step: 0.01, def: 0, label: 'G ← R' },
      gg: { min: -2, max: 2, step: 0.01, def: 1, label: 'G ← G' },
      gb: { min: -2, max: 2, step: 0.01, def: 0, label: 'G ← B' },
      br: { min: -2, max: 2, step: 0.01, def: 0, label: 'B ← R' },
      bg: { min: -2, max: 2, step: 0.01, def: 0, label: 'B ← G' },
      bb: { min: -2, max: 2, step: 0.01, def: 1, label: 'B ← B' },
    },
    apply(src, out, W, H, P) {
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const r = src[q], g = src[q + 1], b = src[q + 2];
        out[q] = clamp255(P.rr * r + P.rg * g + P.rb * b);
        out[q + 1] = clamp255(P.gr * r + P.gg * g + P.gb * b);
        out[q + 2] = clamp255(P.br * r + P.bg * g + P.bb * b);
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  mono: {
    label: 'black & white',
    note: 'A film choice, not a desaturation: the three weights decide how loud each colour is in grey, which is the whole reason a red filter darkens a sky. They are renormalised to sum to one so the mix cannot change the overall brightness.',
    params: {
      r: { min: 0, max: 2, step: 0.01, def: 0.2126, label: 'red' },
      g: { min: 0, max: 2, step: 0.01, def: 0.7152, label: 'green' },
      b: { min: 0, max: 2, step: 0.01, def: 0.0722, label: 'blue' },
      tint: { type: 'color', def: '#ffffff', label: 'tint' },
      strength: { min: 0, max: 1, step: 0.01, def: 1, label: 'strength' },
    },
    apply(src, out, W, H, P) {
      const sum = P.r + P.g + P.b || 1;
      const wr = P.r / sum, wg = P.g / sum, wb = P.b / sum;
      const [tr, tg, tb] = hexToRgb(P.tint);
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const y = wr * src[q] + wg * src[q + 1] + wb * src[q + 2];
        const gr = (y * tr) / 255, gg = (y * tg) / 255, gb = (y * tb) / 255;
        out[q] = src[q] + (gr - src[q]) * P.strength;
        out[q + 1] = src[q + 1] + (gg - src[q + 1]) * P.strength;
        out[q + 2] = src[q + 2] + (gb - src[q + 2]) * P.strength;
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  gradientMap: {
    label: 'gradient map',
    note: 'Throw away the colours and re-map brightness onto a ramp of your own. Interpolated in linear light, so a two-colour ramp does not go muddy in the middle the way an sRGB lerp does.',
    params: {
      shadow: { type: 'color', def: '#000000', label: 'shadows' },
      mid: { type: 'color', def: '#808080', label: 'midtones' },
      high: { type: 'color', def: '#ffffff', label: 'highlights' },
      strength: { min: 0, max: 1, step: 0.01, def: 1, label: 'strength' },
    },
    apply(src, out, W, H, P) {
      const a = hexToRgb(P.shadow).map(srgbToLinear);
      const b = hexToRgb(P.mid).map(srgbToLinear);
      const c = hexToRgb(P.high).map(srgbToLinear);
      const lut = new Uint8ClampedArray(768);
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        for (let ch = 0; ch < 3; ch++) {
          const v = t < 0.5 ? a[ch] + (b[ch] - a[ch]) * (t * 2) : b[ch] + (c[ch] - b[ch]) * ((t - 0.5) * 2);
          lut[i * 3 + ch] = linearToSrgb(v);
        }
      }
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const y = Math.round(luma(src[q], src[q + 1], src[q + 2]));
        for (let ch = 0; ch < 3; ch++) {
          out[q + ch] = src[q + ch] + (lut[y * 3 + ch] - src[q + ch]) * P.strength;
        }
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  invert: {
    label: 'invert',
    note: 'The negative. Its own inverse, exactly — the selftest checks that applying it twice returns the original bytes.',
    params: { amount: { min: 0, max: 1, step: 0.01, def: 1, label: 'amount' } },
    apply(src, out, W, H, P) {
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        for (let c = 0; c < 3; c++) out[q + c] = src[q + c] + (255 - 2 * src[q + c]) * P.amount;
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  posterize: {
    label: 'posterize',
    note: 'Quantise each channel to a few levels. The endpoints are kept — 0 stays 0 and 255 stays 255 — so a two-level posterise is black and white rather than black and grey.',
    params: { levels: { min: 2, max: 64, step: 1, def: 6, label: 'levels' } },
    apply(src, out, W, H, P) {
      const n = Math.max(2, P.levels | 0);
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.round((i / 255) * (n - 1)) / (n - 1) * 255);
      return applyLUT(src, out, W * H, lut);
    },
  },

  threshold: {
    label: 'threshold',
    note: 'One cut through the brightness histogram. Softness widens the cut into a ramp, which is what makes it usable as a mask source rather than only as an effect.',
    params: {
      level: { min: 0, max: 1, step: 0.01, def: 0.5, label: 'level' },
      soft: { min: 0, max: 0.5, step: 0.01, def: 0, label: 'softness' },
    },
    apply(src, out, W, H, P) {
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        const y = luma(src[q], src[q + 1], src[q + 2]) / 255;
        const v = P.soft <= 0 ? (y >= P.level ? 255 : 0)
          : clamp01((y - (P.level - P.soft)) / (2 * P.soft)) * 255;
        out[q] = out[q + 1] = out[q + 2] = v;
        out[q + 3] = src[q + 3];
      }
      return out;
    },
  },

  solid: {
    label: 'solid colour',
    note: 'Flat colour over the whole layer, kept for the case that matters: with a mask, it is a paint bucket; with a blend mode, it is a photographic filter.',
    params: { color: { type: 'color', def: '#ff2e88', label: 'colour' } },
    apply(src, out, W, H, P) {
      const [r, g, b] = hexToRgb(P.color);
      const N = W * H;
      for (let i = 0, q = 0; i < N; i++, q += 4) {
        out[q] = r; out[q + 1] = g; out[q + 2] = b; out[q + 3] = src[q + 3];
      }
      return out;
    },
  },
};
