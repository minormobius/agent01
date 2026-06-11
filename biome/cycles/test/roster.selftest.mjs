// Self-test for the roster + compiler. Run: node biome/cycles/test/roster.selftest.mjs
// Proves the roster validates, compiles real organisms into a runnable community via the
// allometry layer, wires diet + pollination edges, and that the all-real community closes
// the loop and conserves mass. If roster.enriched.json is present, cross-checks provenance.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROSTER, validateRoster, buildCommunity, rosterParams } from '../sim/roster.mjs';
import { defaultState, run, step, elements } from '../sim/cycles.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);

// ── 1. The curated roster is internally consistent ───────────────────────────
ok('roster validates (diet targets exist, masses/areas sane)', validateRoster().length === 0,
   validateRoster().join('; '));

// a deliberately broken roster is caught
{
  const bad = ROSTER.map((o) => o.id === 'spider' ? { ...o, eats: ['wolf'] } : o);
  ok('a dangling diet edge is rejected', validateRoster(bad).some((p) => p.includes('wolf')));
}

// ── 2. Compilation: real organisms → engine species + edges ──────────────────
{
  const { species, interactions } = buildCommunity();
  ok('every roster entry compiles to a species', species.length === ROSTER.length,
     `${species.length} species`);
  // animal rates came from allometry (not hand-typed) — bee resp matches the M^-1/4 law
  const bee = species.find((s) => s.id === 'bee');
  ok('animal stat blocks are allometric (0.1 g bee ⇒ resp ≈ 0.05/d)', rel(bee.resp, 0.05) < 0.02,
     `bee resp ${bee.resp.toFixed(3)}/d, ingest ${bee.ingest.toFixed(3)}/d`);
  // diet edge: spider eats bee
  ok('diet names resolve to trophic edges', interactions.some(
     (e) => e.type === 'trophic' && e.consumer === 'spider' && e.resources.includes('bee')));
  // pollination edge: bee pollinates tree
  ok('the pollinator→plant gate is wired', interactions.some(
     (e) => e.type === 'pollinates' && e.animal === 'bee' && e.plant === 'tree'));
  // producers carry their scientific name through to the engine species
  ok('scientific names ride through to the engine', species.every((s) => typeof s.sciName === 'string'));
}

// ── 3. The all-real-organism community closes & conserves ────────────────────
{
  const p = rosterParams();
  const s0 = defaultState(p);
  const e0 = elements(s0, p);
  let s = s0;
  for (let i = 0; i < 365 * 24; i++) s = step(s, p, 3600);
  const e1 = elements(s, p);
  const drift = Math.max(...['C', 'H', 'O', 'N'].map((el) => rel(e1[el], e0[el])));
  ok('real-roster community conserves C/H/O/N exactly', drift < 1e-9,
     `max drift ${drift.toExponential(2)}`);

  const last = run(p, defaultState(p), 600, 3, 4).at(-1);
  ok('…and it closes the loop (food sustains, bees persist, O₂ physical)',
     last.food_molC > 1000 && last.bee > 0 && last.o2_kPa > 5 && last.o2_kPa < 60,
     `food ${last.food_molC.toFixed(0)} mol C, bees ${last.bee.toFixed(0)}, O₂ ${last.o2_kPa.toFixed(1)} kPa`);

  // the pollination mutualism is load-bearing in the REAL community too
  const noBees = run(p, { ...defaultState(p), bee: 0 }, 300, 3, 10).at(-1);
  ok('remove the honeybee ⇒ apple fruit set collapses', noBees.fruitSet === 0,
     `fruitSet ${noBees.fruitSet}`);
}

// ── 4. Provenance (soft — only if enrich-roster.mjs has been run) ────────────
{
  const f = join(dirname(fileURLToPath(import.meta.url)), '../sim/roster.enriched.json');
  if (existsSync(f)) {
    const d = JSON.parse(readFileSync(f));
    const everyHasInat = ROSTER.every((o) => d.entries[o.id]?.inat?.inatId > 0);
    ok('every roster entry has an iNaturalist identity', everyHasInat);
    const everyHasPhoto = ROSTER.every((o) => typeof d.entries[o.id]?.inat?.photo === 'string');
    ok('every roster entry has imagery', everyHasPhoto);
    // GloBI corroboration: the carnivore's observed prey include Hymenoptera (Apis's order)
    const spiderPrey = d.entries.spider?.globiEats ?? [];
    ok('GloBI corroborates the spider→bee edge (prey include Hymenoptera/insects)',
       spiderPrey.some((x) => /Hymenoptera|Apis|Insecta|Diptera|Lepidoptera/i.test(x)),
       spiderPrey.slice(0, 4).join(', '));
  } else {
    console.log('—  provenance file absent (run enrich-roster.mjs); skipping 3 soft checks');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
