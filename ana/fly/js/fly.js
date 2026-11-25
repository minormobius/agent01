// FLY: flying over a four-dimensional landscape. No DOM.
//
// In 4D the ground is three-dimensional: a height h(x, y, z) over a 3D floor, and the sky is above it in the fourth
// direction, up. You fly over that floor. Your eyes see the 3D slice through you that holds your forward F, your right R
// and up; the floor's third direction across, your ana A (F, R, A orthonormal in the floor), is the one you can't see.
// Inside your slice the ground is an ordinary heightmap, h along the plane of F and R, and Voxel Space draws a
// heightmap the way Comanche did in 1992 and the studio's colour cycle does: for each screen column a ray walks out over
// it, and every step that rises above what is already drawn fills the column up to it.
//
// The world is a torus, L across in each floor direction, so it never ends: a 3D grid of heights (G³ nodes) from
// tileable value noise, read back by trilinear interpolation. Each node also carries its material and the height's
// gradient, so shading can use the full 4D normal (−∇h, 1): a sun with some of its light coming from ana lights the
// slopes that face ana, which you can't otherwise see.

export const L = 8192, G = 128, CELL = L / G;                  // metres; the floor wraps every L (sea level is the world's: wd.sea)
export const W = 480, H = 270;                                  // the frame (drawn pixelated)

// ------------------------------------------------------------------ noise and the land
const hash3 = (x, y, z, s) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const fade = (t) => t * t * (3 - 2 * t);
/** Tileable 3D value noise: lattice period p, so it repeats every p lattice steps in each direction. Each (p, seed)
 *  lattice is hashed once and kept. */
const LAT = new Map();
const lattice = (p, s) => { const key = p * 100003 + s; let a = LAT.get(key); if (!a) { a = new Float32Array(p * p * p); for (let k = 0; k < p; k++) for (let j = 0; j < p; j++) for (let i = 0; i < p; i++) a[(k * p + j) * p + i] = hash3(i, j, k, s); LAT.set(key, a); } return a; };
function vnoise(x, y, z, p, s) {
  const a = lattice(p, s), xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const m = (k) => ((k % p) + p) % p, X0 = m(xi), X1 = m(xi + 1), Y0 = m(yi) * p, Y1 = m(yi + 1) * p, Z0 = m(zi) * p * p, Z1 = m(zi + 1) * p * p;
  const l = (q, r, t) => q + (r - q) * t;
  return l(l(l(a[Z0 + Y0 + X0], a[Z0 + Y0 + X1], u), l(a[Z0 + Y1 + X0], a[Z0 + Y1 + X1], u), v), l(l(a[Z1 + Y0 + X0], a[Z1 + Y0 + X1], u), l(a[Z1 + Y1 + X0], a[Z1 + Y1 + X1], u), v), w);
}
/** The land's height at a floor point (metres), straight from the noise: rolling ground, lakes in the hollows, and
 *  ridged mountains where a slow mask says. Every octave's period divides L, so it tiles. */
export function rawHeight(x, y, z, seed = 1) {
  const q = (f) => [x * f / L, y * f / L, z * f / L];
  let base = 0, amp = 1, tot = 0; for (const f of [3, 6, 12, 24]) { base += amp * vnoise(...q(f), f, seed + f); tot += amp; amp *= 0.5; } base /= tot;
  let ridge = 0; amp = 1; tot = 0; for (const f of [8, 16, 32, 64]) { ridge += amp * (1 - Math.abs(2 * vnoise(...q(f), f, seed + 100 + f) - 1)) ** 2; tot += amp; amp *= 0.5; } ridge /= tot;
  const mask = fade(Math.min(1, Math.max(0, (vnoise(...q(2), 2, seed + 7) - 0.42) / 0.3)));
  return 60 + base * 620 + mask * ridge * 760;
}
const BASE = [3, 6, 12, 24], RIDGE = [8, 16, 32, 64];
/** The same heights on the grid, fast: on grid nodes every octave's lattice cell and blend weight depend on one axis
 *  at a time, so they're tabulated per axis and the triple loop is plain array reads. Equals rawHeight at every node
 *  (the selftest checks). */
