// thought.js — the figure as points: first tracing the mannequin's surface, then loosed into strange
// attractors that keep only the body's shape. A self-portrait: a form made of flows.
//
// Every point has an anchor on a body part's surface (u along the part, θ around it) and a place in an
// attractor fitted to that part (the attractor's longest axis laid along the bone, the rest across it).
// `m` (0..1) moves each point from its anchor to its orbit. The attractors are integrated ONCE, here, at
// load, and read by index: a point's orbit at time t is sample (offset + t·rate), so the picture stays
// a pure function of t, and a still, a seek and an export all agree.

// ---- the attractors ---------------------------------------------------------------------------------
function integrate(f, x0, dt, n, skip) {
  // RK4, with the derivative written into a scratch array (no allocation per step: this runs at load)
  let x = x0[0], y = x0[1], z = x0[2];
  const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0], out = new Float32Array(n * 3);
  for (let i = 0; i < n + skip; i++) {
    f(x, y, z, k1);
    f(x + (dt / 2) * k1[0], y + (dt / 2) * k1[1], z + (dt / 2) * k1[2], k2);
    f(x + (dt / 2) * k2[0], y + (dt / 2) * k2[1], z + (dt / 2) * k2[2], k3);
    f(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2], k4);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (i >= skip) { out[(i - skip) * 3] = x; out[(i - skip) * 3 + 1] = y; out[(i - skip) * 3 + 2] = z; }
  }
  // centred, the longest axis first, each axis scaled to about ±1 (the 1st–99th percentile)
  const axes = [0, 1, 2].map((a) => {
    const v = new Float32Array(n); for (let i = 0; i < n; i++) v[i] = out[i * 3 + a]; v.sort();
    const lo = v[Math.floor(n * 0.01)], hi = v[Math.floor(n * 0.99)];
    return { a, mid: (lo + hi) / 2, half: (hi - lo) / 2 || 1 };
  }).sort((x, y) => y.half - x.half);
  const norm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) axes.forEach((ax, k) => { norm[i * 3 + k] = (out[i * 3 + ax.a] - ax.mid) / ax.half; });
  return { n, p: norm };
}
const N = 24000;
export const ATTRACTORS = {
  // the torso: Lorenz, the butterfly
  lorenz: integrate((x, y, z, o) => { o[0] = 10 * (y - x); o[1] = x * (28 - z) - y; o[2] = x * y - (8 / 3) * z; }, [0.1, 0, 0], 0.004, N, 2000),
  // the head: Aizawa, a sphere with a tube through it
  aizawa: integrate((x, y, z, o) => { o[0] = (z - 0.7) * x - 3.5 * y; o[1] = 3.5 * x + (z - 0.7) * y; o[2] = 0.6 + 0.95 * z - z ** 3 / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x ** 3; }, [0.1, 0, 0], 0.01, N, 2000),
  // the limbs: Thomas's cyclically symmetric attractor, a knotted skein
  thomas: integrate((x, y, z, o) => { o[0] = Math.sin(y) - 0.208186 * x; o[1] = Math.sin(z) - 0.208186 * y; o[2] = Math.sin(x) - 0.208186 * z; }, [0.1, 0, 0.2], 0.05, N, 2000),
  // the feet and hands: Halvorsen, three-lobed
  halvorsen: integrate((x, y, z, o) => { o[0] = -1.4 * x - 4 * y - 4 * z - y * y; o[1] = -1.4 * y - 4 * z - 4 * x - z * z; o[2] = -1.4 * z - 4 * x - 4 * y - x * x; }, [-1, 0, 0], 0.004, N, 2000),
};

