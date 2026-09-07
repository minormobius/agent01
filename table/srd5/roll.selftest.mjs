// roll.selftest — run before touching roll.js or regenerating data.js:
//   node table/srd5/roll.selftest.mjs
//
// Two failures this file exists to make loud, both of which look like nothing:
//
//   THE PERMALINK SILENTLY MOVING. Every sheet is a pure function of a seed,
//   and every draw comes off one stream in a fixed order. Insert a draw
//   anywhere but the end and every seed ever shared now rolls a different
//   person — with no error, no warning, and a perfectly plausible character on
//   screen. One sheet is frozen below, field by field, as the tripwire.
//
//   A DERIVED NUMBER DRIFTING FROM ITS INPUTS. A sheet that prints AC 16 next
//   to Half Plate and Dexterity 12 is either right or subtly wrong, and nobody
//   can tell by looking. So every derivation is recomputed here from the parts
//   the sheet itself displays, across the whole space of characters rather
//   than one example.
//
// This work includes material from the System Reference Document 5.2.1
// ("SRD 5.2.1") by Wizards of the Coast LLC, available at
// https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
// Commons Attribution 4.0 International License, available at
// https://creativecommons.org/licenses/by/4.0/legalcode.

import {
  rollCharacter, rollParty, rollBalancedParty, partyBalance, ROLES,
  meetsPrerequisite, canMulticlassInto, casterLevel,
  modifier, proficiencyBonus, armorClass, ABILITIES,
} from './roll.js';
import { CLASSES, SPECIES, BACKGROUNDS, SKILLS, WEAPONS, ARMOR } from './data.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const many = (n, level = 1) =>
  Array.from({ length: n }, (_, i) => rollCharacter(`sweep/${i}`, { level }));

// ---------------------------------------------------------------------------
// 1. the data the roller stands on
// ---------------------------------------------------------------------------
{
  ok(Object.keys(CLASSES).length === 12, `12 classes (${Object.keys(CLASSES).length})`);
  ok(SPECIES.length === 9, `9 species (${SPECIES.length})`);
  ok(SKILLS.length === 18, `18 skills (${SKILLS.length})`);
  ok(WEAPONS.length > 30, `${WEAPONS.length} weapons`);
  ok(ARMOR.length === 13, `13 armours including the shield (${ARMOR.length})`);

  // FOUR. Not a parse failure — the SRD publishes four backgrounds where the
  // full game has many, and the page must say so rather than imply otherwise.
  ok(BACKGROUNDS.length === 4, `the SRD's 4 backgrounds (${BACKGROUNDS.length})`);
  ok(BACKGROUNDS.every((b) => b.abilities.length === 3 && b.skills.length === 2 && b.feat),
    'each background gives three abilities, two skills and a feat');

  // A class that cannot pick skills would silently produce a blank sheet.
  for (const [name, k] of Object.entries(CLASSES)) {
    ok(k.skills && k.skills.choose >= 2, `${name} chooses at least two skills`);
    ok(Array.isArray(k.saves) && k.saves.length === 2, `${name} has two saving throws`);
    ok([6, 8, 10, 12].includes(k.hitDie), `${name} has a real hit die (d${k.hitDie})`);
    // "2 of 1" is impossible, and is what a mis-parsed Bard produced.
    ok(k.skills.from === 'any' || k.skills.from.length >= k.skills.choose,
      `${name} can actually pick ${k.skills.choose} from its list`);
  }
}

// ---------------------------------------------------------------------------
// 2. the frozen sheet — the permalink tripwire
// ---------------------------------------------------------------------------
{
  const c = rollCharacter('oak-fen-317/0');
  const got = [c.species.name, c.background.name, c.klass.name,
    ABILITIES.map((a) => c.scores[a]).join('/'), c.ac, c.hp,
    c.attacks[0].name].join(' | ');
  const want = 'Dragonborn | Criminal | Bard | 9/11/15/7/10/14 | 12 | 10 | Greatclub';
  ok(got === want,
    `the frozen sheet is unchanged\n      want: ${want}\n      got:  ${got}\n` +
    '      If this is the only failure you have reordered the dice, and every\n' +
    '      permalink ever shared now rolls a different person.');
}

