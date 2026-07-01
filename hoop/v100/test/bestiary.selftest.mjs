// bestiary.selftest.mjs — the creep BODY PLANS: a creep is still rolled hostile crew (stats/loot), but
// its sprite may now be a beast (poly/quad/axial/isopod) drawn by the vendored Sprite Lab kernels. Pins
// that every plan builds a frame-renderable genome, the pick is deterministic, and stats stay intact.
//   node hoop/v100/test/bestiary.selftest.mjs

import { creepFor, spoilsFor, CREEP_PLANS } from '../arena/encounter.js';
import { polyFrame } from '../v3/poly.js';
import { quadFrame } from '../v3/quad.js';
import { axialFrame } from '../v3/axial.js';
import { isopodFrame } from '../v3/isopod.js';

const FRAME = { poly: polyFrame, quad: (g, t) => quadFrame(g, t, true), axial: axialFrame, isopod: isopodFrame };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── 1. determinism: same (seed, chunk, room, deck) → identical creep sprite + plan + name ──
const a = creepFor(42, 7, 3, 1), b = creepFor(42, 7, 3, 1);
ok(a.plan === b.plan && a.name === b.name && a.sprite.seed === b.sprite.seed, 'creepFor is deterministic (plan/name/sprite seed)');
ok(a.combat && a.combat.hp > 0 && a.combat.atk > 0, 'creep still carries a rolled-crew combat block');

// ── 2. every plan appears across the room space, and each beast builds a renderable genome ──
const seen = new Set();
for (let chunk = 0; chunk < 40; chunk++) for (let room = 0; room < 40; room++) {
  const cr = creepFor(9, chunk, room, 1);
  ok(CREEP_PLANS.includes(cr.plan), `plan '${cr.plan}' is a known body plan`);
  seen.add(cr.plan);
  if (cr.plan === 'humanoid') { ok(cr.sprite.role && !cr.sprite.genome, 'humanoid creep → crew sprite {seed, role}, no prebuilt genome'); continue; }
  const g = cr.sprite.genome;
  ok(g && g._plan === cr.plan && g.seed && g.w > 0 && g.h > 0, `${cr.plan}: genome tagged _plan + has grid dims + a cache seed`);
  const cells = FRAME[cr.plan](g, 0.25);
  ok(Array.isArray(cells) && cells.length > 20 && cells.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.c), `${cr.plan}: frame renders non-empty {x,y,c} cells`);
}
ok(CREEP_PLANS.every((p) => seen.has(p)), 'all five body plans occur across the room space: ' + [...seen].sort().join(','));

// ── 3. deck depth still scales the fight (deeper bites harder), independent of plan ──
const shallow = creepFor(1, 2, 2, 0), deep = creepFor(1, 2, 2, 3);
ok(deep.combat.hp > shallow.combat.hp && deep.level > shallow.level, 'deeper decks scale hp + level');

// ── 4. spoils untouched ──
const sp = spoilsFor(1, 2, 2, 1);
ok(sp.itemSeed >= 0 && sp.coins > 0, 'spoilsFor still yields an item seed + coins');

console.log(`\nbestiary.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
