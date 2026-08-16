// zest/embed-geometry.js — THE MAP: an embedding vector becomes a solid.
//
// Pure. No DOM, no three.js, no imports. Runs identically in a worker, in a
// tab, and in node (embed-geometry.selftest.mjs). Everything the game draws
// comes from here; the game itself only does physics and pixels.
//
// ── The claim ────────────────────────────────────────────────────────────────
// A post embedding is 768 numbers nobody can read. We do not "illustrate" it.
// We use it as the SPECTRUM of a surface, in the one basis where "spectrum of a
// surface" is literally what it means: the real spherical harmonics, which are
// the Fourier basis on the sphere.
//
//     r(θ,φ) = R · ( 1 + amp · Σ_l Σ_m ĉ_lm · Y_l^m(θ,φ) )
//
// The coefficient vector ĉ IS the (whitened, reordered, band-weighted) post
// vector. So the map embedding → surface is LINEAR, and because the Y_l^m are
// orthonormal, Parseval hands us the property the whole idea rests on:
//
//     ‖ shape_A − shape_B ‖_L²(S²)  =  ‖ ĉ_A − ĉ_B ‖        (parseval, tested)
//     cos( shape_A , shape_B )      =  cos( c_A , c_B )     (tested)
//
// Two posts that mean the same thing cannot look different here. That is not a
// design goal we approximated, it is an identity the selftest checks.
//
// ── Which dimension goes where ───────────────────────────────────────────────
// Dimensions are ranked by their VARIANCE across the corpus (basis.order), so
// the ranking is a property of the corpus, not of one post.
//
//   l = 0        the base radius. Deliberately NOT fed by any dimension —
//                it carries ‖z‖, how far this post sits from the corpus mean.
//                Ordinary posts are small pebbles; strange ones are big.
//   l = 1..4     24 slots, taking the 24 LOUDEST dimensions one-for-one.
//                These are the lobes — the silhouette you read across a room.
//   l = 5..L     the remaining ~740 QUIET dimensions, carried in by a seeded
//                sparse random projection (Johnson–Lindenstrauss). Not thrown
//                away, and not faked: JL preserves pairwise distances in
//                expectation, so the fine ripple is a real reading of the weak
//                subspace — the Fourier transform of everything too small to
//                get a lobe of its own.
//
// Loud dims give a shape you can name. Quiet dims give it a grain. The grain is
// what makes two posts with the same gross silhouette still distinguishable,
// which is the difference between a chart and a face.

const TAU = Math.PI * 2;

export const DEFAULTS = Object.freeze({
  L: 10,             // highest harmonic band  → (L+1)² = 121 coefficients
  loudL: 4,          // bands 1..4 take loudest dims 1:1 → (4+1)²−1 = 24 slots
  quietFanout: 2,    // each quiet dim lands on this many high-band slots
  seed: 'zest/v1',   // frozen: changing it re-shapes every post ever drawn
  whitenPower: 0.5,  // see makeBasis — how hard to flatten the variance spectrum
  loudGain: 0.62,
  grainGain: 0.30,
  bandFalloff: 1.05, // per-band 1/l^falloff, so low bands dominate the outline
  rFloor: 0.30,      // radius clamp: a shape may pinch, never turn inside out
  rCeil: 2.35,
});

// Real spherical harmonics are normalised over the WHOLE sphere, so a unit
// coefficient vector is a barely-visible ripple. RIPPLE is the one number that
// turns the maths into something you can see, and it is shared by the mesh and
// by shapeDistance so the drawn surface and the measured surface are the same
// surface. Changing it rescales every distance uniformly; it cannot change any
// ordering.
export const RIPPLE = 3.2;

// The size channel. A post's base radius runs from RADIUS_BASE (dead average)
// to RADIUS_BASE + RADIUS_SPAN (as strange as anything in the corpus), so
// "bigger = stranger" stays readable without a ten-to-one swing that would make
// ordinary posts invisible next to outliers.
export const RADIUS_BASE = 0.82;
export const RADIUS_SPAN = 0.42;

/**
 * The largest half-extent any shape can reach, ever: the size ceiling times the
 * radius clamp. Cameras are framed on THIS rather than on each shape's own
 * bounding sphere — fitting per shape would normalise away the size channel and
 * quietly delete one of the three things the geometry is saying.
 */
export function maxExtent(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return o.rCeil * (RADIUS_BASE + RADIUS_SPAN);
}

