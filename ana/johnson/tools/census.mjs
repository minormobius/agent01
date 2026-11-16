// The census of diminished 600-cells, by Burnside's lemma: the number of different shapes with k cuts is the average,
// over the 14,400 symmetries g, of the number of k-cuts (vertex sets, no two adjacent) that g maps to themselves.
// A set fixed by g is a union of g's cycles on the vertices, so those are the independent sets of a smaller graph:
// one node per cycle whose own vertices are pairwise non-adjacent, weighted by its length, joined where any vertices
// are. Each is counted by a frontier DP (vertices in breadth-first order; the state is which of the still-open
// vertices are cut), keeping a polynomial in k. Writes js/atlas-census.js.
//   node ana/johnson/tools/census.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { group } from '../js/atlas.js';

const K = 31;
/** Independence polynomial (by total weight, up to K) of a graph: n nodes, adjacency lists, integer weights. A frontier
 *  DP: nodes in breadth-first order; the open nodes (processed, with neighbours still to come) each hold a slot, and a
 *  state is the bitmask of open nodes that are cut (a Number: the frontier never passes 52 here). Polynomials as
 *  Float64Array(K): exact, every count is under 2^53. */
export function indPoly(n, adj, w) {
  const order = [], seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) { if (seen[s]) continue; seen[s] = 1; const q = [s]; for (let i = 0; i < q.length; i++) { order.push(q[i]); for (const u of adj[q[i]]) if (!seen[u]) { seen[u] = 1; q.push(u); } } }
  const pos = new Int32Array(n); order.forEach((v, i) => { pos[v] = i; });
  const lastAt = new Int32Array(n); for (const v of order) lastAt[v] = Math.max(pos[v], ...adj[v].map((u) => pos[u]));
  const slot = new Int32Array(n).fill(-1), freeSlots = []; let nextSlot = 0;
  const bit = (s) => 2 ** s;
  let keys = [0], polys = [(() => { const p = new Float64Array(K); p[0] = 1; return p; })()];
  for (let i = 0; i < n; i++) {
    const v = order[i];
    let nbMask = 0; for (const u of adj[v]) if (slot[u] >= 0) nbMask += bit(slot[u]);
    const s = freeSlots.length ? freeSlots.pop() : nextSlot++;
    if (s > 52) throw new Error('frontier too wide');
    slot[v] = s; const vb = bit(s), wv = w[v];
    // close: nodes whose last neighbour is v (including v itself if it has no later neighbour)
    const closing = []; for (const u of [v, ...adj[v]]) if (slot[u] >= 0 && lastAt[u] <= i && !closing.includes(u)) closing.push(u);
    let clearMask = 0; for (const u of closing) clearMask += bit(slot[u]);
    const map = new Map(), outPolys = [], outKeys = [];
    const put = (key, poly, shift) => {
      const k2 = clear(key, clearMask);
      let j = map.get(k2);
      if (j === undefined) { j = outKeys.length; map.set(k2, j); outKeys.push(k2); outPolys.push(new Float64Array(K)); }
      const t = outPolys[j]; for (let k = 0; k + shift < K; k++) t[k + shift] += poly[k];
    };
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j], poly = polys[j];
      put(key, poly, 0);
      if (!and(key, nbMask)) put(key + vb, poly, wv);
    }
    for (const u of closing) { freeSlots.push(slot[u]); slot[u] = -1; }
    keys = outKeys; polys = outPolys;
  }
  const out = new Float64Array(K); for (const p of polys) for (let k = 0; k < K; k++) out[k] += p[k];
  return out;
}
// bit operations on Numbers up to 2^53 (JS bitwise ops are 32-bit): split into high and low words
const HI = 2 ** 26;
function and(a, b) { const al = a % HI, bl = b % HI, ah = Math.floor(a / HI), bh = Math.floor(b / HI); return (al & bl) !== 0 || (ah & bh) !== 0; }
function clear(a, m) { const al = a % HI, ml = m % HI, ah = Math.floor(a / HI), mh = Math.floor(m / HI); return (ah & ~mh) * HI + (al & ~ml); }