// ---------------------------------------------------------------------------
// 3. determinism, and seeds that do NOT correlate
// ---------------------------------------------------------------------------
{
  const a = JSON.stringify(rollCharacter('same'));
  ok(a === JSON.stringify(rollCharacter('same')), 'the same seed rolls the same character');
  ok(a !== JSON.stringify(rollCharacter('other')), 'and a different seed does not');

  // The bug this inherits from Cairn: `seed/0`, `seed/1`, … are near-identical
  // strings, and a weak PRNG turns them into near-identical characters. Measure
  // it rather than trust it — with 12 classes, two members of a party of four
  // share a class about 43% of the time by chance (six pairs, 1/12 each).
  let sameClass = 0, sameEverything = 0;
  const trials = 400;
  for (let i = 0; i < trials; i++) {
    const p = rollParty(`party/${i}`, 4).members;
    const classes = p.map((m) => m.klass.name);
    if (new Set(classes).size < 4) sameClass++;
    if (new Set(p.map((m) => `${m.klass.name}/${m.species.name}/${m.background.name}`)).size < 4) {
      sameEverything++;
    }
  }
  const rate = sameClass / trials;
  ok(rate > 0.28 && rate < 0.58,
    `duplicate classes in a party of four happen at chance, not always or never (${(rate * 100).toFixed(0)}%)`);
  ok(sameEverything / trials < 0.25,
    `two identical origins in one party stay rare (${(sameEverything / trials * 100).toFixed(0)}%)`);
}

// ---------------------------------------------------------------------------
// 4. every derived number follows from its inputs
// ---------------------------------------------------------------------------
{
  const sheets = [...many(220, 1), ...many(60, 5), ...many(60, 11), ...many(40, 20)];

  ok(sheets.every((c) => c.proficiencyBonus === proficiencyBonus(c.level)),
    'proficiency bonus follows from level');
  ok(sheets.every((c) => ABILITIES.every((a) => c.mods[a] === modifier(c.scores[a]))),
    'every modifier follows from its score');
  ok(sheets.every((c) => c.ac === armorClass(c.scores, c.worn, c.shield).ac),
    'AC is exactly what the armour rule computes');
  ok(sheets.every((c) => c.initiative === c.mods.Dex), 'initiative is the Dexterity modifier');

  // Saves and skills: proficiency adds exactly the proficiency bonus.
  const saveWrong = sheets.filter((c) => c.saves.some((s) =>
    s.mod !== c.mods[s.ability] + (s.proficient ? c.proficiencyBonus : 0)));
  ok(saveWrong.length === 0, `every save modifier is ability + proficiency (${saveWrong.length} wrong)`);
  const skillWrong = sheets.filter((c) => c.skills.some((s) =>
    s.mod !== c.mods[s.ability] + (s.proficient ? c.proficiencyBonus : 0)));
  ok(skillWrong.length === 0, `every skill modifier is ability + proficiency (${skillWrong.length} wrong)`);
  ok(sheets.every((c) => c.saves.filter((s) => s.proficient).length === 2),
    'exactly two saving throws are proficient');

  // Passive Perception is 10 + the Perception modifier, and nothing else.
  ok(sheets.every((c) => c.passivePerception
    === 10 + c.skills.find((s) => s.name === 'Perception').mod),
  'passive Perception is 10 + the Perception skill');

  // Spell save DC = 8 + PB + ability; the attack bonus is the same without 8.
  const casters = sheets.filter((c) => c.casting);
  ok(casters.length > 50, `${casters.length} casters in the sweep`);
  ok(casters.every((c) => c.casting.saveDc === 8 + c.proficiencyBonus + c.mods[c.casting.ability]),
    'every spell save DC is 8 + proficiency + ability');
  ok(casters.every((c) => c.casting.attack === c.casting.saveDc - 8),
    'and the spell attack bonus is that minus eight');
  ok(sheets.filter((c) => !c.casting).every((c) => ['Barbarian', 'Fighter', 'Monk', 'Rogue']
    .includes(c.klass.name)), 'only the four non-casting classes lack spellcasting');

  // Hit points: the whole die at level 1, and the log has to add up to the total.
  ok(sheets.every((c) => {
    const fromLog = c.hpLog.reduce((n, e) => n + e.gained, 0) + (c.tough ? c.level : 0);
    return fromLog === c.hp;
  }), 'the hit-point log adds up to the hit points printed');
  ok(sheets.filter((c) => c.level === 1).every((c) =>
    c.hp === c.klass.hitDie + c.mods.Con + (c.tough ? 1 : 0)),
  'at level 1 hit points are the whole hit die plus Constitution');
  ok(sheets.every((c) => c.hpLog.length === c.level), 'one hit-point entry per level');
  ok(sheets.every((c) => c.hpLog.every((e) => e.gained >= 1)), 'a level never grants less than 1 HP');

  // Attacks: the modifier used must be the one the finesse rule allows.
  const attackWrong = sheets.flatMap((c) => c.attacks
    .filter((a) => a.attack !== c.mods[a.ability] + c.proficiencyBonus)
    .map((a) => `${c.klass.name}/${a.name}`));
  ok(attackWrong.length === 0, `every attack bonus is ability + proficiency (${attackWrong.slice(0, 3)})`);
}

