// planets.js — THE SEVEN: the unified design language across character · skills · items · alchemy ·
// crafting · combat (the v104 demo-tier consolidation). Every reagent, material, gem, skill, item and enemy
// carries ONE planet; that single tag REPLACES alchemy's humour/metal/vessel, crafting's material-family, and
// gems' crystal-system. A planet carries its classical glyph + metal + colour, the civic VERBS it governs
// (the rind bible: Mars=forge · Venus=green · Mercury=arteries · Jupiter=court · Sol=fusion · Luna=archive ·
// Saturn=cold-deep), the nave FACTION that owns it, and — DERIVED from those verbs' stats.js VOCATIONS — a
// FLESH/CHASSIS/ANIMA lean. So a Mars ingot, a Mars reagent, a Mars gem and a Mars foe all read as one
// iron-red, CHASSIS-heavy family, and one screen grammar (planetary inputs → planetary output) serves every
// make-verb.
//
// The lean is DERIVED (the normalised average of the planet's verbs' VOCATION leans), not invented — the
// numbers come from the class table already in stats.js, so tuning a verb re-tunes every vertical coherently.
// Colours are a STRAWMAN metal-true palette; they're the one knob whose whole job is "one colour per family",
// so tune them freely. The planet→triad and faction→planet structure is the load-bearing part.
//
// Pure, zero-DOM, node + browser. Pinned by test/planets.selftest.mjs.

import { VOCATIONS, TRIAD_ORDER } from './stats.js';

// planet key → its fixed attributes. `verbs` are the civic roles the planet governs; `faction` is the nave
// faction whose ward carries it (a clean 2+3+2 partition of the Seven — the thing that lets a faction choice
// UNLOCK a planet's recipes + combat moves).
const DEF = {
  sol:     { glyph: '☉', metal: 'gold',        colour: '#e5b53a', verbs: ['worship', 'make'],           faction: 'rindwalker' },
  luna:    { glyph: '☽', metal: 'silver',      colour: '#c6cede', verbs: ['learn', 'store'],            faction: 'drift' },
  mercury: { glyph: '☿', metal: 'quicksilver', colour: '#59c7cf', verbs: ['move', 'trade', 'learn'],    faction: 'drift' },
  venus:   { glyph: '♀', metal: 'copper',      colour: '#4fae6a', verbs: ['grow', 'heal'],              faction: 'continuant' },
  mars:    { glyph: '♂', metal: 'iron',        colour: '#c24a3c', verbs: ['make', 'mend'],              faction: 'rindwalker' },
  jupiter: { glyph: '♃', metal: 'tin',         colour: '#7b84c8', verbs: ['govern', 'play'],            faction: 'continuant' },
  saturn:  { glyph: '♄', metal: 'lead',        colour: '#767a83', verbs: ['worship', 'store', 'dwell'], faction: 'rindwalker' },
};
// classical Chaldean order (slowest → fastest orbit): the display order AND the combat rulership cycle.
export const PLANET_ORDER = ['saturn', 'jupiter', 'mars', 'sol', 'venus', 'mercury', 'luna'];

// a planet's triad lean = the normalised average of its verbs' VOCATION leans (grounded in stats.js, not made up).
function deriveLean(verbs) {
  const sum = { flesh: 0, chassis: 0, anima: 0 }; let n = 0;
  for (const v of verbs) { const L = (VOCATIONS[v] || {}).lean; if (!L) continue; for (const d of TRIAD_ORDER) sum[d] += (L[d] || 0); n++; }
  const out = {}; let t = 0;
  for (const d of TRIAD_ORDER) { out[d] = n ? sum[d] / n : 1 / 3; t += out[d]; }
  for (const d of TRIAD_ORDER) out[d] = t > 0 ? out[d] / t : 1 / 3;   // normalise to shares that sum to 1
  return out;
}

export const PLANETS = {};
for (const [k, d] of Object.entries(DEF)) PLANETS[k] = { key: k, name: k[0].toUpperCase() + k.slice(1), ...d, lean: deriveLean(d.verbs) };

