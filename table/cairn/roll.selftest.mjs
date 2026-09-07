// roll.selftest — run before touching roll.js or regenerating data.js:
//   node table/cairn/roll.selftest.mjs
//
// Three classes of failure here are silent — the sheet still renders, it is
// just wrong — so they get the coverage:
//
//   THE STREAM SHIFT. Every draw comes off one seeded stream in a fixed order.
//   Insert a roll in the middle and every previously shared permalink now
//   produces a different character, with nothing to indicate it. The frozen
//   sheet below is the tripwire: if it fails, the format changed, and that is a
//   decision to make deliberately (and to bump in the URL), not a bug to patch.
//
//   THE SLOT MISCOUNT. Petty items cost nothing, bulky ones cost two, a cart
//   adds four. Get the parse wrong and a character is quietly encumbered or
//   quietly free — Cairn's whole resource game runs through this number.
//
//   THE OUT-OF-RANGE DRAW. d20 over a 20-row table is fine until the table has
//   a gap; every roll is checked against real data for all 20 backgrounds.

import { rollCharacter, rollParty, packInventory, parseItem, offeredItems, swapAttributes, makeRng, DATA } from './roll.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. the data survived the scrape ------------------------------------------
ok(DATA.backgrounds.length === 20, '20 backgrounds');
ok(DATA.bonds.length === 20 && DATA.omens.length === 20, 'd20 bonds and d20 omens');
ok(DATA.scars.length === 12, '12 scars (HP lost 1-12)');
for (const key of ['physique', 'skin', 'hair', 'face', 'speech', 'clothing', 'virtue', 'vice']) {
  ok(DATA.traits[key] && DATA.traits[key].length === 10, `trait table ${key} is d10`);
}
{
  const bad = DATA.backgrounds.filter(
    (b) => b.names.length !== 10 || b.gear.length < 6 || b.tables.length !== 2 ||
           b.tables.some((t) => t.entries.length !== 6),
  );
  ok(bad.length === 0, `every background has 10 names, gear, and two d6 tables (bad: ${bad.map((b) => b.id)})`);
}

// 2. determinism — the seed IS the character -------------------------------
{
  const a = rollCharacter('oak-fen-317');
  const b = rollCharacter('oak-fen-317');
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same seed returns the identical sheet');
  ok(JSON.stringify(rollCharacter('oak-fen-318')) !== JSON.stringify(a), 'a different seed returns a different sheet');
}

// 3. the frozen sheet — see THE STREAM SHIFT above -------------------------
{
  const c = rollCharacter('mino-mobi');
  const shape = {
    background: c.background.name,
    name: c.name,
    attributes: c.attributes,
    hp: c.hp,
    age: c.age,
    bond: c.bond.n,
    omen: c.omen.n,
    tables: c.background.tables.map((t) => t.roll),
    traits: Object.values(c.traits).map((t) => t.roll),
  };
  const frozen = {
    background: 'Greenwise',
    name: 'Moss',
    attributes: { STR: 13, DEX: 7, WIL: 9 },
    hp: 6,
    age: 14,
    bond: 17,
    omen: 10,
    tables: [2, 6],
    traits: [3, 8, 3, 3, 9, 10, 4, 5],
  };
  ok(JSON.stringify(shape) === JSON.stringify(frozen),
    `seed "mino-mobi" still rolls the frozen sheet\n     got:    ${JSON.stringify(shape)}\n     wanted: ${JSON.stringify(frozen)}`);

  // Both landing pages quote this seed by name as the example permalink, so a
  // stream change would leave the site telling visitors something untrue.
  // Change the copy in table/index.html and the root index.html together with
  // this line, or don't change either.
  const quoted = rollCharacter('oak-fen-317');
  ok(quoted.background.name === 'Kettlewright' && quoted.name === 'Berek',
    `seed "oak-fen-317" is Berek the Kettlewright, as the pages claim (got ${quoted.name} the ${quoted.background.name})`);
}

