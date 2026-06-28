// rind/test/combat.selftest.mjs — the COMBAT engine (rind/combat/) invariants.
// Run: node rind/test/combat.selftest.mjs   (no deps)
//
// Certifies the v2 engine the balance harness + dojo run, and that the faction styles do what
// factions.js claims. Pure + seeded, so every check is deterministic:
//
//   1. determinism      — same (player, foes, seed) → bit-identical battle log on replay;
//   2. faction kits     — skillsFor = universal ∪ kit (deduped); cost discounts apply;
//   3. legality         — one action/turn, flux-gated, stun blocks action;
//   4. verbs            — flank bonus, brace counter, bleed/slow/mark status, flit, adrenal, siphon;
//   5. passives         — drift +move, continuant braced-def, rindwalker berserk + regen;
//   6. termination      — a full AI-vs-AI battle always reaches a winner.

import { rollCharacter } from '../combat/stats.js';
import { FACTIONS, FACTION_LEAN, discountedCost } from '../combat/factions.js';
import * as E from '../combat/engine.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

// fixed combat block so checks don't depend on stat rolls (where rolls matter we use rollCharacter).
const C = (over = {}) => ({ hp: 40, atk: 10, def: 4, speed: 2, accuracy: 1, crit: 0, fluxPool: 30, power: 10, ...over });
const P = (faction, over = {}) => ({ id: 'P', name: 'Hero', faction, combat: C(over) });
const F = (faction, over = {}) => ({ id: 'E', name: 'Foe', faction, combat: C(over) });

// ── 1. determinism ────────────────────────────────────────────────────────────────────────────
function autoBattle(seed, pf = 'rindwalker', ff = 'continuant') {
  const s = E.createBattle({ player: P(pf), foes: [F(ff)], seed });
  let guard = 0;
  while (!s.winner && guard++ < 400) {
    const u = E.active(s);
    if (u.team === 'foe') { E.runAiTurn(s); continue; }
    // simple scripted player: close on the foe, strike, end
    const foe = E.enemiesOf(s, u)[0];
    if (!E.inRange(u, foe, 1)) { const p = E.moveToward(s, u, foe.x, foe.y, E.moveRange(u), 2 * E.UNIT_R); if (p.x !== u.x || p.y !== u.y) E.act(s, { type: 'move', x: p.x, y: p.y }); }
    const sk = E.legal(s).skills;
    if (sk.strike?.usable) E.act(s, { type: 'skill', skillId: 'strike', targetId: foe.id });
    E.act(s, { type: 'end' });
  }
  return s;
}
const a = autoBattle(7), b = autoBattle(7);
const logKey = (s) => JSON.stringify(s.log.map((l) => [l.t, l.msg]));
ok('battle reaches a winner', !!a.winner, a.winner || 'none');
ok('deterministic (same seed → same log)', logKey(a) === logKey(b));
ok('different seed → different battle', logKey(autoBattle(7)) !== logKey(autoBattle(99)));

// ── 2. faction kits + discounts ─────────────────────────────────────────────────────────────────
for (const fk of Object.keys(FACTIONS)) {
  const u = E.makeUnit({ ...P(fk), x: 0, y: 0, team: 'player' });
  const skills = E.skillsFor(u);
  const hasUniversal = E.UNIVERSAL.every((k) => skills.includes(k));
  const hasKit = FACTIONS[fk].kit.every((k) => skills.includes(k));
  const noDup = new Set(skills).size === skills.length;
  ok(`${fk}: kit = universal ∪ signature, deduped`, hasUniversal && hasKit && noDup, skills.join(','));
}
ok('continuant mend is discounted (6 → 3)', discountedCost('continuant', 'mend', 6) === 3);
ok('drift overclock is discounted (5 → 3)', discountedCost('drift', 'overclock', 5) === 3);
ok('no discount → unchanged', discountedCost('drift', 'mend', 6) === 6);
{
  const u = E.makeUnit({ ...P('rindwalker'), x: 0, y: 0, team: 'player' });
  ok('costOf applies faction discount', E.costOf(u, 'adrenal') === 0 && E.costOf(u, 'mend') === 6);
}

