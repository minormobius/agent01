// proofs/hadamard/hadamard.js — circulant Hadamard matrices and Barker sequences:
// the objects, the identities that constrain them, and the searches a browser
// can run against the 2026 claim that orders 1 and 4 are the only ones.
//
// The ONE copy of the maths: index.html imports it, so do the Web Worker and
// hadamard.selftest.mjs.
//
// Source: openai/math family 179, "The circulant Hadamard conjecture"
// (Lean main result OAI.CirculantHadamard.exists_iff_order_one_or_four).
// Definitions follow the Comparator statement: a sign matrix H with
// H_ij = h_{(j−i) mod n} and H·Hᵀ = n·I.

// ------------------------------------------------------------ objects ------
/** The circulant matrix with first row h: H[i][j] = h[(j − i) mod n] (the Lean definition). */
export function circulant(h) {
  const n = h.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => h[(((j - i) % n) + n) % n]));
}
/** H·Hᵀ, computed as a matrix product: the Lean condition, literally. */
export function gram(H) {
  const n = H.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += H[i][k] * H[j][k];
    return s;
  }));
}
/** Periodic autocorrelation P_h(t) = Σ_j h_j h_{j+t mod n}, t = 0..n−1 (paper §1). */
export function periodic(h) {
  const n = h.length, P = new Array(n).fill(0);
  for (let t = 0; t < n; t++) for (let j = 0; j < n; j++) P[t] += h[j] * h[(j + t) % n];
  return P;
}
/** Aperiodic autocorrelation C_a(t) = Σ_{j<n−t} a_j a_{j+t}, t = 0..n−1. */
export function aperiodic(a) {
  const n = a.length, C = new Array(n).fill(0);
  for (let t = 0; t < n; t++) for (let j = 0; j + t < n; j++) C[t] += a[j] * a[j + t];
  return C;
}
/** Circulant Hadamard iff every nontrivial periodic autocorrelation vanishes. */
export const isCirculantHadamard = (h) => periodic(h).every((p, t) => t === 0 || p === 0);
/** Barker iff every nontrivial aperiodic autocorrelation has |C| ≤ 1. */
export const isBarker = (a) => aperiodic(a).every((c, t) => t === 0 || Math.abs(c) <= 1);
/** Off-diagonal energy Σ_{t≥1} P(t)²: zero exactly for a circulant Hadamard row. */
export const energy = (h) => periodic(h).reduce((s, p, t) => s + (t ? p * p : 0), 0);

export const parse = (s) => [...s].filter((c) => c === '+' || c === '-').map((c) => (c === '+' ? 1 : -1));
export const show = (a) => a.map((x) => (x > 0 ? '+' : '−')).join('');

// ---------------------------------------------------------- identities -----
// (Σ h_j)² = Σ_t P_h(t): every ordered pair of positions is counted once on
// each side. For a circulant Hadamard row this is s² = n, so n is a square.
export const rowSum = (h) => h.reduce((s, x) => s + x, 0);
/**
 * The difference-set picture (paper §1): with D = {j : h_j = −1}, k = |D|,
 * P_h(t) = n − 4k + 4·N_D(t), where N_D(t) counts ordered (a, b) ∈ D² with
 * a − b ≡ t. Returns { D, k, N } so callers can check the identity.
 */
export function differenceSet(h) {
  const n = h.length, D = [];
  h.forEach((x, j) => { if (x < 0) D.push(j); });
  const N = new Array(n).fill(0);
  for (const a of D) for (const b of D) N[(((a - b) % n) + n) % n]++;
  return { D, k: D.length, N };
}

// ------------------------------------------------------------- searches ----
/**
 * Every first row of a circulant Hadamard matrix of order n, by brute force
 * over all 2^n sign vectors, using NO theory (no row-sum filter). Returns the
 * rows found. Feasible to n ≈ 22 in node, n ≈ 18 in a browser tab.
 */
export function bruteCirculant(n) {
  const out = [], h = new Int8Array(n);
  for (let mask = 0; mask < 2 ** n; mask++) {
    for (let j = 0; j < n; j++) h[j] = (mask >> j) & 1 ? -1 : 1;
    let ok = true;
    for (let t = 1; t < n && ok; t++) {
      let p = 0;
      for (let j = 0; j < n; j++) p += h[j] * h[(j + t) % n];
      if (p !== 0) ok = false;
    }
    if (ok) out.push(Array.from(h));
  }
  return out;
}

