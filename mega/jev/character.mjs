// character.mjs — Jev's character sheet, inventory and skill tree.
//
// Pure, dependency-free ESM: same seed in, same character out, so a run
// replays exactly. Node-tested alongside delve.mjs.
//
// WHY THIS EXISTS. With only "which door / fight / loot / withdraw", every
// run has the same shape: descend, take hits, climb out. There is nothing to
// weigh. Consumables are the cheapest way to create real tradeoffs — a potion
// is only interesting because drinking it now means not having it later, and
// an arrow is only interesting because there are three of them and four
// wraiths.
//
// It also buys something the demo wants to show off: **the legal option set
// changes every tick**. `usableItems()` returns what can be used HERE, right
// now, so the `use_item` choice literally cannot offer a potion Jev does not
// carry or a rope where there is no trapdoor. A text model needs a validator
// and a retry loop for that; a typed choice gets it from the question.

export const CHARACTER_VERSION = 1;

// ------------------------------------------------------------------ dice ---
/** 4d6-drop-lowest, the classic. Returns 3..18, centred near 12. */
function rollStat(rand) {
  const d = [0, 0, 0, 0].map(() => 1 + Math.floor(rand() * 6));
  d.sort((a, b) => a - b);
  return d[1] + d[2] + d[3];
}

export const STATS = [
  { key: 'vigour', label: 'Vigour', note: 'Hit points, and how much a potion restores.' },
  { key: 'might', label: 'Might', note: 'Melee: how much of a creature’s bite is turned aside.' },
  { key: 'aim', label: 'Aim', note: 'Archery: the chance an arrow is recovered after the shot.' },
];

// ----------------------------------------------------------------- items ---
// Each item declares when it is USABLE. That predicate is the whole point:
// it is what makes the option set honest.
export const ITEMS = {
  potion: {
    label: 'Potion',
    blurb: 'Restores health. Worth nothing at full health, worth everything at 2.',
    usable: (ch, ctx) => ch.inventory.potion > 0 && ctx.hp < ctx.maxHp,
    why: (ch, ctx) => `Restores about ${healAmount(ch)} health. The delver is on ${ctx.hp} of ${ctx.maxHp}.`,
  },
  arrow: {
    label: 'Arrow',
    blurb: 'Kills the toughest creature here outright, with no chance to bite back.',
    usable: (ch, ctx) => ch.inventory.arrow > 0 && ctx.creatures.length > 0,
    why: (ch, ctx) => {
      const worst = [...ctx.creatures].sort((a, b) => b.hp - a.hp)[0];
      return `Kills the ${worst.type} (hp ${worst.hp}) without it striking back.`
        + ` ${ch.inventory.arrow} arrow(s) left.`;
    },
  },
  ward: {
    label: 'Ward',
    blurb: 'Neutralises every trap in this chamber before it can fire.',
    usable: (ch, ctx) => ch.inventory.ward > 0 && ctx.traps.length > 0,
    why: (ch, ctx) => `Disarms ${ctx.traps.length} trap(s) here, together worth `
      + `${ctx.traps.reduce((s, t) => s + t.dmg, 0)} damage.`,
  },
  rope: {
    label: 'Rope',
    blurb: 'Descends a trapdoor safely, skipping straight to the chamber below.',
    usable: (ch, ctx) => ch.inventory.rope > 0 && ctx.trapdoor != null,
    why: (ch, ctx) => `Drops straight to chamber ${ctx.trapdoor.toRoom}, `
      + `${ctx.trapdoor.drop.toFixed(1)} m down, skipping the walk.`,
  },
};
export const ITEM_KEYS = Object.keys(ITEMS);

export function healAmount(ch) {
  return 4 + Math.floor(ch.stats.vigour / 4) + (ch.passives.alchemy ? 4 : 0);
}

// ------------------------------------------------------------ skill tree ---
// Tier 1 grants charges. Tier 2 requires its tier-1 parent and upgrades it.
// `toughness` is always available and repeatable, so there is never a
// level-up with nothing worth taking.
export const SKILLS = {
  second_wind: {
    tier: 1, label: 'Second Wind', requires: null,
    blurb: 'Carry potions. +2 now, and +1 at every level after.',
    grants: { potion: 2 }, perLevel: { potion: 1 },
  },
  fletcher: {
    tier: 1, label: 'Fletcher', requires: null,
    blurb: 'Carry arrows. +3 now, and +1 at every level after.',
    grants: { arrow: 3 }, perLevel: { arrow: 1 },
  },
  trapsense: {
    tier: 1, label: 'Trapsense', requires: null,
    blurb: 'Carry wards. +2 now, and +1 at every level after.',
    grants: { ward: 2 }, perLevel: { ward: 1 },
  },
  climber: {
    tier: 1, label: 'Climber', requires: null,
    blurb: 'Carry ropes. +2 now, and +1 at every level after.',
    grants: { rope: 2 }, perLevel: { rope: 1 },
  },
  alchemy: {
    tier: 2, label: 'Alchemy', requires: 'second_wind',
    blurb: 'Potions restore 4 more, and you find one immediately.',
    grants: { potion: 1 }, passive: 'alchemy',
  },
  marksman: {
    tier: 2, label: 'Marksman', requires: 'fletcher',
    blurb: 'Arrows are always recovered from the body. +2 arrows now.',
    grants: { arrow: 2 }, passive: 'marksman',
  },
  butcher: {
    // tier 1: a standalone passive with no prerequisite, like toughness.
    // Tier 2 is strictly "upgrades a tier-1 you already took".
    tier: 1, label: 'Butcher', requires: null,
    blurb: 'Melee costs 1 less health, every time.',
    grants: {}, passive: 'butcher',
  },
  toughness: {
    tier: 1, label: 'Toughness', requires: null, repeatable: true,
    blurb: '+4 maximum health, permanently. Always available.',
    grants: {}, bonusMaxHp: 4,
  },
};
export const SKILL_KEYS = Object.keys(SKILLS);

