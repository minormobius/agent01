// arnold/surface.js — a square filling a cube.
//
// The engine behind math.mino.mobi/arnold/. Implements the (2/3)-Hölder
// surjection [0,1]² → [0,1]³ of Badger & Palmer, "Space-filling surfaces:
// sharp Hölder continuous parameterizations from squares to cubes"
// (arXiv:2608.21246), then turns it into an image whose colour histogram is
// flat: every colour equally often, neighbouring pixels a couple of levels
// apart, no seams.
//
// The construction, in the order the code runs it:
//
//   1. s : [0,1] → T        a staircase curve in an isosceles right triangle,
//                           refined by eight similarities of ratio 1/4
//                           (Lemma 2.2). Eight parameter steps ↔ four spatial
//                           steps, which is exactly exponent 2/3.
//   2. g : [0,1] → E∞ ⊂ Q   four rotated copies of s, concatenated; a closed
//                           curve filling the X-shaped fractal E∞ of dimension
//                           3/2 (Proposition 2.1). g(0) = g(1), so the square
//                           is really a torus.
//   3. g ⊗ g                 the product map [0,1]² → E∞ × E∞ ⊂ ℝ⁴.
//   4. L(a₁,b₁,a₂,b₂) =      Stong's linear map ℝ⁴ → ℝ³. On the lattice it is a
//        (a₁+2a₂, b₁, b₂)    bijection (Proposition 3.1); that is what makes
//                           the colour histogram flat.
//
// The paper then clips L(E∞²) to a small central cube to get an onto map with a
// clean constant. Clipping is a disaster for a picture (98% of pixels land on
// the cube's faces), so this engine does something the paper does not need: it
// FOLDS the first coordinate. P = a₁+2a₂ has a trapezoidal density on [0,3] —
// ramp, plateau, ramp — and the triangle wave of period 2 folds a trapezoid
// flat. Measured, not just argued: at lattice-aligned resolutions every colour
// appears exactly the same number of times (see surface.selftest.mjs).
//
// Everything is a pure function of (seed, strength, cat, palette, mode), so a
// permalink reproduces an image bit for bit. No dependencies, no build step;
// the page imports this file and so does the selftest.

export const VERSION = 1;

// ---------------------------------------------------------------- the curve --
// Staircase vertices p₀…p₈ for M = 4 (units of the triangle's hypotenuse):
// climb (0,0)→(½,½) then descend to (1,0). p₃ = p₅ on purpose.
export const STAIR = [
  [0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [2, 1], [3, 1], [3, 0], [4, 0],
].map(([x, y]) => [x / 4, y / 4]);

// Direction of each of the eight steps as a quarter-turn count: E N E N S E S E.
export const TURN = [0, 1, 0, 1, 3, 0, 3, 0];

// Corners of Q = [0,1]² in the order the four copies of s start from.
export const CORNER = [[0, 0], [1, 0], [1, 1], [0, 1]];

export const DEFAULT_DEPTH = 12;

function rot(r, x, y) {
  switch (r & 3) {
    case 0: return [x, y];
    case 1: return [-y, x];
    case 2: return [-x, -y];
    default: return [y, -x];
  }
}

/** Octal digits of t ∈ [0,1), most significant first. */
export function octalDigits(t, depth) {
  const out = new Array(depth);
  for (let i = 0; i < depth; i++) {
    let d = Math.floor(t * 8);
    if (d > 7) d = 7;
    if (d < 0) d = 0;
    t = t * 8 - d;
    out[i] = d;
  }
  return out;
}

/**
 * The staircase curve s at parameter t, approximated at `depth` levels.
 * Returns the CENTRE of the level-`depth` square that contains s(t): every
 * quarter-triangle of a square has its apex at the square's centre, so
 * following the similarities and finishing at the apex lands there exactly.
 * Error against the limit curve is at most 4^-depth / 2 in sup norm.
 */
export function sPoint(t, depth = DEFAULT_DEPTH) {
  if (t < 0) t = 0;
  if (t >= 1) t = 1 - 1e-15;
  let ox = 0, oy = 0, r = 0, sc = 1;
  for (let i = 0; i < depth; i++) {
    let d = Math.floor(t * 8);
    if (d > 7) d = 7;
    t = t * 8 - d;
    const [px, py] = rot(r, STAIR[d][0], STAIR[d][1]);
    ox += sc * px;
    oy += sc * py;
    r = (r + TURN[d]) & 3;
    sc *= 0.25;
  }
  const [mx, my] = rot(r, 0.5, 0.5);
  return [ox + sc * mx, oy + sc * my];
}

/**
 * The closed curve g : ℝ/ℤ → E∞ ⊂ [0,1]². Copy c ∈ {0,1,2,3} is s rotated
 * c quarter-turns about the centre of the square, starting at CORNER[c].
 */
export function gPoint(u, depth = DEFAULT_DEPTH) {
  u = u - Math.floor(u);
  let c = Math.floor(u * 4);
  if (c > 3) c = 3;
  let t = u * 4 - c;
  let ox = CORNER[c][0], oy = CORNER[c][1], r = c, sc = 1;
  for (let i = 0; i < depth; i++) {
    let d = Math.floor(t * 8);
    if (d > 7) d = 7;
    t = t * 8 - d;
    const [px, py] = rot(r, STAIR[d][0], STAIR[d][1]);
    ox += sc * px;
    oy += sc * py;
    r = (r + TURN[d]) & 3;
    sc *= 0.25;
  }
  const [mx, my] = rot(r, 0.5, 0.5);
  return [ox + sc * mx, oy + sc * my];
}

/** Stong's L applied to (g(u₁), g(u₂)): [P, b₁, b₂] with P ∈ [0,3]. */
export function lift(u1, u2, depth = DEFAULT_DEPTH) {
  const [a1, b1] = gPoint(u1, depth);
  const [a2, b2] = gPoint(u2, depth);
  return [a1 + 2 * a2, b1, b2];
}

/** Triangle wave of period 2: folds [0,3] onto [0,1]. Continuous. */
export function fold(p) {
  p = p % 2;
  if (p < 0) p += 2;
  return p < 1 ? p : 2 - p;
}

/** P mod 1 — the lattice bijection made literal. Flat, but the red channel wraps. */
export function wrap(p) {
  return p - Math.floor(p);
}

export const MODES = ['fold', 'wrap'];

// -------------------------------------------------------------------- seeds --
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** sfc32 seeded from a string. `float()` ∈ [0,1), `int(n)` ∈ [0,n). */
export function makeRng(seed) {
  let [a, b, c, d] = cyrb128(String(seed));
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return { float: next, int: (n) => Math.floor(next() * n) };
}

export function randomSeed(rng = { float: Math.random }) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(rng.float() * 36)];
  return s;
}

