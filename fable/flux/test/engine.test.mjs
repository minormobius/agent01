// Reproducible engine tests — `node fable/flux/test/engine.test.mjs`.
// The crucial check: the solver's stored canonical answer, re-simulated
// independently, wins — and the engine is deterministic. No DOM, no network.
import { worldForSeed, rankBand } from '../js/atlas.js';
import { simulate } from '../js/engine.js';
import { solve } from '../js/solver.js';

let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };

console.log('flux engine tests\n');

// 1. Every seed makes a solvable world whose canonical answer actually wins.
{
  const N = 50; let made = 0, solv = 0, ans = 0;
  for (let n = 1; n <= N; n++) {
    const p = worldForSeed(n);
    if (!p) { fail(`seed ${n} produced no world`); continue; }
    made++;
    if (p.solve.solvable) solv++; else { fail(`seed ${n} not solvable`); continue; }
    const a = p.report.answer;
    if (simulate(p.world, a.angle, a.power).win) ans++; else fail(`seed ${n} (${p.world.bundle}) canonical answer does NOT win on re-sim`);
  }
  console.log(`generation: ${made}/${N} made, ${solv} solvable, ${ans} canonical answers re-verified`);
}

// 2. Determinism: same seed ⇒ identical world, answer, grade.
{
  for (const n of [3, 17, 42]) {
    const a = worldForSeed(n), b = worldForSeed(n);
    if (JSON.stringify(a.world.attractors) !== JSON.stringify(b.world.attractors)) fail(`seed ${n} world not deterministic`);
    if (Math.abs(a.report.answer.angle - b.report.answer.angle) > 1e-12) fail(`seed ${n} answer angle not deterministic`);
    if (a.report.interest !== b.report.interest) fail(`seed ${n} grade not deterministic`);
    if (a.world.bundle !== b.world.bundle) fail(`seed ${n} bundle not deterministic`);
  }
  console.log('determinism: identical world, answer, grade across repeated calls');
}

// 3. Answer robustness: the canonical shot still wins under a small angle nudge
//    (this is what guarantees JS/Rust agreement on the stored answer).
{
  let robust = 0, total = 0;
  for (let n = 1; n <= 30; n++) {
    const p = worldForSeed(n); const a = p.report.answer; total++;
    const eps = 0.4 * Math.PI / 180; // 0.4°
    const ok = simulate(p.world, a.angle + eps, a.power).win || simulate(p.world, a.angle - eps, a.power).win;
    if (ok) robust++; else fail(`seed ${n} answer not robust to a 0.4° nudge`);
  }
  console.log(`robustness: ${robust}/${total} answers survive a small angle nudge`);
}

// 4. Ranking bounded + sorted.
{
  const band = rankBand(1, 12);
  for (let i = 1; i < band.length; i++) if (band[i].report.interest > band[i - 1].report.interest) fail('rankBand not sorted');
  for (const p of band) if (p.report.interest < 0 || p.report.interest > 100 || p.report.difficulty < 0 || p.report.difficulty > 100) fail(`score out of range at #${p.n}`);
  console.log(`ranking: band sorted, scores in [0,100], top = #${band[0].n} ${band[0].world.bundle} (${band[0].report.interest})`);
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll engine tests passed.');
process.exit(failures ? 1 : 0);
