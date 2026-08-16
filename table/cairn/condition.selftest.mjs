// condition.selftest — run before touching condition.js:
//   node table/cairn/condition.selftest.mjs
//
// The allocator's failure mode is not a crash. It is handing out items with
// total confidence on the basis of measurements too noisy to tell them apart,
// which looks exactly like a good allocation until you check. So the tests
// below are mostly not about the code:
//
//   IS THE MEASUREMENT REAL? A blast sphere must measure far above a cooking
//   pot, and the error bars must be small enough to separate them. If they are
//   not, the screen is a random number generator with a progress bar.
//
//   DOES MEASURING BEAT GUESSING? The whole justification for spending two
//   seconds of simulation is that it beats `delve.js`'s instant hand-written
//   ranking. That is a claim, so it is measured, and if it ever stops being
//   true this file says so and condition.js should be deleted.
//
//   DOES IT OBEY CAIRN? The reserved slot is a rule — a full pack is 0 HP — and
//   an allocator that fills packs is actively harming the party it is kitting.

import { rollParty, packInventory, parseItem } from './roll.js';
import {
  rollHaul, allocate, condition, conditionByUtility, KIT_BASKET,
} from './condition.js';
import { basketToll } from './study.js';
import { combatantFromCharacter } from './combat.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. the haul ---------------------------------------------------------------
{
  const a = rollHaul('h1', { count: 8 });
  const b = rollHaul('h1', { count: 8 });
  const c = rollHaul('h2', { count: 8 });
  ok(a.items.length === 8, 'a haul is the size asked for');
  ok(a.items.map((i) => i.name).join() === b.items.map((i) => i.name).join(),
    'the same seed rolls the same haul — the conditioning step is part of the permalink');
  ok(a.items.map((i) => i.name).join() !== c.items.map((i) => i.name).join(),
    'a different seed rolls a different one');
  ok(a.items.every((i) => i.name && Number.isFinite(i.slots)),
    'every item is parsed, with a slot cost');

  // A haul drawn per-ITEM rather than per-KIND came out half spellbooks,
  // because the SRD has a hundred spells and six kinds of armour. This is the
  // tripwire for that regression.
  const big = rollHaul('h3', { count: 120 });
  const books = big.items.filter((i) => i.kind === 'spellbook').length / big.items.length;
  ok(books < 0.3, `spellbooks are a minority of a haul (${(books * 100).toFixed(0)}%) — ` +
    'a per-item weighting made them half of it');
  const kinds = new Set(big.items.map((i) => i.kind));
  ok(kinds.size >= 5, `a haul spans the loot kinds (${[...kinds].join(', ')})`);

  const bought = rollHaul('h1', { count: 10, source: 'bought', budget: 60 });
  ok(bought.spent <= 60, `a bought haul stays inside its budget (${bought.spent} of 60)`);
  ok(bought.items.every((i) => i.cost > 0), 'and everything in it has a price');
}

// 2. is the measurement real? -----------------------------------------------
//
// Not "does the allocator run" but "can it tell a bomb from a pot". Both are
// given to the same party from the same seeds, so the only difference is the
// item.
{
  const party = rollParty('meas', 4).members;
  const gainOf = (text) => {
    const item = parseItem(text);
    const out = condition(party, [item], { trials: 400, seed: 'meas' });
    const award = out.awards[0];
    if (award) return award;
    // Rejected — recover what it measured anyway, for the assertion below.
    return { gain: 0, se: 0 };
  };
  const bomb = gainOf('Blast Sphere (d12, *blast*, *bulky*, 1 use)');
  const pot = gainOf('Iron Pot');
  ok(bomb.gain > 0.05,
    `a blast sphere averts real harm (${bomb.gain.toFixed(3)} ± ${bomb.se.toFixed(3)})`);
  ok(bomb.gain > bomb.se * 3,
    `and does so far outside its own error (${(bomb.gain / (bomb.se || 1e-9)).toFixed(1)}σ) — ` +
    'if this drops the screen is reporting noise as insight');
  ok(pot.gain === 0, 'a cooking pot is not worth a slot, and is left on the floor');
}

