// table/cairn/run.js — the roguelite. A party, a ladder, and a choice between
// every fight.
//
// The other screens on this surface are instruments: they answer questions
// about a party. This one is a GAME, and the difference is that the player
// makes the decisions and then has to live in the consequences. Concretely:
//
//   the fights are PILOTED — you choose every action, using the same generator
//   the arena pilots and the oracle simulates, so nothing here resolves under
//   different rules from the numbers that forecast it;
//
//   between fights you choose ONE of two things — bind wounds, or open a pack
//   of three and decide who carries what. You cannot do both, which is what
//   makes it a decision rather than a menu;
//
//   and the advancement is Cairn's own, which is the part worth explaining.
//
// ─────────────────────────────────────────────────────────────────────────────
// THERE IS NO EXPERIENCE CURVE, AND THAT IS NOT AN OMISSION.
//
// Cairn has no XP, no levels and no advancement track. It has the Scars table:
//
//   "Whenever a PC's HP is reduced to exactly 0, roll on the Scars table."
//
// Nine of its twelve rows RAISE A MAXIMUM — "roll 1d6, if the total is higher
// than your max HP, take the new result" — so a character grows by surviving
// the moment they nearly died, and only then. It is a better roguelite engine
// than a curve, because the reward is welded to the risk: you cannot grind it,
// you can only earn it by being hit exactly hard enough.
//
// EXACTLY is doing real work in that sentence. One more point of damage and it
// overflows into Strength, which is critical damage and possibly death, and
// pays nothing. `combat.js` records the flag at precisely that boundary.
//
// Measured over 1,600 fights, four kinds of encounter:
//
//   5 goblins   34% of fights leave a scar · 0.44 per fight · 0.04 deaths
//   4 skeletons 37% ·············· 0.43 ··················· · 0.03
//   3 wolves    37% ·············· 0.45 ··················· · 0.12
//   1 ogre      12% ·············· 0.12 ··················· · 0.03
//
// So an ordinary fight scars somebody a third of the time and kills nobody
// nineteen times in twenty — which is exactly the shape a run needs. The ogre
// line is the mechanic showing its face: one big die overshoots zero and lands
// in Strength, so **swarms make veterans and giants make corpses**.
//
// Rules text quoted here is Cairn 2e by Yochai Gal, CC BY-SA 4.0. The ladder,
// the pack sizes, the heal-or-loot choice and the run structure are ours.

import { makeRng, packInventory, parseItem } from './roll.js';
import {
  fight, combatantFromCharacter, combatantFromMonster, applyScars,
} from './combat.js';
import { partyWithGear } from './formation.js';
import { rollHaul, allocate, extrasOf, KIT_BASKET } from './condition.js';
import { RUNGS, findRung } from './trials.js';

export const PACK_SIZE = 3;

/** What a rest is worth. Cairn restores HP on a short rest and nothing else. */
export const HEAL = {
  /**
   * "Restoring HP requires a few moments' rest and some water." That is free
   * and automatic between rungs, so a rest that costs you a loot pack has to
   * buy something a rest does not: Strength, which normally wants a week.
   *
   * d4 per surviving member, capped at their maximum. Our number, not Cairn's,
   * and it is labelled as such on the page — the alternative was making the
   * choice a non-choice, since hit protection comes back for free anyway.
   */
  strDice: 4,
};

// ------------------------------------------------------------------ the state

/**
 * A run is (formation, rung, roster, pending choice) and nothing else. Every
 * character is rebuilt from the formation plus their own accumulated scars and
 * winnings, never carried as a mutated object — the same discipline the
 * trials use, for the same reason: a summon or a re-equip must not be able to
 * quietly rewrite somebody's Strength.
 */
export function newRun(formation, { seed = null } = {}) {
  const base = partyWithGear(formation);
  return {
    formation,
    seed: seed || formation.seed,
    rung: 0,
    phase: 'scouting',      // scouting -> fighting -> spoils -> scouting … -> over
    over: false,
    outcome: null,
    history: [],
    pending: null,          // the rung being offered or fought
    spoils: null,           // the choice on the table
    roster: base.map((character) => ({
      character,
      won: [],              // items taken from packs
      scars: [],            // d12 rolls, in the order they were earned
      bonus: { hp: 0, STR: 0, DEX: 0, WIL: 0 },  // what those scars raised
      str: null,            // current Strength; null = undamaged
      dead: false,
      fell: 0,
    })),
  };
}

/** One roster entry as the sheet it has become: scars, winnings and all. */
export function sheetOf(entry) {
  const c = entry.character;
  const a = c.attributes;
  return {
    ...c,
    hp: c.hp + entry.bonus.hp,
    attributes: {
      STR: a.STR + entry.bonus.STR,
      DEX: a.DEX + entry.bonus.DEX,
      WIL: a.WIL + entry.bonus.WIL,
    },
    gear: [...c.gear, ...entry.won],
  };
}

