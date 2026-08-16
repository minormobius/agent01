// table/cairn/combat.js — a Cairn 2e combat simulator, and the encounter search
// built on top of it.
//
// WHY THIS EXISTS. Cairn ships no challenge rating, no XP budget, and no
// encounter-building table, deliberately: difficulty is the Warden's call, made
// in the fiction. That leaves a Warden with no way to answer "will six bandits
// kill this party?" except intuition. Cairn's combat is unusually mechanical —
// attacks hit automatically, damage is a die minus armour, the overflow goes to
// STR and forces a save — so the question can simply be ANSWERED, by playing the
// fight ten thousand times.
//
// WHAT THE NUMBER MEANS, AND WHAT IT DOES NOT. This models a stand-and-fight to
// the last body: no terrain, no tricks, no talking, no running. Cairn is a game
// about avoiding exactly that fight, so every number here is a WORST CASE — the
// floor a party is standing on if a scene goes badly and nobody gets clever. It
// is the useful number for prep, and it is not a prediction of play. None of it
// is Cairn's rules; it is arithmetic performed on top of them.
//
// Rules text quoted in comments is Cairn 2e by Yochai Gal, CC BY-SA 4.0.

import { makeRng, packInventory, parseItem } from './roll.js';
import { monsterAbilities, spellEffect, relicEffect } from './effects.js';

// --------------------------------------------------------------- combatants

/**
 * A party sheet -> the handful of numbers a fight actually consumes.
 *
 * The second argument tolerates junk on purpose: the natural way to convert a
 * party is `members.map(combatantFromCharacter)`, and map hands its callback an
 * index, which would otherwise blow up on the spread below.
 */
export function combatantFromCharacter(character, extraItems) {
  const extras = Array.isArray(extraItems) ? extraItems : [];
  const inv = packInventory([...character.gear, ...extras]);
  // "Unarmed attacks always do d4 damage."
  const attacks = inv.weapons.length
    ? inv.weapons
        .map((w) => ({
          name: w.name,
          dice: (w.damage.match(/d(\d+)/g) || ['d4']).map((d) => Number(d.slice(1))),
          blast: w.blast,
        }))
        // best weapon first — a character fights with their sword, not the
        // needle-knife they also happen to be carrying
        .sort((a, b) => Math.max(...b.dice) - Math.max(...a.dice))
    : [{ name: 'unarmed', dice: [4], blast: false }];

  // "Anyone carrying a full inventory (i.e. filling all 10 slots) is reduced to
  //  0 HP." Without this the pack has no weight in the model at all: a party
  //  hauling ten slots of loot fought exactly as well as one travelling light,
  //  which quietly deletes the resource game the whole system runs on. At 0 HP
  //  every hit goes straight to STR, which is as punishing as it sounds.
  const encumbered = inv.full;

  // Magic is carried, so it is read off the pack like everything else. A
  // spellbook is one slot and reading it costs a Fatigue — another slot — which
  // is why casting is a real decision and not a free action.
  const carried = [...character.gear, ...extras];
  const spells = carried
    .map((item) => ({ item, effect: spellEffect(item) }))
    .filter((s) => s.effect)
    .map((s) => ({ ...s.effect, source: s.item.name, kind: s.effect.kind, spell: true }));
  const powers = carried
    .filter((item) => item.relic)
    .map((item) => ({ item, effect: relicEffect(item.relic) }))
    .filter((p) => p.effect)
    .map((p) => ({ ...p.effect, source: p.item.name, uses: p.effect.uses || 1 }));

  return {
    name: character.name,
    side: 'pc',
    hp: encumbered ? 0 : character.hp,
    maxHp: character.hp,
    encumbered,
    freeSlots: Math.max(0, inv.capacity - inv.used),
    spells,
    powers,
    armor: inv.armor,
    STR: character.attributes.STR,
    DEX: character.attributes.DEX,
    WIL: character.attributes.WIL,
    maxSTR: character.attributes.STR,
    attacks,
  };
}

