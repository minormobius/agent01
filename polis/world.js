// world.js — roll a coarse world from the field, then AUTO-SELECT the sub-region
// richest in city locations. The coarse pass is just for picking where to play; the
// chosen rectangle is handed to mesh.js to retile at high detail.
//
// "City-richness" of a coarse cell ≈ habitable land next to water with a fertile,
// temperate hinterland — the same site/situation logic, sampled coarsely. We slide a
// window over the world and keep the highest-scoring placement (over open ocean a
// window scores ~0, so it gravitates to a good coastline with rivers + plains).
//
// Pure; deterministic; node + browser.

import { makeField } from './field.js';

export function rollWorld(seed, { cols = 200, rows = 140, seaLevel = 0.42 } = {}) {
  const field = makeField(seed, { WW: cols, WH: rows });
  const elev = new Float32Array(cols * rows), moist = new Float32Array(cols * rows), temp = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    elev[i] = field.elevation(x, y); moist[i] = field.moisture(x, y);
    temp[i] = field.tempBase(y) - Math.max(0, elev[i] - seaLevel) * 1.4;
  }
  // per-cell "site goodness": habitable land near water with fertile temperate hinterland
  const good = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    let landN = 0, waterN = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (elev[ny * cols + nx] < seaLevel) waterN++; else landN++;
    }
    if (elev[i] < seaLevel) { good[i] = landN > 0 ? 0.35 : 0; continue; } // coastal water is valuable; open ocean isn't
    const fertile = moist[i] * Math.max(0, 1 - (elev[i] - seaLevel) * 2);
    const temperate = Math.max(0, 1 - Math.abs(temp[i] - 0.55) * 2.2);
    good[i] = (0.5 * (waterN > 0 ? 1 : 0) + 0.6 * fertile + 0.5 * temperate) * (temp[i] > 0.15 ? 1 : 0.2);
  }
  return { field, cols, rows, seaLevel, elev, moist, temp, good };
}

// slide a window (ww×wh coarse cells), return the best-scoring rectangle in world coords
export function selectRegion(world, { ww = 56, wh = 40, step = 4, pad = 2 } = {}) {
  const { cols, rows, good } = world;
  // integral image of `good` for O(1) window sums
  const W = cols + 1, S = new Float64Array(W * (rows + 1));
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    S[(y + 1) * W + (x + 1)] = good[y * cols + x] + S[y * W + (x + 1)] + S[(y + 1) * W + x] - S[y * W + x];
  const sum = (x0, y0, x1, y1) => S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0];
  let best = -1, bx = pad, by = pad;
  for (let y = pad; y + wh <= rows - pad; y += step) for (let x = pad; x + ww <= cols - pad; x += step) {
    const v = sum(x, y, x + ww, y + wh);
    if (v > best) { best = v; bx = x; by = y; }
  }
  return { x0: bx, y0: by, x1: bx + ww, y1: by + wh, score: best };
}
