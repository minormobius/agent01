// delve.selftest — run before touching delve.js, study.js or items.js:
//   node table/cairn/delve.selftest.mjs
//
// The delve model is where this project is most likely to fool itself, because
// its output looks reasonable however wrong it is: a veteran with better gear
// and more HP "looks right" whether the loot rules were applied or silently
// skipped. Three things get watched:
//
//   THE SLOT CAP IS THE WHOLE GAME. Cairn's ten slots are what make item-based
//   magic a choice rather than a shopping list, and a full pack drops you to
//   0 HP. A model that lets delvers fill or exceed their pack has deleted the
//   constraint it exists to study — the first version did exactly that.
//
//   ADVANCEMENT MUST SATURATE, NOT RUN AWAY. Power comes from carried objects
//   and carrying is capped, so a tenth delve must be worth much less than a
//   first. If this ever goes linear, the loot or carrying rule has broken.
//
//   THE MEASUREMENT MUST BE PAIRED. Item value is a difference of two
//   simulations, and both use the same seeds, so an item the model cannot see
//   scores EXACTLY zero instead of drifting near it. That exactness is what
//   lets a weak-but-real item be told apart from noise.

import { rollCharacter, rollParty, packInventory, parseItem } from './roll.js';
import { ITEMS } from './items.js';
import { delve, delveParty, delveSummary, rollLoot, tryCarry, itemUtility, applyScar } from './delve.js';
import { basketToll, itemValue, studyItems, modelSees, slotCurve, BASKET } from './study.js';
import { combatantFromCharacter, assess } from './combat.js';
import { makeRng } from './roll.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// 1. the item data --------------------------------------------------------
ok(ITEMS.relics.length >= 40, `${ITEMS.relics.length} relics`);
ok(ITEMS.spells.length === 100, `${ITEMS.spells.length} spells (a d100 table)`);
ok(ITEMS.market.weapons.length >= 12, `${ITEMS.market.weapons.length} weapons, split out of the shop's families`);
{
  const w = ITEMS.market.weapons.map((x) => parseItem(x.text));
  ok(w.every((x) => x.damage), 'every weapon has a damage die');
  ok(w.some((x) => x.bulky), 'and some are bulky');
  const a = ITEMS.market.armor.map((x) => parseItem(x.text));
  ok(a.every((x) => x.armor >= 1), 'every piece of armour has an armour value');
  ok(ITEMS.relics.every((r) => r.name && !r.name.includes('(')), 'relic names are clean of their qualities');
  ok(ITEMS.spells.every((s) => s.name && !s.name.includes('*')), 'spell names are clean of markdown');
}

// 2. the slot cap holds ---------------------------------------------------
{
  let full = 0, over = 0, worst = 0;
  for (let i = 0; i < 300; i++) {
    const v = delve(rollCharacter(`slot/${i}`), 8);
    const inv = packInventory(v.gear);
    if (inv.full) full++;
    if (inv.used > inv.capacity) over++;
    worst = Math.max(worst, inv.used - inv.capacity);
  }
  ok(full === 0, `no delver ever fills their pack — that is 0 HP by the rules (${full} did)`);
  ok(over === 0, `and none exceeds capacity (${over} did, worst by ${worst})`);
}
{
  // the reserved slot is deliberate and provable: allow zero reserve and packs fill
  let fullWithoutReserve = 0;
  for (let i = 0; i < 200; i++) {
    if (packInventory(delve(rollCharacter(`res/${i}`), 8, { reserve: 0 }).gear).full) fullWithoutReserve++;
  }
  ok(fullWithoutReserve > 20,
    `the reserve is what prevents it — without it ${fullWithoutReserve}/200 pack themselves unconscious`);
}

// 3. advancement climbs, then saturates -----------------------------------
{
  const at = (n) => {
    const out = { hp: [], armor: [], die: [], slots: [], left: [] };
    for (let i = 0; i < 200; i++) {
      const c = rollCharacter(`adv/${i}`);
      const s = delveSummary(c, delve(c, n));
      out.hp.push(s.hp[1]); out.armor.push(s.armor[1]);
      out.die.push(s.bestWeapon[1]); out.slots.push(s.slots[1]); out.left.push(s.leftBehind);
    }
    return { hp: mean(out.hp), armor: mean(out.armor), die: mean(out.die), slots: mean(out.slots), left: mean(out.left) };
  };
  const [d0, d1, d3, d10] = [at(0), at(1), at(3), at(10)];
  ok(d0.hp < d1.hp && d1.hp < d3.hp && d3.hp < d10.hp, `HP climbs (${d0.hp.toFixed(1)} → ${d10.hp.toFixed(1)})`);
  ok(d0.armor < d3.armor && d0.die < d3.die, 'armour and weapons improve');
  ok((d10.hp - d3.hp) / 7 < (d3.hp - d0.hp) / 3, 'the curve flattens — a tenth delve is worth less than a third');
  ok(d10.slots - d3.slots < 0.5, `carrying saturates: ${d3.slots.toFixed(1)} slots at three delves, ${d10.slots.toFixed(1)} at ten`);
  ok(d10.left > d3.left * 2,
    `so late delves are about what to LEAVE (${d3.left.toFixed(1)} items abandoned by delve 3, ${d10.left.toFixed(1)} by delve 10)`);
}

