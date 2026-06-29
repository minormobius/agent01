// decks.selftest.mjs — certify the two-deck voronoi layout + the material flow.
//   Run: node rind/ops/test/decks.selftest.mjs

import { buildFoam, graphVoronoi, pathCells, nearestCell } from '../foam.js';
import { ENGINES, ENGINE_RING, supplyChain } from '../engines.js';
import { buildDecks, flowEdges } from '../layout.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// ── foam substrate ──────────────────────────────────────────────────────────────────────────────────────
const f = buildFoam(1, { cols: 22, rows: 15 });
ok(f.cells.length === 22 * 15, 'foam has one cell per grid site');
ok(f.cells.every((c) => c.poly.length >= 3), 'every cell is a real polygon');
const totA = f.cells.reduce((s, c) => s + c.area, 0);
ok(Math.abs(totA - f.W * f.H) / (f.W * f.H) < 0.02, 'cells tile the whole region (area conserved)');
const avgN = f.cells.reduce((s, c) => s + c.neighbors.length, 0) / f.cells.length;
ok(avgN > 4 && avgN < 7, `Voronoi-grade adjacency (avg degree ${avgN.toFixed(2)} ≈ 6, not over-connected)`);
let asym = 0; for (const c of f.cells) for (const j of c.neighbors) if (!f.cells[j].neighbors.includes(c.i)) asym++;
ok(asym === 0, 'adjacency symmetric');
// fully connected
const seen = new Set([0]), q = [0]; for (let h = 0; h < q.length; h++) for (const v of f.cells[q[h]].neighbors) if (!seen.has(v)) { seen.add(v); q.push(v); }
ok(seen.size === f.cells.length, 'foam is one connected component');

// ── engine data + supply chain closure ──────────────────────────────────────────────────────────────────
ok(ENGINE_RING.length === 8, '8 production engines');
const sc = supplyChain();
ok(sc.length >= 12, `supply chain has ${sc.length} commodity edges`);
// every refiner is fed and assembly converges; reclaim feeds raw; the loop closes back to reclaim
const feeds = (to) => sc.filter((e) => e.to === to).map((e) => e.from);
ok(feeds('foundry').includes('reclaim') && feeds('foundry').includes('fluid'), 'foundry fed by reclaim (scrap) + fluid (coolant)');
ok(['stock', 'polymer', 'circuit', 'cloth'].every((cm) => sc.some((e) => e.to === 'assembly' && e.commodity === cm)), 'assembly converges stock+polymer+circuit+cloth');
ok(sc.some((e) => e.to === 'reclaim'), 'the loop returns to reclaim (closed)');

// ── the two decks ───────────────────────────────────────────────────────────────────────────────────────
const d = buildDecks(3);
ok(d.engines.length === 8, '8 engine regions on the production deck');
ok(d.offices.length === 6, '6 office regions on the mezzanine');
// every cell of each deck is owned by exactly one region (graph-Voronoi partition, contiguous)
ok(d.ownerP.every((x) => x >= 0) && d.ownerO.every((x) => x >= 0), 'every chamber assigned to a region (no orphans)');
for (const e of d.engines) {
  ok(e.region.length >= 3, `engine ${e.id} owns a real cluster of chambers (${e.region.length})`);
  ok(e.steps.length === ENGINES[e.id].steps.length, `engine ${e.id} planted all ${e.steps.length} steps`);
  ok(new Set(e.steps.map((s) => s.cell)).size === e.steps.length, `engine ${e.id} steps on distinct chambers`);
  ok(e.steps.every((s) => e.region.includes(s.cell)), `engine ${e.id} steps lie inside its region`);
  ok(e.steps.some((s) => s.isCore), `engine ${e.id} has its core machine`);
  // intra-engine flow routes stay inside the region and connect the right steps
  ok(e.flow.length === ENGINES[e.id].flow.length, `engine ${e.id} routed all its activity edges`);
  ok(e.flow.every((fl) => fl.path.length >= 2), `engine ${e.id} flow edges are real paths`);
}

// ── the inter-engine material flow is routed across the floor ───────────────────────────────────────────
ok(d.supply.length === sc.length, 'every supply edge routed across the production floor');
ok(d.supply.every((s) => s.path.length >= 2), 'supply routes are real cell paths');
const fe = flowEdges(d);
ok(fe.intra.length > 20 && fe.inter.length >= 12, `material flow: ${fe.intra.length} activity + ${fe.inter.length} supply edges`);

// ── the weave is intact across the layout ───────────────────────────────────────────────────────────────
ok(d.contact.everyTouchesEvery, 'K(6,8) holds: every office touches every engine');
ok(d.links.length === 48, '48 office×engine weave links');
ok(d.tours.length === 6 && d.tours.every((t) => t.stops.length === 8), 'each office has an 8-stop tour');

// ── determinism ──────────────────────────────────────────────────────────────────────────────────────────
const A = JSON.stringify(buildDecks(9).engines.map((e) => e.region.length));
const B = JSON.stringify(buildDecks(9).engines.map((e) => e.region.length));
ok(A === B, 'deterministic from seed');

console.log(`decks.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
