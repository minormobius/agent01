// proofs/seymour/seymour.js — Seymour's second-neighbourhood conjecture:
// oriented graphs, first and second out-neighbourhoods, and the searches a
// browser can run against the 2026 claim that some vertex always has
// |N⁺⁺(v)| ≥ |N⁺(v)|.
//
// The ONE copy of the maths: index.html, search.worker.js and
// seymour.selftest.mjs all import it.
//
// Source: openai/math family 173, "A proof of Seymour's second-neighborhood
// conjecture" (Lean main result OAI.SeymourSecondNeighborhood.exists_goodVertex).
//
// Representation: a graph on n ≤ 31 vertices is an array out[v] of bitmasks,
// bit u set iff v → u. Oriented = no loops, no pair u → v → u.

export const popcount = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

export function empty(n) { return { n, out: new Array(n).fill(0) }; }
export const hasArc = (g, u, v) => ((g.out[u] >>> v) & 1) === 1;

export function isOriented(g) {
  for (let v = 0; v < g.n; v++) {
    if ((g.out[v] >>> v) & 1) return false;
    for (let u = 0; u < g.n; u++) if (hasArc(g, v, u) && hasArc(g, u, v)) return false;
  }
  return true;
}

/** N⁺(v): the out-neighbours. */
export const first = (g, v) => g.out[v];
/** N⁺⁺(v): reachable in two steps, minus v and minus N⁺(v) — the Lean `secondNeighbors`. */
export function second(g, v) {
  let m = 0, f = g.out[v];
  for (let u = 0; f >>> u; u++) if ((f >>> u) & 1) m |= g.out[u];
  return m & ~f & ~(1 << v);
}
export function degrees(g) {
  return Array.from({ length: g.n }, (_, v) => ({ v, d1: popcount(first(g, v)), d2: popcount(second(g, v)) }));
}
/** The vertices with |N⁺| ≤ |N⁺⁺| — the theorem says at least one exists. */
export const goodVertices = (g) => degrees(g).filter((d) => d.d1 <= d.d2).map((d) => d.v);
/** Slack of the best vertex: max over v of |N⁺⁺(v)| − |N⁺(v)|. A counterexample has slack < 0. */
export const slack = (g) => Math.max(...degrees(g).map((d) => d.d2 - d.d1));

/**
 * The Lean definitions, transcribed literally over a relation r(v, u) — no
 * bitmasks — so the fast version can be checked against them.
 */
export function leanSecondNeighbors(r, n, v) {
  const out = [];
  for (let w = 0; w < n; w++) {
    if (w === v || r(v, w)) continue;
    for (let u = 0; u < n; u++) if (r(v, u) && r(u, w)) { out.push(w); break; }
  }
  return out;
}
export function leanFirstNeighbors(r, n, v) {
  const out = [];
  for (let w = 0; w < n; w++) if (r(v, w)) out.push(w);
  return out;
}

// ---------------------------------------------------------- generators ----
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
/** Each pair independently: no arc with probability 1 − p, else a random direction. */
export function randomOriented(n, p, rnd = Math.random) {
  const g = empty(n);
  for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++)
    if (rnd() < p) { if (rnd() < 0.5) g.out[u] |= 1 << v; else g.out[v] |= 1 << u; }
  return g;
}
export const randomTournament = (n, rnd = Math.random) => randomOriented(n, 1, rnd);
/** Paley tournament on Z_p (p ≡ 3 mod 4 prime): v → v + q for every nonzero square q. */
export function paley(p) {
  const qr = new Set();
  for (let x = 1; x < p; x++) qr.add((x * x) % p);
  const g = empty(p);
  for (let v = 0; v < p; v++) for (const q of qr) g.out[v] |= 1 << ((v + q) % p);
  return g;
}
/** The directed cycle v → v+1. */
export function cycle(n) {
  const g = empty(n);
  for (let v = 0; v < n; v++) g.out[v] |= 1 << ((v + 1) % n);
  return g;
}
/** Circulant oriented graph: v → v + s for each s in S (S ∩ −S must be empty mod n). */
export function circulant(n, S) {
  const g = empty(n);
  for (let v = 0; v < n; v++) for (const s of S) g.out[v] |= 1 << ((((v + s) % n) + n) % n);
  return g;
}

// ------------------------------------------------------------- searches ---
/**
 * Every labelled oriented graph on n vertices: each of the C(n,2) pairs is
 * absent, u→v or v→u, so 3^C(n,2) graphs. Returns the count, the smallest
 * best-vertex slack seen, a witness for it, and any counterexample.
 * n = 6 is 14,348,907 graphs.
 */