// ------------------------------------------------------------------ palette --
// The cube has 48 symmetries: 6 ways to hand (fold P, b₁, b₂) to (R,G,B) times
// 8 channel inversions. A palette index is perm*8 + inv.
export const PERMS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];
export const PALETTES = 48;

export function paletteOf(index) {
  index = ((index % PALETTES) + PALETTES) % PALETTES;
  const perm = PERMS[Math.floor(index / 8)];
  const inv = index % 8;
  return { index, perm, inv: [(inv & 1) !== 0, (inv & 2) !== 0, (inv & 4) !== 0] };
}

// ------------------------------------------------------------------- genome --
export const MAX_TWISTS = 4;
export const TWIST_AMP = 0.06; // amplitude at strength 1, in units of the square

/**
 * Everything a seed decides. `strength` ∈ [0,1] scales the twists (0 = the
 * bare surface). `palette` overrides the seed's own palette when given.
 */
export function genome(seed, strength = 0, { palette = null, cat = false } = {}) {
  seed = String(seed);
  const rng = makeRng('arnold:' + seed);
  const pal = rng.int(PALETTES);
  const n = 2 + rng.int(MAX_TWISTS - 1); // 2..4 twists
  const twists = [];
  for (let i = 0; i < n; i++) {
    twists.push({
      axis: i % 2,                       // alternate: x moved by y, then y by x
      k: 1 + rng.int(3),                 // spatial frequency 1..3
      phase: rng.float(),
      amp: (0.3 + 0.7 * rng.float()) * TWIST_AMP * (rng.float() < 0.5 ? -1 : 1),
    });
  }
  strength = Math.min(1, Math.max(0, +strength || 0));
  return {
    seed,
    strength,
    cat: !!cat,
    palette: paletteOf(palette == null ? pal : palette),
    twists: twists.map((t) => ({ ...t, amp: t.amp * strength })),
  };
}

/**
 * The area-preserving warp of the torus a genome applies before the surface:
 * optionally Arnold's cat map, then the seed's shears. Each piece has Jacobian
 * determinant exactly 1, so the flat histogram survives in the limit.
 */
