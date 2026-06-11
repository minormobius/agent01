// biome/cycles/test/cycles.selftest.mjs — headless proof of the closed-loop ecosystem model.
// Run: node biome/cycles/test/cycles.selftest.mjs   (no deps)
//
// We can't open a browser or run a CFD in the sandbox, so we prove the model as
// PURE logic over the REAL engine:
//   • mass closure — C, H, O, N conserved to machine precision across a long RK4
//     run (validates the INTEGRATOR against the stoichiometry, since every flux —
//     photosynthesis, respiration, eating, dying — is paired by construction);
//   • physical sanity — pressures, RH and every pool stay in-bounds;
//   • the food web behaves — the trophic couplings do what ecology says:
//       - no pollinators ⇒ no fruit set (the mutualism gate),
//       - a predator bloom crashes pollinators ⇒ fruit falls (trophic cascade),
//       - living decomposers regenerate CO2 (kill them ⇒ litter piles up, CO2 falls);
//   • the headline FIX — with enough ecosystem area the food store SUSTAINS instead
//     of collapsing to zero, and a too-small ecosystem still collapses (so the
//     slider, not a hack, is what closes it);
//   • determinism.
import {
  defaultParams, defaultState, run, step, derivatives, elements, snapshot,
} from '../sim/cycles.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);

// ── 1. Mass closure over a year ──────────────────────────────────────────────
{
  const p = defaultParams();
  const s0 = defaultState(p);
  const e0 = elements(s0, p);
  let s = s0;
  for (let i = 0; i < 365 * 24; i++) s = step(s, p, 3600);
  const e1 = elements(s, p);
  for (const el of ['C', 'H', 'O', 'N']) {
    ok(`${el} conserved over 365 d`, rel(e1[el], e0[el]) < 1e-9,
       `drift ${rel(e1[el], e0[el]).toExponential(2)}`);
  }
}

// ── 2. Physical bounds + no negative pools across the trajectory ─────────────
{
  const p = defaultParams();
  const traj = run(p, defaultState(p), 300, 1, 2);
  let pressureOK = true, rhOK = true, poolsOK = true;
  const keys = ['crop', 'tree', 'reed', 'pollinator', 'predator', 'decomposer', 'litter_molC', 'food_molC'];
  for (const snap of traj) {
    if (snap.totalP_kPa < 50 || snap.totalP_kPa > 200) pressureOK = false;
    if (snap.rh < 0 || snap.rh > 1.5) rhOK = false;
    for (const k of keys) if (snap[k] < -1e-6) poolsOK = false;
  }
  ok('total pressure stays 50–200 kPa', pressureOK);
  ok('relative humidity stays physical (0–1.5)', rhOK);
  ok('no pool goes negative', poolsOK);
}

// helpers to edit the data-driven community
const sp = (p, id) => p.species.find((x) => x.id === id);
const setArea = (p, id, a) => { sp(p, id).area_m2 = a; };

// ── 3. Pollination mutualism — no pollinators ⇒ no fruit ─────────────────────
{
  const p = defaultParams();
  const s = defaultState(p);
  s.pollinator = 0;
  const f = derivatives(s, p).flux;
  ok('zero pollinators ⇒ zero fruit set', f.fruitSet === 0 && f.foodIn >= 0,
     `fruitSet ${f.fruitSet}`);
  const f2 = derivatives(defaultState(p), p).flux;
  ok('pollinators present ⇒ fruit is set', f2.fruitSet > 0 && f2.perSpecies.tree.fruit > 0);
}

