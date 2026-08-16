// table/cairn/delve.js — what a Cairn character becomes after surviving things.
//
// WHY A DELVE AND NOT A LEVEL. Cairn has no levels and no experience, and it
// puts magic entirely into objects: a spellbook is one slot and a Fatigue to
// read, a relic is one slot and a recharge condition. So a character's power is
// not a number on a sheet, it is WHAT THEY ARE CARRYING — and what they are
// carrying is capped at ten slots, of which four are on the body. Advancement
// in this game is an inventory problem.
//
// Which makes scars and loot the same axis, not two. You do not accumulate
// scars in a library; you get them in the same rooms the relics are in. A
// veteran with a fresh character's kit is a fiction, and so is a fully-loaded
// character with no marks on them. One delve advances both.
//
// EVERYTHING IN THIS FILE IS OURS. Cairn publishes no loot table, no delve
// procedure, and no advancement scale. The scar mechanics are read off the
// SRD's Scars table; the rates, the loot mix and the carrying rule are model,
// clearly separated so a Warden knows which is which.

import { makeRng, parseItem, packInventory } from './roll.js';
import { ITEMS } from './items.js';

// ------------------------------------------------------------- the scars

/**
 * The numeric effect of one row of the Scars table. The prose consequences —
 * deafened, hamstrung, an appendage gone — are not modelled; the maximums are,
 * because most rows raise one. Twelve rows, read off the SRD.
 */
export function applyScar(state, n, rng) {
  const sum = (k) => { let t = 0; for (let i = 0; i < k; i++) t += rng.d(6); return t; };
  const raise = (key, value) => {
    if (key === 'hp') { if (value > state.hp) state.hp = value; }
    else if (value > state.attributes[key]) state.attributes[key] = value;
  };
  switch (n) {
    case 1: case 2: raise('hp', sum(1)); break;                         // lasting scar / rattling blow
    case 3: state.hp += sum(1); break;                                  // walloped: "add that amount"
    case 4: case 5: raise('hp', sum(2)); break;                         // broken limb / diseased
    case 6: raise(['STR', 'DEX', 'WIL'][rng.d(3) - 1], sum(3)); break;  // reorienting head wound
    case 7: raise('DEX', sum(3)); break;                                // hamstrung
    case 8: state.attributes.WIL += rng.d(4); break;                    // deafened, on a passed save
    case 9: raise('WIL', sum(3)); break;                                // re-brained
    case 10: state.attributes.WIL += rng.d(6); break;                   // sundered, on a passed save
    case 11: state.hp = sum(2); break;                                  // mortal wound: "take the new result"
    case 12: raise('hp', sum(3)); break;                                // doomed
    default: break;
  }
  return n;
}

// -------------------------------------------------------------- the loot

/**
 * What comes out of a dungeon, as a weighted mix. OURS, not Cairn's.
 *
 * Weighted toward the mundane on purpose: a loot table that hands out a relic
 * every time makes the slot problem disappear, and the slot problem is the
 * interesting part. Rope and lanterns compete for space with the sword.
 */
const LOOT_MIX = [
  { kind: 'gear', weight: 34 },
  { kind: 'weapon', weight: 18 },
  { kind: 'armor', weight: 12 },
  { kind: 'spellbook', weight: 14 },
  { kind: 'relic', weight: 14 },
  // Cairn's most powerful objects are the ones that run out: a blast sphere is
  // a d12 across the whole room, once. They come off the background tables
  // rather than the shop, so the loot table carries them explicitly.
  { kind: 'consumable', weight: 8 },
];

/**
 * One-use and few-use items, taken verbatim from the backgrounds that grant
 * them. Their `N use` is read by parseItem and spent in the fight.
 */
export const CONSUMABLES = [
  'Blast Sphere (d12, *blast*, *bulky*, 1 use)',
  'Fireseeds (d8, *blast*, 4 uses)',
  'Pyrophoric Gel (1 use)',
  'Spark Dust (3 uses)',
  'Healing Unguent (restores d4 STR, 1 use)',
  'Herbs Pouch (restore 1 STR, 3 uses)',
  'Soporific Darts (STR save or fall asleep, 6 uses)',
  'Bandages (3 uses)',
  'Antitoxin (2 uses)',
  'Aqua Vita (cures 1d6 STR, 1 use)',
];

const TOTAL_WEIGHT = LOOT_MIX.reduce((n, l) => n + l.weight, 0);

/** Draw one piece of loot. Returns a parsed item, tagged with what it is. */
export function rollLoot(rng) {
  let roll = rng.d(TOTAL_WEIGHT);
  let kind = 'gear';
  for (const entry of LOOT_MIX) {
    if (roll <= entry.weight) { kind = entry.kind; break; }
    roll -= entry.weight;
  }
  const pick = (list) => list[rng.d(list.length) - 1];

  if (kind === 'spellbook') {
    const spell = pick(ITEMS.spells);
    // "Spellbooks contain a single spell and take up one slot."
    return { ...parseItem(`Spellbook: ${spell.name}`), kind, spell };
  }
  if (kind === 'relic') {
    const relic = pick(ITEMS.relics);
    return { ...parseItem(relic.text), kind, relic };
  }
  if (kind === 'consumable') return { ...parseItem(pick(CONSUMABLES)), kind };
  const table = { gear: ITEMS.market.gear, weapon: ITEMS.market.weapons, armor: ITEMS.market.armor }[kind];
  return { ...parseItem(pick(table).text), kind };
}

