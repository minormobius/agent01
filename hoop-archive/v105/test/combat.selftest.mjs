// combat.selftest — the GRID arena engine (createBattle / act / turns / win-loss / AI / determinism) plus
// the in-world encounter layer (deterministic creeps, deck scaling, spoils).
// NB: the in-game battle moved to the CONTINUUM engine (arena/engine.js); the grid engine lives on as
// arena/engine-grid.js for the standalone /arena demo page — this suite pins THAT. The continuum engine is
// pinned by continuum.selftest.mjs here + the 45-invariant rind/test/combat.selftest.mjs it was vendored from.
import { createBattle, act, endTurn, legal, active, reachable, attackable, aiPlan, aiStep, unitById, SKILLS, SKILL_ORDER } from '../arena/engine-grid.js';
import { CREEP_ROLES, isCreepRole, creepId, creepFor, spoilsFor } from '../arena/encounter.js';
import { rollCharacter, deriveCombat } from '../stats.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

const mkPlayer = (seed) => { const c = rollCharacter(seed, {}); return { id: 0, name: c.name, character: c, combat: deriveCombat(c), sprite: { seed: 'p' + seed, role: c.vocation } }; };

// 1. battle construction
const foe = creepFor(7, 'c0', 3, 0);
let s = createBattle({ player: mkPlayer(7), foes: [foe], seed: 1, W: 9, H: 9 });
ok(s.units.length === 2 && s.units.some((u) => u.team === 'player') && s.units.some((u) => u.team === 'foe'), 'battle has a player + a foe');
ok(s.order.length === 2 && s.phase && s.turn === 1, 'turn order + phase initialised');
ok(s.units.every((u) => u.hp === u.maxhp && u.hp > 0), 'units start at full hp');
ok(s.units.every((u) => u.x >= 0 && u.x < s.W && u.y >= 0 && u.y < s.H), 'units placed on the board');

// 2. SKILLS table sane
ok(SKILL_ORDER.length >= 3 && SKILL_ORDER.every((k) => SKILLS[k]), 'skill order resolves to real skills');
ok(SKILLS.strike.cost === 0 && SKILLS.strike.kind === 'attack', 'strike is the free attack');

// 3. movement is legal-gated
const me = active(s);
if (me.team === 'foe') { /* ensure we drive a player turn below regardless */ }
const reach = reachable(s, me);
ok(reach.length > 0 && reach.every((t) => Math.abs(t.x - me.x) <= 4 && Math.abs(t.y - me.y) <= 4), 'reachable tiles within move range');
ok(act(s, { type: 'move', x: 99, y: 99 }).type === 'illegal', 'an unreachable move is rejected');
const dest = reach[0]; const mv = act(s, { type: 'move', x: dest.x, y: dest.y });
ok(mv.type === 'move' && me.x === dest.x && me.y === dest.y && me.moved, 'a legal move applies + flags moved');
ok(act(s, { type: 'move', x: reach[1].x, y: reach[1].y }).type === 'illegal', 'cannot move twice in one turn');

// 4. a full battle resolves to a winner (drive with AI on both sides, deterministically)
let g = createBattle({ player: mkPlayer(11), foes: [creepFor(11, 'c0', 1, 0)], seed: 5 });
let guard = 0;
while (!g.winner && guard++ < 4000) {
  const u = active(g);
  if (u.team === 'foe') { for (const st of aiPlan(g)) { if (g.winner) break; if (st.type === 'end') { endTurn(g); break; } aiStep(g, st); } }
  else {
    // greedy player: if a foe is adjacent strike it, else step toward the nearest, else end
    const adj = attackable(g, u);
    if (adj.length && !u.acted) act(g, { type: 'attack', targetId: adj[0].id, skillId: 'strike' });
    else if (!u.moved) { const foes = g.units.filter((x) => x.team === 'foe' && x.alive); const tgt = foes[0]; const tiles = reachable(g, u); let best = null, bd = 1e9; for (const t of tiles) { const d = Math.max(Math.abs(t.x - tgt.x), Math.abs(t.y - tgt.y)); if (d < bd) { bd = d; best = t; } } if (best) act(g, { type: 'move', x: best.x, y: best.y }); else endTurn(g); }
    else endTurn(g);
    if (u.moved && u.acted) endTurn(g);
  }
}
ok(g.winner === 'player' || g.winner === 'foe', `a battle terminates with a winner (${g.winner}, ${g.turn} turns)`);
ok(g.units.some((u) => !u.alive), 'someone fell');

// 5. determinism: same seeds → identical battle outcome
const play = (seed) => { let b = createBattle({ player: mkPlayer(3), foes: [creepFor(3, 'cz', 2, 1)], seed }); let gd = 0; while (!b.winner && gd++ < 4000) { const u = active(b); if (u.team === 'foe') { for (const st of aiPlan(b)) { if (b.winner) break; if (st.type === 'end') { endTurn(b); break; } aiStep(b, st); } } else { const adj = attackable(b, u); if (adj.length && !u.acted) act(b, { type: 'attack', targetId: adj[0].id, skillId: 'strike' }); else if (!u.moved) { const t = b.units.find((x) => x.team === 'foe' && x.alive); const tiles = reachable(b, u); let best = null, bd = 1e9; for (const q of tiles) { const d = Math.max(Math.abs(q.x - t.x), Math.abs(q.y - t.y)); if (d < bd) { bd = d; best = q; } } best ? act(b, { type: 'move', x: best.x, y: best.y }) : endTurn(b); } else endTurn(b); if (u.moved && u.acted) endTurn(b); } } return { winner: b.winner, turn: b.turn }; };
ok(JSON.stringify(play(99)) === JSON.stringify(play(99)), 'same seed → identical battle');

// 6. encounter layer
ok(CREEP_ROLES.length >= 1 && isCreepRole(CREEP_ROLES[0]) && !isCreepRole('dwell'), 'creep roles classify');
ok(creepId('c4', 7) === 'cr' + 'c4' + ':r7', 'creep ids are stable strings');
const a = creepFor(7, 'c0', 3, 0), b = creepFor(7, 'c0', 3, 0);
ok(a.name === b.name && a.combat.hp === b.combat.hp && a.vocation === b.vocation, 'a room holds the SAME creep every time');
ok(creepFor(7, 'c0', 4, 0).name !== undefined && a.glyph && a.combat.atk > 0, 'creep is a valid armed foe spec');
ok(creepFor(7, 'c0', 3, 3).combat.hp > a.combat.hp, 'deeper decks scale a creep up');
ok(creepFor(7, 'c0', 3, 0).combat.hp === a.combat.hp, 'deck-0 creep matches the unscaled base');
const sp = spoilsFor(7, 'c0', 3, 2);
ok(sp.itemSeed >= 0 && sp.coins > 0, 'spoils give a loot seed + coins');
ok(spoilsFor(7, 'c0', 3, 2).coins === sp.coins, 'spoils are deterministic');

console.log(`combat.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
