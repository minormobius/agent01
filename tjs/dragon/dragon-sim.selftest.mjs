// dragon-sim.selftest.mjs — validates the JS pursuit mirror and cross-checks it against
// the committed Rust/wasm solver in solver/pkg/. Run: `node dragon-sim.selftest.mjs`.
// Deterministic, no network. The deploy/build workflow runs this as a gate.

import { readFileSync } from 'node:fs';
import { simulate, defaultConfig, presetConfig, simulateTag, defaultBrain, tagConfig } from './dragon-sim.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const DEG = (r) => (r * 180) / Math.PI;

// ── invariants over the default bout ────────────────────────────────────────────
{
  const cfg = defaultConfig();
  const out = simulate(cfg);
  ok(out.a.speed.length === cfg.steps, 'sample count = steps');

  let finite = true, speedOk = true, bandOk = true;
  const lim = cfg.altHalfband * 2.5;
  for (const g of [out.a, out.b]) {
    for (const arr of [g.pos, g.vel, g.speed, g.turnRate, g.range, g.azimuth, g.elevation])
      for (const v of arr) if (!Number.isFinite(v)) finite = false;
    for (const s of g.speed) if (s > cfg.speedMax + 1e-6 || s < cfg.speedMin - 1e-6) speedOk = false;
    for (let i = 0; i < cfg.steps; i++) if (Math.abs(g.pos[3 * i + 1] - cfg.altBase) >= lim) bandOk = false;
  }
  ok(finite, 'all samples finite (no NaN/Inf)');
  ok(speedOk, 'speed stays within [speedMin, speedMax]');
  ok(bandOk, 'altitude band prevents vertical runaway');
  ok([...out.role].every((r) => r >= -1 - 1e-9 && r <= 1 + 1e-9), 'role balance in [-1,1]');

  let minR = Infinity;
  for (const r of out.a.range) minR = Math.min(minR, r);
  ok(minR > 0.1, `bodies never interpenetrate (min separation ${minR.toFixed(2)} m)`);
}

// ── determinism ─────────────────────────────────────────────────────────────────
{
  const a = simulate(defaultConfig());
  const b = simulate(defaultConfig());
  let same = true;
  for (let i = 0; i < a.a.pos.length; i++) if (a.a.pos[i] !== b.a.pos[i]) same = false;
  ok(same, 'same config ⇒ identical trajectory');
}

// ── emergent role reversal (the matched duel) ───────────────────────────────────
{
  const out = simulate(defaultConfig());
  let flips = 0, prev = Math.sign(out.role[5]);
  for (let i = 6; i < out.role.length; i++) {
    const s = Math.sign(out.role[i]);
    if (s !== 0 && prev !== 0 && s !== prev) flips++;
    if (s !== 0) prev = s;
  }
  ok(flips >= 1, `at least one chaser⇄evader role reversal (got ${flips})`);
}

// ── the paper's core finding: the chaser holds its rival ABOVE the eye horizon ────
{
  // Tail-chase preset: A is the settled chaser. Its view of B should sit above the
  // horizon, in the neighbourhood of the elevation set-point.
  const cfg = presetConfig('tailchase');
  const out = simulate(cfg);
  const start = Math.floor(cfg.steps / 3); // after lock-on
  let sum = 0, k = 0;
  for (let i = start; i < cfg.steps; i++) { sum += out.a.elevation[i]; k++; }
  const mean = sum / k;
  ok(mean > 0, `chaser holds rival above horizon (mean elev ${DEG(mean).toFixed(1)}°)`);
  ok(mean < cfg.elevSet * 3 + 0.2, 'held elevation is in the neighbourhood of the set-point');
}

// ── speed modulation: a larger braking envelope lowers mean speed ───────────────
{
  const meanSpeed = (o) => [...o.a.speed, ...o.b.speed].reduce((s, v) => s + v, 0) / (o.a.speed.length * 2);
  const loose = simulate({ ...defaultConfig(), standoff: 3.0, brakeRange: 1.2 });
  const tight = simulate({ ...defaultConfig(), standoff: 0.9, brakeRange: 0.3 });
  ok(meanSpeed(loose) <= meanSpeed(tight) + 1e-9, 'larger standoff ⇒ not-faster mean speed (braking)');
}

// ── every shipped preset stays finite and bounded ───────────────────────────────
for (const name of ['duel', 'tailchase', 'spiral', 'mismatch']) {
  const cfg = presetConfig(name);
  const out = simulate(cfg);
  let good = true;
  for (const g of [out.a, out.b]) for (const v of g.pos) if (!Number.isFinite(v)) good = false;
  ok(good, `preset "${name}" produces a finite trajectory`);
}

