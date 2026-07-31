// smith.selftest — the SMITHY kernel: craft an item from commodities, tech gating, dismantle-is-a-loss,
// cost scaling, determinism, wallet math. Pure — no DOM. Sits on the item genome (genome.js/taxa.js).
import {
  COMMODITIES, COMMODITY_IDS, materialRecipe, ERAS, techCeilingForTier, erasUpTo,
  availableMaterials, buildCraftGenome, craftItem, craftCost, dismantle, RECLAIM_FRACTION,
  canAfford, shortfall, spend, earn,
} from '../craft/smith.js';
import { COMMODITY_PRICE, buyCommodityPrice, sellCommodityPrice } from '../craft/smith.js';
import { MATERIALS, PHYLA, PHYLUM_ORDER } from '../sprite/item/taxa.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// 1. commodities line up with the forge's seven
ok(COMMODITIES.length === 7 && COMMODITY_IDS.includes('trace') && COMMODITY_IDS.includes('biomass'), 'seven conserved commodities (incl. trace + biomass)');

// 2. every material has a recipe drawing on real commodities
for (const m of Object.keys(MATERIALS)) {
  const r = materialRecipe(m);
  ok(sum(r) > 0 && Object.keys(r).every((k) => COMMODITY_IDS.includes(k)), `material ${m} → a real commodity recipe`);
}
// the class→commodity map holds: an organic draws biomass, a metal draws metal, an exotic draws trace
ok(materialRecipe('wood').biomass > 0, 'organic → biomass');
ok(materialRecipe('iron').metal > 0, 'metal → metal');
ok(materialRecipe('plasma').trace > 0, 'exotic → trace (the keystone)');
ok(materialRecipe('gold').trace > 0, 'a precious metal also costs trace');
ok(materialRecipe('crystal').trace > 0, 'crystal costs trace');

// 3. tech gating — the ceiling from a tier reveals more materials as it rises, and ship-grade is earned late
ok(techCeilingForTier(1) < techCeilingForTier(5), 'a higher narrative tier lifts the tech ceiling');
ok(erasUpTo(techCeilingForTier(1)).length < erasUpTo(techCeilingForTier(5)).length, 'more eras unlock with tier');
ok(!erasUpTo(techCeilingForTier(1)).some((e) => e.id === 'ship-grade'), 'ship-grade is NOT available at tier 1');
ok(erasUpTo(techCeilingForTier(5)).some((e) => e.id === 'ship-grade'), 'ship-grade unlocks at the top tier');
{
  const lo = availableMaterials('blade', techCeilingForTier(1)), hi = availableMaterials('blade', techCeilingForTier(5));
  ok(hi.length > lo.length, `higher tech → more craftable materials (${lo.length} → ${hi.length})`);
  ok(lo.every((m) => MATERIALS[m].tech[0] <= techCeilingForTier(1) + 1e-9), 'low-tech list excludes materials above the ceiling');
  ok(hi.includes('alloy') || hi.includes('composite'), 'ship-grade unlocks synthetic/exotic materials for a blade');
  ok(!lo.includes('plasma'), 'plasma is not craftable at tier 1');
}

// 4. craftItem produces a real assembled item at the chosen spec
{
  const it = craftItem({ phylum: 'blade', material: 'steel', tech: 0.6, quality: 0.8, seed: 7 });
  ok(it && it.phylum === 'blade' && it.material === 'steel', 'crafts the chosen body-plan + material');
  ok(it.stats && it.worth >= 0 && it.grade, 'the crafted item is appraised (stats + worth + grade)');
  ok(it.crafted === true, 'the item is tagged crafted');
  ok(it.genome.genes.provenance < 0.3, 'a fresh craft has low provenance (renown is earned, not forged)');
  // higher quality → a better item
  const lowQ = craftItem({ phylum: 'blade', material: 'steel', tech: 0.6, quality: 0.15, seed: 7 });
  ok(it.worth >= lowQ.worth, 'higher quality yields a worthier item');
}

// 5. cost is positive, drawn on real commodities, and scales with size / tech / quality
{
  const c = craftCost({ phylum: 'blade', material: 'steel', tech: 0.6, quality: 0.6 });
  ok(sum(c) > 0 && Object.keys(c).every((k) => COMMODITY_IDS.includes(k)), 'a craft costs real commodities');
  ok(sum(craftCost({ phylum: 'blade', material: 'steel', tech: 0.6, quality: 0.9 })) > sum(craftCost({ phylum: 'blade', material: 'steel', tech: 0.6, quality: 0.2 })), 'better quality costs more feedstock');
  ok(sum(craftCost({ phylum: 'blade', material: 'steel', tech: 0.9, quality: 0.6 })) >= sum(craftCost({ phylum: 'blade', material: 'steel', tech: 0.4, quality: 0.6 })), 'higher tech costs more');
  ok((craftCost({ phylum: 'blade', material: 'plasma', tech: 0.95, quality: 0.7 }).trace || 0) > 0, 'a ship-grade exotic craft demands trace');
  ok(sum(craftCost({ phylum: 'plate', material: 'steel', tech: 0.6, quality: 0.6 })) > sum(craftCost({ phylum: 'band', material: 'steel', tech: 0.6, quality: 0.6 })), 'a heavy breastplate costs more than a ring');
}