// nave faction → its planet cluster (derived from each planet's `faction`; a clean partition of the Seven).
export const FACTION_PLANETS = {};
for (const k of Object.keys(PLANETS)) (FACTION_PLANETS[PLANETS[k].faction] || (FACTION_PLANETS[PLANETS[k].faction] = [])).push(k);

// ── planetOf(tag): the ONE funnel every vertical calls. Normalises ANY vocabulary — planet name, classical
// Sun/Moon, a metal, a glyph, or (as a fallback) a governed verb — onto a planet key. A verb governed by more
// than one planet resolves to the first-defined (make→sol, learn→luna); tag content by planet/metal to be exact.
const ALIAS = { sun: 'sol', moon: 'luna' };
for (const k of Object.keys(PLANETS)) { const p = PLANETS[k]; ALIAS[k] = k; ALIAS[p.metal] = k; ALIAS[p.glyph] = k; for (const v of p.verbs) if (!(v in ALIAS)) ALIAS[v] = k; }
export function planetOf(tag) {
  if (tag == null) return null;
  const raw = String(tag).trim();
  if (ALIAS[raw]) return ALIAS[raw];               // glyphs are case-sensitive
  const s = raw.toLowerCase();
  return PLANETS[s] ? s : (ALIAS[s] || null);
}

// ── the derived accessors every vertical shares ──
export const leanOf = (planetKey) => (PLANETS[planetKey] || {}).lean || { flesh: 1 / 3, chassis: 1 / 3, anima: 1 / 3 };
export const dominantDomain = (planetKey) => { const L = leanOf(planetKey); return TRIAD_ORDER.slice().sort((a, b) => L[b] - L[a])[0]; };
export const factionOfPlanet = (planetKey) => (PLANETS[planetKey] || {}).faction || null;
export const planetsOfFaction = (faction) => (FACTION_PLANETS[faction] || []).slice();
export const colourOf = (planetKey) => (PLANETS[planetKey] || {}).colour || '#8a94a0';
export const glyphOf = (planetKey) => (PLANETS[planetKey] || {}).glyph || '·';

// blend N planets → the averaged, normalised triad lean (a 1- or 2-planet character SPECIES at creation).
export function blendLean(planetKeys) {
  const sum = { flesh: 0, chassis: 0, anima: 0 }; let n = 0;
  for (const k of planetKeys || []) { const L = PLANETS[k] && PLANETS[k].lean; if (!L) continue; for (const d of TRIAD_ORDER) sum[d] += L[d]; n++; }
  const out = {}; let t = 0;
  for (const d of TRIAD_ORDER) { out[d] = n ? sum[d] / n : 1 / 3; t += out[d]; }
  for (const d of TRIAD_ORDER) out[d] = t > 0 ? out[d] / t : 1 / 3;
  return out;
}

// ── combat: the rulership ROCK-PAPER-SCISSORS of the Seven. In the Chaldean cycle each planet has the edge
// over the 3 that FOLLOW it and yields to the 3 BEFORE it — a balanced 7-way heptagram (every planet beats
// exactly 3, loses to 3). advantage(attacker, defender) → +1 (attacker favoured) · 0 (mirror/unknown) · −1.
export function advantage(attacker, defender) {
  const a = planetOf(attacker), b = planetOf(defender);
  const ia = PLANET_ORDER.indexOf(a), ib = PLANET_ORDER.indexOf(b);
  if (ia < 0 || ib < 0 || ia === ib) return 0;
  const d = ((ib - ia) % 7 + 7) % 7;    // 1..6
  return d <= 3 ? 1 : -1;               // favoured over the next 3; yields to the previous 3
}

export default {
  PLANETS, PLANET_ORDER, FACTION_PLANETS,
  planetOf, leanOf, dominantDomain, factionOfPlanet, planetsOfFaction, colourOf, glyphOf, blendLean, advantage,
};
