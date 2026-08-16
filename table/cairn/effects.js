// table/cairn/effects.js — the mechanical vocabulary, and what reads SRD prose
// into it.
//
// WHY THIS FILE EXISTS. The simulator could see damage dice and armour, which
// is roughly a third of what actually happens in a Cairn fight. It could not
// see a basilisk's gaze, a troll's regeneration, an ooze digesting someone at
// d6 STR a round, or a spellbook — and since Cairn puts ALL of its magic in
// spellbooks, the oracle was pricing a game with the magic removed.
//
// THE APPROACH, AND ITS LIMIT. There is no honest way to simulate 100 spells
// and 84 creatures' abilities from free text, so this does not try. It defines
// a SMALL VOCABULARY of mechanical primitives, reads the SRD's prose into that
// vocabulary where the prose is unambiguous, carries a curated table for the
// cases the rules cannot see, and COUNTS WHAT IS LEFT OVER. The count is the
// point: `coverage()` is reported on the pages, so a reader always knows what
// fraction of the game the model is actually looking at.
//
// The single most important thing this file discovered: 78 of Cairn's 100
// spells have no combat mechanics whatsoever. They are for getting into places,
// out of trouble, and around problems. That is not a gap in the model — it is
// what Cairn's magic IS, and any simulator that made spellbooks into combat
// power would be modelling a different game.
//
// Rules text quoted here is Cairn 2e by Yochai Gal, CC BY-SA 4.0.

import { ITEMS } from './items.js';
import { BESTIARY } from './monsters.js';

// ------------------------------------------------------------- vocabulary

/**
 * Every effect the simulator understands. Anything not expressible here is
 * left unclassified rather than approximated into the nearest shape.
 *
 *   damage        { dice, blast }              a die of damage
 *   drain         { dice, perRound }           STR loss, bypassing HP and armour
 *   heal          { dice, attr }               restores STR
 *   disable       { save, scope, rounds }      out of the fight: asleep, charmed, petrified
 *   deprive       { save, scope }              deprived: cannot recover — modelled as no HP recovery
 *   impairedAgainst { unless }                 attacks against this creature roll d4
 *   enhancedAgainst { when }                   attacks against it roll d12, if the condition holds
 *   regenerate    { needs }                    survives critical damage unless `needs` is applied
 *   critBonus     { dice }                     extra STR damage when a critical damage save fails
 *   fatigue       { scope }                    fills a slot, which in a full pack means 0 HP
 *   sunder        {}                           destroys a piece of armour
 *   summon        { hp, STR, DEX, WIL, dice }  an ally joins the fight
 */
export const EFFECT_KINDS = [
  'damage', 'drain', 'heal', 'disable', 'deprive',
  'impairedAgainst', 'enhancedAgainst', 'regenerate', 'critBonus', 'fatigue',
  'sunder', 'summon',
];

const dice = (s) => (s.match(/d(\d+)/g) || []).map((d) => Number(d.slice(1)));

// --------------------------------------------------- monster abilities

/**
 * Curated abilities: the ones whose prose the rules below cannot read, and the
 * ones important enough to be worth getting exactly right. Keyed by bestiary id.
 *
 * Each entry is deliberately conservative. A basilisk's gaze petrifies "after
 * three rounds", so it is a save each round rather than an instant kill; a
 * troll's regeneration only stops with fire or acid, which a stand-and-fight
 * model has no way to apply, so the troll simply gets back up — and that is
 * exactly why a troll is a terrifying encounter and should read as one.
 */
export const CURATED = {
  basilisk: [
    { kind: 'impairedAgainst', note: 'attacks facing it are impaired' },
    { kind: 'disable', trigger: 'onTurn', save: 'STR', scope: 'one', rounds: Infinity,
      note: 'Gaze: petrified from the bottom up, frozen after three rounds' },
  ],
  'gelatinous-ooze': [
    { kind: 'drain', trigger: 'onCrit', dice: [6], perRound: true,
      note: 'engulfed, losing d6 STR per round until consumed' },
  ],
  troll: [
    { kind: 'regenerate', trigger: 'passive', needs: 'fire or acid',
      note: 'keeps fighting through critical damage; only fire or acid stops it' },
  ],
  'wood-troll': [
    { kind: 'regenerate', trigger: 'passive', needs: 'fire or removal from the forest' },
  ],
  vampire: [
    { kind: 'heal', trigger: 'onHit', dice: [6], self: true, note: 'regains 6 HP when it bites' },
  ],
  banshee: [
    { kind: 'disable', trigger: 'onTurn', save: 'WIL', scope: 'all', rounds: Infinity,
      note: 'Wail: anyone in earshot must save WIL or fall unconscious' },
  ],
  'eye-of-terror': [
    { kind: 'disable', trigger: 'onTurn', save: 'WIL', scope: 'one', rounds: Infinity,
      note: 'casts Charm, Phobia, Sleep, Vision at will' },
  ],
  'frost-elf': [
    { kind: 'disable', trigger: 'onTurn', save: 'WIL', scope: 'one', rounds: Infinity,
      note: 'casts Sleep at will' },
  ],
  werewolf: [
    { kind: 'impairedAgainst', unless: 'silver', note: 'mundane attacks are impaired' },
  ],
  'crypt-guardian': [
    { kind: 'impairedAgainst', unless: 'magic', note: 'non-magical attacks are impaired' },
  ],
};

