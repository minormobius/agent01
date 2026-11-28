// rhizome-kit: Oborny, Kun, Czárán & Bokros 2000 (Ecology 81:3291) on any of several lattices.
// Self-contained (no imports). Morphyx, 2026-10-14, from Modulo's www/rhizome/oborny.js.
// On lattice 'sq4' it consumes random numbers in the same order as oborny.js, so it gives the same digits
// (selftest.mjs pins them). The choices, as in oborny.js:
//  W  w(q) = min(0.1 + c q, 0.9), c = (h - 0.1)/p.   'linear' control: w = 0.1 + 0.8 q (no plateau).
//  R  per empty cell, each neighbour mother tries with chance w; several succeed -> one wins, chance ∝ w.
//  Q  integrator q = good/total over its whole genet, at the start of the step and again after births.
//  S  every ramet, newborns included, survives with chance w.

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Neighbour offsets (dr, dc) on an L×L grid. Order matters for reproducibility: sq4 is oborny.js's order.
export const LATTICES = {
  sq4:  { offs: [[-1, 0], [1, 0], [0, -1], [0, 1]], pc: 0.5927462, about: 'von Neumann square (the paper)' },
  sq8:  { offs: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]], pc: 0.4072531, about: 'Moore square, corners count' },
  // sq4x p_c: Malarz & Galam 2005, PRE 71:016125 (arXiv cond-mat/0408338), Table 1 row N2+N4, z=8: 0.337…
  sq4x: { offs: [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]], pc: 0.337, about: 'square, sides plus two steps along the axes (8 neighbours; blocks of side 2 still meet only at sides)' },
  tri6: { offs: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1]], pc: 0.5, about: 'triangular (axial coords: sides plus the NE-SW diagonal)' },
};

// CSR neighbour table. wrap=true is a torus (the paper); wrap=false drops links across the edge.
export function lattice(name, L, wrap = true) {
  const lt = LATTICES[name]; if (!lt) throw new Error(`unknown lattice ${name}; one of ${Object.keys(LATTICES)}`);
  const N = L * L, off = new Int32Array(N + 1), nb = [];
  for (let i = 0; i < N; i++) { const r = (i / L) | 0, c = i % L;
    for (const [dr, dc] of lt.offs) { let rr = r + dr, cc = c + dc;
      if (wrap) { rr = (rr + L) % L; cc = (cc + L) % L; } else if (rr < 0 || rr >= L || cc < 0 || cc >= L) continue;
      nb.push(rr * L + cc); }
    off[i + 1] = nb.length; }
  return { L, N, off, nb: Int32Array.from(nb), maxDeg: lt.offs.length };
}

// The paper's seven habitats: [p good fraction, s block side, h]
export const CASES = { B:[0.5,2,0.9], A1:[0.25,2,0.9], A2:[0.5,1,0.9], A3:[0.5,2,0.8], C1:[0.75,2,0.9], C2:[0.5,5,0.9], C3:[0.5,2,1.0] };
export const seedOf = r => 1000 * r + 7;

// gen[i]: 0 empty, 1..25 splitter genets, 26..50 integrator genets
export function sim(cs, seed, { wmode = 'clamp', lat = 'sq4', L = 100 } = {}) {
  const [p, s, h] = Array.isArray(cs) ? cs : CASES[cs], c = (h - 0.1) / p, R = rng(seed);
  const G_ = lattice(lat, L, true), N = G_.N, off = G_.off, NB = G_.nb;
  const wq = wmode === 'linear' ? q => 0.1 + 0.8 * q : q => Math.min(0.1 + c * q, 0.9);
  if (L % s) throw new Error('L must be a multiple of the block side');
  const nbk = L / s, B = nbk * nbk, good = new Uint8Array(N), ord = Array.from({ length: B }, (_, i) => i);
  for (let i = B - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
  const G = Math.round(p * B);
  for (let k = 0; k < G; k++) { const bi = ord[k], br = (bi / nbk) | 0, bc = bi % nbk;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) good[(br * s + y) * L + bc * s + x] = 1; }
  const gen = new Uint8Array(N), cells = Array.from({ length: N }, (_, i) => i);
  for (let k = 0; k < 50; k++) { const j = k + Math.floor(R() * (N - k)); const t = cells[k]; cells[k] = cells[j]; cells[j] = t; gen[cells[k]] = k + 1; }
  const w = new Float64Array(N), nG = new Float64Array(51), nF = new Float64Array(51), next = new Uint8Array(N);
  const cand = new Uint8Array(G_.maxDeg), cw = new Float64Array(G_.maxDeg);
  const setW = () => { nG.fill(0); nF.fill(0);
    for (let i = 0; i < N; i++) if (gen[i]) { nG[gen[i]]++; nF[gen[i]] += good[i]; }
    for (let i = 0; i < N; i++) { const g = gen[i]; w[i] = !g ? 0 : g <= 25 ? wq(good[i]) : wq(nF[g] / nG[g]); } };
  let t = 0;
  function step() {
    setW(); next.set(gen);
    for (let i = 0; i < N; i++) { if (gen[i]) continue;
      let n = 0, tot = 0;
      for (let e = off[i]; e < off[i + 1]; e++) { const j = NB[e]; if (gen[j] && R() < w[j]) { cand[n] = gen[j]; cw[n] = w[j]; tot += w[j]; n++; } }
      if (n === 1) next[i] = cand[0];
      else if (n > 1) { let x = R() * tot, k = 0; while (k < n - 1 && x >= cw[k]) { x -= cw[k]; k++; } next[i] = cand[k]; } }
    gen.set(next); setW();
    for (let i = 0; i < N; i++) if (gen[i] && !(R() < w[i])) gen[i] = 0;
    t++;
  }
  function cover() { // % of the field: splitter/integrator on good/bad
    const o = { sg: 0, sb: 0, ig: 0, ib: 0 };
    for (let i = 0; i < N; i++) if (gen[i]) o[(gen[i] <= 25 ? 's' : 'i') + (good[i] ? 'g' : 'b')]++;
    for (const k in o) o[k] = o[k] * 100 / N;
    return o;
  }
  return { good, gen, step, cover, get t() { return t; } };
}
export function run(cs, seed, opts = {}, T = 500) { const m = sim(cs, seed, opts); while (m.t < T) m.step(); return m.cover(); }

// Site percolation, Newman–Ziff, open boundaries, first top-to-bottom span. Returns the filled fraction.
// Use it to check a lattice against its known threshold before trusting the clone model on it.
export function spanAt(lat, L, rand) {
  const G_ = lattice(lat, L, false), n = G_.N, TOP = n, BOT = n + 1;
  const par = new Int32Array(n + 2); for (let i = 0; i < n + 2; i++) par[i] = i;
  const occ = new Uint8Array(n);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const ord = new Int32Array(n); for (let i = 0; i < n; i++) ord[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
  for (let k = 0; k < n; k++) { const s = ord[k], r = (s / L) | 0; occ[s] = 1;
    if (r === 0) uni(s, TOP); if (r === L - 1) uni(s, BOT);
    for (let e = G_.off[s]; e < G_.off[s + 1]; e++) if (occ[G_.nb[e]]) uni(s, G_.nb[e]);
    if (find(TOP) === find(BOT)) return (k + 1) / n; }
  return 1;
}
