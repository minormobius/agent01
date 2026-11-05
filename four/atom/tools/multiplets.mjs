/* The levels of a dⁿ ion in a crystal: the multiplets that decide whether a doped crystal can lase, in ours and in 4D.
   The dopant's d shell (5 orbitals in ours, 9 in 4D) holds n electrons. Their repulsion is the pinned law between
   them, projected exactly onto the sphere harmonics a d × d product holds (degree 0, 2, 4), radial integrals over the
   free ion's own 3d orbital: in ours these are Slater's F⁰, F², F⁴ (Racah's B and C follow); in 4D the same projection
   of 1/|x−y| gives their counterparts. The ligand field is crystalfield.mjs's d block. Every determinant of n
   electrons in the 2 × (5 or 9) spin orbitals of one M_S is set up and the whole is diagonalized; each state's spin
   comes from ⟨S²⟩. Two scale factors are exposed: s on the ligand field (the point-charge model is known to fall short)
   and β on F², F⁴ (a free ion's repulsion is reduced in a crystal). Ruby fixes both: s and β such that the spin-allowed
   ⁴A₂ → ⁴T₂ band and the spin-flip ²E line land where they are measured. The 4D numbers are given at s = β = 1 and at
   ruby's s and β, which is a transfer assumption, stated, not a result.
   What it decides: if the lowest excited state has the ground state's spin, emission is a broad band (a tunable laser,
   like alexandrite's); if it is a spin flip whose energy runs parallel to the ground state's as the field changes,
   it is a sharp, long-lived line (ruby's). The `slope` of each level against s measures that: near 0 is sharp.
     node four/atom/tools/multiplets.mjs check                 free-ion term relations in ours (⁴P − ⁴F = 15B, …) and the eigensolver
     node four/atom/tools/multiplets.mjs ion <D> <Z> <n>       the free 3+ ion's terms, 3dⁿ
     node four/atom/tools/multiplets.mjs ruby                  Cr³⁺ in corundum: computed, fitted, and the scan in s
     node four/atom/tools/multiplets.mjs bl <cell> [n] [Z]     a 3dⁿ 3+ dopant (default 3, element 28) on Bl₂Px₃'s sites
     node four/atom/tools/multiplets.mjs dopants <cell>        3d¹ … 3d⁴ (and 3d¹⁴ … 3d¹⁷) 3+ dopants on the cell's first site, at ruby's s, β
   Prints JSON. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { harmonics } from "../js/pw.js";
import { R as GR, N as GN } from "../js/atom.js";
import { HA, dopant, sphere, gegen, project, dBlock, host } from "./crystalfield.mjs";

const CM = 219474.63; // cm⁻¹ per hartree

/* symmetric eigensystem: Householder to tridiagonal, then implicit QL (after JAMA's tred2/tql2); V's columns are vectors */
export function eigh(A) {
  const n = A.length, V = A.map((r) => Float64Array.from(r)), d = new Float64Array(n), e = new Float64Array(n);
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0; for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) { e[i] = d[i - 1]; for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; } }
    else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h); if (f > 0) g = -g; e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) { f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f; for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; } e[j] = g; }
      f = 0; for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h); for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) { f = d[j]; g = e[j]; for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k]; d[j] = V[i - 1][j]; V[i][j] = 0; }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) { V[n - 1][i] = V[i][i]; V[i][i] = 1; const h = d[i + 1];
    if (h !== 0) { for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h; for (let j = 0; j <= i; j++) { let g = 0; for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j]; for (let k = 0; k <= i; k++) V[k][j] -= g * d[k]; } }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0; }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; } V[n - 1][n - 1] = 1; e[0] = 0;
  for (let i = 1; i < n; i++) e[i - 1] = e[i]; e[n - 1] = 0;
  let f = 0, tst1 = 0; const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l])); let m = l; while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
    if (m > l) { let iter = 0; do { if (++iter > 200) throw new Error("eigh: no convergence");
      let g = d[l], p = (d[l + 1] - g) / (2 * e[l]), r = Math.hypot(p, 1); if (p < 0) r = -r;
      d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r); const dl1 = d[l + 1]; let h = g - d[l]; for (let i = l + 2; i < n; i++) d[i] -= h; f += h;
      p = d[m]; let c = 1, c2 = c, c3 = c; const el1 = e[l + 1]; let s = 0, s2 = 0;
      for (let i = m - 1; i >= l; i--) { c3 = c2; c2 = c; s2 = s; g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]); e[i + 1] = s * r; s = e[i] / r; c = p / r; p = c * d[i] - s * g; d[i + 1] = h + s * (c * g + s * d[i]);
        for (let k = 0; k < n; k++) { h = V[k][i + 1]; V[k][i + 1] = s * V[k][i] + c * h; V[k][i] = c * V[k][i] - s * h; } }
      p = (-s * s2 * c3 * el1 * e[l]) / dl1; e[l] = s * p; d[l] = c * p; } while (Math.abs(e[l]) > eps * tst1); }
    d[l] += f; e[l] = 0;
  }
  const ord = Array.from(d, (_, i) => i).sort((a, b) => d[a] - d[b]);
  return { values: ord.map((i) => d[i]), vectors: ord.map((i) => Float64Array.from(V, (row) => row[i])) };
}

