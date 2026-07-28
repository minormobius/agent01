// continuum.selftest — the CONTINUUM combat engine vendored from rind/combat into hoop/v104/arena.
// A smoke suite over the in-game wiring: the engine builds a battle from v100 stats + creeps, faction kits
// resolve, apow is present (anima offense), and a full AI-vs-AI battle terminates. The deep invariants
// (45 checks: verbs, status, flanking, terrain, LoS, termination) live in rind/test/combat.selftest.mjs.
//   node hoop/v104/test/continuum.selftest.mjs

import { createBattle, legal, active, runAiTurn, endTurn, skillsFor, costOf, moveRange, UNIT_R, dist, SKILLS, act } from '../arena/engine.js';
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

// ── 7. SWARM MOVESET + AoE: a bee swarm fights with AREA (blast) on a clustered player+ally ──
{
  let sw = null; for (let c = 0; c < 200 && !sw; c++) for (let r = 0; r < 40; r++) { const cr = creepFor(9, c, r, 1); if (cr.plan === 'swarm') { sw = cr; break; } }
  ok(sw && Array.isArray(sw.kit) && sw.kit.includes('blast') && sw.kit.includes('lance') && !sw.kit.includes('brace'), 'a swarm carries an AoE+ranged kit (blast, lance), not the universal melee set');
  ok(sw.ai === 'swarm', 'a swarm uses the swarm AI (engulf clusters)');
  ok(skillsFor({ kit: sw.kit }).join() === sw.kit.join(), 'engine.skillsFor honours the swarm’s explicit kit');
  // the swarm BLASTS a clustered player+ally (AoE hits both) — the anti-bunching mechanic
  sw.id = 1;
  const pc = rollCharacter(3, {}), player = { id: 0, name: 'H', faction: 'rindwalker', character: pc, combat: deriveCombat(pc), sprite: { seed: 'p', role: 'm' } };
  const ally = { id: 2, name: 'Drone', faction: null, combat: { hp: 14, atk: 6, def: 2, speed: 1, accuracy: 0.85, crit: 0.02, fluxPool: 0, apow: 0, power: 6 }, sprite: { seed: 'd', role: 'm' } };
  const S = createBattle({ player, allies: [ally], foes: [sw], seed: 5, W: 14, H: 10 });
  const p = S.units.find((u) => u.id === 0), a = S.units.find((u) => u.id === 2), s = S.units.find((u) => u.id === 1);
  p.x = 7; p.y = 5; a.x = 7.5; a.y = 5.3; s.x = 7.2; s.y = 8; s.flux = 20;
  while (active(S).id !== 1 && !S.winner) endTurn(S);
  const b = { p: p.hp, a: a.hp }; runAiTurn(S);
  ok(p.hp < b.p && a.hp < b.a, 'the swarm’s blast is AoE — it hits BOTH the player and the ally at once');
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

// ── quaffing a preparation in a fight (the `item` act) — self heal + rousing (+atk) buff ──
{
  const c = rollCharacter(7, {});
  const S = createBattle({ player: { id: 0, name: 'H', faction: 'continuant', character: c, combat: deriveCombat(c), sprite: { seed: 'p', role: 'make' } }, foes: [creepFor(2, 1, 1, 1)], seed: 3, W: 14, H: 10, det: true });
  const u = S.units.find((x) => x.team === 'player'); while (active(S) !== u) endTurn(S);   // make sure it's the player's turn
  u.hp = 5; u.acted = false;
  const ev = act(S, { type: 'item', use: { deliver: 'self', combat: { kind: 'heal', amount: 12 } } });
  ok(ev.type === 'item' && ev.use === 'heal' && u.hp === Math.min(u.maxhp, 17), 'quaffing a heal draught restores HP (capped at max)');
  ok(u.acted === true, 'a quaff spends the action slot');
  u.acted = false;
  const ev2 = act(S, { type: 'item', use: { deliver: 'self', combat: { kind: 'buff', stat: 'atk', amount: 5, turns: 2 } } });
  ok(ev2.type === 'item' && u.buff.atk === 5 && u.buff.turns > 0, 'a rousing tonic grants a timed +atk buff');
  u.acted = false;
  const ev3 = act(S, { type: 'item', use: { deliver: 'range', combat: { kind: 'attack', damage: 8 } } });
  ok(ev3.type === 'illegal', 'a caustic (non-self) preparation cannot be self-quaffed in a fight');
}

// ── DOFF: throwing a preparation at a target (caustic flask / sedative smoke / salve to an ally) ──
{
  const c = rollCharacter(11, {});
  const S = createBattle({ player: { id: 0, name: 'H', faction: 'continuant', character: c, combat: deriveCombat(c), sprite: { seed: 'p', role: 'make' } }, foes: [creepFor(2, 1, 5, 4)], seed: 3, W: 14, H: 10, det: true });
  const u = S.units.find((x) => x.team === 'player'); while (active(S) !== u) endTurn(S);
  const foe = S.units.find((x) => x.team === 'foe'); foe.x = u.x + 2; foe.y = u.y; const hp0 = foe.hp;
  u.acted = false;
  const ev = act(S, { type: 'item', use: { deliver: 'range', range: 5, combat: { kind: 'attack', damage: 9, status: 'bleed' } }, targetId: foe.id });
  ok(ev.type === 'item' && ev.use === 'throw' && foe.hp < hp0 && foe.status.bleed, 'a thrown caustic flask damages the target + applies bleed');
  ok(u.acted === true, 'a throw spends the action slot');
  u.acted = false; foe.x = u.x + 9; foe.y = u.y + 9;
  const ev2 = act(S, { type: 'item', use: { range: 2, combat: { kind: 'attack', damage: 5 } }, targetId: foe.id });
  ok(ev2.type === 'illegal' && ev2.reason === 'range', 'a throw beyond its reach is illegal');
  u.acted = false; u.hp = Math.max(1, u.maxhp - 20);
  const ev3 = act(S, { type: 'item', use: { range: 4, combat: { kind: 'heal', amount: 12 } }, targetId: u.id });
  ok(ev3.type === 'item' && ev3.use === 'salve' && u.hp > u.maxhp - 20, 'a salve tossed to an ally (self) heals');
}

// ── v104 unified language: PLANET RPS — element over element (faction still sets the school) ──
{
  const { elementMult, ELEMENT_FAVOURED, ELEMENT_YIELDED } = await import('../arena/engine.js');
  const { advantage, PLANET_ORDER, bodyOf } = await import('../planets.js');
  const { FACTION_LEAN } = await import('../arena/factions.js');
  // faction↔body coherence: the combat style's domain + breeding lean must match planets.js's derived body
  // (continuant→flesh, rindwalker→chassis, drift→anima). This pins the resolved mismatch so it can't drift.
  for (const k of ['continuant', 'rindwalker', 'drift']) {
    ok(FACTIONS[k].domain === bodyOf(k), `${k} combat domain (${FACTIONS[k].domain}) matches its planets.js body (${bodyOf(k)})`);
    const leanDom = Object.entries(FACTION_LEAN[k]).sort((a, b) => b[1] - a[1])[0][0];
    ok(leanDom === bodyOf(k), `${k} breeding lean is dominant in its own body (${leanDom})`);
  }
  // saturn rules jupiter (the next in the Chaldean cycle); jupiter yields to saturn
  ok(elementMult('saturn', 'jupiter') === ELEMENT_FAVOURED, 'attacker whose planet rules the defender hits harder (saturn ▸ jupiter)');
  ok(elementMult('jupiter', 'saturn') === ELEMENT_YIELDED, 'attacker whose planet yields hits softer (jupiter ◃ saturn)');
  ok(elementMult('mars', 'mars') === 1, 'a mirror matchup is neutral');
  ok(elementMult(null, 'mars') === 1 && elementMult('mars', null) === 1, 'a planet-less unit fights at neutral (the demo/harness/un-migrated content is unaffected)');
  // the multiplier is a faithful read of the balanced heptagram: over all 7×7, favoured and yielded balance
  let fav = 0, yld = 0;
  for (const a of PLANET_ORDER) for (const b of PLANET_ORDER) { const m = elementMult(a, b); if (m === ELEMENT_FAVOURED) fav++; else if (m === ELEMENT_YIELDED) yld++; }
  ok(fav === 21 && yld === 21, 'across the heptagram every planet favours three and yields to three (21/21) — a fair RPS');
  // a real battle where both sides carry planets is still deterministic (same seed → same result)
  const battle = (seed) => { const S = createBattle({ player: { ...pcOf(11), planet: 'mars' }, foes: [{ ...creepFor(3, 1, 1, 1), id: 1, planet: 'luna' }], seed, W: 14, H: 10, det: true }); let g = 0; while (!S.winner && g++ < 3000) { const u = active(S); if (u.team === 'foe') runAiTurn(S); else { const adj = (S.units.filter((x) => x.alive && x.team === 'foe')).sort((a, b) => dist(u, a) - dist(u, b))[0]; if (adj && dist(u, adj) <= 1 && !u.acted) act(S, { type: 'attack', targetId: adj.id, skillId: 'strike' }); else endTurn(S); } } return { w: S.winner, t: S.turn }; };
  ok(JSON.stringify(battle(5)) === JSON.stringify(battle(5)), 'a planet-carrying battle is deterministic (element RPS keeps the permalink contract)');
}

console.log(`\ncontinuum.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
