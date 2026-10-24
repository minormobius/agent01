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

export const N = 700, R0 = 1e-5, RMAX = 150; // the log grid: r_i = R0 e^(i h)
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
export function solve(V, l, nr, d) {
  const L = l + (d - 3) / 2, Lh = L + 0.5, f = new Float64Array(N), y = new Float64Array(N);
  const setF = (e) => { for (let i = 0; i < N; i++) f[i] = 2 * R[i] * R[i] * (V[i] - e) + Lh * Lh; };
  // ε ≥ the bare nucleus's level, since the cloud only repels: V ≥ −Z/r with Z read off at the origin
  const Z = -V[0] * R[0];
  let elo = (-1.01 * Z * Z) / (2 * (L + 1) ** 2), ehi = 0;
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
/* k(t): the 1/r kernel averaged over a 3-sphere, t = min/max of the two radii (Simpson in θ) */
export function k4(t) {
  if (t === 0) return 1;
  const M = 400; let s = 0;
  for (let i = 0; i <= M; i++) { const th = (Math.PI * i) / M, w = i === 0 || i === M ? 1 : i % 2 ? 4 : 2, d2 = 1 + t * t - 2 * t * Math.cos(th); s += d2 > 0 ? (w * Math.sin(th) ** 2) / Math.sqrt(d2) : 0; }
  return ((s * Math.PI) / (3 * M)) * (2 / Math.PI);
}
const KT = new Float64Array(2001); for (let i = 0; i <= 2000; i++) KT[i] = k4(i / 2000);
const kTab = (t) => { const x = t * 2000, i = Math.min(1999, Math.floor(x)), f = x - i; return KT[i] + (KT[i + 1] - KT[i]) * f; };
const KMAT = {};
/* K[i][j]: the potential at r_i of a unit charge spread over the sphere of radius r_j */
export function kernel(d) {
  if (KMAT[d]) return KMAT[d];
  const K = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = Math.max(R[i], R[j]), b = Math.min(R[i], R[j]); K[i * N + j] = d === 3 ? 1 / a : kTab(b / a) / a; }
  return (KMAT[d] = K);
}
export function hartree(K, q) { const V = new Float64Array(N); for (let i = 0; i < N; i++) { let s = 0; const row = i * N; for (let j = 0; j < N; j++) s += K[row + j] * q[j]; V[i] = s; } return V; }

/* ---------------------------------------------------------------- shells */
export const LETTERS = "spdfgh";
export const orbitals = (l, d) => (d === 3 ? 2 * l + 1 : (l + 1) * (l + 1));
export const capacity = (l, d) => 2 * orbitals(l, d);
/* the subshells worth considering: n ≤ 8, l ≤ min(n − 1, 3) */
export function subshells(d) { const out = []; for (let n = 1; n <= 8; n++) for (let l = 0; l < Math.min(n, 4); l++) out.push({ n, l, cap: capacity(l, d), name: `${n}${LETTERS[l]}` }); return out; }
export const hydrogen = (Z, n, d) => -(Z * Z) / (2 * (n + (d - 3) / 2) ** 2);

/* ---------------------------------------------------------------- the self-consistent atom with fixed occupations
   occ: electrons per subshell (same order as subshells(d)). Returns orbital energies, the total energy, and charges.
   shellTheorem: a counterfactual, for 4D: the clouds' potential as if Newton's shell theorem held (the 3D kernel) */
export function scf(Z, occ, d, { iters = 80, mix = 0.4, tol = 1e-7, start = null, shellTheorem = false } = {}) {
  const sh = subshells(d), K = kernel(shellTheorem ? 3 : d), Vn = Float64Array.from(R, (r) => -Z / r);
  const live = sh.map((s, i) => i).filter((i) => occ[i] > 0);
  let qs = start ? start.map((q) => q && q.slice()) : sh.map(() => null), es = sh.map(() => 0), E = 0, prevE = Infinity;
  for (let it = 0; it < iters; it++) {
    // the total cloud, and each subshell's own one-electron share to take out of its potential
    const Q = new Float64Array(N); for (const i of live) if (qs[i]) for (let j = 0; j < N; j++) Q[j] += occ[i] * qs[i][j];
    const VH = hartree(K, Q), next = sh.map(() => null);
    for (const i of live) {
      const self = qs[i] ? hartree(K, qs[i]) : new Float64Array(N), V = new Float64Array(N);
      for (let j = 0; j < N; j++) V[j] = Vn[j] + VH[j] - self[j];
      const r = solve(V, sh[i].l, sh[i].n - sh[i].l - 1, d); es[i] = r.e; next[i] = r.q;
    }
    for (const i of live) { if (!qs[i]) qs[i] = next[i]; else for (let j = 0; j < N; j++) qs[i][j] = mix * next[i][j] + (1 - mix) * qs[i][j]; }
    // the total energy: Σ o ε − ½ Σ o o' J + ½ Σ o J_self (no electron meets itself)
    const Q2 = new Float64Array(N); for (const i of live) for (let j = 0; j < N; j++) Q2[j] += occ[i] * qs[i][j];
    const VH2 = hartree(K, Q2); let sumE = 0, Jtot = 0, Jself = 0;
    for (let j = 0; j < N; j++) Jtot += Q2[j] * VH2[j];
    for (const i of live) { sumE += occ[i] * es[i]; const s = hartree(K, qs[i]); let J = 0; for (let j = 0; j < N; j++) J += qs[i][j] * s[j]; Jself += occ[i] * J; }
    E = sumE - 0.5 * Jtot + 0.5 * Jself;
    if (Math.abs(E - prevE) < tol && it > 5) break;
    prevE = E;
  }
  return { E, es, qs, occ };
}

