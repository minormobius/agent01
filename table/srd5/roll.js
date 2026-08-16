// table/srd5/roll.js — a whole SRD 5.2.1 character from a seed. Pure logic, no DOM.
//
// THE SEED IS THE CHARACTER. Same rule as table/cairn/roll.js, and it is
// load-bearing for the same reason: `#s=oak-fen-317` must roll the same person
// forever, so every draw comes off one seeded stream in a FIXED ORDER.
// Appending a draw at the end is safe. Inserting one anywhere else silently
// rewrites every permalink ever shared, which is why the selftest freezes one
// sheet as a tripwire.
//
// AND IT COMPUTES WHAT THE GAME COMPUTES. A generator that rolls six numbers
// and prints a shopping list is a shuffler. This one derives the whole sheet —
// armour class from the armour actually worn plus the dexterity actually
// rolled, hit points from the hit die and Constitution, proficiency bonus from
// level, every skill and save modifier, attack and damage for each weapon
// carried, spell save DC and spell attack for casters, passive Perception,
// encumbrance — because those derivations ARE the rules, and getting them from
// the same data the sheet displays is the only way they cannot disagree.
//
// This work includes material from the System Reference Document 5.2.1
// ("SRD 5.2.1") by Wizards of the Coast LLC, available at
// https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
// Commons Attribution 4.0 International License, available at
// https://creativecommons.org/licenses/by/4.0/legalcode.

import { CLASSES, SPECIES, BACKGROUNDS, SKILLS, WEAPONS, ARMOR, FEATS } from './data.js';

export const ABILITIES = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];

const FULL = {
  Str: 'Strength', Dex: 'Dexterity', Con: 'Constitution',
  Int: 'Intelligence', Wis: 'Wisdom', Cha: 'Charisma',
};

// ------------------------------------------------------------------- dice

/**
 * Seeded RNG. Lifted deliberately from table/cairn/roll.js, including the part
 * that looks like paranoia and is not: mulberry32's first output is a weak
 * function of its seed, so a party seeded `seed/0`, `seed/1`, … came out as
 * four of the same character. Two hash words are mixed and twelve outputs are
 * discarded before any die is read. A selftest measures the collision rate
 * against chance, because that failure is invisible otherwise.
 */