// ── 3. legality ───────────────────────────────────────────────────────────────────────────────
{
  const s = E.createBattle({ player: P('continuant'), foes: [F('continuant', { speed: 1 })], seed: 1 });
  const u = E.active(s); const foe = E.enemiesOf(s, u)[0];
  // put them adjacent for the test
  foe.x = u.x + 1; foe.y = u.y;
  const r1 = E.act(s, { type: 'skill', skillId: 'strike', targetId: foe.id });
  ok('first strike lands', r1.type === 'attack');
  const r2 = E.act(s, { type: 'skill', skillId: 'strike', targetId: foe.id });
  ok('cannot act twice in a turn', r2.type === 'illegal');
}
{
  const s = E.createBattle({ player: P('drift', { fluxPool: 2 }), foes: [F('continuant')], seed: 1 });
  const u = E.active(s); u.flux = 2;
  const lg = E.legal(s);
  ok('flux-gated skill marked unusable', lg.skills.harden && lg.skills.harden.usable === false);
}
{
  const s = E.createBattle({ player: P('continuant'), foes: [F('continuant')], seed: 1 });
  const u = E.active(s); u.status.stun = { turns: 1 };
  ok('stun blocks an action', E.act(s, { type: 'skill', skillId: 'strike', targetId: 'E' }).type === 'illegal');
}

// ── 4. verbs ────────────────────────────────────────────────────────────────────────────────────
// flanking: same seed, with vs without an ally adjacent to the target → flank deals more.
function strikeDmg({ flank, seed = 5 }) {
  const player = P('continuant', { crit: 0, accuracy: 1 });
  const foes = [F('continuant', { def: 0, hp: 999 })];
  if (flank) foes.push({ id: 'A', name: 'Ally2', faction: 'continuant', combat: C({ hp: 999 }) });
  const s = E.createBattle({ player, foes, seed, W: 9, H: 9 });
  const u = E.active(s); const tgt = E.unitById(s, 'E');
  tgt.x = u.x + 1; tgt.y = u.y;
  if (flank) { const ally = E.unitById(s, 'A'); ally.team = 'player'; ally.x = tgt.x + 1; ally.y = tgt.y; }
  const r = E.act(s, { type: 'skill', skillId: 'strike', targetId: 'E' });
  return r.dmg;
}
ok('flanking increases damage', strikeDmg({ flank: true }) > strikeDmg({ flank: false }),
   `${strikeDmg({ flank: false })} → ${strikeDmg({ flank: true })}`);

// brace counter: a braced unit hit by an adjacent foe strikes back.
{
  const s = E.createBattle({ player: P('continuant'), foes: [F('rindwalker', { speed: 1 })], seed: 3 });
  // make the player active and brace
  const hero = E.unitById(s, 'P'), foe = E.unitById(s, 'E');
  foe.x = hero.x + 1; foe.y = hero.y;
  // force player turn
  while (E.active(s).id !== 'P') E.endTurn(s);
  E.act(s, { type: 'skill', skillId: 'brace' }); E.act(s, { type: 'end' });
  const foeHpBefore = foe.hp;
  while (E.active(s).id !== 'E') E.endTurn(s);
  E.act(s, { type: 'skill', skillId: 'strike', targetId: 'P' });
  ok('brace counters an adjacent attacker', foe.hp < foeHpBefore, `foe ${foeHpBefore} → ${foe.hp}`);
}

