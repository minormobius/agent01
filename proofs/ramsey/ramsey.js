// proofs/ramsey/ramsey.js — cycle–clique Ramsey numbers. The only copy of the maths:
// the page, search.worker.js and ramsey.selftest.mjs all import this file.
//
// R(C_m, K_n) is the least N such that every graph G on N vertices contains a cycle on
// exactly m vertices or has an independent set of n vertices (a red C_m or a blue K_n).
// The 2026 claim: R(C_m, K_n) = (m−1)(n−1) + 1 for m ≥ n ≥ 3, (m, n) ≠ (3, 3); R(C_3, K_3) = 6.
//
// The finite part of the proof (Section 9 of the paper) is implemented below from the
// paper's TEXT — the pattern recursion, the label construction, the extension rule, the
// required-path rule, the ball bounds, the packing test and the strengthening procedure —
// not translated from the release's Python. Bit d of a mask records that an outside path
// with d internal vertices is forbidden (the paper's flag convention).

export const formula = (m, n) => (m === 3 && n === 3 ? 6 : (m - 1) * (n - 1) + 1);

// ======================================================= small cases, exhaustively ===
// Grow graphs one vertex at a time (all neighbour sets of the new vertex), keeping only
// those with no C_m and no independent set of size n; both properties are inherited by
// induced subgraphs, so every good graph on N vertices is reached. levels[v] counts the
// good labelled graphs on v vertices. R = the first v with levels[v] = 0.
export function cycleThrough(adj, v, m) {
  const nb = adj[v];
  let found = false;
  const dfs = (x, used, len, target) => {
    if (found) return;
    if (len === m - 1) { if (x === target) found = true; return; }
    let c = adj[x] & ~used;
    while (c) { const b = c & -c; c ^= b; const y = 31 - Math.clz32(b); if (len + 1 === m - 1 ? y === target : y !== target) dfs(y, used | b, len + 1, target); }
  };
  let A = nb;
  while (A && !found) {
    const ba = A & -A; A ^= ba; const a = 31 - Math.clz32(ba);
    let B = A;
    while (B && !found) { const bb = B & -B; B ^= bb; const b = 31 - Math.clz32(bb); if (m === 3) { if (adj[a] & bb) found = true; } else dfs(a, (1 << v) | ba, 1, b); }
  }
  return found;
}
function hasIndependent(cands, adj, size) {
  if (size === 0) return true;
  while (cands) { const b = cands & -cands; cands ^= b; const x = 31 - Math.clz32(b); if (hasIndependent(cands & ~adj[x], adj, size - 1)) return true; }
  return false;
}
export function exhaust(m, n, maxN, onLevel) {
  const adj = new Array(maxN + 1).fill(0), levels = new Array(maxN + 2).fill(0), example = [];
  const ext = (v) => {
    levels[v]++;
    if (levels[v] === 1) example[v] = adj.slice(0, v);
    if (v === maxN + 1) return;
    const full = (1 << v) - 1;
    for (let S = 0; S <= full; S++) {
      if (hasIndependent(full & ~S, adj, n - 1)) continue;
      adj[v] = S;
      let T = S; while (T) { const b = T & -T; T ^= b; adj[31 - Math.clz32(b)] |= 1 << v; }
      if (!cycleThrough(adj, v, m)) ext(v + 1);
      T = S; while (T) { const b = T & -T; T ^= b; adj[31 - Math.clz32(b)] &= ~(1 << v); }
      adj[v] = 0;
    }
    if (onLevel) onLevel(v, levels);
  };
  ext(0);
  const R = levels.findIndex((c, v) => v > 0 && c === 0);
  return { levels: levels.slice(0, R + 1), R, example: example[R - 1] };
}
// literal checks used by the selftest and the page
export function hasCycleOfLength(adj, N, m) {
  for (let v = 0; v < N; v++) {
    // cycles whose smallest vertex is v
    let found = false;
    const dfs = (x, used, len) => {
      if (found) return;
      if (len === m) { if (adj[x] & (1 << v)) found = true; return; }
      let c = adj[x] & ~used & ~((1 << (v + 1)) - 1);
      while (c) { const b = c & -c; c ^= b; dfs(31 - Math.clz32(b), used | b, len + 1); }
    };
    dfs(v, 1 << v, 1);
    if (found) return true;
  }
  return false;
}
export function independenceNumber(adj, N) {
  let best = 0;
  const go = (cands, size) => { if (size > best) best = size; while (cands) { const b = cands & -cands; cands ^= b; const x = 31 - Math.clz32(b); go(cands & ~adj[x], size + 1); } };
  go((1 << N) - 1, 0);
  return best;
}
// the lower-bound colouring: n−1 red cliques of m−1 vertices, blue between them
export function extremal(m, n) {
  const N = (m - 1) * (n - 1), adj = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j && Math.floor(i / (m - 1)) === Math.floor(j / (m - 1))) adj[i] |= 1 << j;
  return { N, adj };
}
export const pentagon = () => ({ N: 5, adj: [0, 1, 2, 3, 4].map((i) => (1 << ((i + 1) % 5)) | (1 << ((i + 4) % 5))) });

