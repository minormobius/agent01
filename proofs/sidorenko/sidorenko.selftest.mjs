// node proofs/sidorenko/sidorenko.selftest.mjs — holds sidorenko.js to the paper's tables,
// its Proposition on the complex, the Lean statement and independent recomputation.
import * as S from './sidorenko.js';

let pass = 0, fail = 0;
const t0 = Date.now();
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL', msg); } }

// ----------------------------------------------------------- the pattern H ---
const H = S.incidenceGraph();
ok(H.length === 35, '35 vertices');
ok(H.reduce((s, a) => s + a.length, 0) / 2 === 66, '66 edges');
ok(S.FACES.every((f) => f.length === 3 && f[0] < f[1] && f[1] < f[2]), 'faces are sorted triples (as in the Lean Finsets)');
ok(new Set(S.FACES.map((f) => f.join())).size === 22, 'faces distinct');
const pdeg = [...Array(13).keys()].map((i) => H[i].length);
ok([4, 5, 6].map((d) => pdeg.filter((x) => x === d).length).join() === '3,6,4', 'point degrees: three 4s, six 5s, four 6s');
ok(H.slice(13).every((a) => a.length === 3), 'every face has degree 3 (so H is not regular on both sides: not weakly norming, by Hatami)');
// bipartite and connected
ok(S.connected(H.map((a) => new Set(a)), 35), 'H is connected');

// -------------------------------------------- Proposition (complex), item 1 ---
const P = S.pairs();
ok(P.size === 33, '|E| = 33 point pairs');
ok([...P.values()].every((fs) => fs.length === 2), 'every pair lies in exactly two faces');
// the opposite-face columns of Table 1
for (let j = 0; j < 22; j++) {
  const [a, b, c] = S.FACES[j];
  [[a, b], [a, c], [b, c]].forEach(([x, y], k) => { const fs = P.get(S.pairKey(x, y)); ok(fs.includes(j) && fs.find((f) => f !== j) === S.OPPOSITE[j][k], `Table 1: face ${j}, column ${k + 1}`); });
}
ok(S.connected(S.faceNeighbours(), 22), 'the face-neighbour graph is connected');

// ---------------------------------------------------------------- item 2 ---
const NB = S.faceNeighbours();
for (const o of S.ORDERS) {
  const cls = [...Array(22).keys()].filter((j) => S.BITS[j][o.pos - 1] === String(o.val));
  ok(cls.length === 11, `bit ${o.pos} = ${o.val}: 11 faces`);
  ok(new Set(cls.flatMap((j) => S.FACES[j])).size === 13, `bit ${o.pos} = ${o.val}: covers all 13 points`);
  ok(o.faces.length === 11 && [...o.faces].sort((x, y) => x - y).join() === cls.join(), `Table 2 order for bit ${o.pos} = ${o.val} lists exactly the class`);
  const seen = new Set(S.FACES[o.faces[0]]); let good = true;
  o.faces.slice(1).forEach((j, k) => {
    const earlier = o.faces.slice(0, k + 1);
    const sharesPair = earlier.some((e) => NB[j].has(e));
    const fresh = S.FACES[j].filter((x) => !seen.has(x));
    if (!sharesPair || fresh.length !== 1 || fresh[0] !== o.fresh[k]) good = false;
    fresh.forEach((x) => seen.add(x));
  });
  ok(good && seen.size === 13, `Table 2: bit ${o.pos} = ${o.val}, every face shares a pair and brings exactly the listed new point`);
}
ok(S.ORDERS.some((o) => o.pos === 1 && o.val === 0 && o.faces.includes(2)) && S.ORDERS.some((o) => o.pos === 1 && o.val === 1 && o.faces.includes(3)) && NB[2].has(3), 'faces 2 and 3 join the first two classes');

// ---------------------------------------------------------------- item 3 ---
const sep = S.separations();
ok(sep.length === 33 && sep.every((e) => e.sep >= 1), 'every a_e ≥ 1/3');
ok(sep.some((e) => e.sep > 1), 'some a_e > 1/3');
ok(sep.find((e) => e.a === 0 && e.b === 2).sep === 3, 'a_{0,2} = 1 (labels 001 and 110)');

// ---------------------------------------------------------------- item 4 ---
const nbr = Array.from({ length: 13 }, () => new Set());
for (const k of P.keys()) { const a = Math.floor(k / 16), b = k % 16; nbr[a].add(b); nbr[b].add(a); }
for (let i = 0; i < 13; i++) {
  const d = nbr[i].size, c = [4, 5, 6].map((x) => [...nbr[i]].filter((u) => nbr[u].size === x).length);
  ok([d, ...c].join() === S.DEGREE_TABLE[i].join(), `degree table, point ${i}`);
}
// the point degree in H equals d_i? (the paper: yes) — d_i counts neighbours; each lies in two faces
for (let i = 0; i < 13; i++) ok(H[i].length === nbr[i].size, `deg_H(${i}) = d_${i}`);
const sigs = S.DEGREE_TABLE.map((r) => r.join());
const equal = []; for (let a = 0; a < 13; a++) for (let b = a + 1; b < 13; b++) if (sigs[a] === sigs[b]) equal.push(`${a},${b}`);
ok(equal.join(' ') === '4,10 6,7 8,12', `only {4,10}, {6,7}, {8,12} share signatures (${equal.join(' ')})`);
ok(nbr[4].has(2) && !nbr[10].has(2), '4 ~ 2, 10 ≁ 2');
ok(nbr[6].has(11) && nbr[8].has(11) && !nbr[7].has(11) && !nbr[12].has(11), '6, 8 ~ 11; 7, 12 ≁ 11');
const cr = S.colourRefinement();
ok(cr.discretePoints && cr.discreteFaces, 'colour refinement of H separates every vertex within each part');

