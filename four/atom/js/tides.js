/* ATOM⁴'s tides, no DOM, in any number of dimensions: what a star's tide does to a planet's spin. The planets chapter's
   "a locked planet keeps a day".

   A spin is a turning, Ω (a d × d antisymmetric matrix: one rate per plane, two independent rates in 4D), each point of
   the planet moving at v = Ωx. The star, at r from the planet's centre, pulls the near and far sides unevenly: under the
   pinned law (potential −GM/r, as for 1/r in any d) the tidal force per mass at x is
       F(x) = (GM/r³)(3 r̂(r̂·x) − x),
   the same form in every dimension, because it is the expansion of 1/|r − x| and nothing else. The planet yields to it
   with a bulge, a second moment Q along the star's direction, Q r̂ = λ (GM/r³)(ŝ·r̂) ŝ, and torque on it is
       τ_ij = ∫ρ(x_i F_j − x_j F_i) = (3GM/r³) [(Q r̂)_i r̂_j − (Q r̂)_j r̂_i].
   The bulge lags: it was raised a time Δt ago and has since been carried round by the spin, so it points along
   ŝ = exp(ΩΔt) r̂(t − Δt) (the constant-time-lag model, Mignard 1979 and Hut 1981 in our world). λ (how far the planet
   yields) and Δt (how slowly) are the planet's own and are declared; everything else follows.

   What follows in 4D. The torque is always a bivector r̂ ∧ (…), so it has no part in any plane completely orthogonal
   to r̂, and the star stays in the orbit's plane: the spin's part in the plane completely orthogonal to the orbit
   feels no torque at all, exactly, for any lag. A spin in that plane doesn't move the star's direction in the body
   either, so it raises no lag. So tides drive the spin's part in the orbit's plane to the orbit's own rate (a planet
   locked face to the star), damp the parts that mix the two planes, and leave the completely orthogonal part as it
   was: a locked 4D planet keeps turning, in the plane its orbit leaves free. That turning brings no night: sunlight on a
   point x of the surface goes with x·r̂, and the star's direction r̂ lies in the orbit's plane, which the free plane's
   turning leaves fixed, point for point. So the star never rises or sets (a day side and a night side, as a locked
   planet of ours has), while the rest of the sky wheels overhead in the free plane. starAngle below checks it.

   Also here: a planet that knows nothing of these formulas, masses on the corners of a regular simplex joined by
   springs with dampers, orbiting a star as point masses. It yields and lags because it's elastic and lossy, and the
   selftest holds the formula's conclusions to it. Units: G = 1. */
import { rates } from "./nebula.js";

const PAIRS4 = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
export const zero = (d) => Array.from({ length: d }, () => new Array(d).fill(0));
export const matvec = (A, x) => A.map((row) => row.reduce((s, a, k) => s + a * x[k], 0));
/* a turning from its plane rates: list of [a, b, rate] (a turning x_a toward x_b at that rate) */
export function turning(d, planes) { const O = zero(d); for (const [a, b, w] of planes) { O[b][a] += w; O[a][b] -= w; } return O; }
/* exp of an antisymmetric matrix (scaling and squaring) */
export function expm(A) {
  const d = A.length, n = Math.max(...A.flat().map(Math.abs)), s = Math.max(0, Math.ceil(Math.log2(n * d + 1e-30)) + 1), k = 2 ** -s;
  const mul = (X, Y) => X.map((r, i) => Y[0].map((_, j) => r.reduce((t, x, l) => t + x * Y[l][j], 0)));
  let E = zero(d).map((r, i) => r.map((_, j) => +(i === j))), T = E.map((r) => r.slice());
  const B = A.map((r) => r.map((v) => v * k)); for (let m = 1; m <= 14; m++) { T = mul(T, B).map((r) => r.map((v) => v / m)); E = E.map((r, i) => r.map((v, j) => v + T[i][j])); }
  for (let i = 0; i < s; i++) E = mul(E, E);
  return E;
}
/* the tidal torque on a planet spinning at Ω, the star at r moving at rdot relative to it (mass M), the planet's
   yielding λ and lag Δt: a d × d antisymmetric matrix */
