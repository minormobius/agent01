// alch.selftest.mjs — the correspondence → effect kernel (alch/alchemy.js).
//   node hoop/v102/test/alch.selftest.mjs
//
// Pins the grammar (temperament→combat, planet→social/anima, metal→lubricant, degree→potency,
// preparation→delivery), the reagent bridge (slug/name/binomial → correspondence), coherence + grading,
// and the prepare() payload shape the game's consume verb reads — all against the REAL vendored
// read/alch data, so a scholarly re-sync that changes a herb shows up here.

import {
  HUMOUR_EFFECT, PLANET_EFFECT, METAL_EFFECT, PREPARATIONS,
  findReagent, parseDegree, reagentEffect, coherence, gradeOf, prepare,
} from '../alch/alchemy.js';
import { CORRESPONDENCES, PLANETS } from '../alch/correspondences.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── 1. the vendored data is intact ──
ok(CORRESPONDENCES.plants.length === 55, `55 herbs vendored (${CORRESPONDENCES.plants.length})`);
ok(Object.keys(PLANETS).length === 7, 'the Seven planets are present');
ok(PLANETS.Mercury.metal === 'quicksilver' && PLANETS.Saturn.metal === 'lead', 'the planet→metal bridge is intact');

// ── 2. the grammar covers every axis value the data can produce ──
ok(Object.keys(HUMOUR_EFFECT).every((k) => k in { 'hot & dry': 1, 'hot & moist': 1, 'cold & moist': 1, 'cold & dry': 1 }), 'humour keys match the four TEMPERAMENTS');
{
  // every planet a herb can carry has a social effect; every metal a lubricant effect
  const planetsUsed = new Set(CORRESPONDENCES.plants.map((p) => p.planet).filter(Boolean));
  ok([...planetsUsed].every((pl) => PLANET_EFFECT[pl]), `every herb's planet has a social effect (${[...planetsUsed].length} planets used)`);
  const metalsUsed = new Set([...planetsUsed].map((pl) => PLANETS[pl].metal));
  ok([...metalsUsed].every((m) => METAL_EFFECT[m]), 'every herb-reachable metal has a lubricant effect');
}
ok(HUMOUR_EFFECT['hot & dry'].combatKind === 'attack' && HUMOUR_EFFECT['cold & moist'].combatKind === 'heal'
  && HUMOUR_EFFECT['cold & dry'].combatKind === 'debuff' && HUMOUR_EFFECT['hot & moist'].combatKind === 'buff',
  'temperament→combat is Galenic (hot·dry damage, cold·moist heal, cold·dry debuff, hot·moist buff)');
ok(PLANET_EFFECT.Venus.social === 'persuasion' && PLANET_EFFECT.Venus.anima === 'will'
  && PLANET_EFFECT.Mercury.social === 'acuity' && PLANET_EFFECT.Mercury.anima === 'cogit',
  'planet→social dips into anima (Venus→persuasion/will, Mercury→acuity/cogit)');
ok(METAL_EFFECT.quicksilver.chassis === 'servo', 'quicksilver (Mercury) is the servo lubricant');

// ── 3. degree parsing ──
ok(parseDegree('3rd degree') === 3 && parseDegree('hot 3°, dry') === 3 && parseDegree('hot 1°, dry 2°') === 1, 'degree phrasing → integer potency');
ok(parseDegree(null) === 1 && parseDegree('sharp & fiery') === 1, 'unstated degree defaults to 1');
ok(parseDegree('5th degree') === 4, 'potency clamps to 4 (Macer tops at the 4th)');

// ── 4. the reagent bridge — slug / common name / BINOMIAL all resolve ──
ok(findReagent('rue') && findReagent('Rue') && findReagent('Ruta graveolens'), 'a reagent resolves by slug, name, and botanical binomial (the biome-roster bridge)');
ok(findReagent('  SAGE  ')?.slug === 'sage', 'lookup is case/space-insensitive');
ok(findReagent('adamantium') === null, 'an unknown name resolves to null (honest)');

