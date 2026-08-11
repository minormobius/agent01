// ┌───────────────────────────────────────────────────────────────────────────┐
// │ VENDORED (extraction) — the PLANET→FLAVOR half of hoop/v110/planets.js.     │
// │                                                                             │
// │ farm's alchemy kernel (vendor/alchemy.js, verbatim from hoop) imports       │
// │ `planetOf`, `matchups`, `colourOf` from ../planets.js. In hoop that file    │
// │ also carries the FACTION→BODY axis, which drags in stats.js and the whole   │
// │ nave; farm needs none of that. This file is the planet half ONLY, copied    │
// │ byte-for-byte (PDEF, PLANETS, PLANET_ORDER, READING_ORDER, planetOf,        │
// │ colourOf, glyphOf, advantage, matchups) so the shared design language —     │
// │ the Seven, their metals, colours and the Chaldean RPS — stays identical     │
// │ across surfaces. RE-SYNC these definitions from hoop/v110/planets.js if     │
// │ the Seven ever change there. Do not add farm-specific logic here.           │
// └───────────────────────────────────────────────────────────────────────────┘

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

export default { PLANETS, PLANET_ORDER, READING_ORDER, planetOf, colourOf, glyphOf, advantage, matchups };
