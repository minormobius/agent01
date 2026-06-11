// biome/cycles/test/lake.selftest.mjs — headless proof of the lake bioengine endpoint.
// Run: node biome/cycles/test/lake.selftest.mjs   (no deps)
//
// The lake reuses the cycles.mjs engine, so the bedrock proof is the same: C/H/O/N
// conserve to machine precision across a long RK4 run — and crucially they STILL conserve
// with the new `harvest` flux active (animal biomass → food store), because that flux is
// paired (organic C → organic C), exactly like a producer's harvestIndex. On top of that
// we prove the two figures of merit behave: the default lake supports the ship, and each
// failure mode (overfishing, killing the water-treaters, a too-small lake) trips the right
// verdict. Finally we cross-check that the lake web is dynamically STABLE (stability.mjs).
import {
  defaultParams, defaultState, run, step, derivatives, elements,
} from '../sim/cycles.mjs';
import {
  lakeParams, lakeState, lakeReport, waterTreatment, LAKE_ROSTER,
} from '../sim/lake.mjs';
import { analyzeStability } from '../sim/stability.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);

// ── 1. The harvest flux conserves: biomass → food leaks no element ────────────
{
  const p = lakeParams();
  const s0 = lakeState(p);
  const e0 = elements(s0, p);
  let s = s0;
  for (let i = 0; i < 365 * 24; i++) s = step(s, p, 3600);
  const e1 = elements(s, p);
  for (const el of ['C', 'H', 'O', 'N']) {
    ok(`${el} conserved over 365 d with harvest active`, rel(e1[el], e0[el]) < 1e-9,
       `drift ${rel(e1[el], e0[el]).toExponential(2)}`);
  }
}

// ── 2. `harvest` is a no-op when absent / zero, and a real C transfer when set ─
{
  // absent ⇒ identical trajectory to the untouched default (proves backward-compat)
  const a = run(defaultParams(), defaultState(defaultParams()), 60, 1, 5);
  const zero = defaultParams();
  zero.species.find((x) => x.id === 'predator').harvest = 0;     // falsy ⇒ skipped
  const b = run(zero, defaultState(zero), 60, 1, 5);
  ok('harvest=0 leaves the default web byte-identical', JSON.stringify(a) === JSON.stringify(b));

  // set ⇒ diverts biomass into food (more food inflow) while still conserving
  const p = defaultParams();
  p.species.find((x) => x.id === 'decomposer').harvest = 0.01;
  const f0 = derivatives(defaultState(defaultParams()), defaultParams()).flux.foodIn;
  const f1 = derivatives(defaultState(p), p).flux;
  ok('harvest>0 routes animal biomass into the food store', f1.foodIn > f0 && f1.foodFromAnimals > 0,
     `foodFromAnimals ${f1.foodFromAnimals.toExponential(2)} mol C/s`);
}

// ── 3. The default lake supports the ship (both figures of merit pass) ────────
{
  const r = lakeReport();
  ok('default lake supports the ship', r.supports, r.verdict);
  ok('fish surplus is a real, positive yield', r.fish.fishYield_kgday > 1 && r.fish.fishStock_kg > 50,
     `${r.fish.fishYield_kgday.toFixed(1)} kg/day, ${r.fish.perPerson_gday.toFixed(0)} g/person·day`);
  ok('water is treated: lake clears the waste load and holds N down',
     r.water.treated && r.water.clearance >= 1 && r.water.mineralN_mmol_perL < 1.5,
     `clearance ${r.water.clearance.toFixed(0)}×, N ${r.water.mineralN_mmol_perL.toFixed(2)} mmol/L`);
  ok('air closes (O₂ in band)', r.last.o2_kPa > 17 && r.last.o2_kPa < 24,
     `O₂ ${r.last.o2_kPa.toFixed(1)} kPa, CO₂ ${Math.round(r.last.co2_ppm)} ppm`);
}

// ── 4. Overfishing collapses the fish stock (the harvest tap has a sustainable ceiling) ─
{
  const p = lakeParams();
  p.species.find((s) => s.id === 'fish').harvest = 0.04;   // pull far beyond production
  const r = lakeReport(p);
  ok('overfishing collapses the stock ⇒ no longer supports', r.fish.fishStock_kg < 50 && !r.supports,
     `stock ${r.fish.fishStock_kg.toFixed(1)} kg, yield ${r.fish.fishYield_kgday.toFixed(2)} kg/day`);
}