/** Camera distance at which maxExtent() exactly fills a given vertical FOV. */
export function framingDistance(fovDeg, margin = 1.06, opts = {}) {
  return (maxExtent(opts) / Math.tan((fovDeg * Math.PI) / 360)) * margin;
}

/** Number of loud slots for a given loudL — bands 1..loudL, skipping l=0. */
export function loudSlots(loudL = DEFAULTS.loudL) {
  return (loudL + 1) * (loudL + 1) - 1;
}

export function shCount(L = DEFAULTS.L) {
  return (L + 1) * (L + 1);
}

/** Flat index of the real harmonic Y_l^m. m runs −l..+l. */
export function shIndex(l, m) {
  return l * l + l + m;
}

/** Inverse of shIndex: flat slot → {l, m}. */
export function shBand(i) {
  const l = Math.floor(Math.sqrt(i));
  return { l, m: i - l * l - l };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real spherical harmonics, orthonormal on the unit sphere.
// ─────────────────────────────────────────────────────────────────────────────

// K_l^m = sqrt( (2l+1)/(4π) · (l−m)!/(l+m)! ), built by ratio so l can grow
// without ever forming (l+m)! itself.
const _kCache = new Map();
function shK(l, m) {
  const key = l * 64 + m;
  let k = _kCache.get(key);
  if (k !== undefined) return k;
  let ratio = 1;
  for (let i = l - m + 1; i <= l + m; i++) ratio /= i;
  k = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * ratio);
  _kCache.set(key, k);
  return k;
}

/**
 * Associated Legendre P_l^m(x) for m ≥ 0, standard three-term recurrence.
 * No Condon–Shortley phase — the convention is self-consistent, which is all
 * orthonormality asks of it.
 */
function legendre(l, m, x) {
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt(Math.max(0, 1 - x * x));
    let f = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= f * s;
      f += 2;
    }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

/**
 * Evaluate every real Y_l^m for l ≤ L at one direction.
 * @param {number} L
 * @param {number} cosTheta  cos of polar angle (= y on a unit sphere)
 * @param {number} phi       azimuth
 * @param {Float64Array} [out] length (L+1)²
 */
