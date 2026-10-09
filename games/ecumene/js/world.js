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
  // food: what a km² of open country grows, before the farms get better (js/sim.js scales it by year)
  const yieldKm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (w.water[i] !== 0) continue;
    const T = w.temperature[i], M = w.moisture[i];
    const wet = Math.max(0, Math.min(1, (M - 0.12) / 0.45)), warm = T < 0 ? 0 : T < 8 ? T / 8 : T > 28 ? Math.max(0.4, 1 - (T - 28) / 15) : 1;
    yieldKm[i] = hab[i] * wet * warm;
  }
  const W = { seed: w.meta.seed, meta: w.meta, N, V, adj: w.adj, cells: w.cells, water: w.water, elev: w.elev, biome: w.biome,
    temp: w.temperature, moist: w.moisture, flow, hab, fresh, rough, areaKm, rivers: w.rivers, landCells, livable, yieldKm,
    conv: w.conv, volc: w.volc };
  W.deposits = deposits(W);
  return W;
}

/* Ore, where the rocks would put it: metal (iron, copper, tin) in the
   mountains plates push up, where they collide or a volcanic arc stands;
   coal in warm, wet lowlands far from any boundary (old swamps). One deposit
   per ~55 land cells, none within three cells of another. `rich` is its
   output, in units a year (a unit is what one person's industry uses). */
export const ORES = { iron: "#c0583f", copper: "#d58a45", tin: "#9fb0c0", coal: "#4a4a52" };
function deposits(W) {
  const cand = [];
  for (let i = 0; i < W.N; i++) {
    if (W.water[i] !== 0) continue;
    const h = hash(i * 7 + W.seed);
    const metal = Math.max(0, W.conv[i]) * 1.2 + W.volc[i] * 0.8 + Math.max(0, W.elev[i] - 0.2);
    const coal = W.elev[i] < 0.15 && Math.abs(W.conv[i]) < 0.05 && W.moist[i] > 0.55 && W.temp[i] > 4 ? 0.9 + 0.4 * W.moist[i] : 0;
    if (metal > 0.5) cand.push([metal * (0.7 + 0.6 * h), i, h < 0.45 ? "iron" : h < 0.8 ? "copper" : "tin"]);
    if (coal > 0) cand.push([coal * (0.6 + 0.6 * h), i, "coal"]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  const want = Math.max(6, Math.round(W.landCells / 55)), out = [], near = new Int32Array(W.N).fill(-1);
  for (const [score, i, kind] of cand) {
    if (out.length >= want) break;
    if (near[i] >= 0) continue;
    out.push({ cell: i, kind, p: [W.V[3 * i], W.V[3 * i + 1], W.V[3 * i + 2]], rich: Math.round(60e3 + 140e3 * Math.min(1, score / 2.5)) });
    const q = [i]; near[i] = 0;   // nothing else within three cells
    for (let h = 0; h < q.length; h++) { const c = q[h]; if (near[c] >= 3) continue; for (const j of W.adj[c]) if (near[j] < 0) { near[j] = near[c] + 1; q.push(j); } }
  }
  return out;
}
function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }

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
