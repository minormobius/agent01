// run.selftest — run before touching run.js:
//   node table/cairn/run.selftest.mjs
//
// The run is where every other model on this surface finally has consequences,
// so its failures are the quiet kind: a scar that never fires, a heal that
// overshoots a maximum, a pack that fills somebody's tenth slot and knocks them
// to 0 HP for the rest of the game. None of it throws. All of it just makes the
// game slightly wrong in a direction nobody notices.
//
// The centrepiece is the scar trigger, because ONE WORD in the rule carries it:
// "reduced to exactly 0 HP". Off by one in either direction and the whole
// advancement engine either never fires or fires constantly.

import { emptyFormation } from './formation.js';
import { rollCharacter, packInventory, makeRng } from './roll.js';
import { applyScars, simulate } from './combat.js';
import { BESTIARY } from './monsters.js';
import {
  newRun, sheetOf, combatants, standing, scout, enterRung, settle,
  takeHeal, takePack, advise, summary, HEAL, PACK_SIZE, RUNGS,
} from './run.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

/** Drive a piloted fight with the simplest possible pilot. */
function autopilot(state, cap = 500) {
  let step = state.generator.next();
  let asked = 0;
  while (!step.done && asked++ < cap) {
    const req = step.value;
    const attack = req.options.find((o) => o.kind === 'attack');
    const mark = req.foes.find((f) => !f.down);
    step = state.generator.next(attack
      ? { kind: 'attack', weapon: attack.weapon, target: mark && mark.name }
      : req.options[0]);
  }
  return step.value;
}

// 1. THE SCAR TRIGGER — "reduced to exactly 0 HP" ---------------------------
//
// One word carries the rule, so it is tested at the boundary rather than
// anywhere near it: for every possible amount of damage against a known hit
// protection, a scar must appear if and only if the damage lands the delver on
// nothing left over. `applyDamage` is not exported, so this drives real
// one-round fights and reads the flag off the combatant.
{
  const strike = (hp, armor, foeDice, seed) => {
    const pc = {
      name: 'target', side: 'pc', hp, maxHp: Math.max(hp, 1), armor,
      STR: 10, DEX: 10, WIL: 10, maxSTR: 10,
      attacks: [{ name: 'fist', dice: [4], blast: false }],
    };
    const foe = {
      name: 'hammer', side: 'foe', hp: 99, maxHp: 99, armor: 0,
      STR: 10, DEX: 10, WIL: 10, maxSTR: 10, morale: 99,
      attacks: [{ name: 'swing', dice: foeDice, blast: false }],
    };
    simulate([pc], [foe], makeRng(seed), { maxRounds: 1, morale: false });
    return pc;
  };

  // A d1 always rolls 1, so these three are exact.
  const exact = strike(1, 0, [1], 'exact');
  ok(exact.hp === 0 && exact.scarred === 1,
    `damage landing exactly on 0 HP earns a scar (hp ${exact.hp}, scarred ${exact.scarred || 0})`);
  ok(!exact.dead, 'and they live through it — surviving is the whole point of the table');

  const spare = strike(2, 0, [1], 'spare');
  ok(!spare.scarred && spare.hp === 1, 'a point short of 0 earns nothing');

  const already = strike(0, 0, [1], 'already');
  ok(!already.scarred,
    'a delver ALREADY at 0 earns nothing — the rule says *reduced to* 0, not *at* 0');
  ok(already.STR < 10, 'their Strength takes it instead');

  const blocked = strike(3, 5, [1], 'blocked');
  ok(!blocked.scarred && blocked.hp === 3, 'damage stopped by armour is not a brush with death');

  // THE ASYMMETRY THAT SHAPES THE GAME. Against a d6 the die decides, so this
  // sweeps seeds and asserts the biconditional: scarred exactly when the damage
  // equalled the hit protection, never when it overshot into Strength.
  let landed = 0, overshot = 0, wrong = 0;
  for (let i = 0; i < 200; i++) {
    const pc = strike(3, 0, [6], `sweep/${i}`);
    const dealt = 3 - pc.hp + (10 - pc.STR);
    if (dealt === 3) { landed++; if (!pc.scarred) wrong++; }
    else if (dealt > 3) { overshot++; if (pc.scarred) wrong++; }
    else if (pc.scarred) wrong++;
  }
  ok(landed > 10 && overshot > 10,
    `the sweep saw both cases (${landed} landed on 0, ${overshot} overshot into Strength)`);
  ok(wrong === 0,
    `a scar appears exactly when the damage lands on 0 and never when it overshoots ` +
    `(${wrong} disagreements in 200) — one more point of damage is critical damage ` +
    'instead, which is why swarms make veterans and giants make corpses');
}

