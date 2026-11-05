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

import { eigh, levels, firsts } from "../js/multiplet.js";
export { eigh, levels };

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
