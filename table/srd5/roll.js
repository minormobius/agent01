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

/** A background's granted Origin feat, stripped of its cross-reference. */
const c0 = (background) => String(background.feat).replace(/\s*\(see [^)]*\)/, '').trim();

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

// ------------------------------------------------------- multiclassing

/**
 * The abilities a class demands, split by how the SRD phrases it.
 *
 * "Strength or Dexterity" (Fighter) means either will do; "Dexterity and
 * Wisdom" (Monk) means both. Treating the two the same way would let a Monk
 * multiclass on one good score.
 */
export function primaryAbilities(klass) {
  const named = ABILITIES.filter((a) => new RegExp(FULL[a]).test(klass.primary || ''));
  const either = /\bor\b/.test(klass.primary || '');
  return { named, either };
}

/**
 * "To qualify for a new class, you must have a score of at least 13 in the
 * primary ability of the new class and your current classes."
 *
 * Note BOTH halves: the new class's primary *and* every class already taken.
 * A Barbarian/Druid needs Strength 13 and Wisdom 13, which is the SRD's own
 * worked example.
 */
export function meetsPrerequisite(scores, klass) {
  const { named, either } = primaryAbilities(klass);
  if (!named.length) return true;
  return either ? named.some((a) => scores[a] >= 13) : named.every((a) => scores[a] >= 13);
}

export function canMulticlassInto(scores, currentClassNames, klass) {
  if (!meetsPrerequisite(scores, klass)) return false;
  return currentClassNames.every((n) => meetsPrerequisite(scores, CLASSES[n]));
}

// "All your levels in the Bard, Cleric, Druid, Sorcerer, and Wizard classes /
//  Half your levels (round up) in the Paladin and Ranger classes". The Warlock
//  is deliberately absent from that list — Pact Magic is counted separately by
//  the SRD, and pretending otherwise would inflate a Warlock multiclass's slots.
const FULL_CASTERS = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'];
const HALF_CASTERS = ['Paladin', 'Ranger'];

export function casterLevel(classLevels) {
  let n = 0;
  for (const [name, lv] of Object.entries(classLevels)) {
    if (FULL_CASTERS.includes(name)) n += lv;
    else if (HALF_CASTERS.includes(name)) n += Math.ceil(lv / 2);
  }
  return n;
}

// ------------------------------------------------------------------ path

/**
 * What happened at each level, and what else could have happened.
 *
 * This is the answer to "I rolled a level ten and I have no idea how we got
 * here". Every entry records the class the level went into, the features it
 * bought, the hit die rolled, and — where the game actually offered a
 * choice — the decision taken AND the roads not taken, because a path with no
 * alternatives on it is a list, not a tree.
 */
function asiLevelsOf(klass) {
  return klass.asiLevels || [4, 8, 12, 16];
}

/** One level's worth of advancement, appended to the path. */
function advance(rng, c, level, klass, opts) {
  const classLevel = (c.classLevels[klass.name] || 0) + 1;
  c.classLevels[klass.name] = classLevel;

  // "You gain the Hit Points from your new class as described for levels after
  //  1. You gain the level 1 Hit Points for a class only when your total
  //  character level is 1." So a Fighter's first level as a multiclass rolls;
  //  it does not take the die whole.
  const conMod = modifier(c.scores.Con);
  const whole = level === 1;
  const roll = whole ? klass.hitDie : rng.d(klass.hitDie);
  const gained = whole ? roll + conMod : Math.max(1, roll + conMod);

  const gainedFeatures = (klass.features[String(classLevel)] || []).slice();
  const entry = {
    level,
    klass: klass.name,
    classLevel,
    gained: gainedFeatures,
    hp: { roll, gained, whole, die: klass.hitDie },
    decisions: [],
  };

  // The subclass fork. The SRD publishes exactly ONE subclass per class, so
  // this is a fork with a single road — said plainly rather than dressed up.
  const sub = gainedFeatures.find((f) => /Subclass$/.test(f));
  if (sub) {
    entry.decisions.push({
      kind: 'subclass',
      chose: gainedFeatures.filter((f) => !/Subclass$/.test(f)).join(', ') || sub,
      alternatives: [],
      note: 'the SRD publishes one subclass per class; the full game has several',
    });
  }

  // The ability score improvement — a real choice between a bump and a feat.
  if (asiLevelsOf(klass).includes(classLevel)) {
    const want = primaryAbilities(klass).named[0] || 'Con';
    const room = c.scores[want] <= 18;
    const feats = FEATS.filter((f) => f.category === 'General' && f.name !== 'Ability Score Improvement');
    const takeFeat = !room || rng.raw() < 0.25;
    if (takeFeat && feats.length) {
      const feat = rng.pick(feats);
      c.feats.push(feat.name);
      entry.decisions.push({
        kind: 'asi', chose: `the ${feat.name} feat`,
        alternatives: [`+2 ${want} (now ${c.scores[want]})`],
      });
    } else {
      c.scores[want] = Math.min(20, c.scores[want] + 2);
      entry.decisions.push({
        kind: 'asi', chose: `+2 ${want} → ${c.scores[want]}`,
        alternatives: feats.slice(0, 3).map((f) => `the ${f.name} feat`),
      });
    }
  }

  // The multiclass fork, recorded even when it is not taken — the point of a
  // path is the branches, and "you could have gone Rogue here" is the branch.
  if (opts.multiclass && level > 1) {
    const eligible = Object.values(CLASSES)
      .filter((k) => k.name !== klass.name && canMulticlassInto(c.scores, Object.keys(c.classLevels), k))
      .map((k) => k.name);
    if (eligible.length) entry.couldHaveTaken = eligible;
  }

  c.path.push(entry);
  return gained;
}

