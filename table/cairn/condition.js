// table/cairn/condition.js — kitting a party out, by measurement.
//
// A rolled Cairn party is a party on its first morning. Between the roll and
// the dungeon there is a step nobody writes down: someone bought the shield,
// someone else ended up with the bomb, and the spellbook went to whoever was
// going to read it. This file does that step, and it does it by *measuring*
// who gains most from each thing rather than by asserting a taxonomy of
// classes — Cairn has no classes, which is rather the point of Cairn.
//
//   gain(item, holder) = basket toll without it − basket toll with it
//
// which is the same currency `study.js` prices items in, and the same currency
// the encounter oracle reports. So an allocation here can be read straight
// across to a verdict there.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE THING THAT MAKES THIS HONEST, AND IT IS NOT THE ALLOCATOR.
//
// Before writing a line of the allocator, the noise floor was measured, because
// a greedy allocator will happily rank items whose difference it cannot see and
// print a confident answer. On a three-encounter basket, one holder in four:
//
//   Blast Sphere   averted 0.196 ± 0.011 at 150 trials   → signal/noise 18
//   Chainmail      averted 0.036 ± 0.019 at 150 trials   → signal/noise  1.9
//   Shield         averted 0.016 ± 0.012 at 150 trials   → signal/noise  1.3
//
// At the trial counts a web page can afford, "who should carry the bomb" is a
// question with an answer and "which of these two similar trinkets is better"
// is not. So every gain below carries a standard error, computed by splitting
// each measurement into independent blocks, and any choice made inside that
// error is REPORTED AS A TIE rather than dressed up as a finding. That is the
// whole difference between a measured screen and a plausible one.
//
// Rules text quoted in comments is Cairn 2e by Yochai Gal, CC BY-SA 4.0. The
// allocation model is ours.

import { makeRng, parseItem, packInventory } from './roll.js';
import { combatantFromCharacter } from './combat.js';
import { basketToll } from './study.js';
import { ITEMS } from './items.js';
import { itemUtility, tryCarry, rollLoot } from './delve.js';

/**
 * The fights the allocation is judged against. Deliberately smaller than
 * `study.js`'s six — a swarm, a middleweight pack and one big single monster —
 * because this runs interactively and the three shapes are what change an
 * item's worth. Armour matters against the swarm, a big die against the ogre.
 */
export const KIT_BASKET = [
  { id: 'goblin', count: 5 },
  { id: 'bandit', count: 3 },
  { id: 'ogre', count: 1 },
];

// ------------------------------------------------------------------ the haul

/**
 * What is on the table to be distributed.
 *
 * Two sources, because the player's question has two forms — "what would they
 * have found over time" and "what would they have chosen from the outset":
 *
 *   found  — loot, weighted the way `delve.js` weights it. Includes relics,
 *            spellbooks and bombs, which is where the interesting decisions are.
 *   bought — the market, filtered to things that do something in a fight, with
 *            a coin budget. Cheaper, duller, and the honest answer to "we spent
 *            our starting gold sensibly".
 */
export function rollHaul(seed, { count = 8, source = 'found', budget = 120 } = {}) {
  const rng = makeRng(`haul/${seed}/${source}`);
  const pick = (list) => list[rng.d(list.length) - 1];

  if (source === 'bought') {
    // Only what the model can act on. A ten-foot pole is a fine purchase and an
    // uninteresting one here; listing it would pad the screen with zeroes.
    const stock = [
      ...ITEMS.market.armor.map((a) => ({ ...parseItem(a.text), kind: 'armor', cost: a.cost })),
      ...ITEMS.market.weapons.map((w) => ({ ...parseItem(w.text), kind: 'weapon', cost: w.cost })),
    ];
    const haul = [];
    let spent = 0;
    let guard = stock.length * 6;
    while (haul.length < count && guard-- > 0) {
      const item = pick(stock);
      if (spent + item.cost > budget) continue;
      spent += item.cost;
      haul.push({ ...item });
    }
    return { items: haul, spent, budget, source };
  }

  // "found": exactly `delve.js`'s loot table, not a second one written here.
  // A first draft did weight its own table and produced hauls that were half
  // spellbooks, because it weighted per ITEM and there are a hundred spells and
  // six kinds of armour. delve.js weights per KIND, which is the correct model
  // and is already the one the rest of the site delves with.
  //
  // It draws plenty of inert gear, and that is not a flaw in the haul: the
  // allocator leaving a pot on the floor is a true statement about the pot.
  const items = Array.from({ length: count }, () => rollLoot(rng));
  return { items, spent: 0, budget: 0, source };
}

