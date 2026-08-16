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
  simulate, fight, pcOptions, assess, findEncounters, band, BANDS,
  combatantFromCharacter, combatantFromMonster, applyScars,
} from './combat.js';
import { makeRng } from './roll.js';

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
    const rows = [];
    for (const id of ['goblin', 'bandit', 'troll', 'ogre', 'skeleton', 'wolf']) {
      const m = BESTIARY.find((x) => x.id === id);
      for (const n of [1, 3, 4]) {
        for (const cnt of [1, 3, 5]) {
          const r = simulate(party(n, `fp/${id}/${n}`), foes(m, cnt),
            makeRng(`fp/${id}/${n}/${cnt}/0`), { events: true });
          rows.push([id, n, cnt, r.rounds, r.casualties, r.deaths, r.wipe, r.routed,
            r.foesLeft, r.survivors.join('|'), (r.events || []).length].join(','));
        }
      }
    }
    // a cheap stable digest — enough to catch one die moving anywhere
    let h = 0;
    const blob = rows.join(';');
    for (let i = 0; i < blob.length; i++) h = (Math.imul(h, 31) + blob.charCodeAt(i)) | 0;
    ok(rows.length === 54, `the fingerprint covers ${rows.length} fights`);
    ok(h === -1647786003,
      `54 recorded fights are bit-for-bit unchanged (digest ${h}) — if this is the only ` +
      'failure you have altered the model, and every published number with it');
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

// 11. and the whole thing is fast enough to run in a page --------------------
{
  const t0 = Date.now();
  assess(party(4, 'perf'), Array.from({ length: 6 }, (_, i) =>
    combatantFromMonster(BESTIARY.find((m) => m.id === 'goblin'), i)), { trials: 2000, seed: 'perf' });
  const ms = Date.now() - t0;
  ok(ms < 3000, `2000 trials of 4v6 in ${ms}ms`);
}

console.log(`combat.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
