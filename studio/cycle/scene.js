// scene.js — a colour-cycling landscape, generated. Pure: node and browser.
//
// The technique is 8-bit colour cycling (Mark Ferrari's painted scenes; Joseph Huckaby's Canvas
// Cycle): every pixel holds an INDEX into a 256-colour palette, never a colour. Nothing is ever
// redrawn. The picture moves because ranges of the palette rotate, and it changes hour by hour
// because the palette is re-lit. So the index map is the artwork, and what an index means is
// chosen by what it should DO:
//
//   - water is painted in PHASE: a waterfall's index is its row modulo the cycle, so rotating
//     the cycle pours it; a lake's is a wobbling band, so it shimmers; smoke's rises.
//   - rock is painted in FACING: each face's index is the direction it turns to (left … right),
//     and the palette lights the faces that turn toward the sun, so the shadows swing across
//     the mountains as the day goes, from one painted image.
//   - the sky holds the SUN'S PATH: the day's real track (for the date, the place and the way the
//     painting faces) painted as a row of small discs, one palette entry each, each resting at the
//     sky's colour. The palette lights the disc where the sun is, so it crosses and sets behind the
//     range; the lake has glitter columns, lit under wherever the sun or moon stands.
//   - the stars and the moon are REAL (astro.js), drawn where they are at that moment, over the
//     sky pixels only; fireflies and the window are entries only the night lights.
//
// generate(seed) → { W, H, index (Uint8Array), entries (256 descriptions), cycles, … }
// paintSunPath(scene, view, ms) paints the day's track; palette(scene, view, sky, t, flares) →
// Uint8ClampedArray(256 × 3), lit and rotated for that moment. A still is a function of
// (seed, view, moment, t). view = { lat, lon, facing }.

import { forecast, weatherLight, lightning } from './weather.js';
import { generateCoast } from './coast.js';

export const W = 640, H = 360;

// ------------------------------------------------------------------------- numbers --
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash2 = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** Smooth value noise in 1D and 2D, and fractal sums of it. */
export function noise1(x, s) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash2(i, 0, s), hash2(i + 1, 0, s), u);
}
export function noise2(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(i, j, s), hash2(i + 1, j, s), u), lerp(hash2(i, j + 1, s), hash2(i + 1, j + 1, s), u), v);
}
export const fbm1 = (x, s, o = 5) => { let a = 0, w = 0.5, f = 1; for (let k = 0; k < o; k++) { a += w * noise1(x * f, s + k * 17); w *= 0.5; f *= 2.03; } return a / (1 - Math.pow(0.5, o)); };
export const fbm2 = (x, y, s, o = 5) => { let a = 0, w = 0.5, f = 1; for (let k = 0; k < o; k++) { a += w * noise2(x * f, y * f, s + k * 31); w *= 0.5; f *= 2.01; } return a / (1 - Math.pow(0.5, o)); };
/** Ridged: sharp crests, the shape of a mountain range. */
export const ridge1 = (x, s, o = 5) => { let a = 0, w = 0.5, f = 1; for (let k = 0; k < o; k++) { const n = 1 - Math.abs(noise1(x * f, s + k * 13) * 2 - 1); a += w * n * n; w *= 0.5; f *= 2.1; } return a / (1 - Math.pow(0.5, o)); };

/** Rock: ridged 2D noise, a height field of crests and gullies. */
export const rock = (x, y, s) => { let a = 0, w = 0.5, f = 1; for (let k = 0; k < 4; k++) { const n = 1 - Math.abs(noise2(x * f, y * f, s + k * 7) * 2 - 1); a += w * n; w *= 0.5; f *= 2.2; } return a / 0.9375; };

// 4×4 ordered dither: how a gradient is spread over a ramp's few colours, the old way
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const dq = (v, n, x, y) => Math.min(n - 1, Math.max(0, Math.floor(clamp(v) * (n - 1) + BAYER[(y & 3) * 4 + (x & 3)])));

// ------------------------------------------------------------------------- biomes --
// albedos (linear-ish 0..1), and a hue turn for the sky
export const BIOMES = {
  alpine:  { far: [0.42, 0.46, 0.56], mid: [0.30, 0.38, 0.33], cliff: [0.48, 0.44, 0.40], ground: [0.30, 0.42, 0.20], pine: [0.10, 0.24, 0.15], water: [0.05, 0.16, 0.20], snow: true, wall: [0.45, 0.30, 0.20], roof: [0.30, 0.18, 0.14], skyTurn: 0 },
  canyon:  { far: [0.62, 0.42, 0.34], mid: [0.66, 0.36, 0.22], cliff: [0.72, 0.40, 0.24], ground: [0.55, 0.40, 0.26], pine: [0.18, 0.26, 0.14], water: [0.04, 0.20, 0.22], snow: false, mesa: true, wall: [0.62, 0.48, 0.34], roof: [0.38, 0.22, 0.16], skyTurn: 0 },
  autumn:  { far: [0.46, 0.44, 0.52], mid: [0.52, 0.32, 0.18], cliff: [0.44, 0.40, 0.36], ground: [0.56, 0.36, 0.14], pine: [0.12, 0.20, 0.12], water: [0.06, 0.13, 0.17], snow: true, wall: [0.42, 0.28, 0.20], roof: [0.48, 0.16, 0.12], skyTurn: 0 },
  alien:   { far: [0.40, 0.30, 0.52], mid: [0.22, 0.40, 0.44], cliff: [0.36, 0.26, 0.46], ground: [0.16, 0.36, 0.40], pine: [0.30, 0.10, 0.30], water: [0.20, 0.06, 0.18], snow: true, wall: [0.30, 0.34, 0.40], roof: [0.18, 0.26, 0.30], skyTurn: 2.2 },
};

// ------------------------------------------------------------------------- the scene --
/**
 * A blank canvas for a painting: the index map, what each pixel is (`layer`), the palette entries
 * and the cycles, and the small tools to fill them. Shared by the lake (generate) and the coast.
 */