/* the repulsion's radial parts: F_n = Σ_ij q_i q_j v_n(r_i, r_j), 1/|x−y| = Σ_n v_n(r, r') C_n^λ(x̂·ŷ) */
export function slater(d, q) {
  const idx = []; let qmax = 0; for (let j = 0; j < GN; j++) qmax = Math.max(qmax, q[j]); for (let j = 0; j < GN; j++) if (q[j] > 1e-13 * qmax) idx.push(j);
  const F = [0, 0, 0];
  for (let a = 0; a < idx.length; a++) for (let b = a; b < idx.length; b++) { const i = idx[a], j = idx[b], r1 = GR[i], r2 = GR[j], w = (a === b ? 1 : 2) * q[i] * q[j];
    let v; if (d === 3) { const lo = Math.min(r1, r2), hi = Math.max(r1, r2); v = [0, 2, 4].map((n) => lo ** n / hi ** (n + 1)); }
    else v = project(d, (t, omt) => { const s2 = (r1 - r2) ** 2 + 2 * r1 * r2 * omt; return s2 > 0 ? 1 / Math.sqrt(s2) : 0; }, [0, 2, 4]);
    for (let k = 0; k < 3; k++) F[k] += w * v[k]; }
  return F;
}

/* the angular parts: A_n(ac, bd) = ∫∫ Y_aY_c(u) C_n^λ(u·w) Y_bY_d(w), exact on a small product rule (degree 8) */
export function angular(d) {
  const Y = harmonics(d, 2), m = Y.length, pts = sphere(d, 8), P = pts.length, lam = (d - 2) / 2;
  const f = []; for (let a = 0; a < m; a++) for (let c = 0; c < m; c++) f.push(Float64Array.from(pts, (p) => Y[a](p.u) * Y[c](p.u)));
  const A = [0, 2, 4].map((n) => { const K = Array.from({ length: P }, (_, i) => Float64Array.from(pts, (pj) => pts[i].w * pj.w * gegen(lam, n, pts[i].u.reduce((t, x, k) => t + x * pj.u[k], 0))));
    const M = f.map((fb) => Float64Array.from(K, (row) => row.reduce((t, v, j) => t + v * fb[j], 0)));
    return f.map((fa) => Float64Array.from(M, (mb) => fa.reduce((t, v, i) => t + v * mb[i], 0))); });
  let normErr = 0; for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) { let s = 0; pts.forEach((p, i) => (s += p.w * f[a * m + b][i])); normErr = Math.max(normErr, Math.abs(s - +(a === b))); }
  return { m, A, normErr };
}
/* ⟨ab|cd⟩ = Σ_n β_n F_n A_n(ac, bd), F⁰ unscaled (it shifts every level of the configuration alike) */
function twoBody(ang, F, beta) { const { m, A } = ang, g = new Float64Array(m ** 4), sc = [1, beta, beta];
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) for (let c = 0; c < m; c++) for (let dd = 0; dd < m; dd++) { let v = 0; for (let k = 0; k < 3; k++) v += sc[k] * F[k] * A[k][a * m + c][b * m + dd]; g[((a * m + b) * m + c) * m + dd] = v; }
  return g; }

