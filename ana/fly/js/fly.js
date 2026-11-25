// FLY: flying over a four-dimensional planet. No DOM.
//
// In 4D the ground is three-dimensional. Here it is the surface of a 4-ball, the 3-sphere S³, of radius R0: every point
// of the ground is a unit 4-vector X (times R0 + its height), and up is X itself. A great circle is L = 8,192 m round,
// so fly straight and you are home in 8 km. You fly over it; your eyes see the 3D slice through you that holds forward
// F, right R and up X. That slice passes through the planet's centre, so in it the ground is an ordinary 2-sphere planet
// with hills, and Voxel Space draws it exactly: each screen column follows the great circle its ray runs along,
// curvature and all. The fourth direction, your ana A (F, R, A, X orthonormal), is the one you can't see.
//
// The land is 4D value noise sampled on the sphere (no seams anywhere), kept on eight cubic grids, one for each cell of
// a tesseract (the 4D cube map): a point belongs to the cell of its largest coordinate, and its other three
// coordinates divided by that one place it in the cell's grid. Each node also keeps its material and the height's
// gradient, a 4D vector tangent to the sphere, for lighting by the 4D normal against a sun.
//
// Cities: packages/morph's (the studio's city series), plans of streets, plots and buildings. A plan is flat; the
// planet's ground is 3D. So each city is the plan laid in layers across the ground's third direction, with avenues
// between them: a building is its footprint times a depth along that direction, kept or left out and its height varied
// layer by layer.
import { generate, standing, PRESENT } from '../vendor/morph/morph.js';

export const L = 8192, R0 = L / (2 * Math.PI), M = 56;        // circumference, radius (~1304 m), grid nodes a side per cell
export const W = 480, H = 270;

// ------------------------------------------------------------------ 4D noise
const hash4 = (x, y, z, w, s) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177 + w * 1911520717 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const fade = (t) => t * t * (3 - 2 * t);
// The noise is only ever sampled on the unit sphere times a frequency f, offset by 100: every lattice corner lies in
// [100 − f − 1, 100 + f + 2]⁴, so each (f, seed) lattice is hashed once into a table and read back.
const TABLES = new Map();
function table(f, s) {
  const key = `${f}|${s}`; let t = TABLES.get(key); if (t) return t;
  const lo = Math.floor(100 - f) - 1, n = Math.ceil(100 + f) + 2 - lo + 1, a = new Float32Array(n ** 4);
  for (let w = 0; w < n; w++) for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a[((w * n + z) * n + y) * n + x] = hash4(lo + x, lo + y, lo + z, lo + w, s);
  t = { a, lo, n }; TABLES.set(key, t); return t;
}
function vnoise4(x, y, z, w, tb) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), wi = Math.floor(w), u = fade(x - xi), v = fade(y - yi), q = fade(z - zi), r = fade(w - wi);
  const { a, lo, n } = tb, X = xi - lo, Yy = yi - lo, Z = zi - lo, Ww = wi - lo, n2 = n * n, n3 = n2 * n;
  const b0 = ((Ww * n + Z) * n + Yy) * n + X;
  const l = (p, q2, t) => p + (q2 - p) * t;
  const cube = (o) => l(l(l(a[o], a[o + 1], u), l(a[o + n], a[o + n + 1], u), v), l(l(a[o + n2], a[o + n2 + 1], u), l(a[o + n2 + n], a[o + n2 + n + 1], u), v), q);
  return l(cube(b0), cube(b0 + n3), r);
}
/** The land's height (m above the datum R0) at a unit 4-vector: rolling ground, ridged mountains under a slow mask. */
const OCT = { base: [1.6, 3.2, 6.4, 12.8], ridge: [4, 8, 16], mask: 1.2 };
const SEEDED = new Map();
/** Each seed's lattice tables, resolved once (a lookup per noise call by string key cost more than the noise). */
function tablesFor(seed) {
  let t = SEEDED.get(seed); if (t) return t;
  t = { base: OCT.base.map((f) => [f, table(f, seed + Math.round(f * 10))]), ridge: OCT.ridge.map((f) => [f, table(f, seed + 300 + f)]), mask: [OCT.mask, table(OCT.mask, seed + 7)] };
  SEEDED.set(seed, t); return t;
}
export function rawHeight(P, seed = 1) {
  const T = tablesFor(seed), at = ([f, tb]) => vnoise4(P[0] * f + 100, P[1] * f + 100, P[2] * f + 100, P[3] * f + 100, tb);
  let base = 0, amp = 1, tot = 0; for (const o of T.base) { base += amp * at(o); tot += amp; amp *= 0.5; } base /= tot;
  let ridge = 0; amp = 1; tot = 0; for (const o of T.ridge) { ridge += amp * (1 - Math.abs(2 * at(o) - 1)) ** 2; tot += amp; amp *= 0.5; } ridge /= tot;
  const mask = fade(Math.min(1, Math.max(0, (at(T.mask) - 0.42) / 0.3)));
  return base * 170 + mask * ridge * 210;
}

