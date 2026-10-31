// coastworld.js — the coast in three dimensions, to fly: world.js's contract (a heightmap, every cell
// a palette index, trees, a cottage, a loop) for coast.js's painting. Pure: node and browser.
//
// The sea lies to one side, its bearing drawn from the seed; a beach runs along a bay, dunes behind
// it, hills and then mountains inland; a headland juts out with cliffs on three sides, a lighthouse
// and the keeper's cottage on top, and stacks off its tip. The surf is the painting's: one 16-phase
// cycle whose phase is the distance from the waterline, so the breakers roll in on the palette even
// as the camera flies over them, and the wash runs up the sand on the same beat.
import { mulberry32, hash2, fbm2, noise2, clamp, smooth, lerp } from './scene.js';
import { COASTS } from './coast.js';
import { N, CELL, SIZE, KIND, NORMALS, heightAt, loopThrough } from './world.js';

const ridged2 = (x, y, s) => { let a = 0, w = 0.5, f = 1; for (let k = 0; k < 5; k++) { const n = 1 - Math.abs(noise2(x * f, y * f, s + k * 11) * 2 - 1); a += w * n * n; w *= 0.5; f *= 2.05; } return a / 0.97; };
const fbm1 = (x, s) => fbm2(x, 0.5, s, 4);
const SEA = [1, 0.86, 0.62, 0.42, 0.28, 0.18, 0.12, 0.08, 0.05, 0, 0, 0, 0, -0.05, -0.12, -0.2];
const SAND = [[0.95, 1], [0.55, 1], [0.12, 1], [0, 0.92], [0, 0.8], [0, 0.66], [0, 0.52], [0, 0.4], [0, 0.3], [0, 0.22], [0, 0.17], [0, 0.14], [0, 0.12], [0, 0.12], [0, 0.14], [0, 0.2]];
const CREST = 12;