/** A bestiary entry -> one combatant. `index` only distinguishes duplicates. */
export function combatantFromMonster(monster, index = 0) {
  const { abilities, unread } = monsterAbilities(monster);
  return {
    abilities,
    unreadProse: unread.length,
    name: index ? `${monster.name} ${index + 1}` : monster.name,
    side: 'foe',
    hp: monster.hp,
    maxHp: monster.hp,
    armor: monster.armor,
    STR: monster.STR,
    DEX: monster.DEX,
    WIL: monster.WIL,
    maxSTR: monster.STR,
    // The three attackless tricksters in the bestiary (Boggart, Pixie,
    // Will-o-Wisp) fight with abilities the simulator cannot model, so here
    // they simply do not attack. Their encounters read as trivial, correctly:
    // the danger they pose is not damage.
    attacks: monster.attacks.map((a) => ({ name: a.name, dice: a.dice, blast: a.blast })),
  };
}

// -------------------------------------------------------------------- rules

const alive = (c) => !c.down;

/** "A save is a roll to avoid negative outcomes… roll equal to or under." */
function save(rng, score) {
  const roll = rng.d(20);
  if (roll === 1) return true;    // "A 1 is always a success"
  if (roll === 20) return false;  // "and a 20 is always a failure"
  return roll <= score;
}

/**
 * Resolve one attack's damage dice.
 *
 * "If attacking with two weapons at the same time, roll both damage dice and
 * keep the single highest result" — which is also how a d8+d8 claw pair works,
 * and why two dice is much weaker than two attacks.
 */
function rollDamage(rng, attack, mod) {
  if (mod === 'impaired') return rng.d(4);   // "must roll 1d4 damage regardless"
  if (mod === 'enhanced') return rng.d(12);  // "allowing 1d12 damage instead"
  let best = 0;
  for (const sides of attack.dice) best = Math.max(best, rng.d(sides));
  return best;
}

/**
 * Apply damage to one target, following the whole chain:
 * armour, then HP, then the overflow into STR, then the Critical Damage save.
 */
function applyDamage(rng, target, raw, log, attacker) {
  // "Before calculating damage to HP, subtract the target's Armor value"
  const dmg = Math.max(0, raw - target.armor);
  const toHp = Math.min(target.hp, dmg);
  target.hp -= toHp;
  const overflow = dmg - toHp;
  if (overflow <= 0) return;

  // "Damage that reduces a target's HP below zero is subtracted from their STR
  //  by the amount of damage remaining."
  target.STR -= overflow;
  if (target.STR <= 0) {
    target.STR = 0;
    target.down = true;
    target.dead = true;                       // "If a PC's STR is reduced to 0, they die."
    if (log) log.push(`${target.name} is killed outright`);
    return;
  }
  // "The target must then immediately make a STR save… using their new STR score."
  if (!save(rng, target.STR)) {
    target.down = true;
    // A PC is out of action and dies within the hour unless stabilised; a
    // monster is simply dead. Either way it stops fighting, which is all the
    // simulation needs to know — UNLESS it regenerates, in which case being
    // felled is temporary. Marking every monster dead here made the troll's
    // regeneration unreachable: the revival check requires a body that is down
    // but not dead, and there was never one.
    const regrows = (target.combatAbilities || []).some((a) => a.kind === 'regenerate');
    target.dead = target.side !== 'pc' && !regrows;
    if (log) log.push(`${target.name} takes critical damage`);

    // Half the bestiary carries a consequence for exactly this moment — an
    // extra d6 of STR gone, armour rent, a wound that leaves you deprived. It
    // is the difference between a character who wakes up and one who does not.
    for (const ability of (attacker && attacker.combatAbilities) || []) {
      if (ability.trigger === 'onCrit') applyEffect(rng, ability, target, log);
    }
  }
}