function gridHeights(seed) {
  const N = G, out = new Float32Array(N * N * N);
  const octave = (f, s, k3) => {
    const a = lattice(f, s), i0 = new Int32Array(N), i1 = new Int32Array(N), t = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i * f) / N, xi = Math.floor(x); i0[i] = ((xi % f) + f) % f; i1[i] = (i0[i] + 1) % f; t[i] = fade(x - xi); }
    return { a, f, i0, i1, t, k3 };
  };
  const B = BASE.map((f) => octave(f, seed + f)), Rg = RIDGE.map((f) => octave(f, seed + 100 + f)), Mk = octave(2, seed + 7);
  const val = (o, i, j, k) => {
    const { a, f, i0, i1, t } = o, u = t[i], v = t[j], w = t[k], X0 = i0[i], X1 = i1[i], Y0 = i0[j] * f, Y1 = i1[j] * f, Z0 = i0[k] * f * f, Z1 = i1[k] * f * f;
    const l = (q, r, s2) => q + (r - q) * s2;
    return l(l(l(a[Z0 + Y0 + X0], a[Z0 + Y0 + X1], u), l(a[Z0 + Y1 + X0], a[Z0 + Y1 + X1], u), v), l(l(a[Z1 + Y0 + X0], a[Z1 + Y0 + X1], u), l(a[Z1 + Y1 + X0], a[Z1 + Y1 + X1], u), v), w);
  };
  const bt = BASE.reduce((s2, _, q) => s2 + 0.5 ** q, 0), rt = RIDGE.reduce((s2, _, q) => s2 + 0.5 ** q, 0);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let base = 0, ridge = 0, amp = 1;
    for (let q = 0; q < 4; q++) { base += amp * val(B[q], i, j, k); ridge += amp * (1 - Math.abs(2 * val(Rg[q], i, j, k) - 1)) ** 2; amp *= 0.5; }
    const mask = fade(Math.min(1, Math.max(0, (val(Mk, i, j, k) - 0.42) / 0.3)));
    out[(k * N + j) * N + i] = 60 + (base / bt) * 620 + mask * (ridge / rt) * 760;
  }
  return out;
}

/** The world: heights on the G³ grid (built once, ~a second), their gradients, and each node's material. */
export const MAT = { deep: 0, water: 1, sand: 2, grass: 3, forest: 4, scrub: 5, rock: 6, snow: 7 };
export function buildWorld(seed = 1) {
  const N = G, h = gridHeights(seed);
  const at = (i, j, k) => h[((((k % N) + N) % N) * N + (((j % N) + N) % N)) * N + (((i % N) + N) % N)];
  // sea level: the height below which 14% of the land lies, so every world has its lakes
  const sorted = Float32Array.from(h).sort(), SEA = sorted[Math.floor(sorted.length * 0.14)];
  const gx = new Float32Array(N * N * N), gy = new Float32Array(N * N * N), gz = new Float32Array(N * N * N), mat = new Uint8Array(N * N * N);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const n = (k * N + j) * N + i, a = (at(i + 1, j, k) - at(i - 1, j, k)) / (2 * CELL), b = (at(i, j + 1, k) - at(i, j - 1, k)) / (2 * CELL), c = (at(i, j, k + 1) - at(i, j, k - 1)) / (2 * CELL);
    gx[n] = a; gy[n] = b; gz[n] = c;
    const e = h[n], s = Math.hypot(a, b, c), r = hash3(i, j, k, seed + 9);
    const up = e - SEA; mat[n] = up < -35 ? MAT.deep : up < 0 ? MAT.water : up < 14 ? MAT.sand : s > 0.8 ? MAT.rock : up > 640 + r * 120 ? MAT.snow : up > 430 ? (s > 0.5 ? MAT.rock : MAT.scrub) : up > 260 && r < 0.5 ? MAT.scrub : r < 0.55 ? MAT.forest : MAT.grass;
  }
  // the peaks, for the map: nodes higher than all 26 neighbours and above the treeline
  const peaks = [];
  for (let k = 0; k < N; k += 1) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const e = h[(k * N + j) * N + i]; if (e < SEA + 450) continue;
    let top = true; for (let dk = -1; dk <= 1 && top; dk++) for (let dj = -1; dj <= 1 && top; dj++) for (let di = -1; di <= 1 && top; di++) if ((di || dj || dk) && at(i + di, j + dj, k + dk) >= e) top = false;
    if (top) peaks.push([i * CELL, j * CELL, k * CELL, e]);
  }
  return { seed, h, gx, gy, gz, mat, peaks, sea: SEA };
}
const wrap = (v) => ((v % L) + L) % L;
/** The ground under a floor point: land height and gradient (trilinear between grid nodes, wrapping), the nearest
 *  node (for its material), and the surface: water is flat at sea level. */
