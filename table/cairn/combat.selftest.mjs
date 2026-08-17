// combat.selftest — run before touching combat.js or regenerating monsters.js:
//   node table/cairn/combat.selftest.mjs
//
// A combat simulator fails QUIETLY. It returns a plausible percentage whatever
// it does, and nobody can tell 18% from 31% by eye, so a rule implemented
// backwards looks exactly like a rule implemented correctly. Everything below
// exists to make one of those failures loud:
//
//   THE RULES THEMSELVES, checked one at a time against cases whose answer is
//   known by hand — armour subtracts, overflow hits STR, two dice keep the
//   highest, blast hits everyone, morale ends fights.
//
//   MONOTONICITY. More enemies must never be safer; more armour must never be
//   worse. These catch sign errors and mutation bugs that per-rule tests miss,
//   because they compare whole distributions.
//
//   NO CROSS-TRIAL BLEED. Every trial must start from full HP. A missing clone
//   makes the first trial right and all 1,999 others progressively wronger —
//   the single most likely way for this file to start lying.

import { rollCharacter, rollParty, parseItem } from './roll.js';
import { BESTIARY } from './monsters.js';
import {
  simulate, fight, pcOptions, assess, findEncounters, band, BANDS, TARGETING,
  combatantFromCharacter, combatantFromMonster, applyScars,
} from './combat.js';
import { makeRng } from './roll.js';
import { AXES, REJECTED, profile, overview, radarPoints, expectedDamage } from './party.js';
import { delve } from './delve.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const party = (n, seed = 'test') =>
  Array.from({ length: n }, (_, i) => combatantFromCharacter(rollCharacter(`${seed}/${i}`)));

const dummy = (over = {}) => ({
  name: 'dummy', side: 'foe', hp: 4, maxHp: 4, armor: 0,
  STR: 10, DEX: 10, WIL: 10, maxSTR: 10,
  attacks: [{ name: 'club', dice: [6], blast: false }], ...over,
});

// 1. the bestiary parsed ----------------------------------------------------
ok(BESTIARY.length >= 80, `bestiary has ${BESTIARY.length} monsters`);
{
  const bad = BESTIARY.filter((m) => !m.name || !(m.hp > 0) || !(m.STR > 0) || m.armor > 3);
  ok(bad.length === 0, `every monster has a name, HP, STR and legal armour (bad: ${bad.map((m) => m.name)})`);
  const armed = BESTIARY.filter((m) => m.attacks.length);
  ok(armed.length >= BESTIARY.length - 3, `all but the attackless tricksters have an attack (${BESTIARY.length - armed.length} without)`);
  const dice = new Set(BESTIARY.flatMap((m) => m.attacks.flatMap((a) => a.dice)));
  ok([...dice].every((d) => [4, 6, 8, 10, 12, 20].includes(d)), `damage dice are real dice (${[...dice].sort((a, b) => a - b)})`);
}

// 1b. the conversion survives ordinary JS ----------------------------------
{
  // `.map(combatantFromCharacter)` passes an index as the second argument; this
  // threw a TypeError until the parameter learned to ignore junk, and it is the
  // single most natural way anyone will call it.
  const members = [rollCharacter('map/0'), rollCharacter('map/1')];
  let threw = null;
  try { members.map(combatantFromCharacter); } catch (e) { threw = e; }
  ok(!threw, `party.map(combatantFromCharacter) does not throw (${threw && threw.message})`);
  const [c] = members.map(combatantFromCharacter);
  ok(c.hp > 0 && c.attacks.length > 0, 'and produces a usable combatant');
  const armed = combatantFromCharacter(rollCharacter('map/0'), [{ text: 'Greatsword (d12)', name: 'Greatsword', slots: 2, armor: 0, capacity: 0, damage: 'd12', petty: false, bulky: true, blast: false }]);
  ok(Math.max(...armed.attacks[0].dice) === 12, 'extra items are picked up, and the best weapon leads');
}

