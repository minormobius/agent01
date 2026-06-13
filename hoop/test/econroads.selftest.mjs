// econroads.selftest.mjs — pins desire-line roads grown from the REAL econ society
// (hoop/econ/roads.js over hoop/paint/flux.js's steppable kernel).
// Run: node hoop/test/econroads.selftest.mjs
import { buildWorld, buildSociety } from '../econ/econ.js';
import { doorCells, buildTripDemand, createRoadGrower, finalizeRoads } from '../econ/roads.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const world = buildWorld({ W: 1000, H: 700, cells: 4500, seed: 5 });
const society = buildSociety(world, { seed: 5 });

// ── demand comes from the lived society ──
{
  const door = doorCells(world);
  ok(world.places.every((p) => p.cells.includes(door[p.id])), 'every building has a door cell among its own clump');
  const { trips } = buildTripDemand(world, society);
  ok(trips.length > 100, 'the society generates real trip demand (' + trips.length + ' aggregated desire lines)');
  ok(trips.every((t) => t.a !== t.b && t.a >= 0 && t.b >= 0 && t.a < world.sites.length && t.b < world.sites.length && t.w > 0), 'every trip joins two distinct real cells with positive weight');
  // hats and supply both contribute: turning off supply changes the demand
  const noSupply = buildTripDemand(world, society, { wSupply: 0 });
  const sum = (ts) => ts.reduce((s, t) => s + t.w, 0);
  ok(sum(trips) > sum(noSupply.trips), 'supply freight adds demand on top of the social trips');
}

// ── the grower steps, deterministically, and the field concentrates as it sharpens ──
const ITERS = 12;
const rg = createRoadGrower(world, society);
{
  const early = rg.step();
  ok(early.iter === 1 && rg.iter === 1, 'step() advances one reinforcement round');
  let f1 = 0, n1 = 0; for (const f of rg.state.flux) if (f > 0) { f1 += f; n1++; }
  for (let i = 1; i < ITERS; i++) rg.step();
  let fN = 0, nN = 0, mx = 0; for (const f of rg.state.flux) if (f > 0) { fN += f; nN++; if (f > mx) mx = f; }
  ok(nN < n1, 'the field SHARPENS: flux concentrates onto fewer edges as it converges (' + n1 + ' → ' + nN + ')');
  ok(mx / (fN / nN) > 3, 'a hierarchy emerges (peak edge ≫ mean edge)');
  // determinism: a second grower walked the same way lands in the identical state
  const rg2 = createRoadGrower(world, society);
  for (let i = 0; i < ITERS; i++) rg2.step();
  let same = true; for (let i = 0; i < rg.state.cond.length; i++) if (rg.state.cond[i] !== rg2.state.cond[i]) { same = false; break; }
  ok(same, 'the stepwise growth is deterministic (identical conductance state)');
}

// ── finalize: the carve — building-aware roads with frontage + doors ──
const r = finalizeRoads(rg, world);
{
  const n = world.sites.length;
  ok(r.stats.roadCells > 0 && r.stats.roadCells < n * 0.5, 'roads are a proper superlevel set of the traffic field');
  // single connected network
  const adj = rg.graph.adj;
  let start = -1; for (let i = 0; i < n; i++) if (r.isRoad[i]) { start = i; break; }
  const seen = new Set([start]), q = [start];
  while (q.length) { const u = q.pop(); for (const [v] of adj[u]) if (r.isRoad[v] && !seen.has(v)) { seen.add(v); q.push(v); } }
  ok(seen.size === r.stats.roadCells, 'the grown road network is a single connected component');
  // expropriation accounting: every cell is either still a building cell or a road cell
  let aliveSum = 0; for (const pl of world.places) aliveSum += pl.cells.filter((ci) => !r.isRoad[ci]).length;
  ok(aliveSum + r.stats.expropriated === world.places.reduce((s, p) => s + p.cells.length, 0), 'expropriated + surviving cells account for every footprint cell');
  ok(r.stats.absorbed < world.places.length * 0.2, 'the carve absorbs only a small fraction of buildings (' + r.stats.absorbed + ')');
  // frontage + doors: every surviving building gets a door edge joining its cell to a road cell
  ok(r.stats.doored === r.stats.surviving, 'every surviving building gets a door (' + r.stats.doored + '/' + r.stats.surviving + ')');
  const ownerOf = (ci) => world.buildingOf[ci];
  ok(r.doors.every((d) => {
    const aRoad = r.isRoad[d.a], bRoad = r.isRoad[d.b];
    if (aRoad === bRoad) return false;                               // exactly one side is road
    const member = aRoad ? d.b : d.a;
    return ownerOf(member) === d.place && !r.isRoad[member];
  }), 'every door joins a surviving cell of ITS building to a road cell');
  // hierarchy: tiers only on road edges, and more than one tier in play
  let tiersOK = true; const seenTiers = new Set();
  for (let i = 0; i < rg.graph.E; i++) { if (r.tier[i] && !r.roadEdge[i]) tiersOK = false; if (r.tier[i]) seenTiers.add(r.tier[i]); }
  ok(tiersOK && seenTiers.size >= 2, 'a road hierarchy emerges (≥2 tiers, only on road edges)');
}

// ── the roads answer to the society: a different society grows different roads ──
{
  const w2 = buildWorld({ W: 1000, H: 700, cells: 4500, seed: 9 });
  const s2 = buildSociety(w2, { seed: 9 });
  const rg2 = createRoadGrower(w2, s2);
  for (let i = 0; i < ITERS; i++) rg2.step();
  const r2 = finalizeRoads(rg2, w2);
  ok(r2.stats.roadCells !== r.stats.roadCells || r2.stats.doored !== r.stats.doored, 'a different society desires different roads');
}

console.log(`econroads.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