export function warp(gen, x, y) {
  x -= Math.floor(x);
  y -= Math.floor(y);
  if (gen.cat) {
    const nx = 2 * x + y, ny = x + y;
    x = nx - Math.floor(nx);
    y = ny - Math.floor(ny);
  }
  for (const t of gen.twists) {
    if (t.amp === 0) continue;
    if (t.axis === 0) x += t.amp * Math.sin(2 * Math.PI * (t.k * y + t.phase));
    else y += t.amp * Math.sin(2 * Math.PI * (t.k * x + t.phase));
    x -= Math.floor(x);
    y -= Math.floor(y);
  }
  return [x, y];
}

/** Colour in [0,1)³ at torus point (x,y) under a genome. */
export function colourAt(gen, x, y, { mode = 'fold', depth = DEFAULT_DEPTH } = {}) {
  const [u, v] = warp(gen, x, y);
  const [P, b1, b2] = lift(u, v, depth);
  const base = [mode === 'wrap' ? wrap(P) : fold(P), b1, b2];
  const out = [0, 0, 0];
  const { perm, inv } = gen.palette;
  for (let i = 0; i < 3; i++) out[perm[i]] = inv[i] ? 1 - base[i] : base[i];
  return out;
}

// ------------------------------------------------------------------- raster --
/** Colour-cube side C paired with an image side N so that N²/C³ is a whole number. */
export const LEVELS = { 256: 16, 512: 32, 1024: 64, 2048: 64, 4096: 128 };

function quant(v, C) {
  let q = Math.floor(v * C);
  if (q >= C) q = C - 1;
  if (q < 0) q = 0;
  return q;
}

/**
 * Render N×N pixel LEVELS (each channel 0..C-1) into a Uint8Array of length
 * 3N². Pixel centres sample the torus; depth is chosen so the level-square is
 * far below both the pixel and the colour cell.
 */
export function renderLevels(gen, N, { C = LEVELS[N] || 64, mode = 'fold', depth, out } = {}) {
  if (!depth) depth = Math.ceil(Math.log(N / 4) / Math.log(8)) + 3;
  const buf = out || new Uint8Array(N * N * 3);
  const { perm, inv } = gen.palette;
  const bare = gen.twists.every((t) => t.amp === 0) && !gen.cat;
  if (bare) {
    // The bare surface is a product: cache g along one axis.
    const A = new Float64Array(N), B = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const [a, b] = gPoint((i + 0.5) / N, depth);
      A[i] = a; B[i] = b;
    }
    const Bq = new Int32Array(N);
    for (let i = 0; i < N; i++) Bq[i] = quant(B[i], C);
    const base = [0, 0, 0];
    for (let y = 0; y < N; y++) {
      const a2 = 2 * A[y], bq2 = Bq[y];
      for (let x = 0; x < N; x++) {
        const P = A[x] + a2;
        base[0] = quant(mode === 'wrap' ? wrap(P) : fold(P), C);
        base[1] = Bq[x];
        base[2] = bq2;
        const o = (y * N + x) * 3;
        for (let i = 0; i < 3; i++) buf[o + perm[i]] = inv[i] ? C - 1 - base[i] : base[i];
      }
    }
    return buf;
  }
  const base = [0, 0, 0];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const [u, v] = warp(gen, (x + 0.5) / N, (y + 0.5) / N);
      const [P, b1, b2] = lift(u, v, depth);
      base[0] = quant(mode === 'wrap' ? wrap(P) : fold(P), C);
      base[1] = quant(b1, C);
      base[2] = quant(b2, C);
      const o = (y * N + x) * 3;
      for (let i = 0; i < 3; i++) buf[o + perm[i]] = inv[i] ? C - 1 - base[i] : base[i];
    }
  }
  return buf;
}

/** Same, but only rows [y0, y1) — for chunked rendering that keeps a page alive. */
export function renderRows(gen, N, y0, y1, { C = LEVELS[N] || 64, mode = 'fold', depth, out }) {
  if (!depth) depth = Math.ceil(Math.log(N / 4) / Math.log(8)) + 3;
  const { perm, inv } = gen.palette;
  const base = [0, 0, 0];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < N; x++) {
      const [u, v] = warp(gen, (x + 0.5) / N, (y + 0.5) / N);
      const [P, b1, b2] = lift(u, v, depth);
      base[0] = quant(mode === 'wrap' ? wrap(P) : fold(P), C);
      base[1] = quant(b1, C);
      base[2] = quant(b2, C);
      const o = (y * N + x) * 3;
      for (let i = 0; i < 3; i++) out[o + perm[i]] = inv[i] ? C - 1 - base[i] : base[i];
    }
  }
  return out;
}

