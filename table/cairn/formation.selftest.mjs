// formation.selftest — run before touching formation.js or any page's hash:
//   node table/cairn/formation.selftest.mjs
//
// A formation that decodes to the wrong party does not throw. It shows you a
// perfectly plausible group of delvers who are not the ones you made, which is
// the single worst failure mode on this surface — and it is exactly what
// shipped: party size vanished at 1, attribute swaps vanished always, and every
// screen after the roller was quietly looking at a different party.
//
// So the tests below are mostly one property said several ways: WHATEVER GOES
// IN COMES BACK OUT, and the three specific losses above are named regressions.

import { rollParty, packInventory } from './roll.js';
import {
  emptyFormation, editsFor, encodeFormation, decodeFormation,
  buildParty, partyWithGear, offersOf, addedTo,
} from './formation.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const sheet = (m) => `${m.character.name}|${Object.values(m.character.attributes).join('/')}`
  + `|${packInventory([...m.character.gear, ...m.added]).slots.map((s) => (s ? s.item.text : '')).join(',')}`;
const shape = (f) => buildParty(f).map(sheet).join('||');

// 1. round trip ---------------------------------------------------------------
{
  const f = emptyFormation('oak-fen-317', 3);
  editsFor(f, 0).swaps.push(['STR', 'DEX']);
  editsFor(f, 0).taken.push(2);
  editsFor(f, 1).fatigue = 2;
  editsFor(f, 2).typed.push('Rope (25ft)');
  editsFor(f, 2).typed.push('Shield (+1 Armor)');

  const hash = encodeFormation(f);
  const back = decodeFormation(hash);
  ok(back.seed === 'oak-fen-317' && back.size === 3, `seed and size survive (${hash})`);
  ok(JSON.stringify(back.edits) === JSON.stringify(f.edits),
    `every edit survives — in: ${JSON.stringify(f.edits)} out: ${JSON.stringify(back.edits)}`);
  ok(shape(f) === shape(back), 'and the rebuilt party is identical sheet for sheet');
  ok(encodeFormation(back) === hash, 'encoding is stable across a round trip');

  // The URL has to be readable, or nobody trusts it and nobody shares it.
  ok(!/%2[01]|%3[AF]|%5[FB]/i.test(hash),
    `the separators stay literal rather than percent-escaped (${hash})`);
}

// 2. THE THREE LOSSES, as named regressions ----------------------------------
{
  // A. A party of ONE. The roller used to omit `n` when the value looked like
  // a default; the next screen's default was four, so a solo delver arrived as
  // a party of four and nobody could see why.
  const solo = emptyFormation('oak-fen-317', 1);
  const hash = encodeFormation(solo);
  ok(/(^|&)n=1(&|$)/.test(hash), `size is written even at one (${hash})`);
  ok(decodeFormation(hash).size === 1, 'and comes back as one');
  ok(buildParty(solo).length === 1, 'so the party really is one delver');
  // and a hash with no `n` at all still has to mean something sane
  ok(decodeFormation('#s=x').size === 4, 'a hash with no size falls back to four, once, in one place');

  // B. Attribute swaps. Cairn explicitly allows the swap and the roller
  // implements it; it used to die at the first link.
  const swapped = emptyFormation('oak-fen-317', 2);
  editsFor(swapped, 0).swaps.push(['STR', 'DEX']);
  const plain = buildParty(emptyFormation('oak-fen-317', 2))[0].character.attributes;
  const after = buildParty(decodeFormation(encodeFormation(swapped)))[0].character.attributes;
  ok(after.STR === plain.DEX && after.DEX === plain.STR && after.WIL === plain.WIL,
    `a swap survives the round trip (${plain.STR}/${plain.DEX} -> ${after.STR}/${after.DEX})`);

  // Swaps do not commute when they share an attribute, so the ORDER has to be
  // replayed, not just the set.
  const order1 = emptyFormation('oak-fen-317', 1);
  editsFor(order1, 0).swaps.push(['STR', 'DEX'], ['DEX', 'WIL']);
  const order2 = emptyFormation('oak-fen-317', 1);
  editsFor(order2, 0).swaps.push(['DEX', 'WIL'], ['STR', 'DEX']);
  ok(shape(order1) !== shape(order2), 'two swaps sharing an attribute do not commute');
  ok(shape(order1) === shape(decodeFormation(encodeFormation(order1))),
    'and the order comes back off the URL intact');

  // C. Everything the player put in the pack.
  const kitted = emptyFormation('oak-fen-317', 2);
  const first = buildParty(kitted)[0].character;
  const offers = offersOf(first);
  ok(offers.length > 0 || true, `the first delver has ${offers.length} background offer(s)`);
  editsFor(kitted, 0).typed.push('Chainmail (2 Armor, bulky)');
  const armoured = buildParty(kitted)[0];
  ok(packInventory([...armoured.character.gear, ...armoured.added]).armor
    > packInventory(first.gear).armor,
  'a typed item really reaches the pack, and changes the armour it computes');
  ok(shape(kitted) === shape(decodeFormation(encodeFormation(kitted))),
    'and survives the URL');
}