/**
 * Attacks against some creatures are impaired — a basilisk you dare not look
 * at, a blink dog phasing out of reality, a werewolf without a silver blade.
 * This is the single largest lethality modifier in the bestiary and the model
 * was blind to it: it turns any attack into a d4 regardless of the weapon.
 *
 * `unless` names the thing that lifts the penalty ("silver", "magic"), which is
 * checked against the attacker's weapon name — Cairn's own gear list includes a
 * Silver Knife, so this is a real out and not a hypothetical one.
 */
function attackModifier(attacker, target, enabled = true) {
  if (!enabled) return null;
  const ward = (target.abilities || []).find((a) => a.kind === 'impairedAgainst');
  if (!ward) return null;
  if (ward.unless) {
    const weapon = (attacker.attacks[0] && attacker.attacks[0].name) || '';
    if (new RegExp(ward.unless, 'i').test(weapon)) return null;
  }
  return 'impaired';
}

/** Apply one ability to one target. Saves are rolled where the ability has one. */
function applyEffect(rng, effect, target, log) {
  if (effect.save && save(rng, target[effect.save])) return false;
  switch (effect.kind) {
    case 'disable':
      // Asleep, charmed, petrified, possessed: out of the fight without being
      // wounded. Counted as a casualty, because a sleeping character in a room
      // of things that just felled them is not a survivor.
      target.disabled = true;
      target.down = true;
      if (log) log.push(`${target.name} is out of the fight (${effect.note || effect.kind})`);
      return true;
    case 'drain': {
      let total = 0;
      for (const d of effect.dice || [6]) total += rng.d(d);
      const attr = effect.attr || 'STR';
      target[attr] -= total;
      if (target[attr] <= 0) {
        target[attr] = 0;
        target.down = true;
        target.dead = attr === 'STR';
        if (log) log.push(`${target.name} is emptied of ${attr}`);
      }
      return true;
    }
    case 'deprive':
      target.deprived = true;                 // "cannot recover HP, Attributes, or item slots"
      return true;
    case 'sunder':
      if (target.armor > 0) target.armor -= 1;
      return true;
    case 'heal': {
      let total = 0;
      for (const d of effect.dice || [4]) total += rng.d(d);
      target.STR = Math.min(target.maxSTR, target.STR + total);
      return true;
    }
    default:
      return false;
  }
}

/** Pick a living target. Cairn punishes focus fire — see the note in simulate. */
function pickTarget(rng, candidates) {
  return candidates[rng.d(candidates.length) - 1];
}

/**
 * One fight, to a conclusion. Returns what happened; mutates nothing outside.
 *
 * @param {object[]} pcs    combatants (side 'pc')
 * @param {object[]} foes   combatants (side 'foe')
 * @param {object} rng      seeded dice from roll.js
 * @param {object} [opts]
 * @param {boolean} [opts.morale=true]   enemies may rout (Cairn's default)
 * @param {boolean} [opts.surprise]      foes act first and the PCs skip their DEX save round
 * @param {number} [opts.maxRounds=30]   a standing draw is called, not looped forever
 */
