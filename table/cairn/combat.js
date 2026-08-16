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
import { monsterAbilities, spellEffect, itemEffect } from './effects.js';

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
          // A one-use blast sphere is the best thing in the pack for exactly
          // one round. Without this it was the best thing in the pack for
          // every round of every fight, which quietly armed a Fungal Forager
          // with a repeating cannon.
          uses: w.uses,
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
  // Relics, flasks and darts: things you USE rather than cast, so no Fatigue,
  // but a hard limit on charges. Read from any item's own text, not just from
  // the reliquary — the darts a Prowler starts with are as real as a relic.
  const powers = carried
    .map((item) => ({ item, effect: itemEffect(item) }))
    .filter((pw) => pw.effect)
    .map((pw) => ({ ...pw.effect, source: pw.item.name, uses: pw.effect.uses || 1 }));

  return {
    name: character.name,
    side: 'pc',
    hp: encumbered ? 0 : character.hp,
    maxHp: character.hp,
    encumbered,
    // Combat never reads this. `party.js` does: two of the four radar axes only
    // predict in one regime — Strength matters while hit protection is thin,
    // blast matters only once someone owns a bomb — so the scorer has to know
    // how far in this party is.
    delves: character.delves || 0,
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
function applyDamage(rng, target, raw, log, attacker, rec) {
  // "A creature you touch is protected from mundane attacks for one minute."
  // Every attack in the bestiary is a claw, a blade or a bite, so the model
  // treats them all as mundane — which makes Shield the strongest defensive
  // spell in the game, and the numbers should say so rather than hide it.
  if (target.warded > 0) {
    if (log) log.push(`${target.name} is untouched behind the shield`);
    if (rec) rec.push('warded', { target: target.name });
    return;
  }
  // "Before calculating damage to HP, subtract the target's Armor value"
  const dmg = Math.max(0, raw - target.armor);
  // "Attacks deal direct STR damage (subtracting Armor)" — an invisible
  // stalker goes past hit protection entirely, which is a different kind of
  // dangerous from a big die and was previously modelled as neither.
  const direct = (attacker && attacker.combatAbilities || []).some((a) => a.kind === 'directDamage');
  const toHp = direct ? 0 : Math.min(target.hp, dmg);
  target.hp -= toHp;
  const overflow = dmg - toHp;
  if (rec) {
    rec.push('hit', {
      actor: attacker && attacker.name,
      target: target.name,
      raw,
      blocked: raw - dmg,
      toHp,
      toStr: Math.max(0, overflow),
      hp: target.hp,
    });
  }
  if (overflow <= 0) return;

  // A creature whose sting stays in the wound starts its damage the moment it
  // draws STR, not when it hits.
  for (const ability of (attacker && attacker.combatAbilities) || []) {
    if (ability.trigger === 'onSTRDamage') applyEffect(rng, ability, target, log);
  }

  // "Damage that reduces a target's HP below zero is subtracted from their STR
  //  by the amount of damage remaining."
  target.STR -= overflow;
  if (target.STR <= 0) {
    target.STR = 0;
    target.down = true;
    target.dead = true;                       // "If a PC's STR is reduced to 0, they die."
    if (log) log.push(`${target.name} is killed outright`);
    if (rec) rec.push('down', { target: target.name, dead: true, cause: 'STR to 0' });
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
    if (rec) rec.push('down', { target: target.name, dead: target.dead, cause: 'critical damage' });

    // Half the bestiary carries a consequence for exactly this moment — an
    // extra d6 of STR gone, armour rent, a wound that leaves you deprived. It
    // is the difference between a character who wakes up and one who does not.
    for (const ability of (attacker && attacker.combatAbilities) || []) {
      if (ability.trigger !== 'onCrit') continue;
      // a self-heal on a critical (the red cap drinking) lands on the attacker
      applyEffect(rng, ability, ability.self ? attacker : target, log);
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
  // A passed save is the target resisting — reported so a replay can say
  // "Vesper shrugs it off" instead of silently doing nothing.
  if (effect.save && save(rng, target[effect.save])) return false;
  switch (effect.kind) {
    case 'disable':
      // Asleep, charmed, petrified, possessed: out of the fight without being
      // wounded. Counted as a casualty, because a sleeping character in a room
      // of things that just felled them is not a survivor.
      target.disabled = true;
      target.down = true;
      // "WIL save once per round to break free" — a befuddling or a charm can
      // be shaken off, unlike petrification. Recorded so the round loop can
      // give them the roll.
      if (effect.rounds === 'save') target.mayShakeOff = effect.save || 'WIL';
      if (log) log.push(`${target.name} is out of the fight (${effect.note || effect.kind})`);
      return true;
    case 'hpToZero':
      // "A target is overcome with fear (HP drops to 0)" — no wound, but the
      // next hit goes straight to STR, which is where fear becomes lethal.
      target.hp = 0;
      return true;
    case 'drain': {
      // A flat drain (a storm giant's thunderclap is 4 STR, doubled against
      // metal) rather than dice, when the SRD gives a number.
      let total = effect.flat || 0;
      if (total && effect.doubleIfArmor && target.armor >= effect.doubleIfArmor) total *= 2;
      if (!total) for (const d of effect.dice || [6]) total += rng.d(d);
      const attr = effect.attr || 'STR';
      target[attr] -= total;
      if (target[attr] <= 0) {
        target[attr] = 0;
        target.down = true;
        target.dead = attr === 'STR';
        if (log) log.push(`${target.name} is emptied of ${attr}`);
      } else if (effect.alsoDisable) {
        // "save WIL or lose 1d4 WIL AND become paralyzed" — both halves.
        target.disabled = true;
        target.down = true;
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
    case 'dot':
      // "the stingers are lodged into the target, dealing d4 each round"
      target.dot = effect.dice || [4];
      return true;
    default:
      return false;
  }
}

/**
 * Would this creature rather use its special or hit someone?
 *
 * The first version always used the special, which quietly made several
 * creatures SAFER than their stat block: a storm giant swapped a d12 great
 * sword for a flat 4 STR thunderclap (toll 0.68 → 0.10), a sea hag traded
 * d6+d6 claws for a stare that deals no damage at all (0.18 → 0.00), and a
 * sphinx gave up blast claws to roar. A Warden picks whichever is worse for
 * the party, so the model does too, valuing both options in the same currency:
 * expected damage, with a removed character priced as roughly six of it.
 *
 * Being explicit about that exchange rate is the point. It is a judgement, it
 * is the only one in the ability layer, and it is written down here rather than
 * buried in a branch.
 */
const REMOVAL_WORTH = 6;

function actionValue(effect, actor, target) {
  const chance = effect.save ? 1 - Math.min(19, Math.max(1, target[effect.save])) / 20 : 1;
  switch (effect.kind) {
    case 'disable':
      // shakeable charms are worth much less than petrification
      return chance * (effect.rounds === 'save' ? REMOVAL_WORTH / 3 : REMOVAL_WORTH);
    case 'hpToZero':
      return chance * Math.min(target.hp, REMOVAL_WORTH / 2);
    case 'drain': {
      let expected = effect.flat || 0;
      if (expected && effect.doubleIfArmor && target.armor >= effect.doubleIfArmor) expected *= 2;
      if (!expected) for (const d of effect.dice || [6]) expected += (d + 1) / 2;
      return chance * (expected + (effect.alsoDisable ? REMOVAL_WORTH / 2 : 0));
    }
    default:
      return 0;
  }
}

/**
 * Expected damage from a creature's best attack, after the target's armour.
 *
 * Blast counts once per body in the way: a sphinx's d8+d8 claws land on the
 * whole party, and ignoring that made it prefer roaring — which came out as
 * the sphinx being SAFER once its abilities were modelled.
 */
function attackValue(actor, target, targets = 1) {
  if (!actor.attacks.length) return 0;
  let best = 0;
  for (const attack of actor.attacks) {
    const die = Math.max(...attack.dice);
    const value = Math.max(0, (die + 1) / 2 - target.armor) * (attack.blast ? targets : 1);
    best = Math.max(best, value);
  }
  return best;
}

/** Pick a living target. Cairn punishes focus fire — see the note in simulate. */
function pickTarget(rng, candidates) {
  return candidates[rng.d(candidates.length) - 1];
}

/**
 * WHO THE PARTY SWINGS AT — a policy, because Cairn makes this a real choice
 * and the answer is not obvious.
 *
 * "If multiple attackers target the same foe, roll all damage dice and keep the
 * single highest result." So concentrating fire in Cairn does NOT add damage
 * the way it does in most games; three d6 on one goblin is max(3d6) ≈ 5, while
 * three d6 on three goblins is 3 × 3.5 ≈ 10.5 spread out. Focus buys a higher
 * chance of removing ONE creature — and removing a creature removes its attacks
 * for the rest of the fight, which is the classic reason to focus anywhere.
 *
 * Which effect wins is an empirical question, so it is answered by measurement
 * rather than by argument. See the targeting comparison in combat.selftest.
 *
 *   spread  a distinct foe each, so no damage die is ever pooled away
 *   focus   everyone onto the weakest live foe — fewest dice wasted per kill
 *   leader  the leader while one stands, because "if the leader dies, the
 *           others will flee" makes that one death worth more than damage
 *   random  what this model used to do, kept so the cost of not choosing at
 *           all stays measurable
 */
export const TARGETING = ['smart', 'spread', 'focus', 'leader', 'random'];

function chooseTargets(rng, attackers, foes, policy) {
  const live = foes.filter(alive);
  if (!live.length) return new Map();
  const out = new Map();

  // The composite, and the default. Three rules, each of which came out of the
  // measurement rather than out of intuition:
  //   1. a leader is worth focusing at any cost, because "if the leader dies,
  //      the others will flee" turns one death into the end of the fight;
  //   2. ARMOUR is subtracted from every hit, so against an armoured foe many
  //      small hits are eaten and one pooled high die is not — focus;
  //   3. otherwise spread, because pooling throws dice away.
  if (policy === 'smart') {
    const leader = live.find((f) => f.isLeader);
    if (leader) return chooseTargets(rng, attackers, foes, 'leader');
    const armoured = live.some((f) => f.armor >= 1);
    return chooseTargets(rng, attackers, foes, armoured ? 'focus' : 'spread');
  }

  if (policy === 'focus' || policy === 'leader') {
    let mark = null;
    if (policy === 'leader') mark = live.find((f) => f.isLeader) || null;
    if (!mark) {
      // the weakest live foe: the fewest dice are wasted finishing it
      mark = live.slice().sort((a, b) => (a.hp + a.armor) - (b.hp + b.armor))[0];
    }
    for (const a of attackers) out.set(a, mark);
    return out;
  }

  if (policy === 'spread') {
    // Deal attackers round-robin across distinct foes, so no two collide until
    // there are more attackers than enemies left standing.
    const order = live.slice();
    attackers.forEach((a, i) => out.set(a, order[i % order.length]));
    return out;
  }

  for (const a of attackers) out.set(a, pickTarget(rng, live));
  return out;
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
/**
 * A structured record of a fight, for replaying it rather than summarising it.
 *
 * The oracle needs one number; a person needs to watch the thing happen. Both
 * come off the SAME simulation — the arena does not re-implement combat, it
 * plays back the events of a fight the oracle would have counted, so what you
 * watch and what the percentage says can never drift apart.
 */
function recorder(on) {
  const events = [];
  return {
    events,
    push(kind, data) { if (on) events.push({ kind, ...data }); },
  };
}

/**
 * Run a fight to the end with nobody piloting. This is what the oracle counts.
 *
 * It is a two-line driver over `fight()` precisely so that the piloted arena
 * and the five-thousand-trial oracle cannot be two different simulators. If
 * you are tempted to write combat logic here, it belongs in fight().
 */
/** A combatant, reduced to what a piloted UI has to draw. */
function brief(c) {
  return {
    name: c.name, side: c.side, hp: c.hp, maxHp: c.maxHp,
    STR: c.STR, maxSTR: c.maxSTR, armor: c.armor,
    down: !!c.down, dead: !!c.dead, withdrawn: !!c.withdrawn,
    warded: c.warded > 0, disabled: !!c.disabled,
    weapon: c.attacks[0] && c.attacks[0].name,
  };
}

/**
 * Everything this character could legally do right now, with the cost stated.
 *
 * The UI must never invent an option: a spell whose Fatigue would fill the
 * pack is a choice that costs the caster all their hit protection, and a
 * player is entitled to see that before spending it rather than after.
 */
export function pcOptions(pc, liveFoes, hurt, abilities = true) {
  const out = [];
  // Every option carries `at`, its index into the character's own array.
  // Names are NOT unique: a delver can easily be carrying two sets of
  // Soporific Darts, one from their background and one off a corpse, and
  // looking the choice up by name would make the second unusable and
  // unspendable forever.
  pc.attacks.forEach((a, at) => {
    if (a.uses != null && a.uses <= 0) return;
    out.push({
      kind: 'attack',
      at,
      weapon: a.name,
      dice: a.dice,
      blast: !!a.blast,
      uses: a.uses == null ? null : a.uses,
      needsTarget: !a.blast && liveFoes.length > 0,
      note: a.blast ? 'catches everyone' : `d${a.dice.join(' / d')}`,
    });
  });
  if (abilities) {
    (pc.powers || []).forEach((pw, at) => {
      if (!(pw.uses > 0)) return;
      out.push({
        kind: 'power', at, source: pw.source, effect: pw.kind, uses: pw.uses,
        needsTarget: pw.kind !== 'heal' && pw.kind !== 'summon',
        note: `${pw.kind}, ${pw.uses} left`,
      });
    });
    (pc.spells || []).forEach((sp, at) => {
      if (sp.spent) return;
      out.push({
        kind: 'spell', at, source: sp.source, effect: sp.kind,
        // The whole cost of magic in Cairn, said out loud.
        note: pc.encumbered ? 'pack is full — cannot read'
          : pc.freeSlots > 0 ? `WIL save, costs a Fatigue (${pc.freeSlots} slots free)`
            : 'WIL save, and the Fatigue fills your pack — you drop to 0 HP',
        disabled: !!pc.encumbered,
      });
    });
  }
  // Cairn's actual best move, and the one the oracle never makes.
  out.push({ kind: 'withdraw', note: 'leave the fight — you keep what you carry' });
  return out;
}

export function simulate(pcs, foes, rng, opts = {}) {
  const g = fight(pcs, foes, rng, opts);
  let step = g.next();
  while (!step.done) step = g.next(null);   // no pilot: nothing to answer with
  return step.value;
}

/**
 * The fight itself, as a generator.
 *
 * With `opts.pilot` off it never yields and behaves exactly as it always has —
 * the auto cascade below is untouched, RNG call for RNG call, which the
 * fingerprint test in combat.selftest pins to 201 recorded fights.
 *
 * With `opts.pilot` on it yields a decision request at each conscious PC's
 * turn and expects the chosen action back through `next(choice)`. Both paths
 * then run the SAME execution closures, so a piloted fight resolves under
 * identical rules to a simulated one. That is the only reason it is safe to
 * let a person play against numbers the oracle produced.
 */
export function* fight(pcs, foes, rng, opts = {}) {
  // `abilities: false` runs the fight with magic and monster powers switched
  // off. It exists so the cost of modelling them can be MEASURED rather than
  // asserted — see the ability-delta test in combat.selftest.
  const { morale = true, surprise = false, maxRounds = 30, abilities = true,
    targeting = 'smart' } = opts;
  const powersOf = (c) => (abilities ? c.abilities || [] : []);
  const log = opts.log ? [] : null;
  const rec = recorder(opts.events);
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

  // "A detachment always travels with one leader wearing chain mail (2 Armor)
  //  and a long sword (d10)… When testing Morale, save using the leader's WIL.
  //  If the leader dies, the others will flee." One better-armed body changes
  //  a bandit gang's arithmetic, and their nerve hangs on it.
  const leaderRule = foes.length > 1 && powersOf(foes[0]).find((a) => a.kind === 'leader');
  let leader = null;
  if (leaderRule) {
    leader = foes[0];
    leader.armor = Math.max(leader.armor, leaderRule.armor || leader.armor);
    leader.WIL = leaderRule.WIL || leader.WIL;
    leader.attacks = [{ name: 'long sword', dice: leaderRule.dice || [10], blast: false }];
    leader.isLeader = true;
    leader.name = `${leader.name} (leader)`;
  }

  const acts = new Map();
  for (const pc of pcs) acts.set(pc, surprise ? false : save(rng, pc.DEX));
  rec.push('start', {
    round: 0,
    pcs: pcs.map((c) => ({ name: c.name, hp: c.hp, maxHp: c.maxHp, STR: c.STR, armor: c.armor,
      weapon: c.attacks[0] && c.attacks[0].name, side: 'pc' })),
    foes: foes.map((c) => ({ name: c.name, hp: c.hp, maxHp: c.maxHp, STR: c.STR, armor: c.armor,
      weapon: c.attacks[0] && c.attacks[0].name, side: 'foe' })),
    surprise,
  });
  if (!surprise) {
    for (const pc of pcs) if (!acts.get(pc)) rec.push('flatfooted', { actor: pc.name });
  }

  const side = (list) => list.filter(alive);

  while (round < maxRounds) {
    round++;
    rec.push('round', { round });

    // A charm or a befuddling can be shaken off; petrification cannot. Both
    // arrive as `disabled`, and only the first carries `mayShakeOff`.
    for (const c of [...pcs, ...foes]) {
      if (c.disabled && c.mayShakeOff && save(rng, c[c.mayShakeOff])) {
        c.disabled = false;
        c.down = false;
        c.mayShakeOff = null;
        if (log) log.push(`${c.name} shakes it off`);
        rec.push('shake', { actor: c.name });
      }
    }
    // The shield lasts a minute — six rounds of ten seconds.
    for (const c of pcs) if (c.warded > 0) c.warded -= 1;
    // Anything still carrying a lodged stinger bleeds for it.
    for (const c of [...pcs, ...foes]) {
      if (!c.dot || c.down) continue;
      let n = 0;
      for (const d of c.dot) n += rng.d(d);
      applyDamage(rng, c, n + c.armor, log, null, rec);   // the sting is already inside the armour
    }

    const livePcs = side(pcs);
    const liveFoes = side(foes);
    if (!livePcs.length || !liveFoes.length || routed) break;

    // --- the PCs' turn ----------------------------------------------------
    // Attacks are spread across targets rather than focused. This is not a
    // stylistic choice: "if multiple attackers target the same foe, roll all
    // damage dice and keep the single highest result", so concentrating fire
    // throws away dice. Spreading is the strong play, and the sim plays it.
    const targeted = new Map();
    // One assignment for the whole round, so a policy can actually coordinate.
    // Picking per attacker inside the loop is what made "spread" impossible to
    // express: each PC drew independently and collided by accident.
    const marks = chooseTargets(rng, livePcs, foes, targeting);

    // The three things a PC can DO, extracted so that the auto cascade below
    // and a human pilot run the same code. Choosing is the only part that
    // differs between a simulated fight and a played one; resolving must not,
    // or the arena becomes a second simulator wearing the first one's clothes.
    const doPower = (pc, power, mark, hurt) => {
      power.uses -= 1;
      rec.push('power', { actor: pc.name, source: power.source, effect: power.kind,
        target: power.kind === 'heal' ? (hurt && hurt.name) : (mark && mark.name) });
      const victim = power.kind === 'heal' ? hurt : mark;
      if (power.kind === 'summon') {
        pcs.push({
          name: `${power.source} (summoned)`, side: 'pc', summoned: true,
          hp: power.hp || 3, maxHp: power.hp || 3, armor: 0,
          STR: power.STR || 6, DEX: power.DEX || 10, WIL: power.WIL || 4, maxSTR: power.STR || 6,
          attacks: [{ name: power.source, dice: power.dice || [6], blast: false }],
          spells: [], powers: [], combatAbilities: [],
        });
      } else if (victim) {
        applyEffect(rng, power, victim, log);
      }
    };

    const doSpell = (pc, spell, hurt, livePcsNow) => {
      spell.spent = true;
      if (pc.freeSlots > 0) pc.freeSlots -= 1; else { pc.hp = 0; pc.encumbered = true; }
      if (!save(rng, pc.WIL)) {
        if (log) log.push(`${pc.name} fumbles ${spell.source}`);
        rec.push('cast', { actor: pc.name, spell: spell.source, fumbled: true });
        return;
      }
      if (spell.kind === 'wardMundane') {
        const ward = livePcsNow.slice().sort((a, b) => (a.hp + a.armor) - (b.hp + b.armor))[0] || pc;
        ward.warded = (ward.warded || 0) + (spell.rounds || 6);
        if (log) log.push(`${ward.name} is shielded from mundane attacks`);
        rec.push('cast', { actor: pc.name, spell: spell.source, effect: 'ward', target: ward.name });
        return;
      }
      if (spell.kind === 'summon') {
        const servant = {
          name: `${spell.source} (summoned)`, side: 'pc', summoned: true,
          hp: spell.hp || 3, maxHp: spell.hp || 3, armor: spell.armor || 0,
          STR: spell.STR || 8, DEX: spell.DEX || 10, WIL: spell.WIL || 3, maxSTR: spell.STR || 8,
          attacks: [{ name: 'summoned', dice: spell.dice || [6], blast: false }],
          spells: [], powers: [], combatAbilities: [],
        };
        pcs.push(servant);
        if (log) log.push(`${pc.name} raises a servant`);
        // The servant is the only combatant that joins after the start event,
        // so it travels with the event that makes it — otherwise it fights,
        // takes blows and dies as a name with nothing on the field.
        rec.push('cast', {
          actor: pc.name, spell: spell.source, effect: 'summon',
          summoned: {
            name: servant.name, hp: servant.hp, maxHp: servant.maxHp, STR: servant.STR,
            armor: servant.armor, weapon: servant.attacks[0].name, side: 'pc',
          },
        });
        return;
      }
      const victim = spell.kind === 'heal' ? hurt : pickTarget(rng, side(foes));
      // "Immune to charms and magical sleep" / "Immune to magic from
      //  spellbooks" / a warp panther that resists it half the time.
      const ward = victim && (victim.combatAbilities || []).find((a) => a.kind === 'spellImmune');
      const shrugged = ward && (ward.chance == null || rng.raw() < ward.chance);
      if (victim && !shrugged) {
        const worked = applyEffect(rng, spell, victim, log);
        rec.push('cast', { actor: pc.name, spell: spell.source, effect: spell.kind,
          target: victim.name, resisted: !worked });
      } else if (shrugged) {
        if (log) log.push(`${victim.name} shrugs off ${spell.source}`);
        rec.push('cast', { actor: pc.name, spell: spell.source, target: victim.name, immune: true });
      }
    };

    /** Returns false when there is nothing left to swing at. */
    const doAttack = (pc, attack, target) => {
      if (attack.uses != null) attack.uses -= 1;
      // Blast cuts both ways, and the party side of it was missing: a thrown
      // blast sphere is a bomb, not a rock, and it was landing on one goblin.
      if (attack.blast) {
        rec.push('attack', { actor: pc.name, weapon: attack.name, blast: true, side: 'pc' });
        for (const foe of side(foes)) {
          applyDamage(rng, foe, rollDamage(rng, attack, attackModifier(pc, foe, abilities)), log, pc, rec);
        }
        return true;
      }
      if (!target) return false;
      const mod = attackModifier(pc, target, abilities);
      const dmg = rollDamage(rng, attack, mod);
      rec.push('attack', { actor: pc.name, weapon: attack.name, target: target.name, mod, side: 'pc' });
      const prev = targeted.get(target);
      // same-target attacks in one round collapse to the single highest die
      if (prev == null || dmg > prev.dmg) targeted.set(target, { dmg, attacker: pc });
      return true;
    };

    for (const pc of livePcs) {
      if (round === 1 && !acts.get(pc)) continue;

      // --- a human is choosing -------------------------------------------
      // RETREAT lives here and only here. The oracle is a stand-and-fight
      // floor by definition, so adding withdrawal to the auto cascade would
      // change every published number for a decision no simulation is making.
      // A pilot, though, is playing Cairn — where leaving is the correct move
      // more often than not — so the option belongs in the piloted game, and
      // its absence upstairs is exactly why the oracle reads as a worst case.
      if (opts.pilot) {
        const hurtNow = livePcs.find((a) => a.STR <= a.maxSTR / 2);
        const choice = yield {
          type: 'turn',
          round,
          actor: pc.name,
          options: pcOptions(pc, side(foes), hurtNow, abilities),
          pcs: pcs.filter((c) => !c.summoned || alive(c)).map(brief),
          foes: foes.map(brief),
          // The LIVE recorder array, not a copy. A piloted fight has to draw
          // what just happened before asking what to do next, and the only
          // honest way to show it is the same event stream the replay uses —
          // the caller drains whatever it has not drawn yet.
          events: rec.events,
        };
        const act = choice || { kind: 'attack' };
        if (act.kind === 'withdraw') {
          pc.withdrawn = true;
          pc.down = true;                 // out of the fight, not a casualty
          rec.push('withdraw', { actor: pc.name });
          if (log) log.push(`${pc.name} withdraws`);
          continue;
        }
        const pick = (list, at) => (Number.isInteger(at) ? (list || [])[at] : undefined);
        if (act.kind === 'power') {
          const power = pick(pc.powers, act.at);
          const mark = act.target ? side(foes).find((f) => f.name === act.target)
            : (side(foes).length ? pickTarget(rng, side(foes)) : null);
          if (power && power.uses > 0) { doPower(pc, power, mark, hurtNow); continue; }
        }
        if (act.kind === 'spell') {
          const spell = pick(pc.spells, act.at);
          if (spell && !spell.spent && !pc.encumbered) { doSpell(pc, spell, hurtNow, livePcs); continue; }
        }
        const attack = (pick(pc.attacks, act.at)
          || pc.attacks.find((a) => a.uses == null || a.uses > 0) || pc.attacks[0]);
        const target = act.target ? side(foes).find((f) => f.name === act.target) : null;
        if (!doAttack(pc, attack, target || pickTarget(rng, side(foes)))) break;
        continue;
      }

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
      // Which spell, in what order. A ward first, because "protected from
      // mundane attacks for one minute" outlasts the fight and the earlier it
      // lands the more it stops; then removing an enemy; then a summon to soak
      // hits; and a heal only once someone has actually been opened up.
      const hurt = livePcs.find((a) => a.STR <= a.maxSTR / 2);
      // An object with charges costs no Fatigue, so it is cheap — but not
      // automatic. A character holding both soporific darts and a blast sphere
      // should throw the bomb, and the first version always reached for the
      // darts, which quietly made the bomb worthless whenever the same
      // character had anything else with charges. Powers are valued against
      // swinging exactly as a monster's are.
      const mark = side(foes).length ? pickTarget(rng, side(foes)) : null;
      const swing = mark ? attackValue(pc, mark, side(foes).length) : 0;
      const power = abilities && pc.powers && mark && pc.powers.find((pw) => pw.uses > 0
        && (pw.kind === 'disable' || pw.kind === 'summon' || (hurt && pw.kind === 'heal'))
        && (pw.kind === 'summon' ? 2 : actionValue(pw, pc, mark)) >= swing);
      if (power && side(foes).length) {
        doPower(pc, power, mark, hurt);
        continue;
      }

      const spell = abilities && pc.spells && (
        pc.spells.find((sp) => !sp.spent && sp.kind === 'wardMundane')
        || pc.spells.find((sp) => !sp.spent && sp.kind === 'disable')
        || pc.spells.find((sp) => !sp.spent && sp.kind === 'summon')
        || (hurt && pc.spells.find((sp) => !sp.spent && sp.kind === 'heal')));
      if (spell && side(foes).length && !pc.encumbered) {
        doSpell(pc, spell, hurt, livePcs);
        continue;                              // reading a book is the whole turn
      }

      const attack = pc.attacks.find((a) => a.uses == null || a.uses > 0) || pc.attacks[0];
      // NB the RNG order here is load-bearing: pickTarget is drawn before the
      // blast check, exactly as it always was, so that switching to the shared
      // closure did not shift the stream by one draw and silently rewrite
      // every published number. The fingerprint test is what proves it.
      const target = (marks.get(pc) && alive(marks.get(pc)))
        ? marks.get(pc)
        : pickTarget(rng, side(foes));
      if (!target) break;
      doAttack(pc, attack, target);
    }
    for (const [target, hit] of targeted) applyDamage(rng, target, hit.dmg, log, hit.attacker, rec);

    // REGENERATION. "Only when the body is burned…" — a stand-and-fight model
    // has no fire to apply, so a troll that goes down gets back up. That is not
    // a modelling shortcut, it is why you do not brawl with trolls.
    for (const foe of foes) {
      if (foe.down && !foe.dead && powersOf(foe).some((a) => a.kind === 'regenerate')) {
        foe.down = false;
        foe.hp = Math.max(1, Math.floor(foe.maxHp / 2));
        if (log) log.push(`${foe.name} gets back up`);
        rec.push('regenerate', { actor: foe.name, hp: foe.hp });
      }
    }

    const casualties = foes.filter((f) => !alive(f)).length;

    // --- morale -----------------------------------------------------------
    // "Enemies must pass a WIL save to avoid fleeing when they take their first
    //  casualty and again when they lose half their number. Lone foes must save
    //  when they're reduced to 0 HP."
    if (morale && side(foes).length) {
      const rally = leader && alive(leader) ? leader : side(foes)[0];
      const lone = startingFoes === 1;
      // "If the leader dies, the others will flee."
      if (leader && !alive(leader)) {
        routed = true;
        if (log) log.push('the leader falls and the rest break');
        rec.push('rout', { round, reason: 'their leader is down' });
        break;
      }
      const checkFirst = casualties >= 1 && !checkedFirst;
      const checkHalf = casualties >= Math.ceil(startingFoes / 2) && !checkedHalf;
      const checkLone = lone && rally.hp === 0 && !checkedFirst;
      if (checkFirst || checkHalf || checkLone) {
        if (checkFirst || checkLone) checkedFirst = true;
        if (checkHalf) checkedHalf = true;
        if (!save(rng, rally.WIL)) {
          routed = true;
          if (log) log.push(`the enemy routs in round ${round}`);
          rec.push('rout', { round, reason: 'morale broke' });
          break;
        }
      }
    }

    // --- the foes' turn ---------------------------------------------------
    const hitPcs = new Map();
    for (const foe of side(foes)) {
      // A creature with a turn ability uses it when it is worth more than
      // swinging: a banshee wails, a frost elf casts Sleep, a storm giant keeps
      // hold of its great sword.
      const power = powersOf(foe).find((a) => a.trigger === 'onTurn');
      if (power) {
        const mark = pickTarget(rng, side(pcs));
        const worth = mark ? actionValue(power, foe, mark) : 0;
        // a scope-'all' ability hits everyone standing, so it is worth that
        // much again per extra target
        const spread = power.scope === 'all' ? side(pcs).length : 1;
        if (mark && worth * spread >= attackValue(foe, mark, side(pcs).length)) {
          const victims = power.scope === 'all' ? side(pcs) : [mark];
          rec.push('ability', { actor: foe.name, effect: power.kind, note: power.note,
            scope: power.scope, targets: victims.filter(Boolean).map((v) => v.name) });
          for (const victim of victims) if (victim) applyEffect(rng, power, victim, log);
          continue;
        }
      }
      if (!foe.attacks.length) continue;
      const attack = foe.attacks[rng.d(foe.attacks.length) - 1];
      if (attack.blast) {
        // "Attacks with the Blast quality affect all targets in the noted area,
        //  rolling separately for each affected character."
        for (const pc of side(pcs)) applyDamage(rng, pc, rollDamage(rng, attack, null), log, foe, rec);
        continue;
      }
      const target = pickTarget(rng, side(pcs));
      if (!target) break;
      // "Damage dealt is enhanced if an ally is also engaged with the same
      //  enemy" — hobgoblins in a pair hit like a d12, and alone like a mace.
      const pack = abilities
        && powersOf(foe).some((a) => a.kind === 'packTactics')
        && side(foes).length > 1;
      const foeMod = pack ? 'enhanced' : attackModifier(foe, target, abilities);
      const dmg = rollDamage(rng, attack, foeMod);
      rec.push('attack', { actor: foe.name, weapon: attack.name, target: target.name, mod: foeMod, side: 'foe' });
      const prev = hitPcs.get(target);
      if (prev == null || dmg > prev.dmg) hitPcs.set(target, { dmg, attacker: foe });

      // "A damaged vampire regains 6 HP when it bites" — an on-hit heal that
      // makes a lone monster a war of attrition rather than a race.
      for (const ability of powersOf(foe)) {
        if (ability.trigger === 'onHit' && ability.self) applyEffect(rng, ability, foe, log);
      }
    }
    for (const [target, hit] of hitPcs) applyDamage(rng, target, hit.dmg, log, hit.attacker, rec);

    if (!firstCasualtyRound && pcs.some((p) => !alive(p))) firstCasualtyRound = round;
  }

  // Summoned servants fight and die without counting against the party: a
  // skeleton falling is not a casualty, and counting it as one would make
  // Raise Dead look worse the better it worked.
  const roster = pcs.filter((p) => !p.summoned);
  // Someone who withdrew is OUT of the fight but is emphatically not a
  // casualty — walking away is the correct play in Cairn and counting it as a
  // loss would make the arena punish the one decision the game is about. Only
  // a pilot can withdraw, so `walked` is always empty in a simulated fight and
  // none of the oracle's numbers move.
  const walked = (c) => c.withdrawn;
  const lost = (c) => !alive(c) && !walked(c);
  rec.push('end', {
    round,
    routed,
    survivors: roster.filter((p) => alive(p) || walked(p)).map((p) => p.name),
    foesLeft: side(foes).map((f) => f.name),
  });

  const downPcs = roster.filter(lost);
  return {
    rounds: round,
    routed,
    wipe: downPcs.length === roster.length,
    casualties: downPcs.length,
    withdrew: roster.filter(walked).map((p) => p.name),
    deaths: roster.filter((p) => p.dead).length,
    survivors: roster.filter((p) => alive(p) || walked(p)).map((p) => p.name),
    foesLeft: side(foes).length,
    firstCasualtyRound,
    log,
    events: opts.events ? rec.events : null,
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
  // attacks carry remaining uses now, so they are per-fight state too — the
  // same trap that made spellbooks cast nothing
  attacks: c.attacks ? c.attacks.map((a) => ({ ...a })) : undefined,
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