// 4. carrying decisions are not arbitrary ---------------------------------
{
  const gear = [parseItem('Iron Pot'), parseItem('Rope (25ft)'), parseItem('Chalk (*petty*)')];
  const packed = [...gear, ...Array.from({ length: 7 }, () => parseItem('Iron Pot'))];
  const before = packInventory(packed).used;
  const plate = { ...parseItem('Plate (3 Armor, *bulky*)'), kind: 'armor' };
  const { kept, dropped } = tryCarry(packed, plate);
  ok(kept && dropped, `a full pack still takes plate armour, by dropping something (dropped ${dropped && dropped.name})`);
  ok(packInventory(packed).used <= 9, `and stays inside the reserve (${before} → ${packInventory(packed).used})`);

  const junk = { ...parseItem('Card Deck'), kind: 'gear' };
  const full = Array.from({ length: 9 }, () => parseItem('Chainmail (2 Armor, *bulky*)'));
  ok(!tryCarry(full, junk).kept, 'but it does not drop armour for a deck of cards');

  ok(itemUtility(parseItem('Chalk (*petty*)')) === Infinity, 'petty items are never dropped — they are free');
  ok(itemUtility(parseItem('Plate (3 Armor, *bulky*)')) > itemUtility(parseItem('Iron Pot')), 'plate beats a pot');
  ok(itemUtility(parseItem('Shield (+1 Armor)')) > itemUtility(parseItem('Brigandine (1 Armor, *bulky*)')),
    'and per slot, a shield beats brigandine — same armour, half the space');
}

// 5. loot is a mix, and every piece of it is carryable ---------------------
{
  const rng = makeRng('loot');
  const kinds = {};
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const item = rollLoot(rng);
    kinds[item.kind] = (kinds[item.kind] || 0) + 1;
    if (!item.name || item.slots > 2 || item.slots < 0) bad++;
  }
  ok(bad === 0, `2000 pieces of loot all pack into 0-2 slots (${bad} did not)`);
  ok(Object.keys(kinds).length === 6, `all six kinds appear (${Object.keys(kinds).join(', ')})`);
  ok(kinds.consumable > 0, 'including the bombs and flasks, which are the sharpest thing a delve can find');
  ok(kinds.gear > kinds.relic, 'and the mundane outnumbers the magical, which is what makes slots hurt');
}

// 6. determinism ----------------------------------------------------------
{
  const c = rollCharacter('det');
  ok(JSON.stringify(delve(c, 5)) === JSON.stringify(delve(c, 5)), 'a delve is reproducible');
  ok(JSON.stringify(delve(c, 5)) !== JSON.stringify(delve(c, 6)), 'and six delves differ from five');
  const fresh = rollCharacter('det');
  delve(fresh, 5);
  ok(fresh.gear.length === rollCharacter('det').gear.length, 'delving does not mutate the character it was handed');
  const p = delveParty(rollParty('party', 3).members, 4);
  ok(p.length === 3 && p.every((m) => m.delves === 4), 'a party delves together');
  ok(new Set(p.map((m) => JSON.stringify(m.found))).size > 1, 'and they do not all find the same things');
}

