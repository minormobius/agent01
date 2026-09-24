// chair44/tile.selftest.mjs — hold tile.js to every finite claim the page makes.
//   node chair44/tile.selftest.mjs
// Imports the exact module the browser runs. Every number asserted here is
// either a count printed in arXiv:2609.19214 (Tsiokos 2026) or a property the
// page states; each is recomputed from the panel recipe, never copied.

import * as T from './tile.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${a}, want ${b}`);
const t0 = Date.now();

// ---------------------------------------------------------------- recipe ----
eq(T.RECIPE.length, 24, 'panels');
eq(T.PANELS.flatMap((p) => p.features).length, 192, 'features');
eq(new Set(T.RECIPE.map((r) => r[0])).size, 24, 'panel ids distinct');

// the recipe's panels are exactly the carrier's exposed unit faces
{
  const cells = new Set(T.CELLS.map((c) => c.join(',')));
  const exposed = new Set();
  for (const c of T.CELLS)
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const nb = [...c]; nb[k] += s;
      if (cells.has(nb.join(','))) continue;
      const ctr = c.map((v) => v * T.E + T.E / 2); ctr[k] += s * T.E / 2;
      const n = [0, 0, 0]; n[k] = s;
      exposed.add(ctr.join(',') + '|' + n.join(','));
    }
  eq(exposed.size, 24, 'carrier has 24 exposed unit faces');
  for (const p of T.PANELS) ok(exposed.has(p.c.join(',') + '|' + p.n.join(',')), `panel ${p.id} is an exposed face`);
  eq(T.PANELS.filter((p) => p.c[p.axis] === T.E).length, 3, 'three notch panels');
}

// every panel uses the same eight positions (±1/8,±1/4), (±1/4,±1/8)
for (const p of T.PANELS) {
  const k = p.features.map((q) => q.u + ',' + q.v).sort().join(' ');
  eq(k, '-1,-2 -1,2 -2,-1 -2,1 1,-2 1,2 2,-1 2,1', `panel ${p.id} feature positions`);
}

// the paper's worked example (§2.3): panel 13, −9 at (−1/8,−1/4), +9 at (−1/4,−1/8),
// base centre of the −9 at (11/8, 0, 5/4)
{
  const p13 = T.PANELS[13];
  const f = (u, v) => p13.features.find((q) => q.u === u && q.v === v);
  eq(f(-1, -2).a, -9, 'panel 13 at (−1/8,−1/4)');
  eq(f(-2, -1).a, 9, 'panel 13 at (−1/4,−1/8)');
  eq(f(-1, -2).p.join(','), '11,0,10', 'panel 13 −9 base centre (11/8,0,5/4)');
}

// twelve magnitudes, each used 16 times, 8 bumps and 8 dents; bumps and dents cancel
{
  const all = T.PANELS.flatMap((p) => p.features.map((q) => q.a));
  for (let j = 1; j <= 12; j++) {
    eq(all.filter((a) => a === j).length, 8, `+${j} used 8 times`);
    eq(all.filter((a) => a === -j).length, 8, `−${j} used 8 times`);
  }
  eq(all.reduce((s, a) => s + a, 0), 0, 'signed heights sum to zero (volume 7)');
}

// ---------------------------------------------------------------- frames ----
eq(T.FRAMES.length, 48, 'signed frames');
eq(T.ROTATIONS.length, 24, 'proper rotations');
for (const g of T.FRAMES) ok(T.compose(g, T.inverse(g)) === T.IDENTITY, `inverse ${T.frameKey(g)}`);

// ------------------------------------------------------ 2388 → 44 (§3.1) ----
eq(T.shellCells().length, 22, 'grid cells adjacent across the 24 panels');
const N = T.neighbourPoses();
eq(N.length, 2388, 'candidate face-neighbour poses');
const A = N.filter((x) => x.legal);
eq(A.length, 44, 'legal contacts (the atlas)');
eq(A.filter((x) => !x.proper).length, 0, 'no legal contact is a mirror image (homochiral)');
eq(N.filter((x) => !x.legal && x.shared === 0).length, 0, 'every candidate shares a panel');

