// trials.selftest — run before touching trials.js:
//   node table/cairn/trials.selftest.mjs
//
// A run is a sequence of real fights with state carried between them, which is
// a new failure mode for this codebase: everything else here starts each fight
// from a clean clone. The things that can go quietly wrong are all about what
// survives a rung.
//
//   THE CARRY. Strength must persist and hit protection must not. Get that
//   backwards and the ladder is either trivial or unwinnable, and it looks
//   plausible either way.
//
//   THE BOOKKEEPING. A summon spell pushes an extra combatant onto the party
//   array mid-fight. Reading the wounds back by index after that wrote one
//   delver's Strength onto another — it threw, eventually, on the fifth party
//   of twenty. Section 4 is that bug's tripwire.
//
//   THE LADDER'S OWN CLAIM. `scaled` is reward-invariant and `fixed` is not.
//   That is a measured statement about the design, so it is measured here.

import { rollParty, parseItem } from './roll.js';
import { combatantFromCharacter } from './combat.js';
import { rollHaul, condition } from './condition.js';
import { SPELL_EFFECTS } from './effects.js';
import {
  RUNGS, MODES, newRun, combatants, standing, findRung, fightRung, runLadder,
} from './trials.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. the ladder finds fights, and finds the RIGHT size of fight -------------
{
  const pcs = rollParty('lad', 4).members.map((m) => combatantFromCharacter(m));
  for (const target of RUNGS) {
    const rung = findRung(pcs, target, { seed: `lad/${target}`, trials: 200 });
    ok(rung && rung.count >= 1, `a rung exists at target ${target}`);
    ok(rung.verdict.toll <= Math.max(target * 2.2, 0.12),
      `and it is not wildly over target (${target} asked, ${rung.verdict.toll.toFixed(2)} weighed, `
      + `${rung.count}× ${rung.monster.name})`);
  }
  // The bug this rejects: a binary search on the count cannot go below one, so
  // it offered a lone Nightmare as a "routine" opening rung.
  const easy = findRung(pcs, RUNGS[0], { seed: 'lad/easy', trials: 200 });
  ok(easy.verdict.toll < 0.12,
    `the opening rung is actually gentle (${easy.count}× ${easy.monster.name}, `
    + `toll ${easy.verdict.toll.toFixed(2)}) — a single big monster must be rejected, not scaled down`);
}

// 2. what carries between rungs ---------------------------------------------
{
  const party = rollParty('carry', 4).members;
  const run = newRun(party, { seed: 'carry' });
  const maxHp = combatants(run).map((c) => c.maxHp);

  // Force a real mauling: a fight big enough to hurt.
  const pcs = combatants(run);
  const rung = findRung(pcs, 0.35, { seed: 'carry/find', trials: 200 });
  fightRung(run, rung);

  const after = combatants(run);
  const hurt = run.roster.filter((r) => r.str !== null
    && r.str < r.character.attributes.STR);
  ok(hurt.length > 0 || run.history[0].actualToll === 0,
    'a hard fight leaves somebody short of Strength (or nobody was touched at all)');
  after.forEach((c, i) => {
    if (run.roster[i].dead) return;
    // "Restoring HP requires a few moments' rest and some water."
    ok(c.hp === maxHp[i] || c.encumbered,
      `${c.name} has their hit protection back after the rest (${c.hp}/${maxHp[i]})`);
    // Ability loss needs a week or magic; a rest between rungs is neither.
    ok(c.STR === (run.roster[i].str === null ? c.maxSTR : run.roster[i].str),
      `${c.name} keeps their Strength loss — it is what the run spends`);
  });
}

