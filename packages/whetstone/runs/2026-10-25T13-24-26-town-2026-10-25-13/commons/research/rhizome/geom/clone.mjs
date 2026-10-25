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
  // hexagon tiles have the triangular adjacency (each hex touches 6); here wrapped left-right only
  hex6c: { offs: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, 1], [1, -1]], pc: 0.5, cyl: true, about: 'hexagon tiles on a cylinder (wraps left-right, open top and bottom)' },
  // p_c = 1/2 for Voronoi site percolation: Bollobás & Riordan 2006, PTRF 136:417 (arXiv math/0412510)
  vor: { voronoi: true, pc: 0.5, about: 'Voronoi plane: cells of L*L uniform random points, neighbours share an edge' },
};

// Voronoi plane: N = L*L uniform points in [0,L)^2; two cells are neighbours if they share an edge.
// Each cell is cut out by half-planes (exact; no triangulation library). wrap=true: torus, minimum image.
// wrap=false: cells clipped to the box; labels -1..-4 mark the top, bottom, left and right edges.
export function voronoi(L, rand, wrap = true) {
  const N = L * L, X = new Float64Array(N), Y = new Float64Array(N);
  for (let i = 0; i < N; i++) { X[i] = rand() * L; Y[i] = rand() * L; }
  const head = new Int32Array(N).fill(-1), nxt = new Int32Array(N);
  for (let i = 0; i < N; i++) { const b = Math.min(L - 1, Y[i] | 0) * L + Math.min(L - 1, X[i] | 0); nxt[i] = head[b]; head[b] = i; }
  const off = new Int32Array(N + 1), nb = [], polys = new Array(N), top = new Uint8Array(N), bot = new Uint8Array(N);
  const clip = (P, dx, dy, lab) => { // keep v with v·d <= |d|^2/2
    const h = (dx * dx + dy * dy) / 2, out = [];
    for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length];
      const fa = a.x * dx + a.y * dy - h, fb = b.x * dx + b.y * dy - h;
      if (fa <= 0) out.push(a);
      if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb), I = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), lab: fa <= 0 ? lab : a.lab }; out.push(I); } }
    return out; };
  for (let i = 0; i < N; i++) {
    const x0 = X[i], y0 = Y[i], B = L / 2;
    let P = wrap ? [{ x: -B, y: -B, lab: -9 }, { x: B, y: -B, lab: -9 }, { x: B, y: B, lab: -9 }, { x: -B, y: B, lab: -9 }]
                 : [{ x: -x0, y: -y0, lab: -1 }, { x: L - x0, y: -y0, lab: -4 }, { x: L - x0, y: L - y0, lab: -2 }, { x: -x0, y: L - y0, lab: -3 }];
    const bx = Math.min(L - 1, x0 | 0), by = Math.min(L - 1, y0 | 0);
    for (let k = 0; k <= L; k++) {
      const cs = [];
      for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
        let gx = bx + dx, gy = by + dy;
        if (wrap) { gx = ((gx % L) + L) % L; gy = ((gy % L) + L) % L; } else if (gx < 0 || gy < 0 || gx >= L || gy >= L) continue;
        for (let j = head[gy * L + gx]; j >= 0; j = nxt[j]) { if (j === i) continue;
          let ex = X[j] - x0, ey = Y[j] - y0;
          if (wrap) { ex -= L * Math.round(ex / L); ey -= L * Math.round(ey / L); }
          cs.push([ex * ex + ey * ey, ex, ey, j]); } }
      cs.sort((a, b) => a[0] - b[0]);
      for (const [, ex, ey, j] of cs) P = clip(P, ex, ey, j);
      let r2 = 0; for (const v of P) r2 = Math.max(r2, v.x * v.x + v.y * v.y);
      if (k >= 1 && k * k >= 4 * r2) break; // every unseen point is >= k away; it can't cut a cell of radius <= k/2
    }
    if (P.some(v => v.lab === -9)) throw new Error('voronoi: cell not closed (L too small?)');
    const s = new Set(); for (const v of P) { if (v.lab >= 0) s.add(v.lab); if (v.lab === -1) top[i] = 1; if (v.lab === -2) bot[i] = 1; }
    for (const j of [...s].sort((a, b) => a - b)) nb.push(j);
    off[i + 1] = nb.length; polys[i] = P.map(v => [x0 + v.x, y0 + v.y]);
  }
  let maxDeg = 0; for (let i = 0; i < N; i++) maxDeg = Math.max(maxDeg, off[i + 1] - off[i]);
  return { L, N, off, nb: Int32Array.from(nb), maxDeg, x: X, y: Y, top, bot, polys };
}

// CSR neighbour table. wrap=true is a torus (the paper); wrap=false drops links across the edge.
// A lattice with cyl:true wraps left-right always and top-bottom never (a cylinder).
// Every graph carries x, y (for the habitat blocks) and top, bot (for the spanning check).
export function lattice(name, L, wrap = true, rand = null) {
  const lt = LATTICES[name]; if (!lt) throw new Error(`unknown lattice ${name}; one of ${Object.keys(LATTICES)}`);
  if (lt.voronoi) { if (!rand) throw new Error('vor needs a random stream'); return voronoi(L, rand, wrap); }
  const N = L * L, off = new Int32Array(N + 1), nb = [], x = new Float64Array(N), y = new Float64Array(N), top = new Uint8Array(N), bot = new Uint8Array(N);
  const wr = lt.cyl ? false : wrap, wc = lt.cyl ? true : wrap;
  for (let i = 0; i < N; i++) { const r = (i / L) | 0, c = i % L; x[i] = c; y[i] = r; top[i] = r === 0; bot[i] = r === L - 1;
    for (const [dr, dc] of lt.offs) { let rr = r + dr, cc = c + dc;
      if (wr) rr = (rr + L) % L; else if (rr < 0 || rr >= L) continue;
      if (wc) cc = (cc + L) % L; else if (cc < 0 || cc >= L) continue;
      nb.push(rr * L + cc); }
    off[i + 1] = nb.length; }
  return { L, N, off, nb: Int32Array.from(nb), maxDeg: lt.offs.length, x, y, top, bot };
}

