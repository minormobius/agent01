// tjs/swarm/swarm3d.selftest.mjs — node selftest for the pure 3D swarm kernel.
//   node swarm3d.selftest.mjs        # exits non-zero on failure
// No deps, no DOM. Mirrors mega/bees/swarm.selftest.mjs for the 3D port.
import { Swarm3D, clampParams, DEFAULT_PARAMS, _internal } from './swarm3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1. determinism — same seed + same #steps ⇒ identical positions, on any machine.
{
  const a = new Swarm3D({ count: 300, seed: 'det:1' });
  const b = new Swarm3D({ count: 300, seed: 'det:1' });
  for (let k = 0; k < 120; k++) { a.step(1 / 60); b.step(1 / 60); }
  let same = true;
  for (let i = 0; i < a.count; i++) if (!near(a.px[i], b.px[i]) || !near(a.py[i], b.py[i]) || !near(a.pz[i], b.pz[i])) { same = false; break; }
  ok(same, 'same (seed,#steps) → identical positions');

  const c = new Swarm3D({ count: 300, seed: 'det:2' });
  for (let k = 0; k < 120; k++) c.step(1 / 60);
  let diff = false;
  for (let i = 0; i < a.count; i++) if (!near(a.px[i], c.px[i], 1e-3)) { diff = true; break; }
  ok(diff, 'different seed → different positions');
}

// 2. fixed-timestep reproducibility — one big dt vs many small ⇒ same trajectory.
{
  const a = new Swarm3D({ count: 150, seed: 'fts' });
  const b = new Swarm3D({ count: 150, seed: 'fts' });
  for (let k = 0; k < 60; k++) a.step(1 / 60);   // 60 substeps via tiny frames
  for (let k = 0; k < 10; k++) b.step(0.1);      // 6 substeps × 10 = 60 (0.1 = the per-step clamp)
  let same = true;
  for (let i = 0; i < a.count; i++) if (!near(a.px[i], b.px[i], 1e-4)) { same = false; break; }
  ok(same, 'fixed substep makes step() framerate-independent');
}

// 3. soft boundary containment — after settling, no bee escapes far past `bounds`.
{
  const bounds = 14;
  const s = new Swarm3D({ count: 800, seed: 'bound', params: { bounds } });
  for (let k = 0; k < 600; k++) s.step(1 / 60);
  let maxR = 0, anyNaN = false;
  for (let i = 0; i < s.count; i++) {
    const r = Math.hypot(s.px[i], s.py[i], s.pz[i]);
    if (r > maxR) maxR = r;
    if (!isFinite(s.px[i]) || !isFinite(s.vy[i])) anyNaN = true;
  }
  ok(!anyNaN, 'no NaN/Inf positions after 600 steps');
  ok(maxR < bounds * 1.6, `swarm stays near the soft boundary (maxR=${maxR.toFixed(1)} < ${(bounds * 1.6).toFixed(1)})`);
}

// 4. curl noise is ~divergence-free (the point of using a vector potential).
{
  const e = 0.01, t = 3, samp = 200, rnd = _internal.rngFor('div');
  let worst = 0;
  for (let n = 0; n < samp; n++) {
    const x = rnd() * 10, y = rnd() * 10, z = rnd() * 10, o = { x: 0, y: 0, z: 0 };
    const fx1 = _internal.curl3(x + e, y, z, t, { ...o }).x, fx0 = _internal.curl3(x - e, y, z, t, { ...o }).x;
    const fy1 = _internal.curl3(x, y + e, z, t, { ...o }).y, fy0 = _internal.curl3(x, y - e, z, t, { ...o }).y;
    const fz1 = _internal.curl3(x, y, z + e, t, { ...o }).z, fz0 = _internal.curl3(x, y, z - e, t, { ...o }).z;
    const div = (fx1 - fx0 + fy1 - fy0 + fz1 - fz0) / (2 * e);
    worst = Math.max(worst, Math.abs(div));
  }
  ok(worst < 1.0, `curl field is approximately divergence-free (worst |∇·F|=${worst.toFixed(3)})`);
}

// 5. stigmergy: scent accumulates when depositing, and decays toward zero when it stops.
{
  const s = new Swarm3D({ count: 400, seed: 'stig', params: { stigmergyGain: 4, deposit: 2, evaporate: 0.4, diffuse: 0.1 } });
  for (let k = 0; k < 90; k++) s.step(1 / 60);
  const peakWith = s.scentPeak();
  ok(peakWith > 0, `scent grid accumulates with deposit>0 (peak=${peakWith.toFixed(2)})`);

  s.setParams({ deposit: 0 });                   // stop depositing; field should evaporate away
  for (let k = 0; k < 240; k++) s.step(1 / 60);
  const peakAfter = s.scentPeak();
  ok(peakAfter < peakWith * 0.5, `scent evaporates once deposition stops (${peakAfter.toFixed(3)} < ${(peakWith * 0.5).toFixed(3)})`);

  // disabling stigmergy must not throw and must leave a usable sim
  const s2 = new Swarm3D({ count: 100, seed: 'nostig', params: { stigmergyGain: 0 } });
  for (let k = 0; k < 60; k++) s2.step(1 / 60);
  ok(s2.scentPeak() === 0, 'stigmergyGain=0 skips the field entirely (no deposit)');
}

// 6. clampParams keeps everything inside sane bounds.
{
  const p = clampParams({ follow: 9999, evaporate: 5, drag: 0.1, noiseFreq: 99, bounds: 1 });
  ok(p.follow <= 60 && p.evaporate <= 0.999 && p.drag >= 0.5 && p.noiseFreq <= 1 && p.bounds >= 4, 'clampParams bounds out-of-range inputs');
  ok(JSON.stringify(Object.keys(DEFAULT_PARAMS).sort()) === JSON.stringify(Object.keys(clampParams({})).sort()), 'clampParams preserves the param set');
}

console.log(`\nswarm3d selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
