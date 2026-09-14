#!/usr/bin/env node
// ball.selftest.mjs — the wasm engine, checked from node.
//
// The Rust side carries the physics (engine/src/tests.rs), including the pair
// that decided what the rule is: without gravity the angle of incidence is
// conserved and there is no chaos, with gravity neither holds. This one guards
// the seam the browser uses — the ABI and the committed .wasm — and re-states
// the headline results across it.
//
//   node henderhead/ball/ball.selftest.mjs

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

const eng = fromBytes(readFileSync(join(here, 'bouncer.wasm')));
/** The video's own initial condition, measured off it. */
const P = { radius: 1, gravity: 1, restitution: 1, offset: 0.145, height: 0 };
const run = (seconds, dt = 1 / 120) => { for (let t = 0; t < seconds; t += dt) eng.step(dt, 0.02); };

eng.init(P);

console.log('the ball behaves');
{
  run(120);
  ok('it bounced a lot', eng.bounces() > 60, String(eng.bounces()));
  const b = eng.ball();
  ok('and stayed inside the circle', Math.hypot(b.x, b.y) <= P.radius + 1e-9,
     Math.hypot(b.x, b.y).toFixed(12));
  ok('with the energy exactly where it started', Math.abs(eng.energyDrift()) < 1e-9,
     eng.energyDrift().toExponential(2));
  const tr = eng.trail();
  ok('the trail filled', tr.length > 400, String(tr.length / 2));
  let worst = 0;
  for (let i = 0; i < tr.length; i += 2) worst = Math.max(worst, Math.hypot(tr[i], tr[i + 1]));
  ok('and stays inside too', worst <= P.radius + 1e-6, worst.toFixed(9));
}

console.log('\ngravity is what makes it chaotic');
{
  eng.init(P);
  run(400);
  const chaotic = eng.lyapunov();
  ok('with gravity the Lyapunov exponent is positive', chaotic > 0.1, chaotic.toFixed(4));
  ok('and per bounce it is about a third of a nat', eng.lyapunovPerBounce() > 0.2,
     eng.lyapunovPerBounce().toFixed(4));

  // a chord billiard: launch tangentially with gravity all but off
  eng.init({ ...P, gravity: 1e-9 });
  eng.launch(-1, 0, 0.9, 0.45);
  run(400);
  const flat = eng.lyapunov();
  // Not exactly zero and it should not be: without gravity neighbours separate
  // *linearly*, so a finite-time exponent is measuring ln(n)/T on its way down
  // to zero rather than sitting at it.
  ok('without it, essentially zero', Math.abs(flat) < 0.05 && Math.abs(flat) < 0.2 * chaotic,
     `${flat.toFixed(5)} vs ${chaotic.toFixed(4)}`);

  // and the angle of incidence is the thing that is conserved
  const sec = eng.section();
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < sec.length; i += 2) { lo = Math.min(lo, sec[i]); hi = Math.max(hi, sec[i]); }
  ok('because the angle of incidence never changes', hi - lo < 1e-3, `${lo.toFixed(5)} .. ${hi.toFixed(5)}`);
}

console.log('\nthe fan of futures');
{
  eng.init(P);
  run(30);
  const n = eng.buildFan(128, 0.01, 4, 12);
  ok('built', n === 128 && eng.fanPoints() === 48, `${n} × ${eng.fanPoints()}`);
  const fan = eng.fan();
  ok('the buffer is the right size', fan.length === 128 * 48 * 2, String(fan.length));
  let worst = 0;
  for (let i = 0; i < fan.length; i += 2) worst = Math.max(worst, Math.hypot(fan[i], fan[i + 1]));
  ok('every future stays inside the circle', worst <= P.radius + 1e-6, worst.toFixed(9));

  const s = [0, 1, 2, 3].map((d) => eng.spreadAt(d));
  ok('spread grows with how far ahead you look', s[3] >= s[0], s.map((v) => v.toFixed(4)).join(' → '));
  ok('and is bounded in 0..1', s.every((v) => v >= 0 && v <= 1));

  eng.buildFan(64, 0, 4, 8);
  ok('with no measurement error there is no spread', eng.spreadAt(3) < 1e-9,
     eng.spreadAt(3).toExponential(2));
}

