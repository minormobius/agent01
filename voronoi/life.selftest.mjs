#!/usr/bin/env node
// voronoi/life.selftest.mjs — known-answer tests for the engine the page runs.
//
// Imports `./life.js` directly: the browser and this file execute the same
// bytes, so a green run here is evidence about the live page and not about a
// copy of it.
//
//   node voronoi/life.selftest.mjs
//
// What is actually being asserted, and why each one is worth the seconds:
//
//   A. PRNG        — determinism, because a permalink is worthless otherwise.
//   B. GEOMETRY    — the polygon primitives against closed-form answers.
//   C. TESSELLATION— the built cells really are the Voronoi cells: brute-force
//                    nearest-site classification of random probe points must
//                    land inside the polygon that claims them, the areas must
//                    sum to the torus, and Σdeg must be exactly 6n (Euler on a
//                    torus with trivalent Voronoi vertices leaves no slack).
//   D. LLOYD       — the CVT energy descends monotonically.
//   E. CONWAY      — the fractional rule on a degree-8 Moore torus reproduces
//                    B3/S23 exactly, checked against an independently written
//                    naive Life over gliders, oscillators and 200 soups.
//   F. TRAJECTORY  — cycle detection finds the periods it is supposed to find.
//   G. PERMALINK   — encode∘decode is the identity on random specs.
//   H. SPECIMENS   — the seeds baked into the page still behave as advertised.

import {
  rng, hashSeed, buildMesh, buildCells, meshReport, polyArea, polyCentroid,
  polyMoment, cvtEnergy, step, seedSoup, runTrajectory, emergence, mooreTorus,
  encodeSpec, decodeSpec, CONWAY, DEFAULT_SPEC,
} from './life.js';
import { SPECIMENS } from './specimens.js';