// 2. the rules, one at a time ----------------------------------------------
{
  // armour subtracts from every hit
  const naked = assess(party(1, 'armour'), [dummy()], { trials: 600, seed: 'a' });
  const plated = assess(
    party(1, 'armour').map((p) => ({ ...p, armor: 3 })), [dummy()], { trials: 600, seed: 'a' });
  ok(plated.deathRate <= naked.deathRate,
    `3 armour is never worse than none (${plated.deathRate.toFixed(3)} vs ${naked.deathRate.toFixed(3)})`);

  // a foe that cannot be hurt through its armour can still be worn down? no:
  // d4 unarmed vs 3 armour deals at most 1, so the fight is winnable but long
  const rng = makeRng('armour-wall');
  const pc = { ...party(1)[0], attacks: [{ name: 'fist', dice: [4], blast: false }], hp: 99, STR: 18 };
  const wall = dummy({ armor: 3, hp: 6, attacks: [] });
  const r = simulate([pc], [wall], rng, { morale: false, maxRounds: 30 });
  ok(r.rounds === 30 || wall.hp < 6, 'armour blunts but does not nullify damage');
}
{
  // two dice on one attack keep the highest, so d8+d8 beats d8 but never d16
  const twin = { ...party(1, 'dice')[0], attacks: [{ name: 'twin', dice: [8, 8], blast: false }] };
  const single = { ...party(1, 'dice')[0], attacks: [{ name: 'one', dice: [8], blast: false }] };
  const huge = { ...party(1, 'dice')[0], attacks: [{ name: 'big', dice: [12], blast: false }] };
  const kill = (pc) => assess([pc], [dummy({ hp: 6, attacks: [] })], { trials: 400, seed: 'd', morale: false }).meanRounds;
  ok(kill(twin) < kill(single), 'a paired weapon kills faster than a single die');
  ok(kill(twin) > kill(huge) * 0.6, 'but d8+d8 is not secretly a d16');
}
{
  // blast hits everyone
  const pcs = party(4, 'blast');
  const bomber = dummy({ hp: 20, attacks: [{ name: 'breath', dice: [12], blast: true }] });
  const single = dummy({ hp: 20, attacks: [{ name: 'bite', dice: [12], blast: false }] });
  const b = assess(pcs, [bomber], { trials: 400, seed: 'b', morale: false });
  const s = assess(pcs, [single], { trials: 400, seed: 'b', morale: false });
  ok(b.meanCasualties > s.meanCasualties,
    `blast hurts a party more than the same die on one target (${b.meanCasualties.toFixed(2)} vs ${s.meanCasualties.toFixed(2)})`);
}
{
  // morale saves lives: the same fight with routing disabled is worse
  const pcs = party(4, 'morale');
  const foes = Array.from({ length: 6 }, (_, i) => combatantFromMonster(BESTIARY.find((m) => m.id === 'bandit'), i));
  const withMorale = assess(pcs, foes, { trials: 500, seed: 'm', morale: true });
  const without = assess(pcs, foes, { trials: 500, seed: 'm', morale: false });
  ok(withMorale.routRate > 0, `enemies sometimes rout (${(withMorale.routRate * 100).toFixed(0)}%)`);
  ok(withMorale.meanCasualties <= without.meanCasualties,
    'morale never costs the party more than fighting to the last body');
}
{
  // surprise is strictly bad for the party
  const pcs = party(3, 'surprise');
  const foes = [combatantFromMonster(BESTIARY.find((m) => m.id === 'ogre'))];
  const fair = assess(pcs, foes, { trials: 500, seed: 's' });
  const ambush = assess(pcs, foes, { trials: 500, seed: 's', surprise: true });
  ok(ambush.meanCasualties >= fair.meanCasualties, 'being ambushed is never an advantage');
}
{
  // a 1 always succeeds and a 20 always fails — checked through the save-heavy
  // path: an 18 STR target still occasionally fails a critical damage save
  let survived = 0;
  for (let i = 0; i < 400; i++) {
    const rng = makeRng(`crit/${i}`);
    const pc = { ...party(1)[0], hp: 1, STR: 18, armor: 0 };
    simulate([pc], [dummy({ hp: 99, attacks: [{ name: 'maul', dice: [12], blast: false }] })],
      rng, { morale: false, maxRounds: 1 });
    if (pc.STR === 18) survived++;
  }
  ok(survived < 400, 'even 18 STR fails a critical damage save sometimes (the natural 20)');
}

// 2b. consumables are spent, and bombs are bombs --------------------------
{
  // A one-use blast sphere was the best weapon in the pack for EVERY round of
  // every fight, because nothing tracked its single use. Cairn's bombs and
  // charged relics are the party's most powerful objects precisely because
  // they run out.
  const members = rollParty('bomb', 4).members;
  const bomb = parseItem('Blast Sphere (d12, *blast*, *bulky*, 1 use)');
  ok(bomb.uses === 1 && bomb.blast && bomb.damage === 'd12', 'a bomb parses its die, its blast and its single use');
  ok(parseItem('Long Sword (d10, *bulky*)').uses === null, 'and a sword has no use limit');

  const foes = (id, n) => () => Array.from({ length: n }, (_, i) =>
    combatantFromMonster(BESTIARY.find((m) => m.id === id), i));
  const carrying = (item) => members.map((c, i) => combatantFromCharacter(c, i === 0 ? [item] : []));
  const toll = (item, fight) => assess(carrying(item), fight(), { trials: 2500, seed: 'bomb' }).toll;
  const eternal = parseItem('Endless Sphere (d12, *blast*, *bulky*)');

  // RUNNING OUT ONLY MATTERS IF THE FIGHT LASTS. Against six goblins, one
  // throw ends it and a bottomless bag of bombs is worth almost nothing more;
  // against two trolls it is worth a great deal. That relationship is the
  // proof the use is actually being consumed — a single comparison would sit
  // inside the noise, which is how this test first "passed" in the wrong
  // direction.
  const shortFight = foes('goblin', 6);
  const longFight = foes('troll', 2);
  const shortGap = toll(bomb, shortFight) - toll(eternal, shortFight);
  const longGap = toll(bomb, longFight) - toll(eternal, longFight);
  ok(longGap > shortGap + 0.03,
    `running out costs more in a long fight than a short one (${shortGap.toFixed(3)} vs ${longGap.toFixed(3)})`);
  ok(shortGap >= -0.02, 'and never negative: a limited bomb is never better than an unlimited one');

  const none = toll(parseItem('Iron Pot'), shortFight);
  ok(toll(bomb, shortFight) < none - 0.05,
    `one throw still changes a fight (${none.toFixed(3)} → ${toll(bomb, shortFight).toFixed(3)})`);
  ok(toll(bomb, shortFight) < toll(parseItem('Heavy Rock (d12, 1 use)'), shortFight),
    'a blast bomb beats the same die thrown at one goblin');

  // and uses must not leak between trials, like `spent` did for spellbooks
  const short = assess(carrying(bomb), shortFight(), { trials: 40, seed: 'bomb' }).toll;
  const long = assess(carrying(bomb), shortFight(), { trials: 2000, seed: 'bomb' }).toll;
  ok(Math.abs(short - long) < 0.12, `the bomb is restocked each fight, not each simulation (${short.toFixed(3)} vs ${long.toFixed(3)})`);
}

// 3. monotonicity ------------------------------------------------------------
{
  const pcs = party(4, 'mono');
  const goblin = BESTIARY.find((m) => m.id === 'goblin');
  let prev = -1, breaks = 0;
  const curve = [];
  for (const n of [1, 2, 4, 6, 8, 12]) {
    const foes = Array.from({ length: n }, (_, i) => combatantFromMonster(goblin, i));
    const v = assess(pcs, foes, { trials: 400, seed: 'mono', morale: false });
    curve.push(`${n}:${v.meanCasualties.toFixed(2)}`);
    if (v.meanCasualties < prev - 0.15) breaks++;
    prev = v.meanCasualties;
  }
  ok(breaks === 0, `more goblins is never safer — ${curve.join(' ')}`);
}
{
  // and a bigger party is never worse off against the same foes
  const foes = Array.from({ length: 4 }, (_, i) => combatantFromMonster(BESTIARY.find((m) => m.id === 'wolf'), i));
  const small = assess(party(2, 'size'), foes, { trials: 400, seed: 'p', morale: false });
  const large = assess(party(5, 'size'), foes, { trials: 400, seed: 'p', morale: false });
  ok(large.wipeRate <= small.wipeRate,
    `five are wiped less often than two (${large.wipeRate.toFixed(3)} vs ${small.wipeRate.toFixed(3)})`);
}

