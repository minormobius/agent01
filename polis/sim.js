// sim.js — the orchestrator: roll a region from a seed, found proto-towns, and run
// the clock. One deterministic call → the whole history. This is the "roll up a
// region and build some proto towns" vertical slice.
//
//   const world = rollRegion(20260618);
//   world.region   — the substrate (toy mappa)
//   world.towns    — proto-towns, each with .history (population per tick), tier, engine, flourish
//   world.meta     — seed, params, the tech curve
//
// Pure + deterministic; node + browser. Attaches to globalThis.POLIS for the viewer.

import { buildRegion } from './substrate.js';
import { scoreSites, foundTowns } from './site.js';
import { initEconomy, step } from './economy.js';

export function rollRegion(seed = 1, opts = {}) {
  const { W = 96, H = 72, count = 7, ticks = 140, r = 0.16, spacing = 9 } = opts;
  const region = buildRegion(seed, { W, H });
  const scores = scoreSites(region);
  const founded = foundTowns(region, scores, { count, spacing });
  const towns = founded.map((t) => initEconomy(region, t));

  // the tech clock: a slow logistic from ~0 → ~1 over the run (the master driver).
  // K, base reach and the multiplier all ride it, so the towns chase a moving ceiling.
  const techCurve = [];
  for (let k = 0; k < ticks; k++) techCurve.push(1 / (1 + Math.exp(-(k - ticks * 0.45) / (ticks * 0.13))));

  for (let k = 0; k < ticks; k++) for (const t of towns) step(t, { r, tech: techCurve[k] });

  for (const t of towns) { t.pop = Math.round(t.pop); t.flourishVal = Math.round(t.flourishVal || 0); }
  towns.sort((a, b) => b.pop - a.pop);                          // rank order (for the Zipf check)

  return { region, scores, towns, meta: { seed, W, H, count, ticks, r, techCurve } };
}

// a compact, human-readable chronicle (used by the selftest and the CLI)
export function chronicle(world) {
  const lines = [`region seed ${world.meta.seed} · ${world.towns.length} proto-towns · ${world.meta.ticks} ticks`];
  world.towns.forEach((t, n) => {
    lines.push(`  #${n + 1} ${t.tier.padEnd(10)} pop ${String(t.pop).padStart(7)}  engine ${t.engine.padEnd(13)} flourish ${t.flourishVal}  (x${t.x},y${t.y})`);
  });
  return lines.join('\n');
}

if (typeof globalThis !== 'undefined') globalThis.POLIS = { rollRegion, chronicle };

// CLI: `node polis/sim/sim.js [seed]`
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('sim.js')) {
  const seed = Number(process.argv[2] || 20260618);
  console.log(chronicle(rollRegion(seed)));
}