export function simulate(pcs, foes, rng, opts = {}) {
  // `abilities: false` runs the fight with magic and monster powers switched
  // off. It exists so the cost of modelling them can be MEASURED rather than
  // asserted — see the ability-delta test in combat.selftest.
  const { morale = true, surprise = false, maxRounds = 30, abilities = true } = opts;
  const powersOf = (c) => (abilities ? c.abilities || [] : []);
  const log = opts.log ? [] : null;
  const startingFoes = foes.length;
  let round = 0;
  let routed = false;
  let firstCasualtyRound = 0;
  let checkedFirst = false;
  let checkedHalf = false;

  // "During the first round of combat, each PC must make a DEX save in order to
  //  act." Surprise means they do not even get that.
  // applyDamage cannot see `opts`, so the on-crit powers are published onto the
  // combatant for the duration of this fight and taken away again below.
  for (const c of [...pcs, ...foes]) c.combatAbilities = powersOf(c);

  const acts = new Map();
  for (const pc of pcs) acts.set(pc, surprise ? false : save(rng, pc.DEX));

  const side = (list) => list.filter(alive);

  while (round < maxRounds) {
    round++;
    const livePcs = side(pcs);
    const liveFoes = side(foes);
    if (!livePcs.length || !liveFoes.length || routed) break;

    // --- the PCs' turn ----------------------------------------------------
    // Attacks are spread across targets rather than focused. This is not a
    // stylistic choice: "if multiple attackers target the same foe, roll all
    // damage dice and keep the single highest result", so concentrating fire
    // throws away dice. Spreading is the strong play, and the sim plays it.
    const targeted = new Map();
    for (const pc of livePcs) {
      if (round === 1 && !acts.get(pc)) continue;

      // CASTING. "Anyone can cast a spell by holding a Spellbook in both hands
      // and reading its contents aloud. They must then add a Fatigue to
      // inventory." That Fatigue is a slot, and a slot is HP: if the pack has
      // no room the character must drop something, and if it fills the pack
      // they drop to 0 HP. So a spell is never free, and the model charges for
      // it. "If the PC is deprived or in danger… the Warden may require a WIL
      // save" — combat is danger, so the save is always rolled here.
      // Which spell, if any. Removing an enemy outright beats patching an ally,
      // so a disable goes first; a heal is worth a turn only once someone has
      // actually been opened up, since STR only drops after HP is gone.
      const hurt = livePcs.find((a) => a.STR <= a.maxSTR / 2);
      const spell = abilities && pc.spells && (
        pc.spells.find((sp) => !sp.spent && sp.kind === 'disable')
        || (hurt && pc.spells.find((sp) => !sp.spent && sp.kind === 'heal')));
      if (spell && side(foes).length && !pc.encumbered) {
        spell.spent = true;
        if (pc.freeSlots > 0) pc.freeSlots -= 1; else { pc.hp = 0; pc.encumbered = true; }
        if (save(rng, pc.WIL)) {
          const victim = spell.kind === 'heal' ? hurt : pickTarget(rng, side(foes));
          if (victim) applyEffect(rng, spell, victim, log);
        } else if (log) {
          log.push(`${pc.name} fumbles ${spell.source}`);
        }
        continue;                              // reading a book is the whole turn
      }

      const attack = pc.attacks[0];
      const target = pickTarget(rng, side(foes));
      if (!target) break;
      const dmg = rollDamage(rng, attack, attackModifier(pc, target, abilities));
      const prev = targeted.get(target);
      // same-target attacks in one round collapse to the single highest die
      if (prev == null || dmg > prev.dmg) targeted.set(target, { dmg, attacker: pc });
    }
    for (const [target, hit] of targeted) applyDamage(rng, target, hit.dmg, log, hit.attacker);

    // REGENERATION. "Only when the body is burned…" — a stand-and-fight model
    // has no fire to apply, so a troll that goes down gets back up. That is not
    // a modelling shortcut, it is why you do not brawl with trolls.
    for (const foe of foes) {
      if (foe.down && !foe.dead && powersOf(foe).some((a) => a.kind === 'regenerate')) {
        foe.down = false;
        foe.hp = Math.max(1, Math.floor(foe.maxHp / 2));
        if (log) log.push(`${foe.name} gets back up`);
      }
    }

    const casualties = foes.filter((f) => !alive(f)).length;

    // --- morale -----------------------------------------------------------
    // "Enemies must pass a WIL save to avoid fleeing when they take their first
    //  casualty and again when they lose half their number. Lone foes must save
    //  when they're reduced to 0 HP."
    if (morale && side(foes).length) {
      const leader = side(foes)[0];
      const lone = startingFoes === 1;
      const checkFirst = casualties >= 1 && !checkedFirst;
      const checkHalf = casualties >= Math.ceil(startingFoes / 2) && !checkedHalf;
      const checkLone = lone && leader.hp === 0 && !checkedFirst;
      if (checkFirst || checkHalf || checkLone) {
        if (checkFirst || checkLone) checkedFirst = true;
        if (checkHalf) checkedHalf = true;
        if (!save(rng, leader.WIL)) {
          routed = true;
          if (log) log.push(`the enemy routs in round ${round}`);
          break;
        }
      }
    }

    // --- the foes' turn ---------------------------------------------------
    const hitPcs = new Map();
    for (const foe of side(foes)) {
      // A creature with a turn ability uses it instead of biting: a banshee
      // wails, a basilisk stares, a frost elf casts Sleep.
      const power = powersOf(foe).find((a) => a.trigger === 'onTurn');
      if (power) {
        const victims = power.scope === 'all' ? side(pcs) : [pickTarget(rng, side(pcs))];
        for (const victim of victims) if (victim) applyEffect(rng, power, victim, log);
        continue;
      }
      if (!foe.attacks.length) continue;
      const attack = foe.attacks[rng.d(foe.attacks.length) - 1];
      if (attack.blast) {
        // "Attacks with the Blast quality affect all targets in the noted area,
        //  rolling separately for each affected character."
        for (const pc of side(pcs)) applyDamage(rng, pc, rollDamage(rng, attack, null), log, foe);
        continue;
      }
      const target = pickTarget(rng, side(pcs));
      if (!target) break;
      const dmg = rollDamage(rng, attack, attackModifier(foe, target, abilities));
      const prev = hitPcs.get(target);
      if (prev == null || dmg > prev.dmg) hitPcs.set(target, { dmg, attacker: foe });

      // "A damaged vampire regains 6 HP when it bites" — an on-hit heal that
      // makes a lone monster a war of attrition rather than a race.
      for (const ability of powersOf(foe)) {
        if (ability.trigger === 'onHit' && ability.self) applyEffect(rng, ability, foe, log);
      }
    }
    for (const [target, hit] of hitPcs) applyDamage(rng, target, hit.dmg, log, hit.attacker);

    if (!firstCasualtyRound && pcs.some((p) => !alive(p))) firstCasualtyRound = round;
  }

  const downPcs = pcs.filter((p) => !alive(p));
  return {
    rounds: round,
    routed,
    wipe: downPcs.length === pcs.length,
    casualties: downPcs.length,
    deaths: pcs.filter((p) => p.dead).length,
    survivors: pcs.filter(alive).map((p) => p.name),
    foesLeft: side(foes).length,
    firstCasualtyRound,
    log,
  };
}

