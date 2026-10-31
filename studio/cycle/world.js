// world.js — the painting's world in three dimensions, to fly through. Pure: node and browser.
//
// A heightmap, 1024 × 1024 cells of 4 m (4 km square), x east and y north so the real sky lines up
// with it: a lake in a basin, meadows, a ring of mountains, and on one side a plateau ending in a
// cliff, with a river across the plateau that pours over the edge into the lake.
//
// Every cell is also a PALETTE INDEX, as in the painting: material × the way the ground faces
// (17 buckets: flat, then eight compass directions at two steepnesses) for land, and PHASE for
// water: the lake's index is a wobbling band, the river's is its distance downstream, the fall's is
// worked out per pixel from height as it is drawn (fly.js). So the world is indexed and the palette
// still does the light and the motion: turning the palette pours the river and the falls even
// while the camera flies.
//
// buildWorld(seed) → { N, CELL, height (Float32Array), index (Uint8Array), kind (Uint8Array),
//   entries, cycles, trees, cabin, path, ... };  heightAt(world, x, y) (bilinear, metres).
import { mulberry32, hash2, fbm2, rock, noise2, clamp, smooth, lerp, BIOMES } from './scene.js';

export const N = 1024, CELL = 4, SIZE = N * CELL;
export const KIND = { land: 0, lake: 1, river: 2, fall: 3, foam: 4, cabin: 5, cliff: 6, building: 7 };

const ridged2 = (x, y, s) => { let a = 0, w = 0.5, f = 1; for (let k = 0; k < 5; k++) { const n = 1 - Math.abs(noise2(x * f, y * f, s + k * 11) * 2 - 1); a += w * n * n; w *= 0.5; f *= 2.05; } return a / 0.97; };
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Normal buckets: 0 flat; 1–8 gentle (25°) N, NE, … ; 9–16 steep (58°). ENU unit vectors. */
export const NORMALS = (() => {
  const out = [[0, 0, 1]];
  for (const tilt of [25, 58]) for (let k = 0; k < 8; k++) {
    const az = k * Math.PI / 4, t = tilt * Math.PI / 180;
    out.push([Math.sin(t) * Math.sin(az), Math.sin(t) * Math.cos(az), Math.cos(t)]);
  }
  return out;
})();