export function makeRng(seedText) {
  const h = xmur3(String(seedText));
  const a = h();
  const b = h();
  let t = (a ^ Math.imul(b, 0x9e3779b9)) >>> 0;
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return {
    raw: next,
    d: (sides) => 1 + Math.floor(next() * sides),
    pick: (list) => list[Math.floor(next() * list.length)],
    /** n distinct members of `list`, order preserved. */
    some(list, n) {
      const pool = list.slice();
      const out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      return out;
    },
  };
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

// --------------------------------------------------------------- the rules

/** "Ability Modifiers" table — and it is exactly this formula, not a lookup. */
export const modifier = (score) => Math.floor((score - 10) / 2);

/** Proficiency bonus by character level: +2 at 1st, +1 more every four levels. */
export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

export const signed = (n) => (n >= 0 ? `+${n}` : String(n));

/**
 * "Random Generation. Roll four d6s and record the total of the highest three
 * dice. Do this five more times." The SRD's own random method — the other two
 * it offers (standard array, point cost) are not random and so are not what a
 * roller is for. The dice are kept so the sheet can show its working.
 */
function rollAbilityScores(rng) {
  const rolls = [];
  for (let i = 0; i < 6; i++) {
    const dice = [rng.d(6), rng.d(6), rng.d(6), rng.d(6)];
    const kept = dice.slice().sort((a, b) => b - a).slice(0, 3);
    rolls.push({ dice, kept, total: kept.reduce((a, b) => a + b, 0) });
  }
  return rolls;
}

/**
 * Which score goes where — and the background's increases decided with it.
 *
 * "Assign them to Strength, Dexterity, … keeping in mind your character's
 * class", and separately "A background lists three of your character's ability
 * scores. Increase one by 2 and another one by 1."
 *
 * These two have to be decided TOGETHER. Doing them in sequence — assign the
 * best roll to the primary ability, then apply the background — lets the
 * background's +2 land on Constitution and overtake it, which is how a
 * Sorcerer came out with Con 16 and Charisma 15. No player would do that. So
 * the bonuses are worked out first, then scores are assigned greedily in the
 * class's order of preference by their FINAL value.
 *
 * This is a judgement we are making on the player's behalf; the SRD leaves the
 * assignment open, and the sheet says so.
 */
function assignScores(totals, klass, background) {
  // preference order: the class's primary ability or abilities, then
  // Constitution, then a fixed fallback so the result is deterministic
  const order = [];
  for (const a of ABILITIES) if (new RegExp(FULL[a]).test(klass.primary || '')) order.push(a);
  if (!order.includes('Con')) order.push('Con');
  for (const a of ['Dex', 'Wis', 'Str', 'Cha', 'Int']) if (!order.includes(a)) order.push(a);

  // the background can only raise the three abilities it lists: +2 on the one
  // the class wants most, +1 on the next
  const bonus = {};
  const ranked = background.abilities
    .filter((a) => ABILITIES.includes(a))
    .slice()
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const applied = [];
  if (ranked[0]) { bonus[ranked[0]] = 2; applied.push(`${ranked[0]} +2`); }
  if (ranked[1]) { bonus[ranked[1]] = 1; applied.push(`${ranked[1]} +1`); }

  // greedy: walk the preference order and give each ability whichever
  // remaining roll ends up highest AFTER its increase
  const pool = totals.slice().sort((a, b) => b - a);
  const scores = {};
  for (const ability of order) {
    let best = 0;
    for (let i = 1; i < pool.length; i++) {
      if (pool[i] + (bonus[ability] || 0) > pool[best] + (bonus[ability] || 0)) best = i;
    }
    scores[ability] = Math.min(20, pool.splice(best, 1)[0] + (bonus[ability] || 0));
  }
  return { scores, applied, bonus };
}

/** Every weapon the SRD prints, indexed by name. */
const weaponByName = (name) => WEAPONS.find((w) => w.name.toLowerCase() === String(name).toLowerCase());
const armorByName = (name) => ARMOR.find((a) => a.name.toLowerCase() === String(name).toLowerCase());

/**
 * Armour Class, computed from what is actually worn.
 *
 * "if you wear Leather Armor, your base AC is 11 plus your Dexterity
 * modifier" — light armour adds all of DEX, medium caps it (the table prints
 * the cap), heavy adds none, and a Shield is +2 on top. With nothing on, the
 * unarmoured default is 10 + DEX.
 */
export function armorClass(scores, worn, shield) {
  const dex = modifier(scores.Dex);
  const suit = worn ? armorByName(worn) : null;
  let ac;
  let how;
  if (!suit) {
    ac = 10 + dex;
    how = `10 ${signed(dex)} Dex`;
  } else if (!suit.addDex) {
    ac = suit.ac;
    how = `${suit.ac} (${suit.name})`;
  } else {
    const add = suit.dexCap == null ? dex : Math.min(dex, suit.dexCap);
    ac = suit.ac + add;
    how = `${suit.ac} ${signed(add)} Dex${suit.dexCap != null && dex > suit.dexCap ? ` (capped)` : ''}`;
  }
  if (shield) { ac += 2; how += ' +2 shield'; }
  return { ac, how };
}

/**
 * Hit points.
 *
 * At level 1 it is the whole hit die plus your Constitution modifier. Above
 * that the SRD offers the die's average (rounded up) or a roll; a roller rolls,
 * and the log records each one. A level never adds less than 1.
 */
function hitPoints(rng, klass, con, level, species) {
  const die = klass.hitDie;
  const conMod = modifier(con);
  const log = [{ level: 1, roll: die, gained: die + conMod, fixed: true }];
  let hp = die + conMod;
  for (let l = 2; l <= level; l++) {
    const roll = rng.d(die);
    const gained = Math.max(1, roll + conMod);
    hp += gained;
    log.push({ level: l, roll, gained, fixed: false });
  }
  // "Dwarven Toughness. Your Hit Point maximum increases by 1, and it
  // increases by 1 again whenever you gain a level."
  const tough = (species.traits || []).some((t) => /Dwarven Toughness/i.test(t.name));
  if (tough) hp += level;
  return { hp, log, tough };
}

// -------------------------------------------------------------- the roller

/**
 * One character.
 *
 * THE DRAW ORDER BELOW IS THE PERMALINK. Do not reorder it, and do not insert
 * a draw in the middle of it; append at the end if you must add something.
 */
export function rollCharacter(seedText, { level = 1 } = {}) {
  const rng = makeRng(`srd5/${seedText}`);
  const lvl = Math.min(20, Math.max(1, level));

  // 1. origin and class
  const species = rng.pick(SPECIES);
  const background = rng.pick(BACKGROUNDS);
  const klass = rng.pick(Object.values(CLASSES));

  // 2. abilities: rolled, then assigned, then the background's increases
  const rolls = rollAbilityScores(rng);
  const { scores, applied } = assignScores(rolls.map((r) => r.total), klass, background);

  // 3. skills — the background's two, then the class's picks from what is left
  const backgroundSkills = background.skills.filter((s) => SKILLS.some((k) => k.name === s));
  const pool = (klass.skills && klass.skills.from === 'any'
    ? SKILLS.map((s) => s.name)
    : (klass.skills ? klass.skills.from : []))
    .filter((s) => SKILLS.some((k) => k.name === s) && !backgroundSkills.includes(s));
  const classSkills = rng.some(pool, klass.skills ? klass.skills.choose : 2);
  const proficient = [...backgroundSkills, ...classSkills];

  // 4. kit. The starting-equipment packages are prose with branching options,
  //    so rather than pretend to parse them we equip from the tables the class
  //    is TRAINED to use — which is a decision of ours, and the sheet says so.
  const trained = String(klass.weapons || '');
  const canMartial = /Martial/i.test(trained);
  const weaponPool = WEAPONS.filter((w) => (canMartial || !w.martial));
  // The best weapon they are trained for, by average damage with the modifier
  // they would actually add — not a random one, which armed a Barbarian with
  // a sickle while a greataxe sat in the same list. Ties break by name so the
  // choice stays deterministic.
  // Expected damage per attack against a typical AC 13, so HIT CHANCE counts
  // and not just the die: a Bard with Strength 9 was reaching for a greatclub
  // at -1 to hit because 1d8 beats a dagger's 1d4 on paper, and it does not
  // once you include how often it lands.
  const avg = (w) => {
    const [n, faces] = (w.versatile || w.dice).split('d').map(Number);
    const useDex = w.finesse ? modifier(scores.Dex) > modifier(scores.Str) : !w.melee;
    const mod = modifier(useDex ? scores.Dex : scores.Str);
    const hit = Math.min(0.95, Math.max(0.05, (21 - (13 - (mod + 2))) / 20));
    return hit * (n * (faces + 1) / 2 + mod);
  };
  const best = (list) => list.slice()
    .sort((a, b) => avg(b) - avg(a) || a.name.localeCompare(b.name))[0];
  const melee = best(weaponPool.filter((w) => w.melee)) || weaponByName('Club');
  const ranged = best(weaponPool.filter((w) => !w.melee)) || null;

  const armorTraining = String(klass.armor || '');
  const heavy = /Heavy/i.test(armorTraining);
  const medium = heavy || /Medium/i.test(armorTraining);
  const light = medium || /Light/i.test(armorTraining);
  const suits = ARMOR.filter((a) => a.category !== 'Shield' && (
    (a.category === 'Heavy' && heavy) || (a.category === 'Medium' && medium)
      || (a.category === 'Light' && light)));
  // The best armour they are trained for, since that is what anyone would buy.
  const worn = suits.length
    ? suits.slice().sort((a, b) => (b.ac + (b.addDex ? Math.min(modifier(scores.Dex), b.dexCap ?? 99) : 0))
      - (a.ac + (a.addDex ? Math.min(modifier(scores.Dex), a.dexCap ?? 99) : 0)))[0].name
    : null;
  const shield = /Shield/i.test(armorTraining) && !melee.twoHanded;

  // 5. hit points, which need Constitution and so come last
  const { hp, log: hpLog, tough } = hitPoints(rng, klass, scores.Con, lvl, species);

  return finish({
    seed: seedText, level: lvl, species, background, klass,
    rolls, scores, applied,
    proficient, backgroundSkills, classSkills,
    weapons: [melee, ranged].filter(Boolean), worn, shield,
    hp, hpLog, tough,
  });
}

/** Everything derived. Separated so the derivation can be tested on its own. */
function finish(c) {
  const pb = proficiencyBonus(c.level);
  const mods = {};
  for (const a of ABILITIES) mods[a] = modifier(c.scores[a]);

  const { ac, how } = armorClass(c.scores, c.worn, c.shield);

  const saves = ABILITIES.map((a) => ({
    ability: a,
    proficient: (c.klass.saves || []).includes(a),
    mod: mods[a] + ((c.klass.saves || []).includes(a) ? pb : 0),
  }));

  const skills = SKILLS.map((s) => ({
    name: s.name,
    ability: s.ability,
    proficient: c.proficient.includes(s.name),
    mod: mods[s.ability] + (c.proficient.includes(s.name) ? pb : 0),
  }));

  // "Finesse. When making an attack with this weapon, you can use your choice
  //  of your Strength or Dexterity modifier."
  const attacks = c.weapons.map((w) => {
    const useDex = w.finesse ? mods.Dex > mods.Str : !w.melee;
    const ability = useDex ? 'Dex' : 'Str';
    return {
      name: w.name,
      ability,
      attack: mods[ability] + pb,
      damage: `${w.dice}${mods[ability] ? signed(mods[ability]) : ''} ${w.damageType}`,
      versatile: w.versatile ? `${w.versatile}${mods[ability] ? signed(mods[ability]) : ''}` : null,
      range: w.range,
      properties: [w.finesse && 'Finesse', w.light && 'Light', w.heavy && 'Heavy',
        w.twoHanded && 'Two-Handed', w.reach && 'Reach'].filter(Boolean),
    };
  });

  // Spellcasting, where the class has it. The ability is the class's primary
  // one for the full casters the SRD publishes; a class with no spell slots in
  // its table gets nothing rather than an empty box.
  const casting = spellcasting(c.klass, mods, pb);

  const perception = skills.find((s) => s.name === 'Perception');

  return {
    ...c,
    proficiencyBonus: pb,
    mods,
    ac,
    acHow: how,
    initiative: mods.Dex,
    speed: c.species.speed,
    saves,
    skills,
    attacks,
    casting,
    passivePerception: 10 + (perception ? perception.mod : mods.Wis),
    features: featuresUpTo(c.klass, c.level),
    feat: c.background.feat,
  };
}

const CASTING_ABILITY = {
  Bard: 'Cha', Cleric: 'Wis', Druid: 'Wis', Paladin: 'Cha', Ranger: 'Wis',
  Sorcerer: 'Cha', Warlock: 'Cha', Wizard: 'Int',
};

function spellcasting(klass, mods, pb) {
  const ability = CASTING_ABILITY[klass.name];
  if (!ability) return null;
  return {
    ability,
    // "Spell save DC = 8 + your Proficiency Bonus + your spellcasting ability
    //  modifier"; the attack bonus is the same without the 8.
    saveDc: 8 + pb + mods[ability],
    attack: pb + mods[ability],
  };
}

/** Every class feature gained at or below this level, in level order. */
export function featuresUpTo(klass, level) {
  const out = [];
  for (const [lv, names] of Object.entries(klass.features || {})) {
    if (Number(lv) <= level) out.push({ level: Number(lv), names });
  }
  return out.sort((a, b) => a.level - b.level);
}

/** A party. Each member is seeded from the party seed and their index. */
export function rollParty(seedText, size = 4, opts = {}) {
  return {
    seed: seedText,
    members: Array.from({ length: size }, (_, i) => rollCharacter(`${seedText}/${i}`, opts)),
  };
}

export { FEATS };