// ---------------------------------------------------------- the carrying

/**
 * How badly a character wants to keep a thing, when the pack is full.
 *
 * This is a crude ranking and it is meant to be: the point is not to play the
 * inventory game optimally, it is to stop a delver hoarding twelve slots of
 * lanterns and calling it power. Petty items score infinite because they cost
 * nothing to keep.
 */
export function itemUtility(item) {
  if (item.slots === 0) return Infinity;
  let score = 0.5;                                   // a mundane thing has some use
  if (item.armor) score += 3 * item.armor;
  if (item.damage) score += Math.max(...item.damage.match(/\d+/g).map(Number)) / 2;
  if (item.kind === 'relic') score += 2;
  if (item.kind === 'spellbook') score += 2;
  // a bomb is worth carrying, but a spent one is dead weight — value it below
  // a permanent weapon of the same die
  if (item.kind === 'consumable') score += item.damage ? 1.5 : 0.5;
  if (item.capacity) score += item.capacity;         // a cart earns its own slots back
  return score / item.slots;                         // per slot, because slots are the currency
}

/**
 * Take the item if it fits; if it does not, take it only by dropping something
 * worse. Returns { kept, dropped }.
 *
 * THE RESERVED SLOT IS A RULE, NOT A COURTESY. "Anyone carrying a full
 * inventory (i.e. filling all 10 slots) is reduced to 0 HP" — so a delver who
 * fills their pack has knocked themselves out for a lantern. The first version
 * of this model did exactly that: by the third delve the average character was
 * sitting at 10.0 of 10 slots and would have entered every fight unconscious.
 * Nobody plays that way, so the model does not either: one slot stays empty,
 * which is also where the Fatigue from reading a spellbook goes.
 */
export function tryCarry(gear, item, reserve = 1) {
  const free = () => {
    const inv = packInventory(gear);
    return inv.capacity - inv.used - reserve;
  };
  if (item.slots <= free()) {
    gear.push(item);
    return { kept: true, dropped: null };
  }
  // Full. Drop the worst things carried, one at a time, for as long as they are
  // worse than what is on offer — a bulky find is worth two mundane slots, and
  // a delver standing over plate armour with a pack of pots knows it.
  const dropped = [];
  for (;;) {
    if (item.slots <= free()) {
      gear.push(item);
      return { kept: true, dropped: dropped.length === 1 ? dropped[0] : dropped };
    }
    const worst = gear
      .map((g, i) => ({ g, i, u: itemUtility(g) }))
      .filter((x) => Number.isFinite(x.u))
      .sort((a, b) => a.u - b.u)[0];
    if (!worst || itemUtility(item) <= worst.u) break;
    gear.splice(worst.i, 1);
    dropped.push(worst.g);
  }
  // Not worth it after all — put back everything picked up off the floor.
  for (const g of dropped) gear.push(g);
  return { kept: false, dropped: null };
}

// ----------------------------------------------------------- the delving

/**
 * Run a character through `delves` dungeons and return who comes back.
 *
 * @param {object} character   a rolled character from roll.js
 * @param {number} delves      how many expeditions they have survived
 * @param {object} [opts]
 * @param {number} [opts.scarChance=0.5]  chance a delve leaves a scar
 * @param {number} [opts.lootPerDelve=2]  pieces of loot found per delve
 * @param {string} [opts.seed]            defaults to the character's own seed
 */
export function delve(character, delves, opts = {}) {
  const { scarChance = 0.5, lootPerDelve = 2, reserve = 1 } = opts;
  const rng = makeRng(`${character.seed}/delve/${opts.seed || ''}`);

  const state = {
    ...character,
    attributes: { ...character.attributes },
    gear: character.gear.map((g) => ({ ...g })),
    scars: [],
    found: [],
    leftBehind: [],
    delves,
  };

  for (let d = 0; d < delves; d++) {
    for (let i = 0; i < lootPerDelve; i++) {
      const item = rollLoot(rng);
      const { kept, dropped } = tryCarry(state.gear, item, reserve);
      if (kept) {
        state.found.push(item);
        if (dropped) state.leftBehind.push(...[dropped].flat());
      } else {
        state.leftBehind.push(item);
      }
    }
    // The scar comes from the same room as the loot — that is the whole point.
    if (rng.raw() < scarChance) state.scars.push(applyScar(state, rng.d(12), rng));
  }

  state.inventory = packInventory(state.gear);
  return state;
}

/** A whole party, delved together. */
export function delveParty(members, delves, opts = {}) {
  return members.map((m, i) => delve(m, delves, { ...opts, seed: `${i}` }));
}

/**
 * What the delving did, in one object — for showing a player why their veteran
 * is better, and for checking the model does what it claims.
 */
export function delveSummary(before, after) {
  const b = packInventory(before.gear);
  const a = after.inventory || packInventory(after.gear);
  return {
    delves: after.delves,
    scars: after.scars.length,
    hp: [before.hp, after.hp],
    armor: [b.armor, a.armor],
    bestWeapon: [bestDie(b), bestDie(a)],
    slots: [b.used, a.used],
    capacity: a.capacity,
    relics: after.found.filter((f) => f.kind === 'relic').length,
    spellbooks: after.found.filter((f) => f.kind === 'spellbook').length,
    leftBehind: after.leftBehind.length,
  };
}

function bestDie(inv) {
  let best = 4;
  for (const w of inv.weapons) {
    for (const d of w.damage.match(/\d+/g) || []) best = Math.max(best, Number(d));
  }
  return best;
}
