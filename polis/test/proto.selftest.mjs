// proto.selftest.mjs — pins the proto vertical slice: determinism + that the
// theory's claims actually show up in the numbers.
//   node polis/sim/test/proto.selftest.mjs

import { buildRegion } from '../substrate.js';
import { scoreSites, foundTowns } from '../site.js';
import { initEconomy, step, conquer, tierOf } from '../economy.js';
import { rollRegion } from '../sim.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// 1 — determinism: same seed → identical towns + identical final populations
{
  const a = rollRegion(20260618), b = rollRegion(20260618);
  ok(a.towns.length === b.towns.length && a.towns.every((t, i) => t.cell === b.towns[i].cell && t.pop === b.towns[i].pop),
    'deterministic — same seed yields the same proto-towns and populations');
  const c = rollRegion(99);
  ok(JSON.stringify(c.towns.map(t => t.cell)) !== JSON.stringify(a.towns.map(t => t.cell)),
    'a different seed yields a different region');
}

// 2 — the region is sane: some water, some land, rivers exist, towns are on land near water/route
{
  const r = buildRegion(20260618);
  let w = 0, rv = 0; for (let i = 0; i < r.N; i++) { if (r.water[i]) w++; if (r.river[i]) rv++; }
  ok(w > r.N * 0.15 && w < r.N * 0.75, 'region has a sensible land/water balance');
  ok(rv > 0, 'rivers form (flow accumulation produced watercourses)');
  const world = rollRegion(20260618);
  const onLand = world.towns.every(t => !r.water[t.cell]);
  ok(onLand, 'every proto-town sits on land');
  const nearWaterOrRoute = world.towns.filter(t => {
    if (r.river[t.cell] || r.moisture[t.cell] > 0.5) return true;
    return r.nb4(t.cell).some(j => r.water[j]);
  }).length;
  ok(nearWaterOrRoute >= Math.ceil(world.towns.length * 0.6), 'most towns nucleate on water / a route (site+situation)');
}

// 3 — every town gets a founding engine from the catalogue
{
  const valid = new Set(['gateway', 'break-of-bulk', 'staple', 'fortress', 'market']);
  const world = rollRegion(20260618);
  ok(world.towns.every(t => valid.has(t.engine)), 'every town is assigned a founding engine');
}

// 4 — growth is logistic: monotone non-decreasing, and it slows (it does not run away exponentially)
{
  const world = rollRegion(20260618);
  const t = world.towns[0], h = t.history;
  let mono = true; for (let k = 1; k < h.length; k++) if (h[k] < h[k - 1] - 1) mono = false;
  ok(mono, 'population grows monotonically (logistic, no collapse without an event)');
  // bi-logistic: a moving (tech-lifted) ceiling can give a mid-run growth spurt, but it
  // must plateau by the end. Check: grew a lot overall, and the final segment has flattened.
  const L = h.length, grew = h[L - 1] > h[5] * 2;
  let maxStep = 0; for (let k = 6; k < L; k++) maxStep = Math.max(maxStep, h[k] - h[k - 6]);
  const lastStep = h[L - 1] - h[L - 7];
  ok(grew && lastStep < maxStep * 0.5, 'grows (with a tech-driven spurt) then flattens toward the ceiling');
}

// 5 — carrying capacity binds: no town exceeds its food+import ceiling, and hinterlands differ
{
  const world = rollRegion(20260618);
  const capRespected = world.towns.every(t => t.pop <= Math.ceil(t.ceiling * 1.03));
  const sur = world.towns.map(t => t.surplus);
  const spread = Math.max(...sur) > Math.min(...sur) * 1.4;
  ok(capRespected, 'no town exceeds its food + import ceiling (carrying capacity binds)');
  ok(spread, 'hinterland surplus varies across sites (the hinterland matters)');
}

// 6 — the tech clock raises the ceiling: with tech, towns end larger than with tech frozen at 0
{
  const base = rollRegion(20260618);
  // re-run the same region/towns with tech pinned to 0
  const region = buildRegion(20260618);
  const scores = scoreSites(region);
  const founded = foundTowns(region, scores, { count: 7, spacing: 9 });
  const towns = founded.map(t => initEconomy(region, t));
  for (let k = 0; k < base.meta.ticks; k++) for (const t of towns) step(t, { r: 0.16, tech: 0 });
  const withTech = base.towns.reduce((s, t) => s + t.pop, 0);
  const noTech = towns.reduce((s, t) => s + Math.round(t.pop), 0);
  ok(withTech > noTech * 1.2, `tech lifts the ceiling — total pop with tech (${withTech}) > without (${noTech})`);
}

// 7 — Zipf-ish: the rank-ordered populations fall off (a hierarchy emerges, not a tie)
{
  const world = rollRegion(20260618);
  const p = world.towns.map(t => t.pop);
  ok(p[0] >= p[p.length - 1] && p[0] > p[p.length - 1] * 1.3, 'a size hierarchy emerges across towns (top ≫ bottom)');
}

// 8 — conquest is size-dependent: sacking a mono-functional nucleus hurts far more than a metropolis
{
  const region = buildRegion(20260618);
  const small = initEconomy(region, { cell: region.idx(region.W >> 1, region.H >> 1), x: region.W >> 1, y: region.H >> 1, engine: 'staple' });
  small.pop = 800;
  const big = initEconomy(region, { cell: region.idx(region.W >> 1, region.H >> 1), x: region.W >> 1, y: region.H >> 1, engine: 'gateway' });
  big.pop = 120000;
  conquer(small, 'sack'); conquer(big, 'sack');
  ok(small.pop / 800 < 0.2 && big.pop / 120000 > 0.4,
    'sack: a mono-functional nucleus is gutted, a metropolis survives (locational inertia)');
  const milked = initEconomy(region, { cell: region.idx(10, 10), x: 10, y: 10, engine: 'market' });
  conquer(milked, 'tribute');
  ok(milked.tributary === true, 'tribute flags the city as milked (surplus flows outward)');
}

// 9 — tiers map sensibly
{
  ok(tierOf(10) === 'hamlet' && tierOf(5000) === 'town' && tierOf(5e5) === 'city' && tierOf(2e6) === 'metropolis',
    'population tiers (hamlet → metropolis) classify correctly');
}

console.log(`\n${fail === 0 ? '✓ all green' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