export function canvas() {
  const index = new Uint8Array(W * H), layer = new Uint8Array(W * H), entries = [], cycles = [];
  return {
    index, layer, entries, cycles,
    alloc: (n, make) => { const lo = entries.length; for (let i = 0; i < n; i++) entries.push(make(i, n)); return lo; },
    cycle: (lo, len, beats, name) => cycles.push({ lo, len, perBeat: beats, name }),
    set: (x, y, i, l) => { if (x >= 0 && x < W && y >= 0 && y < H) { index[y * W + x] = i; layer[y * W + x] = l; } },
  };
}

/**
 * The sky down to the horizon `yH`: a gradient ramp, the sun's path (its discs, placed by
 * paintSunPath for the day) and clouds. The stars and the moon are not painted: they are real, and
 * drawn where they are (night.js). Returns the slots and the ramp's curve.
 */
export function paintSky(cv, yH, S, cloudiness, LAYER) {
  const { alloc, set } = cv;
  const SKY = 20;
  const sky = alloc(SKY, (i, n) => ({ k: 'sky', e: i / (n - 1) }));
  const NB = 60, NH = 15;                                   // discs on the path; glitter columns
  const elevAt = (y) => Math.pow(clamp((yH - y) / yH), 0.8);   // the sky ramp's own curve
  const core = alloc(NB, (i) => ({ k: 'sun', b: i, e: 0.5, x: -99, y: -99, ms: 0 }));
  // clouds: three height bands of six shades, each knowing the sky behind it so a clear day can fade
  // it away; the band boundaries are ordered-dithered (two hard bands left a straight line across
  // every cloud where they met)
  const CL = 6, CB = [0.38, 0.6, 0.82];
  const clouds = alloc(CL * CB.length, (i) => ({ k: 'cloud', s: (i % CL) / (CL - 1), e: CB[Math.floor(i / CL)] }));
  for (let y = 0; y < yH; y++) for (let x = 0; x < W; x++) {
    const e = elevAt(y);
    const id = sky + dq(e, SKY, x, y);
    // clouds: a stretched fbm, lit from above (their tops brighter than their bellies)
    const cs = 1 / 90, d0 = fbm2(x * cs * 0.45, y * cs * 1.6, S + 11, 5);
    const band = smooth(0.2, 0.5, e) * smooth(1.0, 0.75, e);
    const thr = 0.66 - cloudiness * 0.3;
    if (band > 0.01 && d0 > thr + (1 - band) * 0.4 + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.025) {
      // lit from above: brighter where the density climbs going down (a top), darker in the belly
      const above = fbm2(x * cs * 0.45, (y - 6) * cs * 1.6, S + 11, 5);
      const s = clamp(0.4 + (d0 - above) * 9 + (d0 - thr) * 2.2 - smooth(0, 1, (y - yH * 0.2) / yH) * 0.15);
      const band = Math.max(0, Math.min(CB.length - 1, Math.floor((e - CB[0]) / (CB[1] - CB[0]) + BAYER[((y + 2) & 3) * 4 + ((x + 1) & 3)])));
      set(x, y, clouds + band * CL + dq(s, CL, x, y), LAYER.cloud); continue;
    }
    set(x, y, id, LAYER.sky);
  }
  return { sky, core, clouds, NB, NH, elevAt };
}

/** A scene of either kind: 'lake' (the first: a lake under a waterfall) or 'coast' (coast.js). */
export function generate(seed = 1, kind = 'lake') {
  return kind === 'coast' ? generateCoast(seed) : generateLake(seed);
}