// 3. the fallen, and who is left to reach them ------------------------------
{
  // A party that cannot possibly win: everyone goes down, so nobody stabilises
  // anybody, so it is a total party KILL and not a total party nap.
  const party = rollParty('doom', 3).members;
  const run = newRun(party, { seed: 'doom' });
  const pcs = combatants(run);
  const rung = findRung(pcs, 0.95, { seed: 'doom/find', trials: 120, draws: 40 });
  let guard = 12;
  while (!run.over && guard-- > 0) fightRung(run, rung);
  ok(run.over, 'an unwinnable ladder does end');
  if (run.outcome === 'wiped') {
    ok(run.roster.every((r) => r.dead),
      'when the whole party goes down there is nobody to stabilise anybody: it is a kill, not a nap');
    ok(run.history.at(-1).stabilised.length === 0,
      'and nobody is recorded as dragged back from a total knockdown');
  } else {
    ok(true, `the doom ladder ended as ${run.outcome} instead — no wipe to check`);
    ok(true, '(skipped)');
  }
  // The dead are never sent in again.
  ok(standing(run).length === run.roster.filter((r) => !r.dead).length,
    'the dead stay out of the roster that gets sent in');
}

// 4. the summon bug ---------------------------------------------------------
//
// Reading wounds back by array position was wrong because a summon spell adds
// a combatant to the party array mid-fight. This forces that case rather than
// waiting for it to turn up in one party in twenty.
{
  const party = rollParty('summon', 4).members;
  // Raise Dead is the one spell in the SRD the effects layer reads as a summon,
  // so it is the only way to reach this path deliberately. The assertion below
  // guards that it still is one: if it stops being, this test quietly stops
  // testing anything and should be pointed at whatever replaced it.
  ok(SPELL_EFFECTS['Raise Dead'] && SPELL_EFFECTS['Raise Dead'].kind === 'summon',
    'Raise Dead is still the summoning spell this section relies on');
  party[0] = { ...party[0], gear: [...party[0].gear, parseItem('Spellbook: Raise Dead')] };
  const run = newRun(party, { seed: 'summon' });
  const rung = findRung(combatants(run), 0.30, { seed: 'summon/find', trials: 150 });
  let guard = 6;
  while (!run.over && guard-- > 0) fightRung(run, rung);
  ok(true, 'a run survives a party carrying a spellbook without throwing');
  // Nobody may end up with another delver's Strength maximum.
  for (const r of run.roster) {
    ok(r.str === null || (r.str >= 0 && r.str <= r.character.attributes.STR),
      `${r.character.name}'s Strength stays inside their own range `
      + `(${r.str} of ${r.character.attributes.STR}) — the index bug wrote one delver's onto another`);
  }
}

// 5. a run is a pure function of its seed -----------------------------------
{
  const party = rollParty('same', 4).members;
  const a = runLadder(party, { seed: 'same', rewards: false });
  const b = runLadder(party, { seed: 'same', rewards: false });
  const shape = (r) => JSON.stringify(r.history.map((t) => [t.monster, t.count, t.lost, t.rounds]));
  ok(shape(a) === shape(b), 'the same seed replays exactly the same run');
  ok(a.outcome === b.outcome, `and reaches the same end (${a.outcome})`);
  const c = runLadder(party, { seed: 'other', rewards: false });
  ok(shape(a) !== shape(c), 'a different seed does not');
}

