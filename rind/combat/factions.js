// factions.js — FACTION COMBAT STYLES. The three Tabard factions made into ways of playing the board.
//
// Each faction is one of the triad domains (stats.js FLESH·CHASSIS·ANIMA) turned into a temperament:
//
//   continuant → CHASSIS  — the maintainers. ATTRITION & CONTROL: hold ground, brace, pin, outlast.
//   drift      → ANIMA    — the traders.     TEMPO & TRICKERY:    reposition, feint, burst, siphon.
//   rindwalker → FLESH    — the hull-divers.  RISK & RESILIENCE:   bleed for power, regen, berserk.
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
    key: 'continuant', label: 'Continuant', domain: 'chassis',
    glyph: '⬡', accent: '#7fd8d0',
    gloss: 'the maintainers — hold the line, brace, outlast',
    // passive Maintenance: tougher while it holds station; the core keeps the flux topped up.
    passive: {
      bracedDefBonus: 2,        // +Def whenever it has not moved this turn (a unit that holds is harder to dent)
      counterOnBrace: true,     // braced + hit by an adjacent attacker → it strikes back
      fluxRegen: 2,             // +Flux at the start of each of its turns (slow, steady technomagic budget)
    },
    kit: ['bulwark', 'rivet', 'mend'],
    discount: { harden: 0.5, mend: 0.5 },   // anima→chassis & self-repair come cheap
    ai: 'turtle',
  },

  drift: {
    key: 'drift', label: 'Drift', domain: 'anima',
    glyph: '✦', accent: '#b39bd8',
    gloss: 'the traders — reposition, feint, burst, nothing stays still',
    // passive Mercury: faster on the board; hits harder right after it moves (hit-and-run).
    passive: {
      moveBonus: 2,             // +2 move range — Drift owns the board's geometry (and can out-kite aggro)
      hitAndRunCrit: 0.22,      // +crit chance on an attack made the same turn it moved
    },
    kit: ['flit', 'feint', 'siphon'],
    discount: { overclock: 0.6 },           // the anima burst is cheap
    ai: 'kite',
  },

  rindwalker: {
    key: 'rindwalker', label: 'Rindwalker', domain: 'flesh',
    glyph: '❤', accent: '#cf3b3b',
    gloss: 'the hull-divers — bleed for power, regen, fight harder hurt',
    // passive Hull-sense: damage climbs as its own HP falls (berserk); knits between blows.
    passive: {
      berserkMax: 0.45,         // up to +45% outgoing damage at 1 HP, scaling with the missing fraction
      regenPerTurn: 0.06,       // heals 6% of max HP at the start of each of its turns
    },
    kit: ['gore', 'adrenal', 'scavenge'],
    discount: { adrenal: 0.5 },
    ai: 'aggro',
  },
};
export const FACTION_ORDER = ['continuant', 'drift', 'rindwalker'];
export const isFaction = (k) => Object.prototype.hasOwnProperty.call(FACTIONS, k);

// The triad domain a roll should LEAN to come out as this faction (lets the balance harness breed a
// faction-typical character: a Continuant should be chassis-heavy, a Rindwalker flesh-heavy, etc.).
export const FACTION_LEAN = {
  continuant: { flesh: 0.2, chassis: 0.65, anima: 0.15 },
  drift:      { flesh: 0.15, chassis: 0.2, anima: 0.65 },
  rindwalker: { flesh: 0.65, chassis: 0.2, anima: 0.15 },
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
