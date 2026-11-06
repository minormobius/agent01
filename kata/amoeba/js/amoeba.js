/* AMOEBA — an amoeba's mechanics on its membrane, in 3D and 4D. No DOM.

   Everything active is on the surface; the volume only constrains. The membrane is a mesh (./mesh.js) whose vertices
   move overdamped through the water, μ times the force on them per unit of their share of the membrane:

   - TENSION: the cortex under the membrane, σ per vertex. Its force is −σ ∇(membrane measure): each facet pulls its
     vertices toward shrinking it. On a sphere this is σ(d − 1)/R inward per unit area; on a tube of radius r, σ(d − 2)/r.
   - PRESSURE: whatever holds the volume. Each step P is the Lagrange multiplier that makes the volume's rate of change
     zero, and any rounding left is put back by a shift along the volume's gradient.
   - PROTRUSION: actin polymerising against the membrane pushes it out where the signalling fires, at a speed (vp, the
     polymerisation rate), not a force: a firing tip keeps advancing until the membrane's tension stalls it. (As a force
     it only found a new balance, a bulge that stopped.)
   - The MEMBRANE BUDGET: there is only so much membrane (a reserve folded in the surface, 1.6× a ball's); past it the
     tension rises everywhere, so a foot grows only by drawing the rest of the cell in.
   - The FLOOR (y = 0): the membrane can't go below it; near it, adhesion pulls it down; touching it, it is stuck
     (much more friction) where it is front or middle: adhesions form under the front and are let go behind, so the
     uropod doesn't stick (and myosin lets go too). And its weight and dorsal cortex press it
     flat (a pressure falling with height).
   - The SIGNALLING: an excitable medium on the membrane (Barkley's: an activator u that fires and spreads, a slower
     recovery v that follows it and shuts it, rising fast while u fires and fading slowly: the myosin left behind a
   pseudopod lingers for seconds, so the same patch can't fire again at once and waves can't circle back into a
   self-sustaining spiral). Where u fires, actin pushes (protrusion) and the cortex softens; where v
     has built up behind it, myosin tightens the cortex and pulls back. Noise starts patches; the more of the membrane
     is active the harder it is to start another (global inhibition: a cell makes a few pseudopods, not a hundred);
     food's smell makes firing easier where it is stronger.

   The stiff part (tension on a fine mesh) is taken implicitly per vertex, so the step can be large. The mesh is kept
   even by sliding vertices along the surface toward their neighbours' middle, carrying their signalling with them. */
import { sphereMesh, neighbours, facetNormal, FACT } from "./mesh.js";
import { remeshArrays, compact } from "./remesh.js";

export const LEVEL = { 3: 4, 4: 2 };
export const PAR = {
  // (settings found by looking: contact sheets of the cell from above over time, across sweeps of these; the README
  // has the history. Time is in seconds, length in the cell's radius)
  mu: 0.05, sigma0: 1, dt: 0.02,
  // the floor
  floorH: 1, adhBand: 0.25, adhW: 1.5, stick: 25, flatten: 1.5, release: 1, stickFrom: -0.6,
  // the signalling (Barkley: a, b, ε; diffusion on the membrane; nucleation; global inhibition; smell's bias; recovery)
  a: 0.75, b: 0.07, eps: 0.04, Du: 0.001, noise: 0.12, inhibit: 7, chem: 0.25, vUp: 1, vDown: 0.3,
  // what it does to the membrane: polymerisation speed where u fires; the cortex softer there, tighter with myosin
  protrude: 0, vp: 0.7, soften: 0.6, tighten: 0.7,
  // polarity: the cell's axis grows with firing (pUp), fades over pTau; leans firing to the front; myosin at the rear
  pUp: 1, pTau: 6, myoGain: 2, myoFrom: 0.3, polSat: 0.15, retract: 0, polBias: 0.25, patch: 2, curvBias: 0.5,
  // keeping the mesh even
  relax: 0.4, relaxIt: 2, smooth: 0, cgIt: 40, remeshEvery: 5, edgeScale: 1.4,
  // the membrane budget: reserve (× a ball's area) before it stretches, and how steeply it resists past that
  reserve: 1.6, areaK: 12,
};
export const NUC_A = 0.34, NUC_GAP = 0.06;

