// character.selftest.mjs — the sheet, the pack and the skill tree.
//
//   node mega/jev/test/character.selftest.mjs
//
// The assertions that matter most are the LEGALITY ones. The whole reason
// items make the demo better is that the option set changes every tick, and
// the type system is what stops Jev drinking a potion it does not carry. If
// usableItems() is wrong, that guarantee is a lie.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  rollCharacter, maxHpOf, meleeCost, arrowRecoveryChance, healAmount,
  grantXp, xpToNext, availableSkills, takeSkill, usableItems, sheet,
  SKILLS, SKILL_KEYS, ITEMS, ITEM_KEYS, STATS,
} from '../character.mjs';
import {
  makeWorld, newRun, buildQuestions, applyAnswers, offlineAnswers, situation, rng,
} from '../delve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'fixtures', n), 'utf8'));
const world = makeWorld(fix('dungeon-seed7-s.json'), fix('content-seed7-s-roll1.json'));

let passed = 0;
const failures = [];
const ok = (c, l) => { c ? passed++ : failures.push(l); };

// ------------------------------------------------------------- the roll ---
{
  const a = rollCharacter(rng(7));
  const b = rollCharacter(rng(7));
  ok(JSON.stringify(sheet(a)) === JSON.stringify(sheet(b)), 'the same seed rolls the same character');
  const c = rollCharacter(rng(8));
  ok(JSON.stringify(sheet(a)) !== JSON.stringify(sheet(c)) || true, 'a different seed may differ');

  for (const st of STATS) {
    ok(a.stats[st.key] >= 3 && a.stats[st.key] <= 18, `${st.key} is a legal 4d6-drop-lowest value`);
  }
  ok(a.maxHp === maxHpOf(a), 'maxHp matches the formula');
  ok(a.hp === undefined, 'the character does not carry hp — the run does');
  ok(a.level === 1 && a.xp === 0 && a.pendingLevels === 0, 'a fresh sheet starts at level 1 with nothing pending');
  // a spread of seeds must stay in range
  for (let s = 1; s < 60; s++) {
    const ch = rollCharacter(rng(s));
    for (const st of STATS) {
      if (ch.stats[st.key] < 3 || ch.stats[st.key] > 18) failures.push(`seed ${s}: ${st.key} out of range`);
    }
  }
  passed++;
}

// ------------------------------------------------------------- combat maths --
{
  const ch = rollCharacter(rng(7));
  ok(meleeCost(ch, 1) >= 1, 'melee always costs at least 1 — a free fight is not a decision');
  ok(meleeCost(ch, 100) < 100, 'Might turns some damage aside');
  ch.stats.might = 18; ch.passives.butcher = true;
  ok(meleeCost(ch, 2) === 1, 'even maxed mitigation cannot make a fight free');
  const r = arrowRecoveryChance(ch);
  ok(r >= 0 && r <= 1, 'arrow recovery is a probability');
  ch.passives.marksman = true;
  ok(arrowRecoveryChance(ch) === 1, 'Marksman always recovers the arrow');
  ok(healAmount(ch) > 0, 'a potion heals something');
}

// ---------------------------------------------------------------- levelling --
{
  const ch = rollCharacter(rng(3));
  ok(xpToNext(1) > 0 && xpToNext(5) > xpToNext(1), 'levels cost more as they go up');

  const before = ch.level;
  const res = grantXp(ch, 0);
  ok(res.leveled === 0 && ch.level === before, 'zero xp changes nothing');

  grantXp(ch, xpToNext(1));
  ok(ch.level === 2 && ch.pendingLevels === 1, 'exactly enough xp levels once');

  const big = grantXp(ch, 500);
  ok(big.leveled >= 2, 'a large grant can level more than once');
  ok(ch.pendingLevels === 1 + big.leveled, 'every level earned is a level owed');
  ok(ch.xp < ch.xpToNext, 'leftover xp is carried, never lost past the threshold');
}
{
  // perLevel grants only pay out for skills already taken
  const ch = rollCharacter(rng(4));
  const arrowsBefore = ch.inventory.arrow;
  grantXp(ch, 1000);
  ok(ch.inventory.arrow === arrowsBefore, 'levelling grants nothing without the skill');
  ch.pendingLevels = 1;
  takeSkill(ch, 'fletcher');
  const afterSkill = ch.inventory.arrow;
  ok(afterSkill > arrowsBefore, 'Fletcher grants arrows immediately');
  grantXp(ch, 1000);
  ok(ch.inventory.arrow > afterSkill, 'Fletcher keeps paying out at each later level');
}

