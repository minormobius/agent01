/* Orbits, no DOM: point masses in any number of dimensions under a pull ∝ 1/r^k (k = 1 pinned, ours too; k = 2 Gauss
   in 4D), stepped by leapfrog (symplectic, so energy doesn't drift over thousands of orbits). G = 1. Also: a round
   star's outside potential from its shells (no shell theorem when pinned in 4D), an orbit's eccentricity vector and the
   angles between two orbits' planes. */
import { kTab } from "./atom.js";

/* the pull on body i from body j: −m_j k (x_i − x_j)/r^(k+2) (the gradient of −m_j/r^k) */
export function nbody(masses, xs, vs, { k = 1, dt = 0.01, steps = 1000, every = 10, onSample = null } = {}) {
  const n = masses.length, d = xs[0].length, x = xs.map((p) => p.slice()), v = vs.map((p) => p.slice());
  const acc = () => { const a = x.map(() => new Array(d).fill(0)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = x[j].map((u, c) => u - x[i][c]), r = Math.hypot(...dx), f = k / r ** (k + 2); for (let c = 0; c < d; c++) { a[i][c] += masses[j] * f * dx[c]; a[j][c] -= masses[i] * f * dx[c]; } } return a; };
  let a = acc();
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n; i++) for (let c = 0; c < d; c++) { v[i][c] += 0.5 * dt * a[i][c]; x[i][c] += dt * v[i][c]; }
    a = acc(); for (let i = 0; i < n; i++) for (let c = 0; c < d; c++) v[i][c] += 0.5 * dt * a[i][c];
    if (onSample && s % every === 0 && onSample(x, v, s * dt) === false) break;
  }
  return { x, v };
}
/* a body's orbit about another (mass mu = their sum, pull 1/r): eccentricity vector and the plane its (r, v) span */
export function eccentricity(r, w, mu = 1) {
  const R = Math.hypot(...r), w2 = w.reduce((s, u) => s + u * u, 0), rv = r.reduce((s, u, c) => s + u * w[c], 0);
  return Math.hypot(...r.map((u, c) => (w2 / mu - 1 / R) * u - (rv / mu) * w[c]));
}
export function planeOf(r, w) { const n1 = Math.hypot(...r), e1 = r.map((u) => u / n1), pr = w.reduce((t, u, c) => t + u * e1[c], 0), q = w.map((u, c) => u - pr * e1[c]), n2 = Math.hypot(...q); return [e1, q.map((u) => u / n2)]; }
/* the two principal angles between planes P and Q (degrees): 0, 0 the same plane; 90, 90 completely orthogonal (4D) */
export function planeAngles([a1, b1], [a2, b2]) {
  const dot = (p, q) => p.reduce((t, u, c) => t + u * q[c], 0), M = [[dot(a1, a2), dot(a1, b2)], [dot(b1, a2), dot(b1, b2)]];
  const t = M[0][0] ** 2 + M[0][1] ** 2 + M[1][0] ** 2 + M[1][1] ** 2, det2 = (M[0][0] * M[1][1] - M[0][1] * M[1][0]) ** 2, disc = Math.sqrt(Math.max(0, t * t - 4 * det2));
  return [(t + disc) / 2, (t - disc) / 2].map((s2) => (Math.acos(Math.min(1, Math.sqrt(Math.max(0, s2)))) * 180) / Math.PI);
}

/* outside a round star whose mass sits in shells (radii rs, masses ms, total 1): the potential and its slope. Pinned
   4D has no shell theorem, so it isn't −1/r: to leading order −1/r + ⟨r²⟩/8r³, a slight repulsion on top */
export function starPotential(rs, ms) {
  const M = ms.reduce((a, b) => a + b);
  const phi = (r) => -rs.reduce((s, ri, i) => s + ms[i] * kTab(Math.min(ri, r) / Math.max(ri, r)) / Math.max(ri, r), 0) / M;
  return { phi, slope: (r) => (phi(r * 1.0001) - phi(r * 0.9999)) / (0.0002 * r), r2: rs.reduce((s, ri, i) => s + ms[i] * ri * ri, 0) / M };
}
/* that correction turns an orbit's closest point backwards by −(3π/4)⟨r²⟩/p² per orbit (p its semi-latus rectum),
   by Landau's perturbation formula for δU = β/r³ */