export function makeAmoeba(d, level = LEVEL[d], opts = {}) {
  const M = sphereMesh(d, level), { nbStart, nb } = neighbours(M), nv = M.nv, par = { ...PAR, ...opts };
  const P = M.P; // positions: start as the unit sphere, standing on the floor
  for (let i = 0; i < nv; i++) P[i * d + 1] += par.floorH;
  const A = {
    d, M, P, nv, nf: M.nf, nbStart, nb, par, t: 0, seed: 12345,
    sig: new Float64Array(nv).fill(par.sigma0), u: new Float64Array(nv), v: new Float64Array(nv), myo: new Float64Array(nv),
    F: new Float64Array(nv * d), g: new Float64Array(nv * d), area: new Float64Array(nv), K: new Float64Array(nv),
    stuck: new Float64Array(nv), push: new Float64Array(nv), vk: new Float64Array(nv), chem: new Float64Array(nv), lapU: new Float64Array(nv),
    fA: new Float64Array(M.nf), fN: new Float64Array(M.nf * d), P0: 0, V: 0, Area: 0, Pr: 0,
    floor: true, nuc: { c: new Float64Array(d), a: NUC_A }, foods: [], eaten: 0,
  };
  A.nuc.c[1] = par.floorH;
  // each vertex's facets (CSR), for keeping the mesh even
  { const cnt = new Int32Array(nv + 1); for (let k = 0; k < M.nf * d; k++) cnt[M.F[k] + 1]++; for (let i = 0; i < nv; i++) cnt[i + 1] += cnt[i];
    const vf = new Int32Array(M.nf * d), at = cnt.slice(0, nv); for (let k = 0; k < M.nf; k++) for (let j = 0; j < d; j++) vf[at[M.F[k * d + j]]++] = k; A.vfStart = cnt; A.vf = vf; }
  geometry(A); A.V0 = A.V; A.A0 = A.Area;
  // the target edge length for remeshing: the starting mesh's mean
  { let s = 0, n = 0; for (let i = 0; i < nv; i++) for (let j = nbStart[i]; j < nbStart[i + 1]; j++) { const k = nb[j]; if (k < i) continue; let q = 0; for (let c = 0; c < d; c++) q += (P[k * d + c] - P[i * d + c]) ** 2; s += Math.sqrt(q); n++; } A.L = (s / n) * (par.edgeScale || 1); }
  return A;
}