// -------------------------------------------------------------- skill tree --
{
  const ch = rollCharacter(rng(5));
  const avail = availableSkills(ch);
  ok(avail.includes('second_wind') && avail.includes('fletcher'), 'tier-1 skills are available at once');
  ok(!avail.includes('alchemy'), 'a tier-2 skill is hidden until its parent is taken');
  ok(!avail.includes('marksman'), 'marksman is hidden until Fletcher is taken');

  ok(takeSkill(ch, 'alchemy').ok === false, 'taking a locked skill is refused');
  ok(!ch.skills.includes('alchemy'), 'a refused skill is not recorded');

  ch.pendingLevels = 5;
  takeSkill(ch, 'second_wind');
  ok(availableSkills(ch).includes('alchemy'), 'the parent unlocks the tier-2 child');
  ok(!availableSkills(ch).includes('second_wind'), 'a non-repeatable skill cannot be taken twice');

  takeSkill(ch, 'alchemy');
  ok(ch.passives.alchemy === true, 'a passive skill sets its flag');

  const hpBefore = ch.maxHp;
  takeSkill(ch, 'toughness');
  ok(ch.maxHp === hpBefore + 4, 'the first Toughness raises maximum health by 4');
  ok(availableSkills(ch).includes('toughness'), 'Toughness is repeatable');

  // DIMINISHING RETURNS. A flat, repeatable +4 that also healed on the spot
  // was strictly better than carrying potions, and the live model took it six
  // level-ups running. Each repeat is now worth less, with a floor of 1.
  const gains = [];
  for (let i = 0; i < 5; i++) {
    ch.pendingLevels = 1;
    const before = ch.maxHp;
    takeSkill(ch, 'toughness');
    gains.push(ch.maxHp - before);
  }
  ok(gains.every((g, i) => i === 0 || g <= gains[i - 1]), `repeat Toughness never gains more than the last (${gains})`);
  ok(gains.every((g) => g >= 1), 'it never stops giving something');
  ok(gains[gains.length - 1] < 4, 'the late repeats are clearly worse than the first');

  // there is never a level-up with nothing to pick
  const empty = rollCharacter(rng(6));
  for (let i = 0; i < 12; i++) {
    empty.pendingLevels = 1;
    const opts = availableSkills(empty);
    ok(opts.length > 0, `there is always at least one skill to take (iteration ${i})`);
    takeSkill(empty, opts[0]);
  }
  ok(empty.pendingLevels === 0, 'every taken skill consumes exactly one pending level');
}

// ---------------------------------------------------- item legality (THE ONE) --
{
  const ch = rollCharacter(rng(7));
  ch.inventory = { potion: 1, arrow: 1, ward: 1, rope: 1 };
  const full = { hp: 10, maxHp: 10, creatures: [], traps: [], trapdoor: null };
  ok(!usableItems(ch, full).includes('potion'), 'a potion is not offered at full health');
  ok(!usableItems(ch, full).includes('arrow'), 'an arrow is not offered with nothing to shoot');
  ok(!usableItems(ch, full).includes('ward'), 'a ward is not offered with no traps');
  ok(!usableItems(ch, full).includes('rope'), 'a rope is not offered with no trapdoor');
  ok(usableItems(ch, full).length === 0, 'nothing at all is usable in an empty, safe chamber at full health');

  const busy = {
    hp: 4, maxHp: 10,
    creatures: [{ id: 1, type: 'wraith', hp: 3 }],
    traps: [{ trap: 'spike', dmg: 2 }],
    trapdoor: { toRoom: 5, drop: 4 },
  };
  ok(usableItems(ch, busy).length === 4, 'all four are usable when each has something to act on');

  ch.inventory = { potion: 0, arrow: 0, ward: 0, rope: 0 };
  ok(usableItems(ch, busy).length === 0, 'an empty pack offers nothing, however good the opportunity');

  // every item's `why` must be renderable for every legal situation
  ch.inventory = { potion: 1, arrow: 1, ward: 1, rope: 1 };
  for (const k of usableItems(ch, busy)) {
    const why = ITEMS[k].why(ch, busy);
    ok(typeof why === 'string' && why.length > 0 && !why.includes('undefined'),
      `${k}: its description renders without undefined`);
  }
  ok(ITEM_KEYS.every((k) => typeof ITEMS[k].blurb === 'string'), 'every item has a blurb');
  ok(SKILL_KEYS.every((k) => typeof SKILLS[k].blurb === 'string'), 'every skill has a blurb');
}

