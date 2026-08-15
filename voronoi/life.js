// voronoi/life.js — Conway's Game of Life on a periodic Voronoi mesh.
//
// This module is the ENGINE. `index.html` loads it with <script type="module">
// and `life.selftest.mjs` imports the same file, so there is no second copy to
// drift — same rule as cohomology/hodge.js.
//
// Four independent pieces, in dependency order:
//
//   1. PRNG        — splitmix32 from a string seed. Everything downstream is a
//                    pure function of the seed, which is what makes a permalink
//                    a permalink.
//   2. MESH        — periodic (toroidal) Voronoi tessellation, built by
//                    half-plane clipping with a *proved* stopping rule, plus
//                    Lloyd relaxation towards a centroidal tessellation.
//   3. AUTOMATON   — Life on the mesh's adjacency graph. Because Voronoi cells
//                    have variable degree, the rule is stated as FRACTIONS of
//                    live neighbours, not counts. On a degree-8 Moore grid the
//                    fractional rule B[3/8,3/8] S[2/8,3/8] is Conway's B3/S23
//                    exactly — the selftest holds it to that, step for step.
//   4. SEARCH      — headless trajectory metrics + an emergence score, so the
//                    page (and scripts) can roll soups until something happens.
//
// No dependencies, no build step.

// ══════════════════════════════════════════════════════════════════ 1. PRNG ══

