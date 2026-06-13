// biome/gacha/test/gacha.selftest.mjs — headless proof of the ecosystem gacha engine.
// Run: node biome/gacha/test/gacha.selftest.mjs
//
// The gacha rolls a seed → a food web → a viability score. The proofs that matter:
//   • the catalog is well-formed (every organism has the traits the assembler needs);
//   • a roll is DETERMINISTIC (same seed → same web, the permalink contract);
//   • every roll that assembles still CONSERVES C/H/O/N (it's the same paired-flux engine);
//   • assembled webs are valid (a producer, a decomposer, every consumer has prey);
//   • a sweep of seeds yields a SANE RARITY SPREAD — not all mush, not all jackpots.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run, step, defaultState, elements } from '../../cycles/sim/cycles.mjs';
import { designToParams } from '../../cycles/sim/builder.mjs';
import { rollDesign } from '../sim/assemble.mjs';
import { evaluateRoll, tierOf } from '../sim/score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = Object.values(JSON.parse(readFileSync(join(HERE, '../catalog.json'), 'utf8')).organisms);

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);

// ── 1. catalog is well-formed ────────────────────────────────────────────────
{
  ok('catalog has ~60 organisms', catalog.length >= 55, `${catalog.length}`);
  const bad = catalog.filter((o) => !o.id || !o.guild || !Array.isArray(o.habitats) || !o.habitats.length
    || (o.kind === 'animal' && !(o.mass_g > 0)) || (o.kind === 'producer' && !(o.area_m2 >= 0)));
  ok('every organism has the traits the assembler needs', bad.length === 0, bad.map((o) => o.id).join(','));
  const guilds = new Set(catalog.map((o) => o.guild));
  ok('all guilds represented', ['producer','herbivore','nectarivore','carnivore','omnivore','detritivore'].every((g) => guilds.has(g)));
}

// ── 2. determinism: same seed → byte-identical web ───────────────────────────
{
  const a = rollDesign(4823, catalog), b = rollDesign(4823, catalog);
  ok('a roll is deterministic', JSON.stringify(a?.design) === JSON.stringify(b?.design));
  ok('different seeds give different webs', JSON.stringify(rollDesign(1, catalog)?.meta.members) !== JSON.stringify(rollDesign(2, catalog)?.meta.members));
}

// ── 3. assembled webs are valid + conserve C/H/O/N ───────────────────────────
{
  let assembled = 0, conserved = 0, validWiring = 0, checked = 0;
  for (let n = 1; n <= 30; n++) {
    const roll = rollDesign(n, catalog);
    if (!roll) continue;
    assembled++;
    const sp = roll.design.species;
    const prod = sp.some((s) => s.kind === 'producer');
    const dec = sp.some((s) => s.guild === 'detritivore');
    const present = new Set(sp.map((s) => s.id));
    const noStarvers = sp.every((s) => s.kind === 'producer' || (s.eats || []).every((e) => e === 'litter' || present.has(e)) && (s.eats || []).length > 0);
    if (prod && dec && noStarvers) validWiring++;
    // conservation is exact by flux construction; prove it at fine resolution. A few stiff random
    // webs need a small step for the explicit RK integrator to stay STABLE enough to *show* machine
    // precision — at dt=0.1h all do. (The deck-149 expansion can roll dense webs that blow up at the
    // coarse interactive step; the gacha oracle detects that and scores them as runaways rather than
    // trusting the garbage — see score.mjs blewUp. Here we just integrate finely to show conservation.)
    if (checked < 12) {
      checked++;
      const p = designToParams(roll.design);
      let s = defaultState(p); const e0 = elements(s, p);
      const dt = 0.1 * 3600, steps = Math.round(180 * 86400 / dt);
      for (let i = 0; i < steps; i++) s = step(s, p, dt);
      const e1 = elements(s, p);
      const drift = Math.max(...['C','H','O','N'].map((el) => rel(e1[el], e0[el])));
      if (drift < 1e-9) conserved++;
    }
  }
  ok('most seeds assemble a web', assembled >= 27, `${assembled}/30`);
  ok('every assembled web is validly wired (producer+decomposer, no starvers)', validWiring === assembled, `${validWiring}/${assembled}`);
  ok('every checked web conserves C/H/O/N to machine precision', conserved === checked, `${conserved}/${checked}`);
}

// ── 4. scoring: deterministic, bounded, sane rarity spread over a sweep ──────
{
  const a = evaluateRoll(rollDesign(7, catalog), { days: 400 });
  const b = evaluateRoll(rollDesign(7, catalog), { days: 400 });
  ok('scoring is deterministic', a.interest === b.interest && a.tier === b.tier, `interest ${a.interest}`);
  ok('interest is bounded 0..100', a.interest >= 0 && a.interest <= 100);
  ok('tier matches the interest band', a.tier === tierOf(a.interest));

  const tiers = {};
  let topInterest = 0, topSeed = 0, insane = 0, insaneSeed = 0;
  for (let n = 1; n <= 60; n++) {
    const roll = rollDesign(n, catalog); if (!roll) continue;
    const ev = evaluateRoll(roll, { days: 360 });
    tiers[ev.tier] = (tiers[ev.tier] || 0) + 1;
    if (ev.interest > topInterest) { topInterest = ev.interest; topSeed = n; }
    // the oracle must never hand back a numerically blown-up run (negative biomass / impossible CO₂):
    // a dense roll can be stiff at the interactive step, so evaluateRoll detects + sanitises it — verify.
    const L = ev.report?.last || {};
    const blown = !Number.isFinite(L.co2_ppm) || L.co2_ppm > 1e6
      || roll.design.species.some((s) => Number.isFinite(L[s.id]) && L[s.id] < -1);
    if (blown) { insane++; insaneSeed = n; }
  }
  console.log('   rarity spread over seeds 1..60:', JSON.stringify(tiers), '| best:', topInterest, '@seed', topSeed);
  const distinct = Object.keys(tiers).length;
  ok('the sweep produces a spread of rarities (not one tier)', distinct >= 3, `${distinct} tiers`);
  ok('at least one genuinely viable (Rare+) ecosystem exists', topInterest >= 55, `best ${topInterest}`);
  ok('no scored roll diverges (adaptive step keeps every web finite)', insane === 0, insane ? `${insane} insane, e.g. seed ${insaneSeed}` : '');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
