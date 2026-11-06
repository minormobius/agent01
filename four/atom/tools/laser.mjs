/* Can a d¹ ion in a crystal lase? The questions after "where are its levels": how far its emission sits below its
   absorption (the Stokes shift), how wide its bands are, where its zero-phonon line is, and how many of the host's
   phonons fit into the gap the excited state must not leak across. Built from three pieces already checked:
     - the ligand field (tools/crystalfield.mjs): the dopant's own 3d orbital, each ligand a point charge −2 (and in 4D
       its cloud's leak S/8|x − X|³), projected exactly onto degree 0, 2, 4. Here every ligand may move, so the field
       is rebuilt for any ligand positions from radial tables v_n(R) and a small exact sphere rule;
     - the host's stiffness: the ionic model (tools/ionic.mjs), the Hessian of the crystal's energy in the ligands'
       coordinates with everything else held, in a supercell big enough that the ligands are distinct ions;
     - one scale s on the field, fitted to Ti:sapphire's absorption (the point-charge field is known to fall short).
   The field's spherical part (n = 0) is left out of the forces: the d electron's monopole pull on the ligands is
   already in the ionic model, through the dopant's net charge; only the anisotropic parts (n = 2, 4) move the cage.
   Each state (the ground, the lowest level of the upper set) relaxes the cage: F(X) = s·λ_k(X) + ½XᵀKX is minimized
   over the ligand displacements X, which takes in Jahn–Teller distortions too. Then: absorption at the ground's
   geometry, emission at the excited state's, the zero-phonon line between the two minima, the Franck–Condon
   energies, the effective mode along the relaxation, its Huang–Rhys factor, and the bands' widths (T = 0, Gaussian).
   The host's highest Γ phonon (the ionic model's full Hessian, mass-weighted) sets the energy-gap count, and
   Λ = Stokes/(2 × absorption) the Dexter–Klick–Russell test (luminescence quenched past about ¼).
     node four/atom/tools/laser.mjs ti                 Ti³⁺ in sapphire: the check (only 10Dq is fitted)
     node four/atom/tools/laser.mjs bl [cell] [s]      element 26's 3+ (3d¹) on Bl₂Px₃, at Ti:sapphire's s (or s given)
   Prints JSON. Measured Ti:sapphire values are from memory and flagged. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { model, COMPOUNDS } from "./ionic.mjs";
import { dopant, sphere, gegen, project, HA } from "./crystalfield.mjs";
import { ion } from "./salt.mjs";
import { invM } from "./pwcheck.mjs";
import { harmonics } from "../js/pw.js";
import { R as GR, N as GN } from "../js/atom.js";
import { eigh, eigvals } from "../js/multiplet.js";

const here = path.dirname(fileURLToPath(import.meta.url)), AMU = 1822.888486;
const TISAPPH = { tenDq_eV: 2.4, absorption_eV: 2.5, emission_eV: 1.57, emissionFWHM_eV: 0.35, maxPhonon_eV: 0.11, note: "Ti:sapphire from memory, to verify: absorption 490 nm with a shoulder near 550 (10Dq ≈ 19 000 cm⁻¹), emission peak ≈ 790 nm, tuning 650–1100 nm, sapphire's highest phonon ≈ 900 cm⁻¹" };

/* the host: a crystalref cell, its ionic model, a supercell with the dopant site central and its ligands as distinct ions */
function hostOf(which, cell) {
  const [file, key, name] = which === "ti" ? ["crystalref-Al2O3.json", "corundum", "Al2O3"] : ["crystalref-Bl2Px3.json", cell, "Bl2Px3"];
  const st = JSON.parse(readFileSync(path.join(here, file), "utf8"))[key], C = COMPOUNDS[name], d = C.d, H = st.H, n0 = st.kinds.length;
  const M = model(name), x0 = st.s.map((f) => H[0].map((_, c) => f.reduce((t, v, b) => t + v * H[b][c], 0)));
  return { name, C, d, H, st, M, x0, kinds0: st.kinds, nf0: n0 / 5 };
}
function supercell(h, reps) {
  const { d, H, x0, kinds0 } = h, Hs = H.map((r, i) => r.map((v) => v * reps[i])), x = [], kinds = [], cellOf = [];
  const m = reps.map(() => 0); for (;;) { const t = H[0].map((_, c) => m.reduce((s2, v, i) => s2 + v * H[i][c], 0));
    x0.forEach((p, j) => { x.push(...p.map((v, c) => v + t[c])); kinds.push(kinds0[j]); cellOf.push(m.slice()); });
    let i = 0; while (i < d && m[i] === reps[i] - 1) { m[i] = 0; i++; } if (i === d) break; m[i]++; }
  return { Hs, x: Float64Array.from(x), kinds, cellOf, nf: kinds.length / 5 };
}
/* the minimum-image vector from atom a to atom b in the supercell */
function mi(S, d, a, b) { const Hi = invM(S.Hs), v = Array.from({ length: d }, (_, c) => S.x[b * d + c] - S.x[a * d + c]), f = v.map((_, j) => v.reduce((t, w, c) => t + w * Hi[c][j], 0)).map((u) => u - Math.round(u)); return S.Hs[0].map((_, c) => f.reduce((t, u, k) => t + u * S.Hs[k][c], 0)); }

