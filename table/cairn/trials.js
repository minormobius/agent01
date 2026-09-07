// table/cairn/trials.js — a ladder of fights, and what a party has left after.
//
// The oracle answers "what does this fight cost?" as an average over five
// thousand runs. That is the right number for prep and the wrong number for
// the question a player actually has, which is "what happens to US". An average
// has no memory: it starts every fight from full and never carries a wound.
// This does the opposite — ONE fight, really rolled, and then the party lives
// with it.
//
// WHAT CARRIES, AND WHY IT IS CAIRN'S ANSWER AND NOT OURS.
//
//   Hit protection comes back.  "Restoring HP requires a few moments' rest and
//                                some water." A short rest between rungs.
//   Strength does not.          Ability loss needs a week's rest or magic. STR
//                               is therefore the resource the run spends, and
//                               it is the one that kills you: damage overflows
//                               into it, and 0 STR is death.
//   The fallen need an ally.    A PC on critical damage "is unable to act and
//                               will die in one hour unless stabilised". So a
//                               body only survives the rung if somebody is left
//                               standing to reach it — and a total party knock
//                               down is a total party kill.
//
// That is the whole attrition model, and none of it is invented: it falls out
// of reading Cairn's recovery rules as rules rather than as flavour.
//
// THE LADDER SCALES TO THE PARTY, MEASURED. Each rung is not "more goblins than
// last time". It is an encounter SEARCHED FOR against the party exactly as they
// now stand — bleeding, short a member, carrying what they were awarded — until
// one lands near the rung's target toll. A party that has been mauled gets an
// easier fifth rung than a party that has not, because the fifth rung is
// defined by what it costs them, not by what is in it.
//
// Rules text quoted in comments is Cairn 2e by Yochai Gal, CC BY-SA 4.0. The
// ladder, the toll targets and the run structure are ours.

import { makeRng } from './roll.js';
import { BESTIARY } from './monsters.js';
import {
  assess, simulate, band, combatantFromCharacter, combatantFromMonster,
} from './combat.js';
import { rollHaul, allocate, extrasOf } from './condition.js';

/**
 * The rungs, as target tolls rather than band names.
 *
 * Bands are four buckets and a ladder needs finer steps than that, so the
 * targets walk smoothly across them: routine, risky, risky, deadly, deadly,
 * deadly, lethal, lethal. The last two are meant to end the run — a roguelite
 * whose ladder can be finished by attrition alone has no ending.
 */
export const RUNGS = [0.03, 0.08, 0.14, 0.20, 0.27, 0.35, 0.45, 0.60];

/**
 * TWO LADDERS, because the obvious one has a property that took measuring to
 * notice and would have been a lie to leave unsaid.
 *
 *   scaled — each rung is searched against the party AS THEY NOW STAND. This is
 *            the natural reading of "scaling in difficulty", and it is
 *            REWARD-INVARIANT: the rung targets a toll, so a party that has
 *            grown stronger is simply handed a bigger fight, and the odds are
 *            the same as before the reward. Measured over 20 runs, kitting a
 *            party out first moved completion from 25% to 35% — and nearly all
 *            of that came from the rungs where the ladder could NOT reach its
 *            target, not from the ones where it could. Rewards here change what
 *            you fight, not whether you live.
 *
 *   fixed  — every rung is searched once, against the party as they ENTER, and
 *            then stands still. Growing stronger genuinely gets you further and
 *            losing a member genuinely dooms you. This is what most roguelites
 *            actually do, and it is the mode where the loot matters.
 *
 * Neither is the "right" one. Offering both, and saying which is which, is
 * better than shipping the first and letting a player conclude the rewards were
 * doing something they were not.
 */
export const MODES = ['scaled', 'fixed'];

const alive = (c) => !c.down;

/**
 * Find a fight worth about `target` against this party, as they now stand.
 *
 * Draw a creature, check what one of it costs, and reject it if a SINGLE one
 * already overshoots — a first version binary-searched the count without that
 * check and offered a lone Nightmare as a "routine" opening rung, because the
 * search cannot go below one. Then scale the count up to the target.
 */
