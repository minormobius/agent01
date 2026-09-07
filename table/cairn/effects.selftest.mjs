// effects.selftest — run before touching effects.js, or the ability handling in
// combat.js:
//   node table/cairn/effects.selftest.mjs
//
// This layer is the easiest place in the project to fool yourself, because a
// mis-read ability produces a number that is wrong by an amount nobody can
// eyeball, and a mis-WIRED ability produces no number at all — it just quietly
// does nothing while the code around it looks correct. Both happened here:
//
//   THE SPELLBOOK THAT CAST NOTHING. Casting was implemented, the spell was
//   found on the character, and the toll did not move by a thousandth, because
//   `spent` was set on an array shared by every trial. One trial cast; 2,999
//   held a used-up book.
//
//   THE TROLL THAT COULD NOT REGENERATE. Monsters are marked dead the moment
//   they fail a critical damage save, and the revival check looks for a body
//   that is down but NOT dead — so the ability was unreachable and a troll
//   priced the same as a big bear.
//
// Hence the shape of what follows: every ability is checked for having a
// MEASURABLE effect on the fight, not merely for being parsed.

import { rollCharacter, rollParty, parseItem } from './roll.js';
import { BESTIARY } from './monsters.js';
import { ITEMS } from './items.js';
import {
  monsterAbilities, spellEffect, relicEffect, coverage,
  SPELL_EFFECTS, SPELLS_OUT_OF_SCOPE, EFFECT_KINDS, OUT_OF_SCOPE,
} from './effects.js';
import { assess, combatantFromCharacter, combatantFromMonster } from './combat.js';
import { basketToll, modelSees } from './study.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const party = (n, seed = 'fx') =>
  rollParty(seed, n).members.map((c) => combatantFromCharacter(c));
const group = (id, n) =>
  Array.from({ length: n }, (_, i) => combatantFromMonster(BESTIARY.find((m) => m.id === id), i));
const abilityKinds = (id) => monsterAbilities(BESTIARY.find((m) => m.id === id)).abilities.map((a) => a.kind);

// 1. the classifier reads what it claims ----------------------------------
{
  const c = coverage();
  ok(c.monsters.withModelledAbility >= 30,
    `${c.monsters.withModelledAbility} of ${c.monsters.total} creatures have a modelled ability`);
  // Reading all hundred (rather than grepping them) moved this from 9 to 16,
  // and put a reason next to 13 more that touch a fight but cannot be
  // simulated. What matters is that the great majority remain non-combat:
  // Cairn's magic is for getting into places, not for winning brawls.
  ok(c.spells.modelled >= 14, `${c.spells.modelled} of 100 spells are modelled`);
  ok(c.spells.excludedWithReason >= 10,
    `${c.spells.excludedWithReason} more are combat-adjacent and excluded WITH A STATED REASON`);
  ok(c.spells.modelled + c.spells.excludedWithReason < 40,
    'and the clear majority of the hundred are not combat magic at all');
  ok(c.relics.modelledBeyondStats >= 4, `${c.relics.modelledBeyondStats} relics do something beyond their stat line`);
  ok(Object.keys(c.abilityKinds).every((k) => EFFECT_KINDS.includes(k)),
    `every classified ability is in the vocabulary (${Object.keys(c.abilityKinds).join(', ')})`);
}
{
  // the SRD writes saves both ways round, and catching only one lost a third
  ok(abilityKinds('ghost').includes('disable'), 'a "save WIL or is possessed" is read (reversed order)');
  ok(abilityKinds('banshee').includes('disable'), 'and a "must make a WIL save or fall unconscious" is too');
  ok(abilityKinds('basilisk').includes('impairedAgainst') && abilityKinds('basilisk').includes('disable'),
    'the basilisk both wards off attacks and petrifies');
  ok(abilityKinds('owlbear').includes('sunder'), 'an owlbear destroys armour');
  ok(abilityKinds('grizzly-bear').includes('critBonus'), 'a grizzly bites for extra STR on a critical');
  ok(abilityKinds('troll').includes('regenerate'), 'a troll regenerates');
  ok(abilityKinds('goblin').length === 0, 'and a goblin is just a goblin');
  const lamia = monsterAbilities(BESTIARY.find((m) => m.id === 'lamia')).abilities[0];
  ok(lamia.attr === 'WIL', 'critical damage against WIL is read as WIL, not assumed to be STR');
}
{
  ok(spellEffect({ name: 'Spellbook: Sleep', spell: { name: 'Sleep' } }), 'Sleep is a combat spell');
  ok(!spellEffect({ name: 'Spellbook: Adhere', spell: { name: 'Adhere' } }), 'Adhere is not');
  ok(Object.keys(SPELL_EFFECTS).every((n) => ITEMS.spells.some((s) => s.name === n)),
    'every curated spell name exists in the SRD table — a typo here silently disables a spell');
  ok(Object.keys(SPELLS_OUT_OF_SCOPE).every((n) => ITEMS.spells.some((s) => s.name === n)),
    'and so does every spell we have written off');
  // Cairn sells a Shield and also has a Shield spell
  ok(!spellEffect(parseItem('Shield (+1 Armor)')), 'a wooden shield is not the Shield spell');
  ok(spellEffect({ ...parseItem('Spellbook: Shield'), spell: { name: 'Shield' } }), 'but the spellbook is');
  const named = ITEMS.relics.filter((r) => relicEffect(r));
  ok(named.some((r) => r.name === 'Jar of Ants'), 'the Jar of Ants is read (its stat block is in the notes)');
  ok(ITEMS.relics.filter((r) => relicEffect(r)).every((r) => relicEffect(r).kind),
    'every relic effect has a kind');
}