/**
 * Read one creature's notes into abilities. Returns { abilities, unread },
 * where `unread` is the prose that carried a mechanical signal the rules could
 * not turn into an effect — the honest remainder.
 */
export function monsterAbilities(monster) {
  if (CURATED[monster.id]) {
    return { abilities: CURATED[monster.id].map((a) => ({ trigger: 'passive', ...a })), unread: [] };
  }

  const abilities = [];
  const unread = [];

  for (const note of monster.notes) {
    const flat = note.replace(/\*/g, '');
    let read = false;

    // "Attacks against them are impaired" / "Melee attacks … are impaired"
    if (/attacks?[^.]{0,60}\bimpaired\b/i.test(flat)) {
      abilities.push({ kind: 'impairedAgainst', trigger: 'passive', note: flat });
      read = true;
    }
    // "Critical Damage: … an additional d6 STR damage" — and the same shape
    // written against WIL or DEX, which several creatures use to hollow out a
    // victim rather than wound them.
    const crit = flat.match(/critical damage[^.]*?(\d?d\d+)[^.]*?\b(STR|DEX|WIL)\b/i);
    if (crit) {
      abilities.push({ kind: 'critBonus', trigger: 'onCrit', dice: dice(crit[1]),
        attr: crit[2].toUpperCase(), note: flat });
      read = true;
    }
    // "Critical Damage: a piece of armor is rent and destroyed"
    if (/critical damage[^.]*armou?r[^.]*(rent|destroy|ruin)/i.test(flat)) {
      abilities.push({ kind: 'sunder', trigger: 'onCrit', note: flat });
      read = true;
    }
    // "Critical Damage: Target is infected and becomes deprived"
    if (!read && /critical damage[^.]*deprived/i.test(flat)) {
      abilities.push({ kind: 'deprive', trigger: 'onCrit', scope: 'one', note: flat });
      read = true;
    }
    // "must make a WIL save or fall unconscious" / "DEX save to escape … or lose 1d4 STR"
    // The SRD writes it both ways round — "must make a WIL save" and "must
    // save WIL" — and only catching one of them lost a third of these.
    const save = flat.match(/\b(?:(STR|DEX|WIL) save|save (STR|DEX|WIL))\b([^.]*)/i);
    if (save) {
      const tail = save[3] || '';
      const scope = /anyone|nearby|in earshot|all /i.test(flat) ? 'all' : 'one';
      const attr = (save[1] || save[2]).toUpperCase();
      const loss = tail.match(/(\d?d\d+) STR/i);
      if (loss) {
        abilities.push({ kind: 'drain', trigger: 'onTurn', save: attr, scope, dice: dice(loss[1]), note: flat });
      } else if (/unconscious|asleep|sleep|paralys|petrif|possess|charm|stunned|frozen/i.test(tail)) {
        abilities.push({ kind: 'disable', trigger: 'onTurn', save: attr, scope, rounds: Infinity, note: flat });
      } else if (/deprived/i.test(tail)) {
        abilities.push({ kind: 'deprive', trigger: 'onTurn', save: attr, scope, note: flat });
      } else {
        unread.push(flat);            // a save whose consequence is fiction
      }
      read = true;
    }
    // "Can cast the following spells at will: …"
    if (!read && /can cast|casts? .*(at will)|carr(y|ies) .*spellbook/i.test(flat)) {
      abilities.push({ kind: 'disable', trigger: 'onTurn', save: 'WIL', scope: 'one', rounds: Infinity,
        note: `${flat} (modelled as one enemy neutralised per turn on a failed WIL save)` });
      read = true;
    }
    if (!read && /regenerat/i.test(flat)) {
      abilities.push({ kind: 'regenerate', trigger: 'passive', note: flat });
      read = true;
    }
    // things that read as mechanical but are not expressible here
    if (!read && /\bimmune|enhanced|blast|\bd\d+\b|\bSTR\b|\bDEX\b|\bWIL\b/i.test(flat)) {
      unread.push(flat);
    }
  }
  return { abilities, unread };
}

// ------------------------------------------------------------ PC magic

/**
 * The spells with combat mechanics, curated by hand because there are only a
 * few and because getting them wrong is how a model starts lying.
 *
 * Cairn does not give spells a save, a duration or a range — "A creature you
 * can see falls into a light sleep" is the whole rule, and the Warden decides
 * the rest. Modelled literally, Sleep removes one combatant for one Fatigue,
 * which is extraordinarily strong; the simulator plays it that way and the
 * numbers say what that is worth. Anything not in this table has no combat
 * effect in the model, which for 78 of the 100 spells is simply true.
 */
