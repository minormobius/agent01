// run.selftest.mjs — THE TRAINING RUN kernel (arena/run.js): the roguelike gauntlet behind the trainer
// fixture. Pins the loop (start → escalating certified packs → win banks points+loot & advances / loss
// ends), the tree-buy economy, the reward-seed bank, and the PERSISTENCE HOOK (inject a saved build).
//   node hoop/v105/test/run.selftest.mjs

import { newRun, loadoutOf, stageFoes, resolveStage, buyNode, treeView, earnFor, finishRun, POINTS_START, MAX_STAGE } from '../arena/run.js';
import { startingNodes, TREES } from '../arena/tree.js';
import { creepPack, certifyPack } from '../arena/encounter.js';
import { rollCharacter, deriveCombat } from '../stats.js';
import { UNIVERSAL } from '../arena/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// a geared player spec that fights with the run's tree loadout (kit + mods), the shape certifyPack wants.
function playerFor(run, seed = 7) {
  const c = rollCharacter(seed, { vocation: 'make' });
  const combat = deriveCombat(c, {});
  const lo = loadoutOf(run);   // the game applies the tree ADDITIVELY over the universal kit (buildPlayerUnit)
  return { id: 0, name: c.name, character: c, combat, faction: run.faction, kit: [...new Set([...UNIVERSAL, ...lo.kit])], mods: lo.mods };
}
const inject = { packFor: creepPack, certify: certifyPack };

// ── 1. a fresh run starts minimal: tier-1 nodes owned, the starting point pool, stage/streak 0, live ──
{
  const run = newRun('continuant', { seed: 42 });
  ok(run.stage === 0 && run.streak === 0 && !run.over, 'fresh run at stage 0, not over');
  ok(run.points === POINTS_START, 'fresh run has the starting point pool');
  ok(run.owned.join() === startingNodes('continuant').join(), 'fresh run owns exactly the tier-1 nodes');
  const lo = loadoutOf(run);
  ok(lo.kit.includes('strike') && lo.kit.includes('brace'), 'starting loadout is the tier-1 kit');
}

// ── 2. earnFor: streak + stage compound (a clean run pays for deep nodes) ──
ok(earnFor(0, 1) >= 1, 'first clear pays at least 1');
ok(earnFor(9, 5) > earnFor(0, 1), 'deeper stage + longer streak pays more');

// ── 3. the ladder escalates: deck depth ramps with the stage, packs are 1..3, deterministic from seed ──
{
  const run = newRun('drift', { seed: 5 });
  const p = playerFor(run);
  const decks = [];
  for (let s = 0; s < 8; s++) { run.stage = s; const { foes, deck } = stageFoes(run, p, inject); decks.push(deck);
    ok(foes.length >= 1 && foes.length <= 3, `stage ${s}: 1..3 certified foes`);
    ok(foes.every((f) => f.combat && f.combat.hp > 0), `stage ${s}: foes carry a combat block`); }
  ok(decks[0] <= decks[7] && decks[7] > decks[0], 'deck depth ramps up the ladder');
  // determinism: same run seed → identical foe seed at the same stage
  const r2 = newRun('drift', { seed: 5 }); r2.stage = 3;
  const a = stageFoes(r2, playerFor(r2), inject), b = (() => { const rr = newRun('drift', { seed: 5 }); rr.stage = 3; return stageFoes(rr, playerFor(rr), inject); })();
  ok(a.seed === b.seed, 'stage foe seed is deterministic from (runSeed, stage)');
}

// ── 4. a WIN banks streak-scaled points + a reward SEED and advances the stage ──
{
  const run = newRun('rindwalker', { seed: 9 });
  const p0 = run.points;
  const r = resolveStage(run, true, 0xABCDEF);
  ok(run.stage === 1 && run.streak === 1, 'win advances stage + streak');
  ok(run.points > p0 && r.points >= 1, 'win banks points');
  ok(run.rewards.length === 1 && run.rewards[0] === (0xABCDEF >>> 0), 'win banks the reward item seed');
  // ── 5. a LOSS ends the run and resets the streak ──
  const r2 = resolveStage(run, false, 123);
  ok(run.over && run.streak === 0 && r2.over, 'loss ends the run, streak reset');
  ok(!buyNode(run, TREES.rindwalker[2].id), 'no buying once the run is over');
  ok(resolveStage(run, true, 1).over, 'resolving an over run is a no-op (stays over)');
}

// ── 6. clearing the top rung crowns the run (cleared + over) ──
{
  const run = newRun('continuant', { seed: 3 });
  run.stage = MAX_STAGE - 1;
  const r = resolveStage(run, true, 77);
  ok(run.over && run.cleared && r.cleared, 'clearing the final stage sets cleared + over');
}

// ── 7. the BUY economy: points buy a reachable tier-2 node, spend the cost, and unlock it in the loadout ──
{
  const run = newRun('drift', { seed: 11 });
  run.points = 5;
  const start = new Set(run.owned);
  const t2 = TREES.drift.find((n) => n.tier === 2 && n.req.every((r) => start.has(r)) && n.grant.verb);
  ok(t2, 'found a reachable tier-2 verb node');
  const before = run.points;
  ok(buyNode(run, t2.id), 'bought the tier-2 node');
  ok(run.points === before - t2.cost, 'buying spent the node cost');
  ok(loadoutOf(run).kit.includes(t2.grant.verb), 'the bought verb is now in the loadout kit');
  ok(!buyNode(run, t2.id), 'can’t buy a node twice');
  // a broke run can't buy
  const poor = newRun('drift', { seed: 1 }); poor.points = 0;
  const any2 = TREES.drift.find((n) => n.tier === 2);
  ok(!buyNode(poor, any2.id), 'no points → no buy');
}

// ── 8. treeView tags every node owned / buyable / locked and reflects the point pool ──
{
  const run = newRun('continuant', { seed: 2 });
  const v = treeView(run);
  ok(v.points === run.points && v.nodes.length === TREES.continuant.length, 'treeView carries points + all nodes');
  ok(v.nodes.filter((n) => n.state === 'owned').length === run.owned.length, 'owned tally matches');
  ok(v.nodes.some((n) => n.state === 'buyable') && v.nodes.some((n) => n.state === 'locked'), 'has buyable + locked nodes');
  ok(v.nodes.every((n) => n.tier >= (v.nodes[0].tier)), 'nodes are tier-ordered (shallowest first)');
}

// ── 9. THE PERSISTENCE HOOK: newRun accepts an injected build (owned + points) — the seam that flips
//    roguelike → persistent. A saved deeper build starts mid-tree with its saved points. ──
{
  const deep = [...startingNodes('rindwalker'), TREES.rindwalker.find((n) => n.tier === 2).id];
  const run = newRun('rindwalker', { seed: 8, owned: deep, points: 6 });
  ok(run.owned.length === deep.length && run.owned.includes(deep[deep.length - 1]), 'injected owned build is honored');
  ok(run.points === 6, 'injected point pool is honored');
  ok(run.owned !== deep, 'injected owned is copied, not aliased');
}

// ── 10. finishRun surfaces the banked loot + the build (for loot persistence + the persistence hook) ──
{
  const run = newRun('drift', { seed: 4 });
  resolveStage(run, true, 100); resolveStage(run, true, 200);
  const fin = finishRun(run);
  ok(fin.rewards.join() === '100,200', 'finishRun surfaces all banked reward seeds');
  ok(Array.isArray(fin.owned) && typeof fin.points === 'number' && typeof fin.cleared === 'boolean', 'finishRun surfaces build + points + cleared');
}

console.log(`\nrun.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