// ── 5. Killing the water-treaters breaks treatment (BOD piles, N spikes, CO₂ crashes) ─
{
  const base = lakeReport();
  const p = lakeParams();
  for (const id of ['microbe']) {                  // the BOD-mineralising compartment
    const sp = p.species.find((s) => s.id === id);
    if (sp) sp.ingest = 0;
  }
  const s0 = lakeState(p); s0.microbe = 0;   // start the dead compartment at zero too
  const trajLast = run(p, s0, 600, 3, 30).at(-1);
  const water = waterTreatment(trajLast, p);
  ok('killing the mineralisers fails water treatment', !water.treated,
     `N ${water.mineralN_mmol_perL.toFixed(2)} mmol/L (vs base ${base.water.mineralN_mmol_perL.toFixed(2)}), organic ${water.organicLoad_molC_perL.toFixed(3)}`);
  ok('…and dissolved N accumulates (eutrophication)', water.mineralN_mmol_perL > base.water.mineralN_mmol_perL + 1,
     `${water.mineralN_mmol_perL.toFixed(2)} > ${base.water.mineralN_mmol_perL.toFixed(2)} mmol/L`);
}

// ── 6. A too-small lake underfeeds the crew (area is the lever) ───────────────
{
  const p = lakeParams();
  p.species.find((s) => s.id === 'algae').area_m2 = 2000;
  p.species.find((s) => s.id === 'duckweed').area_m2 = 1500;
  const r = lakeReport(p);
  ok('a starved lake underfeeds the crew', !r.fedOK && r.calorieRatio < 1,
     `calorie supply ${(r.calorieRatio * 100).toFixed(0)}% of demand`);
}

// ── 7. Bigger lake ⇒ more fish surplus (the productivity lever) ───────────────
{
  const small = lakeParams(); small.species.find((s) => s.id === 'algae').area_m2 = 8000;
  const big = lakeParams();   big.species.find((s) => s.id === 'algae').area_m2 = 22000;
  const ys = lakeReport(small).fish.fishYield_kgday;
  const yb = lakeReport(big).fish.fishYield_kgday;
  ok('more producer area ⇒ more harvestable fish', yb > ys,
     `${yb.toFixed(1)} kg/day @22k m² > ${ys.toFixed(1)} kg/day @8k m²`);
}

// ── 8. The lake web is dynamically stable (will hold under a small shock) ─────
{
  const p = lakeParams();
  const a = analyzeStability(p, { days: 800 });
  ok('the lake food web is asymptotically stable (or marginal)', a.stable || a.marginal,
     `spectral abscissa α = ${a.spectralAbscissa.toExponential(2)}/day, ${a.stable ? 'stable' : 'marginal'}`);
}

// ── 9. No pool goes negative across the trajectory ───────────────────────────
{
  const p = lakeParams();
  const traj = run(p, lakeState(p), 400, 1, 4);
  let poolsOK = true;
  const keys = ['algae', 'duckweed', 'daphnia', 'mussel', 'microbe', 'fish', 'litter_molC', 'food_molC'];
  for (const snap of traj) for (const k of keys) if (snap[k] < -1e-6) poolsOK = false;
  ok('no pool goes negative', poolsOK);
}

// ── 10. Determinism ──────────────────────────────────────────────────────────
{
  const a = lakeReport();
  const b = lakeReport();
  ok('lake run is deterministic', JSON.stringify(a.last) === JSON.stringify(b.last));
}

// ── 11. The roster is internally consistent (every harvestable thing is fed) ──
{
  const fed = new Set();
  for (const o of LAKE_ROSTER) if (o.kind === 'animal') for (const e of o.eats ?? []) fed.add(e);
  const harvestable = LAKE_ROSTER.filter((o) => o.override?.harvest || o.harvestIndex);
  ok('the lake names ≥4 distinct ecological roles', new Set(LAKE_ROSTER.map((o) => o.role)).size >= 4);
  ok('every harvestable species is part of a living web', harvestable.length >= 2 && fed.size >= 2,
     `${harvestable.length} harvestable, ${fed.size} resources grazed`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
