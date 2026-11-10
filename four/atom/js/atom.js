/* ATOM⁴'s physics, no DOM: atoms in d = 3 (ours, the check) or d = 4 spatial dimensions, with the potential pinned at
   1/r (Gauss's law in 4D would give 1/r², under which no atom has a ground state). Atomic units: ħ = m = e = 1.

   One electron in a central potential V(r): ψ = R(r) Y, with Y a harmonic of degree l on the (d−1)-sphere. Put
   u = r^((d−1)/2) R and the radial equation is the 3D one with l replaced by L = l + (d − 3)/2:
       −½u″ + [L(L + 1)/2r² + V] u = ε u
   so a 4D atom is a 3D atom with half-integer angular momentum. Its hydrogen levels are −Z²/2(n + ½)². Each l has
   dim(harmonics) orbitals: 2l + 1 in 3D, (l + 1)² in 4D, and two spin states each.

   Many electrons: the self-consistent field of Hartree, each electron in the nucleus's potential and the averaged
   cloud of the others (its own subshell's share of itself removed). The cloud's potential needs the 1/r kernel averaged
   over a sphere: in 3D that's Newton's shell theorem, 1/max(r, s); in 4D 1/r isn't harmonic and the shell theorem
   fails, so it's (1/max) k(min/max) with k(t) = (2/π)∫₀^π sin²θ dθ / √(1 + t² − 2t cos θ), k(0) = 1, k(1) = 8/3π.
   No exchange term: the same solver run in 3D is checked against our own periodic table, which is what says how far
   to trust it in 4D. */
import { k4, kTab, kEtaTab } from "./kernel.js";
export { k4, kTab }; // the kernel lives in kernel.js; re-exported for the code that imports it from here

// the log grid: r_i = R0 e^(i h). ATOM4_GRID="N,R0,RMAX" in node's environment overrides it, for the convergence
// study only (paper 1's appendix C); the bake, the pages and every check use the default
const GRID = (typeof process !== "undefined" && process.env && process.env.ATOM4_GRID ? process.env.ATOM4_GRID.split(",").map(Number) : []);
export const N = GRID[0] || 700, R0 = GRID[1] || 1e-5, RMAX = GRID[2] || 150;
export const H = Math.log(RMAX / R0) / (N - 1);
export const R = Float64Array.from({ length: N }, (_, i) => R0 * Math.exp(i * H));

/* ---------------------------------------------------------------- one electron: Numerov on the log grid
   With x = ln r and u = r^½ y: y″ = f y, f = 2r²(V − ε) + (L + ½)². The eigenvalue with nr radial nodes is where the
   outward solution's node count goes from nr to nr + 1 (Sturm), found by bisection; the wavefunction is the outward
   solution to the classical turning point spliced to the inward one beyond it. */
function numerovOut(f, y, upto, Lh) {
  const h2 = (H * H) / 12;
  // past where h²f/12 nears 1 Numerov goes unstable and flips sign every step: stop there, the solution is long decided
  for (let i = 2; i < upto; i++) if (h2 * f[i + 1] > 0.5) { upto = i; break; }
  y[0] = Math.pow(R[0], Lh); y[1] = Math.pow(R[1], Lh);
  let nodes = 0;
  for (let i = 1; i < upto; i++) {
    y[i + 1] = (2 * y[i] * (1 + 5 * h2 * f[i]) - y[i - 1] * (1 - h2 * f[i - 1])) / (1 - h2 * f[i + 1]);
    if (y[i + 1] * y[i] < 0) nodes++;
    if (Math.abs(y[i + 1]) > 1e150) { for (let k = 0; k <= i + 1; k++) y[k] *= 1e-150; } // keep it in range
  }
  return nodes;
}
export function solve(V, l, nr, d, lo = null) { // lo: a lower bound on ε, for a law other than 1/r (whose bound is read off the origin below)
  const L = l + (d - 3) / 2, Lh = L + 0.5, f = new Float64Array(N), y = new Float64Array(N);
  const setF = (e) => { for (let i = 0; i < N; i++) f[i] = 2 * R[i] * R[i] * (V[i] - e) + Lh * Lh; };
  // ε ≥ the bare nucleus's level, since the cloud only repels: V ≥ −Z/r with Z read off at the origin
  const Z = -V[0] * R[0];
  let elo = lo ?? (-1.01 * Z * Z) / (2 * (L + 1) ** 2), ehi = 0;
  for (let it = 0; it < 90; it++) { // nodes of the outward solution over the whole grid > nr ⇔ ε above the level
    const e = 0.5 * (elo + ehi); setF(e);
    if (numerovOut(f, y, N - 1, Lh) > nr) ehi = e; else elo = e;
  }
  const e = 0.5 * (elo + ehi); setF(e);
  // the turning point (the last classically allowed point), then outward to it and inward from the far end
  const h2 = (H * H) / 12;
  let top = N - 1; while (top > 4 && h2 * f[top] > 0.5) top--; // the inward start: where Numerov is still stable
  let icl = top - 1; while (icl > 2 && f[icl] > 0) icl--; icl = Math.min(top - 2, icl + 1);
  numerovOut(f, y, icl, Lh);
  const yin = new Float64Array(N);
  yin[top] = 0; yin[top - 1] = 1e-30;
  for (let i = top - 1; i > icl; i--) {
    yin[i - 1] = (2 * yin[i] * (1 + 5 * h2 * f[i]) - yin[i + 1] * (1 - h2 * f[i + 1])) / (1 - h2 * f[i - 1]);
    if (Math.abs(yin[i - 1]) > 1e150) for (let k = i - 1; k < N; k++) yin[k] *= 1e-150;
  }
  const s = y[icl] / yin[icl]; for (let i = icl + 1; i < N; i++) y[i] = yin[i] * s;
  // u² dr = y² r² dx: normalise ∫ u² dr = 1, and return u² per grid point times dr (the radial charge, Q_i)
  let norm = 0; for (let i = 0; i < N; i++) norm += y[i] * y[i] * R[i] * R[i];
  norm *= H; const q = new Float64Array(N); for (let i = 0; i < N; i++) q[i] = (y[i] * y[i] * R[i] * R[i] * H) / norm;
  return { e, q };
}