export function buildWorld(seed = 1) {
  const rnd = mulberry32(seed * 9973 + 17);
  const biomeName = Object.keys(BIOMES)[Math.floor(rnd() * 4)];   // the painting's first draw: same biome
  const B = BIOMES[biomeName];
  const S = (seed * 131 + 7) % 100000;
  const C = SIZE / 2;
  const RL = 520 + rnd() * 140;                          // the lake's radius, metres
  const theta = rnd() * Math.PI * 2;                     // bearing of the cliff from the lake's centre
  const plateau = 95 + rnd() * 55;                       // the cliff's height
  const peaks = 520 + rnd() * 380;
  const snowLine = B.snow ? 330 + rnd() * 120 : 1e9, treeLine = 300 + rnd() * 80;
  const riverW = 7 + rnd() * 5;

  const height = new Float32Array(N * N), kind = new Uint8Array(N * N), index = new Uint8Array(N * N);
  const along = new Float32Array(N * N);                 // river: metres downstream (for its phase)
  // the river's line: from the cliff edge outward across the plateau, meandering
  const riverOff = (r) => 55 * Math.sin(r / 140 + seed) + 25 * Math.sin(r / 61 + seed * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * CELL, y = j * CELL, dx = x - C, dy = y - C, r = Math.hypot(dx, dy), th = Math.atan2(dx, dy);
    const a = angDiff(th, theta), win = smooth(0.42, 0.24, Math.abs(a));   // inside the cliff's arc
    const rl = RL + (fbm2(x / 380, y / 380, S + 1, 4) - 0.5) * 220 + win * 70;
    // basin, shore, meadows and hills
    let h;
    if (r < rl) h = -4 - 26 * smooth(rl, rl - 260, r);
    else h = (r - rl) * 0.05 + Math.pow(smooth(rl, rl + 220, r), 1.5) * fbm2(x / 260, y / 260, S + 2, 4) * 60;
    // the ring of mountains
    const ring = smooth(rl + 420, rl + 1500, r);
    h += ring * (ridged2(x / 1000, y / 1000, S + 3) * peaks + 60) + ring * fbm2(x / 90, y / 90, S + 4, 3) * 30;
    // the plateau and its cliff: a near-vertical step 30 m beyond the shore, inside the arc
    const step = smooth(rl + 22, rl + 38, r) * win;
    const top = plateau + (r - rl) * 0.06 + fbm2(x / 150, y / 150, S + 5, 3) * 14;
    if (step > 0) h = Math.max(h, lerp(h, top, step));
    // the river's valley: cut back through the mountains so the river comes from somewhere
    const off = r * angDiff(th, theta), lane = Math.abs(off - riverOff(r));
    if (r > rl + 30) {
      const floor = plateau + Math.max(0, r - rl - 40) * 0.075 + fbm2(x / 120, y / 120, S + 6, 3) * 10;
      const vee = floor + Math.max(0, lane - 30) * (0.55 + 0.35 * smooth(rl + 300, rl + 1100, r));
      h = Math.min(h, Math.max(vee, r < rl + 40 ? h : vee));
    }
    // the river: a channel cut into the valley floor, carrying water to the edge
    if (r > rl + 28 && r < rl + 1500 && lane < riverW * 1.8 && (win > 0.5 || r > rl + 200)) {
      const cut = smooth(riverW * 1.8, riverW * 0.6, lane) * 6;
      h -= cut;
      if (lane < riverW && r > rl + 36) { kind[j * N + i] = KIND.river; along[j * N + i] = 1500 - (r - rl); }
    }
    height[j * N + i] = h;
    if (h <= 0 && kind[j * N + i] === 0) kind[j * N + i] = KIND.lake;
  }
  // the fall: the cliff face where the river leaves the plateau
  const fallCells = [];
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const x = i * CELL, y = j * CELL, dx = x - C, dy = y - C, r = Math.hypot(dx, dy), th = Math.atan2(dx, dy);
    if (Math.abs(angDiff(th, theta)) > 0.42) continue;
    const off = r * angDiff(th, theta), lane = Math.abs(off - riverOff(r));
    const k = j * N + i, hx = height[k + 1] - height[k - 1], hy = height[k + N] - height[k - N];
    const slope = Math.hypot(hx, hy) / (2 * CELL);
    if (lane < riverW * 1.1 && slope > 1.2 && height[k] > -2) { kind[k] = KIND.fall; fallCells.push(k); }
  }
  // the plunge pool: foam on the lake at the foot of the fall
  let fx = 0, fy = 0;
  for (const k of fallCells) { fx += (k % N) * CELL; fy += Math.floor(k / N) * CELL; }
  fx /= fallCells.length || 1; fy /= fallCells.length || 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, d = Math.hypot(i * CELL - fx, j * CELL - fy);
    if (kind[k] === KIND.lake && d < 45 && hash2(i, j, S + 9) < 1.2 - d / 45) kind[k] = KIND.foam;
  }

  // ---- the palette: materials × facing, and the water's phases
  const entries = [], cycles = [];
  const alloc = (n, make) => { const lo = entries.length; for (let i = 0; i < n; i++) entries.push(make(i)); return lo; };
  const mat = (alb, name) => alloc(17, (i) => ({ k: 'land3', alb, n: NORMALS[i], name }));
  const darker = (c, k) => c.map((v) => v * k);
  const M = {
    grass: mat(B.ground, 'grass'), grass2: mat(darker(B.ground, 0.8).map((v, i) => v + [0.02, 0.03, 0][i]), 'grass'),
    rock: mat(B.cliff, 'rock'), rock2: mat(darker(B.far, 0.9), 'rock'), snow: mat([0.9, 0.92, 0.98], 'snow'),
    sand: mat([0.62, 0.55, 0.42], 'sand'),
  };
  const LAKE = 12, lake = alloc(LAKE, (i) => ({ k: 'lake3', hl: [1, 0.2, 0, 0.4, 0, 0, 0.7, 0.1, 0, 0.3, 0, 0][i] }));
  const river = alloc(12, (i) => ({ k: 'river3', s: [0.9, 0.5, 0.3, 0.6, 0.35, 0.8, 0.4, 0.3, 0.7, 0.45, 0.3, 0.55][i] }));
  const fall = alloc(16, () => ({ k: 'fall3', s: 0.35 + 0.65 * Math.pow(rnd(), 1.6) }));
  const foam = alloc(8, (i) => ({ k: 'foam3', s: [1, 0.7, 0.45, 0.3, 0.55, 0.85, 0.4, 0.25][i] }));
  const pine = alloc(8, (i) => ({ k: 'land3', alb: B.pine, n: [0.85 * Math.sin(i * Math.PI / 4), 0.85 * Math.cos(i * Math.PI / 4), 0.5], name: 'pine' }));
  const trunk = alloc(1, () => ({ k: 'land3', alb: [0.18, 0.12, 0.08], n: [0, 0, 1], name: 'trunk' }));
  const cabinW = alloc(4, (i) => ({ k: 'land3', alb: B.wall, n: [[0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0]][i], name: 'wall' }));
  const cabinR = alloc(2, (i) => ({ k: 'land3', alb: B.roof, n: i ? [0.6, 0, 0.8] : [-0.6, 0, 0.8], name: 'roof' }));
  const windowE = alloc(1, () => ({ k: 'window', ph: 0 }));
  cycles.push({ lo: lake, len: LAKE, perBeat: 1, name: 'lake' }, { lo: river, len: 12, perBeat: 6, name: 'river' },
    { lo: fall, len: 16, perBeat: 24, name: 'fall' }, { lo: foam, len: 8, perBeat: 6, name: 'foam' });

  // ---- each cell's index
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = i * CELL, y = j * CELL, h = height[k];
    if (kind[k] === KIND.lake) {
      const wob = Math.sin(x * 0.011 + y * 0.004) * 9 + Math.sin(y * 0.017 - x * 0.006) * 6;
      index[k] = lake + ((Math.floor((y * 0.6 + x * 0.25 + wob) / 3.5) % LAKE) + LAKE) % LAKE; continue;
    }
    if (kind[k] === KIND.foam) { index[k] = foam + ((Math.floor(-Math.hypot(x - fx, y - fy) / 3) % 8) + 8) % 8; continue; }
    if (kind[k] === KIND.river) { index[k] = river + ((Math.floor(-along[k] / 2.5) % 12) + 12) % 12; continue; }
    if (kind[k] === KIND.fall) { index[k] = fall; continue; }
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    const gx = (height[j * N + i1] - height[j * N + i0]) / ((i1 - i0) * CELL), gy = (height[j1 * N + i] - height[j0 * N + i]) / ((j1 - j0) * CELL);
    const nl = Math.hypot(gx, gy, 1), tilt = Math.acos(1 / nl) * 180 / Math.PI;
    // facing, dithered: a little noise on the azimuth and the tilt so the buckets break like brushwork
    const az = Math.atan2(-gx, -gy) + (hash2(i, j, S + 20) - 0.5) * 0.35;
    const tj = tilt + (hash2(i, j, S + 21) - 0.5) * 6;
    const bucket = tj < 12 ? 0 : (tj < 40 ? 1 : 9) + ((Math.round(az / (Math.PI / 4)) % 8) + 8) % 8;
    let m;
    const strata = rock(x / 140, y / 140 + h / 40, S + 22);
    if (h > snowLine + (fbm2(x / 400, y / 400, S + 23, 3) - 0.5) * 140 + tilt * 2.2 && tilt < 50) m = M.snow;
    else if (tilt > 38 || h > treeLine + 150 + (fbm2(x / 300, y / 300, S + 24, 3) - 0.5) * 100) m = strata > 0.55 ? M.rock2 : M.rock;
    else if (h < 2.5 && height[k] > -1) m = M.sand;
    else m = fbm2(x / 70, y / 70, S + 25, 3) + (hash2(i, j, S + 26) - 0.5) * 0.25 > 0.52 ? M.grass2 : M.grass;
    index[k] = m + bucket;
    // a cliff face: strata are drawn per row from height (fly.js), on the rock / rock2 pair
    if (tilt > 50 && (m === M.rock || m === M.rock2)) { kind[k] = KIND.cliff; index[k] = M.rock + bucket; }
  }

  // ---- pines: in groves on the meadows and lower slopes, none on the shore or the cliff face
  const trees = [];
  for (let n = 0; n < 26000 && trees.length < 5200; n++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, i = Math.floor(x / CELL), j = Math.floor(y / CELL), k = j * N + i;
    if (kind[k] !== KIND.land) continue;
    const h = height[k];
    if (h < 4 || h > treeLine) continue;
    const ent = entries[index[k]];
    if (!ent || ent.name !== 'grass') continue;
    if (fbm2(x / 240, y / 240, S + 30, 4) < 0.5 + rnd() * 0.08) continue;
    trees.push(x, y, h - 1, 9 + rnd() * 13);
  }

  // ---- the cabin: on the shore across the lake from the fall, a box with a gable roof
  const cb = theta + Math.PI + (rnd() - 0.5) * 0.6;
  let cx = C + Math.sin(cb) * RL, cy = C + Math.cos(cb) * RL;
  for (let s = 0; s < 400; s += 4) {                                  // walk out until on dry, gentle ground
    const tx = C + Math.sin(cb) * (RL + s), ty = C + Math.cos(cb) * (RL + s);
    const h = heightAt({ height }, tx, ty);
    if (h > 3) { cx = tx + Math.sin(cb) * 16; cy = ty + Math.cos(cb) * 16; break; }
  }
  const cabin = { x: cx, y: cy, z: heightAt({ height }, cx, cy), facing: cb + Math.PI, w: 9, d: 7, h: 4.5, wall: cabinW, roof: cabinR, window: windowE };

  const world = {
    seed, biome: biomeName, N, CELL, SIZE, height, kind, index, entries, cycles, trees: new Float32Array(trees),
    slots: { lake, river, fall, foam, pine, trunk, window: windowE, strata: M.rock2 - M.rock }, fallAt: { x: fx, y: fy },
    lake: { x: C, y: C, r: RL }, theta, plateau, cabin, skyTurn: B.skyTurn, water: B.water, bpm: 48 + Math.floor(rnd() * 18),
    waterfall: { width: riverW * 2 }, cliffLeft: false,
  };
  let maxH = 0; for (let k = 0; k < N * N; k++) if (height[k] > maxH) maxH = height[k];
  world.maxH = maxH + 1;
  world.path = flightPath(world, riverOff);
  if (entries.length > 256) throw new Error(`palette overflow ${entries.length}`);
  world.used = entries.length;
  while (entries.length < 256) entries.push({ k: 'unused' });
  return world;
}