// …and they are exactly the paper's Figure 7, pose for pose
const FIG7 = `012--+ 2,2,-2|012--+ 2,2,2|012--+ 3,3,-1|012--+ 3,3,1|012-+- 2,-2,2|012-+- 2,2,2|
012+-- -2,2,2|012+-- 2,2,2|012+++ -1,-1,-1|012+++ 1,1,1|021-++ 4,0,0|021+-+ -1,3,-1|021+-+ 0,4,0|
021++- 0,0,4|021++- 1,1,3|102-++ 0,0,0|102-++ 4,0,0|102+-+ 0,0,0|102+-+ 0,4,0|102++- -1,-1,3|
102++- 0,0,0|102++- 0,0,4|102++- 1,1,3|120--+ 2,2,-2|120--+ 2,2,2|120--+ 3,3,1|120-+- 2,-2,2|
120-+- 2,2,2|120-+- 3,-1,3|120+-- -2,2,2|120+-- 2,2,2|201--+ 2,2,-2|201--+ 2,2,2|201--+ 3,3,1|
201-+- 2,-2,2|201-+- 2,2,2|201+-- -2,2,2|201+-- -1,3,3|201+-- 2,2,2|210-++ 3,-1,-1|210-++ 4,0,0|
210+-+ 0,4,0|210++- 0,0,4|210++- 1,1,3`.replace(/\n/g, '').split('|');
{
  eq(FIG7.length, 44, 'Figure 7 transcribed');
  const mine = new Set(A.map((x) => T.frameKey(x.P.f) + ' ' + x.P.t.join(',')));
  for (const k of FIG7) ok(mine.has(k), `Figure 7 contact ${k} is legal here`);
  eq(new Set(A.map((x) => T.frameKey(x.P.f))).size, 19, 'the atlas uses 19 relative rotations');
  // …which generate the whole proper group
  const gen = new Set([T.IDENTITY]);
  const rs = [...new Set(A.map((x) => x.P.f))];
  for (let grew = true; grew;) {
    grew = false;
    for (const g of [...gen]) for (const r of rs) { const h = T.compose(g, r); if (!gen.has(h)) { gen.add(h); grew = true; } }
  }
  eq(gen.size, 24, 'the 19 contact rotations generate all 24');
}

// every legal contact is symmetric: if B is legal next to A, A is legal next to B
{
  const Q = T.pose(T.IDENTITY, [0, 0, 0]);
  const keys = new Set(A.map((x) => T.poseKey(x.P)));
  for (const { P } of A) {
    const gi = T.inverse(P.f);
    const back = T.pose(gi, T.act(gi, P.t).map((v) => -v));
    ok(keys.has(T.poseKey(back)), `inverse of contact ${T.poseKey(P)} is in the atlas`);
    ok(T.contact(P, Q).ok, `contact ${T.poseKey(P)} legal from the other side`);
  }
}

// -------------------------------------------------- substitution (Table 1) --
{
  for (const ch of T.CHILDREN) eq(ch.f.det, 1, `child ${ch.name} is a proper rotation`);
  const lv1 = T.patch(1);
  const cells = lv1.flatMap((t) => T.cellsOf(t.P)).map((c) => c.join(','));
  eq(cells.length, 56, 'eight children have 56 cells');
  eq(new Set(cells).size, 56, 'children do not overlap');
  const want = new Set(T.cellsOf(T.pose(T.IDENTITY, [0, 0, 0]), 2).map((c) => c.join(',')));
  ok(cells.every((c) => want.has(c)), 'children partition 2P');

  const D = T.dissections();
  eq(D.covers, 1, 'the bare doubled chair has one cut into eight chairs');
  ok(D.posesPerPiece.every((n) => n === 3), 'each piece fits three ways (the bare 3-fold turn)');
  eq(D.decorated.length, 6561, '3^8 decorated choices');
  const legal = D.decorated.filter((d) => d.legal);
  eq(legal.length, 3, 'legal decorated cuts');
  // …and they are Table 1 and its two turns about the body diagonal of 2P
  for (const p of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
    const R = T.frameOf(p, [1, 1, 1]);
    const k = new Set(T.CHILDREN.map((c) => T.poseKey(T.pose(T.compose(R, c.f), T.act(R, c.u)))));
    ok(legal.some((d) => d.poses.every((P) => k.has(T.poseKey(P)))), `Table 1 turned by ${p} is a legal cut`);
  }
}

