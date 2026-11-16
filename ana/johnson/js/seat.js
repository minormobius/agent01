// The seat: the 92 Johnson solids seated on the 92 faces of the snub dodecahedron, the one solid (uniform, so not a
// Johnson solid itself) with exactly that many faces. No DOM. The seating is structural:
//  - its 12 pentagons, at the icosahedral points, seat the 12 solids made from the rhombicosidodecahedron by gyrating
//    and diminishing it (J72–J83);
//  - its 80 triangles are cut into eight connected patches, one per remaining family, each exactly the family's size
//    (6 + 11 + 8 + 23 + 9 + 7 + 7 + 9 = 80), the lowest J-number at the patch's heart and the rest outward from it.
// The patches are grown from a fixed seed (the same seating every time); the selftest checks every one is connected.
import { SNUB_DODECAHEDRON } from './johnson-data.js';

export const FAMILIES = [
  { name: 'pyramids, cupolae, the rotunda', a: 1, b: 6, col: [1.0, 0.8, 0.42] },
  { name: 'elongated and gyroelongated pyramids, bipyramids', a: 7, b: 17, col: [0.44, 0.84, 1.0] },
  { name: 'elongated and gyroelongated cupolae, rotundas', a: 18, b: 25, col: [1.0, 0.5, 0.74] },
  { name: 'bicupolae, cupolarotundas, birotundas', a: 26, b: 48, col: [0.7, 0.56, 1.0] },
  { name: 'augmented prisms', a: 49, b: 57, col: [0.5, 0.88, 0.55] },
  { name: 'augmented dodecahedra, diminished icosahedra', a: 58, b: 64, col: [1.0, 0.6, 0.32] },
  { name: 'augmented truncated solids', a: 65, b: 71, col: [0.36, 0.62, 1.0] },
  { name: 'gyrate and diminished rhombicosidodecahedra', a: 72, b: 83, col: [0.95, 0.93, 0.88] },
  { name: 'the elementary ones', a: 84, b: 92, col: [0.95, 0.9, 0.35] },
];
export const familyOf = (j) => FAMILIES.findIndex((f) => j >= f.a && j <= f.b);
const PENT = FAMILIES.findIndex((f) => f.a === 72);

/** The snub dodecahedron's faces with their neighbours (sharing an edge). */
export function faceGraph(S = SNUB_DODECAHEDRON) {
  const byEdge = new Map();
  S.F.forEach((f, i) => f.forEach((a, k) => { const b = f[(k + 1) % f.length], key = a < b ? `${a},${b}` : `${b},${a}`; (byEdge.get(key) || byEdge.set(key, []).get(key)).push(i); }));
  const nb = S.F.map(() => []);
  for (const fs of byEdge.values()) if (fs.length === 2) { nb[fs[0]].push(fs[1]); nb[fs[1]].push(fs[0]); }
  return nb;
}

