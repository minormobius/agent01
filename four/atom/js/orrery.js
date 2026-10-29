/* ATOM⁴'s orrery, no DOM: a planetary system round a 4D star (pinned gravity, potential −1/r), put together from what the
   planets chapter computed, and the n-body motion to run it. Drawn by four/orrery/.

   Planes, from the nebula. A cloud's spin is a turning at two rates, 1 in xy and q in zw (the chapter: a random spin's
   slower rate is typically a fifth of the faster). Its left half of turning points along (1 + q, 0, 0), its right half
   along (1 − q, 0, 0). The runs found every orbit's left half lined up with the cloud's (to 0.999) and its right half
   lined up only on average, settling at a mean cosine just under (1 − q)/(1 + q): MINUS below, as measured. So each
   planet's plane has the cloud's left half and a right half drawn round the cloud's with that mean cosine (a
   von Mises–Fisher spread on the sphere of right halves: the shape of the spread is our choice, its mean is measured).
   Two planes with the same left half are isoclinic to each other, both angles between them equal to half the angle
   between their right halves, which is the kind of tilt the stability map ran ("iso").

   Spacing, from the stability map. Each planet is put out past the last at the closest ratio of radii the map found
   stable for 100,000 orbits at their tilt and mass (taken at the grid point below, so on the safe side), times a
   random margin; then the whole system is run briefly here and redrawn if anything strays.

   Moons, from the moon runs: each in its planet's completely orthogonal plane (the left half kept, the right half
   reversed), the one plane the star can't tug, at a third of the planet's Hill radius.

   Temperatures, from starlight: a black planet at r star radii from a star of surface temperature Ts sits at
   planetT(4, Ts, r) (js/orbits.js). The star's own temperature isn't known for 4D; Ts is declared, our Sun's by
   default. Units: G = 1, the star's mass 1, distance in UNIT star radii. */
import { rng } from "./landscape.js";
import { STABILITY, RATIOS, ANGLES } from "./stabilitydata.js";
import { planeAngles, planetT } from "./orbits.js";

export const UNIT = 100; // star radii per unit of distance: our water's liquid band round a Sun-like 4D star is 0.57–0.96
export const TSUN = 5772;
/* the nebula runs' settled right-half alignment (tools/nebula.mjs, the T = 500 runs; q = 0.5 the mean of two seeds) */
export const MINUS = [[0, 0.998], [0.25, 0.569], [0.5, 0.314], [0.75, 0.125], [1, 0]];
export const minusOf = (q) => { for (let i = 1; i < MINUS.length; i++) if (q <= MINUS[i][0]) { const [q0, m0] = MINUS[i - 1], [q1, m1] = MINUS[i]; return m0 + ((m1 - m0) * (q - q0)) / (q1 - q0); } return 0; };

/* a plane from its two halves (unit 3-vectors): the bivector's six numbers (xy, xz, xw, yz, yw, zw), as js/nebula.js
   splits them, run backwards */
