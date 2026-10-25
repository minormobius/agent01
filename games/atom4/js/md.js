/* ATOM⁴'s molecular dynamics, no DOM, in any number of dimensions. Classical nuclei on a potential energy surface:
   point sites with masses and charges, rigid molecules held by distance constraints (RATTLE), a periodic box, and a
   canonical thermostat (Bussi's velocity rescaling). Atomic units throughout.

   Charges meet through the pinned 1/r in a periodic box by Ewald's split, written for any dimension. The split is of
   1/r itself: erfc(αr)/r, which dies fast, summed directly; erf(αr)/r, which is smooth, summed in Fourier space.
   (The textbook way, screening each charge with a Gaussian cloud, works only in 3D: elsewhere 1/r isn't harmonic, so
   a cloud's potential differs from a point's by a power law, ~1/(4α²r³) in 4D, and the "short" sum isn't short.)
   Writing erf(αr)/r = (2/√π)∫₀^α e^(−t²r²)dt and transforming each Gaussian gives
       FT[erf(αr)/r](k) = K_d k^(1−d) Q((d−1)/2, k²/4α²),   K_d = (4π)^((d−1)/2) Γ((d−1)/2)
   with Q the regularized upper incomplete gamma function. K_d k^(1−d) is 1/r's own transform (4π/k² in 3D, 4π²/k³ in
   4D). In 3D, Q(1, z) = e^(−z) is the usual Gaussian; in 4D Q(3/2, z) = erfc(√z) + 2√(z/π) e^(−z).
   Each charge's meeting with itself, lim erf(αr)/r = 2α/√π, is taken out, and so is every meeting within a molecule.
   The k = 0 term is dropped: a neutral box inside a conductor ("tin foil"). */

/* erf and erfc to ~1e-14: the series below 3, Lentz's continued fraction above */
export function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 3) { let s = 0, t = x, n = 0; while (Math.abs(t) > 1e-17 * Math.abs(s) || n < 3) { s += t / (2 * n + 1); n++; t *= (-x * x) / n; } return 1 - (2 / Math.sqrt(Math.PI)) * s; }
  // erfc(x) = e^(−x²)/√π · 1/(x + 1/2/(x + 1/(x + 3/2/(x + …)))), evaluated by modified Lentz
  let f = x, C = x, D = 0;
  for (let n = 1; n < 200; n++) { const a = n / 2; D = x + a * D; D = 1 / D; C = x + a / C; const del = C * D; f *= del; if (Math.abs(del - 1) < 1e-16) break; }
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * f);
}
const lgamma = (x) => { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x); x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < g + 2; i++) a += c[i] / (x + i); return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a); };
/* Q(a, z) for a a whole or half integer ≥ ½, by Q(a + 1, z) = Q(a, z) + z^a e^(−z)/Γ(a + 1) */
export function Qgamma(a, z) {
  let q = Number.isInteger(a) ? Math.exp(-z) : erfc(Math.sqrt(z)), b = Number.isInteger(a) ? 1 : 0.5;
  for (; b < a - 1e-9; b += 1) q += Math.exp(b * Math.log(z) - z - lgamma(b + 1));
  return q;
}
/* 1/r's Fourier transform in d dimensions is K_d / k^(d − 1) */
export const kernelConst = (d) => Math.exp(((d - 1) / 2) * Math.log(4 * Math.PI) + lgamma((d - 1) / 2));

/* the Ewald sum for a periodic box of side L. alpha sets the split, rc the real-space cutoff (≤ L/2); the reciprocal
   sum takes integer vectors n (k = 2πn/L) with every |nᵢ| ≤ nmax and |n|² ≤ n2max (default nmax²) */