// 3b. nearby seeds must not roll the same character ------------------------
// A party seeds its members `seed/0`, `seed/1`, … Before makeRng mixed two hash
// words and warmed the stream, those near-identical strings shared an opening
// d20 and a party of four came out as four of the same background — a failure
// that looks like bad luck, not like a bug, which is why it gets a test.
{
  let collisions = 0;
  const spread = new Map();
  for (let i = 0; i < 2000; i++) {
    const a = rollCharacter(`p/${i}`).background.roll;
    const b = rollCharacter(`p/${i + 1}`).background.roll;
    if (a === b) collisions++;
    spread.set(a, (spread.get(a) || 0) + 1);
  }
  const rate = collisions / 2000;
  ok(rate < 0.08, `adjacent seeds collide at chance, not systematically (${(rate * 100).toFixed(1)}%, chance is 5%)`);
  ok(spread.size === 20, `all 20 backgrounds appear across 2000 adjacent seeds (${spread.size})`);
  ok(Math.min(...spread.values()) > 50, 'no background is starved by the seeding');

  // the same, at the scale it actually bit: parties
  let allSame = 0;
  for (let i = 0; i < 300; i++) {
    const names = new Set(rollParty(`party/${i}`, 4).members.map((m) => m.background.name));
    if (names.size === 1) allSame++;
  }
  ok(allSame === 0, `no party of four rolls four of the same background (${allSame} did)`);
}

// 4. every roll lands inside its table, for every background ---------------
{
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const c = rollCharacter(`sweep/${i}`);
    for (const k of ['STR', 'DEX', 'WIL']) if (c.attributes[k] < 3 || c.attributes[k] > 18) bad++;
    if (c.hp < 1 || c.hp > 6) bad++;
    if (c.age < 12 || c.age > 50) bad++;
    if (!c.bond || !c.omen) bad++;
    if (c.background.tables.some((t) => !t.text)) bad++;
    if (Object.values(c.traits).some((t) => !t.value)) bad++;
    if (c.gear.some((g) => !g.name)) bad++;
  }
  ok(bad === 0, `400 sweep characters are all in range (${bad} violations)`);
}
{
  // and force each background in turn, so no single one hides a bad table
  let bad = 0;
  for (let i = 0; i < DATA.backgrounds.length; i++) {
    const c = rollCharacter(`bg/${i}`, { backgroundIndex: i });
    if (c.background.id !== DATA.backgrounds[i].id) bad++;
    if (c.background.tables.length !== 2) bad++;
  }
  ok(bad === 0, 'each of the 20 backgrounds rolls a complete sheet when forced');
}
{
  // forcing a background must not shift the stream for anything after it
  const free = rollCharacter('anchor');
  const forced = rollCharacter('anchor', { backgroundIndex: 3 });
  ok(JSON.stringify(free.attributes) === JSON.stringify(forced.attributes) && free.age === forced.age,
    'forcing a background leaves the rest of the stream untouched');
}