// ------------------------------------------------------------- the oracle

/**
 * Fresh copies, so a trial never inherits the last trial's wounds.
 *
 * THE SPELLS AND POWERS MUST BE COPIED TOO. A shallow spread shares the arrays
 * between every trial, so a spellbook marked `spent` in trial one stays spent
 * for the other 2,999 — which is exactly how casting came to have no effect on
 * the numbers at all while looking perfectly wired up. Any new per-fight state
 * on a combatant belongs here.
 */
const clone = (list) => list.map((c) => ({
  ...c,
  spells: c.spells ? c.spells.map((sp) => ({ ...sp })) : undefined,
  powers: c.powers ? c.powers.map((pw) => ({ ...pw })) : undefined,
}));

/**
 * Play the same fight `trials` times and report the distribution.
 *
 * Deterministic: same party, same foes, same seed -> same numbers, so a
 * verdict is quotable and a permalink means something.
 */
export function assess(pcs, foes, { trials = 2000, seed = 'oracle', ...opts } = {}) {
  const rng = makeRng(seed);
  let wipes = 0, casualties = 0, deaths = 0, rounds = 0, routs = 0, unscathed = 0;
  let firstCasualty = 0, firstCasualtyN = 0;
  const perPc = pcs.map(() => 0);

  for (let i = 0; i < trials; i++) {
    const p = clone(pcs);
    const f = clone(foes);
    const r = simulate(p, f, rng, opts);
    if (r.wipe) wipes++;
    casualties += r.casualties;
    deaths += r.deaths;
    rounds += r.rounds;
    if (r.routed) routs++;
    if (r.casualties === 0) unscathed++;
    if (r.firstCasualtyRound) { firstCasualty += r.firstCasualtyRound; firstCasualtyN++; }
    p.forEach((c, idx) => { if (!alive(c)) perPc[idx]++; });
  }

  const toll = casualties / trials / pcs.length;
  return {
    trials,
    // THE METRIC. See `band` below for what these two numbers are and why they
    // are the two.
    toll,
    swing: wipes / trials,
    wipeRate: wipes / trials,
    meanCasualties: casualties / trials,
    deathRate: deaths / (trials * pcs.length),
    unscathedRate: unscathed / trials,
    routRate: routs / trials,
    meanRounds: rounds / trials,
    // The round the first body drops is the round the party should already be
    // running. It is the most actionable number the oracle produces.
    meanFirstCasualtyRound: firstCasualtyN ? firstCasualty / firstCasualtyN : null,
    perCharacterDownRate: perPc.map((n) => n / trials),
    band: band(toll, wipes / trials),
  };
}