function generateLake(seed = 1) {
  const rnd = mulberry32(seed * 9973 + 17);
  const S = (seed * 131) % 100000;
  const biomeName = Object.keys(BIOMES)[Math.floor(rnd() * 4)];
  const B = BIOMES[biomeName];
  const LAYER = { sky: 0, far: 1, snow: 2, mid: 3, cliff: 4, fall: 5, tree: 6, cloud: 7, ground: 8, lake: 9, cabin: 10 };
  const cv = canvas(), { index, layer, entries, cycles, alloc, cycle, set } = cv;

  const bpm = 48 + Math.floor(rnd() * 18);
  const yH = Math.round(H * (0.6 + rnd() * 0.06));         // the lake's far shore: the horizon line
  const cliffLeft = rnd() < 0.5;
  const cloudiness = 0.1 + rnd() * 0.32;
  const fireflies = rnd() < 0.8;

  const { core, NB, NH, elevAt } = paintSky(cv, yH, S, cloudiness, LAYER);

  // ---- three ranges of land, far to near: each face indexed by which way it turns
  const facing = (alb, depth, name, n = 8) => alloc(n, (i, nn) => ({ k: 'land', alb, nx: (i / (nn - 1)) * 2 - 1, depth, name }));
  const far = facing(B.far, 0.7, 'far'), mid = facing(B.mid, 0.38, 'mid'), cliff = facing(B.cliff, 0.12, 'cliff');
  const snow = B.snow ? facing([0.92, 0.94, 1.0], 0.62, 'snow', 6) : -1;
  const FAC = 8;
  function range(lo, top, amp, scale, s, lay, tex, opts = {}) {
    const hgt = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let h = ridge1(x * scale, s);
      if (opts.mesa) { const v = fbm1(x * scale * 0.8, s) * 3.2, k = Math.floor(v); h = (k + smooth(0.75, 1, v - k)) / 3.2 + fbm1(x * scale * 6, s + 3) * 0.05; }
      hgt[x] = top + amp * h;
    }
    for (let x = 0; x < W; x++) {
      const slope = (hgt[Math.min(W - 1, x + 2)] - hgt[Math.max(0, x - 2)]) / 4;
      for (let y = Math.max(0, Math.floor(yH - hgt[x])); y < yH; y++) {
        // facing: the ridge's slope near the crest, then the faces of a rock height field (ridges
        // running down from the crest), so the range breaks into planes that turn to the light
        const below = y - (yH - hgt[x]);
        const f = (u, v) => rock(u * tex, v * tex * (opts.mesa ? 2.6 : 0.75), s + 50);
        const grad = (f(x + 1, y) - f(x - 1, y)) * (opts.mesa ? 1.6 : 2.4) / tex / 2 * tex;
        let nx = clamp(slope * 2.4 * Math.exp(-below / 30) + grad * 9, -1, 1);
        if (opts.mesa) nx = clamp(nx * 0.7 + (Math.floor(below / 10 + fbm1(x * 0.02, s + 9) * 2) % 2 ? 0.3 : -0.3), -1, 1);
        let id = lo + dq((nx + 1) / 2, FAC, x, y), l = lay;
        if (opts.snow >= 0 && hgt[x] > opts.snowLine && below < opts.snowDepth * (0.3 + 1.2 * fbm2(x * 0.03, y * 0.02, s + 70, 3)) * (0.6 + 0.8 * clamp((hgt[x] - opts.snowLine) / 30)) + Math.max(0, f(x, y) - 0.55) * 60) {
          id = opts.snow + dq((nx + 1) / 2, 6, x, y); l = LAYER.snow;
        }
        set(x, y, id, l);
      }
    }
    return hgt;
  }
  const farTop = H * (0.12 + rnd() * 0.1);
  range(far, H * 0.12, farTop, 1 / (130 + rnd() * 60), S + 100, LAYER.far, 0.035,
    { mesa: B.mesa, snow: snow, snowDepth: 26, snowLine: H * 0.16 });
  range(mid, H * 0.05, H * 0.09 + rnd() * H * 0.05, 1 / (80 + rnd() * 40), S + 200, LAYER.mid, 0.05, { mesa: B.mesa, snow: -1 });

  // ---- the cliff, with the waterfall down its face
  const cw = W * (0.3 + rnd() * 0.1);
  const cliffTop = H * (0.2 + rnd() * 0.1);
  const xw = cw * (0.55 + rnd() * 0.15), ww = 14 + rnd() * 12;
  const toX = (u) => (cliffLeft ? u : W - 1 - u);       // cliff-side coordinates → screen
  const cliffTopAt = new Float32Array(W);
  for (let u = 0; u < W; u++) {
    const edge = smooth(cw * 0.75, cw * 1.12, u);         // the cliff's inner shoulder falls to the lake
    const notch = Math.exp(-Math.pow((u - xw) / (ww * 0.9), 2)) * 10;
    cliffTopAt[u] = lerp(cliffTop + fbm1(u * 0.03, S + 300) * 22 + notch, yH + 4, edge);
  }
  for (let u = 0; u < cw * 1.15; u++) {
    const x = toX(u);
    for (let y = Math.floor(cliffTopAt[u]); y < yH; y++) {
      const g = (rock((u + 1) * 0.045, y * 0.016, S + 310) - rock((u - 1) * 0.045, y * 0.016, S + 310)) * 11;
      const shoulder = smooth(cw * 0.7, cw * 1.1, u) * 0.8;
      const block = (Math.floor(y / 14 + fbm1(u * 0.04, S + 320) * 3) % 3 === 0) ? 0.25 : 0;
      const nx = clamp((g + shoulder + block) * (cliffLeft ? 1 : -1), -1, 1);
      set(x, y, cliff + dq((nx + 1) / 2, FAC, x, y), LAYER.cliff);
    }
  }
  // the fall: phase = row (plus a per-column lag), so rotating the cycle pours it downward
  const FALL = 16;
  const fallPat = Array.from({ length: FALL }, () => 0.35 + 0.65 * Math.pow(rnd(), 1.6));
  const fall = alloc(FALL, (i) => ({ k: 'fall', s: fallPat[i] }));
  cycle(fall, FALL, 24, 'fall');
  const lag = Array.from({ length: 64 }, () => Math.floor(rnd() * FALL));
  for (let y = Math.floor(cliffTopAt[Math.round(xw)]) - 1; y < yH; y++) {
    const spread = 1 + (y - cliffTop) / (yH - cliffTop) * 0.35;
    const half = (ww / 2) * spread + Math.sin(y * 0.3) * 1.2;
    for (let du = -Math.ceil(half); du <= Math.ceil(half); du++) {
      if (Math.abs(du) > half) continue;
      const u = Math.round(xw + du), x = toX(u);
      const edge = Math.abs(du) / half;
      if (edge > 0.82 && hash2(x, y, S + 330) < 0.5) continue;           // ragged edges, rock showing
      set(x, y, fall + ((y + lag[(u * 7) & 63] + Math.floor(edge * 3)) % FALL), LAYER.fall);
    }
  }

  // ---- the lake: sky reflected in two bands, land reflected dark, glitter under the sun
  const LK = 10, RF = 6;
  const hl = (i, n) => [1, 0.15, 0, 0.35, 0, 0.7, 0.1, 0, 0.45, 0][i % 10] * (n === RF ? 0.6 : 1);
  const lakeNear = alloc(LK, (i, n) => ({ k: 'lake', e: 0.06, hl: hl(i, n) }));
  const lakeHigh = alloc(LK, (i, n) => ({ k: 'lake', e: 0.45, hl: hl(i, n) }));
  // a reflection: two tones (the shaded and the lit facets of what it mirrors) × three ripple phases
  const rset = (alb, depth) => alloc(RF, (i) => ({ k: 'refl', alb, depth, nx: i < 3 ? -0.6 : 0.6, hl: [0.8, 0, 0.3][i % 3] }));
  const reflOf = { [LAYER.far]: rset(B.far, 0.7), [LAYER.snow]: rset([0.9, 0.92, 1], 0.6), [LAYER.mid]: rset(B.mid, 0.38), [LAYER.cliff]: rset(B.cliff, 0.12) };
  reflOf[LAYER.tree] = reflOf[LAYER.cliff];
  const glit = alloc(NH, (i) => ({ k: 'glitter', b: i }));
  cycle(lakeNear, LK, 1.5, 'lake near'); cycle(lakeHigh, LK, 1, 'lake far'); for (const l of [LAYER.far, LAYER.snow, LAYER.mid, LAYER.cliff]) { cycle(reflOf[l], 3, 0.75, 'reflection'); cycle(reflOf[l] + 3, 3, 0.75, 'reflection'); }
  const shoreAt = new Float32Array(W);
  for (let x = 0; x < W; x++) shoreAt[x] = H * (0.84 + fbm1(x * 0.012, S + 400) * 0.08) - (cliffLeft ? smooth(cw * 1.3, 0, x) : smooth(W - cw * 1.3, W, x)) * H * 0.06;
  // halo bucket under each column: the stretch of arc whose x is nearest
  const colBucket = Array.from({ length: W }, (_, x) => Math.min(NH - 1, Math.floor(x * NH / W)));   // glitter column under x
  for (let y = yH; y < H; y++) for (let x = 0; x < W; x++) {
    if (y >= shoreAt[x]) continue;
    const depth = (y - yH) / (H - yH);
    const wob = Math.sin(x * 0.045 + y * 0.9) * 1.5 + Math.sin(x * 0.013 - y * 0.35) * 2;
    const ph = (Math.floor(y * 0.8 + wob + hash2(x >> 3, y, S + 410) * 1.5) % LK + LK) % LK;
    // mirror: what stands above this point of the shore, wobbled by the ripples
    const sy = yH - (y - yH) * 1.05 - 1, sx = Math.round(x + Math.sin(y * 0.8 + x * 0.01) * (1 + depth * 3));
    const src = sy >= 0 && sx >= 0 && sx < W ? layer[Math.floor(sy) * W + sx] : LAYER.sky;
    let id;
    if (src === LAYER.fall && depth < 0.45) id = fall + ((Math.floor(-sy) % FALL) + FALL) % FALL;
    else if (reflOf[src] !== undefined || src === LAYER.fall) {
      const l = src === LAYER.fall ? LAYER.cliff : src, si = index[Math.floor(sy) * W + sx];
      const lo = { [LAYER.far]: far, [LAYER.snow]: snow, [LAYER.mid]: mid, [LAYER.cliff]: cliff, [LAYER.tree]: cliff }[l];
      const lit = si - lo >= (l === LAYER.snow ? 3 : 4) ? 3 : 0;
      id = reflOf[l] + lit + (ph % 3);
    }
    else id = (depth < 0.22 + hash2(x >> 2, y, S + 420) * 0.05 ? lakeNear : lakeHigh) + ph;
    // glitter: short horizontal dashes, densest near the far shore, each lit by its stretch of sky
    if (reflOf[src] === undefined && src !== LAYER.fall
      && hash2(x >> 2, y, S + 430) < 0.22 * (1 - depth * 0.7) && hash2(x, y, S + 431) < 0.7) id = glit + colBucket[x];
    set(x, y, id, LAYER.lake);
  }
  // foam where the fall meets the lake: rings moving outward
  const FOAM = 8;
  const foam = alloc(FOAM, (i) => ({ k: 'foam', s: [1, 0.7, 0.45, 0.3, 0.55, 0.85, 0.4, 0.25][i] }));
  cycle(foam, FOAM, 6, 'foam');
  { const fx = toX(Math.round(xw));
    for (let y = yH - 8; y < yH + 16; y++) for (let x = fx - 3 * ww; x <= fx + 3 * ww; x++) {
      const d = Math.hypot((x - fx) / (ww * 1.6), (y - yH) / 7);
      if (d < 1 && hash2(x, y, S + 440) < 1.15 - d) set(x, y, foam + ((Math.floor(-d * 10 + hash2(x, y, S + 441) * 2) % FOAM) + FOAM) % FOAM, LAYER.fall);
    } }

  // ---- pines: a cone of tiers, each needle-mass indexed by the side it faces
  const PINE = 6;
  const pine = alloc(PINE, (i, n) => ({ k: 'land', alb: B.pine, nx: (i / (n - 1)) * 2 - 1, depth: 0.05, name: 'pine' }));
  function tree(x0, base, h) {
    for (let r = 0; r < h; r++) {
      const f = r / h, tier = (f * 5) % 1;
      const half = h * 0.24 * (0.12 + 0.88 * f) * (0.55 + 0.45 * tier);
      for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
        if (Math.abs(dx) > half + hash2(x0 + dx, r, S + 500) - 0.5) continue;
        const nx = clamp(dx / Math.max(1, half) * 0.9 + (hash2(x0 + dx, r, S + 501) - 0.5) * 0.6, -1, 1);
        set(Math.round(x0 + dx), Math.round(base - h + r), pine + dq((nx + 1) / 2, PINE, x0 + dx, r), LAYER.tree);
      }
    }
    for (let r = 0; r < h * 0.08; r++) set(Math.round(x0), Math.round(base - r), pine, LAYER.tree);
  }
  for (let k = 0; k < 5 + Math.floor(rnd() * 6); k++) {                 // on the cliff top
    const u = rnd() * cw * 0.85;
    if (Math.abs(u - xw) < ww * 1.2) continue;
    tree(toX(Math.round(u)), cliffTopAt[Math.round(u)] + 2, 10 + rnd() * 14);
  }

  // ---- the near shore: ground by facing, more pines, a cabin with a lit window and smoke
  const ground = facing(B.ground, 0.0, 'ground');
  for (let x = 0; x < W; x++) {
    const slope = (shoreAt[Math.min(W - 1, x + 3)] - shoreAt[Math.max(0, x - 3)]) / 6;
    for (let y = Math.floor(shoreAt[x]); y < H; y++) {
      const t = fbm2(x * 0.05, y * 0.09, S + 600, 4) * 2 - 1;
      const tuft = hash2(x, y, S + 601) < 0.08 ? (hash2(x, y, S + 602) - 0.5) * 2 : 0;
      const nx = clamp(-slope * 3 * Math.exp(-(y - shoreAt[x]) / 10) + t * 0.9 + tuft, -1, 1);
      set(x, y, ground + dq((nx + 1) / 2, FAC, x, y), LAYER.ground);
    }
  }
  const cabinU = cw * 1.45 + rnd() * (W - cw * 1.8);
  const cabX = Math.round(toX(Math.round(Math.min(W - 60, cabinU)))), cabBase = Math.round(shoreAt[cabX] + 4);
  const cabin = alloc(8, (i) => [
    { k: 'land', alb: B.wall, nx: 0, depth: 0, name: 'wall' }, { k: 'land', alb: B.wall, nx: -0.15, depth: 0, name: 'wall' },
    { k: 'land', alb: B.wall, nx: 0.85, depth: 0, name: 'side' }, { k: 'land', alb: B.roof, nx: -0.75, depth: 0, name: 'roof' },
    { k: 'land', alb: B.roof, nx: 0.75, depth: 0, name: 'roof' }, { k: 'window', ph: 0 }, { k: 'window', ph: 1 },
    { k: 'land', alb: [0.08, 0.06, 0.05], nx: 0, depth: 0, name: 'door' }][i]);
  const cw2 = 22, chh = 13;
  for (let y = cabBase - chh; y < cabBase; y++) {
    for (let x = cabX - cw2 / 2; x < cabX + cw2 / 2; x++) set(x, y, cabin + ((x + y) % 5 === 0 ? 1 : 0), LAYER.cabin);   // plank lines
    for (let x = cabX + cw2 / 2; x < cabX + cw2 / 2 + 8; x++) set(x, y - Math.floor((x - cabX - cw2 / 2) * 0.35), cabin + 2, LAYER.cabin);
  }
  for (let r = 0; r < 11; r++) for (let x = cabX - cw2 / 2 - 3 + r; x < cabX + cw2 / 2 + 3 - r + 8; x++) {
    const right = x > cabX + (cw2 + 8) / 2 - r * 0.2;
    set(x, cabBase - chh - 1 - r, cabin + (right ? 4 : 3), LAYER.cabin);
  }
  for (let y = cabBase - 8; y < cabBase - 3; y++) for (let x = cabX - 7; x < cabX - 2; x++) set(x, y, cabin + 5 + ((x + y) & 1), LAYER.cabin);
  for (let y = cabBase - 9; y < cabBase; y++) for (let x = cabX + 3; x < cabX + 8; x++) set(x, y, cabin + 7, LAYER.cabin);
  const chimX = cabX + 5, chimTop = cabBase - chh - 16;
  for (let y = chimTop; y < cabBase - chh - 4; y++) for (let x = chimX; x < chimX + 3; x++) set(x, y, cliff + 2, LAYER.cabin);
  // smoke: phase rises with height, so the cycle carries puffs upward; it leans with the wind
  const SMOKE = 8;
  const puff = [0.95, 0.75, 0.4, 0.15, 0.05, 0.2, 0.5, 0.8];
  const smokeSky = alloc(SMOKE, (i) => ({ k: 'smoke', s: puff[i], e: elevAt(Math.min(yH - 4, chimTop - 40)) }));
  const smokeLake = alloc(SMOKE, (i) => ({ k: 'smoke', s: puff[i], lake: true }));
  cycle(smokeSky, SMOKE, 3, 'smoke'); cycle(smokeLake, SMOKE, 3, 'smoke');
  const wind = (rnd() - 0.5) * 1.4;
  for (let h = 1; h < 70; h++) {
    const y = chimTop - h, cxs = chimX + 1 + wind * Math.pow(h, 1.25) * 0.5 + Math.sin(h * 0.25) * 1.5;
    const half = 1 + h * 0.09;
    for (let x = Math.floor(cxs - half); x <= cxs + half; x++) {
      if (hash2(x, y, S + 700) > 1.05 - h / 80) {
        const l = layer[y * W + x];
        const set8 = l === LAYER.sky ? smokeSky : l === LAYER.lake && index[y * W + x] >= lakeNear && index[y * W + x] < lakeNear + 2 * LK ? smokeLake : -1;
        if (set8 >= 0) set(x, y, set8 + ((Math.floor(h * 0.5) % SMOKE) + SMOKE) % SMOKE, l);
      }
    }
  }
  for (let k = 0; k < 7 + Math.floor(rnd() * 6); k++) {                 // shore pines, not on the cabin
    const x = Math.round(rnd() * W);
    if (Math.abs(x - cabX) < 30) continue;
    tree(x, shoreAt[x] + 6 + rnd() * 10, 22 + rnd() * 30);
  }
  // fireflies, low over the shore and the near water: each blinks once a cycle
  const FF = 6;
  const flies = alloc(FF, (i) => ({ k: 'firefly', b: i === 0 ? 1 : i === 1 ? 0.35 : 0, alb: B.ground }));
  cycle(flies, FF, 0.75, 'fireflies');
  if (fireflies) for (let k = 0; k < 90; k++) {
    const x = Math.floor(rnd() * W), y = Math.floor(H * 0.8 + rnd() * H * 0.18);
    if (layer[y * W + x] === LAYER.ground || layer[y * W + x] === LAYER.lake) set(x, y, flies + Math.floor(rnd() * FF), layer[y * W + x]);
  }

  if (entries.length > 256) throw new Error(`palette overflow: ${entries.length}`);
  while (entries.length < 256) entries.push({ k: 'unused' });
  return {
    kind: 'lake', seed, biome: biomeName, W, H, index, entries, cycles, bpm, yH, cliffLeft,
    path: { lo: core, NB, NH, rc: 6.5, day: null }, layer, LAYER, cabin: { x: cabX, y: cabBase }, waterfall: { x: toX(Math.round(xw)), width: ww },
    slots: { glitter: glit, fireflies: flies, fall },
    used: entries.findIndex((e) => e.k === 'unused'), skyTurn: B.skyTurn, water: B.water, midAlb: B.mid,
  };
}

