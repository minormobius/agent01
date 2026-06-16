// crew.js — the cheap, deterministic per-person generator shared by the player and every NPC.
// Given (seed, role) it produces:
//   crewSprite(seed, role) — a sprite genome that HEWS TO THE STYLE GUIDE (NPC-SPRITES.md §4): a figure
//       must read as its PROFESSION at a glance, so the cloth is recoloured to the role's canon hue
//       (the same colours the buildings/inspector use) and the role's emblem accent rides on top. The
//       base engine otherwise tints cloth by domain/random, which doesn't say "what is this person's job".
//   crewStats(seed, role) — the FLESH·CHASSIS·ANIMA stat block (stats.js rollCharacter). Pure + O(1):
//       cheap enough to mint one for every soul on the map on demand, none stored.
//
// Both are pure functions of (seed, role) ⇒ the same crew-member everywhere, forever.

import { genomeFromParams, ramp, hexHue, rngFor, ROLES } from './v3/sprite-core.js';
import { xmur3 } from '../sprite/item/prng.js';
import { rollCharacter, VOCATIONS } from './stats.js';

export const asSeed = (s) => (typeof s === 'number' ? (s >>> 0) : (xmur3(String(s == null ? '' : s))() >>> 0)) || 1;
const validRole = (r) => (r && ROLES[r] && VOCATIONS[r] ? r : 'dwell');

export function crewSprite(seed, role, opts = {}) {
  role = validRole(role);
  const g = genomeFromParams({ seed: String(seed), role, arch: opts.arch || 'balanced', size: opts.size || 17 });
  // recolour the body to the profession's canon hue so the silhouette is unmistakably that vocation
  const R = ROLES[role];
  g.ramps.cloth = ramp(rngFor(String(seed) + '::profcloth'), hexHue(R.color), 52, 10);
  g.profRole = role;
  return g;
}

export function crewStats(seed, role) {
  return rollCharacter(asSeed(seed), validRole(role) ? { vocation: validRole(role) } : {});
}

export default { crewSprite, crewStats, asSeed };
