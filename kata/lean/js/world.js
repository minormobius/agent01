/* Lean's ground, no DOM: the page draws it, the selftest checks it. Started from IRIS⁴'s world.js
   (four.mino.mobi/iris/), cut down to the tesseract grid and given a track.

   Up is y. The ground is a heightfield over the other three directions, x, z and w: a grid of cells VS across, each
   a column of tesseract voxels. Any 3D slice through you that keeps your up is a landscape of little cubes.

   THE TRACK. A road on our ground is a curve made wide in the one direction across it. On this ground there are two
   directions across a curve, so the track is a curve made wide in both: every point of the ground within R_TRACK of
   a closed centreline, all of it at one height (TRACK_H), so its profile over x, z and w is flat. Its centreline is an
   oval in x and z that rises and falls in w twice a lap, so its bends turn partly in the plane you start in and partly
   into w, and the plane of the bend itself turns as you go round (the curve has torsion: a road on our ground can't).

   THE BASIN. All of it sits in a closed bowl: inside an ellipsoid over x, z and w the land is low and rolling; outside
   it a cliff stands at least RIM_MIN voxels high, every way including both ways in w. The interior never exceeds
   LAND_MAX, so the step up to the rim is many times the most you can climb. The selftest floods every cell you can
   walk to from the start and checks none of them is the rim: you can't get out.

   The ray march (two-level DDA, blocks of B³ cells skipped on their tallest column) is IRIS⁴'s, line for line, and the
   shader's twin. A cell's byte holds its height in the low six bits and its material in the top two. */
export const DIM = [192, 192, 64]; // cells along x, z, w
export const VS = 0.25; // a voxel's size, in metres
export const B = 8; // a block, in cells, for the coarse march
export const HMASK = 63, MSHIFT = 6; // a cell: height (voxels) in bits 0–5, material in bits 6–7
export const MAT = { ground: 0, track: 1, line: 2, kerb: 3 };
export const SIZE = [DIM[0] * VS, 0, DIM[1] * VS, DIM[2] * VS]; // metres, in (x, y, z, w)

/* the basin: an ellipsoid over (x, z, w), metres. Its surface stays inside the world's box, so the rim fills the box's
   edges every way and the world's wrap is never reached */
export const BASIN = { c: [24, 24, 8], a: [21, 21, 7.4] };
export const RIM_MIN = 50, LAND_MAX = 40; // voxels: the rim's lowest, the interior's highest
/* the track */
export const TRACK_H = 22; // voxels: 5.5 m
export const R_TRACK = 1.5, SHOULDER = 1.0, KERB = 0.25, LINE = 0.12; // metres
export const OVAL = { a: 13, b: 10, c: 3 }; // centreline: x = 24 + a cos t, z = 24 + b sin t, w = 8 + c sin 2t
export const NS = 1536; // samples along the centreline (a polyline; its segments are ~6 cm)

export const basinE = (x, z, w) => Math.hypot((x - BASIN.c[0]) / BASIN.a[0], (z - BASIN.c[1]) / BASIN.a[1], (w - BASIN.c[2]) / BASIN.a[2]);

/* ------------------------------------------------------------------ the centreline, and its Frenet frame
   In ground coordinates g = (x, z, w); directions handed back as 4D (x, y, z, w) with y = 0. */
export function centre(t) { const { a, b, c } = OVAL; return [BASIN.c[0] + a * Math.cos(t), BASIN.c[1] + b * Math.sin(t), BASIN.c[2] + c * Math.sin(2 * t)]; }
const d1 = (t) => { const { a, b, c } = OVAL; return [-a * Math.sin(t), b * Math.cos(t), 2 * c * Math.cos(2 * t)]; };
const d2 = (t) => { const { a, b, c } = OVAL; return [-a * Math.cos(t), -b * Math.sin(t), -4 * c * Math.sin(2 * t)]; };
const d3 = (t) => { const { a, b, c } = OVAL; return [a * Math.sin(t), -b * Math.cos(t), -8 * c * Math.cos(2 * t)]; };
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const norm3 = (u) => Math.hypot(u[0], u[1], u[2]);
export const to4 = (g, y = 0) => [g[0], y, g[1], g[2]]; // ground (x, z, w) to 4D (x, y, z, w)
/* the centreline at t: point (4D, metres, at the track's height), unit tangent T, principal normal N (toward the
   centre of the bend), binormal Bn, curvature κ (1/m) and torsion τ (1/m), analytically */
