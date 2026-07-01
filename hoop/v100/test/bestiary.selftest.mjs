// bestiary.selftest.mjs — the creep BODY PLANS + multi-opponent packs. A creep is rolled hostile crew
// (stats/loot); its SPRITE is either a humanoid scrapper or a bee SWARM (the two live plans). Pins that
// each plan builds a frame-renderable genome, the pick is deterministic, packs are 1–3 and deck-scaled,
// and stats stay intact.  node hoop/v100/test/bestiary.selftest.mjs

import { creepFor, creepPack, spoilsFor, CREEP_PLANS } from '../arena/encounter.js';
import { swarmFrame } from '../v3/swarm.js';

const FRAME = { swarm: swarmFrame };   // the live beast plans (humanoid uses the crew sprite, no beast frame)
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── 1. the roster is exactly humanoid + swarm (the other plans are vendored but off) ──
ok(new Set(CREEP_PLANS).size === 2 && CREEP_PLANS.includes('humanoid') && CREEP_PLANS.includes('swarm'), 'roster is humanoid + swarm: ' + [...new Set(CREEP_PLANS)].join(','));

// ── 2. determinism: same (seed, chunk, room, deck) → identical creep ──
const a = creepFor(42, 7, 3, 1), b = creepFor(42, 7, 3, 1);
ok(a.plan === b.plan && a.name === b.name && a.sprite.seed === b.sprite.seed, 'creepFor is deterministic');
ok(a.combat && a.combat.hp > 0 && a.combat.atk > 0, 'creep carries a rolled-crew combat block');

// ── 3. both plans occur, and a swarm builds a renderable cloud genome ──
const seen = new Set();
for (let chunk = 0; chunk < 40; chunk++) for (let room = 0; room < 40; room++) {
  const cr = creepFor(9, chunk, room, 1);
  ok(CREEP_PLANS.includes(cr.plan), `plan '${cr.plan}' is on the roster`);
  seen.add(cr.plan);
  if (cr.plan === 'humanoid') { ok(cr.sprite.role && !cr.sprite.genome, 'humanoid → crew sprite {seed, role}, no prebuilt genome'); continue; }
  const g = cr.sprite.genome;
  ok(g && g._plan === 'swarm' && g.seed && g.w > 0 && g.h > 0, 'swarm: genome tagged _plan + grid dims + cache seed');
  const cells = swarmFrame(g, 0.25);
  ok(Array.isArray(cells) && cells.length > 20 && cells.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.c), 'swarm: frame renders a non-empty cloud of {x,y,c} cells');
}
ok(seen.has('humanoid') && seen.has('swarm'), 'both plans occur across the room space');

// ── 4. MULTI-OPPONENT packs: 1–3 foes (the solver counts the player's summon, so bigger fights certify),
//    unique ids, lead matches the room. Deeper decks bias larger + scale per-foe stats. ──
let sawTwo = false, sawThree = false;
for (let chunk = 0; chunk < 40; chunk++) for (let room = 0; room < 30; room++) {
  const pk = creepPack(5, chunk, room, 2);
  ok(pk.length >= 1 && pk.length <= 3, `pack size ${pk.length} in 1..3`);
  if (pk.length === 2) sawTwo = true; if (pk.length === 3) sawThree = true;
  ok(new Set(pk.map((f) => f.id)).size === pk.length, 'pack ids are unique');
  ok(pk[0].sprite.seed === creepFor(5, chunk, room, 2).sprite.seed, 'pack lead is the room’s canonical creep');
}
ok(sawTwo && sawThree, 'multi-opponent packs occur (2- and 3-foe fights fielded on deck 2)');
ok(creepPack(5, 0, 0, 0).length <= 2, 'deck 0 never fields a 3-foe pack (the third is deck ≥2)');

// ── 5. deck depth scales the fight; spoils untouched ──
const sh = creepFor(1, 2, 2, 0), dp = creepFor(1, 2, 2, 3);
ok(dp.combat.hp > sh.combat.hp && dp.level > sh.level, 'deeper decks scale hp + level');
const sp = spoilsFor(1, 2, 2, 1);
ok(sp.itemSeed >= 0 && sp.coins > 0, 'spoilsFor still yields an item seed + coins');

console.log(`\nbestiary.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
