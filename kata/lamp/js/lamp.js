/* LAVALAMP, no DOM: wax and liquid in a lamp, heated from below, in 3D and in 4D, by the same code.

   THE LIQUIDS are PHASELAB's immiscible pair (Cahn–Hilliard: φ = +1 wax, −1 the liquid round it; μ = φ³ − φ − ε²∇²φ),
   now carried by a flow: ∂φ/∂t + u·∇φ = ∇²μ.
   THE FLOW is creeping (Stokes: a lava lamp is slow and syrupy, so inertia is dropped), solved exactly each step:
       0 = −∇p + η∇²u + f,  ∇·u = 0   →   û = (I − k̂k̂ᵀ) f̂ / (η k²)
   driven by buoyancy (along y, up) and by the interface's own tension, f = μ∇φ (Cahn–Hilliard's capillary force:
   Laplace's pressure, which rounds blobs and pinches necks).
   THE HEAT: ∂T/∂t + u·∇T = κ∇²T, plus the lamp: a heater in the bottom layers (T pulled toward 1) and a cool top
   (pulled toward 0). Explicit, upwind, in real space.
   THE DENSITIES: cold wax is a little denser than the liquid, and wax expands more when hot:
       ρ' = ½(1 + φ)(δ − α_w T) − ½(1 − φ) α_l T,   buoyancy  b = −g ρ' (up).
   So wax at the bottom warms, gets lighter than the liquid, rises; at the top it cools, gets heavier, sinks.

   THE BOX is periodic across (the lamp's sides wrap round: x, z and in 4D w) with a floor and a ceiling. The walls are
   mirrors (free slip, no heat or mass through them): the solver works on the box and its mirror image stacked, a
   periodic box twice as tall, where φ, T and the flow across are even about the walls and the flow along y is odd, and
   gravity points the other way in the mirror half. Spectral throughout (WAVELAB's 1D FFT, batched across axes of any
   lengths). */
import { makeFFT } from "../../wavelab/js/fft.js";

/* the FFT of a grid with dims[a] points along axis a (powers of two, any mix), index x0 + n0(x1 + n1(x2 + …)). Axis 0
   line by line; every other axis batched, each butterfly over all its lines at once, a tile at a time */
export function makeFFTn(dims) {
  const D = dims.length, M = dims.reduce((a, b) => a * b, 1), plans = {};
  const plan = (n) => {
    if (plans[n]) return plans[n];
    const L = Math.log2(n), rev = new Uint32Array(n), cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < L; b++) r |= ((i >> b) & 1) << (L - 1 - b); rev[i] = r; }
    for (let k = 0; k < n / 2; k++) { cs[k] = Math.cos((2 * Math.PI * k) / n); sn[k] = Math.sin((2 * Math.PI * k) / n); }
    return (plans[n] = { n, rev, cs, sn, f1: makeFFT(n) });
  };
  const ps = dims.map(plan), strides = dims.map((_, a) => dims.slice(0, a).reduce((x, y) => x * y, 1));
  return function (re, im, inverse = false) {
    const n0 = dims[0]; for (let l = 0; l < M; l += n0) ps[0].f1(re, im, inverse, l, 1);
    const sg = inverse ? 1 : -1;
    for (let a = 1; a < D; a++) {
      const { n, rev, cs, sn } = ps[a], st = strides[a], blk = st * n, C = Math.min(st, 64);
      for (let base = 0; base < M; base += blk) for (let l0 = 0; l0 < st; l0 += C) {
        const l1 = l0 + C;
        for (let i = 0; i < n; i++) { const j = rev[i]; if (j <= i) continue; const x = base + i * st, y = base + j * st; for (let lo = l0; lo < l1; lo++) { let t = re[x + lo]; re[x + lo] = re[y + lo]; re[y + lo] = t; t = im[x + lo]; im[x + lo] = im[y + lo]; im[y + lo] = t; } }
        for (let size = 2; size <= n; size <<= 1) {
          const half = size >> 1, step = n / size;
          for (let j = 0; j < half; j++) {
            const c = cs[j * step], s = sg * sn[j * step];
            for (let i = 0; i < n; i += size) {
              const x = base + (i + j) * st, y = x + half * st;
              for (let lo = l0; lo < l1; lo++) { const br = re[y + lo], bi = im[y + lo], tr = br * c - bi * s, ti = br * s + bi * c; re[y + lo] = re[x + lo] - tr; im[y + lo] = im[x + lo] - ti; re[x + lo] += tr; im[x + lo] += ti; }
            }
          }
        }
      }
    }
  };
}