// 4. no cross-trial bleed ----------------------------------------------------
{
  const pcs = party(3, 'bleed');
  const before = pcs.map((p) => `${p.hp}/${p.STR}`).join();
  const foes = [combatantFromMonster(BESTIARY.find((m) => m.id === 'troll'))];
  const foeBefore = foes.map((f) => `${f.hp}/${f.STR}`).join();
  assess(pcs, foes, { trials: 300, seed: 'bleed' });
  ok(pcs.map((p) => `${p.hp}/${p.STR}`).join() === before, 'assess does not wound the party it was handed');
  ok(foes.map((f) => `${f.hp}/${f.STR}`).join() === foeBefore, 'nor the monsters');

  // the tell-tale signature of bleed: lethality climbing with trial count
  const short = assess(party(3, 'bleed'), foes, { trials: 100, seed: 'x' });
  const long = assess(party(3, 'bleed'), foes, { trials: 2000, seed: 'x' });
  ok(Math.abs(short.meanCasualties - long.meanCasualties) < 0.5,
    `100 and 2000 trials agree (${short.meanCasualties.toFixed(2)} vs ${long.meanCasualties.toFixed(2)})`);
}

// 5. determinism -------------------------------------------------------------
{
  const foes = [combatantFromMonster(BESTIARY.find((m) => m.id === 'owlbear'))];
  const a = assess(party(4, 'det'), foes, { trials: 300, seed: 'same' });
  const b = assess(party(4, 'det'), foes, { trials: 300, seed: 'same' });
  const c = assess(party(4, 'det'), foes, { trials: 300, seed: 'other' });
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same seed gives the identical verdict');
  ok(JSON.stringify(a) !== JSON.stringify(c), 'a different seed gives a different one');
}

// 6. the verdict is sane at both ends ----------------------------------------
{
  const pcs = party(4, 'ends');
  const rat = assess(pcs, [combatantFromMonster(BESTIARY.find((m) => m.id === 'cave-locust'))],
    { trials: 500, seed: 'e' });
  ok(rat.band === 'routine', `one cave locust against four is routine (got ${rat.band}, wipe ${rat.wipeRate})`);

  const dragon = BESTIARY.find((m) => /dragon/i.test(m.name)) || BESTIARY.find((m) => m.hp >= 15);
  const doom = assess(pcs, Array.from({ length: 3 }, (_, i) => combatantFromMonster(dragon, i)),
    { trials: 500, seed: 'e', morale: false });
  ok(doom.band === 'lethal', `three ${dragon.name} is lethal (got ${doom.band}, wipe ${doom.wipeRate.toFixed(2)})`);

  ok(band(0.5, 0.9) === 'lethal' && band(0, 0) === 'routine', 'the band function covers its extremes');
  ok(BANDS.length === 4, 'four bands');
}

// 7. the search finds what it was asked for ----------------------------------
{
  const pcs = party(4, 'search');
  const found = findEncounters(pcs, BESTIARY.slice(0, 25), { target: 'deadly', trials: 120, seed: 'f' });
  ok(found.length > 0, `the search finds deadly encounters (${found.length})`);
  ok(found.every((f) => f.verdict.band === 'deadly'), 'every result is actually in the requested band');
  ok(found.every((f) => f.count >= 1 && f.count <= 12), 'counts are within the search bound');
  const routine = findEncounters(pcs, BESTIARY.slice(0, 25), { target: 'routine', trials: 120, seed: 'f' });
  ok(routine.every((r) => r.verdict.wipeRate < 0.05), 'routine encounters do not wipe parties');

  // THE CONTRADICTION TEST. The search runs at low trials; clicking a result
  // re-weighs it at high trials. If those two disagree the tool argues with
  // itself in one click, which is worse than being slow. Confirmation against a
  // second seed is what keeps this passing — drop it and this test fails.
  const reweighFlips = (list) => {
    let n = 0;
    for (const f of list) {
      const foes = Array.from({ length: f.count }, (_, i) => combatantFromMonster(f.monster, i));
      if (assess(pcs, foes, { trials: 1500, seed: 'reweigh' }).band !== 'deadly') n++;
    }
    return n;
  };
  // the visible top of the list: fixed by ranking on centrality (6/12 -> 0/12)
  ok(reweighFlips(found.slice(0, 10)) <= 1,
    `the top results still read the same when weighed properly (${reweighFlips(found.slice(0, 10))}/10 flipped)`);
  // the tail: fixed by the confirmation pass (9/49 -> 3/38 measured)
  const tail = found.slice(0, 20);
  ok(reweighFlips(tail) / tail.length <= 0.15,
    `the whole list holds up, not just its head (${reweighFlips(tail)}/${tail.length} flipped)`);

  // and the most typical examples come first, not the most marginal
  const gaps = found.slice(0, 8).map((f) => f.distance);
  ok(gaps.every((g, i) => i === 0 || g >= gaps[i - 1]), 'results are ordered by how central they are to the band');
}

// 8. veterancy climbs, and then stops ----------------------------------------
{
  const mean = (n) => {
    let hp = 0;
    for (let i = 0; i < 500; i++) hp += applyScars(rollCharacter(`vet/${i}`), n).hp;
    return hp / 500;
  };
  const [h0, h1, h3, h10] = [mean(0), mean(1), mean(3), mean(10)];
  ok(h0 < h1 && h1 < h3 && h3 < h10, `scars raise max HP (${h0.toFixed(1)} < ${h1.toFixed(1)} < ${h3.toFixed(1)} < ${h10.toFixed(1)})`);
  ok(h10 - h3 < h3 - h0, 'and the curve saturates — the tenth scar is worth less than the first');
  ok(applyScars(rollCharacter('vet/1'), 4).scars.length === 4, 'the scars rolled are reported');
  const base = rollCharacter('vet/1');
  applyScars(base, 5);
  ok(base.hp === rollCharacter('vet/1').hp, 'applying scars does not mutate the character');
  const twice = applyScars(rollCharacter('vet/2'), 3);
  ok(JSON.stringify(twice) === JSON.stringify(applyScars(rollCharacter('vet/2'), 3)), 'veterancy is deterministic');
}