// ------------------------------------------------------- measuring with error

/**
 * Mean and standard error of a paired before/after measurement.
 *
 * The trials are split into `blocks` independent groups and the DIFFERENCE is
 * taken within each block, not between two pooled means. That matters: before
 * and after share their dice, so the paired difference has far less variance
 * than either side, and differencing the pooled means would throw that away
 * and then report a standard error several times too large.
 */
function pairedGain(baseChars, item, holder, { trials, basket, seed, blocks = 4 }) {
  const per = Math.max(1, Math.round(trials / blocks));
  const diffs = [];
  for (let b = 0; b < blocks; b++) {
    const s = `${seed}/b${b}`;
    const before = basketToll(baseChars.map((c) => combatantFromCharacter(c)),
      { trials: per, basket, seed: s });
    const after = basketToll(
      baseChars.map((c, i) => combatantFromCharacter(c, i === holder ? [item] : [])),
      { trials: per, basket, seed: s });
    diffs.push(before - after);
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.length > 1
    ? diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / (diffs.length - 1)
    : 0;
  return { mean, se: Math.sqrt(variance / diffs.length) };
}

// -------------------------------------------------------------- the allocator

/**
 * Hand out a haul, best item to whoever gains most, one at a time.
 *
 * A GENERATOR, so a page can draw a progress bar over several seconds of
 * simulation without freezing. Yields `{ done: false, progress, of, note }`
 * as it works and returns the allocation.
 *
 * Re-measuring after every assignment is the expensive part and it is not
 * optional: a second shield is worth much less than the first, and a version
 * that scored every item once against the starting party handed one delver
 * three sets of armour and called it specialisation.
 */
export function* allocate(characters, haul, opts = {}) {
  const {
    trials = 400, basket = KIT_BASKET, seed = 'kit', blocks = 4,
    reserve = 1,          // the slot Cairn's full-pack rule says to leave empty
    tieFactor = 1,        // "within one standard error" counts as a tie
  } = opts;

  // Working copies: giving someone an item re-packs their inventory, and the
  // cost of what it pushes out belongs in the next measurement.
  const held = characters.map((c) => ({ ...c, gear: c.gear.map((g) => ({ ...g })) }));
  const remaining = haul.map((item, i) => ({ ...item, at: i }));
  const awards = [];
  const left = [];

  const steps = remaining.length * held.length + (remaining.length * (remaining.length - 1)) / 2;
  let done = 0;

  // gains[itemIndex][holder] — null means "must be measured".
  const gains = new Map(remaining.map((it) => [it.at, held.map(() => null)]));

  while (remaining.length) {
    for (const item of remaining) {
      const row = gains.get(item.at);
      for (let h = 0; h < held.length; h++) {
        if (row[h]) continue;
        // Someone with no room for it gains nothing by definition; skip the
        // simulation rather than measure a zero at full price.
        const inv = packInventory(held[h].gear);
        row[h] = (item.slots > inv.capacity - inv.used - reserve)
          ? { mean: -Infinity, se: 0, noRoom: true }
          : pairedGain(held, item, h, { trials, basket, seed: `${seed}/${item.at}/${h}`, blocks });
        done++;
        yield { done: false, progress: done, of: steps, note: `${item.name} → ${held[h].name}` };
      }
    }

    // The best (item, holder) pair on the table.
    let best = null;
    for (const item of remaining) {
      gains.get(item.at).forEach((g, h) => {
        if (!best || g.mean > best.g.mean) best = { item, h, g };
      });
    }
    if (!best || !Number.isFinite(best.g.mean)) break;

    // NOTHING LEFT IS WORTH A SLOT. Stopping here rather than distributing the
    // whole haul is the point: a slot spent on a thing that averts nothing is a
    // slot spent making the carrier worse, because the tenth one drops them to
    // 0 HP. Judged against the item's own error, not against zero.
    if (best.g.mean <= best.g.se * tieFactor) {
      for (const item of remaining) {
        left.push({ item, why: 'nothing left averts more harm than the slot costs' });
      }
      break;
    }

    // Who else was within noise of the winner? If anybody was, this was a
    // TIE broken by a stated rule, and the page says so instead of implying
    // the simulator saw a difference it did not see.
    const row = gains.get(best.item.at);
    const band = best.g.mean - best.g.se * tieFactor;
    const within = row
      .map((g, h) => ({ h, g }))
      .filter((x) => Number.isFinite(x.g.mean) && x.g.mean >= band);
    // The tiebreak, stated: whoever has the most room. It is a real reason (a
    // fuller pack is closer to Cairn's 0 HP cliff) and it is not a claim about
    // the item. `tiedWith` is computed against the holder ACTUALLY chosen —
    // the first version listed everyone within the band including the winner,
    // so a page could print "Faunus, tied with Faunus".
    const room = (h) => {
      const inv = packInventory(held[h].gear);
      return inv.capacity - inv.used;
    };
    const holder = within.length > 1
      ? within.map((x) => x.h).sort((a, b) => room(b) - room(a))[0]
      : best.h;
    const tied = within.filter((x) => x.h !== holder);

    const { kept, dropped } = tryCarry(held[holder].gear, best.item, reserve);
    if (!kept) {
      // The allocator wanted it and the pack would not take it. Record that
      // rather than silently dropping the item on the floor.
      left.push({ item: best.item, why: `${held[holder].name} has nothing worth swapping out for it` });
    } else {
      awards.push({
        item: best.item,
        to: held[holder].name,
        holder,
        gain: best.g.mean,
        se: best.g.se,
        tiedWith: tied.map((t) => held[t.h].name),
        droppedFor: [dropped].flat().filter(Boolean).map((d) => d.name),
        alternatives: row.map((g, h) => ({ who: held[h].name, gain: g.mean, se: g.se, noRoom: !!g.noRoom })),
      });
      // Everything this member's column claimed is now stale.
      for (const item of remaining) gains.get(item.at)[holder] = null;
    }
    remaining.splice(remaining.indexOf(best.item), 1);
    gains.delete(best.item.at);
  }

  return { members: held, awards, left, basket, trials, blocks };
}

/** The whole job, run to completion. Node and selftests want this; pages don't. */
export function condition(characters, haul, opts = {}) {
  const it = allocate(characters, haul, opts);
  let step = it.next();
  while (!step.done) step = it.next();
  return step.value;
}

/**
 * A crude, instant allocation for comparison — items to whoever `delve.js`'s
 * hand-written utility ranking likes, which is how the delve model has always
 * distributed loot.
 *
 * It exists so the selftest can ask whether measuring actually beats guessing.
 * If it ever stops beating it, the several seconds of simulation above are not
 * being earned and this file should be deleted in its favour.
 */
export function conditionByUtility(characters, haul, { reserve = 1 } = {}) {
  const held = characters.map((c) => ({ ...c, gear: c.gear.map((g) => ({ ...g })) }));
  const awards = [];
  for (const item of haul) {
    // Whoever has the most room takes it; ties by order. No measurement.
    const room = (c) => {
      const inv = packInventory(c.gear);
      return inv.capacity - inv.used;
    };
    const order = held.map((c, h) => ({ c, h })).sort((a, b) => room(b.c) - room(a.c));
    for (const { c, h } of order) {
      if (itemUtility(item) <= 0) break;
      const { kept } = tryCarry(c.gear, item, reserve);
      if (kept) { awards.push({ item, to: c.name, holder: h }); break; }
    }
  }
  return { members: held, awards, left: [] };
}
