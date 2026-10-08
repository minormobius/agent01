/* Ecumene — the planet. A small world from mappa's engine (js/mappa-engine.js
   is a byte-identical copy of ../../mappa/engine.js; the selftest fails on
   drift), read for what a settler needs:

     hab     how livable the ground is, 0..1, by biome
     fresh   how many people per km² its fresh water can carry: rain (moisture,
             frozen ground counts for little), a river through it (flow), a
             lake beside it. The sea is not fresh.
     rough   how slow the ground is to cross (relief, ice)

   The planet is small on purpose: radius R km, so a world cell is a county
   and a city fills a few. Everything here is fixed for the game; the cities
   refine a mesh laid over it (js/sim.js), never this one. */
import { generateWorld, BIOMES } from "./mappa-engine.js";

export const R = 250;                 // planet radius, km
export const WORLD_N = 1600;          // mappa's target cell count (≈1850 cells come back)

// livability by biome id
const HAB = { ice: 0, glacier: 0, snow: 0, sea_ice: 0, lake: 0, ocean_deep: 0, ocean_shelf: 0,
  alpine: 0.12, desert: 0.18, cold_desert: 0.22, tundra: 0.3, taiga: 0.55, steppe: 0.85, temperate_for: 1,
  temperate_rain: 0.85, savanna: 0.75, trop_seasonal: 0.85, trop_rain: 0.6 };

export function makeWorld(seed) {
  // some seeds are nearly all sea or all ice; walk on to one with room to live
  for (let k = 0; k < 40; k++) {
    const w = build(seed + k * 7919);
    if (w.landCells >= 450 && w.livable >= 250) return w;
  }
  return build(seed);
}

function build(seed) {
  const w = generateWorld(seed >>> 0, { N: WORLD_N });
  const N = w.N, V = new Float64Array(3 * N), idx = new Map();
  w.V.forEach((p, i) => { V[3 * i] = p[0]; V[3 * i + 1] = p[1]; V[3 * i + 2] = p[2]; idx.set(p, i); });
  const flow = new Float32Array(N);
  for (const r of w.rivers) { const i = idx.get(r.a); if (i !== undefined) flow[i] = Math.max(flow[i], r.flow); }
  const hab = new Float32Array(N), fresh = new Float32Array(N), rough = new Float32Array(N), areaKm = new Float32Array(N);
  let landCells = 0, livable = 0;
  for (let i = 0; i < N; i++) {
    areaKm[i] = w.area[i] * R * R;
    const b = BIOMES[w.biome[i]].id, land = w.water[i] === 0;
    hab[i] = land ? (HAB[b] ?? 0.5) : 0;
    if (land) landCells++;
    if (hab[i] >= 0.5) livable++;
    const T = w.temperature[i], M = w.moisture[i];
    let lake = 0; for (const j of w.adj[i]) if (w.water[j] === 2) lake = 1;
    fresh[i] = land ? 25 + 700 * M * M * (T > 0 ? 1 : 0.25) + 2600 * Math.min(1, flow[i] / 120) + 900 * lake : 0;
    let relief = 0; for (const j of w.adj[i]) if (w.water[j] === 0) relief = Math.max(relief, Math.abs(w.elev[i] - w.elev[j]));
    rough[i] = 1 + 6 * relief + (b === "alpine" || b === "snow" || b === "glacier" || b === "ice" ? 1.5 : 0);
  }
  return { seed: w.meta.seed, meta: w.meta, N, V, adj: w.adj, cells: w.cells, water: w.water, elev: w.elev, biome: w.biome,
    temp: w.temperature, moist: w.moisture, flow, hab, fresh, rough, areaKm, rivers: w.rivers, landCells, livable };
}

/* The world cell nearest to unit vector p, by greedy walk from `from`. */
export function nearestCell(world, p, from) {
  let i = from >= 0 ? from : 0, best = dotV(world.V, i, p);
  for (;;) {
    let moved = false;
    for (const j of world.adj[i]) { const d = dotV(world.V, j, p); if (d > best) { best = d; i = j; moved = true; } }
    if (!moved) return i;
  }
}
function dotV(V, i, p) { return V[3 * i] * p[0] + V[3 * i + 1] * p[1] + V[3 * i + 2] * p[2]; }

export function biomeColor(b) { const c = BIOMES[b]; return "hsl(" + c.h + "," + c.s + "%," + c.l + "%)"; }
export { BIOMES };
