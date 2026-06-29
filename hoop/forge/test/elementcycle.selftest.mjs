// elementcycle.selftest.mjs — the per-element CLOSED CYCLE (the looping-Sankey data).
//   node hoop/forge/test/elementcycle.selftest.mjs
// Pins: every element's cycle LOOPS BACK (returns to its source pool, in≈out), references only real nodes,
// carries finite values, and uses the right shape (carbon = the biome+forge grand loop with the pump).

import { elementCycle, unifiedLedger } from '../ledger.js';
import { ELEMENTS } from '../catalogue.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const u = unifiedLedger({ people: 1000, growFactor: 3, biomeDays: 120 });

for (const e of ELEMENTS) {
  const c = elementCycle(e.sym, { u });
  const ids = new Set(c.nodes.map((n) => n.id));
  ok(c.nodes.length >= 5 && c.links.length >= c.nodes.length - 1, `${e.sym}: a non-trivial cycle (${c.nodes.length} nodes, ${c.links.length} links)`);
  ok(c.links.every((l) => ids.has(l.from) && ids.has(l.to)), `${e.sym}: every link references real nodes`);
  ok(c.links.every((l) => isFinite(l.value) && l.value >= 0), `${e.sym}: all link values finite + non-negative`);
  // LOOPS BACK: the source pool (node 0) has both outflow and inflow, balanced (a closed cycle)
  const pool = c.nodes[0].id;
  const out = c.links.filter((l) => l.from === pool).reduce((a, l) => a + l.value, 0);
  const back = c.links.filter((l) => l.to === pool).reduce((a, l) => a + l.value, 0);
  ok(out > 0 && back > 0, `${e.sym}: the pool both emits and receives — it loops back`);
  ok(Math.abs(out - back) < Math.max(1, out * 0.001), `${e.sym}: the loop balances (out ${out.toFixed(1)} ≈ in ${back.toFixed(1)})`);
}

// carbon is the grand loop: biome + forge nodes both present, with the pump
const C = elementCycle('C', { u });
ok(C.nodes.some((n) => n.kind === 'biome') && C.nodes.some((n) => n.kind === 'forge') && C.nodes.some((n) => n.kind === 'pump'), 'carbon spans biome + forge and has the pump (locked structure)');
ok(C.links.some((l) => l.kind === 'pump' && l.value > 0), 'carbon has a live pump flow');
// iron is a pure industrial ring (no biome nodes)
const Fe = elementCycle('Fe', { u });
ok(!Fe.nodes.some((n) => n.kind === 'biome'), 'iron is a pure industrial ring — no biome nodes');
ok(Fe.links.some((l) => l.kind === 'recycle') && Fe.links.some((l) => l.kind === 'makeup'), 'iron recycles, with a small reserve makeup');

console.log(`\nelementcycle.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