/* the host's highest Γ phonon: the ionic model's Hessian in the primitive cell's coordinates, mass-weighted */
function maxPhonon(h) {
  const { d, H, x0, kinds0, M, C } = h, n = kinds0.length, x = Float64Array.from(x0.flat()), nf = n / 5, step = 2e-3, dim = n * d, K = Array.from({ length: dim }, () => new Float64Array(dim));
  for (let k = 0; k < dim; k++) { const xp = x.slice(), xm = x.slice(); xp[k] += step; xm[k] -= step; const gp = M.I.energy(H, xp, kinds0, nf, true).gx, gm = M.I.energy(H, xm, kinds0, nf, true).gx; for (let i = 0; i < dim; i++) K[i][k] = ((gp[i] - gm[i]) * nf) / (2 * step); }
  const mass = (i) => (kinds0[Math.floor(i / d)] ? C.ma : C.mc) * AMU, D = K.map((r, i) => Array.from(r, (v, j) => (v + K[j][i]) / 2 / Math.sqrt(mass(i) * mass(j))));
  const w2 = eigvals(D), w = w2.map((v) => Math.sign(v) * Math.sqrt(Math.abs(v)) * HA);
  return { max_eV: Math.max(...w), min_eV: Math.min(...w), modes: w.length };
}

/* the ligand field for any ligand vectors, from radial tables v_n(R) (the same projection crystalfield.mjs uses) */
function fieldModel(d, dq, q, c, Rlo, Rhi) {
  const NS = [0, 2, 4], lam = (d - 2) / 2, dR = 0.004, Rs = [], V = [];
  for (let R = Rlo; R <= Rhi + 1e-9; R += dR) { const acc = [0, 0, 0];
    for (let j = 0; j < GN; j++) { if (dq[j] < 1e-14) continue; const r = GR[j], vn = project(d, (t, omt) => { const s2 = (r - R) ** 2 + 2 * r * R * omt; return q / Math.sqrt(s2) + (c ? c / s2 ** 1.5 : 0); }, NS); for (let k = 0; k < 3; k++) acc[k] += dq[j] * vn[k]; }
    Rs.push(R); V.push(acc); }
  const vAt = (R) => { const u = (R - Rlo) / dR, i = Math.max(0, Math.min(Rs.length - 2, Math.floor(u))), f = u - i; return [0, 1, 2].map((k) => V[i][k] * (1 - f) + V[i + 1][k] * f); };
  const Y = harmonics(d, 2), m = Y.length, pts = sphere(d, 6), YY = pts.map((p) => { const y = Y.map((fn) => fn(p.u)), out = new Float64Array((m * (m + 1)) / 2); let k = 0; for (let i = 0; i < m; i++) for (let j = i; j < m; j++) out[k++] = p.w * y[i] * y[j]; return out; });
  /* H(X): X the ligands' vectors from the dopant, flat */
  const H = (X) => { const out = new Float64Array((m * (m + 1)) / 2), nl = X.length / d;
    for (let L = 0; L < nl; L++) { const v = X.slice(L * d, L * d + d), R = Math.hypot(...v), Rh = v.map((t) => t / R), vb = vAt(R);
      // n = 0, the d electron's spherical share, is left out: the ionic model already holds it in the dopant's net charge
      pts.forEach((p, s) => { const ct = p.u.reduce((t, x, i) => t + x * Rh[i], 0); let f = 0; for (let n = 1; n < 3; n++) f += vb[n] * gegen(lam, NS[n], ct); f = -f; const yy = YY[s]; for (let k = 0; k < out.length; k++) out[k] += f * yy[k]; }); }
    const A = Array.from({ length: m }, () => new Array(m).fill(0)); let k = 0; for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { A[i][j] = A[j][i] = out[k++]; } return A; };
  return { m, H, levels: (X) => eigvals(H(X)) };
}

