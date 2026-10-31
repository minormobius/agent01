// proofs/seymour/seymour.selftest.mjs — hold seymour.js to every claim the page makes.
//   node proofs/seymour/seymour.selftest.mjs
// Imports the exact module the browser runs.

import * as S from './seymour.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${a}, want ${b}`);
const t0 = Date.now();
const rnd = S.rng(17);
const bits = (m, n) => Array.from({ length: n }, (_, i) => i).filter((i) => (m >>> i) & 1);
const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };

// ------------------------------------- bitmask = the Lean definitions, literally --
for (let r = 0; r < 300; r++) {
  const n = 1 + (r % 14), g = S.randomOriented(n, rnd(), rnd);
  ok(S.isOriented(g), `random #${r} is oriented`);
  const rel = (u, v) => S.hasArc(g, u, v);
  for (let v = 0; v < n; v++) {
    eq(bits(S.first(g, v), n).join(), S.leanFirstNeighbors(rel, n, v).join(), `random #${r} v${v}: N⁺ = firstNeighbors`);
    eq(bits(S.second(g, v), n).join(), S.leanSecondNeighbors(rel, n, v).join(), `random #${r} v${v}: N⁺⁺ = secondNeighbors`);
  }
}

// ------------------------------------------------------------- small facts --
eq(S.goodVertices(S.empty(5)).length, 5, 'with no arcs every vertex is good (0 ≤ 0)');
{
  const g = S.cycle(3);
  ok(S.degrees(g).every((d) => d.d1 === 1 && d.d2 === 1), 'directed triangle: every vertex 1 ≤ 1, tight');
}
for (const n of [4, 5, 8, 13]) {
  const d = S.degrees(S.cycle(n));
  ok(d.every((x) => x.d1 === 1 && x.d2 === 1), `directed ${n}-cycle: all tight`);
}
// Paley tournaments: every vertex exactly tight, |N⁺| = |N⁺⁺| = (p−1)/2
for (const p of [3, 7, 11, 19, 23]) {
  const g = S.paley(p), d = S.degrees(g);
  ok(S.isOriented(g), `Paley(${p}) is oriented`);
  ok(d.every((x) => x.d1 + 0 === (p - 1) / 2 + 0 && x.d1 + x.d2 === p - 1), `Paley(${p}) is a tournament`);
  ok(d.every((x) => x.d1 === x.d2), `Paley(${p}): every vertex exactly tight`);
}
// any tournament: by the theorem (and by Fisher 1996) it has a good vertex
for (let r = 0; r < 200; r++) ok(S.goodVertices(S.randomTournament(3 + (r % 25), rnd)).length > 0, `random tournament #${r} has a good vertex`);
for (let r = 0; r < 200; r++) ok(S.goodVertices(S.randomOriented(3 + (r % 28), rnd(), rnd)).length > 0, `random oriented graph #${r} has a good vertex`);

// --------------------------------------------- exhaustive: every graph to n = 6 --
// sink-free counts against inclusion–exclusion over the set of sinks
const sinkFreeFormula = (n) => {
  let t = 0;
  for (let k = 0; k <= n; k++) t += (k % 2 ? -1 : 1) * choose(n, k) * 2 ** (k * (n - k)) * 3 ** choose(n - k, 2);
  return t;
};
for (const n of [1, 2, 3, 4, 5, 6]) {
  const r = S.exhaust(n);
  eq(r.count, S.countOriented(n), `n=${n}: every labelled oriented graph visited`);
  ok(r.counterexample === null, `n=${n}: no counterexample among ${r.count} graphs`);
  eq(r.minSlack, 0, `n=${n}: the best vertex is never below 0, and 0 is reached`);
  eq(r.sinkFree, sinkFreeFormula(n), `n=${n}: sink-free count matches inclusion–exclusion`);
  if (n >= 4) eq(r.fewestGood, 2, `n=${n}: a sink-free graph can have as few as 2 good vertices`);
  if (r.fewestWitness) ok(S.goodVertices({ n, out: r.fewestWitness }).length === r.fewestGood, `n=${n}: fewest-good witness re-checks`);
}

// ------------------------------------------------------------ the adversary --
for (const n of [6, 8, 10, 12, 14]) {
  const h = S.hunt(n, { steps: 2500, restarts: 4, seed: n });
  ok(h.slack >= 0 && h.good >= 1, `hunt n=${n}: no counterexample (slack ${h.slack}, ${h.good} good)`);
  eq(h.sinks, 0, `hunt n=${n}: result has no sinks`);
}

console.log(`seymour: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