// ---------------------------------------------------------------------------
// 5. the choices the roller makes on the player's behalf are sane
// ---------------------------------------------------------------------------
{
  const sheets = many(300);

  // Nobody wears armour their class cannot use, and nobody carries a martial
  // weapon without martial training — the two easiest ways to produce an
  // illegal sheet that still renders.
  const badArmour = sheets.filter((c) => {
    if (!c.worn) return false;
    const suit = ARMOR.find((a) => a.name === c.worn);
    return !new RegExp(suit.category, 'i').test(String(c.klass.armor || ''));
  });
  ok(badArmour.length === 0,
    `nobody wears armour they are untrained in (${badArmour.slice(0, 3).map((c) => `${c.klass.name}:${c.worn}`)})`);
  const badWeapon = sheets.filter((c) => c.attacks.some((a) => {
    const w = WEAPONS.find((x) => x.name === a.name);
    return w && w.martial && !/Martial/i.test(String(c.klass.weapons || ''));
  }));
  ok(badWeapon.length === 0,
    `nobody swings a martial weapon untrained (${badWeapon.slice(0, 3).map((c) => c.klass.name)})`);
  ok(sheets.every((c) => !(c.shield && c.attacks[0] && /Two-Handed/.test(c.attacks[0].properties.join()))),
    'nobody holds a shield and a two-handed weapon');

  // Skills come from the background and the class, with no duplicates.
  const dupSkills = sheets.filter((c) => new Set(c.proficient).size !== c.proficient.length);
  ok(dupSkills.length === 0, `no skill is chosen twice (${dupSkills.length})`);
  ok(sheets.every((c) => c.backgroundSkills.every((s) => c.proficient.includes(s))),
    "the background's two skills are always granted");
  ok(sheets.every((c) => c.classSkills.length === c.klass.skills.choose),
    'the class picks exactly as many skills as it may');
  ok(sheets.every((c) => c.proficient.every((s) => SKILLS.some((k) => k.name === s))),
    'every skill on a sheet is a real skill');

  // The whole space is reachable: a roller that can only produce five of the
  // twelve classes is broken in a way no single sheet reveals.
  ok(new Set(sheets.map((c) => c.klass.name)).size === 12, 'all twelve classes get rolled');
  ok(new Set(sheets.map((c) => c.species.name)).size === 9, 'all nine species get rolled');
  ok(new Set(sheets.map((c) => c.background.name)).size === 4, 'all four backgrounds get rolled');

  // The background's increases: +2 and +1, on abilities it actually lists.
  ok(sheets.every((c) => c.applied.length === 2), 'each background applies two increases');
  ok(sheets.every((c) => c.applied.every((t) => c.background.abilities.includes(t.split(' ')[0]))),
    'and only to abilities that background lists');
  ok(sheets.every((c) => ABILITIES.every((a) => c.scores[a] >= 3 && c.scores[a] <= 20)),
    'no score escapes 3..20');
}

// ---------------------------------------------------------------------------
// 6. levelling up actually changes something
// ---------------------------------------------------------------------------
{
  const at = (lvl) => rollCharacter('ladder', { level: lvl });
  const [l1, l5, l20] = [at(1), at(5), at(20)];
  ok(l1.hp < l5.hp && l5.hp < l20.hp, `hit points climb (${l1.hp} < ${l5.hp} < ${l20.hp})`);
  ok(l1.proficiencyBonus === 2 && l5.proficiencyBonus === 3 && l20.proficiencyBonus === 6,
    `proficiency bonus is +2/+3/+6 at 1/5/20 (${l1.proficiencyBonus}/${l5.proficiencyBonus}/${l20.proficiencyBonus})`);
  ok(l20.features.length > l1.features.length,
    `a level 20 sheet carries more features (${l1.features.length} -> ${l20.features.length})`);
  ok(l1.features.every((f) => f.level === 1), 'a level 1 sheet carries only level 1 features');
  ok(l20.features.every((f) => f.level <= 20), 'and no feature arrives from beyond level 20');
  // Same seed, same person — only the level differs.
  ok(l1.klass.name === l20.klass.name && l1.species.name === l20.species.name,
    'levelling does not reroll who the character is');

  const p = rollParty('band', 5, { level: 3 });
  ok(p.members.length === 5 && p.members.every((m) => m.level === 3), 'a party rolls at one level');
}