export function bivector(l, r) { return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2, (l[2] - r[2]) / 2, (r[1] - l[1]) / 2, (l[0] - r[0]) / 2]; }
export const halves = (B) => [[B[0] + B[5], B[1] - B[4], B[2] + B[3]], [B[0] - B[5], B[1] + B[4], B[2] - B[3]]];
const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
/* two orthonormal vectors spanning a simple unit bivector's plane, u turning toward v */
export function spanOf(B) {
  const M = [0, 1, 2, 3].map(() => [0, 0, 0, 0]); PAIRS.forEach(([a, b], i) => { M[a][b] = B[i]; M[b][a] = -B[i]; });
  const mul = (x) => M.map((row) => row.reduce((s, m, k) => s + m * x[k], 0)), unit = (x) => { const n = Math.hypot(...x); return x.map((v) => v / n); };
  let best = null; for (let k = 0; k < 4; k++) { const y = mul([0, 1, 2, 3].map((i) => +(i === k))); if (!best || Math.hypot(...y) > Math.hypot(...best)) best = y; }
  const u = unit(best); return [u, unit(mul(u))];
}
/* a unit vector on the sphere round axis a (unit) with mean cosine m to it: von Mises–Fisher, κ from m */
function aroundAxis(a, m, rnd) {
  let kappa = 0; if (m > 1e-3) { let lo = 1e-6, hi = 1e4; for (let i = 0; i < 100; i++) { const k = Math.sqrt(lo * hi), A = 1 / Math.tanh(k) - 1 / k; if (A < m) lo = k; else hi = k; } kappa = Math.sqrt(lo * hi); }
  const u = rnd(), c = kappa ? 1 + Math.log(u + (1 - u) * Math.exp(-2 * kappa)) / kappa : 2 * u - 1, s = Math.sqrt(Math.max(0, 1 - c * c)), ph = 2 * Math.PI * rnd();
  const t = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = (() => { const d = t.reduce((x, v, i) => x + v * a[i], 0), w = t.map((v, i) => v - d * a[i]), n = Math.hypot(...w); return w.map((v) => v / n); })();
  const e2 = [a[1] * e1[2] - a[2] * e1[1], a[2] * e1[0] - a[0] * e1[2], a[0] * e1[1] - a[1] * e1[0]];
  return a.map((v, i) => c * v + s * (Math.cos(ph) * e1[i] + Math.sin(ph) * e2[i]));
}
/* the stability map's verdict for two planets (mass m each, the heavier taken), radii ratio x ≥ 1, isoclinic at th
   degrees: stable if kept for 100,000 orbits with small eccentricity at the grid point below in ratio and on both
   sides in angle. Past the map's widest ratio, stable (it found every pair there kept) */
export function pairStable(m, x, th) {
  if (x >= RATIOS[RATIOS.length - 1]) return true;
  const mp = [0.0001, 0.001, 0.01].find((v) => v >= m * 0.999) ?? 0.01, tab = STABILITY.find((s) => s.mp === mp && s.kind === "iso");
  const xr = [...RATIOS].reverse().find((v) => v <= x + 1e-9), lo = Math.max(...ANGLES.filter((a) => a <= th + 1e-9)), hi = Math.min(...ANGLES.filter((a) => a >= th - 1e-9));
  return [lo, hi].every((a) => { const r = tab.runs.find((q) => q.a2 === xr && q.th === a); return r && r.lost === null && r.emax < 0.1; });
}
const NAMES = "bcdefgh";
/* a system: seed, how many planets, the cloud's second rate q (drawn as a random spin's if not given), the star's
   surface temperature. Returns the star, planets and moons with positions and velocities, and what each was built from */