export function torque(Om, r, rdot, { M = 1, lambda = 1, lag = 0.01 } = {}) {
  const d = r.length, R = Math.hypot(...r), past = r.map((x, i) => x - lag * rdot[i]), P = Math.hypot(...past);
  const s0 = matvec(expm(Om.map((row) => row.map((v) => v * lag))), past.map((x) => x / P)), sn = Math.hypot(...s0), s = s0.map((x) => x / sn), u = r.map((x) => x / R);
  const c = (3 * lambda * M * M) / R ** 6, su = s.reduce((t, x, i) => t + x * u[i], 0), T = zero(d);
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) T[i][j] = c * su * (s[i] * u[j] - s[j] * u[i]);
  return T;
}
/* a round planet's angular momentum is L = −2 I₀ Ω (I₀ = ∫ρx_k² along any one axis, L_ij = ∫ρ(x_i v_j − x_j v_i)), so
   the spin answers a torque as dΩ/dt = −τ / 2I₀ */
export const spinRate = (tau, I0) => tau.map((row) => row.map((v) => -v / (2 * I0)));
/* the spin under the tide of a star on a circular orbit of radius a in the plane of axes 0 and 1 (rate n = a^(−3/2)):
   the orbit is held (the planet's spin is a tiny share of the orbit's angular momentum). Returns samples
   { t, Om, rates: [the larger, the smaller], orbitPart: Ω₀₁, freePart: the completely orthogonal plane's (4D),
   mixed: the size of the parts that mix the planes } */
export function spinDown(Om0, { a = 1, M = 1, lambda = 1e-3, lag = 0.05, I0 = 1e-3, T = 100, dt = 0.01, every = 100 } = {}) {
  const d = Om0.length, n = Math.sqrt(M / a ** 3), out = []; let Om = Om0.map((r) => r.slice()), t = 0;
  const sample = () => { const B = d === 4 ? PAIRS4.map(([i, j]) => Om[j][i]) : null; out.push({ t, Om: Om.map((r) => r.slice()), orbitPart: Om[1][0], freePart: d === 4 ? Om[3][2] : 0, mixed: Math.hypot(...Om.flatMap((row, i) => row.filter((_, j) => j > i && !((i === 0 && j === 1) || (i === 2 && j === 3))))), rates: B ? rates(B) : [Math.hypot(...Om.flatMap((r, i) => r.filter((_, j) => j > i)))] }); };
  for (let k = 0; t < T; k++) {
    if (k % every === 0) sample();
    const f = (O, tt) => { const th = n * tt, r = new Array(d).fill(0), v = new Array(d).fill(0); r[0] = a * Math.cos(th); r[1] = a * Math.sin(th); v[0] = -a * n * Math.sin(th); v[1] = a * n * Math.cos(th); return spinRate(torque(O, r, v, { M, lambda, lag }), I0); };
    const add = (A, B, h) => A.map((r, i) => r.map((x, j) => x + h * B[i][j]));
    const k1 = f(Om, t), k2 = f(add(Om, k1, dt / 2), t + dt / 2), k3 = f(add(Om, k2, dt / 2), t + dt / 2), k4 = f(add(Om, k3, dt), t + dt);
    Om = Om.map((r, i) => r.map((x, j) => x + (dt / 6) * (k1[i][j] + 2 * k2[i][j] + 2 * k3[i][j] + k4[i][j]))); t += dt;
  }
  sample(); return { n, samples: out };
}

/* the cosine of the star's height above the horizon at a point of a planet's surface (x₀, a unit vector in the body's
   frame at t = 0) over time, the planet spinning at Ω and the star circling in axes 0 and 1 at rate n: x(t) = e^(Ωt)x₀,
   r̂(t) = (cos nt, sin nt, 0, …). Returns samples of x·r̂ */
export function starAngle(Om, x0, n, T, steps = 200) {
  const out = []; for (let k = 0; k <= steps; k++) { const t = (T * k) / steps, x = matvec(expm(Om.map((r) => r.map((v) => v * t))), x0); out.push(x[0] * Math.cos(n * t) + x[1] * Math.sin(n * t)); }
  return out;
}

