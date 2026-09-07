// tjs/manifold/struct.js — THE STRUCTURAL SOLVE. Pure, DOM-free, three.js-free.
//
// /brut asks whether a building drifts too far. That is the right question for a
// frame and the WRONG one for a lattice shell, which does not fail by drift. A
// shell fails by folding (a mechanism), by buckling (globally, or one slender
// rib at a time), or by cracking where the form put the loads in tension. So
// this file answers those instead.
//
// ─── WHY THERE ARE TWO MODELS ────────────────────────────────────────────────
//
// The first version of this solver was pin-jointed, and every single seed came
// back a mechanism. That was not a bug in the geometry. It is a real and exact
// property of a doubly-ruled lattice: because each ruling family passes
// perfectly STRAIGHT through every node, the two collinear bars meeting there
// resist nothing along the surface normal, and the hoops — being a polygon
// symmetric about each node — resist an ALTERNATING normal pattern only at
// second order. The result is a zero-energy inextensional mode, the same floppy
// mode a Kagome lattice has. It is inherent to the beauty of the form: the
// straightness that makes the surface buildable out of straight ribs is exactly
// what makes it flop when the joints are hinges.
//
// Real ones are not hinges. Shukhov riveted his; a concrete rib lattice is cast
// monolithically. So the honest model is a SPACE FRAME — six degrees of freedom
// per node, beam elements carrying moment and torsion — and a pin-jointed model
// of it is not conservative, it is wrong, because it predicts a collapse that
// does not happen.
//
// Both models are kept, because the difference between them is the whole point:
//
//   • the PINNED model answers "would this stand as a bolted kit of parts?" —
//     Maxwell–Calladine counting plus the pivot census of a truss stiffness
//     matrix. When the answer is no, the number it returns is how much of the
//     structure is living on its joints.
//   • the FRAME model is the real solve: displacements, member end forces, a
//     linear buckling eigenvalue, and the reinforcement bill.
//
// ─── WHAT COUNTS AS STABLE ───────────────────────────────────────────────────
//
// For a shell the governing question is the BUCKLING LOAD FACTOR λ_cr: the
// multiple of the applied load at which K + λ·Kg goes singular. λ_cr = 1 means
// it buckles under its own weight. This falls out of the same factorisation as
// everything else, by inverse iteration against the geometric stiffness, and it
// subsumes Euler — a single member going first simply shows up as a mode
// localised on that member.
//
// ─── AND THE GAUDÍ QUESTION ──────────────────────────────────────────────────
//
// FUNICULARITY: the fraction of the structure, by length and by volume, in
// compression under gravity alone. A hanging chain inverted is 1.00 and needs no
// steel anywhere. Everything short of that has a tension field, and the price of
// that tension is reinforcement — quoted here in tonnes. That is the honest
// measure of how far a shape sits from the one the loads actually wanted.
//
// ─── NUMERICS ────────────────────────────────────────────────────────────────
//
// Up to ~1100 nodes ⇒ ~6600 frame DOF. Dense is out. The graph is banded if it
// is ordered well, so: reverse Cuthill–McKee over the NODE graph (each node's
// DOF stay contiguous), then a profile (skyline) LDLᵀ. It factors once and
// serves every load case and every eigen-iteration off the same factor, and its
// pivot signs are the stability answer by Sylvester's law of inertia.

import { SURFACES, PROGRAMMES, MAT } from './shell.js';

export const VERSION = 'struct/1';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;

/* ───────────────────────────────  material  ──────────────────────────────── */

export const STEEL = { fy: 500e6, Es: 200e9, rho: 7850 };
export const NU = 0.2;                                  // concrete Poisson
export const GC = MAT.Ec / (2 * (1 + NU));

const PHI_C = 0.65;   // ACI 318-19 §21.2, compression-controlled
const PHI_T = 0.90;   // tension-controlled

/* ───────────────────────────────  hazard  ────────────────────────────────── */
//
// Not part of the building — the same shell stands in Girona and in Miami — so
// this lives in its own control strip and stays out of the seed's permalink,
// exactly as the /brut hazard does.

export const EXPOSURES = {
  B: { label: 'B — suburban / wooded', zg: 365.76, alpha: 7.0 },
  C: { label: 'C — open country', zg: 274.32, alpha: 9.5 },
  D: { label: 'D — flat, unobstructed / water', zg: 213.36, alpha: 11.5 },
};

export const WIND_SCENARIOS = {
  calm: { label: 'Sheltered', V: 30, note: 'a mild inland site' },
  normal: { label: 'Design basic wind', V: 45, note: 'ASCE 7-16 Risk Cat II over most of the interior US' },
  coastal: { label: 'Coastal', V: 58, note: 'the hurricane-prone coastline' },
  hurricane: { label: 'Hurricane', V: 76, note: 'Cat-4 territory — Miami-Dade basic wind speed' },
};

export const SNOW_SCENARIOS = {
  none: { label: 'No snow', pg: 0 },
  light: { label: 'Light', pg: 0.7e3 },
  heavy: { label: 'Heavy', pg: 2.4e3 },
};

export const defaultHazard = () => ({ wind: 'normal', exposure: 'C', snow: 'light' });

/* ══════════════════════════════════════════════════════════════════════════
   NUMERIC CORE — RCM ordering, profile LDLᵀ
   ══════════════════════════════════════════════════════════════════════════ */

// Reverse Cuthill–McKee over the node graph. Ordering is the whole ballgame for
// a profile solver: the natural order here interleaves several separate lattices
// and a ring that touches all of them, which is close to worst case.
export function rcm(nNodes, adj) {
  const deg = adj.map((a) => a.length);
  const seen = new Uint8Array(nNodes);
  const order = [];

  const bfsFar = (start) => {                          // pseudo-peripheral probe
    const dist = new Int32Array(nNodes).fill(-1);
    dist[start] = 0;
    let q = [start], far = start;
    while (q.length) {
      const nq = [];
      for (const v of q) for (const w of adj[v]) if (dist[w] < 0) { dist[w] = dist[v] + 1; nq.push(w); far = w; }
      q = nq;
    }
    return far;
  };

  for (let s = 0; s < nNodes; s++) {
    if (seen[s]) continue;
    let start = s;
    for (let i = 0; i < nNodes; i++) if (!seen[i] && deg[i] < deg[start]) start = i;
    if (seen[start]) start = s;
    const far = bfsFar(start);
    const root = seen[far] ? start : far;
    const q = [root];
    seen[root] = 1;
    for (let h = 0; h < q.length; h++) {
      const v = q[h];
      order.push(v);
      const nb = adj[v].filter((w) => !seen[w]).sort((a, b) => deg[a] - deg[b]);
      for (const w of nb) { seen[w] = 1; q.push(w); }
    }
  }
  order.reverse();                                     // the R in RCM
  const perm = new Int32Array(nNodes);                 // old node → new position
  for (let i = 0; i < order.length; i++) perm[order[i]] = i;
  return { order, perm };
}