export function makeSystem({ seed = 1, n = 4, q = null, Ts = TSUN, moons = true, tries = 40 } = {}) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const rnd = rng(1000003 * seed + 7919 * attempt + 17), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd());
    let qq = q; if (qq === null) { const B = Array.from({ length: 6 }, gauss), S = B.reduce((t, b) => t + b * b, 0), P = Math.abs(B[0] * B[5] - B[1] * B[4] + B[2] * B[3]), r = Math.sqrt(Math.max(0, S * S - 4 * P * P)); qq = Math.sqrt(Math.max(0, (S - r) / 2) / ((S + r) / 2)); }
    const m = minusOf(qq), L0 = [1, 0, 0], R0 = [1, 0, 0], planets = [];
    let a = 0.32 + 0.25 * rnd();
    for (let i = 0; i < n; i++) {
      const r = aroundAxis(R0, m, rnd), B = bivector(L0, r), [u, v] = spanOf(B), mass = rnd() < 0.45 ? 1e-3 : 1e-4, ph = 2 * Math.PI * rnd();
      const p = { name: NAMES[i], mass, B, u, v, right: r, ph };
      if (i) { // out past every planet inside at a ratio the map calls stable, with a margin
        let x = 1.05; const ok = (xx) => planets.every((o) => pairStable(Math.max(o.mass, mass), (a * xx) / o.a, planeAngles([o.u, o.v], [u, v])[0]));
        while (!ok(x) && x < 2.5) x += 0.01; a *= x * (1.05 + 0.3 * rnd());
      }
      p.a = a; planets.push(p);
    }
    const sys = build(planets, { q: qq, minus: m, Ts, moons });
    if (check(sys)) return { ...sys, seed, attempt };
  }
  throw new Error("no stable system found");
}
/* positions and velocities: each planet on a circle in its plane (speed √(1/a)), its moon on a circle round it */
function build(planets, info) {
  const bodies = [{ kind: "star", name: "star", mass: 1, x: [0, 0, 0, 0], v: [0, 0, 0, 0] }];
  for (const p of planets) {
    const c = Math.cos(p.ph), s = Math.sin(p.ph), x = p.u.map((ui, k) => p.a * (c * ui + s * p.v[k])), sp = Math.sqrt((1 + p.mass) / p.a), v = p.u.map((ui, k) => sp * (-s * ui + c * p.v[k]));
    const T = planetT(4, info.Ts, p.a * UNIT);
    bodies.push({ kind: "planet", name: p.name, mass: p.mass, x, v, a: p.a, T, B: p.B, right: p.right, u: p.u, v0: p.v, period: 2 * Math.PI * Math.sqrt(p.a ** 3) });
    if (info.moons) { // the completely orthogonal plane: left half kept, right half reversed
      const Bm = bivector(halves(p.B)[0].map((x2) => x2), halves(p.B)[1].map((x2) => -x2)), [mu, mv] = spanOf(Bm), rh = p.a * Math.cbrt(p.mass / 3), rm = rh / 3, sm = Math.sqrt(p.mass / rm);
      bodies.push({ kind: "moon", name: p.name + "I", mass: 0, host: bodies.length - 1, x: x.map((xi, k) => xi + rm * mu[k]), v: v.map((vi, k) => vi + sm * mv[k]), r: rm, B: Bm });
    }
  }
  // the star moves so the whole has no momentum
  const P = [0, 1, 2, 3].map((k) => bodies.reduce((t, b) => t + b.mass * b.v[k], 0)); bodies[0].v = P.map((pk) => -pk);
  return { bodies, ...info };
}
/* one leapfrog step for every body (moons massless: they feel, nothing feels them) */
export function step(bodies, dt) {
  const n = bodies.length, acc = () => { const A = bodies.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (i === j || !bodies[j].mass) continue; const dx = [0, 1, 2, 3].map((k) => bodies[j].x[k] - bodies[i].x[k]), r2 = dx[0] ** 2 + dx[1] ** 2 + dx[2] ** 2 + dx[3] ** 2, f = bodies[j].mass / (r2 * Math.sqrt(r2)); for (let k = 0; k < 4; k++) A[i][k] += f * dx[k]; }
    return A; };
  let A = bodies._A || acc();
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { bodies[i].v[k] += 0.5 * dt * A[i][k]; bodies[i].x[k] += dt * bodies[i].v[k]; }
  A = acc(); for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) bodies[i].v[k] += 0.5 * dt * A[i][k];
  Object.defineProperty(bodies, "_A", { value: A, writable: true, configurable: true });
}
/* a body's orbit now, about the star (planets) or its planet (moons): eccentricity, and its distance */
export function orbitOf(bodies, i) {
  const b = bodies[i], h = b.kind === "moon" ? bodies[b.host] : bodies[0], mu = h.mass + b.mass, r = b.x.map((x, k) => x - h.x[k]), w = b.v.map((v, k) => v - h.v[k]);
  const R = Math.hypot(...r), w2 = w.reduce((s, u) => s + u * u, 0), rv = r.reduce((s, u, k) => s + u * w[k], 0);
  return { e: Math.hypot(...r.map((u, k) => (w2 / mu - 1 / R) * u - (rv / mu) * w[k])), r: R, bound: w2 / 2 - mu / R < 0 };
}
/* the timestep: a hundredth of the quickest orbit */
export const dtFor = (sys) => Math.min(...sys.bodies.filter((b) => b.kind !== "star").map((b) => (b.kind === "moon" ? 2 * Math.PI * Math.sqrt(b.r ** 3 / sys.bodies[b.host].mass) : b.period))) / 100;
/* a short run: the planets for 60 orbits of the innermost (moons left out), each staying bound with e < 0.15 */
function check(sys) {
  const pl = sys.bodies.filter((b) => b.kind !== "moon").map((b) => ({ ...b, x: b.x.slice(), v: b.v.slice() })), dt = Math.min(...pl.filter((b) => b.kind === "planet").map((b) => b.period)) / 120;
  for (let s = 0; s < 60 * 120; s++) { step(pl, dt); if (s % 240 === 0) for (let i = 1; i < pl.length; i++) { const o = orbitOf(pl, i); if (!o.bound || o.e > 0.15) return false; } }
  return true;
}
