// rind/test/encounter.selftest.mjs — ENCOUNTER GENERATION (rind/combat/encounter.js).
// Run: node rind/test/encounter.selftest.mjs   (no deps)
//
// The forge leap: the oracle generates a fight at a target difficulty. Checks:
//   1. winnable-not-trivial — a 'fair' encounter is solvable and not a pushover;
//   2. determinism          — same (hero, difficulty, seed) → the same encounter;
//   3. difficulty ordering  — harder bands yield lower hero HP margin;
//   4. equipment feeds in    — arming the hero makes the generator field a tougher roster;
//   5. terrain              — generation works with terrain on.

import { rollCharacter } from '../combat/stats.js';
import { FACTION_LEAN } from '../combat/factions.js';
import { generateEncounter, describeEncounter } from '../combat/encounter.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const makeHero = (faction, power, n = 1, eq = {}) => ({ name: faction, faction, character: rollCharacter(n, { triad: FACTION_LEAN[faction], power }), ...eq });

const CAP = 30000;   // bound the oracle so the suite runs fast (these fights are small and certify well under it)

// ── 1. winnable but not trivial ───────────────────────────────────────────────────────────────────
{
  const hero = makeHero('rindwalker', 12);
  const enc = generateEncounter(hero, { difficulty: 'fair', seed: 3, cap: CAP });
  ok('generates an encounter', !!enc && enc.setup.foes.length >= 1);
  ok('fair encounter is WINNABLE', enc.grade.solvable === true, `${enc.grade.tier} @ ${(100 * enc.grade.margin).toFixed(0)}%`);
  ok('fair encounter is NOT TRIVIAL', enc.grade.margin < 0.70, `margin ${(100 * enc.grade.margin).toFixed(0)}%`);
  ok('reports par (a real fight, not a one-shot)', enc.grade.par >= 1);
}

// ── 2. determinism ─────────────────────────────────────────────────────────────────────────────────
{
  const hero = makeHero('drift', 12);
  const a = generateEncounter(hero, { difficulty: 'fair', seed: 5, cap: CAP });
  const b = generateEncounter(hero, { difficulty: 'fair', seed: 5, cap: CAP });
  const key = (e) => JSON.stringify([e.setup.foes.map((f) => [f.faction, f.character.power]), e.setup.terrain, e.grade.par, e.grade.margin]);
  ok('same hero+difficulty+seed → identical encounter', key(a) === key(b));
}

// ── 3. harder difficulty → lower hero margin (a squishy hero whose full ladder is reachable) ──────────
{
  const hero = makeHero('drift', 12);   // drift differentiates cleanly across the whole ladder
  const triv = generateEncounter(hero, { difficulty: 'trivial', seed: 7, cap: CAP });
  const fair = generateEncounter(hero, { difficulty: 'fair', seed: 7, cap: CAP });
  const tight = generateEncounter(hero, { difficulty: 'tight', seed: 7, cap: CAP });
  ok('all three difficulties are winnable', triv.grade.solvable && fair.grade.solvable && tight.grade.solvable);
  ok('difficulty orders the margin: trivial > fair > tight', triv.grade.margin > fair.grade.margin && fair.grade.margin > tight.grade.margin,
     `${(100 * triv.grade.margin).toFixed(0)}% > ${(100 * fair.grade.margin).toFixed(0)}% > ${(100 * tight.grade.margin).toFixed(0)}%`);
  ok('each lands in its target band', triv.ok && fair.ok && tight.ok, `${triv.ok}/${fair.ok}/${tight.ok}`);
}

// ── 4. equipment feeds into the threat budget ────────────────────────────────────────────────────────
{
  const bare = makeHero('rindwalker', 12, 9);
  const armed = makeHero('rindwalker', 12, 9, { weapon: { stats: { potency: 60, mass: 1 } }, armour: { stats: { durability: 50, mass: 1 } } });
  const eBare = generateEncounter(bare, { difficulty: 'fair', seed: 11, cap: CAP });
  const eArmed = generateEncounter(armed, { difficulty: 'fair', seed: 11, cap: CAP });
  // a stronger hero needs a stronger roster to land in the SAME band → higher admitted threat
  ok('arming the hero raises the encounter threat', eArmed.threat > eBare.threat, `bare ${eBare.threat} → armed ${eArmed.threat}`);
}

// ── 5. terrain on ────────────────────────────────────────────────────────────────────────────────────
{
  const hero = makeHero('drift', 12);
  const enc = generateEncounter(hero, { difficulty: 'fair', seed: 4, terrain: true, cap: CAP });
  ok('generates with terrain', !!enc && enc.setup.terrain.length > 0 && enc.grade.solvable);
}

// show one for eyeballing
console.log('\n' + describeEncounter(generateEncounter(makeHero('drift', 13), { difficulty: 'fair', seed: 2, cap: CAP })) + '\n');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