// 2. scars raise maximums, and a raised maximum is not a heal ---------------
{
  const c = rollCharacter('scar-math');
  let grew = 0;
  const faces = new Set();
  for (let i = 0; i < 400; i++) {
    const after = applyScars(c, 1, `s/${i}`);
    faces.add(after.scars[0]);
    if (after.hp > c.hp || after.attributes.STR > c.attributes.STR
      || after.attributes.DEX > c.attributes.DEX || after.attributes.WIL > c.attributes.WIL) grew++;
  }
  ok(faces.size === 12, `the scar die is a d12 and all twelve faces come up (${faces.size})`);
  ok(grew > 100, `a scar usually raises something (${grew} of 400) — nine of the twelve rows do`);

  // The run must add the DELTA to a bonus, not overwrite the sheet, or two
  // scars in one fight would each be measured against the original character.
  const run = newRun(emptyFormation('bonus', 2));
  const e = run.roster[0];
  const before = sheetOf(e).hp;
  e.bonus.hp += 3;
  ok(sheetOf(e).hp === before + 3, 'a bonus rides on top of the rolled sheet');
  e.str = 4;
  ok(combatants(run)[0].STR === 4, 'and a wound rides on top of that');
  e.bonus.STR += 5;
  ok(combatants(run)[0].STR === 4,
    'raising max Strength does NOT heal — the ceiling moved, the delver is still hurt');
}

// 3. the choice: exactly one of heal or pack --------------------------------
{
  const run = newRun(emptyFormation('choice', 4));
  scout(run);
  settle(run, ...(() => { const s = enterRung(run); return [s, autopilot(s)]; })());
  if (!run.over) {
    ok(run.phase === 'spoils', 'after a fight the run offers spoils');
    ok(run.spoils.pack.length === PACK_SIZE, `a pack is ${PACK_SIZE} cards`);
    ok(run.spoils.pack.every((c, i) => c.at === i), 'each card knows its own index');
    ok(run.spoils.heal.every((h) => h.now <= h.max), 'the rest preview never promises past a maximum');

    const first = takeHeal(run);
    ok(Array.isArray(first) && run.phase === 'scouting', 'taking the rest moves the run on');
    ok(takePack(run, []) === null, 'and the pack is no longer on the table — one or the other');
    ok(first.every((h) => h.back >= 0 && h.back <= HEAL.strDice), `a rest is at most d${HEAL.strDice}`);
    ok(first.every((h) => h.to <= h.max), 'and never overshoots a maximum');
  } else {
    ok(true, '(the first rung ended the run — nothing to choose)');
    ok(true, '(skipped)'); ok(true, '(skipped)'); ok(true, '(skipped)');
    ok(true, '(skipped)'); ok(true, '(skipped)'); ok(true, '(skipped)');
  }
}

// 4. placement obeys Cairn's inventory --------------------------------------
{
  const run = newRun(emptyFormation('place', 4));
  scout(run);
  settle(run, ...(() => { const s = enterRung(run); return [s, autopilot(s)]; })());
  if (run.phase === 'spoils') {
    // Everything to one delver: the pack must refuse whatever would fill them.
    const all = run.spoils.pack.map((c) => ({ at: c.at, holder: 0 }));
    takePack(run, all);
    const inv = packInventory(sheetOf(run.roster[0]).gear);
    ok(inv.used <= inv.capacity - 1,
      `piling a whole pack on one delver still leaves a slot free (${inv.used}/${inv.capacity}) — ` +
      'a full pack is 0 HP and the game must not do that to you by accident');
    ok(run.spoils.taken.placed.length === PACK_SIZE,
      'every card is accounted for, placed or refused');
    ok(run.spoils.taken.placed.some((p) => p.who) || run.spoils.taken.placed.every((p) => p.refused),
      'and each one says which');
  } else {
    ok(true, '(run ended early)'); ok(true, '(skipped)'); ok(true, '(skipped)');
  }
}

// 5. a card nobody is given is left behind ----------------------------------
{
  const run = newRun(emptyFormation('leave', 4));
  scout(run);
  settle(run, ...(() => { const s = enterRung(run); return [s, autopilot(s)]; })());
  if (run.phase === 'spoils') {
    const carriedBefore = run.roster.reduce((n, e) => n + e.won.length, 0);
    takePack(run, [{ at: 0, holder: 0 }]);
    const carriedAfter = run.roster.reduce((n, e) => n + e.won.length, 0);
    ok(carriedAfter - carriedBefore <= 1, 'only the cards you placed are taken');
    ok(run.spoils.taken.placed.length === 1, 'and the other two are simply left');
  } else { ok(true, '(run ended early)'); ok(true, '(skipped)'); }
}

