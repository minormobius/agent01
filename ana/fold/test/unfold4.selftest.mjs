// Ridge unfoldings of 4D polytopes, held: node ana/fold/test/unfold4.selftest.mjs (V=1 prints each). ~30 s.
// Whether every convex polytope has a net (a non-overlapping unfolding cut only along ridges) is OPEN in every
// dimension ≥ 3 (Dürer–Shephard). These are checked facts about particular polytopes, not a proof of anything general.
import * as U from '../js/unfold4.js';
import { depthCells } from '../js/clash.js';
import { OVERLAP_24, NET_24, NET_600 } from '../js/unfold4-data.js';
import { h600 } from '../../johnson/js/poly.js';

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; if (process.env.V) console.log('✓ ' + msg); } else { fails++; console.error('✗ ' + msg); } };
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rigid = (P, parent, u) => {
  let e = 0, h = 0;
  P.cells.forEach((c, i) => { for (let a = 0; a < c.verts.length; a++) for (let b = a + 1; b < c.verts.length; b++) e = Math.max(e, Math.abs(d(u.cells[i][a], u.cells[i][b]) - Math.hypot(...P.V[c.verts[a]].map((x, k) => x - P.V[c.verts[b]][k])))); });
  parent.forEach((p, c) => { if (p < 0) return; for (const v of P.adj[p].get(c)) h = Math.max(h, d(u.cells[c][P.cells[c].verts.indexOf(v)], u.cells[p][P.cells[p].verts.indexOf(v)])); });
  return Math.max(e, h, u.offPlane);
};
let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// calibration: the tesseract is all-net (Devadoss–Harvey; FOLD's own count: all 82,944)
{
  const T = U.tesseract(); let over = 0, worst = 0;
  for (let i = 0; i < 400; i++) { const p = U.randomTree(T, i % 2 ? 'dfs' : 'bfs', rnd, i % 8), u = U.unfold(T, p); worst = Math.max(worst, rigid(T, p, u)); if (U.overlaps(u.cells).length) over++; }
  ok(over === 0 && worst < 1e-12, `calibration: 400 random unfoldings of the tesseract, all nets, all rigid (${worst.toExponential(1)})`);
}
// the 24-cell: not all-net, but it has nets
{
  const P = U.cell24();
  ok(P.cells.length === 24 && P.cells.every((c) => c.verts.length === 6) && P.adj.every((m) => m.size === 8), 'the 24-cell: 24 octahedral cells, each sharing a triangle with 8 others');
  const u = U.unfold(P, OVERLAP_24), o = U.overlaps(u.cells), w = U.witness(u.cells[9], u.cells[13]);
  ok(rigid(P, OVERLAP_24, u) < 1e-12 && o.some((x) => x.a === 9 && x.b === 13) && w.margin > 0.08, `an unfolding of the 24-cell overlaps: cells 9 and 13 share volume ${o.find((x) => x.a === 9 && x.b === 13).volume.toFixed(4)}, and the point (${w.p.map((x) => x.toFixed(3)).join(', ')}) is inside both by at least ${w.margin.toFixed(4)} (rounding error ~1e-14): the 24-cell is not all-net (as Devadoss–Harvey conjectured, and recent work claims)`);
  const un = U.unfold(P, NET_24);
  ok(rigid(P, NET_24, un) < 1e-12 && U.overlaps(un.cells).length === 0, 'and one that is a net');
}
// folding part-way (FOLD's 24-cell mode): t = 0 is the 24-cell itself, t = 1 the flat unfolding, rigid and hinged between
{
  const P = U.cell24(), d4 = (a, b) => Math.hypot(...a.map((x, k) => x - b[k]));
  let id = 0, rig = 0, hin = 0;
  for (const t of [0, 0.25, 0.6]) {
    const M = U.motionsAt(P, OVERLAP_24, t);
    P.cells.forEach((c, i) => {
      if (t === 0) for (const v of c.verts) id = Math.max(id, d4(M[i](P.V[v]), P.V[v]));
      for (const a of c.verts) for (const b of c.verts) rig = Math.max(rig, Math.abs(d4(M[i](P.V[a]), M[i](P.V[b])) - d4(P.V[a], P.V[b])));
      const p = OVERLAP_24[i]; if (p >= 0) for (const v of P.adj[p].get(i)) hin = Math.max(hin, d4(M[i](P.V[v]), M[p](P.V[v])));
    });
  }
  const flat = U.unfold(P, OVERLAP_24), basis = U.rootBasis(P, OVERLAP_24.indexOf(-1)), o = P.V[P.cells[OVERLAP_24.indexOf(-1)].verts[0]], M1 = U.motionsAt(P, OVERLAP_24, 1);
  let same = 0; P.cells.forEach((c, i) => c.verts.forEach((v, k) => { const x = M1[i](P.V[v]); same = Math.max(same, d4(basis.map((b) => b.reduce((t, bb, j) => t + bb * (x[j] - o[j]), 0)), flat.cells[i][k])); }));
  ok(id < 1e-12 && rig < 1e-12 && hin < 1e-12 && same < 1e-12, `folding the 24-cell part-way: unfolded 0% it is the 24-cell, 100% exactly the flat unfolding, rigid and hinged at every angle between`);
  ok(U.cellFaces(P).every((f) => f.length === 8 && f.every((t) => t.length === 3)), 'each octahedral cell is drawn by its 8 triangles');
}
// the 600-cell: it has a net (and long winding unfoldings overlap)
{
  const H = h600(), P = U.polytope(H.V, H.T.map((t) => [0, 1, 2, 3].map((k) => t.reduce((s, i) => s + H.V[i][k], 0) / 4)));
  ok(P.cells.length === 600 && P.adj.every((m) => m.size === 4), 'the 600-cell: 600 tetrahedral cells, 4 neighbours each');
  const u = U.unfold(P, NET_600), o = U.overlaps(u.cells);
  ok(rigid(P, NET_600, u) < 1e-12 && o.length === 0, `a net of the 600-cell: 600 tetrahedra laid out in our space (${[0, 1, 2].map((k) => (Math.max(...u.cells.flat().map((p) => p[k])) - Math.min(...u.cells.flat().map((p) => p[k]))).toFixed(1)).join(' × ')}), rigid and hinged, no two overlapping (volume to 1e-9)`);
  const ud = U.unfold(P, U.randomTree(P, 'dfs', rnd, 7)), od = U.overlaps(ud.cells);
  ok(od.length > 0, `a long winding unfolding of it does overlap (${od.length} pairs): the detector isn't blind (the 600-cell is not all-net: Devadoss–Harvey)`);
}
// folding the 24-cell without collisions: all at once its octahedra pass through each other in most nets; ring by ring, not
{
  const P = U.cell24(), nrm = (a) => Math.hypot(...a);
  const worst = (parent, ring, steps) => { let m = 0; for (let k = 1; k < steps; k++) { const C = U.movedCells(P, U.motionsAt(P, parent, k / steps, ring));
    for (let a = 0; a < 24; a++) for (let b = a + 1; b < 24; b++) { if (nrm(C[a].ctr.map((v, j) => v - C[b].ctr[j])) >= C[a].rad + C[b].rad) continue; m = Math.max(m, depthCells(C[a], C[b])); } } return m; };
  let rf = 0; for (const t of [0, 0.25, 0.5, 0.75, 1]) { const M = U.motionsAt(P, NET_24, t, true); P.cells.forEach((c, i) => { for (const v of c.verts) for (const w of c.verts) rf = Math.max(rf, Math.abs(nrm(M[i](P.V[v]).map((x, k) => x - M[i](P.V[w])[k])) - nrm(P.V[v].map((x, k) => x - P.V[w][k])))); }); }
  const flat = U.unfold(P, NET_24).offPlane, back = Math.max(...P.cells.flatMap((c, i) => c.verts.map((v) => nrm(U.motionsAt(P, NET_24, 0, true)[i](P.V[v]).map((x, k) => x - P.V[v][k])))));
  ok(rf < 1e-9 && back < 1e-12, 'ring by ring, the 24-cell\'s cells stay rigid and it closes back into the 24-cell');
  let seed = 4242; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let n = 0, all = 0, ring = 0, deep = 0;
  while (n < 12) { const parent = U.randomTree(P, rnd() < 0.75 ? 'dfs' : 'bfs', rnd); if (U.overlaps(U.unfold(P, parent).cells).length) continue; n++; const a = worst(parent, false, 24), r = worst(parent, true, 24); if (a > 1e-6) all++; if (r > 1e-6) ring++; deep = Math.max(deep, a); }
  ok(all >= 6 && ring === 0, `of ${n} random nets of the 24-cell, ${all} have octahedra pass through each other with every hinge turning at once (up to ${deep.toFixed(2)} deep); ring by ring, ${ring} (the page claims 148 and 0 of 200, measured with HiGHS agreeing)`);
}
// duoprisms: the structure, the tesseract among them, which are all-net, and folding them
{
  const nrm = (a) => Math.hypot(...a);
  let struct = true;
  for (const [p, q] of [[3, 3], [3, 7], [5, 6], [12, 12]]) {
    const P = U.duoprism(p, q), edges = P.V.flatMap((u, i) => P.V.slice(i + 1).filter((w) => Math.abs(nrm(u.map((x, k) => x - w[k])) - 1) < 1e-9)).length;
    const ringA = P.cells.slice(0, p).every((c) => c.verts.length === 2 * q), ringB = P.cells.slice(p).every((c) => c.verts.length === 2 * p);
    // each prism meets its two ring neighbours on a polygon and every prism of the other ring on a square
    const adjOk = P.cells.every((c, i) => { const mine = i < p, n = mine ? p : q, k = mine ? i : i - p, off = mine ? 0 : p; return [...P.adj[i]].every(([j, sh]) => (j - off >= 0 && j - off < n) === true && (j < p) === mine ? sh.length === (mine ? q : p) && (Math.abs(j - off - k) === 1 || Math.abs(j - off - k) === n - 1) : sh.length === 4) && P.adj[i].size === 2 + (mine ? q : p); });
    struct = struct && P.V.length === p * q && edges === 2 * p * q && P.cells.length === p + q && ringA && ringB && adjOk;
  }
  ok(struct, 'the p,q-duoprism: pq vertices, 2pq unit edges, p q-gonal prisms and q p-gonal prisms, each meeting its two ring neighbours on a polygon and every prism of the other ring on a square');
  ok(U.treeCount(U.duoprism(4, 4)) === 82944, 'the 4,4-duoprism is the tesseract: the same 82,944 hinge trees');
  for (const [p, q, want] of [[3, 3, 1296], [3, 4, 8575]]) {
    const P = U.duoprism(p, q); let n = 0, over = 0; U.eachTree(P, (par) => { n++; if (U.overlaps(U.unfold(P, par).cells).length) over++; return false; });
    ok(n === want && over === 0, `the ${p},${q}-duoprism: all ${n} of its unfoldings are nets (Kirchhoff: ${U.treeCount(P)})`);
  }
  let seed = 31; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const P8 = U.duoprism(8, 8); let found = null;
  for (let k = 0; k < 400 && !found; k++) { const par = U.randomTree(P8, k % 4 ? 'dfs' : 'bfs', rnd, Math.floor(rnd() * 16)), fl = U.unfold(P8, par), o = U.overlaps(fl.cells); if (o.length) found = { o, w: U.witness(fl.cells[o[0].a], fl.cells[o[0].b]) }; }
  ok(found && found.w.margin > 0.01, `the 8,8-duoprism is not all-net: an unfolding with two prisms overlapping, a point inside both by ${found ? found.w.margin.toFixed(3) : '?'}`);
  // folding: ring by ring no prisms cross, in sampled nets of a few; all at once some do
  let all = 0, ring = 0, nets = 0;
  for (const [p, q] of [[3, 3], [5, 6], [3, 8]]) {
    const P = U.duoprism(p, q);
    for (let k = 0; k < 4; k++) { const par = U.randomTree(P, 'dfs', rnd, Math.floor(rnd() * (p + q))); if (U.overlaps(U.unfold(P, par).cells).length) continue; nets++;
      const worst = (rg) => { let m = 0; for (let s = 1; s < 24; s++) { const C = U.movedCells(P, U.motionsAt(P, par, s / 24, rg)); for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) { if (nrm(C[a].ctr.map((v, j) => v - C[b].ctr[j])) >= C[a].rad + C[b].rad) continue; m = Math.max(m, depthCells(C[a], C[b])); } } return m; };
      if (worst(false) > 1e-6) all++; if (worst(true) > 1e-6) ring++; }
  }
  ok(ring === 0 && all > 0, `folding sampled duoprism nets (3,3, 5,6, 3,8): ${all} of ${nets} have prisms crossing with every hinge at once, ${ring} ring by ring`);
  // the quick separating test never hides a crossing the exact one finds
  let pairs = 0, dis = 0;
  for (const P of [U.duoprism(5, 6), U.duoprism(8, 8), U.cell24()]) for (let r = 0; r < 3; r++) { const par = U.randomTree(P, 'dfs', rnd, 0);
    for (const rg of [false, true]) for (const t of [0.1, 0.5, 0.9]) { const C = U.movedCells(P, U.motionsAt(P, par, t, rg));
      for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) { if (nrm(C[a].ctr.map((v, j) => v - C[b].ctr[j])) >= C[a].rad + C[b].rad) continue; pairs++;
        const d1 = depthCells(C[a], C[b]), d0 = depthCells({ ...C[a], pts: null }, { ...C[b], pts: null }); if ((d0 > 1e-6) !== (d1 > 1e-6) || (d0 > 1e-6 && Math.abs(d0 - d1) > 1e-12)) dis++; } } }
  ok(dis === 0, `the quick separating test agrees with the exact depth on all ${pairs} nearby pairs sampled (it only skips pairs that can't cross)`);
}
console.log(`${fails ? '✗' : '✓'} unfold4: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