/* ---------------------------------------------------------------- the electron cloud's potential */
const KMAT = {};
/* K[i][j]: the potential at r_i of a unit charge spread over the sphere of radius r_j */
export function kernel(d, eta = 1) {
  const key = eta === 1 ? d : `${d}:${eta}`;
  if (KMAT[key]) return KMAT[key];
  if (eta !== 1 && d !== 4) throw new Error("kernel: a law 1/r^η other than 1/r is set up for 4D only");
  const K = new Float64Array(N * N), kt = eta === 1 ? kTab : kEtaTab(eta);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = Math.max(R[i], R[j]), b = Math.min(R[i], R[j]); K[i * N + j] = d === 3 ? 1 / a : eta === 1 ? kTab(b / a) / a : kt(b / a) / Math.pow(a, eta); }
  return (KMAT[key] = K);
}
export function hartree(K, q) { const V = new Float64Array(N); for (let i = 0; i < N; i++) { let s = 0; const row = i * N; for (let j = 0; j < N; j++) s += K[row + j] * q[j]; V[i] = s; } return V; }

/* ---------------------------------------------------------------- shells */
export const LETTERS = "spdfgh";
export const orbitals = (l, d) => (d === 3 ? 2 * l + 1 : (l + 1) * (l + 1));
export const capacity = (l, d) => 2 * orbitals(l, d);
/* the subshells worth considering: n ≤ 8, l ≤ min(n − 1, 3) */
export function subshells(d) { const out = []; for (let n = 1; n <= 8; n++) for (let l = 0; l < Math.min(n, 4); l++) out.push({ n, l, cap: capacity(l, d), name: `${n}${LETTERS[l]}` }); return out; }
export const hydrogen = (Z, n, d) => -(Z * Z) / (2 * (n + (d - 3) / 2) ** 2);

/* ---------------------------------------------------------------- exchange (optional): the local exchange of an electron
   gas at the atom's density, e_x(ρ) = −C ρ^(1 + 1/d): Dirac's C = (3/4)(3/π)^(1/3) in 3D, and in 4D C = 16/(15√π) (from
   −¼∫|γ|²/r with the 4D gas's γ; ∫J₂²/x² = 4/15π). As with the Hartree part, each electron's own share is taken out
   (Perdew and Zunger's self-interaction correction), using the fully spin-polarized gas, 2^(1/d) e_x. Spins follow
   Hund's rule, subshell by subshell */
