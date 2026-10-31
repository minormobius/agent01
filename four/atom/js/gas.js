/* Gases in any dimension, no DOM. Atomic units throughout (hartree, bohr, electron masses), temperatures in kelvin
   where named so.
   The ideal gas: each direction of motion holds kT/2, so an atom carries (d/2)kT, its heat capacities are C_v = d/2
   and C_p = d/2 + 1 (in units of k), γ = (d + 2)/d, and PV = NkT in any d (pressure is the momentum carried across
   a wall, which is a (d − 1)-dimensional surface). Speeds follow Maxwell's distribution with the d-sphere's surface
   in place of 4πv².
   The real gas, to first order in density: P/nkT = 1 + B₂(T) n, with
     B₂(T) = −½ ∫ (e^(−u(r)/kT) − 1) dV,   dV = S_(d−1) r^(d−1) dr,
   S the area of the unit (d − 1)-sphere (4π in 3D, 2π² in 4D). B₂ < 0: the atoms' pull wins, the gas is denser than
   ideal; the Boyle temperature is where it changes sign. A gas pushed through a valve (Joule–Thomson, the
   refrigerator's step) changes temperature by μ = (T dB₂/dT − B₂)/C_p per unit of pressure, in the low-pressure
   limit: it cools below the inversion temperature, where T dB₂/dT = B₂, and warms above it. */
const KB = 3.166811563e-6; // hartree per kelvin
export const kelvin = (E) => E / KB;
export const gammaFn = (x) => { // Lanczos, real x > 0
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
};
export const sphereArea = (d) => (2 * Math.PI ** (d / 2)) / gammaFn(d / 2); // the unit (d − 1)-sphere
export const ballVolume = (d, r) => (sphereArea(d) * r ** d) / d;

/* the ideal gas */
export const Cv = (d) => d / 2;
export const Cp = (d) => d / 2 + 1;
export const gamma = (d) => (d + 2) / d;
/* Maxwell's speeds, for kT/m = s2: the density f(v), the most likely, mean and rms speeds, and sound's */
export const maxwell = (v, d, s2) => sphereArea(d) * v ** (d - 1) * (2 * Math.PI * s2) ** (-d / 2) * Math.exp((-v * v) / (2 * s2));
export const vLikely = (d, s2) => Math.sqrt((d - 1) * s2);
export const vMean = (d, s2) => Math.sqrt(2 * s2) * gammaFn((d + 1) / 2) / gammaFn(d / 2);
export const vRms = (d, s2) => Math.sqrt(d * s2);
export const vSound = (d, s2) => Math.sqrt(gamma(d) * s2);
/* squeezing it without letting heat out: T V^(γ − 1) is held, so shrinking the volume by a factor f heats it by f^(2/d) */
export const adiabaticHeating = (d, f) => f ** (gamma(d) - 1);

/* the second virial coefficient for a pair potential u(r) (hartree, r in bohr), at T kelvin. Below rmin the atoms
   are taken as impenetrable (e^(−u/kT) = 0); past rmax the tail terms [{ a, n }] (u = −a/rⁿ, n > d) are added to
   first order, ∫ (a/kT) r^(d−1−n) dr, which is exact as far as they're small there */