/* minimize F(X) = s·λ_k(X0 + u) + ½uᵀKu over the ligand displacements u (BFGS, numerical gradient) */
function relaxState(FM, X0, K, s, k, { iters = 300, h = 1e-4 } = {}) {
  const n = X0.length, F = (u) => { const X = X0.map((v, i) => v + u[i]); let q = 0; for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < n; j++) t += K[i][j] * u[j]; q += u[i] * t; } return s * FM.levels(X)[k] + 0.5 * q; };
  const grad = (u) => Array.from({ length: n }, (_, i) => { const a = u.slice(), b = u.slice(); a[i] += h; b[i] -= h; return (F(a) - F(b)) / (2 * h); });
  let u = new Array(n).fill(0), g = grad(u), Hinv = invM(K.map((r) => Array.from(r))), f = F(u);
  for (let it = 0; it < iters; it++) {
    const p = Hinv.map((r) => -r.reduce((t, v, j) => t + v * g[j], 0)); let a = 1, un, fn; for (;;) { un = u.map((v, i) => v + a * p[i]); fn = F(un); if (fn < f || a < 1e-6) break; a /= 2; }
    const gn = grad(un), sv = un.map((v, i) => v - u[i]), y = gn.map((v, i) => v - g[i]), sy = sv.reduce((t, v, i) => t + v * y[i], 0);
    if (sy > 1e-14) { const Hy = Hinv.map((r) => r.reduce((t, v, j) => t + v * y[j], 0)), yHy = y.reduce((t, v, i) => t + v * Hy[i], 0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Hinv[i][j] += ((sy + yHy) * sv[i] * sv[j]) / (sy * sy) - (Hy[i] * sv[j] + sv[i] * Hy[j]) / sy; }
    const done = Math.abs(f - fn) < 1e-11 && Math.max(...gn.map(Math.abs)) < 1e-6; u = un; g = gn; f = fn; if (done) break; }
  return { u, F: f };
}

