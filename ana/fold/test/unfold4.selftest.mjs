// Ridge unfoldings of 4D polytopes, held: node ana/fold/test/unfold4.selftest.mjs (V=1 prints each). ~30 s.
// Whether every convex polytope has a net (a non-overlapping unfolding cut only along ridges) is OPEN in every
// dimension ≥ 3 (Dürer–Shephard). These are checked facts about particular polytopes, not a proof of anything general.
import * as U from '../js/unfold4.js';
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
// the 600-cell: it has a net (and long winding unfoldings overlap)
{
  const H = h600(), P = U.polytope(H.V, H.T.map((t) => [0, 1, 2, 3].map((k) => t.reduce((s, i) => s + H.V[i][k], 0) / 4)));
  ok(P.cells.length === 600 && P.adj.every((m) => m.size === 4), 'the 600-cell: 600 tetrahedral cells, 4 neighbours each');
  const u = U.unfold(P, NET_600), o = U.overlaps(u.cells);
  ok(rigid(P, NET_600, u) < 1e-12 && o.length === 0, `a net of the 600-cell: 600 tetrahedra laid out in our space (${[0, 1, 2].map((k) => (Math.max(...u.cells.flat().map((p) => p[k])) - Math.min(...u.cells.flat().map((p) => p[k]))).toFixed(1)).join(' × ')}), rigid and hinged, no two overlapping (volume to 1e-9)`);
  const ud = U.unfold(P, U.randomTree(P, 'dfs', rnd, 7)), od = U.overlaps(ud.cells);
  ok(od.length > 0, `a long winding unfolding of it does overlap (${od.length} pairs): the detector isn't blind (the 600-cell is not all-net: Devadoss–Harvey)`);
}
console.log(`${fails ? '✗' : '✓'} unfold4: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