// -------------------------------------------------------------- the roller

/**
 * One character.
 *
 * THE DRAW ORDER BELOW IS THE PERMALINK. Do not reorder it, and do not insert
 * a draw in the middle of it; append at the end if you must add something.
 */
export function rollCharacter(seedText, { level = 1, multiclass = false } = {}) {
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

  // 5. THE PATH. Levels are walked one at a time rather than multiplied out,
  //    because that walk IS the answer to "how did I get here" — and because
  //    multiclassing makes each level a genuine choice that changes the hit
  //    die rolled, the features gained, and when the next improvement lands.
  //
  //    The level-1 draws above are untouched, so a level-1 permalink still
  //    rolls the person it always rolled; everything new is appended.
  const c = { scores: { ...scores }, classLevels: {}, path: [], feats: [c0(background)] };
  let hp = 0;
  let current = klass;
  for (let l = 1; l <= lvl; l++) {
    if (l > 1 && multiclass) {
      const eligible = Object.values(CLASSES).filter((k) =>
        canMulticlassInto(c.scores, Object.keys(c.classLevels), k));
      // A quarter of level-ups branch, when the character qualifies at all.
      // The number is ours: the SRD has no opinion on how often anyone
      // multiclasses, and the page says so.
      if (eligible.length && rng.raw() < 0.25) current = rng.pick(eligible);
    }
    hp += advance(rng, c, l, current, { multiclass });
  }
  // "Dwarven Toughness. Your Hit Point maximum increases by 1, and it
  //  increases by 1 again whenever you gain a level."
  const tough = (species.traits || []).some((t) => /Dwarven Toughness/i.test(t.name));
  if (tough) hp += lvl;

  return finish({
    seed: seedText, level: lvl, species, background, klass,
    rolls, scores: c.scores, baseScores: scores, applied,
    proficient, backgroundSkills, classSkills,
    weapons: [melee, ranged].filter(Boolean), worn, shield,
    hp, tough, path: c.path, classLevels: c.classLevels, feats: c.feats,
    multiclass,
  });
}