export function ground(wd, x, y, z) {
  const fx = wrap(x) / CELL, fy = wrap(y) / CELL, fz = wrap(z) / CELL, i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
  const u = fx - i, v = fy - j, w = fz - k, N = G, i1 = (i + 1) % N, j1 = (j + 1) % N, k1 = (k + 1) % N;
  const n000 = (k * N + j) * N + i, n100 = (k * N + j) * N + i1, n010 = (k * N + j1) * N + i, n110 = (k * N + j1) * N + i1, n001 = (k1 * N + j) * N + i, n101 = (k1 * N + j) * N + i1, n011 = (k1 * N + j1) * N + i, n111 = (k1 * N + j1) * N + i1;
  const a = (1 - u) * (1 - v) * (1 - w), b = u * (1 - v) * (1 - w), c = (1 - u) * v * (1 - w), d = u * v * (1 - w), e = (1 - u) * (1 - v) * w, f = u * (1 - v) * w, g = (1 - u) * v * w, hh = u * v * w;
  const tri = (A) => a * A[n000] + b * A[n100] + c * A[n010] + d * A[n110] + e * A[n001] + f * A[n101] + g * A[n011] + hh * A[n111];
  // the material from a nearby node, the choice jittered by a hash of where the point is, so that edges between
  // materials wander instead of following the grid's squares
  const jt = 0.25 + 0.5 * hash3(Math.floor(x / 11), Math.floor(y / 11), Math.floor(z / 11), 5);
  const land = tri(wd.h), n = (((k + (w > jt ? 1 : 0)) % N) * N + ((j + (v > jt ? 1 : 0)) % N)) * N + ((i + (u > jt ? 1 : 0)) % N);
  return { e: Math.max(land, wd.sea), land, n, gx: tri(wd.gx), gy: tri(wd.gy), gz: tri(wd.gz) };
}
export const heightAt = (wd, x, y, z) => { const fx = wrap(x) / CELL, fy = wrap(y) / CELL, fz = wrap(z) / CELL, i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), u = fx - i, v = fy - j, w = fz - k, N = G, i1 = (i + 1) % N, j1 = (j + 1) % N, k1 = (k + 1) % N, h = wd.h, c = (a, b, cc) => h[(cc * N + b) * N + a];
  return Math.max(wd.sea, (1 - w) * ((1 - v) * ((1 - u) * c(i, j, k) + u * c(i1, j, k)) + v * ((1 - u) * c(i, j1, k) + u * c(i1, j1, k))) + w * ((1 - v) * ((1 - u) * c(i, j, k1) + u * c(i1, j, k1)) + v * ((1 - u) * c(i, j1, k1) + u * c(i1, j1, k1)))); };

// ------------------------------------------------------------------ the palette: 8 materials × 32 shades
const MATCOL = [[0.07, 0.2, 0.36], [0.16, 0.38, 0.55], [0.82, 0.74, 0.52], [0.36, 0.56, 0.26], [0.16, 0.36, 0.2], [0.5, 0.5, 0.32], [0.5, 0.46, 0.44], [0.94, 0.95, 0.98]];
/** 256 colours: material m, shade s (0 dark … 31 bright) → index m·32 + s. */
export const PALETTE = (() => { const p = new Uint32Array(256); for (let m = 0; m < 8; m++) for (let s = 0; s < 32; s++) { const l = 0.18 + (1.05 * s) / 31, c = MATCOL[m].map((x) => Math.min(255, Math.round(255 * Math.min(1, x * l)))); p[m * 32 + s] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; } return p; })();

// ------------------------------------------------------------------ the aircraft
/** The flight state: floor position p (3), altitude, the heading frame (F, R, A: orthonormal in the floor), pitch
 *  (radians, nose up +), speed (m/s). */