export const SPHERE = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };
export const EXCHANGE = { 3: 0.75 * Math.cbrt(3 / Math.PI), 4: 16 / (15 * Math.sqrt(Math.PI)) };
const toDensity = (q, d) => Float64Array.from(q, (v, j) => v / (H * R[j] * SPHERE[d] * R[j] ** (d - 1)));
const ex = (rho, d, eta = 1) => -exchangeConst(d, eta) * Math.pow(rho, 1 + eta / d), vx = (rho, d, eta = 1) => -(1 + eta / d) * exchangeConst(d, eta) * Math.pow(rho, eta / d);
/* the exchange constant for a law 1/r^η (4D): the gas's e_x = −¼∫|γ|²r^(−η) with γ = ρ·8J₂(k_F r)/(k_F r)², k_F = (16π²ρ)^(1/4),
   gives C = 2(16π²)^(η/4)·∫₀^∞ x^(−1−η)J₂(x)² dx, the integral Γ(1+η)Γ(2−η/2)/(2^(1+η)Γ(1+η/2)²Γ(3+η/2)) (Weber–Schafheitlin),
   which is 4/15π at η = 1, so C = 16/(15√π) */
const lgamma = (x) => { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x); x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < 9; i++) a += c[i] / (x + i); return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a); };
export const j2Integral = (eta) => Math.exp(lgamma(1 + eta) + lgamma(2 - eta / 2) - (1 + eta) * Math.LN2 - 2 * lgamma(1 + eta / 2) - lgamma(3 + eta / 2));
const XC = {};
export function exchangeConst(d, eta = 1) {
  if (eta === 1) return EXCHANGE[d];
  if (d !== 4) throw new Error("exchangeConst: a law 1/r^η other than 1/r is set up for 4D only");
  return XC[eta] ?? (XC[eta] = 2 * Math.pow(16 * Math.PI * Math.PI, eta / 4) * j2Integral(eta));
}
/* E_x[q] and ∫ρ v_x for a radial charge q (per grid point); pol: the fully polarized gas */
function exchangeParts(q, d, pol, eta = 1) {
  const k = pol ? Math.pow(2, eta / d) : 1, rho = toDensity(q, d), v = new Float64Array(N); let E = 0, Ev = 0;
  for (let j = 0; j < N; j++) { if (rho[j] <= 0) continue; v[j] = k * vx(rho[j], d, eta); E += k * ex(rho[j], d, eta) * SPHERE[d] * R[j] ** d * H; Ev += q[j] * v[j]; }
  return { v, E, Ev };
}
/* spins by Hund's rule: a subshell fills one spin before the other */
export const spinUp = (o, cap) => Math.min(o, cap / 2);
/* the spin-polarized gas: E_x = ½(E_x[2ρ↑] + E_x[2ρ↓]), each spin's potential v_x(2ρ_σ). Returns both spins' potentials,
   the energy and ∫(ρ↑v↑ + ρ↓v↓) */
function exchangeSpin(qUp, qDown, d, eta = 1) {
  const two = (q) => exchangeParts(Float64Array.from(q, (v) => 2 * v), d, false, eta), U = two(qUp), D = two(qDown);
  return { vUp: U.v, vDown: D.v, E: (U.E + D.E) / 2, Ev: (U.Ev + D.Ev) / 2 };
}
/* each subshell's potential: the nucleus, the whole cloud, less its own electron's share; with exchange, the spin-
   polarized gas's, averaged over the subshell's up and down electrons, less its own electron's (fully polarized) */
export function potentials(Z, occ, qs, d, { exchange = false, shellTheorem = false, eta = 1 } = {}) {
  if (eta !== 1 && shellTheorem) throw new Error("potentials: the shell theorem is forced for 1/r only");
  const sh = subshells(d), K = kernel(shellTheorem ? 3 : d, eta), Q = new Float64Array(N), Qu = new Float64Array(N), Qd = new Float64Array(N);
  sh.forEach((s, i) => { if (occ[i] > 0 && qs[i]) { const u = spinUp(occ[i], s.cap); for (let j = 0; j < N; j++) { Q[j] += occ[i] * qs[i][j]; Qu[j] += u * qs[i][j]; Qd[j] += (occ[i] - u) * qs[i][j]; } } });
  const VH = hartree(K, Q), X = exchange ? exchangeSpin(Qu, Qd, d, eta) : null, nuc = eta === 1 ? null : Float64Array.from(R, (r) => -Z * Math.pow(r, -eta));
  return sh.map((s, i) => {
    const self = occ[i] > 0 && qs[i] ? hartree(K, qs[i]) : new Float64Array(N), Xs = exchange && occ[i] > 0 && qs[i] ? exchangeParts(qs[i], d, true, eta) : null, V = new Float64Array(N);
    const o = occ[i] > 0 ? occ[i] : 1, u = occ[i] > 0 ? spinUp(occ[i], s.cap) / o : 1; // an empty subshell's next electron joins the majority spin
    for (let j = 0; j < N; j++) V[j] = (nuc ? nuc[j] : -Z / R[j]) + VH[j] - self[j] + (X ? u * X.vUp[j] + (1 - u) * X.vDown[j] - (Xs ? Xs.v[j] : 0) : 0);
    return V;
  });
}
/* the exchange part of the total energy: E_x[ρ↑, ρ↓] − ∫(ρ↑v↑ + ρ↓v↓) − Σ o (E_x^pol[n] − ∫n v^pol[n]) */
function exchangeEnergy(occ, qs, d, eta = 1) {
  const sh = subshells(d), Qu = new Float64Array(N), Qd = new Float64Array(N); let E = 0;
  sh.forEach((s, i) => { if (occ[i] > 0 && qs[i]) { const u = spinUp(occ[i], s.cap); for (let j = 0; j < N; j++) { Qu[j] += u * qs[i][j]; Qd[j] += (occ[i] - u) * qs[i][j]; } const Xs = exchangeParts(qs[i], d, true, eta); E -= occ[i] * (Xs.E - Xs.Ev); } });
  const X = exchangeSpin(Qu, Qd, d, eta); return E + X.E - X.Ev;
}