/** Everything derived. Separated so the derivation can be tested on its own. */
function finish(c) {
  const pb = proficiencyBonus(c.level);
  const mods = {};
  for (const a of ABILITIES) mods[a] = modifier(c.scores[a]);

  const { ac, how } = armorClass(c.scores, c.worn, c.shield);

  // "When you gain your first level in a class other than your initial class,
  //  you gain only SOME of the new class's starting proficiencies" — and
  //  saving throws are not among them. So saves stay the initial class's, even
  //  for a character who is mostly something else now.
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
  // With multiclassing the caster is whichever class brought the spellcasting;
  // the first one taken wins the sheet's headline numbers.
  const castingClass = Object.keys(c.classLevels).find((n) => CASTING_ABILITY[n]);
  const casting = spellcasting(castingClass ? CLASSES[castingClass] : c.klass, mods, pb);

  const perception = skills.find((s) => s.name === 'Perception');
  const classLine = Object.entries(c.classLevels)
    .map(([n, l]) => `${n} ${l}`).join(' / ');

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
    // Features come off the PATH, not from the first class and the character
    // level. A Paladin 2 / Warlock 6 does not have a Paladin's level-8
    // features, and computing them that way would hand out several.
    features: c.path.filter((e) => e.gained.length)
      .map((e) => ({ level: e.level, klass: e.klass, names: e.gained })),
    feat: c.background.feat,
    classLine,
    casterLevel: casterLevel(c.classLevels),
    // The hit-point log the sheet shows is the path, not a second list.
    hpLog: c.path.map((e) => ({ level: e.level, roll: e.hp.roll, gained: e.hp.gained, fixed: e.hp.whole })),
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

// ---------------------------------------------------------------- balance
//
// THE SRD PUBLISHES NO ROLE TAXONOMY. "Every party needs a healer" is folk
// wisdom, not a rule, and this file is careful about the difference. What
// follows is in two halves, and the page keeps them apart:
//
//   DERIVED — properties of the actual rules, computable from the class data
//   and true whether or not anyone agrees with our theory. Saving-throw
//   coverage is the strongest of these: every class grants proficiency in
//   exactly two of the six saves, a party either covers a save or does not,
//   and an uncovered save is a real hole that specific monsters aim at.
//
//   OURS — the role names, and the weights that turn coverage into one number.
//   Invented, labelled, and arguable. When the map layer lands and encounters
//   can be simulated, this becomes testable rather than asserted, and that is
//   the point of writing it down now.

/**
 * The four roles, each defined by something on the sheet rather than by vibes.
 * Curated: this table is ours. Every entry says what evidence it reads.
 */
export const ROLES = [
  {
    key: 'frontline',
    label: 'holds the line',
    why: 'heavy or medium armour and a d10+ hit die — can stand where it hurts',
    test: (c) => CLASSES[firstClass(c)] && /Heavy|Medium/i.test(String(CLASSES[firstClass(c)].armor || ''))
      && CLASSES[firstClass(c)].hitDie >= 10,
  },
  {
    key: 'healer',
    label: 'puts people back up',
    // Curated, and it has to be: healing lives in spell lists the SRD prints
    // but this corpus does not yet parse. These are the classes that can heal
    // at level 1 by the book.
    why: 'can restore hit points from level 1 (Bard, Cleric, Druid, Paladin, Ranger)',
    test: (c) => Object.keys(c.classLevels || {})
      .some((n) => ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'].includes(n)),
  },
  {
    key: 'caster',
    label: 'changes the situation',
    why: 'has a spell save DC, so can force saves rather than only deal damage',
    test: (c) => !!c.casting,
  },
  {
    key: 'scout',
    label: 'finds the trouble first',
    why: 'proficient in Stealth or Perception',
    test: (c) => c.proficient.includes('Stealth') || c.proficient.includes('Perception'),
  },
];

const firstClass = (c) => (c.klass ? c.klass.name : Object.keys(c.classLevels || {})[0]);

/**
 * What a party covers and what it does not.
 *
 * The two coverage numbers are mechanical. The roles are ours. The score
 * weights saves most heavily because an uncovered save is the only one of
 * these a monster can aim at deliberately.
 */
export function partyBalance(members) {
  const saves = {};
  for (const a of ABILITIES) {
    saves[a] = members.filter((m) => m.saves.find((s) => s.ability === a && s.proficient))
      .map((m) => m.klass.name);
  }
  const skillsCovered = new Set(members.flatMap((m) => m.proficient));

  const roles = {};
  for (const r of ROLES) roles[r.key] = members.filter((m) => r.test(m)).map((m) => m.klass.name);

  // The three saves that matter most. Ours, and stated: Dexterity, Constitution
  // and Wisdom are what the bestiary's area effects, poisons and charms call
  // for, so a hole in one of those costs more than a hole in Strength.
  const BIG_THREE = ['Dex', 'Con', 'Wis'];
  const savesCovered = ABILITIES.filter((a) => saves[a].length > 0);
  const bigCovered = BIG_THREE.filter((a) => saves[a].length > 0);
  const rolesCovered = ROLES.filter((r) => roles[r.key].length > 0);

  const score = bigCovered.length * 3 + savesCovered.length + rolesCovered.length * 2
    + Math.min(12, skillsCovered.size) / 4;

  return {
    saves,
    savesCovered,
    savesMissing: ABILITIES.filter((a) => !saves[a].length),
    bigThreeMissing: BIG_THREE.filter((a) => !saves[a].length),
    skillsCovered: [...skillsCovered].sort(),
    skillsMissing: SKILLS.map((s) => s.name).filter((n) => !skillsCovered.has(n)),
    roles,
    rolesMissing: ROLES.filter((r) => !roles[r.key].length).map((r) => r.key),
    score: Math.round(score * 100) / 100,
    // the best a party of this size could possibly score, for context
    max: Math.round((3 * 3 + 6 + ROLES.length * 2 + 3) * 100) / 100,
  };
}

/**
 * A party chosen for coverage rather than accepted as rolled.
 *
 * Deterministic rejection sampling: walk a fixed number of candidate parties
 * derived from the same seed, score each, keep the best. The seed still
 * decides everything, so the permalink still works — it just points at the
 * winner of a search instead of the first throw.
 *
 * Rejection sampling and not construction, deliberately. Assembling one of
 * each role would produce the same four classes every time and quietly answer
 * a design question ("what SHOULD a party be?") that we have no business
 * answering yet. Searching says only "of these forty parties, this one has the
 * fewest holes", which is a claim we can actually defend.
 */
export function rollBalancedParty(seedText, size = 4, opts = {}) {
  const tries = opts.tries || 40;
  let best = null;
  for (let i = 0; i < tries; i++) {
    const members = Array.from({ length: size }, (_, k) =>
      rollCharacter(`${seedText}/b${i}/${k}`, opts));
    const balance = partyBalance(members);
    if (!best || balance.score > best.balance.score) best = { members, balance, attempt: i };
  }
  // and what an unsearched party of this seed would have scored, so the page
  // can show what the search actually bought
  const plain = partyBalance(Array.from({ length: size }, (_, k) =>
    rollCharacter(`${seedText}/${k}`, opts)));
  return { seed: seedText, ...best, tries, plainScore: plain.score, plain };
}

/** A party. Each member is seeded from the party seed and their index. */
export function rollParty(seedText, size = 4, opts = {}) {
  return {
    seed: seedText,
    members: Array.from({ length: size }, (_, i) => rollCharacter(`${seedText}/${i}`, opts)),
  };
}

export { FEATS };