// ------------------------------------------------------------------------- the light --
// Keyed on the sun's elevation, −1 (midnight) … 1 (noon).
export const key = (table, el) => {
  for (let i = 1; i < table.length; i++) if (el <= table[i][0]) {
    const [a, ca] = table[i - 1], [b, cb] = table[i];
    return mix3(ca, cb, smooth(0, 1, (el - a) / (b - a)));
  }
  return table[table.length - 1][1];
};
export const ZENITH = [[-1, [0.01, 0.012, 0.04]], [-0.3, [0.02, 0.03, 0.09]], [-0.1, [0.08, 0.07, 0.22]], [0, [0.22, 0.20, 0.44]], [0.12, [0.28, 0.44, 0.76]], [0.4, [0.20, 0.44, 0.86]], [1, [0.16, 0.40, 0.84]]];
export const HORIZON = [[-1, [0.03, 0.04, 0.09]], [-0.3, [0.05, 0.06, 0.15]], [-0.1, [0.42, 0.18, 0.26]], [0, [0.98, 0.48, 0.24]], [0.12, [0.96, 0.74, 0.54]], [0.4, [0.70, 0.82, 0.93]], [1, [0.64, 0.80, 0.95]]];
export const AMBIENT = [[-1, [0.05, 0.06, 0.13]], [-0.12, [0.10, 0.09, 0.19]], [0, [0.34, 0.24, 0.34]], [0.2, [0.48, 0.48, 0.56]], [1, [0.55, 0.58, 0.66]]];
export const SUNCOL = [[-0.1, [1.0, 0.30, 0.10]], [0.02, [1.0, 0.45, 0.20]], [0.15, [1.0, 0.75, 0.50]], [0.45, [1.0, 0.95, 0.86]], [1, [1.0, 0.97, 0.92]]];

