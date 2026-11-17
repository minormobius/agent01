// FOLD, held: run `node ana/fold/test/fold.selftest.mjs` (V=1 prints each measured claim). ~40 s.
import { depth as clashDepth } from '../js/clash.js';
import * as F from '../js/fold.js';
import { NETS } from '../js/nets-data.js';
import { JOHNSON, SNUB_DODECAHEDRON } from '../../johnson/js/johnson-data.js';

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) { passes++; if (process.env.V) console.log('✓ ' + msg); } else { fails++; console.error('✗ ' + msg); } };
const d4 = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

// the tesseract and its hinges
ok(F.CELLS.length === 8 && F.DUAL_EDGES.length === 24, 'the tesseract: 8 cubes, each sharing a square with 6 others (24 hinges)');
{
  let worst = 0; for (const c of F.CELLS) for (const v of c.V) worst = Math.max(worst, Math.abs(F.dot(v, c.n) - 0.5), ...v.map((x) => Math.abs(Math.abs(x) - 0.5)));
  ok(worst < 1e-12, 'every cell is a unit cube on the tesseract\'s boundary');
}
// the nets
const N = F.nets();
ok(N.trees === 82944 && N.trees === 2 ** 6 * 4 ** 2 * 3 ** 4, `82,944 spanning trees (the cocktail-party graph's count, 2⁶·4²·3⁴): every way to choose 7 hinges that hold the 8 cubes together`);
ok(N.overlapping === 0, 'every one of them unfolds flat without two cubes overlapping');
ok(N.list.length === 261, `they make ${N.list.length} different nets, up to turning and mirroring: Turney's 261 (1984)`);
const rot = new Set(); for (const n of N.list) { rot.add(F.canonicalCubes(n.cubes, false)); rot.add(F.canonicalCubes(n.cubes.map((c) => [-c[0], c[1], c[2]]), false)); }
ok(rot.size === 455 && NETS.filter((n) => n.chiral).length === 194, `counting mirror images apart, 455: so 194 of the nets come in left- and right-handed pairs and 67 are their own mirror image`);
ok(NETS.length === 261 && NETS.every((n, i) => F.canonicalCubes(n.cubes) === N.list[i].key), 'the shipped nets are exactly these, in the same order');
const dali = F.daliNet(N.list);
ok(!!dali, 'Dalí\'s net is among them: a column of four cubes with four more round the second (Corpus Hypercubus, 1954)');
// folding: rigid, hinged, and it really closes into the tesseract
{
  let rigid = 0, hinge = 0, closed = 0, flat = 0;
  for (const net of NETS.slice(0, 40)) {
    for (const t of [0, 0.3, 0.7, 1]) {
      const M = F.motions(net.parent, t);
      F.CELLS.forEach((c, i) => {
        const W = c.V.map(M[i]);
        for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) rigid = Math.max(rigid, Math.abs(d4(W[a], W[b]) - d4(c.V[a], c.V[b])));
        if (t === 0) closed = Math.max(closed, ...c.V.map((v, k) => d4(v, W[k])));
        if (t === 1) flat = Math.max(flat, ...W.map((v) => Math.abs(v[3] + 0.5)));
        const p = net.parent[i];
        if (p >= 0) for (const v of c.V) if (Math.abs(F.dot(v, F.CELLS[p].n) - 0.5) < 1e-9) hinge = Math.max(hinge, d4(M[i](v), M[p](v)));
      });
    }
  }
  ok(rigid < 1e-9, `folding moves every cube rigidly (worst change in any distance ${rigid.toExponential(1)})`);
  ok(hinge < 1e-9, 'each cube stays joined to its parent along their shared square at every angle');
  ok(closed < 1e-9 && flat < 1e-9, 'folded, every cube is back in place in the tesseract; flat, every cube lies in our space (w = −½)');
}
// the mirror fold
{
  const S = SNUB_DODECAHEDRON.V, M = S.map((p) => F.turnXW([...p, 0], Math.PI)), mir = S.map((p) => [-p[0], p[1], p[2]]);
  ok(M.every((p, i) => Math.abs(p[3]) < 1e-12 && Math.hypot(p[0] - mir[i][0], p[1] - mir[i][1], p[2] - mir[i][2]) < 1e-12), 'half a turn in the plane of x and w brings a solid back into our space with x reversed: its mirror image');
  let worst = 0; for (const a of [0.4, 1.3, 2.2]) { const T = S.map((p) => F.turnXW([...p, 0], a)); for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) worst = Math.max(worst, Math.abs(d4(T[i], T[j]) - Math.hypot(...S[i].map((v, k) => v - S[j][k])))); }
  ok(worst < 1e-12, 'the solid stays rigid all the way through w');
  ok(F.congruence(S, mir) === 'reflection', 'and no turn in 3D can do that for the snub dodecahedron: every match between it and its mirror image is a reflection (the test tries them all)');
  const chiral = JOHNSON.filter((s) => F.congruence(s.V, s.V.map((p) => [-p[0], p[1], p[2]])) !== 'rotation').map((s) => s.j);
  ok(chiral.join(',') === '44,45,46,47,48', `of the 92 Johnson solids exactly five are chiral (J${chiral.join(', J')}, the gyroelongated bicupolae and birotundas); the rest turn into their own mirror images in 3D`);
}
// clashes: the linear programme against answers known by hand, then the claims the page makes about the 261
{
  const I3 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
  const d1 = clashDepth([0, 0, 0, 0], I3, 0.5, [0.6, 0, 0, 0], I3, 0.5);           // two unit cubes, 0.6 apart along x: overlap 0.4 thick, deepest point 0.2 in
  const d2 = clashDepth([0, 0, 0, 0], I3, 0.5, [1, 0, 0, 0], I3, 0.5);             // face to face
  const d3 = clashDepth([0, 0, 0, 0], I3, 0.5, [1.5, 0, 0, 0], I3, 0.5);           // apart
  const d4c = clashDepth([0, 0, 0, 0], I3, 0.5, [0, 0, 0, 0], [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]], 0.5);   // crossing in 4D through a shared square: 0.5 deep
  ok(Math.abs(d1 - 0.2) < 1e-9 && Math.abs(d2) < 1e-9 && d3 === -1 && Math.abs(d4c - 0.5) < 1e-9, `the clash test: overlapping cubes ${d1.toFixed(3)} deep (0.2), face to face ${d2.toFixed(3)} (touching), apart −1, two cubes crossing through each other in 4D ${d4c.toFixed(3)} (0.5)`);
  const cellBox = (M, i) => { const c = F.CELLS[i], o = M(c.n.map((v) => v / 2)), O = M([0, 0, 0, 0]); return [o, [0, 1, 2, 3].filter((k) => k !== c.axis).map((k) => { const e = [0, 0, 0, 0]; e[k] = 1; return M(e).map((v, j) => v - O[j]); })]; };
  const worstClash = (parent, ring, steps) => { let m = 0; for (let k = 1; k < steps; k++) { const M = F.motions(parent, k / steps, ring), B = F.CELLS.map((_, i) => cellBox(M[i], i)); for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) { if (Math.hypot(...B[a][0].map((v, j) => v - B[b][0][j])) > Math.sqrt(3)) continue; m = Math.max(m, clashDepth(B[a][0], B[a][1], 0.5, B[b][0], B[b][1], 0.5)); } } return m; };
  // ring by ring: still rigid, hinged, and closing
  let bad = 0; for (const net of NETS.slice(0, 40)) for (const t of [0, 0.2, 0.5, 0.8, 1]) { const M = F.motions(net.parent, t, true);
    F.CELLS.forEach((c, i) => { const W = c.V.map(M[i]); for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) bad = Math.max(bad, Math.abs(d4(W[a], W[b]) - d4(c.V[a], c.V[b]))); if (t === 0) bad = Math.max(bad, ...c.V.map((v, k) => d4(v, W[k]))); const p = net.parent[i]; if (p >= 0) for (const v of c.V) if (Math.abs(F.dot(v, F.CELLS[p].n) - 0.5) < 1e-9) bad = Math.max(bad, d4(M[i](v), M[p](v))); if (t === 1) bad = Math.max(bad, ...W.map((v) => Math.abs(v[3] + 0.5))); }); }
  ok(bad < 1e-12, 'folding ring by ring is rigid, keeps every hinge, lies flat at the start and closes into the tesseract at the end');
  const all = NETS.map((n) => worstClash(n.parent, false, 48)), ring = NETS.map((n) => worstClash(n.parent, true, 48));
  const nAll = all.filter((d) => d > 1e-6).length, nRing = ring.filter((d) => d > 1e-6).length;
  ok(nAll === 33 && nRing === 0, `turning every hinge at once, ${nAll} of the 261 nets have two cubes pass through each other (deepest ${(Math.max(...all) * 100).toFixed(1)}% of a cube); ring by ring, ${nRing} do (48 moments of each fold, every pair of cubes)`);
}
console.log(`${fails ? '✗' : '✓'} fold: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