// 3. it obeys Cairn's inventory ---------------------------------------------
{
  const party = rollParty('inv', 4).members;
  const haul = rollHaul('inv', { count: 8 });
  const out = condition(party, haul.items.map((i) => ({ ...i })), { trials: 200, seed: 'inv' });

  for (const m of out.members) {
    const inv = packInventory(m.gear);
    // "Anyone carrying a full inventory is reduced to 0 HP." An allocator that
    // fills a pack has knocked out the delver it was equipping.
    ok(inv.used <= inv.capacity - 1,
      `${m.name} keeps a slot free (${inv.used}/${inv.capacity}) — a full pack is 0 HP`);
  }
  const names = out.awards.map((a) => a.item.at);
  ok(new Set(names).size === names.length, 'no item is awarded twice');
  ok(out.awards.length + out.left.length <= haul.items.length,
    'every item is either awarded or accounted for as left behind');
  ok(out.awards.every((a) => !a.tiedWith.includes(a.to)),
    'nobody is ever reported as tied with themselves');
  ok(out.awards.every((a) => a.alternatives.length === 4),
    'every award records what the other three would have gained — the page shows the runners-up');
}

// 4. the stop rule ----------------------------------------------------------
{
  const party = rollParty('junk', 4).members;
  const junk = ['Iron Pot', 'Chalk', 'Tinderbox', 'Air Bladder', 'Fishing Rod'].map(parseItem);
  const out = condition(party, junk, { trials: 200, seed: 'junk' });
  ok(out.awards.length === 0,
    `a haul of junk is left on the floor (${out.awards.length} awarded)`);
  ok(out.left.length === junk.length, 'and every piece of it is explained, not silently dropped');
}

// 5. the generator and the runner agree -------------------------------------
{
  const party = rollParty('gen', 4).members;
  const haul = rollHaul('gen', { count: 5 });
  const it = allocate(party, haul.items.map((i) => ({ ...i })), { trials: 200, seed: 'gen' });
  let step = it.next();
  let yields = 0;
  let lastProgress = 0;
  while (!step.done) {
    yields++;
    ok(step.value.progress > lastProgress || yields === 1, 'progress only moves forwards');
    lastProgress = step.value.progress;
    step = it.next();
  }
  const straight = condition(party, haul.items.map((i) => ({ ...i })), { trials: 200, seed: 'gen' });
  ok(yields > 0, `the generator reports progress (${yields} steps) so a page can draw a bar`);
  ok(JSON.stringify(step.value.awards.map((a) => [a.item.name, a.to]))
    === JSON.stringify(straight.awards.map((a) => [a.item.name, a.to])),
  'and stepping it gives exactly what running it does');
}

// 6. THE CLAIM: measuring beats guessing ------------------------------------
//
// `conditionByUtility` is delve.js's instant hand-written ranking. If two
// seconds of simulation does not beat it, condition.js is not earning its
// place and should go. Judged at high trial count on seeds neither allocator
// saw, so neither is being marked by its own examiner.
{
  const JUDGE = 1500;
  const score = (chars, seed) => basketToll(chars.map((c) => combatantFromCharacter(c)),
    { trials: JUDGE, basket: KIT_BASKET, seed: `judge/${seed}` });

  let bare = 0, guessed = 0, measured = 0, net = 0;
  const N = 5;
  for (let i = 0; i < N; i++) {
    const seed = `beat/${i}`;
    const party = rollParty(seed, 4).members;
    const haul = rollHaul(seed, { count: 7 });
    const m = condition(party, haul.items.map((x) => ({ ...x })), { trials: 300, seed });
    const g = conditionByUtility(party, haul.items.map((x) => ({ ...x })));
    const [b, gs, ms] = [score(party, seed), score(g.members, seed), score(m.members, seed)];
    bare += b; guessed += gs; measured += ms;
    if (ms < gs - 0.002) net++; else if (ms > gs + 0.002) net--;
  }
  const mean = (x) => (x / N).toFixed(4);
  ok(measured < bare,
    `kitting a party out helps at all (toll ${mean(measured)} vs ${mean(bare)} bare)`);
  ok(measured <= guessed,
    `and MEASURING beats guessing (${mean(measured)} vs ${mean(guessed)} by delve.js's ranking) — ` +
    'if this reverses, condition.js is two seconds of simulation buying nothing and should be deleted');
  ok(net >= 0, `measuring wins more parties than it loses (net ${net} of ${N})`);
}

console.log(`condition.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