// The paper's seven habitats: [p good fraction, s block side, h]
export const CASES = { B:[0.5,2,0.9], A1:[0.25,2,0.9], A2:[0.5,1,0.9], A3:[0.5,2,0.8], C1:[0.75,2,0.9], C2:[0.5,5,0.9], C3:[0.5,2,1.0] };
export const seedOf = r => 1000 * r + 7;

// gen[i]: 0 empty, 1..25 splitter genets, 26..50 integrator genets
// opts.rock: fraction of squares that are rock (never colonised), from their own random stream,
//   so rock=0 changes nothing. opts.land = { good, rock, seeds: [[cell, genet], ...], p } replaces the
//   habitat and planting entirely (mazes); opts.graph then gives the lattice (from lattice()).
export function sim(cs, seed, { wmode = 'clamp', lat = 'sq4', L = 100, rock = 0, land = null, graph = null } = {}) {
  const [p0, s, h] = Array.isArray(cs) ? cs : CASES[cs], R = rng(seed);
  const p = land ? land.p : p0, c = (h - 0.1) / p;
  const G_ = graph || lattice(lat, L, true, rng((seed ^ 0x2545F491) >>> 0)), N = G_.N, off = G_.off, NB = G_.nb;
  const wq = wmode === 'linear' ? q => 0.1 + 0.8 * q : q => Math.min(0.1 + c * q, 0.9);
  let good, gen = new Uint8Array(N), stone = new Uint8Array(N);
  if (land) { good = land.good; if (land.rock) stone = land.rock; for (const [i, g] of land.seeds) gen[i] = g; }
  else {
    if (L % s) throw new Error('L must be a multiple of the block side');
    const nbk = L / s, B = nbk * nbk, ord = Array.from({ length: B }, (_, i) => i), gb = new Uint8Array(B); good = new Uint8Array(N);
    for (let i = B - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
    const G = Math.round(p * B); for (let k = 0; k < G; k++) gb[ord[k]] = 1;
    for (let i = 0; i < N; i++) good[i] = gb[Math.min(nbk - 1, Math.floor(G_.y[i] / s)) * nbk + Math.min(nbk - 1, Math.floor(G_.x[i] / s))];
    const cells = Array.from({ length: N }, (_, i) => i);
    for (let k = 0; k < 50; k++) { const j = k + Math.floor(R() * (N - k)); const t = cells[k]; cells[k] = cells[j]; cells[j] = t; gen[cells[k]] = k + 1; }
    if (rock > 0) { const Rr = rng((seed ^ 0x9E3779B9) >>> 0); for (let i = 0; i < N; i++) if (Rr() < rock && !gen[i]) stone[i] = 1; }
  }
  const w = new Float64Array(N), nG = new Float64Array(51), nF = new Float64Array(51), next = new Uint8Array(N);
  const cand = new Uint8Array(G_.maxDeg), cw = new Float64Array(G_.maxDeg);
  const setW = () => { nG.fill(0); nF.fill(0);
    for (let i = 0; i < N; i++) if (gen[i]) { nG[gen[i]]++; nF[gen[i]] += good[i]; }
    for (let i = 0; i < N; i++) { const g = gen[i]; w[i] = !g ? 0 : g <= 25 ? wq(good[i]) : wq(nF[g] / nG[g]); } };
  let t = 0;
  function step() {
    setW(); next.set(gen);
    for (let i = 0; i < N; i++) { if (gen[i] || stone[i]) continue;
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
  return { good, gen, rock: stone, graph: G_, step, cover, get t() { return t; } };
}
export function run(cs, seed, opts = {}, T = 500) { const m = sim(cs, seed, opts); while (m.t < T) m.step(); return m.cover(); }

// Site percolation, Newman–Ziff, open boundaries, first top-to-bottom span. Returns the filled fraction.
// Use it to check a lattice against its known threshold before trusting the clone model on it.
export function spanAt(lat, L, rand) {
  const G_ = lattice(lat, L, false, rand), n = G_.N, TOP = n, BOT = n + 1;
  const par = new Int32Array(n + 2); for (let i = 0; i < n + 2; i++) par[i] = i;
  const occ = new Uint8Array(n);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const ord = new Int32Array(n); for (let i = 0; i < n; i++) ord[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
  for (let k = 0; k < n; k++) { const s = ord[k]; occ[s] = 1;
    if (G_.top[s]) uni(s, TOP); if (G_.bot[s]) uni(s, BOT);
    for (let e = G_.off[s]; e < G_.off[s + 1]; e++) if (occ[G_.nb[e]]) uni(s, G_.nb[e]);
    if (find(TOP) === find(BOT)) return (k + 1) / n; }
  return 1;
}