// 5. inventory ---------------------------------------------------------------
{
  const petty = parseItem('Protective Gloves (*petty*)');
  ok(petty.slots === 0 && petty.petty, 'petty items cost no slots');
  const sword = parseItem('Long Sword (d10, *bulky*)');
  ok(sword.slots === 2 && sword.damage === 'd10', 'bulky weapon: two slots, d10');
  const twin = parseItem('Twin Daggers (d6+d6, *bulky*)');
  ok(twin.damage === 'd6+d6', 'paired weapons keep both dice');
  const mail = parseItem('Brigandine (1 Armor, *bulky*)');
  ok(mail.armor === 1 && mail.slots === 2, 'armour value and bulk read off the same line');
  const helm = parseItem('Candle Helmet (+1 Armor, dim, 6 uses)');
  ok(helm.armor === 1 && helm.slots === 1, '+1 Armor parses like 1 Armor');
  const cart = parseItem('Cart (+4 slots, *bulky* when pulled)');
  ok(cart.capacity === 4 && cart.slots === 2, 'a cart costs two slots and adds four');
  const book = parseItem('Spellbook (Thicket: A thicket of trees up to 50ft wide sprouts up.)');
  ok(book.damage === null, 'a spellbook is not a weapon');
  const coins = parseItem('42 Gold Pieces (*petty*)');
  ok(coins.slots === 0, 'a small purse is petty');
}
{
  const inv = packInventory([
    parseItem('Long Sword (d10, *bulky*)'),
    parseItem('Rations (3 uses)'),
    parseItem('Badge (*petty*)'),
  ]);
  ok(inv.used === 3 && inv.slots.length === 3, 'slots used counts bulk, not items');
  ok(inv.petty.length === 1 && inv.capacity === 10 && inv.free === 7, 'petty sits outside the ten slots');
  ok(!inv.full, 'three slots is not a full pack');

  const full = packInventory(Array.from({ length: 10 }, () => parseItem('Iron Pot')));
  ok(full.full && full.free === 0, 'ten slots is full — the character is at 0 HP by the rules');
  const overloaded = packInventory(Array.from({ length: 12 }, () => parseItem('Iron Pot')));
  ok(overloaded.over === 2, 'overflow past capacity is reported, not silently dropped');
  const carted = packInventory([parseItem('Cart (+4 slots, *bulky* when pulled)'),
    ...Array.from({ length: 11 }, () => parseItem('Iron Pot'))]);
  ok(carted.capacity === 14 && !carted.full, 'a cart raises capacity to 14');

  const armored = packInventory([parseItem('Brigandine (2 Armor, *bulky*)'),
    parseItem('Shield (+1 Armor)'), parseItem('Helm (+1 Armor)')]);
  ok(armored.armor === 3, 'armour is capped at 3');
}
{
  // no starting character should begin the game encumbered into unconsciousness
  let fullAtStart = 0;
  for (let i = 0; i < 200; i++) if (rollCharacter(`enc/${i}`).inventory.full) fullAtStart++;
  ok(fullAtStart === 0, `no starting character begins with a full pack (${fullAtStart} did)`);
}

// 5b. what a background result hands you -----------------------------------
{
  const offers = (t, body) => offeredItems(t, body).map((o) => o.label);
  ok(JSON.stringify(offers('Take an **Oilskin Coat** and **Mapping Paper**.')) ===
     JSON.stringify(['Oilskin Coat', 'Mapping Paper']), 'both named items are offered');
  ok(JSON.stringify(offers('Take a **Blunderbuss** (d12, blast, bulky) that takes one round to reload.')) ===
     JSON.stringify(['Blunderbuss (d12, blast, bulky)']), 'an item keeps its qualities, so it packs correctly');
  ok(offers('One **arm** is fully metal and comes off at the shoulder.').length === 0,
    'emphasis on an ordinary word is not an item');
  ok(offers('Add a **Fatigue** each time.').length === 0, 'Fatigue is a condition, not loot');
  ok(offers('**Recharge**: Wear the ring while in perfect health.').length === 0,
    'a rules keyword bolded in a relic clause is not loot');
  ok(JSON.stringify(offers('A **Blood Pail** (*bulky*) from a local death-cult.')) ===
     JSON.stringify(['Blood Pail (bulky)']), 'qualities lose their markup on the way to a label');
  // nothing offered anywhere in the real tables still carries markdown
  {
    let marked = 0;
    for (const b of DATA.backgrounds) {
      for (const t of b.tables) {
        for (const e of t.entries) {
          for (const o of offeredItems(e.title, e.text)) {
            if (o.label.includes('*')) marked++;
          }
        }
      }
    }
    ok(marked === 0, `no offered label leaks markdown across all 240 table entries (${marked} did)`);
  }
  ok(JSON.stringify(offers('**Pullstones**', 'Two jet-black stones.')) === JSON.stringify(['Pullstones']),
    'an item named in a three-column table\'s own cell is offered');
  ok(offers('', '**Falconry**. You keep a falcon [3 hp, 5 STR].').length === 0,
    'a bold heading that opens an entry is a label, not an item');
  ok(offers('', '**Tough** or **Perilous** terrain are one step easier.').length === 0,
    'difficulty terms are not items');
  ok(JSON.stringify(offers('', 'It has your same **Attributes** and **HP**, and carries a **Bone Charm**.')) ===
     JSON.stringify(['Bone Charm']), 'rules terms are skipped but real gear beside them is not');
  ok(offers('', 'Take **Rope** and more **Rope**').length === 1, 'the same item is not offered twice');
  // and it holds against real data: every offer parses into something packable
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    for (const t of rollCharacter(`offer/${i}`).background.tables) {
      for (const o of t.offers) {
        const item = parseItem(o.label);
        if (!item.name || item.slots > 2) bad++;
      }
    }
  }
  ok(bad === 0, `every offered item across 200 characters packs into 0-2 slots (${bad} did not)`);
}

