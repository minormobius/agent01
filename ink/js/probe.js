// The interestingness engine: fluoddity's own, running headless.
//
// fluoddity/descriptors.js judges an organism by rasterising it and reading a
// 64^2 downsample — fill, blow-out, motion, and lag-1 spatial coherence — then
// folding those into fitness()/verdict(). We want the same judgement here, but
// we have no canvas during a probe and no time to make one.
//
// So we reproduce the DISPLAY SHADER instead. FRAG_DISPLAY is a pure function
// of the field: hue from flow direction, value from flow speed, then a
// gamma-ish normalise and an asinh soft-clip. Running it on the probe field
// (which is already 64^2 — no resampling) produces exactly the pixels
// readDescriptors would have read, so every constant in the rubric keeps its
// meaning. "alive", "boiling", "blown out" mean here what they mean there.
//
// The descriptor maths below is a verbatim port. Do not retune the thresholds
// to taste: the point of borrowing the rubric is that it is the SAME rubric.

import { InkSim } from './sim.js';
import { Rand } from './prng.js';

// The descriptor grid, as on fluoddity: readDescriptors always reads a 64^2
// downsample, whatever the source resolution.
export const PROBE = 64;

// The probe's FIELD resolution, which must equal the painting's. The deposit
// splat is a fixed 3x3 of cells, so its width relative to the sheet depends on
// the field size: probing at 64 and painting at 128 means probing a substrate
// where every agent's mark is twice as wide, and the rubric then certifies an
// organism you are not going to be shown. Same substrate, or the gate is a lie.
export const PROBE_FIELD = 128;
export const PROBE_AGENTS = 192;

const HSV_K = [1, 2 / 3, 1 / 3];
function hsv2rgb(h, s, v, out) {
  const k = HSV_K;
  for (let i = 0; i < 3; i++) {
    const f = (h + k[i]) - Math.floor(h + k[i]);
    const p = Math.abs(f * 6 - 3);
    const c = p - 1 < 0 ? 0 : p - 1 > 1 ? 1 : p - 1;
    out[i] = v * (1 + s * (c - 1));
  }
  return out;
}