/** Terrain height (metres) at world x, y: bilinear, mirrored at the edges so the world never ends. */
export function heightAt(world, x, y) {
  const n = world.N || N, cell = world.CELL || CELL, size = world.SIZE || SIZE;    // the city's world is finer (cityworld.js)
  const m = (v) => { v = ((v % (2 * size)) + 2 * size) % (2 * size); return v > size - cell ? Math.max(0, 2 * size - cell - v) : v; };   // (just short of 0, the mirror lands below it)
  const fx = m(x) / cell, fy = m(y) / cell, i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fy));
  const u = fx - i, v = fy - j, H = world.height, k = j * n + i;
  return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + n] * (1 - u) + H[k + n + 1] * u) * v;
}

// ---------------------------------------------------------------------------- the flight --
// A closed loop, flown once in five days: over the lake to the fall, up its face, along the river
// across the plateau, a long climbing turn round the mountains, down over the meadows to the
// cabin, and out over the water again. Catmull-Rom through waypoints, re-timed by arc length so
// the speed is even; never closer than 18 m to the ground.
function flightPath(world, riverOff) {
  const { lake, theta, plateau } = world;
  const P = (bear, r, z, look = 0) => ({ x: lake.x + Math.sin(bear) * r, y: lake.y + Math.cos(bear) * r, z, look });
  const along = (r, z, look = 0) => { const off = riverOff(r); const b = theta + off / Math.max(1, r); return P(b, r, z, look); };
  const R = lake.r;
  const pts = [
    P(theta + Math.PI, R * 0.55, 45),
    P(theta + Math.PI * 0.4, R * 0.2, 30),
    along(R - 110, 22, 0.15),
    along(R - 55, 30, 0.55),                    // at the foot of the fall, looking up
    along(R - 30, plateau * 0.6, 0.6),          // climbing its face
    along(R + 10, plateau + 22, 0.25),
    along(R + 160, plateau + 26),
    along(R + 420, plateau + 40),
    along(R + 700, plateau + 90, -0.05),
    P(theta + 0.7, R + 1050, 380, -0.1),
    P(theta + 1.7, R + 1150, 470, -0.12),
    P(theta + 2.6, R + 800, 260, -0.08),
    P(theta + Math.PI - 0.15, R + 170, 50, -0.02),
    P(theta + Math.PI + 0.05, R + 40, 24),      // low over the cabin's shore
  ];
  // what the music should be at each leg (compose.js's textures): the lake, up the fall, the
  // river, the mountains, and down past the cabin to the lake again
  const PLACES = ['lake', 'lake', 'falls', 'falls', 'falls', 'river', 'river', 'river', 'river', 'mountains', 'mountains', 'mountains', 'stars', 'lake'];
  return loopThrough(world, pts, PLACES, (x, y) => Math.hypot(x - world.fallAt.x, y - world.fallAt.y) < 170);
}