export function aircraft(wd, at = startPoint(wd)) {
  return { p: at.slice(), alt: Math.max(heightAt(wd, ...at) + 250, wd.sea + 600), F: [1, 0, 0], R: [0, 1, 0], A: [0, 0, 1], pitch: -0.05, speed: 120, trail: [] };
}
/** A good place to start: the grid node over water or lowland whose next 2 km ahead (along x) stays lowest. */
export function startPoint(wd) {
  let best = null;
  for (let t = 0; t < 400; t++) {
    const p = [((t * 7919) % G) * CELL, ((t * 104729) % G) * CELL, ((t * 1299709) % G) * CELL];
    let m = 0; for (let d = 0; d < 2000; d += 100) m = Math.max(m, heightAt(wd, p[0] + d, p[1], p[2]));
    if (!best || m < best.m) best = { p, m };
  }
  return best.p;
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Turn the heading frame by th in the plane of two of its directions (a toward b), then re-orthonormalise. */
export function turn(c, a, b, th) {
  const A = c[a], B = c[b], co = Math.cos(th), si = Math.sin(th);
  c[a] = A.map((x, k) => co * x + si * B[k]); c[b] = B.map((x, k) => co * x - si * A[k]);
  // Gram-Schmidt F, R, A
  const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  c.F = n(c.F); c.R = n(c.R.map((x, k) => x - dot3(c.R, c.F) * c.F[k])); const t = c.A.map((x, k) => x - dot3(c.A, c.F) * c.F[k] - dot3(c.A, c.R) * c.R[k]); c.A = n(t);
}
/** One step of flight (dt seconds) under controls { pitch, yaw, ana, roll, throttle } each −1…1: yaw turns F toward R,
 *  ana turns F toward A, roll turns R toward A (swinging what you see round your forward), pitch raises the nose. The
 *  ground is a floor you can't go under: within 12 m of it the aircraft is pushed up and the nose levelled. */
export function fly(wd, c, k, dt) {
  const rate = 0.9;
  if (k.yaw) turn(c, 'F', 'R', k.yaw * rate * dt);
  if (k.ana) turn(c, 'F', 'A', k.ana * rate * dt);
  if (k.roll) turn(c, 'R', 'A', k.roll * rate * dt);
  c.pitch = Math.max(-1.2, Math.min(1.2, c.pitch + (k.pitch || 0) * 0.8 * dt));
  c.speed = Math.max(40, Math.min(400, c.speed + (k.throttle || 0) * 80 * dt));
  const hv = Math.cos(c.pitch) * c.speed * dt;
  c.p = c.p.map((x, i) => wrap(x + c.F[i] * hv)); c.alt += Math.sin(c.pitch) * c.speed * dt;
  const g = heightAt(wd, ...c.p); let hit = false;
  if (c.alt < g + 12) { c.alt = g + 12; if (c.pitch < 0.15) c.pitch = 0.15; hit = true; }
  if (c.alt > 4000) { c.alt = 4000; c.pitch = Math.min(c.pitch, 0); }
  return hit;
}

// ------------------------------------------------------------------ Voxel Space
export const FOV = (70 * Math.PI) / 180, FOCAL = W / 2 / Math.tan(FOV / 2), FAR = 4200;
/** Render one frame into px (Uint32 RGBA, W×H): sky, then each column's ray over the heightmap in your slice (the
 *  plane of F and R through you). sun: a 4D direction [floor x, y, z, up]. Returns the frame's horizon row and, per
 *  column, the topmost row the land reached. opts.tint: colour the land by which way it slopes along your ana. */
export function render(wd, c, px, { sun = [0.35, 0.2, 0.45, 0.8], tint = 0, haze = [0.62, 0.72, 0.86] } = {}) {
  const horizon = H / 2 + Math.tan(c.pitch) * FOCAL, sl = Math.hypot(...sun), S = sun.map((x) => x / sl);
  // the sky: a gradient by angle above the horizon, the sun where it would be
  for (let y = 0; y < H; y++) {
    const t = Math.max(0, Math.min(1, (horizon - y) / (H * 0.9))), r = Math.round(255 * (haze[0] * (1 - t) + 0.22 * t)), g = Math.round(255 * (haze[1] * (1 - t) + 0.38 * t)), b = Math.round(255 * (haze[2] * (1 - t) + 0.7 * t));
    const col = (255 << 24) | (b << 16) | (g << 8) | r; px.fill(col, y * W, y * W + W);
  }
  const top = new Int32Array(W), ybuf = new Float32Array(W).fill(H), cp = Math.cos(c.pitch);
  const hr = Math.round(haze[0] * 255), hg = Math.round(haze[1] * 255), hb = Math.round(haze[2] * 255);
  for (let x = 0; x < W; x++) {
    const s = (x - W / 2) / FOCAL; let yb = H, z = 2, dz = 1;
    while (z < FAR && yb > 0) {
      const qx = c.p[0] + (c.F[0] + c.R[0] * s) * z, qy = c.p[1] + (c.F[1] + c.R[1] * s) * z, qz = c.p[2] + (c.F[2] + c.R[2] * s) * z;
      const g = ground(wd, qx, qy, qz), y = horizon - ((g.e - c.alt) * FOCAL) / z;
      if (y < yb) {
        // the colour: material, lit by the 4D normal (−∇h, 1) against the sun; water flat and dimmer
        const n = g.n, water = g.land < wd.sea;
        let m = water ? (g.land < wd.sea - 35 ? 0 : 1) : wd.mat[n];
        const gx = water ? 0 : g.gx, gy = water ? 0 : g.gy, gz = water ? 0 : g.gz, nl = Math.hypot(gx, gy, gz, 1);
        let lit = (-gx * S[0] - gy * S[1] - gz * S[2] + S[3]) / nl; lit = Math.max(0.08, lit);
        // a little grain, as a painting has: a hash of where the sample fell, ±2 shades (more on forest and scrub)
        const grain = (hash3(Math.floor(qx / 6), Math.floor(qy / 6), Math.floor(qz / 6), 77) - 0.5) * (m === 4 || m === 5 ? 6 : 3);
        let shade = Math.max(0, Math.min(31, Math.round(lit * 26 + (water ? 2 : 4) + (z < 1500 ? grain : 0))));
        let col = PALETTE[m * 32 + shade];
        if (tint && !water) {          // which way the land climbs along your ana: teal if ana, rose if kata
          const sa = gx * c.A[0] + gy * c.A[1] + gz * c.A[2], t = Math.max(-1, Math.min(1, sa * 2.2)) * tint;
          const r0 = col & 255, g0 = (col >> 8) & 255, b0 = (col >> 16) & 255, T = t > 0 ? [56, 242, 224] : [255, 102, 184], a = Math.abs(t) * 0.6;
          col = (255 << 24) | (Math.round(b0 + (T[2] - b0) * a) << 16) | (Math.round(g0 + (T[1] - g0) * a) << 8) | Math.round(r0 + (T[0] - r0) * a);
        }
        // haze with distance
        const f = Math.min(1, (z / FAR) ** 1.6), r = Math.round((col & 255) * (1 - f) + hr * f), gg = Math.round(((col >> 8) & 255) * (1 - f) + hg * f), b = Math.round(((col >> 16) & 255) * (1 - f) + hb * f);
        const out = (255 << 24) | (b << 16) | (gg << 8) | r;
        for (let yy = Math.max(0, Math.ceil(y)); yy < yb; yy++) px[yy * W + x] = out;
        yb = Math.max(0, Math.ceil(y));
      }
      z += dz; dz *= 1.012; if (dz > 40) dz = 40;
    }
    top[x] = yb; ybuf[x] = yb;
  }
  void cp;
  return { horizon, top };
}
/** The skyline of the land a distance d along your ana (or kata, d < 0): per column, the highest screen row the ground
 *  there reaches (H if none). The ghost of what lies beside you in the direction you can't see. */
export function skyline(wd, c, d, step = 2) {
  const horizon = H / 2 + Math.tan(c.pitch) * FOCAL, out = new Float32Array(W).fill(H);
  for (let x = 0; x < W; x += step) {
    const s = (x - W / 2) / FOCAL; let yb = H, z = 2, dz = 1.5;
    const ox = c.p[0] + c.A[0] * d, oy = c.p[1] + c.A[1] * d, oz = c.p[2] + c.A[2] * d;
    while (z < FAR) {
      const e = heightAt(wd, ox + (c.F[0] + c.R[0] * s) * z, oy + (c.F[1] + c.R[1] * s) * z, oz + (c.F[2] + c.R[2] * s) * z), y = horizon - ((e - c.alt) * FOCAL) / z;
      if (y < yb) yb = y; z += dz; dz *= 1.015; if (dz > 60) dz = 60;
    }
    for (let k = 0; k < step && x + k < W; k++) out[x + k] = yb;
  }
  return { horizon, out };
}

// ------------------------------------------------------------------ beacons: balls in 4D to fly through
/** Beacons along a course: points in the 4D world (floor 3 + altitude), each a ball of radius r, hung 150–450 m above
 *  the ground, each 1.2–2.2 km from the last in a random floor direction. */
export function course(wd, from, n = 8, seed = 3) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = []; let p = from.slice();
  for (let k = 0; k < n; k++) {
    const g = () => { let u = 0; for (let q = 0; q < 6; q++) u += rnd(); return u - 3; }, d = [g(), g(), g()], l = Math.hypot(...d), dist = 1200 + rnd() * 1000;
    p = p.map((x, i) => wrap(x + (d[i] / l) * dist));
    out.push({ p: p.slice(), alt: heightAt(wd, ...p) + 150 + rnd() * 300, r: 70 });
  }
  return out;
}
/** Where a beacon is from the aircraft, in its own terms: ahead (along F), right (R), ana (A), up; the shortest way
 *  round the wrapping floor. */
export function relative(c, b) {
  const d = b.p.map((x, i) => { let v = x - c.p[i]; v -= Math.round(v / L) * L; return v; });
  return { ahead: dot3(d, c.F), right: dot3(d, c.R), ana: dot3(d, c.A), up: b.alt - c.alt };
}
/** Has the aircraft passed through the beacon's ball? */
export const inside = (c, b) => { const r = relative(c, b); return Math.hypot(r.ahead, r.right, r.ana, r.up) < b.r; };