export function frenet(t) {
  const v = d1(t), a = d2(t), j = d3(t), sp = norm3(v), vxa = cross(v, a), m = norm3(vxa);
  const T = v.map((x) => x / sp), Bn = vxa.map((x) => x / m), N = cross(Bn, T);
  return { p: to4(centre(t), TRACK_H * VS), T: to4(T), N: to4(N), Bn: to4(Bn), kappa: m / sp ** 3, tau: dot3(vxa, j) / (m * m), speed: sp };
}
/* the polyline: NS points round the lap, and the arc length at each (the lap's length is S[NS]) */
export const PTS = [], S = [0];
for (let i = 0; i < NS; i++) PTS.push(centre((2 * Math.PI * i) / NS));
for (let i = 0; i < NS; i++) { const p = PTS[i], q = PTS[(i + 1) % NS]; S.push(S[i] + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])); }
export const LAP = S[NS];
/* distance from a ground point g to segment i, and where along it (0..1) */
function seg(g, i) {
  const p = PTS[i], q = PTS[(i + 1) % NS], e = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], o = [g[0] - p[0], g[1] - p[1], g[2] - p[2]];
  const u = Math.max(0, Math.min(1, dot3(o, e) / dot3(e, e))), r = [o[0] - u * e[0], o[1] - u * e[1], o[2] - u * e[2]];
  return { d: norm3(r), u };
}
/* the nearest point of the track's centreline to a 4D point (metres): distance (over the ground, ignoring height),
   the parameter t there, and how far round the lap (s, metres) */
export function nearestTrack(p) {
  const g = [p[0], p[2], p[3]]; let best = { d: Infinity, i: 0, u: 0 };
  for (let i = 0; i < NS; i++) { const s = seg(g, i); if (s.d < best.d) best = { d: s.d, i, u: s.u }; }
  return { d: best.d, t: (2 * Math.PI * (best.i + best.u)) / NS, s: S[best.i] + best.u * (S[best.i + 1] - S[best.i]) };
}

/* ------------------------------------------------------------------ the land */
const wrap = (v, n) => ((v % n) + n) % n;
function hash(x, z, w, s) {
  let n = (Math.imul(x + 1013, 73856093) ^ Math.imul(z + 1013, 19349663) ^ Math.imul(w + 1013, 83492791) ^ Math.imul(s + 7, 374761393)) >>> 0;
  n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d) >>> 0; n ^= n >>> 12; n = Math.imul(n, 0x297a2d39) >>> 0; n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}
