// rind/test/solver.selftest.mjs — the combat SOLVABILITY ORACLE (rind/combat/solver.js).
// Run: node rind/test/solver.selftest.mjs   (no deps)
//
// The fable/forge analog for combat: certify a player party has a winning line against the
// deterministic AI, and grade the encounter. Checks:
//
//   1. determinism      — same encounter → same {solvable, par, margin} every run;
//   2. easy is solvable — a strong hero vs a weak foe is winnable, with a comfortable margin;
//   3. hard is not      — one frail hero vs an overwhelming pack is NOT certified winnable;
//   4. det engine math  — deterministic mode lands every blow (no misses) and is reproducible;
//   5. grading          — gradeEncounter tiers track margin (comfortable > brutal).

import * as E from '../combat/engine.js';
import { solveCombat, gradeEncounter } from '../combat/solver.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const C = (over = {}) => ({ hp: 40, atk: 10, def: 4, speed: 2, accuracy: 1, crit: 0, fluxPool: 20, apow: 10, power: 10, ...over });
const unit = (id, faction, over = {}) => ({ id, name: id, faction, combat: C(over) });

// ── 1. determinism ──────────────────────────────────────────────────────────────────────────────
const easy = { player: unit('P', 'rindwalker', { hp: 80, atk: 16 }), foes: [unit('E', 'continuant', { hp: 18, atk: 4, def: 1 })], seed: 1 };
const r1 = solveCombat(easy), r2 = solveCombat(easy);
ok('deterministic result', r1.solvable === r2.solvable && r1.par === r2.par && r1.margin === r2.margin, JSON.stringify(r1));

// ── 2. easy is solvable, comfortably ──────────────────────────────────────────────────────────────
ok('strong hero vs weak foe is solvable', r1.solvable === true, `par ${r1.par}, margin ${(100 * r1.margin).toFixed(0)}%`);
ok('and certified at a finite par', r1.par >= 1 && !r1.capped);
ok('with a healthy margin', r1.margin > 0.4, `${(100 * r1.margin).toFixed(0)}%`);

// ── 3. overwhelming is NOT certified winnable ──────────────────────────────────────────────────────
const doomed = {
  player: unit('P', 'drift', { hp: 24, atk: 4, def: 1, apow: 4, fluxPool: 6 }),
  foes: [unit('E0', 'rindwalker', { hp: 90, atk: 20 }), unit('E1', 'rindwalker', { hp: 90, atk: 20 }), unit('E2', 'rindwalker', { hp: 90, atk: 20 })],
  seed: 1,
};
const rd = solveCombat(doomed, { cap: 40000 });
ok('1 frail hero vs an overwhelming pack is not winnable', rd.solvable === false, `capped:${rd.capped} nodes:${rd.nodes}`);

// ── 4. deterministic engine: every blow lands, reproducible ────────────────────────────────────────
{
  function detDamage(seed) {
    const s = E.createBattle({ player: unit('P', 'continuant', { accuracy: 0.5, crit: 0 }), foes: [unit('E', 'continuant', { hp: 999, def: 0 })], seed, det: true });
    while (E.active(s).id !== 'P') E.endTurn(s);
    const u = E.active(s), foe = E.unitById(s, 'E'); foe.x = u.x + 1; foe.y = u.y;
    return E.act(s, { type: 'skill', skillId: 'strike', targetId: 'E' });
  }
  const a = detDamage(1), b = detDamage(2);
  ok('det mode never misses', a.hit && b.hit);
  ok('det mode is seed-independent (no RNG)', a.dmg === b.dmg, `${a.dmg} vs ${b.dmg}`);
}

// ── 5. grading tiers track margin ──────────────────────────────────────────────────────────────────
{
  const comfy = gradeEncounter({ player: unit('P', 'rindwalker', { hp: 120, atk: 20 }), foes: [unit('E', 'continuant', { hp: 12, atk: 2 })], seed: 1 });
  const rough = gradeEncounter({ player: unit('P', 'continuant', { hp: 34, atk: 9 }), foes: [unit('E', 'rindwalker', { hp: 60, atk: 14 })], seed: 1 });
  ok('comfortable encounter grades high', ['comfortable', 'fair'].includes(comfy.tier), comfy.tier + ` (${(100 * comfy.margin).toFixed(0)}%)`);
  ok('comfy margin ≥ rough margin when both solvable', !(comfy.solvable && rough.solvable) || comfy.margin >= rough.margin, `${comfy.tier} vs ${rough.tier}`);
  ok('grade returns a known tier', ['comfortable', 'fair', 'tight', 'brutal', 'impossible', 'unknown'].includes(rough.tier), rough.tier);
}

// ── 6. a 1v1 even faction encounter resolves to some verdict within budget ──────────────────────────
{
  const r = solveCombat({ player: unit('P', 'drift'), foes: [unit('E', 'continuant')], seed: 1 }, { cap: 50000 });
  ok('even encounter returns a verdict (solvable or capped)', r.solvable === true || r.capped === true || r.solvable === false, JSON.stringify(r));
}

// ── 7. terrain flows through the oracle (LoS/walls/hazards) — still deterministic, still terminates ──
{
  const setup = {
    player: unit('P', 'rindwalker', { hp: 80, atk: 16 }), foes: [unit('E', 'continuant', { hp: 18, atk: 4, def: 1 })], seed: 1,
    terrain: [{ kind: 'wall', x: 8, y: 8, r: 1.4 }, { kind: 'hazard', x: 6, y: 10, r: 2, effect: 'burn' }],
  };
  const t1 = solveCombat(setup), t2 = solveCombat(setup);
  ok('oracle is deterministic with terrain', t1.solvable === t2.solvable && t1.par === t2.par, JSON.stringify(t1));
  ok('terrain encounter returns a verdict', t1.solvable === true || t1.solvable === false || t1.capped === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