export const SPELL_EFFECTS = {
  Sleep: { kind: 'disable', scope: 'one', rounds: Infinity, save: null,
    note: 'a creature you can see falls into a light sleep' },
  'Cure Wounds': { kind: 'heal', dice: [4], attr: 'STR', note: 'restore 1d4 STR per day' },
  Charm: { kind: 'disable', scope: 'one', rounds: Infinity, save: null,
    note: 'a creature treats you as a friend' },
  Command: { kind: 'disable', scope: 'one', rounds: 1, save: null,
    note: 'obeys a single three-word command that does not cause it harm' },
  // Cairn's fear spell is Phobia, not Fear — the curated table named a spell
  // that does not exist and silently did nothing until a test compared these
  // keys against the SRD's own list.
  Phobia: { kind: 'disable', scope: 'one', rounds: 1, save: null,
    note: 'a nearby creature becomes terrified of an object of your choice' },
  Vision: { kind: 'disable', scope: 'one', rounds: 1, save: null,
    note: 'you completely control what a creature sees' },
  Shroud: { kind: 'impairedAgainst', note: 'a creature you touch is invisible until they move' },
  Swarm: { kind: 'impairedAgainst', note: 'you can only be harmed by blast attacks' },
  'Mirror Image': { kind: 'impairedAgainst', note: 'an illusory duplicate draws attacks' },
  'Smoke Form': { kind: 'impairedAgainst', note: 'your body becomes living smoke' },
};

/** A spellbook item -> its combat effect, or null. */
export function spellEffect(item) {
  const name = (item.spell && item.spell.name) || String(item.name || '').replace(/^Spellbook:\s*/, '');
  return SPELL_EFFECTS[name] || null;
}

/**
 * Relics whose combat effect is real but unreadable by rule. Two of them summon
 * allies with a stat block written in the bestiary's own notation, which is a
 * gift: the same parser reads it.
 */
export const RELIC_EFFECTS = {
  'Mace of the Kingslayer': { kind: 'disable', save: 'WIL', scope: 'all', rounds: Infinity, uses: 2,
    note: 'shout an order: any who fail a WIL save must obey' },
  'Skull Whistle': { kind: 'disable', save: 'WIL', scope: 'all', rounds: 1, uses: 3,
    note: 'a chilling scream — including the blower' },
  'Jar of Ants': { kind: 'summon', hp: 6, STR: 2, DEX: 10, WIL: 1, dice: [10], uses: 1,
    note: 'a colony of fire ants [6 HP, 2 STR, 10 DEX, 1 WIL, bite (d10)]' },
  'Sponge Army': { kind: 'summon', hp: 4, STR: 6, DEX: 10, WIL: 8, dice: [6], count: 6, uses: 1,
    note: 'a dozen miniature soldiers, grown' },
  'Last Breath': { kind: 'damage', dice: [6], uses: 1, note: 'a chipped short sword' },
};

/**
 * A relic's combat effect beyond the armour and damage `parseItem` already
 * reads. Charges are respected: a relic with "1 charge" fires once per fight.
 */
export function relicEffect(relic) {
  // keyed by the clean name, not the slug: the slug carries the qualities
  // ("mace-of-the-kingslayer-d8-2-charges") and changes whenever they do
  if (RELIC_EFFECTS[relic.name]) return { ...RELIC_EFFECTS[relic.name] };
  const text = `${relic.quals || ''} ${relic.effect || ''}`.replace(/\*/g, '');
  const charges = text.match(/(\d+)\s*(charges?|uses?)/i);
  const uses = charges ? Number(charges[1]) : null;

  const strLoss = text.match(/(?:lose|lost|damage of)\s*(\d?d\d+)\s*STR/i);
  if (strLoss) return { kind: 'drain', dice: dice(strLoss[1]), uses, scope: 'one' };
  const heal = text.match(/restores?\s*(\d?d\d+)?\s*STR/i);
  if (heal) return { kind: 'heal', dice: heal[1] ? dice(heal[1]) : [4], attr: 'STR', uses };
  if (/\bsave or (fall asleep|sleep|unconscious)/i.test(text)) {
    return { kind: 'disable', save: 'STR', scope: 'one', rounds: Infinity, uses };
  }
  return null;
}

// -------------------------------------------------------------- coverage

/**
 * How much of the game the model can actually see. Reported on the pages,
 * because a coverage number a reader cannot check is just a reassurance.
 */
export function coverage() {
  let monstersSeen = 0, monstersPartly = 0;
  for (const m of BESTIARY) {
    const { abilities, unread } = monsterAbilities(m);
    if (abilities.length) monstersSeen++;
    if (unread.length) monstersPartly++;
  }
  const spellsSeen = ITEMS.spells.filter((s) => SPELL_EFFECTS[s.name]).length;
  const relicsSeen = ITEMS.relics.filter((r) => relicEffect(r)).length;
  const kinds = {};
  for (const m of BESTIARY) for (const a of monsterAbilities(m).abilities) kinds[a.kind] = (kinds[a.kind] || 0) + 1;

  return {
    monsters: { total: BESTIARY.length, withModelledAbility: monstersSeen, withUnreadProse: monstersPartly },
    spells: { total: ITEMS.spells.length, modelled: spellsSeen },
    relics: { total: ITEMS.relics.length, modelledBeyondStats: relicsSeen },
    abilityKinds: kinds,
  };
}