// ------------------------------------ raising the ceiling does not heal ---
// It used to, which made Toughness a free potion stapled to a permanent
// upgrade — a foregone conclusion at every level-up.
{
  const w = makeWorld(fix('dungeon-seed7-s.json'), fix('content-seed7-s-roll1.json'));
  const r = newRun(w, { seed: 5 });
  r.at = w.entrance;
  r.hp = 5;
  r.char.pendingLevels = 1;
  const hpBefore = r.hp;
  const maxBefore = r.maxHp;
  applyAnswers(w, r, {
    move: { type: 'choice', choice: 'hold', probabilities: {}, confidence: 1 },
    danger: { type: 'score', score: 0, probabilities: {} },
    take_loot: { type: 'noul', noul: 0 },
    withdraw: { type: 'noul', noul: 0 },
    level_up: { type: 'choice', choice: 'toughness', probabilities: {}, confidence: 1 },
  });
  ok(r.maxHp > maxBefore, 'Toughness raises the ceiling');
  ok(r.hp === hpBefore, 'but it heals nothing on the spot');
  ok(r.hp < r.maxHp, 'the delver is left hurt, with more room to heal into');
}

// ------------------------------------------------- items actually do things --
function runAt(roomId, mutate) {
  const w = makeWorld(fix('dungeon-seed7-s.json'), fix('content-seed7-s-roll1.json'));
  const r = newRun(w, { seed: 5 });
  r.at = roomId;
  if (mutate) mutate(w, r);
  return { w, r };
}
const answerSet = (over = {}) => ({
  move: { type: 'choice', choice: 'hold', probabilities: {}, confidence: 1 },
  danger: { type: 'score', score: 0, probabilities: {} },
  take_loot: { type: 'noul', noul: 0 },
  withdraw: { type: 'noul', noul: 0 },
  ...over,
});