// patches of 8, 64, 512: exact partitions, every internal contact legal
const PATCH = { 1: [8, 16], 2: [64, 183], 3: [512, 1663] };
for (const [l, [n, c]] of Object.entries(PATCH)) {
  const tiles = T.patch(+l);
  eq(tiles.length, n, `level ${l} chairs`);
  const cells = tiles.flatMap((t) => T.cellsOf(t.P)).map((x) => x.join(','));
  eq(new Set(cells).size, 7 * n, `level ${l} no overlaps`);
  const want = new Set(T.cellsOf(T.pose(T.IDENTITY, [0, 0, 0]), 2 ** l).map((x) => x.join(',')));
  ok(cells.every((x) => want.has(x)), `level ${l} fills ${2 ** l}P`);
  const cs = T.contactsWithin(tiles);
  eq(cs.length, c, `level ${l} internal contacts`);
  eq(cs.filter((x) => !x.ok).length, 0, `level ${l} every contact legal`);
  const atlasKeys = new Set(A.map((x) => T.poseKey(x.P)));
  // every internal contact, seen from either chair, is one of the 44
  let inAtlas = 0;
  for (const { i, j } of cs) {
    const Pa = tiles[i].P, Pb = tiles[j].P, gi = T.inverse(Pa.f);
    const rel = T.pose(T.compose(gi, Pb.f), T.act(gi, Pb.t.map((v, k) => v - Pa.t[k])));
    if (atlasKeys.has(T.poseKey(rel))) inAtlas++;
  }
  eq(inAtlas, c, `level ${l} every contact is an atlas pose`);
}

// ---------------------------------------------- parent atlas (§3.2) --------
{
  const r = T.parentAtlas(A.map((x) => x.P));
  eq(r.candidates, 697, 'candidate parent contacts');
  eq(r.disjoint, 116, 'with disjoint parent bodies');
  eq(r.legal.length, 44, 'legal parent contacts');
  ok(r.legal.every((R) => R.t.every((v) => v % 2 === 0)), 'every parent translation is even');
  const half = new Set(r.legal.map((R) => T.poseKey(T.pose(R.f, R.t.map((v) => v / 2)))));
  ok(A.every((x) => half.has(T.poseKey(x.P))), '½·(parent atlas) = atlas');
}

// -------------------------------------------------------------- symmetry ----
eq(T.selfSymmetries({ decorated: false }).length, 6, 'the bare chair has 6 symmetries');
eq(T.selfSymmetries().length, 1, 'Chair44 has none but the identity');

// ------------------------------------------------------------------ mesh ----
for (const [label, opts] of [['true', {}], ['exaggerated', { base: 0.1, height: 0.008 }], ['bare', { features: false }]]) {
  const m = T.mesh(opts);
  // closed and consistently oriented: every directed edge has its reverse, once
  const key = (i) => [m.pos[i], m.pos[i + 1], m.pos[i + 2]].map((v) => Math.round(v * 1e6)).join(',');
  const edges = new Map();
  for (let t = 0; t < m.pos.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    for (let e = 0; e < 3; e++) { const k = v[e] + '>' + v[(e + 1) % 3]; edges.set(k, (edges.get(k) || 0) + 1); }
  }
  let closed = true;
  for (const [k, n] of edges) { const [a, b] = k.split('>'); if (n !== 1 || edges.get(b + '>' + a) !== 1) { closed = false; break; } }
  ok(closed, `${label} mesh is closed and oriented`);
  ok(Math.abs(T.volume(m.pos) - 7) < 1e-6, `${label} mesh volume is 7 (got ${T.volume(m.pos)})`);
}

console.log(`chair44: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