// ===================================================== the finite path-system check ===
// The domain (finite:domain): 5 ≤ k ≤ 17, max{3, ⌊k/2⌋} ≤ t ≤ min{8, k}.
export function domain() {
  const out = [];
  for (let k = 5; k <= 17; k++) for (let t = Math.max(3, Math.floor(k / 2)); t <= Math.min(8, k); t++) out.push([k, t]);
  return out;
}
const lexCmp = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
// Lemma (pattern coverage): nondecreasing lists of reversal-normalised positive tuples with
// Σ(ℓ(p)+1) = t and Σσ(p) ≤ B.
export function patterns(t, B) {
  const tuples = [];
  const grow = (p, s) => { tuples.push(p); if (p.length + 1 > t - 1) return; for (let q = 1; s + q <= B; q++) grow([...p, q], s + q); };
  grow([], 0);
  const normal = tuples.filter((p) => lexCmp(p, [...p].reverse()) <= 0).sort(lexCmp);
  const out = [];
  const rec = (vertsLeft, budget, lower, acc) => {
    if (vertsLeft === 0) { out.push(acc); return; }
    for (const p of normal) {
      if (lower && lexCmp(p, lower) < 0) continue;
      const sig = p.reduce((s, x) => s + x, 0);
      if (p.length + 1 > vertsLeft || sig > budget) continue;
      rec(vertsLeft - p.length - 1, budget - sig, p, [...acc, p]);
    }
  };
  rec(t, B, null, []);
  return out;
}
// the paper's independent count (finite:chain-count, finite:count-series)
export function patternCount(t, B) {
  const C = (n, k) => { if (k < 0 || n < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); };
  const a = (r, m) => {
    let b;
    if (r % 2 === 0) b = m % 2 === 0 ? C(m / 2 - 1, r / 2 - 1) : 0;
    else b = C(Math.floor((m - 1) / 2), (r - 1) / 2);
    return (C(m - 1, r - 1) + b) / 2;
  };
  // coefficients of x^i y^j, i ≤ t, j ≤ B, of 1/(1−x) · Π (1 − x^{r+1} y^m)^{−a(r,m)}
  let P = Array.from({ length: t + 1 }, (_, i) => Array.from({ length: B + 1 }, (_, j) => (j === 0 ? 1 : 0)));   // 1/(1−x)
  for (let r = 1; r + 1 <= t; r++) for (let m = r; m <= B; m++) {
    const mult = a(r, m);
    for (let rep = 0; rep < mult; rep++) {                 // multiply by 1/(1 − x^{r+1} y^m)
      for (let i = r + 1; i <= t; i++) for (let j = m; j <= B; j++) P[i][j] += P[i - r - 1][j - m];
    }
  }
  return P[t].reduce((s, x) => s + x, 0);
}

// Lemma (label construction)
export function labels(pattern) {
  const clique = [], E = [], interiorOf = new Map();
  let next = 0;
  for (const p of pattern) {
    let a = next++; clique.push(a);
    for (const q of p) {
      const b = a + q + 1;
      for (let x = a + 1; x < b; x++) interiorOf.set(x, E.length);
      E.push([a, b]);
      next = b + 1; clique.push(b); a = b;
    }
  }
  const n = next, adj = new Array(n).fill(0);
  for (const a of clique) for (const b of clique) if (a !== b) adj[a] |= 1 << b;
  for (const [a, b] of E) for (let x = a; x < b; x++) { adj[x] |= 1 << (x + 1); adj[x + 1] |= 1 << x; }
  const L = E.reduce((s, [a, b]) => s + b - a - 1, 0);
  const T = (x) => (interiorOf.has(x) ? E[interiorOf.get(x)] : [x]);
  return { n, clique, E, L, adj, T, interiorOf };
}

