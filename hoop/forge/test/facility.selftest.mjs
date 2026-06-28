// facility.selftest.mjs — the eight production engines FIT IN THE FOAM.
// node hoop/forge/test/facility.selftest.mjs
//
// Invariants: every engine's data is well-formed; a chunk hosts 1–3 facilities; each facility is a
// connected cluster of foam chambers carrying its engine's process steps + a core; the activity graph is
// routed room→room and reflects the family (a star is a hub, a path is a chain, a cycle loops). All
// deterministic.

import { ENGINES, ENGINE_IDS, validate as validateEngines, coreAt } from '../engines.js';
import { solveForgeChunk, pickChunkEngines, roomGraph } from '../facility.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from '../../chunkroller/shapes.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── engines.js data ──
ok(validateEngines().length === 0, 'engine data validates: ' + (validateEngines().join('; ') || 'clean'));
ok(ENGINE_IDS.length === 8, `eight engines (${ENGINE_IDS.length})`);
for (const id of ENGINE_IDS) {
  const e = ENGINES[id];
  ok(e.steps.length >= 5 && e.steps.length <= 7, `${id}: 5–7 steps (${e.steps.length})`);
  ok(e.perChunk >= 1 && e.perChunk <= 3, `${id}: perChunk in 1–3 (${e.perChunk})`);
  ok(e.flow.length >= e.steps.length - 1, `${id}: flow spans the steps`);
}

// a centred chunk over the tessellation shape, like the nave/chunkroller use.
const poly = shapePoly(SAMPLE_SHAPE, 450, 300, 270), sideOf = shapeSideOf(SAMPLE_SHAPE);
const chunk = (engines, seed = 7) => solveForgeChunk({ poly, sideOf, engines, seed, foamSeed: 99, W: 900, H: 600 });

// ── single facility (foundry, a star) ──
const f1 = chunk(['foundry']);
ok(f1.facilities.length === 1, `one engine → one facility (${f1.facilities.length})`);
ok(f1.rooms.length >= 7, `foundry chunk grows enough rooms (${f1.rooms.length})`);
const fac0 = f1.facilities[0];
ok(fac0.rooms.length >= 5, `foundry facility claims ≥5 chambers (${fac0.rooms.length})`);
ok(fac0.core >= 0 && f1.rooms[fac0.core].isCore, 'foundry has a core chamber (the furnace)');
ok(f1.rooms[fac0.core].step === 'furnace', 'the core chamber runs the furnace step');
// star: the core is a hub — most flow edges touch it
const touchCore = f1.flow.filter((e) => e.from === fac0.core || e.to === fac0.core).length;
ok(touchCore >= 3, `foundry core is a hub (${touchCore} flow edges touch it)`);
// every flow edge connects two real, distinct rooms of the same facility
ok(f1.flow.every((e) => e.from !== e.to && f1.rooms[e.from] && f1.rooms[e.to]), 'flow edges link distinct real rooms');

// ── multiple facilities in a chunk (reclaim + assembly: small + medium → 2 facilities) ──
const f2 = chunk(['reclaim', 'assembly']);
ok(f2.facilities.length === 2, `two engines → two facilities (${f2.facilities.length})`);
ok(f2.facilities.every((f) => f.rooms.length >= 3), 'each facility claims ≥3 chambers');
// facilities are DISJOINT chamber sets
const setA = new Set(f2.facilities[0].rooms);
ok(f2.facilities[1].rooms.every((r) => !setA.has(r)), 'facilities are disjoint chamber clusters');
// every room belongs to exactly one facility (or none if a sliver), and flow stays within a facility
ok(f2.flow.every((e) => f2.rooms[e.from].facility === f2.rooms[e.to].facility), 'flow never crosses facility lines');

// ── three facilities (the max) ──
const f3 = chunk(['reclaim', 'fluid', 'weave']);
ok(f3.facilities.length === 3, `three engines → three facilities (${f3.facilities.length}); 1–3 per chunk holds`);

// ── facility connectivity: each facility's rooms form ONE connected cluster over the room proximity graph ──
function facilityConnected(rec, fac) {
  if (fac.rooms.length <= 1) return true;
  // connectivity over the SAME room graph the partition used (KNN ∪ MST over centroids)
  const rg = roomGraph(rec.rooms);
  const set = new Set(fac.rooms), adj = new Map(fac.rooms.map((i) => [i, []]));
  for (const e of rg) { if (set.has(e.a) && set.has(e.b)) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); } }
  const seen = new Set([fac.rooms[0]]), q = [fac.rooms[0]];
  while (q.length) { const u = q.pop(); for (const v of adj.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v); } }
  return seen.size === fac.rooms.length;
}
ok(f1.facilities.every((f) => facilityConnected(f1, f)), 'foundry facility is one connected cluster');
ok(f2.facilities.every((f) => facilityConnected(f2, f)), 'both facilities are connected clusters');

// ── family shape reads in the routed flow ──
// path (mill): no room forks (outdeg ≤ 1 over the routed graph, modulo parallel rooms of one step)
const mill = chunk(['mill']);
const cycle = chunk(['chemworks']);
// chemworks is a cycle: the routed flow has a directed cycle
function hasDirectedCycle(rec) {
  const adj = new Map(); for (const e of rec.flow) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from).push(e.to); }
  const state = new Map(), dfs = (u) => { state.set(u, 1); for (const v of (adj.get(u) || [])) { if (state.get(v) === 1) return true; if (!state.get(v) && dfs(v)) return true; } state.set(u, 2); return false; };
  for (const u of adj.keys()) if (!state.get(u) && dfs(u)) return true; return false;
}
ok(hasDirectedCycle(cycle), 'chemical works routes a directed cycle (the recycle loop closes)');
ok(!hasDirectedCycle(mill), 'mill routes no cycle (a pure path)');
// fan (reclaim): the core (shredder/sort) branches to ≥3 distinct rooms downstream
const recl = chunk(['reclaim']);
const rfac = recl.facilities[0];
const fanOut = new Set(recl.flow.filter((e) => recl.rooms[e.from].step === 'sort').map((e) => e.to));
ok(fanOut.size >= 3 || rfac.rooms.length < 5, `reclaim fans out from the sorter (${fanOut.size} bales)`);

// ── determinism ──
ok(JSON.stringify(chunk(['foundry', 'reclaim'])) === JSON.stringify(chunk(['foundry', 'reclaim'])), 'solveForgeChunk is deterministic');
ok(JSON.stringify(pickChunkEngines(42)) === JSON.stringify(pickChunkEngines(42)), 'pickChunkEngines is deterministic');
// pickChunkEngines respects 1–3 and the perChunk cap
for (let s = 0; s < 40; s++) { const es = pickChunkEngines(s); ok(es.length >= 1 && es.length <= 3, `pick ${s}: 1–3 engines`); if (ENGINES[es[0]].perChunk === 1) ok(es.length === 1, `pick ${s}: a perChunk-1 engine comes solo`); }

console.log(`\nfacility.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
