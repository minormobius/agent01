// continuum.selftest — the CONTINUUM combat engine vendored from rind/combat into hoop/v100/arena.
// A smoke suite over the in-game wiring: the engine builds a battle from v100 stats + creeps, faction kits
// resolve, apow is present (anima offense), and a full AI-vs-AI battle terminates. The deep invariants
// (45 checks: verbs, status, flanking, terrain, LoS, termination) live in rind/test/combat.selftest.mjs.
//   node hoop/v100/test/continuum.selftest.mjs

import { createBattle, legal, active, runAiTurn, skillsFor, costOf, moveRange, UNIT_R, dist, SKILLS } from '../arena/engine.js';
import { FACTIONS } from '../arena/factions.js';
import { creepFor } from '../arena/encounter.js';
import { rollCharacter, deriveCombat } from '../stats.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const pcOf = (seed, faction) => { const c = rollCharacter(seed, {}); return { id: 0, name: 'Hero', faction, character: c, combat: deriveCombat(c), sprite: { seed: 'h', role: 'make' } }; };

// ── 1. apow backport: anima spell power rides the combat block (Lance/Blast scale off it) ──
const cm = deriveCombat(rollCharacter(7, {}));
ok(typeof cm.apow === 'number' && cm.apow > 0, 'deriveCombat now yields apow (anima offense)');

// ── 2. a battle builds on a continuum board: float positions, spawn bands, speed order ──
const foe = creepFor(9, 5, 3, 1); foe.id = 1;
const S = createBattle({ player: pcOf(42), foes: [foe], seed: 7, W: 14, H: 10 });
ok(S.units.length === 2 && S.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y)), 'units placed at continuous points');
ok(S.units.some((u) => u.y > 6) && S.units.some((u) => u.y < 4), 'players spawn bottom, foes top (spawn bands)');
ok(active(S) && (active(S).team === 'player' || active(S).team === 'foe'), 'an active unit by speed order');

// ── 3. faction kits: the universal base ∪ the faction signature verbs, discounted ──
for (const [key, f] of Object.entries(FACTIONS)) {
  const u = { faction: key };
  const kit = skillsFor(u);
  ok(['strike', 'brace', 'mend', 'overclock', 'harden'].every((k) => kit.includes(k)), `${key}: has the universal base`);
  ok(f.kit.every((k) => kit.includes(k)), `${key}: adds its signature kit (${f.kit.join(',')})`);
}
// a discount actually lowers a cost (drift's lance is cheaper than base)
ok(costOf({ faction: 'drift' }, 'lance') < SKILLS.lance.cost, 'drift discounts lance below base cost');
ok(costOf({ faction: null }, 'overclock') === SKILLS.overclock.cost, 'no faction → no discount');

// ── 4. the move surface is a RADIUS (continuum), not a tile set ──
const L = legal(S);
ok(L.move && typeof L.move.range === 'number' && L.move.range >= 2, 'legal().move.range is a numeric reach radius');
ok(L.skills && typeof L.skills === 'object' && L.skills.strike, 'legal().skills is keyed by id with a strike entry');
ok(UNIT_R > 0 && dist({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5, 'continuum geometry: Euclidean dist + a body radius');

// ── 5. a full AI-vs-AI battle terminates with a decisive winner ──
{
  const B = createBattle({ player: pcOf(11, 'rindwalker'), foes: [{ ...creepFor(3, 1, 1, 1), id: 1, faction: 'drift' }], seed: 99, W: 14, H: 10 });
  let guard = 0; while (!B.winner && guard++ < 500) runAiTurn(B);
  ok(!!B.winner, 'AI-vs-AI battle terminates');
  ok(['player', 'foe', 'draw'].includes(B.winner), 'winner is player | foe | draw');
}

console.log(`\ncontinuum.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
