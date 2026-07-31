// swarm.selftest.mjs — THE DISTRIBUTED BODY. A swarm is a cloud, not a point: single-target blows are
// RESISTED (a sword catches only a few bees), area magic (Blast) hits the whole cloud (BONUS), the cloud
// SHRINKS as it dies (its sting reach tracks HP), and its turn is an AREA STING on everyone standing in
// it. Pins that swords feel wrong / blasts feel right, that it's resist-not-immunity (still killable +
// solver-certifiable), and the area sting + shrink.  node hoop/v106/test/swarm.selftest.mjs

import { createBattle, act, active, endTurn, runAiTurn, swarmReach, SWARM_POINT_RESIST, SWARM_AREA_BONUS } from '../arena/engine.js';
import { creepFor, creepPack, certifyPack } from '../arena/encounter.js';
import { rollCharacter, deriveCombat } from '../stats.js';
import { autoEquip, defaultPlan } from '../bodyplan.js';
import { packForCharacter } from '../pack.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// hit an identical target (solid vs swarm body) with a skill in det mode; return the damage dealt.
function damageWith(skillId, body, { faction = null, kit = null } = {}) {
  const atk = { id: 1, name: 'A', team: 'player', faction, kit,
    combat: { hp: 40, atk: 20, def: 2, speed: 2, accuracy: 1, crit: 0, fluxPool: 30, apow: 20, power: 20 }, x: 3, y: 3 };
  const tgt = { id: 2, name: 'T', team: 'foe',
    combat: { hp: 300, atk: 5, def: 2, speed: 1, accuracy: 1, crit: 0, fluxPool: 0, apow: 0, power: 5 }, x: 3.9, y: 3, body, footprint: 1.9 };
  const s = createBattle({ player: atk, foes: [tgt], seed: 1, det: true, W: 8, H: 6 });
  const t = s.units.find((u) => u.id === 2); const before = t.hp;
  act(s, { type: 'skill', skillId, targetId: 2 });
  return before - t.hp;
}

// ── 1. SINGLE-TARGET RESIST: a point blow (strike) does ~half to a swarm what it does to a solid body ──
{
  const solid = damageWith('strike', 'solid'), swarm = damageWith('strike', 'swarm');
  ok(solid > 0 && swarm > 0, 'strike lands on both bodies (resist, not immunity — the swarm can still be chipped)');
  ok(Math.abs(swarm / solid - SWARM_POINT_RESIST) < 0.12, `strike vs swarm ≈ ×${SWARM_POINT_RESIST} of solid (got ${(swarm / solid).toFixed(2)})`);
}

// ── 2. AREA BONUS: Blast (area magic) hits the whole cloud — MORE than vs a solid body, and far more than
//    a poke does to the swarm. This is what makes AoE the clean answer and the sword feel wrong. ──
{
  const opt = { faction: 'drift', kit: ['strike', 'blast'] };
  const blastSolid = damageWith('blast', 'solid', opt), blastSwarm = damageWith('blast', 'swarm', opt);
  const strikeSwarm = damageWith('strike', 'swarm');
  ok(blastSwarm > blastSolid, `blast vs swarm (${blastSwarm}) > vs solid (${blastSolid}) — area engulfs the cloud`);
  ok(Math.abs(blastSwarm / blastSolid - SWARM_AREA_BONUS) < 0.12, `blast vs swarm ≈ ×${SWARM_AREA_BONUS} of solid`);
  ok(blastSwarm > strikeSwarm * 2, `blast (${blastSwarm}) is the answer — >2× a poke (${strikeSwarm}) vs the swarm`);
}

// ── 3. SHRINKING CLOUD: the sting reach tracks HP — a fuller cloud reaches wider, a dying one barely stings ──
{
  const full = swarmReach({ hp: 100, maxhp: 100, footprint: 1.9 });
  const half = swarmReach({ hp: 50, maxhp: 100, footprint: 1.9 });
  const dying = swarmReach({ hp: 8, maxhp: 100, footprint: 1.9 });
  ok(full > half && half > dying, `reach shrinks with HP: ${full.toFixed(2)} > ${half.toFixed(2)} > ${dying.toFixed(2)}`);
  ok(full > 1.7 && dying < 1.1, 'a full cloud reaches ~footprint; a dying one is a small huddle');
}

// ── 4. AREA STING: a flux-starved swarm (can't blast/lance) stings EVERY foe in the cloud, not one poke ──
{
  let sw = null; for (let c = 0; c < 200 && !sw; c++) for (let r = 0; r < 40; r++) { const cr = creepFor(9, c, r, 1); if (cr.plan === 'swarm') { sw = cr; break; } }
  ok(sw && sw.body === 'swarm', 'a rolled swarm creep carries body:swarm (the distributed-body tag)');
  sw.id = 1; sw.combat = { ...sw.combat, hp: 60 };
  const pc = rollCharacter(3, {}), player = { id: 0, name: 'H', faction: 'rindwalker', character: pc, combat: deriveCombat(pc), sprite: { seed: 'p', role: 'm' } };
  const ally = { id: 2, name: 'Drone', faction: null, combat: { hp: 30, atk: 6, def: 2, speed: 1, accuracy: 0.9, crit: 0, fluxPool: 0, apow: 0, power: 6 }, sprite: { seed: 'd', role: 'm' } };
  const S = createBattle({ player, allies: [ally], foes: [sw], seed: 5, W: 14, H: 10 });
  const p = S.units.find((u) => u.id === 0), a = S.units.find((u) => u.id === 2), s = S.units.find((u) => u.id === 1);
  p.x = 7; p.y = 5; a.x = 7.6; a.y = 5.3; s.x = 7.2; s.y = 6.0; s.flux = 0;   // clustered + swarm broke (no blast) → it must sting
  while (active(S).id !== 1 && !S.winner) endTurn(S);
  const b = { p: p.hp, a: a.hp }; runAiTurn(S);
  ok(p.hp < b.p && a.hp < b.a, 'a broke swarm STINGS the whole cluster — both the player and the ally take damage in one turn');
}

// ── 5. SOLVER SAFETY: swarm packs stay winnable-not-impossible for a geared hero (resist ≠ a hard wall),
//    and the distributed-body tag survives the certify scaler. ──
{
  const pc = rollCharacter(7, { vocation: 'make' });
  const eq = autoEquip(defaultPlan(), packForCharacter(pc, 7));
  const player = { id: 0, name: 'Hero', faction: 'rindwalker', character: pc, combat: deriveCombat(pc, { weapon: eq.mainhand, armour: eq.body || eq.offhand }) };
  // find a room whose pack contains a swarm, certify it
  let checked = 0, impossible = 0, sawSwarm = false;
  for (let r = 0; r < 40 && checked < 8; r++) {
    const pack = creepPack(9, 3, r, 1);
    if (!pack.some((f) => f.body === 'swarm')) continue;
    sawSwarm = true; checked++;
    const cert = certifyPack(player, pack, { seed: 100 + r });
    if (cert.tier === 'impossible') impossible++;
    ok((cert.foes || pack).some((f) => f.body === 'swarm'), 'the swarm body tag survives certify scaling');
  }
  ok(sawSwarm, 'found swarm-bearing packs to certify');
  ok(impossible === 0, `no swarm pack certified impossible (${impossible}/${checked}) — resist is a slog, not a wall`);
}

console.log(`\nswarm.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