/* the lamp's physics, in grid units (cell = 1). Gravity is strong enough that a hot pool can let go at all: surface
   tension holds a flat interface against every ripple shorter than 2π √(σ / Δb) (Rayleigh–Taylor's capillary cut-off),
   and a lamp 16 cells across needs that to be well under 16. Hot wax (T ≈ 0.9) is lighter than the liquid by
   Δb ≈ 0.4, the cut-off ~10 cells. Cold wax is heavier by δ g = 0.75 */
export const PHYS = { glass: false, wall: 40, Aglass: 21, pool: 6, waxShare: 0.15, coolGlass: 0.06, ambient: 0.3, wallCool: 0.02, eps: 1, A: 2, eta: 1, g: 3, delta: 0.25, aw: 0.5, al: 0.1, kappa: 0.08, heat: 0.4, cool: 0.15, band: 3, cfl: 0.4, dtMax: 0.5 };

/* THE GLASS: the classic lamp's profile, its radius in cells at height y (0 the floor, 32 the top): 5 at the bottom,
   swelling to 6.8 a little above, then a long straight taper to 3.2 at the top. Turned round the vertical axis: in 3D a
   surface of revolution with discs across; in 4D a hypersurface of revolution with 3-balls across, so a slice of it at
   w from the axis shows radius √(R² − w²). The metal base below and the cap above are drawn, not simulated */
export function glassR(y) { return y < 9 ? 5 + 1.8 * (1 - ((9 - y) / 9) ** 2) : 6.8 - (3.6 * (y - 9)) / 23; }

/* a lamp: D = 3 or 4, nh cells across, ny tall. The arrays are the doubled box: dims [nh, 2ny, nh(, nh)], y axis 1 */
export function makeLamp(D, nh = 16, ny = 32, phys = {}) {
  const dims = D === 3 ? [nh, 2 * ny, nh] : [nh, 2 * ny, nh, nh], M = dims.reduce((a, b) => a * b, 1), P = { ...PHYS, ...phys };
  const strides = dims.map((_, a) => dims.slice(0, a).reduce((x, y) => x * y, 1)), kv = dims.map(() => new Float64Array(M)), k2 = new Float64Array(M);
  const yOf = new Int32Array(M), nyq = new Uint8Array(M);
  for (let p = 0; p < M; p++) { let q = p, s = 0; for (let a = 0; a < D; a++) { const n = q % dims[a], m = n <= dims[a] / 2 ? n : n - dims[a], k = (2 * Math.PI * m) / dims[a]; kv[a][p] = k; s += k * k; if (a === 1) yOf[p] = n; if (n === dims[a] / 2) nyq[p] = 1; q = Math.floor(q / dims[a]); } k2[p] = s; }
  const L = { D, nh, ny, dims, M, strides, P, kv, k2, yOf, nyq, fft: makeFFTn(dims), t: 0, steps: 0,
    phi: new Float64Array(M), T: new Float64Array(M), u: dims.map(() => new Float64Array(M)), hr: new Float64Array(M), hi: new Float64Array(M),
    wr: new Float64Array(M), wi: new Float64Array(M), fr: dims.map(() => new Float64Array(M)), fi: dims.map(() => new Float64Array(M)), mu: new Float64Array(M), tmp: new Float64Array(M), dt: 0.1, umax: 0 };
  if (P.glass) {
    // (the wall's potential W(φ + 1)²/2 is stiff, and the stabiliser must match it, A ≥ (W + 2)/2, or the scheme is
    // unstable; a stiff wall is what keeps the liquid outside the glass from soaking up the wax: it can hold only
    // μ/(2 + W) of it)
    P.A = Math.max(P.A, P.Aglass);
    // which cells are inside the glass: distance from the axis (across) under the profile at that height, scaled to the
    // lamp's height (the profile is for 32)
    const inside = new Uint8Array(M), c0 = nh / 2 - 0.5;
    for (let p = 0; p < M; p++) { let q = p, r2 = 0, y = 0; for (let a = 0; a < D; a++) { const n = q % dims[a]; q = Math.floor(q / dims[a]); if (a === 1) y = n < ny ? n : 2 * ny - 1 - n; else r2 += (n - c0) ** 2; } inside[p] = Math.sqrt(r2) < glassR(((y + 0.5) * 32) / ny) - 0.5 ? 1 : 0; }
    L.inside = inside;
  }
  return L;
}
/* how deep a pool fills waxShare of the glass's volume (the volume of the glass up to height h: discs or 3-balls of
   radius glassR(y), summed over the layers) */