let pass = 0, fail = 0;
const t0 = Date.now();
function ok(name, cond, detail = '') {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function near(name, got, want, tol, extra = '') {
  ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}±${tol}${extra ? ` (${extra})` : ''}`);
}
function group(label) { console.log(`\n${label}`); }

// ───────────────────────────────────────────────────────────────── A. PRNG ──
group('A. prng — determinism and spread');
{
  const a = rng('orchid'), b = rng('orchid'), c = rng('orchid2');
  const A = Array.from({ length: 512 }, a);
  const B = Array.from({ length: 512 }, b);
  const C = Array.from({ length: 512 }, c);
  ok('same seed → same stream', A.every((v, i) => v === B[i]));
  ok('different seed → different stream', A.some((v, i) => v !== C[i]));
  ok('stream stays in [0,1)', A.every((v) => v >= 0 && v < 1));
  const mean = A.reduce((s, v) => s + v, 0) / A.length;
  near('mean ≈ 1/2', mean, 0.5, 0.05);
  // 8 buckets, 8192 draws: no bucket should be wildly off 1024
  const d = rng('chi'); const buckets = new Array(8).fill(0);
  for (let i = 0; i < 8192; i++) buckets[Math.floor(d() * 8)]++;
  ok('uniform over 8 buckets', buckets.every((v) => Math.abs(v - 1024) < 150), buckets.join(','));
  ok('hashSeed is stable', hashSeed('orchid') === hashSeed('orchid'));
  ok('hashSeed separates', hashSeed('a') !== hashSeed('b'));
}

// ─────────────────────────────────────────────────────────── B. primitives ──
group('B. polygon primitives — against closed forms');
{
  const unit = [0, 0, 1, 0, 1, 1, 0, 1];
  near('unit square area', polyArea(unit), 1, 1e-15);
  const [cx, cy] = polyCentroid(unit);
  near('unit square centroid x', cx, 0.5, 1e-15);
  near('unit square centroid y', cy, 0.5, 1e-15);
  // ∫|x−c|² over the unit square about its centre = 2·(1/12) = 1/6
  near('square second moment about centre', polyMoment(unit, 0.5, 0.5), 1 / 6, 1e-12);
  // ∫|x|² over the unit square about a corner = 2/3
  near('square second moment about corner', polyMoment(unit, 0, 0), 2 / 3, 1e-12);
  // regular n-gon of circumradius 1: area → π
  for (const k of [3, 6, 12, 360]) {
    const p = [];
    for (let i = 0; i < k; i++) p.push(Math.cos(i * 2 * Math.PI / k), Math.sin(i * 2 * Math.PI / k));
    near(`regular ${k}-gon area`, polyArea(p), 0.5 * k * Math.sin(2 * Math.PI / k), 1e-12);
    // second moment of a regular n-gon about its centre, closed form
    const R = 1, want = polyArea(p) * (R * R / 6) * (1 + 2 * Math.cos(Math.PI / k) ** 2);
    near(`regular ${k}-gon moment`, polyMoment(p, 0, 0), want, 1e-10);
  }
  ok('counterclockwise ⇒ positive area', polyArea(unit) > 0);
  ok('clockwise ⇒ negative area', polyArea([0, 0, 0, 1, 1, 1, 1, 0]) < 0);
}

// ───────────────────────────────────────────────────────── C. tessellation ──
group('C. tessellation — the cells really are the Voronoi cells');
const CONFIGS = [
  { seed: 'orchid', n: 120, relax: 0 },
  { seed: 'orchid', n: 120, relax: 12 },
  { seed: 'k2', n: 400, relax: 6 },
  { seed: 'k3', n: 700, relax: 12 },
  { seed: 'dense', n: 1200, relax: 4 },
  { seed: 'sparse', n: 64, relax: 20 },
];
const meshes = new Map();
for (const cfg of CONFIGS) {
  const key = `${cfg.seed}/${cfg.n}/${cfg.relax}`;
  const mesh = buildMesh(cfg);
  meshes.set(key, mesh);
  const rep = meshReport(mesh);

  ok(`[${key}] areas tile the torus`, Math.abs(rep.areaSum - 1) < 1e-9,
    `Σarea = ${rep.areaSum}`);
  ok(`[${key}] every cell has positive area`, Array.from(mesh.area).every((a) => a > 0));
  ok(`[${key}] no cell reaches the fundamental domain`, rep.boxEdges === 0 && rep.fitsFundamentalDomain,
    `boxEdges=${rep.boxEdges} maxR=${rep.maxCellRadius}`);

  // The Euler identity on the torus. V−E+F = 0 with trivalent Voronoi vertices
  // forces Σdeg = 6n on the nose — a single dropped or phantom neighbour shows.
  ok(`[${key}] Σdeg = 6n (Euler on the torus)`, rep.edgeSum === 6 * mesh.n,
    `Σdeg=${rep.edgeSum} vs ${6 * mesh.n}`);
  near(`[${key}] mean degree = 6`, rep.meanDeg, 6, 1e-12);
  ok(`[${key}] χ = 0`, Math.abs(rep.euler) < 1e-12, `χ=${rep.euler}`);
  ok(`[${key}] adjacency is symmetric with mirrored wrap`, rep.asym === 0, `${rep.asym} asymmetric`);
  ok(`[${key}] no cell is isolated`, Array.from(mesh.deg).every((d) => d >= 3));

  // Ground truth: classify random probe points by brute-force periodic nearest
  // site, then check the winning cell's polygon actually contains the point.
  const probe = rng(`probe:${key}`);
  let misses = 0;
  const P = 3000;
  for (let t = 0; t < P; t++) {
    const qx = probe(), qy = probe();
    let best = -1, bestD = Infinity, bx = 0, by = 0;
    for (let i = 0; i < mesh.n; i++) {
      let dx = qx - mesh.sx[i], dy = qy - mesh.sy[i];
      dx -= Math.round(dx); dy -= Math.round(dy);      // nearest periodic image
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; bx = mesh.sx[i] + dx; by = mesh.sy[i] + dy; }
    }
    if (!contains(mesh.polys[best], bx, by, 1e-9)) misses++;
  }
  ok(`[${key}] nearest-site probes land in their own cell`, misses === 0, `${misses}/${P} outside`);

  // Every cell convex and counterclockwise, as half-plane intersections must be
  ok(`[${key}] all cells convex + ccw`, mesh.polys.every((p) => isConvexCCW(p)));
}

/** point-in-convex-polygon, with slack */
function contains(poly, x, y, tol) {
  const m = poly.length >> 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const ex = poly[j * 2] - poly[i * 2], ey = poly[j * 2 + 1] - poly[i * 2 + 1];
    const cross = ex * (y - poly[i * 2 + 1]) - ey * (x - poly[i * 2]);
    if (cross < -tol) return false;             // right of a ccw edge ⇒ outside
  }
  return true;
}
function isConvexCCW(poly) {
  const m = poly.length >> 1;
  if (m < 3) return false;
  if (polyArea(poly) <= 0) return false;
  for (let i = 0; i < m; i++) {
    const a = i, b = (i + 1) % m, c = (i + 2) % m;
    const ux = poly[b * 2] - poly[a * 2], uy = poly[b * 2 + 1] - poly[a * 2 + 1];
    const vx = poly[c * 2] - poly[b * 2], vy = poly[c * 2 + 1] - poly[b * 2 + 1];
    if (ux * vy - uy * vx < -1e-12) return false;
  }
  return true;
}

// ───────────────────────────────────────────────────────────────── D. Lloyd ──
group('D. Lloyd relaxation — the energy descends');
{
  const mesh = meshes.get('k3/700/12');
  const e = mesh.energy;
  ok('energy recorded per iteration', e.length === 13, `${e.length} entries`);
  let monotone = true;
  for (let i = 1; i < e.length; i++) if (e[i] > e[i - 1] + 1e-14) monotone = false;
  ok('CVT energy is non-increasing', monotone, e.map((v) => v.toExponential(4)).join(' → '));
  ok('relaxation actually moved', e[e.length - 1] < e[0] * 0.95,
    `${e[0].toExponential(4)} → ${e[e.length - 1].toExponential(4)}`);
  ok('energy matches a fresh recomputation',
    Math.abs(cvtEnergy(mesh.sx, mesh.sy, mesh.polys) - e[e.length - 1]) < 1e-15);

  // A relaxed mesh should be markedly more regular than a raw Poisson one.
  const raw = meshReport(meshes.get('orchid/120/0'));
  const rel = meshReport(meshes.get('orchid/120/12'));
  const spread = (h) => {
    const tot = Object.values(h).reduce((a, b) => a + b, 0);
    return 1 - (h[6] || 0) / tot;                       // fraction that is not hexagonal
  };
  ok('relaxation concentrates degree on 6', spread(rel.degHist) < spread(raw.degHist),
    `raw ${spread(raw.degHist).toFixed(3)} → relaxed ${spread(rel.degHist).toFixed(3)}`);
}

// ──────────────────────────────────────────────────────────────── E. Conway ──
group('E. the fractional rule IS Conway on a degree-8 grid');
//
// The point of the whole exercise. `step` knows nothing about grids; give it a
// Moore torus and the Conway thresholds and it must agree, cell for cell and
// generation for generation, with a naive B3/S23 written from the definition.
{
  const W = 24, H = 24;
  const grid = mooreTorus(W, H);

  /** Independent, deliberately dumb reference implementation. */
  function naive(cells) {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            c += cells[((y + dy + H) % H) * W + ((x + dx + W) % W)];
          }
        }
        const i = y * W + x;
        out[i] = cells[i] ? (c === 2 || c === 3 ? 1 : 0) : (c === 3 ? 1 : 0);
      }
    }
    return out;
  }
  const put = (cells, list) => { for (const [x, y] of list) cells[y * W + x] = 1; };

  ok('Moore torus has degree 8 everywhere', Array.from(grid.deg).every((d) => d === 8));
  ok('Moore neighbourhoods are distinct', grid.nbr.every((ns) => new Set(ns).size === 8));

  // 1. the glider translates by (1,1) every 4 generations
  {
    let cur = new Uint8Array(W * H);
    put(cur, [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]);
    const start = Uint8Array.from(cur);
    let nxt = new Uint8Array(W * H);
    for (let g = 0; g < 4; g++) { step(grid, cur, nxt, CONWAY); [cur, nxt] = [nxt, cur]; }
    let shifted = true;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (start[y * W + x] !== cur[((y + 1) % H) * W + ((x + 1) % W)]) shifted = false;
    }
    ok('glider translates (1,1) in 4 generations', shifted);
    // …and for 4·W generations it comes all the way home
    for (let g = 0; g < 4 * (W - 1); g++) { step(grid, cur, nxt, CONWAY); [cur, nxt] = [nxt, cur]; }
    ok('glider circumnavigates the torus in 4·W generations', cur.every((v, i) => v === start[i]));
  }

  // 2. blinker period 2, block still, toad period 2
  const periodOf = (list, cap = 20) => {
    let cur = new Uint8Array(W * H); put(cur, list);
    const start = Uint8Array.from(cur);
    let nxt = new Uint8Array(W * H);
    for (let g = 1; g <= cap; g++) {
      step(grid, cur, nxt, CONWAY); [cur, nxt] = [nxt, cur];
      if (cur.every((v, i) => v === start[i])) return g;
    }
    return -1;
  };
  ok('block is a still life', periodOf([[4, 4], [5, 4], [4, 5], [5, 5]]) === 1);
  ok('blinker has period 2', periodOf([[4, 5], [5, 5], [6, 5]]) === 2);
  ok('toad has period 2', periodOf([[4, 5], [5, 5], [6, 5], [3, 6], [4, 6], [5, 6]]) === 2);
  ok('beacon has period 2', periodOf([[2, 2], [3, 2], [2, 3], [4, 5], [5, 5], [5, 4]]) === 2);
  ok('pulsar has period 3', periodOf(pulsar(6, 6)) === 3);

  // 3. 200 random soups × 40 generations, cell-for-cell against the reference
  let divergences = 0, soupsChecked = 0;
  for (let s = 0; s < 200; s++) {
    const r = rng(`soup${s}`);
    let mine = new Uint8Array(W * H);
    for (let i = 0; i < mine.length; i++) mine[i] = r() < 0.35 ? 1 : 0;
    let ref = Uint8Array.from(mine);
    let nxt = new Uint8Array(W * H);
    for (let g = 0; g < 40; g++) {
      step(grid, mine, nxt, CONWAY); [mine, nxt] = [nxt, mine];
      ref = naive(ref);
      for (let i = 0; i < ref.length; i++) if (ref[i] !== mine[i]) { divergences++; break; }
    }
    soupsChecked++;
  }
  ok(`fractional rule ≡ B3/S23 over ${soupsChecked} soups × 40 gens`, divergences === 0,
    `${divergences} diverging generations`);

  // 4. the thresholds are the only ones that do this — a nudge breaks it
  {
    let mine = new Uint8Array(W * H);
    const r = rng('nudge');
    for (let i = 0; i < mine.length; i++) mine[i] = r() < 0.4 ? 1 : 0;
    const ref0 = Uint8Array.from(mine);
    const nxt = new Uint8Array(W * H);
    step(grid, ref0, nxt, { b0: 2 / 8, b1: 3 / 8, s0: 2 / 8, s1: 3 / 8 });
    const conway = new Uint8Array(W * H);
    step(grid, ref0, conway, CONWAY);
    ok('B[2/8,3/8] is a different automaton', !nxt.every((v, i) => v === conway[i]));
  }
}

function pulsar(ox, oy) {
  const arms = [];
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (const d of [2, 3, 4]) {
      arms.push([ox + sx * d, oy + sy * 1], [ox + sx * 1, oy + sy * d]);
      arms.push([ox + sx * d, oy + sy * 6], [ox + sx * 6, oy + sy * d]);
    }
  }
  return arms;
}

// ───────────────────────────────────────────────────────── F. trajectories ──
group('F. trajectory metrics — cycle detection tells the truth');
{
  const W = 20, H = 20;
  const grid = mooreTorus(W, H);
  const mk = (list) => { const c = new Uint8Array(W * H); for (const [x, y] of list) c[y * W + x] = 1; return c; };

  const still = runTrajectory(grid, mk([[4, 4], [5, 4], [4, 5], [5, 5]]), CONWAY, 50);
  ok('block: period 1, transient 0', still.period === 1 && still.transient === 0, JSON.stringify({ p: still.period, t: still.transient }));
  ok('block classified still', still.kind === 'still');
  ok('block scores zero emergence', emergence(still) === 0);

  const blink = runTrajectory(grid, mk([[4, 5], [5, 5], [6, 5]]), CONWAY, 50);
  ok('blinker: period 2, transient 0', blink.period === 2 && blink.transient === 0);
  ok('blinker classified oscillator', blink.kind === 'oscillator');

  // r-pentomino on a 20×20 torus: a long transient, definitively not immediate
  const rp = runTrajectory(grid, mk([[9, 8], [10, 8], [8, 9], [9, 9], [9, 10]]), CONWAY, 600);
  ok('r-pentomino has a long transient', rp.transient > 20 || rp.transient === -1, `transient=${rp.transient}`);

  const dead = runTrajectory(grid, new Uint8Array(W * H), CONWAY, 20);
  ok('empty board is extinct', dead.kind === 'extinct' && dead.finalPop === 0);
  ok('extinct scores zero', emergence(dead) === 0);

  // A glider alone: population constant, activity constant, period = 4·W
  const gl = runTrajectory(grid, mk([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]), CONWAY, 4 * W + 5);
  ok('lone glider returns after 4·W', gl.period === 4 * W, `period=${gl.period}`);
  ok('glider population is constant', gl.pop.every((p) => Math.abs(p - 5 / (W * H)) < 1e-12));

  ok('scores are in [0,1]', [still, blink, rp, dead, gl].every((t) => {
    const s = emergence(t); return s >= 0 && s <= 1;
  }));
  // determinism of the whole pipeline
  const a = runTrajectory(grid, mk([[9, 8], [10, 8], [8, 9], [9, 9], [9, 10]]), CONWAY, 200);
  const b = runTrajectory(grid, mk([[9, 8], [10, 8], [8, 9], [9, 9], [9, 10]]), CONWAY, 200);
  ok('trajectories are deterministic', a.period === b.period && a.transient === b.transient
    && a.state.every((v, i) => v === b.state[i]));
}

// ────────────────────────────────────────────────────────────── G. permalink ──
group('G. permalinks — encode ∘ decode is the identity');
{
  const r = rng('links');
  let bad = 0;
  for (let t = 0; t < 500; t++) {
    const spec = {
      mesh: `m${Math.floor(r() * 1e6).toString(36)}`,
      n: 64 + Math.floor(r() * 3000),
      relax: Math.floor(r() * 40),
      rule: {
        b0: Math.round(r() * 1000) / 1000, b1: 0, s0: Math.round(r() * 1000) / 1000, s1: 0,
      },
      soup: `s${Math.floor(r() * 1e6).toString(36)}`,
      density: Math.round(r() * 1000) / 1000,
    };
    spec.rule.b1 = Math.max(spec.rule.b0, Math.round(r() * 1000) / 1000);
    spec.rule.s1 = Math.max(spec.rule.s0, Math.round(r() * 1000) / 1000);
    const back = decodeSpec(encodeSpec(spec));
    if (JSON.stringify(back) !== JSON.stringify(spec)) { bad++; if (bad === 1) console.log('    first mismatch', spec, back); }
  }
  ok('500 random specs round-trip exactly', bad === 0, `${bad} mismatches`);
  ok('empty query gives the defaults', JSON.stringify(decodeSpec('')) === JSON.stringify(DEFAULT_SPEC));
  ok('leading ? tolerated', decodeSpec('?n=256').n === 256);
  ok('leading # tolerated', decodeSpec('#n=256').n === 256);
  ok('garbage n falls back', decodeSpec('n=banana').n === DEFAULT_SPEC.n);
  ok('n clamps low', decodeSpec('n=1').n === 64);
  ok('n clamps high', decodeSpec('n=999999').n === 4000);
  ok('relax clamps', decodeSpec('r=9999').relax === 60);
  ok('inverted band is repaired', decodeSpec('b=600-100').rule.b1 >= decodeSpec('b=600-100').rule.b0);
  ok('the default spec encodes without loss',
    JSON.stringify(decodeSpec(encodeSpec(DEFAULT_SPEC))) === JSON.stringify(DEFAULT_SPEC));
}

// ────────────────────────────────────────────────────────────── H. specimens ──
group('H. baked specimens — the permalinks on the page still do what they say');
{
  ok('specimen list is non-empty', SPECIMENS.length > 0);
  for (const sp of SPECIMENS) {
    const spec = decodeSpec(sp.link);
    const mesh = buildMesh({ seed: spec.mesh, n: spec.n, relax: spec.relax });
    const tr = runTrajectory(mesh, seedSoup(mesh.n, spec.soup, spec.density), spec.rule, sp.gens);
    const score = emergence(tr);
    ok(`[${sp.id}] link round-trips`, encodeSpec(spec) === sp.link, `${encodeSpec(spec)} vs ${sp.link}`);
    ok(`[${sp.id}] classified "${sp.kind}"`, tr.kind === sp.kind, `got "${tr.kind}"`);
    ok(`[${sp.id}] period ${sp.period}`, tr.period === sp.period, `got ${tr.period}`);
    ok(`[${sp.id}] transient ${sp.transient}`, tr.transient === sp.transient, `got ${tr.transient}`);
    near(`[${sp.id}] score ${sp.score}`, score, sp.score, 5e-3);

    // Where a specimen's blurb explains its period, check the explanation.
    // `loom` claims its period 210 is the lcm of a handful of small independent
    // oscillators rather than one enormous orbit — that is a decomposition, and
    // a decomposition is checkable.
    if (sp.decomposition) {
      let cur = seedSoup(mesh.n, spec.soup, spec.density);
      let nxt = new Uint8Array(mesh.n);
      for (let g = 0; g < tr.transient; g++) { step(mesh, cur, nxt, spec.rule); [cur, nxt] = [nxt, cur]; }
      const frames = [];
      for (let g = 0; g < tr.period; g++) {
        frames.push(Uint8Array.from(cur));
        step(mesh, cur, nxt, spec.rule); [cur, nxt] = [nxt, cur];
      }
      const divisors = [];
      for (let d = 1; d <= tr.period; d++) if (tr.period % d === 0) divisors.push(d);
      const hist = {};
      for (let i = 0; i < mesh.n; i++) {
        let p = tr.period;
        for (const d of divisors) {
          let same = true;
          for (let g = 0; g < tr.period && same; g++) if (frames[g][i] !== frames[(g + d) % tr.period][i]) same = false;
          if (same) { p = d; break; }
        }
        hist[p] = (hist[p] || 0) + 1;
      }
      ok(`[${sp.id}] per-cell period histogram`,
        JSON.stringify(hist) === JSON.stringify(sp.decomposition),
        `got ${JSON.stringify(hist)}, want ${JSON.stringify(sp.decomposition)}`);
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      const lcm = Object.keys(hist).map(Number).reduce((a, b) => a / gcd(a, b) * b, 1);
      ok(`[${sp.id}] lcm of cell periods = ${tr.period}`, lcm === tr.period, `lcm=${lcm}`);
      ok(`[${sp.id}] Σ histogram = n`,
        Object.values(hist).reduce((a, b) => a + b, 0) === mesh.n);
    }
  }
}

// ──────────────────────────────────────────────────────────────────── done ──
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} checks in ${secs}s${fail ? `, ${fail} failed` : ''}`);
process.exit(fail === 0 ? 0 : 1);
