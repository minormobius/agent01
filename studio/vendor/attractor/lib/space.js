// space.js — the space of strange attractors, and a way to search it.
//
// Sprott (1993, "Automatic generation of strange attractors") searched the general quadratic flows
//   dx/dt = a0 + a1 x + a2 y + a3 z + a4 x² + a5 xy + a6 xz + a7 y² + a8 yz + a9 z²   (and dy/dt, dz/dt)
// with each coefficient one of 25 values (−1.2 … 1.2, step 0.1): a 30-letter code names a flow. About
// one random code in a hundred is chaotic, and each one is its own shape. This file makes codes from a
// seed, integrates them, rejects what escapes to infinity or settles (a point, a loop), measures the
// Lyapunov exponent (chaos: nearby paths separate), and describes the shape that is left, so a body can
// pick attractors that fit its parts. The famous named flows are here too, as fixed members.
//
// Pure, no dependencies, node and browser alike. Everything from a seed is deterministic.

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXY';   // A = −1.2 … M = 0 … Y = +1.2
export const toCode = (a) => a.map((v) => LETTERS[Math.round(v * 10) + 12]).join('');
export const fromCode = (s) => [...s].map((c) => (LETTERS.indexOf(c) - 12) / 10);

/** A quadratic flow's derivative, coefficients a[30] (x, y, z equations in turn). */
export function quadratic(a) {
  return (x, y, z, o) => {
    const t = [1, x, y, z, x * x, x * y, x * z, y * y, y * z, z * z];
    for (let e = 0; e < 3; e++) { let s = 0; for (let k = 0; k < 10; k++) s += a[e * 10 + k] * t[k]; o[e] = s; }
  };
}

/** The famous ones, with their usual parameters and step sizes. */
export const NAMED = {
  lorenz: { f: (x, y, z, o) => { o[0] = 10 * (y - x); o[1] = x * (28 - z) - y; o[2] = x * y - (8 / 3) * z; }, x0: [0.1, 0, 0], dt: 0.004 },
  aizawa: { f: (x, y, z, o) => { o[0] = (z - 0.7) * x - 3.5 * y; o[1] = 3.5 * x + (z - 0.7) * y; o[2] = 0.6 + 0.95 * z - z ** 3 / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x ** 3; }, x0: [0.1, 0, 0], dt: 0.01 },
  thomas: { f: (x, y, z, o) => { o[0] = Math.sin(y) - 0.208186 * x; o[1] = Math.sin(z) - 0.208186 * y; o[2] = Math.sin(x) - 0.208186 * z; }, x0: [0.1, 0, 0.2], dt: 0.05 },
  halvorsen: { f: (x, y, z, o) => { o[0] = -1.4 * x - 4 * y - 4 * z - y * y; o[1] = -1.4 * y - 4 * z - 4 * x - z * z; o[2] = -1.4 * z - 4 * x - 4 * y - x * x; }, x0: [-1, 0, 0], dt: 0.004 },
  rossler: { f: (x, y, z, o) => { o[0] = -y - z; o[1] = x + 0.2 * y; o[2] = 0.2 + z * (x - 5.7); }, x0: [0.1, 0, 0], dt: 0.02 },
  chen: { f: (x, y, z, o) => { o[0] = 35 * (y - x); o[1] = -7 * x - x * z + 28 * y; o[2] = x * y - 3 * z; }, x0: [-10, 0, 37], dt: 0.002 },
  dadras: { f: (x, y, z, o) => { o[0] = y - 3 * x + 2.7 * y * z; o[1] = 1.7 * y - x * z + z; o[2] = 2 * x * y - 9 * z; }, x0: [1, 1, 0], dt: 0.005 },
  fourwing: { f: (x, y, z, o) => { o[0] = 0.2 * x + y * z; o[1] = 0.01 * x - 0.4 * y - x * z; o[2] = -z - x * y; }, x0: [1.3, -0.18, 0.01], dt: 0.02 },
  sprottB: { f: (x, y, z, o) => { o[0] = y * z; o[1] = x - y; o[2] = 1 - x * y; }, x0: [0.1, 0.1, 0.1], dt: 0.02 },
  rabinovich: { f: (x, y, z, o) => { o[0] = y * (z - 1 + x * x) + 0.87 * x; o[1] = x * (3 * z + 1 - x * x) + 0.87 * y; o[2] = -2 * z * (1.1 + x * y); }, x0: [-1, 0, 0.5], dt: 0.004 },
};

