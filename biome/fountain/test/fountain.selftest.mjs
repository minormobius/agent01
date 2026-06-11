// Self-test for the 2-D fountain. Run: node biome/fountain/test/fountain.selftest.mjs
// The trajectory is exact rotating-frame mechanics, so it's checked against conserved
// quantities (specific energy), the no-Coriolis limit (returns to launch, apex = v₀²/2g),
// and the Coriolis deflection direction, plus the nozzle tradeoff structure.
import { defaultParams, simulate, integrateParcel, NOZZLES } from '../sim/fountain.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const deg = (d) => (d * Math.PI) / 180;

// ── 1. Ballistic energy conservation (the integrator is faithful) ────────────
{
  const p = defaultParams();
  const r = integrateParcel({ ...p, dt: 0.01 }, 90, deg(30), Infinity);
  ok('specific energy ½v²−½ω²r² conserved along a ballistic arc', r.energyDrift < 1e-9,
     `drift ${r.energyDrift.toExponential(2)}`);
}

// ── 2. No-Coriolis limit: straight-in throw returns to launch, apex ≈ v₀²/2g ──
{
  const p = { ...defaultParams(), coriolis: false, dt: 0.01 };
  const r = integrateParcel(p, 30, 0, Infinity);
  ok('without Coriolis a radial throw returns to its launch point', Math.abs(r.driftArc) < 1,
     `drift ${r.driftArc.toFixed(2)} m`);
  const analytic = (30 * 30) / (2 * p.g0);
  ok('apex ≈ v₀²/2g (slightly higher as gravity tapers inward)',
     r.apexDepth >= analytic - 1 && r.apexDepth < analytic * 1.1,
     `apex ${r.apexDepth.toFixed(1)} m vs v₀²/2g ${analytic.toFixed(1)} m`);
}

// ── 3. Coriolis deflects, in the prograde sense for an inward throw ──────────
{
  const p = defaultParams();
  const withC = integrateParcel({ ...p, coriolis: true, dt: 0.01 }, 70, 0, Infinity);
  const noC = integrateParcel({ ...p, coriolis: false, dt: 0.01 }, 70, 0, Infinity);
  ok('Coriolis curves a straight-inward jet sideways', Math.abs(withC.driftArc) > 100 && Math.abs(noC.driftArc) < 1,
     `drift ${withC.driftArc.toFixed(0)} m (Coriolis) vs ${noC.driftArc.toFixed(1)} m (off)`);
  ok('the deflection is prograde (with the spin)', withC.driftArc > 0,
     `drift ${withC.driftArc.toFixed(0)} m`);
}

// ── 4. Reach increases with exit speed; a fast enough jet clears the inversion ─
{
  const p = defaultParams();
  const slow = integrateParcel(p, 30, 0, Infinity).apexDepth;
  const fast = integrateParcel(p, 80, 0, Infinity).apexDepth;
  ok('apex grows with exit speed', fast > slow, `${slow.toFixed(0)} → ${fast.toFixed(0)} m`);
  ok('a strong radial jet clears the ~150 m inversion', integrateParcel(p, 80, 0, Infinity).apexDepth > 150,
     `apex ${integrateParcel(p, 80, 0, Infinity).apexDepth.toFixed(0)} m`);
}

// ── 5. Nozzle tradeoffs — mist aerates most, the coherent jet reaches deepest ─
{
  const p = defaultParams();
  const jet = simulate({ ...p, nozzle: 'jet', angleDeg: 0 });
  const fan = simulate({ ...p, nozzle: 'fan' });
  const mist = simulate({ ...p, nozzle: 'mist', angleDeg: 0 });
  ok('mist has the highest aeration index (fine droplets, more surface)',
     mist.aerationIndex > fan.aerationIndex && fan.aerationIndex > jet.aerationIndex,
     `jet ${jet.aerationIndex.toFixed(0)} < fan ${fan.aerationIndex.toFixed(0)} < mist ${mist.aerationIndex.toFixed(0)}`);
  ok('the coherent jet reaches deeper than draggy mist', jet.apexDepth > mist.apexDepth,
     `jet ${jet.apexDepth.toFixed(0)} m vs mist ${mist.apexDepth.toFixed(0)} m`);
  ok('the fan lays water over a broad azimuthal arc (distribution)', fan.spreadArc > 50,
     `spread ${fan.spreadArc.toFixed(0)} m`);
}

// ── 6. Determinism ───────────────────────────────────────────────────────────
{
  const a = simulate(defaultParams()), b = simulate(defaultParams());
  ok('simulation is deterministic', a.apexDepth === b.apexDepth && a.meanDriftArc === b.meanDriftArc);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