// 6. party -------------------------------------------------------------------
{
  const p = rollParty('camp', 4);
  ok(p.members.length === 4, 'a party of four');
  ok(p.members.filter((m) => m.readsOmen).length === 1, 'exactly one character reads the omen');
  const youngest = Math.min(...p.members.map((m) => m.age));
  ok(p.members[p.youngest].age === youngest, 'the omen goes to the youngest');
  const solo = rollCharacter('camp/2');
  ok(solo.name === p.members[2].name && solo.age === p.members[2].age &&
     JSON.stringify(solo.attributes) === JSON.stringify(p.members[2].attributes),
  'a party member is reproducible from their own seed alone');
}

// 6b. the one edit the rules allow ------------------------------------------
{
  const c = rollCharacter('swap-me');
  const s = swapAttributes(c, 'STR', 'WIL');
  ok(s.attributes.STR === c.attributes.WIL && s.attributes.WIL === c.attributes.STR, 'swapping two attributes exchanges them');
  ok(s.attributes.DEX === c.attributes.DEX, 'the third attribute is untouched');
  ok(c.attributes.STR !== undefined && JSON.stringify(rollCharacter('swap-me').attributes) === JSON.stringify(c.attributes),
    'swapping does not mutate the rolled character');
}

// 7. the roll log is the sheet's receipt -------------------------------------
{
  const c = rollCharacter('receipt');
  const labels = c.log.map((l) => l.label);
  ok(labels[0] === 'Background' && labels[1] === 'Name', 'the log opens with background and name');
  ok(labels.includes('STR') && labels.includes('Age') && labels.includes('Omen'), 'the log covers the whole sheet');
  const str = c.log.find((l) => l.label === 'STR');
  ok(str.rolls.length === 3 && str.rolls.reduce((a, b) => a + b, 0) === str.total, '3d6 logs its three dice');
  const age = c.log.find((l) => l.label === 'Age');
  ok(age.notation === '2d20+10' && age.total === c.age, 'age logs 2d20+10');
}

// 8. the dice themselves are fair enough to trust ----------------------------
{
  const rng = makeRng('fairness');
  const counts = new Array(20).fill(0);
  for (let i = 0; i < 20000; i++) counts[rng.d(20) - 1]++;
  const min = Math.min(...counts), max = Math.max(...counts);
  ok(min > 800 && max < 1200, `d20 is roughly flat over 20k rolls (min ${min}, max ${max})`);
  const three = makeRng('bell');
  let sum = 0;
  for (let i = 0; i < 20000; i++) sum += three.dice(3, 6);
  const mean = sum / 20000;
  ok(Math.abs(mean - 10.5) < 0.15, `3d6 means 10.5 (got ${mean.toFixed(3)})`);
}

console.log(`roll.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
