// rind/test/tree.selftest.mjs — the TECH TREE (rind/combat/tree.js) + its engine application.
// Run: node rind/test/tree.selftest.mjs   (no deps)
//
//   1. starting loadout — a fresh hero has only its T1 verbs;
//   2. buy gating       — points, prereqs, and the tier-depth gate;
//   3. exclusive branch — buying a branch node locks the opposite branch (decisions matter);
//   4. loadout fold     — owned nodes → kit + summed stat/passive mods;
//   5. engine apply     — mods.stat bumps a unit's numbers; mods.passive feeds the passive reads.

import { TREES, startingNodes, canBuy, buildLoadout, nodeById } from '../combat/tree.js';
import { FACTION_ORDER } from '../combat/factions.js';
import * as E from '../combat/engine.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

// ── 1. starting loadout ───────────────────────────────────────────────────────────────────────────
for (const f of FACTION_ORDER) {
  const lo = buildLoadout(f, startingNodes(f));
  const onlyT1 = (TREES[f] || []).filter((n) => n.tier === 1 && n.grant.verb).every((n) => lo.kit.includes(n.grant.verb));
  const noAdvanced = !lo.kit.includes('blast') && !lo.kit.includes('summon') && !lo.kit.includes('bulwark') && !lo.kit.includes('gore');
  ok(`${f}: fresh hero has only T1 verbs`, onlyT1 && noAdvanced && lo.kit.includes('strike'), lo.kit.join(','));
}

// ── 2. buy gating ────────────────────────────────────────────────────────────────────────────────
{
  const owned = new Set(startingNodes('rindwalker'));   // r.strike, r.brace
  ok('cannot buy without points', canBuy('rindwalker', owned, 0, 'r.gore') === false);
  ok('can buy a T2 with a point + prereq', canBuy('rindwalker', owned, 1, 'r.gore') === true);
  ok('cannot buy a T3 before owning a T2 (depth gate)', canBuy('rindwalker', owned, 9, 'r.bloodlust') === false, 'r.bloodlust needs a T2');
  owned.add('r.gore');
  ok('T3 buyable once a T2 is owned', canBuy('rindwalker', owned, 9, 'r.bloodlust') === true);
}

// ── 3. exclusive branches (the decision) ───────────────────────────────────────────────────────────
{
  const owned = new Set([...startingNodes('rindwalker'), 'r.gore', 'r.adrenal', 'r.bloodlust']);   // took Berserker (A)
  ok('opposite branch locks after a decision', canBuy('rindwalker', owned, 9, 'r.scavenge') === false, 'Reaver (B) locked by Berserker (A)');
  ok('same branch still open', canBuy('rindwalker', owned, 9, 'r.brutality') === true);
  ok('non-branch node (summon) stays open', canBuy('rindwalker', owned, 9, 'r.summon') === true);
}

// ── 4. loadout fold ─────────────────────────────────────────────────────────────────────────────────
{
  const lo = buildLoadout('rindwalker', ['r.strike', 'r.gore', 'r.bloodlust', 'r.brutality']);
  ok('kit collects unlocked verbs', lo.kit.includes('strike') && lo.kit.includes('gore') && !lo.kit.includes('scavenge'), lo.kit.join(','));
  ok('passive deltas sum (berserkMax)', lo.mods.passive.berserkMax === 0.2, JSON.stringify(lo.mods.passive));
  ok('stat deltas sum (atk)', lo.mods.stat.atk === 3, JSON.stringify(lo.mods.stat));
  // two passive nodes on one path stack
  const lo2 = buildLoadout('drift', ['d.strike', 'd.flit', 'd.feint', 'd.siphon', 'd.mercury', 'd.phantom']);
  ok('passive deltas stack (hitAndRunCrit)', Math.abs(lo2.mods.passive.hitAndRunCrit - 0.28) < 1e-9, JSON.stringify(lo2.mods.passive));
}

// ── 5. engine applies the mods ───────────────────────────────────────────────────────────────────
const C = (o = {}) => ({ hp: 40, atk: 10, def: 4, speed: 2, accuracy: 1, crit: 0, fluxPool: 20, apow: 10, power: 10, ...o });
{
  const base = E.makeUnit({ id: 'A', faction: 'rindwalker', combat: C(), x: 2, y: 2, team: 'player' });
  const modded = E.makeUnit({ id: 'B', faction: 'rindwalker', combat: C(), x: 2, y: 2, team: 'player', mods: { stat: { hp: 14, atk: 3 }, passive: {} } });
  ok('mods.stat bumps maxhp + atk', modded.maxhp === base.maxhp + 14 && modded.atk === base.atk + 3, `${base.atk}→${modded.atk}, hp ${base.maxhp}→${modded.maxhp}`);
}
{
  // moveBonus passive delta on a continuant (base moveBonus 0) raises its move range
  const base = E.makeUnit({ id: 'A', faction: 'continuant', combat: C(), x: 2, y: 2, team: 'player' });
  const fleet = E.makeUnit({ id: 'B', faction: 'continuant', combat: C(), x: 2, y: 2, team: 'player', mods: { stat: {}, passive: { moveBonus: 2 } } });
  ok('mods.passive feeds moveRange', E.moveRange(fleet) === E.moveRange(base) + 2, `${E.moveRange(base)} → ${E.moveRange(fleet)}`);
}
{
  // kit override from a loadout = exactly those skills (no full faction kit)
  const lo = buildLoadout('drift', startingNodes('drift'));
  const u = E.makeUnit({ id: 'A', faction: 'drift', combat: C(), x: 2, y: 2, team: 'player', kit: lo.kit });
  ok('fresh drift hero kit = T1 only (no lance/blast yet)', E.skillsFor(u).includes('strike') && !E.skillsFor(u).includes('lance') && !E.skillsFor(u).includes('blast'), E.skillsFor(u).join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