/* ---------------------------------------------------------------- the ground configuration
   Fill by the orbital energies until they stop changing (each round a fresh self-consistent field), then try moving
   one or two electrons between the outermost subshells and keep whatever has the least total energy */
export function ground(Z, d) {
  const sh = subshells(d), byH = sh.map((s, i) => i).sort((a, b) => sh[a].n - sh[b].n || sh[a].l - sh[b].l);
  const fill = (order) => { const occ = sh.map(() => 0); let left = Z; for (const i of order) { const k = Math.min(left, sh[i].cap); occ[i] = k; left -= k; if (!left) break; } return occ; };
  let occ = fill(byH), res = scf(Z, occ, d, { iters: 40 });
  for (let round = 0; round < 6; round++) { // aufbau by the current orbital energies (every subshell's, occupied or not)
    const all = sh.map((s, i) => i), es = probeEnergies(Z, occ, res.qs, d);
    const order = all.sort((a, b) => es[a] - es[b]), next = fill(order);
    if (next.every((v, i) => v === occ[i])) break;
    occ = next; res = scf(Z, occ, d, { iters: 40, start: res.qs });
  }
  // neighbours: move one or two electrons between the last-filled subshells
  const cands = [occ];
  const open = sh.map((s, i) => i).filter((i) => occ[i] > 0 && occ[i] < sh[i].cap), filledTop = sh.map((s, i) => i).filter((i) => occ[i] === sh[i].cap).sort((a, b) => sh[b].n + sh[b].l * 0.7 - (sh[a].n + sh[a].l * 0.7)).slice(0, 2);
  const empty = sh.map((s, i) => i).filter((i) => occ[i] === 0).sort((a, b) => sh[a].n + sh[a].l * 0.7 - (sh[b].n + sh[b].l * 0.7)).slice(0, 2);
  for (const from of [...open, ...filledTop]) for (const to of [...open, ...empty]) for (const k of [1, 2]) {
    if (from === to || occ[from] < k || occ[to] + k > sh[to].cap) continue;
    const c = occ.slice(); c[from] -= k; c[to] += k; cands.push(c);
  }
  let best = { E: res.E, occ, res };
  for (const c of cands.slice(1)) { const r = scf(Z, c, d, { iters: 40, start: res.qs }); if (r.E < best.E - 1e-6) best = { E: r.E, occ: c, res: r }; }
  return { Z, d, occ: best.occ, E: best.E, es: best.res.es, qs: best.res.qs, config: configString(best.occ, d) };
}
/* every subshell's orbital energy in the field of the current cloud (for the aufbau) */
function probeEnergies(Z, occ, qs, d) {
  const sh = subshells(d), K = kernel(d), Q = new Float64Array(N);
  sh.forEach((s, i) => { if (occ[i] > 0 && qs[i]) for (let j = 0; j < N; j++) Q[j] += occ[i] * qs[i][j]; });
  const VH = hartree(K, Q);
  return sh.map((s, i) => {
    const self = occ[i] > 0 && qs[i] ? hartree(K, qs[i]) : new Float64Array(N), V = new Float64Array(N);
    for (let j = 0; j < N; j++) V[j] = -Z / R[j] + VH[j] - self[j];
    return solve(V, s.l, s.n - s.l - 1, d).e;
  });
}
export function configString(occ, d) { const sh = subshells(d); return sh.map((s, i) => [s, occ[i]]).filter(([, o]) => o > 0).sort((a, b) => a[0].n - b[0].n || a[0].l - b[0].l).map(([s, o]) => `${s.name}${o}`).join(" "); }