/**
 * Integrate a flow (RK4). Returns { p: Float32Array(n·3) } or null if it escapes or goes non-finite.
 */
export function integrate(f, x0, dt, n, skip = 1000, limit = 1e6) {
  let x = x0[0], y = x0[1], z = x0[2];
  const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0], p = new Float32Array(n * 3);
  for (let i = 0; i < n + skip; i++) {
    f(x, y, z, k1);
    f(x + (dt / 2) * k1[0], y + (dt / 2) * k1[1], z + (dt / 2) * k1[2], k2);
    f(x + (dt / 2) * k2[0], y + (dt / 2) * k2[1], z + (dt / 2) * k2[2], k3);
    f(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2], k4);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (!(Math.abs(x) + Math.abs(y) + Math.abs(z) < limit)) return null;
    if (i >= skip) { const j = (i - skip) * 3; p[j] = x; p[j + 1] = y; p[j + 2] = z; }
  }
  return { p, n };
}

/**
 * The largest Lyapunov exponent, by following a neighbour d0 away and renormalising (Benettin). Per
 * unit time: > 0 chaos, ≈ 0 a loop or a torus, < 0 a fixed point.
 */
export function lyapunov(f, x0, dt, steps = 6000, d0 = 1e-8) {
  const step = (s) => {
    const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
    f(s[0], s[1], s[2], k1); f(s[0] + (dt / 2) * k1[0], s[1] + (dt / 2) * k1[1], s[2] + (dt / 2) * k1[2], k2);
    f(s[0] + (dt / 2) * k2[0], s[1] + (dt / 2) * k2[1], s[2] + (dt / 2) * k2[2], k3); f(s[0] + dt * k3[0], s[1] + dt * k3[1], s[2] + dt * k3[2], k4);
    for (let i = 0; i < 3; i++) s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
  const a = x0.slice(); for (let i = 0; i < 2000; i++) step(a);          // onto the attractor first
  const b = [a[0] + d0, a[1], a[2]];
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    step(a); step(b);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (!Number.isFinite(d) || d === 0) return -Infinity;
    sum += Math.log(d / d0);
    for (let k = 0; k < 3; k++) b[k] = a[k] + ((b[k] - a[k]) * d0) / d;
  }
  return sum / (steps * dt);
}

/**
 * Centre, turn onto its principal axes (longest first) and scale to about ±1 (the 1st–99th percentile of
 * the longest). Returns the cloud and its shape: `ext` the three extents (longest 1), the fill (how much
 * of its bounding box it occupies, on a 12³ grid) and the ratio of its two longest axes.
 */