// 6. dismantle is a LOSS — you recover less than it cost to build
{
  const spec = { phylum: 'blade', material: 'steel', tech: 0.6, quality: 0.7, seed: 3 };
  const cost = craftCost(spec), it = craftItem(spec), back = dismantle(it);
  ok(sum(back) > 0, 'dismantling yields commodities');
  ok(sum(back) < sum(cost), `dismantle recovers less than the build cost (${sum(back)} < ${sum(cost)}) — a loss, like the forge reclaim`);
  ok(Object.keys(back).every((k) => COMMODITY_IDS.includes(k)), 'recovered commodities are real');
  ok(sum(dismantle(null)) === 0, 'dismantling nothing is safe');
}

// 7. determinism — same spec → same item + same cost (the atproto/permalink contract)
ok(JSON.stringify(craftItem({ phylum: 'rod', material: 'crystal', tech: 0.8, quality: 0.5, seed: 42 })) === JSON.stringify(craftItem({ phylum: 'rod', material: 'crystal', tech: 0.8, quality: 0.5, seed: 42 })), 'craftItem is deterministic');
ok(JSON.stringify(craftCost({ phylum: 'rod', material: 'crystal', tech: 0.8, quality: 0.5 })) === JSON.stringify(craftCost({ phylum: 'rod', material: 'crystal', tech: 0.8, quality: 0.5 })), 'craftCost is deterministic');

// 7b. commodity market prices — real, trace is the dearest, sell recovers less than buy
ok(COMMODITY_IDS.every((id) => buyCommodityPrice(id) > 0), 'every commodity has a buy price');
ok(buyCommodityPrice('trace') > buyCommodityPrice('metal') && buyCommodityPrice('trace') > buyCommodityPrice('biomass'), 'trace is the dearest commodity');
ok(sellCommodityPrice('metal') < buyCommodityPrice('metal'), 'the desk buys low (sell < buy)');

// 8. wallet math — afford / shortfall / spend / earn
{
  const wallet = { metal: 10, silicate: 3, trace: 0 };
  ok(canAfford(wallet, { metal: 5 }) && !canAfford(wallet, { metal: 5, trace: 2 }), 'canAfford checks every commodity');
  ok(shortfall(wallet, { metal: 5, trace: 2 }).trace === 2 && !shortfall(wallet, { metal: 5, trace: 2 }).metal, 'shortfall reports only what is missing');
  ok(spend(wallet, { metal: 4 }).metal === 6 && wallet.metal === 10, 'spend returns a NEW wallet (pure)');
  ok(earn(wallet, { trace: 3 }).trace === 3, 'earn adds to the wallet');
}

// 9. v105 unified language — a crafted item carries a PLANET register from its material (metals → item).
{
  const { itemRegister, favoursOf } = await import('../craft/smith.js');
  const { materialPlanet, MATERIAL_ORDER } = await import('../sprite/item/taxa.js');
  const { PLANETS } = await import('../planets.js');
  // the classical planet→metal correspondence funnels authoritatively through planetOf
  ok(materialPlanet('gold') === 'sol' && materialPlanet('silver') === 'luna' && materialPlanet('iron') === 'mars', 'classical metals → their planet (gold→sol · silver→luna · iron→mars)');
  ok(MATERIAL_ORDER.every((m) => PLANETS[materialPlanet(m)]), 'every material maps to a real planet register');
  ok(new Set(MATERIAL_ORDER.map(materialPlanet)).size === 7, 'the material bridge spans all seven planets (no dead register)');
  // craftItem stamps the register so combat / the other verticals can read a piece of gear's flavor
  const it = craftItem({ phylum: 'blade', material: 'iron', tech: 0.4, quality: 0.6, seed: 7, faction: 'rindwalker' });
  ok(it.planet === 'mars' && it.register === 'Iron' && it.planetGlyph === '♂', 'an iron blade is forged in the Mars register (glyph ♂)');
  ok(it.faction === 'rindwalker' && it.favours === 'chassis', 'the faction it was forged under sets the school it favours (rindwalker → chassis)');
  const reg = itemRegister('gold');
  ok(reg.planet === 'sol' && reg.matchups.beats.length === 3, 'itemRegister exposes the planet + its combat matchup (beats three)');
  ok(favoursOf('continuant') === 'flesh' && favoursOf('drift') === 'anima', 'favoursOf returns each faction body school');
}

console.log(`smith.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
