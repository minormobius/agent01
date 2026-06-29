// tjs/beelix/beelix.selftest.mjs — node selftest for the beelix helix kernel.
//   node beelix.selftest.mjs   # exits non-zero on failure
import { Beelix, clampParams, DEFAULT_PARAMS } from './beelix.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// 1. emitter + death plane reach a bounded steady-state population (no leak, no blow-up).
{
  const b = new Beelix({ maxBees: 4000, seed: 'pop', params: { emitRate: 240, descent: 3.2 } });
  for (let k = 0; k < 60; k++) b.step(1 / 60);   // warm up 1s (bees still falling)
  const early = b.aliveCount;
  for (let k = 0; k < 900; k++) b.step(1 / 60);   // 15s — well past steady state
  const steady = b.aliveCount;
  ok(early > 0, `hive emits bees (alive after 1s = ${early})`);
  ok(steady > 0 && steady < b.maxBees, `population is bounded & non-empty at steady state (${steady} < ${b.maxBees})`);
  // free + alive must always partition the pool exactly (no slot lost or double-counted)
  ok(b.free.length + b.aliveCount === b.maxBees, 'pool accounting is exact (free + alive = maxBees)');
}

// 2. determinism — same seed ⇒ identical alive count and positions.
{
  const a = new Beelix({ maxBees: 2000, seed: 'det' });
  const c = new Beelix({ maxBees: 2000, seed: 'det' });
  for (let k = 0; k < 300; k++) { a.step(1 / 60); c.step(1 / 60); }
  ok(a.aliveCount === c.aliveCount, `same seed → same alive count (${a.aliveCount})`);
  let same = true;
  for (let i = 0; i < a.maxBees; i++) if (a.alive[i] !== c.alive[i] || (a.alive[i] && Math.abs(a.px[i] - c.px[i]) > 1e-6)) { same = false; break; }
  ok(same, 'same seed → identical bee positions');
}

// 3. the HELIX property — at steady state, alive bees hug the cylinder radius R.
{
  const R = 4.5;
  const b = new Beelix({ maxBees: 4000, seed: 'helix', params: { radius: R, radialK: 18, separation: 3, twist: 2.2 } });
  for (let k = 0; k < 900; k++) b.step(1 / 60);
  let n = 0, off = 0, maxOff = 0, anyNaN = false;
  for (let i = 0; i < b.maxBees; i++) {
    if (!b.alive[i]) continue;
    if (!isFinite(b.px[i]) || !isFinite(b.vy[i])) anyNaN = true;
    const r = Math.hypot(b.px[i], b.pz[i]); const d = Math.abs(r - R);
    off += d; if (d > maxOff) maxOff = d; n++;
  }
  ok(!anyNaN, 'no NaN/Inf after 15s');
  ok(n > 0 && off / n < 1.2, `mean radial deviation from R is small (${(off / n).toFixed(2)} < 1.2 over ${n} bees)`);
}

// 4. bees stay within the hive→death vertical band (recycle works, none escape below).
{
  const b = new Beelix({ maxBees: 3000, seed: 'band', hiveY: 10, deathY: -10 });
  for (let k = 0; k < 900; k++) b.step(1 / 60);
  let below = 0, above = 0;
  for (let i = 0; i < b.maxBees; i++) {
    if (!b.alive[i]) continue;
    if (b.py[i] < b.deathY - 0.5) below++;
    if (b.py[i] > b.hiveY + 1.5) above++;
  }
  ok(below === 0, 'no alive bee persists below the death plane');
  ok(above === 0, 'no alive bee flies above the hive');
}

// 5. pulses launch from the hive and travel down to the death plane (then retire).
{
  const b = new Beelix({ maxBees: 500, seed: 'pulse', hiveY: 12, deathY: -12, params: { pulseInterval: 1.0, pulseSpeed: 7 } });
  for (let k = 0; k < 180; k++) b.step(1 / 60);   // 3s → a few pulses in flight
  ok(b.pulses.length > 0, `pulses are in flight (${b.pulses.length})`);
  ok(b.pulses.every(p => p.y >= b.deathY && p.y <= b.hiveY + 0.01), 'every pulse is between hive and death plane');
  // brightness is assigned to some bees near a pulse
  let lit = 0; for (let i = 0; i < b.maxBees; i++) if (b.alive[i] && b.bright[i] > 0.2) lit++;
  ok(lit > 0, `pulses light up nearby bees (${lit} bright)`);
}

// 6. clampParams keeps values sane and preserves the param set.
{
  const p = clampParams({ twist: 99, strands: 99, descent: -5, drag: 0.1 });
  ok(p.twist <= 6 && p.strands <= 6 && p.descent >= 0.2 && p.drag >= 0.5, 'clampParams bounds inputs');
  ok(JSON.stringify(Object.keys(DEFAULT_PARAMS).sort()) === JSON.stringify(Object.keys(clampParams({})).sort()), 'clampParams preserves the param set');
}

console.log(`\nbeelix selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