export class Ewald {
  constructor(d, L, { alpha, rc, nmax, n2max = nmax * nmax }) {
    this.d = d; this.L = L; this.alpha = alpha; this.rc = rc;
    const V = L ** d, K = kernelConst(d), ks = [];
    // half the k-space (the first nonzero component positive), each term standing for ±k
    const rec = (k, cur) => {
      if (k === d) {
        const n2 = cur.reduce((s, v) => s + v * v, 0); if (n2 === 0 || n2 > n2max || cur.find((v) => v !== 0) < 0) return;
        const kv = cur.map((v) => (2 * Math.PI * v) / L), k2 = kv.reduce((s, v) => s + v * v, 0);
        ks.push({ kv, w: (K / Math.pow(k2, (d - 1) / 2)) * Qgamma((d - 1) / 2, k2 / (4 * alpha * alpha)) / V }); return;
      }
      for (let v = -nmax; v <= nmax; v++) rec(k + 1, [...cur, v]);
    };
    rec(0, []);
    this.ks = ks.filter((k) => k.w > 1e-18);
  }
  /* energy and forces (added into F) for positions x (flat, n·d), charges q; excluded pairs as [i, j] */
  compute(x, q, F, excluded = [], realSpace = true) {
    const { d, L, rc, alpha } = this, n = q.length, sp = 2 / Math.sqrt(Math.PI); let Ereal = 0, Erec = 0, Eself = 0, Eexcl = 0;
    // reciprocal space: E = Σ_k w |S(k)|² over the half space
    const c = new Float64Array(n), s = new Float64Array(n);
    for (const { kv, w } of this.ks) {
      let Sr = 0, Si = 0;
      for (let i = 0; i < n; i++) { if (!q[i]) continue; let ph = 0; for (let a = 0; a < d; a++) ph += kv[a] * x[i * d + a]; c[i] = Math.cos(ph); s[i] = Math.sin(ph); Sr += q[i] * c[i]; Si += q[i] * s[i]; }
      Erec += w * (Sr * Sr + Si * Si);
      for (let i = 0; i < n; i++) { if (!q[i]) continue; const f = 2 * w * q[i] * (s[i] * Sr - c[i] * Si); for (let a = 0; a < d; a++) F[i * d + a] += f * kv[a]; }
    }
    for (let i = 0; i < n; i++) Eself -= 0.5 * q[i] * q[i] * sp * alpha;
    const dx = new Float64Array(d);
    const sep = (i, j) => { let r2 = 0; for (let a = 0; a < d; a++) { let v = x[i * d + a] - x[j * d + a]; v -= L * Math.round(v / L); dx[a] = v; r2 += v * v; } return r2; };
    // each excluded pair's smooth part comes out: −q q erf(αr)/r
    for (const [i, j] of excluded) {
      const r = Math.sqrt(sep(i, j)), e = 1 - erfc(alpha * r); Eexcl -= q[i] * q[j] * e / r;
      const dE = q[i] * q[j] * (sp * alpha * Math.exp(-alpha * alpha * r * r) / r - e / (r * r)); // d/dr of q q erf(αr)/r
      for (let a = 0; a < d; a++) { F[i * d + a] += (dE / r) * dx[a]; F[j * d + a] -= (dE / r) * dx[a]; }
    }
    // real space: q q erfc(αr)/r over every pair within rc in the nearest image, excluded pairs skipped
    if (!realSpace) return { E: Erec + Eself + Eexcl, Ereal: 0, Erec, Eself, Eexcl };
    const ex = new Set(excluded.map(([i, j]) => (i < j ? i * n + j : j * n + i)));
    for (let i = 0; i < n; i++) { if (!q[i]) continue; for (let j = i + 1; j < n; j++) {
      if (!q[j] || ex.has(i * n + j)) continue;
      const r2 = sep(i, j); if (r2 > rc * rc) continue;
      const r = Math.sqrt(r2), ec = erfc(alpha * r); Ereal += (q[i] * q[j] * ec) / r;
      const f = q[i] * q[j] * (ec / r2 + sp * alpha * Math.exp(-alpha * alpha * r2) / r) / r; // −d/dr, over r
      for (let a = 0; a < d; a++) { F[i * d + a] += f * dx[a]; F[j * d + a] -= f * dx[a]; }
    } }
    return { E: Ereal + Erec + Eself + Eexcl, Ereal, Erec, Eself, Eexcl };
  }
}