function rand(A) { let t = (A.seed = (A.seed + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

/* the facets' measures and normals; each vertex's share of the membrane (area) and the volume's gradient there (g);
   the volume and the membrane's total */
export function geometry(A) {
  const { d, M, P, nv, nf, area, g, fA, fN } = A, F = M.F, n = new Float64Array(d), fact = FACT[d];
  area.fill(0); g.fill(0); let V = 0, Ar = 0;
  const f = A.fbuf || (A.fbuf = new Int32Array(d));
  for (let k = 0; k < nf; k++) {
    for (let j = 0; j < d; j++) f[j] = F[k * d + j];
    facetNormal(d, P, f, n);
    let nn = 0; for (let c = 0; c < d; c++) nn += n[c] * n[c];
    const m = Math.sqrt(nn) / fact; fA[k] = m; Ar += m;
    let s = 0; for (let c = 0; c < d; c++) { fN[k * d + c] = n[c]; s += n[c] * P[f[0] * d + c]; } V += s;
    for (let j = 0; j < d; j++) { const i = f[j]; area[i] += m / d; for (let c = 0; c < d; c++) g[i * d + c] += n[c] / (fact * d); }
  }
  A.V = V / (fact * d); A.Area = Ar;
}

/* the tension's force: for each facet, each vertex is pulled toward the facet's opposite face, by σ × (that face's
   measure)/(d − 1): the gradient of the facet's measure, −σ ∇A. Its stiffness (σ A/h², per vertex) is kept for the
   implicit step */
function tension(A) {
  const { d, M, P, nf, sig, F, K, fA } = A, Fc = M.F, m = new Float64Array(d), q = [new Float64Array(d), new Float64Array(d), new Float64Array(d)];
  K.fill(0);
  for (let k = 0; k < nf; k++) {
    const f = A.fbuf2 || (A.fbuf2 = new Int32Array(d)); for (let j = 0; j < d; j++) f[j] = Fc[k * d + j]; let s = 0; for (let j = 0; j < d; j++) s += sig[f[j]]; s /= d;
    const Af = fA[k]; if (Af < 1e-14) continue;
    for (let j = 0; j < d; j++) {
      const i = f[j];
      // the opposite face's points; m = x_i minus its projection onto their affine hull
      let o = 0; for (let jj = 0; jj < d; jj++) if (jj !== j) { const b = f[jj] * d; for (let c = 0; c < d; c++) q[o][c] = P[b + c]; o++; }
      if (d === 3) {
        let ee = 0, ex = 0; for (let c = 0; c < 3; c++) { const e = q[1][c] - q[0][c]; ee += e * e; ex += e * (P[i * 3 + c] - q[0][c]); }
        const t = ex / ee; for (let c = 0; c < 3; c++) m[c] = P[i * 3 + c] - q[0][c] - t * (q[1][c] - q[0][c]);
      } else {
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        for (let c = 0; c < 4; c++) { const e1 = q[1][c] - q[0][c], e2 = q[2][c] - q[0][c], x = P[i * 4 + c] - q[0][c]; a11 += e1 * e1; a12 += e1 * e2; a22 += e2 * e2; b1 += e1 * x; b2 += e2 * x; }
        const det = a11 * a22 - a12 * a12, t1 = (b1 * a22 - b2 * a12) / det, t2 = (a11 * b2 - a12 * b1) / det;
        for (let c = 0; c < 4; c++) m[c] = P[i * 4 + c] - q[0][c] - t1 * (q[1][c] - q[0][c]) - t2 * (q[2][c] - q[0][c]);
      }
      let h2 = 0; for (let c = 0; c < d; c++) h2 += m[c] * m[c];
      const w = (s * Af) / h2; for (let c = 0; c < d; c++) F[i * d + c] -= w * m[c];
      K[i] += w;
    }
  }
}

/* the membrane's Laplacian of a field (a plain neighbour average against the vertex, scaled by the local spacing):
   enough for diffusing the signalling */
function lap(A, f, out) {
  const { d, P, nv, nbStart, nb } = A;
  for (let i = 0; i < nv; i++) { let s = 0, h = 0; const n0 = nbStart[i], n1 = nbStart[i + 1];
    for (let j = n0; j < n1; j++) { const k = nb[j]; s += f[k] - f[i]; let q = 0; for (let c = 0; c < d; c++) q += (P[k * d + c] - P[i * d + c]) ** 2; h += q; }
    const cnt = n1 - n0; out[i] = (2 * (d - 1) * s) / h; void cnt; }
}

/* diffusion over the membrane, implicitly (Jacobi sweeps on (1 + dt D L_ii) f' = f + dt D Σ L_ij f'_j): stable for any
   step, so a field can spread far and fast */
function diffuse(A, f, D, dt, sweeps = 4) {
  const { d, P, nv, nbStart, nb } = A, f0 = A.f0 || (A.f0 = new Float64Array(nv)), f1 = A.f1 || (A.f1 = new Float64Array(nv)), wsum = A.wsum || (A.wsum = new Float64Array(nv));
  for (let i = 0; i < nv; i++) { let h = 0; for (let j = nbStart[i]; j < nbStart[i + 1]; j++) { const k = nb[j]; let q = 0; for (let c = 0; c < d; c++) q += (P[k * d + c] - P[i * d + c]) ** 2; h += q; } wsum[i] = (2 * (d - 1) * D * dt) / h; }
  f0.set(f);
  for (let s = 0; s < sweeps; s++) { for (let i = 0; i < nv; i++) { let m = 0; const n0 = nbStart[i], n1 = nbStart[i + 1]; for (let j = n0; j < n1; j++) m += f[nb[j]]; f1[i] = (f0[i] + wsum[i] * m) / (1 + wsum[i] * (n1 - n0)); } f.set(f1); }
}

/* the signalling, one step: Barkley's medium with nucleation, global inhibition, the cell's polarity and smell. Then
   what it does: σ and the protrusive push per vertex.

   POLARITY is the cell's own front–rear axis, one direction for the whole cell (a cell's cytoskeleton and cortical flow
   make one axis, not a field of opinions): it grows along where the membrane has been firing, relative to the cell's
   middle, and fades over pTau. The front (along it) fires more readily and is where new pseudopods start; myosin
   gathers at the far end (the uropod), tightening the cortex there and letting go of the floor. A patch can't fire
   again until it has recovered (v), so new pseudopods bud beside the last ones, at the front. */
function signalling(A, dt) {
  const { d, P, nv, u, v, sig, push, area, par, chem } = A;
  let act = 0, tot = 0, cm = 0; for (let i = 0; i < nv; i++) { act += area[i] * u[i]; tot += area[i]; cm += area[i] * chem[i]; } act /= tot; cm /= tot;
  // the cell's middle, how far it reaches, and where along its axis each point lies (−1 rear … 1 front)
  const C = A.Cmid || (A.Cmid = new Float64Array(d)); C.fill(0); for (let i = 0; i < nv; i++) for (let k = 0; k < d; k++) C[k] += (area[i] * P[i * d + k]) / tot;
  const pv = A.pv || (A.pv = new Float64Array(d)), pl = Math.hypot(...pv), ph = pv.map((x) => x / (pl || 1)), str = Math.tanh(pl / par.polSat);
  // (in units of the cell's own radius, measured from its middle: scaling by its extent let a long tail call its own
  // base "middle", which then stuck and grew the tail further)
  const front = A.front || (A.front = new Float64Array(nv)), Req = (A.V0 / (d === 3 ? (4 / 3) * Math.PI : Math.PI ** 2 / 2)) ** (1 / d);
  for (let i = 0; i < nv; i++) { let s = 0; for (let k = 0; k < d; k++) if (k !== 1) s += (P[i * d + k] - C[k]) * ph[k]; front[i] = Math.max(-2, Math.min(2, s / Req)); }
  // (curvature: actin's machinery gathers where the membrane bends out sharply, so a pseudopod's tip keeps firing as it
  // goes, and a foot grows long instead of stopping as a bump)
  const H = A.H; let Hm = 0; if (H) { for (let i = 0; i < nv; i++) Hm += area[i] * H[i]; Hm /= tot; }
  const curv = (j) => (H && Hm > 0 ? par.curvBias * Math.max(-1, Math.tanh((H[j] - Hm) / Hm)) : 0);
  const bG = par.b + par.inhibit * act, lean = (j) => (cm > 0 ? par.chem * Math.tanh((chem[j] - cm) / cm) : 0) + par.polBias * str * Math.tanh(front[j]) + curv(j);
  for (let i = 0; i < nv; i++) {
    const thr = (v[i] + bG - lean(i)) / par.a;
    const du = (u[i] * (1 - u[i]) * (u[i] - thr)) / par.eps;
    u[i] = Math.min(1, Math.max(0, u[i] + dt * du));
    v[i] += dt * (par.vUp * u[i] * (1 - v[i]) - par.vDown * v[i]);
  }
  // (its spread over the membrane, implicitly: where the mesh bunches up, at a contracting rear, an explicit step on
  // its short edges went unstable and made firing out of nothing)
  diffuse(A, u, par.Du, dt);
  // nucleation: now and then a small patch fires (a burst of actin signalling), at a rate per unit of membrane, at the
  // best of a dozen random spots that have recovered, scored by smell and by lying at the front
  const events = par.noise * A.Area * dt; let ne = Math.floor(events) + (rand(A) < events % 1 ? 1 : 0);
  while (ne-- > 0) {
    const score = (j) => (v[j] > 0.15 ? -9 : lean(j) + 0.05 * rand(A));
    let i = Math.floor(rand(A) * nv), si = score(i);
    for (let tries = 0; tries < 11; tries++) { const j = Math.floor(rand(A) * nv), sj = score(j); if (sj > si) { i = j; si = sj; } }
    if (v[i] > 0.15) continue;
    const ring = new Set([i]); let edge = [i];
    for (let r = 0; r < par.patch; r++) { const nx = []; for (const a of edge) for (let j = A.nbStart[a]; j < A.nbStart[a + 1]; j++) { const k = A.nb[j]; if (!ring.has(k)) { ring.add(k); nx.push(k); } } edge = nx; }
    for (const k of ring) if (v[k] < 0.15) u[k] = Math.max(u[k], 0.8);
  }
  // the axis follows where it has been firing (relative to the middle, along the floor), and fades
  const fd = new Float64Array(d); let fw = 0;
  for (let i = 0; i < nv; i++) { if (u[i] < 0.3) continue; const w = area[i] * u[i]; for (let k = 0; k < d; k++) if (k !== 1) fd[k] += w * (P[i * d + k] - C[k]); fw += w; }
  const fl = Math.hypot(...fd); if (fl > 0) for (let k = 0; k < d; k++) pv[k] += (dt * par.pUp * (fw / tot) * fd[k]) / fl;
  for (let k = 0; k < d; k++) pv[k] -= (dt * pv[k]) / par.pTau;
  // myosin at the rear, as strong as the cell is polarised; what the cortex then does
  const myo = A.myo;
  for (let i = 0; i < nv; i++) myo[i] = str * Math.max(0, Math.min(1, par.myoGain * (-front[i] - par.myoFrom)));
  // the membrane budget (as PROTEUS's): a cell has only so much membrane, with a reserve folded in its surface. Past
  // the reserve, stretching it raises the tension everywhere, steeply, so a foot can only grow by drawing the rest in
  const over = Math.max(0, A.Area / (A.A0 * par.reserve) - 1), extra = par.areaK * over; A.over = over;
  for (let i = 0; i < nv; i++) { sig[i] = par.sigma0 * (1 - par.soften * u[i] + par.tighten * myo[i] + extra); push[i] = par.protrude * u[i]; }
}

/* one step */
export function step(A, dt = A.par.dt) {
  const { d, P, nv, F, g, area, par, stuck, nbStart, nb, sig } = A;
  if (A.foods.length) smellAll(A);
  signalling(A, dt);
  geometry(A);
  // the membrane's Laplacian at each vertex, Δx ≈ L_i Σ_j (x_j − x_i): σ Δx is the tension's pull per unit area
  // (its normal part is σ H); the mean curvature H the signalling reads comes from it too
  const Lc = A.Lc || (A.Lc = new Float64Array(nv)), H = A.H || (A.H = new Float64Array(nv)), nh = A.nh || (A.nh = new Float64Array(nv * d));
  for (let i = 0; i < nv; i++) {
    let h2 = 0, gl = 0; const n0 = nbStart[i], n1 = nbStart[i + 1];
    for (let c = 0; c < d; c++) gl += g[i * d + c] ** 2; gl = Math.sqrt(gl) || 1; for (let c = 0; c < d; c++) nh[i * d + c] = g[i * d + c] / gl;
    let ln = 0; for (let j = n0; j < n1; j++) { const k = nb[j]; let q = 0, qn = 0; for (let c = 0; c < d; c++) { const e = P[k * d + c] - P[i * d + c]; q += e * e; qn += e * nh[i * d + c]; } h2 += q; ln += qn; }
    Lc[i] = (2 * (d - 1)) / h2; H[i] = -Lc[i] * ln;
  }
  // the other pushes, per unit area, along the normal: the flattening pressure, adhesion down, the uropod's retraction;
  // and how stuck each vertex is
  F.fill(0);
  for (let i = 0; i < nv; i++) {
    const y = P[i * d + 1]; let fx = A.floor ? -par.flatten * y : 0;
    let fv = 0; // a vector part, projected below
    const tmp = A.tmpv || (A.tmpv = new Float64Array(d)); tmp.fill(0);
    if (A.myo[i] > 0 && A.Cmid) { let q = 0; for (let c = 0; c < d; c++) q += (P[i * d + c] - A.Cmid[c]) ** 2; q = Math.sqrt(q) || 1; for (let c = 0; c < d; c++) tmp[c] -= (par.retract * A.myo[i] * (P[i * d + c] - A.Cmid[c])) / q; }
    stuck[i] = 0;
    if (A.floor && y < par.adhBand) { tmp[1] -= par.adhW * (1 - y / par.adhBand); if (y < 0.03) { const fr = A.front ? A.front[i] : 0; stuck[i] = Math.max(0, Math.min(1, (fr - par.stickFrom) / 0.5)) * Math.max(0, 1 - par.release * A.myo[i]) * (1 - A.u[i]); } }
    for (let c = 0; c < d; c++) fv += tmp[c] * nh[i * d + c];
    // (the membrane is a fluid: forces along it only make it flow, so only their normal part moves the surface)
    for (let c = 0; c < d; c++) F[i * d + c] = (fx + fv) * nh[i * d + c];
  }
  // the move, implicit in the tension: (1 − dt m σ Δ) x' = x + dt (m f + v_p u n̂) + P dt m n̂, solved by Jacobi sweeps
  // twice: once for everything but the pressure (xa), once for a unit pressure (xb, linear in it). Then P is whatever
  // keeps the volume: x' = xa + P xb. Implicit, the tension can be stiff (a fine mesh) without slowing the rest
  const xa = A.xa || (A.xa = new Float64Array(nv * d)), xb = A.xb || (A.xb = new Float64Array(nv * d)), ra = A.ra || (A.ra = new Float64Array(nv * d)), rb = A.rb || (A.rb = new Float64Array(nv * d)), cc = A.cc || (A.cc = new Float64Array(nv));
  for (let i = 0; i < nv; i++) {
    const m = par.mu / (1 + par.stick * stuck[i]), vk = par.vp * A.u[i]; A.vk[i] = vk;
    cc[i] = dt * m * sig[i] * Lc[i];
    for (let c = 0; c < d; c++) { ra[i * d + c] = P[i * d + c] + dt * (m * F[i * d + c] + vk * nh[i * d + c]); rb[i * d + c] = dt * m * nh[i * d + c]; }
  }
  // (each row divided by its c_i, the system is symmetric and positive definite: (1/c_i + k_i) x_i − Σ_j x_j = r_i / c_i,
  // a graph Laplacian plus a diagonal, so conjugate gradients solves it in a few dozen products)
  for (let i = 0; i < nv; i++) for (let c = 0; c < d; c++) { ra[i * d + c] /= cc[i]; rb[i * d + c] /= cc[i]; }
  cg(A, cc, ra, xa, P); cg(A, cc, rb, xb, null);
  // the pressure: the volume's change, linearised, Σ g·(xa + P xb − x) = V0 − V
  let ga = 0, gb = 0; for (let i = 0; i < nv * d; i++) { ga += g[i] * (xa[i] - P[i]); gb += g[i] * xb[i]; }
  A.Pr = (A.V0 - A.V - ga) / gb;
  for (let i = 0; i < nv * d; i++) P[i] = xa[i] + A.Pr * xb[i];
  constrain(A);
  relaxMesh(A);
  constrain(A);
  // the volume, exactly: a shift along its gradient (a rounding's worth)
  for (let it = 0; it < 2; it++) { geometry(A); let gg = 0; for (let i = 0; i < nv * d; i++) gg += g[i] * g[i]; const lam = (A.V0 - A.V) / gg; for (let i = 0; i < nv * d; i++) P[i] += lam * g[i]; }
  constrain(A);
  moveNucleus(A, dt);
  if (A.foods.length) eat(A);
  A.t += dt; A.nstep = (A.nstep || 0) + 1;
  if (A.d === 3 && par.remeshEvery && A.nstep % par.remeshEvery === 0) A.lastRemesh = remesh(A);
}

/* conjugate gradients for (1/c_i + k_i) x_i − Σ_{j ~ i} x_j = r_i, every coordinate at once (the same matrix for each) */
function cg(A, cc, r, x, x0) {
  const { d, nv, nbStart, nb, par } = A, n = nv * d, R = A.cgR || (A.cgR = new Float64Array(n)), Pd = A.cgP || (A.cgP = new Float64Array(n)), Ap = A.cgA || (A.cgA = new Float64Array(n));
  const mul = (v, out) => { for (let i = 0; i < nv; i++) { const n0 = nbStart[i], n1 = nbStart[i + 1], dg = 1 / cc[i] + (n1 - n0); for (let c = 0; c < d; c++) { let m = 0; for (let j = n0; j < n1; j++) m += v[nb[j] * d + c]; out[i * d + c] = dg * v[i * d + c] - m; } } };
  if (x0) x.set(x0); else x.fill(0);
  mul(x, Ap); let rr = 0, r0 = 0; for (let i = 0; i < n; i++) { R[i] = r[i] - Ap[i]; Pd[i] = R[i]; rr += R[i] * R[i]; r0 += r[i] * r[i]; }
  for (let it = 0; it < par.cgIt && rr > 1e-20 * r0; it++) {
    mul(Pd, Ap); let pAp = 0; for (let i = 0; i < n; i++) pAp += Pd[i] * Ap[i]; const a = rr / pAp;
    let rn = 0; for (let i = 0; i < n; i++) { x[i] += a * Pd[i]; R[i] -= a * Ap[i]; rn += R[i] * R[i]; }
    const b = rn / rr; rr = rn; for (let i = 0; i < n; i++) Pd[i] = R[i] + b * Pd[i];
  }
}

/* rebuild everything sized by the mesh after a remesh: the adjacency, the per-vertex and per-facet arrays (the
   signalling's u and v carried over), and drop every scratch buffer so it is made again at the new size */
const SCRATCH = ["H", "Lc", "Q", "cc", "cgA", "cgP", "cgR", "du", "dv", "f0", "f1", "front", "nh", "ra", "rb", "wsum", "xa", "xb", "ysw", "mob", "cv"];
export function remesh(A) {
  if (A.d !== 3) return null;
  const { d, nv, P, M } = A, Pa = [], Fa = [];
  for (let i = 0; i < nv; i++) Pa.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  for (let k = 0; k < M.nf; k++) Fa.push([M.F[k * 3], M.F[k * 3 + 1], M.F[k * 3 + 2]]);
  const fu = [...A.u], fv = [...A.v], stats = remeshArrays(Pa, Fa, [fu, fv], A.L);
  const c = compact(Pa, Fa, [fu, fv]);
  A.M = { d, nv: c.nv, nf: c.nf, P: c.P, F: c.F }; A.P = c.P; A.nv = c.nv; A.nf = c.nf; A.meshVersion = (A.meshVersion || 0) + 1;
  const nbr = neighbours(A.M); A.nbStart = nbr.nbStart; A.nb = nbr.nb;
  { const cnt = new Int32Array(c.nv + 1); for (let k = 0; k < c.nf * d; k++) cnt[c.F[k] + 1]++; for (let i = 0; i < c.nv; i++) cnt[i + 1] += cnt[i];
    const vf = new Int32Array(c.nf * d), at = cnt.slice(0, c.nv); for (let k = 0; k < c.nf; k++) for (let j = 0; j < d; j++) vf[at[c.F[k * d + j]]++] = k; A.vfStart = cnt; A.vf = vf; }
  const n = c.nv; A.u = c.fields[0]; A.v = c.fields[1];
  for (const k of ["sig", "myo", "area", "K", "stuck", "push", "chem", "lapU", "vk"]) A[k] = new Float64Array(n);
  A.sig.fill(A.par.sigma0); A.F = new Float64Array(n * d); A.g = new Float64Array(n * d); A.fA = new Float64Array(c.nf); A.fN = new Float64Array(c.nf * d);
  for (const k of SCRATCH) A[k] = undefined;
  geometry(A);
  return stats;
}

/* the floor and the nucleus: the membrane can't pass either */
function constrain(A) {
  const { d, P, nv } = A, c = A.nuc.c, r = A.nuc.a + NUC_GAP;
  for (let i = 0; i < nv; i++) {
    if (A.floor && P[i * d + 1] < 0) P[i * d + 1] = 0;
    let q = 0; for (let k = 0; k < d; k++) q += (P[i * d + k] - c[k]) ** 2;
    if (q < r * r) { const s = r / Math.sqrt(q || 1e-12); for (let k = 0; k < d; k++) P[i * d + k] = c[k] + (P[i * d + k] - c[k]) * s; }
  }
}
/* keep the mesh even: each vertex slides along the surface (its normal part removed) toward its neighbours' middle,
   and its signalling goes with it (blended as it moves) */
function relaxMesh(A) {
  const { d, P, nv, nbStart, nb, g, par, u, v } = A, Q = A.Q || (A.Q = new Float64Array(nv * d)), du = A.du || (A.du = new Float64Array(nv)), dv = A.dv || (A.dv = new Float64Array(nv));
  // (springs along every edge, all with one rest length, the mean edge, acting along the surface only: they spread the
  // points evenly and won't let facets thin to slivers, which is what a full remesher would do, and the shape is left
  // alone. A vertex carries its signalling with it, blended toward its neighbours as it moves)
  let Lm = 0, ne = 0; for (let i = 0; i < nv; i++) for (let j = nbStart[i]; j < nbStart[i + 1]; j++) { const k = nb[j]; if (k < i) continue; let q = 0; for (let c = 0; c < d; c++) q += (P[k * d + c] - P[i * d + c]) ** 2; Lm += Math.sqrt(q); ne++; }
  Lm /= ne;
  const dl = A.dl || (A.dl = new Float64Array(d));
  for (let it = 0; it < par.relaxIt; it++) {
    for (let i = 0; i < nv; i++) {
      const n0 = nbStart[i], n1 = nbStart[i + 1], k = n1 - n0; let gl = 0; for (let c = 0; c < d; c++) gl += g[i * d + c] ** 2; gl = Math.sqrt(gl) || 1;
      dl.fill(0);
      for (let j = n0; j < n1; j++) { const b = nb[j]; let q = 0; for (let c = 0; c < d; c++) q += (P[b * d + c] - P[i * d + c]) ** 2; q = Math.sqrt(q) || 1e-9; const f = (q - Lm) / q; for (let c = 0; c < d; c++) dl[c] += (f * (P[b * d + c] - P[i * d + c])) / k; }
      let dn = 0; for (let c = 0; c < d; c++) dn += (dl[c] * g[i * d + c]) / gl;
      for (let c = 0; c < d; c++) Q[i * d + c] = P[i * d + c] + par.relax * (dl[c] - (dn * g[i * d + c]) / gl);
    }
    P.set(Q);
  }
  for (let i = 0; i < nv; i++) { const n0 = nbStart[i], n1 = nbStart[i + 1], k = n1 - n0; let su = 0, sv = 0; for (let j = n0; j < n1; j++) { su += u[nb[j]] / k; sv += v[nb[j]] / k; } du[i] = u[i] + par.relax * 0.15 * (su - u[i]); dv[i] = v[i] + par.relax * 0.15 * (sv - v[i]); }
  u.set(du); v.set(dv);
  // and iron out crumples: Taubin's λ|μ smoothing (a step toward the neighbours' middle, then a slightly larger step
  // back): it damps the mesh's finest wrinkles and leaves its shape, pseudopods and all, alone
  for (const k of [par.smooth, -par.smooth * 1.06]) {
    for (let i = 0; i < nv; i++) { const n0 = nbStart[i], n1 = nbStart[i + 1], c = n1 - n0;
      for (let a = 0; a < d; a++) { let m = 0; for (let j = n0; j < n1; j++) m += P[nb[j] * d + a]; Q[i * d + a] = P[i * d + a] + k * (m / c - P[i * d + a]); } }
    P.set(Q);
  }
}

/* the nucleus: held toward the cell's middle, kept off the floor */
function moveNucleus(A, dt) {
  const { d, P, nv, area } = A, c = A.nuc.c, m = new Float64Array(d); let w = 0;
  for (let i = 0; i < nv; i++) { for (let k = 0; k < d; k++) m[k] += area[i] * P[i * d + k]; w += area[i]; }
  for (let k = 0; k < d; k++) c[k] += dt * 3 * (m[k] / w - c[k]);
  if (A.floor) c[1] = Math.max(c[1], A.nuc.a + NUC_GAP + 0.03);
}

/* the cell's centre (of its membrane) and how far it reaches from it: its outline's spread */
export function centre(A) { const { d, P, nv, area } = A, m = new Float64Array(d); let w = 0; for (let i = 0; i < nv; i++) { for (let k = 0; k < d; k++) m[k] += area[i] * P[i * d + k]; w += area[i]; } return m.map((x) => x / w); }

/* ---------------------------------------------------------------- food (as CELL's: c ∝ 1/r^{d−2}, summed) */
export const SMELL_S = 0.3;
export const FOOD = { 3: { count: 4, near: 3, far: 9 }, 4: { count: 10, near: 1.5, far: 4.5 } };
function smellAll(A) { const { d, P, nv, chem, foods } = A; for (let i = 0; i < nv; i++) { let c = 0; for (const F of foods) { let q = SMELL_S ** 2; for (let k = 0; k < d; k++) q += (P[i * d + k] - F[k]) ** 2; c += 1 / q ** ((d - 2) / 2); } chem[i] = c; } }
export function spawnFood(A, dist = null) {
  const d = A.d, h = new Float64Array(d), C = centre(A); for (let k = 0; k < d; k++) if (k !== 1) h[k] = Math.sqrt(-2 * Math.log(rand(A) + 1e-12)) * Math.cos(2 * Math.PI * rand(A)); const m = Math.hypot(...h);
  if (dist === null) { const { near, far } = FOOD[d], k = d - 1; dist = (near ** k + rand(A) * (far ** k - near ** k)) ** (1 / k); }
  const F = new Float64Array(d); for (let k = 0; k < d; k++) F[k] = k === 1 ? 0.12 : C[k] + (dist * h[k]) / m; A.foods.push(F);
}
/* inside the membrane? A ray straight up from the point crosses the membrane an odd number of times if so. Each
   facet's hyperplane meets the ray at one height; the crossing counts if that point lies inside the facet (its
   barycentric weights, found in the facet's own span, all ≥ 0). The same in 3D (triangles) and 4D (tetrahedra) */
export function inside(A, X0) {
  // (nudged off the axes by a hair, so the ray never runs exactly along a mesh edge)
  const X = Float64Array.from(X0); X[0] += 1.234e-5; if (A.d > 2) X[2] += 2.718e-5; if (A.d > 3) X[3] += 3.141e-5;
  const { d, P, nf, M, fN } = A, F = M.F, m = d - 1, e = [], b = new Float64Array(m), G = Array.from({ length: m }, () => new Float64Array(m)); let cnt = 0;
  for (let k = 0; k < nf; k++) {
    const ny = fN[k * d + 1]; if (Math.abs(ny) < 1e-14) continue;
    const i0 = F[k * d]; let lo = Infinity, hi = -Infinity, skip = false;
    // (quick reject: the facet's extent across the floor must cover X's)
    for (let a = 0; a < d && !skip; a++) { if (a === 1) continue; lo = Infinity; hi = -Infinity; for (let j = 0; j < d; j++) { const x = P[F[k * d + j] * d + a]; if (x < lo) lo = x; if (x > hi) hi = x; } if (X[a] < lo || X[a] > hi) skip = true; }
    if (skip) continue;
    let s = 0; for (let a = 0; a < d; a++) s += fN[k * d + a] * (P[i0 * d + a] - X[a]); const t = s / ny; if (t <= 0) continue;
    // the crossing point Q = X + t ŷ, in the facet's span: Q − x0 = Σ λ_j (x_j − x0)
    e.length = 0; for (let j = 1; j < d; j++) { const v = new Float64Array(d), ij = F[k * d + j]; for (let a = 0; a < d; a++) v[a] = P[ij * d + a] - P[i0 * d + a]; e.push(v); }
    for (let r = 0; r < m; r++) { let q = 0; for (let a = 0; a < d; a++) q += e[r][a] * ((a === 1 ? X[a] + t : X[a]) - P[i0 * d + a]); b[r] = q; for (let c = 0; c < m; c++) { let g = 0; for (let a = 0; a < d; a++) g += e[r][a] * e[c][a]; G[r][c] = g; } }
    const lam = solve(G, b); let sum = 0, ok = true; for (const l of lam) { if (l < -1e-9) ok = false; sum += l; }
    if (ok && sum <= 1 + 1e-9) cnt++;
  }
  return cnt % 2 === 1;
}
function solve(M, b) { const n = b.length, A = M.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; const v = A[c][c] || 1e-30; for (let j = c; j <= n; j++) A[c][j] /= v; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j]; } } return A.map((r) => r[n]); }
/* eaten: a morsel the membrane has closed round (checked every tenth of a second) */
function eat(A) {
  if (Math.round(A.t / A.par.dt) % 5) return;
  A.foods = A.foods.filter((F) => {
    if (inside(A, F)) { A.eaten++; A.V0 = Math.min(A.V0 * 1.05, (A.V00 || A.V0) * 1.6); return false; }
    return true;
  });
  if (A.keepFood) while (A.foods.length < A.keepFood) spawnFood(A);
}