export function findRung(pcs, target, { seed = 'rung', trials = 200, maxCount = 14, draws = 24 } = {}) {
  const rng = makeRng(seed);
  const live = pcs.filter(alive);
  if (!live.length) return null;

  let fallback = null;
  for (let draw = 0; draw < draws; draw++) {
    const monster = BESTIARY[rng.d(BESTIARY.length) - 1];
    const foesOf = (n) => Array.from({ length: n }, (_, i) => combatantFromMonster(monster, i));
    const solo = assess(live, foesOf(1), { trials, seed: `${seed}/${monster.id}/1` });
    // Keep the closest overshoot in case nothing gentle enough turns up — the
    // run should offer SOMETHING rather than stall.
    if (!fallback || Math.abs(solo.toll - target) < Math.abs(fallback.verdict.toll - target)) {
      fallback = { monster, count: 1, verdict: solo };
    }
    if (solo.toll > target * 1.35) continue;   // one of these is already too much

    let best = { monster, count: 1, verdict: solo };
    for (let n = 2; n <= maxCount; n++) {
      const verdict = assess(live, foesOf(n), { trials, seed: `${seed}/${monster.id}/${n}` });
      if (Math.abs(verdict.toll - target) < Math.abs(best.verdict.toll - target)) {
        best = { monster, count: n, verdict };
      }
      if (verdict.toll > target) break;        // overshot; more only gets worse
    }
    if (Math.abs(best.verdict.toll - target) <= Math.max(0.04, target * 0.35)) {
      return { ...best, target, band: best.verdict.band };
    }
    if (Math.abs(best.verdict.toll - target) < Math.abs(fallback.verdict.toll - target)) {
      fallback = best;
    }
  }
  return fallback ? { ...fallback, target, band: fallback.verdict.band, approximate: true } : null;
}

// ---------------------------------------------------------------- the roster
//
// A run's state is kept as (character, extras, wounds) rather than as live
// combatants. Awarding an item means re-deriving the combatant from the
// character and its pack, which would silently restore everyone's Strength if
// the wounds were not held separately. Keeping them apart makes that mistake
// impossible rather than merely unlikely.

/** Start a run. `characters` are rolled characters; `extras` any kit they carry. */
export function newRun(characters, { seed = 'trials', extras = null, mode = 'scaled' } = {}) {
  return {
    seed,
    mode,
    rung: 0,
    over: false,
    outcome: null,
    history: [],
    roster: characters.map((c, i) => ({
      character: c,
      extras: extras && extras[i] ? extras[i].map((x) => ({ ...x })) : [],
      // STR loss carries; hit protection does not. `null` means undamaged.
      str: null,
      dead: false,
      fell: 0,           // how many times they have gone down and been dragged back
    })),
  };
}

/** The roster as combatants, wounds and all. Fresh objects every call. */
export function combatants(run) {
  return run.roster.map((r) => {
    const c = combatantFromCharacter(r.character, r.extras);
    if (r.str !== null) { c.STR = r.str; }
    if (r.dead) { c.down = true; c.dead = true; c.hp = 0; c.STR = 0; }
    return c;
  });
}

/** Who can still be sent in. */
export const standing = (run) => run.roster.filter((r) => !r.dead);

// ------------------------------------------------------------------ one rung

/**
 * Fight one rung for real, then apply Cairn's recovery rules to what is left.
 *
 * Returns the trial record. Mutates `run`.
 */