// 9. the event stream and the summary tell the same story --------------------
//
// The arena replays these events. If they can disagree with the result the
// oracle counts, then the picture on screen is a second, unverified simulator
// wearing the first one's clothes — which is the whole thing this file exists
// to prevent. So: the events must reconstruct the summary, exactly.
{
  const goblin = BESTIARY.find((m) => m.id === 'goblin');
  const troll = BESTIARY.find((m) => m.id === 'troll');
  const run = (seed, n, monster, count, opts = {}) => simulate(
    party(n, seed),
    Array.from({ length: count }, (_, i) => combatantFromMonster(monster, i)),
    makeRng(seed), { events: true, ...opts },
  );

  const r = run('ev/1', 4, goblin, 5);
  ok(Array.isArray(r.events) && r.events.length > 3, `a recorded fight has events (${r.events.length})`);
  ok(simulate(party(4, 'ev/1'), [combatantFromMonster(goblin, 0)], makeRng('ev/1')).events === null,
    'and an unrecorded one carries none — the oracle pays nothing for the arena');

  ok(r.events[0].kind === 'start' && r.events[r.events.length - 1].kind === 'end',
    'the stream opens on start and closes on end');
  ok(r.events[0].pcs.length === 4 && r.events[0].foes.length === 5,
    'the opening event knows the whole field');
  ok(r.events[0].pcs.every((c) => c.name && c.hp >= 0 && c.maxHp >= 1 && typeof c.armor === 'number'),
    'every combatant in it is drawable — name, hp, maxHp, armour');

  // Every event that names someone must name someone who is on the field. A
  // typo'd or stale name is silent in the model and invisible on the map: the
  // token simply never reacts.
  {
    const strays = [];
    let checked = 0;
    // Six fights, because one is not enough to hit every branch: the streams
    // differ, and a name only goes stale in the branch that produced it.
    for (const seed of ['ev/a', 'ev/b', 'ev/c', 'ev/d', 'ev/e', 'ev/f']) {
      const ev = run(seed, 4, seed.endsWith('f') ? troll : goblin, 5).events;
      const known = new Set([...ev[0].pcs, ...ev[0].foes].map((c) => c.name));
      for (const e of ev) {
        // the servant is the one combatant that joins mid-fight, and it brings
        // its own record with it
        if (e.summoned) known.add(e.summoned.name);
        for (const key of ['actor', 'target']) {
          if (e[key]) { checked++; if (!known.has(e[key])) strays.push(`${seed} ${e.kind}.${key}=${e[key]}`); }
        }
      }
    }
    ok(checked > 100 && strays.length === 0,
      `every actor and target is on the field (${checked} names, ${strays.slice(0, 3).join(', ')})`);
    ok(r.events.filter((e) => e.kind === 'attack').every((e) => e.actor && e.weapon && (e.target || e.blast)),
      'every attack says who swung, with what, at whom — unless it is a blast');
    ok(r.events.filter((e) => e.kind === 'hit').every((e) => e.target && typeof e.raw === 'number'
      && typeof e.hp === 'number'), 'every hit says who took it, what was rolled and what is left');
  }

  // The reconstruction. Count the party's dead off the events alone and see
  // whether it matches the number the oracle would have banked.
  {
    // A fight the party loses people in — reconciling 0 against 0 would pass
    // for any implementation at all, including one that records nothing.
    let bodies = 0;
    for (const seed of ['ev/x1', 'ev/x2', 'ev/x3', 'ev/x4']) {
      const f = run(seed, 4, troll, 3);
      const pcNames = new Set(f.events[0].pcs.map((c) => c.name));
      const downed = new Set();
      for (const e of f.events) {
        if (e.kind === 'down' && pcNames.has(e.target)) downed.add(e.target);
        if ((e.kind === 'shake' || e.kind === 'regenerate') && pcNames.has(e.actor)) downed.delete(e.actor);
      }
      bodies += f.casualties;
      ok(downed.size === f.casualties,
        `${seed}: the events account for every casualty (${downed.size} vs ${f.casualties})`);
      const end = f.events[f.events.length - 1];
      ok(end.round === f.rounds, `${seed}: the stream ends on the fight's last round (${end.round})`);
      ok(end.survivors.length === f.survivors.length, `${seed}: and agrees on who is left standing`);
      ok(end.routed === f.routed, `${seed}: and on whether the enemy broke`);
    }
    ok(bodies > 0, `and those fights actually killed somebody (${bodies} down across four)`);
  }

  // The servant. It joins after the start event, so unless it travels with the
  // cast that raises it the arena has a name with nothing on the field.
  {
    let seen = null;
    for (let i = 0; i < 300 && !seen; i++) {
      const pcs = party(4, `ev/nec/${i}`);
      pcs[0].spells = [{ source: 'Spellbook: Raise Dead', kind: 'summon', hp: 3, STR: 8, DEX: 10, WIL: 3, dice: [6] }];
      const ev = simulate(pcs, Array.from({ length: 4 }, (_, k) => combatantFromMonster(goblin, k)),
        makeRng(`ev/nec/${i}`), { events: true }).events;
      seen = ev.find((e) => e.kind === 'cast' && e.effect === 'summon') || null;
    }
    ok(seen && seen.summoned && seen.summoned.name && seen.summoned.maxHp >= 1,
      'a summon carries the servant it raised — name, hp, armour, weapon');
  }

  // Damage arithmetic, off the wire. Cairn's chain is armour, then hit
  // protection, then STR — and the arena prints each part as a separate
  // clause, so a raw total that does not add up would be read as a rules bug
  // by anyone watching.
  {
    const bad = run('ev/2', 4, goblin, 6).events
      .filter((e) => e.kind === 'hit')
      .filter((e) => (e.blocked || 0) + (e.toHp || 0) + (e.toStr || 0) !== e.raw);
    ok(bad.length === 0, `blocked + hp + STR always equals the roll (${bad.length} mismatched)`);
  }

  // Determinism, because the arena's Replay button promises it.
  {
    const a = JSON.stringify(run('ev/3', 4, goblin, 4).events);
    const b = JSON.stringify(run('ev/3', 4, goblin, 4).events);
    ok(a === b, 'the same seed records the same fight, event for event');
    ok(a !== JSON.stringify(run('ev/4', 4, goblin, 4).events), 'and a different seed does not');
  }

  // Recording must not change the fight. If it did, the arena would be showing
  // a fight the oracle never played.
  {
    const summary = (o) => {
      const x = simulate(party(4, 'ev/5'),
        Array.from({ length: 5 }, (_, i) => combatantFromMonster(troll, i)),
        makeRng('ev/5'), o);
      return `${x.rounds}/${x.casualties}/${x.deaths}/${x.routed}/${x.survivors.join(',')}`;
    };
    ok(summary({}) === summary({ events: true }), 'watching a fight does not change it');
  }

  // The one event a reader will not believe unless it is real.
  {
    let regen = 0;
    for (let i = 0; i < 40 && !regen; i++) {
      regen = run(`ev/troll/${i}`, 4, troll, 2).events.filter((e) => e.kind === 'regenerate').length;
    }
    ok(regen > 0, 'trolls are recorded getting back up');
  }
}