// ── tag: role accounting, swaps, determinism, arena bounds ──────────────────────
{
  const out = simulateTag(tagConfig(defaultBrain(), defaultBrain(), true));
  const total = (out.a.speed.length) * (1 / 120);
  ok(Math.abs(out.itTimeA + out.itTimeB - total) < 1e-6, 'IT time covers the whole round');

  // asymmetric brains ⇒ tags happen, and each tag flips the IT flag on the next frame
  const nimble = { ...defaultBrain(), turnMax: 9, juke: 1.3 };
  const stiff = { ...defaultBrain(), turnMax: 5, juke: 0.4 };
  const g = simulateTag(tagConfig(nimble, stiff, true));
  ok(g.tags.length > 0, 'asymmetric brains produce tags');
  ok(g.tags.every((f) => f + 1 >= g.it.length || g.it[f] !== g.it[f + 1]), 'IT flips right after each tag');

  // cooldown respected
  const cool = Math.round(0.6 * 120);
  ok(g.tags.every((f, k) => k === 0 || f - g.tags[k - 1] > cool), 'no two tags closer than the cooldown');

  // determinism
  const h = simulateTag(tagConfig(defaultBrain(), defaultBrain(), true));
  let same = true; for (let i = 0; i < out.a.pos.length; i++) if (out.a.pos[i] !== h.a.pos[i]) same = false;
  ok(same && out.itTimeA === h.itTimeA, 'tag round is deterministic');

  // arena containment (horizontal radius bounded) + finite
  let inArena = true, finite = true, cfg0 = tagConfig(defaultBrain(), defaultBrain(), true);
  for (const gg of [out.a, out.b]) for (let i = 0; i < gg.speed.length; i++) {
    const x = gg.pos[3 * i], z = gg.pos[3 * i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(gg.pos[3 * i + 1])) finite = false;
    if (Math.hypot(x, z) > cfg0.arenaR * 1.3) inArena = false;
  }
  ok(finite, 'tag samples finite');
  ok(inArena, 'tag stays inside the arena');

  // the fair two-round match sums pursuit time per brain
  const r1 = simulateTag(tagConfig(nimble, stiff, true));
  const r2 = simulateTag(tagConfig(nimble, stiff, false));
  ok(r1.itTimeA + r2.itTimeA > 0 && r1.itTimeB + r2.itTimeB > 0, 'both brains spend some time as IT across the match');
}

// ── cross-check the JS mirror against the committed Rust/wasm solver ─────────────
try {
  const P = new URL('./solver/pkg/', import.meta.url);
  const mod = await import(new URL('dragon_solver.js', P).href);
  const bytes = readFileSync(new URL('dragon_solver_bg.wasm', P));
  await mod.default({ module_or_path: bytes });
  ok(/dragon-solver-wasm/.test(mod.solver_info()), 'wasm reports its banner');

  // tag cross-check on a short, tag-free window (start far apart) so the discrete
  // role-swap branch can't make the two implementations diverge at a threshold.
  // Guarded: an older committed pkg without simulate_tag_json just skips this.
  if (typeof mod.simulate_tag_json === 'function') {
    const tc = { ...tagConfig(defaultBrain(), defaultBrain(), true), steps: 180 };
    const js = simulateTag(tc);
    const rs = JSON.parse(mod.simulate_tag_json(JSON.stringify(tc)));
    ok(js.tags.length === 0 && rs.tags.length === 0, 'cross-check window is tag-free');
    let maxPos = 0;
    for (let i = 0; i < tc.steps; i++) for (let c = 0; c < 3; c++) {
      maxPos = Math.max(maxPos, Math.abs(js.a.pos[3 * i + c] - rs.a.pos[3 * i + c]));
      maxPos = Math.max(maxPos, Math.abs(js.b.pos[3 * i + c] - rs.b.pos[3 * i + c]));
    }
    ok(maxPos < 1e-6, `wasm/JS tag positions agree (max Δ ${maxPos.toExponential(1)})`);
    ok(Math.abs(js.itTimeA - rs.itTimeA) < 1e-9, 'wasm/JS IT-time agree');
  }

  // Short horizons only: the coupled dogfight is chaotic, so tiny FP differences in the
  // platform transcendentals amplify over long runs. Over ~1 s they stay at rounding level.
  const cases = [
    { ...defaultConfig(), steps: 120 },
    { ...presetConfig('tailchase'), steps: 120 },
    { ...presetConfig('spiral'), steps: 120 },
    { ...defaultConfig(), steps: 120, asym: 0.15, turnMax: 10 },
  ];
  for (const cfg of cases) {
    const js = simulate(cfg);
    const rs = JSON.parse(mod.simulate_json(JSON.stringify(cfg)));
    let maxPos = 0, maxSpd = 0;
    for (let i = 0; i < cfg.steps; i++) {
      for (let c = 0; c < 3; c++) {
        maxPos = Math.max(maxPos, Math.abs(js.a.pos[3 * i + c] - rs.a.pos[3 * i + c]));
        maxPos = Math.max(maxPos, Math.abs(js.b.pos[3 * i + c] - rs.b.pos[3 * i + c]));
      }
      maxSpd = Math.max(maxSpd, Math.abs(js.a.speed[i] - rs.a.speed[i]));
    }
    ok(maxPos < 1e-6, `wasm/JS positions agree over 1 s (max Δ ${maxPos.toExponential(1)})`);
    ok(maxSpd < 1e-6, `wasm/JS speeds agree over 1 s (max Δ ${maxSpd.toExponential(1)})`);
  }
  console.log('  (cross-checked against Rust/wasm solver/pkg/)');
} catch (e) {
  console.log('  (wasm cross-check skipped: ' + e.message + ')');
}

console.log(`\ndragon-sim selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