// 2. abilities change the fight, measurably -------------------------------
{
  const pcs = party(4, 'delta');
  const on = (id, n) => assess(pcs, group(id, n), { trials: 900, seed: 'd', abilities: true }).toll;
  const off = (id, n) => assess(pcs, group(id, n), { trials: 900, seed: 'd', abilities: false }).toll;

  ok(on('basilisk', 1) > off('basilisk', 1) + 0.05,
    `the basilisk's gaze and ward matter (${off('basilisk', 1).toFixed(3)} → ${on('basilisk', 1).toFixed(3)})`);
  ok(on('banshee', 1) > off('banshee', 1) + 0.05,
    `the banshee's wail matters (${off('banshee', 1).toFixed(3)} → ${on('banshee', 1).toFixed(3)})`);
  ok(on('troll', 1) > off('troll', 1) + 0.05,
    `the troll gets back up (${off('troll', 1).toFixed(3)} → ${on('troll', 1).toFixed(3)})`);
  ok(on('blink-dog', 4) > off('blink-dog', 4) + 0.05,
    `attacks against a blink dog are impaired (${off('blink-dog', 4).toFixed(3)} → ${on('blink-dog', 4).toFixed(3)})`);
  ok(on('pixie', 3) > 0,
    `the attackless pixie is no longer harmless (toll ${on('pixie', 3).toFixed(3)})`);
  ok(Math.abs(on('goblin', 5) - off('goblin', 5)) < 0.001,
    'and a creature with no abilities is completely unaffected by the switch');
}
{
  // the ward is conditional, and Cairn's own gear list contains the exception
  const plain = rollCharacter('silver/1');
  const withPlain = combatantFromCharacter(plain, [parseItem('Long Sword (d10)')]);
  const withSilver = combatantFromCharacter(plain, [parseItem('Silver Sword (d10)')]);
  const wolf = () => group('werewolf', 2);
  const a = assess([withPlain], wolf(), { trials: 800, seed: 'w' }).toll;
  const b = assess([withSilver], wolf(), { trials: 800, seed: 'w' }).toll;
  ok(b < a, `silver lifts the werewolf's ward (${a.toFixed(3)} with steel, ${b.toFixed(3)} with silver)`);
}