// --------------------------------------------------------------- levelling --
/** XP needed to go from `level` to `level + 1`. Deliberately shallow so a
 *  20-tick run levels two or three times and the choice actually comes up. */
export function xpToNext(level) {
  return 10 + 6 * (level - 1);
}

export function rollCharacter(rand, { name = 'Jev' } = {}) {
  const stats = {};
  for (const s of STATS) stats[s.key] = rollStat(rand);
  const ch = {
    name,
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1),
    stats,
    bonusMaxHp: 0,
    skills: [],            // ids taken, in order
    passives: {},          // { butcher: true, ... }
    inventory: { potion: 1, arrow: 1, ward: 0, rope: 0 },
    pendingLevels: 0,      // level-ups awaiting a skill choice
    log: [],
  };
  ch.maxHp = maxHpOf(ch);
  return ch;
}

export function maxHpOf(ch) {
  return 6 + ch.stats.vigour + ch.bonusMaxHp;
}

/** Melee damage actually taken, after Might and Butcher. Never below 1 —
 *  a fight always costs something, or there would be no decision. */
export function meleeCost(ch, rawDamage) {
  const turned = Math.floor(ch.stats.might / 6) + (ch.passives.butcher ? 1 : 0);
  return Math.max(1, rawDamage - turned);
}

/** Chance an arrow is recovered from the body. */
export function arrowRecoveryChance(ch) {
  return ch.passives.marksman ? 1 : Math.min(0.9, ch.stats.aim / 24);
}

export function grantXp(ch, amount, reason) {
  if (amount <= 0) return { leveled: 0 };
  ch.xp += amount;
  let leveled = 0;
  while (ch.xp >= ch.xpToNext) {
    ch.xp -= ch.xpToNext;
    ch.level += 1;
    ch.pendingLevels += 1;
    ch.xpToNext = xpToNext(ch.level);
    leveled += 1;
    // every level also feeds the skills already taken
    for (const id of ch.skills) {
      const sk = SKILLS[id];
      if (!sk?.perLevel) continue;
      for (const [item, n] of Object.entries(sk.perLevel)) ch.inventory[item] += n;
    }
  }
  if (reason) ch.log.push({ kind: 'xp', text: `+${amount} xp (${reason})` });
  return { leveled };
}

/** Skills that can legally be taken right now. */
export function availableSkills(ch) {
  return SKILL_KEYS.filter((id) => {
    const sk = SKILLS[id];
    if (!sk.repeatable && ch.skills.includes(id)) return false;
    if (sk.requires && !ch.skills.includes(sk.requires)) return false;
    return true;
  });
}

export function takeSkill(ch, id) {
  if (!availableSkills(ch).includes(id)) return { ok: false, reason: `skill ${id} is not available` };
  const sk = SKILLS[id];
  ch.skills.push(id);
  for (const [item, n] of Object.entries(sk.grants || {})) ch.inventory[item] += n;
  if (sk.passive) ch.passives[sk.passive] = true;
  if (sk.bonusMaxHp) ch.bonusMaxHp += sk.bonusMaxHp;
  ch.maxHp = maxHpOf(ch);
  ch.pendingLevels = Math.max(0, ch.pendingLevels - 1);
  ch.log.push({ kind: 'skill', text: `Took ${sk.label}.` });
  return { ok: true, skill: sk };
}

/**
 * Which items can be used in THIS situation.
 * `ctx` is { hp, maxHp, creatures, traps, trapdoor }.
 */
export function usableItems(ch, ctx) {
  return ITEM_KEYS.filter((k) => {
    try { return Boolean(ITEMS[k].usable(ch, ctx)); } catch { return false; }
  });
}

export function inventoryCount(ch) {
  return ITEM_KEYS.reduce((s, k) => s + (ch.inventory[k] || 0), 0);
}

export function sheet(ch) {
  return {
    name: ch.name,
    level: ch.level,
    xp: ch.xp,
    xp_to_next: ch.xpToNext,
    stats: { ...ch.stats },
    max_health: ch.maxHp,
    skills_taken: ch.skills.map((id) => SKILLS[id].label),
    passives: Object.keys(ch.passives),
    inventory: { ...ch.inventory },
    pending_level_ups: ch.pendingLevels,
  };
}