export const precessionPerOrbit = (r2, p) => (-3 * Math.PI / 4) * r2 / (p * p);
/* measured: integrate a planar orbit in a central potential's slope and average the periapsis advance */
export function measurePrecession(slope, p, e, orbits = 5) {
  let x = p / (1 + e), y = 0, vx = 0, vy = Math.sqrt(p) / (p / (1 + e)); // at periapsis, the Kepler speed for unit mass
  const acc = (x, y) => { const r = Math.hypot(x, y), g = slope(r); return [(-g * x) / r, (-g * y) / r]; };
  const T = 2 * Math.PI * (p / (1 - e * e)) ** 1.5, per = 8000, dt = T / per; let [ax, ay] = acc(x, y), r1 = Math.hypot(x, y), r0 = r1, a1 = 0, a0 = 0; const peri = [];
  for (let s = 0; s < per * orbits; s++) {
    vx += 0.5 * dt * ax; vy += 0.5 * dt * ay; x += dt * vx; y += dt * vy; [ax, ay] = acc(x, y); vx += 0.5 * dt * ax; vy += 0.5 * dt * ay;
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    if (r1 < r0 && r1 < r && s > 10) { // the closest point lies between steps: a parabola through the last three radii places it
      let da = a - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      peri.push(a1 + ((0.5 * (r0 - r)) / (r0 - 2 * r1 + r)) * (da / 2));
    }
    r0 = r1; r1 = r; a0 = a1; a1 = a;
  }
  const adv = []; for (let i = 1; i < peri.length; i++) { let dph = peri[i] - peri[i - 1]; while (dph > Math.PI) dph -= 2 * Math.PI; while (dph < -Math.PI) dph += 2 * Math.PI; adv.push(dph); }
  return adv.reduce((a, b) => a + b, 0) / adv.length;
}

/* a star and two planets on circular orbits (radii 1 and a2): planet 2's plane turned from planet 1's by angle th
   (both principal angles, so 90° is completely orthogonal), its start 127° round. Run for some orbits of planet 1 */
export function twoPlanets(a2, thDeg, { mp = 1e-3, orbits = 2000, per = 400, e = 0, sample = 0, kind = "iso" } = {}) {
  // kind "iso": both principal angles th (90°: completely orthogonal); "line": the planes share a line (x) and differ
  // by th in one angle only, the only tilt our world's planets can have
  const th = (thDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th), ang = 2.2;
  const [U, V] = kind === "line" ? [[1, 0, 0, 0], [0, c, s, 0]] : [[c, 0, s, 0], [0, c, 0, s]];
  const rp1 = 1 - e, rp2 = a2 * (1 - e), v1 = Math.sqrt((1 + e) / rp1), v2 = Math.sqrt((1 + e) / rp2);
  const xs = [[0, 0, 0, 0], [rp1, 0, 0, 0], U.map((u, k) => rp2 * (Math.cos(ang) * u + Math.sin(ang) * V[k]))];
  const vs = [[0, 0, 0, 0], [0, v1, 0, 0], U.map((u, k) => v2 * (-Math.sin(ang) * u + Math.cos(ang) * V[k]))];
  const m = [1, mp, mp]; for (let k = 0; k < 4; k++) vs[0][k] = -(mp * vs[1][k] + mp * vs[2][k]);
  let emax = 0, dmin = Infinity, lost = null, wander = 0, count = 0; const series = [];
  const dt = (2 * Math.PI) / per, every = Math.max(1, Math.round(per / 4));
  nbody(m, xs, vs, { k: 1, dt, steps: orbits * per, every, onSample: (x, v, t) => {
    const r1 = x[1].map((u, k) => u - x[0][k]), w1 = v[1].map((u, k) => u - v[0][k]), r2 = x[2].map((u, k) => u - x[0][k]), w2 = v[2].map((u, k) => u - v[0][k]);
    const e1 = eccentricity(r1, w1, 1 + mp), e2 = eccentricity(r2, w2, 1 + mp); emax = Math.max(emax, e1, e2);
    dmin = Math.min(dmin, Math.hypot(...r1.map((u, k) => u - r2[k]))); wander = Math.max(wander, Math.hypot(r1[2], r1[3]) / Math.hypot(...r1));
    if (sample && count++ % (4 * sample) === 0) series.push([+(t / (2 * Math.PI)).toFixed(1), +Math.max(e1, e2).toFixed(5), +planeAngles(planeOf(r1, w1), planeOf(r2, w2))[0].toFixed(2), +(Math.hypot(r1[2], r1[3]) / Math.hypot(...r1)).toFixed(4)]);
    if (Math.hypot(...r1) > 4 || Math.hypot(...r2) > 4 * a2 || e1 > 0.95 || e2 > 0.95) { lost = +(t / (2 * Math.PI)).toFixed(0); return false; }
  } });
  return { a2, thDeg, emax: +emax.toFixed(4), dmin: +dmin.toFixed(3), wander: +wander.toFixed(3), lost, series };
}
/* a circular orbit nudged by 1% in speed, under a pull k: bounded under 1/r (k = 1), runs away under Gauss (k = 2) */
export function nudged(k, d = 4, orbits = 30) {
  const v0 = Math.sqrt(k), out = []; // circular at r = 1: v² = k/r^k
  nbody([1, 1e-9], [new Array(d).fill(0), [1, ...new Array(d - 1).fill(0)]], [new Array(d).fill(0), [0, 1.01 * v0, ...new Array(d - 2).fill(0)]], { k, dt: 0.002, steps: Math.round((orbits * 2 * Math.PI) / 0.002), every: 50,
    onSample: (x, v, t) => { const r = Math.hypot(...x[1].map((u, c) => u - x[0][c])); out.push([+(t / (2 * Math.PI)).toFixed(3), +r.toFixed(4)]); if (r > 6 || r < 0.05) return false; } });
  return out;
}

