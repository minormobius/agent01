// cookbook.selftest — the derived alchemist's cookbook: catalog integrity, grammar coverage, real
// graded recipes, pairings. Pure. Every recipe is an actually-prepared item, so this also guards the
// alchemy kernel's prepare() over real reagent pools.
import { reagentCatalog, reagentsByHumour, reagentsByPlanet, grammar, describeEffect, deriveRecipes, pairingsFor } from '../alch/cookbook.js';
import { HUMOUR_EFFECT, PLANET_EFFECT, prepare } from '../alch/alchemy.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. catalog — every entry is a real live reagent with the four axes
const cat = reagentCatalog();
ok(cat.length >= 20, `catalog has the live reagents (${cat.length})`);
ok(cat.every((r) => r.slug && r.plant && r.bot), 'every reagent carries identity');
ok(cat.every((r) => r.combat || r.social), 'every reagent has at least one effect axis (it is alchemically live)');
ok(cat.every((r) => r.potency >= 1 && r.potency <= 4), 'potency is a Macer degree 1..4');
ok(cat.every((r, i) => i === 0 || r.potency <= cat[i - 1].potency), 'catalog is sorted by potency (strongest first)');

// 2. grammar — the four humours, seven planets, metals, preparations all present + counted
const g = grammar();
ok(g.humours.length === 4, 'four humour→combat families');
ok(g.humours.every((h) => h.combatKind && (h.count >= 0)), 'each humour maps to a combat kind + a reagent count');
ok(g.planets.length === 7, 'seven planet→social families');
ok(g.planets.every((p) => p.social && p.anima), 'each planet maps to a social stat + anima');
ok(g.metals.length >= 5 && g.metals.every((m) => m.chassis), 'metals map to chassis lube');
ok(g.preparations.some((p) => p.deliver === 'self') && g.preparations.some((p) => p.deliver === 'touch') && g.preparations.some((p) => p.deliver === 'range'), 'preparations span self/touch/range delivery');

// 3. the four combat families each have ≥1 reagent, so a recipe can be built for each
for (const q of Object.keys(HUMOUR_EFFECT)) ok(reagentsByHumour(q).length >= 1, `humour ${q} has reagents (${reagentsByHumour(q).length})`);

// 4. derived recipes — every card is a REAL prepared item (grade + effect), covering all families
const recipes = deriveRecipes();
ok(recipes.length >= 4 + 1, `recipes cover combat + social + lubricant (${recipes.length})`);
ok(recipes.filter((r) => r.family === 'combat').length === 4, 'one combat recipe per humour');
{
  const planetsWithReagents = Object.keys(PLANET_EFFECT).filter((pl) => reagentsByPlanet(pl).length > 0).length;
  ok(recipes.filter((r) => r.family === 'social').length === planetsWithReagents, `one social recipe per planet that has reagents (${planetsWithReagents}; Saturn has none)`);
}
ok(recipes.some((r) => r.family === 'lubricant'), 'a lubricant recipe (the mechanical vertical)');
ok(recipes.every((r) => r.reagents.length >= 1 && r.reagents.length <= 3), 'each recipe is a small brew (1..3 reagents)');
ok(recipes.every((r) => /^[SABCDF]$/.test(r.grade)), 'each recipe carries a grade');
ok(recipes.every((r) => typeof r.effect === 'string' && r.effect.length > 3), 'each recipe describes its effect');
// the combat recipes actually carry the right combat kind
{
  const heal = recipes.find((r) => r.axis === 'cold & moist');
  ok(heal && heal.use.combat && heal.use.combat.kind === 'heal', 'the cold & moist recipe heals');
  const caustic = recipes.find((r) => r.axis === 'hot & dry');
  ok(caustic && caustic.use.combat && caustic.use.combat.kind === 'attack', 'the hot & dry recipe attacks');
  ok(caustic && caustic.use.deliver === 'range', 'the caustic is a ranged incense (delivery from the vessel)');
}

// 5. determinism — the cookbook is a pure function of the data
ok(JSON.stringify(deriveRecipes()) === JSON.stringify(deriveRecipes()), 'deriveRecipes is deterministic');

// 6. pairings — a reagent's humour-mates share its humour, planet-mates its planet
{
  const anchor = cat.find((r) => r.qualities && r.planet) || cat[0];
  const pr = pairingsFor(anchor.slug);
  ok(pr.humourMates.every((m) => m.qualities === anchor.qualities), 'humour-mates share the humour');
  ok(pr.planetMates.every((m) => m.planet === anchor.planet), 'planet-mates share the planet');
  ok(!pr.humourMates.some((m) => m.slug === anchor.slug), 'a reagent is not its own mate');
}

// 7. describeEffect handles the empty brew gracefully
ok(typeof describeEffect(prepare([], 'draught')) === 'string', 'describeEffect on an empty brew returns a string, no throw');

console.log(`cookbook.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