/** FNV-1a over a string → uint32 seed. Stable across engines and versions. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** splitmix32. Returns a function producing floats in [0,1). */
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  return function next() {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ══════════════════════════════════════════════════════════════════ 2. MESH ══
//
// The domain is the unit torus [0,1)² — no boundary, so no cell is special and
// no pattern dies by walking off the edge. That matters: on a bounded patch the
// border cells have fewer neighbours and become sinks, and every hunt converges
// on boring edge artefacts.
//
// Each cell is built by intersecting half-planes: start from a square around
// the site and clip against the perpendicular bisector to every other site,
// nearest first. The stopping rule is exact rather than heuristic — see
// `buildCells` — so the polygons ARE the Voronoi cells, not an approximation.

const TAU = Math.PI * 2;

/**
 * Clip a convex polygon to the half-plane of points at least as close to p as
 * to q, CARRYING AN EDGE TAG. `poly.v` is a flat vertex list and `poly.t[i]` is
 * the tag of the edge leaving vertex i; the tag is the id of the site whose
 * bisector supports that edge.
 *
 * Tagging is what makes adjacency exact. The alternative — finishing the
 * polygons and then working out which site owns each edge by distance — has to
 * pick a tolerance, and picks it wrong on the near-degenerate quadruple points
 * that a relaxed mesh is full of. Here the neighbour is simply recorded when
 * the cut is made.
 */
function clipBisector(poly, px, py, qx, qy, tag) {
  const nx = qx - px, ny = qy - py;
  const mx = (px + qx) * 0.5, my = (py + qy) * 0.5;
  const V = poly.v, T = poly.t;
  const n = V.length >> 1;
  if (n === 0) return poly;
  const ov = [], ot = [];
  // side(x) <= 0  ⟺  x is at least as close to p as to q
  const side = (i) => (V[i * 2] - mx) * nx + (V[i * 2 + 1] - my) * ny;
  let sa = side(0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const sb = side(j);
    const ax = V[i * 2], ay = V[i * 2 + 1];
    const bx = V[j * 2], by = V[j * 2 + 1];
    if (sa <= 0 && sb <= 0) {
      ov.push(ax, ay); ot.push(T[i]);
    } else if (sa <= 0 && sb > 0) {
      const u = sa / (sa - sb);
      ov.push(ax, ay); ot.push(T[i]);                       // edge a→x keeps T[i]
      ov.push(ax + (bx - ax) * u, ay + (by - ay) * u); ot.push(tag);  // leaves along the cut
    } else if (sa > 0 && sb <= 0) {
      const u = sa / (sa - sb);
      ov.push(ax + (bx - ax) * u, ay + (by - ay) * u); ot.push(T[i]); // edge x→b keeps T[i]
    }
    sa = sb;
  }
  return { v: ov, t: ot };
}

/** Signed area of a flat polygon (positive = counterclockwise). */
export function polyArea(poly) {
  const n = poly.length >> 1;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += poly[j * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[j * 2 + 1];
  }
  return a * 0.5;
}

/** Area centroid of a flat polygon. Falls back to the vertex mean if degenerate. */
export function polyCentroid(poly) {
  const n = poly.length >> 1;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const cross = poly[j * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[j * 2 + 1];
    a += cross;
    cx += (poly[j * 2] + poly[i * 2]) * cross;
    cy += (poly[j * 2 + 1] + poly[i * 2 + 1]) * cross;
  }
  if (Math.abs(a) < 1e-15) {
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += poly[i * 2]; sy += poly[i * 2 + 1]; }
    return [sx / n, sy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * Second moment ∫|x−p|² dA of a polygon about the point p. This is the per-cell
 * term of the CVT energy Lloyd's algorithm minimises, so it is what lets the
 * selftest assert the relaxation is actually descending rather than jiggling.
 * Fan the polygon from p; for a triangle with legs u,v the integral is
 * (|u|² + u·v + |v|²)·Area/6.
 */
export function polyMoment(poly, px, py) {
  const n = poly.length >> 1;
  let m = 0;
  for (let i = 1; i < n - 1; i++) {
    const ux = poly[0] - px,           uy = poly[1] - py;
    const vx = poly[i * 2] - px,       vy = poly[i * 2 + 1] - py;
    const wx = poly[(i + 1) * 2] - px, wy = poly[(i + 1) * 2 + 1] - py;
    // triangle (0, v-u, w-u) translated back: use vertices u, v, w about p
    const area = 0.5 * ((vx - ux) * (wy - uy) - (wx - ux) * (vy - uy));
    const s = (ux * ux + uy * uy) + (vx * vx + vy * vy) + (wx * wx + wy * wy)
            + (ux * vx + uy * vy) + (vx * wx + vy * wy) + (wx * ux + wy * uy);
    m += area * s / 6;
  }
  return m;
}

/**
 * Bucket grid over the unit torus. Ring search runs in UNWRAPPED cell
 * coordinates, so periodic images fall out for free: a cell index outside
 * [0,cols) maps back with an integer offset that is exactly the image shift.
 */
function buildGrid(sx, sy, cols) {
  const heads = new Int32Array(cols * cols).fill(-1);
  const next = new Int32Array(sx.length).fill(-1);
  for (let i = 0; i < sx.length; i++) {
    const ci = Math.min(cols - 1, Math.floor(sx[i] * cols));
    const cj = Math.min(cols - 1, Math.floor(sy[i] * cols));
    const k = cj * cols + ci;
    next[i] = heads[k];
    heads[k] = i;
  }
  return { heads, next, cols };
}

/**
 * The Voronoi cells of `sites` on the unit torus.
 *
 * Exactness: after clipping against every site within distance R, let rMax be
 * the furthest polygon vertex from the site. Any site at distance d > 2·rMax
 * has its bisector further than rMax from the site, so it cannot touch the
 * polygon. Ring k of the bucket grid contains nothing closer than (k−1)/cols,
 * so once (k−1)/cols ≥ 2·rMax the cell is final. No tolerance, no guessing.
 *
 * Returns { polys, nbr, nbrOff, area } where `nbr[i]` lists neighbour indices
 * and `nbrOff[i]` the matching periodic image shift (needed to draw an edge
 * that crosses the wrap).
 */
export function buildCells(sx, sy, cols) {
  const n = sx.length;
  const grid = buildGrid(sx, sy, cols);
  const polys = new Array(n);
  const nbr = new Array(n);
  const nbrOff = new Array(n);
  const area = new Float64Array(n);
  const w = 1 / cols;

  let boxEdges = 0;

  for (let i = 0; i < n; i++) {
    const px = sx[i], py = sy[i];
    // Start from the whole fundamental domain recentred on the site. A surviving
    // edge of this square would mean the sites are too sparse to tile the torus
    // without a cell wrapping onto itself; that is counted and reported, never
    // silently accepted.
    let poly = {
      v: [px - 0.5, py - 0.5, px + 0.5, py - 0.5, px + 0.5, py + 0.5, px - 0.5, py + 0.5],
      t: [-1, -1, -1, -1],
    };
    const ci = Math.min(cols - 1, Math.floor(px * cols));
    const cj = Math.min(cols - 1, Math.floor(py * cols));
    const cuts = [];   // parallel to tags: [siteIndex, offX, offY] per tag

    let rMax = Math.SQRT1_2;
    for (let k = 0; k <= cols; k++) {
      if (k > 1 && (k - 1) * w >= 2 * rMax) break;
      for (let dj = -k; dj <= k; dj++) {
        const onJEdge = (dj === -k || dj === k);
        for (let di = -k; di <= k; di++) {
          if (!onJEdge && di !== -k && di !== k) continue;
          const ui = ci + di, uj = cj + dj;
          const ox = Math.floor(ui / cols), oy = Math.floor(uj / cols);
          const wi = ui - ox * cols, wj = uj - oy * cols;
          for (let j = grid.heads[wj * cols + wi]; j !== -1; j = grid.next[j]) {
            if (j === i && ox === 0 && oy === 0) continue;
            const tag = cuts.length / 3;
            cuts.push(j, ox, oy);
            poly = clipBisector(poly, px, py, sx[j] + ox, sy[j] + oy, tag);
          }
        }
      }
      rMax = 0;
      for (let v = 0; v < poly.v.length; v += 2) {
        const d = Math.hypot(poly.v[v] - px, poly.v[v + 1] - py);
        if (d > rMax) rMax = d;
      }
    }

    // Read adjacency straight off the surviving tags. An edge shorter than a
    // femtometre of the domain is a numerical sliver at a quadruple point, not
    // a neighbour — dropping it is what keeps Σdeg landing on exactly 6n.
    const V = poly.v, T = poly.t, m = V.length >> 1;
    const ns = [], offs = [];
    for (let e = 0; e < m; e++) {
      const f = (e + 1) % m;
      if (Math.hypot(V[f * 2] - V[e * 2], V[f * 2 + 1] - V[e * 2 + 1]) < 1e-12) continue;
      const tag = T[e];
      if (tag < 0) { boxEdges++; continue; }
      ns.push(cuts[tag * 3]);
      offs.push(cuts[tag * 3 + 1], cuts[tag * 3 + 2]);
    }

    polys[i] = V;
    nbr[i] = ns;
    nbrOff[i] = offs;
    area[i] = polyArea(V);
  }

  return { polys, nbr, nbrOff, area, boxEdges };
}

/** Total CVT energy Σᵢ ∫_{cell i} |x − sᵢ|² dA. Lloyd never increases it. */
export function cvtEnergy(sx, sy, polys) {
  let e = 0;
  for (let i = 0; i < sx.length; i++) e += polyMoment(polys[i], sx[i], sy[i]);
  return e;
}

const wrap01 = (v) => v - Math.floor(v);

/**
 * Build a relaxed periodic Voronoi mesh.
 *
 * `relax` is the number of Lloyd iterations. 0 gives a raw Poisson mesh (wildly
 * uneven cell sizes and degrees); ~12 gives a near-centroidal blue-noise mesh
 * where the degree histogram concentrates on 6 and the automaton stops being
 * dominated by a handful of giant cells.
 */
export function buildMesh({ seed, n, relax = 12 }) {
  const rand = rng(hashSeed(`mesh:${seed}`));
  const sx = new Float64Array(n), sy = new Float64Array(n);
  for (let i = 0; i < n; i++) { sx[i] = rand(); sy[i] = rand(); }
  const cols = Math.max(2, Math.floor(Math.sqrt(n / 2)));

  let cells = buildCells(sx, sy, cols);
  const energy = [cvtEnergy(sx, sy, cells.polys)];
  for (let it = 0; it < relax; it++) {
    for (let i = 0; i < n; i++) {
      const [cx, cy] = polyCentroid(cells.polys[i]);
      sx[i] = wrap01(cx); sy[i] = wrap01(cy);
    }
    cells = buildCells(sx, sy, cols);
    energy.push(cvtEnergy(sx, sy, cells.polys));
  }

  const deg = new Int32Array(n);
  for (let i = 0; i < n; i++) deg[i] = cells.nbr[i].length;

  return { seed, n, relax, cols, sx, sy, ...cells, deg, energy };
}

/**
 * Structural facts about a finished mesh, all of them checkable.
 *
 * `edgeSum` is Σ deg. On a torus V − E + F = 0 with every Voronoi vertex of
 * degree 3, which forces Σ deg = 6n exactly — the mean cell has six sides no
 * matter how the sites fell. That single number catches a dropped neighbour, a
 * phantom neighbour and a broken wrap all at once.
 */
export function meshReport(mesh) {
  const { n, deg, area, nbr, nbrOff, polys, sx, sy } = mesh;
  let edgeSum = 0, areaSum = 0, maxR = 0;
  const hist = {};
  for (let i = 0; i < n; i++) {
    edgeSum += deg[i];
    areaSum += area[i];
    hist[deg[i]] = (hist[deg[i]] || 0) + 1;
    for (let v = 0; v < polys[i].length; v += 2) {
      maxR = Math.max(maxR, Math.hypot(polys[i][v] - sx[i], polys[i][v + 1] - sy[i]));
    }
  }
  // adjacency must be symmetric with the mirrored image shift
  let asym = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < nbr[i].length; k++) {
      const j = nbr[i][k], ox = nbrOff[i][k * 2], oy = nbrOff[i][k * 2 + 1];
      let found = false;
      for (let k2 = 0; k2 < nbr[j].length; k2++) {
        if (nbr[j][k2] === i && nbrOff[j][k2 * 2] === -ox && nbrOff[j][k2 * 2 + 1] === -oy) {
          found = true; break;
        }
      }
      if (!found) asym++;
    }
  }
  const V = edgeSum / 3, E = edgeSum / 2, F = n;
  return {
    edgeSum, expectedEdgeSum: 6 * n, meanDeg: edgeSum / n, degHist: hist,
    areaSum, asym, euler: V - E + F, maxCellRadius: maxR,
    boxEdges: mesh.boxEdges, fitsFundamentalDomain: maxR < 0.5,
    energyDescends: mesh.energy.every((e, i) => i === 0 || e <= mesh.energy[i - 1] + 1e-12),
  };
}

// ═════════════════════════════════════════════════════════════ 3. AUTOMATON ══
//
// Voronoi cells do not all have the same number of neighbours, so a count rule
// (`B3/S23`) is not well defined on the mesh: a 4-sided cell can never see 3
// live neighbours the way an 8-sided one can, and the automaton degenerates
// into "big cells run the world". State the rule as a fraction of the cell's
// own neighbourhood instead and every cell plays by the same law.
//
// The fractional rule specialises exactly: on a degree-8 Moore grid,
// B[3/8,3/8] S[2/8,3/8] IS Conway's B3/S23, because n/8 lands on the thresholds
// exactly in binary. `life.selftest.mjs` runs both engines side by side.

/** A rule is four fractions in [0,1]: birth band and survival band, inclusive. */
export const CONWAY = { b0: 3 / 8, b1: 3 / 8, s0: 2 / 8, s1: 3 / 8 };

// Fractions are the honest statement of the rule but a miserable thing to type,
// so both the page's rule editor and the offline sweep name rules the familiar
// way — `B345/S1234` — meaning the integer counts that band would select on a
// SIX-sided cell, the mesh's mean. The band is placed at the midpoints between
// neighbouring sixths so it is maximally far from every threshold it must
// separate, which is what stops per-mille rounding in the permalink from
// changing the automaton.
const LEVELS = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1];