/* ---------------------------------------------------------------- a planet that knows nothing of the formula */
/* the corners of a regular simplex in d dimensions, circumradius 1 (its second moment is round, as a planet's is) */
export function simplex(d) {
  const V = []; for (let i = 0; i <= d; i++) V.push(Array.from({ length: d + 1 }, (_, k) => +(k === i) - 1 / (d + 1)));
  // an orthonormal basis of the hyperplane the corners span, by Gram–Schmidt
  const B = []; for (let i = 0; i < d; i++) { let v = Array.from({ length: d + 1 }, (_, k) => +(k === i) - +(k === i + 1)); for (const b of B) { const p = v.reduce((s, x, k) => s + x * b[k], 0); v = v.map((x, k) => x - p * b[k]); } const nn = Math.hypot(...v); B.push(v.map((x) => x / nn)); }
  const P = V.map((v) => B.map((b) => b.reduce((s, x, k) => s + x * v[k], 0))), r0 = Math.hypot(...P[0]);
  return P.map((p) => p.map((x) => x / r0));
}
/* a spring-and-damper planet: d + 1 masses m at a simplex's corners (circumradius s), every pair joined by a spring
   (natural frequency w0) with a damper (damping ratio zeta), spinning at Om, its centre on a circular orbit of radius
   a round a star of mass M at the origin (the orbit in axes 0 and 1). Stepped by velocity Verlet with the dampers'
   velocities taken at the half step. Returns samples of the planet's spin (from its corners' angular momentum about
   their centre, with the inertia that shape has now) */
export function springPlanet(Om0, { d = Om0.length, s = 0.05, m = 1e-9, w0 = 6, zeta = 0.3, a = 1, M = 1, T = 200, every = 400 } = {}) {
  const C = simplex(d).map((p) => p.map((x) => x * s)), N = d + 1, n = Math.sqrt(M / a ** 3), dt = 1 / (40 * w0);
  const x = C.map((p) => p.map((v, k) => v + (k === 0 ? a : 0))), vC = new Array(d).fill(0); vC[1] = a * n;
  const v = C.map((p) => matvec(Om0, p).map((u, k) => u + vC[k]));
  const L0 = C.map((p, i) => C.map((q) => Math.hypot(...p.map((u, k) => u - q[k])))), k = m * w0 * w0, c = 2 * zeta * m * w0;
  const force = (X, V) => X.map((p, i) => {
    const r2 = p.reduce((t, u) => t + u * u, 0), g = -M / (r2 * Math.sqrt(r2)), f = p.map((u) => g * u * m);
    for (let j = 0; j < N; j++) { if (j === i) continue; const dx = X[j].map((u, q) => u - p[q]), L = Math.hypot(...dx), e = dx.map((u) => u / L), dv = V[j].map((u, q) => u - V[i][q]), rel = dv.reduce((t, u, q) => t + u * e[q], 0), mag = k * (L - L0[i][j]) + c * rel; for (let q = 0; q < d; q++) f[q] += mag * e[q]; }
    return f;
  });
  const out = [], spinOf = () => {
    const cm = x[0].map((_, q) => x.reduce((t, p) => t + p[q], 0) / N), vm = v[0].map((_, q) => v.reduce((t, p) => t + p[q], 0) / N);
    const L = zero(d), I = zero(d); for (let i = 0; i < N; i++) { const r = x[i].map((u, q) => u - cm[q]), w = v[i].map((u, q) => u - vm[q]); for (let a2 = 0; a2 < d; a2++) for (let b = 0; b < d; b++) { L[a2][b] += m * (r[a2] * w[b] - r[b] * w[a2]); I[a2][b] += m * r[a2] * r[b]; } }
    // a round shape's L = −2I₀Ω (the simplex's second moment is round; its small strains are left out)
    const I0 = I.reduce((t, r, i) => t + r[i], 0) / d, Om = L.map((r) => r.map((u) => -u / (2 * I0)));
    return { Om, r: cm, L, I0 };
  };
  let f = force(x, v), t = 0;
  for (let st = 0; t < T; st++) {
    if (st % every === 0) { const sp = spinOf(); out.push({ t, orbitPart: sp.Om[1][0], freePart: d === 4 ? sp.Om[3][2] : 0, Lfree: d === 4 ? sp.L[2][3] : 0, I0: sp.I0, mixed: Math.hypot(...sp.Om.flatMap((row, i) => row.filter((_, j) => j > i && !((i === 0 && j === 1) || (i === 2 && j === 3))))), Om: sp.Om, R: Math.hypot(...sp.r) }); }
    const vh = v.map((p, i) => p.map((u, q) => u + (0.5 * dt * f[i][q]) / m));
    for (let i = 0; i < N; i++) for (let q = 0; q < d; q++) x[i][q] += dt * vh[i][q];
    f = force(x, vh); for (let i = 0; i < N; i++) for (let q = 0; q < d; q++) v[i][q] = vh[i][q] + (0.5 * dt * f[i][q]) / m;
    t += dt;
  }
  return { n, samples: out };
}