function analyse(which, cell, sGiven) {
  const t0 = Date.now(), h = hostOf(which, cell), { d, C, M } = h;
  // the dopant and its site: cation 0 of the cell
  const io = which === "ti" ? dopant(22, 3, "1s2 2s2 2p6 3s2 3p6 3d1") : dopant(26, 4, "1s2 2s2 2p8 3s2 3p8 3d1");
  let c = 0; if (d === 4) { const an = ion(C.an, 4, C.core, { watson: { q: 2, R: C.watson } }); let S = 0; for (let j = 0; j < GN; j++) S += an.Q[j] * GR[j] ** 2; c = S / 8; }
  // a supercell with the ligands distinct: each axis replicated so it is at least 3 × the ligand distance
  const reps = h.H.map((r) => Math.max(1, Math.ceil(11 / Math.hypot(...r)))), S = supercell(h, reps), n = S.kinds.length;
  const mid = reps.map((r) => Math.floor(r / 2)), dop = S.cellOf.findIndex((cc, i) => S.kinds[i] === 0 && cc.every((v, j) => v === mid[j]) && i % h.kinds0.length === 0);
  const an = []; for (let j = 0; j < n; j++) if (S.kinds[j] === 1) { const v = mi(S, d, dop, j); an.push({ j, v, r: Math.hypot(...v) }); }
  an.sort((a, b) => a.r - b.r); const lig = an.filter((a) => a.r < 1.25 * an[0].r), X0 = lig.flatMap((l) => l.v), nd = X0.length;
  // the cage's stiffness: the ionic Hessian in the ligands' coordinates, everything else held
  const x = S.x.slice(), step = 2e-3, K = Array.from({ length: nd }, () => new Float64Array(nd)), coord = lig.flatMap((l) => Array.from({ length: d }, (_, a) => l.j * d + a));
  const tk = Date.now();
  coord.forEach((ci, col) => { const xp = x.slice(), xm = x.slice(); xp[ci] += step; xm[ci] -= step; const gp = M.I.energy(S.Hs, xp, S.kinds, S.nf, true).gx, gm = M.I.energy(S.Hs, xm, S.kinds, S.nf, true).gx; coord.forEach((cj, row) => (K[row][col] = ((gp[cj] - gm[cj]) * S.nf) / (2 * step))); });
  for (let i = 0; i < nd; i++) for (let j = 0; j < i; j++) K[i][j] = K[j][i] = (K[i][j] + K[j][i]) / 2;
  const kEig = eigvals(K.map((r) => Array.from(r))), hessianS = (Date.now() - tk) / 1000;
  // the field
  const Rs = lig.map((l) => l.r), FM = fieldModel(d, io.q, -2, c, Math.min(...Rs) - 0.5, Math.max(...Rs) + 0.5), L0 = FM.levels(X0);
  const gaps = L0.slice(1).map((v, i) => v - L0[i]), g = gaps.indexOf(Math.max(...gaps)) + 1; // the lower set: below the widest gap
  const tenDq = (L0.slice(g).reduce((t, v) => t + v, 0) / (L0.length - g) - L0.slice(0, g).reduce((t, v) => t + v, 0) / g) * HA;
  const s = sGiven ?? (which === "ti" ? TISAPPH.tenDq_eV / tenDq : null);
  if (s == null) throw new Error("s: give it, or run `ti` first for Ti:sapphire's");
  const G = relaxState(FM, X0, K, s, 0), E = relaxState(FM, X0, K, s, g), at = (u) => FM.levels(X0.map((v, i) => v + u[i])), q = (u) => { let t = 0; for (let i = 0; i < nd; i++) { let r = 0; for (let j = 0; j < nd; j++) r += K[i][j] * u[j]; t += u[i] * r; } return 0.5 * t; };
  const Lg = at(G.u), Le = at(E.u), abs = s * (Lg[g] - Lg[0]) * HA, em = s * (Le[g] - Le[0]) * HA, zpl = (E.F - G.F) * HA;
  const fcE = (s * Lg[g] + q(G.u) - E.F) * HA, fcG = (s * Le[0] + q(E.u) - G.F) * HA;
  // the effective mode along the relaxation (the ligands' mass), its Huang–Rhys factors and the bands' widths
  const du = E.u.map((v, i) => v - G.u[i]), norm = Math.hypot(...du), e1 = du.map((v) => v / norm); let kEff = 0; for (let i = 0; i < nd; i++) for (let j = 0; j < nd; j++) kEff += e1[i] * K[i][j] * e1[j];
  const hw = Math.sqrt(kEff / (C.ma * AMU)) * HA, Se = fcE / hw, Sg = fcG / hw, ph = maxPhonon(h);
  return { host: which === "ti" ? "Ti³⁺ in sapphire (ours)" : `element 26's 3+ (3d¹) on Bl₂Px₃ ${cell}`, ligands: lig.map((l) => +l.r.toFixed(3)), supercell: { reps, ions: n }, cageStiffness_minEig: +kEig[0].toExponential(3), hessian_s: hessianS,
    pointCharge: { levels_eV: L0.map((v) => +((v - L0[0]) * HA).toFixed(4)), lowerSet: g, tenDq_eV: +tenDq.toFixed(4) }, s: +s.toFixed(4),
    absorption_eV: +abs.toFixed(3), emission_eV: +em.toFixed(3), stokes_eV: +(abs - em).toFixed(3), zeroPhonon_eV: +zpl.toFixed(3), franckCondon_eV: { excited: +fcE.toFixed(3), ground: +fcG.toFixed(3) },
    relaxation_bohr: { ground: +Math.hypot(...G.u).toFixed(4), excited: +Math.hypot(...E.u).toFixed(4) }, mode: { hw_eV: +hw.toFixed(4), S_absorption: +Se.toFixed(2), S_emission: +Sg.toFixed(2) },
    absorptionFWHM_eV: +(2.355 * Math.sqrt(Se) * hw).toFixed(3), emissionFWHM_eV: +(2.355 * Math.sqrt(Sg) * hw).toFixed(3),
    hostPhonon: { max_eV: +ph.max_eV.toFixed(4), min_eV: +ph.min_eV.toFixed(4) }, gapInPhonons: +(zpl / ph.max_eV).toFixed(1),
    // Dexter–Klick–Russell: Λ = Stokes / (2 × absorption); past about ¼ the excited curve crosses the ground's near its minimum and the light is quenched
    dkr: +((abs - em) / (2 * abs)).toFixed(3),
    levelsAtGround_eV: Lg.map((v) => +(s * (v - Lg[0]) * HA).toFixed(3)), levelsAtExcited_eV: Le.map((v) => +(s * (v - Le[0]) * HA).toFixed(3)), seconds: (Date.now() - t0) / 1000 };
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url), [cmd, a1, a2] = process.argv.slice(2);
if (main && cmd === "ti") console.log(JSON.stringify({ ...analyse("ti"), measured: TISAPPH }, null, 1));
else if (main && cmd === "bl") console.log(JSON.stringify(analyse("bl", a1 || "z2-0", a2 ? +a2 : null), null, 1));
else if (main) console.log("usage: laser.mjs ti | bl [cell] [s]");
