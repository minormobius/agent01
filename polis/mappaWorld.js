// mappaWorld.js — the REAL mappa engine as polis's terrain source.
//
// Generates an actual planet (spherical plate tectonics, climate, biomes, rivers via
// mappa/engine.js — imported, not forked), auto-selects a city-rich region, and
// returns a planar SAMPLER over that region. The fine Voronoi mesh (mesh.js) samples
// this for real elevation/temperature/moisture/biome — so the tiles are finer than
// mappa's cells but carry mappa's real terrain (IDW-smoothed across the nearest few
// mappa cells; nearest for the categorical biome).
//
// Pure + deterministic (mappa is seed-stable); node + browser. From /polis/ the engine
// is one directory over at ../mappa/engine.js (same origin under the root site).

import { generateWorld, BIOMES, classify, BI } from '../mappa/engine.js';

export { BIOMES, classify, BI };

const S = 60;                                            // planar units per radian
const lonOf = (v) => Math.atan2(v[1], v[0]);
const latOf = (v) => Math.asin(Math.max(-1, Math.min(1, v[2])));
function wrap(d) { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

export function rollMappaWorld(seed, { N = 7000 } = {}) {
  const w = generateWorld(seed >>> 0, { N });
  w.lon = new Float64Array(w.N); w.lat = new Float64Array(w.N);
  for (let i = 0; i < w.N; i++) { w.lon[i] = lonOf(w.V[i]); w.lat[i] = latOf(w.V[i]); }
  // city-goodness per cell: coastal + fertile + temperate (the coarse pass for region pick)
  w.good = new Float64Array(w.N);
  for (let i = 0; i < w.N; i++) {
    if (w.water[i] !== 0) { let landN = 0; for (const j of w.adj[i]) if (w.water[j] === 0) landN++; w.good[i] = landN > 0 ? 0.3 : 0; continue; }
    let coast = 0; for (const j of w.adj[i]) if (w.water[j] === 1) coast = 1;
    const fertile = w.moisture[i] * Math.max(0, 1 - Math.max(0, w.elev[i]) * 2);
    const temperate = Math.max(0, 1 - Math.abs(w.temperature[i] - 14) / 14);   // goldilocks ~14°C (warm enough to thrive, cool enough that the ice age bites)
    w.good[i] = 0.5 * coast + 0.7 * fertile + 1.0 * temperate;
  }
  return w;
}

// auto-select the city-richest region: the land cell whose neighbourhood (BFS to
// `depth`) sums the most goodness becomes the centre; the region is a fixed angular
// window around it (kept off the poles so the projection stays well-conditioned).
export function selectRegion(w, { depth = 8, halfX = 28, halfY = 20 } = {}) {
  // score a candidate centre by goodness over a ~window-sized BFS neighbourhood,
  // tracking land fraction so we can reject ocean-dominated windows. Only the top-scoring
  // candidate cells are BFS-evaluated (keeps it fast on big worlds).
  const tryFind = (tmin, tmax, landMin) => {
    const cands = [];
    for (let i = 0; i < w.N; i++) if (w.water[i] === 0 && Math.abs(w.lat[i]) <= 1.15 && w.temperature[i] >= tmin && w.temperature[i] <= tmax) cands.push(i);
    cands.sort((a, b) => w.good[b] - w.good[a]);
    let best = -1, ci = -1;
    for (const i of cands.slice(0, 500)) {
      let sum = 0, land = 0, tot = 0; const seen = new Set([i]); let frontier = [i];
      for (let h = 0; h <= depth; h++) { const nx = []; for (const id of frontier) { sum += w.good[id]; tot++; if (w.water[id] === 0) land++; for (const j of w.adj[id]) if (!seen.has(j)) { seen.add(j); nx.push(j); } } frontier = nx; }
      if (tot > 0 && land / tot < landMin) continue;
      if (sum > best) { best = sum; ci = i; }
    }
    return [ci, best];
  };
  // solidly temperate + land-rich; relax in stages so we always return a region
  let [ci, best] = tryFind(8, 21, 0.45);
  if (ci < 0) [ci, best] = tryFind(3, 24, 0.3);
  if (ci < 0) [ci, best] = tryFind(-60, 60, 0);
  if (ci < 0) ci = 0;
  const lon0 = w.lon[ci], lat0 = w.lat[ci];
  return { lon0, lat0, S, halfX, halfY, x0: -halfX, y0: -halfY, x1: halfX, y1: halfY, score: best, center: ci };
}

function projectLL(lon, lat, r) { return [wrap(lon - r.lon0) * Math.cos(r.lat0) * r.S, -(lat - r.lat0) * r.S]; }

// a planar sampler over the region — field-like interface for mesh.js
export function makeSampler(w, region) {
  // gather mappa cells whose projection lands in (region + margin); index in a bucket grid
  const margin = 4, pts = [];
  for (let i = 0; i < w.N; i++) {
    if (Math.abs(wrap(w.lon[i] - region.lon0)) > 1.4) continue;          // far hemisphere — skip
    const [x, y] = projectLL(w.lon[i], w.lat[i], region);
    if (x < region.x0 - margin || x > region.x1 + margin || y < region.y0 - margin || y > region.y1 + margin) continue;
    // resource from mappa: volcanic/high-relief cells carry ore
    const res = (w.volc && w.volc[i] > 0.5) || w.elev[i] > 0.5 ? (w.elev[i] > 0.35 ? 'ore' : 'clay') : null;
    pts.push({ x, y, elev: w.elev[i], moist: w.moisture[i], temp: w.temperature[i], seas: w.seasonality[i], biome: w.biome[i], res });
  }
  const RW = region.x1 - region.x0, RH = region.y1 - region.y0;
  const bw = Math.max(4, Math.round(RW / 2)), bh = Math.max(4, Math.round(RH / 2));
  const buckets = Array.from({ length: bw * bh }, () => []);
  const bi = (x, y) => { let bx = Math.floor((x - region.x0) / (RW + 2 * margin) * bw + bw * margin / (RW + 2 * margin)); bx = Math.max(0, Math.min(bw - 1, bx)); let by = Math.max(0, Math.min(bh - 1, Math.floor((y - region.y0) / RH * bh))); return by * bw + bx; };
  pts.forEach((p, k) => { let bx = Math.max(0, Math.min(bw - 1, Math.floor((p.x - region.x0) / RW * bw))), by = Math.max(0, Math.min(bh - 1, Math.floor((p.y - region.y0) / RH * bh))); buckets[by * bw + bx].push(k); });
  const nearestK = (x, y, K) => {
    let bx = Math.max(0, Math.min(bw - 1, Math.floor((x - region.x0) / RW * bw))), by = Math.max(0, Math.min(bh - 1, Math.floor((y - region.y0) / RH * bh)));
    const cand = [];
    for (let rad = 1; rad <= 3 && cand.length < K + 2; rad++) { cand.length = 0; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const nx = bx + dx, ny = by + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue; for (const k of buckets[ny * bw + nx]) cand.push(k); } }
    if (!cand.length) for (let k = 0; k < pts.length; k++) cand.push(k);
    return cand.map((k) => [(pts[k].x - x) ** 2 + (pts[k].y - y) ** 2, k]).sort((a, b) => a[0] - b[0]).slice(0, K);
  };
  // IDW over the nearest 3 mappa cells (smooth terrain); nearest for the categorical biome
  function sample(x, y) {
    const near = nearestK(x, y, 3); if (!near.length) return { elev: -0.2, moist: 0, temp: 5, seas: 10, biome: 0, res: null };
    let we = 0, e = 0, mo = 0, te = 0, se = 0; const n0 = pts[near[0][1]];
    for (const [d2, k] of near) { const wgt = 1 / (d2 + 0.01); we += wgt; e += wgt * pts[k].elev; mo += wgt * pts[k].moist; te += wgt * pts[k].temp; se += wgt * pts[k].seas; }
    return { elev: e / we, moist: mo / we, temp: te / we, seas: se / we, biome: n0.biome, res: n0.res };
  }
  return { region, pts, sample, count: pts.length };
}
