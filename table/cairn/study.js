// table/cairn/study.js — what is a slot worth?
//
// Cairn puts magic in objects and caps objects at ten slots, so the interesting
// question about an item is not "what does it do" but "what does it do PER SLOT
// OF PACK SPACE". That is a question the oracle can answer, because it already
// prices a fight: give the party the item, run the same fights again, and see
// how much of the toll goes away.
//
//   value(item) = toll without it − toll with it,  averaged over a fixed basket
//                 of encounters, measured on the same seeds both times.
//
// Measuring both runs against THE SAME SEEDS is what makes small differences
// visible: the dice are identical, so the only thing that changed is the item.
// Without that, a shield's contribution disappears under sampling noise.
//
// Spellbooks are priced here too, now that the simulator can read one. Only the
// nine spells with combat mechanics are listed: the other ninety-one do nothing
// in a fight, and putting them in the table at zero would say something false
// about what they are for. See `modelSees`, which is what keeps "worth nothing"
// and "invisible to the model" apart.

import { assess, combatantFromCharacter, combatantFromMonster } from './combat.js';
import { parseItem } from './roll.js';
import { ITEMS } from './items.js';
import { BESTIARY } from './monsters.js';
import { spellEffect, relicEffect, SPELL_EFFECTS } from './effects.js';
import { CONSUMABLES } from './delve.js';

/**
 * The fights an item is judged against. Fixed, so every item is scored on the
 * same ground and the numbers can be compared to each other.
 *
 * Chosen to span the shape of Cairn's threats rather than its lethality: a
 * swarm of weak attackers, a couple of solid ones, and one big single monster.
 * Armour is worth much more against the swarm; a bigger die is worth more
 * against the big one. A basket of only one kind would rank items wrongly.
 */
export const BASKET = [
  { id: 'goblin', count: 5 },
  { id: 'skeleton', count: 4 },
  { id: 'bandit', count: 3 },
  { id: 'wolf', count: 3 },
  { id: 'ogre', count: 1 },
  { id: 'troll', count: 1 },
];

function basketFoes(basket = BASKET) {
  return basket
    .map(({ id, count }) => ({ monster: BESTIARY.find((m) => m.id === id), count }))
    .filter((e) => e.monster);
}

/** Mean toll across the basket. The same seeds are used for every call. */
export function basketToll(pcs, { trials = 250, basket = BASKET, seed = 'basket', ...opts } = {}) {
  const foes = basketFoes(basket);
  let total = 0;
  for (const { monster, count } of foes) {
    // Built through combatantFromMonster, not by hand: an inline copy of the
    // stat block silently dropped the creature's ABILITIES, so the study was
    // pricing items against a bestiary with its teeth removed while the oracle
    // next door modelled them.
    const group = Array.from({ length: count }, (_, i) => combatantFromMonster(monster, i));
    total += assess(pcs, group, { trials, seed: `${seed}/${monster.id}`, ...opts }).toll;
  }
  return total / foes.length;
}

/**
 * What one copy of an item is worth to this party.
 *
 * Two numbers, because they answer different questions:
 *   average — the item goes to a random member, which is what loot does;
 *   best    — the item goes to whoever gains most, which is what a party does
 *             once they have looked at it.
 *
 * `characters` are rolled characters (not combatants), because giving someone
 * an item means re-packing their inventory: a bulky sword can push a lantern
 * out of the pack, and that cost belongs in the measurement.
 */
export function itemValue(characters, item, opts = {}) {
  const { trials = 250, basket = BASKET, seed = 'value' } = opts;
  const base = characters.map((c) => combatantFromCharacter(c));
  const before = basketToll(base, { trials, basket, seed });

  const deltas = characters.map((_, holder) => {
    const pcs = characters.map((c, i) =>
      combatantFromCharacter(c, i === holder ? [item] : []));
    return before - basketToll(pcs, { trials, basket, seed });
  });

  const averted = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const best = Math.max(...deltas);
  return {
    item,
    averted,
    best,
    slots: item.slots,
    // A petty item costs nothing to carry, so per-slot value is undefined
    // rather than infinite — the UI says "free" and ranks it on `averted`.
    perSlot: item.slots ? averted / item.slots : null,
  };
}

/**
 * Everything a delver might find, scored. Slow enough to want a progress
 * callback: roughly `items × party × basket × trials` fights.
 */
export function studyItems(characters, opts = {}) {
  const { trials = 250, basket = BASKET, seed = 'study', onProgress } = opts;
  const catalogue = [
    ...ITEMS.market.weapons.map((w) => ({ ...parseItem(w.text), kind: 'weapon', cost: w.cost })),
    ...ITEMS.market.armor.map((a) => ({ ...parseItem(a.text), kind: 'armor', cost: a.cost })),
    ...ITEMS.relics.map((r) => ({ ...parseItem(r.text), kind: 'relic', relic: r })),
    // Spellbooks are the whole of Cairn's magic and the study ignored them
    // until the simulator could read one. Only the spells with combat
    // mechanics are priced; listing the other 91 at zero would say something
    // false about them (see `modelSees`).
    ...ITEMS.spells
      .filter((sp) => SPELL_EFFECTS[sp.name])
      .map((sp) => ({ ...parseItem(`Spellbook: ${sp.name}`), kind: 'spellbook', spell: sp })),
    // The bombs. A blast sphere is one throw across the whole room, and the
    // most interesting entry in this table for it.
    ...CONSUMABLES.map((text) => ({ ...parseItem(text), kind: 'consumable' })),
  ];

  const results = [];
  catalogue.forEach((item, i) => {
    results.push(itemValue(characters, item, { trials, basket, seed }));
    if (onProgress) onProgress(i + 1, catalogue.length);
  });
  return results.sort((a, b) => (b.perSlot ?? b.averted * 2) - (a.perSlot ?? a.averted * 2));
}

/**
 * UNMODELLED. Which of a character's items the simulator can actually see —
 * needed so a study never implies "this relic is worthless" when it means
 * "this relic does something the model has no rules for".
 */
export function modelSees(item) {
  if (item.armor || item.damage || item.capacity) return true;
  if (item.uses && /STR/i.test(item.text || '')) return true;   // a healing draught
  if (item.spell && spellEffect(item)) return true;
  if (item.relic && relicEffect(item.relic)) return true;
  return false;
}

/**
 * The marginal value of the NEXT slot, measured rather than assumed.
 *
 * Cairn's inventory is the whole resource game, so the question "should I pick
 * this up?" has a real answer that changes as the pack fills — and the last
 * slot is worth nothing at all, because filling it drops you to 0 HP.
 */
export function slotCurve(characters, item, opts = {}) {
  const { trials = 250, basket = BASKET, seed = 'slots', filler = 'Iron Pot' } = opts;
  const curve = [];
  for (let ballast = 0; ballast <= 6; ballast++) {
    const load = Array.from({ length: ballast }, () => parseItem(filler));
    const withoutItem = characters.map((c) => combatantFromCharacter(c, load));
    const withItem = characters.map((c) => combatantFromCharacter(c, [...load, item]));
    curve.push({
      ballast,
      before: basketToll(withoutItem, { trials, basket, seed }),
      after: basketToll(withItem, { trials, basket, seed }),
    });
  }
  return curve.map((c) => ({ ...c, averted: c.before - c.after }));
}
