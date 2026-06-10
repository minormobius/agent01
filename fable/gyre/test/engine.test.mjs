// Reproducible engine tests — `node fable/gyre/test/engine.test.mjs`.
// Validates the surface physics against mathematical facts about the torus
// (equators and meridians are geodesics), then the full pipeline: every
// canonical answer re-simulated independently must win, deterministic,
// fine-robust. No DOM, no network.
import { worldForSeed, rankBand } from '../js/atlas.js';
import { simulate, bake } from '../js/engine.js';

let failures = 0;
const fail = (m) => { console.error('  ✗ ' + m); failures++; };

console.log('gyre engine tests\n');

// 1. Geometry facts: the outer equator (v=0) and meridians are geodesics.
{
  const empty = bake({ zGravity: false, magnets: [], goo: [], bumpers: [], ball0: { u: 0.3, v: 0.0 }, goal: { u: Math.PI, v: 0, rad: 0.8 } });
  const eq = simulate(empty, 0, 20, {});
  if (eq.windV > 1e-6) fail(`equator shot drifted off the equator (windV=${eq.windV})`);
  if (!eq.win) fail('equator shot should reach a goal on the same equator');
  const w2 = bake({ zGravity: false, magnets: [], goo: [], bumpers: [], ball0: { u: 1.0, v: 0.2 }, goal: { u: 4.0, v: 0, rad: 0.5 } });
  const mer = simulate(w2, Math.PI / 2, 22, {});
  if (mer.windU > 1e-6) fail(`meridian shot drifted in u (windU=${mer.windU})`);
  console.log('geometry: equator and meridian shots stay on their geodesics');
}

// 2. Every seed makes a solvable world whose canonical answer wins on re-sim.
{
  const N = 25; let made = 0, ans = 0;
  for (let n = 1; n <= N; n++) {
    const p = worldForSeed(n);
    if (!p) { fail(`seed ${n} produced no world`); continue; }
    made++;
    const a = p.report.answer;
    if (simulate(p.world, a.psi, a.power).win) ans++;
    else fail(`seed ${n} (${p.world.bundle}) canonical answer MISSES on re-sim`);
  }
  console.log(`generation: ${made}/${N} made, ${ans} canonical answers re-verified`);
}

// 3. Determinism.
{
  for (const n of [3, 11, 19]) {
    const a = worldForSeed(n), b = worldForSeed(n);
    if (Math.abs(a.report.answer.psi - b.report.answer.psi) > 1e-12) fail(`seed ${n} answer not deterministic`);
    if (a.report.interest !== b.report.interest) fail(`seed ${n} grade not deterministic`);
    if (a.world.bundle !== b.world.bundle) fail(`seed ${n} bundle not deterministic`);
  }
  console.log('determinism: identical world, answer, grade across repeated calls');
}

// 4. Fine-robustness of stored answers (the JS↔Rust-style drift guarantee).
{
  let robust = 0, total = 0;
  for (let n = 1; n <= 15; n++) {
    const p = worldForSeed(n); const a = p.report.answer; total++;
    const eps = 0.4 * Math.PI / 180;
    const ok = simulate(p.world, a.psi + eps, a.power).win || simulate(p.world, a.psi - eps, a.power).win;
    if (ok) robust++; else fail(`seed ${n} answer not robust to a 0.4° nudge`);
  }
  console.log(`robustness: ${robust}/${total} answers survive a small heading nudge`);
}

// 5. Ranking bounded + sorted; winding numbers finite.
{
  const band = rankBand(1, 8);
  for (let i = 1; i < band.length; i++) if (band[i].report.interest > band[i - 1].report.interest) fail('rankBand not sorted');
  for (const p of band) {
    const a = p.report.answer;
    if (!Number.isFinite(a.windU) || !Number.isFinite(a.windV)) fail(`seed ${p.n} winding not finite`);
    if (p.report.interest < 0 || p.report.interest > 100) fail(`interest out of range at #${p.n}`);
  }
  console.log(`ranking: band sorted, winding finite, top = #${band[0].n} ${band[0].world.bundle} (${band[0].report.interest})`);
}

console.log(failures ? `\nFAILED: ${failures} assertion(s)` : '\nAll engine tests passed.');
process.exit(failures ? 1 : 0);