/**
 * A closed flight through waypoints { x, y, z, look }: the Catmull-Rom spline sampled densely,
 * lifted clear of the ground (30 m, and of slopes beside it, except where `close(x, y)` says it is
 * flown close on purpose: 16 m), smoothed, and indexed by arc length. `places` names each leg.
 */
export function loopThrough(world, pts, PLACES, close = () => false) {
  // sample the closed spline densely, lift it clear of the ground, and index by arc length
  const n = pts.length, samples = [];
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let s = 0; s < n; s++) for (let q = 0; q < 200; q++) {
    const t = q / 200, a = pts[(s - 1 + n) % n], b = pts[s], c = pts[(s + 1) % n], d = pts[(s + 2) % n];
    const x = cr(a.x, b.x, c.x, d.x, t), y = cr(a.y, b.y, c.y, d.y, t);
    let z = cr(a.z, b.z, c.z, d.z, t);
    let ground = heightAt(world, x, y);
    const nearFall = close(x, y);                                                // the fall is flown close on purpose
    if (!nearFall) for (let a = 0; a < 8; a++) for (const rr of [40, 90]) ground = Math.max(ground, heightAt(world, x + Math.sin(a * 0.785) * rr, y + Math.cos(a * 0.785) * rr) - rr * 0.25);
    z = Math.max(z, ground + (nearFall ? 16 : 30), 14);
    samples.push({ x, y, z, look: cr(a.look, b.look, c.look, d.look, t), place: PLACES[s] });
  }
  // keep the ground clearance smooth: a moving maximum, then a moving average
  const zs = samples.map((p) => p.z), m = zs.length;
  const lifted = zs.map((_, i) => { let v = -1e9; for (let k = -40; k <= 40; k++) v = Math.max(v, zs[(i + k + m) % m] - Math.abs(k) * 0.9); return v; });
  const smoothZ = lifted.map((_, i) => { let v = 0; for (let k = -20; k <= 20; k++) v += lifted[(i + k + m) % m]; return v / 41; });
  samples.forEach((p, i) => { p.z = Math.max(smoothZ[i], heightAt(world, p.x, p.y) + 14); });
  const cum = [0];
  for (let i = 1; i <= m; i++) { const a = samples[i - 1], b = samples[i % m]; cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)); }
  return { samples, cum, length: cum[m] };
}

