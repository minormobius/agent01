#!/usr/bin/env node
// arnold/surface.selftest.mjs — known-answer checks for the square→cube engine.
// Imports the exact file the browser runs. ~3 s.
//
//   node arnold/surface.selftest.mjs
import {
  STAIR, sPoint, gPoint, lift, fold, wrap, genome, warp, colourAt,
  renderLevels, census, encodeState, decodeState, stateGenome, paletteOf,
  PALETTES, makeRng, LEVELS,
} from './surface.js';

let checks = 0, failed = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failed++; console.log('  ✗ ' + msg); }
}
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b} ± ${tol})`); }
const rng = makeRng('selftest');
const t0 = Date.now();

// ------------------------------------------------------------ 1. staircase --
console.log('staircase s');
const D = 14, tol = Math.pow(4, -D);
for (let i = 0; i <= 8; i++) {
  // the level-1 segment endpoints: s(i/8) = pᵢ (the limit curve passes through every staircase vertex)
  const [x, y] = sPoint(i / 8 - (i === 8 ? 1e-12 : 0), D);
  near(x, STAIR[i][0], 4 * tol + 1e-9, `s(${i}/8).x = p${i}.x`);
  near(y, STAIR[i][1], 4 * tol + 1e-9, `s(${i}/8).y = p${i}.y`);
}
{
  const [x, y] = sPoint(3 / 8, D), [x2, y2] = sPoint(5 / 8, D);
  near(x, x2, 8 * tol, 'p₃ = p₅ (the climb and the descent share a vertex)');
  near(y, y2, 8 * tol, 'p₃ = p₅');
}
for (let n = 0; n < 300; n++) {
  const u = rng.float();
  const [xi, eta] = sPoint(u, D), [xi2, eta2] = sPoint(1 - u, D);
  near(xi2, 1 - xi, 4 * tol, 'Lemma 2.3: ξ(1−u) = 1 − ξ(u)');
  near(eta2, eta, 4 * tol, 'Lemma 2.3: η(1−u) = η(u)');
  ok(eta >= -tol && eta <= Math.min(xi, 1 - xi) + tol, '(2.5): 0 ≤ η ≤ min(ξ, 1−ξ) — s stays inside T');
}
// self-similarity (2.3): s on the j-th eighth is ψⱼ of s on [0,1]
for (let n = 0; n < 200; n++) {
  const u = rng.float(), j = rng.int(8);
  const [x, y] = sPoint((j + u) / 8, D);
  const [x0, y0] = sPoint(u, D - 1);
  const rotv = [[x0, y0], [-y0, x0], [-x0, -y0], [y0, -x0]][[0, 1, 0, 1, 3, 0, 3, 0][j]];
  near(x, STAIR[j][0] + rotv[0] / 4, 4 * tol, '(2.3) self-similarity in x');
  near(y, STAIR[j][1] + rotv[1] / 4, 4 * tol, '(2.3) self-similarity in y');
}

// ---------------------------------------------------------------- 2. curve --
console.log('closed curve g and the X-fractal');
{
  const c = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < 4; i++) {
    const [x, y] = gPoint(i / 4, D);
    near(x, c[i][0], 4 * tol, `g(${i}/4) = corner q${i + 1}`);
    near(y, c[i][1], 4 * tol, `g(${i}/4) = corner q${i + 1}`);
  }
  const [x, y] = gPoint(1 - 1e-13, D);
  near(x, 0, 4 * tol, 'g(1⁻) = g(0): the curve is closed');
  near(y, 0, 4 * tol, 'g(1⁻) = g(0)');
}
// Every level-k square that g(u) lands in has (p,q) with p = q or p + q = 3 (2.1):
// the digit condition of Stong's set, Lemma 3.3.
let onX = 0;
for (let n = 0; n < 2000; n++) {
  const u = rng.float();
  const [x, y] = gPoint(u, 8);
  let good = true;
  for (let k = 1; k <= 8; k++) {
    const p = Math.floor(x * Math.pow(4, k)) & 3, q = Math.floor(y * Math.pow(4, k)) & 3;
    if (!(p === q || p + q === 3)) good = false;
  }
  if (good) onX++;
}
ok(onX === 2000, `g([0,1]) ⊂ E∞: every level-square is on a diagonal (${onX}/2000)`);
// depth consistency: deeper approximations stay inside the shallower square
for (let n = 0; n < 300; n++) {
  const u = rng.float();
  const [x, y] = gPoint(u, 6), [x2, y2] = gPoint(u, 12);
  ok(Math.max(Math.abs(x - x2), Math.abs(y - y2)) <= Math.pow(4, -6) / 2 + 1e-12, 'depth-6 centre is within half a square of depth-12');
}
// Hölder (Proposition 2.1): ‖g(u)−g(v)‖∞ ≤ 4|u−v|^(2/3), tested on the torus distance
let worst = 0;
for (let n = 0; n < 20000; n++) {
  const u = rng.float(), v = n % 2 ? rng.float() : u + (rng.float() - 0.5) * 1e-3;
  const [x, y] = gPoint(u, D), [x2, y2] = gPoint(v, D);
  let du = Math.abs(u - v); du = Math.min(du, 1 - du);
  if (du < 1e-9) continue;
  const ratio = Math.max(Math.abs(x - x2), Math.abs(y - y2)) / Math.pow(du, 2 / 3);
  if (ratio > worst) worst = ratio;
}
ok(worst <= 4.0, `Höld₂/₃(g) ≤ 4 on samples (worst ratio ${worst.toFixed(3)})`);
// and the lifted surface: ‖L(g(u)) − L(g(v))‖∞ ≤ 3·4·‖u−v‖^(2/3)
worst = 0;
for (let n = 0; n < 20000; n++) {
  const u = [rng.float(), rng.float()];
  const v = n % 2 ? [rng.float(), rng.float()] : [u[0] + (rng.float() - 0.5) * 1e-3, u[1] + (rng.float() - 0.5) * 1e-3];
  const a = lift(u[0], u[1], D), b = lift(v[0], v[1], D);
  const dd = [0, 1].map((i) => { let d = Math.abs(u[i] - v[i]); d -= Math.floor(d); return Math.min(d, 1 - d); });
  const du = Math.max(dd[0], dd[1]);
  if (du < 1e-9) continue;
  const ratio = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) / Math.pow(du, 2 / 3);
  if (ratio > worst) worst = ratio;
}
ok(worst <= 12.0, `Höld₂/₃(L∘g⊗g) ≤ 12 = (M−1)·4 on samples (worst ${worst.toFixed(3)})`);

// -------------------------------------------------------------- 3. density --
console.log('density: uniform marginal, trapezoidal P, and the fold');
{
  const n = 200000, bins = 32, ha = new Float64Array(bins), hp = new Float64Array(96);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const [a] = gPoint(u, 10);
    ha[Math.min(bins - 1, Math.floor(a * bins))]++;
  }
  let dev = 0;
  for (let i = 0; i < bins; i++) dev = Math.max(dev, Math.abs(ha[i] / (n / bins) - 1));
  ok(dev < 0.02, `the x-marginal of g is uniform (max bin deviation ${(100 * dev).toFixed(2)}%)`);
  const m = 1024;
  const A = new Float64Array(m);
  for (let i = 0; i < m; i++) A[i] = gPoint((i + 0.5) / m, 10)[0];
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) hp[Math.min(95, Math.floor((A[x] + 2 * A[y]) / 3 * 96))]++;
  const rel = (i) => hp[i] / (m * m / 96);
  near(rel(48), 1.5, 0.03, 'P-density plateau on [1,2] is 3/2');
  near(rel(8), 1.5 * (8.5 / 32), 0.05, 'P-density ramps linearly on [0,1]');
  near(rel(87), 1.5 * ((96 - 87.5) / 32), 0.05, 'P-density ramps down on [2,3]');
  ok(fold(0.25) === 0.25 && fold(1.25) === 0.75 && fold(2.25) === 0.25 && fold(3) === 1, 'fold: identity, reverse, identity');
  ok(wrap(2.25) === 0.25 && wrap(1) === 0, 'wrap = fractional part');
}

// -------------------------------------------------- 4. the flat histogram --
console.log('lattice bijection: every colour equally often');
function flat(N, C, mode, want) {
  const gen = genome('poster', 0);
  const lv = renderLevels(gen, N, { C, mode });
  const c = census(lv, N, C);
  ok(c.exact && c.min === want, `${mode} ${N}² → ${C}³: every colour exactly ${want}× (got ${c.min}..${c.max})`);
  return c;
}
{
  const c1 = flat(256, 16, 'wrap', 16);
  const c2 = flat(256, 16, 'fold', 16);
  const c3 = flat(512, 32, 'fold', 8);
  ok(c2.maxDiff <= 2, `fold 256²: neighbours within 2 levels of 16 (max ${c2.maxDiff})`);
  ok(c3.maxDiff <= 2, `fold 512²: neighbours within 2 levels of 32 (max ${c3.maxDiff})`);
  ok(c1.maxDiff === 15, `wrap 256²: the red seam is a full wrap (max ${c1.maxDiff})`);
  ok(c1.cdf[2] > 0.9, `wrap 256²: but ${(100 * c1.cdf[2]).toFixed(1)}% of edges are within 2 levels`);
  // the poster regime: 4 pixels per colour, not lattice-aligned
  const gen = genome('poster', 0);
  const lv = renderLevels(gen, 1024, { C: 64, mode: 'fold' });
  const c = census(lv, 1024, 64);
  ok(c.mean === 4, 'poster regime: 1024² → 64³ is 4 pixels per colour');
  ok(c.max <= 10 && c.hit / c.colours > 0.995, `poster regime: counts ${c.min}..${c.max}, ${(100 * c.hit / c.colours).toFixed(2)}% of colours hit`);
  ok(c.maxDiff <= 2, `poster regime: max neighbour difference ${c.maxDiff} of 64`);
  ok(c.holder < 4, `measured Hölder constant ${c.holder.toFixed(2)} sits under the bound 4`);
  // the torus: the last column meets the first
  ok(c.edges === 2 * 1024 * 1024, 'census counts the wrap-around edges');
}

// ---------------------------------------------------------------- 5. warps --
console.log('warps are area-preserving; palettes are cube symmetries');
{
  const gens = [genome('a', 1), genome('b', 0.5, { cat: true }), genome('c', 1, { cat: true })];
  for (const gen of gens) {
    let worstDet = 0;
    for (let n = 0; n < 300; n++) {
      const x = rng.float(), y = rng.float(), h = 1e-6;
      // finite-difference Jacobian on the torus, unwrapping the tiny differences
      const un = (d) => { d -= Math.round(d); return d; };
      const p = warp(gen, x, y), px = warp(gen, x + h, y), py = warp(gen, x, y + h);
      const j11 = un(px[0] - p[0]) / h, j21 = un(px[1] - p[1]) / h;
      const j12 = un(py[0] - p[0]) / h, j22 = un(py[1] - p[1]) / h;
      worstDet = Math.max(worstDet, Math.abs(j11 * j22 - j12 * j21 - 1));
    }
    ok(worstDet < 1e-3, `seed ${gen.seed}: Jacobian determinant is 1 (worst |det−1| ${worstDet.toExponential(1)})`);
  }
  ok(genome('a', 0).twists.every((t) => t.amp === 0), 'strength 0 leaves the bare surface');
  ok(JSON.stringify(genome('zz', 0.7)) === JSON.stringify(genome('zz', 0.7)), 'a genome is a pure function of its seed');
  ok(JSON.stringify(genome('zz', 0.7)) !== JSON.stringify(genome('zy', 0.7)), 'different seeds differ');
  const seen = new Set();
  for (let i = 0; i < PALETTES; i++) seen.add(JSON.stringify([paletteOf(i).perm, paletteOf(i).inv]));
  ok(seen.size === PALETTES, '48 distinct palettes');
  // a warped, palette-permuted image still has a flat-ish histogram and no seams
  const gen = genome('b', 1, { cat: true });
  const lv = renderLevels(gen, 512, { C: 32 });
  const c = census(lv, 512, 32);
  ok(c.hit / c.colours > 0.97, `warped+cat 512² → 32³: ${(100 * c.hit / c.colours).toFixed(1)}% of colours hit`);
  ok(c.max <= 4 * c.mean, `warped+cat: counts ${c.min}..${c.max} around ${c.mean}`);
  ok(c.maxDiff <= 8, `warped+cat: max neighbour difference ${c.maxDiff} of 32 (Lipschitz cost of the warp)`);
  // colourAt agrees with renderLevels
  let agree = 0;
  for (let n = 0; n < 500; n++) {
    const x = rng.int(512), y = rng.int(512);
    const col = colourAt(gen, (x + 0.5) / 512, (y + 0.5) / 512, { depth: Math.ceil(Math.log(512 / 4) / Math.log(8)) + 3 });
    const o = (y * 512 + x) * 3;
    if ([0, 1, 2].every((i) => Math.abs(Math.min(31, Math.floor(col[i] * 32)) - lv[o + i]) <= 1)) agree++;
  }
  ok(agree === 500, `colourAt matches the raster (${agree}/500)`);
}

// ------------------------------------------------------------ 6. permalink --
console.log('permalink codec');
{
  const st = { seed: 'k7x2pq', strength: 0.37, cat: true, palette: 41, mode: 'wrap', view: { x: 0.123456789, y: 0.5, w: 0.0078125 } };
  const back = decodeState('#' + encodeState(st));
  ok(back.seed === st.seed && back.cat && back.palette === 41 && back.mode === 'wrap', 'seed/cat/palette/mode round-trip');
  near(back.strength, 0.37, 0.005, 'strength round-trips to the percent');
  near(back.view.x, st.view.x, 1e-9, 'view x round-trips');
  ok(back.view.w === st.view.w, 'view width round-trips');
  const d = decodeState('');
  ok(d.seed === 'poster' && d.strength === 0 && !d.cat && d.palette === null && d.mode === 'fold', 'defaults');
  ok(decodeState('seed=zz&pal=-1').palette === 47, 'palette index wraps');
  ok(decodeState('seed=zz&k=250').strength === 1, 'strength clamps');
  ok(stateGenome(back).palette.index === 41, 'stateGenome honours the override');
  ok(Object.keys(LEVELS).length === 5, 'five exact print sizes');
}

console.log(`\n${checks} checks, ${failed} failed, ${Date.now() - t0} ms`);
process.exit(failed ? 1 : 0);