export function poolDepth(D, share) {
  const area = (y) => (D === 3 ? Math.PI * glassR(y) ** 2 : (4 / 3) * Math.PI * glassR(y) ** 3), tot = Array.from({ length: 32 }, (_, y) => area(y + 0.5)).reduce((a, b) => a + b, 0);
  let acc = 0; for (let y = 0; y < 32; y++) { const a = area(y + 0.5); if (acc + a >= share * tot) return y + (share * tot - acc) / a; acc += a; } return 32;
}
/* the mirror of cell p across the floor/ceiling (its y → 2ny − 1 − y) */
export function mirror(L, p) { const y = L.yOf[p], st = L.strides[1]; return p + (2 * L.ny - 1 - 2 * y) * st; }
/* set φ and T from functions of the physical cell (x, y, z(, w)), y = 0 the floor; the mirror half filled to match */
export function setFields(L, fPhi, fT = () => 0) {
  const { M, D, dims, ny } = L, c = new Array(D);
  for (let p = 0; p < M; p++) { let q = p; for (let a = 0; a < D; a++) { c[a] = q % dims[a]; q = Math.floor(q / dims[a]); } if (c[1] >= ny) c[1] = 2 * ny - 1 - c[1]; L.phi[p] = fPhi(c); L.T[p] = fT(c); }
  L.hr.set(L.phi); L.hi.fill(0); L.fft(L.hr, L.hi, false); L.t = 0; L.steps = 0; for (const u of L.u) u.fill(0);
  return L;
}
/* the neighbours of every cell along each axis, both ways (periodic: in the doubled box that is also the mirror walls),
   as tables: up[a][p], dn[a][p] */
function nbTables(L) {
  if (L.up) return L;
  const { M, D, dims, strides } = L; L.up = []; L.dn = [];
  for (let a = 0; a < D; a++) { const n = dims[a], st = strides[a], U = new Int32Array(M), Dn = new Int32Array(M); for (let p = 0; p < M; p++) { const i = Math.floor(p / st) % n; U[p] = i === n - 1 ? p - (n - 1) * st : p + st; Dn[p] = i === 0 ? p + (n - 1) * st : p - st; } L.up.push(U); L.dn.push(Dn); }
  return L;
}

/* the flow for the current φ and T */
export function flow(L) {
  nbTables(L);
  const { D, M, P, phi, T, mu, kv, k2, fr, fi, u, yOf, ny, up, dn, nyq } = L;
  // μ = φ³ − φ − ε²∇²φ (∇² by differences: the force needs it in real space)
  mu.fill(0); for (let a = 0; a < D; a++) { const U = up[a], Dn = dn[a]; for (let p = 0; p < M; p++) mu[p] += phi[U[p]] + phi[Dn[p]]; }
  for (let p = 0; p < M; p++) { const f = phi[p]; mu[p] = f * f * f - f - P.eps * P.eps * (mu[p] - 2 * D * f); }
  // f = μ∇φ + buoyancy along y (up in the real half, down in the mirror half)
  for (let a = 0; a < D; a++) { const f = fr[a], U = up[a], Dn = dn[a]; for (let p = 0; p < M; p++) f[p] = (mu[p] * (phi[U[p]] - phi[Dn[p]])) / 2; }
  for (let p = 0; p < M; p++) { const f = phi[p], rho = 0.5 * (1 + f) * (P.delta - P.aw * T[p]) - 0.5 * (1 - f) * P.al * T[p]; fr[1][p] += (yOf[p] < ny ? -1 : 1) * P.g * rho; }
  solve(L, true);
  // the glass: no flow in it. Zero the velocity there and project back onto divergence-free flow: what's left in the
  // glass is small, and carries nothing (transport is by fluxes between cells, and a face that touches glass carries
  // none: see advect())
  if (L.inside) for (let it = 0; it < 1; it++) { for (let a = 0; a < D; a++) { const ua = u[a]; for (let p = 0; p < M; p++) fr[a][p] = L.inside[p] ? ua[p] : 0; } solve(L, false); }
}
/* from the forces in fr (real space) to the velocity u: the Stokes solve (stokes true: project and divide by η k²) or
   the projection alone (onto divergence-free fields) */
