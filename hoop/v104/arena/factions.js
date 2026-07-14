// factions.js — FACTION COMBAT STYLES. The three Tabard factions made into ways of playing the board.
//
// Each faction is one of the triad domains (stats.js FLESH·CHASSIS·ANIMA) turned into a temperament:
//
//   continuant → FLESH    — the continuants.  RISK & RESILIENCE:   bleed for power, regen, fight harder hurt.
//   drift      → ANIMA    — the traders.     TEMPO & TRICKERY:    reposition, feint, burst, siphon.
//   rindwalker → CHASSIS  — the makers.       ATTRITION & CONTROL: hold ground, brace, pin, outlast.
//
// (The faction↔body pairing is the one derived in planets.js from each faction's civic verbs — continuant
//  grows·heals·serves = the living meat; rindwalker makes·mends·stores = the frame; drift learns·plays·
//  trades = the ghost — and each faction's STYLE follows its body. Drift agrees either way.)
//
// A faction is pure data: a `passive` (always-on hooks the engine reads), a `kit` (signature skill ids
// it adds to the universal base set), `discount`s (per-skill flux-cost multipliers — "what comes cheap
// to this faction"), and an `ai` archetype the planner switches on. The SKILLS themselves live in
// engine.js so the engine owns the one resolver; factions only NAME which it grants and how cheaply.
//
// Everything here is plain data + small pure helpers so the balance harness can sweep it. Zero-dep.

// ── THE THREE STYLES ────────────────────────────────────────────────────────────────────────────
export const FACTIONS = {
  continuant: {
    key: 'continuant', label: 'Continuant', domain: 'flesh',
    glyph: '❤', accent: '#cf3b3b',
    gloss: 'the continuants — deep vitality; bleed for power, regen, fight harder hurt',
    // passive Living-continuity: damage climbs as its own HP falls (the meat that will not stop); knits between blows.
    passive: {
      berserkMax: 0.3,         // up to +45% outgoing damage at 1 HP, scaling with the missing fraction
      regenPerTurn: 0.04,       // heals 6% of max HP at the start of each of its turns
    },
    kit: ['gore', 'adrenal', 'scavenge', 'summon'],
    discount: { adrenal: 0.5 },
    ai: 'aggro',
    // Hound — a fast, frail salvaged beast that rushes and bites (the flesh faction's pet); pure aggro.
    summon: { name: 'Hound', glyph: '◆', ai: 'aggro', kit: ['strike'], combat: { hp: 12, atk: 8, def: 2, speed: 3, accuracy: 0.85, crit: 0.06, fluxPool: 0, apow: 0, power: 6 } },
  },

  drift: {
    key: 'drift', label: 'Drift', domain: 'anima',
    glyph: '✦', accent: '#b39bd8',
    gloss: 'the traders — reposition, feint, burst, nothing stays still',
    // passive Mercury: faster on the board; hits harder right after it moves (hit-and-run).
    passive: {
      moveBonus: 2,             // +2 move range — Drift owns the board's geometry (and can out-kite aggro)
      hitAndRunCrit: 0.22,      // +crit chance on an attack made the same turn it moved
      fluxRegen: 2,             // +Flux/turn — anima is flux-native, so the ranged kite never runs dry
    },
    kit: ['lance', 'flit', 'feint', 'blast', 'agglomerate', 'siphon', 'summon'],   // ranged anima offense + the area combo
    discount: { overclock: 0.6, lance: 0.6, blast: 0.75 },   // the anima offense is cheap for Drift
    ai: 'kite',
    // Echo — a fragile anima decoy that lances from range (the trickster's mirror); glass, kites.
    summon: { name: 'Echo', glyph: '◇', ai: 'kite', kit: ['strike', 'lance'], combat: { hp: 8, atk: 3, def: 1, speed: 2, accuracy: 0.9, crit: 0.05, fluxPool: 14, apow: 9, power: 6 } },
  },

  rindwalker: {
    key: 'rindwalker', label: 'Rindwalker', domain: 'chassis',
    glyph: '⬡', accent: '#7fd8d0',
    gloss: 'the makers — hold the hull, brace, pin, outlast',
    // passive Sacred-maintenance: tougher while it holds station; the core keeps the flux topped up.
    passive: {
      bracedDefBonus: 2,        // +Def whenever it has not moved this turn (a unit that holds is harder to dent)
      counterOnBrace: true,     // braced + hit by an adjacent attacker → it strikes back
      fluxRegen: 2,             // +Flux at the start of each of its turns (slow, steady technomagic budget)
    },
    kit: ['bulwark', 'rivet', 'mend', 'summon', 'revive', 'assist'],   // the makers rebuild & restore the party
    discount: { harden: 0.5, mend: 0.5, revive: 0.7 },   // anima→chassis, self-repair, and restoring others come cheap
    ai: 'turtle',
    // Sentry — a stout, slow blocker drone that holds ground and braces (the makers' construct).
    summon: { name: 'Sentry', glyph: '◈', ai: 'turtle', kit: ['strike', 'brace'], combat: { hp: 20, atk: 5, def: 6, speed: 1, accuracy: 0.85, crit: 0.02, fluxPool: 6, apow: 0, power: 6 } },
  },
};
export const FACTION_ORDER = ['continuant', 'drift', 'rindwalker'];
export const isFaction = (k) => Object.prototype.hasOwnProperty.call(FACTIONS, k);

// The triad domain a roll should LEAN to come out as this faction (lets the balance harness breed a
// faction-typical character: a Continuant should be chassis-heavy, a Rindwalker flesh-heavy, etc.).
export const FACTION_LEAN = {
  continuant: { flesh: 0.65, chassis: 0.2, anima: 0.15 },
  drift:      { flesh: 0.15, chassis: 0.2, anima: 0.65 },
  rindwalker: { flesh: 0.2, chassis: 0.65, anima: 0.15 },
};

// Apply a faction's per-skill discount to a base flux cost (floored at 0, rounded). Pure.
export function discountedCost(faction, skillId, baseCost) {
  const f = FACTIONS[faction];
  const m = (f && f.discount && f.discount[skillId] != null) ? f.discount[skillId] : 1;
  return Math.max(0, Math.round(baseCost * m));
}

const FAC = { FACTIONS, FACTION_ORDER, FACTION_LEAN, isFaction, discountedCost };
if (typeof globalThis !== 'undefined') globalThis.MEGA_FACTIONS = FAC;
export default FAC;