/* one octave of periodic value noise over the grid (IRIS⁴'s) */
function octave(scale, seed, out) {
  const per = DIM.map((n, k) => n / scale[k]), L = new Float32Array(per[0] * per[1] * per[2]);
  for (let w = 0; w < per[2]; w++) for (let z = 0; z < per[1]; z++) for (let x = 0; x < per[0]; x++) L[x + per[0] * (z + per[1] * w)] = hash(x, z, w, seed);
  const axis = (n, k) => { const i0 = new Int32Array(n), i1 = new Int32Array(n), f = new Float32Array(n); for (let c = 0; c < n; c++) { const q = c / scale[k], b = Math.floor(q), t = q - b; i0[c] = b % per[k]; i1[c] = (b + 1) % per[k]; f[c] = t * t * (3 - 2 * t); } return { i0, i1, f }; };
  const ax = axis(DIM[0], 0), az = axis(DIM[1], 1), aw = axis(DIM[2], 2), [X, Z, W] = DIM, P0 = per[0], P01 = per[0] * per[1];
  for (let w = 0; w < W; w++) {
    const w0 = aw.i0[w] * P01, w1 = aw.i1[w] * P01, fw = aw.f[w];
    for (let z = 0; z < Z; z++) {
      const z0 = az.i0[z] * P0, z1 = az.i1[z] * P0, fz = az.f[z], row = X * (z + Z * w);
      for (let x = 0; x < X; x++) {
        const x0 = ax.i0[x], x1 = ax.i1[x], fx = ax.f[x];
        const a = L[x0 + z0 + w0] + (L[x1 + z0 + w0] - L[x0 + z0 + w0]) * fx, b = L[x0 + z1 + w0] + (L[x1 + z1 + w0] - L[x0 + z1 + w0]) * fx;
        const c = L[x0 + z0 + w1] + (L[x1 + z0 + w1] - L[x0 + z0 + w1]) * fx, d = L[x0 + z1 + w1] + (L[x1 + z1 + w1] - L[x0 + z1 + w1]) * fx;
        const e = a + (b - a) * fz, g = c + (d - c) * fz;
        out[row + x] = e + (g - e) * fw;
      }
    }
  }
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* the distance from every cell's centre to the centreline, for the cells near it (Infinity elsewhere): blocks far
   from every sample are skipped, and each near block's cells test only the segments near it. Scalar and
   allocation-free, since it runs some 10⁷ times on the page's load */
const SEG = (() => { const a = new Float64Array(NS * 7); for (let i = 0; i < NS; i++) { const p = PTS[i], q = PTS[(i + 1) % NS], ex = q[0] - p[0], ez = q[1] - p[1], ew = q[2] - p[2]; a.set([p[0], p[1], p[2], ex, ez, ew, 1 / (ex * ex + ez * ez + ew * ew)], 7 * i); } return a; })();
function segD2(x, z, w, i) {
  const k = 7 * i, ox = x - SEG[k], oz = z - SEG[k + 1], ow = w - SEG[k + 2], ex = SEG[k + 3], ez = SEG[k + 4], ew = SEG[k + 5];
  let u = (ox * ex + oz * ez + ow * ew) * SEG[k + 6]; u = u < 0 ? 0 : u > 1 ? 1 : u;
  const rx = ox - u * ex, rz = oz - u * ez, rw = ow - u * ew; return rx * rx + rz * rz + rw * rw;
}
export function trackDistance() {
  const [X, Z, W] = DIM, D = new Float32Array(X * Z * W).fill(Infinity), reach = R_TRACK + SHOULDER, BS = B * VS, half = (Math.sqrt(3) * BS) / 2;
  const nearR2 = (reach + half + 0.1) ** 2, reach2 = reach * reach, near = new Int32Array(NS);
  for (let bw = 0; bw < W / B; bw++) for (let bz = 0; bz < Z / B; bz++) for (let bx = 0; bx < X / B; bx++) {
    let nn = 0; const cx = (bx + 0.5) * BS, cz = (bz + 0.5) * BS, cw = (bw + 0.5) * BS;
    for (let i = 0; i < NS; i++) if (segD2(cx, cz, cw, i) < nearR2) near[nn++] = i;
    if (!nn) continue;
    for (let w = bw * B; w < (bw + 1) * B; w++) for (let z = bz * B; z < (bz + 1) * B; z++) for (let x = bx * B; x < (bx + 1) * B; x++) {
      const gx = (x + 0.5) * VS, gz = (z + 0.5) * VS, gw = (w + 0.5) * VS; let d = Infinity;
      for (let j = 0; j < nn; j++) { const s = segD2(gx, gz, gw, near[j]); if (s < d) d = s; }
      if (d < reach2) D[x + X * (z + Z * w)] = Math.sqrt(d);
    }
  }
  return D;
}
/* the heights and materials: the rim, the rolling floor of the basin rising to a lip, and the track carved through it
   flat, eased into the land over its shoulder */
export function terrain(seed = 1, D = trackDistance()) {
  const [X, Z, W] = DIM, n = X * Z * W, n1 = new Float32Array(n), n2 = new Float32Array(n), n3 = new Float32Array(n), H = new Uint8Array(n);
  octave([24, 24, 16], seed, n1); octave([8, 8, 8], seed + 1, n2); octave([4, 4, 4], seed + 2, n3);
  for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const i = x + X * (z + Z * w), e = basinE((x + 0.5) * VS, (z + 0.5) * VS, (w + 0.5) * VS);
    if (e >= 1) { H[i] = Math.max(RIM_MIN, Math.min(HMASK, Math.round(RIM_MIN + 10 * n1[i] + 3 * n3[i]))); continue; }
    const ridge = 1 - Math.abs(2 * n2[i] - 1);
    let v = 16 + 12 * n1[i] ** 1.3 + 5 * ridge * n1[i] + 2 * n3[i] + 9 * smooth(0.72, 1, e);
    const d = D[i]; let mat = MAT.ground;
    if (d < R_TRACK) { v = TRACK_H; mat = d < LINE ? MAT.line : d > R_TRACK - KERB ? MAT.kerb : MAT.track; }
    else if (d < R_TRACK + SHOULDER) v = TRACK_H + (v - TRACK_H) * smooth(0, 1, (d - R_TRACK) / SHOULDER);
    H[i] = Math.min(LAND_MAX, Math.round(v)) | (mat << MSHIFT);
  }
  return H;
}
export const height = (H, x, z, w) => H[wrap(x, DIM[0]) + DIM[0] * (wrap(z, DIM[1]) + DIM[1] * wrap(w, DIM[2]))] & HMASK;
export const material = (H, x, z, w) => H[wrap(x, DIM[0]) + DIM[0] * (wrap(z, DIM[1]) + DIM[1] * wrap(w, DIM[2]))] >> MSHIFT;
/* each block's tallest column */
export function blocks(H) {
  const [X, Z, W] = DIM, nb = DIM.map((v) => v / B), M = new Uint8Array(nb[0] * nb[1] * nb[2]);
  for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const i = Math.floor(x / B) + nb[0] * (Math.floor(z / B) + nb[1] * Math.floor(w / B)), h = H[x + X * (z + Z * w)] & HMASK;
    if (h > M[i]) M[i] = h;
  }
  return M;
}
/* the ground under a point (metres): the top of its column */
export const groundAt = (H, p) => height(H, Math.floor(p[0] / VS), Math.floor(p[2] / VS), Math.floor(p[3] / VS)) * VS;

