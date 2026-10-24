/* IRIS⁴'s ground, no DOM: the page draws it, the selftest checks it.

   A landscape in four dimensions: a heightfield over the three directions that aren't up. x, z and w are a grid of
   cells VS across, and each cell is a column of tesseract voxels H tall, so standing anywhere you have ground under
   you, and any 3D slice through you that keeps your up is a landscape of little cubes. The world wraps in x, z and w,
   and its noise is periodic to match.

   The renderer's ray march is two-level: a DDA over blocks of B³ cells, skipping any block whose tallest column the
   ray stays above, and inside the rest a DDA over cells. march() here is the same algorithm, line for line, so the
   selftest can check it against brute-force stepping. */
export const DIM = [192, 192, 64]; // cells along x, z, w
export const VS = 0.25; // a voxel's size, in metres
export const B = 8; // a block, in cells, for the coarse march
export const WATER = 14; // the lakes' level, in voxels
export const WATERBIT = 128; // a cell's value: its height in voxels, with this bit set if it's water

const wrap = (v, n) => ((v % n) + n) % n;
function hash(x, z, w, s) {
  let n = (Math.imul(x + 1013, 73856093) ^ Math.imul(z + 1013, 19349663) ^ Math.imul(w + 1013, 83492791) ^ Math.imul(s + 7, 374761393)) >>> 0;
  n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d) >>> 0; n ^= n >>> 12; n = Math.imul(n, 0x297a2d39) >>> 0; n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}
/* one octave of value noise over the whole grid: a lattice cell every scale[k] cells along each axis, repeating (the
   world's size is a whole number of them), smooth in between. The lattice is small, so it's made once, and each axis's lattice index
   and weight once per coordinate: the inner loop only blends */
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
/* the heights: big rolling hills, ridges on them, and a little roughness, all periodic in the world's size */
export function terrain(seed = 1) {
  const n = DIM[0] * DIM[1] * DIM[2], n1 = new Float32Array(n), n2 = new Float32Array(n), n3 = new Float32Array(n), H = new Uint8Array(n);
  octave([24, 24, 16], seed, n1); octave([8, 8, 8], seed + 1, n2); octave([4, 4, 4], seed + 2, n3);
  for (let i = 0; i < n; i++) {
    const ridge = 1 - Math.abs(2 * n2[i] - 1), v = Math.round(4 + 40 * n1[i] ** 1.6 + 9 * ridge * n1[i] + 3 * n3[i]);
    H[i] = v < WATER ? WATER | WATERBIT : Math.min(127, v);
  }
  return H;
}
export const height = (H, x, z, w) => H[wrap(x, DIM[0]) + DIM[0] * (wrap(z, DIM[1]) + DIM[1] * wrap(w, DIM[2]))] & 127;
/* each block's tallest column */
export function blocks(H) {
  const [X, Z, W] = DIM, nb = DIM.map((v) => v / B), M = new Uint8Array(nb[0] * nb[1] * nb[2]);
  for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const i = Math.floor(x / B) + nb[0] * (Math.floor(z / B) + nb[1] * Math.floor(w / B)), h = H[x + X * (z + Z * w)] & 127;
    if (h > M[i]) M[i] = h;
  }
  return M;
}
/* the ground under a point (metres): the top of its column */
export const groundAt = (H, p) => height(H, Math.floor(p[0] / VS), Math.floor(p[2] / VS), Math.floor(p[3] / VS)) * VS;

/* the ray march, in cell units: ro, rd are 4D (x, y, z, w), y up. Returns { t, n, cell } (n the face's normal, 4D) or
   null within far. The shader's march() is this, line for line */
export function march(H, M, ro, rd, far = 400) {
  const nb = DIM.map((v) => v / B), p = [ro[0], ro[2], ro[3]], v = [rd[0], rd[2], rd[3]], py = ro[1], vy = rd[1];
  const st = v.map((x) => Math.sign(x)), inv = v.map((x) => 1 / Math.max(Math.abs(x), 1e-6));
  const AX = [0, 2, 3], blockMax = (b) => M[wrap(b[0], nb[0]) + nb[0] * (wrap(b[1], nb[1]) + nb[1] * wrap(b[2], nb[2]))];
  const col = (c) => H[wrap(c[0], DIM[0]) + DIM[0] * (wrap(c[1], DIM[1]) + DIM[1] * wrap(c[2], DIM[2]))] & 127;
  const bc = p.map((x) => Math.floor(x / B)), tMaxB = [0, 1, 2].map((i) => (st[i] * (bc[i] * B - p[i]) + Math.max(st[i], 0) * B) * inv[i]), tDB = inv.map((x) => B * x);
  let t0 = 0, lastB = -1; // lastB: the axis crossed into this block (a column met right at its edge is met on that side)
  for (let i = 0; i < 160 && t0 < far; i++) {
    const k = tMaxB[0] < tMaxB[1] ? (tMaxB[0] < tMaxB[2] ? 0 : 2) : tMaxB[1] < tMaxB[2] ? 1 : 2, t1 = tMaxB[k];
    if (Math.min(py + vy * t0, py + vy * t1) <= blockMax(bc)) {
      // inside the block: a DDA over its cells, from t0 to t1
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
   each horizontal axis tried on its own), easing onto the new ground, the world wrapping round under you */
export const EYE = 1.7, STEP = 0.5, SIZE = [DIM[0] * VS, 0, DIM[1] * VS, DIM[2] * VS];
export function walk(H, p, vel, dt) {
  const q = p.slice(), g0 = groundAt(H, p);
  for (const a of [0, 2, 3]) { if (!vel[a]) continue; const t = q.slice(); t[a] += vel[a] * dt; if (groundAt(H, t) - g0 <= STEP + 1e-9) q[a] = t[a]; }
  for (const a of [0, 2, 3]) q[a] = ((q[a] % SIZE[a]) + SIZE[a]) % SIZE[a];
  const want = groundAt(H, q) + EYE; q[1] += (want - q[1]) * Math.min(1, dt * 12);
  return q;
}