/** The polynomial of cuts fixed by symmetry g. */
export function fixedPoly(g) {
  const { perms, A } = group(), o = g * 120, cyc = new Int32Array(120).fill(-1), cycles = [];
  for (let v = 0; v < 120; v++) { if (cyc[v] >= 0) continue; const c = []; let u = v; while (cyc[u] < 0) { cyc[u] = cycles.length; c.push(u); u = perms[o + u]; } cycles.push(c); }
  const ok = cycles.map((c) => c.every((a) => c.every((b) => !A[a].has(b))));
  const idx = new Int32Array(cycles.length).fill(-1), nodes = [];
  cycles.forEach((c, i) => { if (ok[i]) { idx[i] = nodes.length; nodes.push(i); } });
  const adj = nodes.map(() => new Set());
  nodes.forEach((ci, a) => { for (const v of cycles[ci]) for (const u of A[v]) { const b = idx[cyc[u]]; if (b >= 0 && b !== a) adj[a].add(b); } });
  return indPoly(nodes.length, adj.map((s) => [...s]), nodes.map((ci) => cycles[ci].length));
}

/** The group's conjugacy classes: closure of each element under conjugation by a generating set (BFS). The count of
 *  fixed cuts is the same across a class (conjugate symmetries' fixed sets are images of each other). */
export function classes() {
  const { perms, n } = group(), key = (g) => perms.subarray(g * 120, g * 120 + 120).join(',');
  const at = new Map(); for (let g = 0; g < n; g++) at.set(key(g), g);
  const compose = (a, b) => { const out = new Int16Array(120); for (let i = 0; i < 120; i++) out[i] = perms[a * 120 + perms[b * 120 + i]]; return at.get(out.join(',')); };   // a∘b
  const inverse = (a) => { const out = new Int16Array(120); for (let i = 0; i < 120; i++) out[perms[a * 120 + i]] = i; return at.get(out.join(',')); };
  // generators: a handful of elements, checked to generate the whole group
  const gens = [1, 2, 3, 7, 101, 2023, 9999].filter((g) => g < n);
  { const seen = new Set([0]), q = [0]; for (let i = 0; i < q.length; i++) for (const s of gens) { const t = compose(s, q[i]); if (!seen.has(t)) { seen.add(t); q.push(t); } } if (seen.size !== n) throw new Error(`generators make ${seen.size}`); }
  const inv = gens.map(inverse), cls = new Int32Array(n).fill(-1), reps = [];
  for (let g = 0; g < n; g++) {
    if (cls[g] >= 0) continue;
    const c = reps.length; reps.push({ g, size: 0 }); cls[g] = c; const q = [g];
    for (let i = 0; i < q.length; i++) gens.forEach((s, j) => { const t = compose(compose(s, q[i]), inv[j]); if (cls[t] < 0) { cls[t] = c; q.push(t); } });
    reps[c].size = q.length;
  }
  return reps;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { n } = group(), t0 = Date.now();
  const reps = classes();
  console.log(`${reps.length} conjugacy classes, sizes ${reps.map((r) => r.size).join(' ')} (sum ${reps.reduce((a, r) => a + r.size, 0)})`);
  const total = new Float64Array(K), perClass = [];
  for (const r of reps) {
    const t = Date.now(), p = fixedPoly(r.g);
    perClass.push({ size: r.size, fixed: [...p] });
    for (let k = 0; k < K; k++) total[k] += p[k] * r.size;
    console.log(`class of ${r.size}: ${p.reduce((a, b) => a + b, 0)} fixed cuts, ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
  const byK = [...total].map((x) => x / n);
  if (byK.some((x) => Math.abs(x - Math.round(x)) > 1e-6)) throw new Error('Burnside gave a fraction: ' + byK.join(' '));
  const sum = byK.reduce((a, b) => a + b, 0);
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; total ${sum}`);
  console.log(byK.map((x, k) => `${k}:${x}`).join(' '));
  writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'atlas-census.js'),
    `// GENERATED by tools/census.mjs: how many different diminished 600-cells there are with k vertices cut (k = 0…${K - 1}),\n` +
    `// by Burnside's lemma over the 14,400 symmetries (one count per conjugacy class; ${reps.length} classes). Their sum less the\n` +
    `// uncut 600-cell (k = 0) is the published total, 314,248,344 (Dutour Sikirić and Myrvold, 2007). INDEPENDENT_SETS: all\n// cuts, not up to symmetry.\n` +
    `export const CENSUS = ${JSON.stringify(byK.map((x) => Math.round(x)))};\nexport const TOTAL = ${Math.round(sum)};\n` +
    `export const INDEPENDENT_SETS = ${JSON.stringify(perClass[reps.findIndex((r) => r.g === 0)].fixed)};\n` +
    `export const CLASSES = ${reps.length};\n`);
}