function solve(L, stokes) {
  const { D, M, P, kv, k2, fr, fi, u, nyq } = L;
  for (let a = 0; a < D; a++) fi[a].fill(0);
  // the force's components are real: two go in one complex transform (a + ib), and come apart by symmetry,
  // F_a(k) = (Z(k) + Z*(−k))/2, F_b(k) = (Z(k) − Z*(−k))/2i. Half the transforms
  const neg = negIndex(L), pairs = D === 3 ? [[0, 1], [2, -1]] : [[0, 1], [2, 3]];
  for (const [a, b] of pairs) {
    const zr = fr[a], zi = fi[a]; if (b >= 0) zi.set(fr[b]); else zi.fill(0);
    L.fft(zr, zi, false);
    if (b < 0) continue;
    const br = fr[b], bi = fi[b];
    for (let p = 0; p < M; p++) { const q = neg[p]; if (q < p) continue; const Zr = zr[p], Zi = zi[p], Vr = zr[q], Vi = zi[q];
      // at p: A = (Z(p) + Z*(q))/2, B = (Z(p) − Z*(q))/2i; at q the same with p and q swapped
      zr[p] = (Zr + Vr) / 2; zi[p] = (Zi - Vi) / 2; br[p] = (Zi + Vi) / 2; bi[p] = -(Zr - Vr) / 2;
      zr[q] = (Vr + Zr) / 2; zi[q] = (Vi - Zi) / 2; br[q] = (Vi + Zi) / 2; bi[q] = -(Vr - Zr) / 2; }
  }
  // project out the part that pressure takes (and for Stokes divide by η k²)
  for (let p = 0; p < M; p++) {
    // (no flow in the mean, nor in any mode at an axis's Nyquist wavenumber, where +k and −k are one grid point: the
    // projection there isn't conjugate-symmetric, the velocity it gives isn't real, and the packed pairs would mix)
    const kk = k2[p]; if (kk === 0 || nyq[p]) { for (let a = 0; a < D; a++) { fr[a][p] = 0; fi[a][p] = 0; } continue; }
    let dr = 0, di = 0; for (let a = 0; a < D; a++) { dr += kv[a][p] * fr[a][p]; di += kv[a][p] * fi[a][p]; }
    const s = stokes ? 1 / (P.eta * kk) : 1;
    for (let a = 0; a < D; a++) { fr[a][p] = (fr[a][p] - (kv[a][p] * dr) / kk) * s; fi[a][p] = (fi[a][p] - (kv[a][p] * di) / kk) * s; }
  }
  // and back two at a time: the velocities are real, so W = U_a + iU_b transforms to u_a + i u_b
  let um = 0;
  for (const [a, b] of pairs) {
    const wr = fr[a], wi = fi[a];
    if (b >= 0) for (let p = 0; p < M; p++) { const r = wr[p] - fi[b][p], i = wi[p] + fr[b][p]; wr[p] = r; wi[p] = i; }
    L.fft(wr, wi, true);
    for (let p = 0; p < M; p++) { u[a][p] = wr[p] / M; um = Math.max(um, Math.abs(u[a][p])); if (b >= 0) { u[b][p] = wi[p] / M; um = Math.max(um, Math.abs(u[b][p])); } }
  }
  L.umax = um;
}
/* ∇·(u f) at every cell, as fluxes through the faces between neighbours: the face's velocity (the mean of its two
   cells') times f at the face (the mean of the two, or upwind for T). Exactly conservative (what leaves one cell enters
   the next), and in the glass no face that touches a glass cell carries anything, so nothing crosses it */