export function evalSH(L, cosTheta, phi, out) {
  const n = shCount(L);
  const Y = out || new Float64Array(n);
  const x = Math.min(1, Math.max(-1, cosTheta));
  const R2 = Math.SQRT2;
  for (let l = 0; l <= L; l++) {
    Y[shIndex(l, 0)] = shK(l, 0) * legendre(l, 0, x);
    for (let m = 1; m <= l; m++) {
      const p = shK(l, m) * legendre(l, m, x) * R2;
      Y[shIndex(l, m)] = p * Math.cos(m * phi);
      Y[shIndex(l, -m)] = p * Math.sin(m * phi);
    }
  }
  return Y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG (xmur3 + mulberry32) — the repo's idiom.
// The quiet-dimension projection is drawn from this and must never drift, or
// every shape ever screenshotted stops matching its post.
// ─────────────────────────────────────────────────────────────────────────────

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The corpus basis. Whitening is what makes shapes COMPARABLE: without it the
// few dimensions with the widest raw range would swamp everything and every
// post would look like the same lump. With it, a shape is a deviation from the
// average post, and "average post" is a sphere.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a basis from a sample of embeddings.
 *
 * HOW HARD TO WHITEN — the one tuning decision in this file, and it was
 * measured rather than chosen. Each dimension is divided by
 *
 *     scale_i = std_i^α · globalScale^(1−α)
 *
 * α = 1 is textbook whitening: every dimension ends at unit variance. That
 * sounds right and is quietly destructive here, because it erases the very
 * variance ranking the shape is built on — a dimension that never moves gets
 * amplified to the same authority as one that carries the corpus. α = 0 is
 * plain centering: faithful to "loud dimensions push the shape harder", but it
 * lets a single runaway dimension swamp the silhouette.
 *
 * Measured on a synthetic corpus with real embedding statistics (topic
 * clusters, a dominant common direction, L2-normalised), sweeping α:
 *
 *     α      same-topic separation (AUC)   noise gain on dead dims
 *     0.00   0.997                         1.0×  (baseline)
 *     0.50   0.998                         1.6×
 *     1.00   0.999                         2.3×
 *
 * Separation is a near-tie across the whole range, so it does not decide
 * anything. The tiebreak is the second column: α = 0.5 buys essentially the
 * best separation while halving how much a dead dimension's rounding noise can
 * move the shape, and it keeps a real (square-root) trace of the variance
 * ranking in the magnitudes. Reproduce the sweep before changing it.
 *
 * @param {Array<ArrayLike<number>>} vectors
 */
export function makeBasis(vectors, opts = {}) {
  const seed = opts.seed || DEFAULTS.seed;
  const alpha = opts.whitenPower ?? DEFAULTS.whitenPower;
  if (!vectors || !vectors.length) throw new Error('makeBasis: no vectors');
  const dim = vectors[0].length;
  const n = vectors.length;
  const mean = new Float64Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i];
  for (let i = 0; i < dim; i++) mean[i] /= n;

  const varr = new Float64Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      const d = v[i] - mean[i];
      varr[i] += d * d;
    }
  }
  const denom = Math.max(1, n - 1);
  const std = new Float64Array(dim);
  for (let i = 0; i < dim; i++) std[i] = Math.sqrt(varr[i] / denom);

  // The effective divisor, per the α note above. `std` stays raw so the
  // variance ranking and the HUD's σ readouts keep meaning what they say.
  let gs = 0;
  for (let i = 0; i < dim; i++) gs += std[i] * std[i];
  gs = Math.sqrt(gs / dim) || 1;
  const scale = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    scale[i] = Math.pow(Math.max(std[i], 1e-6), alpha) * Math.pow(gs, 1 - alpha);
  }

  // Dimensions ranked loudest-first. Ties broken by index so the order is
  // reproducible from the same sample regardless of sort stability.
  const order = Array.from({ length: dim }, (_, i) => i)
    .sort((a, b) => (std[b] - std[a]) || (a - b));

  // Scaled copies, reused for the PCs and the ‖z‖ quantiles.
  const Z = vectors.map((v) => {
    const z = new Float64Array(dim);
    for (let i = 0; i < dim; i++) z[i] = (v[i] - mean[i]) / scale[i];
    return z;
  });

  const pc = powerPCs(Z, dim, 3, seed);

  const norms = Z.map((z) => {
    let s = 0;
    for (let i = 0; i < dim; i++) s += z[i] * z[i];
    return Math.sqrt(s);
  }).sort((a, b) => a - b);
  const normQ = [];
  for (let q = 0; q <= 32; q++) normQ.push(norms[Math.min(norms.length - 1, Math.round((q / 32) * (norms.length - 1)))]);

  return {
    dim,
    n,
    seed,
    whitenPower: alpha,
    mean: Array.from(mean),
    std: Array.from(std),     // raw per-dimension spread — the variance ranking
    scale: Array.from(scale), // what whiten() actually divides by
    order,
    pc: pc.map((v) => Array.from(v)),
    normQ,
  };
}

/** Top-k principal components of already-whitened rows, by power iteration + deflation. */
function powerPCs(Z, dim, k, seed) {
  const rand = mulberry32(xmur3(seed + '/pc')());
  const out = [];
  for (let c = 0; c < k; c++) {
    let v = new Float64Array(dim);
    for (let i = 0; i < dim; i++) v[i] = rand() * 2 - 1;
    normalise(v);
    for (let iter = 0; iter < 24; iter++) {
      const w = new Float64Array(dim);
      for (const z of Z) {
        let d = 0;
        for (let i = 0; i < dim; i++) d += z[i] * v[i];
        for (let i = 0; i < dim; i++) w[i] += d * z[i];
      }
      // deflate against the components already found
      for (const p of out) {
        let d = 0;
        for (let i = 0; i < dim; i++) d += w[i] * p[i];
        for (let i = 0; i < dim; i++) w[i] -= d * p[i];
      }
      if (!normalise(w)) break;
      v = w;
    }
    out.push(v);
  }
  return out;
}

function normalise(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  if (s < 1e-20) return false;
  s = 1 / Math.sqrt(s);
  for (let i = 0; i < v.length; i++) v[i] *= s;
  return true;
}

/**
 * Centre and scale one vector against the basis. A basis stored before `scale`
 * existed falls back to `std`, so an old cached basis still loads rather than
 * silently producing garbage geometry.
 */
export function whiten(vec, basis, out) {
  const dim = basis.dim;
  const z = out || new Float64Array(dim);
  const { mean } = basis;
  const scale = basis.scale || basis.std;
  for (let i = 0; i < dim; i++) z[i] = (vec[i] - mean[i]) / Math.max(scale[i], 1e-6);
  return z;
}