// bleed ticks down HP over turns; slow caps move; mark increases incoming damage.
{
  const s = E.createBattle({ player: P('rindwalker'), foes: [F('continuant')], seed: 1 });
  const foe = E.unitById(s, 'E'); foe.status.bleed = { turns: 2 }; const before = foe.hp;
  // advance until it's the foe's begin-turn (bleed ticks at beginTurn)
  let g = 0; while (E.active(s).id !== 'E' && g++ < 10) E.endTurn(s);
  ok('bleed drains HP at turn start', foe.hp < before, `${before} → ${foe.hp}`);
}
{
  const u = E.makeUnit({ ...P('drift'), x: 0, y: 0, team: 'player' });   // drift normally has +1 move
  const free = E.moveRange(u);
  u.status.slow = { turns: 1 };
  ok('slow caps move range to 1', E.moveRange(u) === 1, `free ${free} → slowed ${E.moveRange(u)}`);
}
// flit frees the move slot and grants extra range
{
  const s = E.createBattle({ player: P('drift'), foes: [F('continuant')], seed: 2 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s); u.moved = true;                      // pretend already moved
  const r = E.act(s, { type: 'skill', skillId: 'flit' });
  ok('flit reopens the move slot', r.type === 'reposition' && u.moved === false);
}
// adrenal: HP→Flux, never self-kills
{
  const s = E.createBattle({ player: P('rindwalker', { fluxPool: 30 }), foes: [F('continuant')], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s); u.flux = 0; u.hp = 3;
  const r = E.act(s, { type: 'skill', skillId: 'adrenal' });
  ok('adrenal converts HP→Flux without self-kill', r.type === 'convert' && u.flux > 0 && u.hp >= 1, `hp ${u.hp} flux ${u.flux}`);
}
// siphon drains target flux into self
{
  const s = E.createBattle({ player: P('drift', { fluxPool: 30 }), foes: [F('continuant', { fluxPool: 30 })], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s); const foe = E.unitById(s, 'E'); foe.x = u.x + 1; foe.y = u.y; u.flux = 5; foe.flux = 30;
  const r = E.act(s, { type: 'skill', skillId: 'siphon', targetId: 'E' });
  ok('siphon moves flux foe→self', r.type === 'siphon' && u.flux > 5 && foe.flux < 30, `self ${u.flux} foe ${foe.flux}`);
}

// ── 4b. multi-agent & range verbs ───────────────────────────────────────────────────────────────
const A = (faction, over = {}) => ({ id: 'A', name: 'Ally', faction, combat: C(over) });
// lance: ranged (range 3) magic; damage scales off apow, NOT atk.
{
  const s = E.createBattle({ player: P('drift', { apow: 30, atk: 1, fluxPool: 30 }), foes: [F('continuant', { def: 0, hp: 999 })], seed: 1, W: 9, H: 9 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), foe = E.unitById(s, 'E'); foe.x = u.x + 3; foe.y = u.y;   // 3 away
  const r = E.act(s, { type: 'skill', skillId: 'lance', targetId: 'E' });
  ok('lance hits at range 3', r.type === 'attack' && r.hit, `dmg ${r.dmg}`);
  // low-apow caster lances for less (proves apow, not atk, drives magic)
  const s2 = E.createBattle({ player: P('drift', { apow: 4, atk: 30, fluxPool: 30 }), foes: [F('continuant', { def: 0, hp: 999 })], seed: 1, W: 9, H: 9 });
  while (E.active(s2).id !== 'P') E.endTurn(s2);
  const u2 = E.active(s2), f2 = E.unitById(s2, 'E'); f2.x = u2.x + 3; f2.y = u2.y;
  const r2 = E.act(s2, { type: 'skill', skillId: 'lance', targetId: 'E' });
  ok('magic damage scales off apow not atk', r.dmg > r2.dmg, `apow30 ${r.dmg} vs apow4 ${r2.dmg}`);
}
{
  const s = E.createBattle({ player: P('drift', { fluxPool: 30 }), foes: [F('continuant')], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), foe = E.unitById(s, 'E'); foe.x = u.x + 4; foe.y = u.y + 4;   // >3 (Chebyshev 4)
  ok('lance illegal beyond range', E.act(s, { type: 'skill', skillId: 'lance', targetId: 'E' }).type === 'illegal');
}
// blast: AoE magic hits every enemy within radius of the marked foe.
{
  const s = E.createBattle({ player: P('drift', { apow: 20, fluxPool: 40 }), foes: [F('continuant', { hp: 999, def: 0 }), { id: 'E2', name: 'Foe2', faction: 'continuant', combat: C({ hp: 999, def: 0 }) }], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), e1 = E.unitById(s, 'E'), e2 = E.unitById(s, 'E2');
  e1.x = u.x + 2; e1.y = u.y; e2.x = u.x + 2; e2.y = u.y + 1;   // both within radius 1 of e1, within range 4
  const h1 = e1.hp, h2 = e2.hp;
  const r = E.act(s, { type: 'skill', skillId: 'blast', targetId: 'E' });
  ok('blast hits multiple foes in radius', r.type === 'blast' && e1.hp < h1 && e2.hp < h2, `e1 −${h1 - e1.hp} e2 −${h2 - e2.hp}`);
}
// summon: a new allied agent joins the board + the turn order.
{
  const s = E.createBattle({ player: P('continuant', { fluxPool: 30 }), foes: [F('rindwalker')], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const before = s.units.length, ordBefore = s.order.length;
  const r = E.act(s, { type: 'skill', skillId: 'summon' });
  const drone = E.unitById(s, r.droneId);
  ok('summon adds an allied unit to board + order', r.type === 'summon' && s.units.length === before + 1 && s.order.length === ordBefore + 1 && drone.team === 'player' && drone.alive);
}
// revive: a downed ally returns at partial HP.
{
  const s = E.createBattle({ player: P('continuant', { fluxPool: 30 }), allies: [A('rindwalker')], foes: [F('drift')], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), ally = E.unitById(s, 'A'); ally.alive = false; ally.hp = 0; ally.x = u.x + 1; ally.y = u.y;
  const r = E.act(s, { type: 'skill', skillId: 'revive', targetId: 'A' });
  ok('revive restores a downed ally', r.type === 'revive' && ally.alive && ally.hp > 0, `hp ${ally.hp}`);
}
// assist: hands an ally an extra activation (a second slot in the order).
{
  const s = E.createBattle({ player: P('continuant', { fluxPool: 30 }), allies: [A('rindwalker')], foes: [F('drift')], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), ally = E.unitById(s, 'A'); ally.x = u.x + 1; ally.y = u.y;
  const ordBefore = s.order.filter((id) => id === 'A').length;
  const r = E.act(s, { type: 'skill', skillId: 'assist', targetId: 'A' });
  ok('assist gives an ally an extra turn', r.type === 'assist' && s.order.filter((id) => id === 'A').length === ordBefore + 1);
}
// agglomerate: drags nearby units toward the marked tile.
{
  const s = E.createBattle({ player: P('drift', { fluxPool: 30 }), foes: [F('continuant'), { id: 'E2', name: 'Foe2', faction: 'continuant', combat: C() }], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), ctr = E.unitById(s, 'E'), other = E.unitById(s, 'E2');
  u.x = 2; u.y = 5; ctr.x = 5; ctr.y = 5; other.x = 7; other.y = 5;   // other 2 away from centre, caster in range 4
  const r = E.act(s, { type: 'skill', skillId: 'agglomerate', targetId: 'E' });
  ok('agglomerate pulls units toward the knot', r.type === 'agglomerate' && other.x < 7, `other.x → ${other.x.toFixed(2)}`);
}
// pre-validation: an illegal target does NOT burn the action or flux.
{
  const s = E.createBattle({ player: P('drift', { fluxPool: 30 }), foes: [F('continuant')], seed: 1 });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), foe = E.unitById(s, 'E'); foe.x = u.x + 8; foe.y = u.y;   // far away
  const flux0 = u.flux;
  const r = E.act(s, { type: 'skill', skillId: 'lance', targetId: 'E' });
  ok('illegal target spends neither action nor flux', r.type === 'illegal' && !u.acted && u.flux === flux0);
}
// a 2v2 party battle terminates.
{
  const s = E.createBattle({ player: P('continuant'), allies: [A('rindwalker')], foes: [F('drift'), { id: 'E2', name: 'Foe2', faction: 'rindwalker', combat: C() }], seed: 3 });
  let g = 0; while (!s.winner && g++ < 600) E.runAiTurn(s);
  ok('2v2 party battle terminates', !!s.winner, s.winner || 'none');
}

// ── 4c. terrain: line-of-sight, walls, hazards ──────────────────────────────────────────────────
// LoS: a wall on the line between caster and foe blocks a ranged lance; a clear line allows it.
{
  const blocked = E.createBattle({ player: P('drift', { apow: 20, fluxPool: 30 }), foes: [F('continuant', { hp: 999, def: 0 })], seed: 1, terrain: [{ kind: 'wall', x: 8, y: 8, r: 1.3 }] });
  while (E.active(blocked).id !== 'P') E.endTurn(blocked);
  const u = E.active(blocked), foe = E.unitById(blocked, 'E'); u.x = 8; u.y = 10; foe.x = 8; foe.y = 6;   // wall sits between
  ok('hasLoS false through a wall', !E.hasLoS(blocked, { x: 8, y: 10 }, { x: 8, y: 6 }));
  ok('LoS-blocked lance is illegal', E.act(blocked, { type: 'skill', skillId: 'lance', targetId: 'E' }).type === 'illegal');

  const clear = E.createBattle({ player: P('drift', { apow: 20, fluxPool: 30 }), foes: [F('continuant', { hp: 999, def: 0 })], seed: 1, terrain: [{ kind: 'wall', x: 3, y: 3, r: 1.3 }] });
  while (E.active(clear).id !== 'P') E.endTurn(clear);
  const u2 = E.active(clear), foe2 = E.unitById(clear, 'E'); u2.x = 8; u2.y = 10; foe2.x = 8; foe2.y = 6;   // wall well off the line
  const r = E.act(clear, { type: 'skill', skillId: 'lance', targetId: 'E' });
  ok('clear-LoS lance hits', r.type === 'attack' && r.hit, `dmg ${r.dmg}`);
}
// walls block movement: a unit can't stand inside one.
{
  const s = E.createBattle({ player: P('continuant'), foes: [F('continuant')], seed: 1, terrain: [{ kind: 'wall', x: 8, y: 8, r: 1.5 }] });
  ok('cannot stand inside a wall', !E.canReach(s, E.unitById(s, 'P'), 8, 8, 99));
}
// hazard fields bite at turn start.
{
  const s = E.createBattle({ player: P('rindwalker'), foes: [F('continuant')], seed: 1, terrain: [{ kind: 'hazard', x: 8, y: 8, r: 2.5, effect: 'burn' }] });
  const u = E.unitById(s, 'P'); u.x = 8; u.y = 8; const before = u.hp;
  let g = 0; do { E.endTurn(s); } while (E.active(s).id !== 'P' && g++ < 12);   // cycle back to P's turn start, still in the field
  ok('burn hazard sears a unit at turn start', u.hp < before, `${before} → ${u.hp}`);
}
// scatterTerrain is deterministic and keeps the spawn bands clear.
{
  const a = E.scatterTerrain(5), b = E.scatterTerrain(5);
  ok('scatterTerrain deterministic', JSON.stringify(a) === JSON.stringify(b) && a.length > 0, `${a.length} features`);
  ok('scatter centres avoid spawn bands', a.every((t) => t.y >= 2.5 && t.y <= 13.5));
}

// ── 5. passives ───────────────────────────────────────────────────────────────────────────────
{
  const d = E.makeUnit({ ...P('drift'), x: 0, y: 0, team: 'player' });
  const c = E.makeUnit({ ...P('continuant'), x: 0, y: 0, team: 'player' });
  ok('drift move beats a non-mover by its moveBonus', E.moveRange(d) === E.moveRange(c) + FACTIONS.drift.passive.moveBonus, `drift ${E.moveRange(d)} vs cont ${E.moveRange(c)}`);
}
// rindwalker berserk: lower HP → more damage. Compare a full-HP gore to a near-dead gore (same seed).
function goreDmg(hpFrac, seed = 4) {
  const s = E.createBattle({ player: P('rindwalker', { crit: 0, accuracy: 1 }), foes: [F('continuant', { def: 0, hp: 9999 })], seed });
  while (E.active(s).id !== 'P') E.endTurn(s);
  const u = E.active(s), foe = E.unitById(s, 'E'); foe.x = u.x + 1; foe.y = u.y;
  u.hp = Math.max(2, Math.round(u.maxhp * hpFrac));
  return E.act(s, { type: 'skill', skillId: 'gore', targetId: 'E' }).dmg;
}
ok('rindwalker hits harder when hurt (berserk)', goreDmg(0.1) > goreDmg(1.0), `${goreDmg(1.0)} → ${goreDmg(0.1)}`);
// rindwalker regen at turn start
{
  const s = E.createBattle({ player: P('rindwalker'), foes: [F('continuant')], seed: 1 });
  const u = E.unitById(s, 'P'); u.hp = 10;
  let g = 0; while (E.active(s).id !== 'P' && g++ < 10) E.endTurn(s);  // already P's turn at t1 if fastest; force a fresh begin
  E.endTurn(s); while (E.active(s).id !== 'P' && g++ < 20) E.endTurn(s);
  ok('rindwalker regenerates between turns', u.hp > 10, `hp now ${u.hp}`);
}
// continuant braced-def: not having moved gives bonus Def (so it takes less)
{
  // assert via damage: a stationary continuant (braced-def passive) takes less than one that moved.
  function takeHit(moved) {
    const s2 = E.createBattle({ player: P('rindwalker', { crit: 0, accuracy: 1 }), foes: [F('continuant', { hp: 9999 })], seed: 6 });
    const atk = E.unitById(s2, 'P'), def = E.unitById(s2, 'E'); def.x = atk.x + 1; def.y = atk.y; def.movedThisTurn = moved;
    return E.act(s2, { type: 'skill', skillId: 'strike', targetId: 'E' }).dmg;
  }
  ok('continuant takes less while holding station', takeHit(false) < takeHit(true), `held ${takeHit(false)} vs moved ${takeHit(true)}`);
}

// ── 6. termination over many seeds + faction matchups ───────────────────────────────────────────
{
  let terminated = 0, total = 0;
  for (const pf of Object.keys(FACTIONS)) for (const ff of Object.keys(FACTIONS)) for (let seed = 1; seed <= 6; seed++) {
    total++;
    const s = E.createBattle({ player: P(pf), foes: [F(ff)], seed });
    let g = 0; while (!s.winner && g++ < 500) E.runAiTurn(s);   // runAiTurn drives whoever is active
    if (s.winner) terminated++;
  }
  ok('all faction matchups terminate (AI vs AI)', terminated === total, `${terminated}/${total}`);
}

// rolled faction-typical characters express toward their domain (sanity on FACTION_LEAN)
{
  const cont = rollCharacter(123, { triad: FACTION_LEAN.continuant });
  const rind = rollCharacter(123, { triad: FACTION_LEAN.rindwalker });
  ok('faction lean shapes the triad (continuant→chassis-heavy)', cont.triad.chassis > cont.triad.flesh && cont.triad.chassis > cont.triad.anima);
  ok('faction lean shapes the triad (rindwalker→flesh-heavy)', rind.triad.flesh > rind.triad.chassis && rind.triad.flesh > rind.triad.anima);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