// 3. the party's own magic ------------------------------------------------
{
  const members = rollParty('cast', 4).members;
  const book = (name) => ({
    ...parseItem(`Spellbook: ${name}`), kind: 'spellbook', spell: ITEMS.spells.find((s) => s.name === name),
  });
  const withItem = (item) => members.map((c, i) => combatantFromCharacter(c, i === 0 ? [item] : []));
  const toll = (pcs) => assess(pcs, group('bandit', 4), { trials: 1200, seed: 'c' }).toll;

  const plain = toll(withItem(parseItem('Iron Pot')));
  const sleep = toll(withItem(book('Sleep')));
  const shield = toll(withItem(parseItem('Shield (+1 Armor)')));
  ok(sleep < plain - 0.02, `a Sleep spellbook removes a combatant and it shows (${plain.toFixed(3)} → ${sleep.toFixed(3)})`);
  ok(sleep < shield, `and for one slot it beats a shield (${sleep.toFixed(3)} vs ${shield.toFixed(3)})`);

  // THE BLEED TEST — the failure that made casting invisible. A spellbook is
  // spent once per FIGHT, never once per simulation.
  const short = assess(withItem(book('Sleep')), group('bandit', 4), { trials: 50, seed: 'c' }).toll;
  const long = assess(withItem(book('Sleep')), group('bandit', 4), { trials: 2000, seed: 'c' }).toll;
  ok(Math.abs(short - long) < 0.12,
    `50 and 2000 trials agree, so the book is not spent across trials (${short.toFixed(3)} vs ${long.toFixed(3)})`);
  ok(withItem(book('Sleep'))[0].spells.every((sp) => !sp.spent), 'a freshly built caster has an unspent book');

  // casting costs a slot, and the last slot costs 0 HP
  const loaded = Array.from({ length: 8 }, () => parseItem('Iron Pot'));
  const nearlyFull = combatantFromCharacter(members[0], [...loaded, book('Sleep')]);
  ok(nearlyFull.freeSlots >= 0, 'free slots are counted for the caster');
  ok(nearlyFull.spells.length === 1, 'and the book is still found in a heavy pack');
}
{
  // healing is modelled, and is honestly close to worthless in a fight
  const members = rollParty('heal', 4).members;
  const cure = { ...parseItem('Spellbook: Cure Wounds'), kind: 'spellbook', spell: { name: 'Cure Wounds' } };
  const withCure = members.map((c, i) => combatantFromCharacter(c, i === 0 ? [cure] : []));
  const plain = members.map((c, i) => combatantFromCharacter(c, i === 0 ? [parseItem('Iron Pot')] : []));
  const a = assess(plain, group('goblin', 5), { trials: 1200, seed: 'h' }).toll;
  const b = assess(withCure, group('goblin', 5), { trials: 1200, seed: 'h' }).toll;
  ok(Math.abs(a - b) < 0.05,
    `Cure Wounds barely moves a fight (${a.toFixed(3)} → ${b.toFixed(3)}) — STR loss means the save already failed`);
  ok(withCure[0].spells.some((sp) => sp.kind === 'heal'), 'but it is wired up, not skipped');
}

// 4. the study sees magic now ---------------------------------------------
{
  const pcs = party(4, 'basket');
  const on = basketToll(pcs, { trials: 400, abilities: true });
  const off = basketToll(pcs, { trials: 400, abilities: false });
  ok(on > off,
    `the study's basket is harder with abilities on (${off.toFixed(3)} → ${on.toFixed(3)}) — it used to build monsters by hand and lose them`);

  ok(modelSees({ ...parseItem('Spellbook: Sleep'), spell: { name: 'Sleep' } }), 'the study can see a Sleep book');
  ok(!modelSees({ ...parseItem('Spellbook: Adhere'), spell: { name: 'Adhere' } }), 'and knows it cannot see Adhere');
  const jar = ITEMS.relics.find((r) => r.name === 'Jar of Ants');
  ok(modelSees({ ...parseItem(jar.text), relic: jar }), 'and can see a relic with a curated effect');
}

// 5. nothing here broke determinism ---------------------------------------
{
  const pcs = party(4, 'det');
  const a = assess(pcs, group('basilisk', 1), { trials: 400, seed: 'same' });
  const b = assess(pcs, group('basilisk', 1), { trials: 400, seed: 'same' });
  ok(JSON.stringify(a) === JSON.stringify(b), 'ability-heavy fights are still reproducible');
  const foes = group('banshee', 1);
  assess(pcs, foes, { trials: 200, seed: 'x' });
  ok(foes[0].hp === BESTIARY.find((m) => m.id === 'banshee').hp, 'and the foes handed in are not left wounded');
}

console.log(`effects.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