/** The camera at loop fraction `u` before its heading is smoothed (see cameraAt). */
function rawCamera(world, u) {
  const { samples, cum, length } = world.path, m = samples.length;
  const want = (((u % 1) + 1) % 1) * length;
  let lo = 0, hi = m;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= want) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[(lo + 1) % m], f = (want - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
  const x = lerp(a.x, b.x, f), y = lerp(a.y, b.y, f), z = lerp(a.z, b.z, f);
  // heading: toward points a little ahead, each INTERPOLATED between samples (taking whole samples
  // made the heading tick from one to the next, like clockwork) and averaged over a stretch
  const at = (k) => { const p = samples[(lo + k + m) % m], q = samples[(lo + k + 1 + m) % m]; return { x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), z: lerp(p.z, q.z, f) }; };
  // …as a weighted sum of where the path goes over the next ~300 m (a smooth bell of weights over
  // the samples ahead). It is continuous by construction: as the camera passes a sample the weights
  // slide along with it. (Aiming at "the first point 50 m away" jumped where the path's ground track
  // doubles back, at the foot of the fall.)
  let hx = 0, hy = 0;
  for (let k = 4; k <= 200; k += 2) {
    const wgt = Math.exp(-(((k - 90) / 55) ** 2)), p = at(k);
    hx += (p.x - x) * wgt; hy += (p.y - y) * wgt;
  }
  const ahead = at(30), behind = at(-30);
  const climb = (ahead.z - behind.z) / Math.max(1, Math.hypot(ahead.x - behind.x, ahead.y - behind.y));
  const pitch = clamp(lerp(a.look, b.look, f) * 0.6 + climb * 0.3, -0.3, 0.38);
  return { x, y, z, hx, hy, pitch, place: a.place };
}

/**
 * Where the camera is at loop fraction `u` (0..1): position, heading (radians from north), pitch.
 * The heading is the raw one (where the path goes next) averaged over a few seconds of the flight
 * either side of now: still a pure function of `u`, continuous, and it caps how fast the camera can
 * turn where the path itself turns hard (the foot of the fall).
 */
export function cameraAt(world, u) {
  const c = rawCamera(world, u);
  let hx = 0, hy = 0;
  for (let k = -6; k <= 6; k++) {
    const w = Math.exp(-((k / 3.5) ** 2)), r = k === 0 ? c : rawCamera(world, u + k * 0.0007);
    const l = Math.hypot(r.hx, r.hy) || 1; hx += w * r.hx / l; hy += w * r.hy / l;
  }
  return { x: c.x, y: c.y, z: c.z, yaw: Math.atan2(hx, hy), pitch: c.pitch, place: c.place };
}