/** Turn a colour's hue by `a` radians about the grey axis (an alien sky). */
export function turn(c, a) {
  if (!a) return c;
  const k = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], cs = Math.cos(a), sn = Math.sin(a);
  const d = (k[0] * c[0] + k[1] * c[1] + k[2] * c[2]) * (1 - cs);
  const cr = [k[1] * c[2] - k[2] * c[1], k[2] * c[0] - k[0] * c[2], k[0] * c[1] - k[1] * c[0]];
  return [c[0] * cs + cr[0] * sn + k[0] * d, c[1] * cs + cr[1] * sn + k[1] * d, c[2] * cs + cr[2] * sn + k[2] * d];
}

// ------------------------------------------------------------------------- the view --
// The painting looks one way (`facing`, an azimuth), FOV degrees across. Its sky is a stereographic
// projection centred on the horizon straight ahead: conformal, so every constellation keeps its true
// shape, and the horizon (a great circle through the centre) stays the straight line the painting
// stands on. 160° across, it shows the sky to about 60° up in the middle; sizes grow toward the
// edges (shapes do not change), as in a painted panorama.
export const FOV = 160;
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const KST = (W / 2) / (2 * Math.tan(FOV / 4 * Math.PI / 180));
/** Screen position of an altitude/azimuth in the painting ([NaN, NaN] when behind the viewer). */
export function project(scene, view, alt, az) {
  const D = Math.PI / 180, ca = Math.cos(alt * D), dz = (az - view.facing) * D;
  const cx = ca * Math.sin(dz), cy = Math.sin(alt * D), cz = ca * Math.cos(dz);
  if (cz < -0.2) return [NaN, NaN];
  const k = 2 / (1 + cz);
  return [W / 2 + cx * k * KST, scene.yH - cy * k * KST];
}