/**
 * THE CHALLENGE METRIC. Cairn publishes no difficulty scale, so this is ours,
 * and it is stated in units that mean something rather than as a rating out of
 * ten. Two numbers, because one is not enough:
 *
 *   TOLL — the expected fraction of the party that does not walk away.
 *          0.25 means "on average this fight costs a quarter of the party".
 *          It is an average, so it is the right number for pricing a whole
 *          dungeon: five toll-0.2 rooms cost about one character.
 *
 *   SWING — the probability the whole party is wiped. This is the tail, and it
 *          is NOT implied by toll. A fight that always leaves one body has the
 *          same toll as one that is free three times in four and total the
 *          fourth. The first is attrition; the second ends campaigns. A Warden
 *          needs to see the difference, so swing can escalate a band on its own.
 *
 * The cut points are judgement calls, and they are the only invented numbers
 * in the model. They are set where the meaning changes rather than on round
 * numbers: below a twentieth of a party lost, nothing is really at stake; a
 * fifth means someone is getting hurt regularly; approaching half means the
 * party should be planning an exit before the first round.
 */
export const BANDS = ['routine', 'risky', 'deadly', 'lethal'];

export function band(toll, swing = 0) {
  if (toll >= 0.45 || swing >= 0.25) return 'lethal';
  if (toll >= 0.20 || swing >= 0.05) return 'deadly';
  if (toll >= 0.05) return 'risky';
  return 'routine';
}

/** Where a band sits, for ranking results by how typical they are of it. */
export const BAND_CENTRE_TOLL = { routine: 0.02, risky: 0.12, deadly: 0.30, lethal: 0.60 };


/**
 * Search the bestiary for encounters that land in a target band against THIS
 * party.
 *
 * Lethality rises monotonically with the number of foes, so each species gets a
 * scan upward from one until it overshoots — ~6 assessments per species rather
 * than a blind sweep.
 *
 * TWO THINGS HERE ARE ABOUT TRUST, not speed. The search runs at fewer trials
 * than a proper weighing, so its verdicts carry more noise, and the bands have
 * hard edges: an encounter whose true wipe rate sits at 5.0% falls either side
 * of "deadly" depending on the dice. Left alone, the table says deadly, the
 * user clicks it, the full weighing says risky, and the tool has contradicted
 * itself in one gesture. Both fixes below were measured against that failure,
 * and they fix different halves of it:
 *
 *   1. RANK BY CENTRALITY, not by lethality. Sorting by wipe rate put the most
 *      marginal encounters on top — precisely the ones that flip. Measured over
 *      a four-character party: 6 of the top 12 results changed band when
 *      re-weighed, and 0 of 12 once sorted by distance from the band's middle.
 *      This is what makes the visible top of the list trustworthy.
 *   2. CONFIRM against a second, independent seed and drop disagreements. This
 *      does nothing for the top of the list and a lot for its tail: 9 of 49
 *      results flipped unconfirmed, 3 of 38 confirmed.
 */
