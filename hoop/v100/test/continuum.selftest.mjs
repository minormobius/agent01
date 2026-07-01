// continuum.selftest — the CONTINUUM combat engine vendored from rind/combat into hoop/v100/arena.
// A smoke suite over the in-game wiring: the engine builds a battle from v100 stats + creeps, faction kits
// resolve, apow is present (anima offense), and a full AI-vs-AI battle terminates. The deep invariants
// (45 checks: verbs, status, flanking, terrain, LoS, termination) live in rind/test/combat.selftest.mjs.
//   node hoop/v100/test/continuum.selftest.mjs

import { createBattle, legal, active, runAiTurn, skillsFor, costOf, moveRange, UNIT_R, dist, SKILLS, act } from '../arena/engine.js';
import { FACTIONS } from '../arena/factions.js';
import { creepFor, creepPack, certifyPack } from '../arena/encounter.js';
import { gradeEncounter } from '../arena/solver.js';
import { buildSwarmGenome } from '../v3/swarm.js';
import { rollCharacter, deriveCombat } from '../stats.js';
import { packForCharacter } from '../pack.js';
import { autoEquip, defaultPlan } from '../bodyplan.js';

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

// ── 6. THE SOLVER ORACLE: grades a fight, and certifyPack tunes a pack winnable-but-not-trivial ──
{
  const c = rollCharacter(7, {}), eq = autoEquip(defaultPlan(), packForCharacter(c, 9));
  const player = { id: 0, name: 'Hero', faction: 'rindwalker', character: c, combat: deriveCombat(c, { weapon: eq.mainhand, armour: eq.body || eq.offhand }), sprite: { seed: 'p', role: c.vocation } };
  const g = gradeEncounter({ player, foes: [creepFor(9, 5, 3, 1)], seed: 7, W: 14, H: 10 }, { cap: 16000 });
  ok(['comfortable', 'fair', 'tight', 'brutal', 'trivial', 'impossible', 'unknown'].includes(g.tier), 'gradeEncounter returns a difficulty tier');
  const cert = certifyPack(player, creepPack(9, 5, 3, 1), { seed: 7 });
  ok(cert && Array.isArray(cert.foes) && cert.foes.length >= 1, 'certifyPack returns a tuned foe pack');
  ok(cert.tier !== 'impossible', 'certifyPack never ships a provably-impossible fight (biases safe)');
  // it's a GATE: an absurdly overscaled pack (huge foes) gets tuned down off "impossible"
  const huge = creepPack(9, 5, 3, 1).map((f) => ({ ...f, combat: { ...f.combat, hp: 9999, atk: 999 } }));
  const tuned = certifyPack(player, huge, { seed: 7, tries: 4 });
  ok(tuned.foes[0].combat.hp < 9999, 'certifyPack scales an overwhelming pack down');
}

// ── 7. SWARM MOVESET: a bee swarm overrides the universal kit with its own (strike + ranged lance) ──
{
  let sw = null; for (let c = 0; c < 200 && !sw; c++) for (let r = 0; r < 40; r++) { const cr = creepFor(9, c, r, 1); if (cr.plan === 'swarm') { sw = cr; break; } }
  ok(sw && Array.isArray(sw.kit) && sw.kit.includes('lance') && !sw.kit.includes('brace'), 'a swarm carries its own ranged kit (lance), not the universal melee set');
  ok(sw.ai === 'kite', 'a swarm uses the kite AI (sting from range)');
  ok(skillsFor({ kit: sw.kit }).join() === sw.kit.join(), 'engine.skillsFor honours the swarm’s explicit kit');
}

// ── 8. player SUMMON → a grey/black ROBOT swarm sprite (distinct palette from the amber enemy swarm) ──
{
  const enemy = buildSwarmGenome('e1'), robot = buildSwarmGenome('e1', { robot: true });
  ok(enemy.colors.thorax !== robot.colors.thorax && /210/.test(robot.colors.thorax), 'robot swarm uses the grey/steel palette, not amber');
  // a rindwalker player has Summon in its kit; using it spawns a summoned unit (rendered as the robot swarm)
  const pcs = rollCharacter(3, {});
  const S = createBattle({ player: { id: 0, name: 'H', faction: 'rindwalker', character: pcs, combat: deriveCombat(pcs), sprite: { seed: 'p', role: 'make' } }, foes: [creepFor(1, 1, 1, 1)], seed: 5, W: 14, H: 10 });
  const pu = S.units.find((u) => u.team === 'player'); pu.flux = 20;
  ok(skillsFor(pu).includes('summon'), 'the faction player can Summon');
  act(S, { type: 'skill', skillId: 'summon' });
  ok(S.units.some((u) => u.summoned), 'Summon brings a summoned unit onto the board (drawn as a robot swarm)');
}

console.log(`\ncontinuum.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
