#!/usr/bin/env node
// morph.selftest.mjs — the city engine's geometry is exact, and its city is well-formed.
//
//   node packages/morph/morph.selftest.mjs
import * as G from './geom.js';
import { generate, KINDS } from './morph.js';

let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };
const A = (P) => Math.abs(G.area(P));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- geometry ---------------------------------------------------------------------------------
{
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const diamond = [[5, -2], [12, 5], [5, 12], [-2, 5]];
  const I = G.clipConvex(sq, diamond);
  // the square minus four corner triangles of legs 3 (each 4.5): 100 − 18
  ok(near(A(I), 82, 1e-9) && G.isConvex(I), `clipConvex: square ∩ diamond is ${A(I).toFixed(6)} m² (82 exact), convex`);

  // inset: every edge moves in by exactly its own width
  const P = G.ccw([[0, 0], [40, -5], [55, 20], [30, 45], [-5, 30]]), w = [2, 5, 1.5, 7, 3];
  const Q = G.inset(P, w);
  let worst = 0;
  for (let i = 0; i < P.length; i++) {
    // the nearest point of Q to edge i's line is exactly w[i] in
    let m = Infinity; for (const q of Q) m = Math.min(m, G.edgeDist(P, i, q));
    worst = Math.max(worst, Math.abs(m - w[i]));
  }
  ok(worst < 1e-9 && G.isConvex(Q), `inset: each edge moved in by its own width (worst error ${worst.toExponential(1)} m)`);

  // zones: the straight skeleton's faces tile the polygon, and each point lies nearest its own edge
  const Z = G.zones(P);
  const sum = Z.reduce((s, z) => s + (z.length ? A(z) : 0), 0);
  let wrong = 0;
  Z.forEach((z, i) => { if (!z.length) return; const c = G.centroid(z); for (let j = 0; j < P.length; j++) if (G.edgeDist(P, j, c) < G.edgeDist(P, i, c) - 1e-9) wrong++; });
  ok(near(sum, A(P), 1e-6 * A(P)) && wrong === 0 && Z.every((z) => !z.length || G.isConvex(z)), `zones: ${Z.filter((z) => z.length).length} faces tile the polygon (Σ ${sum.toFixed(4)} of ${A(P).toFixed(4)} m²), each nearest its own edge`);

  // a hipped roof is continuous: where two faces share a point they give it one height
  const roof = G.hipRoof(P, 0.7), heights = new Map();
  let mismatch = 0;
  for (const f of roof) for (const [x, y, z] of f.poly) { const key = `${x.toFixed(5)},${y.toFixed(5)}`; if (heights.has(key) && Math.abs(heights.get(key) - z) > 1e-6) mismatch++; heights.set(key, z); }
  const ridge = Math.max(...roof.flatMap((f) => f.poly.map((p) => p[2])));
  ok(mismatch === 0 && near(ridge, G.inradius(P) * 0.7, 1e-6), `hipRoof: one height wherever faces meet; the ridge at pitch × inradius (${ridge.toFixed(3)} m)`);

  // voronoi and slices tile their regions
  const pts = Array.from({ length: 40 }, (_, i) => [Math.sin(i * 12.9898) * 43758.5453 % 1 * 50 + 25, Math.sin(i * 78.233) * 43758.5453 % 1 * 50 + 25].map((v) => ((v % 50) + 50) % 50));
  const box = [[0, 0], [50, 0], [50, 50], [0, 50]], V = G.voronoi(pts, box);
  const vs = V.reduce((s, c) => s + (c.length ? A(c) : 0), 0);
  const S = G.slices(P, P[0], 1, 0, [5, 12.5, 30]), ss = S.reduce((s, c) => s + (c.length ? A(c) : 0), 0);
  ok(near(vs, 2500, 1e-6) && near(ss, A(P), 1e-6) && V.every((c) => !c.length || G.isConvex(c)), `voronoi: ${V.length} cells tile the box exactly; slices tile the polygon`);
}

