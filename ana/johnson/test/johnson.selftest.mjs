// JOHNSON, held: run `node ana/johnson/test/johnson.selftest.mjs` (V=1 prints each measured claim). The 92 solids'
// data is checked from scratch (a convex hull of the vertices alone must give back the faces; every face regular,
// unit edges); volumes against closed forms; the 4D constructions against their incidence counts, convexity, unit
// edges and Euler.
import { JOHNSON } from '../js/johnson-data.js';
import * as P from '../js/poly.js';

let fails = 0, passes = 0;
// a frame for vertex 0's tangent space (to see its neighbours in 3D)
const H0 = P.h600().V[0], frame0 = (() => { const out = []; for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { let v = ax; for (const u of [P.unit(H0), ...out]) v = P.add(v, u, -P.dot(v, u)); if (P.norm(v) > 0.3 && out.length < 3) out.push(P.unit(v)); } return out; })();
const ok = (c, msg) => { if (c) { passes++; if (process.env.V) console.log('✓ ' + msg); } else { fails++; console.error('✗ ' + msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const key = (f) => { const s = [...f].sort((a, b) => a - b); return s.join(','); };

// ------------------------------------------------------------------ the 92
ok(JOHNSON.length === 92 && JOHNSON.every((s, i) => s.j === i + 1), '92 solids, J1 to J92');
{
  let worstFace = 0, worstHull = '', euler = 0, convex = 0, counts = {};
  for (const s of JOHNSON) {
    const H = P.hull3(s.V), hk = new Set(H.map((h) => key(h.f))), dk = new Set(s.F.map(key));
    if (hk.size !== dk.size || [...hk].some((k) => !dk.has(k))) worstHull += ` J${s.j}`;
    for (const f of s.F) worstFace = Math.max(worstFace, P.faceError(s.V, f));
    const E = P.edges3(s.F);
    if (s.V.length - E.length + s.F.length !== 2) euler++;
    for (const h of H) for (const v of s.V) convex = Math.max(convex, P.dot(h.n, v) - h.b);
    for (const f of s.F) counts[f.length] = (counts[f.length] || 0) + 1;
  }
  ok(!worstHull, `a convex hull of each solid's vertices alone gives back exactly its faces${worstHull ? ':' + worstHull : ''}`);
  ok(worstFace < 1e-9, `every face of all 92 is a regular polygon with unit edges (worst error ${worstFace.toExponential(1)})`);
  ok(euler === 0 && convex < 1e-9, 'all 92 obey Euler (V − E + F = 2) and are convex');
  ok(Object.keys(counts).every((n) => [3, 4, 5, 6, 8, 10].includes(+n)), `their faces are triangles, squares, pentagons, hexagons, octagons and decagons only (${Object.entries(counts).map(([n, c]) => `${c} ${n}-gons`).join(', ')})`);
}
// volumes against closed forms (independent of the data's source)
{
  const s5 = Math.sqrt(5), s2 = Math.SQRT2;
  const vol = (j) => P.volume3(JOHNSON[j - 1].V, P.orient(JOHNSON[j - 1].V, JOHNSON[j - 1].F));
  const want = { 1: s2 / 6, 2: (5 + s5) / 24, 3: 5 * s2 / 6, 4: 1 + 2 * s2 / 3, 5: (10 + 8 * s5) / 12, 6: (45 + 17 * s5) / 12, 8: 1 + s2 / 6, 91: (17 + 9 * s5) / 12, 92: (15 + 7 * s5) / 6 };
  const bad = Object.entries(want).filter(([j, v]) => !near(vol(+j), v, 1e-9));
  ok(!bad.length, `volumes match closed forms: square pyramid √2/6, pentagonal rotunda (45 + 17√5)/12, bilunabirotunda (17 + 9√5)/12, triangular hebesphenorotunda (15 + 7√5)/6 …${bad.length ? ' bad: ' + bad.map(([j]) => `J${j} ${vol(+j)}`).join(' ') : ''}`);
}
// none is uniform (vertex-transitive), but a few look it: the same faces round every vertex, arranged differently
{
  const sameFigure = JOHNSON.filter((s) => { const fig = s.V.map((_, v) => s.F.filter((f) => f.includes(v)).map((f) => f.length).sort().join('.')); return new Set(fig).size === 1; }).map((s) => `J${s.j}`);
  ok(sameFigure.join(' ') === 'J27 J34 J37 J72 J73 J74 J75', `seven Johnson solids have the same faces round every vertex, and still aren't uniform (their vertices aren't all alike): ${sameFigure.join(' ')} (the triangular orthobicupola, the pentagonal orthobirotunda, the elongated square gyrobicupola, the four gyrate rhombicosidodecahedra)`);
}

// ------------------------------------------------------------------ the Platonic bases
for (const [name, v, e, f] of [['tetrahedron', 4, 6, 4], ['cube', 8, 12, 6], ['octahedron', 6, 12, 8], ['icosahedron', 12, 30, 20], ['dodecahedron', 20, 30, 12]]) {
  const S = P.platonic(name), E = P.edges3(S.F), err = Math.max(...S.F.map((fc) => P.faceError(S.V, fc)));
  ok(S.V.length === v && E.length === e && S.F.length === f && err < 1e-9, `the ${name}: ${v} vertices, ${e} edges, ${f} faces, unit and regular`);
}

// ------------------------------------------------------------------ the 600-cell and its diminishings
{
  const H = P.h600(), tri = new Set();
  for (const t of H.T) for (const k of [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]) tri.add(k.map((i) => t[i]).sort((a, b) => a - b).join(','));
  ok(H.V.length === 120 && H.E.length === 720 && tri.size === 1200 && H.T.length === 600, `the 600-cell: ${H.V.length} vertices, ${H.E.length} edges, ${tri.size} triangles, ${H.T.length} tetrahedra (120 − 720 + 1200 − 600 = 0)`);
  ok(H.A.every((nb) => nb.size === 12), 'every vertex has 12 neighbours');
  const nb = [...H.A[0]].map((i) => H.V[i]), S = P.hull3(nb.map((v) => [0, 1, 2].map((k) => P.dot(v, frame0[k]))));
  ok(S.length === 20 && S.every((h) => P.faceError(nb.map((v) => [0, 1, 2].map((k) => P.dot(v, frame0[k]))), h.f) < 1e-9), 'the 12 neighbours of a vertex are the vertices of a regular icosahedron, unit edge: what a cut leaves');
  const full = P.check4(P.diminished([]));
  ok(full.outside < 1e-9 && full.edge < 1e-9 && full.C === 600 && full.F === 1200 && full.euler === 0, `uncut: 600 tetrahedral cells, convex, unit edges, Euler ${full.euler}`);
  ok(P.independent(new Set(P.SNUB24)), 'the 24 vertices of the 24-cell inside it are pairwise non-adjacent: they can all be cut');
  const sn = P.diminished(P.SNUB24), c = P.check4(sn), kinds = sn.cells.reduce((m, x) => ((m[x.kind] = (m[x.kind] || 0) + 1), m), {});
  ok(sn.V.length === 96 && sn.E.length === 432 && c.F === 480 && kinds.tetrahedron === 120 && kinds.icosahedron === 24 && c.euler === 0 && c.outside < 1e-9 && c.offPlane < 1e-9, `cut all 24: the snub 24-cell, 96 vertices, 432 edges, 480 triangles, 120 tetrahedra + 24 icosahedra (Euler ${c.euler}), convex`);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const m = P.randomMaximal(rnd), cm = P.check4(P.diminished(m));
  ok(P.independent(m) && cm.outside < 1e-9 && cm.offPlane < 1e-9 && cm.euler === 0 && cm.edge < 1e-9, `a random maximal cut (${m.size} vertices, no two adjacent): convex, every cell flat, unit edges, Euler ${cm.euler}`);
  let threw = false; const a = 0, b = [...H.A[0]][0]; try { P.diminished([a, b]); } catch { threw = true; }
  ok(threw, 'two adjacent vertices are refused: cutting both would cut through the edge between them');
}

// ------------------------------------------------------------------ prisms and pyramids over the solids
{
  let bad = '';
  for (const s of JOHNSON) { const c = P.check4(P.prism(s)); if (!(c.outside < 1e-9 && c.offPlane < 1e-9 && c.edge < 1e-9 && c.euler === 0)) bad += ` J${s.j}`; }
  ok(!bad, `a prism over each of the 92 is a convex 4D solid with unit edges (cells: two copies and a prism on each face; Euler 0)${bad}`);
  const pyr = JOHNSON.filter((s) => P.pyramid(s)).map((s) => `J${s.j}`), bip = JOHNSON.filter((s) => P.pyramid(s, true)).map((s) => `J${s.j}`);
  const good = (x) => { const c = P.check4(x); return c.edge < 1e-9 && c.outside < 1e-9 && c.offPlane < 1e-9 && c.euler === 0; };
  ok(pyr.join(' ') === 'J1 J2 J11 J62 J63' && JOHNSON.filter((s) => P.pyramid(s)).every((s) => good(P.pyramid(s))), `the Johnson solids with a circumsphere under one edge, so a 4D apex can sit a unit from every vertex: ${pyr.join(' ')} (the square and pentagonal pyramids and the diminished icosahedra); each pyramid convex, unit edges, Euler 0`);
  ok(bip.join(' ') === 'J1 J11 J62 J63' && JOHNSON.filter((s) => P.pyramid(s, true)).every((s) => good(P.pyramid(s, true))), `bipyramids over ${bip.join(' ')}; not over J2, whose circumcentre lies outside it (beyond its pentagon), so the two apexes would fold it in`);
  const b1 = P.pyramid(JOHNSON[0], true), k1 = b1.cells.map((c) => c.kind).sort().join(' ');
  ok(b1.cells.length === 9 && b1.cells.filter((c) => c.kind === '4-bipyramid').length === 1, `the bipyramid over the square pyramid (J1) is the octahedral pyramid: its square's two pyramid cells lie in one hyperplane and make an octahedron (cells: ${k1})`);
  for (const [name, can] of [['tetrahedron', true], ['octahedron', true], ['cube', true], ['icosahedron', true], ['dodecahedron', false]]) {
    const S = P.platonic(name), py = P.pyramid(S);
    ok(!!py === can && (!py || (P.check4(py).edge < 1e-9 && P.check4(py).euler === 0)), `the ${name} pyramid ${can ? 'exists (circumradius ' + P.circumsphere(S.V).r.toFixed(3) + ' < 1)' : 'does not (circumradius ' + P.circumsphere(S.V).r.toFixed(3) + ' ≥ 1)'}`);
  }
  const t5 = P.check4(P.pyramid(P.platonic('tetrahedron'))), o16 = P.check4(P.pyramid(P.platonic('octahedron'), true));
  ok(t5.C === 5 && t5.V === 5 && o16.C === 16 && o16.V === 8, 'the tetrahedral pyramid is the 5-cell (5 cells, 5 vertices) and the octahedral bipyramid the 16-cell (16 cells, 8 vertices)');
}

// ------------------------------------------------------------------ slicing
{
  // the tesseract-like prism over the cube: its slice at w = 0 is the unit cube, at |w| > ½ nothing
  const C = P.prism(P.platonic('cube')), E = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const mid = P.slice(C, [0, 0, 0, 0], E), out = P.slice(C, [0, 0, 0, 0.6], E);
  const vol = mid.length ? P.volume3(...(() => { const V = [], F = []; for (const f of mid) { F.push(f.pts.map((p) => { V.push(p); return V.length - 1; })); } return [V, F]; })()) : 0;
  ok(mid.length === 6 && near(vol, 1, 1e-9) && out.length === 0, `slicing the tesseract (the cube's prism) through its middle gives the unit cube (6 faces, volume ${vol.toFixed(6)}); past w = ½ it's gone`);
  // the 600-cell sliced through its centre square-on: a polyhedron whose faces are cut tetrahedra; its vertices all within the circumradius
  const H = P.diminished([]), s = P.slice(H, [0, 0, 0, 0], E), far = Math.max(...s.flatMap((f) => f.pts.map(P.norm)));
  ok(s.length > 0 && far <= P.PHI + 1e-9, `a slice of the 600-cell through its centre: ${s.length} faces, all within its circumradius φ (${far.toFixed(4)})`);
}
console.log(`${fails ? '✗' : '✓'} johnson: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