// ------------------------------------------------------------------ the tesseract map: 8 cells × M³ nodes
/** Node (cell, i, j, k) → its unit 4-vector. Cell c: dominant axis c >> 1, sign + if c is even. */
export function nodeDir(c, i, j, k) {
  const ax = c >> 1, sg = c & 1 ? -1 : 1, t = [i, j, k].map((n) => -1 + (2 * n) / (M - 1)), P = [0, 0, 0, 0];
  let o = 0; for (let a = 0; a < 4; a++) P[a] = a === ax ? sg : t[o++];
  const l = Math.hypot(...P); return P.map((x) => x / l);
}
/** A unit 4-vector → its cell and grid coordinates (continuous, 0…M−1). */
export function locate(P) {
  let ax = 0; for (let a = 1; a < 4; a++) if (Math.abs(P[a]) > Math.abs(P[ax])) ax = a;
  const d = P[ax], c = ax * 2 + (d < 0 ? 1 : 0), g = []; for (let a = 0; a < 4; a++) if (a !== ax) g.push(((P[a] / Math.abs(d) + 1) / 2) * (M - 1));
  return { c, g };
}
export const MAT = { deep: 0, water: 1, sand: 2, grass: 3, forest: 4, scrub: 5, rock: 6, snow: 7 };
const STYLE = { village: 8, medieval: 9, georgian: 10, haussmann: 11, villa: 12, modern: 13, glass: 14 };
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const norm4 = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

/** The world: the grids (height, gradient, material), sea level, peaks, and the cities. */
export function buildWorld(seed = 1, { cities = 2 } = {}) {
  const NC = M * M * M, h = new Float32Array(8 * NC), dir = new Float32Array(8 * NC * 4);
  for (let c = 0; c < 8; c++) for (let k = 0; k < M; k++) for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const n = c * NC + (k * M + j) * M + i, P = nodeDir(c, i, j, k); dir.set(P, n * 4); h[n] = rawHeight(P, seed);
  }
  const sorted = Float32Array.from(h).sort(), sea = sorted[Math.floor(sorted.length * 0.14)];
  // the cities: on low dry ground, far apart; the land under each is levelled to a plateau
  const town = [], rnd = mulberry(seed * 977 + 3);
  for (let t = 0; t < 4000 && town.length < cities; t++) {
    const P = norm4([gauss(rnd), gauss(rnd), gauss(rnd), gauss(rnd)]), e = rawHeight(P, seed);
    if (e < sea + 6 || e > sea + 60) continue;
    if (town.some((q) => dot4(q.C, P) > Math.cos(1.4))) continue;
    town.push({ C: P, base: e });
  }
  const R_IN = 390, R_OUT = 540;
  const cOut = Math.cos(R_OUT / R0);
  for (let n = 0; n < 8 * NC; n++) for (const t of town) {
    const cs = dir[n * 4] * t.C[0] + dir[n * 4 + 1] * t.C[1] + dir[n * 4 + 2] * t.C[2] + dir[n * 4 + 3] * t.C[3]; if (cs < cOut) continue;
    const d = Math.acos(Math.min(1, cs)) * R0;
    if (d < R_OUT) { const s = fade(Math.min(1, Math.max(0, (d - R_IN) / (R_OUT - R_IN)))); h[n] = t.base + (h[n] - t.base) * s; }
  }
  // gradients: at each node, the tangent 4-vector g with g·t = the height's change along each grid axis t
  const grad = new Float32Array(8 * NC * 4), mat = new Uint8Array(8 * NC), node = (c, i, j, k) => c * NC + (k * M + j) * M + i;
  // (written without temporary arrays: this runs for every node)
  const T = [new Float64Array(4), new Float64Array(4), new Float64Array(4)], dh = new Float64Array(3), Gm = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
  for (let c = 0; c < 8; c++) for (let k = 0; k < M; k++) for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const n = node(c, i, j, k);
    for (let ax = 0; ax < 3; ax++) {
      const di = ax === 0 ? 1 : 0, dj = ax === 1 ? 1 : 0, dk = ax === 2 ? 1 : 0;
      const a = node(c, Math.min(M - 1, i + di), Math.min(M - 1, j + dj), Math.min(M - 1, k + dk)), b = node(c, Math.max(0, i - di), Math.max(0, j - dj), Math.max(0, k - dk));
      for (let q = 0; q < 4; q++) T[ax][q] = (dir[a * 4 + q] - dir[b * 4 + q]) * R0;
      dh[ax] = h[a] - h[b];
    }
    // g = Σ x_m T_m with (T_l · T_m) x = dh: a 3 × 3 solve by Cramer's rule
    for (let l = 0; l < 3; l++) for (let m2 = 0; m2 < 3; m2++) Gm[l][m2] = T[l][0] * T[m2][0] + T[l][1] * T[m2][1] + T[l][2] * T[m2][2] + T[l][3] * T[m2][3];
    const det3 = (a, b, cc) => a[0] * (b[1] * cc[2] - b[2] * cc[1]) - a[1] * (b[0] * cc[2] - b[2] * cc[0]) + a[2] * (b[0] * cc[1] - b[1] * cc[0]);
    const D = det3(Gm[0], Gm[1], Gm[2]);
    const x0 = det3([dh[0], Gm[0][1], Gm[0][2]], [dh[1], Gm[1][1], Gm[1][2]], [dh[2], Gm[2][1], Gm[2][2]]) / D;
    const x1 = det3([Gm[0][0], dh[0], Gm[0][2]], [Gm[1][0], dh[1], Gm[1][2]], [Gm[2][0], dh[2], Gm[2][2]]) / D;
    const x2 = det3([Gm[0][0], Gm[0][1], dh[0]], [Gm[1][0], Gm[1][1], dh[1]], [Gm[2][0], Gm[2][1], dh[2]]) / D;
    let s2 = 0; for (let q = 0; q < 4; q++) { const v = x0 * T[0][q] + x1 * T[1][q] + x2 * T[2][q]; grad[n * 4 + q] = v; s2 += v * v; }
    const e = h[n] - sea, s = Math.sqrt(s2), r = hash4(c, i, j, k, seed + 9);
    mat[n] = e < -25 ? MAT.deep : e < 0 ? MAT.water : e < 6 ? MAT.sand : s > 0.95 ? MAT.rock : e > 190 + r * 40 ? MAT.snow : e > 130 ? (s > 0.6 ? MAT.rock : MAT.scrub) : e > 85 && r < 0.5 ? MAT.scrub : r < 0.55 ? MAT.forest : MAT.grass;
  }
  // peaks for the map: nodes higher than their 26 grid neighbours (inside a cell)
  const peaks = [];
  for (let c = 0; c < 8; c++) for (let k = 1; k < M - 1; k++) for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
    const n = node(c, i, j, k), e = h[n]; if (e < sea + 120) continue;
    let top = true; for (let dk = -1; dk <= 1 && top; dk++) for (let dj = -1; dj <= 1 && top; dj++) for (let di = -1; di <= 1 && top; di++) if ((di || dj || dk) && h[node(c, i + di, j + dj, k + dk)] >= e) top = false;
    if (top) peaks.push({ P: [dir[n * 4], dir[n * 4 + 1], dir[n * 4 + 2], dir[n * 4 + 3]], e });
  }
  const wd = { seed, h, grad, mat, sea, peaks, cities: [] };
  town.forEach((t, k) => wd.cities.push(k === 0 ? buildCity4(t.C, t.base, seed * 31 + k * 7 + 1) : buildCity(t.C, t.base, seed * 31 + k * 7 + 1)));
  return wd;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0; for (let k = 0; k < 6; k++) u += r(); return u - 3; };