/**
 * Every Barker sequence of length n, by backtracking from both ends: once the
 * first d and last d signs are fixed, C(t) is fully determined for every
 * t ≥ n − d, so |C(t)| ≤ 1 prunes early. Returns { seqs, nodes }.
 */
export function barkerSearch(n, { limit = Infinity } = {}) {
  const a = new Int8Array(n), seqs = [];
  let nodes = 0;
  if (n === 1) return { seqs: [[1], [-1]], nodes: 1 };
  // positions in filling order: 0, n−1, 1, n−2, …
  const order = [];
  for (let i = 0, j = n - 1; i <= j; i++, j--) { order.push(i); if (j !== i) order.push(j); }
  const known = new Int8Array(n);
  const check = (filled) => {
    // shifts whose terms are all known: t with every pair (j, j+t), j < n−t, filled
    const d = Math.floor(filled / 2);                 // prefix and suffix both of length ≥ d
    for (let t = Math.max(1, n - d); t < n; t++) {
      let c = 0;
      for (let j = 0; j + t < n; j++) c += a[j] * a[j + t];
      if (c > 1 || c < -1) return false;
    }
    return true;
  };
  const go = (k) => {
    nodes++;
    if (seqs.length >= limit) return;
    if (k === order.length) { if (isBarker(Array.from(a))) seqs.push(Array.from(a)); return; }
    const pos = order[k];
    for (const s of [1, -1]) {
      a[pos] = s; known[pos] = 1;
      if (k + 1 < 2 || check(k + 1)) go(k + 1);
      known[pos] = 0;
    }
  };
  go(0);
  return { seqs, nodes };
}

/** The symmetries of a Barker sequence: negation, reversal, alternating sign flip. */
export function barkerClass(a) {
  const variants = [];
  const alt = (x) => x.map((v, i) => (i % 2 ? -v : v));
  for (const r of [a, [...a].reverse()]) for (const s of [r, r.map((v) => -v)]) for (const u of [s, alt(s)]) variants.push(show(u));
  return variants.sort()[0];
}

/**
 * Local search for a circulant Hadamard row of order n: flip the sign that
 * lowers the off-diagonal energy most, restart when stuck. Returns the best
 * energy seen and its row. Energy 0 would be a circulant Hadamard matrix.
 */
export function anneal(n, { restarts = 20, seed = 1 } = {}) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let best = Infinity, bestRow = null;
  for (let r = 0; r < restarts; r++) {
    const h = Array.from({ length: n }, () => (rnd() < 0.5 ? 1 : -1));
    let e = energy(h);
    for (let guard = 0; guard < 4 * n; guard++) {
      let bj = -1, be = e;
      for (let j = 0; j < n; j++) { h[j] = -h[j]; const f = energy(h); if (f < be) { be = f; bj = j; } h[j] = -h[j]; }
      if (bj < 0) break;
      h[bj] = -h[bj]; e = be;
    }
    if (e < best) { best = e; bestRow = [...h]; }
    if (best === 0) break;
  }
  return { best, row: bestRow };
}

// ---------------------------------------------------------- order funnel ---
const isSquare = (n) => Number.isInteger(Math.sqrt(n));
/** Is u a prime power (u ≥ 2)? */
export function isPrimePower(u) {
  if (u < 2) return false;
  let p = 2;
  while (p * p <= u && u % p) p++;
  if (p * p > u) return true;          // u itself is prime
  while (u % p === 0) u /= p;
  return u === 1;
}
/**
 * Which orders n ≤ N survive each successive condition. The first two are
 * elementary and checked here; the last two are Turyn's (1965) and are cited,
 * not re-proved.
 */
export function funnel(N) {
  const all = [], sq = [], had = [], odd = [], turyn = [];
  for (let n = 1; n <= N; n++) {
    all.push(n);
    if (!isSquare(n)) continue;                      // s² = n
    sq.push(n);
    if (!(n === 1 || n % 4 === 0)) continue;         // a Hadamard order is 1, 2 or a multiple of 4
    had.push(n);
    const u = Math.sqrt(n / 4);
    if (n > 4 && u % 2 === 0) continue;              // Turyn: u odd
    odd.push(n);
    if (n > 4 && isPrimePower(u)) continue;          // Turyn: u not a prime power
    turyn.push(n);
  }
  return { all, sq, had, odd, turyn };
}

// The paper's table (from Schmidt–Willms 2016, §1)
export const BARKER_TABLE = { 2: '++', 3: '++-', 4: '+++-', 5: '+++-+', 7: '+++--+-', 11: '+++---+--+-', 13: '+++++--++-+-+' };
export const BARKER_LENGTHS = [2, 3, 4, 5, 7, 11, 13];
