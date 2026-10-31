// node proofs/ramsey/ramsey.selftest.mjs — holds ramsey.js to the paper's tables, its worked
// example, the release's deduction traces and independent recomputation. Exit 1 on failure.
import * as R from './ramsey.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const t0 = Date.now();
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL', msg); } }

// ------------------------------------------------------ the statement and its bounds ---
ok(R.formula(3, 3) === 6 && R.formula(4, 3) === 7 && R.formula(5, 4) === 13 && R.formula(17, 9) === 129, 'formula');
// lower bound: n−1 red cliques of m−1 vertices — no C_m, independence number n−1
for (let n = 3; n <= 6; n++) for (let m = Math.max(n, 4); (m - 1) * (n - 1) <= 24; m++) {
  const { N, adj } = R.extremal(m, n);
  ok(!R.hasCycleOfLength(adj, N, m), `extremal (${m},${n}): no C_${m}`);
  ok(R.independenceNumber(adj, N) === n - 1, `extremal (${m},${n}): α = ${n - 1}`);
  ok(R.hasCycleOfLength(adj, N, m - 1) || m - 1 < 3, `extremal (${m},${n}): does contain C_${m - 1}`);
}
{ const { N, adj } = R.pentagon(); ok(!R.hasCycleOfLength(adj, N, 3) && R.independenceNumber(adj, N) === 2, 'C₅: no triangle, α = 2, so R(C₃,K₃) > 5'); }
// the incremental cycle test used by the search agrees with the literal one
{
  let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let trial = 0; trial < 400; trial++) {
    const N = 4 + Math.floor(rnd() * 6), m = 3 + Math.floor(rnd() * Math.min(5, N - 2)), adj = new Array(N).fill(0);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (rnd() < 0.4) { adj[i] |= 1 << j; adj[j] |= 1 << i; }
    // a C_m exists iff one exists through its largest vertex v, inside the graph on 0..v
    let inc = false;
    for (let v = 2; v < N && !inc; v++) { const sub = adj.slice(0, v + 1).map((a) => a & ((1 << (v + 1)) - 1)); if (R.cycleThrough(sub, v, m)) inc = true; }
    ok(inc === R.hasCycleOfLength(adj, N, m), `incremental and literal C_${m} tests agree`);
  }
}

// ---------------------------------------------------------- small cases, exhaustively ---
for (const [m, n] of [[3, 3], [4, 3], [5, 3], [6, 3]]) {
  const res = R.exhaust(m, n, R.formula(m, n));
  ok(res.R === R.formula(m, n), `exhaustive: R(C_${m}, K_${n}) = ${res.R}`);
  const ex = res.example, N = res.R - 1;
  ok(ex && ex.length === N && !R.hasCycleOfLength(ex, N, m) && R.independenceNumber(ex, N) <= n - 1, `a witness graph on ${N} vertices passes the literal checks`);
}

// ----------------------------------------------------------------- the finite domain ---
const dom = R.domain();
ok(dom.length === 42, '42 parameter pairs (finite:domain)');
let total = 0;
for (const [k, t] of dom) {
  const ps = R.patterns(t, k - t);
  total += ps.length;
  ok(R.patternCount(t, k - t) === ps.length, `(k,t) = (${k},${t}): recursion and generating function agree (${ps.length})`);
  const tmin = Math.max(3, Math.floor(k / 2));
  ok(R.PAPER_COUNTS[k][t - tmin] === ps.length, `(k,t) = (${k},${t}): the paper's table says ${R.PAPER_COUNTS[k][t - tmin]}`);
  // every pattern uses t vertices and amount ≤ k − t, components sorted and normalised
  for (const p of ps) {
    ok(p.reduce((s, c) => s + c.length + 1, 0) === t && p.flat().reduce((s, x) => s + x, 0) <= k - t, 'pattern parameters');
  }
}
ok(total === 3099, `3099 pattern instances (got ${total})`);

// the paper's worked example: k = 5, t = 3, P = ((), (2)); Q = {0, 1, 4}, path 1,2,3,4;
// the extension rule forbids d = 1, 2 between 0 and 2
{
  const lab = R.labels([[], [2]]);
  ok(JSON.stringify(lab.clique) === '[0,1,4]' && JSON.stringify(lab.E) === '[[1,4]]' && lab.L === 2, 'worked example labels');
  const M = R.initialMatrix(5, 3, lab);
  ok((M[0][2] & 0b110) === 0b110, 'worked example: d = 1, 2 forbidden between 0 and 2');
}

// ---------------------------------------- the whole procedure, against the paper and the traces ---
const T = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'traces.json'), 'utf8')).records;
ok(T.length === 3099, 'traces.json has 3099 records');
const perK = {};
let sameRounds = 0, sameClass = 0;
const traceKey = new Map(T.map((r) => [`${r[0]}|${r[1]}|${JSON.stringify(r[2])}`, r]));
for (const [k, t] of dom) for (const p of R.patterns(t, k - t)) {
  const res = R.check(k, t, p);
  perK[k] = perK[k] || [0, 0, 0]; perK[k][res.classification]++;
  const tr = traceKey.get(`${k}|${t}|${JSON.stringify(p)}`);
  if (tr && tr[3] === res.classification) sameClass++;
  if (tr && R.flagsHash(R.matrixTriples(res.initial)) === tr[4] && JSON.stringify(res.rounds) === JSON.stringify(tr[5].map((rd) => rd.map(([i, j, d]) => [i, j, d])))) sameRounds++;
}
for (const k of Object.keys(R.PAPER_RESULTS)) ok(JSON.stringify(perK[k]) === JSON.stringify(R.PAPER_RESULTS[k]), `k = ${k}: outputs ${perK[k]} = the paper's ${R.PAPER_RESULTS[k]}`);
ok(Object.values(perK).every((c) => c[0] === 0), 'no pattern left unresolved (output 0)');
ok(sameClass === 3099, `our outcome equals the release's for every pattern (${sameClass})`);
ok(sameRounds === 3099, `our initial flags and every strengthening round equal the release's (${sameRounds})`);
// every witness in the release's traces is valid against data rebuilt here
let valid = 0; for (const r of T) if (R.checkTrace(r).ok) valid++;
ok(valid === 3099, `every deduction trace validates (${valid})`);
// …and the validator is not vacuous
{
  const r = JSON.parse(JSON.stringify(T.find((x) => x[3] === 1)));
  r[6][0][2] += 5; ok(!R.checkTrace(r).ok, 'an inflated packing weight is rejected');
  const r2 = JSON.parse(JSON.stringify(T[0])); r2[4] ^= 1; ok(!R.checkTrace(r2).ok, 'a wrong flag checksum is rejected');
  const r3 = JSON.parse(JSON.stringify(T.find((x) => x[3] === 2 && x[5].length))); r3[5][0][0][3] = r3[5][0][0][3].slice(0, 1); ok(!R.checkTrace(r3).ok, 'a truncated round witness is rejected');
}

console.log(`ramsey: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