/** The roster as combatants, wounds included. */
export function combatants(run, { live = false } = {}) {
  const out = [];
  for (const e of run.roster) {
    if (live && e.dead) continue;
    const c = combatantFromCharacter(sheetOf(e));
    if (e.str !== null) c.STR = e.str;
    if (e.dead) { c.down = true; c.dead = true; c.hp = 0; c.STR = 0; }
    out.push(c);
  }
  return out;
}

export const standing = (run) => run.roster.filter((e) => !e.dead);

// ----------------------------------------------------------------- scouting

/** Weigh the next rung against the party as they now stand. */
export function scout(run, { trials = 200 } = {}) {
  if (run.over) return null;
  const live = combatants(run, { live: true });
  if (!live.length) { run.over = true; run.outcome = 'wiped'; return null; }
  run.pending = findRung(live, RUNGS[run.rung],
    { seed: `${run.seed}/find/${run.rung}`, trials });
  if (!run.pending) { run.over = true; run.outcome = 'no fight found'; return null; }
  run.phase = 'fighting';
  return run.pending;
}

// ----------------------------------------------------------------- the fight

/**
 * The rung as a PILOTED fight. Returns the generator plus the combatants it is
 * mutating, so a page can draw them as the fight moves; `settle` reads the
 * result back onto the run.
 *
 * The same `fight()` the oracle drives with no pilot. That is the whole reason
 * the forecast on the previous screen means anything.
 */
export function enterRung(run) {
  const sent = run.roster.filter((e) => !e.dead).map((e) => {
    const c = combatantFromCharacter(sheetOf(e));
    if (e.str !== null) c.STR = e.str;
    return { entry: e, combatant: c };
  });
  const foes = Array.from({ length: run.pending.count },
    (_, i) => combatantFromMonster(run.pending.monster, i));
  const pcs = sent.map((x) => x.combatant);
  const rng = makeRng(`${run.seed}/rung/${run.rung}`);
  return {
    sent,
    pcs,
    foes,
    generator: fight(pcs, foes, rng, { pilot: true, log: true, events: true }),
  };
}

/**
 * Read a finished fight back onto the run: wounds, deaths, and scars.
 *
 * The scars are rolled HERE rather than inside the fight, off the run's own
 * stream. Two reasons, and the second is the one that matters: the fight's RNG
 * is pinned call-for-call by a fingerprint test, and a scar is a change to a
 * character sheet rather than an event in a combat.
 */
export function settle(run, { sent, pcs }, result) {
  const walked = (c) => !!c.withdrawn;
  const upright = sent.filter((x) => walked(x.combatant) || !x.combatant.down).length;
  const rng = makeRng(`${run.seed}/scars/${run.rung}`);
  const trial = {
    rung: run.rung,
    target: run.pending.target,
    monster: run.pending.monster.name,
    count: run.pending.count,
    forecast: { ...run.pending.verdict },
    rounds: result.rounds,
    routed: result.routed,
    lost: [],
    stabilised: [],
    scarred: [],
    log: result.log,
  };

  for (const { entry, combatant: c } of sent) {
    entry.str = c.STR;
    if (c.dead) { entry.dead = true; trial.lost.push(entry.character.name); continue; }
    if (!walked(c) && c.down) {
      // "…dies in one hour unless stabilised by an ally."
      if (upright > 0) { entry.fell++; trial.stabilised.push(entry.character.name); }
      else { entry.dead = true; trial.lost.push(entry.character.name); continue; }
    }
    // THE ADVANCEMENT. One roll per time they were brought to exactly 0.
    for (let i = 0; i < (c.scarred || 0); i++) {
      const before = sheetOf(entry);
      const after = applyScars(before, 1, `${run.seed}/scar/${run.rung}/${entry.character.name}/${i}`);
      entry.bonus.hp += after.hp - before.hp;
      for (const k of ['STR', 'DEX', 'WIL']) {
        entry.bonus[k] += after.attributes[k] - before.attributes[k];
      }
      // A raised maximum Strength is not healing: the delver is still hurt by
      // as much as they were. Only the ceiling moved.
      const roll = after.scars[0];
      entry.scars.push(roll);
      trial.scarred.push({ who: entry.character.name, roll,
        hp: after.hp - before.hp,
        STR: after.attributes.STR - before.attributes.STR,
        DEX: after.attributes.DEX - before.attributes.DEX,
        WIL: after.attributes.WIL - before.attributes.WIL });
    }
  }
  void rng;

  trial.cost = (trial.lost.length + trial.stabilised.length) / (sent.length || 1);
  run.history.push(trial);
  run.rung += 1;

  if (!standing(run).length) { run.over = true; run.outcome = 'wiped'; run.phase = 'over'; }
  else if (run.rung >= RUNGS.length) { run.over = true; run.outcome = 'survived'; run.phase = 'over'; }
  else { run.phase = 'spoils'; run.spoils = offerSpoils(run); }
  return trial;
}

