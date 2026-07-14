// alignment.js — PLANETARY ALIGNMENT. Your register is not chosen at creation; it is GROWN. Nearly every
// thing in the game carries a planet (planets.js): an item's metal → its register, a gem's lattice → its
// planet, a reagent's herb → its planet, a foe → its planet. Every interaction TALLIES toward that planet,
// and the running tally — normalized — is a 7-axis RADAR of who you are becoming, published on the sheet.
//
// Pure, DOM-free, deterministic, node-tested (test/alignment.selftest.mjs). The tally rides the save; the
// renderer reads radarPoints(). Nothing here decides WHICH interactions count or HOW MUCH — that is the
// game glue's call (index.html tallies at craft / brew / socket / fight); this is the mechanism only.

import { PLANET_ORDER, READING_ORDER, PLANETS, planetOf } from './planets.js';
import { materialPlanet } from './sprite/item/taxa.js';
import { gemPlanet } from './gems.js';

// a fresh, zeroed tally over the Seven.
export function newAlignment() { const a = {}; for (const k of PLANET_ORDER) a[k] = 0; return a; }

// coerce a stored/partial object back into a full seven-key tally (so an old save or a sparse blob is safe).
export function coerce(al) { const out = newAlignment(); if (al) for (const k of PLANET_ORDER) out[k] = +al[k] || 0; return out; }

// resolve any game THING to its planet key: an explicit .planet / .planetKey, a gem's crystal system
// (gemPlanet), an item/gear's material (materialPlanet), or its metal — else a raw tag through planetOf.
// Returns null when nothing resolves (so an unaligned thing never pollutes the tally).
export function planetOfThing(thing) {
  if (thing == null) return null;
  if (typeof thing === 'string') return planetOf(thing);
  let k = planetOf(thing.planet) || planetOf(thing.planetKey);
  if (k) return k;
  if (thing.system) { k = gemPlanet(thing); if (k) return k; }             // a gem (crystal lattice → planet)
  if (thing.material) { k = materialPlanet(thing.material); if (k) return k; }   // an item / piece of gear
  if (thing.metal) { k = planetOf(thing.metal); if (k) return k; }
  return null;
}

// add one interaction (or `weight` of them) toward a planet. Accepts a key, a raw tag, or a thing. Mutates
// and returns `al` (the caller owns the tally object). A weightless / unresolved interaction is a no-op.
export function tally(al, planetOrThing, weight = 1) {
  const k = typeof planetOrThing === 'string' ? planetOf(planetOrThing) : planetOfThing(planetOrThing);
  if (k && al[k] != null && weight) al[k] += weight;
  return al;
}
// tally a whole list of things at once (e.g. a brew's reagents, an item's sockets).
export function tallyAll(al, things, weight = 1) { for (const t of (things || [])) tally(al, t, weight); return al; }

export const total = (al) => PLANET_ORDER.reduce((s, k) => s + (al[k] || 0), 0);
export function normalized(al) { const t = total(al) || 1; const o = {}; for (const k of PLANET_ORDER) o[k] = (al[k] || 0) / t; return o; }
export function dominant(al) { let best = null, bv = 0; for (const k of PLANET_ORDER) if ((al[k] || 0) > bv) { bv = al[k]; best = k; } return best; }
// every planet ranked by tally, richest first — for a legend. [{ planet, count, share }]
export function ranked(al) { const t = total(al) || 1; return PLANET_ORDER.map((k) => ({ planet: k, count: al[k] || 0, share: (al[k] || 0) / t })).sort((a, b) => b.count - a.count || READING_ORDER.indexOf(a.planet) - READING_ORDER.indexOf(b.planet)); }

// RADAR geometry — the seven axes in READING_ORDER (Sun→Saturn), clockwise from the top. Each vertex sits
// at its share of the tally; `scaleToMax` blows the strongest axis out to the rim so a lopsided profile is
// still legible (set false for absolute shares). Returns per-axis points + the axis endpoints + glyph/colour.
export function radarPoints(al, cx, cy, r, { scaleToMax = true } = {}) {
  const norm = normalized(al);
  const mx = scaleToMax ? Math.max(1e-9, ...READING_ORDER.map((k) => norm[k])) : 1;
  const n = READING_ORDER.length;
  return READING_ORDER.map((k, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const frac = mx > 0 ? norm[k] / mx : 0;
    const P = PLANETS[k] || {};
    return {
      planet: k, glyph: P.glyph || '·', colour: P.colour || '#8a94a0', share: norm[k], frac,
      x: cx + Math.cos(ang) * r * frac, y: cy + Math.sin(ang) * r * frac,   // the data vertex
      ax: cx + Math.cos(ang) * r, ay: cy + Math.sin(ang) * r,               // the axis endpoint (the rim)
    };
  });
}

export default { newAlignment, coerce, planetOfThing, tally, tallyAll, total, normalized, dominant, ranked, radarPoints };