// One frame of FRAG_DISPLAY, reduced to luminance — the pixel readDescriptors
// would have sampled. `ink` and `hue` are the genome's display parameters.
const _rgb = [0, 0, 0];
export function fieldLuminance(field, F, ink, hue, out) {
  const rgb = _rgb;
  for (let i = 0, p = 0; p < F * F; i += 2, p++) {
    const vx = field[i], vy = field[i + 1];
    const mag = Math.sqrt(vx * vx + vy * vy);
    const h = (Math.atan2(vy, vx) / (2 * Math.PI) + hue);
    hsv2rgb(h - Math.floor(h), 0.78, mag, rgb);
    let r = rgb[0] * ink * 8, g = rgb[1] * ink * 8, b = rgb[2] * ink * 8;
    const len = Math.sqrt(r * r + g * g + b * b);
    if (len > 0) { const d = Math.pow(len, 0.575); r /= d; g /= d; b /= d; }
    const L2 = Math.sqrt(r * r + g * g + b * b);
    if (L2 > 0) { const m = 2 * Math.asinh(L2 * 3.9) / (L2 * 3.9); r *= m; g *= m; b *= m; }
    // the canvas would have clamped to [0,1] before quantising to bytes
    r = r < 0 ? 0 : r > 1 ? 1 : r; g = g < 0 ? 0 : g > 1 ? 1 : g; b = b < 0 ? 0 : b > 1 ? 1 : b;
    out[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return out;
}

// Box-average an F^2 luminance grid down to PROBE^2 — the CPU equivalent of the
// drawImage downsample fluoddity's readDescriptors relies on.
export function downsample(src, F, out) {
  const n = F / PROBE;
  // Integer ratio only. A non-integral one (field 112 against a 64 grid) walks
  // the inner loop off the row and quietly produces NaN fitness for every
  // candidate — which reads exactly like "nothing is ever good enough" rather
  // than like a bug. Fail loudly instead.
  if (!Number.isInteger(n) || n < 1) throw new Error(`field ${F} must be a positive integer multiple of PROBE ${PROBE}`);
  const inv = 1 / (n * n);
  for (let y = 0; y < PROBE; y++) {
    for (let x = 0; x < PROBE; x++) {
      let acc = 0;
      for (let dy = 0; dy < n; dy++) {
        const row = (y * n + dy) * F + x * n;
        for (let dx = 0; dx < n; dx++) acc += src[row + dx];
      }
      out[y * PROBE + x] = acc * inv;
    }
  }
  return out;
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Verbatim from fluoddity/descriptors.js, reading a luminance array instead of
// ImageData. Same thresholds, same lag-1 Pearson coherence.
export function readDescriptors(lum, prevLum) {
  const N = PROBE * PROBE;
  let lit = 0, blown = 0, motion = 0;
  for (let p = 0; p < N; p++) {
    const L = lum[p];
    if (L > 0.06) lit++;
    if (L > 0.92) blown++;
    if (prevLum) motion += Math.abs(L - prevLum[p]);
  }
  let np = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = 0; y < PROBE; y++) {
    for (let x = 0; x < PROBE; x++) {
      const i = y * PROBE + x, a = lum[i];
      if (x + 1 < PROBE) { const b = lum[i + 1]; np++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
      if (y + 1 < PROBE) { const b = lum[i + PROBE]; np++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
    }
  }
  const denom = Math.sqrt((np * saa - sa * sa) * (np * sbb - sb * sb));
  const struct = denom > 1e-6 ? clamp01((np * sab - sa * sb) / denom) : 1;
  return { fill: lit / N, blowout: blown / N, motion: prevLum ? motion / N : 0, struct };
}

export const VIT_COLOR = {
  'settling…': '#8b909c', dead: '#b04a52', 'blown out': '#a8712f', frozen: '#9c8a2e',
  sparse: '#8d8f3a', boiling: '#b8562f', alive: '#2f7d6b',
};

export function verdict(v, warming) {
  if (warming) return 'settling…';
  if (v.fill < 0.012) return 'dead';
  if (v.blowout > 0.4) return 'blown out';
  if (v.motion < 0.0015 && v.fill > 0.03) return 'frozen';
  if (v.fill < 0.05) return 'sparse';
  if (v.struct < 0.5) return 'boiling';
  return 'alive';
}

function bump(x, lo, hi) { const c = (lo + hi) / 2, w = (hi - lo) / 2; const t = (x - c) / w; return Math.exp(-0.9 * t * t); }

export function fitness(v) {
  if (v.fill < 0.012) return 0;
  const fillT = bump(v.fill, 0.04, 0.55);
  const moveT = clamp01(v.motion / 0.003);
  const structT = v.struct * v.struct;
  const blowP = 1 - clamp01(v.blowout / 0.4);
  return fillT * (0.35 + 0.65 * moveT) * (0.2 + 0.8 * structT) * blowP;
}

// The two-snapshot fitness. A single frame is the most common lie a Fluoddity
// organism tells — it catches a transient mid-collapse and reads "alive". So we
// score the LATE snapshot and lift it only when motion was sustained from the
// early one to the late one.
export function fitness2(v1, v2) {
  const base = fitness(v2);
  if (!isFinite(base) || base <= 0) return base;
  const sustained = clamp01(v1.motion / 0.003) * clamp01(v2.motion / 0.003);
  return base * (0.85 + 0.15 * sustained);
}

// Block-density variation across the sheet. NOT used by the gate — kept because
// it is a recorded negative result, so the next person does not spend the
// afternoon I spent on it.
//
// The problem is real: fluoddity's rubric measures whether the ORGANISM is
// alive (coverage, motion, spatial coherence), which is the right question
// about a field and an incomplete one about a picture. Rendered and ranked by
// hand over a nine-sheet sample, the correlation with how good the sheet looked
// was poor in both directions — the top scorer (0.71) was a flat allover
// crosshatch, and one of the two most striking sheets scored 0.15.
//
// The obvious fix was to penalise an even wash: split the descriptor grid into
// 8x8 blocks and take the coefficient of variation of block density. It does
// not work. On that same sample it correctly marked one of the two flat sheets
// (CV 0.39) and badly misranked the other (CV 0.71 — HIGHER than three sheets
// ranked good), because a fine hairline mesh can carry plenty of large-scale
// density variation while every individual mark is characterless. Density
// variation is not composition.
//
// What would actually work is probably not a statistic at all. reef.mino.mobi
// already has the machinery: store votes, regenerate specimens client-side from
// (genome, seed), and fit a scorer to what people actually pick.
export function blockCV(lum) {
  const B = 8, n = PROBE / B;
  const means = [];
  for (let by = 0; by < B; by++) {
    for (let bx = 0; bx < B; bx++) {
      let acc = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) acc += lum[(by * n + y) * PROBE + bx * n + x];
      means.push(acc / (n * n));
    }
  }
  const m = means.reduce((a, c) => a + c, 0) / means.length;
  if (m < 1e-6) return 0;
  const varr = means.reduce((a, c) => a + (c - m) * (c - m), 0) / means.length;
  return Math.sqrt(varr) / m;
}

export function vec(v) { return [clamp01(v.fill / 0.5), clamp01(v.motion / 0.02), v.struct, clamp01(v.blowout)]; }
export function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

// Quantisation guard. Math.atan2 / Math.pow / Math.asinh / Math.exp are all
// implementation-approximated, and while none of them feeds the simulation,
// they do decide which candidate gets accepted — so a 1-ulp disagreement
// between engines could in principle flip a threshold and hand two people
// different paintings for the same ?s= seed. Rounding the score to 1e-6 puts
// ~1e-13 of accumulated float noise far below the decision granularity. The
// share button emits the accepted genomes explicitly (?g=), which needs no
// such argument; this only has to hold for the short seed form.
const q6 = (x) => Math.round(x * 1e6) / 1e6;

export const PROBE_STEPS = 120;
export const PROBE_T1 = 80;

// Reference exposure for scoring.
//
// fluoddity's rubric reads a rendered frame, so the genome's `ink` (a raw
// brightness multiplier in FRAG_DISPLAY) moves every descriptor: crank it and
// the whole sheet clears the 0.06 "lit" threshold, fill goes to 0.9, and the
// fitness bump — which wants 0.04..0.55 — reports a fine organism as garbage.
// There that is correct, because ink IS their display. Here it is not: `ink`
// sets how loaded the brushes start (see paper.js) and never touches what you
// see. Scoring at the genome's own exposure would therefore reject organisms
// for a rendering decision this surface doesn't make.
//
// So we score every candidate at a fixed exposure and a zero hue offset. The
// descriptors, thresholds, fitness and verdict are all still fluoddity's,
// unmodified — only the exposure the field is developed at is held constant, so
// the rubric measures the organism instead of the knob.
export const REF_INK = 0.9;

// Run one pair of genomes headlessly and return the rubric's reading of it.
export function probePair(pops, seed, opts = {}) {
  const steps = opts.steps || PROBE_STEPS;
  const t1 = opts.t1 || PROBE_T1;
  const F = opts.field || PROBE_FIELD;
  const sim = new InkSim({ field: F, agents: opts.agents || PROBE_AGENTS });
  sim.load(pops, new Rand(seed + '::ink'));
  const N = PROBE * PROBE;
  const a = new Float32Array(N), b = new Float32Array(N);
  const big = new Float32Array(F * F);
  const shot = (out) => downsample(fieldLuminance(sim.field, F, ink, hue, big), F, out);
  const ink = opts.ink || REF_INK, hue = 0;   // see REF_INK

  sim.step(t1 - 1); shot(a);
  sim.step(1);       shot(b);
  const v1 = readDescriptors(b, a);

  sim.step(steps - t1 - 1); shot(a);
  sim.step(1);              shot(b);
  const v2 = readDescriptors(b, a);

  return {
    v1, v2,
    fit: q6(fitness2(v1, v2)),
    verdict: verdict(v2, false),
    vv: vec(v2).map(q6),
  };
}