export function findEncounters(pcs, bestiary, {
  target = 'deadly', trials = 240, maxCount = 12, seed = 'search', groups = null,
  confirm = true,
} = {}) {
  const results = [];
  const wanted = BANDS.indexOf(target);

  for (const monster of bestiary) {
    if (groups && monster.group && !groups.includes(monster.group)) continue;
    let best = null;
    for (let count = 1; count <= maxCount; count++) {
      const foes = () => Array.from({ length: count }, (_, i) => combatantFromMonster(monster, i));
      const verdict = assess(pcs, foes(), { trials, seed: `${seed}/${monster.id}/${count}` });
      const rank = BANDS.indexOf(verdict.band);
      if (rank === wanted) {
        const distance = Math.abs(verdict.toll - BAND_CENTRE_TOLL[target]);
        if (!best || distance < best.distance) {
          const agreed = !confirm || assess(pcs, foes(), {
            trials, seed: `${seed}/confirm/${monster.id}/${count}`,
          }).band === target;
          if (agreed) best = { monster, count, verdict, distance };
        }
      }
      if (rank > wanted) break;   // overshot; more of them only gets worse
    }
    if (best) results.push(best);
  }

  return results.sort((a, b) => a.distance - b.distance);
}

// ------------------------------------------------------------ veterancy

/**
 * Cairn has no levels. What it has is the Scars table: when a hit takes you to
 * exactly 0 HP you roll on it, and most results RAISE a maximum. So the closest
 * honest translation of "a level 3 character" is "a character who has survived
 * three brushes with death", and that is what this does.
 *
 * The numeric effects below are OUR READING of the twelve rows' mechanics — the
 * prose consequences (deafened, hamstrung, an appendage lost) are not modelled,
 * only the stat changes. The curve saturates, because most rows are "roll, keep
 * it if it is higher".
 */
export function applyScars(character, count, seed = 'scars') {
  const rng = makeRng(`${character.seed}/${seed}`);
  const c = {
    ...character,
    attributes: { ...character.attributes },
    scars: [],
  };
  const sum = (n) => { let t = 0; for (let i = 0; i < n; i++) t += rng.d(6); return t; };
  const raise = (key, value) => {
    if (key === 'hp') { if (value > c.hp) c.hp = value; }
    else if (value > c.attributes[key]) c.attributes[key] = value;
  };

  for (let i = 0; i < count; i++) {
    const n = rng.d(12);
    switch (n) {
      case 1: case 2: raise('hp', sum(1)); break;              // lasting scar / rattling blow
      case 3: c.hp += sum(1); break;                           // walloped: "add that amount"
      case 4: case 5: raise('hp', sum(2)); break;              // broken limb / diseased
      case 6: raise(['STR', 'DEX', 'WIL'][rng.d(3) - 1], sum(3)); break;  // reorienting head wound
      case 7: raise('DEX', sum(3)); break;                     // hamstrung
      case 8: c.attributes.WIL += rng.d(4); break;             // deafened, on a passed save
      case 9: raise('WIL', sum(3)); break;                     // re-brained
      case 10: c.attributes.WIL += rng.d(6); break;            // sundered, on a passed save
      case 11: c.hp = sum(2); break;                           // mortal wound: "take the new result"
      case 12: raise('hp', sum(3)); break;                     // doomed
      default: break;
    }
    c.scars.push(n);
  }
  return c;
}