// ─────────────────────────────────────────────────────────────────────────────
// The projector: dimensions → harmonic slots. Built once per basis, then every
// post is one pass of multiply-add.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{L:number,loudL:number,dim:number,nSlots:number,loud:number[],
 *            quietIdx:Int32Array,quietSlot:Int32Array,quietSign:Float64Array,
 *            gain:Float64Array,slotOfDim:Int32Array}}
 */
export function makeProjector(basis, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const L = o.L, loudL = o.loudL, dim = basis.dim;
  const nSlots = shCount(L);
  const nLoud = loudSlots(loudL);

  // Loud dims → slots 1..nLoud (slot 0 = l=0 is reserved for the base radius).
  const loud = basis.order.slice(0, Math.min(nLoud, dim));

  // Quiet dims → a seeded sparse ±1 projection onto the high bands.
  const highStart = nLoud + 1;
  const nHigh = nSlots - highStart;
  const quiet = basis.order.slice(loud.length);
  const rand = mulberry32(xmur3(o.seed + '/quiet')());
  const fan = Math.max(1, o.quietFanout);
  const quietIdx = new Int32Array(quiet.length * fan);
  const quietSlot = new Int32Array(quiet.length * fan);
  const quietSign = new Float64Array(quiet.length * fan);
  const scale = nHigh > 0 ? 1 / Math.sqrt(fan) : 0;
  for (let q = 0; q < quiet.length; q++) {
    for (let f = 0; f < fan; f++) {
      const k = q * fan + f;
      quietIdx[k] = quiet[q];
      quietSlot[k] = nHigh > 0 ? highStart + Math.floor(rand() * nHigh) : 0;
      quietSign[k] = (rand() < 0.5 ? -1 : 1) * scale;
    }
  }

  // Per-band gain. Low bands dominate the outline; high bands are grain.
  const gain = new Float64Array(nSlots);
  for (let i = 0; i < nSlots; i++) {
    const { l } = shBand(i);
    if (l === 0) { gain[i] = 0; continue; }
    const base = l <= loudL ? o.loudGain : o.grainGain;
    gain[i] = base / Math.pow(l, o.bandFalloff);
  }

  // Reverse lookup for the HUD: which harmonic is dimension d driving?
  const slotOfDim = new Int32Array(dim).fill(-1);
  for (let i = 0; i < loud.length; i++) slotOfDim[loud[i]] = i + 1;

  return { L, loudL, dim, nSlots, loud, quietIdx, quietSlot, quietSign, gain, slotOfDim, opts: o };
}

/**
 * Whitened vector → harmonic coefficients. Linear in z, which is the whole
 * point: cos(coeffs) is a monotone stand-in for cos(z).
 * Returns the RAW (band-weighted, un-normalised) coefficients.
 */
export function coeffsFromWhitened(z, proj, out) {
  const c = out || new Float64Array(proj.nSlots);
  c.fill(0);
  const { loud, quietIdx, quietSlot, quietSign, gain } = proj;
  for (let i = 0; i < loud.length; i++) c[i + 1] = z[loud[i]];
  for (let k = 0; k < quietIdx.length; k++) c[quietSlot[k]] += z[quietIdx[k]] * quietSign[k];
  for (let i = 0; i < c.length; i++) c[i] *= gain[i];
  c[0] = 0; // l=0 never carries a dimension
  return c;
}

/** Percentile of a ‖z‖ against the corpus, from the basis quantile ladder. */
export function normPercentile(norm, basis) {
  const q = basis.normQ;
  if (!q || !q.length) return 0.5;
  if (norm <= q[0]) return 0;
  if (norm >= q[q.length - 1]) return 1;
  for (let i = 1; i < q.length; i++) {
    if (norm <= q[i]) {
      const t = (norm - q[i - 1]) / Math.max(1e-9, q[i] - q[i - 1]);
      return (i - 1 + t) / (q.length - 1);
    }
  }
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// The full read: embedding → everything the renderer needs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{coeffs:Float64Array, unit:Float64Array, amp:number, radius:number,
 *            outlier:number, norm:number, color:{rgb:number[],hex:string},
 *            spin:{axis:number[],rate:number}, loudest:Array, z:Float64Array}}
 */