export function describe(cloud) {
  const { p, n } = cloud, m = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) m[k] += p[i * 3 + k] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) { const d = [p[i * 3] - m[0], p[i * 3 + 1] - m[1], p[i * 3 + 2] - m[2]]; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r][c] += (d[r] * d[c]) / n; }
  const V = eig3(C);                                          // columns: principal axes, largest first
  const q = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = [p[i * 3] - m[0], p[i * 3 + 1] - m[1], p[i * 3 + 2] - m[2]];
    for (let k = 0; k < 3; k++) q[i * 3 + k] = d[0] * V[0][k] + d[1] * V[1][k] + d[2] * V[2][k];
  }
  const span = [0, 1, 2].map((k) => { const v = new Float32Array(n); for (let i = 0; i < n; i++) v[i] = q[i * 3 + k]; v.sort(); return [v[Math.floor(n * 0.01)], v[Math.floor(n * 0.99)]]; });
  const mid = span.map(([a, b]) => (a + b) / 2), half = Math.max(1e-9, (span[0][1] - span[0][0]) / 2);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) q[i * 3 + k] = (q[i * 3 + k] - mid[k]) / half;
  let ext = span.map(([a, b]) => (b - a) / 2 / half);
  // (variance and percentile extent can disagree: reorder the axes so the first is the longest)
  const ord = [0, 1, 2].sort((i, j) => ext[j] - ext[i]);
  if (ord[0] !== 0 || ord[1] !== 1) {
    const r = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) r[i * 3 + k] = q[i * 3 + ord[k]] / ext[ord[0]];
    q.set(r); ext = ord.map((k) => ext[k] / ext[ord[0]]);
  }
  // fill: occupied cells of a 12³ grid over its box
  const G = 12, seen = new Uint8Array(G * G * G);
  let filled = 0;
  for (let i = 0; i < n; i++) {
    const c = [0, 1, 2].map((k) => Math.max(0, Math.min(G - 1, Math.floor(((q[i * 3 + k] / Math.max(1e-6, ext[k])) + 1) / 2 * G))));
    const o = (c[0] * G + c[1]) * G + c[2];
    if (!seen[o]) { seen[o] = 1; filled++; }
  }
  return { p: q, n, ext, fill: filled / (G * G * G), elong: ext[0] / Math.max(1e-6, ext[1]) };
}
// symmetric 3×3 eigenvectors by Jacobi rotations, sorted by eigenvalue
function eig3(A) {
  const a = A.map((r) => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return [0, 1, 2].map((r) => order.map((c) => V[r][c]));
}

/**
 * The correlation dimension (Grassberger & Procaccia 1983) of a described cloud: how the count of pairs
 * closer than r grows with r. A loop is 1, a sheet 2; a strange attractor is fractional, usually 1.3–2.5.
 * The largest Lyapunov exponent alone let slow limit cycles through (a long loop's estimate is noise).
 */
export function dimension(d, m = 1400) {
  const step = Math.max(1, Math.floor(d.n / m)), idx = [];
  for (let i = 0; i < d.n && idx.length < m; i += step) idx.push(i);
  const r1 = 0.03, r2 = 0.12;
  let c1 = 0, c2 = 0;
  for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    const i = idx[a] * 3, j = idx[b] * 3, dx = d.p[i] - d.p[j], dy = d.p[i + 1] - d.p[j + 1], dz = d.p[i + 2] - d.p[j + 2], r = dx * dx + dy * dy + dz * dz;
    if (r < r2 * r2) { c2++; if (r < r1 * r1) c1++; }
  }
  return c1 > 0 ? Math.log(c2 / c1) / Math.log(r2 / r1) : 0;
}

/**
 * Search the quadratic flows from a seed: codes are tried until one is bounded, not settled and chaotic.
 * Returns { code, lyap, tries, ...describe } or null after `budget` tries. `n` points are kept.
 */
export function discover(seed, { n = 20000, budget = 20000, dt = 0.02, minDim = 1.5 } = {}) {
  const rnd = mulberry32(seed);
  for (let tries = 1; tries <= budget; tries++) {
    const a = Array.from({ length: 30 }, () => Math.round((rnd() * 2.4 - 1.2) * 10) / 10);
    const f = quadratic(a), x0 = [0.05, 0.05, 0.05];
    // cheap screens first: bounded and moving over a short run
    const short = integrate(f, x0, dt, 1500, 500, 1e3);
    if (!short) continue;
    let spread = 0;
    for (let i = 1500 - 300; i < 1500; i++) spread = Math.max(spread, Math.abs(short.p[i * 3] - short.p[(1500 - 301) * 3]));
    if (spread < 1e-3) continue;                              // a fixed point
    const L = lyapunov(f, x0, dt, 3000);
    if (!(L > 0.02) || L > 5) continue;
    const full = integrate(f, x0, dt, n, 1000, 1e3);
    if (!full) continue;
    const d = describe(full);
    if (d.fill < 0.02) continue;                              // a thread: nearly a loop
    const D = dimension(d);
    if (D < minDim) continue;                                 // a loop or a torus, not a strange attractor
    return { code: toCode(a), lyap: L, dim: D, tries, dt, ...d };
  }
  return null;
}

/** A named or coded attractor, as a described cloud of n points. */
export function realise(key, n = 20000) {
  if (NAMED[key]) { const A = NAMED[key]; return { key, ...describe(integrate(A.f, A.x0, A.dt, n, 2000)) }; }
  const a = fromCode(key), c = integrate(quadratic(a), [0.05, 0.05, 0.05], 0.02, n, 1000, 1e3);
  return c ? { key, ...describe(c) } : null;
}