// ---- the points -------------------------------------------------------------------------------------
const hash = (a, b = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** The parts: [name, from joint, to joint, radius at from, radius at to, attractor, share of points]. */
export const PARTS = [
  ['thighL', 'hipL', 'kneeL', 0.075, 0.055, 'thomas', 1.2], ['shinL', 'kneeL', 'ankleL', 0.055, 0.038, 'thomas', 1],
  ['footL', 'heelL', 'toeL', 0.04, 0.03, 'halvorsen', 0.35],
  ['thighR', 'hipR', 'kneeR', 0.075, 0.055, 'thomas', 1.2], ['shinR', 'kneeR', 'ankleR', 0.055, 0.038, 'thomas', 1],
  ['footR', 'heelR', 'toeR', 0.04, 0.03, 'halvorsen', 0.35],
  ['torso', 'pelvis', 'chest', 0.14, 0.17, 'lorenz', 3.2], ['neck', 'chest', 'neck', 0.12, 0.05, 'lorenz', 0.5],
  ['upperL', 'shL', 'elbowL', 0.045, 0.038, 'thomas', 0.7], ['foreL', 'elbowL', 'handL', 0.036, 0.028, 'thomas', 0.6],
  ['upperR', 'shR', 'elbowR', 0.045, 0.038, 'thomas', 0.7], ['foreR', 'elbowR', 'handR', 0.036, 0.028, 'thomas', 0.6],
  ['head', 'head', 'head', 0.1, 0.1, 'aizawa', 1.8],
];
/** The bar each part starts to let go of the surface: as its wood burns (render.js burnAt: bars 12–42,
 * head first). So it never stands as one complete ghost of the mannequin: where the wood goes, the
 * thought takes over, from the top down. */
export const LOOSEN = PARTS.map(([name]) => ({ head: 14, neck: 16, torso: 18, upperL: 22, upperR: 22, foreL: 24, foreR: 24, thighL: 28, thighR: 28, shinL: 32, shinR: 32, footL: 36, footR: 36 })[name]);
export const POINTS = (() => {
  const total = 3200, share = PARTS.reduce((a, p) => a + p[6], 0), out = [];
  PARTS.forEach((part, pi) => {
    const n = Math.round((total * part[6]) / share);
    for (let k = 0; k < n; k++) {
      const id = out.length;
      out.push({ part: pi, u: hash(id, 1), th: hash(id, 2) * Math.PI * 2, v: hash(id, 5) * 2 - 1, off: Math.floor(hash(id, 3) * N), rate: 90 + 60 * hash(id, 4),
        // the swirl over the surface: round the part (faster where it sheers) and along it, back and forth
        spin: (0.7 + 0.9 * hash(id, 6)) * (pi % 2 ? 1 : -1), drift: 0.05 + 0.12 * hash(id, 7) });
    }
  });
  return out;
})();

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Each part's frame at a pose: origin, axis (length), and two directions across it. */
export function frames(P) {
  return PARTS.map(([, a, b, r0, r1]) => {
    if (a === b) {                                        // the head: an ovoid in the body's own frame
      return { o: P.head, d: [0, 1, 0], L: 0, e1: P.fwd, e2: P.left, r0, r1, head: true };
    }
    const A = P[a], B = P[b], v = sub(B, A), L = Math.hypot(v[0], v[1], v[2]) || 1e-6, d = [v[0] / L, v[1] / L, v[2] / L];
    const ref = Math.abs(d[0] * P.fwd[0] + d[2] * P.fwd[2]) < 0.9 ? P.fwd : [0, 1, 0];
    const dr = ref[0] * d[0] + ref[1] * d[1] + ref[2] * d[2];
    const e1 = norm([ref[0] - d[0] * dr, ref[1] - d[1] * dr, ref[2] - d[2] * dr]), e2 = cross(d, e1);
    return { o: A, d, L, e1, e2, r0, r1 };
  });
}

/**
 * Where point i is at time t (seconds, for its orbit) given its part's frame, `m` (0 on the surface,
 * 1 in its orbit) and `swell` (the orbit's reach, as a multiple of the part's radius). Writes into out.
 */
export function place(i, F, t, mAll, swell, out, lag = 0) {
  const q = POINTS[i], f = F[q.part], A = ATTRACTORS[PARTS[q.part][5]];
  const m = typeof mAll === 'number' ? mAll : mAll[q.part];          // one amount, or one per part
  // on the surface, swirling: the points never sit still; they stream round and along the part
  let sx, sy, sz;
  const tri = (x) => 1 - Math.abs((((x % 2) + 2) % 2) - 1);           // 0..1..0, back and forth
  if (f.head) {
    const v = 2 * tri((q.v + 1) / 2 + q.drift * t) - 1, th = q.th + q.spin * t * (1.2 - 0.6 * v * v);
    const c = Math.sqrt(Math.max(0, 1 - v * v)), a = [c * Math.cos(th), v, c * Math.sin(th)];
    sx = f.o[0] + f.e1[0] * a[0] * 0.09 + f.d[0] * a[1] * 0.115 + f.e2[0] * a[2] * 0.085;
    sy = f.o[1] + f.e1[1] * a[0] * 0.09 + f.d[1] * a[1] * 0.115 + f.e2[1] * a[2] * 0.085;
    sz = f.o[2] + f.e1[2] * a[0] * 0.09 + f.d[2] * a[1] * 0.115 + f.e2[2] * a[2] * 0.085;
  } else {
    const u = tri(q.u + q.drift * t), th = q.th + q.spin * t * (1 + 0.8 * Math.sin(2 * Math.PI * u));
    const r = f.r0 + (f.r1 - f.r0) * u, c = Math.cos(th) * r, s = Math.sin(th) * r, l = u * f.L;
    sx = f.o[0] + f.d[0] * l + f.e1[0] * c + f.e2[0] * s;
    sy = f.o[1] + f.d[1] * l + f.e1[1] * c + f.e2[1] * s;
    sz = f.o[2] + f.d[2] * l + f.e1[2] * c + f.e2[2] * s;
  }
  if (m <= 0.0005) { out[0] = sx; out[1] = sy; out[2] = sz; return out; }
  // in the orbit: the attractor's long axis along the bone, the others across it
  const k = ((Math.floor((t - lag) * q.rate) + q.off) % A.n + A.n) % A.n, ax = A.p[k * 3], ay = A.p[k * 3 + 1], az = A.p[k * 3 + 2];
  let ox, oy, oz;
  if (f.head) {
    const R = 0.1 * swell;
    ox = f.o[0] + (f.e1[0] * ay + f.d[0] * ax * 1.15 + f.e2[0] * az) * R;
    oy = f.o[1] + (f.e1[1] * ay + f.d[1] * ax * 1.15 + f.e2[1] * az) * R;
    oz = f.o[2] + (f.e1[2] * ay + f.d[2] * ax * 1.15 + f.e2[2] * az) * R;
  } else {
    const u = (ax + 1) / 2, r = (f.r0 + (f.r1 - f.r0) * Math.min(1, Math.max(0, u))) * swell, l = u * f.L;
    ox = f.o[0] + f.d[0] * l + (f.e1[0] * ay + f.e2[0] * az) * r;
    oy = f.o[1] + f.d[1] * l + (f.e1[1] * ay + f.e2[1] * az) * r;
    oz = f.o[2] + f.d[2] * l + (f.e1[2] * ay + f.e2[2] * az) * r;
  }
  out[0] = sx + (ox - sx) * m; out[1] = sy + (oy - sy) * m; out[2] = sz + (oz - sz) * m;
  return out;
}