/* ---------------------------------------------------------------- the self-consistent atom with fixed occupations
   occ: electrons per subshell (same order as subshells(d)). Returns orbital energies, the total energy, and charges.
   exchange: add local exchange (above). shellTheorem: a counterfactual, for 4D: the clouds' potential as if Newton's
   shell theorem held (the 3D kernel) */
export function scf(Z, occ, d, { iters = 80, mix = 0.4, tol = 1e-7, start = null, shellTheorem = false, exchange = false, vext = null, eta = 1 } = {}) {
  const sh = subshells(d), K = kernel(shellTheorem ? 3 : d, eta);
  const live = sh.map((s, i) => i).filter((i) => occ[i] > 0);
  let qs = start ? start.map((q) => q && q.slice()) : sh.map(() => null), es = sh.map(() => 0), E = 0, prevE = Infinity, converged = false;
  for (let it = 0; it < iters; it++) {
    const Vs = potentials(Z, occ, qs, d, { exchange, shellTheorem, eta }), next = sh.map(() => null);
    // an outside potential on every electron (vext[j] at grid point j): a Watson sphere, standing in for a crystal's ions
    if (vext) for (const i of live) { const v = Float64Array.from(Vs[i]); for (let j = 0; j < N; j++) v[j] += vext[j]; Vs[i] = v; }
    for (const i of live) { const r = solve(Vs[i], sh[i].l, sh[i].n - sh[i].l - 1, d, lowerBound(Vs[i], eta)); es[i] = r.e; next[i] = r.q; }
    for (const i of live) { if (!qs[i]) qs[i] = next[i]; else for (let j = 0; j < N; j++) qs[i][j] = mix * next[i][j] + (1 - mix) * qs[i][j]; }
    // the total energy: Σ o ε − ½ Σ o o' J + ½ Σ o J_self (no electron meets itself), and with exchange
    // + E_x[ρ] − ∫ρ v_x − Σ o (E_x^pol[n] − ∫n v_x^pol[n]) for each electron's own share n
    const Q2 = new Float64Array(N); for (const i of live) for (let j = 0; j < N; j++) Q2[j] += occ[i] * qs[i][j];
    const VH2 = hartree(K, Q2); let sumE = 0, Jtot = 0, Jself = 0;
    for (let j = 0; j < N; j++) Jtot += Q2[j] * VH2[j];
    for (const i of live) { sumE += occ[i] * es[i]; const s = hartree(K, qs[i]); let J = 0; for (let j = 0; j < N; j++) J += qs[i][j] * s[j]; Jself += occ[i] * J; }
    E = sumE - 0.5 * Jtot + 0.5 * Jself;
    if (exchange) E += exchangeEnergy(occ, qs, d, eta);
    if (Math.abs(E - prevE) < tol && it > 5) { converged = true; break; }
    prevE = E;
  }
  return { E, es, qs, occ, converged };
}

/* ---------------------------------------------------------------- the ground configuration
   Fill by the orbital energies until they stop changing (each round a fresh self-consistent field), then try moving
   one or two electrons between the outermost subshells and keep whatever has the least total energy */
