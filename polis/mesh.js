// mesh.js — retile a mappa region as a finer VORONOI mosaic carrying REAL terrain.
//
// Seeds are a jittered grid (deterministic). Each cell samples the mappa-backed
// `sampler` (IDW-smoothed real elevation/temperature/moisture + nearest biome), so the
// tiles are finer than mappa's cells but the terrain is the real planet. Adjacency
// comes from a nearest-seed LABEL grid (matches what the viewer rasterizes). Rivers are
// re-derived by flow accumulation on the cell graph over the real elevation. Water and
// colour are computed per-era from {seaLevel, tempShift} so the same mesh shows an
// ice-age coast (sea retreats, glaciers spread) and a warm, high-sea-level one.
//
// mappa elevation convention: 0 = shore, + = land, − = sea. Temperature is °C.

import { hash2 } from './prng.js';
import { BIOMES } from './mappaWorld.js';

export function buildMesh(seed, region, sampler, { spacing = 0.95, sampleScale = 6 } = {}) {
  const { x0, y0, x1, y1 } = region, RW = x1 - x0, RH = y1 - y0;
  const cols = Math.max(4, Math.round(RW / spacing)), rows = Math.max(4, Math.round(RH / spacing));
  const cells = [];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const jx = (hash2(gx, gy, seed) - 0.5) * 0.8, jy = (hash2(gx, gy, seed ^ 0x55) - 0.5) * 0.8;
    const wx = x0 + (gx + 0.5 + jx) * (RW / cols), wy = y0 + (gy + 0.5 + jy) * (RH / rows);
    cells.push({ id: cells.length, wx, wy, gx, gy });
  }
  const N = cells.length;

  // bucket grid for nearest-seed
  const bw = cols, bh = rows, buckets = Array.from({ length: bw * bh }, () => []);
  const bxy = (wx, wy) => { let bx = Math.floor((wx - x0) / RW * bw), by = Math.floor((wy - y0) / RH * bh); return [Math.max(0, Math.min(bw - 1, bx)), Math.max(0, Math.min(bh - 1, by))]; };
  cells.forEach((c) => { const [bx, by] = bxy(c.wx, c.wy); buckets[by * bw + bx].push(c.id); });
  const nearest = (wx, wy) => {
    const [bx, by] = bxy(wx, wy); let best = 0, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = bx + dx, ny = by + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue; for (const id of buckets[ny * bw + nx]) { const c = cells[id], d = (c.wx - wx) ** 2 + (c.wy - wy) ** 2; if (d < bd) { bd = d; best = id; } } }
    return best;
  };

  // label grid → adjacency
  const sw = cols * sampleScale, sh = rows * sampleScale, label = new Int32Array(sw * sh);
  for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) label[sy * sw + sx] = nearest(x0 + (sx + 0.5) / sw * RW, y0 + (sy + 0.5) / sh * RH);
  const neigh = Array.from({ length: N }, () => new Set());
  const link = (a, b) => { if (a !== b) { neigh[a].add(b); neigh[b].add(a); } };
  for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) { const i = label[sy * sw + sx]; if (sx + 1 < sw) link(i, label[sy * sw + sx + 1]); if (sy + 1 < sh) link(i, label[(sy + 1) * sw + sx]); }
  cells.forEach((c) => { c.neigh = [...neigh[c.id]]; });

  // per-cell REAL terrain from the mappa sampler
  for (const c of cells) { const s = sampler.sample(c.wx, c.wy); c.elev = s.elev; c.moist = s.moist; c.temp = s.temp; c.biome = s.biome; c.res = s.res; }

  // rivers: steepest-descent flow accumulation over land (mappa shore = elev 0)
  const baseSea = 0;
  const order = cells.map((c) => c.id).sort((a, b) => cells[b].elev - cells[a].elev);
  for (const c of cells) c.flow = 1;
  for (const id of order) { const c = cells[id]; let lo = -1, le = c.elev; for (const n of c.neigh) if (cells[n].elev < le) { le = cells[n].elev; lo = n; } c.down = lo; if (lo >= 0 && cells[lo].elev >= baseSea) cells[lo].flow += c.flow; }
  const fl = cells.filter((c) => c.elev >= baseSea).map((c) => c.flow).sort((a, b) => a - b);
  const riverThresh = fl.length ? Math.max(5, fl[Math.floor(fl.length * 0.92)]) : 1e9;
  for (const c of cells) c.river = (c.elev >= baseSea && c.flow >= riverThresh) ? 1 : 0;

  return { seed, region, cells, cols, rows, sw, sh, label, baseSea };
}

// hsl → rgb (mappa biome palette is hsl)
function hsl(h, s, l) {
  s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// per-era cell state: water + colour. seaLevel is a threshold around mappa's shore (0):
// negative in the ice age (sea retreats), positive in the future (sea rises). tempShift °C.
export function cellState(c, env) {
  const seaLevel = env.seaLevel || 0, tShift = env.tempShift || 0;
  if (c.elev < seaLevel) { const d = Math.max(0, Math.min(1, (seaLevel - c.elev) / 0.4)); return { water: 1, rgb: [21 + (1 - d) * 16, 50 + (1 - d) * 18, 64 + (1 - d) * 14] }; }
  const tEff = c.temp + tShift;
  if (tEff < -8) return { water: 0, ice: 1, rgb: [210, 218, 224] };       // glacier in cold eras
  if (tEff < -2) return { water: 0, rgb: [156, 162, 156] };               // tundra
  const b = BIOMES[c.biome] || BIOMES[8];
  let rgb = hsl(b.h, b.s, b.l);
  if (c.river) rgb = [Math.round(rgb[0] * 0.55 + 47 * 0.45), Math.round(rgb[1] * 0.55 + 111 * 0.45), Math.round(rgb[2] * 0.55 + 134 * 0.45)];
  return { water: 0, rgb };
}

export function habitable(c, env) {
  if (c.elev < (env.seaLevel || 0)) return false;
  return (c.temp + (env.tempShift || 0)) > -2;
}