// ------------------------------------------------------------------ cities
export const CITY = { size: 600, cell: 2, layer: 64, layers: 7 };
/** A city at C: morph's plan (its buildings standing in 2025) in the tangent space at C, rasterised to 2 m cells of
 *  building ids; then layered across the third direction e3, one plan-copy every 64 m: in layer k building b stands
 *  with depth ±dep (from its footprint) if a hash says so, its height scaled by another. */
function buildCity(C, base, seed) {
  // a tangent frame at C
  const e = []; for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { let v = ax.map((x, i) => x - dot4(ax, C) * C[i]); for (const b of e) v = v.map((x, i) => x - dot4(v, b) * b[i]); if (Math.hypot(...v) > 0.3 && e.length < 3) e.push(norm4(v)); }
  const plan = generate({ seed, size: CITY.size }), now = standing(plan, PRESENT).buildings;
  const N = CITY.size / CITY.cell, raster = new Uint16Array(N * N), half = CITY.size / 2;
  const blds = [{}];
  for (const b of now) {
    const F = b.footprint; if (!F || F.length < 3) continue;
    const id = blds.length; let area = 0; for (let i = 0; i < F.length; i++) { const p = F[i], q = F[(i + 1) % F.length]; area += p[0] * q[1] - q[0] * p[1]; } area = Math.abs(area) / 2;
    let cx = 0, cy = 0; for (const p of F) { cx += p[0] / F.length; cy += p[1] / F.length; }
    blds.push({ h: b.height, style: STYLE[b.style] ?? 13, dep: Math.max(5, Math.min(22, Math.sqrt(area) / 2)), cx, cy });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of F) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let gy = Math.max(0, Math.floor((y0 + half) / CITY.cell)); gy <= Math.min(N - 1, Math.floor((y1 + half) / CITY.cell)); gy++)
      for (let gx = Math.max(0, Math.floor((x0 + half) / CITY.cell)); gx <= Math.min(N - 1, Math.floor((x1 + half) / CITY.cell)); gx++) {
        const px = gx * CITY.cell - half + 1, py = gy * CITY.cell - half + 1; let inside = false;
        for (let i = 0, j = F.length - 1; i < F.length; j = i++) if ((F[i][1] > py) !== (F[j][1] > py) && px < ((F[j][0] - F[i][0]) * (py - F[i][1])) / (F[j][1] - F[i][1]) + F[i][0]) inside = !inside;
        if (inside) raster[gy * N + gx] = id;
      }
  }
  const t = { kind: 'morph', name: 'morph', C, e, base, seed, raster, N, blds, count: blds.length - 1 };
  t.stats = cityStats(t);
  return t;
}
/** Is there a building at this ground point (unit 4-vector)? Returns { top (m above datum), style, base, u, v, w,
 *  storey, ribbon } or null; u, v, w are the building's own axes (for the facade's bays). */
export function buildingAt(wd, P) {
  for (const t of wd.cities) {
    const cc = dot4(P, t.C); if (cc < 0.94) continue;                         // within ~0.35 rad (~450 m)
    const u = (dot4(P, t.e[0]) / cc) * R0, v = (dot4(P, t.e[1]) / cc) * R0, w = (dot4(P, t.e[2]) / cc) * R0;   // gnomonic, at the city
    if (t.kind === 'native') { const b = plotAt(t, u, v, w); if (b) return b; continue; }
    const half = CITY.size / 2; if (Math.abs(u) >= half || Math.abs(v) >= half) continue;
    const id = t.raster[Math.floor((v + half) / CITY.cell) * t.N + Math.floor((u + half) / CITY.cell)]; if (!id) continue;
    const k = Math.round(w / CITY.layer); if (Math.abs(k) > (CITY.layers - 1) / 2) continue;
    const b = t.blds[id]; if (Math.abs(w - k * CITY.layer) > b.dep) continue;
    const keep = hash4(id, k, 3, 5, t.seed); if (k !== 0 && keep > 0.78) continue;
    const scale = k === 0 ? 1 : 0.6 + 0.8 * hash4(id, k, 7, 1, t.seed);
    return { top: t.base + b.h * scale, style: b.style, base: t.base, u, v, w, storey: 3.2, ribbon: false };
  }
  return null;
}

