#!/usr/bin/env node
// morph.selftest.mjs — the city engine's geometry is exact, and its city is well-formed.
//
//   node packages/morph/morph.selftest.mjs
import * as G from './geom.js';
import { generate, standing, KINDS, PRESENT } from './morph.js';

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
  const sig = (x) => JSON.stringify([x.stats, x.plots.slice(0, 50).map((p) => p.poly), x.buildings.slice(-50).map((b) => [b.footprint, b.height, b.from, b.to])]);
  ok(sig(c) === sig(again), `deterministic: seed 7 is the same city twice (${c.blocks.length} blocks, ${c.plots.length} plots, ${c.buildings.length} buildings ever, ${ms.toFixed(0)} ms)`);

  // no Math.random anywhere: generate with it removed
  const R = Math.random; Math.random = () => { throw new Error('Math.random used'); };
  let pure = true; try { generate({ seed: 3 }); } catch { pure = false; }
  Math.random = R;
  ok(pure, 'no unseeded randomness: the city generates with Math.random removed');

  const kinds = new Set();
  for (let s = 1; s <= 12; s++) for (const d of generate({ seed: s, districts: 6 }).districts) kinds.add(d.kind);
  ok([...KINDS, 'village'].every((k) => kinds.has(k)), `every plan appears across seeds 1–12 (${[...kinds].join(', ')})`);

  // the districts' parts tile the frame; every block lies in its district; every lot in its cell
  const dsum = c.districts.reduce((s, d) => s + d.parts.reduce((t, P) => t + A(P), 0), 0);
  let outside = 0;
  for (const b of c.blocks) {
    const parts = c.districts[b.district].parts;
    for (const p of b.cell) if (!parts.some((P) => G.inside(P, p, 1e-5))) outside++;
    for (const p of b.lot) if (!G.inside(b.cell, p, 1e-5)) outside++;
  }
  const bsum = c.blocks.reduce((s, b) => s + A(b.cell), 0);
  ok(near(dsum, A(c.frame), 1e-6 * A(c.frame)) && near(bsum, A(c.frame), 1e-4 * A(c.frame)) && outside === 0, `districts tile the frame, and so do their blocks (${(bsum / A(c.frame) * 100).toFixed(3)}%); every block in its district, every lot inside its cell`);

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
  ok(worst < 1e-6 && checked > c.blocks.length && ['ring', 'old road', 'street'].every((r) => ranks.has(r)), `streets: every lot edge stands back exactly half its street (${checked} edges); ranks ${[...ranks].join(', ')}`);

  // the lanes persist: every lane out of the town is still a street, as an old road
  const old = c.streets.filter((s) => s.rank === 'old road');
  const laneKept = c.lanes.every((L) => old.some((s) => Math.abs(-L.u[1] * (s.a[0] - L.o[0]) + L.u[0] * (s.a[1] - L.o[1])) < 1e-5));
  ok(laneKept, `path dependency: all ${c.lanes.length} country lanes survive as old roads through the later plans (${old.length} street edges)`);

  // villages: hamlets older than the town, kept small, and the later plans laid round them
  const villages = c.districts.filter((d) => d.kind === 'village'), core = c.districts.find((d) => d.isCore);
  ok(villages.length >= 2 && villages.every((v) => v.year < core.year && v.area < 120000), `urban villages: ${villages.length} hamlets (${villages.map((v) => `${(v.area / 1e4).toFixed(1)} ha, ${v.year}`).join('; ')}) older than the core (${core.year})`);

  // slivers: nothing too small to build on is built; it was absorbed, or is an island or a square
  let builtSliver = 0;
  const lotBlocks = new Set(c.plots.map((p) => p.block));
  for (const b of c.blocks) {
    const small = !b.lot.length || A(b.lot) < 450 || G.inradius(b.lot) < 6.5;
    if (small && lotBlocks.has(b.id) && b.absorbed == null) builtSliver++;
  }
  ok(builtSliver === 0 && c.stats.absorbed > 5, `slivers: none built on its own (${c.stats.absorbed} absorbed across a closed street, ${c.stats.islands} islands)`);

  // plots tile their block's lot, are convex, and front the street they belong to
  const byBlock = new Map();
  for (const p of c.plots) byBlock.set(p.block, (byBlock.get(p.block) || 0) + A(p.poly));
  let tileErr = 0, notConvex = 0, offFront = 0, outsideLot = 0;
  for (const b of c.blocks) if (lotBlocks.has(b.id)) tileErr = Math.max(tileErr, Math.abs((byBlock.get(b.id) || 0) - A(b.lot)) / A(b.lot));
  for (const p of c.plots) {
    if (!G.isConvex(p.poly)) notConvex++;
    const b = c.blocks[p.block];
    if (p.poly.some((q) => !G.inside(b.lot, q, 1e-5))) outsideLot++;
    const touch = Math.min(...p.poly.map((q) => Math.abs(G.edgeDist(b.lot, p.frontEdge, q))));
    if (touch > 1e-6) offFront++;
  }
  ok(tileErr < 1e-6 && notConvex === 0 && outsideLot === 0 && offFront === 0, `plots: tile every lot (worst ${(tileErr * 100).toExponential(1)}%), all convex, all inside their lot, every one on its street`);

  // buildings: on their parcel (the hull of their strips), sane, with histories in order
  let outsideParcel = 0, bad = 0, order = 0;
  for (const bd of c.buildings) {
    const parcel = G.hull(bd.strips.flatMap((id) => c.plots[id].poly));
    if (bd.footprint.some((q) => !G.inside(parcel, q, 1e-5))) outsideParcel++;
    if (!(bd.height > 2 && bd.height < 400) || !G.isConvex(bd.footprint)) bad++;
    if (bd.to != null && !(bd.to > bd.from)) order++;
    if (bd.from < c.districts[bd.district].year) order++;
  }
  ok(outsideParcel === 0 && bad === 0 && order === 0, `buildings: every footprint on its parcel, convex, 2–400 m tall (tallest now ${c.stats.tallest.toFixed(0)} m); built after its plan, demolished after it was built`);

  // one building at a time on a strip, in every year
  let crowded = 0;
  for (const y of [1500, 1750, 1850, 1900, 1980, PRESENT]) {
    const seen = new Set();
    for (const bd of standing(c, y).buildings) for (const id of bd.strips) { if (seen.has(id)) crowded++; seen.add(id); }
  }
  ok(crowded === 0, 'histories: no strip ever holds two standing buildings at once (checked at six dates)');

  // the rent gap: rebuilding happens where land is worth most, so old buildings survive on cheaper land
  const now = standing(c, PRESENT).buildings, val = (bd) => bd.strips.reduce((s, id) => s + c.plots[id].value, 0) / bd.strips.length;
  const coreNow = now.filter((bd) => c.districts[bd.district].isCore), oldOnes = coreNow.filter((bd) => bd.from < 1700), newOnes = coreNow.filter((bd) => bd.from >= 1700);
  const mean = (xs, f) => xs.reduce((s, x) => s + f(x), 0) / Math.max(1, xs.length);
  ok(oldOnes.length > 20 && newOnes.length > 20 && mean(oldOnes, val) < mean(newOnes, val), `rent gap: in the core ${oldOnes.length} medieval houses survive on land worth ${mean(oldOnes, val).toFixed(2)}, ${newOnes.length} rebuilt on land worth ${mean(newOnes, val).toFixed(2)}`);

  // amalgamation: a rebuilding takes its neighbours' plots
  const wide = c.buildings.filter((bd) => bd.strips.length >= 3).length;
  ok(wide > 50, `the burgage cycle: ${wide} buildings stand on three or more of the original strips`);

  const narrow = c.plots.filter((p) => c.districts[p.district].kind === 'organic' && p.width < 9).length / Math.max(1, c.plots.filter((p) => c.districts[p.district].kind === 'organic').length);
  ok(narrow > 0.6, `the old core is burgage plots: ${(narrow * 100).toFixed(0)}% of its frontages under 9 m`);
  ok(c.stats.streetShare > 0.2 && c.stats.streetShare < 0.5 && c.stats.coverage > 0.15 && c.stats.coverage < 0.6, `the city's proportions: ${(c.stats.streetShare * 100).toFixed(0)}% street, ${(c.stats.coverage * 100).toFixed(0)}% built over, floor area ratio ${c.stats.far.toFixed(2)}`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