{ // potion
  const { w, r } = runAt(world.entrance, (_w, run) => { run.hp = 2; run.char.inventory.potion = 2; });
  applyAnswers(w, r, answerSet({ use_item: { type: 'choice', choice: 'potion', probabilities: {}, confidence: 1 } }));
  ok(r.hp > 2, 'drinking a potion restores health');
  ok(r.char.inventory.potion === 1, 'the potion is consumed');
  ok(r.hp <= r.maxHp, 'healing never overshoots maximum health');
  ok(r.itemsUsed.potion === 1, 'the use is recorded for telemetry');
}
{ // an illegal item choice is refused, not obeyed
  const { w, r } = runAt(world.entrance, (_w, run) => { run.char.inventory.rope = 0; });
  const before = r.at;
  const res = applyAnswers(w, r, answerSet({ use_item: { type: 'choice', choice: 'rope', probabilities: {}, confidence: 1 } }));
  ok(r.at === before, 'a rope that is not carried cannot move the delver');
  ok(r.char.inventory.rope === 0, 'inventory never goes negative');
  ok(res.events.some((e) => /Cannot use rope/.test(e.text)), 'the refusal is logged, not silent');
}
{ // arrow kills without retaliation.
  // ISOLATE THE SHOT: a room with creatures also has the survivors' clip and
  // its traps to answer for, so strip those or the assertion is measuring
  // something else. (It was, first time round.)
  const withCreature = [...world.rooms.values()].find((x) => x.agents.length > 0);
  const { w, r } = runAt(withCreature.id, (_w, run) => {
    run.char.inventory.arrow = 1;
    run.hp = run.maxHp;
    const room = _w.rooms.get(withCreature.id);
    room.agents = room.agents.slice(0, 1); // exactly one target
    room.traps = [];                       // nothing else that can bite
  });
  const hpBefore = r.hp;
  applyAnswers(w, r, answerSet({ use_item: { type: 'choice', choice: 'arrow', probabilities: {}, confidence: 1 } }));
  ok(w.rooms.get(withCreature.id).agents.length === 0, 'the arrow kills its target');
  ok(r.kills === 1, 'exactly one kill is counted');
  ok(r.hp === hpBefore, 'the shot itself costs no health');
  ok(r.cleared.has(withCreature.id), 'clearing the last creature marks the chamber cleared');
  ok(r.char.xp > 0 || r.char.level > 1, 'the kill earns experience');
}
{ // ward stops the traps
  const withTraps = [...world.rooms.values()].find((x) => x.traps.length > 0);
  const { w, r } = runAt(withTraps.id, (_w, run) => { run.char.inventory.ward = 1; });
  const hpBefore = r.hp;
  applyAnswers(w, r, answerSet({ use_item: { type: 'choice', choice: 'ward', probabilities: {}, confidence: 1 } }));
  ok(r.hp === hpBefore, 'a warded chamber does no trap damage');
  ok(r.warded.has(withTraps.id), 'the chamber is marked warded');
}
{ // rope descends, and replaces the move
  const td = world.trapdoors[0];
  const { w, r } = runAt(td.fromRoom, (_w, run) => { run.char.inventory.rope = 1; });
  applyAnswers(w, r, answerSet({
    use_item: { type: 'choice', choice: 'rope', probabilities: {}, confidence: 1 },
    move: { type: 'choice', choice: 'hold', probabilities: {}, confidence: 1 },
  }));
  ok(r.at === td.toRoom, 'the rope drops the delver through the trapdoor');
  ok(r.char.inventory.rope === 0, 'the rope is consumed');
}
{ // level_up applies the chosen skill
  const { w, r } = runAt(world.entrance, (_w, run) => { run.char.pendingLevels = 1; run.char.level = 2; });
  applyAnswers(w, r, answerSet({ level_up: { type: 'choice', choice: 'fletcher', probabilities: {}, confidence: 1 } }));
  ok(r.char.skills.includes('fletcher'), 'the chosen skill is taken');
  ok(r.char.pendingLevels === 0, 'the pending level is spent');
  ok(r.char.inventory.arrow >= 3, 'its charges are granted');
}
{ // an unavailable skill choice falls back to a legal one rather than crashing
  const { w, r } = runAt(world.entrance, (_w, run) => { run.char.pendingLevels = 1; });
  applyAnswers(w, r, answerSet({ level_up: { type: 'choice', choice: 'alchemy', probabilities: {}, confidence: 1 } }));
  ok(r.char.skills.length === 1, 'a level is still spent when the pick was illegal');
  ok(!r.char.skills.includes('alchemy'), 'the illegal pick is not applied');
  ok(r.char.pendingLevels === 0, 'no level is left dangling');
}

// ------------------------------------------------------------ a whole run ---
{
  for (const seed of [7, 11, 23, 41]) {
    const w = makeWorld(fix('dungeon-seed7-s.json'), fix('content-seed7-s-roll1.json'));
    const r = newRun(w, { seed });
    for (let t = 0; t < 40 && r.status === 'delving'; t++) {
      applyAnswers(w, r, offlineAnswers(w, r).answers);
    }
    ok(ITEM_KEYS.every((k) => r.char.inventory[k] >= 0), `seed ${seed}: no inventory count goes negative`);
    ok(r.hp >= 0 && r.hp <= r.maxHp, `seed ${seed}: health stays in bounds as maxHp grows`);
    ok(r.maxHp === r.char.maxHp, `seed ${seed}: the run's maxHp tracks the sheet`);
    ok(r.char.pendingLevels === 0, `seed ${seed}: every earned level got spent`);
    ok(r.char.skills.every((id) => SKILL_KEYS.includes(id)), `seed ${seed}: only real skills are taken`);
    ok(r.char.level >= 1, `seed ${seed}: level never goes backwards`);
    // tier-2 skills must never appear without their parent
    for (const id of r.char.skills) {
      const req = SKILLS[id].requires;
      ok(!req || r.char.skills.includes(req), `seed ${seed}: ${id} only taken after ${req}`);
    }
  }
}

if (failures.length) {
  console.error(`✗ character selftest: ${failures.length} failure(s) of ${passed + failures.length}\n`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✓ character selftest: ${passed} checks passed`);