// ------------------------------------------------------------------ the native city
/** A city laid out by a four-dimensional planner. The ground is 3D, so a street is a SHEET (codimension one: it must
 *  divide the ground, as a line divides a plane), a block a cube fronting on six sheets, split into eight octant plots,
 *  each of which fronts on three of them. Land value falls with distance from the core in 3D (bid-rent: towers in the
 *  middle, villas at the edge, plots left empty more often further out) and the whole city is a ball: N plots fill a
 *  ball of radius ∝ N^⅓ where a flat city's disc grows as N^½, which is the planner's prize (`cityStats`).
 *  Districts: Voronoi cells round CITY4.districts seeds, each with its own turned grid and block size; the bisector
 *  between two districts is a sheet too, so it is a street. Storeys 3.6 m and a cap on height, both from BRUT⁴
 *  (kata/brut4: a column under a 3D floor carries 8× the load per bay that it would under a 2D one, so 4D towers stop
 *  short of 3D ones). */
export const CITY4 = { radius: 320, plaza: 22, street: 10, districts: 6, storey: 3.6, maxStoreys: 26 };
function buildCity4(C, base, seed) {
  const e = tangentFrame(C), rnd = mulberry(seed * 131 + 7), D = [];
  for (let k = 0; k < CITY4.districts; k++) {
    // a random rotation from a random unit quaternion
    let q = [gauss(rnd), gauss(rnd), gauss(rnd), gauss(rnd)]; const l = Math.hypot(...q); q = q.map((x) => x / l);
    const [a, b, c, d] = q;
    const Rm = [[a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c)], [2 * (b * c + a * d), a * a - b * b + c * c - d * d, 2 * (c * d - a * b)], [2 * (b * d - a * c), 2 * (c * d + a * b), a * a - b * b - c * c + d * d]];
    let s = [0, 0, 0];
    if (k) { const dir = [gauss(rnd), gauss(rnd), gauss(rnd)], dl = Math.hypot(...dir), r = 140 + rnd() * 120; s = dir.map((x) => (x / dl) * r); }
    D.push({ s, R: Rm, pitch: k === 0 ? 40 : 48 + Math.floor(rnd() * 4) * 8 });
  }
  const t = { kind: 'native', name: 'native', C, e, base, seed, D };
  t.stats = cityStats(t);
  t.count = t.stats.plots;
  return t;
}
/** The plot at local point (u, v, w) of a native city, or null on a street, a plaza, or an empty plot. */
function plotAt(t, u, v, w) {
  const r = Math.sqrt(u * u + v * v + w * w); if (r > CITY4.radius || r < CITY4.plaza) return null;
  // nearest two district seeds; the bisector between them is a street
  let i1 = 0, d1 = Infinity, i2 = 0, d2 = Infinity;
  for (let k = 0; k < t.D.length; k++) { const s = t.D[k].s, d = (u - s[0]) ** 2 + (v - s[1]) ** 2 + (w - s[2]) ** 2; if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = k; } else if (d < d2) { d2 = d; i2 = k; } }
  const A = t.D[i1], B = t.D[i2], sep = Math.hypot(A.s[0] - B.s[0], A.s[1] - B.s[1], A.s[2] - B.s[2]);
  if ((d2 - d1) / (2 * sep) < CITY4.street / 2) return null;
  const x = u - A.s[0], y = v - A.s[1], z = w - A.s[2], R = A.R, P = A.pitch, st = CITY4.street;
  const q0 = R[0][0] * x + R[0][1] * y + R[0][2] * z, q1 = R[1][0] * x + R[1][1] * y + R[1][2] * z, q2 = R[2][0] * x + R[2][1] * y + R[2][2] * z;
  const c0 = Math.floor(q0 / P), c1 = Math.floor(q1 / P), c2 = Math.floor(q2 / P), f0 = q0 - c0 * P - st, f1 = q1 - c1 * P - st, f2 = q2 - c2 * P - st;
  if (f0 < 0 || f1 < 0 || f2 < 0) return null;                                 // on one of the block's three street sheets
  const half = (P - st) / 2, o0 = f0 >= half ? 1 : 0, o1 = f1 >= half ? 1 : 0, o2 = f2 >= half ? 1 : 0;
  // the plot's centre decides its fate (so every point of a plot agrees)
  const g0 = (c0 * P + st + (o0 + 0.5) * half), g1 = (c1 * P + st + (o1 + 0.5) * half), g2 = (c2 * P + st + (o2 + 0.5) * half);
  const pu = A.s[0] + R[0][0] * g0 + R[1][0] * g1 + R[2][0] * g2, pv = A.s[1] + R[0][1] * g0 + R[1][1] * g1 + R[2][1] * g2, pw = A.s[2] + R[0][2] * g0 + R[1][2] * g1 + R[2][2] * g2;
  const lot = lotOf(t, i1, c0 * 2 + o0, c1 * 2 + o1, c2 * 2 + o2, Math.hypot(pu, pv, pw)); if (!lot) return null;
  // setback from the plot's edges: the building's footprint is a smaller cube
  // (in the core the octants close up on each other, so a block is one stepped mass, BRUT⁴'s tiers)
  const l0 = f0 - o0 * half, l1 = f1 - o1 * half, l2 = f2 - o2 * half, sb = lot.setback, si = lot.joined ? 0 : sb;
  const out = (l, o) => (o ? l < si || l > half - sb : l < sb || l > half - si);
  if (out(l0, o0) || out(l1, o1) || out(l2, o2)) return null;
  return { top: t.base + lot.h, style: lot.style, base: t.base, u: q0, v: q1, w: q2, storey: CITY4.storey, ribbon: lot.ribbon };
}
/** A plot's building from its distance to the core: bid-rent height, style, setback; null if left empty. */
function lotOf(t, k, a, b, c, r) {
  const x = r / CITY4.radius, h1 = hash4(a, b, c, k, t.seed), h2 = hash4(a, b, c, k, t.seed + 1);
  if (r > CITY4.radius - 8 || h1 > 0.98 - 0.55 * x * x) return null;            // emptier further out
  const storeys = Math.max(1, Math.min(CITY4.maxStoreys, Math.round((2 + 30 * Math.exp(-r / 95)) * (0.65 + 0.7 * h2))));
  const style = r < 80 ? STYLE.glass : r < 150 ? STYLE.modern : r < 215 ? STYLE.haussmann : r < 265 ? STYLE.georgian : h2 < 0.5 ? STYLE.villa : STYLE.village;
  return { h: storeys * CITY4.storey, storeys, style, setback: 0.5 + 4 * x * x, joined: r < 130, ribbon: r < 150 };
}
/** The planner's numbers: plots built, mean distance from a plot to the core, and the same plots laid out flat (each
 *  plot's square, at the same share built, filling a disc round the core: mean distance ⅔ of the disc's radius). */