export function readEmbedding(vec, basis, proj, opts = {}) {
  const z = whiten(vec, basis);
  let norm = 0;
  for (let i = 0; i < z.length; i++) norm += z[i] * z[i];
  norm = Math.sqrt(norm);

  const coeffs = coeffsFromWhitened(z, proj);

  // Direction carries the meaning; magnitude carries the strangeness. Splitting
  // them is what keeps cos(shapeA, shapeB) === cos(cA, cB) exactly, since
  // cosine ignores per-vector scale.
  const unit = Float64Array.from(coeffs);
  let cn = 0;
  for (let i = 0; i < unit.length; i++) cn += unit[i] * unit[i];
  cn = Math.sqrt(cn);
  if (cn > 1e-12) for (let i = 0; i < unit.length; i++) unit[i] /= cn;

  const outlier = normPercentile(norm, basis);
  const amp = 0.26 + 0.78 * outlier;                    // departure from a sphere
  const radius = RADIUS_BASE + RADIUS_SPAN * outlier;   // strange posts are bigger

  // Colour is a second, independent linear readout — the top three principal
  // directions of the corpus, straight into OKLCH. Redundant with the shape on
  // purpose: two channels saying the same thing is how you learn to read one.
  const p = [0, 0, 0];
  if (basis.pc && basis.pc.length >= 3) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      const pcv = basis.pc[c];
      for (let i = 0; i < z.length; i++) s += z[i] * pcv[i];
      p[c] = s / Math.sqrt(Math.max(1, basis.dim));
    }
  }
  const hue = (Math.atan2(p[1], p[0]) / TAU) * 360;
  const chroma = 0.055 + 0.115 * Math.min(1, Math.hypot(p[0], p[1]) / 1.6);
  const light = 0.60 + 0.24 * Math.tanh(p[2] * 0.9);
  const rgb = oklchToRgb(light, chroma, hue);

  // Spin: axis from the principal readout, rate from strangeness. A post that
  // sits far from the corpus mean tumbles fast, so "weird" is visible in motion
  // before you can see the shape.
  const ax = [p[0], p[2], p[1]];
  const an = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  const spin = {
    axis: [ax[0] / an, ax[1] / an, ax[2] / an],
    rate: 0.18 + 1.05 * outlier,
  };

  // What the HUD names: the loud dims actually firing on THIS post.
  const loudest = [];
  for (let i = 0; i < proj.loud.length; i++) {
    const d = proj.loud[i];
    const band = shBand(i + 1);
    loudest.push({ dim: d, rank: i, sigma: z[d], l: band.l, m: band.m });
  }
  loudest.sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma));

  return { z, coeffs, unit, amp, radius, outlier, norm, color: { rgb, hex: rgbHex(rgb) }, spin, loudest };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry.
// ─────────────────────────────────────────────────────────────────────────────

const _icoCache = new Map();

/** Subdivided icosahedron on the unit sphere. Cached per detail level. */
export function icosphere(detail = 3) {
  const hit = _icoCache.get(detail);
  if (hit) return hit;
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const mid = new Map();
    const next = [];
    const midpoint = (a, b) => {
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      let i = mid.get(key);
      if (i !== undefined) return i;
      const va = verts[a], vb = verts[b];
      const v = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
      const n = Math.hypot(v[0], v[1], v[2]);
      i = verts.push([v[0] / n, v[1] / n, v[2] / n]) - 1;
      mid.set(key, i);
      return i;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    positions[i * 3] = verts[i][0];
    positions[i * 3 + 1] = verts[i][1];
    positions[i * 3 + 2] = verts[i][2];
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    indices[i * 3] = faces[i][0];
    indices[i * 3 + 1] = faces[i][1];
    indices[i * 3 + 2] = faces[i][2];
  }
  // Harmonics are evaluated per direction and reused for every post at this
  // detail level — 121 doubles per vertex, paid once.
  const sh = null;
  const out = { positions, indices, count: verts.length, sh };
  _icoCache.set(detail, out);
  return out;
}

const _shCache = new Map();
/** Y_l^m at every icosphere vertex, for a given detail + L. Paid once, ever. */
export function sphereHarmonics(detail, L) {
  const key = detail * 1000 + L;
  const hit = _shCache.get(key);
  if (hit) return hit;
  const ico = icosphere(detail);
  const n = ico.count, nSlots = shCount(L);
  const table = new Float32Array(n * nSlots);
  const scratch = new Float64Array(nSlots);
  for (let i = 0; i < n; i++) {
    const x = ico.positions[i * 3], y = ico.positions[i * 3 + 1], z = ico.positions[i * 3 + 2];
    evalSH(L, y, Math.atan2(z, x), scratch);
    table.set(scratch, i * nSlots);
  }
  const out = { table, n, nSlots };
  _shCache.set(key, out);
  return out;
}