// Lemma (extension rule): the initial forbidden-parameter matrix on S
export function initialMatrix(k, t, lab) {
  const { n, E, L, T, interiorOf } = lab, e = E.length;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) {
    // old paths not containing x or y in their interiors
    const avail = E.map((_, i) => i).filter((i) => interiorOf.get(x) !== i && interiorOf.get(y) !== i);
    let mask = 0;
    for (const z of T(x)) for (const w of T(y)) {
      if (!(z < w)) continue;
      for (let sub = 0; sub < 1 << avail.length; sub++) {
        const Es = avail.filter((_, i) => sub & (1 << i)).map((i) => E[i]);
        // degrees of z and w in E, and different components of the forest E
        let dz = 0, dw = 0; const V = new Set();
        for (const [a, b] of Es) { V.add(a); V.add(b); if (a === z || b === z) dz++; if (a === w || b === w) dw++; }
        if (dz > 1 || dw > 1) continue;
        // connectivity by union–find (the paper notes increasing routes are equivalent)
        const par = new Map(); const f = (u) => { while (par.has(u) && par.get(u) !== u) u = par.get(u); return u; };
        for (const [a, b] of Es) { const ra = f(a), rb = f(b); if (ra !== rb) par.set(ra, rb); }
        if (f(z) === f(w)) continue;
        V.add(z); V.add(w);
        const ePrime = Es.length + 1, vPrime = V.size;
        const q = Es.reduce((s, [a, b]) => s + b - a - 1, 0) + Math.abs(x - z) + Math.abs(y - w);
        const lo = Math.max(1, L + (ePrime >= e ? 1 : 0) - q), hi = k + 1 - vPrime - q;
        for (let d = lo; d <= hi; d++) mask |= 1 << d;
      }
    }
    M[x][y] = M[y][x] = mask;
  }
  return M;
}