// ---------------------------------------------------------------------------
// 7. the path — how a level 10 got to be a level 10
// ---------------------------------------------------------------------------
{
  const c = rollCharacter('path', { level: 12 });
  ok(c.path.length === 12, `one path entry per level (${c.path.length})`);
  ok(c.path.every((e, i) => e.level === i + 1), 'the path is in level order with no gaps');
  ok(c.path.every((e) => e.hp.gained >= 1), 'every level grants at least 1 HP');
  ok(c.path[0].hp.whole === true, 'level 1 takes the hit die whole');
  ok(c.path.slice(1).every((e) => !e.hp.whole), 'and every level after it rolls');

  // The sheet's numbers have to BE the path's numbers, not a parallel sum.
  const fromPath = c.path.reduce((n, e) => n + e.hp.gained, 0) + (c.tough ? c.level : 0);
  ok(fromPath === c.hp, `hit points are the path's total (${fromPath} vs ${c.hp})`);
  ok(c.hpLog.length === c.path.length, 'the hit-point log is the path');

  // Decisions, and the roads not taken — a path with no alternatives is a list.
  const asis = c.path.flatMap((e) => e.decisions.filter((d) => d.kind === 'asi'));
  ok(asis.length === (c.klass.asiLevels || []).filter((l) => l <= 12).length,
    `every ability score improvement the class gets by level 12 appears (${asis.length})`);
  ok(asis.every((d) => d.chose && d.alternatives.length > 0),
    'each improvement records what was taken AND what was not');
  const sub = c.path.flatMap((e) => e.decisions.filter((d) => d.kind === 'subclass'));
  ok(sub.length === 1 && sub[0].note, 'the subclass fork appears once, and says the SRD has only one');

  // Fighters get six improvements in twenty levels and Wizards four — if this
  // ever reads the same for both, the ASI levels stopped being parsed per class.
  const lvls = (n) => (CLASSES[n].asiLevels || []).length;
  ok(lvls('Fighter') > lvls('Wizard'), `a Fighter gets more improvements than a Wizard (${lvls('Fighter')} vs ${lvls('Wizard')})`);

  // Same seed, same path.
  ok(JSON.stringify(rollCharacter('path', { level: 12 }).path) === JSON.stringify(c.path),
    'the path is deterministic');
  // A shorter character is a prefix of the longer one: level 5 is how the
  // level 12 got to level 5, not a different history.
  const five = rollCharacter('path', { level: 5 });
  ok(JSON.stringify(five.path) === JSON.stringify(c.path.slice(0, 5)),
    'a level 5 sheet is the first five levels of the level 12 sheet');
}

// ---------------------------------------------------------------------------
// 8. multiclassing, which the SRD does publish
// ---------------------------------------------------------------------------
{
  // "you must have a score of at least 13 in the primary ability of the new
  //  class and your current classes" — and "Strength or Dexterity" means
  //  either, while "Dexterity and Wisdom" means both.
  const lo = { Str: 8, Dex: 8, Con: 8, Int: 8, Wis: 8, Cha: 8 };
  const dexOnly = { ...lo, Dex: 15 };
  ok(!meetsPrerequisite(lo, CLASSES.Fighter), 'nobody qualifies on eights');
  ok(meetsPrerequisite(dexOnly, CLASSES.Fighter),
    'a Fighter needs Strength OR Dexterity, and Dexterity alone is enough');
  ok(!meetsPrerequisite(dexOnly, CLASSES.Monk),
    'a Monk needs Dexterity AND Wisdom, so Dexterity alone is not');
  ok(meetsPrerequisite({ ...dexOnly, Wis: 13 }, CLASSES.Monk), 'and with both, it is');

  // the prerequisite runs BOTH ways — you must still qualify for what you are
  const barb = { ...lo, Str: 16, Wis: 16 };
  ok(canMulticlassInto(barb, ['Barbarian'], CLASSES.Druid),
    "the SRD's own example: a Barbarian with Strength 16 and Wisdom 16 may take Druid");
  ok(!canMulticlassInto({ ...lo, Wis: 16 }, ['Barbarian'], CLASSES.Druid),
    'but not with Wisdom alone — the Barbarian half still has to qualify');

  // Spell slots: full casters count fully, Paladin and Ranger at half rounded
  // up, and the Warlock is NOT in that list because Pact Magic is separate.
  ok(casterLevel({ Wizard: 5 }) === 5, 'a Wizard 5 is caster level 5');
  ok(casterLevel({ Paladin: 5 }) === 3, 'a Paladin 5 is caster level 3 (half, rounded up)');
  ok(casterLevel({ Wizard: 4, Ranger: 3 }) === 6, 'and they add: Wizard 4 + Ranger 3 = 6');
  ok(casterLevel({ Warlock: 9 }) === 0,
    'a Warlock contributes nothing — the SRD counts Pact Magic separately');
  ok(casterLevel({ Fighter: 20 }) === 0, 'and a Fighter contributes nothing at all');

  // A multiclassed character is legal, adds up, and keeps its FIRST class's
  // saving throws — multiclassing grants only some proficiencies, and saves
  // are not among them.
  let multied = 0;
  for (let i = 0; i < 60; i++) {
    const m = rollCharacter(`mc/${i}`, { level: 12, multiclass: true });
    const names = Object.keys(m.classLevels);
    if (names.length > 1) multied++;
    const total = Object.values(m.classLevels).reduce((a, b) => a + b, 0);
    ok(total === 12, `class levels sum to the character level (${total})`);
    ok(m.proficiencyBonus === proficiencyBonus(12),
      'proficiency bonus comes from total level, not class level');
    ok(m.saves.filter((s) => s.proficient).length === 2,
      'still exactly two proficient saves after multiclassing');
    // every class taken was one the character qualified for
    ok(names.every((n) => meetsPrerequisite(m.scores, CLASSES[n]))
      || names.length === 1, `every class taken met its prerequisite (${names})`);
  }
  ok(multied > 5, `multiclassing actually happens when asked for (${multied} of 60)`);
  const pure = Array.from({ length: 30 }, (_, i) => rollCharacter(`mc/${i}`, { level: 12 }));
  ok(pure.every((m) => Object.keys(m.classLevels).length === 1),
    'and never happens when it is not asked for');
}