/** Expand C-level triples to 8-bit RGBA for a canvas. */
export function levelsToRGBA(levels, N, C, out) {
  const rgba = out || new Uint8ClampedArray(N * N * 4);
  const scale = 255 / (C - 1);
  for (let i = 0, j = 0; i < N * N; i++, j += 4) {
    rgba[j] = Math.round(levels[i * 3] * scale);
    rgba[j + 1] = Math.round(levels[i * 3 + 1] * scale);
    rgba[j + 2] = Math.round(levels[i * 3 + 2] * scale);
    rgba[j + 3] = 255;
  }
  return rgba;
}

// ------------------------------------------------------------------- census --
/**
 * The ledger of an image: how often each colour appears, and how far apart
 * neighbours are. `wrapEdges` counts the torus seam as neighbours too.
 */
export function census(levels, N, C, { wrapEdges = true } = {}) {
  const counts = new Uint32Array(C * C * C);
  for (let i = 0; i < N * N; i++) counts[(levels[i * 3] * C + levels[i * 3 + 1]) * C + levels[i * 3 + 2]]++;
  let min = Infinity, max = 0, hit = 0;
  const countHist = new Map();
  for (let i = 0; i < counts.length; i++) {
    const v = counts[i];
    if (v > 0) hit++;
    if (v < min) min = v;
    if (v > max) max = v;
    countHist.set(v, (countHist.get(v) || 0) + 1);
  }
  const diffHist = new Uint32Array(C);
  let maxDiff = 0, edges = 0;
  const edge = (o, q) => {
    const d = Math.max(
      Math.abs(levels[o] - levels[q]),
      Math.abs(levels[o + 1] - levels[q + 1]),
      Math.abs(levels[o + 2] - levels[q + 2]),
    );
    diffHist[d]++;
    if (d > maxDiff) maxDiff = d;
    edges++;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 3;
      if (x + 1 < N) edge(o, o + 3); else if (wrapEdges) edge(o, (y * N) * 3);
      if (y + 1 < N) edge(o, o + 3 * N); else if (wrapEdges) edge(o, x * 3);
    }
  }
  const cdf = [];
  let cum = 0;
  for (let d = 0; d <= maxDiff; d++) { cum += diffHist[d]; cdf.push(cum / edges); }
  const mean = (N * N) / (C * C * C);
  return {
    N, C, pixels: N * N, colours: C * C * C, mean,
    min, max, hit, missing: C * C * C - hit,
    countHist: [...countHist.entries()].sort((a, b) => a[0] - b[0]),
    exact: min === max,
    maxDiff, edges, diffHist: Array.from(diffHist.subarray(0, maxDiff + 1)), cdf,
    // ‖Δcolour‖∞ / ‖Δu‖∞^(2/3) measured on pixel neighbours, colours in [0,1].
    holder: (maxDiff / C) * Math.pow(N, 2 / 3),
    holderBound: 4, // per channel, box normalisation: (M−1)·Höld(g)/3 = 4
  };
}

// ---------------------------------------------------------------- permalink --
const DEFAULTS = { seed: 'poster', strength: 0, cat: false, palette: null, mode: 'fold' };

export function encodeState(st) {
  const p = new URLSearchParams();
  p.set('seed', st.seed);
  if (st.strength) p.set('k', String(Math.round(st.strength * 100)));
  if (st.cat) p.set('cat', '1');
  if (st.palette != null) p.set('pal', String(st.palette));
  if (st.mode && st.mode !== 'fold') p.set('mode', st.mode);
  if (st.view && (st.view.x || st.view.y || st.view.w !== 1)) {
    p.set('view', [st.view.x, st.view.y, st.view.w].map((v) => (+v).toPrecision(12)).join(','));
  }
  return p.toString();
}

export function decodeState(query) {
  const p = new URLSearchParams(query.replace(/^#/, ''));
  const st = { ...DEFAULTS };
  if (p.get('seed')) st.seed = p.get('seed').slice(0, 32);
  if (p.get('k') != null) st.strength = Math.min(1, Math.max(0, (+p.get('k') || 0) / 100));
  if (p.get('cat') === '1') st.cat = true;
  if (p.get('pal') != null && p.get('pal') !== '') st.palette = ((+p.get('pal') % PALETTES) + PALETTES) % PALETTES;
  if (MODES.includes(p.get('mode'))) st.mode = p.get('mode');
  if (p.get('view')) {
    const [x, y, w] = p.get('view').split(',').map(Number);
    if ([x, y, w].every(Number.isFinite) && w > 0) st.view = { x, y, w };
  }
  return st;
}

export function stateGenome(st) {
  return genome(st.seed, st.strength, { palette: st.palette, cat: st.cat });
}
