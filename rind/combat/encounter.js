// encounter.js — ENCOUNTER GENERATION. The forge leap: the solvability oracle stops being a checker
// and becomes a generator. Given a hero (stat block + equipment), summon a foe roster (+ terrain) that
// the oracle certifies is WINNABLE but NOT TRIVIAL — a fight at a target difficulty.
//
// The method mirrors fable/forge (generate → certify → admit), with one twist: difficulty is a
// continuous target, so instead of blind sampling we run a FEEDBACK CONTROLLER on a single `threat`
// dial — grade a candidate, then nudge threat up if the fight came out too easy (margin too high) or
// down if too hard (unwinnable / margin too low), and re-roll. It converges in a handful of oracle
// calls. Pure + deterministic: same (hero, difficulty, seed) → the same encounter, for ever.

import { rollCharacter, deriveCombat } from './stats.js';
import { FACTIONS, FACTION_ORDER, FACTION_LEAN } from './factions.js';
import { gradeEncounter } from './solver.js';
import { rng, R } from './prng.js';
import * as E from './engine.js';

// difficulty = a target band on the oracle's `margin` (hero HP fraction left at an optimal win).
// "winnable but not trivial" is the default, FAIR: the hero wins with ~30–50% left.
export const DIFFICULTY = {
  trivial:     [0.70, 1.01],
  comfortable: [0.50, 0.70],
  fair:        [0.30, 0.50],
  tight:       [0.15, 0.30],
  brutal:      [0.02, 0.15],
};
const bandCenter = (b) => (b[0] + b[1]) / 2;
// where to start the threat dial per band (× hero power): harder band ⇒ start hotter.
const START = { trivial: 0.45, comfortable: 0.7, fair: 1.0, tight: 1.3, brutal: 1.6 };

// roll a foe roster (+ optional terrain) scaled by a `threat` budget relative to the hero's power.
// More threat ⇒ more foes and/or stronger ones; sqrt(nFoes) keeps a pack from being individually feeble.
function rollCandidate(hero, seed, threat, useTerrain) {
  const power = hero.character?.power || 10;
  const ratio = threat / power;
  const nFoes = Math.max(1, Math.min(4, Math.round(0.6 + ratio)));
  const per = Math.max(4, Math.round(power * ratio / Math.sqrt(nFoes)));
  const foes = [];
  for (let i = 0; i < nFoes; i++) {
    const fac = R.pick(rng(seed, 'fac' + i), FACTION_ORDER);
    foes.push({ id: 'E' + i, name: `${FACTIONS[fac].label} ${i + 1}`, faction: fac, character: rollCharacter(seed * 131 + i + 1, { triad: FACTION_LEAN[fac], power: per }) });
  }
  const terrain = useTerrain ? E.scatterTerrain(seed * 7 + 3, { walls: 2, hazards: 1 }) : [];
  return { foes, terrain, nFoes, per };
}

// build the player unit from the hero's stat block + equipment (deriveCombat folds weapon/armour in).
function heroUnit(hero) {
  return {
    id: 'P', name: hero.name || 'Hero', faction: hero.faction,
    combat: deriveCombat(hero.character, { weapon: hero.weapon || null, armour: hero.armour || null }),
    character: hero.character,   // carried through for the sprite (makeUnit uses `combat` for stats, ignores this)
    kit: hero.kit || null,       // tech-tree loadout: the verbs this hero has unlocked (else full faction kit)
    mods: hero.mods || null,     // tech-tree stat/passive deltas
  };
}

// ── the generator ───────────────────────────────────────────────────────────────────────────────
// hero: { faction, character, weapon?, armour?, name? }.  opts: { difficulty, seed, terrain, tries, cap }.
// Returns { ok, difficulty, seed, threat, tries, setup, grade } — `ok` is true if the admitted fight
// landed inside the target band; if no try lands in-band, returns the CLOSEST fight found (ok:false).
export function generateEncounter(hero, opts = {}) {
  const difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'fair';
  const band = DIFFICULTY[difficulty];
  const seed = (opts.seed >>> 0) || 1;
  const useTerrain = !!opts.terrain;
  const tries = opts.tries || 28;
  const cap = opts.cap || 80000;   // generous: a tight fight for a tanky hero is a big search; capping
                                   // would otherwise read as "too hard" and the controller would ease off
  const power = hero.character?.power || 10;
  const player = heroUnit(hero);

  let threat = power * (START[difficulty] || 1.0);
  let best = null;   // closest-to-band winnable fight seen, as a fallback

  for (let i = 0; i < tries; i++) {
    const cand = rollCandidate(hero, seed + i * 101, threat, useTerrain);
    const grade = gradeEncounter({ player, foes: cand.foes, terrain: cand.terrain, seed }, { cap });

    if (grade.capped) { threat *= 0.93; continue; }                      // inconclusive (search too big) → ease gently
    if (!grade.solvable) { threat *= 0.82; continue; }                   // genuinely unwinnable → ease off
    const m = grade.margin;
    const off = Math.min(Math.abs(m - band[0]), Math.abs(m - band[1]), m >= band[0] && m < band[1] ? 0 : Infinity);
    const distToCenter = Math.abs(m - bandCenter(band));
    if (!best || distToCenter < best.distToCenter) best = { cand, grade, threat, tries: i + 1, distToCenter };

    if (m >= band[0] && m < band[1]) return admit(true, player, cand, grade, difficulty, seed, threat, i + 1);
    threat *= (m >= band[1]) ? 1.18 : 0.86;   // too easy → harder ; too hard → easier
  }
  return best ? admit(false, player, best.cand, best.grade, difficulty, seed, best.threat, best.tries) : null;
}

function admit(ok, player, cand, grade, difficulty, seed, threat, tries) {
  return {
    ok, difficulty, seed, threat: Math.round(threat), tries,
    setup: { player, foes: cand.foes, terrain: cand.terrain, seed },
    grade,
  };
}

// a human-readable one-block summary of a generated encounter.
export function describeEncounter(enc) {
  if (!enc) return 'no encounter found';
  const g = enc.grade, foes = enc.setup.foes;
  const roster = foes.map((f) => `${FACTIONS[f.faction]?.glyph || '?'} ${f.faction} (pow ${f.character.power})`).join(', ');
  const terr = enc.setup.terrain.length ? `${enc.setup.terrain.filter((t) => t.kind === 'wall').length} walls, ${enc.setup.terrain.filter((t) => t.kind === 'hazard').length} hazards` : 'open field';
  return [
    `${enc.ok ? '✓' : '≈'} ${enc.difficulty} encounter (seed ${enc.seed}, ${enc.tries} tries, threat ${enc.threat})`,
    `  foes: ${foes.length} — ${roster}`,
    `  field: ${terr}`,
    `  oracle: ${g.tier} — ${g.solvable ? `winnable in ~${g.par} turns, ${(100 * g.margin).toFixed(0)}% HP left` : 'NOT certified winnable'}${g.capped ? ' (capped)' : ''}`,
  ].join('\n');
}

const ENC = { generateEncounter, describeEncounter, DIFFICULTY };
if (typeof globalThis !== 'undefined') globalThis.MEGA_ENCOUNTER = ENC;
export default ENC;