export function exhaust(n, { onProgress = null } = {}) {
  const pairs = [];
  for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) pairs.push([u, v]);
  const m = pairs.length, out = new Int32Array(n), digit = new Int8Array(m);
  let count = 0, minSlack = Infinity, witness = null, counterexample = null, tightGraphs = 0;
  // sinks are trivially good (0 ≤ 0); the interesting graphs have none
  let sinkFree = 0, sinkFreeTight = 0, fewestGood = Infinity, fewestWitness = null;
  const total = 3 ** m;
  for (let idx = 0; idx < total; idx++) {
    // increment the base-3 counter and patch the two affected masks
    if (idx > 0) {
      let k = 0;
      for (;;) {
        const [u, v] = pairs[k];
        const d = digit[k];
        if (d === 1) out[u] &= ~(1 << v); else if (d === 2) out[v] &= ~(1 << u);
        digit[k] = (d + 1) % 3;
        if (digit[k] === 1) out[u] |= 1 << v; else if (digit[k] === 2) out[v] |= 1 << u;
        if (digit[k] !== 0) break;
        k++;
      }
    }
    count++;
    let best = -Infinity, good = 0, sink = false;
    for (let v = 0; v < n; v++) {
      let f = out[v], s = 0;
      if (f === 0) sink = true;
      for (let u = 0; f >>> u; u++) if ((f >>> u) & 1) s |= out[u];
      s &= ~f & ~(1 << v);
      const d = popcount(s) - popcount(f);
      if (d > best) best = d;
      if (d >= 0) good++;
    }
    if (best < 0) { counterexample = Array.from(out); break; }
    if (best === 0) tightGraphs++;
    if (!sink) {
      sinkFree++;
      if (best === 0) sinkFreeTight++;
      if (good < fewestGood) { fewestGood = good; fewestWitness = Array.from(out); }
    }
    if (best < minSlack) { minSlack = best; witness = Array.from(out); }
    if (onProgress && (idx & 0x3ffff) === 0) onProgress(idx, total);
  }
  return { n, count, total, minSlack, witness, counterexample, tightGraphs, sinkFree, sinkFreeTight, fewestGood, fewestWitness };
}

/**
 * Adversarial hill-climb: start from a random oriented graph and repeatedly
 * change one pair (absent / u→v / v→u) to lower the best vertex's slack,
 * breaking ties by how many vertices are good. A counterexample would reach
 * slack −1. Returns the best graph found.
 */
export function hunt(n, { steps = 4000, restarts = 6, seed = 1 } = {}) {
  const rnd = rng(seed);
  // sinks are trivially good, so every vertex must keep an out-arc: a sink costs 10⁶
  const score = (g) => { const ds = degrees(g); let best = -Infinity, good = 0, sinks = 0; for (const d of ds) { best = Math.max(best, d.d2 - d.d1); if (d.d1 <= d.d2) good++; if (d.d1 === 0) sinks++; } return sinks * 1e6 + best * 1000 + good; };
  let bestG = null, bestS = Infinity;
  for (let r = 0; r < restarts; r++) {
    const g = randomOriented(n, 0.5 + 0.4 * rnd(), rnd);
    let cur = score(g);
    for (let t = 0; t < steps; t++) {
      const u = Math.floor(rnd() * n); let v = Math.floor(rnd() * (n - 1)); if (v >= u) v++;
      const before = [g.out[u], g.out[v]];
      const state = hasArc(g, u, v) ? 1 : hasArc(g, v, u) ? 2 : 0;
      const next = (state + 1 + Math.floor(rnd() * 2)) % 3;
      g.out[u] &= ~(1 << v); g.out[v] &= ~(1 << u);
      if (next === 1) g.out[u] |= 1 << v; else if (next === 2) g.out[v] |= 1 << u;
      const s = score(g);
      if (s <= cur || rnd() < 0.02) cur = s; else { g.out[u] = before[0]; g.out[v] = before[1]; }
    }
    if (cur < bestS) { bestS = cur; bestG = { n, out: [...g.out] }; }
  }
  return { graph: bestG, slack: slack(bestG), good: goodVertices(bestG).length, sinks: degrees(bestG).filter((d) => d.d1 === 0).length };
}

/** Labelled oriented graphs on n vertices: 3^C(n,2). */
export const countOriented = (n) => 3 ** (n * (n - 1) / 2);

// History, from the paper's introduction
export const MILESTONES = [
  { year: 1990, text: 'Seymour poses the conjecture; Dean and Latka record it in 1995.' },
  { year: 1996, text: 'Fisher proves it for tournaments (Dean’s conjecture).' },
  { year: 2000, text: 'Havet and Thomassé: a combinatorial proof for tournaments via median orders.' },
  { year: 2001, text: 'Kaneko and Locke: true when the minimum outdegree is at most 6.' },
  { year: 2003, text: 'Chen, Shen and Yuster: some vertex always has |N⁺⁺| ≥ 0.657·|N⁺|.' },
  { year: 2024, text: 'Huang and Peng raise the ratio to 0.7155.' },
  { year: 2026, text: 'Claimed in full: some vertex always has |N⁺⁺| ≥ |N⁺| (Lean-formalized).' },
];
