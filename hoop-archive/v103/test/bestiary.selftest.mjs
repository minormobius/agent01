// bestiary.selftest.mjs — the creep BODY PLANS + multi-opponent packs. A creep is rolled hostile crew
// (stats/loot); its SPRITE is either a humanoid scrapper or a bee SWARM (the two live plans). Pins that
// each plan builds a frame-renderable genome, the pick is deterministic, packs are 1–3 and deck-scaled,
// and stats stay intact.  node hoop/v103/test/bestiary.selftest.mjs

import { creepFor, creepPack, spoilsFor, CREEP_PLANS } from '../arena/encounter.js';
import { swarmFrame } from '../v3/swarm.js';
import { crewSprite, MORPH_KINDS } from '../crew.js';
import { frameRects, DIR_OF } from '../v3/sprite-core.js';

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

// ── 6. PERSON MORPHS: robot (grey skin, no hair, red eyes) + wraith (pale-blue skin, blue eyes) ──
ok(MORPH_KINDS.includes('robot') && MORPH_KINDS.includes('wraith'), 'crew morphs: robot + wraith');
{
  const norm = crewSprite('m1', 'make'), robot = crewSprite('m1', 'make', { morph: 'robot' }), wraith = crewSprite('m1', 'make', { morph: 'wraith' });
  ok(robot.ramps.skin[2] !== norm.ramps.skin[2] && /^hsl\(2\d\d /.test(robot.ramps.skin[2]), 'robot skin is grey (blue-hued, desaturated), not flesh');
  ok(robot.ramps.hair.join() === robot.ramps.skin.join(), 'robot has no hair (folded into the chassis skin ramp)');
  ok(robot.face.eyeColor === '#ef4034' && wraith.face.eyeColor === '#66d0ff', 'robot red eyes · wraith blue eyes');
  ok(/^hsl\(20\d /.test(wraith.ramps.skin[2]), 'wraith skin is pale blue');
  // the eye colour actually renders (front-facing view)
  const reyes = frameRects(robot, DIR_OF.S, 0).filter((c) => c.c === '#ef4034');
  ok(reyes.length >= 2, 'robot red eyes render as cells in the front view');
}
// humanoid creeps roll morphs; beasts never do
{
  const kinds = new Set();
  for (let c = 0; c < 60; c++) for (let r = 0; r < 30; r++) { const cr = creepFor(9, c, r, 1); if (cr.plan === 'humanoid') kinds.add(cr.morph || 'normal'); else ok(!cr.morph, 'a beast creep has no person-morph'); }
  ok(kinds.has('normal') && kinds.has('robot') && kinds.has('wraith'), 'humanoid creeps roll normal/robot/wraith: ' + [...kinds].join(','));
}

console.log(`\nbestiary.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
