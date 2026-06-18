// mesh.js — retile a chosen region as a detailed VORONOI mosaic, in the mappa style.
//
// Seeds are a jittered grid (deterministic, evenly covering). Adjacency is derived
// from a nearest-seed LABEL grid — exactly the rule the viewer rasterizes — so the
// routing graph the arteries grow on matches the cells you see. Each cell samples the
// continuous field at its seed, gets a base elevation/moisture/temperature/resource,
// and rivers are found by steepest-descent flow accumulation ON THE CELL GRAPH. Water
// and biome colour are computed per-era from a {seaLevel, tempShift} env, so the same
// mesh shows an ice-age coast and a warm one.
//
// Pure; deterministic; node + browser (no canvas — the viewer rasterizes for display).

import { hash2 } from './prng.js';
import { makeField } from './field.js';

export function buildMesh(seed, region, { spacing = 1.15, sampleScale = 6 } = {}) {
  const field = makeField(seed, { WW: 200, WH: 140 });
  const { x0, y0, x1, y1 } = region, RW = x1 - x0, RH = y1 - y0;

  // 1 — jittered-grid seeds in world coords (deterministic jitter via hash2)
  const cols = Math.max(4, Math.round(RW / spacing)), rows = Math.max(4, Math.round(RH / spacing));
  const cells = [];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const jx = (hash2(gx, gy, seed) - 0.5) * 0.8, jy = (hash2(gx, gy, seed ^ 0x55) - 0.5) * 0.8;
    const wx = x0 + (gx + 0.5 + jx) * (RW / cols), wy = y0 + (gy + 0.5 + jy) * (RH / rows);
    cells.push({ id: cells.length, wx, wy, gx, gy });
  }
  const N = cells.length;

  // 2 — bucket grid over the region for fast nearest-seed
  const bw = cols, bh = rows, buckets = Array.from({ length: bw * bh }, () => []);
  const bidx = (wx, wy) => {
    let bx = Math.floor((wx - x0) / RW * bw), by = Math.floor((wy - y0) / RH * bh);
    bx = Math.max(0, Math.min(bw - 1, bx)); by = Math.max(0, Math.min(bh - 1, by));
    return by * bw + bx;
  };
  cells.forEach((c) => buckets[bidx(c.wx, c.wy)].push(c.id));
  const nearest = (wx, wy) => {
    let bx = Math.floor((wx - x0) / RW * bw), by = Math.floor((wy - y0) / RH * bh);
    bx = Math.max(0, Math.min(bw - 1, bx)); by = Math.max(0, Math.min(bh - 1, by));
    let best = -1, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = bx + dx, ny = by + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      for (const id of buckets[ny * bw + nx]) { const c = cells[id], d = (c.wx - wx) ** 2 + (c.wy - wy) ** 2; if (d < bd) { bd = d; best = id; } }
    }
    if (best < 0) { for (const c of cells) { const d = (c.wx - wx) ** 2 + (c.wy - wy) ** 2; if (d < bd) { bd = d; best = c.id; } } }
    return best;
  };

  // 3 — label grid → adjacency (two cells adjacent if their labels touch on the grid)
  const sw = cols * sampleScale, sh = rows * sampleScale;
  const label = new Int32Array(sw * sh);
  for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) {
    const wx = x0 + (sx + 0.5) / sw * RW, wy = y0 + (sy + 0.5) / sh * RH;
    label[sy * sw + sx] = nearest(wx, wy);
  }
  const neigh = Array.from({ length: N }, () => new Set());
  const link = (a, b) => { if (a !== b && a >= 0 && b >= 0) { neigh[a].add(b); neigh[b].add(a); } };
  for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) {
    const i = label[sy * sw + sx];
    if (sx + 1 < sw) link(i, label[sy * sw + sx + 1]);
    if (sy + 1 < sh) link(i, label[(sy + 1) * sw + sx]);
  }
  cells.forEach((c) => { c.neigh = [...neigh[c.id]]; });

  // 4 — per-cell base terrain from the field (sea-level-independent)
  for (const c of cells) {
    c.elev = field.elevation(c.wx, c.wy);
    c.moist = field.moisture(c.wx, c.wy);
    c.tempBase = field.tempBase(c.wy);
    c.res = field.resource(c.wx, c.wy) > 0.985 ? (c.elev > 0.62 ? 'ore' : 'clay') : null;
  }

  // 5 — rivers: steepest-descent flow accumulation on the cell graph (sea level 0.42 baseline)
  const baseSea = 0.42;
  const order = cells.map((c) => c.id).sort((a, b) => cells[b].elev - cells[a].elev);
  for (const c of cells) c.flow = 1;
  for (const id of order) {
    const c = cells[id]; let lo = -1, le = c.elev;
    for (const n of c.neigh) if (cells[n].elev < le) { le = cells[n].elev; lo = n; }
    c.down = lo;
    if (lo >= 0 && cells[lo].elev >= baseSea) cells[lo].flow += c.flow;  // pour into the lower LAND neighbour
  }
  const flows = cells.filter((c) => c.elev >= baseSea).map((c) => c.flow).sort((a, b) => a - b);
  const riverThresh = flows.length ? Math.max(5, flows[Math.floor(flows.length * 0.92)]) : 1e9;
  for (const c of cells) c.river = (c.elev >= baseSea && c.flow >= riverThresh) ? 1 : 0;

  return { seed, region, cells, cols, rows, sw, sh, label, field, baseSea };
}

// per-era cell state: water + a colour in the mappa earthy/biome palette
export function cellState(c, env) {
  const seaLevel = env.seaLevel, tShift = env.tempShift || 0;
  if (c.elev < seaLevel) {                                        // ocean / lake
    const d = Math.max(0, Math.min(1, (seaLevel - c.elev) / 0.4));
    return { water: 1, rgb: [21 + (1 - d) * 18, 50 + (1 - d) * 20, 64 + (1 - d) * 16] };
  }
  const above = c.elev - seaLevel, tEff = c.tempBase - above * 1.4 + tShift;
  if (tEff < 0.12) return { water: 0, ice: 1, rgb: [205, 214, 220] };           // ice/glacier
  if (tEff < 0.26) return { water: 0, rgb: [150, 156, 150] };                    // tundra
  const m = c.moist;
  let rgb;
  if (m < 0.35) rgb = [188, 168, 110];                                          // arid tan
  else if (m < 0.6) rgb = [150, 158, 92];                                       // steppe/savanna
  else rgb = [92, 128, 72];                                                     // forest green
  const hi = Math.min(1, above * 1.8); rgb = rgb.map((v, k) => Math.round(v * (1 - hi * 0.4) + [120, 110, 96][k] * hi * 0.4));
  if (c.river) rgb = [Math.round(rgb[0] * 0.6 + 47 * 0.4), Math.round(rgb[1] * 0.6 + 111 * 0.4), Math.round(rgb[2] * 0.6 + 134 * 0.4)];
  return { water: 0, rgb };
}

// is a land cell habitable in this era (drives nucleation/growth)
export function habitable(c, env) {
  if (c.elev < env.seaLevel) return false;
  const tEff = c.tempBase - (c.elev - env.seaLevel) * 1.4 + (env.tempShift || 0);
  return tEff > 0.2;
}