/* the determinants of n electrons with nu spin-up in 2m spin orbitals (bit o = orbital o up, bit m + o = down) */
const pop = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
function dets(m, n, nu) { const out = []; for (let D = 0; D < 1 << (2 * m); D++) if (pop(D) === n && pop(D & ((1 << m) - 1)) === nu) out.push(D); return out; }
const sgn = (D, p) => (pop(D & ((1 << p) - 1)) & 1 ? -1 : 1);

/* H in one M_S block; h the one-electron (ligand field) matrix, g the two-electron integrals */
function hamiltonian(m, basis, h, g) {
  const at = new Map(basis.map((D, i) => [D, i])), N = basis.length, H = Array.from({ length: N }, () => new Float64Array(N)), sp = (p) => (p < m ? 0 : 1), o = (p) => p % m;
  basis.forEach((D, col) => {
    for (let r = 0; r < 2 * m; r++) { if (!(D >> r & 1)) continue; const s1 = sgn(D, r), D1 = D ^ (1 << r);
      for (let p = 0; p < 2 * m; p++) { if (sp(p) !== sp(r) || D1 >> p & 1) continue; const row = at.get(D1 | (1 << p)); H[row][col] += s1 * sgn(D1, p) * h[o(p)][o(r)]; } }
    for (let r = 0; r < 2 * m; r++) { if (!(D >> r & 1)) continue; const sr = sgn(D, r), Dr = D ^ (1 << r);
      for (let s = 0; s < 2 * m; s++) { if (s === r || !(Dr >> s & 1)) continue; const ss = sgn(Dr, s), Ds = Dr ^ (1 << s);
        for (let q = 0; q < 2 * m; q++) { if (sp(q) !== sp(s) || Ds >> q & 1) continue; const sq = sgn(Ds, q), Dq = Ds | (1 << q);
          for (let p = 0; p < 2 * m; p++) { if (p === q || sp(p) !== sp(r) || Dq >> p & 1) continue; const row = at.get(Dq | (1 << p));
            H[row][col] += 0.5 * sr * ss * sq * sgn(Dq, p) * g[((o(p) * m + o(q)) * m + o(r)) * m + o(s)]; } } } }
  });
  return H;
}
/* ⟨S²⟩ = |S₊v|² + M² + M */
function spinSq(m, basis, v, M) { const out = new Map();
  basis.forEach((D, i) => { if (!v[i]) return; for (let o2 = 0; o2 < m; o2++) { const dn = m + o2; if (!(D >> dn & 1) || D >> o2 & 1) continue; const s1 = sgn(D, dn), D1 = D ^ (1 << dn), s2 = sgn(D1, o2), D2 = D1 | (1 << o2); out.set(D2, (out.get(D2) || 0) + s1 * s2 * v[i]); } });
  let t = 0; for (const x of out.values()) t += x * x; return t + M * M + M; }

/* the multiplets of dⁿ in field s·h with repulsion β: levels grouped by energy, each with its spin and how many states */
export function levels(m, n, h, s, ang, F, beta, tol = 1e-6) {
  const nu = Math.ceil(n / 2), M = (2 * nu - n) / 2, basis = dets(m, n, nu);
  if (basis.length > 1600) throw new Error(`block of ${basis.length} determinants: too large here`);
  const hs = h.map((r) => Array.from(r, (x) => s * x)), H = hamiltonian(m, basis, hs, twoBody(ang, F, beta)), { values, vectors } = eigh(H.map((r) => Array.from(r)));
  const out = []; values.forEach((E, i) => { const S2 = spinSq(m, basis, vectors[i], M), S = (Math.sqrt(1 + 4 * S2) - 1) / 2, last = out.at(-1);
    if (last && E - last.E < tol && Math.abs(last.S - S) < 0.25) { last.g++; last.top = E; } else out.push({ E, S, g: 1, top: E }); });
  const E0 = out[0].E; return { dim: basis.length, M, multiplets: out.map((x) => ({ eV: +((x.E - E0) * HA).toFixed(4), mult: Math.round(2 * x.S + 1), g: x.g, Eabs: x.E })) };
}
/* the two states that decide the laser: the lowest excited state of the ground state's spin, and the lowest of another
   spin; a level is its group's mean over the next `g` states (a T level split by a trigonal field counts as one band) */
