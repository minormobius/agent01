// planets.js — THE SEVEN (v105 unified design language, faction→body model). The single alphabet under
// character · skills · items · alchemy · crafting · combat. Two orthogonal axes name everything:
//
//   • FACTION → BODY (the triad axis). One of three nave factions = one of stats.js's FLESH/CHASSIS/ANIMA:
//     your stat spine + your craft/combat SCHOOL. continuant·FLESH · rindwalker·CHASSIS · drift·ANIMA. The
//     body lean is DERIVED from each faction's own civic verbs' VOCATIONS — so it's grounded, not invented,
//     and lands the right domain for each faction with no skew (the reason we moved the triad off the planets).
//
//   • PLANET → FLAVOR (the register axis). One of the Seven = a metal, colour, temperament, the verbs it
//     governs, and a combat matchup (a balanced 7-way rulership RPS). The register a thing is cast in.
//
// A character / reagent / ingot / gem / skill / foe is a (faction, planet) pair — 3 × 7 = 21 identities.
// That one pair REPLACES alchemy's humour/metal/vessel, crafting's material-family, and gems' crystal-system.
//
// Pure, zero-DOM, node + browser. Pinned by test/planets.selftest.mjs.

import { VOCATIONS, TRIAD_ORDER } from './stats.js';

// ── FACTION → BODY (the triad axis) ──────────────────────────────────────────────────────────────────
// each nave faction's four civic verbs (factionchoice.js). The body lean is their averaged VOCATION lean.
const FACTION_VERBS = {
  continuant: ['govern', 'grow', 'serve', 'heal'],
  rindwalker: ['worship', 'mend', 'make', 'store'],
  drift:      ['learn', 'play', 'move', 'trade'],
};
const FACTION_ROLE = { continuant: 'Tender', rindwalker: 'Wright', drift: 'Adept' };

function deriveLean(verbs) {
  const sum = { flesh: 0, chassis: 0, anima: 0 }; let n = 0;
  for (const v of verbs) { const L = (VOCATIONS[v] || {}).lean; if (!L) continue; for (const d of TRIAD_ORDER) sum[d] += (L[d] || 0); n++; }
  const out = {}; let t = 0;
  for (const d of TRIAD_ORDER) { out[d] = n ? sum[d] / n : 1 / 3; t += out[d]; }
  for (const d of TRIAD_ORDER) out[d] = t > 0 ? out[d] / t : 1 / 3;   // normalise to shares that sum to 1
  return out;
}
const dominant = (lean) => TRIAD_ORDER.slice().sort((a, b) => lean[b] - lean[a])[0];

export const FACTIONS = {};
for (const [k, verbs] of Object.entries(FACTION_VERBS)) {
  const lean = deriveLean(verbs);
  FACTIONS[k] = { key: k, name: k[0].toUpperCase() + k.slice(1), role: FACTION_ROLE[k], verbs: verbs.slice(), lean, body: dominant(lean) };
}
export const FACTION_ORDER = ['continuant', 'rindwalker', 'drift'];
export const bodyOf = (faction) => (FACTIONS[faction] || {}).body || null;                      // 'flesh' | 'chassis' | 'anima'
export const bodyLean = (faction) => (FACTIONS[faction] || {}).lean || { flesh: 1 / 3, chassis: 1 / 3, anima: 1 / 3 };
export const factionOfBody = (domain) => FACTION_ORDER.find((f) => FACTIONS[f].body === domain) || null;