export function fightRung(run, rung, { seed = null } = {}) {
  const fightSeed = seed || `${run.seed}/rung/${run.rung}`;
  const rng = makeRng(fightSeed);

  // Each roster entry keeps a REFERENCE to the combatant it sent in, rather
  // than trusting position. A summon spell pushes an extra combatant onto the
  // party array mid-fight (tagged `summoned`), so after any run where someone
  // read a summoning spellbook, `pcs[k]` is not `sent[k]` — and reading the
  // wounds back by index threw, or worse, would have written one delver's
  // Strength onto another.
  const sent = run.roster.filter((r) => !r.dead).map((r) => {
    const c = combatantFromCharacter(r.character, r.extras);
    if (r.str !== null) c.STR = r.str;
    return { r, c };
  });
  const pcs = sent.map((x) => x.c);
  const foes = Array.from({ length: rung.count }, (_, i) => combatantFromMonster(rung.monster, i));

  const result = simulate(pcs, foes, rng, { log: true });

  // WHO IS LEFT STANDING decides who wakes up. "A PC that takes critical damage
  // is unable to act and will die in one hour unless stabilised by an ally."
  //
  // Withdrawing sets `down` too — it is how the fight marks somebody as out of
  // it — but a delver who walked away is on their feet and can come back for
  // the bodies. Both lines below have to know that, and an earlier version got
  // the second one wrong and "stabilised" people who had simply left.
  const walked = (c) => !!c.withdrawn;
  // Summons do not carry anyone home; only the party counts.
  const upright = sent.filter((x) => walked(x.c) || alive(x.c)).length;
  const stabilised = [];
  const lost = [];

  for (const { r, c } of sent) {
    r.str = c.STR;
    if (c.dead) { r.dead = true; lost.push(r.character.name); continue; }
    if (walked(c)) continue;
    if (c.down) {
      if (upright > 0) { r.fell++; stabilised.push(r.character.name); }
      else { r.dead = true; lost.push(r.character.name); }
    }
  }

  // Hit protection is restored by the rest between rungs; nothing else is.
  // (There is nothing to write: `combatants()` reads hp off the character.)
  const trial = {
    rung: run.rung,
    target: rung.target,
    monster: rung.monster.name,
    count: rung.count,
    forecast: { toll: rung.verdict.toll, swing: rung.verdict.swing, band: rung.verdict.band },
    approximate: !!rung.approximate,
    rounds: result.rounds,
    routed: result.routed,
    lost,
    stabilised,
    // What actually happened, against what was forecast. A run where every
    // rung came in worse than the oracle said is a run that got unlucky, and
    // the page can show that instead of leaving the player to feel cheated.
    actualToll: (lost.length + stabilised.length) / (sent.length || 1),
    log: result.log,
    survivors: standing(run).map((r) => r.character.name),
  };
  run.history.push(trial);
  run.rung++;

  if (!standing(run).length) { run.over = true; run.outcome = 'wiped'; }
  else if (run.rung >= RUNGS.length) { run.over = true; run.outcome = 'survived'; }

  return trial;
}

/**
 * The reward between rungs, allocated the same measured way the kit screen
 * allocates one. A generator, because it is the slow part of a run.
 */
export function* rewardRung(run, { count = 3, trials = 250 } = {}) {
  const live = standing(run);
  if (!live.length) return { awards: [], left: [] };
  const haul = rollHaul(`${run.seed}/reward/${run.rung}`, { count });
  // The allocator works on characters, so hand it the character-plus-pack each
  // survivor is actually carrying rather than the sheet they were rolled with.
  const asChars = live.map((r) => ({
    ...r.character,
    gear: [...r.character.gear, ...r.extras].map((g) => ({ ...g })),
  }));
  const out = yield* allocate(asChars, haul.items, { trials, seed: `${run.seed}/reward/${run.rung}` });
  // Read the allocation back onto the run. `extrasOf` diffs against the sheet
  // as ROLLED, not against what they were already carrying, so the result is
  // the whole pack-beyond-the-sheet rather than just this round's winnings.
  const gained = extrasOf(out.members, live.map((r) => r.character));
  gained.forEach((kept, k) => { live[k].extras = kept; });
  return out;
}

/** A whole run, no page — for selftests and for measuring the ladder itself. */
export function runLadder(characters, {
  seed = 'trials', rungs = RUNGS, trials = 150, rewards = true, rewardSize = 3, extras = null,
  mode = 'scaled',
} = {}) {
  const run = newRun(characters, { seed, extras });
  run.mode = mode;
  const entry = combatants(run);
  for (const target of rungs) {
    if (run.over) break;
    // In `fixed` mode the rung is weighed against the party that walked in, so
    // it does not shrink when they are hurt or grow when they are rewarded.
    const against = mode === 'fixed' ? entry : combatants(run).filter(alive);
    const rung = findRung(against, target, { seed: `${seed}/find/${run.rung}`, trials });
    if (!rung) { run.over = true; run.outcome = 'no fight found'; break; }
    fightRung(run, rung);
    if (rewards && !run.over) {
      const it = rewardRung(run, { count: rewardSize, trials: 200 });
      let step = it.next();
      while (!step.done) step = it.next();
    }
  }
  if (!run.over) { run.over = true; run.outcome = 'survived'; }
  return run;
}

export { band };