function advect(L, f, out, upwind) {
  const { D, M, u, up, dn } = L, IN = L.inside; out.fill(0);
  const mm = (x, y) => (x * y <= 0 ? 0 : Math.abs(x) < Math.abs(y) ? x : y);
  for (let a = 0; a < D; a++) {
    const ua = u[a], U = up[a], Dn = dn[a];
    for (let p = 0; p < M; p++) {
      const q = U[p]; if (IN && !(IN[p] && IN[q])) continue;
      const uf = 0.5 * (ua[p] + ua[q]); let ff;
      // upwind with a limited slope (minmod: second order where f is smooth, first order at its extremes, so no new
      // overshoots): a plain upwind face would smear T by u·dx/2, several times the lamp's real diffusivity
      if (upwind) ff = uf > 0 ? f[p] + 0.5 * mm(f[q] - f[p], f[p] - f[Dn[p]]) : f[q] - 0.5 * mm(f[U[q]] - f[q], f[q] - f[p]);
      else ff = 0.5 * (f[p] + f[q]);
      const fl = uf * ff; out[p] += fl; out[q] -= fl;
    }
  }
  return out;
}
/* one step: the flow, then φ (semi-implicit, stabilised, advected explicitly), then T (explicit, upwind) */
export function step(L) {
  flow(L);
  const { D, M, P, phi, T, u, hr, hi, wr, wi, tmp, k2, yOf, ny, up, dn } = L;
  const dt = (L.dt = Math.min(P.dtMax, P.cfl / Math.max(1e-9, L.umax)));
  // φ: the bulk term and the advection, transformed together as two real fields in one complex transform
  advect(L, phi, wi, false);
  // (outside the glass, a potential W(φ + 1)²/2 holds the composition at pure liquid: the liquid wets the glass, the wax
  // stays inside)
  const IN = L.inside; for (let p = 0; p < M; p++) { const f = phi[p]; wr[p] = f * f * f - f + (IN && !IN[p] ? P.wall * (f + 1) : 0); }
  L.fft(wr, wi, false);
  // unpack: N̂(k) = (W(k) + W*(−k))/2, Â(k) = (W(k) − W*(−k))/2i
  const neg = negIndex(L);
  for (let p = 0; p < M; p++) {
    const q = neg[p], Wr = wr[p], Wi = wi[p], Vr = wr[q], Vi = -wi[q];
    const nr = (Wr + Vr) / 2, ni = (Wi + Vi) / 2, ar = (Wi - Vi) / 2, ai = -(Wr - Vr) / 2;
    const k = k2[p], den = 1 + dt * P.A * k + dt * P.eps * P.eps * k * k, num = 1 + dt * P.A * k;
    // (the advection's mean, its k = 0 part, is zero for a divergence-free flow; differences and the spectral projection
    // don't quite agree on that, so it's set so, and the wax is conserved exactly)
    const arr = p === 0 ? 0 : ar, aii = p === 0 ? 0 : ai;
    tmp[p] = (num * hr[p] - dt * k * nr - dt * arr) / den; L.mu[p] = (num * hi[p] - dt * k * ni - dt * aii) / den;
  }
  hr.set(tmp); hi.set(L.mu); wr.set(hr); wi.set(hi); L.fft(wr, wi, true); for (let p = 0; p < M; p++) phi[p] = wr[p] / M;
  // T: upwind advection, diffusion, the heater and the cool top
  const advT = advect(L, T, L.advT || (L.advT = new Float64Array(M)), true);
  for (let p = 0; p < M; p++) {
    let lap = -2 * D * T[p]; const adv = advT[p];
    for (let a = 0; a < D; a++) lap += T[up[a][p]] + T[dn[a][p]];
    const y = yOf[p] < ny ? yOf[p] : 2 * ny - 1 - yOf[p], g = L.inside ? L.inside[p] : 1;
    // the heater under the floor and the cool top, inside the glass; outside it, the room (the glass loses heat to it)
    // (in the glass the upper half loses heat, more toward the top, as a lamp's glass does; without it, only the top
    // layers, where a blob that can't fit into the narrow neck would never reach)
    const top = L.inside ? P.coolGlass * Math.max(0, (y - ny / 2) / (ny / 2)) : y >= ny - P.band ? P.cool : 0;
    const src = !g ? P.wallCool * (P.ambient - T[p]) : y < P.band ? P.heat * (1 - T[p]) : -top * T[p];
    tmp[p] = T[p] + dt * (-adv + P.kappa * lap + src);
  }
  T.set(tmp); L.t += dt; L.steps++;
  // convection amplifies any difference between the box and its mirror image (rounding is enough, given time), and then
  // the walls stop being walls: copy the real half onto the mirror half, T every step, φ (and φ̂) every tenth
  symmetrize(L, T);
  if (L.steps % 10 === 0) { symmetrize(L, phi); hr.set(phi); hi.fill(0); L.fft(hr, hi, false); }
}
function symmetrize(L, f) { const { M, yOf, ny } = L; for (let p = 0; p < M; p++) if (yOf[p] < ny) f[mirror(L, p)] = f[p]; }
function negIndex(L) {
  if (L.neg) return L.neg;
  const { M, D, dims, strides } = L, neg = new Int32Array(M);
  for (let p = 0; p < M; p++) { let q = p, r = 0; for (let a = 0; a < D; a++) { const i = q % dims[a]; q = Math.floor(q / dims[a]); r += ((dims[a] - i) % dims[a]) * strides[a]; } neg[p] = r; }
  return (L.neg = neg);
}

