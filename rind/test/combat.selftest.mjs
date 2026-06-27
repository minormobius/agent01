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
    // simple scripted player: move toward foe, strike, end
    const foe = E.enemiesOf(s, u)[0];
    const lg = E.legal(s);
    if (lg.move.length && Math.max(Math.abs(u.x - foe.x), Math.abs(u.y - foe.y)) > 1) {
      let best = lg.move[0], bd = 99;
      for (const t of lg.move) { const d = Math.max(Math.abs(t.x - foe.x), Math.abs(t.y - foe.y)); if (d < bd) { bd = d; best = t; } }
      E.act(s, { type: 'move', x: best.x, y: best.y });
    }
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
