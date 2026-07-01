// tjs/beelix/beelix.selftest.mjs — node selftest for the beelix v3 kernel
// (real active-matter boids; the helix's rotation is seeded by the light pipe's swirl
//  and amplified by boids alignment). Run: node beelix.selftest.mjs
import { Beelix, clampParams, DEFAULT_PARAMS } from './beelix.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const warmup = (b, secs) => { const n = Math.round(secs * 60); for (let k = 0; k < n; k++) b.step(1 / 60); };

// 1. emitter + death plane → bounded steady-state population; exact pool accounting.
{
  const b = new Beelix({ maxBees: 5000, seed: 'pop', params: { emitRate: 160 } });
  warmup(b, 1); const early = b.aliveCount;
  warmup(b, 18); const steady = b.aliveCount;
  ok(early > 0, `hive emits bees (alive after 1s = ${early})`);
  ok(steady > 0 && steady < b.maxBees, `population bounded & non-empty at steady state (${steady} < ${b.maxBees})`);
  ok(b.free.length + b.aliveCount === b.maxBees, 'pool accounting is exact (free + alive = maxBees)');
}

// 2. determinism — same seed ⇒ identical alive count + positions.
{
  const a = new Beelix({ maxBees: 2500, seed: 'det' }), c = new Beelix({ maxBees: 2500, seed: 'det' });
  warmup(a, 4); warmup(c, 4);
  ok(a.aliveCount === c.aliveCount, `same seed → same alive count (${a.aliveCount})`);
  let same = true;
  for (let i = 0; i < a.maxBees; i++) if (a.alive[i] !== c.alive[i] || (a.alive[i] && Math.abs(a.px[i] - c.px[i]) > 1e-6)) { same = false; break; }
  ok(same, 'same seed → identical positions');
}

// 3. THE EMERGENCE/CONTROL PROPERTY — a light swirl locks a coherent rotation whose HANDEDNESS
//    follows the swirl's sign (boids alignment amplifies the light's whisper into a mill).
{
  const seeds = ['a', 'b', 'c', 'd']; const Lp = [], Ln = [];
  for (const s of seeds) {
    const bp = new Beelix({ maxBees: 5000, seed: s, params: { pipeSpin: 1.2 } });   warmup(bp, 22); Lp.push(bp.angularMomentum());
    const bn = new Beelix({ maxBees: 5000, seed: s, params: { pipeSpin: -1.2 } });  warmup(bn, 22); Ln.push(bn.angularMomentum());
  }
  const mean = a => a.reduce((s, v) => s + Math.abs(v), 0) / a.length;
  // the controllable claim: the SIGN of the locked rotation follows the light-swirl sign, every seed.
  ok(Lp.every(v => v > 0.3), `+light swirl → CCW rotation, every seed (L=[${Lp.map(v => v.toFixed(1))}])`);
  ok(Ln.every(v => v < -0.3), `−light swirl → CW rotation, every seed (L=[${Ln.map(v => v.toFixed(1))}])`);
  ok(mean(Lp) > 1.5 && mean(Ln) > 1.5, `the locked mill is strong (mean|L| +${mean(Lp).toFixed(1)} / −${mean(Ln).toFixed(1)})`);
}

// 4. radius/containment — bees hug the pipe in a healthy tube (not collapsed, none flung past killRadius).
{
  const b = new Beelix({ maxBees: 5000, seed: 'tube', params: { killRadius: 12 } });
  warmup(b, 20);
  let n = 0, maxR = 0, anyNaN = false, below = 0, above = 0;
  for (let i = 0; i < b.maxBees; i++) {
    if (!b.alive[i]) continue;
    if (!isFinite(b.px[i]) || !isFinite(b.vy[i])) anyNaN = true;
    const r = Math.hypot(b.px[i], b.pz[i]); if (r > maxR) maxR = r;
    if (b.py[i] < b.deathY - 0.5) below++; if (b.py[i] > b.hiveY + 3.5) above++;
    n++;
  }
  ok(!anyNaN, 'no NaN/Inf after 20s');
  ok(b.meanRadius() > 1.2, `tube does not collapse onto the axis (meanR=${b.meanRadius().toFixed(2)} > 1.2)`);
  ok(maxR <= 12 + 0.5, `no bee escapes past killRadius (maxR=${maxR.toFixed(1)})`);
  ok(below === 0 && above === 0, 'all bees stay within the hive→death band');
}

// 5. pure emergence (pipeSpin=0) must still run cleanly — even though it may NOT lock a helix.
{
  const b = new Beelix({ maxBees: 3000, seed: 'raw', params: { pipeSpin: 0 } });
  warmup(b, 15);
  let anyNaN = false; for (let i = 0; i < b.maxBees; i++) if (b.alive[i] && (!isFinite(b.px[i]) || !isFinite(b.vy[i]))) { anyNaN = true; break; }
  ok(!anyNaN && b.aliveCount > 0, 'pipeSpin=0 (raw emergence) runs stably (rotation not asserted — it is unreliable by design)');
}

// 6. pulses launch from the hive, travel to the death plane, and light up nearby bees.
{
  const b = new Beelix({ maxBees: 800, seed: 'pulse', params: { pulseInterval: 1.0, pulseSpeed: 7 } });
  warmup(b, 3);
  ok(b.pulses.length > 0, `pulses in flight (${b.pulses.length})`);
  ok(b.pulses.every(p => p.y >= b.deathY && p.y <= b.hiveY + 0.01), 'every pulse is between hive and death plane');
  let lit = 0; for (let i = 0; i < b.maxBees; i++) if (b.alive[i] && b.bright[i] > 0.2) lit++;
  ok(lit > 0, `pulses light up nearby bees (${lit} bright)`);
}

// 7. clampParams keeps values sane and preserves the param set.
{
  const p = clampParams({ alignment: 99, cruise: -5, pipeSpin: 99, flow: -1 });
  ok(p.alignment <= 30 && p.cruise >= 1 && p.pipeSpin <= 6 && p.flow >= 0, 'clampParams bounds inputs');
  ok(JSON.stringify(Object.keys(DEFAULT_PARAMS).sort()) === JSON.stringify(Object.keys(clampParams({})).sort()), 'clampParams preserves the param set');
}

console.log(`\nbeelix selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