// 10. the pilot and the oracle are ONE simulator ------------------------------
//
// combat.js exposes a generator; simulate() drives it with nobody piloting and
// the arena drives it with a person choosing. The danger in that arrangement is
// obvious — it is the same danger the event stream had — so two things are
// pinned here: that turning the fight into a generator did not move a single
// published number, and that a piloted fight resolves under the same rules.
{
  const goblin = BESTIARY.find((m) => m.id === 'goblin');
  const troll = BESTIARY.find((m) => m.id === 'troll');
  const foes = (m, n) => Array.from({ length: n }, (_, i) => combatantFromMonster(m, i));

  // THE FINGERPRINT. A fixed matrix of fights, reduced to one string. This was
  // captured before simulate() was refactored into a driver over fight(), and
  // it is the only reason that refactor could be called safe: 78 green checks
  // did not prove the numbers were unchanged, and this does.
  {
    // TWO DIGESTS, NOT ONE, and the split was bought with an afternoon.
    //
    // The original fingerprint folded `events.length` in with the outcomes. So
    // when the fight gained a new EVENT KIND — the scar recorded at exactly 0
    // HP, which consumes no dice and changes no result — the single digest went
    // red exactly as loudly as a broken damage rule would have, and the only way
    // to tell the difference was to check out the previous file and diff the two
    // by hand. (It was clean: outcomes −1568347449 before and after.)
    //
    // Now the outcomes stand alone. A red on `outcomes` means a die moved and
    // every published number with it. A red on `events` alone means the stream
    // gained or lost a kind — worth knowing, never an emergency.
    const outcomes = [];
    const streams = [];
    for (const id of ['goblin', 'bandit', 'troll', 'ogre', 'skeleton', 'wolf']) {
      const m = BESTIARY.find((x) => x.id === id);
      for (const n of [1, 3, 4]) {
        for (const cnt of [1, 3, 5]) {
          const r = simulate(party(n, `fp/${id}/${n}`), foes(m, cnt),
            makeRng(`fp/${id}/${n}/${cnt}/0`), { events: true });
          outcomes.push([id, n, cnt, r.rounds, r.casualties, r.deaths, r.wipe, r.routed,
            r.foesLeft, r.survivors.join('|')].join(','));
          streams.push(String((r.events || []).length));
        }
      }
    }
    // a cheap stable digest — enough to catch one die moving anywhere
    const digest = (rows) => {
      let h = 0;
      const blob = rows.join(';');
      for (let i = 0; i < blob.length; i++) h = (Math.imul(h, 31) + blob.charCodeAt(i)) | 0;
      return h;
    };
    ok(outcomes.length === 54, `the fingerprint covers ${outcomes.length} fights`);
    ok(digest(outcomes) === -1568347449,
      `54 recorded fights are bit-for-bit unchanged (digest ${digest(outcomes)}) — if this is ` +
      'the only failure you have altered the model, and every published number with it. ' +
      'Re-frozen once, deliberately, when the party stopped picking targets at ' +
      'random and started playing the `smart` policy.');
    ok(digest(streams) === -252178952,
      `and the event stream still has the same shape (digest ${digest(streams)}) — a red HERE ` +
      'with the outcomes green means the fight gained or lost an event kind without changing ' +
      'a single result, which is usually intended. Re-freeze it and say why.');
  }

  // A pilot answering every request resolves a real fight, under the same
  // rules, and reaches an end.
  {
    const g = fight(party(4, 'pilot/1'), foes(goblin, 4), makeRng('pilot/1'),
      { pilot: true, events: true });
    let step = g.next();
    let asked = 0;
    while (!step.done) {
      asked++;
      const req = step.value;
      ok(req.type === 'turn' && req.actor && Array.isArray(req.options) && req.options.length > 0,
        'every request names its actor and offers at least one option');
      const attack = req.options.find((o) => o.kind === 'attack');
      const mark = req.foes.find((f) => !f.down);
      step = g.next({ kind: 'attack', weapon: attack.weapon, target: mark && mark.name });
      if (asked > 400) break;
    }
    ok(step.done, `a piloted fight terminates (${asked} decisions)`);
    ok(asked > 0, 'and the pilot was actually asked');
    const r = step.value;
    ok(r.rounds >= 1 && Array.isArray(r.events), 'and it returns the same shape of result');
  }

  // WITHDRAWING IS NOT DYING. This is the whole point of adding it, and the
  // invariant has to be stated carefully: you cannot simply declare that a
  // fleeing party loses nobody, because round one's DEX save means some
  // characters never get to act at all and the enemy swings regardless. What
  // must hold is narrower and actually true — nobody who left is counted as
  // lost.
  {
    let ran = 0, bodies = 0, walkers = 0, contradiction = 0;
    for (let i = 0; i < 60; i++) {
      const g = fight(party(4, `flee/${i}`), foes(troll, 4), makeRng(`flee/${i}`), { pilot: true });
      let step = g.next();
      while (!step.done) step = g.next({ kind: 'withdraw' });
      const r = step.value;
      ran++;
      bodies += r.casualties;
      walkers += r.withdrew.length;
      // the invariant: a name cannot be both walked away and lost
      if (r.withdrew.some((n) => !r.survivors.includes(n))) contradiction++;
      if (r.casualties + r.withdrew.length > 4) contradiction++;
    }
    ok(contradiction === 0, `nobody is both a survivor and a casualty (${contradiction} of ${ran})`);
    ok(walkers > 0, `people actually got out (${walkers} across ${ran} fights)`);

    // And the claim worth measuring: leaving four trolls beats fighting them.
    // If this ever fails, either withdrawal is broken or trolls are not scary,
    // and both are worth being told about.
    let stood = 0;
    for (let i = 0; i < 60; i++) {
      stood += simulate(party(4, `flee/${i}`), foes(troll, 4), makeRng(`flee/${i}`)).casualties;
    }
    ok(bodies < stood,
      `walking away from four trolls costs less than fighting them ` +
      `(${(bodies / ran).toFixed(2)} vs ${(stood / ran).toFixed(2)} bodies per fight)`);
  }

  // Withdrawing is only offered to a pilot, and the oracle therefore cannot
  // take it — which is precisely why the oracle's numbers are a floor.
  {
    const r = simulate(party(4, 'pilot/3'), foes(troll, 4), makeRng('pilot/3'));
    ok(Array.isArray(r.withdrew) && r.withdrew.length === 0,
      'nobody withdraws in a simulated fight — the oracle stands and fights by definition');
  }

  // TWO OF THE SAME THING. A delver really can carry two sets of Soporific
  // Darts — one from their background, one off a corpse — and the pilot first
  // resolved a choice by NAME, so the second set could never be selected and
  // never ran out. Options carry an index into the character's own array now.
  {
    const pc = party(1, 'dupes')[0];
    pc.powers = [
      { source: 'Soporific Darts', kind: 'disable', uses: 1 },
      { source: 'Soporific Darts', kind: 'disable', uses: 1 },
    ];
    const opts = pcOptions(pc, [combatantFromMonster(goblin, 0)], null, true)
      .filter((o) => o.kind === 'power');
    ok(opts.length === 2, `both copies are offered (${opts.length})`);
    ok(opts[0].at === 0 && opts[1].at === 1, 'and each knows which one it is');

    // spend the SECOND one and check the first is untouched
    const g = fight([pc], [combatantFromMonster(goblin, 0)], makeRng('dupes'), { pilot: true });
    const step = g.next();
    if (!step.done) g.next({ kind: 'power', at: 1, source: 'Soporific Darts', target: step.value.foes[0].name });
    ok(pc.powers[1].uses === 0 && pc.powers[0].uses === 1,
      `choosing the second copy spends the second copy (${pc.powers.map((x) => x.uses)})`);
  }

  // The options offered are legal and honest about cost.
  {
    const pcs = party(4, 'pilot/4');
    const opts = pcOptions(pcs[0], foes(goblin, 3), null, true);
    ok(opts.some((o) => o.kind === 'attack'), 'a character is always offered an attack');
    ok(opts.some((o) => o.kind === 'withdraw'), 'and can always leave');
    ok(opts.filter((o) => o.kind === 'attack').every((o) => o.uses === null || o.uses > 0),
      'a spent one-use weapon is never offered');
    // A caster with a full pack must be told that reading costs them their HP.
    const caster = pcs.find((c) => (c.spells || []).length);
    if (caster) {
      const co = pcOptions(caster, foes(goblin, 3), null, true).filter((o) => o.kind === 'spell');
      ok(co.every((o) => /Fatigue|pack/.test(o.note)),
        'every spell states its Fatigue cost before it is spent');
    } else {
      ok(true, 'no caster in this party to check spell costing (skipped)');
    }
  }
}