// 7. the study measures what it claims ------------------------------------
{
  const members = rollParty('study', 4).members;
  const base = basketToll(members.map((c) => combatantFromCharacter(c)), { trials: 200 });
  ok(base > 0 && base < 1, `the basket costs something but not everything (toll ${base.toFixed(3)})`);
  ok(basketToll(members.map((c) => combatantFromCharacter(c)), { trials: 200 }) === base,
    'and the same party always gets the same basket toll');

  const shield = { ...parseItem('Shield (+1 Armor)'), kind: 'armor' };
  const pot = { ...parseItem('Iron Pot'), kind: 'gear' };
  const v = itemValue(members, shield, { trials: 200 });
  const nothing = itemValue(members, pot, { trials: 200 });
  ok(v.averted > 0, `a shield averts toll (${v.averted.toFixed(4)})`);
  ok(v.best >= v.averted, 'and is worth more to the right holder than to a random one');
  ok(Math.abs(nothing.averted) < 0.005, `an iron pot averts nothing (${nothing.averted.toFixed(4)})`);

  // THE PAIRING TEST. Both runs share seeds, so an item the model cannot see
  // measures EXACTLY zero rather than drifting around it. That exactness is the
  // point: it means any non-zero reading is a real effect, however small, and
  // the ranking never confuses noise with a weak item. (Unpaired, the same
  // comparison wobbles by a few ten-thousandths — small next to a shield's
  // 0.03, but the same size as the difference between two mediocre relics.)
  ok(nothing.averted === 0, `an item the model cannot see measures exactly 0 (${nothing.averted})`);
  const unpaired = Math.abs(
    basketToll(members.map((c) => combatantFromCharacter(c)), { trials: 200, seed: 'a' })
    - basketToll(members.map((c) => combatantFromCharacter(c)), { trials: 200, seed: 'b' }));
  ok(unpaired > 0, `and unpaired runs do wobble (${unpaired.toFixed(5)}), which is what pairing removes`);

  const plate = { ...parseItem('Plate (3 Armor, *bulky*)'), kind: 'armor' };
  ok(itemValue(members, plate, { trials: 200 }).averted > v.averted, 'plate averts more than a shield');
  ok(modelSees(plate) && !modelSees(parseItem('Wraith Lantern')),
    'and the study knows which items it can actually see');
}
{
  // the ranking is stable enough to publish
  const members = rollParty('rank', 4).members;
  const ranked = studyItems(members, { trials: 150 });
  ok(ranked.length > 50, `${ranked.length} items scored`);
  ok(ranked[0].perSlot >= ranked[ranked.length - 1].perSlot ||
     ranked[ranked.length - 1].perSlot === null, 'sorted by value per slot');
  // Before the simulator could read a spellbook, armour owned the top of this
  // table. It no longer does: removing a combatant outright beats soaking his
  // hits, so the five combat spells sit above every piece of armour, and the
  // first weapon does not appear until well down the list. The assertion is
  // written against that ORDER rather than a count, so it keeps meaning
  // something if the numbers move.
  // The ordering, not the numbers — this is the shape of Cairn's economy of
  // slots as the model measures it, and it has been rearranged twice already:
  // once when spellbooks became readable, and again when one-use bombs stopped
  // being infinite. A bomb is a d12 across the whole room for one slot and one
  // throw, and nothing else in the game competes with that.
  const rank = (pred) => ranked.findIndex((r) => pred(r.item));
  const bomb = rank((i) => i.kind === 'consumable' && i.blast);
  const spell = rank((i) => i.kind === 'spellbook');
  const armour = rank((i) => i.armor);
  const weapon = rank((i) => i.kind === 'weapon');
  ok(bomb === 0, `a blast bomb is the single best thing per slot in the game (rank ${bomb + 1})`);
  ok(armour < weapon, `armour beats plain weapons (ranks ${armour + 1} vs ${weapon + 1})`);
  ok(spell < weapon, `and so does a combat spellbook (ranks ${spell + 1} vs ${weapon + 1})`);
  ok(ranked.slice(0, 8).every((r) => r.item.kind !== 'weapon'),
    'no ordinary weapon reaches the top eight');
}

// 8. the slot curve shows the cost of a full pack -------------------------
{
  const members = rollParty('curve', 3).members;
  const curve = slotCurve(members, { ...parseItem('Shield (+1 Armor)'), kind: 'armor' }, { trials: 150 });
  ok(curve.length === 7, 'the curve covers zero to six slots of ballast');
  ok(curve[0].before < curve[curve.length - 1].before,
    `a loaded party fares worse before any item is added (${curve[0].before.toFixed(3)} → ${curve[curve.length - 1].before.toFixed(3)})`);
  // the cliff: the slot that fills the pack costs 0 HP by the rules, so the
  // last one is not merely worth less than the first, it is catastrophic
  const jumps = curve.slice(1).map((c, i) => c.before - curve[i].before);
  ok(Math.max(...jumps) > 0.05,
    `and there is a cliff, not a slope — the worst single slot costs ${Math.max(...jumps).toFixed(3)} toll`);
}

console.log(`delve.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