// Lemma (required-path rule): for every simple path of length ℓ ≤ k in J, forbid k − ℓ.
// States (visited set, endpoint), merged, exactly as the paper's state induction.
export function requiredPaths(k, adj, n, M) {
  for (let s = 0; s < n; s++) {
    let layer = new Map([[(1 << s) * 32 + s, [1 << s, s]]]);
    for (let len = 1; len <= k && layer.size; len++) {
      const nextLayer = new Map();
      for (const [U, x] of layer.values()) {
        let c = adj[x] & ~U;
        while (c) {
          const b = c & -c; c ^= b; const y = 31 - Math.clz32(b), U2 = U | b, key = U2 * 32 + y;
          if (!nextLayer.has(key)) nextLayer.set(key, [U2, y]);
          M[s][y] |= 1 << (k - len);
        }
      }
      layer = nextLayer;
    }
  }
}
export function edgeConflict(adj, n, M) {
  for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) if (adj[x] & (1 << y) && M[x][y] & 1) return [x, y];
  return null;
}
const has1to = (mask, r) => { const need = ((1 << (r + 1)) - 1) & ~1; return (mask & need) === need; };      // {1..r} ⊆ M
// Lemma (bounds for exterior balls) and the retained options
export function options(k, t, n, M) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ base: i, r: -1, u: 1 });
    let zeros = 0; for (let j = 0; j < n; j++) if (M[i][j] & 1) zeros++;
    const b0 = k + 1 - n + zeros;
    if (b0 <= 0) continue;
    const b = [b0], u = [1 + (b0 >= t ? 1 : 0)];
    out.push({ base: i, r: 0, u: u[0] });
    for (let r = 1; r <= 2; r++) {
      let T = 0; for (let j = 0; j < n; j++) if (has1to(M[i][j], r)) T++;
      b[r] = Math.max(b[r - 1], k * u[r - 1] + 1 - n + T);
      const uh = Math.max(u[r - 1], 1 + (b[r] > t ? 1 : 0) + (b[r] > Math.max(k, 2 * t) ? 1 : 0));
      u[r] = uh === 1 && b[r - 1] === t && b[r] === t && k + 1 - n + T >= t ? 2 : uh;
      if (u[r] > u[r - 1]) out.push({ base: i, r, u: u[r] });
    }
  }
  return out;
}
export function compatible(M, o1, o2) {
  if (o1.base === o2.base) return false;
  const m = M[o1.base][o2.base];
  return o1.r === -1 && o2.r === -1 ? (m & 1) === 1 : has1to(m, o1.r + o2.r + 2);
}
// Lemma (packing test): a compatible family of weight > k. Inclusion–exclusion search.
export function packing(k, t, n, M) {
  const opts = options(k, t, n, M);
  const adjc = opts.map((a) => opts.map((b) => compatible(M, a, b)));
  const find = (cands, K, chosen) => {
    if (!cands.length) return null;
    const [x, ...rest] = cands;
    if (opts[x].u > K) return [...chosen, x];
    const Z = rest.filter((y) => adjc[x][y]);
    if (Z.reduce((s, y) => s + opts[y].u, 0) > K - opts[x].u) { const got = find(Z, K - opts[x].u, [...chosen, x]); if (got) return got; }
    return find(rest, K, chosen);
  };
  const fam = find(opts.map((_, i) => i), k, []);
  return fam ? fam.map((i) => opts[i]) : null;
}
const copyM = (M, n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (M[i] && M[i][j]) || 0));
function bad(k, t, adj, n, M) { return edgeConflict(adj, n, M) ? { kind: 'edge' } : packing(k, t, n, M) ? { kind: 'packing' } : null; }
// Proposition (meaning of a successful check): the whole procedure for one pattern
export function check(k, t, pattern, { trace = false } = {}) {
  const lab = labels(pattern), n = lab.n;
  const M = initialMatrix(k, t, lab);
  const initial = M.map((r) => r.slice());
  const res = { k, t, pattern, initial, rounds: [] };
  if (packing(k, t, n, M)) return { ...res, classification: 1, finalM: M };
  requiredPaths(k, lab.adj, n, M);
  if (bad(k, t, lab.adj, n, M)) return { ...res, classification: 2, finalM: M };
  for (;;) {
    const found = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (const d of [0, 1]) {
      if (M[i][j] & (1 << d)) continue;
      if (d === 0 && lab.adj[i] & (1 << j)) continue;
      let X = n, adj2, M2;
      if (d === 0) { adj2 = lab.adj.slice(); adj2[i] |= 1 << j; adj2[j] |= 1 << i; M2 = copyM(M, n); }
      else { X = n + 1; adj2 = [...lab.adj, (1 << i) | (1 << j)]; adj2[i] |= 1 << n; adj2[j] |= 1 << n; M2 = copyM(M, X); }
      requiredPaths(k, adj2, X, M2);
      if (bad(k, t, adj2, X, M2)) found.push([i, j, d]);
    }
    if (!found.length) return { ...res, classification: 0, finalM: M };
    for (const [i, j, d] of found) { M[i][j] |= 1 << d; M[j][i] |= 1 << d; }
    res.rounds.push(found);
    if (bad(k, t, lab.adj, n, M)) return { ...res, classification: 2, finalM: M };
  }
}