// ── PLANET → FLAVOR (the register axis) ───────────────────────────────────────────────────────────────
const PDEF = {
  sol:     { glyph: '☉', metal: 'gold',        colour: '#e5b53a', adj: 'Gilded',    verbs: ['worship', 'make'],        temperament: 'hot & dry',    humour: 'choler' },
  luna:    { glyph: '☽', metal: 'silver',      colour: '#c6cede', adj: 'Argent',    verbs: ['learn', 'store'],         temperament: 'cold & moist', humour: 'phlegm' },
  mercury: { glyph: '☿', metal: 'quicksilver', colour: '#59c7cf', adj: 'Mercurial', verbs: ['move', 'trade', 'learn'], temperament: 'variable',     humour: null },
  venus:   { glyph: '♀', metal: 'copper',      colour: '#4fae6a', adj: 'Verdant',   verbs: ['grow', 'heal'],           temperament: 'hot & moist',  humour: 'blood' },
  mars:    { glyph: '♂', metal: 'iron',        colour: '#c24a3c', adj: 'Iron',      verbs: ['make', 'mend'],           temperament: 'hot & dry',    humour: 'choler' },
  jupiter: { glyph: '♃', metal: 'tin',         colour: '#7b84c8', adj: 'Stannic',   verbs: ['govern', 'play'],         temperament: 'hot & moist',  humour: 'blood' },
  saturn:  { glyph: '♄', metal: 'lead',        colour: '#767a83', adj: 'Leaden',    verbs: ['worship', 'store'],       temperament: 'cold & dry',   humour: 'melancholy' },
};
export const PLANETS = {};
for (const [k, d] of Object.entries(PDEF)) PLANETS[k] = { key: k, name: k[0].toUpperCase() + k.slice(1), ...d };
export const PLANET_ORDER = ['saturn', 'jupiter', 'mars', 'sol', 'venus', 'mercury', 'luna'];   // Chaldean = the combat RPS cycle
export const READING_ORDER = ['sol', 'luna', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];  // Sun→Saturn, for display

// planetOf: the ONE funnel — planet name, classical Sun/Moon, a metal, a glyph, or a governed verb → key.
const ALIAS = { sun: 'sol', moon: 'luna' };
for (const k of Object.keys(PLANETS)) { const p = PLANETS[k]; ALIAS[k] = k; ALIAS[p.metal] = k; ALIAS[p.glyph] = k; for (const v of p.verbs) if (!(v in ALIAS)) ALIAS[v] = k; }
export function planetOf(tag) {
  if (tag == null) return null;
  const raw = String(tag).trim();
  if (ALIAS[raw]) return ALIAS[raw];                // glyphs are case-sensitive
  const s = raw.toLowerCase();
  return PLANETS[s] ? s : (ALIAS[s] || null);
}
export const colourOf = (planet) => (PLANETS[planetOf(planet)] || {}).colour || '#8a94a0';
export const glyphOf = (planet) => (PLANETS[planetOf(planet)] || {}).glyph || '·';

// combat: the rulership ROCK-PAPER-SCISSORS of the Seven. In the Chaldean cycle each planet has the edge
// over the three that FOLLOW and yields to the three before — a balanced heptagram (every planet beats 3).
export function advantage(attacker, defender) {
  const a = planetOf(attacker), b = planetOf(defender);
  const ia = PLANET_ORDER.indexOf(a), ib = PLANET_ORDER.indexOf(b);
  if (ia < 0 || ib < 0 || ia === ib) return 0;
  const d = ((ib - ia) % 7 + 7) % 7;    // 1..6
  return d <= 3 ? 1 : -1;               // favoured over the next 3; yields to the previous 3
}
export function matchups(planet) {
  const p = planetOf(planet), beats = [], yields = [];
  for (const o of PLANET_ORDER) { if (o === p) continue; (advantage(p, o) > 0 ? beats : yields).push(o); }
  return { beats, yields };
}

// ── the 3×7 IDENTITY — a character SPECIES, and the tag any item/reagent/gem/skill/foe carries ──────────
export function identityOf(faction, planet) {
  const f = FACTIONS[faction], pk = planetOf(planet), p = PLANETS[pk];
  if (!f || !p) return null;
  return {
    faction: f.key, planet: p.key,
    name: 'The ' + p.adj + ' ' + f.role,
    body: f.body, lean: { ...f.lean }, role: f.role,
    glyph: p.glyph, metal: p.metal, colour: p.colour, temperament: p.temperament, humour: p.humour,
    governs: p.verbs.slice(),
    matchups: matchups(p.key),
  };
}
export function allIdentities() {
  const out = [];
  for (const f of FACTION_ORDER) for (const p of READING_ORDER) out.push(identityOf(f, p));
  return out;   // the 21, faction-major then Sun→Saturn
}

export default {
  FACTIONS, FACTION_ORDER, PLANETS, PLANET_ORDER, READING_ORDER,
  bodyOf, bodyLean, factionOfBody, planetOf, colourOf, glyphOf, advantage, matchups, identityOf, allIdentities,
};