// 11. WHO THE PARTY SWINGS AT ------------------------------------------------
//
// The model used to pick a target uniformly at random for each attacker, which
// is not a strategy — it is the absence of one, and it made the oracle
// over-report difficulty by playing the party badly. Cairn complicates the
// obvious fix: "if multiple attackers target the same foe, roll all damage dice
// and keep the single highest result", so focusing fire THROWS DICE AWAY.
//
// Which policy is best is therefore an empirical question and is answered here
// by measurement. Two mechanical facts fall out of it, and both are the reason
// the composite policy exists:
//
//   ARMOUR IS SUBTRACTED FROM EVERY HIT, so against an armoured foe many small
//   hits are eaten one at a time and a single pooled high die is not.
//   Focusing beats spreading against skeletons and loses against goblins.
//
//   A LEADER'S DEATH ROUTS THE GROUP, so one death can end the fight. Focusing
//   the leader is worth far more than the damage it wastes.
{
  const party4 = (seed) => party(4, seed);
  const foesOf = (id, n) => Array.from({ length: n },
    (_, i) => combatantFromMonster(BESTIARY.find((m) => m.id === id), i));
  const toll = (id, n, targeting) => assess(party4(`t/${id}`), foesOf(id, n),
    { trials: 900, seed: `t/${id}/${n}`, targeting }).meanCasualties / 4;

  ok(TARGETING.includes('smart') && TARGETING.includes('focus'),
    'focus fire is one of the policies on offer');

  // Goblins have no armour: spreading wins, and focusing is clearly worse.
  const gobSpread = toll('goblin', 5, 'spread');
  const gobFocus = toll('goblin', 5, 'focus');
  ok(gobSpread < gobFocus,
    `against unarmoured goblins, spreading beats focusing (${gobSpread.toFixed(3)} vs ${gobFocus.toFixed(3)})`);

  // Skeletons have 1 armour: focusing wins, because armour eats small hits.
  const skelSpread = toll('skeleton', 4, 'spread');
  const skelFocus = toll('skeleton', 4, 'focus');
  ok(skelFocus < skelSpread,
    `against armoured skeletons, focusing beats spreading (${skelFocus.toFixed(3)} vs ${skelSpread.toFixed(3)}) — ` +
    'armour is subtracted per hit, so pooling into one big die loses less');

  // Bandits have a leader whose death routs them: focusing the leader wins big.
  const banSpread = toll('bandit', 6, 'spread');
  const banLeader = toll('bandit', 6, 'leader');
  ok(banLeader < banSpread - 0.05,
    `killing the bandit leader beats spreading by a wide margin (${banLeader.toFixed(3)} vs ${banSpread.toFixed(3)})`);

  // And the composite is at least as good as every single policy on average —
  // which is the only justification for it being the default.
  const basket = [['goblin', 5], ['skeleton', 4], ['bandit', 6], ['wolf', 3], ['ogre', 1]];
  const mean = (t) => basket.reduce((n, [id, k]) => n + toll(id, k, t), 0) / basket.length;
  const smart = mean('smart');
  const scores = { random: mean('random'), spread: mean('spread'), focus: mean('focus'), leader: mean('leader') };
  for (const [name, v] of Object.entries(scores)) {
    ok(smart <= v + 0.02,
      `the composite is no worse than ${name} (${smart.toFixed(3)} vs ${v.toFixed(3)})`);
  }
  ok(smart < scores.random - 0.03,
    `and clearly better than picking at random, which is what this used to do ` +
    `(${smart.toFixed(3)} vs ${scores.random.toFixed(3)})`);
}