/* WHAT TO MEASURE: the wax's pieces (union–find over the real half, periodic across, face neighbours), where its
   volume is (the share above half height), and its temperature */
export function stats(L) {
  nbTables(L);
  const { M, D, dims, strides, phi, T, yOf, ny } = L, par = new Int32Array(M).fill(-1);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  let wax = 0, up = 0, Tw = 0, ysum = 0;
  for (let p = 0; p < M; p++) if (yOf[p] < ny && phi[p] > 0) { par[p] = p; wax++; if (yOf[p] >= ny / 2) up++; Tw += T[p]; ysum += yOf[p]; }
  for (let p = 0; p < M; p++) {
    if (par[p] < 0) continue;
    for (let a = 0; a < D; a++) { if (a === 1 && yOf[p] === ny - 1) continue; const q = L.up[a][p]; if (par[q] >= 0) { const ra = find(p), rb = find(q); if (ra !== rb) par[ra] = rb; } }
  }
  // each piece: its size, its height (as a share of the lamp's) and its temperature
  const acc = new Map(); for (let p = 0; p < M; p++) if (par[p] >= 0) { const r = find(p), e = acc.get(r) || { n: 0, y: 0, T: 0 }; e.n++; e.y += yOf[p]; e.T += T[p]; acc.set(r, e); }
  const blobs = [...acc.values()].filter((e) => e.n >= 4).map((e) => ({ n: e.n, y: (e.y / e.n + 0.5) / ny, T: e.T / e.n }));
  return { t: L.t, dt: L.dt, umax: L.umax, wax: wax / (M / 2), aloft: wax ? up / wax : 0, Twax: wax ? Tw / wax : 0, height: wax ? ysum / wax / ny : 0, pieces: blobs.length, blobs };
}
/* the real half (y < ny) of a field, as a 32-bit array the page can draw: index x + nh(y + ny(z)) in 3D; in 4D the
   whole 4D real half, for slicing */
export function realHalf(L, f) {
  const { M, yOf, ny, dims, D } = L, out = new Float32Array(M / 2); let n = 0;
  for (let p = 0; p < M; p++) if (yOf[p] < ny) out[n++] = f[p];
  return out;
}

/* the composition of the liquid in balance with an interface whose chemical potential is m (the root of φ³ − φ = m
   near −1, by Newton); and the surface tension of a flat interface, ε = 1 */