// ── 5. reagentEffect — a real herb's full descriptor ──
{
  const rue = reagentEffect('rue');   // Sun, hot & dry, 3rd degree → gold
  ok(rue.live && rue.planet === 'Sun' && rue.qualities === 'hot & dry', 'rue reads Sun / hot & dry');
  ok(rue.potency === 3, "rue's 3rd degree → potency 3");
  ok(rue.combat.kind === 'attack' && rue.combat.status === 'bleed', 'rue → a caustic (attack) combat effect');
  ok(rue.social.stat === 'presence' && rue.social.anima === 'will', 'rue (Sun) → presence, drawing on will');
  ok(rue.lubricant.chassis === 'core' && rue.metal === 'gold', 'rue → gold → core lubricant');
}
{
  const poppy = reagentEffect('poppy');   // cold & dry → the sedative
  ok(poppy.live && poppy.combat.kind === 'debuff' && poppy.combat.status === 'slow', 'poppy (cold & dry) → the sedative debuff (slow)');
}
{
  // a plant with no correspondence (edible/terrain, not alchemical) is honestly non-live
  const nonLive = CORRESPONDENCES.plants.length; // sanity: all 55 in the overlay ARE attributed
  ok(reagentEffect('Zzyzx-root').live === false && reagentEffect('Zzyzx-root').combat === null, 'an un-attributed name → live:false, no effects (still a valid crop, just not alchemical)');
}

// ── 6. coherence + grading ──
{
  const same = coherence([reagentEffect('sage'), reagentEffect('rue')]);     // both hot & dry
  const clash = coherence([reagentEffect('rue'), reagentEffect('gourd')]);   // hot&dry vs cold&moist
  ok(same > clash, 'reagents sharing a temperament are more coherent than clashing ones');
  ok(coherence([reagentEffect('sage')]) === 1 && coherence([]) === 0, 'a single live reagent is fully coherent; empty is 0');
  ok(gradeOf(0.9).grade === 'S' && gradeOf(0.3).grade === 'D' && gradeOf(0).grade === 'F', 'grade bands S→F');
}

// ── 7. prepare() — the game-ready preparation item ──
{
  // a coherent hot&dry draught (self-delivered) → a caustic attack payload
  const p = prepare(['rue', 'sage', 'wormwood'], 'draught');
  ok(p.ok && p.vessel === 'Draught' && p.phylum === 'draught', 'prepare yields a sustain-kingdom draught');
  ok(p.mechanics.use.deliver === 'self', 'a draught delivers to self');
  ok(p.mechanics.use.combat && ['attack', 'heal', 'buff', 'debuff'].includes(p.mechanics.use.combat.kind), 'the payload carries an arena-shaped combat effect');
  ok(p.mechanics.use.social && p.mechanics.use.social.anima, 'the payload carries a social effect drawing on an anima characteristic');
  ok(p.grade && p.coherence >= 0 && p.potency >= 3, 'the preparation is graded + potent from summed degrees');
}
{
  // a SALVE delivers to touch, range 1
  const s = prepare(['gourd', 'melon'], 'salve');   // both cold & moist → cooling heal
  ok(s.mechanics.use.deliver === 'touch' && s.mechanics.use.range === 1, 'a salve delivers by touch at range 1');
  ok(s.mechanics.use.combat.kind === 'heal' && s.mechanics.use.combat.amount > 0, 'a cold&moist salve heals');
}
{
  // SMOKE is a ranged AoE (magic)
  const smoke = prepare(['rue', 'sage'], 'smoke');
  ok(smoke.mechanics.use.deliver === 'range' && smoke.mechanics.use.combat.magic === true && smoke.mechanics.use.combat.radius === 1, 'incense/smoke is a ranged, magical AoE');
}
{
  // OIL is the lubricant/mechanical delivery — CHASSIS effect for android players
  const oil = prepare(['southernwood', 'fennel'], 'oil');   // Mercury/Venus → quicksilver/copper
  ok(oil.mechanics.use.lubricant && ['servo', 'frame', 'core'].includes(oil.mechanics.use.lubricant.chassis), 'an oil yields a lubricant effect on a chassis characteristic');
}
{
  // JUPITER largesse → a gifting bonus (the gift hook)
  const plants = CORRESPONDENCES.plants.filter((p) => p.planet === 'Jupiter').map((p) => p.slug);
  if (plants.length) {
    const gift = prepare(plants.slice(0, 2), 'tonic');
    ok(gift.mechanics.use.gift && gift.mechanics.use.gift.standing >= 1, 'a Jupiter (largesse) preparation carries a gifting/standing bonus');
  } else ok(true, '(no Jupiter herbs in the overlay — skipped)');
}
{
  // an all-non-live brew is food, not a preparation — reported honestly
  const food = prepare(['Zzyzx-root', 'nonesuch'], 'draught');
  ok(!food.ok && /food/.test(food.reason), 'a brew with no live reagents is honestly not a preparation');
}

console.log(`alch.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