function firsts(L, gBand) { const ms = L.multiplets, gs = ms[0].mult;
  const take = (pred, need) => { let n = 0, e = 0; for (const x of ms.slice(1)) { if (!pred(x)) continue; const k = Math.min(x.g, need - n); e += k * x.eV; n += k; if (n >= need) break; } return n ? e / n : null; };
  return { groundMult: gs, groundG: ms[0].g, allowed_eV: take((x) => x.mult === gs, gBand[0]), flip_eV: take((x) => x.mult !== gs, gBand[1]), flipMult: ms.slice(1).find((x) => x.mult !== gs)?.mult ?? null }; }

/* the dopant: element Z's 3+ ion, 3dⁿ over the closed shells below it */
function ionOf(D, Z, n) { const core = D === 3 ? "1s2 2s2 2p6 3s2 3p6" : "1s2 2s2 2p8 3s2 3p8"; return dopant(Z, D, `${core} 3d${n}`); }
const ev = (x) => (x == null ? null : +x.toFixed(4));
function racah(F) { const F2 = F[1] / 49, F4 = F[2] / 441; return { B_cm: +((F2 - 5 * F4) * CM).toFixed(0), C_cm: +(35 * F4 * CM).toFixed(0) }; }

const [cmd, ...args] = process.argv.slice(2), main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!main) {} else if (cmd === "check") { // the free ion in ours: d² and d³ term separations from Racah's B and C, and the eigensolver
  const t0 = Date.now(), ang = angular(3), ion0 = ionOf(3, 24, 3), F = slater(3, ion0.q), { B_cm, C_cm } = racah(F), B = F[1] / 49 - (5 * F[2]) / 441, C = (35 * F[2]) / 441, zero = Array.from({ length: 5 }, () => new Float64Array(5));
  const terms = (n) => levels(5, n, zero, 0, ang, F, 1).multiplets.map((x) => ({ cm: Math.round(x.eV / HA * CM), mult: x.mult, g: x.g }));
  const d3 = terms(3), d2 = terms(2), find = (L, mult, g) => L.find((x) => x.mult === mult && x.g === g)?.cm;
  // d³: ⁴F ground; ⁴P = 15B; ²G = 4B + 3C (Griffith's table, from memory). d²: ³F ground; ³P = 15B; ¹D = 5B + 2C; ¹G = 12B + 2C; ¹S = 22B + 7C
  const want = [["d3 4P", find(d3, 4, 3), 15 * B], ["d3 2G", find(d3, 2, 9), 4 * B + 3 * C], ["d2 3P", find(d2, 3, 3), 15 * B], ["d2 1D", find(d2, 1, 5), 5 * B + 2 * C], ["d2 1G", find(d2, 1, 9), 12 * B + 2 * C], ["d2 1S", find(d2, 1, 1), 22 * B + 7 * C]].map(([k, got, w]) => ({ term: k, got_cm: got, want_cm: Math.round(w * CM), ok: Math.abs(got - w * CM) < 1 }));
  let resid = 0; { const A = Array.from({ length: 30 }, (_, i) => Array.from({ length: 30 }, (_, j) => Math.sin(i * 7 + j * 7 + i * j) + (i === j ? i : 0))); for (let i = 0; i < 30; i++) for (let j = 0; j < i; j++) A[i][j] = A[j][i];
    const { values, vectors } = eigh(A); values.forEach((l, k) => { for (let i = 0; i < 30; i++) resid = Math.max(resid, Math.abs(A[i].reduce((t, a, j) => t + a * vectors[k][j], 0) - l * vectors[k][i])); }); }
  console.log(JSON.stringify({ check: "free-ion terms in ours against Racah's B, C; eigensolver residual", ion: "Cr³⁺ 3d³", B_cm, C_cm, terms: want, d3, eigenResidual: resid, angularNormErr: ang.normErr, ok: want.every((w) => w.ok) && resid < 1e-10, seconds: (Date.now() - t0) / 1000 }));
} else if (cmd === "ion") {
  const [D, Z, n] = args.map(Number), ang = angular(D), ion0 = ionOf(D, Z, n), F = slater(D, ion0.q), m = ang.m, zero = Array.from({ length: m }, () => new Float64Array(m));
  console.log(JSON.stringify({ D, Z, n, converged: ion0.converged, F_eV: F.map((x) => +(x * HA).toFixed(4)), ...(D === 3 ? racah(F) : {}), terms: levels(m, n, zero, 0, ang, F, 1).multiplets.map(({ Eabs, ...x }) => x) }));
} else if (cmd === "ruby" || cmd === "bl" || cmd === "dopants") {
  const t0 = Date.now(), RUBY = { allowed_eV: 2.23, flip_eV: 1.786, note: "⁴A₂→⁴T₂ band ≈ 18 000 cm⁻¹; R lines 694.3/692.9 nm (from memory: to verify)" };
  /* ruby first: always, because its s and β are what the 4D numbers are carried at */
  const ang3 = angular(3), cr = ionOf(3, 24, 3), F3 = slater(3, cr.q), H3 = (() => { const hs = host("ruby"); return dBlock(3, hs.sites[0].L, hs.q, hs.c, cr.q).H; })();
  const at3 = (s, b) => firsts(levels(5, 3, H3, s, ang3, F3, b), [3, 2]);
  let s = 1, b = 1; for (let it = 0; it < 40; it++) { // alternate: s from the band (≈ linear in s), β from the line
    const f = at3(s, b); s *= RUBY.allowed_eV / f.allowed_eV; const g = at3(s, b), g2 = at3(s, b * 1.01), dfl = (g2.flip_eV - g.flip_eV) / (0.01 * b); b += (RUBY.flip_eV - g.flip_eV) / dfl;
    if (Math.abs(g.allowed_eV - RUBY.allowed_eV) < 1e-5 && Math.abs(g.flip_eV - RUBY.flip_eV) < 1e-5) break; }
  const fit = { s: +s.toFixed(4), beta: +b.toFixed(4), ...at3(s, b) }, raw = at3(1, 1);
  const scan = (m, n, H, ang, F, bb, gBand, smax) => { const out = []; for (let k = 0; k <= 32; k++) { const sk = (smax * k) / 32, f = firsts(levels(m, n, H, sk, ang, F, bb), gBand); out.push({ s: +sk.toFixed(3), allowed: ev(f.allowed_eV), flip: ev(f.flip_eV), flipMult: f.flipMult, ground: f.groundMult }); } return out; };
  /* slope: d(level)/ds per eV of the field's own spread, about the point; ruby's ²E is the reference for "sharp" */
  const slopes = (m, n, H, ang, F, s0, bb, gBand) => { const a = firsts(levels(m, n, H, s0 * 0.98, ang, F, bb), gBand), c = firsts(levels(m, n, H, s0 * 1.02, ang, F, bb), gBand); return { dAllowed_ds: ev((c.allowed_eV - a.allowed_eV) / (0.04 * s0)), dFlip_ds: ev((c.flip_eV - a.flip_eV) / (0.04 * s0)) }; };
  const rubyOut = { computed: { s: 1, beta: 1, ...raw }, fitted: fit, measured: RUBY, racah: racah(F3), racahFitted: (() => { const r = racah(F3); return { B_cm: Math.round(r.B_cm * b), C_cm: Math.round(r.C_cm * b) }; })(), slopeAtFit: slopes(5, 3, H3, ang3, F3, s, b, [3, 2]) };
  /* the carry, tested inside ours: Ti³⁺ (3d¹) on the same site at ruby's s. Its absorption is t₂ → e, measured ≈ 2.5 eV (Ti:sapphire's band near 490 nm, from memory: to verify) */
  const ti = ionOf(3, 22, 1), Hti = (() => { const hs = host("ruby"); return dBlock(3, hs.sites[0].L, hs.q, hs.c, ti.q).H; })(), tiL = levels(5, 1, Hti, s, ang3, F3, b).multiplets, tiE = (lo, hi) => { let e = 0, k = 0; for (const x of tiL) { const take = Math.max(0, Math.min(x.g, hi - k) - Math.max(0, lo - k)); e += take * x.eV; k += x.g; } return e / (hi - lo); };
  rubyOut.titanium = { ion: "Ti³⁺ 3d¹ on the same site, at ruby's s", levels: tiL.map((x) => `${x.eV}×${x.g}`), absorption_eV: ev(tiE(3, 5) - tiE(0, 3)), pointCharge_eV: ev((() => { const L0 = levels(5, 1, Hti, 1, ang3, F3, 1).multiplets; let a = 0, c = 0, k = 0; for (const x of L0) { for (let g = 0; g < x.g; g++, k++) (k < 3 ? (a += x.eV) : (c += x.eV)); } return c / 2 - a / 3; })()), measured_eV: 2.5 };
  if (cmd === "ruby") { console.log(JSON.stringify({ case: "ruby: Cr³⁺ 3d³ in corundum, point-charge field × s, repulsion × β", ...rubyOut, scan: scan(5, 3, H3, ang3, F3, b, [3, 2], 2 * s), seconds: (Date.now() - t0) / 1000 }, null, 1)); }
  else {
    const cell = args[0] || "z2-0", hs = host("bl", cell), ang4 = angular(4);
    const runIon = (n, Z, sites) => { const io = ionOf(4, Z, n), F = slater(4, io.q);
      return { n, Z, converged: io.converged, eps3d_eV: +(io.eps3d * HA).toFixed(2), F_eV: F.map((x) => +(x * HA).toFixed(4)), sites: sites.map(({ site, L }) => { const H = dBlock(4, L, hs.q, hs.c, io.q).H, gB = [1, 1], one = (ss, bb) => { const Lv = levels(9, n, H, ss, ang4, F, bb); return { ...firsts(Lv, gB), lowest: Lv.multiplets.slice(0, 8).map(({ Eabs, ...x }) => x) }; };
        return { site, coordination: L.length, pointCharge: one(1, 1), rubyCarried: { s: fit.s, beta: fit.beta, ...one(s, b), ...slopes(9, n, H, ang4, F, s, b, gB) }, ...(cmd === "bl" ? { scan: scan(9, n, H, ang4, F, b, gB, 2 * s) } : {}) }; }) }; };
    if (cmd === "bl") { const n = +(args[1] || 3), Z = +(args[2] || 25 + n); console.log(JSON.stringify({ case: `4D: element ${Z}'s 3+ (3d${n}) on Bl₂Px₃ ${cell}, field × s with the clouds' leak, repulsion × β`, ruby: rubyOut, dopant: runIon(n, Z, hs.sites), seconds: (Date.now() - t0) / 1000 }, null, 1)); }
    else { const out = []; for (const n of [1, 2, 3, 4, 14, 15, 16, 17]) { try { out.push(runIon(n, 25 + n, hs.sites.slice(0, 1))); } catch (e) { out.push({ n, error: e.message }); } }
      console.log(JSON.stringify({ case: `4D: 3dⁿ 3+ dopants on Bl₂Px₃ ${cell}'s first site, at ruby's s and β`, ruby: { s: fit.s, beta: fit.beta }, dopants: out, seconds: (Date.now() - t0) / 1000 }, null, 1)); }
  }
} else console.log("usage: multiplets.mjs check | ion <D> <Z> <n> | ruby | bl <cell> [n] [Z] | dopants <cell>");
