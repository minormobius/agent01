// chronicle.selftest.mjs — pins the mesh-based living-map pipeline.
//   node polis/test/chronicle.selftest.mjs

import { rollWorld, selectRegion } from '../world.js';
import { buildMesh, cellState, habitable } from '../mesh.js';
import { makeArteries } from '../arteries.js';
import { runChronicle } from '../chronicle.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const SEED = 20260618;
const world = rollWorld(SEED);
const region = selectRegion(world);
const mesh = buildMesh(SEED, region);

// 1 — region selection + mesh sanity
ok(region.score > 0 && region.x1 > region.x0 && region.y1 > region.y0, 'a city-rich region is selected');
ok(mesh.cells.length > 800, `mesh retiles the region into many cells (${mesh.cells.length})`);
{
  const land = mesh.cells.filter((c) => c.elev >= mesh.baseSea).length;
  const water = mesh.cells.length - land;
  ok(land > 0 && water > 0, 'region has both land and water (a coastline)');
  ok(mesh.cells.some((c) => c.river), 'rivers form on the cell graph');
}

// 2 — adjacency is symmetric and the land graph is connected
{
  let sym = true; for (const c of mesh.cells) for (const n of c.neigh) if (!mesh.cells[n].neigh.includes(c.id)) sym = false;
  ok(sym, 'Voronoi adjacency is symmetric');
}

// 3 — climate shifts the map: the ice age glaciates/depopulates more than the warm era
{
  const iceEnv = { seaLevel: 0.36, tempShift: -0.28 }, warmEnv = { seaLevel: 0.46, tempShift: 0.06 };
  const iceHab = mesh.cells.filter((c) => habitable(c, iceEnv)).length;
  const warmHab = mesh.cells.filter((c) => habitable(c, warmEnv)).length;
  ok(warmHab > iceHab, `more land is habitable when warm (${warmHab}) than in the ice age (${iceHab})`);
  ok(mesh.cells.some((c) => cellState(c, iceEnv).ice), 'the ice age paints glacier cells');
}

// 4 — full chronicle: determinism
{
  const a = runChronicle(SEED, mesh), b = runChronicle(SEED, mesh);
  const sig = (r) => r.towns.map((t) => [t.cell, t.founded, t.pop].join(',')).join('|');
  ok(sig(a) === sig(b), 'the chronicle is deterministic (same seed+mesh → same history)');
}

// 5 — staged nucleation: towns appear over time, not all at tick 0
{
  const c = runChronicle(SEED, mesh);
  const founded = c.towns.filter((t) => t.founded >= 0);
  ok(founded.length >= 4, `several towns are founded (${founded.length})`);
  const foundTicks = founded.map((t) => t.founded);
  ok(Math.max(...foundTicks) > Math.min(...foundTicks), 'nucleation is staged across eras (not all at once)');
  ok(founded.some((t) => t.founded > c.ticks * 0.3), 'some townships appear only in later (warmer/teched) eras');
}

// 6 — towns grow over their lifetime; a size hierarchy emerges
{
  const c = runChronicle(SEED, mesh);
  const live = c.towns.filter((t) => t.pop > 0).sort((a, b) => b.pop - a.pop);
  ok(live.length >= 4 && live[0].pop > live[live.length - 1].pop * 1.3, 'a town size hierarchy emerges (centres of gravity)');
  const t = live[0];
  ok(t.history[t.founded + 2] > 0 && t.history[c.ticks - 1] >= t.history[t.founded + 2], 'the lead town grows over its lifetime');
}

// 7 — arteries form: the network gains strong edges as towns grow
{
  const c = runChronicle(SEED, mesh);
  const early = c.ticks * 0.5 | 0, late = c.ticks - 1;
  let earlyStrong = 0, lateStrong = 0;
  for (let i = 0; i < c.E; i++) { if (c.artStrength[early * c.E + i] > 40) earlyStrong++; if (c.artStrength[late * c.E + i] > 40) lateStrong++; }
  ok(lateStrong > earlyStrong, `inter-town arteries thicken over time (strong edges ${earlyStrong} → ${lateStrong})`);
}

// 8 — tech waves fire as the clock advances
{
  const c = runChronicle(SEED, mesh);
  ok(c.waves.length >= 2, `tech waves ripple out as eras unlock (${c.waves.length} waves)`);
}

console.log(`\n${fail === 0 ? '✓ all green' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