// A symmetric matrix stored by columns, each running from its first non-zero row
// down to the diagonal. `msk[j]` is that first row.
export class Profile {
  constructor(n, msk) {
    this.n = n;
    this.msk = msk;
    this.ptr = new Int32Array(n + 1);
    for (let j = 0; j < n; j++) this.ptr[j + 1] = this.ptr[j] + (j - msk[j] + 1);
    this.a = new Float64Array(this.ptr[n]);
    this.d = new Float64Array(n);
  }
  get size() { return this.a.length; }
  add(i, j, v) {                                       // lower triangle: i ≥ j
    if (i < j) { const t = i; i = j; j = t; }
    this.a[this.ptr[i] + (j - this.msk[i])] += v;
  }
  diag(j) { return this.a[this.ptr[j + 1] - 1]; }

  // LDLᵀ in place. By Sylvester's law of inertia the count of non-positive
  // pivots is exactly the number of eigenvalues ≤ 0 — the mechanism count, with
  // no eigensolve and no threshold-fiddling.
  //
  // `floor` is an ABSOLUTE pivot floor in the matrix's own units (pass a
  // fraction of the mean diagonal). A pivot at or below it is counted AND
  // replaced, so the factor stays invertible and inverse iteration then blows up
  // along precisely the fold — which is what we want to draw.
  factor(floor = 0) {
    const { n, msk, ptr, a, d } = this;
    const u = new Float64Array(n);
    const tol = floor > 0 ? floor : 1e-300;
    let negative = 0, tiny = 0, minPiv = Infinity, maxPiv = 0;
    for (let j = 0; j < n; j++) {
      const mj = msk[j], pj = ptr[j];
      for (let i = mj; i < j; i++) {
        const mi = msk[i], pi = ptr[i];
        const k0 = mi > mj ? mi : mj;
        let s = a[pj + i - mj];
        for (let k = k0; k < i; k++) s -= a[pi + k - mi] * u[k];
        a[pj + i - mj] = s / d[i];
        u[i] = s;
      }
      let s = a[pj + j - mj];
      for (let k = mj; k < j; k++) s -= a[pj + k - mj] * u[k];
      if (s < -tol) negative++;
      else if (s < tol) { tiny++; s = tol; }
      d[j] = s;
      const m = Math.abs(s);
      if (m < minPiv) minPiv = m;
      if (m > maxPiv) maxPiv = m;
    }
    return { negative, tiny, nonPositive: negative + tiny, minPiv, maxPiv };
  }

  solve(b, out) {
    const { n, msk, ptr, a, d } = this;
    const x = out || new Float64Array(n);
    if (x !== b) x.set(b);
    for (let j = 0; j < n; j++) {                      // L y = b
      const mj = msk[j], pj = ptr[j];
      let s = x[j];
      for (let k = mj; k < j; k++) s -= a[pj + k - mj] * x[k];
      x[j] = s;
    }
    for (let j = 0; j < n; j++) x[j] /= d[j];          // D z = y
    for (let j = n - 1; j >= 0; j--) {                 // Lᵀ x = z
      const mj = msk[j], pj = ptr[j], xj = x[j];
      if (xj === 0) continue;
      for (let k = mj; k < j; k++) x[k] -= a[pj + k - mj] * xj;
    }
    return x;
  }
}

// A deterministic starting vector. Math.random() is banned in this kernel for
// the same reason it is banned in the generator: the same seed must give the
// same answer, and an eigen-iteration started from noise does not.
function seedVector(n) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.sin((i + 1) * 12.9898) * 43758.5453;
    x[i] = s - Math.floor(s) - 0.5;
  }
  return x;
}

// Inverse iteration on a factored K: converges to the eigenvector of the
// SMALLEST eigenvalue of K, the softest deformation the structure admits.
export function softestMode(P, mul, iters = 60) {
  const n = P.n;
  let x = seedVector(n);
  const y = new Float64Array(n), Kx = new Float64Array(n);
  let lam = 0;
  for (let it = 0; it < iters; it++) {
    P.solve(x, y);
    let nrm = 0;
    for (let i = 0; i < n; i++) nrm += y[i] * y[i];
    nrm = Math.sqrt(nrm);
    if (!(nrm > 0) || !isFinite(nrm)) break;
    for (let i = 0; i < n; i++) x[i] = y[i] / nrm;
    mul(x, Kx);
    let num = 0;
    for (let i = 0; i < n; i++) num += x[i] * Kx[i];
    if (it > 6 && Math.abs(num - lam) < 1e-11 * (Math.abs(num) + 1)) { lam = num; break; }
    lam = num;
  }
  return { lambda: lam, vec: x };
}

// The linear buckling load factor. K φ = −λ Kg φ, i.e. the eigenproblem for
// B = −K⁻¹Kg with λ = 1/μ; the smallest positive λ is the largest positive μ.
//
// The subtlety that makes a naive version wrong: Kg is INDEFINITE, because some
// members are in tension and tension stiffens rather than softens. So B has
// eigenvalues of both signs, and power iteration finds the one of largest
// MAGNITUDE — which is often the negative one. A negative λ means "it buckles if
// you reverse gravity", which is not the question.
//
// So iterate twice. The first pass finds whichever extreme dominates; the second
// runs on the shifted operator B − μ₁I, whose dominant eigenvalue is the extreme
// at the OTHER end of the spectrum. Between the two we have both ends, and the
// answer is the largest positive one.
function powerB(P, kgMul, n, shift, iters, x0) {
  const x = x0 ? Float64Array.from(x0) : seedVector(n);
  let n0 = 0;
  for (let i = 0; i < n; i++) n0 += x[i] * x[i];
  n0 = Math.sqrt(n0) || 1;
  for (let i = 0; i < n; i++) x[i] /= n0;              // the Rayleigh quotient needs it unit
  const Gx = new Float64Array(n), rhs = new Float64Array(n), y = new Float64Array(n);
  let mu = 0, converged = false;
  for (let it = 0; it < iters; it++) {
    kgMul(x, Gx);
    for (let i = 0; i < n; i++) rhs[i] = -Gx[i];
    P.solve(rhs, y);
    if (shift) for (let i = 0; i < n; i++) y[i] -= shift * x[i];    // (B − shift·I)x
    let nrm = 0, dot = 0;
    for (let i = 0; i < n; i++) { nrm += y[i] * y[i]; dot += y[i] * x[i]; }
    nrm = Math.sqrt(nrm);
    if (!(nrm > 0) || !isFinite(nrm)) break;
    const next = dot;                                  // Rayleigh quotient, x unit
    for (let i = 0; i < n; i++) x[i] = y[i] / nrm;
    if (it > 10 && Math.abs(next - mu) < 1e-7 * Math.abs(next)) { mu = next; converged = true; break; }
    mu = next;
  }
  return { mu: mu + (shift || 0), vec: x, converged };
}