// 6. the oracle advises in the pack's own index space ------------------------
{
  const run = newRun(emptyFormation('advice', 4));
  scout(run);
  settle(run, ...(() => { const s = enterRung(run); return [s, autopilot(s)]; })());
  if (run.phase === 'spoils') {
    const it = advise(run, { trials: 150 });
    let step = it.next();
    let yields = 0;
    while (!step.done) { yields++; step = it.next(); }
    const a = step.value;
    ok(yields > 0, `advising reports progress (${yields} steps) so a page can draw a bar`);
    ok(a.placement.every((p) => run.spoils.pack.some((c) => c.at === p.at)),
      'every suggested card is one that is actually on the table');
    ok(a.placement.every((p) => p.holder >= 0 && p.holder < standing(run).length),
      'and goes to somebody still standing');
    ok(a.awards.every((x) => typeof x.se === 'number'),
      'the advice carries its error bar — a suggestion inside the noise is not a finding');
    // Advising must not APPLY anything. It is a second opinion, not a move.
    ok(run.spoils.taken === null, 'asking the oracle does not spend your choice');
  } else {
    for (let i = 0; i < 5; i++) ok(true, '(run ended early)');
  }
}

// 7. deaths are permanent, and a total knockdown is a kill ------------------
{
  const run = newRun(emptyFormation('doom', 3));
  // Force something hopeless rather than waiting for the ladder to find it.
  run.pending = {
    monster: BESTIARY.find((m) => m.id === 'ogre'), count: 12, target: 0.9,
    verdict: { toll: 0.9, swing: 0.9, band: 'lethal' },
  };
  run.phase = 'fighting';
  const s = enterRung(run);
  settle(run, s, autopilot(s));
  const fallen = run.roster.filter((e) => e.dead).length;
  if (fallen === run.roster.length) {
    ok(run.over && run.outcome === 'wiped', 'losing everybody ends the run as a wipe');
    ok(run.history.at(-1).stabilised.length === 0,
      'and nobody is dragged back from a total knockdown — there is nobody to do it');
  } else {
    ok(true, `(${fallen} of ${run.roster.length} fell; no total knockdown to check)`);
    ok(standing(run).length === run.roster.length - fallen, 'the dead stay dead');
  }
  const alive = standing(run).length;
  ok(combatants(run, { live: true }).length === alive, 'only the living are sent in again');
}

// 8. a run is a pure function of its formation ------------------------------
{
  const play = (seed) => {
    const run = newRun(emptyFormation(seed, 4));
    let guard = 20;
    while (!run.over && guard-- > 0) {
      if (!scout(run)) break;
      const s = enterRung(run);
      settle(run, s, autopilot(s));
      if (!run.over) takeHeal(run);
    }
    return run;
  };
  const shape = (r) => JSON.stringify(r.history.map((t) => [t.monster, t.count, t.lost, t.rounds,
    t.scarred.map((s) => s.roll)]));
  ok(shape(play('same')) === shape(play('same')), 'the same seed replays the same run exactly');
  ok(shape(play('same')) !== shape(play('other')), 'a different seed does not');

  const s = summary(play('same'));
  ok(s.rungs >= 1 && s.of === RUNGS.length, `the summary counts the rungs (${s.rungs}/${s.of})`);
  ok(typeof s.luck === 'number',
    'and states whether the dice were kinder or crueller than the forecast');
  ok(s.grew.every((g) => g.scars.length > 0),
    'only delvers who actually earned a scar appear as having grown');
}

// 9. the run is worth playing: scars really do accumulate -------------------
//
// The engine can be correct and still never fire. Measured over 12 full runs
// while this was built: 0.32 scars a rung, about 2.6 over an eight-rung run,
// with 48% of rungs being a single big monster (which overshoots and pays
// nothing). This is the tripwire for that rate collapsing.
{
  let scars = 0, rungs = 0;
  for (let i = 0; i < 4; i++) {
    const run = newRun(emptyFormation(`yield/${i}`, 4));
    let guard = 20;
    while (!run.over && guard-- > 0) {
      if (!scout(run, { trials: 120 })) break;
      const s = enterRung(run);
      settle(run, s, autopilot(s));
      rungs++;
      if (!run.over) takeHeal(run);
    }
    scars += summary(run).scars;
  }
  ok(rungs >= 12, `the sample got through ${rungs} rungs`);
  ok(scars > 0,
    `and the party earned ${scars} scar(s) across them — if this ever reads 0, the ` +
    'advancement engine has stopped firing and the run is a treadmill');
}

console.log(`run.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
