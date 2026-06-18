// substrate.js — a deterministic toy region the proto-towns grow on.
//
// This is the stand-in for mappa: a small W×H grid with elevation, sea/lake,
// moisture, rivers (steepest-descent flow accumulation), fertility, and a couple
// of resource deposits. It is intentionally self-contained (no WASM, no sphere) so
// the proto runs in node and the browser — but it exposes the SAME per-cell signals
// a real mappa reader would (`elev`, `water`, `river`, `moisture`, `fertility`,
// `resource`), so the site/economy layers above never learn it's a toy.
//
// Determinism: every field is a pure function of (seed, x, y) or a deterministic
// pass over the grid — same seed → same region, always.

import { hash2 } from './prng.js';

// smoothed bilinear value noise + 5-octave fbm
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, s) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < 5; o++) { sum += amp * vnoise(x * f, y * f, s + o * 131); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

export function buildRegion(seed, { W = 96, H = 72, waterFrac = 0.40 } = {}) {
  const N = W * H, idx = (x, y) => y * W + x;
  const sc = 7 / Math.max(W, H);

  // 1 — elevation, with a soft bowl so coasts tend to sit toward the edges
  const elev = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = fbm(x * sc + 3, y * sc + 3, seed);
    const dx = (x / (W - 1)) * 2 - 1, dy = (y / (H - 1)) * 2 - 1;
    const edge = Math.max(Math.abs(dx), Math.abs(dy));          // 0 centre → 1 border
    elev[idx(x, y)] = e * 0.88 + (1 - edge * edge) * 0.12;       // gentle bowl: rim tends to sea, interior keeps lakes/valleys
  }

  // 2 — sea level by target water fraction
  const sorted = Float32Array.from(elev).sort();
  const seaLevel = sorted[Math.min(N - 1, Math.floor(N * waterFrac))];

  // 3 — water class: ocean = below-sea cells reachable from the border; else lake
  const water = new Uint8Array(N);                              // 0 land · 1 ocean · 2 lake
  for (let i = 0; i < N; i++) if (elev[i] < seaLevel) water[i] = 2; // provisionally all lake
  const q = [];
  for (let x = 0; x < W; x++) { for (const y of [0, H - 1]) if (water[idx(x, y)] === 2) { water[idx(x, y)] = 1; q.push(idx(x, y)); } }
  for (let y = 0; y < H; y++) { for (const x of [0, W - 1]) if (water[idx(x, y)] === 2) { water[idx(x, y)] = 1; q.push(idx(x, y)); } }
  const nb4 = (i) => { const x = i % W, y = (i / W) | 0, o = []; if (x > 0) o.push(i - 1); if (x < W - 1) o.push(i + 1); if (y > 0) o.push(i - W); if (y < H - 1) o.push(i + W); return o; };
  for (let h = 0; h < q.length; h++) for (const j of nb4(q[h])) if (water[j] === 2) { water[j] = 1; q.push(j); }

  // 4 — moisture: multi-source BFS distance from any water, then exp falloff
  const dist = new Int32Array(N).fill(-1); const wq = [];
  for (let i = 0; i < N; i++) if (water[i]) { dist[i] = 0; wq.push(i); }
  for (let h = 0; h < wq.length; h++) for (const j of nb4(wq[h])) if (dist[j] < 0) { dist[j] = dist[wq[h]] + 1; wq.push(j); }
  const moisture = new Float32Array(N);
  for (let i = 0; i < N; i++) moisture[i] = water[i] ? 1 : Math.exp(-dist[i] / 9);

  // 5 — rivers: steepest-descent flow accumulation over land (water cells are sinks)
  const flow = new Float32Array(N).fill(1);                     // each land cell starts with 1 unit of rain
  const land = []; for (let i = 0; i < N; i++) if (!water[i]) land.push(i);
  land.sort((a, b) => elev[b] - elev[a]);                       // high → low
  const downhill = new Int32Array(N).fill(-1);
  for (const i of land) {
    let best = -1, be = elev[i];
    for (const j of nb4(i)) if (elev[j] < be) { be = elev[j]; best = j; }
    downhill[i] = best;
    if (best >= 0 && !water[best]) flow[best] += flow[i];       // pour into the lower land neighbour
  }
  const lf = []; for (const i of land) lf.push(flow[i]);
  lf.sort((a, b) => a - b);
  const riverThresh = Math.max(6, lf[Math.floor(lf.length * 0.93)] || 6); // top ~7% of land flow are channels
  const river = new Uint8Array(N);                              // 1 = a watercourse
  for (const i of land) if (flow[i] >= riverThresh) river[i] = 1;
  // river mouths: a river land-cell touching ocean
  const mouth = new Uint8Array(N);
  for (const i of land) if (river[i]) for (const j of nb4(i)) if (water[j] === 1) { mouth[i] = 1; break; }

  // 6 — fertility: wet lowland is fertile; steep/high/dry is not
  const fertility = new Float32Array(N);
  for (const i of land) {
    const above = Math.max(0, elev[i] - seaLevel);
    fertility[i] = Math.max(0, moisture[i] * (1 - Math.min(1, above * 2.2)));
  }

  // 7 — resources: one ore lode in the highlands, scattered minor deposits (deterministic)
  const resource = new Array(N).fill(null);
  let hi = -1, hv = -1; for (const i of land) if (elev[i] > hv) { hv = elev[i]; hi = i; }
  if (hi >= 0) resource[hi] = 'ore';
  for (const i of land) if (!resource[i] && hash2(i % W, (i / W) | 0, seed ^ 0x5a17) > 0.985) resource[i] = (elev[i] > seaLevel + 0.25) ? 'ore' : 'clay';

  return {
    W, H, N, idx, seaLevel, seed,
    elev, water, moisture, river, mouth, fertility, resource, downhill, flow,
    nb4,
  };
}