// ── 4. Trophic cascade — a predator bloom crashes pollinators ⇒ fruit falls ──
{
  const p = defaultParams();
  const heavy = defaultParams();
  sp(heavy, 'predator').ingest *= 4;          // hungrier predators
  const base = run(p, defaultState(p), 400, 3, 10).at(-1);
  const s0 = defaultState(heavy); s0.predator = 800;
  const pred = run(heavy, s0, 400, 3, 10).at(-1);
  ok('predator bloom suppresses pollinators', pred.pollinator < base.pollinator,
     `pollinators ${pred.pollinator.toFixed(0)} < ${base.pollinator.toFixed(0)}`);
  ok('…and fruit set falls with them', pred.fruitSet < base.fruitSet,
     `fruitSet ${pred.fruitSet.toFixed(2)} < ${base.fruitSet.toFixed(2)}`);
}

// ── 5. Living decomposers regenerate CO2 (kill them ⇒ litter piles, CO2 drops) ─
{
  const p = defaultParams();
  const withDecomp = run(p, defaultState(p), 300, 3, 10).at(-1);
  const dead = defaultParams();
  sp(dead, 'decomposer').ingest = 0;          // decomposition off
  const s0 = defaultState(dead); s0.decomposer = 0;
  const noDecomp = run(dead, s0, 300, 3, 10).at(-1);
  ok('killing decomposers makes litter pile up', noDecomp.litter_molC > withDecomp.litter_molC * 1.5,
     `litter ${noDecomp.litter_molC.toFixed(0)} vs ${withDecomp.litter_molC.toFixed(0)}`);
  ok('…and ambient CO2 falls (no respiratory resupply)', noDecomp.co2_ppm < withDecomp.co2_ppm,
     `CO2 ${noDecomp.co2_ppm.toFixed(0)} < ${withDecomp.co2_ppm.toFixed(0)} ppm`);
}

// ── 6. The headline fix — area sustains food; too little area collapses it ────
{
  const big = defaultParams();
  setArea(big, 'crop', 9000); setArea(big, 'tree', 18000); setArea(big, 'reed', 12000);
  const bigFood = run(big, defaultState(big), 600, 3, 10).at(-1).food_molC;
  ok('ample ecosystem ⇒ food store sustains (does not collapse)', bigFood > 1000,
     `food ${bigFood.toFixed(0)} mol C after 600 d`);

  const small = defaultParams();
  setArea(small, 'crop', 600); setArea(small, 'tree', 1200); setArea(small, 'reed', 800);
  const smallFood = run(small, defaultState(small), 600, 3, 10).at(-1).food_molC;
  ok('starved ecosystem ⇒ food store collapses toward zero', smallFood < small.crew * 22,
     `food ${smallFood.toFixed(0)} mol C (< one day's intake)`);
}

// ── 8. Extensibility — adding a 7th organism keeps conservation exact ─────────
{
  const p = defaultParams();
  // add a bird that eats both pollinators and (some) crops, plus its own interaction
  p.species.push({ id: 'bird', name: 'Omnivorous birds', kind: 'heterotroph', role: 'omnivore',
    initBio: 40, ingest: 0.15, assim: 0.45, resp: 0.035, mort: 0.012, capacityFrac: 0.04 });
  p.interactions.push({ type: 'trophic', consumer: 'bird', resources: ['pollinator', 'crop'], halfSat: 300 });
  const s0 = defaultState(p);
  const e0 = elements(s0, p);
  let s = s0;
  for (let i = 0; i < 200 * 24; i++) s = step(s, p, 3600);
  const e1 = elements(s, p);
  const drift = Math.max(...['C', 'H', 'O', 'N'].map((el) => rel(e1[el], e0[el])));
  ok('a 7th organism slots in with conservation intact', drift < 1e-9 && s.bird >= 0,
     `max element drift ${drift.toExponential(2)}, bird ${s.bird.toFixed(0)}`);
}

// ── 7. Determinism ───────────────────────────────────────────────────────────
{
  const p = defaultParams();
  const a = run(p, defaultState(p), 60, 1, 5);
  const b = run(p, defaultState(p), 60, 1, 5);
  ok('run is deterministic', JSON.stringify(a) === JSON.stringify(b));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