/* the ray march, in cell units: ro, rd are 4D (x, y, z, w), y up. Returns { t, n, cell } (n the face's normal, 4D) or
   null within far. IRIS⁴'s, and the shader's march() is this, line for line */
export function march(H, M, ro, rd, far = 400) {
  const nb = DIM.map((v) => v / B), p = [ro[0], ro[2], ro[3]], v = [rd[0], rd[2], rd[3]], py = ro[1], vy = rd[1];
  const st = v.map((x) => Math.sign(x)), inv = v.map((x) => 1 / Math.max(Math.abs(x), 1e-6));
  const AX = [0, 2, 3], blockMax = (b) => M[wrap(b[0], nb[0]) + nb[0] * (wrap(b[1], nb[1]) + nb[1] * wrap(b[2], nb[2]))];
  const col = (c) => H[wrap(c[0], DIM[0]) + DIM[0] * (wrap(c[1], DIM[1]) + DIM[1] * wrap(c[2], DIM[2]))] & HMASK;
  const bc = p.map((x) => Math.floor(x / B)), tMaxB = [0, 1, 2].map((i) => (st[i] * (bc[i] * B - p[i]) + Math.max(st[i], 0) * B) * inv[i]), tDB = inv.map((x) => B * x);
  let t0 = 0, lastB = -1;
  for (let i = 0; i < 160 && t0 < far; i++) {
    const k = tMaxB[0] < tMaxB[1] ? (tMaxB[0] < tMaxB[2] ? 0 : 2) : tMaxB[1] < tMaxB[2] ? 1 : 2, t1 = tMaxB[k];
    if (Math.min(py + vy * t0, py + vy * t1) <= blockMax(bc)) {
      const q = p.map((x, j) => x + v[j] * (t0 + 1e-4)), c = q.map(Math.floor), tMax = [0, 1, 2].map((j) => (st[j] * (c[j] - p[j]) + Math.max(st[j], 0)) * inv[j]);
      let tc = t0, last = lastB;
      for (let j = 0; j < 40; j++) {
        const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2, tn = Math.min(tMax[a], t1), hc = col(c);
        if (py + vy * tc <= hc) { const n = [0, 0, 0, 0]; if (last >= 0) n[AX[last]] = -st[last]; else n[1] = 1; return { t: tc, n, cell: c.slice() }; }
        if (py + vy * tn <= hc) return { t: (hc - py) / vy, n: [0, 1, 0, 0], cell: c.slice() };
        if (tMax[a] >= t1) break;
        tc = tMax[a]; c[a] += st[a]; tMax[a] += inv[a]; last = a;
      }
    }
    t0 = t1; bc[k] += st[k]; tMaxB[k] += tDB[k]; lastB = k;
  }
  return null;
}

/* walking: your eye EYE above the ground, stepping up at most STEP at a time (a cliff stops you; you slide along it,
   each horizontal axis tried on its own, in the order x, z, w). The move is cut into substeps of under a cell along
   every axis, so however fast you go (a vehicle, later) you can only ever reach a cell next to one you stood on: that
   is what lets the selftest's flood prove the basin closed */
export const EYE = 1.7, STEP = 0.5;
export function walk(H, p, vel, dt, ground = (q) => groundAt(H, q)) {
  const n = Math.max(1, Math.ceil((Math.max(Math.abs(vel[0]), Math.abs(vel[2]), Math.abs(vel[3])) * dt) / (0.9 * VS)));
  const q = p.slice();
  for (let k = 0; k < n; k++) {
    const g0 = ground(q);
    for (const a of [0, 2, 3]) { if (!vel[a]) continue; const t = q.slice(); t[a] += (vel[a] * dt) / n; if (ground(t) - g0 <= STEP + 1e-9) q[a] = t[a]; }
  }
  const want = ground(q) + EYE; q[1] += (want - q[1]) * Math.min(1, dt * 12);
  return q;
}
/* where you start: on the centreline at t = 0, facing along the grid's +z (the track runs ahead, bending left and
   into w) */
export function start(H) { const c = centre(0), p = to4(c); p[1] = groundAt(H, p) + EYE; return p; }