// ---------------------------------------------------------------- the spoils

/**
 * The choice: bind wounds, or open a pack.
 *
 * Exactly one, because a game is a sequence of things you cannot both have.
 * The pack is drawn now rather than when you pick it, so the player is choosing
 * between a KNOWN rest and a KNOWN three cards — not between a rest and a
 * mystery, which is not a decision, it is a gamble with extra steps.
 */
export function offerSpoils(run) {
  const haul = rollHaul(`${run.seed}/pack/${run.rung}`,
    { count: PACK_SIZE, source: 'found' });
  return {
    rung: run.rung,
    pack: haul.items.map((item, at) => ({ ...item, at })),
    heal: standing(run).map((e) => {
      const max = sheetOf(e).attributes.STR;
      const now = e.str === null ? max : e.str;
      return { who: e.character.name, now, max, missing: max - now };
    }),
    taken: null,
  };
}

/** Bind wounds: d4 Strength back to everyone standing, never past the maximum. */
export function takeHeal(run) {
  if (!run.spoils || run.spoils.taken) return null;
  const rng = makeRng(`${run.seed}/heal/${run.rung}`);
  const healed = [];
  for (const e of standing(run)) {
    const max = sheetOf(e).attributes.STR;
    const now = e.str === null ? max : e.str;
    const back = Math.min(max - now, rng.d(HEAL.strDice));
    if (back > 0) e.str = now + back;
    healed.push({ who: e.character.name, back, to: e.str === null ? max : e.str, max });
  }
  run.spoils.taken = { kind: 'heal', healed };
  run.phase = 'scouting';
  return healed;
}

/**
 * Take the pack. `placement` is an array of `{ at, holder }` — which card goes
 * to which surviving member; a card with no entry is left behind.
 *
 * Placement is the PLAYER'S, deliberately. `advise` below will tell them what
 * the simulator would do, and the difference between "here is the answer" and
 * "here is what the oracle thinks" is the difference between a tool and a game.
 */
export function takePack(run, placement = []) {
  if (!run.spoils || run.spoils.taken) return null;
  const live = standing(run);
  const placed = [];
  for (const { at, holder } of placement) {
    const card = run.spoils.pack.find((c) => c.at === at);
    const e = live[holder];
    if (!card || !e) continue;
    const inv = packInventory([...sheetOf(e).gear]);
    // The reserved slot is Cairn's rule, not a courtesy: a full pack is 0 HP.
    if (card.slots > inv.capacity - inv.used - 1) {
      placed.push({ at, holder, refused: 'no room without filling the pack' });
      continue;
    }
    e.won.push({ ...card });
    placed.push({ at, holder, who: e.character.name });
  }
  run.spoils.taken = { kind: 'pack', placed };
  run.phase = 'scouting';
  return placed;
}

/**
 * WHAT THE ORACLE WOULD DO. A generator, because it is a second or two of real
 * simulation — the same measured allocator the kit screen uses, on the same
 * basket, so its advice is in the same currency as everything else on the site.
 *
 * It returns a suggested placement and the gain it measured, error bar
 * included. It does NOT apply it. The player can follow it, ignore it, or
 * notice that two of the three cards are inside the noise and please
 * themselves — which is the honest state of affairs and worth showing.
 */
export function* advise(run, { trials = 300 } = {}) {
  const live = standing(run);
  if (!live.length || !run.spoils) return { placement: [], awards: [], left: [] };
  const chars = live.map(sheetOf);
  const out = yield* allocate(chars, run.spoils.pack.map((c) => ({ ...c })),
    { trials, basket: KIT_BASKET, seed: `${run.seed}/advise/${run.rung}` });
  return {
    ...out,
    placement: out.awards.map((a) => ({ at: a.item.at, holder: a.holder })),
  };
}

// --------------------------------------------------------------- the summary

/** Everything a results screen wants, without it having to know the shapes. */
export function summary(run) {
  const scars = run.roster.reduce((n, e) => n + e.scars.length, 0);
  const forecast = run.history.reduce((s, t) => s + t.forecast.toll, 0) / (run.history.length || 1);
  const actual = run.history.reduce((s, t) => s + t.cost, 0) / (run.history.length || 1);
  return {
    rungs: run.history.length,
    of: RUNGS.length,
    outcome: run.outcome,
    dead: run.roster.filter((e) => e.dead).map((e) => e.character.name),
    alive: standing(run).map((e) => e.character.name),
    scars,
    grew: run.roster
      .filter((e) => e.scars.length)
      .map((e) => ({
        who: e.character.name,
        scars: e.scars,
        ...e.bonus,
      })),
    forecast,
    actual,
    luck: actual - forecast,
  };
}

export { RUNGS, extrasOf, parseItem };