// ---- the city ---------------------------------------------------------------------------------
{
  const t0 = performance.now(), c = generate({ seed: 7 }), ms = performance.now() - t0;
  const again = generate({ seed: 7 });
  const sig = (x) => JSON.stringify([x.stats, x.plots.slice(0, 50).map((p) => p.poly), x.buildings.slice(-50).map((b) => [b.footprint, b.height])]);
  ok(sig(c) === sig(again), `deterministic: seed 7 is the same city twice (${c.blocks.length} blocks, ${c.plots.length} plots, ${c.buildings.length} buildings, ${ms.toFixed(0)} ms)`);

  // no Math.random anywhere: generate with it removed
  const R = Math.random; Math.random = () => { throw new Error('Math.random used'); };
  let pure = true; try { generate({ seed: 3 }); } catch { pure = false; }
  Math.random = R;
  ok(pure, 'no unseeded randomness: the city generates with Math.random removed');

  const kinds = new Set();
  for (let s = 1; s <= 12; s++) for (const d of generate({ seed: s, districts: 6 }).districts) kinds.add(d.kind);
  ok(KINDS.every((k) => kinds.has(k)), `every era appears across seeds 1–12 (${[...kinds].join(', ')})`);

  // the districts tile the frame; every block lies in its district; every lot in its cell
  const dsum = c.districts.reduce((s, d) => s + A(d.region), 0);
  let outside = 0;
  for (const b of c.blocks) {
    const reg = c.districts[b.district].region;
    for (const p of b.cell) if (!G.inside(reg, p, 1e-5)) outside++;
    for (const p of b.lot) if (!G.inside(b.cell, p, 1e-5)) outside++;
  }
  ok(near(dsum, A(c.frame), 1e-6 * A(c.frame)) && outside === 0, `districts tile the frame; every block in its district, every lot inside its cell`);

  // streets: each lot edge stands back from its cell edge by exactly half its street
  let worst = 0, checked = 0;
  for (const b of c.blocks) {
    if (!b.lot.length) continue;
    for (let i = 0; i < b.cell.length; i++) {
      let m = Infinity; for (const q of b.lot) m = Math.min(m, G.edgeDist(b.cell, i, q));
      if (m < b.widths[i].w / 2 + 1e-6) { worst = Math.max(worst, Math.abs(m - b.widths[i].w / 2)); checked++; }
    }
  }
  const ranks = new Set(c.streets.map((s) => s.rank));
  ok(worst < 1e-6 && checked > c.blocks.length && ranks.has('boulevard') && ranks.has('street'), `streets: every lot edge stands back exactly half its street (${checked} edges); ranks ${[...ranks].join(', ')}`);

  // plots tile their block's lot, are convex, and front the street they belong to
  const byBlock = new Map();
  for (const p of c.plots) byBlock.set(p.block, (byBlock.get(p.block) || 0) + A(p.poly));
  let tileErr = 0, notConvex = 0, offFront = 0, outsideLot = 0;
  for (const b of c.blocks) if (b.lot.length && !b.square) tileErr = Math.max(tileErr, Math.abs((byBlock.get(b.id) || 0) - A(b.lot)) / A(b.lot));
  for (const p of c.plots) {
    if (!G.isConvex(p.poly)) notConvex++;
    const b = c.blocks[p.block];
    if (p.poly.some((q) => !G.inside(b.lot, q, 1e-5))) outsideLot++;
    const touch = Math.min(...p.poly.map((q) => Math.abs(G.edgeDist(b.lot, p.frontEdge, q))));
    if (touch > 1e-6) offFront++;
  }
  ok(tileErr < 1e-6 && notConvex === 0 && outsideLot === 0 && offFront === 0, `plots: tile every lot (worst ${(tileErr * 100).toExponential(1)}%), all convex, all inside their lot, every one on its street`);

  // buildings stand on their plots, below the sky, with sane heights
  let outsidePlot = 0, bad = 0;
  for (const bd of c.buildings) {
    const p = c.plots[bd.plot];
    if (bd.footprint.some((q) => !G.inside(p.poly, q, 1e-5))) outsidePlot++;
    if (!(bd.height > 2 && bd.height < 400) || !G.isConvex(bd.footprint)) bad++;
  }
  const narrow = c.plots.filter((p) => c.districts[p.district].kind === 'organic' && p.width < 9).length / Math.max(1, c.plots.filter((p) => c.districts[p.district].kind === 'organic').length);
  ok(outsidePlot === 0 && bad === 0, `buildings: every footprint on its plot, convex, 2–400 m tall (tallest ${c.stats.tallest.toFixed(0)} m)`);
  ok(narrow > 0.6, `the old core is burgage plots: ${(narrow * 100).toFixed(0)}% of its frontages under 9 m`);
  ok(c.stats.streetShare > 0.2 && c.stats.streetShare < 0.5 && c.stats.coverage > 0.15 && c.stats.coverage < 0.6, `the city's proportions: ${(c.stats.streetShare * 100).toFixed(0)}% street, ${(c.stats.coverage * 100).toFixed(0)}% built over, floor area ratio ${c.stats.far.toFixed(2)}`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