export function bucklingMode(P, kMul, kgMul, iters = 150) {
  const n = P.n;
  const a = powerB(P, kgMul, n, 0, iters);
  const b = powerB(P, kgMul, n, a.mu, iters);
  const cands = [a, b].filter((c) => isFinite(c.mu) && c.mu > 0);
  if (!cands.length) {
    return { lambda: Infinity, vec: a.vec, converged: false, both: [a.mu, b.mu] };
  }
  const best = cands.reduce((p, c) => (c.mu > p.mu ? c : p));
  return { lambda: 1 / best.mu, vec: best.vec, converged: best.converged, both: [a.mu, b.mu] };
}

/* ══════════════════════════════════════════════════════════════════════════
   MODEL — the DOF map, shared by both the pinned and the frame assembly
   ══════════════════════════════════════════════════════════════════════════ */

export function model(b, ndof = 6) {
  const n = b.nodes.length;
  const adj = Array.from({ length: n }, () => []);
  for (const m of b.members) { adj[m.i].push(m.j); adj[m.j].push(m.i); }
  const { perm } = rcm(n, adj);

  const slot = new Int32Array(n);
  for (let i = 0; i < n; i++) slot[perm[i]] = i;       // new position → old node

  // The feet are cast into their pads, so all six components are held. A pinned
  // foot would be the conservative choice for a steel base plate; a monolithic
  // concrete one is fixed, and modelling it pinned invents rotation mechanisms
  // at the feet that the real thing does not have.
  const dof = new Int32Array(n * ndof).fill(-1);
  let nf = 0;
  for (let s = 0; s < n; s++) {
    const i = slot[s];
    if (b.supportSet.has(i)) continue;
    for (let c = 0; c < ndof; c++) dof[i * ndof + c] = nf++;
  }

  const msk = new Int32Array(nf);
  for (let j = 0; j < nf; j++) msk[j] = j;
  const touch = (p, q) => { if (p >= 0 && q >= 0) { if (q < msk[p]) msk[p] = q; if (p < msk[q]) msk[q] = p; } };
  for (const m of b.members) {
    for (let c = 0; c < ndof; c++) for (let e = 0; e < ndof; e++) touch(dof[m.i * ndof + c], dof[m.j * ndof + e]);
  }
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ndof; c++) for (let e = 0; e < ndof; e++) touch(dof[i * ndof + c], dof[i * ndof + e]);
  }

  // Local axes per member, cached. For a circular section the roll about the
  // member axis is immaterial, so any consistent perpendicular will do.
  const ax = new Float64Array(b.members.length * 9);
  for (let e = 0; e < b.members.length; e++) {
    const m = b.members[e], A = b.nodes[m.i], B = b.nodes[m.j];
    const L = Math.max(1e-9, Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z));
    const x = [(B.x - A.x) / L, (B.y - A.y) / L, (B.z - A.z) / L];
    const up = Math.abs(x[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
    let z = [x[1] * up[2] - x[2] * up[1], x[2] * up[0] - x[0] * up[2], x[0] * up[1] - x[1] * up[0]];
    const zn = Math.hypot(z[0], z[1], z[2]);
    z = [z[0] / zn, z[1] / zn, z[2] / zn];
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    ax.set([x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]], e * 9);
  }

  return { n, nf, ndof, dof, msk, ax, adj, perm };
}

/* ─────────────────────────── element stiffness ──────────────────────────── */

// The textbook 12×12 Bernoulli beam in local coordinates, lower triangle filled
// symmetric. Local x is the member axis.
// Sections may be ANISOTROPIC. A rib is a circle and Iy = Iz, but a floor is a
// plate, and the strip of slab a spoke stands for is weak out of plane
// (w·t³/12) and enormously stiff in it (t·w³/12). That difference is not a
// detail: in-plane slab stiffness is the diaphragm action that ties a building's
// facade together, and modelling floors as round rods left every seed too soft.
// Members carry `Iz` (bending along local y) and `Iy` (along local z), both
// falling back to the isotropic `I`.
export function beamLocal(m) {
  const L = Math.max(1e-6, m.L);
  const E = MAT.Ec, A = m.A;
  const Iz = m.Iz != null ? m.Iz : m.I;
  const Iy = m.Iy != null ? m.Iy : m.I;
  const J = m.J != null ? m.J : Iy + Iz;               // circular: J = 2I
  const k = new Float64Array(144);
  const S = (i, j, v) => { k[i * 12 + j] += v; if (i !== j) k[j * 12 + i] += v; };
  const a = (E * A) / L, t = (GC * J) / L;
  const cz = (12 * E * Iz) / (L * L * L), dz = (6 * E * Iz) / (L * L);
  const ez4 = (4 * E * Iz) / L, ez2 = (2 * E * Iz) / L;
  const cy = (12 * E * Iy) / (L * L * L), dy = (6 * E * Iy) / (L * L);
  const ey4 = (4 * E * Iy) / L, ey2 = (2 * E * Iy) / L;
  S(0, 0, a); S(6, 6, a); S(0, 6, -a);
  S(3, 3, t); S(9, 9, t); S(3, 9, -t);
  // bending in the local x–y plane (rotation about local z): dofs 1, 5, 7, 11
  S(1, 1, cz); S(7, 7, cz); S(1, 7, -cz);
  S(1, 5, dz); S(1, 11, dz); S(7, 5, -dz); S(7, 11, -dz);
  S(5, 5, ez4); S(11, 11, ez4); S(5, 11, ez2);
  // bending in the local x–z plane (rotation about local y): dofs 2, 4, 8, 10
  S(2, 2, cy); S(8, 8, cy); S(2, 8, -cy);
  S(2, 4, -dy); S(2, 10, -dy); S(8, 4, dy); S(8, 10, dy);
  S(4, 4, ey4); S(10, 10, ey4); S(4, 10, ey2);
  return k;
}