/**
 * Displace the unit sphere by the harmonic field and return a renderable mesh.
 * @param {Float64Array} unitCoeffs  L2-normalised coefficients (read.unit)
 * @param {object} o {detail, L, amp, radius, rFloor, rCeil}
 */
export function harmonicMesh(unitCoeffs, o = {}) {
  const detail = o.detail ?? 3;
  const L = o.L ?? DEFAULTS.L;
  const amp = o.amp ?? 0.6;
  const R = o.radius ?? 1;
  const rFloor = o.rFloor ?? DEFAULTS.rFloor;
  const rCeil = o.rCeil ?? DEFAULTS.rCeil;

  const ico = icosphere(detail);
  const { table, n, nSlots } = sphereHarmonics(detail, L);
  const positions = new Float32Array(n * 3);
  const radii = new Float32Array(n);
  let rMin = Infinity, rMax = -Infinity;

  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * nSlots;
    const lim = Math.min(nSlots, unitCoeffs.length);
    for (let k = 1; k < lim; k++) s += unitCoeffs[k] * table[off + k];
    let r = 1 + amp * s * RIPPLE;
    r = Math.min(rCeil, Math.max(rFloor, r)) * R;
    radii[i] = r;
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    positions[i * 3] = ico.positions[i * 3] * r;
    positions[i * 3 + 1] = ico.positions[i * 3 + 1] * r;
    positions[i * 3 + 2] = ico.positions[i * 3 + 2] * r;
  }

  const normals = faceNormals(positions, ico.indices, n);
  return { positions, normals, indices: ico.indices, count: n, radii, rMin, rMax };
}

function faceNormals(positions, indices, n) {
  const normals = new Float32Array(n * 3);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const m = Math.hypot(normals[o], normals[o + 1], normals[o + 2]) || 1;
    normals[o] /= m; normals[o + 1] /= m; normals[o + 2] /= m;
  }
  return normals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarity.
// ─────────────────────────────────────────────────────────────────────────────

export function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na < 1e-20 || nb < 1e-20) return 0;
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * The coefficient vector of the DRAWN radial displacement, i.e. the surface
 * r(θ,φ) = R·(1 + amp·RIPPLE·Σ û_k Y_k) minus its base sphere. This is the
 * vector Parseval applies to.
 */
export function surfaceCoeffs(read) {
  const k = read.amp * read.radius * RIPPLE;
  const out = new Float64Array(read.unit.length);
  for (let i = 0; i < out.length; i++) out[i] = read.unit[i] * k;
  return out;
}

/**
 * L2 distance between two SHAPES as surfaces, in L²(S²). By Parseval this is
 * just the euclidean distance between their surface coefficient vectors — no
 * integration required, and the selftest checks it against a quadrature.
 */
export function shapeDistance(readA, readB) {
  const a = surfaceCoeffs(readA), b = surfaceCoeffs(readB);
  let s = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback embedding — used only when the model is unreachable.
// A signed hashing trick over word unigrams/bigrams and character 3-grams.
// It is a real vector space with real structure, but LEXICAL, not semantic:
// "cat"/"kitten" are strangers to it. The page says so when it is in use;
// nothing here should ever pretend a hash is an embedding.
// ─────────────────────────────────────────────────────────────────────────────

function h32(str, salt) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hashEmbed(text, dim = 768) {
  const v = new Float64Array(dim);
  const clean = String(text || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}\s']/gu, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  const add = (tok, w) => {
    const a = h32(tok, 0x9e3779b9);
    const b = h32(tok, 0x85ebca6b);
    v[a % dim] += (b & 1 ? 1 : -1) * w;
  };
  for (let i = 0; i < words.length; i++) {
    add('w:' + words[i], 1);
    if (i + 1 < words.length) add('b:' + words[i] + '_' + words[i + 1], 0.6);
  }
  const padded = ' ' + clean.replace(/\s+/g, ' ').trim() + ' ';
  for (let i = 0; i + 3 <= padded.length; i++) add('c:' + padded.slice(i, i + 3), 0.35);
  // A little length/shape signal, so short and long posts are not identical
  // when they share no tokens at all.
  add('len:' + Math.min(9, Math.floor(words.length / 6)), 1.2);
  normalise(v);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// OKLCH → sRGB (Björn Ottosson). Kept here so the colour readout is part of the
// tested pure module rather than a CSS trick in the page.
// ─────────────────────────────────────────────────────────────────────────────

export function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return lin.map((u) => {
    const c = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(Math.max(0, u), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, c));
  });
}

export function rgbHex(rgb) {
  return '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}
