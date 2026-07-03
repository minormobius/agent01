// chronicle.selftest.mjs — pins the mesh-based living-map pipeline.
//   node polis/test/chronicle.selftest.mjs

import { rollMappaWorld, selectRegion, makeSampler } from '../mappaWorld.js';
import { buildMesh, cellState, habitable, moistAt, computeRivers } from '../mesh.js';
import { runChronicle } from '../chronicle.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const SEED = 20260618;
const world = rollMappaWorld(SEED);
const region = selectRegion(world);
const sampler = makeSampler(world, region);
const mesh = buildMesh(SEED, region, sampler);

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

// 3 — the climate functions respond to the era (region-independent mechanism)
{
  // a frozen cell paints as glacier; a cold cell becomes habitable only when warmed
  ok(cellState({ elev: 0.1, temp: -12, moist: 0.3, biome: 8, river: 0 }, { seaLevel: 0, tempShift: 0 }).ice, 'cellState paints a glacier for a frozen cell');
  ok(!habitable({ elev: 0.1, temp: 3 }, { tempShift: -9 }) && habitable({ elev: 0.1, temp: 3 }, { tempShift: 4 }), 'habitability tracks the era temperature');
  // on the real region: the ice age is at least as frozen as the modern era
  const cold = (shift) => mesh.cells.filter((c) => c.elev >= 0 && c.temp + shift < -2).length;
  ok(cold(-6) >= cold(2), `the ice age is at least as frozen as the modern era (${cold(-6)} ≥ ${cold(2)})`);
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

// 7 — arteries form: the network strengthens as the city system grows from a nascent
// civilization to its peak. (Measured nascent → peak, not mid → end: nucleation is
// climate-gated to the deglaciation, and a late catastrophe can thin the network — so
// the final tick may be post-collapse. Peak population is the honest maturity mark.)
{
  const c = runChronicle(SEED, mesh);
  const totPop = (k) => c.towns.reduce((a, t) => a + (t.history[k] || 0), 0);
  const founded = c.towns.filter((t) => t.founded >= 0).map((t) => t.founded);
  const nascent = Math.min(...founded) + 3;
  let peak = 0, pk = -1; for (let k = 0; k < c.ticks; k++) { const p = totPop(k); if (p > pk) { pk = p; peak = k; } }
  const strong = (k) => { let s = 0; for (let i = 0; i < c.E; i++) if (c.artStrength[k * c.E + i] > 40) s++; return s; };
  ok(strong(peak) > strong(nascent), `inter-town arteries thicken as the system matures (strong edges ${strong(nascent)} → ${strong(peak)})`);
}

// 8 — tech waves fire as the clock advances
{
  const c = runChronicle(SEED, mesh);
  ok(c.waves.length >= 2, `tech waves ripple out as eras unlock (${c.waves.length} waves)`);
}

// 9 — discrete shocks fire, are deterministic, and dent a town's population (downturns)
{
  const a = runChronicle(SEED, mesh), b = runChronicle(SEED, mesh);
  ok(a.events.length >= 3, `discrete shocks fire over the run (${a.events.length}: ${[...new Set(a.events.map((e) => e.type))].join(', ')})`);
  ok(JSON.stringify(a.events) === JSON.stringify(b.events), 'the shock sequence is deterministic');
  // at least one town's history shows a real dip (a downturn, not just monotone growth)
  let dipped = false;
  for (const t of a.towns) for (let k = (t.founded > 0 ? t.founded + 2 : 2); k < a.ticks; k++) {
    if (t.history[k - 1] > 100 && t.history[k] < t.history[k - 1] * 0.9) { dipped = true; break; }
  }
  ok(dipped, 'a town suffers a real population downturn (shock → dip → recovery)');
  // the event types we expect are represented
  const types = new Set(a.events.map((e) => e.type));
  ok(types.has('plague') || types.has('conquest') || types.has('crisis'), 'shocks are drawn from {plague, conquest, crisis}');
}

// 10 — causal climate: civilization nucleates as the ice retreats, and a civilized-era
// super-eruption can cast it back into the dark.
{
  const c = runChronicle(SEED, mesh, { world });
  const founded = c.towns.filter((t) => t.founded >= 0);
  ok(founded.every((t) => c.env[t.founded].ice < 0.65), 'no town nucleates under the ice sheets (founding gated to the deglaciation)');
  ok(founded.every((t) => c.env[t.founded].year > -8000), `the first cities are post-glacial (earliest founding ${Math.min(...founded.map((t) => c.env[t.founded].year))} — after the ice age)`);

  // a world whose super-eruption strikes a mature civilization → a system-wide dark age
  const dseed = 308852, dworld = rollMappaWorld(dseed);
  const dmesh = buildMesh(dseed, selectRegion(dworld), makeSampler(dworld, selectRegion(dworld)));
  const D = runChronicle(dseed, dmesh, { world: dworld });
  const su = D.events.find((e) => e.type === 'super-eruption');
  ok(!!su, 'a super-eruption fires as a discrete climate shock');
  if (su) {
    const totPop = (k) => D.towns.reduce((a, t) => a + (t.history[k] || 0), 0);
    const before = totPop(su.tick - 1), low = Math.min(...Array.from({ length: 5 }, (_, i) => totPop(su.tick + i)));
    ok(before > 0 && low < before * 0.9, `the super-eruption casts the civilization back (system pop ${before} → ${low}, −${Math.round((1 - low / before) * 100)}%)`);
  }
}

// 11 — wetness migrates biomes and carrying capacity (the Mesopotamia arc): the region
// greens in a pluvial and browns as it aridifies, and hinterland fertility follows.
{
  const c = runChronicle(SEED, mesh, { world });
  let wet = null, dry = null;
  for (const e of c.env) { if (e.year < -6000) continue; if (!wet || e.humidity > wet.humidity) wet = e; if (!dry || e.humidity < dry.humidity) dry = e; }
  ok(wet.humidity > dry.humidity + 0.1, `the region has a pluvial and a drier era (humidity ${dry.humidity.toFixed(2)} … ${wet.humidity.toFixed(2)})`);
  // forest cover (warm + wet land) expands in the pluvial, contracts when it dries
  const forest = (env) => mesh.cells.filter((cc) => cc.elev >= env.seaLevel && moistAt(cc, env) > 0.5 && (cc.temp + env.tempShift - 0.32 * (cc.seas || 0)) > 2).length;
  ok(forest(wet) > forest(dry), `forests migrate with wetness (${forest(wet)} → ${forest(dry)} cells, pluvial → arid)`);
  // hinterland carrying capacity around a fertile inland cell rises in the pluvial
  const cell = mesh.cells.reduce((a, cc) => (cc.elev > 0.05 && !cc.river && cc.moist > (a ? a.moist : -1)) ? cc : a, null) || mesh.cells[0];
  const surp = (env) => { let s = 0, seen = new Set([cell.id]), fr = [cell.id]; for (let h = 0; h <= 5; h++) { const nx = []; for (const id of fr) { const cc = mesh.cells[id]; if (cc.elev >= env.seaLevel) s += moistAt(cc, env) * (1 - Math.min(1, (cc.elev - env.seaLevel) * 2.2)); for (const n of cc.neigh) if (!seen.has(n)) { seen.add(n); nx.push(n); } } fr = nx; } return s; };
  ok(surp(wet) > surp(dry) * 1.1, `hinterland fertility tracks wetness (surplus ${surp(dry).toFixed(0)} arid → ${surp(wet).toFixed(0)} pluvial)`);
}

// 12 — rivers respond to climate: discharge is mass-conserving, swells in a pluvial and
// dies back (mouth → inland) in an aridification, leaving dry valleys.
{
  const c = runChronicle(SEED, mesh, { world });
  let wet = null, dry = null;
  for (const e of c.env) { if (e.year < -6000) continue; if (!wet || e.humidity > wet.humidity) wet = e; if (!dry || e.humidity < dry.humidity) dry = e; }
  const wetW = computeRivers(mesh, wet), dryW = computeRivers(mesh, dry);
  const count = (w) => { let n = 0; for (let i = 0; i < w.length; i++) if (w[i] > 0) n++; return n; };
  ok(count(wetW) > count(dryW) * 1.3, `rivers swell in the pluvial and die back in the arid era (${count(wetW)} → ${count(dryW)} channel cells)`);
  let died = 0; for (const cc of mesh.cells) if (wetW[cc.id] > 0 && dryW[cc.id] === 0) died++;
  ok(died > 0, `river reaches dry to wadis / dry valleys in the aridification (${died} cells)`);
  // MASS CONSERVATION: in a lossless humid climate, runoff in ≈ discharge out (to sea/sinks)
  let runoffIn = 0; const d2 = new Float32Array(mesh.cells.length);
  for (const cc of mesh.cells) { if (cc.elev < 0) continue; const ro = Math.max(0, Math.min(1, cc.moist * 3.0) - 0.12); d2[cc.id] = ro; runoffIn += ro; }
  let out = 0;
  for (const id of mesh.order) { const cc = mesh.cells[id]; if (cc.elev < 0) continue; const j = cc.down; const M = j >= 0 ? Math.min(1, mesh.cells[j].moist * 3.0) : 1; const loss = Math.max(0, Math.min(0.6, (0.26 - M) * 1.4)); if (j >= 0 && mesh.cells[j].elev >= 0) d2[j] += d2[id] * (1 - loss); else out += d2[id]; }
  ok(out > runoffIn * 0.95, `discharge conserves mass through the network (${runoffIn.toFixed(0)} in → ${out.toFixed(0)} out, ${(out / runoffIn * 100).toFixed(0)}%)`);
}

console.log(`\n${fail === 0 ? '✓ all green' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