/* a moon round a planet (mass mp) on a circular orbit about the star at radius 1 in the xy plane: the moon starts at
   distance dm in the plane spanned by u (its start direction) and v (its velocity's), and is followed for some orbits
   of the planet. Returns the moon's largest eccentricity about the planet, how far its plane turned (degrees), and the
   planet orbit it was lost on (escaped or crashed), if it was */
export function moonRun(u, v, { mp = 1e-3, dm = 0.025, orbits = 150, dt = 2e-4 } = {}) {
  const vm = Math.sqrt(mp / dm), P0 = planeOf(u, v);
  const xs = [[0, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0].map((a, k) => a + dm * u[k])], vs = [[0, 0, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0].map((a, k) => a + vm * v[k])];
  let emax = 0, tilt = 0, lost = null;
  nbody([1, mp, 1e-9], xs, vs, { k: 1, dt, steps: Math.round((orbits * 2 * Math.PI) / dt), every: 500, onSample: (x, w, t) => {
    const r = x[2].map((a, k) => a - x[1][k]), s = w[2].map((a, k) => a - w[1][k]), e = eccentricity(r, s, mp);
    emax = Math.max(emax, e); tilt = Math.max(tilt, planeAngles(P0, planeOf(r, s))[0]);
    if (Math.hypot(...r) > 2.8 * dm || e > 0.95) { lost = +(t / 2 / Math.PI).toFixed(1); return false; }
  } });
  return { emax: +emax.toFixed(3), tilt: +tilt.toFixed(1), lost };
}
export const MOON_PLANES = {
  same: [[1, 0, 0, 0], [0, 1, 0, 0]], // in the planet's own orbital plane
  line90: [[1, 0, 0, 0], [0, 0, 1, 0]], // sharing a line with it, tilted 90°: our world's polar moon
  line60: [[1, 0, 0, 0], [0, 0.5, Math.sqrt(0.75), 0]],
  iso45: [[Math.SQRT1_2, 0, Math.SQRT1_2, 0], [0, Math.SQRT1_2, 0, Math.SQRT1_2]], // tilted 45° in both angles
  ortho: [[0, 0, 1, 0], [0, 0, 0, 1]], // completely orthogonal to the planet's orbit
};

/* starlight on a planet in d dimensions. It catches light over its shadow, a ball of one dimension less, and glows from
   its whole surface, so the share of its surface's worth of light it absorbs is V_(d−1)/S_d: 1/4 ours, 2/(3π) in 4D.
   Glowing as T^(d+1) (Planck in d dimensions) with light thinning as 1/r^(d−1), its temperature goes as
   r^(−(d−1)/(d+1)): r^(−1/2) ours, r^(−3/5) in 4D. Black, no air: the equilibrium temperature */
const sphereA = (d) => (2 * Math.PI ** (d / 2)) / gammaHalfO(d), ballV = (d) => sphereA(d) / d;
function gammaHalfO(n) { if (n % 2 === 0) { let g = 1; for (let k = 2; k < n / 2; k++) g *= k; return g; } let g = Math.sqrt(Math.PI); for (let k = 1; k < n - 1; k += 2) g *= k / 2; return g; }
export const absorbShare = (d) => ballV(d - 1) / sphereA(d);
export const tempPower = (d) => -(d - 1) / (d + 1);
/* a planet at r star radii from a star with surface temperature Ts */
export const planetT = (d, Ts, r) => Ts * (absorbShare(d) * r ** -(d - 1)) ** (1 / (d + 1));
/* how far out a planet must be for temperature T (star radii) */
export const radiusFor = (d, Ts, T) => (absorbShare(d) * (Ts / T) ** (d + 1)) ** (1 / (d - 1));