export function B2(u, d, T, { rmin = 0, rmax = 60, tail = [], h = 0.004 } = {}) {
  const kT = KB * T; let s = 0;
  for (let r = h / 2; r < rmax; r += h) s += (r < rmin ? -1 : Math.expm1(-u(r) / kT)) * r ** (d - 1) * h;
  for (const { a, n } of tail) s += (a / kT) * rmax ** (d - n) / (n - d);
  return (-sphereArea(d) / 2) * s;
}
/* T dB₂/dT − B₂: the refrigerator's sign. Positive: a gas pushed through a valve cools */
export function jtNumerator(u, d, T, opt) { const e = 1e-3, b = B2(u, d, T, opt); return (T * (B2(u, d, T * (1 + e), opt) - B2(u, d, T * (1 - e), opt))) / (2 * e * T) - b; }
export const jtCoefficient = (u, d, T, opt) => jtNumerator(u, d, T, opt) / Cp(d); // per molecule, low pressure: μ = (T B₂′ − B₂)/C_p
/* where a function of T changes sign, by bisection on log T between lo and hi (kelvin), or null */
function root(f, lo, hi) {
  let a = lo, b = hi, fa = f(a); if (fa * f(b) > 0) return null;
  for (let i = 0; i < 60; i++) { const m = Math.sqrt(a * b), fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
  return Math.sqrt(a * b);
}
export const boyle = (u, d, opt, lo = 5, hi = 3e6) => root((T) => B2(u, d, T, opt), lo, hi);
export const inversion = (u, d, opt, lo = 5, hi = 3e6) => root((T) => jtNumerator(u, d, T, opt), lo, hi);

/* exact closed forms, the integrator's checks: hard spheres of diameter σ, and a square well (depth ε, out to λσ) */
export const hardSphereB2 = (d, sigma) => ballVolume(d, sigma) / 2;
export const squareWellB2 = (d, sigma, lambda, eps, T) => (ballVolume(d, sigma) / 2) * (1 - (lambda ** d - 1) * Math.expm1(eps / (KB * T)));

/* the noble gases, as the forces chapter builds them (js/forces.js): the computed pair (Gordon–Kim on the solver's
   frozen clouds) with dispersion, and past the computed range the permanent pull −B/R⁵ (4D only) and −C₆/R⁶. Pass
   the modules in, so this file needs no data of its own */
export function noblePotential(d, Z, { FF, PAIRS, RS, TABLE, RESPONSE }, scale = 1) {
  const p = PAIRS[d].find((q) => q.Z === Z), el = TABLE[d][Z - 1], B = d === 4 ? FF.permanentB(FF.sumR2(el), FF.sumR2(el)) : 0, C6 = RESPONSE[d].find((r) => r.Z === Z).c6;
  const full = FF.fullPair(RS, p, B, C6), rmax = RS.at(-1), well = FF.minimum(full);
  return { u: (r) => scale * full(r), opt: { rmin: RS[0], rmax, tail: [{ a: scale * B, n: 5 }, { a: scale * C6, n: 6 }].filter((t) => t.a > 0) }, well: { R: well.R, E: scale * well.E }, B, C6 };
}

/* a crystal's hold on each atom: half the sum of u over the densest lattice, D_d (integer points with an even sum,
   scaled so neighbours sit a apart: fcc in 3D, the 24-cell's lattice in 4D), summed out to M lattice steps and as a
   smooth continuum past that. Returns the energy per atom, the share of it from the nearest shell, and the share
   from out to each shell */
const SHELLS = {};
function shells(d, M) {
  const key = d + "/" + M; if (SHELLS[key]) return SHELLS[key];
  const m = new Map(), v = Array(d).fill(-M);
  for (;;) {
    if (v.reduce((a, b) => a + b, 0) % 2 === 0) { const n2 = v.reduce((a, b) => a + b * b, 0); if (n2) m.set(n2, (m.get(n2) || 0) + 1); }
    let i = 0; while (i < d && v[i] === M) v[i++] = -M; if (i === d) break; v[i]++;
  }
  return (SHELLS[key] = [...m].sort((a, b) => a[0] - b[0]));
}
export function lattice(u, d, a, { rmax = Infinity, tail = [] } = {}, M = d === 3 ? 10 : 8) {
  const s = a / Math.SQRT2, cut2 = 0.9 * M * M, U = (r) => (r <= rmax ? u(r) : -tail.reduce((t, { a, n }) => t + a / r ** n, 0));
  let E = 0, first = 0, nn = 0; const run = [];
  for (const [n2, c] of shells(d, M)) if (n2 <= cut2) { const e = c * U(s * Math.sqrt(n2)); E += e; run.push([Math.sqrt(n2 / 2), E]); if (n2 === 2) { first = e; nn = c; } }
  const rc = s * Math.sqrt(cut2), dens = 1 / (2 * s ** d), // D_d has one point per two unit cells
    beyond = (r) => -dens * sphereArea(d) * tail.reduce((t, { a, n }) => t + (a * (rc ** (d - n) - (r === Infinity ? 0 : r ** (d - n)))) / (n - d), 0);
  const shellsE = E; E += beyond(Infinity);
  // cumulative: the share of the whole hold from out to r (in neighbour spacings), shell by shell, then the continuum
  for (let k = 1; k <= 24; k++) { const r = rc * 8 ** (k / 24); run.push([r / a, shellsE + beyond(r)]); }
  return { E: E / 2, first: first / 2, neighbours: nn, cumulative: run.map(([r, e]) => [r, e / E]) };
}

/* our argon, measured, the yardstick for the estimates: critical point (NIST), Boyle temperature (sources give
   392 to 411 K), Joule–Thomson inversion at low pressure, and the crystal's cohesive energy (Kittel, 0.080 eV) */
export const ARGON = { Tc: 150.87, boyle: 407, inversion: 794, cohesive: 928 };
/* the critical point, three ways, each a corresponding-states rule taken from argon: from the well depth (Tc = 1.26 ε/k,
   ours), from the Boyle temperature (Tc/T_B: argon's 0.37, mean field's 8/27), and from the crystal's hold */
export const tcFromWell = (eps) => 1.26 * eps;
export const tcFromBoyle = (TB) => [(8 / 27) * TB, (ARGON.Tc / ARGON.boyle) * TB];
export const tcFromCrystal = (coh) => (ARGON.Tc / ARGON.cohesive) * coh;

/* the noble gases, one row each, every temperature as a range: the computed well divided by 1.8 up to the computed
   well, as the forces chapter reads it (js/forces.js OVERBIND) */
export function nobleGases(mods, list = [[3, 10], [3, 18], [3, 36], [4, 2], [4, 12], [4, 22]]) {
  return list.map(([d, Z]) => {
    const P = noblePotential(d, Z, mods), b0 = hardSphereB2(d, P.well.R), eps = -P.well.E / KB, TB = boyle(P.u, d, P.opt, 1), Ti = inversion(P.u, d, P.opt, 1), L = lattice(P.u, d, P.well.R, P.opt);
    const lo = 1 / mods.FF.OVERBIND, span = (x) => [x * lo, x];
    return { d, Z, R: P.well.R, b0, P, eps: span(eps), boyle: span(TB), inversion: span(Ti), boyleOverEps: TB / eps, inversionOverBoyle: Ti / TB, crystal: -L.E / KB / eps, lattice: L, firstShell: L.first / L.E, neighbours: L.neighbours,
      tcWell: span(tcFromWell(eps)), tcBoyle: [tcFromBoyle(TB * lo)[0], tcFromBoyle(TB)[1]], tcCrystal: span(tcFromCrystal(-L.E / KB)) };
  });
}
/* how much of a gas's pull on B₂ comes from beyond x·R_min, at T kelvin: the attractive part of the integrand only */
export function farShare(u, d, T, { rmin = 0, rmax = 60, tail = [] }, R0, x, h = 0.004) {
  const kT = KB * T; let near = 0, far = 0;
  for (let r = Math.max(rmin, h / 2); r < rmax; r += h) { const f = Math.max(0, Math.expm1(-u(r) / kT)) * r ** (d - 1) * h; if (r < x * R0) near += f; else far += f; }
  // past the computed range only the tail pulls: the part out to x·R0 is near, the rest far
  const cut = x * R0; for (const { a, n } of tail) { const all = (a / kT) * rmax ** (d - n) / (n - d), out = cut > rmax ? (a / kT) * cut ** (d - n) / (n - d) : all; near += all - out; far += out; }
  return far / (near + far);
}