export function ground(Z, d, opts = {}) {
  const sh = subshells(d), byH = sh.map((s, i) => i).sort((a, b) => sh[a].n - sh[b].n || sh[a].l - sh[b].l);
  const nel = opts.nelec ?? Z; // opts.nelec: an ion's electron count (tools/termtable.mjs); the nucleus stays Z
  const fill = (order) => { const occ = sh.map(() => 0); let left = nel; for (const i of order) { const k = Math.min(left, sh[i].cap); occ[i] = k; left -= k; if (!left) break; } return occ; };
  let occ = fill(byH), res = scf(Z, occ, d, { iters: 40, ...opts });
  for (let round = 0; round < 6; round++) { // aufbau by the current orbital energies (every subshell's, occupied or not)
    const all = sh.map((s, i) => i), es = probeEnergies(Z, occ, res.qs, d, opts);
    const order = all.sort((a, b) => es[a] - es[b]), next = fill(order);
    if (next.every((v, i) => v === occ[i])) break;
    occ = next; res = scf(Z, occ, d, { iters: 40, start: res.qs, ...opts });
  }
  // neighbours: move one or two electrons between the last-filled subshells
  const cands = [occ];
  const open = sh.map((s, i) => i).filter((i) => occ[i] > 0 && occ[i] < sh[i].cap), filledTop = sh.map((s, i) => i).filter((i) => occ[i] === sh[i].cap).sort((a, b) => sh[b].n + sh[b].l * 0.7 - (sh[a].n + sh[a].l * 0.7)).slice(0, 2);
  const empty = sh.map((s, i) => i).filter((i) => occ[i] === 0).sort((a, b) => sh[a].n + sh[a].l * 0.7 - (sh[b].n + sh[b].l * 0.7)).slice(0, 2);
  for (const from of [...open, ...filledTop]) for (const to of [...open, ...empty]) for (const k of [1, 2]) {
    if (from === to || occ[from] < k || occ[to] + k > sh[to].cap) continue;
    const c = occ.slice(); c[from] -= k; c[to] += k; cands.push(c);
  }
  // opts.seeds: more starting configurations (the table's repair pass seeds an element from its neighbours'); with
  // them, the aufbau's own result counts only if its field settled too
  if (opts.seeds) for (const c of opts.seeds) if (c.reduce((t, x) => t + x, 0) === nel && c.every((x, i) => x >= 0 && x <= sh[i].cap)) cands.push(c);
  let best = opts.seeds && !res.converged ? { E: Infinity, occ, res } : { E: res.E, occ, res };
  const keep = (c, r) => { if (opts.collect && r.converged) opts.collect.push({ occ: c, E: r.E, es: r.es, qs: r.qs }); }; // opts.collect: every settled candidate, for a caller that re-ranks them (tools/termtable.mjs)
  keep(occ, res);
  // a neighbour counts only if its field settled: an unsettled one can report an energy far too low (with exchange, a
  // barely bound orbital can drift for hundreds of iterations)
  for (const c of cands.slice(1)) { const r = scf(Z, c, d, { iters: 80, start: res.qs, ...opts }); keep(c, r); if (r.converged && r.E < best.E - 1e-6) best = { E: r.E, occ: c, res: r }; }
  if (opts.seeds) for (const c of opts.seeds) { const r = scf(Z, c, d, { iters: 160, ...opts }); keep(c, r); if (r.converged && r.E < best.E - 1e-6) best = { E: r.E, occ: c, res: r }; } // from scratch too
  return { Z, d, occ: best.occ, E: best.E, es: best.res.es, qs: best.res.qs, config: configString(best.occ, d) };
}
/* every subshell's orbital energy in the field of the current cloud (for the aufbau) */
function probeEnergies(Z, occ, qs, d, opts = {}) {
  const sh = subshells(d), Vs = potentials(Z, occ, qs, d, opts);
  return sh.map((s, i) => solve(Vs[i], s.l, s.n - s.l - 1, d, lowerBound(Vs[i], opts.eta ?? 1)).e);
}
/* under 1/r the solver reads ε's lower bound off the origin (−Z/r there); under another law it takes the potential's
   lowest value, which bounds every level from below since the kinetic and centrifugal terms are positive */
export const lowerBound = (V, eta) => { if (eta === 1) return null; let m = 0; for (let j = 0; j < N; j++) if (V[j] < m) m = V[j]; return 1.01 * m - 1e-9; };
export function configString(occ, d) { const sh = subshells(d); return sh.map((s, i) => [s, occ[i]]).filter(([, o]) => o > 0).sort((a, b) => a[0].n - b[0].n || a[0].l - b[0].l).map(([s, o]) => `${s.name}${o}`).join(" "); }