/** The direction (alt, az in radians) a painting pixel looks toward: the inverse of `project`. */
export function unproject(scene, view, x, y) {
  const X = (x - W / 2) / KST, Y = (scene.yH - y) / KST, r2 = X * X + Y * Y;
  const cz = (4 - r2) / (4 + r2), cx = X * (1 + cz) / 2, cy = Y * (1 + cz) / 2;
  return [Math.asin(Math.max(-1, Math.min(1, cy))), view.facing * Math.PI / 180 + Math.atan2(cx, cz)];
}

/**
 * Paint the sun's real path for the solar day containing `ms` into the sky: NB discs evenly along
 * the part of the track the window shows, each remembering the moment the sun stands there. Re-run
 * when the day (or the place, or the facing) changes; it touches only sky pixels.
 */
export function paintSunPath(scene, view, ms) {
  const { index, layer, LAYER, path, entries } = scene;
  const { lo, NB, rc } = path, sky0 = entries.findIndex((e) => e.k === 'sky');
  const isSky = (i) => entries[i].k === 'sky';
  // un-paint the old discs: each pixel back to the sky ramp at its height
  for (let i = 0; i < W * H; i++) if (index[i] >= lo && index[i] < lo + NB) {
    const y = Math.floor(i / W), x = i % W;
    index[i] = sky0 + dq(Math.pow(clamp((scene.yH - y) / scene.yH), 0.8), 20, x, y);
  }
  const day = Math.floor((ms / 3600000 + view.lon / 15) / 24);
  const t0 = (day * 24 - view.lon / 15) * 3600000;
  // the track, sampled every 3 minutes, where it is on the canvas
  const pts = [];
  for (let m = 0; m <= 24 * 60; m += 3) {
    const t = t0 + m * 60000, sk = skyAt$(t, view);
    if (sk.sun.alt < -1.5) continue;
    const [x, y] = project(scene, view, sk.sun.alt, sk.sun.az);
    if (!(x > -rc && x < W + rc && y > -rc)) continue;
    pts.push({ x, y, t });
  }
  for (let i = 0; i < NB; i++) Object.assign(entries[lo + i], { x: -99, y: -99, ms: -1 });
  path.day = day; path.view = { ...view };
  if (pts.length < 2) return;
  let len = 0; const cum = [0];
  for (let i = 1; i < pts.length; i++) { const jump = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); len += jump > 40 ? 0 : jump; cum.push(len); }
  const n = Math.min(NB, Math.max(2, Math.floor(len / (2 * rc - 1)) + 1)), step = len / (n - 1);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const want = i * step;
    while (k < pts.length - 2 && cum[k + 1] < want) k++;
    const f = cum[k + 1] > cum[k] ? clamp((want - cum[k]) / (cum[k + 1] - cum[k])) : 0;
    const x = lerp(pts[k].x, pts[k + 1].x, f), y = lerp(pts[k].y, pts[k + 1].y, f), t = lerp(pts[k].t, pts[k + 1].t, f);
    Object.assign(entries[lo + i], { x, y, ms: t, e: Math.pow(clamp((scene.yH - y) / scene.yH), 0.8) });
    for (let py = Math.floor(y - rc); py <= y + rc; py++) for (let px = Math.floor(x - rc); px <= x + rc; px++) {
      if (px < 0 || px >= W || py < 0 || py >= scene.yH || Math.hypot(px - x, py - y) >= rc) continue;
      const j = py * W + px;
      if (layer[j] === LAYER.sky && (isSky(index[j]) || (index[j] >= lo && index[j] < lo + NB))) index[j] = lo + i;
    }
  }
}
let skyAt$ = null;
/** The page hands in astro.js's sky() (keeps this module free of the star data). */
export function useSky(fn) { skyAt$ = (t, v) => fn(t, v.lat, v.lon); }