// Consistent geometric stiffness for axial force N (tension positive). This is
// the standard cubic-interpolation matrix, and it is worth having rather than
// the cruder string form: on a single pin-ended strut it reproduces Euler's
// π²EI/L² to about a tenth of a percent, which makes it checkable.
export function geomLocal(m, N) {
  const L = Math.max(1e-6, m.L);
  const g = new Float64Array(144);
  const S = (i, j, v) => { g[i * 12 + j] += v; if (i !== j) g[j * 12 + i] += v; };
  const s = N / (30 * L), L2 = L * L;
  // x–y plane: dofs 1, 5, 7, 11
  S(1, 1, 36 * s); S(7, 7, 36 * s); S(1, 7, -36 * s);
  S(1, 5, 3 * L * s); S(1, 11, 3 * L * s); S(7, 5, -3 * L * s); S(7, 11, -3 * L * s);
  S(5, 5, 4 * L2 * s); S(11, 11, 4 * L2 * s); S(5, 11, -L2 * s);
  // x–z plane: dofs 2, 4, 8, 10 (the rotation couplings flip sign)
  S(2, 2, 36 * s); S(8, 8, 36 * s); S(2, 8, -36 * s);
  S(2, 4, -3 * L * s); S(2, 10, -3 * L * s); S(8, 4, 3 * L * s); S(8, 10, 3 * L * s);
  S(4, 4, 4 * L2 * s); S(10, 10, 4 * L2 * s); S(4, 10, -L2 * s);
  return g;
}

// Rotate a 12×12 local matrix into global: Kg = Tᵀ k T, T block-diagonal with
// four copies of the 3×3 direction-cosine matrix.
function rotate12(k, R) {
  const out = new Float64Array(144);
  const tmp = new Float64Array(144);
  // tmp = k · T   (T's block b maps global→local, so T[3b+r][3b+c] = R[r][c])
  for (let i = 0; i < 12; i++) {
    for (let bl = 0; bl < 4; bl++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let r = 0; r < 3; r++) s += k[i * 12 + bl * 3 + r] * R[r * 3 + c];
        tmp[i * 12 + bl * 3 + c] = s;
      }
    }
  }
  // out = Tᵀ · tmp
  for (let j = 0; j < 12; j++) {
    for (let bl = 0; bl < 4; bl++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let r = 0; r < 3; r++) s += R[r * 3 + c] * tmp[(bl * 3 + r) * 12 + j];
        out[(bl * 3 + c) * 12 + j] = s;
      }
    }
  }
  return out;
}

// Truss element (3 DOF/node), for the pinned-joint diagnostic only.
function trussGlobal(m, x) {
  const k = (MAT.Ec * m.A) / Math.max(1e-6, m.L);
  const s = [x[0], x[1], x[2], -x[0], -x[1], -x[2]];
  const out = new Float64Array(36);
  for (let a = 0; a < 6; a++) for (let c = 0; c < 6; c++) out[a * 6 + c] = k * s[a] * s[c];
  return out;
}

export function assemble(b, M, forces = null) {
  const P = new Profile(M.nf, M.msk);
  const { dof, ndof, ax } = M;
  const g = new Int32Array(ndof * 2);
  for (let e = 0; e < b.members.length; e++) {
    const m = b.members[e];
    for (let c = 0; c < ndof; c++) { g[c] = dof[m.i * ndof + c]; g[ndof + c] = dof[m.j * ndof + c]; }
    let K;
    if (ndof === 3) K = trussGlobal(m, [ax[e * 9], ax[e * 9 + 1], ax[e * 9 + 2]]);
    else {
      const R = ax.subarray(e * 9, e * 9 + 9);
      K = rotate12(forces ? geomLocal(m, forces[e]) : beamLocal(m), R);
    }
    const w = ndof * 2;
    for (let a = 0; a < w; a++) {
      if (g[a] < 0) continue;
      for (let c = 0; c <= a; c++) {
        if (g[c] < 0) continue;
        P.add(g[a], g[c], K[a * w + c]);
      }
    }
  }
  return P;
}