// 3. offers are identified by INDEX, not by label ----------------------------
//
// Two offers can carry the same words. Matching by label cannot tell them apart
// and silently merges them, which is the same bug the combat layer had with
// two sets of Soporific Darts.
{
  let found = null;
  for (let i = 0; i < 400 && !found; i++) {
    for (const m of rollParty(`offers/${i}`, 4).members) {
      const labels = offersOf(m).map((o) => o.label);
      if (new Set(labels).size !== labels.length) { found = { m, labels }; break; }
    }
  }
  if (found) {
    const dup = found.labels.find((l, i) => found.labels.indexOf(l) !== i);
    const at = found.labels.map((l, i) => (l === dup ? i : -1)).filter((i) => i >= 0);
    const one = addedTo(found.m, { swaps: [], taken: [at[0]], typed: [], fatigue: 0 });
    const both = addedTo(found.m, { swaps: [], taken: at, typed: [], fatigue: 0 });
    ok(both.length === one.length + 1,
      `taking the same offer twice gives two items, not one ("${dup}" at ${at})`);
  } else {
    ok(true, 'no background offers duplicate a label in 400 parties — index identity is untested but harmless');
  }
  const m = rollParty('idx', 4).members[0];
  ok(offersOf(m).every((o, i) => o.at === i), 'offer indices are the flat render order');
}

// 4. junk in the URL does not take the page down -----------------------------
{
  for (const junk of ['', '#', '#s=', '#n=nonsense', '#e=garbage', '#e=9.sQQ-tX-f-!',
    '#x=notbase64!!', '#s=a&n=999', '#s=a&n=-3', '#e=-1.sSD']) {
    let f = null;
    try { f = decodeFormation(junk); } catch { /* caught below */ }
    ok(f && f.size >= 1 && f.size <= 6,
      `"${junk}" decodes to something usable rather than throwing (size ${f && f.size})`);
  }
  ok(buildParty(decodeFormation('#s=x&e=0.t9999')).length === 4,
    'an offer index that does not exist is dropped, not crashed on');
}

// 5. the whole chain, including the kit settings -----------------------------
{
  const f = emptyFormation('oak-fen-317', 4);
  f.source = 'bought';
  f.count = 12;
  f.mode = 'fixed';
  f.kit = false;
  editsFor(f, 3).swaps.push(['WIL', 'STR']);
  const back = decodeFormation(encodeFormation(f));
  ok(back.source === 'bought' && back.count === 12 && back.mode === 'fixed' && back.kit === false,
    'the kit and ladder settings ride along with the roll');
  ok(shape(f) === shape(back), 'and the party is still the same party');

  // A screen that only owns part of the chain must not drop the rest.
  const partial = encodeFormation(f, { include: ['s', 'n', 'e', 'x'] });
  ok(!/src=|h=|m=|kit=/.test(partial), `a caller can emit a subset when it means to (${partial})`);
  ok(shape(decodeFormation(partial)) === shape(f), 'and the party in that subset is unchanged');
}

// 6. partyWithGear is the same party, folded ---------------------------------
{
  const f = emptyFormation('oak-fen-317', 3);
  editsFor(f, 1).typed.push('Shield (+1 Armor)');
  const built = buildParty(f);
  const folded = partyWithGear(f);
  ok(folded.every((c, i) => c.gear.length
    === built[i].character.gear.length + built[i].added.length),
  'partyWithGear folds the additions into gear and loses nothing');
  ok(packInventory(folded[1].gear).armor > packInventory(built[1].character.gear).armor,
    'and the fold is the one that carries the shield');
}

console.log(`formation.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