/** The seating: seat[faceIndex] = J-number. Deterministic. */
export function seating(S = SNUB_DODECAHEDRON) {
  const nb = faceGraph(S), pent = S.F.map((f, i) => (f.length === 5 ? i : -1)).filter((i) => i >= 0);
  const tri = S.F.map((f, i) => (f.length === 3 ? i : -1)).filter((i) => i >= 0);
  const seat = new Array(S.F.length).fill(0);
  // the 12 pentagons: J72–J83, in an order that walks round the solid (each next pentagon the nearest unused one)
  const cen = S.F.map((f) => [0, 1, 2].map((k) => f.reduce((s, i) => s + S.V[i][k], 0) / f.length));
  const d2 = (a, b) => (cen[a][0] - cen[b][0]) ** 2 + (cen[a][1] - cen[b][1]) ** 2 + (cen[a][2] - cen[b][2]) ** 2;
  const top = pent.reduce((a, b) => (cen[b][2] > cen[a][2] ? b : a));
  const order = [top], left = new Set(pent.filter((p) => p !== top));
  while (left.size) { const last = order[order.length - 1], nx = [...left].reduce((a, b) => (d2(last, b) < d2(last, a) ? b : a)); order.push(nx); left.delete(nx); }
  order.forEach((f, k) => { seat[f] = FAMILIES[PENT].a + k; });
  // the 80 triangles: grow eight connected patches, sizes the families', from a fixed pseudo-random seed; retry until
  // every patch reaches its size (a patch walled in early fails the attempt)
  const fams = FAMILIES.map((f, i) => ({ i, size: f.b - f.a + 1 })).filter((f) => f.i !== PENT);
  let seed = 20261116;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let attempt = 0; attempt < 20000; attempt++) {
    const owner = new Map(), regions = fams.map(() => []);
    const free = new Set(tri);
    let ok = true;
    for (let r = 0; r < fams.length && ok; r++) {
      // start each patch on a free triangle with the fewest free neighbours (grow from the edges of what's left)
      const cands = [...free];
      const score = (t) => nb[t].filter((x) => free.has(x)).length + rnd() * 0.9;
      const start = cands.reduce((a, b) => (score(b) < score(a) ? b : a));
      const reg = [start]; free.delete(start); owner.set(start, r);
      while (reg.length < fams[r].size) {
        const frontier = [...new Set(reg.flatMap((t) => nb[t]))].filter((t) => free.has(t));
        if (!frontier.length) { ok = false; break; }
        // prefer the frontier triangle that keeps the region compact and leaves the fewest free triangles stranded
        const pick = frontier.reduce((a, b) => {
          const s = (t) => nb[t].filter((x) => owner.get(x) === r).length * 2 - nb[t].filter((x) => free.has(x)).length + rnd() * 1.5;
          return s(b) > s(a) ? b : a;
        });
        reg.push(pick); free.delete(pick); owner.set(pick, r);
      }
      regions[r] = reg;
      if (ok && !connectedComponentsFit(free, nb, fams.slice(r + 1).map((f) => f.size))) ok = false;
    }
    if (!ok || free.size) continue;
    // within each patch, J-numbers outward from its heart (the triangle with the most patch-mates within two steps)
    regions.forEach((reg, r) => {
      const inReg = new Set(reg);
      const heart = reg.reduce((a, b) => (near2(b, nb, inReg) > near2(a, nb, inReg) ? b : a));
      const bfs = [heart], seen = new Set([heart]);
      for (let k = 0; k < bfs.length; k++) for (const x of nb[bfs[k]]) if (inReg.has(x) && !seen.has(x)) { seen.add(x); bfs.push(x); }
      bfs.forEach((t, k) => { seat[t] = FAMILIES[fams[r].i].a + k; });
    });
    return { seat, attempt };
  }
  throw new Error('no seating found');
}
const near2 = (t, nb, inReg) => { const s = new Set(); for (const a of nb[t]) if (inReg.has(a)) { s.add(a); for (const b of nb[a]) if (inReg.has(b)) s.add(b); } return s.size; };
/** Can the free triangles' connected pieces still take the remaining patch sizes? (each piece must be filled exactly
 *  by some of them: a subset-sum per piece, small enough to brute force) */
function connectedComponentsFit(free, nb, sizes) {
  const comps = [], seen = new Set();
  for (const t of free) {
    if (seen.has(t)) continue;
    let n = 0; const st = [t]; seen.add(t);
    while (st.length) { const x = st.pop(); n++; for (const y of nb[x]) if (free.has(y) && !seen.has(y)) { seen.add(y); st.push(y); } }
    comps.push(n);
  }
  // assign sizes to components so each component's total is exact
  const go = (i, rem) => { if (i === sizes.length) return rem.every((c) => c === 0); for (let c = 0; c < rem.length; c++) if (rem[c] >= sizes[i]) { rem[c] -= sizes[i]; if (go(i + 1, rem)) return true; rem[c] += sizes[i]; } return false; };
  return go(0, comps.slice());
}