export function cityStats(t) {
  if (t.kind !== 'native') {
    let n = 0, sum = 0; for (let i = 1; i < t.blds.length; i++) { const b = t.blds[i]; n++; sum += Math.hypot(b.cx, b.cy); }
    return { plots: n, mean: sum / n };
  }
  let n = 0, sum = 0, area = 0, maxH = 0;
  t.D.forEach((A, k) => {
    const P = A.pitch, st = CITY4.street, half = (P - st) / 2, span = Math.ceil((CITY4.radius + 300) / P);
    for (let c0 = -span; c0 <= span; c0++) for (let c1 = -span; c1 <= span; c1++) for (let c2 = -span; c2 <= span; c2++) for (let o = 0; o < 8; o++) {
      const o0 = o & 1, o1 = (o >> 1) & 1, o2 = o >> 2, g = [c0 * P + st + (o0 + 0.5) * half, c1 * P + st + (o1 + 0.5) * half, c2 * P + st + (o2 + 0.5) * half];
      const p = [0, 1, 2].map((j) => A.s[j] + A.R[0][j] * g[0] + A.R[1][j] * g[1] + A.R[2][j] * g[2]);
      const r = Math.hypot(...p); if (r > CITY4.radius || r < CITY4.plaza) continue;
      // in this district? (and not on its border street)
      let d1 = Infinity, i1 = -1; for (let j = 0; j < t.D.length; j++) { const s = t.D[j].s, d = (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2 + (p[2] - s[2]) ** 2; if (d < d1) { d1 = d; i1 = j; } }
      if (i1 !== k) continue;
      const lot = lotOf(t, k, c0 * 2 + o0, c1 * 2 + o1, c2 * 2 + o2, r); if (!lot) continue;
      n++; sum += r; area += half * half; maxH = Math.max(maxH, lot.h);
    }
  });
  const flatR = Math.sqrt(area / Math.PI);
  return { plots: n, mean: sum / n, flatMean: (2 / 3) * flatR, flatR, ballR: CITY4.radius, maxH };
}

// ------------------------------------------------------------------ the ground
/** The ground at a unit 4-vector: land height (m above the datum), surface (water flat at sea level, roofs over
 *  land), gradient (tangent 4-vector, trilinear), material (a nearby node, jittered), and any building. */
export function ground(wd, P, withCity = true) {
  const { c, g } = locate(P), i = Math.min(M - 2, Math.floor(g[0])), j = Math.min(M - 2, Math.floor(g[1])), k = Math.min(M - 2, Math.floor(g[2]));
  const u = g[0] - i, v = g[1] - j, w = g[2] - k, NC = M * M * M, o = c * NC;
  const n0 = o + (k * M + j) * M + i, sI = 1, sJ = M, sK = M * M;
  const wt = [(1 - u) * (1 - v) * (1 - w), u * (1 - v) * (1 - w), (1 - u) * v * (1 - w), u * v * (1 - w), (1 - u) * (1 - v) * w, u * (1 - v) * w, (1 - u) * v * w, u * v * w];
  const ns = [n0, n0 + sI, n0 + sJ, n0 + sI + sJ, n0 + sK, n0 + sI + sK, n0 + sJ + sK, n0 + sI + sJ + sK];
  let land = 0, gx = 0, gy = 0, gz = 0, gw = 0;
  for (let q = 0; q < 8; q++) { const n = ns[q], a = wt[q]; land += a * wd.h[n]; gx += a * wd.grad[n * 4]; gy += a * wd.grad[n * 4 + 1]; gz += a * wd.grad[n * 4 + 2]; gw += a * wd.grad[n * 4 + 3]; }
  const jt = 0.25 + 0.5 * hash4(Math.floor(P[0] * 120), Math.floor(P[1] * 120), Math.floor(P[2] * 120), Math.floor(P[3] * 120), 5);
  const n = o + ((k + (w > jt ? 1 : 0)) * M + (j + (v > jt ? 1 : 0))) * M + (i + (u > jt ? 1 : 0));
  const b = withCity && wd.cities.length ? buildingAt(wd, P) : null;
  return { e: b ? Math.max(land, b.top) : Math.max(land, wd.sea), land, n, g: [gx, gy, gz, gw], b };
}
export const heightAt = (wd, P) => ground(wd, P).e;
/** Just the surface height at P (no gradient, no material): what the ray march needs at every step. */
export function surface(wd, P) {
  let ax = 0, m = Math.abs(P[0]); for (let a = 1; a < 4; a++) { const v = Math.abs(P[a]); if (v > m) { m = v; ax = a; } }
  const d = P[ax], c = ax * 2 + (d < 0 ? 1 : 0), sc = ((M - 1) / 2) / m;
  const g0 = (P[ax === 0 ? 1 : 0] * sc) + (M - 1) / 2, g1 = (P[ax <= 1 ? 2 : 1] * sc) + (M - 1) / 2, g2 = (P[ax <= 2 ? 3 : 2] * sc) + (M - 1) / 2;
  const i = Math.min(M - 2, g0 | 0), j = Math.min(M - 2, g1 | 0), k = Math.min(M - 2, g2 | 0), u = g0 - i, v = g1 - j, w = g2 - k, h = wd.h, n0 = c * M * M * M + (k * M + j) * M + i, sJ = M, sK = M * M;
  const land = (1 - w) * ((1 - v) * ((1 - u) * h[n0] + u * h[n0 + 1]) + v * ((1 - u) * h[n0 + sJ] + u * h[n0 + sJ + 1])) + w * ((1 - v) * ((1 - u) * h[n0 + sK] + u * h[n0 + sK + 1]) + v * ((1 - u) * h[n0 + sK + sJ] + u * h[n0 + sK + sJ + 1]));
  let e = land > wd.sea ? land : wd.sea;
  if (wd.cities.length) { const b = buildingAt(wd, P); if (b && b.top > e) e = b.top; }
  return e;
}

// ------------------------------------------------------------------ the palette: 16 materials × 16 shades
const MATCOL = [[0.07, 0.2, 0.36], [0.16, 0.38, 0.55], [0.82, 0.74, 0.52], [0.36, 0.56, 0.26], [0.16, 0.36, 0.2], [0.5, 0.5, 0.32], [0.5, 0.46, 0.44], [0.94, 0.95, 0.98],
  [0.78, 0.72, 0.6], [0.8, 0.7, 0.55], [0.62, 0.34, 0.26], [0.86, 0.8, 0.66], [0.9, 0.86, 0.78], [0.62, 0.62, 0.62], [0.44, 0.58, 0.68], [0.12, 0.14, 0.18]];
export const WINDOW = 15;
export const PALETTE = (() => { const p = new Uint32Array(256); for (let m = 0; m < 16; m++) for (let s = 0; s < 16; s++) { const l = 0.16 + (1.05 * s) / 15, c = MATCOL[m].map((x) => Math.min(255, Math.round(255 * Math.min(1, x * l)))); p[m * 16 + s] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; } return p; })();

// ------------------------------------------------------------------ the aircraft
/** State: X (unit 4-vector: where you are, and up), F, R, A (tangent, orthonormal), alt (m above the datum), pitch,
 *  speed, trail. */
export function aircraft(wd, X = startPoint(wd)) {
  const fr = tangentFrame(X);
  return { X, F: fr[0], R: fr[1], A: fr[2], alt: Math.max(heightAt(wd, X) + 80, wd.sea + 110), pitch: 0, speed: 60, trail: [] };
}
function tangentFrame(X) { const e = []; for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { let v = ax.map((x, i) => x - dot4(ax, X) * X[i]); for (const b of e) v = v.map((x, i) => x - dot4(v, b) * b[i]); if (Math.hypot(...v) > 0.3 && e.length < 3) e.push(norm4(v)); } return e; }
/** Somewhere to start: near the first city if there is one (heading toward it), else open water or lowland. */
export function startPoint(wd) {
  if (wd.cities.length) { const C = wd.cities[0].C, fr = tangentFrame(C), a = 900 / R0; return norm4(C.map((x, i) => Math.cos(a) * x - Math.sin(a) * fr[0][i])); }
  return [1, 0, 0, 0];
}
/** Re-orthonormalise X, F, R, A (Gram–Schmidt in that order). */
function square(c) {
  c.X = norm4(c.X); const pr = (v, bs) => { let o = v; for (const b of bs) o = o.map((x, i) => x - dot4(o, b) * b[i]); return norm4(o); };
  c.F = pr(c.F, [c.X]); c.R = pr(c.R, [c.X, c.F]); c.A = pr(c.A, [c.X, c.F, c.R]);
}
/** Turn by th in the plane of two of F, R, A (a toward b). */
export function turn(c, a, b, th) { const A = c[a], B = c[b], co = Math.cos(th), si = Math.sin(th); c[a] = A.map((x, k) => co * x + si * B[k]); c[b] = B.map((x, k) => co * x - si * A[k]); square(c); }
/** One step (dt s) under controls { pitch, yaw, ana, roll, throttle } (each −1…1). Moving along the ground is a turn of
 *  X toward F by the distance over the radius you fly at: X and F turn together in their plane, R and A stay put (they
 *  are perpendicular to it), which carries your heading over the curved ground without twisting it. */
export function fly(wd, c, k, dt) {
  const rate = 0.9;
  if (k.yaw) turn(c, 'F', 'R', k.yaw * rate * dt);
  if (k.ana) turn(c, 'F', 'A', k.ana * rate * dt);
  if (k.roll) turn(c, 'R', 'A', k.roll * rate * dt);
  c.pitch = Math.max(-1.2, Math.min(1.2, c.pitch + (k.pitch || 0) * 0.8 * dt));
  c.speed = Math.max(20, Math.min(200, c.speed + (k.throttle || 0) * 40 * dt));
  const th = (Math.cos(c.pitch) * c.speed * dt) / (R0 + c.alt), co = Math.cos(th), si = Math.sin(th), X = c.X, F = c.F;
  c.X = X.map((x, i) => co * x + si * F[i]); c.F = F.map((x, i) => co * x - si * X[i]); square(c);
  c.alt += Math.sin(c.pitch) * c.speed * dt;
  const g = heightAt(wd, c.X); let hit = false;
  if (c.alt < g + 10) { c.alt = g + 10; if (c.pitch < 0.15) c.pitch = 0.15; hit = true; }
  if (c.alt > 1500) { c.alt = 1500; c.pitch = Math.min(c.pitch, 0); }
  return hit;
}

// ------------------------------------------------------------------ Voxel Space on a curved world
export const FOV = (70 * Math.PI) / 180, FOCAL = W / 2 / Math.tan(FOV / 2), FAR = 3200;
/** Render one frame (px: Uint32 RGBA, W×H). Each column's ray runs in the plane of X and u = (F + sR)/|F + sR|; along
 *  it the ground point at angle φ is X cos φ + u sin φ at radius R0 + h: forward t = r sin φ, up r cos φ − (R0 + alt),
 *  so the planet's curve is exact. sun: a 4D direction. Returns the horizon row and each column's top row. */
/** The camera looks down below your flight path by most of the dip of the planet's horizon (acos R0/(R0 + alt)): on a
 *  planet this small the horizon at a few hundred metres is 30° below level, and looking straight out you'd see sky. */
export const tilt = (c) => 0.8 * Math.acos(Math.min(1, R0 / (R0 + Math.max(0, c.alt))));
export function horizonRow(c) { return H / 2 + Math.tan(c.pitch - tilt(c)) * FOCAL; }
export function render(wd, c, px, { sun = [0.5, 0.3, 0.5, 0.64], tint = 0 } = {}) {
  const horizon = horizonRow(c), S = norm4(sun), rc = R0 + c.alt;
  const day = Math.max(0, Math.min(1, dot4(c.X, S) * 2.5 + 0.5)), haze = [0.62 * day + 0.04, 0.72 * day + 0.05, 0.86 * day + 0.12];
  for (let y = 0; y < H; y++) {
    const t = Math.max(0, Math.min(1, (horizon - y) / (H * 0.9))), r = Math.round(255 * (haze[0] * (1 - t) + 0.22 * day * t + 0.02 * t)), g = Math.round(255 * (haze[1] * (1 - t) + 0.38 * day * t + 0.03 * t)), b = Math.round(255 * (haze[2] * (1 - t) + 0.7 * day * t + 0.08 * t));
    px.fill((255 << 24) | (b << 16) | (g << 8) | r, y * W, y * W + W);
  }
  const top = new Int32Array(W), hr = haze[0] * 255, hg = haze[1] * 255, hb = haze[2] * 255;
  for (let x = 0; x < W; x++) {
    const s = (x - W / 2) / FOCAL, k = Math.hypot(1, s), U = [0, 1, 2, 3].map((i) => (c.F[i] + c.R[i] * s) / k);
    let yb = H, dist = 2, dd = 1;
    while (dist < FAR && yb > 0) {
      const ph = dist / R0; if (ph > Math.PI / 2) break;
      const co = Math.cos(ph), si = Math.sin(ph), P = [c.X[0] * co + U[0] * si, c.X[1] * co + U[1] * si, c.X[2] * co + U[2] * si, c.X[3] * co + U[3] * si];
      const e0 = surface(wd, P), r = R0 + e0, zf = (r * si) / k, y = horizon - ((r * co - rc) * FOCAL) / zf;
      if (y < yb) {
        const gr = ground(wd, P);
        const water = !gr.b && gr.land < wd.sea, G = water ? [0, 0, 0, 0] : gr.g;
        let m = gr.b ? gr.b.style : water ? (gr.land < wd.sea - 30 ? 0 : 1) : wd.mat[gr.n];
        // the 4D normal: up (P) less the gradient; lit against the sun; buildings lit as if level-topped
        const nl = Math.hypot(G[0], G[1], G[2], G[3], 1), lit = Math.max(0.12, (dot4(P, S) - dot4(G, S)) / nl);
        let shade = Math.max(0, Math.min(15, Math.round(lit * 13 + (dist < 900 ? (hash4(Math.floor(P[0] * 400), Math.floor(P[1] * 400), Math.floor(P[2] * 400), Math.floor(P[3] * 400), 77) - 0.5) * 2 : 0))));
        let col = PALETTE[m * 16 + shade];
        if (tint && !water && !gr.b) { const sa = dot4(G, c.A), tt = Math.max(-1, Math.min(1, sa * 2.2)) * tint, T = tt > 0 ? [56, 242, 224] : [255, 102, 184], a = Math.abs(tt) * 0.6; col = (255 << 24) | (Math.round(((col >> 16) & 255) + (T[2] - ((col >> 16) & 255)) * a) << 16) | (Math.round(((col >> 8) & 255) + (T[1] - ((col >> 8) & 255)) * a) << 8) | Math.round((col & 255) + (T[0] - (col & 255)) * a); }
        const f = Math.min(1, (dist / FAR) ** 1.6), y0 = Math.max(0, Math.ceil(y));
        const mixc = (cc) => (255 << 24) | (Math.round(((cc >> 16) & 255) * (1 - f) + hb * f) << 16) | (Math.round(((cc >> 8) & 255) * (1 - f) + hg * f) << 8) | Math.round((cc & 255) * (1 - f) + hr * f);
        if (gr.b && dist < 1400) {
          // a facade: each row's height on the building says its storey; windows in bays along the wall
          const wall = mixc(col), glass = mixc(PALETTE[WINDOW * 16 + Math.min(15, Math.round(lit * 6 + 3))]), bay = gr.b.ribbon ? 1 : (Math.floor(gr.b.u / 2.4) + Math.floor(gr.b.v / 2.4) + Math.floor(gr.b.w / 2.4)) & 1;
          for (let yy = y0; yy < yb; yy++) {
            const hrow = rc + ((horizon - yy) * zf) / FOCAL - (R0 + gr.b.base), st = (hrow / gr.b.storey) % 1;
            px[yy * W + x] = hrow > 0.5 && hrow < gr.b.top - gr.b.base - 0.6 && st > 0.3 && st < 0.78 && bay ? glass : wall;
          }
        } else { const out = mixc(col); for (let yy = y0; yy < yb; yy++) px[yy * W + x] = out; }
        yb = y0;
      }
      dist += dd; dd *= 1.012; if (dd > 30) dd = 30;
    }
    top[x] = yb;
  }
  return { horizon, top, day };
}
/** The skyline of the ground a distance d along your ana: the same columns from X turned toward A by d / R0. */
export function skyline(wd, c, d, step = 2) {
  const horizon = horizonRow(c), out = new Float32Array(W).fill(H), rc = R0 + c.alt, a = d / R0;
  const X = c.X.map((x, i) => Math.cos(a) * x + Math.sin(a) * c.A[i]);
  for (let x = 0; x < W; x += step) {
    const s = (x - W / 2) / FOCAL, k = Math.hypot(1, s), U = [0, 1, 2, 3].map((i) => (c.F[i] + c.R[i] * s) / k);
    // the same steps as the view (coarser ones jump over a tower)
    let yb = H, dist = 2, dd = 1;
    while (dist < FAR) { const ph = dist / R0; if (ph > Math.PI / 2) break; const co = Math.cos(ph), si = Math.sin(ph), P = [X[0] * co + U[0] * si, X[1] * co + U[1] * si, X[2] * co + U[2] * si, X[3] * co + U[3] * si], r = R0 + surface(wd, P), y = horizon - ((r * co - rc) * FOCAL) / ((r * si) / k); if (y < yb) yb = y; dist += dd; dd *= 1.012; if (dd > 30) dd = 30; }
    for (let q = 0; q < step && x + q < W; q++) out[x + q] = yb;
  }
  return { horizon, out };
}

// ------------------------------------------------------------------ beacons
/** A course of beacons: balls (radius 40 m) 40–120 m above the ground, each 600–1000 m of ground from the last. */
export function course(wd, from, n = 8, seed = 3) {
  const rnd = mulberry(seed), out = []; let X = from.slice();
  for (let k = 0; k < n; k++) {
    const fr = tangentFrame(X), d = norm4(fr[0].map((x, i) => gauss(rnd) * x + gauss(rnd) * fr[1][i] + gauss(rnd) * fr[2][i])), a = (600 + rnd() * 400) / R0;
    X = norm4(X.map((x, i) => Math.cos(a) * x + Math.sin(a) * d[i]));
    out.push({ X: X.slice(), alt: heightAt(wd, X) + 40 + rnd() * 80, r: 40 });
  }
  return out;
}
/** A beacon from the aircraft: the straight 4D line between them, in your ahead, right, ana and up. */
export function relative(c, b) {
  const d = [0, 1, 2, 3].map((i) => (R0 + b.alt) * b.X[i] - (R0 + c.alt) * c.X[i]);
  return { ahead: dot4(d, c.F), right: dot4(d, c.R), ana: dot4(d, c.A), up: dot4(d, c.X) };
}
export const inside = (c, b) => { const r = relative(c, b); return Math.hypot(r.ahead, r.right, r.ana, r.up) < b.r; };
/** A point on the ground in the aircraft's tangent terms (for the map): the log map at you, along F, R, A. */
export function local(c, P) {
  const cs = Math.max(-1, Math.min(1, dot4(c.X, P))), th = Math.acos(cs), t = P.map((x, i) => x - cs * c.X[i]), l = Math.hypot(...t) || 1;
  return [dot4(t, c.F), dot4(t, c.R), dot4(t, c.A)].map((x) => (x / l) * th * R0);
}
