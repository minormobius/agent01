#!/usr/bin/env node
// eigensite selftest — measures the quiz's resolution against the real
// catalogue, so a question bank that cannot reach the sites fails preflight.
//
//   node eigensite/eigensite.selftest.mjs
//
// Checks: every question splits the field (no question points at almost
// nothing or almost everything); how many sites have a truth vector of their
// own; and, simulating a visitor who answers truthfully for their site, how
// often twenty questions put that site first or in the top three, with and
// without two wrong answers.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = {};
for (const f of ['rethink/data.js', 'eigensite/questions.js', 'eigensite/engine.js']) new Function('window', readFileSync(join(root, f), 'utf8'))(win);
const R = win.RETHINK, Q = win.EIGEN_QUESTIONS, E = win.EIGEN;

let failed = 0;
const fail = (m) => { failed++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const model = E.build(R, Q);
const N = model.sites.length;
console.log(`eigensite: ${N} candidate sites, ${Q.length} questions`);

// ---- 1. every question splits the field
const ids = new Set();
Q.forEach((q, qi) => {
  if (ids.has(q.id)) fail(`duplicate question id ${q.id}`); ids.add(q.id);
  const yes = model.T[qi].reduce((a, b) => a + b, 0), share = yes / N;
  if (yes < 4) fail(`"${q.q}" points at only ${yes} sites`);
  if (share > 0.97) fail(`"${q.q}" points at ${yes} of ${N} sites — it separates nothing`);
});
if (!failed) ok('every question points at at least four sites and at most 97% of them');
const shares = Q.map((q, qi) => model.T[qi].reduce((a, b) => a + b, 0) / N);
console.log('  splits: ' + Q.map((q, i) => `${q.id} ${(shares[i] * 100).toFixed(0)}%`).join(' · '));

// ---- 2. resolution: distinct truth vectors
const vec = model.sites.map((s, i) => model.T.map((row) => row[i]).join(''));
const groups = new Map(); vec.forEach((v, i) => { (groups.get(v) || groups.set(v, []).get(v)).push(i); });
const unique = [...groups.values()].filter((g) => g.length === 1).length;
const clusters = [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
console.log(`  ${groups.size} distinct answer profiles for ${N} sites · ${unique} sites with a profile of their own · ${clusters.length} clusters share one`);
console.log('  largest clusters: ' + clusters.slice(0, 5).map((g) => g.length + '× {' + g.slice(0, 4).map((i) => model.sites[i].n).join(', ') + (g.length > 4 ? ', …' : '') + '}').join(' · '));
if (groups.size < N * 0.6) fail(`only ${groups.size} distinct profiles for ${N} sites — the bank needs more questions that cut inside the big hubs`);
else ok(`${(groups.size / N * 100).toFixed(0)}% of sites are separable by the bank`);

// ---- 3. simulate a truthful visitor, 20 questions, with and without noise
function simulate(flips) {
  let top1 = 0, top3 = 0, tiedTop = 0;
  model.sites.forEach((s, i) => {
    const st = E.start(model, 1000 + i);
    const wrong = new Set(); while (wrong.size < flips) wrong.add(Math.floor(st.rand() * 20));
    for (let k = 0; k < 20; k++) {
      const qi = E.next(st); if (qi < 0) break;
      let a = model.T[qi][i]; if (wrong.has(k)) a = 1 - a;
      E.answer(st, qi, a);
    }
    const r = E.ranked(st);
    const rank = r.findIndex((x) => x.site === s);
    const tied = r.filter((x) => Math.abs(x.p - r[0].p) < 1e-9).length;
    if (rank === 0 || (rank < tied)) top1++;
    if (rank < 3 || rank < tied) top3++;
    tiedTop += tied;
  });
  return { top1: top1 / N, top3: top3 / N, tie: tiedTop / N };
}
const clean = simulate(0), noisy = simulate(2);
console.log(`  truthful visitor: own site first ${(clean.top1 * 100).toFixed(0)}% · top three ${(clean.top3 * 100).toFixed(0)}% · ${clean.tie.toFixed(1)} sites tied at the top on average`);
console.log(`  two wrong answers: own site first ${(noisy.top1 * 100).toFixed(0)}% · top three ${(noisy.top3 * 100).toFixed(0)}%`);
if (clean.top3 < 0.7) fail(`a truthful visitor lands in the top three only ${(clean.top3 * 100).toFixed(0)}% of the time`);
else ok('twenty truthful answers reach the visitor\'s site');
if (noisy.top3 < 0.5) fail(`two wrong answers drop the top-three rate to ${(noisy.top3 * 100).toFixed(0)}%`);
else ok('two wrong answers do not lose the site');

// ---- 4. the replay code reproduces a run
const st = E.start(model, 42); for (let k = 0; k < 20; k++) { const qi = E.next(st); E.answer(st, qi, k % 3 === 0 ? null : k % 2); }
const again = E.replay(model, E.encode(st));
if (!again || E.ranked(again)[0].site !== E.ranked(st)[0].site) fail('replaying an encoded run gives a different result');
else ok('an encoded run replays to the same result');

if (failed) { console.error(`eigensite selftest: ${failed} failure(s)`); process.exit(1); }
console.log('eigensite selftest: OK');
