// Self-test for the water & energy ledger. Run: node biome/systems/test/resources.selftest.mjs
// The water box model conserves total water exactly (the same discipline as Module 1); the
// energy ledger shows light dominating; lake depth, residence and fish scale as they should.
import {
  defaultParams, energyLedger, initWater, stepWater, runWater, waterDerivs, totalWater,
  lakeMetrics, aquaticCapacity, lakeArea,
} from '../sim/resources.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);

// ── 1. Water is conserved exactly (closed loop, paired flows) ────────────────
{
  const p = defaultParams();
  const s0 = initWater(p), W0 = totalWater(s0);
  let s = s0;
  for (let k = 0; k < 300 * 144; k++) s = stepWater(s, p, 600);   // 300 days @ 10 min
  const W1 = totalWater(s);
  ok('total water conserved over 300 days', rel(W1, W0) < 1e-12, `drift ${rel(W1, W0).toExponential(2)}`);
  ok('every stock stays non-negative', s.lake >= 0 && s.soil >= 0 && s.vapor >= 0 && s.fog >= 0);
  ok('it reaches a steady state (lake stops drifting)',
     Math.abs(stepWater(s, p, 600).lake - s.lake) / s.lake < 1e-5);
}

// ── 2. Lake depth and residence from the reservoir charge ────────────────────
{
  const p = defaultParams();
  const s = runWater(p, 200, 10);
  const lm = lakeMetrics(p, s.lake);
  ok('mean depth = lake volume ÷ footprint', rel(lm.meanDepth_m, s.lake / lakeArea(p)) < 1e-12,
     `${lm.meanDepth_m.toFixed(1)} m`);
  ok('residence time = volume ÷ jet throughput', rel(lm.residenceTime_days, s.lake / (p.nJets * p.jetFlow_m3s) / 86400) < 1e-12,
     `${lm.residenceTime_days.toFixed(0)} days`);
  // doubling the reservoir charge ~doubles the depth
  const deep = runWater({ ...defaultParams(), totalWater_m3: 2.8e7 }, 200, 10);
  ok('more reservoir water ⇒ deeper lakes', lakeMetrics(p, deep.lake).meanDepth_m > lm.meanDepth_m * 1.5,
     `${lm.meanDepth_m.toFixed(1)} → ${lakeMetrics(p, deep.lake).meanDepth_m.toFixed(1)} m`);
}

// ── 3. Energy — light dominates; the reactor is sized by lighting ────────────
{
  const e = energyLedger(defaultParams());
  ok('light is ≫99% of the load (jets are a rounding error)', e.lightFraction > 0.99,
     `light ${(e.lightFraction * 100).toFixed(1)}%`);
  ok('reactor count scales with total demand', e.reactorsNeeded_3GW >= 1 && e.reactorsNeeded_3GW === Math.ceil(e.total_W / 3e9),
     `${e.reactorsNeeded_3GW} × 3 GW`);
  ok('more light ⇒ more power', energyLedger({ ...defaultParams(), suns: 1 }).total_W > e.total_W);
  ok('margin = capacity − demand', Math.abs(e.margin_GW - (e.reactorCapacity_GW - e.total_GW)) < 1e-9);
}

// ── 4. Diurnal jet forcing — the jet can be phased day/night/always ──────────
{
  const base = { ...defaultParams() };
  const litState = { t: 0, lake: 1e7, soil: 1e5, vapor: 1e5, fog: 1e5 };          // t=0 ⇒ sunlit
  const darkState = { ...litState, t: base.dayLength * 0.8 };                      // ⇒ dark
  ok('a day-phased jet pumps when lit, idles in the dark',
     waterDerivs(litState, { ...base, jetMode: 'day' })._flux.J > 0 &&
     waterDerivs(darkState, { ...base, jetMode: 'day' })._flux.J === 0);
  ok('a night-phased jet is the opposite',
     waterDerivs(litState, { ...base, jetMode: 'night' })._flux.J === 0 &&
     waterDerivs(darkState, { ...base, jetMode: 'night' })._flux.J > 0);
  ok('an always-on jet pumps in both', waterDerivs(litState, { ...base, jetMode: 'always' })._flux.J > 0 &&
     waterDerivs(darkState, { ...base, jetMode: 'always' })._flux.J > 0);
}

// ── 5. Aquatic capacity — the lakes can feed the crew protein ────────────────
{
  const p = defaultParams();
  const fish = aquaticCapacity(p);
  ok('fish standing stock and yield are positive', fish.standing_t > 0 && fish.yield_t_yr > 0,
     `${fish.standing_t.toFixed(0)} t standing, ${fish.yield_t_yr.toFixed(0)} t/yr`);
  ok('the lakes cover the crew protein need', fish.feedsCrewFraction > 1,
     `feeds ${(fish.feedsCrewFraction * 100).toFixed(0)}%`);
  ok('more lake area ⇒ more fish', aquaticCapacity({ ...p, waterFraction: 0.1 }).standing_t > fish.standing_t * 1.5);
}

// ── 6. Determinism ───────────────────────────────────────────────────────────
{
  const a = runWater(defaultParams(), 30, 10), b = runWater(defaultParams(), 30, 10);
  ok('water integration is deterministic', a.lake === b.lake && a.fog === b.fog);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