// Matrix-free K·x — needed because factoring destroys the matrix, and needed
// again for Kg, which is never assembled at all.
export function matVec(b, M, forces = null) {
  const { dof, ndof, ax } = M;
  const g = new Int32Array(ndof * 2);
  const ue = new Float64Array(ndof * 2);
  const cache = new Array(b.members.length);
  return (x, out) => {
    out.fill(0);
    for (let e = 0; e < b.members.length; e++) {
      const m = b.members[e];
      for (let c = 0; c < ndof; c++) { g[c] = dof[m.i * ndof + c]; g[ndof + c] = dof[m.j * ndof + c]; }
      const w = ndof * 2;
      let any = false;
      for (let a = 0; a < w; a++) { ue[a] = g[a] >= 0 ? x[g[a]] : 0; if (ue[a] !== 0) any = true; }
      if (!any) continue;
      let K = cache[e];
      if (!K) {
        if (ndof === 3) K = trussGlobal(m, [ax[e * 9], ax[e * 9 + 1], ax[e * 9 + 2]]);
        else K = rotate12(forces ? geomLocal(m, forces[e]) : beamLocal(m), ax.subarray(e * 9, e * 9 + 9));
        cache[e] = K;
      }
      for (let a = 0; a < w; a++) {
        if (g[a] < 0) continue;
        let s = 0;
        for (let c = 0; c < w; c++) s += K[a * w + c] * ue[c];
        out[g[a]] += s;
      }
    }
    return out;
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   LOADS
   ══════════════════════════════════════════════════════════════════════════ */

// Nodal load vectors in world XYZ, three per node (moments are never applied).
// Kept in node space rather than DOF space so a reaction can be read at a foot.
export function loads(b, hazard = defaultHazard()) {
  const n = b.nodes.length;
  const S = SURFACES[b.params.surface];
  const T = PROGRAMMES[b.params.programme];
  const zero = () => new Float64Array(n * 3);

  const D = zero();
  for (const m of b.members) { D[m.i * 3 + 2] -= m.W / 2; D[m.j * 3 + 2] -= m.W / 2; }

  // cladding, by triangle area, a third to each vertex
  const nodeArea = new Float64Array(n);
  for (let t = 0; t < b.tris.length; t++) {
    const [ia, ib, ic] = b.tris[t];
    const A = b.nodes[ia], B = b.nodes[ib], C = b.nodes[ic];
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
    const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
    const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const w = (S.clad * ar) / 3;
    for (const id of [ia, ib, ic]) { D[id * 3 + 2] -= w; nodeArea[id] += ar / 3; }
  }

  // ── the floors ───────────────────────────────────────────────────────────
  //
  // These are most of the building's mass now, and they are not a uniform
  // assumption: each plate is an annulus of known area at a known level, so its
  // slab weight and its occupancy both follow from the geometry. Half the load
  // goes to the core and half to the facade ring — a spoked plate spanning
  // between them, which is what the spokes model.
  const SLAB_T = 0.22;                                   // 220 mm flat slab
  const FINISH = 1.5e3;                                  // screed, services, partitions
  const L = zero();
  for (const f of b.floors) {
    const dead = (SLAB_T * MAT.rho * MAT.g + FINISH) * f.area;
    const live = T.live * f.area;
    if (f.core != null) { D[f.core * 3 + 2] -= dead * 0.5; L[f.core * 3 + 2] -= live * 0.5; }
    const share = f.ids.length || 1;
    for (const id of f.ids) {
      D[id * 3 + 2] -= (dead * 0.5) / share;
      L[id * 3 + 2] -= (live * 0.5) / share;
    }
  }
  // the ring deck — the street — spread over the ring's own nodes
  if (b.ringDeck && b.ring.ids && b.ring.ids.length) {
    const dead = (SLAB_T * MAT.rho * MAT.g + FINISH) * b.ringDeck.area;
    const live = 5.0e3 * b.ringDeck.area;                // a public street, not a flat
    for (const id of b.ring.ids) {
      D[id * 3 + 2] -= dead / b.ring.ids.length;
      L[id * 3 + 2] -= live / b.ring.ids.length;
    }
  }

  // snow, on the horizontal projection of the upward-facing surface
  const Sn = zero();
  const pg = (SNOW_SCENARIOS[hazard.snow] || SNOW_SCENARIOS.light).pg;
  if (pg > 0 && S.opacity > 0) {
    for (let t = 0; t < b.tris.length; t++) {
      const [ia, ib, ic] = b.tris[t];
      const A = b.nodes[ia], B = b.nodes[ib], C = b.nodes[ic];
      const proj = Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) / 2;
      const w = (pg * proj * S.opacity) / 3;
      for (const id of [ia, ib, ic]) Sn[id * 3 + 2] -= w;
    }
  }

  // ── wind: ASCE 7-16 velocity pressure, drag on the projected silhouette ──
  //
  // The two limits are genuinely different structures. A clad shell presents its
  // surface; a bare lattice presents its BARS — far less area, but every one of
  // them, and the code's open-frame Cf is much higher than a curved solid's.
  // `opacity` blends them, which is exactly what a perforated or glazed skin
  // does in reality.
  const ex = EXPOSURES[hazard.exposure] || EXPOSURES.C;
  const V = (WIND_SCENARIOS[hazard.wind] || WIND_SCENARIOS.normal).V;
  const Kz = (z) => 2.01 * Math.pow(Math.max(4.6, z) / ex.zg, 2 / ex.alpha);
  const qz = (z) => 0.613 * Kz(z) * 0.85 * V * V;      // Kzt = 1, Kd = 0.85
  const G = 0.85, CF_SHELL = 0.7, CF_LATTICE = 1.6;

  const windCase = (dx, dy) => {
    const W = zero();
    if (S.opacity > 0) {
      for (let t = 0; t < b.tris.length; t++) {
        const [ia, ib, ic] = b.tris[t];
        const A = b.nodes[ia], B = b.nodes[ib], C = b.nodes[ic];
        const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
        const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
        const nx = (uy * vz - uz * vy) / 2, ny = (uz * vx - ux * vz) / 2;
        const proj = Math.abs(nx * dx + ny * dy);
        // half on the windward face and half on the leeward, so the total drag
        // lands on the silhouette once — which is the area Cf is defined on
        const f = 0.5 * qz((A.z + B.z + C.z) / 3) * G * CF_SHELL * proj * S.opacity;
        for (const id of [ia, ib, ic]) { W[id * 3] += (f * dx) / 3; W[id * 3 + 1] += (f * dy) / 3; }
      }
    }
    if (S.opacity < 1) {
      for (const m of b.members) {
        const A = b.nodes[m.i], B = b.nodes[m.j];
        const lx = B.x - A.x, ly = B.y - A.y, lz = B.z - A.z;
        const along = lx * dx + ly * dy;
        const perp = Math.hypot(lx - along * dx, ly - along * dy, lz);
        const f = qz((A.z + B.z) / 2) * G * CF_LATTICE * perp * 2 * m.r * (1 - S.opacity);
        W[m.i * 3] += (f * dx) / 2; W[m.i * 3 + 1] += (f * dy) / 2;
        W[m.j * 3] += (f * dx) / 2; W[m.j * 3 + 1] += (f * dy) / 2;
      }
    }
    return W;
  };

  const WX = windCase(1, 0), WY = windCase(0, 1);
  const sum = (v) => {
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < n; i++) { sx += v[i * 3]; sy += v[i * 3 + 1]; sz += v[i * 3 + 2]; }
    return { x: sx, y: sy, z: sz };
  };

  return {
    D, L, S: Sn, WX, WY, nodeArea,
    totals: { dead: -sum(D).z, live: -sum(L).z, snow: -sum(Sn).z, wind: sum(WX).x },
    wind: { V, qzTop: r2(qz(b.height)), exposure: hazard.exposure, snow: pg },
  };
}