export function buildCoastWorld(seed = 1) {
  const rnd = mulberry32(seed * 7919 + 101);
  const biome = Object.keys(COASTS)[Math.floor(rnd() * 3)], B = COASTS[biome];   // the painting's first draw
  const S = (seed * 173 + 37) % 100000, C = SIZE / 2;
  const theta = rnd() * Math.PI * 2, n = [Math.sin(theta), Math.cos(theta)], tg = [Math.cos(theta), -Math.sin(theta)];
  const side = rnd() < 0.5 ? -1 : 1, uH = side * (650 + rnd() * 250);   // the headland, along the coast
  const plateau = 50 + rnd() * 30, reachH = 450 + rnd() * 200, peaks = 380 + rnd() * 300;
  const coastAt = (u) => -120 + 140 * (fbm1(u / 900, S + 1) - 0.5) - 260 * Math.exp(-(((u + side * 150) / 700) ** 2));

  const height = new Float32Array(N * N), kind = new Uint8Array(N * N), index = new Uint8Array(N * N);
  const head = new Float32Array(N * N);                    // how much of the headland a cell is (0..1)
  const stacks = [0, 1].map((k) => ({ u: uH + side * (k ? 60 : -40) + (rnd() - 0.5) * 80, s: reachH + 90 + k * 70 + rnd() * 40, r: 14 + rnd() * 8, h: 25 + rnd() * 25 }));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * CELL - C, y = j * CELL - C, s = x * n[0] + y * n[1], u = x * tg[0] + y * tg[1];
    const c = coastAt(u), d = s - c;                       // d > 0: seaward of the beach's line
    let h;
    if (d > 0) h = -0.4 - d * 0.018 - 6 * smooth(0, 500, d);
    else {
      const dl = -d;
      h = dl * 0.035;
      if (dl > 60) h = 2.1 + smooth(60, 120, dl) * (3 + 9 * fbm2((x + C) / 90, (y + C) / 90, S + 2, 3)) * smooth(320, 200, dl);
      if (dl > 200) h = Math.max(h, 4 + (dl - 200) * 0.045 + smooth(200, 600, dl) * fbm2((x + C) / 300, (y + C) / 300, S + 3, 4) * 60);
      h += smooth(1300, 2600, dl) * (ridged2((x + C) / 1000, (y + C) / 1000, S + 4) * peaks + 40);
    }
    // the headland: a plateau with cliffs, narrowing to its tip
    const w = 300 - Math.max(0, s - c) * 0.22, m = smooth(w, w - 50, Math.abs(u - uH)) * smooth(reachH + 30, reachH - 40, s - c) * smooth(c - 400, c - 150, s);
    const top = plateau + fbm2((x + C) / 160, (y + C) / 160, S + 5, 3) * 14 - Math.max(0, s - c) * 0.02;
    const hm = smooth(0.35, 0.6, m);
    if (hm > 0) h = Math.max(h, lerp(h, top, hm));
    head[j * N + i] = hm;
    for (const st of stacks) {
      const r = Math.hypot(u - st.u, s - c - st.s);
      if (r < st.r) h = Math.max(h, st.h * (1 - (r / st.r) ** 4) + fbm2((x + C) / 20, (y + C) / 20, S + 6, 2) * 6);
    }
    height[j * N + i] = h;
    kind[j * N + i] = h <= 0 ? KIND.lake : KIND.land;
  }

  // ---- distance to the waterline, in cells (both ways, up to 24): the surf's and the wash's phase
  const FAR_ = 255, toLand = new Uint8Array(N * N).fill(FAR_), toSea = new Uint8Array(N * N).fill(FAR_);
  const front = (seedMask, out) => {
    let q = [];
    for (let k = 0; k < N * N; k++) if (seedMask(k)) { out[k] = 0; q.push(k); }
    for (let dd = 1; dd <= 24 && q.length; dd++) {
      const nq = [];
      for (const k of q) { const i = k % N, j = (k / N) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue; const kk = b * N + a; if (out[kk] === FAR_) { out[kk] = dd; nq.push(kk); } } }
      q = nq;
    }
  };
  front((k) => kind[k] !== KIND.lake, toLand);
  front((k) => kind[k] === KIND.lake, toSea);

  // ---- the palette
  const entries = [], cycles = [];
  const alloc = (cnt, make) => { const lo = entries.length; for (let i = 0; i < cnt; i++) entries.push(make(i)); return lo; };
  const mat = (alb, name) => alloc(17, (i) => ({ k: 'land3', alb, n: NORMALS[i], name }));
  const darker = (c, k) => c.map((v) => v * k);
  const M = {
    grass: mat(B.ground, 'grass'), grass2: mat(darker(B.ground, 0.82).map((v, i) => v + [0.02, 0.03, 0][i]), 'grass'),
    rock: mat(B.cliff, 'rock'), rock2: mat(darker(B.cliff, 0.78).map((v, i) => v + [0.03, 0.02, 0.02][i]), 'rock'),
    sand: mat(B.sand, 'sand'), dune: mat(B.dune, 'grass'),
  };
  const LAKE = 12, lake = alloc(LAKE, (i) => ({ k: 'lake3', hl: [1, 0.2, 0, 0.4, 0, 0, 0.7, 0.1, 0, 0.3, 0, 0][i] }));
  const surf = alloc(16, (i) => ({ k: 'surf3', s: SEA[((CREST - i) % 16 + 16) % 16] }));
  const wash = alloc(16, (i) => { const [f, wet] = SAND[((CREST - i) % 16 + 16) % 16]; return { k: 'wash3', s: f, wet }; });
  const foam = alloc(8, (i) => ({ k: 'foam3', s: [1, 0.7, 0.45, 0.3, 0.55, 0.85, 0.4, 0.25][i] }));
  const pine = alloc(8, (i) => ({ k: 'land3', alb: [0.1, 0.22, 0.14], n: [0.85 * Math.sin(i * Math.PI / 4), 0.85 * Math.cos(i * Math.PI / 4), 0.5], name: 'pine' }));
  const trunk = alloc(1, () => ({ k: 'land3', alb: [0.18, 0.12, 0.08], n: [0, 0, 1], name: 'trunk' }));
  const cabinW = alloc(4, (i) => ({ k: 'land3', alb: B.wall, n: [[0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0]][i], name: 'wall' }));
  const cabinR = alloc(2, (i) => ({ k: 'land3', alb: B.roof, n: i ? [0.6, 0, 0.8] : [-0.6, 0, 0.8], name: 'roof' }));
  const windowE = alloc(1, () => ({ k: 'window', ph: 0 }));
  const towerW = alloc(8, (i) => ({ k: 'land3', alb: B.wall, n: [Math.sin(i * Math.PI / 4), Math.cos(i * Math.PI / 4), 0.15], name: 'tower' }));
  const towerB = alloc(8, (i) => ({ k: 'land3', alb: B.band, n: [Math.sin(i * Math.PI / 4), Math.cos(i * Math.PI / 4), 0.15], name: 'tower' }));
  const lamp = alloc(1, () => ({ k: 'lamp3' })), iron = alloc(1, () => ({ k: 'land3', alb: [0.1, 0.1, 0.11], n: [0, 0, 1], name: 'tower' }));
  cycles.push({ lo: lake, len: LAKE, perBeat: 1, name: 'sea' }, { lo: surf, len: 16, perBeat: 2, name: 'surf' },
    { lo: wash, len: 16, perBeat: 2, name: 'surf on the sand' }, { lo: foam, len: 8, perBeat: 4, name: 'spray' });

  // ---- each cell's index
  const ZONE = 18, SWASH = 5;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = i * CELL, y = j * CELL, h = height[k];
    const line = fbm2(x / 500, y / 500, S + 7, 3) * 10;          // the wave lines' wander
    if (kind[k] === KIND.lake) {
      const d = toLand[k];
      // white water at the foot of the cliffs and stacks: spray, not surf
      if (d <= 2 && head[k] > 0.05 || d <= 2 && h < -3) { kind[k] = KIND.foam; index[k] = foam + ((Math.floor(hash2(i >> 1, j >> 1, S + 8) * 8 + d)) % 8); continue; }
      if (d < ZONE && hash2(i, j, S + 9) < 1.15 - d / ZONE) {
        const phi = -(d / ZONE) * 40 + line + (hash2(i, j, S + 10) - 0.5) * (1.2 + 5 * smooth(0.45, 0.1, d / ZONE));
        kind[k] = KIND.foam; index[k] = surf + ((Math.floor(phi) % 16) + 16) % 16; continue;
      }
      const wob = Math.sin(x * 0.011 + y * 0.004) * 9 + Math.sin(y * 0.017 - x * 0.006) * 6;
      index[k] = lake + ((Math.floor((y * 0.6 + x * 0.25 + wob) / 3.5) % LAKE) + LAKE) % LAKE; continue;
    }
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    const gx = (height[j * N + i1] - height[j * N + i0]) / ((i1 - i0) * CELL), gy = (height[j1 * N + i] - height[j0 * N + i]) / ((j1 - j0) * CELL);
    const nl = Math.hypot(gx, gy, 1), tilt = Math.acos(1 / nl) * 180 / Math.PI;
    const az = Math.atan2(-gx, -gy) + (hash2(i, j, S + 20) - 0.5) * 0.35, tj = tilt + (hash2(i, j, S + 21) - 0.5) * 6;
    const bucket = tj < 12 ? 0 : (tj < 40 ? 1 : 9) + ((Math.round(az / (Math.PI / 4)) % 8) + 8) % 8;
    // a cell at the foot or the lip of a cliff is drawn up the face (heights interpolate between
    // cells), so it must be rock, or sand, surf and grass streak down the cliff
    let drop = 0; for (const kk of [k - 1, k + 1, k - N, k + N]) if (kk >= 0 && kk < N * N) drop = Math.max(drop, Math.abs(height[kk] - h));
    if (drop < 5 && toSea[k] < SWASH * 1.4 && h < 1.6 && head[k] < 0.05 && hash2(i, j, S + 22) < 1.4 - toSea[k] / SWASH) {
      const phi = (toSea[k] / SWASH) * 14 + line;
      index[k] = wash + ((Math.floor(phi) % 16) + 16) % 16; continue;
    }
    let m;
    const strata = fbm2(x / 140, y / 140 + h / 40, S + 23, 2);
    if (tilt > 38 || h > 300 + fbm2(x / 300, y / 300, S + 24, 3) * 100) m = strata > 0.55 ? M.rock2 : M.rock;
    else if (h < 3.2 && head[k] < 0.3) m = M.sand;
    else if (h < 16 && head[k] < 0.3) m = fbm2(x / 40, y / 40, S + 25, 3) + (hash2(i, j, S + 26) - 0.5) * 0.4 > 0.5 ? M.dune : M.sand;
    else m = fbm2(x / 70, y / 70, S + 27, 3) + (hash2(i, j, S + 28) - 0.5) * 0.25 > 0.52 ? M.grass2 : M.grass;
    if (drop > 5 && m !== M.rock && m !== M.rock2) m = M.rock;
    index[k] = m + bucket;
    if ((tilt > 50 || drop > 5) && (m === M.rock || m === M.rock2)) { kind[k] = KIND.cliff; index[k] = M.rock + bucket; }
  }

  // ---- pines, inland only
  const trees = [];
  for (let q = 0; q < 26000 && trees.length < 4000; q++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, i = Math.floor(x / CELL), j = Math.floor(y / CELL), k = j * N + i;
    if (kind[k] !== KIND.land || head[k] > 0.1) continue;
    const h = height[k], e = entries[index[k]];
    if (h < 25 || h > 280 || !e || e.name !== 'grass') continue;
    if (fbm2(x / 240, y / 240, S + 30, 4) < 0.52 + rnd() * 0.08) continue;
    trees.push(x, y, h - 1, 9 + rnd() * 13);
  }

  // ---- the lighthouse near the headland's tip, the cottage behind it
  const at = (u, s) => ({ x: C + n[0] * s + tg[0] * u, y: C + n[1] * s + tg[1] * u });
  const cH = coastAt(uH);
  let lh = at(uH, cH + reachH * 0.72);
  for (let s = reachH * 0.72; s > 0; s -= 8) { const p = at(uH, cH + s); if (heightAt({ height }, p.x, p.y) > plateau * 0.8) { lh = p; break; } }
  const lighthouse = { ...lh, z: heightAt({ height }, lh.x, lh.y), h: 22, r: 3.4, white: towerW, band: towerB, lamp, iron, period: 12 };
  const cb = at(uH - side * 22, cH + reachH * 0.6);
  let cp = cb;
  for (let s = 0; s < 300; s += 8) { const p = at(uH - side * 22, cH + reachH * 0.6 - s); if (Math.abs(heightAt({ height }, p.x, p.y) - plateau) < 25) { cp = p; break; } }
  const cabin = { x: cp.x, y: cp.y, z: heightAt({ height }, cp.x, cp.y), facing: theta, w: 8, d: 6, h: 4, wall: cabinW, roof: cabinR, window: windowE };

  const world = {
    kind: 'coast', seed, biome, N, CELL, SIZE, height, kind, index, entries, cycles, trees: new Float32Array(trees),
    slots: { lake, fall: foam, foam, pine, trunk, window: windowE, strata: M.rock2 - M.rock, surf, wash },
    fallAt: { x: -1e9, y: -1e9 }, lake: { x: C, y: C, r: 0 }, cabin, lighthouse, skyTurn: B.skyTurn, water: B.water, shallow: B.shallow, sand: B.sand,
    bpm: 48 + Math.floor(rnd() * 18), waterfall: { width: 0 }, cliffLeft: false,
  };
  let maxH = 0; for (let k = 0; k < N * N; k++) if (height[k] > maxH) maxH = height[k];
  world.maxH = maxH + 1;
  // ---- the loop: along the beach low over the breakers, round the headland's tip past the light,
  // back over its cliffs and inland across the dunes, and out to sea again
  const c0 = coastAt(-uH), cB = coastAt(-side * 150);
  const P = (u, s, z, look = 0) => ({ ...at(u, s), z, look });
  const pts = [
    P(-uH * 1.1, c0 + 260, 40, -0.05),
    P(-uH * 0.5, coastAt(-uH * 0.5) + 70, 16, 0.02),
    P(-side * 150, cB + 55, 14, 0.02),                 // low over the surf in the bay
    P(uH * 0.55, coastAt(uH * 0.55) + 110, 20),
    P(uH - side * 340, cH + reachH * 0.8, 30, 0.08),
    P(uH, cH + reachH + 240, 40, 0.1),                  // off the tip, the light ahead and above
    P(uH + side * 360, cH + reachH * 0.55, 45, 0.05),
    P(uH + side * 260, cH + 80, plateau + 40, -0.05),   // over the cliff top
    P(uH * 0.4, cB - 700, 160, -0.12),                  // inland, high, looking back at the sea
    P(-uH * 0.7, c0 - 500, 110, -0.08),
    P(-uH * 1.2, c0 - 60, 40, -0.02),
  ];
  const PLACES = ['sea', 'sea', 'sea', 'sea', 'mountains', 'stars', 'mountains', 'mountains', 'river', 'lake', 'sea'];
  world.path = loopThrough(world, pts, PLACES);
  if (entries.length > 256) throw new Error(`palette overflow ${entries.length}`);
  world.used = entries.length;
  while (entries.length < 256) entries.push({ k: 'unused' });
  return world;
}
