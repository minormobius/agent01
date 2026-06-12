// flux.selftest.mjs — pins the desire-line road grower (hoop/paint/flux.js): roads as the superlevel
// set of the NPC traffic field. Run: node hoop/test/flux.selftest.mjs
import { buildScene } from '../paint/voronoi.js';
import { buildAttractors, tripDemand, growNetwork, growRoads, classifyPaint } from '../paint/flux.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const scene = buildScene({ W: 1100, H: 760, wallSpacing: 8, roomSpacing: 22, roomSize: 70, loops: 0, seed: 4 });
const n = scene.roomSeeds.length;

// ── attractors + demand are well-formed ──
{
  const a = buildAttractors(scene, { seed: 4 });
  ok(a.program.length === n, 'every room gets a programme');
  ok(a.program.filter((p) => p === 'dwell').length > n * 0.4, 'dwellings dominate the programme');
  const d = tripDemand(scene, a, { seed: 4 });
  ok(d.length > 0 && d.every((t) => t.a < n && t.b < n && t.w > 0), 'trip demand references real rooms with positive weight');
  ok(d.every((t) => a.program[t.a] === 'dwell'), 'every trip originates at a home');
}

// ── the field + network ──
const { attractors, demand, model, paintClass } = growRoads(scene, { seed: 4 });
{
  ok(model.traffic.length === n && model.traffic.every((t) => t >= 0), 'the traffic field is non-negative over all rooms');
  ok(model.stats.peakConcentration > 1.5, 'the field concentrates (the Laplace transform is not flat: peak/mean ' + model.stats.peakConcentration.toFixed(1) + ')');
  ok(model.stats.roadRooms > 0 && model.stats.roadRooms < n, 'roads are a proper superlevel set (some rooms, not all)');

  // the road network is ONE connected component (the connectivity guarantee)
  const adj = Array.from({ length: n }, () => []);
  for (const e of scene.adjEdges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  let start = -1; for (let i = 0; i < n; i++) if (model.isRoad[i]) { start = i; break; }
  const seen = new Set([start]), q = [start];
  while (q.length) { const u = q.pop(); for (const v of adj[u]) if (model.isRoad[v] && !seen.has(v)) { seen.add(v); q.push(v); } }
  ok(seen.size === model.stats.roadRooms, 'the road network is a single connected component');

  // FRONTAGE + ONE DOOR PER BUILDING (the "one road entrance per floor" rule, 2D = per building)
  let frontage = true, doorCount = 0;
  for (let b = 0; b < n; b++) {
    if (model.isRoad[b]) continue;
    if (!adj[b].some((v) => model.isRoad[v])) frontage = false;
    if (model.doorEdge[b] >= 0) {
      doorCount++;
      const e = scene.adjEdges[model.doorEdge[b]];
      const other = e.a === b ? e.b : e.a;
      if (!model.isRoad[other]) frontage = false;       // the door must open onto a road
    }
  }
  ok(frontage, 'every building fronts a road (frontage guarantee)');
  ok(doorCount === model.stats.buildings && model.stats.doored === model.stats.buildings, 'exactly one door per building, opening onto the road');

  // road edges only ever join two road rooms (open walls), and tiers only live on road edges
  let edgeOK = true; for (let i = 0; i < scene.adjEdges.length; i++) { const e = scene.adjEdges[i]; if (model.roadEdge[i] && !(model.isRoad[e.a] && model.isRoad[e.b])) edgeOK = false; if (!model.roadEdge[i] && model.tier[i] !== 0) edgeOK = false; }
  ok(edgeOK, 'road edges connect two road rooms; tiers only on road edges');
  ok([...model.tier].some((t) => t === 3) && [...model.tier].some((t) => t === 1), 'the network has a hierarchy (arterials AND footpaths)');
}

// ── μ is the grid↔tree dial (the "do I have enough roads" knob) ──
{
  const lo = growNetwork(scene, demand, { mu: 0.5, seed: 4 });
  const hi = growNetwork(scene, demand, { mu: 2.0, seed: 4 });
  ok(lo.stats.roadEdgeCount >= hi.stats.roadEdgeCount, 'sublinear μ keeps more parallel streets than superlinear μ (' + lo.stats.roadEdgeCount + ' ≥ ' + hi.stats.roadEdgeCount + ')');
}

// ── PAINT CLASSIFICATION: zero walls between road rooms ("for the shot") ──
{
  const h = [0, 0, 0, 0, 0]; for (const c of paintClass) h[c]++;
  ok(paintClass.length === scene.paintCells.length, 'one class per paint cell');
  ok(h[1] > 0, 'there are open road-floor cells (the concourse)');
  ok(h[4] > 0, 'walls between two road rooms are OPENED (zero walls for the shot)');
  // every opened-wall cell genuinely sits between two road rooms
  const cls = classifyPaint(scene, model, {});
  let openOK = true;
  for (let i = 0; i < scene.paintCells.length; i++) if (cls[i] === 4 && scene.paintCells[i].room != null) openOK = false; // opened cells are wall cells (no room)
  ok(openOK, 'opened cells are former wall cells, not building interiors');
}

// ── determinism (the generated-ethos contract) ──
{
  const a = growRoads(scene, { seed: 4 }), b = growRoads(scene, { seed: 4 });
  ok(a.model.stats.roadRooms === b.model.stats.roadRooms && a.model.stats.roadEdgeCount === b.model.stats.roadEdgeCount, 'growRoads is deterministic for a seed');
  let same = true; for (let i = 0; i < n; i++) if (a.model.isRoad[i] !== b.model.isRoad[i]) same = false;
  ok(same, 'the same seed grows the identical road network');
  const c = growRoads(scene, { seed: 5 });
  ok(c.model.stats.roadRooms !== a.model.stats.roadRooms || c.model.stats.roadEdgeCount !== a.model.stats.roadEdgeCount, 'a different seed grows a different network');
}

console.log(`flux.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