// ASCE 7-16 §2.3 strength combinations. 0.9D + 1.0W is the one that matters for
// a light lattice: it is the case that pulls the feet off the ground.
export const COMBOS = [
  { id: '1.4D', label: '1.4 D', D: 1.4, L: 0, S: 0, W: 0 },
  { id: '1.2D+1.6L', label: '1.2 D + 1.6 L + 0.5 S', D: 1.2, L: 1.6, S: 0.5, W: 0 },
  { id: '1.2D+1.6S', label: '1.2 D + 1.6 S + 1.0 L', D: 1.2, L: 1.0, S: 1.6, W: 0 },
  { id: '1.2D+W', label: '1.2 D + 1.0 W + 1.0 L + 0.5 S', D: 1.2, L: 1.0, S: 0.5, W: 1.0 },
  { id: '0.9D+W', label: '0.9 D + 1.0 W (uplift)', D: 0.9, L: 0, S: 0, W: 1.0 },
  { id: 'D', label: '1.0 D (service — the funicular question)', D: 1, L: 0, S: 0, W: 0, service: true },
];

/* ══════════════════════════════════════════════════════════════════════════
   MEMBER FORCES
   ══════════════════════════════════════════════════════════════════════════ */

// End forces in LOCAL axes: f = k_local · T · u_global. Loads are nodal, so the
// moment varies linearly along a member and its maximum is at an end — no
// sampling needed, the two ends are the answer.
export function endForces(b, M, u) {
  const nm = b.members.length;
  const N = new Float64Array(nm);          // axial, + tension
  const Mmax = new Float64Array(nm);       // largest end moment magnitude
  const Vmax = new Float64Array(nm);       // shear
  const Tor = new Float64Array(nm);        // torsion
  // The GLOBAL force each member exerts on each of its two nodes — axial AND
  // shear. A reaction summed from the axial part alone is a truss formula, and
  // on a frame it misses equilibrium by whatever the shears carry, which here
  // was up to 10%.
  const Fg = new Float64Array(nm * 6);
  const ug = new Float64Array(12), ul = new Float64Array(12);
  for (let e = 0; e < nm; e++) {
    const m = b.members[e], R = M.ax.subarray(e * 9, e * 9 + 9);
    for (let c = 0; c < 6; c++) {
      const gi = M.dof[m.i * 6 + c], gj = M.dof[m.j * 6 + c];
      ug[c] = gi >= 0 ? u[gi] : 0;
      ug[6 + c] = gj >= 0 ? u[gj] : 0;
    }
    for (let bl = 0; bl < 4; bl++) {
      for (let r = 0; r < 3; r++) {
        let s = 0;
        for (let c = 0; c < 3; c++) s += R[r * 3 + c] * ug[bl * 3 + c];
        ul[bl * 3 + r] = s;
      }
    }
    const k = beamLocal(m);
    const f = new Float64Array(12);
    for (let a = 0; a < 12; a++) { let s = 0; for (let c = 0; c < 12; c++) s += k[a * 12 + c] * ul[c]; f[a] = s; }
    N[e] = f[6];                                       // + when the far end pulls away
    Tor[e] = Math.abs(f[9]);
    Vmax[e] = Math.max(Math.hypot(f[1], f[2]), Math.hypot(f[7], f[8]));
    Mmax[e] = Math.max(Math.hypot(f[4], f[5]), Math.hypot(f[10], f[11]));
    // f = k·u is what the NODES do to the member, so the member does −f to the
    // nodes. Rotate that back to global (Rᵀ, since R maps global → local).
    for (let end = 0; end < 2; end++) {
      const o = end * 6;
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let r = 0; r < 3; r++) s += R[r * 3 + c] * -f[o + r];
        Fg[e * 6 + end * 3 + c] = s;
      }
    }
  }
  return { N, Mmax, Vmax, Tor, Fg };
}

// Reaction at a held node. Equilibrium is R + F_members + F_applied = 0, so
// R = −(F_members + F_applied). Sign convention of the result: Rz > 0 is the
// ground pushing UP, which is what a foot carrying weight looks like; Rz < 0 is
// UPLIFT, and that foot needs an anchor.
function reactions(b, M, Fg, applied) {
  const out = new Map();
  const push = (node, c, v) => {
    const cur = out.get(node) || [0, 0, 0];
    cur[c] += v;
    out.set(node, cur);
  };
  for (let e = 0; e < b.members.length; e++) {
    const m = b.members[e];
    for (let c = 0; c < 3; c++) {
      if (M.dof[m.i * 6 + c] < 0) push(m.i, c, Fg[e * 6 + c]);
      if (M.dof[m.j * 6 + c] < 0) push(m.j, c, Fg[e * 6 + 3 + c]);
    }
  }
  for (const [node, v] of out) for (let c = 0; c < 3; c++) v[c] = -(v[c] + applied[node * 3 + c]);
  return out;
}