/** Fractional band selecting integer counts kLo..kHi on a degree-6 cell. */
export function bandFor(kLo, kHi) {
  return [
    kLo > 0 ? (LEVELS[kLo] + LEVELS[kLo - 1]) / 2 : 0,
    kHi < 6 ? (LEVELS[kHi] + LEVELS[kHi + 1]) / 2 : 1,
  ];
}

/** The integer counts a fractional band selects on a degree-`deg` cell. */
export function countsIn(lo, hi, deg = 6) {
  const out = [];
  for (let k = 0; k <= deg; k++) {
    const f = k / deg;
    if (f >= lo - EPS && f <= hi + EPS) out.push(k);
  }
  return out;
}

/** `B345/S1234` for a rule, read on a degree-6 cell. */
export function ruleName(rule, deg = 6) {
  return `B${countsIn(rule.b0, rule.b1, deg).join('') || '∅'}` +
         `/S${countsIn(rule.s0, rule.s1, deg).join('') || '∅'}`;
}

/** Build a rule from integer count bands on a degree-6 cell. */
export function ruleFromCounts(bLo, bHi, sLo, sHi) {
  const [b0, b1] = bandFor(bLo, bHi);
  const [s0, s1] = bandFor(sLo, sHi);
  return { b0, b1, s0, s1 };
}

