#!/usr/bin/env node
// wheel.selftest.mjs — the wasm engine, checked from node.
//
// The Rust side carries the physics tests, including the one that matters: the
// continuum wheel integrated against the Lorenz equations with the mapped
// parameters, which must stay on top of each other. This one guards the seam
// the browser uses — the ABI, the committed .wasm — and re-states the headline
// results across it so a broken export cannot ship silently.
//
//   node henderhead/wheel/wheel.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromBytes } from './engine.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ✓ ${name}`);
};

const eng = fromBytes(readFileSync(join(here, 'waterwheel.wasm')));

/** The page's defaults, which sit in the chaotic regime. */
const P = { n: 24, q: 1.2, k: 0.2, nu: 10, inertia: 5, g: 9.81, radius: 1, spread: 0.7 };
const run = (seconds, dt = 1 / 120) => {
  for (let t = 0; t < seconds; t += dt) eng.step(dt, 8, 0.02);
};

eng.init(P);

console.log('the Lorenz numbers come out of the physics');
{
  const L = eng.lorenz();
  ok('σ = ν/(Ik) = 10', Math.abs(L.sigma - 10) < 1e-9, String(L.sigma));
  ok('β = 1, as a waterwheel must have', L.beta === 1);
  ok('ρ ≈ 29, past the Hopf threshold', L.rho > 25 && L.rho < 33, L.rho.toFixed(3));
  ok('ρ_Hopf = σ(σ+β+3)/(σ−β−1) = 17.5', Math.abs(L.rhoHopf - 17.5) < 1e-9, String(L.rhoHopf));
  ok('so the regime reads chaotic', L.regime === 2, String(L.regime));
}

console.log('\nthe three regimes');
{
  eng.setParams({ ...P, q: 0.01 });
  eng.reset(0.05);
  run(120);
  ok('a trickle leaves the wheel standing', Math.abs(eng.omega()) < 1e-3, eng.omega().toExponential(2));
  ok('and the regime says so', eng.lorenz().regime === 0);

  eng.setParams({ ...P, q: 0.3 });
  eng.reset(0.05);
  run(400);
  const L = eng.lorenz();
  const predicted = P.k * Math.sqrt(L.beta * (L.rho - 1));
  ok('a steady flow turns it at ω = k√(β(ρ−1))',
     Math.abs(Math.abs(eng.omega()) - predicted) / predicted < 0.02,
     `${eng.omega().toFixed(4)} vs ±${predicted.toFixed(4)}`);
  ok('and the regime says steady', L.regime === 1);

  eng.setParams(P);
  eng.reset(0.05);
  run(60);
  let flips = 0, sign = Math.sign(eng.omega());
  for (let t = 0; t < 400; t += 1 / 120) {
    eng.step(1 / 120, 8, 0.02);
    const s = Math.sign(eng.omega());
    if (s !== sign && Math.abs(eng.omega()) > 1e-3) { sign = s; flips++; }
  }
  ok('a full flow makes it reverse unpredictably', flips > 8, `${flips} reversals`);
}

console.log('\nthe centre of mass traces the attractor');
{
  eng.setParams(P);
  eng.reset(0.05);
  run(200);
  const tr = eng.trace();
  ok('the trace filled', tr.length > 2000, String(tr.length / 2));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < tr.length; i += 2) {
    minX = Math.min(minX, tr[i]); maxX = Math.max(maxX, tr[i]);
    minY = Math.min(minY, tr[i + 1]); maxY = Math.max(maxY, tr[i + 1]);
  }
  ok('it stays inside the wheel', Math.max(-minX, maxX, -minY, maxY) < P.radius,
     `x[${minX.toFixed(2)},${maxX.toFixed(2)}] y[${minY.toFixed(2)},${maxY.toFixed(2)}]`);
  ok('and it has two lobes, not one', minX < -0.05 && maxX > 0.05,
     `${minX.toFixed(3)} .. ${maxX.toFixed(3)}`);

  const lt = eng.lorenzTrace();
  ok('the exact Lorenz solution is traced alongside it', lt.length === tr.length);
  // both are chaotic so they part company eventually, but they start together
  const d0 = Math.hypot(tr[0] - lt[0], tr[1] - lt[1]);
  ok('starting from the same point', d0 < 0.02, d0.toExponential(2));

  ok('total mass settles at q/k', Math.abs(eng.totalMass() - P.q / P.k) / (P.q / P.k) < 1e-6,
     eng.totalMass().toFixed(6));
}

console.log('\nsensitive dependence');
{
  eng.setParams(P);
  eng.reset(0.05, 1e-9);
  ok('the twins start a billionth apart', Math.abs(eng.separation() - 1e-9) < 1e-12);
  run(400);
  ok('and end up unrelated', eng.separation() > 1e-3, eng.separation().toExponential(2));

  eng.setParams({ ...P, q: 0.3 });
  eng.reset(0.05, 1e-9);
  run(400);
  ok('a steadily turning wheel forgets the nudge', eng.separation() < 1e-6,
     eng.separation().toExponential(2));
}

console.log('\nwhat "approximating" means');
{
  const ripples = [6, 12, 24, 48].map((n) => { eng.init({ ...P, n }); return eng.ripple(); });
  ok('more buckets, less ripple', ripples.every((r, i) => i === 0 || r < ripples[i - 1]),
     ripples.map((r) => r.toFixed(4)).join(' → '));
  ok('and at 48 buckets it is nearly the continuum', ripples[3] < 0.02, ripples[3].toFixed(5));
}

console.log('\nthe controls');
{
  eng.init(P);
  eng.reset(0.05);
  run(30);
  const before = eng.nBuckets();
  const rebuilt = eng.setParams({ ...P, n: 40 });
  ok('changing the bucket count rebuilds', rebuilt && eng.nBuckets() === 40, `${before} → ${eng.nBuckets()}`);
  const kept = eng.totalMass();
  ok('and keeps the water on the wheel', kept > 0, kept.toFixed(3));
  const changed = eng.setParams({ ...P, n: 40, q: 2 });
  ok('changing the flow does not rebuild', !changed);
  ok('but does change ρ', eng.lorenz().rho > 40, eng.lorenz().rho.toFixed(2));
  ok('the masses read back', eng.mass().length === 40);
}

console.log(failed ? `\nFAILED — ${failed} check(s)` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