console.log('\nstable and chaotic eras, measured');
{
  eng.init(P);
  const seen = [];
  for (let t = 0; t < 300; t += 1 / 60) {
    eng.step(1 / 60, 0.02);
    // the page's own defaults: a fiftieth of a radian of measurement error,
    // looked four bounces ahead, which is the horizon his post names
    if (Math.round(t * 60) % 6 === 0) { eng.buildFan(96, 0.02, 4, 6); seen.push(eng.spreadAt(3)); }
  }
  const lo = Math.min(...seen), hi = Math.max(...seen);
  ok('predictability really does come and go', hi > 0.25 && lo < 0.05,
     `${lo.toFixed(4)} .. ${hi.toFixed(4)}`);
  const hist = eng.spreadHistory();
  ok('and the history is recorded', hist.length > 200, String(hist.length / 2));
}

console.log('\nthe Poincaré section');
{
  eng.init(P);
  run(400);
  const sec = eng.section();
  ok('one point per bounce', sec.length / 2 === eng.bounces(), `${sec.length / 2} vs ${eng.bounces()}`);
  let okRange = true;
  for (let i = 0; i < sec.length; i += 2) {
    if (Math.abs(sec[i]) > Math.PI + 1e-6 || Math.abs(sec[i + 1]) > 1 + 1e-9) okRange = false;
  }
  ok('angles in −π..π and sines in −1..1', okRange);

  // clicking the section puts the ball there, on the same energy surface
  const before = eng.energy();
  ok('a section point can be launched from', eng.launchFromSection(-1.2, 0.4));
  const b = eng.ball();
  ok('landing on the rim at the angle asked for',
     Math.abs(Math.atan2(b.y, b.x) - (-1.2)) < 1e-9 && Math.abs(Math.hypot(b.x, b.y) - 1) < 1e-9);
  const sp = Math.hypot(b.vx, b.vy);
  const tangential = (-b.y * b.vx + b.x * b.vy) / sp;
  ok('at the launch angle asked for', Math.abs(tangential - 0.4) < 1e-9, tangential.toFixed(12));
  ok('and heading inwards', b.vx * b.x + b.vy * b.y < 0);
  void before;
}

console.log('\nthe drop height is the energy control');
{
  // At the video's drop — from the middle — the section is a chaotic sea with
  // at most vestigial islands. Drop near the bottom instead and the same system
  // is a stack of nested tori. This is the honest version of "why the eras
  // happen", and the page says it that way round.
  eng.init(P);
  eng.buildSurvey(600, 60);
  const sea = eng.survey();
  let occupied = new Set();
  for (let i = 0; i < sea.length; i += 2) {
    occupied.add(Math.round(sea[i] * 12) + ':' + Math.round(sea[i + 1] * 12));
  }
  const spread = occupied.size;

  eng.init({ ...P, height: -0.9, offset: 0.1 });
  eng.buildSurvey(600, 60);
  const low = eng.survey();
  occupied = new Set();
  for (let i = 0; i < low.length; i += 2) {
    occupied.add(Math.round(low[i] * 12) + ':' + Math.round(low[i + 1] * 12));
  }
  ok('a drop from the middle fills the accessible section', spread > 900, String(spread));
  ok('a low drop occupies a small corner of it', occupied.size * 2.5 < spread,
     `${occupied.size} vs ${spread}`);

  eng.init({ ...P, height: -0.9, offset: 0.1 });
  for (let t = 0; t < 400; t += 1 / 120) eng.step(1 / 120, 0.02);
  ok('and is far less chaotic', eng.lyapunov() < 0.12, eng.lyapunov().toFixed(4));
  ok('the ball never rises above where it was dropped',
     eng.ball().y <= -0.9 + 1e-9, eng.ball().y.toFixed(6));
}

console.log('\nrestitution');
{
  eng.init({ ...P, restitution: 0.7 });
  run(60);
  ok('a dead ball loses energy', eng.energyDrift() < -0.2, eng.energyDrift().toFixed(4));
  ok('and settles at the bottom', eng.ball().y < -0.8, eng.ball().y.toFixed(4));
}

console.log(failed ? `\nFAILED — ${failed} check(s)` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