const EPS = 1e-9;

/** One synchronous generation. Writes into `out`; returns the number of flips. */
export function step(mesh, state, out, rule) {
  const { n, nbr, deg } = mesh;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const ns = nbr[i];
    let live = 0;
    for (let k = 0; k < ns.length; k++) live += state[ns[k]];
    const f = deg[i] ? live / deg[i] : 0;
    const alive = state[i]
      ? (f >= rule.s0 - EPS && f <= rule.s1 + EPS)
      : (f >= rule.b0 - EPS && f <= rule.b1 + EPS);
    out[i] = alive ? 1 : 0;
    if (out[i] !== state[i]) changed++;
  }
  return changed;
}

/** Deterministic soup: each cell live with probability `density`. */
export function seedSoup(n, seed, density) {
  const rand = rng(hashSeed(`soup:${seed}`));
  const s = new Uint8Array(n);
  for (let i = 0; i < n; i++) s[i] = rand() < density ? 1 : 0;
  return s;
}

/** FNV-1a over the state bytes — the key cycle detection hashes on. */
export function stateHash(state) {
  let h = 0x811c9dc5;
  for (let i = 0; i < state.length; i++) {
    h ^= state[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ════════════════════════════════════════════════════════════════ 4. SEARCH ══
//
// "Roll initial conditions until emergence" needs `emergence` to be a number.
// It is not a rigorous notion, so this is an explicit, tunable stand-in:
// a trajectory scores well when it is still doing something after a long time
// without either dying or boiling. The classifier below is what the page's
// hunt button and `search.mjs` both optimise, and it is deliberately readable
// so a disagreement with your eyes is a bug you can go fix.

/**
 * Run a trajectory and measure it. Cycle detection is exact: the state hash of
 * every generation goes in a map, so the first repeat gives the true transient
 * length and period (barring a 32-bit hash collision, which `verify` re-checks
 * by comparing the states themselves).
 */
export function runTrajectory(mesh, state0, rule, gens = 400) {
  const n = mesh.n;
  let cur = Uint8Array.from(state0);
  let nxt = new Uint8Array(n);
  const seen = new Map();
  const snapshots = new Map();
  const pop = [], act = [];
  let transient = -1, period = -1;

  seen.set(stateHash(cur), 0);
  snapshots.set(0, Uint8Array.from(cur));
  let liveNow = 0;
  for (let i = 0; i < n; i++) liveNow += cur[i];
  pop.push(liveNow / n);

  for (let g = 1; g <= gens; g++) {
    const changed = step(mesh, cur, nxt, rule);
    const t = cur; cur = nxt; nxt = t;
    let live = 0;
    for (let i = 0; i < n; i++) live += cur[i];
    pop.push(live / n);
    act.push(changed / n);
    const h = stateHash(cur);
    if (seen.has(h)) {
      const g0 = seen.get(h);
      const prev = snapshots.get(g0);
      let same = true;
      for (let i = 0; i < n && same; i++) if (prev[i] !== cur[i]) same = false;
      if (same) { transient = g0; period = g - g0; break; }
    }
    seen.set(h, g);
    snapshots.set(g, Uint8Array.from(cur));
    if (live === 0) { transient = g; period = 1; break; }
  }

  const tail = Math.max(1, Math.floor(act.length / 4));
  const meanAct = act.slice(-tail).reduce((a, b) => a + b, 0) / tail;
  const meanPop = pop.slice(-tail).reduce((a, b) => a + b, 0) / tail;
  const finalPop = pop[pop.length - 1];

  let kind;
  if (finalPop === 0) kind = 'extinct';
  else if (period === 1) kind = 'still';
  else if (period > 1 && period <= 8) kind = 'oscillator';
  else if (period > 8) kind = 'long cycle';
  else kind = 'unsettled';

  return {
    gens: pop.length - 1, pop, act, transient, period, kind,
    meanAct, meanPop, finalPop, state: cur,
  };
}

/** Triangular band: 1 at the middle of [lo,hi], 0 at or outside the ends. */
function band(x, lo, hi) {
  if (x <= lo || x >= hi) return 0;
  const mid = (lo + hi) / 2;
  return x < mid ? (x - lo) / (mid - lo) : (hi - x) / (hi - mid);
}

/**
 * Emergence score in [0,1]. Zero for extinction and still lifes; peaks for a
 * trajectory that is still churning at a moderate rate, at a moderate density,
 * long after the initial transient should have settled.
 */
export function emergence(tr) {
  if (tr.kind === 'extinct' || tr.kind === 'still') return 0;
  const a = band(tr.meanAct, 0.002, 0.30);
  const d = band(tr.meanPop, 0.03, 0.62);
  if (a === 0 || d === 0) return 0;
  const longevity = tr.period > 0
    ? Math.min(1, tr.transient / 150) * Math.min(1, Math.log2(1 + tr.period) / 6)
    : 1;                                   // never settled inside the window
  return a * d * (0.35 + 0.65 * longevity);
}

/**
 * Roll soups (and optionally rules) until one scores above `threshold`.
 * Returns the winner plus every rejection, so the page can show the search
 * rather than just its answer.
 */
export function hunt(mesh, opts = {}) {
  const {
    rule = CONWAY, density = 0.34, gens = 400, tries = 200,
    threshold = 0.25, seed = 'hunt', rollRule = null, onTry = null,
  } = opts;
  const pick = rng(hashSeed(`hunt:${seed}`));
  const log = [];
  let best = null;
  for (let t = 0; t < tries; t++) {
    const soupSeed = `${seed}/${t}`;
    const r = rollRule ? rollRule(pick, t) : rule;
    const d = typeof density === 'function' ? density(pick, t) : density;
    const tr = runTrajectory(mesh, seedSoup(mesh.n, soupSeed, d), r, gens);
    const score = emergence(tr);
    const rec = { tries: t, soupSeed, rule: r, density: d, score, kind: tr.kind, tr };
    log.push({ soupSeed, score, kind: tr.kind, period: tr.period, transient: tr.transient });
    if (onTry) onTry(rec);
    if (!best || score > best.score) best = rec;
    if (score >= threshold) return { found: true, best: rec, log };
  }
  return { found: false, best, log };
}

// ══════════════════════════════════════════════════════════════ PERMALINKS ══
//
// The whole universe is a handful of integers, so a URL reproduces it exactly
// on any machine — that is the only reason the PRNG above is hand-rolled rather
// than Math.random(). Rule fractions travel as per-mille integers so the string
// stays short and, more importantly, so a round-tripped rule is bit-identical
// rather than "close enough" — a rule that shifts by 1e-16 is a different
// automaton at the threshold.

// The page's cold-start universe is `storm` from specimens.js — the best-scoring
// trajectory the sweep found. Opening on a dead mesh would be a worse advert for
// the idea than opening on the thing the search was for. Every value is exact in
// per-mille so that decodeSpec('') and decodeSpec(encodeSpec(DEFAULT_SPEC)) are
// both the identity, which the selftest holds it to.
export const DEFAULT_SPEC = {
  mesh: 'quill', n: 700, relax: 12,
  rule: { b0: 0.417, b1: 0.917, s0: 0.083, s1: 0.75 },
  soup: 'q0', density: 0.18,
};

// Thresholds are compared against a fraction, which is always in [0,1], so a
// band edge outside that range is behaviourally identical to the clamped one —
// `s0 = −0.1` and `s0 = 0` are the same automaton. Clamping on the way out
// keeps the permalink free of the minus sign that would otherwise collide with
// the `lo-hi` separator, and keeps the round-trip exact.
const permille = (x) => Math.min(1000, Math.max(0, Math.round(x * 1000)));

/** Spec → URL query string (no leading `?`). */
export function encodeSpec(spec) {
  const r = spec.rule;
  const p = new URLSearchParams();
  p.set('m', String(spec.mesh));
  p.set('n', String(spec.n));
  p.set('r', String(spec.relax));
  p.set('b', `${permille(r.b0)}-${permille(r.b1)}`);
  p.set('s', `${permille(r.s0)}-${permille(r.s1)}`);
  p.set('i', String(spec.soup));
  p.set('d', String(permille(spec.density)));
  return p.toString();
}

const clampInt = (v, lo, hi, dflt) => {
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt;
};

/** URL query string → spec, with every field defaulted and clamped. */
export function decodeSpec(qs) {
  const p = new URLSearchParams(String(qs || '').replace(/^[?#]/, ''));
  const pair = (key, d0, d1) => {
    const raw = p.get(key);
    if (!raw) return [d0, d1];
    const [a, b] = raw.split('-');
    return [clampInt(a, 0, 1000, permille(d0)) / 1000, clampInt(b, 0, 1000, permille(d1)) / 1000];
  };
  const D = DEFAULT_SPEC;
  const [b0, b1] = pair('b', D.rule.b0, D.rule.b1);
  const [s0, s1] = pair('s', D.rule.s0, D.rule.s1);
  return {
    mesh: p.get('m') || D.mesh,
    n: clampInt(p.get('n'), 64, 4000, D.n),
    relax: clampInt(p.get('r'), 0, 60, D.relax),
    rule: { b0, b1: Math.max(b0, b1), s0, s1: Math.max(s0, s1) },
    soup: p.get('i') || D.soup,
    density: clampInt(p.get('d'), 0, 1000, permille(D.density)) / 1000,
  };
}

// ═══════════════════════════════════════════════════ reference: Moore torus ══
//
// Not used by the page. It exists so the selftest can run this engine on the
// one graph where the right answer is already known — the square grid Conway
// himself worked on — and diff it against a naive implementation.

/** A w×h square grid on a torus with Moore (8-)neighbourhoods, in mesh shape. */
export function mooreTorus(w, h) {
  const n = w * h;
  const nbr = new Array(n);
  const deg = new Int32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ns = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          ns.push(((y + dy + h) % h) * w + ((x + dx + w) % w));
        }
      }
      nbr[i] = ns;
      deg[i] = 8;
    }
  }
  return { n, nbr, deg, w, h };
}

export const VERSION = 1;
export { TAU };