// ------------------------------------------------------- the sphere (ours) ---
const sf = S.surface();
ok(sf.euler === 2 && sf.linksAreCycles && sf.orientable, 'the complex is a triangulated 2-sphere (χ = 2, links are cycles, orientable)');
for (const outer of [14, 0, 7, 21]) ok(S.embeddingIsValid(S.tutte(outer)), `Tutte drawing with outer face ${outer} is crossing-free`);
ok(S.embeddingIsValid(S.tutte(19, 1500, 4)) && S.minSpacing(S.tutte(19, 1500, 4)) > 0.1, 'the page\'s reweighted drawing is crossing-free and spread out');

// ----------------------------------------------------------- the sign model ---
ok(S.signIdentity().every((r) => r.lhs === r.rhs), 'E_η (1 + cηa)(1 + cηb) = 1 + ab for all signs');

// ------------------------------------------------------------ densities ---
// elimination = direct 13-point sum, for every graph on 3 vertices
for (let m = 0; m < 8; m++) {
  const e = [[0, 1], [0, 2], [1, 2]].filter((_, k) => m & (1 << k)), adj = [0, 0, 0];
  for (const [a, b] of e) { adj[a] |= 1 << b; adj[b] |= 1 << a; }
  ok(S.homCountExact(adj, 3) === S.homCountDirect(adj, 3), `graph ${m} on 3 vertices: elimination = direct sum`);
}
ok(S.homCountBrute([0b10, 0b01], 2) === 2n && S.homCountExact([0b10, 0b01], 2) === 2n, 'Hom(H, K₂) = 2 (connected bipartite), also by brute force');
ok(S.homCountExact([2, 5, 2], 3) === 2n ** 13n + 2n ** 22n, 'Hom(H, P₃) = 2¹³ + 2²²');
// order-independence
for (const name of ['C₅', 'K₅', 'cube Q₃']) { const a = S.HOSTS[name](); ok(S.homCountExact(a, a.length) === S.homCountExact(a, a.length, [...Array(13).keys()]), `${name}: two elimination orders agree`); }
// Sidorenko holds, exactly, on every small host tried
for (const [name, f] of Object.entries(S.HOSTS)) { const a = f(); if (a.length <= 10) ok(S.exactCompare(a, a.length).sign > 0, `exact: t(H, ${name}) > p^66`); }
{
  const rnd = S.rng(5);
  for (let t = 0; t < 30; t++) { const n = 4 + Math.floor(rnd() * 5), a = S.randomGraph(n, 0.3 + 0.6 * rnd(), rnd); if (a.every((x) => !x)) continue; ok(S.exactCompare(a, n).sign > 0, `exact: random graph on ${n} vertices obeys Sidorenko`); }
}
// complete graphs approach the bound from above
const K = (n) => Array.from({ length: n }, (_, i) => ((1 << n) - 1) & ~(1 << i));
let prev = Infinity;
for (let n = 3; n <= 11; n++) { const r = S.ratio(K(n), n).ratio; ok(r > 1 && r < prev, `K_${n}: ratio ${r.toFixed(5)} > 1 and falling`); prev = r; }
ok(Math.abs(S.ratio(K(10), 10).ratio - 1.04678) < 1e-4, 'K₁₀ ratio ≈ 1.04678');
// float and exact agree
{ const a = S.HOSTS['Petersen'](), r = S.ratio(a, 10), ex = S.exactCompare(a, 10); const t = Number(ex.hom) / 10 ** 35; ok(Math.abs(t / r.t - 1) < 1e-10, 'Petersen: float t equals exact Hom / n^35'); }
// kernels: constant kernel gives exactly 1; a 0/1 kernel reproduces the graph density
{
  const c = S.kernelRatio([[0.37, 0.37], [0.37, 0.37]], [0.5, 0.5], [0.4, 0.6]); ok(Math.abs(c.ratio - 1) < 1e-10, 'constant kernel: ratio 1');
  const a = S.HOSTS['C₅'](), n = 5, W = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (a[i] >> j) & 1)), u = new Array(n).fill(1 / n);
  ok(Math.abs(S.kernelRatio(W, u, u).ratio / S.ratio(a, n).ratio - 1) < 1e-10, 'adjacency kernel of C₅ = graph density');
  const rnd = S.rng(9); let lo = Infinity;
  for (let t = 0; t < 200; t++) { const k = 2 + Math.floor(rnd() * 2), W2 = Array.from({ length: k }, () => Array.from({ length: k }, () => 0.05 + rnd())), al = Array.from({ length: k }, () => rnd() + 0.1), be = Array.from({ length: k }, () => rnd() + 0.1), sa = al.reduce((x, y) => x + y), sb = be.reduce((x, y) => x + y); lo = Math.min(lo, S.kernelRatio(W2, al.map((x) => x / sa), be.map((x) => x / sb)).ratio); }
  ok(lo >= 1 - 1e-9, `random 2×2 and 3×3 kernels all obey it (smallest ratio ${lo.toFixed(4)})`);
}

console.log(`sidorenko: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