export const SIGMA = (2 * Math.SQRT2) / 3;
export function balance(m) { let x = -1; for (let i = 0; i < 40; i++) x -= (x * x * x - x - m) / (3 * x * x - 1); return x; }
/* starting states */
export const START = {
  // a pool of cold wax on the floor, 6 cells deep, a whisper of noise so the plumes have somewhere to start
  // (the noise is a hash of the cell across, so the cell and its mirror image get the same)
  // (in the glass, the pool only inside it)
  lamp: (L, seed = 1) => { const h = (c) => { let x = seed * 374761393; for (const v of [c[0], ...c.slice(2)]) x = Math.imul(x ^ (v + 0x9e3779b9), 2654435761); return ((x >>> 0) % 10000) / 10000 - 0.5; }, c0 = L.nh / 2 - 0.5;
    const inGlass = (c) => !L.P.glass || Math.hypot(c[0] - c0, ...c.slice(2).map((v) => v - c0)) < glassR(((c[1] + 0.5) * 32) / L.ny) - 0.8;
    // in the glass, the pool is a set share of the glass's volume, the same in 3D and 4D (a 4D glass's cross-section is a
    // 3-ball, ~9× a 3D one's disc at the widest; the same depth of wax would be a far thinner share of a 4D lamp)
    const depth = L.P.glass ? poolDepth(L.D, L.P.waxShare) : L.P.pool;
    return setFields(L, (c) => (inGlass(c) ? Math.tanh((depth + 1.2 * h(c) - c[1]) / Math.SQRT2) : -1), () => 0); },
  // a column of wax standing floor to ceiling, radius R, rippled with n half-waves... a wave of wavelength 2·ny/n, which
  // the mirror walls allow; no gravity, no heat: only its surface acts on it
  // (the liquid round it starts holding the wax a straight thread of radius R is in balance with: its surface curves
  // D − 2 ways at 1/R, μ = σ(D − 2)/(2R) (Gibbs–Thomson), and a thread this thin, in a box this small, would otherwise
  // dissolve away into the liquid, in 4D within ~100 time units, and there'd be no thread to test)
  thread: (L, R = 4, n = 3, amp = 0.6) => { const c0 = L.nh / 2 - 0.5, bg = balance((L.D - 2) * SIGMA / (2 * R)); return setFields(L, (c) => { const r = Math.hypot(c[0] - c0, ...c.slice(2).map((v) => v - c0)), rr = R + amp * Math.cos((Math.PI * n * (c[1] + 0.5)) / L.ny), u = Math.tanh((rr - r) / Math.SQRT2); return bg + ((u + 1) / 2) * (1 - bg); }); },
  // a hot ball in the cold liquid, mid-lamp, no wax (a wax blob this small would dissolve before it cooled): how fast its
  // heat leaves
  cooling: (L, R = 5) => { const d = ballDist(L); return setFields(L, () => -1, (c) => (d(c) < R ? 1 : 0)); },
};
const ballDist = (L) => { const c0 = L.nh / 2 - 0.5, y0 = L.ny / 2 - 0.5; return (c) => Math.hypot(c[0] - c0, c[1] - y0, ...c.slice(2).map((v) => v - c0)); };
/* how much of the hot ball's heat is still inside the ball, as a fraction of what it started with */
export function heatIn(L, R = 5) {
  const { M, D, dims, yOf, ny, T } = L, d = ballDist(L), c = new Array(D); let h = 0, n = 0;
  for (let p = 0; p < M; p++) { if (yOf[p] >= ny) continue; let q = p; for (let a = 0; a < D; a++) { c[a] = q % dims[a]; q = Math.floor(q / dims[a]); } if (d(c) < R) { h += T[p]; n++; } }
  return h / n;
}
/* the thread's ripple: the relative amplitude of its n-wave in its cross-section (the cells more than half wax, at each
   height), and its thinnest point; pinched when some height has none */
export function ripple(L, n = 3) {
  const { M, yOf, ny, phi, D } = L, area = new Float64Array(ny);
  for (let p = 0; p < M; p++) if (yOf[p] < ny && phi[p] > 0) area[yOf[p]] += 1;
  let c = 0, a0 = 0; for (let y = 0; y < ny; y++) { c += area[y] * Math.cos((Math.PI * n * (y + 0.5)) / ny); a0 += area[y]; }
  const minA = Math.min(...area);
  return { amp: a0 ? (2 * c) / a0 : 0, minArea: minA, meanArea: a0 / ny, pinched: minA < 1 };
}