// ---------------------------------------------------------------------------
// 9. balance — and whether searching for it buys anything
// ---------------------------------------------------------------------------
{
  const b = partyBalance(rollParty('bal', 4).members);
  ok(ABILITIES.every((a) => Array.isArray(b.saves[a])), 'every save is accounted for');
  ok(b.savesCovered.length + b.savesMissing.length === 6, 'covered and missing add to six');
  ok(b.skillsCovered.length + b.skillsMissing.length === 18, 'and the skills add to eighteen');
  ok(ROLES.every((r) => r.why && r.test), 'every role says what evidence defines it');

  // THE CLAIM, MEASURED. A role theory that cannot be shown to change anything
  // is decoration. A random party of four has a real hole most of the time;
  // searching forty candidates removes it. If these numbers ever converge, the
  // balanced mode has stopped doing anything and should be removed.
  const N = 40;
  let plainBig = 0, searchBig = 0, plainRole = 0, searchRole = 0;
  let plainScore = 0, searchScore = 0;
  for (let i = 0; i < N; i++) {
    const seed = `bcmp/${i}`;
    const plain = partyBalance(rollParty(seed, 4).members);
    const found = rollBalancedParty(seed, 4);
    if (plain.bigThreeMissing.length) plainBig++;
    if (found.balance.bigThreeMissing.length) searchBig++;
    if (plain.rolesMissing.length) plainRole++;
    if (found.balance.rolesMissing.length) searchRole++;
    plainScore += plain.score;
    searchScore += found.balance.score;
  }
  ok(plainBig / N > 0.35,
    `a rolled party of four usually has a hole in Dex/Con/Wis (${(plainBig / N * 100).toFixed(0)}%) — ` +
    'if this drops, the metric has stopped discriminating');
  ok(searchBig < plainBig / 3,
    `searching removes most of them (${(searchBig / N * 100).toFixed(0)}% vs ${(plainBig / N * 100).toFixed(0)}%)`);
  ok(searchRole <= plainRole, `and does not make role coverage worse (${searchRole} vs ${plainRole})`);
  ok(searchScore / N > plainScore / N + 2,
    `the searched party scores meaningfully higher (${(searchScore / N).toFixed(2)} vs ${(plainScore / N).toFixed(2)})`);

  // and it is still a permalink
  const a1 = rollBalancedParty('fixed', 4);
  const a2 = rollBalancedParty('fixed', 4);
  ok(a1.members.map((m) => m.klass.name).join() === a2.members.map((m) => m.klass.name).join(),
    'the balanced party is deterministic — the seed still decides');
  ok(a1.plainScore !== undefined && a1.tries === 40,
    'and it reports what an unsearched party would have scored, so the search is visible');
}

console.log(`roll.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