// Euler with k = 1.0. The joints are monolithic, so the true effective length is
// shorter than the member; taking it as pinned–pinned is the conservative
// reading and it keeps this check independent of the buckling eigenvalue, which
// gets the restraint right and can then be compared against it.
export function memberCapacity(m) {
  // buckling goes about the WEAK axis, so an anisotropic section is checked on
  // the smaller of its two inertias
  const Imin = Math.min(m.Iz != null ? m.Iz : m.I, m.Iy != null ? m.Iy : m.I);
  const Pcr = (Math.PI ** 2 * MAT.Ec * Imin) / (m.L * m.L);
  const Psquash = 0.85 * MAT.fc * m.A;
  return { Pcr, Psquash, comp: Math.min(Pcr, Psquash), slender: m.L / Math.sqrt(Imin / m.A), euler: Pcr < Psquash };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SOLVE
   ══════════════════════════════════════════════════════════════════════════ */

export function solve(b, hazard = defaultHazard(), opts = {}) {
  const M = model(b, 6);
  const P = loads(b, hazard);
  const nm = b.members.length, nn = b.nodes.length, ns = b.supports.length;

  // ── the pinned-joint question, answered on its own model ─────────────────
  //
  // Would this stand as a bolted kit of parts? For a doubly-ruled lattice the
  // answer is almost always no, and that is the interesting part: the straight
  // ribs that make the surface buildable are exactly what make it flop on
  // hinges. The number below is how much of the structure lives on its joints.
  let pinned = null;
  if (opts.pinned !== false) {
    const MT = model(b, 3);
    const KT = assemble(b, MT);
    let md = 0;
    for (let j = 0; j < MT.nf; j++) md += KT.diag(j);
    md /= Math.max(1, MT.nf);
    const piv = KT.factor(md * 1e-10);
    pinned = {
      dof: MT.nf, mechanisms: piv.nonPositive, stable: piv.nonPositive === 0,
      maxwell: nm + 3 * ns - 3 * nn,
      note: piv.nonPositive === 0
        ? 'stable even with pinned joints — this one would stand as a bolted kit of parts'
        : `${piv.nonPositive} inextensional mechanisms with pinned joints: the ruling passes straight through every node, so the bars there resist nothing normal to the surface. It stands because the joints are cast monolithic and carry moment.`,
    };
  }

  // ── the frame: one factorisation, unshifted ──────────────────────────────
  const K = assemble(b, M);
  let meanDiag = 0;
  for (let j = 0; j < M.nf; j++) meanDiag += K.diag(j);
  meanDiag /= Math.max(1, M.nf);
  const pivots = K.factor(meanDiag * 1e-10);
  const kMul = matVec(b, M);

  // ── load cases ───────────────────────────────────────────────────────────
  const rhs = new Float64Array(M.nf);
  const applied = new Float64Array(nn * 3);
  const cases = [];
  for (const combo of COMBOS) {
    for (let i = 0; i < nn * 3; i++) {
      applied[i] = combo.D * P.D[i] + combo.L * P.L[i] + combo.S * P.S[i] + combo.W * P.WX[i];
    }
    rhs.fill(0);
    for (let i = 0; i < nn; i++) {
      for (let c = 0; c < 3; c++) { const g = M.dof[i * 6 + c]; if (g >= 0) rhs[g] = applied[i * 3 + c]; }
    }
    const u = K.solve(rhs, new Float64Array(M.nf));
    const F = endForces(b, M, u);
    let dmax = 0, dnode = 0;
    for (let i = 0; i < nn; i++) {
      const g = i * 6;
      const d = Math.hypot(
        M.dof[g] >= 0 ? u[M.dof[g]] : 0,
        M.dof[g + 1] >= 0 ? u[M.dof[g + 1]] : 0,
        M.dof[g + 2] >= 0 ? u[M.dof[g + 2]] : 0);
      if (d > dmax) { dmax = d; dnode = i; }
    }
    cases.push({ combo, u, F, dmax, dnode, react: reactions(b, M, F.Fg, applied) });
  }
  const service = cases.find((c) => c.combo.service);
  const strength = cases.filter((c) => !c.combo.service);

  // ── buckling: the governing stability question for a shell ───────────────
  //
  // λ_cr is the multiple of the SERVICE gravity load at which K + λKg goes
  // singular. λ_cr = 1 means it buckles under its own weight. It subsumes Euler:
  // a single rib going first simply shows up as a mode localised on that rib.
  let buckling = null;
  if (opts.buckling !== false) {
    const kgMul = matVec(b, M, service.F.N);
    const bm = bucklingMode(K, kMul, kgMul, opts.bucklingIters || 150);
    buckling = { lambda: bm.lambda, vec: bm.vec, converged: bm.converged };
  }

  // ── the softest mode, for the fold animation ─────────────────────────────
  const soft = softestMode(K, kMul, opts.modeIters || 60);
  const softness = meanDiag > 0 ? soft.lambda / meanDiag : 0;

  // ── member checks: the envelope over every strength combination ──────────
  const caps = b.members.map(memberCapacity);
  const mem = b.members.map((m, e) => {
    let nMin = 0, nMax = 0, mMax = 0, gov = strength[0].combo.id;
    for (const c of strength) {
      if (c.F.N[e] > nMax) nMax = c.F.N[e];
      if (c.F.N[e] < nMin) { nMin = c.F.N[e]; gov = c.combo.id; }
      if (c.F.Mmax[e] > mMax) mMax = c.F.Mmax[e];
    }
    const cap = caps[e];
    const util = Math.abs(nMin) / (PHI_C * cap.comp);
    // Preliminary reinforcement: the flexural arm plus whatever net tension the
    // section carries. This is the sizing formula an engineer uses before doing
    // a real interaction diagram, and it is quoted as such.
    const d = m.d || 1.6 * m.r;
    const As = mMax / (PHI_T * STEEL.fy * 0.9 * d) + Math.max(0, nMax) / (PHI_T * STEEL.fy);
    // elastic extreme-fibre stress, the check that says whether it cracks
    const sig = nMin / m.A - (mMax * m.r) / m.I;
    return {
      kind: m.kind, L: m.L, A: m.A, r: m.r, slender: r2(cap.slender), euler: cap.euler,
      Pcr: cap.Pcr, comp: r2(nMin), tens: r2(nMax), moment: r2(mMax), util: r3(util),
      As, rho: r4(As / m.A), sigma: r2(sig / 1e6), gov,
      service: service.F.N[e], serviceM: service.F.Mmax[e],
    };
  });

  // ── funicularity: the Gaudí number ───────────────────────────────────────
  let lenC = 0, lenT = 0, volC = 0, volT = 0, steelVol = 0, worstT = 0;
  for (let e = 0; e < mem.length; e++) {
    const m = b.members[e];
    if (mem[e].service < 0) { lenC += m.L; volC += m.A * m.L; } else { lenT += m.L; volT += m.A * m.L; }
    steelVol += mem[e].As * m.L;
    if (mem[e].tens > worstT) worstT = mem[e].tens;
  }
  const funicular = {
    byLength: r3(lenC / Math.max(1e-9, lenC + lenT)),
    byVolume: r3(volC / Math.max(1e-9, volC + volT)),
    steelTonnes: r2((steelVol * STEEL.rho) / 1000),
    steelPerM3: r2((steelVol * STEEL.rho) / Math.max(1e-6, volC + volT)),
    worstTension: r2(worstT / 1e3),
    note: 'a hanging chain inverted is 1.00 and needs no steel at all; the shortfall is what the reinforcement is paying for',
  };

  // ── the ring: which way is it working? ───────────────────────────────────
  let ringSum = 0, ringCount = 0, ringPeak = 0;
  for (let e = 0; e < nm; e++) {
    if (b.members[e].kind !== 'ring') continue;
    ringSum += mem[e].service; ringCount++;
    if (Math.abs(mem[e].service) > Math.abs(ringPeak)) ringPeak = mem[e].service;
  }
  const ring = {
    mean: r2(ringSum / Math.max(1, ringCount) / 1e3),
    peak: r2(ringPeak / 1e3),
    mode: ringSum > 0 ? 'tension' : 'compression',
    note: ringSum > 0
      ? 'the legs are splaying and the ring is holding them in — a tension ring, so it needs continuity and must never be cut'
      : 'the legs lean inward and the ring props them apart — a compression ring, so its own buckling is the thing to watch',
  };

  // ── the feet ─────────────────────────────────────────────────────────────
  let uplift = 0, thrust = 0, downMax = 0;
  for (const c of strength) {
    for (const [, v] of c.react) {
      if (-v[2] > uplift) uplift = -v[2];
      if (v[2] > downMax) downMax = v[2];
      const h = Math.hypot(v[0], v[1]);
      if (h > thrust) thrust = h;
    }
  }

  // ── verdict ──────────────────────────────────────────────────────────────
  const argmax = (key) => mem.reduce((a, x, i) => (x[key] > mem[a][key] ? i : a), 0);
  const worst = argmax('util'), worstRho = argmax('rho');
  const dmaxAll = Math.max(...strength.map((c) => c.dmax));
  const lam = buckling ? buckling.lambda : Infinity;
  // The characteristic span: a squat market hall 60 m across is not serviced by
  // a limit written against its 20 m height.
  const span = Math.max(b.height, 2 * b.radius * 0.75);
  const limit = span / 250;

  const checks = [
    {
      id: 'stability', label: 'Kinematic stability (frame)',
      value: pivots.nonPositive ? `${pivots.nonPositive} mechanism${pivots.nonPositive === 1 ? '' : 's'}` : 'stable',
      margin: pivots.nonPositive ? 0 : Math.min(9.99, Math.abs(softness) / 1e-9),
      pass: pivots.nonPositive === 0,
      note: pivots.nonPositive
        ? 'the frame itself folds — some part of the lattice is connected to nothing'
        : `softest mode is ${Math.abs(softness).toExponential(1)} of the mean joint stiffness`,
    },
    {
      id: 'buckling', label: 'Buckling load factor λ_cr',
      value: isFinite(lam) ? `${r2(lam)} × service gravity` : '—',
      margin: isFinite(lam) ? r2(lam / 2.5) : 9.99, pass: lam >= 2.5,
      note: 'against 2.5 — a shell wants real margin here, because its post-buckling behaviour is not gentle',
    },
    {
      id: 'member', label: 'Member compression',
      value: `${r2(mem[worst].util * 100)}% of φ·min(Pcr, Psquash)`,
      margin: r2(1 / Math.max(1e-6, mem[worst].util)), pass: mem[worst].util <= 1,
      note: `governed by a ${mem[worst].kind} rib, L/r = ${mem[worst].slender}, under ${mem[worst].gov}`,
    },
    {
      id: 'reinforcement', label: 'Tension reinforcement',
      value: `ρ = ${r2(mem[worstRho].rho * 100)}%`,
      margin: r2(0.04 / Math.max(1e-9, mem[worstRho].rho)), pass: mem[worstRho].rho <= 0.04,
      note: `${funicular.steelTonnes} t in total — the price of not being funicular`,
    },
    {
      id: 'uplift', label: 'Foot uplift (0.9D + W)',
      value: uplift > 0 ? `${r2(uplift / 1e3)} kN up` : 'none',
      margin: uplift > 0 ? r2(downMax / Math.max(1, uplift)) : 9.99, pass: uplift <= 0,
      note: uplift > 0 ? 'the wind lifts a foot — these need holding-down anchors' : 'every foot stays in compression',
    },
    {
      id: 'deflection', label: 'Peak deflection',
      value: `${r2(dmaxAll * 1000)} mm`,
      margin: r2(limit / Math.max(1e-9, dmaxAll)), pass: dmaxAll <= limit,
      note: `against span/250 = ${r2(limit * 1000)} mm. The span is the greater of the height and the` +
        ' distance across the feet — on a wide flat canopy the height is not what is spanning',
    },
  ];
  const governing = checks.reduce((a, c) => (c.margin < a.margin ? c : a), checks[0]);

  return {
    version: VERSION, hazard,
    dof: M.nf, profile: Math.round(K.size / Math.max(1, M.nf)),
    pinned, pivots, softness,
    mode: { lambda: soft.lambda, vec: soft.vec },
    buckling: buckling && { lambda: r3(buckling.lambda), converged: buckling.converged, vec: buckling.vec },
    cases: cases.map((c) => ({ id: c.combo.id, label: c.combo.label, dmax: r4(c.dmax), dnode: c.dnode, service: !!c.combo.service })),
    members: mem, funicular, ring,
    feet: { uplift: r2(uplift / 1e3), thrust: r2(thrust / 1e3), maxDown: r2(downMax / 1e3), n: ns },
    loads: {
      dead: r2(P.totals.dead / 1e3), live: r2(P.totals.live / 1e3),
      snow: r2(P.totals.snow / 1e3), wind: r2(P.totals.wind / 1e3),
      perM2: r2(P.totals.dead / Math.max(1, b.stats.surfaceArea) / 1e3),
      site: P.wind,
    },
    checks, governing, pass: checks.every((c) => c.pass),
    _M: M,
  };
}

/* ─────────────────────────── fields for the bench ───────────────────────── */

// A mode as a per-node displacement field, scaled so the largest motion is
// `amp` metres — what the bench animates when it folds or buckles.
export function modeField(b, res, which = 'mode', amp = 1) {
  const src = which === 'buckling' ? res.buckling : res.mode;
  const n = b.nodes.length, out = new Float64Array(n * 3);
  if (!src || !src.vec) return out;
  const { dof } = res._M;
  let mx = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) { const g = dof[i * 6 + c]; out[i * 3 + c] = g >= 0 ? src.vec[g] : 0; }
    const d = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
    if (d > mx) mx = d;
  }
  if (mx > 0) for (let i = 0; i < n * 3; i++) out[i] *= amp / mx;
  return out;
}

// Per-member axial force normalised to −1 … +1 for colouring: negative is
// compression (Gaudí's colour), positive is tension (the steel's).
export function forceField(b, res, which = 'service') {
  const out = new Float32Array(b.members.length);
  let mx = 1e-9;
  for (let e = 0; e < b.members.length; e++) {
    const M = res.members[e];
    const v = which === 'service' ? M.service : (Math.abs(M.comp) > M.tens ? M.comp : M.tens);
    out[e] = v;
    if (Math.abs(v) > mx) mx = Math.abs(v);
  }
  for (let e = 0; e < out.length; e++) out[e] /= mx;
  return { f: out, scale: mx };
}
