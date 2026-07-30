// mend.selftest — working an item's genome: temper (hone a gene), reforge (lift the piece), upgrade (a
// tech era), + their commodity costs. Pure. Sits on the smithy's craft (a crafted item is the fixture).
import { temper, reforge, upgrade, nextEraTech, canUpgrade, temperCost, reforgeCost, upgradeCost, TEMPER_TRAITS } from '../craft/mend.js';
import { craftItem, techCeilingForTier } from '../craft/smith.js';
import { COMMODITY_IDS } from '../craft/smith.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const realCommods = (o) => Object.keys(o).every((k) => COMMODITY_IDS.includes(k));

// a mid-tech steel dagger to work on
const base = craftItem({ phylum: 'blade', material: 'steel', tech: 0.55, quality: 0.4, seed: 7 });

// 1. temper — hones the chosen gene up, leaves the rest, re-appraises
{
  const t = temper(base, 'potency', { seed: 1 });
  ok(t && t.stats.potency >= base.stats.potency, 'temper potency does not lower potency');
  ok(t.genome.genes.potency > base.genome.genes.potency, 'temper lifts the potency gene');
  ok(Math.abs(t.genome.genes.durability - base.genome.genes.durability) < 1e-9, 'temper leaves other genes alone');
  ok(temper(base, 'notatrait', { seed: 1 }) === null, 'temper rejects an unknown trait');
  ok(TEMPER_TRAITS.includes('durability') && TEMPER_TRAITS.includes('potency'), 'temperable traits are durability + potency');
}

// 2. reforge — never worse, usually better; keeps body + material + tech
{
  const r = reforge(base, { seed: 3 });
  ok(r && r.phylum === base.phylum && r.material === base.material, 'reforge keeps the body-plan + material');
  ok(Math.abs(r.genome.genes.tech - base.genome.genes.tech) < 1e-9, 'reforge keeps the tech era');
  ok(r.worth >= base.worth, `reforge does not worsen the piece (${base.worth} → ${r.worth})`);
  // a rough piece reforges to something clearly better on average
  ok(r.stats.durability >= base.stats.durability || r.stats.potency >= base.stats.potency, 'reforge lifts a quality axis');
}

// 3. upgrade — advances one era, gated by rank
{
  ok(nextEraTech(0.3) > 0.3 && nextEraTech(0.99) === null, 'nextEraTech steps up, tops out at the last era');
  const ceilingHi = techCeilingForTier(5), ceilingLo = techCeilingForTier(1);
  ok(canUpgrade(base, ceilingHi), 'a mid-tech piece can upgrade when rank allows');
  const up = upgrade(base, ceilingHi, { seed: 5 });
  ok(up && up.genome.genes.tech > base.genome.genes.tech, 'upgrade advances the tech era');
  ok(up.era !== base.era || up.stats.potency >= base.stats.potency, 'upgrade lands in a higher era / better piece');
  // rank gate: a ship-grade piece cannot be upgraded past the top, and a low rank blocks a big jump
  const shipGrade = craftItem({ phylum: 'blade', material: 'alloy', tech: 0.96, quality: 0.7, seed: 2 });
  ok(!canUpgrade(shipGrade, ceilingHi) && upgrade(shipGrade, ceilingHi, { seed: 1 }) === null, 'a top-era piece cannot upgrade further');
  ok(!canUpgrade(craftItem({ phylum: 'blade', material: 'iron', tech: 0.5, quality: 0.5, seed: 9 }), ceilingLo) || ceilingLo >= nextEraTech(0.5), 'the rank ceiling gates upgrades');
}

// 4. costs — real commodities, ordered temper < reforge < upgrade, upgrade demands trace
{
  const tc = temperCost(base), rc = reforgeCost(base), uc = upgradeCost(base);
  ok(sum(tc) > 0 && realCommods(tc), 'temper costs real commodities');
  ok(sum(rc) > sum(tc), `reforge costs more than temper (${sum(rc)} > ${sum(tc)})`);
  ok(sum(uc) >= sum(rc), `upgrade costs the most (${sum(uc)} ≥ ${sum(rc)})`);
  ok((uc.trace || 0) > 0, 'upgrading a tech era demands trace (the keystone)');
}

// 5. determinism — same (item, seed) → same result
ok(JSON.stringify(reforge(base, { seed: 42 })) === JSON.stringify(reforge(base, { seed: 42 })), 'reforge is deterministic');
ok(JSON.stringify(upgrade(base, techCeilingForTier(5), { seed: 8 })) === JSON.stringify(upgrade(base, techCeilingForTier(5), { seed: 8 })), 'upgrade is deterministic');

// 6. a non-genome item mends to null, safely
ok(temper({ name: 'plain' }, 'potency', {}) === null && reforge({ name: 'plain' }) === null, 'a genome-less item cannot be mended (no throw)');

console.log(`mend.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