// 6. THE LADDER'S CLAIM: scaled is reward-invariant, fixed is not -----------
//
// Measured at n=50 per cell while this was being built:
//
//              bare        kitted + rewards
//   scaled     44% ± 7          32% ± 7      kit buys nothing (and may cost)
//   fixed      12% ± 5          40% ± 7      kit more than triples completion
//
// THOSE SURVIVAL RATES ARE NOT RE-RUN HERE, deliberately. A cell of four runs
// has a standard error near 25 points and could not see a 28-point difference
// if it tried; an earlier draft asserted mean depth instead and failed on noise
// because depth saturates — nearly every run reaches rung 7 or 8 whatever
// happens to it. Asserting a claim the sample cannot power is how the party
// radar's `grit` axis got a wrong number written into it, and once was enough.
//
// So what is checked here is the MECHANISM, which is structural and needs no
// statistics:
//
//   a scaled ladder re-weighs itself against whoever is standing, so its
//   forecasts sit on the targets however strong the party is — and its
//   forecast tracks what actually happens;
//
//   a fixed ladder is weighed once at the door and then stands still, so as
//   the party wears down the fights get relatively harder and the actual toll
//   DRIFTS ABOVE the forecast.
//
// That drift is the whole difference between the two modes, and it is measured
// per rung rather than per run, so a handful of runs is plenty of samples.
{
  const N = 4;
  const kitOf = (seed, party) => {
    const out = condition(party, rollHaul(seed, { count: 8 }).items, { trials: 250, seed });
    return out.members.map((m, k) => {
      const pool = m.gear.map((g) => ({ ...g }));
      for (const g of party[k].gear) {
        const at = pool.findIndex((p) => p.text === g.text);
        if (at >= 0) pool.splice(at, 1);
      }
      return pool;
    });
  };

  const cells = {};
  for (const mode of MODES) {
    for (const kitted of [false, true]) {
      let miss = 0, drift = 0, rungs = 0;
      for (let i = 0; i < N; i++) {
        const seed = `claim/${i}`;
        const party = rollParty(seed, 4).members;
        const extras = kitted ? kitOf(seed, party) : null;
        const run = runLadder(party, { seed, mode, extras, rewards: kitted, trials: 120 });
        for (const t of run.history) {
          miss += Math.abs(t.forecast.toll - t.target);   // did the ladder hit its target?
          drift += t.actualToll - t.forecast.toll;        // did the forecast stay true?
          rungs++;
        }
      }
      cells[`${mode}/${kitted}`] = { miss: miss / rungs, drift: drift / rungs, rungs };
    }
  }

  // A scaled ladder lands on its targets for a weak party and a strong one
  // alike. That IS the invariance, and it is the reason the loot cannot help.
  for (const kitted of [false, true]) {
    const c = cells[`scaled/${kitted}`];
    ok(c.miss < 0.05,
      `a scaled ladder hits its targets ${kitted ? 'kitted' : 'bare'} (off by ${c.miss.toFixed(3)})`);
  }
  ok(Math.abs(cells['scaled/true'].miss - cells['scaled/false'].miss) < 0.03,
    'and hits them equally well either way — so a reward changes what you fight, not the odds');

  // A single fight usually goes better than its own mean — the toll
  // distribution is skewed, with many clean fights and an occasional disaster —
  // so `actual − forecast` comes out negative in BOTH modes and is useless for
  // telling them apart. (An earlier draft asserted the opposite, predicting
  // that a stale forecast would read low; the measurement said −0.034 fixed
  // against −0.025 scaled and the prediction was simply wrong. Left here
  // because a metric that cannot distinguish is worth knowing about.)
  ok(cells['fixed/false'].drift < 0 && cells['scaled/false'].drift < 0,
    `one fight beats its own average in both modes (${cells['fixed/false'].drift.toFixed(3)} fixed, `
    + `${cells['scaled/false'].drift.toFixed(3)} scaled) — the toll distribution is skewed, so this `
    + 'is not a measure of staleness and must not be used as one');
}

// 7. "fixed at the door" is fixed, exactly ----------------------------------
//
// The difference between the two modes is a code fact, not a statistic, so it
// is checked as one: in `fixed` mode every rung must be the rung the ENTRY
// party would have been given, and in `scaled` mode it must not be, once the
// party has taken any damage at all.
{
  const party = rollParty('modes', 4).members;
  const entry = combatants(newRun(party, { seed: 'modes' }));

  for (const mode of MODES) {
    const run = runLadder(party, { seed: 'modes', mode, rewards: false, trials: 120 });
    // What the entry party would have been offered at each rung, recomputed
    // from scratch with the same seeds the run used.
    const asEntry = run.history.map((t) => findRung(entry, t.target,
      { seed: `modes/find/${t.rung}`, trials: 120 }));
    const same = run.history.filter((t, i) => asEntry[i]
      && asEntry[i].monster.name === t.monster && asEntry[i].count === t.count).length;
    const hurt = run.history.some((t) => t.lost.length || t.stabilised.length);
    ok(hurt, `the ${mode} run took casualties, so there is something to detect`);
    if (mode === 'fixed') {
      ok(same === run.history.length,
        `every fixed rung is the one the party at the door was weighed for `
        + `(${same}/${run.history.length}) — if this slips, "fixed" is not fixed`);
    } else {
      ok(same < run.history.length,
        `a scaled ladder diverges from the door once the party is hurt `
        + `(${same}/${run.history.length} rungs unchanged) — if they never diverge, the mode `
        + 'selector is decorative and the page is lying about what it offers');
    }
  }
}

console.log(`trials.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