// ============================================ checking the release's deduction traces ===
// A trace gives, per pattern, its initial flags, every added prohibition by round with a
// witness, and a final witness. We check each witness against data rebuilt here: the
// initial flags must equal ours, every round's witness must be a valid packing (or edge)
// contradiction in its trial, and the final witness must be a valid packing contradiction.
export function validWitness(k, t, n, M, w) {
  if (!w || w.kind !== 'packing') return false;
  const opts = options(k, t, n, M);
  const fam = w.options.map(([base, r, u]) => ({ base, r, u }));
  if (new Set(fam.map((o) => o.base)).size !== fam.length) return false;
  // every option's weight must be certified by the ball bounds at that radius (a dominated
  // radius inherits the bound of the last retained one)
  for (const o of fam) {
    if (o.base < 0 || o.base >= n) return false;
    const atBase = opts.filter((p) => p.base === o.base && p.r <= o.r && (o.r === -1 ? p.r === -1 : p.r >= 0));
    const cert = Math.max(0, ...atBase.map((p) => p.u));
    if (o.u > cert) return false;
  }
  for (let a = 0; a < fam.length; a++) for (let b = a + 1; b < fam.length; b++) if (!compatible(M, fam[a], fam[b])) return false;
  return fam.reduce((s, o) => s + o.u, 0) > k;
}
// FNV-1a over the nonzero initial flags "x,y,mask;" with x < y in order: lets the page
// confirm its recomputed flags equal the release's without shipping 3.4 MB of them
export function flagsHash(triples) {
  let h = 0x811c9dc5;
  for (const [x, y, m] of triples) for (const ch of `${x},${y},${m};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function matrixTriples(M) {
  const out = [];
  for (let x = 0; x < M.length; x++) for (let y = x + 1; y < M.length; y++) if (M[x][y]) out.push([x, y, M[x][y]]);
  return out;
}
// A compact trace record, as written by build-traces.mjs:
//   [k, t, pattern, classification, flagsHash, rounds: [[[i, j, d, witness], …], …], finalWitness]
// with every witness a list of [base, radius, bound] options.
export function checkTrace(rec) {
  const [k, t, pattern, classification, hash, rounds, final] = rec, lab = labels(pattern), n = lab.n;
  const M = initialMatrix(k, t, lab);
  if (flagsHash(matrixTriples(M)) !== hash) return { ok: false, why: 'initial flags differ from the release' };
  const W = (opts) => ({ kind: 'packing', options: opts });
  if (classification === 1) return validWitness(k, t, n, M, W(final)) ? { ok: true } : { ok: false, why: 'final witness' };
  requiredPaths(k, lab.adj, n, M);
  for (const round of rounds) {
    for (const [i, j, d, w] of round) {
      let X = n, adj2, M2;
      if (d === 0) { adj2 = lab.adj.slice(); adj2[i] |= 1 << j; adj2[j] |= 1 << i; M2 = copyM(M, n); }
      else { X = n + 1; adj2 = [...lab.adj, (1 << i) | (1 << j)]; adj2[i] |= 1 << n; adj2[j] |= 1 << n; M2 = copyM(M, X); }
      requiredPaths(k, adj2, X, M2);
      if (!validWitness(k, t, X, M2, W(w))) return { ok: false, why: `round witness for (${i},${j}) d=${d}` };
    }
    for (const [i, j, d] of round) { M[i][j] |= 1 << d; M[j][i] |= 1 << d; }
  }
  return validWitness(k, t, n, M, W(final)) ? { ok: true } : { ok: false, why: 'final witness' };
}
// the paper's two tables (finite:counts and finite:results): k → [patterns per t], [out0, out1, out2]
export const PAPER_COUNTS = { 5: [4, 2, 1], 6: [6, 5, 2, 1], 7: [9, 9, 5, 2, 1], 8: [16, 10, 5, 2, 1], 9: [25, 20, 11, 5, 2], 10: [35, 24, 11, 5], 11: [60, 46, 25, 11], 12: [87, 51, 26], 13: [152, 104, 55], 14: [197, 118], 15: [364, 237], 16: [468], 17: [879] };
export const PAPER_RESULTS = { 5: [0, 4, 3], 6: [0, 8, 6], 7: [0, 21, 5], 8: [0, 30, 4], 9: [0, 57, 6], 10: [0, 71, 4], 11: [0, 134, 8], 12: [0, 161, 3], 13: [0, 305, 6], 14: [0, 315, 0], 15: [0, 597, 4], 16: [0, 468, 0], 17: [0, 878, 1] };

// ------------------------------------------------- witnesses for the colouring editor ---
// a red cycle on exactly m vertices (vertex list), or null
export function findCycle(adj, N, m) {
  for (let v = 0; v < N; v++) {
    const path = [v];
    const dfs = (x, used) => {
      if (path.length === m) return (adj[x] & (1 << v)) ? path.slice() : null;
      let c = adj[x] & ~used & ~((1 << (v + 1)) - 1);
      while (c) { const b = c & -c; c ^= b; const y = 31 - Math.clz32(b); path.push(y); const r = dfs(y, used | b); if (r) return r; path.pop(); }
      return null;
    };
    const r = dfs(v, 1 << v);
    if (r) return r;
  }
  return null;
}
// n vertices pairwise non-adjacent in red, i.e. a blue K_n, or null
export function findBlueClique(adj, N, n) {
  const pick = [];
  const go = (cands) => {
    if (pick.length === n) return pick.slice();
    while (cands) { const b = cands & -cands; cands ^= b; const x = 31 - Math.clz32(b); pick.push(x); const r = go(cands & ~adj[x]); if (r) return r; pick.pop(); }
    return null;
  };
  return go((1 << N) - 1);
}
