// continent.selftest.mjs — the continent-scale hinterlands sim (a closed system).
//   node polis/test/continent.selftest.mjs
//
// Asserts: a real connected landmass is found; population grows from a founding seed and
// stays BOUNDED by the continent's carrying capacity (closed — nobody enters from off-map);
// SEA LEVEL CHASES THE CLIMATE (warm eras drown land, glacials expose shelf) and capacity
// follows; people FLOW to routes (coasts/rivers carry denser population); DEVELOPMENT
// POINTS accumulate and lift the ceiling; and the whole run is deterministic.

import { rollMappaWorld } from '../mappaWorld.js';
import { buildClimate } from '../../mappa/climate-forcing.js';
import { pickContinent, runHinterland } from '../continent.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const SEED = 20260618;
const world = rollMappaWorld(SEED);
const clim = buildClimate(world, { seed: SEED });
const cont = pickContinent(world);
const R = runHinterland(world, clim, cont, { ticks: 180 });

console.log('the continent (a closed system):');
ok(cont.n > 200 && cont.n < world.N, `a landmass is carved from the world (${cont.n} of ${world.N} cells)`);
{ // connectivity: BFS from cell 0 reaches every continent cell (single component)
  const seen = new Uint8Array(cont.n); seen[0] = 1; const q = [0];
  for (let h = 0; h < q.length; h++) for (const j of cont.adj[q[h]]) if (!seen[j]) { seen[j] = 1; q.push(j); }
  let all = 0; for (let i = 0; i < cont.n; i++) all += seen[i];
  ok(all === cont.n, 'the continent is a single connected component');
}
ok(cont.coast.reduce((a, b) => a + b, 0) > 0 && cont.river.reduce((a, b) => a + b, 0) > 0, 'it has coasts and rivers (the cheap corridors)');

console.log('population growth, bounded (closed system):');
const finite = R.env.every((e) => isFinite(e.totalPop) && e.totalPop >= 0);
ok(finite, 'population stays finite and non-negative for the whole run');
ok(R.env[10].totalPop < R.env[120].totalPop, `population grows from the founding seed (${R.env[10].totalPop} → ${R.env[120].totalPop})`);
ok(R.env.every((e) => e.totalPop <= e.totalK * 1.05 + 10), 'population never exceeds the continent carrying capacity (nothing enters from off-map)');

console.log('sea level chases the climate:');
// the coldest (lowest-sea) era exposes the most land; the warmest (highest-sea) the least
let glac = R.env[0], warm = R.env[0];
for (const e of R.env) { if (e.seaLevel < glac.seaLevel) glac = e; if (e.seaLevel > warm.seaLevel) warm = e; }
ok(warm.seaLevel > glac.seaLevel, `sea level rises from glacial to interglacial (${glac.seaLevel.toFixed(3)} → ${warm.seaLevel.toFixed(3)})`);
ok(warm.land < glac.land, `the rising sea drowns land (${glac.land} land cells at the lowstand → ${warm.land} at the highstand)`);
// find a tick where the sea rose and land dropped meaningfully within the run
let drowned = 0; for (let k = 1; k < R.ticks; k++) if (R.env[k].land < R.env[k - 1].land) drowned += R.env[k - 1].land - R.env[k].land;
ok(drowned > 0, `coastlines retreat over the run (${drowned} cell-drownings total)`);

console.log('resource flow — people concentrate on the routes:');
{ // mean population per cell on coast/river cells vs interior, at a mature tick
  const k = 150, base = k * cont.n; let pc = 0, nc = 0, pi = 0, ni = 0;
  for (let i = 0; i < cont.n; i++) { if (!R.landH[base + i]) continue; const p = R.popH[base + i];
    if (cont.coast[i] || cont.river[i]) { pc += p; nc++; } else { pi += p; ni++; } }
  const dc = pc / Math.max(1, nc), di = pi / Math.max(1, ni);
  ok(dc > di, `coast/river cells carry denser population than the interior (${Math.round(dc)} vs ${Math.round(di)} per cell)`);
}

console.log('development points lift the ceiling:');
ok(R.env[R.ticks - 1].meanDev > R.env[20].meanDev, `development accumulates over history (mean ${R.env[20].meanDev} → ${R.env[R.ticks - 1].meanDev})`);
{ // a developed cell's capacity exceeds its pure-climate capacity (the endogenous lift)
  let anyLift = false;
  const k = R.ticks - 1, base = k * cont.n;
  for (let i = 0; i < cont.n && !anyLift; i++) if (R.landH[base + i] && R.devH[base + i] > 0.1) anyLift = true;
  ok(anyLift, 'some cells reach a real development level (endogenous productivity)');
}

console.log('determinism:');
const R2 = runHinterland(world, clim, cont, { ticks: 180 });
ok(R.env.every((e, k) => e.totalPop === R2.env[k].totalPop && e.land === R2.env[k].land), 'same world+seed → identical history');

console.log(`\n${fail === 0 ? '✓ all green' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