/* ---------------------------------------------------------------- the system and its motion */
/* a short-range pair term between site types: Lennard-Jones { lj: [ε, σ] } or exp-6 { exp6: [A, B, C] }
   (A e^(−Br) − C/r⁶). Returns [u, −du/dr / r] */
function shortPair(p, r2) {
  if (p.lj) { const [e, s] = p.lj, s6 = (s * s / r2) ** 3; return [4 * e * (s6 * s6 - s6), (24 * e * (2 * s6 * s6 - s6)) / r2]; }
  const [A, B, C] = p.exp6, r = Math.sqrt(r2), ex = A * Math.exp(-B * r), r6 = r2 * r2 * r2; return [ex - C / r6, (B * ex) / r - (6 * C) / (r6 * r2)];
}
/* the surface of the unit sphere in d dimensions (4π, 2π²) */
export const sphereArea = (d) => (2 * Math.pow(Math.PI, d / 2)) / Math.exp(lgamma(d / 2));
/* a random rotation of d-space (Gram–Schmidt on Gaussian columns), as rows */
export function randomRotation(d, rnd) {
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd()), R = [];
  for (let i = 0; i < d; i++) { let v = Array.from({ length: d }, g); for (const u of R) { const p = v.reduce((s, x, k) => s + x * u[k], 0); v = v.map((x, k) => x - p * u[k]); } const n = Math.hypot(...v); R.push(v.map((x) => x / n)); }
  return R;
}
/* Marsaglia–Tsang gamma deviate (shape k, scale 1) */
function gammaDev(k, rnd, normal) { if (k < 1) return gammaDev(k + 1, rnd, normal) * Math.pow(rnd(), 1 / k); const dd = k - 1 / 3, c = 1 / Math.sqrt(9 * dd); for (;;) { let x, v; do { x = normal(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rnd(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + dd * (1 - v + Math.log(v))) return dd * v; } }

/* N rigid molecules of one kind in a periodic box. kind: { sites: [{ m, q, t, at: d-vector }], constraints: [[i, j]] }
   (constraint lengths are taken from the template). pairs: { "t1|t2": term } between sites of different molecules.
   rc: cutoff for both the short-range terms and Ewald's real-space sum. The short-range forces are truncated at rc;
   Epot adds their analytic tail (the thermodynamic energy), Edyn shifts each to zero at rc (what the motion conserves) */
export class System {
  constructor({ d, L, kind, N, pairs, rc, ewald, seed = 1, positions = null }) {
    let s = seed >>> 0; this.rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.normal = () => Math.sqrt(-2 * Math.log(this.rnd() + 1e-300)) * Math.cos(2 * Math.PI * this.rnd());
    const ns = kind.sites.length, n = N * ns; Object.assign(this, { d, L, N, ns, n, rc, kind });
    this.m = new Float64Array(n); this.q = new Float64Array(n); this.t = []; this.mol = new Int32Array(n);
    for (let a = 0; a < N; a++) kind.sites.forEach((st, k) => { const i = a * ns + k; this.m[i] = st.m; this.q[i] = st.q; this.t.push(st.t); this.mol[i] = a; });
    this.cons = []; for (let a = 0; a < N; a++) for (const [i, j] of kind.constraints) this.cons.push([a * ns + i, a * ns + j, Math.hypot(...kind.sites[i].at.map((x, k) => x - kind.sites[j].at[k]))]);
    this.excl = []; for (let a = 0; a < N; a++) for (let i = 0; i < ns; i++) for (let j = i + 1; j < ns; j++) this.excl.push([a * ns + i, a * ns + j]);
    this.pair = (ta, tb) => pairs[`${ta}|${tb}`] || pairs[`${tb}|${ta}`] || null;
    this.ewald = this.q.some((x) => x) ? new Ewald(d, L, { rc, ...ewald }) : null;
    // the analytic tail of the short-range terms past rc: (N_a N_b / V) ∫ u(r) S_d r^(d−1) dr, halved for like pairs
    const V = L ** d, S = sphereArea(d), types = [...new Set(this.t)], count = (ty) => this.t.filter((x) => x === ty).length; this.Elrc = 0;
    types.forEach((ta, a) => types.forEach((tb, b) => { if (b < a) return; const p = this.pair(ta, tb); if (!p) return; let I = 0; const R = rc * 40, steps = 20000, h = (R - rc) / steps; for (let k = 0; k <= steps; k++) { const r = rc + k * h, w = k === 0 || k === steps ? 0.5 : 1; I += w * shortPair(p, r * r)[0] * S * r ** (d - 1); } I *= h; this.Elrc += ((a === b ? 0.5 : 1) * count(ta) * count(tb) * I) / V; }));
    // start: molecules on a simple lattice, each turned at random
    this.x = new Float64Array(n * d); this.v = new Float64Array(n * d); this.F = new Float64Array(n * d);
    const side = Math.ceil(Math.pow(N, 1 / d)), sp = L / side;
    for (let a = 0; a < N; a++) {
      const R = randomRotation(d, this.rnd), c = []; let idx = a; for (let k = 0; k < d; k++) { c.push((idx % side + 0.5) * sp); idx = Math.floor(idx / side); }
      const at = positions ? positions[a] : c;
      kind.sites.forEach((st, k) => { for (let u = 0; u < d; u++) { let v = at[u]; for (let w = 0; w < d; w++) v += R[u][w] * st.at[w]; this.x[(a * ns + k) * d + u] = v; } });
    }
    this.dof = d * n - this.cons.length - d;
    this.forces();
  }
  /* forces into this.F; returns the energy's parts */
  forces() {
    const { d, n, L, rc, x, q, F, mol } = this; F.fill(0); let Esr = 0, Er = 0, Eshift = 0;
    const al = this.ewald ? this.ewald.alpha : 0, sp = 2 / Math.sqrt(Math.PI), dx = new Float64Array(d), rc2 = rc * rc;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (mol[i] === mol[j]) continue;
      let r2 = 0; for (let a = 0; a < d; a++) { let v = x[i * d + a] - x[j * d + a]; v -= L * Math.round(v / L); dx[a] = v; r2 += v * v; }
      if (r2 > rc2) continue;
      let f = 0; const p = this.pair(this.t[i], this.t[j]);
      if (p) { const [u, fu] = shortPair(p, r2); Esr += u; Eshift -= shortPair(p, rc2)[0]; f += fu; }
      if (al && q[i] && q[j]) { const r = Math.sqrt(r2), ec = erfc(al * r); Er += (q[i] * q[j] * ec) / r; f += (q[i] * q[j] * (ec / r2 + (sp * al * Math.exp(-al * al * r2)) / r)) / r; }
      for (let a = 0; a < d; a++) { F[i * d + a] += f * dx[a]; F[j * d + a] -= f * dx[a]; }
    }
    let Ek = 0;
    if (this.ewald) { const e = this.ewald.compute(x, q, F, this.excl, false); Ek = e.Erec + e.Eself + e.Eexcl; }
    // Epot is the physical energy (truncated terms plus their analytic tail); Edyn is what the motion conserves (each
    // short-range term shifted to zero at rc, so a pair crossing the cutoff doesn't jump)
    this.Epot = Esr + this.Elrc + Er + Ek; this.Edyn = Esr + Eshift + Er + Ek;
    return { Esr, Elrc: this.Elrc, Ereal: Er, Ek, E: this.Epot };
  }
  kinetic() { let K = 0; for (let i = 0; i < this.n; i++) for (let a = 0; a < this.d; a++) K += 0.5 * this.m[i] * this.v[i * this.d + a] ** 2; return K; }
  temperature() { return (2 * this.kinetic()) / this.dof; } // kT, hartree
  /* velocities from the Maxwell distribution at kT, made to obey the constraints, with no net momentum */
  thermalize(kT) {
    const { d, n, m, v } = this;
    for (let i = 0; i < n; i++) for (let a = 0; a < d; a++) v[i * d + a] = this.normal() * Math.sqrt(kT / m[i]);
    this.rattleV(); this.zeroMomentum(); const s = Math.sqrt(kT / this.temperature()); for (let k = 0; k < v.length; k++) v[k] *= s;
  }
  zeroMomentum() { const { d, n, m, v } = this; let M = 0; const P = new Float64Array(d); for (let i = 0; i < n; i++) { M += m[i]; for (let a = 0; a < d; a++) P[a] += m[i] * v[i * d + a]; } for (let i = 0; i < n; i++) for (let a = 0; a < d; a++) v[i * d + a] -= P[a] / M; }
  sep(i, j, x = this.x) { const { d, L } = this, r = new Float64Array(d); for (let a = 0; a < d; a++) { let u = x[i * d + a] - x[j * d + a]; u -= L * Math.round(u / L); r[a] = u; } return r; }
  rattleV(tol = 1e-12) {
    const { d, m, v } = this;
    for (let it = 0; it < 500; it++) { let done = true;
      for (const [i, j, l] of this.cons) { const r = this.sep(i, j); let rv = 0; for (let a = 0; a < d; a++) rv += r[a] * (v[i * d + a] - v[j * d + a]); const k = rv / (l * l * (1 / m[i] + 1 / m[j])); if (Math.abs(k) > tol) done = false; for (let a = 0; a < d; a++) { v[i * d + a] -= (k * r[a]) / m[i]; v[j * d + a] += (k * r[a]) / m[j]; } }
      if (done) return it; }
    throw new Error("RATTLE (velocities) did not converge");
  }
  /* one velocity-Verlet step with SHAKE/RATTLE, then Bussi's thermostat (if kT) with time constant tau */
  step(dt, kT = 0, tau = 100 * dt) {
    const { d, n, m, x, v, F } = this, old = x.slice();
    for (let i = 0; i < n; i++) for (let a = 0; a < d; a++) { v[i * d + a] += (0.5 * dt * F[i * d + a]) / m[i]; x[i * d + a] += dt * v[i * d + a]; }
    for (let it = 0; ; it++) { let done = true;
      for (const [i, j, l] of this.cons) { const r = this.sep(i, j), ro = this.sep(i, j, old); let r2 = 0, dot = 0; for (let a = 0; a < d; a++) { r2 += r[a] * r[a]; dot += r[a] * ro[a]; } const diff = r2 - l * l; if (Math.abs(diff) > 1e-10 * l * l) done = false; const g = diff / (2 * dot * (1 / m[i] + 1 / m[j])); for (let a = 0; a < d; a++) { x[i * d + a] -= (g * ro[a]) / m[i]; x[j * d + a] += (g * ro[a]) / m[j]; v[i * d + a] -= (g * ro[a]) / (m[i] * dt); v[j * d + a] += (g * ro[a]) / (m[j] * dt); } }
      if (done) break; if (it > 500) throw new Error("SHAKE did not converge"); }
    this.forces();
    for (let i = 0; i < n; i++) for (let a = 0; a < d; a++) v[i * d + a] += (0.5 * dt * F[i * d + a]) / m[i];
    this.rattleV();
    if (kT > 0) { // Bussi, Donadio & Parrinello's canonical rescaling
      const K = this.kinetic(), Kt = 0.5 * this.dof * kT, c = Math.exp(-dt / tau), R1 = this.normal(), Nf = this.dof;
      const Kn = K + (1 - c) * ((Kt * (R1 * R1 + 2 * gammaDev((Nf - 1) / 2, this.rnd, this.normal))) / Nf - K) + 2 * R1 * Math.sqrt((c * (1 - c) * K * Kt) / Nf);
      const sc = Math.sqrt(Math.max(Kn, 0) / K); for (let k = 0; k < v.length; k++) v[k] *= sc;
    }
  }
}