/** The day's cloud cover, 0 (clear) … 1 (the painted clouds in full): weather.js's forecast. */
export function weather(scene, ms, view) {
  return forecast(scene.seed, ms, view.lat ?? 40, view.lon ?? 0, view.wx || null).cover;
}

/** Everything the palette needs to know about the moment: from the real sun and moon. */
export function light(scene, view, sk, t = null) {
  const wx = forecast(scene.seed, sk.ms, view.lat ?? 40, view.lon ?? 0, view.wx || null);
  const flash = t == null ? 0 : lightning(scene.seed, t, wx.storm).flash;
  return weatherLight(clearLight(scene, view, sk), wx, flash);
}
/** The light of a clear sky (the weather is laid over it by `light`). */
function clearLight(scene, view, sk) {
  const D = Math.PI / 180;
  const el = Math.sin(sk.sun.alt * D), mel = Math.sin(sk.moon.alt * D);
  // the light's direction in the painting: across (right +) and up
  const L = [Math.sin((sk.sun.az - view.facing) * D) * Math.cos(sk.sun.alt * D), el];
  const M = [Math.sin((sk.moon.az - view.facing) * D) * Math.cos(sk.moon.alt * D), mel];
  const phaseLight = 0.15 + 0.85 * sk.moonLit;
  const sunI = smooth(-0.06, 0.1, el), moonI = smooth(-0.05, 0.15, mel) * 0.55 * phaseLight * smooth(0.1, -0.1, el);
  const t = scene.skyTurn;
  let zen = turn(key(ZENITH, el), t), hor = turn(key(HORIZON, el), t);
  zen = add3(zen, [0.02, 0.03, 0.06], moonI); hor = add3(hor, [0.03, 0.04, 0.08], moonI);
  const amb = add3(key(AMBIENT, el), [0.04, 0.05, 0.09], moonI);
  const sunCol = scale3(key(SUNCOL, el), sunI), moonCol = scale3([0.55, 0.65, 0.95], moonI);
  // where the sun stands among the painted discs (by time), and over which glitter column
  const P = scene.path, discs = scene.entries.slice(P.lo, P.lo + P.NB);
  let sunPos = -99;
  for (let i = 0; i + 1 < P.NB && discs[i + 1].ms > 0; i++) {
    if (discs[i].ms <= sk.ms && sk.ms <= discs[i + 1].ms) { sunPos = i + (sk.ms - discs[i].ms) / (discs[i + 1].ms - discs[i].ms); break; }
  }
  const [sx] = project(scene, view, sk.sun.alt, sk.sun.az), [mx] = project(scene, view, sk.moon.alt, sk.moon.az);
  const col = (x, alt, az) => (Math.abs(wrap180(az - view.facing)) < FOV / 2 && alt > -2 ? x * P.NH / W - 0.5 : -99);
  return { cover: 0, el, mel, L, M, sunI, moonI, zen, hor, amb, sunCol, moonCol, sunPos, sunCol$: col(sx, sk.sun.alt, sk.sun.az), moonCol$: col(mx, sk.moon.alt, sk.moon.az), night: smooth(0.05, -0.2, el) };
}
const skyAt = (lt, e) => mix3(lt.hor, lt.zen, Math.pow(clamp(e), 0.7));
const lambert = (nx, L, ny = 0.8) => Math.max(0, (nx * L[0] + ny * L[1]) / Math.hypot(nx, ny));
function litLand(lt, alb, nx, depth) {
  const d = add3(add3(lt.amb, lt.sunCol, lambert(nx, lt.L)), lt.moonCol, lambert(nx, lt.M));
  const c = mul3(alb, d);
  return mix3(c, skyAt(lt, 0.04), clamp(depth * 0.8));
}
const discW = (b, pos) => smooth(1.3, 0.35, Math.abs(b - pos));

/**
 * The palette for a moment (`sk`, astro.js sky()) seen through `view`, at clock `t` (seconds): each
 * entry lit, then the cycles turned.
 * `flares` (optional): [{ lo, i, amount }] momentary brightening of one entry (the music's notes).
 * Returns Uint8ClampedArray(768).
 */
