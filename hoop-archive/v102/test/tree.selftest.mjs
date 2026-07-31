// tree.selftest.mjs — the vendored TECH TREE (arena/tree.js, re-synced from rind/combat/tree.js). Pins
// the gates that make the training run a real progression: tier-depth gating, point costs, req chains,
// T3/T5 branch exclusivity, and that buildLoadout folds owned nodes into an engine-applicable { kit, mods }
// whose every verb is a live engine SKILL.  node hoop/v102/test/tree.selftest.mjs

import { TREES, nodeById, startingNodes, canBuy, buildLoadout } from '../arena/tree.js';
import { SKILLS } from '../arena/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const FACTIONS = ['continuant', 'drift', 'rindwalker'];

// ── 1. the three factions the v100 player can be all have trees ──
ok(FACTIONS.every((f) => Array.isArray(TREES[f]) && TREES[f].length), 'every player faction has a tree');

for (const f of FACTIONS) {
  const start = startingNodes(f);
  // ── 2. every run starts with the tier-1 nodes, and those cost 0 ──
  ok(start.length >= 2 && start.every((id) => nodeById(f, id).tier === 1), `${f}: startingNodes are tier-1`);
  ok(start.every((id) => nodeById(f, id).cost === 0), `${f}: tier-1 nodes are free`);

  // ── 3. every granted verb is a real engine skill (catches tree/engine drift on re-sync) ──
  for (const n of TREES[f]) if (n.grant.verb) ok(SKILLS[n.grant.verb], `${f}: verb '${n.grant.verb}' is a live SKILL`);

  // ── 4. tier-depth gate: a tier-3 node can't be bought from a fresh (tier-1-only) start, even with points ──
  const t3 = TREES[f].find((n) => n.tier === 3);
  ok(!canBuy(f, start, 99, t3.id), `${f}: tier-3 '${t3.id}' is gated behind a tier-2 node`);

  // ── 5. req chain + points: buying a tier-2 whose req is a starting node works only with enough points ──
  const t2 = TREES[f].find((n) => n.tier === 2 && n.req.every((r) => start.includes(r)));
  ok(t2, `${f}: has a tier-2 reachable from start`);
  ok(!canBuy(f, start, 0, t2.id), `${f}: tier-2 '${t2.id}' needs points`);
  ok(canBuy(f, start, t2.cost, t2.id), `${f}: tier-2 '${t2.id}' buyable with its cost in points`);

  // ── 6. buildLoadout folds owned → { kit, mods:{stat,passive} }, always armed ──
  const lo = buildLoadout(f, start);
  ok(Array.isArray(lo.kit) && lo.kit.includes('strike'), `${f}: loadout kit is armed (has strike)`);
  ok(lo.mods && lo.mods.stat && lo.mods.passive, `${f}: loadout has stat + passive mod bags`);
  // a stat node actually lands in mods.stat
  const statNode = TREES[f].find((n) => n.grant.stat);
  if (statNode) {
    const withStat = buildLoadout(f, [...start, statNode.id]);
    const key = Object.keys(statNode.grant.stat)[0];
    ok((withStat.mods.stat[key] || 0) >= statNode.grant.stat[key], `${f}: owning '${statNode.id}' adds ${key} to mods.stat`);
  }
}

// ── 7. T3/T5 BRANCH EXCLUSIVITY: once you own a branch-A node, a branch-B node of the same tree is locked ──
for (const f of FACTIONS) {
  const a = TREES[f].find((n) => n.branch === 'A');
  const b = TREES[f].find((n) => n.branch === 'B');
  ok(a && b, `${f}: has both branches`);
  // construct an owned set that satisfies b's reqs + depth but also holds a branch-A node → b must be locked
  const owned = new Set(startingNodes(f));
  // walk b's req chain into owned (except the branch commitment itself), then add the A node
  const addReqs = (id) => { const n = nodeById(f, id); for (const r of n.req) { addReqs(r); owned.add(r); } };
  addReqs(b.id);
  owned.add(a.id);
  ok(!canBuy(f, owned, 99, b.id), `${f}: committing to branch A locks branch B '${b.id}'`);
}

console.log(`\ntree.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
