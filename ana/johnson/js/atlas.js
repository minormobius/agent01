// The diminishing atlas, no DOM. The 600-cell's symmetry group (order 14,400) as permutations of its 120 vertices,
// built from quaternions: the vertices (scaled to unit length) are the binary icosahedral group, and every symmetry
// is x → a·x·b or x → a·x̄·b for a, b in it. With it: a cut's canonical form (the least image under the group, so two
// cuts are the same shape exactly when their forms match), its stabilizer (the symmetries it keeps), and the next
// cuts that are genuinely different (the addable vertices up to the stabilizer, merged where the results coincide).
import { h600, PHI } from './poly.js';

const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const conj = (a) => [a[0], -a[1], -a[2], -a[3]];
let G = null;
/** The group: { perms: Int16Array[14400][120] as one flat array, n: 14400, Q: unit vertices, index(q) }. */
export function group() {
  if (G) return G;
  const H = h600(), Q = H.V.map((v) => v.map((x) => x / PHI));
  const key = (q) => q.map((x) => Math.round(x * 1e6)).join(',');
  const at = new Map(Q.map((q, i) => [key(q), i]));
  const index = (q) => { const i = at.get(key(q)); if (i === undefined) throw new Error('not a vertex'); return i; };
  const seen = new Set(), rows = [];
  for (let a = 0; a < 120; a++) for (let b = 0; b < 120; b++) for (const bar of [false, true]) {
    const p = new Int16Array(120);
    for (let i = 0; i < 120; i++) p[i] = index(qmul(qmul(Q[a], bar ? conj(Q[i]) : Q[i]), Q[b]));
    const k = p.join(',');
    if (!seen.has(k)) { seen.add(k); rows.push(p); }
  }
  const perms = new Int16Array(rows.length * 120);
  rows.forEach((p, g) => perms.set(p, g * 120));
  G = { perms, n: rows.length, Q, index, A: H.A };
  return G;
}
/** The canonical form of a cut: the lexicographically least sorted image under the group. */
export function canonical(cut) {
  const { perms, n } = group(), s = [...cut], k = s.length;
  let best = null;
  const img = new Int16Array(k);
  for (let g = 0; g < n; g++) {
    const o = g * 120;
    for (let i = 0; i < k; i++) img[i] = perms[o + s[i]];
    img.sort();
    if (!best) { best = Int16Array.from(img); continue; }
    for (let i = 0; i < k; i++) { if (img[i] < best[i]) { best.set(img); break; } if (img[i] > best[i]) break; }
  }
  return best ? [...best] : [];
}
/** The symmetries that keep the cut (as group element indices). */
export function stabilizer(cut) {
  const { perms, n } = group(), s = [...cut], set = new Set(s), out = [];
  for (let g = 0; g < n; g++) { const o = g * 120; if (s.every((v) => set.has(perms[o + v]))) out.push(g); }
  return out;
}
/** The genuinely different next cuts: the vertices you could still cut (not cut, no cut neighbour), grouped by the
 *  stabilizer (vertices it swaps give the same shape), then merged where the results are the same shape anyway.
 *  Each: { v (a representative vertex), count (how many vertices it stands for), key (the result's canonical form),
 *  dist (hops from the new vertex to each existing cut, sorted), stab (the result's symmetry count) }. */
export function nextCuts(cut) {
  const { perms, A } = group(), C = new Set(cut), stab = stabilizer(cut);
  const free = []; for (let v = 0; v < 120; v++) if (!C.has(v) && ![...C].some((c) => A[c].has(v))) free.push(v);
  const orbitOf = new Map(), orbits = [];
  for (const v of free) {
    if (orbitOf.has(v)) continue;
    const o = new Set(); for (const g of stab) o.add(perms[g * 120 + v]);
    const id = orbits.length; orbits.push([...o]); for (const u of o) orbitOf.set(u, id);
  }
  const byKey = new Map();
  for (const o of orbits) {
    const v = o[0], key = canonical([...C, v]).join(',');
    if (byKey.has(key)) { byKey.get(key).count += o.length; continue; }
    byKey.set(key, { v, count: o.length, key, dist: [...C].map((c) => hops(c, v)).sort((a, b) => a - b), stab: stabilizer([...C, v]).length });
  }
  return [...byKey.values()].sort((a, b) => b.stab - a.stab || a.dist.join() .localeCompare(b.dist.join()));
}
let HOPS = null;
/** Graph distance (edges) between two vertices of the 600-cell: 0 to 5. */
export function hops(a, b) {
  if (!HOPS) {
    const { A } = group(); HOPS = Array.from({ length: 120 }, () => new Int8Array(120).fill(-1));
    for (let s = 0; s < 120; s++) { HOPS[s][s] = 0; const q = [s]; for (let i = 0; i < q.length; i++) for (const u of A[q[i]]) if (HOPS[s][u] < 0) { HOPS[s][u] = HOPS[s][q[i]] + 1; q.push(u); } }
  }
  return HOPS[a][b];
}