// 12. the party radar's axes still predict what they claim to -----------------
//
// A radar plot is the easiest chart in the world to lie with: pick axes that
// sound right, draw a pleasing shape, never check. Each axis in party.js earned
// its place by correlating with measured toll, and this is what stops that
// claim from rotting — if the combat model changes and an axis stops
// predicting, the shape becomes decoration and the suite says so.
{
  const eachAxis = AXES.map((a) => a.key);
  ok(eachAxis.length === 4, `four axes survived selection (${eachAxis})`);
  ok(AXES.every((a) => a.why && a.corrByDelve.length === 4),
    'every axis records why it exists and its correlation at each delve level');
  ok(REJECTED.length >= 7, `and the rejected candidates are kept with their numbers (${REJECTED.length})`);
  ok(REJECTED.some((r) => r.key === 'sweep' && /0 of 3000/.test(r.verdict)),
    'sweep is on record as dropped for never varying, not for failing to predict');
  ok(REJECTED.some((r) => r.key === 'recovery' && r.corr.fresh * r.corr.delved < 0),
    'the healing axis is on record as flipping sign — "every party needs a healer" is not a Cairn fact');

  // Expected damage under keep-the-highest, checked against values worked by
  // hand: a d6 averages 3.5, and two d6 kept highest average 161/36.
  ok(Math.abs(expectedDamage([6]) - 3.5) < 1e-9, 'a d6 averages 3.5');
  ok(Math.abs(expectedDamage([6, 6]) - 161 / 36) < 1e-9,
    `two d6 keeping the highest average ${(161 / 36).toFixed(4)}`);
  // 161/36 = 4.472 beats a lone d8's 4.5? No — it does not, and only just. That
  // near-tie is worth pinning: it is why two d6 attackers are worth about one
  // d8 attacker, and why focus fire is not free.
  ok(expectedDamage([6, 6]) < expectedDamage([8]),
    `two d6 kept-highest (${expectedDamage([6, 6]).toFixed(3)}) is worth slightly LESS than one d8 (4.5)`);
  ok(expectedDamage([8]) - expectedDamage([6, 6]) < 0.05, 'but only just — within 0.05');

  const corr = (xs, ys) => {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    return num / Math.sqrt((dx * dy) || 1);
  };

  // THE LIVE CHECK. Score parties on each axis, measure their actual toll, and
  // require each correlation to still point the way party.js says it does.
  //
  // Measured in BOTH regimes, because two of the four axes only exist in one of
  // them, and a single sample cannot see that. This is the correction to an
  // earlier version of this test, which sampled 26 parties at three delves and
  // reported grit at +0.42 — a sample that small has a standard error of 0.21,
  // so it was measuring noise and calling it a refutation. Forty parties at
  // se ≈ 0.16, in the two regimes the axes were fitted in, costs about a
  // second and actually tests the claim.
  const basket = [['goblin', 5], ['skeleton', 4], ['bandit', 4], ['wolf', 3], ['ogre', 2]];
  const measureAt = (delves) => {
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const pcs = rollParty(`radar/${i}`, 4).members
        .map((m, k) => combatantFromCharacter(delves ? delve(m, delves, { seed: `${k}` }) : m));
      let toll = 0;
      for (const [id, n] of basket) {
        const mon = BESTIARY.find((m) => m.id === id);
        toll += assess(pcs, Array.from({ length: n }, (_, k) => combatantFromMonster(mon, k)),
          { trials: 100, seed: `radar/${i}/${id}` }).meanCasualties / 4;
      }
      rows.push({ toll: toll / basket.length, p: profile(pcs, { delves }) });
    }
    const tolls = rows.map((r) => r.toll);
    const out = { tolls };
    AXES.forEach((a, i) => { out[a.key] = corr(rows.map((r) => r.p.axes[i].raw), tolls); });
    return out;
  };
  const fresh = measureAt(0);
  const delved = measureAt(3);

  for (const [name, s] of [['fresh', fresh], ['delved', delved]]) {
    ok(Math.max(...s.tolls) - Math.min(...s.tolls) > 0.1,
      `${name} parties differ enough to correlate against ` +
      `(${Math.min(...s.tolls).toFixed(2)}..${Math.max(...s.tolls).toFixed(2)})`);
    // The two always-on axes must predict in both regimes.
    ok(s.durability < -0.5,
      `${name}: durability predicts fewer deaths (${s.durability.toFixed(2)})`);
    ok(s.damage < -0.25, `${name}: damage predicts fewer deaths (${s.damage.toFixed(2)})`);
    ok(Math.abs(s.durability) === Math.max(...AXES.map((a) => Math.abs(s[a.key]))),
      `${name}: durability is still the strongest axis ` +
      `(${AXES.map((a) => `${a.key} ${s[a.key].toFixed(2)}`).join(', ')})`);
  }

  // The two regime-bound axes, each checked where party.js claims it works —
  // AND checked for the decay, so the claim cannot quietly become false in one
  // regime while still passing in the other.
  ok(fresh.grit < -0.2,
    `grit decides FRESH parties (${fresh.grit.toFixed(2)}) — Strength is what damage overflows into`);
  ok(Math.abs(delved.grit) < Math.abs(fresh.grit) - 0.1,
    `and fades once armour piles up (${delved.grit.toFixed(2)} at three delves) — if this stops ` +
    'being true the mechanism in party.js is wrong, not just the number');
  // `speed` is the axis that replaced `sweep`, and unlike the others it is
  // required to work in BOTH regimes — that is the whole reason it is here.
  ok(fresh.speed < -0.1 && delved.speed < -0.1,
    `speed predicts in both regimes (${fresh.speed.toFixed(2)} fresh, ${delved.speed.toFixed(2)} delved)`);

  // EVERY AXIS MUST VARY WHERE IT IS DRAWN. This is the rule `sweep` broke: it
  // predicted beautifully for delved parties and was identically zero for
  // fresh ones, so a quarter of the roller's chart said nothing at all. A
  // correlation earns an axis its place; a non-zero spread keeps it there.
  for (const [name, delves] of [['fresh', 0], ['delved', 3]]) {
    for (let i = 0; i < AXES.length; i++) {
      const vals = Array.from({ length: 40 }, (_, k) => {
        const p = rollParty(`radar/${k}`, 4).members
          .map((m, j) => combatantFromCharacter(delves ? delve(m, delves, { seed: `${j}` }) : m));
        return profile(p, { delves }).axes[i].raw;
      });
      const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
      const spread = Math.sqrt(vals.reduce((t, v) => t + (v - mu) ** 2, 0) / vals.length);
      ok(spread > 0.01,
        `${name}: ${AXES[i].key} actually varies between parties (sd ${spread.toFixed(2)}) — ` +
        'an axis that is the same for everybody is a spoke, not a measurement');
    }
  }

  // AND `speed`'S MECHANISM IS ISOLATED, not merely correlated. Cairn: "During
  // the first round of combat, each PC must make a DEX save in order to act."
  // Raise Dexterity and the toll falls; take away that one save, by starting
  // the fight surprised, and raising Dexterity does exactly nothing.
  {
    const foes = () => Array.from({ length: 5 },
      (_, i) => combatantFromMonster(BESTIARY.find((m) => m.id === 'goblin'), i));
    const shift = (party, by) => party.map((c) => ({ ...c, DEX: Math.max(3, Math.min(18, c.DEX + by)) }));
    const measure = (opts) => {
      let low = 0, high = 0;
      for (let i = 0; i < 12; i++) {
        const party = rollParty(`dexab/${i}`, 4).members.map((m) => combatantFromCharacter(m));
        low += assess(shift(party, -3), foes(), { trials: 400, seed: `dexab/${i}`, ...opts }).toll;
        high += assess(shift(party, 3), foes(), { trials: 400, seed: `dexab/${i}`, ...opts }).toll;
      }
      return (low - high) / 12;
    };
    const normal = measure({});
    const surprised = measure({ surprise: true });
    ok(normal > 0.005,
      `six points of Dexterity is worth ${normal.toFixed(4)} of the toll`);
    ok(Math.abs(surprised) < 1e-9,
      `and worth exactly nothing when nobody gets the first-round save (${surprised.toFixed(4)}) — ` +
      'this is what makes speed a mechanism and not a coincidence');
  }

  const raw4 = rollParty('ov', 4).members;
  const pcs = raw4.map((m) => combatantFromCharacter(m));
  const vets = raw4.map((m, k) => combatantFromCharacter(delve(m, 3, { seed: `${k}` })));
  ok(profile(pcs).delves === 0 && profile(vets).delves === 3,
    'the profile reads how far in the party is off the party itself');
  ok(profile(pcs).axes.every((a) => a.weight > 0),
    'and every axis now carries weight on a freshly rolled party — none of them is dead on arrival');
  ok(profile(vets).axes.find((a) => a.key === 'grit').weight
    < profile(pcs).axes.find((a) => a.key === 'grit').weight,
  'grit counts for less the further in they are');

  // and the overview a page renders is well formed
  const o = overview(pcs);
  ok(o.axes.length === 4 && o.axes.every((a) => a.value >= 0 && a.value <= 1),
    'every axis normalises into 0..1');
  ok(o.score >= 0 && o.score <= 1, `the headline score is in range (${o.score.toFixed(2)})`);
  ok(Object.keys(o.roles).length === 5, 'five roles are reported');
  const pts = radarPoints(o.axes);
  ok(pts.length === 4 && pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    'the radar geometry is finite');
  ok(Math.abs(pts[0].ax) < 1e-9 && pts[0].ay < 0, 'the first axis points straight up');
}

// 13. and the whole thing is fast enough to run in a page --------------------
{
  const t0 = Date.now();
  assess(party(4, 'perf'), Array.from({ length: 6 }, (_, i) =>
    combatantFromMonster(BESTIARY.find((m) => m.id === 'goblin'), i)), { trials: 2000, seed: 'perf' });
  const ms = Date.now() - t0;
  ok(ms < 3000, `2000 trials of 4v6 in ${ms}ms`);
}

console.log(`combat.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
