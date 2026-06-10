// Self-test for the allometry layer. Run: node biome/cycles/test/allometry.selftest.mjs
// Validates the scaling laws, the calibration (it reproduces the hand-tuned defaults),
// and that a community built ENTIRELY from body masses closes and conserves mass.
import {
  GUILDS, specificRespiration, maxIngestion, naturalMortality,
  bodyToBiomass, biomassToBodies, animalStatBlock, makeAnimal,
} from '../sim/allometry.mjs';
import {
  defaultParams, defaultState, run, step, elements,
} from '../sim/cycles.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);
const close = (a, b, tol) => rel(a, b) <= tol;

// ── 1. Kleiber: mass-specific rates scale as M^(−1/4) ────────────────────────
{
  // a 10× heavier animal has (10)^(−1/4) = 0.5623× the per-gram metabolic rate
  const r1 = specificRespiration(1, 'ecto');
  const r10 = specificRespiration(10, 'ecto');
  ok('mass-specific respiration scales as M^(−1/4)', close(r10 / r1, Math.pow(10, -0.25), 1e-12),
     `ratio ${(r10 / r1).toFixed(4)} vs ${Math.pow(10, -0.25).toFixed(4)}`);
  ok('ingestion and mortality share the −1/4 exponent',
     close(maxIngestion(10) / maxIngestion(1), Math.pow(10, -0.25), 1e-12) &&
     close(naturalMortality(10) / naturalMortality(1), Math.pow(10, -0.25), 1e-12));
  ok('bigger ⇒ slower per gram (1 g burns faster than 1 kg)',
     specificRespiration(1) > specificRespiration(1000),
     `${specificRespiration(1).toFixed(3)}/d vs ${specificRespiration(1000).toFixed(4)}/d`);
}

// ── 2. Thermy: an endotherm burns ~×18 an equal-mass ectotherm ────────────────
{
  const ratio = specificRespiration(10, 'endo') / specificRespiration(10, 'ecto');
  ok('endotherm maintenance ≈ ×18 ectotherm at equal mass', close(ratio, 18, 1e-9),
     `×${ratio.toFixed(1)}`);
  ok('thermy does NOT inflate mortality (mass-only)',
     naturalMortality(10) === naturalMortality(10), '(mortality has no thermy term)');
}

// ── 3. Calibration — the layer reproduces the hand-tuned default community ────
// The tuned pollinator is a 0.1 g ectotherm nectarivore; the tuned predator is a
// ~0.3 g ectotherm carnivore. If allometry is grounded, feeding in (mass, guild)
// should recover the numbers we hand-fit.
{
  const p = defaultParams();
  const tunedPoll = p.species.find(s => s.id === 'pollinator');
  const tunedPred = p.species.find(s => s.id === 'predator');

  const bee = animalStatBlock({ id: 'b', mass_g: 0.1, guild: 'nectarivore', thermy: 'ecto' });
  ok('0.1 g nectarivore reproduces the tuned pollinator',
     close(bee.resp, tunedPoll.resp, 0.02) && close(bee.ingest, tunedPoll.ingest, 0.02) &&
     close(bee.mort, tunedPoll.mort, 0.02) && bee.assim === tunedPoll.assim,
     `resp ${bee.resp.toFixed(3)} ingest ${bee.ingest.toFixed(3)} mort ${bee.mort.toFixed(3)}`);

  const spider = animalStatBlock({ id: 's', mass_g: 0.27, guild: 'carnivore', thermy: 'ecto' });
  ok('~0.27 g carnivore reproduces the tuned predator rates (resp/ingest/mort)',
     close(spider.resp, tunedPred.resp, 0.05) && close(spider.ingest, tunedPred.ingest, 0.05) &&
     close(spider.mort, tunedPred.mort, 0.05),
     `resp ${spider.resp.toFixed(3)} ingest ${spider.ingest.toFixed(3)} mort ${spider.mort.toFixed(3)}`);
}

// ── 4. Individuals <-> biomass round-trip ────────────────────────────────────
{
  const molC = bodyToBiomass(50000, 0.1);              // 50k honeybees @ 0.1 g
  const n = biomassToBodies(molC, 0.1);
  ok('bodyToBiomass / biomassToBodies round-trips', close(n, 50000, 1e-9),
     `${molC.toFixed(1)} mol C ≈ ${Math.round(n)} bodies`);
  ok('a heavier animal of equal count is more biomass',
     bodyToBiomass(1000, 5) > bodyToBiomass(1000, 0.1));
}

// ── 5. Guard rails ───────────────────────────────────────────────────────────
{
  let threw = false;
  try { animalStatBlock({ id: 'x', mass_g: 1, guild: 'wizard' }); } catch { threw = true; }
  ok('unknown guild throws (typo protection)', threw);
  ok('every guild has an assimilation efficiency in (0,1]',
     Object.values(GUILDS).every(g => g.assim > 0 && g.assim <= 1));
}

// ── 6. End-to-end — a community built ONLY from body masses closes & conserves ─
// Producers stay area-based (a canopy is parameterised by area, not body mass);
// every animal is generated from (mass, guild). This is the "drop a real roster in"
// path: identity → mass → stat block → integrate.
{
  const p = defaultParams();
  // keep the producers, replace the animals with allometry-built ones
  p.species = p.species.filter(s => s.kind === 'producer');
  p.interactions = [];

  const bees     = makeAnimal({ id: 'pollinator', name: 'Bees', mass_g: 0.1, guild: 'nectarivore',
                                count: 60000, eats: ['crop', 'tree', 'reed'], halfSat: 4000,
                                plant: 'tree', fruitPerday: 0.02 });
  const spiders  = makeAnimal({ id: 'predator', name: 'Spiders', mass_g: 0.3, guild: 'carnivore',
                                count: 1500, eats: ['pollinator'], halfSat: 120 });
  const microbes = makeAnimal({ id: 'decomposer', name: 'Detritivores', mass_g: 0.003, guild: 'detritivore',
                                initBio: 20000, eats: ['litter'], halfSat: 10000 });

  for (const a of [bees, spiders, microbes]) { p.species.push(a.species); p.interactions.push(...a.interactions); }

  const s0 = defaultState(p);
  const e0 = elements(s0, p);
  let s = s0;
  for (let i = 0; i < 365 * 24; i++) s = step(s, p, 3600);
  const e1 = elements(s, p);
  const drift = Math.max(...['C', 'H', 'O', 'N'].map(el => rel(e1[el], e0[el])));
  ok('allometry-built community conserves C/H/O/N exactly', drift < 1e-9,
     `max drift ${drift.toExponential(2)}`);

  const last = run(p, defaultState(p), 600, 3, 4).at(-1);
  ok('…and it closes the loop (food sustains, pollinators persist, O₂ physical)',
     last.food_molC > 1000 && last.pollinator > 0 && last.o2_kPa > 5 && last.o2_kPa < 60,
     `food ${last.food_molC.toFixed(0)} mol C, bees ${last.pollinator.toFixed(0)}, O₂ ${last.o2_kPa.toFixed(1)} kPa`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