export function palette(scene, view, sk, t, flares = []) {
  const lt = light(scene, view, sk, t), out = new Float32Array(768);
  const lit = scene.entries.map((e) => {
    switch (e.k) {
      case 'sky': return skyAt(lt, e.e);
      case 'sun': {
        let c = skyAt(lt, e.e);
        const ws = discW(e.b, lt.sunPos);
        const sunBody = mix3([1, 0.45, 0.18], [1, 0.97, 0.85], smooth(0, 0.35, lt.el));
        return mix3(c, sunBody, ws * smooth(-0.15, 0.02, lt.el) * (1 - 0.95 * (lt.veiled || 0)));
      }
      case 'cloud': {
        const d = add3(add3(scale3(lt.amb, 0.95), lt.sunCol, 0.25 + 0.85 * e.s), lt.moonCol, 0.2 + 0.6 * e.s);
        return mix3(mix3(mul3([0.92, 0.92, 0.97], d), skyAt(lt, e.e), 0.18), skyAt(lt, e.e), 1 - lt.cover);
      }
      case 'land': {
        // lying snow whitens what faces up: the meadow and the roofs most, steep rock least
        const lie = lt.wx ? lt.wx.lying * ({ ground: 0.85, roof: 0.9, pine: 0.45, far: 0.7, mid: 0.6, cliff: 0.22, sand: 0.8, dune: 0.75 }[e.name] ?? 0) : 0;
        return litLand(lt, lie > 0 ? mix3(e.alb, [0.9, 0.92, 0.97], lie) : e.alb, e.nx, e.depth);
      }
      case 'fall': case 'foam': {
        const s = e.k === 'foam' ? 0.5 + 0.5 * e.s : e.s;
        const d = add3(add3(scale3(lt.amb, 1.1), lt.sunCol, 0.55), lt.moonCol, 0.5);
        return mul3(mix3(scale3(scene.water, 2.2), [0.86, 0.92, 0.98], s), d);
      }
      case 'lake': {
        const base = mix3(skyAt(lt, e.e), mul3(e.w || scene.water, add3(lt.amb, lt.sunCol, 0.3)), 0.42);
        return add3(add3(base, skyAt(lt, e.e + 0.25), 0.22 * e.hl), add3(lt.sunCol, lt.moonCol), 0.12 * e.hl);
      }
      case 'refl': {
        // a reflection is darker and bluer than what it shows, and loses the light's direction
        const land = litLand(lt, e.alb, e.nx, e.depth);
        return add3(mix3(scale3(land, 0.8), mul3(scene.water, add3(lt.amb, lt.sunCol, 0.2)), 0.25), skyAt(lt, 0.3), 0.22 * e.hl);
      }
      case 'glitter': {
        const base = mix3(skyAt(lt, 0.15), mul3(scene.water, add3(lt.amb, lt.sunCol, 0.3)), 0.4);
        const ws = smooth(1.6, 0.2, Math.abs(e.b - lt.sunCol$)), wm = smooth(1.6, 0.2, Math.abs(e.b - lt.moonCol$));
        const low = 1.2 - Math.max(0, lt.el) * 0.7;
        return add3(add3(base, add3(lt.sunCol, [0.3, 0.25, 0.1], lt.sunI), ws * low), [0.8, 0.85, 1], wm * lt.moonI * 1.4);
      }
      case 'smoke': {
        const behind = e.lake ? mix3(skyAt(lt, 0.25), mul3(scene.water, add3(lt.amb, lt.sunCol, 0.3)), 0.42) : skyAt(lt, e.e);
        return mix3(behind, mul3([0.62, 0.62, 0.66], add3(lt.amb, lt.sunCol, 0.6)), e.s * 0.7);
      }
      case 'surf': case 'wash': {
        // the surf (coast.js): foam over the shallows, or over the sand it runs up, wetting it
        const foam = mul3([0.9, 0.93, 0.96], add3(add3(scale3(lt.amb, 1.15), lt.sunCol, 0.75), lt.moonCol, 0.7));
        let under;
        if (e.k === 'surf') under = mix3(skyAt(lt, 0.06), mul3(scene.shallow || scene.water, add3(lt.amb, lt.sunCol, 0.3)), 0.42);
        else {
          const dry = litLand(lt, scene.sand, 0, 0);
          under = mix3(dry, add3(scale3(dry, 0.5), skyAt(lt, 0.25), 0.3), e.wet);
        }
        return e.s >= 0 ? mix3(under, foam, e.s) : scale3(under, 1 + e.s);
      }
      case 'beam': case 'lamp': {
        // the lighthouse (coast.js): the lamp turns once a period; its beam, seen from the side,
        // reaches across the sky as far as it is turned across the view, and flashes toward us
        const L = scene.lighthouse, a = 2 * Math.PI * (t / L.period), across = Math.sin(a), toward = Math.cos(a);
        const dark = smooth(0.03, -0.14, lt.el), haze = 0.45 + 0.9 * (lt.wx ? lt.wx.fog + 0.4 * lt.wx.rain : 0);
        const warm = [1, 0.92, 0.7];
        if (e.k === 'lamp') return add3([0.2, 0.2, 0.2], warm, dark * (0.6 + 2.2 * Math.pow(Math.max(0, toward), 6)));
        const on = e.side * across > 0 ? smooth(0.05, 0, e.d - Math.abs(across)) : 0;
        return add3(skyAt(lt, e.e), warm, dark * on * haze * 0.7 * Math.pow(1 - e.d, 1.2) * (0.5 + 0.5 * Math.abs(across)));
      }
      case 'window': {
        const fl = 0.85 + 0.15 * Math.sin(t * 7.3 + e.ph * 2.1) * Math.sin(t * 2.9 + e.ph);
        const glow = smooth(0.15, -0.05, lt.el) * fl;
        return add3(scale3([0.15, 0.12, 0.1], 1), [1.0, 0.68, 0.28], glow * 1.05);
      }
      case 'firefly': {
        const off = litLand(lt, e.alb, 0, 0);
        return add3(off, [0.75, 1.0, 0.35], e.b * lt.night * 1.1);
      }
      default: return [0, 0, 0];
    }
  });
  for (const f of flares) if (lit[f.lo + f.i]) lit[f.lo + f.i] = add3(lit[f.lo + f.i], [1, 0.95, 0.85], f.amount);
  const rot = turnCycles(lit, scene.cycles, t, scene.bpm);
  for (let i = 0; i < 256; i++) for (let j = 0; j < 3; j++) out[i * 3 + j] = Math.pow(clamp(rot[i][j]), 1 / 1.15) * 255;
  return Uint8ClampedArray.from(out);
}

/**
 * Turn the cycles: each moves `perBeat` entries a beat, smoothly (blending neighbours), as Canvas
 * Cycle's "blend shift" does. `lit` is one colour per entry; returns the turned copy.
 */
export function turnCycles(lit, cycles, t, bpm) {
  const beat = 60 / bpm, rot = lit.slice();
  for (const c of cycles) {
    const pos = (t / beat) * c.perBeat, k = Math.floor(pos), f = pos - k;
    for (let i = 0; i < c.len; i++) {
      // the colour that sits at slot i now came from slot i − pos
      const a = lit[c.lo + (((i - k) % c.len) + c.len) % c.len], b = lit[c.lo + (((i - k - 1) % c.len) + c.len) % c.len];
      rot[c.lo + i] = mix3(a, b, f);
    }
  }
  return rot;
}

/** The picture at a moment, as RGBA bytes (node stills, tests). */
export function frame(scene, view, sk, t, flares) {
  const pal = palette(scene, view, sk, t, flares), px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const p = scene.index[i] * 3; px[i * 4] = pal[p]; px[i * 4 + 1] = pal[p + 1]; px[i * 4 + 2] = pal[p + 2]; px[i * 4 + 3] = 255; }
  return px;
}
