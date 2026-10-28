/* ATOM⁴ selftest: the solver against closed forms (hydrogen in both worlds, the sphere-averaged kernel), against
   known numbers (helium's Hartree–Fock energy), against our own periodic table (3D), and the baked table against
   the solver that made it. The field theory's closed forms too.
     node four/atom/test/atom4.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const A = await import(path.join(here, "../js/atom.js"));
const F = await import(path.join(here, "../js/fields.js"));
const P = await import(path.join(here, "../js/periodic.js"));
const { TABLE, RPLOT, SHELL_COUNTERFACTUAL } = await import(path.join(here, "../js/table.js"));
const { element, ZMAX } = await import(path.join(here, "../tools/bake.mjs"));
const G = await import(path.join(here, "../js/polytopes.js"));
const TL = await import(path.join(here, "../js/tile.js"));
const RT = await import(path.join(here, "../js/turning.js"));
const FF = await import(path.join(here, "../js/forces.js"));
const PR = await import(path.join(here, "../js/pairs.js"));
const PT = await import(path.join(here, "../tools/pairs.mjs"));
const OPT = await import(path.join(here, "../../lumen/js/optics.js"));
const fs = await import("node:fs");

let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const t0 = Date.now();
/* a seeded generator good enough for Monte Carlo (mulberry32), and normal deviates from it */
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = (rnd) => () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd());

/* 1 · one electron: hydrogen-like levels, both worlds, many (n, l), two charges */
for (const d of [3, 4]) {
  let worst = 0;
  for (const Z of [1, 3]) { const V = Float64Array.from(A.R, (r) => -Z / r); for (let n = 1; n <= 5; n++) for (let l = 0; l < Math.min(n, 4); l++) worst = Math.max(worst, Math.abs(A.solve(V, l, n - l - 1, d).e / A.hydrogen(Z, n, d) - 1)); }
  ok(worst < 2e-4, `${d}D hydrogen-like levels −Z²/2(n${d === 4 ? " + ½" : ""})² for n ≤ 5, every l, Z = 1 and 3 (worst relative error ${worst.toExponential(1)})`);
}
ok(near(A.hydrogen(1, 1, 4) * 27.211386, -6.0470, 1e-4), "4D hydrogen's ground state is bound by 6.05 eV");
{ // the mean radius of 4D hydrogen's ground state is 3 bohr (u² ∝ r³ e^(−4r/3)), ours 1.5
  const rm = (d) => { const q = A.solve(Float64Array.from(A.R, (r) => -1 / r), 0, 0, d).q; let s = 0, n = 0; for (let i = 0; i < A.N; i++) { s += q[i] * A.R[i]; n += q[i]; } return s / n; };
  ok(near(rm(3), 1.5, 1e-3) && near(rm(4), 3, 1e-3), `hydrogen's mean radius: 3D ${rm(3).toFixed(4)}, 4D ${rm(4).toFixed(4)} bohr`);
}
{ // a wavefunction is normalised, and the 2s of 4D hydrogen has one node
  const q = A.solve(Float64Array.from(A.R, (r) => -1 / r), 0, 1, 4).q; let s = 0; for (const v of q) s += v;
  ok(near(s, 1, 1e-9), "radial charge sums to one electron");
}

/* 2 · shells: (l + 1)² orbitals per l in 4D; shells of 1, 5, 14, 30, 55 orbitals */
ok([0, 1, 2, 3].every((l) => A.orbitals(l, 3) === 2 * l + 1 && A.orbitals(l, 4) === (l + 1) ** 2), "2l + 1 orbitals per l in 3D, (l + 1)² in 4D");
{ const sh = (n, d) => { let s = 0; for (let l = 0; l < n; l++) s += A.orbitals(l, d); return s; };
  ok([1, 2, 3, 4, 5].map((n) => sh(n, 4)).join() === "1,5,14,30,55" && [1, 2, 3, 4].map((n) => sh(n, 3)).join() === "1,4,9,16", "4D shells hold 1, 5, 14, 30, 55 orbitals (ours n²)"); }

/* 3 · the kernel: k(0) = 1, k(1) = 8/3π, k(t) = 1 − t²/8 + … (Legendre), and it really is the sphere average */
ok(A.k4(0) === 1 && near(A.k4(1), 8 / (3 * Math.PI), 1e-6), `k(1) = ${A.k4(1).toFixed(6)} = 8/3π`);
ok([0.02, 0.05, 0.1].every((t) => Math.abs(A.k4(t) - (1 - (t * t) / 8)) < 0.02 * t ** 4 + 1e-9), "k(t) = 1 − t²/8 + O(t⁴)");
{ // Monte Carlo: the mean of 1/|x − y| over y on the unit 3-sphere, x at radius t (seeded)
  const gauss = normal(rng(7));
  let worst = 0;
  for (const t of [0.3, 0.7]) { let s = 0; const M = 200000; for (let i = 0; i < M; i++) { const y = [gauss(), gauss(), gauss(), gauss()], n = Math.hypot(...y); s += 1 / Math.hypot(y[0] / n - t, y[1] / n, y[2] / n, y[3] / n); } worst = Math.max(worst, Math.abs(s / M - A.k4(t))); }
  ok(worst < 2e-3, `k(t) is the 3-sphere average of 1/r (Monte Carlo, worst ${worst.toExponential(1)})`);
}

/* 4 · many electrons: helium against Hartree–Fock (−2.86168, ε = −0.91796) */
{
  const occ = A.subshells(3).map(() => 0); occ[0] = 2; const r = A.scf(2, occ, 3);
  ok(near(r.E, -2.86168, 2e-5) && near(r.es[0], -0.91796, 1e-4), `helium: E = ${r.E.toFixed(5)}, ε1s = ${r.es[0].toFixed(5)} (Hartree–Fock −2.86168, −0.91796)`);
}

/* 5 · the baked table is complete, and what the solver gives now */
ok(TABLE[3].length === ZMAX[3] && TABLE[4].length === ZMAX[4] && TABLE[3].every((el, i) => el.Z === i + 1) && TABLE[4].every((el, i) => el.Z === i + 1), `the table holds Z = 1–${ZMAX[3]} in 3D and 1–${ZMAX[4]} in 4D`);
ok(RPLOT.length === TABLE[4][0].dens.length && TABLE[4].every((el) => el.dens.every((v) => v >= 0)), "every density sampled where RPLOT says, and never negative");
for (const d of [3, 4]) {
  const elec = TABLE[d].every((el) => el.orb.reduce((a, o) => a + o.o, 0) === el.Z), cap = TABLE[d].every((el) => el.orb.every((o) => o.o <= 2 * A.orbitals("spdf".indexOf(o.s.at(-1)), d)));
  ok(elec && cap, `${d}D: every atom has Z electrons, no subshell over capacity`);
  // the radial density integrates to about Z (it's sampled from 0.02 to 20 bohr, so a little is cut off)
  let worst = 0; for (const el of TABLE[d]) { let s = 0; for (let i = 1; i < RPLOT.length; i++) s += 0.5 * (el.dens[i] + el.dens[i - 1]) * (RPLOT[i] - RPLOT[i - 1]); worst = Math.max(worst, Math.abs(s / el.Z - 1)); }
  ok(worst < 0.08, `${d}D: each density integrates to its Z electrons, within the cut-off (worst ${(worst * 100).toFixed(1)}%)`);
}
{ // recompute a sample from scratch: the same configuration, energy and ionization as baked
  const sample = [[3, 7], [4, 7], [4, 13]];
  let bad = [];
  for (const [d, Z] of sample) { const e = element(Z, d), b = TABLE[d][Z - 1]; if (e.config !== b.config || !near(e.E, b.E, 1e-5) || !near(e.ion, b.ion, 1e-4)) bad.push(`${d}D ${Z}`); }
  ok(!bad.length, `the baked table is what the solver gives (${sample.map(([d, Z]) => `${d}D Z=${Z}`).join(", ")})${bad.length ? ": " + bad.join(", ") : ""}`);
}

/* 6 · the 3D check: the solver against our real periodic table */
{
  const miss = TABLE[3].filter((el) => el.config !== P.realConfig(el.Z)).map((el) => el.Z);
  ok(miss.join() === "22,23,27,28", `3D configurations match ours for 32 of Z = 1–36, chromium and copper included; misses Ti, V, Co, Ni, as the page says (misses: ${miss.join(", ") || "none"})`);
  ok(P.realConfig(24) === "1s2 2s2 2p6 3s2 3p6 3d5 4s1" && P.realConfig(26) === "1s2 2s2 2p6 3s2 3p6 3d6 4s2", "our real configurations, as written");
  const n3 = TABLE[3].filter((el) => P.isNoble(el, 3)).map((el) => el.Z);
  ok(n3.join() === "2,10,18,36", `3D noble gases ${n3.join(", ")}`);
  ok(!P.isNoble(TABLE[3][3], 3) && !P.isNoble(TABLE[3][29], 3) && !P.isNoble(TABLE[4][67], 4), "beryllium, zinc and 4D's palladium-like element 68 aren't noble gases");
  // ionization: the solver's peaks and troughs fall where the measured ones do
  const ie = TABLE[3].map((el) => el.ion * 27.211386), peaks = [2, 10, 18, 36].every((z) => ie[z - 1] > ie[z - 2] && (z === 36 || ie[z - 1] > ie[z]));
  const ratio = TABLE[3].map((el, i) => ie[i] / P.IE_REAL[i]).sort((a, b) => a - b), median = ratio[18];
  const mean = (x) => x.reduce((a, v) => a + v, 0) / x.length, ma = mean(ie), mb = mean(P.IE_REAL);
  const corr = ie.reduce((a, v, i) => a + (v - ma) * (P.IE_REAL[i] - mb), 0) / Math.sqrt(ie.reduce((a, v) => a + (v - ma) ** 2, 0) * P.IE_REAL.reduce((a, v) => a + (v - mb) ** 2, 0));
  ok(peaks && corr > 0.99 && median > 0.93 && median < 1 && ratio[0] > 0.8 && ratio.at(-1) < 1.06, `3D ionization peaks at the noble gases and follows the measured values (correlation ${corr.toFixed(3)}), within a few percent (median ${median.toFixed(3)}, range ${ratio[0].toFixed(2)}–${ratio.at(-1).toFixed(2)} of measured)`);
  ok(ie[6] > ie[7] && ie[14] > ie[15], "with exchange, the dips where a p shell passes half full are there: nitrogen to oxygen, phosphorus to sulphur");
  const lay = P.layout(TABLE, 3);
  ok(lay.W === 18 && lay.periods.map((p) => p.length).join() === "2,8,8,18", "3D layout: 18 columns, periods of 2, 8, 8, 18");
  const c = lay.cells; const at = (Z) => c.find((x) => x.el.Z === Z);
  ok(at(1).col === 1 && at(2).col === 18 && at(5).col === 13 && at(21).block === "d" && at(31).block === "p" && at(20).block === "s", "hydrogen over the alkalis, helium over the noble gases, boron in column 13, scandium in d, gallium in p");
}

/* 7 · the 4D table's shape */
{
  const n4 = TABLE[4].filter((el) => P.isNoble(el, 4)).map((el) => el.Z), lay = P.layout(TABLE, 4);
  ok(n4.join() === "2,12,22,50,78" && lay.periods.map((p) => p.length).join() === "2,10,10,28,28", `4D noble gases ${n4.join(", ")}, rows of 2, 10, 10, 28, 28 (s² p⁸ closes a ten-electron shell)`);
  ok(TABLE[4][6].config === "1s2 2s2 2p3" && /carbon-like/.test(P.role(TABLE[4][6], 4, lay.cells[6])), "element 7 is 4D's carbon: s² p³, five outer electrons, half a shell");
  ok(lay.cells.every((c) => c.col >= 1 && c.col <= lay.W) && new Set(lay.cells.map((c) => c.row * 100 + c.col)).size === lay.cells.length, `4D layout: ${lay.W} columns, no two elements in one cell`);
}

/* 8 · what the shell theorem's failure does: partial screening */
{
  const nob = (d) => TABLE[d].filter((el) => P.isNoble(el, d)), i3 = nob(3).map((el) => el.ion), i4 = nob(4).map((el) => el.ion), cf = SHELL_COUNTERFACTUAL;
  const falls = i3.every((v, i) => !i || v < i3[i - 1]), rises = i4.at(-1) > 1.2 * i4[1] && i4.slice(1).every((v, i) => !i || v > 0.95 * i4[i]);
  ok(falls && rises, `noble gases: 3D ionization falls down the column, 4D's rises overall from row 2 (${i4.map((v) => (v * 27.2114).toFixed(1)).join(", ")} eV)`);
  ok(cf.length === i4.length && cf.every((c, i) => c.Z === nob(4)[i].Z) && cf.slice(1).every((c, i) => c.ion < 0.6 * i4[i + 1]) && Math.max(...cf.slice(1).map((c) => c.ion)) < 1.15 * Math.min(...cf.slice(1).map((c) => c.ion)),
    `with the shell theorem forced on, 4D's noble gases sit flat and about half as tight (${cf.map((c) => (c.ion * 27.2114).toFixed(1)).join(", ")} eV)`);
  // a neutral atom from outside: 4D pulls with −Σr²/8s³; 3D with nothing
  const far = (Z, d, occIdx) => {
    const sh = A.subshells(d), occ = sh.map((s, i) => occIdx[i] || 0), g = A.scf(Z, occ, d, { iters: 60 }), Q = new Float64Array(A.N);
    for (const i in occIdx) for (let j = 0; j < A.N; j++) Q[j] += occ[i] * g.qs[i][j];
    const i = Math.round(Math.log(20 / A.R0) / A.H), V = A.hartree(A.kernel(d), Q)[i] - Z / A.R[i]; let r2 = 0; for (let j = 0; j < A.N; j++) r2 += Q[j] * A.R[j] ** 2;
    return { V, pred: -r2 / (8 * A.R[i] ** 3) };
  };
  const f4 = far(12, 4, { 0: 2, 1: 2, 2: 8 }), f3 = far(10, 3, { 0: 2, 1: 2, 2: 6 });
  ok(near(f4.V, f4.pred, 0.01) && Math.abs(f3.V) < 1e-10, `a neutral atom 20 bohr away: 4D element 12 pulls with ${f4.V.toExponential(3)} (−Σr²/8s³ = ${f4.pred.toExponential(3)}); neon ${f3.V.toExponential(1)}`);
}

/* 9 · the field theory */
{
  ok(F.propagatorPower(1, 3) === 1 && F.propagatorPower(2, 4) === 1 && F.propagatorPower(1, 4) === 1.5, "Maxwell's 1/k² gives 1/r in 3D and 1/r² in 4D; 1/r in 4D needs 1/k³");
  ok(F.unitary(1, 3) && F.unitary(1, 4) && !F.unitary(1.5, 4) && F.scalingDim(1.5, 4) === 1 && F.unitarityFloor(4) === 1.5, "a = 1 meets the unitarity bound in any dimension; a = 3/2 in 4+1 has Δ = 1 < 3/2");
  ok(F.laplacianPowerCoeff(-1, 3) === 0 && F.laplacianPowerCoeff(-1, 4) === -1 && F.laplacianPowerCoeff(-2, 4) === 0 && F.fluxGrowth(3) === 0 && F.fluxGrowth(4) === 1, "1/r is harmonic in 3D, not in 4D (∇² 1/r = −1/r³), where 1/r² is; its flux grows as r");
  // the shell theorem, by brute force: average the point potential over a sphere and compare with shellPotential
  let worst3 = 0, worst4 = 0; const gauss = normal(rng(11));
  for (const s of [0.4, 1.7]) for (const d of [3, 4]) { let m = 0; const M = 100000; for (let i = 0; i < M; i++) { const y = Array.from({ length: d }, gauss), n = Math.hypot(...y); y[0] = y[0] / n - s; for (let k = 1; k < d; k++) y[k] /= n; m += 1 / Math.hypot(...y); } const e = Math.abs(m / M - F.shellPotential(s, 1, d)); if (d === 3) worst3 = Math.max(worst3, e); else worst4 = Math.max(worst4, e); }
  ok(worst3 < 3e-3 && worst4 < 3e-3, `a charged sphere's potential, by brute-force averaging: 3D flat inside and 1/s outside, 4D k (worst ${Math.max(worst3, worst4).toExponential(1)})`);
  ok(near(F.SHELL_CENTRE_OVER_WALL, (3 * Math.PI) / 8, 1e-6) && F.shellPotential(0, 1, 4) > F.shellPotential(0.9, 1, 4), "inside a charged 4D shell the potential is 3π/8 higher at the centre: no Faraday cage");
  ok(F.nonlinearExponent(4) === 2.5 && F.nonlinearExponent(3) === 2, "the nonlinear route needs m = 5/2 in 4D (m = 2, plain Gauss, in 3D)");
  const k = 2, ell = 0.5, dk = 1e-6, vg = (F.lightOmega(k + dk, ell) - F.lightOmega(k - dk, ell)) / (2 * dk);
  ok(near(F.lightOmega(k, ell) / k, F.phaseSpeed(k, ell), 1e-12) && near(vg, F.groupSpeed(k, ell), 1e-6) && F.phaseSpeed(0.01, 1) > 1, "with ε(k) = ℓk light goes as ω = √(k/ℓ): group speed half the phase speed, long waves faster than c");
  // the compact dimension against the image sum, and its two limits
  const img = (r, ell) => { let s = 1 / (r * r); for (let n = 1; n < 200000; n++) s += 2 / (r * r + n * n * ell * ell); return s + (2 / (ell * ell)) / 200000; };
  ok(near(F.compactPotential(0.3, 1), img(0.3, 1), 1e-5) && near(F.compactPotential(0.001, 1) * 1e-6, 1, 1e-5) && near((F.compactPotential(50, 1) * 50) / Math.PI, 1, 1e-6), "a small fourth dimension: the image sum, 1/r² close, π/ℓr far");
  ok(F.circularOrbitStable(2) && !F.circularOrbitStable(3) && near(F.bondAngle(3), 109.4712, 1e-6) && near(F.bondAngle(4), 104.4775, 1e-6), "circular orbits stable under 1/r² forces, not 1/r³; simplex bond angles 109.47° and 104.48°");
}

/* 10 · the six regular 4D polytopes: Schläfli's counts, computed (vertices, least-distance edges, planar cycles as
   faces, the dual's directions as cells) */
{
  const want = { "5-cell": [5, 10, 10, 5, 4, 4], tesseract: [16, 32, 24, 8, 8, 4], "16-cell": [8, 24, 32, 16, 4, 6], "24-cell": [24, 96, 96, 24, 6, 8], "120-cell": [600, 1200, 720, 120, 20, 4], "600-cell": [120, 720, 1200, 600, 4, 12] };
  const ps = G.polytopes(), bad = [];
  for (const p of ps) {
    const [v, e, f, c, cv, deg] = want[p.name], degs = new Array(p.V.length).fill(0); for (const [a, b] of p.E) { degs[a]++; degs[b]++; }
    const len = p.E.map(([a, b]) => Math.hypot(...p.V[a].map((x, i) => x - p.V[b][i]))), unit = p.V.every((x) => Math.abs(Math.hypot(...x) - 1) < 1e-9);
    const okp = p.V.length === v && p.E.length === e && p.F.length === f && p.C.length === c && p.C.every((x) => x.length === cv) && degs.every((x) => x === deg) && unit && Math.max(...len) - Math.min(...len) < 1e-9 && v - e + f - c === 0;
    if (!okp) bad.push(`${p.name}: ${p.V.length}, ${p.E.length}, ${p.F.length}, ${p.C.length}`);
  }
  ok(!bad.length && ps.length === 6, `the six: f-vectors, cells, vertex degrees, equal edges, on the unit 3-sphere, V − E + F − C = 0${bad.length ? " — " + bad.join("; ") : ""}`);
  // each cell is a 3D solid: its vertices span exactly 3 dimensions
  ok(ps.every((p) => p.C.every((cell) => G.rank(cell.slice(1).map((i) => p.V[i].map((x, k) => x - p.V[cell[0]][k]))) === 3)), "every cell lies flat in a 3D hyperplane");
}

/* 11 · darbon's geometry */
{
  for (const d of [2, 3, 4]) { const e = G.simplex(d); let worst = 0; for (let i = 0; i < e.length; i++) for (let j = 0; j < e.length; j++) worst = Math.max(worst, Math.abs(e[i].reduce((s, v, k) => s + v * e[j][k], 0) - (i === j ? 1 : -1 / d))); ok(worst < 1e-12 && e.length === d + 1, `${d}D simplex: ${d + 1} unit vectors at cos θ = −1/${d}`); }
  // sp^d hybrids: rows (a, b e_i) over (s, p₁ … p_d) are orthonormal
  for (const d of [3, 4]) { const { s: a, p: b } = G.hybrid(d), e = G.simplex(d), H = e.map((v) => [a, ...v.map((x) => b * x)]); let worst = 0; for (let i = 0; i < H.length; i++) for (let j = 0; j < H.length; j++) worst = Math.max(worst, Math.abs(H[i].reduce((s, v, k) => s + v * H[j][k], 0) - (i === j ? 1 : 0))); ok(worst < 1e-12 && Math.abs(a * a - 1 / (d + 1)) < 1e-12, `sp${d === 3 ? "³" : "⁴"}: ${d + 1} orthonormal hybrids, each 1/${d + 1} s`); }
  ok(Math.abs(G.bondAngleDeg(4) - 104.4775) < 1e-4 && G.chainH(1, 4) === 4 && G.chainH(2, 4) === 6 && G.chainH(1, 5) === 5 && G.chainH(2, 5) === 8 && G.chainH(10, 5) === 32, "DH₅, D₂H₈; chains of n darbons carry 3n + 2 hydrogens");
  // the diamond family: every bond of length 1; interior atoms have d + 1 bonds at cos −1/d; nothing else within 1.5
  for (const d of [2, 3, 4]) {
    const n = G.diamondNet(d, 2.4), A = n.nodes.map(() => []); for (const [a, b] of n.bonds) { A[a].push(b); A[b].push(a); }
    const dist = (a, b) => Math.hypot(...n.nodes[a].p.map((x, i) => x - n.nodes[b].p[i]));
    const lens = n.bonds.every(([a, b]) => Math.abs(dist(a, b) - 1) < 1e-9), inner = n.nodes.map((x, i) => i).filter((i) => Math.hypot(...n.nodes[i].p.map((x, k) => x - n.centre[k])) < 1.2);
    const angles = inner.every((i) => A[i].length === d + 1 && A[i].every((j) => A[i].every((k) => j === k || Math.abs(n.nodes[j].p.map((x, q) => x - n.nodes[i].p[q]).reduce((s, v, q) => s + v * (n.nodes[k].p[q] - n.nodes[i].p[q]), 0) + 1 / d) < 1e-9)));
    let near = Infinity; const bonded = new Set(n.bonds.map(([a, b]) => `${a}-${b}`)); for (let a = 0; a < n.nodes.length; a++) for (let b = a + 1; b < n.nodes.length; b++) if (!bonded.has(`${a}-${b}`)) near = Math.min(near, dist(a, b));
    ok(lens && inner.length > 0 && angles && near > 1.5, `${["", "", "honeycomb", "diamond", "darbon's diamond"][d]}: bonds of 1, ${d + 1} at ${G.bondAngleDeg(d).toFixed(2)}°, the next atom ${near.toFixed(3)} away`);
  }
  // a simplex in a hypercube: the cube holds exactly two regular tetrahedra; the tesseract no regular 5-cell
  const regularSubsets = (V, k) => { let count = 0; const pick = (start, chosen) => { if (chosen.length === k) { const ds = []; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) ds.push(Math.hypot(...V[chosen[i]].map((x, q) => x - V[chosen[j]][q]))); if (Math.max(...ds) - Math.min(...ds) < 1e-9) count++; return; } for (let i = start; i < V.length; i++) pick(i + 1, [...chosen, i]); }; pick(0, []); return count; };
  const cube = [], tess = []; for (let m = 0; m < 8; m++) cube.push([0, 1, 2].map((b) => (m >> b) & 1)); for (let m = 0; m < 16; m++) tess.push([0, 1, 2, 3].map((b) => (m >> b) & 1));
  ok(regularSubsets(cube, 4) === 2 && regularSubsets(tess, 5) === 0, "a cube holds two regular tetrahedra; a tesseract holds no regular 5-cell");
  // chirality: the map sending each corner of the simplex to another is a rotation exactly when the shuffle is even
  const det = (M) => { const n = M.length, A = M.map((r) => r.slice()); let D = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) return 0; if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; D = -D; } D *= A[c][c]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } } return D; };
  const inv = (M) => { const n = M.length, A = M.map((r, i) => [...r, ...M.map((_, j) => (i === j ? 1 : 0))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; const d0 = A[c][c]; A[c] = A[c].map((v) => v / d0); for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; A[r] = A[r].map((v, k) => v - f * A[c][k]); } } return A.map((r) => r.slice(n)); };
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  for (const d of [3, 4]) {
    const e = G.simplex(d), cols = (idx) => e[0].map((_, r) => idx.map((i) => e[i][r])), base = cols([...Array(d).keys()]), Binv = inv(base);
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
    let agree = 0, total = 0;
    for (const p of perms([...Array(d + 1).keys()])) { const M = mul(cols(p.slice(0, d)), Binv); let inv2 = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv2++; total++; if (Math.abs(det(M) - (inv2 % 2 ? -1 : 1)) < 1e-9) agree++; }
    ok(agree === total, `${d}D: the ${total} shuffles of a simplex's corners are rotations exactly when even (so ${d === 3 ? "carbon" : "darbon"} with ${d + 1} different neighbours is chiral)`);
  }
  // half a turn through w is a mirror for anything flat in w; and darbon's diamond has a five-fold rotation
  const half = TL.turnLocal(TL.eye(), 0, 3, Math.PI), pts = [[0.3, -0.7, 0.2, 0], [-1, 0.5, 0.9, 0]];
  ok(pts.every((p) => { const q = TL.apply(half, p); return Math.abs(q[0] + p[0]) < 1e-12 && Math.abs(q[1] - p[1]) < 1e-12 && Math.abs(q[2] - p[2]) < 1e-12 && Math.abs(q[3]) < 1e-12; }), "half a turn through w carries a 3D object (w = 0) into its mirror image x → −x");
  { const e = G.simplex(4), cols = (idx) => e[0].map((_, r) => idx.map((i) => e[i][r])), R5 = mul(cols([1, 2, 3, 4]), inv(cols([0, 1, 2, 3]))); let P = R5; for (let k = 1; k < 5; k++) P = mul(P, R5);
    const RRt = mul(R5, R5[0].map((_, j) => R5.map((r) => r[j]))); ok(Math.abs(det(R5) - 1) < 1e-9 && P.every((r, i) => r.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-9)) && RRt.every((r, i) => r.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-9)), "cycling darbon's five bond directions is a rotation of order 5: a five-fold symmetry of its diamond"); }
}

/* 12 · the lens vacuum: light keeps c, statics are 1/r, matter feels light at c/ℓω, scattering goes as ω³ */
{
  const ks = [0.01, 0.3, 1, 7, 120], ell = 0.37;
  ok(ks.every((k) => Math.abs(F.lensOmega(k, ell) - k) < 1e-12), "the lens vacuum: ω = ck at every wavelength (εμ = 1 though each varies)");
  ok(F.LENS_STATIC_POWER === F.propagatorPower(1, 4) && Math.abs(F.lensFactor(2, 0.5) - 1) < 1e-12 && ks.every((k) => F.lensEps(k, ell) > 0 && F.lensMu(k, ell) > 0), "statics 1/(ℓk³) = the pinned 1/r; both responses positive, so the energy is");
  ok(F.scatterExponent(3, false) === 4 && F.scatterExponent(4, false) === 5 && F.scatterExponent(4, true) === 3, "small particles scatter as ω⁴ here, ω⁵ in 4D Maxwell, ω³ through the lens");
}

/* 13 · motion and spin */
{
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1, six = () => [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
  let worstC = 0, worstClose = 0, worstSplit = 0;
  for (let t = 0; t < 20; t++) {
    const A = RT.bivector(six()), B = RT.bivector(six());
    worstC = Math.max(worstC, ...RT.commutator(RT.leftPart(A), RT.rightPart(B)).flat().map(Math.abs));
    worstClose = Math.max(worstClose, ...RT.rightPart(RT.commutator(RT.leftPart(A), RT.leftPart(B))).flat().map(Math.abs));
    worstSplit = Math.max(worstSplit, ...A.map((r, i) => r.map((v, j) => Math.abs(v - RT.leftPart(A)[i][j] - RT.rightPart(A)[i][j]))).flat());
  }
  ok(worstC < 1e-12 && worstClose < 1e-12 && worstSplit < 1e-12, "every 4D turn is a left half plus a right half; the halves commute, and each closes on itself: so(4) = so(3) ⊕ so(3)");
  const simple = RT.bivector([1, 0, 0, 0, 0, 0]), leftIso = RT.bivector([1, 0, 0, 0, 0, 1]), rightIso = RT.bivector([1, 0, 0, 0, 0, -1]), n = (v) => Math.hypot(...v);
  ok(n(RT.leftVector(simple)) === 1 && n(RT.leftVector(leftIso)) === 2 && n(RT.leftVector(rightIso)) === 0 && n(RT.rightVector(leftIso)) === 0 && RT.spinRate(1, 1) === 2 && RT.spinRate(1, -1) === 0, "the spin's share: a simple turn 1, left-isoclinic 2, right-isoclinic 0");
  // a Dirac electron in 4 + 1: Euclidean γ₁…γ₄, and time's γ₀ must be their product; its +1 half carries one so(3) only
  const c = (re, im = 0) => [re, im], cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const kron = (A, B) => { const n2 = A.length * B.length, out = []; for (let i = 0; i < n2; i++) { out.push([]); for (let j = 0; j < n2; j++) out[i].push(cm(A[Math.floor(i / B.length)][Math.floor(j / B.length)], B[i % B.length][j % B.length])); } return out; };
  const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => { const p = cm(v, B[k][j]); return [s[0] + p[0], s[1] + p[1]]; }, [0, 0])));
  const lc = (A, B, a, b) => A.map((r, i) => r.map((v, j) => [a * v[0] + b * B[i][j][0], a * v[1] + b * B[i][j][1]]));
  const I2 = [[c(1), c(0)], [c(0), c(1)]], s1 = [[c(0), c(1)], [c(1), c(0)]], s2 = [[c(0), c(0, -1)], [c(0, 1), c(0)]], s3 = [[c(1), c(0)], [c(0), c(-1)]];
  const g = [kron(s1, s1), kron(s1, s2), kron(s1, s3), kron(s2, I2)], I4 = kron(I2, I2), size = (A) => Math.max(...A.flat().map((v) => Math.hypot(v[0], v[1])));
  let cliff = 0; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) cliff = Math.max(cliff, size(lc(lc(mm(g[a], g[b]), mm(g[b], g[a]), 1, 1), I4, 1, a === b ? -2 : 0)));
  const G = mm(mm(g[0], g[1]), mm(g[2], g[3]));
  const anti = Math.max(...g.map((x) => size(lc(mm(G, x), mm(x, G), 1, 1))));
  ok(cliff < 1e-12 && size(lc(mm(G, G), I4, 1, -1)) < 1e-12 && anti < 1e-12, "γ₁γ₂γ₃γ₄ squares to 1 and anticommutes with each γ: it is time's γ₀, so a slow electron is one chirality of space");
  const Sg = (a, b) => lc(mm(g[a], g[b]), mm(g[b], g[a]), 0.25, -0.25), P = lc(I4, G, 0.5, 0.5), Q = lc(I4, G, 0.5, -0.5);
  const L = [lc(Sg(0, 1), Sg(2, 3), 1, 1), lc(Sg(0, 2), Sg(3, 1), 1, 1), lc(Sg(0, 3), Sg(1, 2), 1, 1)], Rg = [lc(Sg(0, 1), Sg(2, 3), 1, -1), lc(Sg(0, 2), Sg(3, 1), 1, -1), lc(Sg(0, 3), Sg(1, 2), 1, -1)];
  const onP = (fam) => Math.max(...fam.map((X) => size(mm(X, P)))), onQ = (fam) => Math.max(...fam.map((X) => size(mm(X, Q))));
  const handed = (onP(L) > 0.5 && onP(Rg) < 1e-12 && onQ(L) < 1e-12 && onQ(Rg) > 0.5) || (onP(Rg) > 0.5 && onP(L) < 1e-12 && onQ(Rg) < 1e-12 && onQ(L) > 0.5);
  ok(handed && size(lc(mm(Sg(0, 1), Sg(0, 1)), I4, 1, 0.25)) < 1e-12, "on the electron's half one set of three turns acts and the other is zero: its spin is handed; Σ₀₁² = −¼, so a full turn in one plane is −1");
  // shells and fine structure
  ok([0, 1, 2, 3, 4].every((l) => RT.harmonicDim(l) === A.orbitals(l, 4) && RT.harmonicDim(l, 3) === A.orbitals(l, 3)) && [0, 1, 2, 3].every((l) => RT.fineSplit(l).reduce((a, b) => a + b, 0) === 2 * (l + 1) ** 2), "orbitals are harmonic polynomials ((l + 1)² in 4D, 2l + 1 in 3D); fine structure splits 2(l + 1)² into (l + 1)(l + 2) + l(l + 1)");
  // orbits: planar, Runge–Lenz kept, closed under 1/r; Gauss's force loses a nudged circle
  let st = { x: [1, 0.2, -0.3, 0.4], v: [0.1, 0.8, 0.3, -0.2] }; const A0 = RT.rungeLenz(st), pts = [];
  for (let i = 0; i < 60000; i++) { st = RT.orbitStep(st, 1e-3, 2); if (i % 500 === 0) pts.push(st.x); }
  const drift = Math.max(...RT.rungeLenz(st).map((v, i) => Math.abs(v - A0[i]))), planar = G4rank(pts);
  const spread = (q) => { let s2 = { x: [1, 0, 0, 0], v: [0, 1.01, 0, 0] }, mx = 1; for (let i = 0; i < 60000; i++) { s2 = RT.orbitStep(s2, 1e-3, q); mx = Math.max(mx, Math.hypot(...s2.x)); } return mx; };
  ok(drift < 1e-4 && planar === 2 && spread(2) < 1.1 && spread(3) > 3, `orbits: in one plane, Runge–Lenz kept (drift ${drift.toExponential(1)}); a nudged circle stays near (${spread(2).toFixed(3)}) under 1/r and flies off under Gauss (${spread(3).toFixed(1)})`);
  // a free rigid body keeps its energy and both Casimirs
  let M = RT.bivector([0.3, 1.0, -0.2, 0.5, 0.7, -0.4]); const j = [1, 1.6, 2.3, 3.1], e0 = RT.bodyEnergy(M, j), t0 = RT.trace2(M), p0 = RT.pfaffian(M);
  for (let i = 0; i < 5000; i++) M = RT.bodyStep(M, j, 2e-3);
  ok(Math.abs(RT.bodyEnergy(M, j) - e0) < 1e-9 && Math.abs(RT.trace2(M) - t0) < 1e-9 && Math.abs(RT.pfaffian(M) - p0) < 1e-9, "a tumbling 4D body keeps its energy, tr M² and its Pfaffian");
  ok(RT.twistAngles(3) === 1 && RT.twistAngles(4) === 3, "a bond twists one way in 3D, three ways in 4D");
}
function G4rank(pts) { return G.rank(pts.slice(1).map((p) => p.map((v, i) => v - pts[0][i]))); }

/* 14 · the chapters: the landing and every chapter its nav lists, the same nav on each, no id twice, every drawing's
   element somewhere; and every "chapter N" a link to that chapter, carrying its number */
{
  const dir = path.join(here, ".."), landing = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const order = [...(landing.match(/<nav class="chapters">([\s\S]*?)<\/nav>/) || [, ""])[1].matchAll(/href="(\w+)\.html"/g)].map((m) => m[1]);
  const pages = ["index", ...order], html = Object.fromEntries(pages.map((p) => [p, fs.readFileSync(path.join(dir, p + ".html"), "utf8")]));
  let refsOk = 0, refsBad = [];
  for (const p of pages) { const body = html[p].slice(html[p].indexOf("</head>")).replace(/<h2>ATOM⁴ · chapter \d+<\/h2>/, "");
    const linked = [...body.matchAll(/<a href="(\w+)\.html[^"]*">[Cc]hapter (\d+)/g)];
    for (const m of linked) if (order.indexOf(m[1]) + 1 === +m[2]) refsOk++; else refsBad.push(`${p}: ${m[1]} as ${m[2]}`);
    const loose = (body.match(/[Cc]hapter \d+/g) || []).length - linked.length; if (loose) refsBad.push(`${p}: ${loose} unlinked`); }
  if (/[Cc]hapter \d/.test(fs.readFileSync(path.join(dir, "js/main.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""))) refsBad.push("main.js writes a chapter number; use chap()");
  ok(!refsBad.length && refsOk > 10, `chapter references: ${refsOk} links, each with its chapter's number${refsBad.length ? "; wrong: " + refsBad.join(", ") : ""}`);
  const navOf = (h) => (h.match(/<nav class="chapters">([\s\S]*?)<\/nav>/) || [, ""])[1].replace(/ class="here"| here/g, "");
  const ids = (h) => [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const sameNav = pages.every((p) => navOf(html[p]) === navOf(html.index) && navOf(html.index).length > 0), noDup = pages.every((p) => new Set(ids(html[p])).size === ids(html[p]).length);
  const main = fs.readFileSync(path.join(dir, "js/main.js"), "utf8"), want = [...main.matchAll(/\["(\w+)", draw\w+\]/g)].map((m) => m[1]), all = new Set(pages.flatMap((p) => ids(html[p])));
  const linked = pages.slice(1).every((p) => html.index.includes(`href="${p}.html"`));
  ok(sameNav && noDup && want.length >= 12 && want.every((id) => all.has(id)) && linked, `the chapters: the same nav on all ${pages.length} pages, no id twice, all ${want.length} drawings have their element, the landing links every chapter`);
}

/* 15 · forces between molecules */
{
  // the Fourier constants: 1/k³ ↔ 1/r (the pin), |k| ↔ −3/(4π²R⁵), |k|³ ↔ 45/(4π² r⁷)
  ok(Math.abs(FF.ftPowerConst(-3) * 4 * Math.PI ** 2 - 1) < 1e-12 && Math.abs(FF.ftPowerConst(1) + 3 / (4 * Math.PI ** 2)) < 1e-12 && Math.abs(FF.ftPowerConst(3) - 45 / (4 * Math.PI ** 2)) < 1e-12, "4D transforms: 4π²/|k|³ is 1/r, |k| is −3/4π²R⁵, |k|³ is 45/4π²r⁷");
  // the permanent R⁻⁵ against two model atoms integrated exactly
  const Z = 2, sg = 0.5, S = Z * 4 * sg * sg, rat = (R) => FF.gaussianPairExact(R, Z, sg) / (-FF.permanentB(S, S) / R ** 5);
  const r6 = rat(6), r8 = rat(8), r12 = rat(12);
  ok(r12 > 1 && r12 < 1.02 && r8 > r12 && r6 > r8 && Math.abs(rat(4) - 1.14) < 0.02 && FF.permanentB(S, S, 3) === 0, `two neutral model atoms, exactly: ${r6.toFixed(3)}, ${r8.toFixed(3)}, ${r12.toFixed(3)} × −3S²/64R⁵ at 12, 16, 24 cloud-widths… closing on 1; nothing in 3D`);
  // London's factor: two coupled isotropic oscillators, diagonalized
  const jacobi = (A) => { const n = A.length; A = A.map((r) => r.slice()); for (let sw = 0; sw < 100; sw++) { let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { off += A[p][q] ** 2; if (Math.abs(A[p][q]) < 1e-15) continue; const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c; for (let k = 0; k < n; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; } for (let k = 0; k < n; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; } } if (off < 1e-28) break; } return A.map((r, i) => r[i]); };
  const drude = (d) => { const q = 0.3, R = 6, n = 2 * d, K = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))); for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { const T = ((i === j ? 1 : 0) - 3 * (i === 0) * (j === 0)) / R ** 3; K[i][d + j] += q * q * T; K[d + j][i] += q * q * T; } const shift = jacobi(K).reduce((s, l) => s + 0.5 * (Math.sqrt(l) - 1), 0); return shift / (-FF.londonC6(q * q, q * q, 1, 1, d) / R ** 6); };
  ok(Math.abs(drude(3) - 1) < 1e-5 && Math.abs(drude(4) - 1) < 1e-5 && FF.traceT2(3) === 6 && FF.traceT2(4) === 7, `dispersion: coupled oscillators match London's 3/2 in 3D and 7/4 in 4D (${drude(3).toFixed(7)}, ${drude(4).toFixed(7)})`);
  // the numbers the page states: element 12 at neon's spacing, 16×; element 22 at argon's, 9×
  const vs = (Zz, gas) => { const el = TABLE[4][Zz - 1], B = FF.permanentB(FF.sumR2(el), FF.sumR2(el)), m = FF.MEASURED_LJ[gas], r = 2 ** (1 / 6) * m.sigma; return { x: B / r ** 5 / m.eps, need: B * r }; };
  const a = vs(12, "Ne"), b = vs(22, "Ar");
  ok(Math.round(a.x) === 14 && Math.round(b.x) === 7, `the permanent pull at our gases' spacing: element 12 ${a.x.toFixed(1)}× neon's well (the landing says about 14), element 22 ${b.x.toFixed(1)}× argon's`);
  ok(TABLE[4].every((el) => el.orb.every((o) => o.r2 >= o.r * o.r - 1e-6)), "every orbital's ⟨r²⟩ ≥ ⟨r⟩² (the baked ⟨r²⟩ is consistent)");
  // twisting: staggered (inverted) is the least energy over random twists; eclipsed the most
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const quat = () => { let a = rnd(), b2 = rnd(), c = rnd(), d = rnd(); const n = Math.hypot(a, b2, c, d); a /= n; b2 /= n; c /= n; d /= n; return [[1 - 2 * (c * c + d * d), 2 * (b2 * c - a * d), 2 * (b2 * d + a * c)], [2 * (b2 * c + a * d), 1 - 2 * (b2 * b2 + d * d), 2 * (c * d - a * b2)], [2 * (b2 * d - a * c), 2 * (c * d + a * b2), 1 - 2 * (b2 * b2 + c * c)]]; };
  const { near, staggered } = FF.bondEnds(4), I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], eS = FF.twistEnergy(near, staggered, I3, 1), eE = FF.twistEnergy(near, near, I3, 1);
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < 20000; i++) { const e = FF.twistEnergy(near, staggered, quat(), 1); lo = Math.min(lo, e); hi = Math.max(hi, e); }
  const tet = near.every((u, i) => near.every((v, j) => i === j || Math.abs(u.reduce((s, x, k) => s + x * v[k], 0) / (Math.hypot(...u) * Math.hypot(...v)) + 1 / 3) < 1e-9));
  ok(tet && eS <= lo + 1e-12 && eE >= hi - 1e-12, "across a 4D bond each end's other bonds are a regular tetrahedron; inverted (staggered) is the least energy of 20,000 twists, eclipsed the most");
  ok(FF.saltTail(1) < 0 && Math.abs(FF.saltTail(1) + 45 / (16 * Math.PI ** 4)) < 1e-12 && Math.abs(FF.bornMayerBeta(0.5) - 2) < 1e-12, "salt's tail −45/(16π⁴λ²r⁷), overscreened; β = 2√(2I)");
}

/* 16 · what the universe contains: atoms don't collapse (Thomas–Fermi's Z^(5/2) in 4D, Z^(7/3) in 3D) */
{
  const slope = (d, a, b) => { const xs = [], ys = []; for (const el of TABLE[d]) if (el.Z >= a && el.Z <= b) { xs.push(Math.log(el.Z)); ys.push(Math.log(-el.E)); } const n = xs.length, mx = xs.reduce((q, v) => q + v, 0) / n, my = ys.reduce((q, v) => q + v, 0) / n; return xs.reduce((q, v, i) => q + (v - mx) * (ys[i] - my), 0) / xs.reduce((q, v) => q + (v - mx) ** 2, 0); };
  const p4 = slope(4, 30, 78), p3 = slope(3, 10, 36);
  ok(p4 > 2.45 && p4 < 2.62 && p3 > 2.3 && p3 < 2.45, `total energies grow as Z^p: p = ${p4.toFixed(3)} in 4D (Thomas–Fermi 5/2), ${p3.toFixed(3)} in 3D (7/3, from above)`);
}

/* 17 · two atoms, computed: Gordon–Kim on the solver's clouds */
{
  // the electron gas: 3D's textbook constants, and 4D's exchange integral ∫J₂²/x² = 4/15π
  ok(Math.abs(PT.GAS[3].t(1) - 2.871234) < 1e-5 && Math.abs(PT.GAS[3].x(1) + 0.738559) < 1e-5 && Math.abs(PT.GAS[4].t(1) - (4 * Math.PI) / 3) < 1e-12, "the free electron gas: 3D's Thomas–Fermi 2.8712 and Dirac's 0.7386; 4D's kinetic (4π/3)ρ^(3/2)");
  let I = 0; const X = 400, M = 400000, h = X / M; for (let i = 1; i <= M; i++) { const x = i * h, J2 = (2 * OPT.J1(x)) / x - OPT.J0(x); I += ((i === M ? 1 : i % 2 ? 4 : 2) * J2 * J2) / (x * x); } I = (I * h) / 3 + 1 / (Math.PI * X * X); // the tail: J₂² ≈ 1/πx on average
  ok(Math.abs(I - 4 / (15 * Math.PI)) < 2e-4, `4D exchange: ∫₀^∞ J₂²/x² dx = ${I.toFixed(5)} against 4/15π = ${(4 / (15 * Math.PI)).toFixed(5)}, so −16/(15√π) ρ^(5/4)`);
  // the bake is what the tool gives now
  const A2 = PT.atomFields(2, 4), i6 = PR.RS.indexOf(6), b2 = PR.PAIRS[4][0], e6 = PT.pairEnergy(A2, 6);
  ok(b2.Z === 2 && Math.abs(e6.es - b2.es[i6]) < 1e-8 && Math.abs(e6.kin - b2.kin[i6]) < 1e-8 && Math.abs(e6.exch - b2.exch[i6]) < 1e-8, "the baked pairs are what tools/pairs.mjs computes (4D element 2 at 6 bohr)");
  // the electrostatics: 3D's vanishes far out; 4D's becomes the permanent −B/R⁵
  const last = PR.RS.length - 1, ne = PR.PAIRS[3].find((p) => p.Z === 10), e12 = PR.PAIRS[4].find((p) => p.Z === 12), S12 = FF.sumR2(TABLE[4][11]), r15 = e12.es[last] / (-FF.permanentB(S12, S12) / PR.RS[last] ** 5);
  ok(Math.abs(ne.es[last]) < 1e-7 && r15 > 1 && r15 < 1.06, `far apart, neon's electrostatics vanish (${ne.es[last].toExponential(1)}) and element 12's are ${r15.toFixed(3)} × −B/R⁵`);
  // our world, end to end (computed clouds, computed C₆) against the measured wells
  const RSP = await import(path.join(here, "../js/response.js")), c6 = (d, Z) => RSP.RESPONSE[d].find((r) => r.Z === Z).c6;
  const chk = [10, 18, 36].map((Z) => { const p = PR.PAIRS[3].find((q) => q.Z === Z), m = FF.MEASURED[Z], w = FF.minimum(FF.fullPair(PR.RS, p, 0, c6(3, Z))); return { pos: Math.abs(w.R / m.R - 1), deep: -w.E / m.eps }; });
  ok(chk.every((c) => c.pos <= 0.05 && c.deep >= 1.4 && c.deep <= FF.OVERBIND), `our noble gases end to end: wells within 5% of measured (${chk.map((c) => (c.pos * 100).toFixed(1) + "%").join(", ")}), depths ${chk.map((c) => c.deep.toFixed(2) + "×").join(", ")} measured: 1.4 to ${FF.OVERBIND}, as the page says`);
  // 4D: the numbers the page states
  const meV = 27211.386, full = (Z) => { const p = PR.PAIRS[4].find((q) => q.Z === Z), el = TABLE[4][Z - 1], S = FF.sumR2(el); return { p, B: FF.permanentB(S, S), w: FF.minimum(FF.fullPair(PR.RS, p, FF.permanentB(S, S), c6(4, Z))), w0: FF.minimum(FF.pairCurve(PR.RS, p)) }; };
  const a = full(12), b = full(22), boil = (x) => [FF.boilK(-x.w.E / FF.OVERBIND), FF.boilK(-x.w.E)];
  const [a0, a1] = boil(a), [b0, b1] = boil(b), more = [12, 22, 50, 78].map((Z) => { const f = full(Z); return f.w.E / f.w0.E - 1; });
  ok(Math.abs(a0 - 400) < 15 && Math.abs(a1 - 730) < 15 && Math.abs(b0 - 1200) < 25 && Math.abs(b1 - 2200) < 50 && more.every((x) => x > 0.22 && x < 0.42) && [12, 22, 50, 78].every((Z) => { const R = full(Z).w.R; return R >= 4.49 && R <= 5.26; }),
    `4D wells with dispersion: element 12 boils ${a0.toFixed(0)}–${a1.toFixed(0)} K, element 22 ${b0.toFixed(0)}–${b1.toFixed(0)} K; dispersion adds ${more.map((x) => (x * 100).toFixed(0) + "%").join(", ")}; all sit 4.5–5.25 bohr apart`);
  const e2 = full(2); ok(FF.boilK(-e2.w.E) < 100, `element 2 stays a gas (boils below ${FF.boilK(-e2.w.E).toFixed(0)} K)`);
  // at each full well's bottom, electrostatics alone pulls harder than the well is deep
  ok([12, 22, 50, 78].every((Z) => { const f = full(Z), i = Math.round((f.w.R - PR.RS[0]) / 0.25); return f.p.es[i] < f.w.E; }), "at the bottom of each 4D well (element 12 on), electrostatics alone is deeper than the whole well");
  let fitOk = true, betaOk = true, esOk = true;
  for (const p of PR.PAIRS[4]) {
    const el = TABLE[4][p.Z - 1], S = FF.sumR2(el), B = FF.permanentB(S, S), f = FF.pairCurve(PR.RS, p), w = FF.minimum(f), fit = FF.fitRepulsion(PR.RS, p, B), wf = FF.minimum((R) => fit.A * Math.exp(-fit.beta * R) - B / R ** 5);
    if (p.Z >= 12 && (Math.abs(wf.R - w.R) > 0.2 || Math.abs(wf.E / w.E - 1) > 0.2)) fitOk = false;
    if (Math.abs(fit.beta / FF.bornMayerBeta(el.ion) - 1) > 0.2) betaOk = false;
    const ies = Math.round((w.R - PR.RS[0]) / 0.25); if (p.Z >= 12 && !(p.es[ies] / w.E > 2)) esOk = false;
  }
  ok(fitOk && betaOk && esOk, "the fitted A e^(−βR) − B/R⁵ puts each well within 0.2 bohr and 20%; β within 20% of 2√(2I); without dispersion, electrostatics is more than twice the depth");
}

/* 18 · the solver's exchange, and the response that gives C₆ */
{
  // local exchange: Dirac's constant and 4D's, and its known cancellations
  ok(Math.abs(A.EXCHANGE[3] - 0.738559) < 1e-6 && Math.abs(A.EXCHANGE[4] - 16 / (15 * Math.sqrt(Math.PI))) < 1e-12, "local exchange: Dirac's 0.7386 in 3D, 16/(15√π) in 4D");
  const he = A.scf(2, A.subshells(3).map((x, i) => (i === 0 ? 2 : 0)), 3, { exchange: true }), heH = A.scf(2, A.subshells(3).map((x, i) => (i === 0 ? 2 : 0)), 3);
  ok(Math.abs(he.E - heH.E) < 1e-9 && he.converged, "for helium, exchange with each electron's own share taken out cancels exactly: Hartree–Fock's −2.8617 stands");
  ok(Math.abs(TABLE[3][9].E + 128.86) < 0.02, `neon with exchange: ${TABLE[3][9].E.toFixed(3)} hartree (Hartree–Fock −128.547)`);
  // the response: hydrogen exact in both worlds (Dalgarno–Lewis in d dimensions), the sum rule, helium's TDHF value
  const RSP = await import(path.join(here, "../js/response.js")), RT2 = await import(path.join(here, "../tools/response.mjs"));
  const dl = (d) => { const k = 1 / (1 + (d - 3) / 2), m = (q) => { let g = 1; for (let i = 1; i < d + q; i++) g *= i; let g0 = 1; for (let i = 1; i < d; i++) g0 *= i; return g / g0 / (2 * k) ** q; }; return (2 / d) * (m(3) / (2 * k) + ((d + 1) * m(2)) / (4 * k * k)); };
  const h3 = RSP.RESPONSE[3].find((r) => r.Z === 1), h4 = RSP.RESPONSE[4].find((r) => r.Z === 1);
  ok(Math.abs(dl(3) - 4.5) < 1e-12 && Math.abs(h3.a0 / dl(3) - 1) < 1e-3 && Math.abs(h4.a0 / dl(4) - 1) < 1e-3 && Math.abs(h3.c6 - 6.499) < 0.01, `hydrogen's α exactly: 3D ${h3.a0} (4.5), 4D ${h4.a0} (Dalgarno–Lewis ${dl(4).toFixed(4)}); C₆ ${h3.c6} (6.499)`);
  const allSum = [3, 4].every((d) => RSP.RESPONSE[d].every((r) => (r.Z <= 22 ? Math.abs(r.fsum / r.Z - 1) < 0.04 : r.fsum / r.Z > 0.89 && r.fsum <= r.Z)));
  ok(allSum, "the Thomas–Reiche–Kuhn sum rule: ω²α at ω = 300 within 4% of the electron count up to Z = 22; heavier atoms' deep cores (Δ > 300) still approaching");
  const heR = RSP.RESPONSE[3].find((r) => r.Z === 2);
  ok(Math.abs(heR.a0 - 1.322) < 0.002, `helium's coupled response, ${heR.a0}: time-dependent Hartree–Fock's 1.322`);
  const errs = [2, 10, 18, 36].map((Z) => { const r = RSP.RESPONSE[3].find((q) => q.Z === Z), m = FF.MEASURED[Z]; return [r.a0 / m.alpha - 1, r.c6 / m.C6 - 1]; });
  ok(errs.every(([x, y]) => Math.abs(x) < 0.09 && Math.abs(y) < 0.115), `our noble gases: α within 9%, C₆ within 11% of measured (${errs.map(([x, y]) => `${(x * 100).toFixed(1)}/${(y * 100).toFixed(1)}%`).join(", ")})`);
  // the bake is reproducible (4D element 2), and C₆ is Casimir–Polder's 7/2π here
  const re = RT2.coupledAlpha(2, 4, { omegas: [0, ...RSP.OMEGA] }), e2 = RSP.RESPONSE[4].find((r) => r.Z === 2);
  ok(Math.abs(re[0] - e2.a0) < 1e-4 * e2.a0 && Math.abs(RT2.c6From(re.slice(1), re.slice(1), 4) - e2.c6) < 1e-4 * e2.c6, "the baked response is what tools/response.mjs computes (4D element 2)");
  const drude = (d) => { const w0 = 0.7, a0 = 2, a = RSP.OMEGA.map((w) => (a0 * w0 * w0) / (w0 * w0 + w * w)); return RT2.c6From(a, a, d) / ((FF.traceT2(d) / 8) * a0 * a0 * w0); };
  ok(Math.abs(drude(3) - 1) < 2e-3 && Math.abs(drude(4) - 1) < 2e-3, `Casimir–Polder on a Drude oscillator gives London's (d + 3)/8 α²ω₀ (${drude(3).toFixed(5)}, ${drude(4).toFixed(5)}): the quadrature and the 7/2π`);
  // dispersion against the permanent pull: equal about a bohr out from element 12 on; element 2 soft
  const eq = (Z) => { const r = RSP.RESPONSE[4].find((q) => q.Z === Z), S = FF.sumR2(TABLE[4][Z - 1]); return FF.crossover(FF.permanentB(S, S), r.c6); };
  ok([12, 22, 50, 78].every((Z) => eq(Z) < 1.5) && eq(2) > 8 && eq(2) < 10.5 && h4.a0 / h3.a0 > 7.6 && h4.a0 / h3.a0 < 7.8, `dispersion equals the permanent pull at ${[2, 12, 22, 50, 78].map((Z) => eq(Z).toFixed(1)).join(", ")} bohr; 4D hydrogen is ${(h4.a0 / h3.a0).toFixed(2)}× as polarizable as ours`);
}

/* 19 · molecules: Hartree–Fock in any dimension (js/gauss.js), then Pxygen and Xater (js/molecules.js) */
{
  const GS = await import(path.join(here, "../js/gauss.js")), { MOLECULES: M } = await import(path.join(here, "../js/molecules.js")), MT = await import(path.join(here, "../tools/molecules.mjs"));
  // G_n replaces Boys's F_n: in 3D it is F_n (F₀(1) = 0.746824132812427); in 4D, G₀(T) = (π/4) e^(−T/2) [I₀(T/2) + I₁(T/2)]
  const bessel = (nu, x) => { let s = 0, t = (x / 2) ** nu / (nu ? 1 : 1); for (let k = 0; k < 40; k++) { s += t; t *= (x / 2) ** 2 / ((k + 1) * (k + 1 + nu)); } return s; };
  const g4 = (T) => (Math.PI / 4) * Math.exp(-T / 2) * (bessel(0, T / 2) + bessel(1, T / 2));
  const gOk = [0.3, 2, 9, 30, 60].every((T) => Math.abs(GS.Gn(T, 0, 4)[0] - g4(T)) < 1e-10) && Math.abs(GS.Gn(1, 0, 3)[0] - 0.746824132812427) < 1e-9;
  const rec = [0.5, 5, 50].every((T) => { const g = GS.Gn(T, 2, 3); return Math.abs(g[1] - (g[0] - Math.exp(-T)) / (2 * T)) < 1e-10; }); // F₁ = (F₀ − e^(−T))/2T
  ok(gOk && rec, "G_n: Boys's function in 3D, the Bessel closed form in 4D, and the downward rule");
  // one electron, exactly: hydrogen's 1s in both worlds, and 4D's 2p from p functions alone
  const o = (d) => new Array(d).fill(0), hE = (d, l) => GS.hartreeFock([{ Z: 1, at: o(d) }], GS.shellsFor({ Z: 1, at: o(d) }, [[l, GS.evenTempered(l ? 0.003 : 0.01, l ? 2 : 2.2, l ? 14 : 16)]]), d, { nAlpha: 1, nBeta: 0 }).E;
  ok(Math.abs(hE(3, 0) + 0.5) < 2e-6 && Math.abs(hE(4, 0) + 2 / 9) < 2e-6 && Math.abs(hE(4, 1) + 0.08) < 2e-6, "Gaussian hydrogen: −1/2, −2/9 and 4D's 2p at −2/25, exactly");
  // two electrons: helium against the Hartree–Fock limit (3D) and against the radial solver (4D), which is exact Hartree–Fock for two electrons
  const he = (d) => GS.hartreeFock([{ Z: 2, at: o(d) }], GS.shellsFor({ Z: 2, at: o(d) }, [[0, GS.evenTempered(0.02, 2.0, 20)]]), d, { nAlpha: 1, nBeta: 1 }).E;
  const rad4 = A.scf(2, A.subshells(4).map((_, i) => (i ? 0 : 2)), 4).E;
  ok(Math.abs(he(3) + 2.86168) < 2e-5 && Math.abs(he(4) - rad4) < 1e-5, `helium: 3D ${he(3).toFixed(6)} (limit −2.86168); 4D ${he(4).toFixed(6)} against the radial solver's ${rad4.toFixed(6)}`);
  // the integrals don't know which way is which: a 4D H₂ with p and d functions, along an axis and along a diagonal
  const h2 = (dir) => { const rr = [[0, GS.evenTempered(0.05, 3, 4)], [1, [0.5]], [2, [0.6]]], a = { Z: 1, at: dir.map((x) => -0.8 * x) }, b = { Z: 1, at: dir.map((x) => 0.8 * x) }; return GS.hartreeFock([a, b], [...GS.shellsFor(a, rr), ...GS.shellsFor(b, rr)], 4, { nAlpha: 1, nBeta: 1 }).E; };
  ok(Math.abs(h2([1, 0, 0, 0]) - h2([0.5, 0.5, 0.5, 0.5])) < 1e-8, "a 4D molecule's energy doesn't depend on which way it points");
  // the bake is reproducible: Xater at its baked shape, small basis
  const y = MT.monomer(4, M[4].small.R, M[4].small.theta, "small");
  ok(Math.abs(y.E - M[4].small.E) < 1e-5 && y.converged, `the baked Xater is what tools/molecules.mjs computes (${y.E.toFixed(6)})`);
  // our water, the check: the big basis within reach of the Hartree–Fock limit (1.776 bohr, 106.3°, 0.78)
  const w = M[3].big;
  ok(Math.abs(w.R - 1.776) < 0.01 && Math.abs(w.theta - 106.3) < 0.5 && Math.abs(w.dipole - 0.78) < 0.03 && w.ok, `our water at the big basis: ${w.R} bohr, ${w.theta}°, dipole ${w.dipole} (Hartree–Fock limit about 1.776, 106.3°, 0.78)`);
  // the conclusions
  const Y = M[4].big, s4 = M[4].small;
  ok(Y.ok && s4.ok && Y.theta > 117 && Y.theta < 123 && Math.abs(Y.theta - s4.theta) < 5, `Xater is bent at ${Y.theta}° (small basis ${s4.theta}°): wider than water and than sp⁴'s 104.48°`);
  ok(Y.dipole / w.dipole > 1.9 && Y.linear < 0.25 * w.linear && Math.abs(Y.homo - Y.homo2) < 2e-4 && M[4].big.atom.hund < M[4].big.atom.closed, `Xater's dipole ${Y.dipole} is ${(Y.dipole / w.dipole).toFixed(2)}× water's; straightening it costs ${(Y.linear * 27.2114).toFixed(2)} eV (water ${(w.linear * 27.2114).toFixed(2)}); its top orbital is two-fold (the ring); Pxygen's Hund state is its ground`);
  const D3 = M[3].dimer, D4 = M[4].dimer;
  ok(D3.ok && D4.ok && D3.E < 0 && D4.E / D3.E > 2.5 && (D4.RXX - D4.r) / D4.r < 1.5 && (D3.RXX - D3.r) / D3.r > 2, `the hydrogen bond: Xater's ${(-D4.E * 627.51).toFixed(1)} kcal/mol at ${D4.RXX} bohr, water's ${(-D3.E * 627.51).toFixed(1)} at ${D3.RXX}, the same way`);
}

/* 20 · the census: every hydride of 4D's rows two and three (js/census.js), our three as the check */
{
  const { CENSUS } = await import(path.join(here, "../js/census.js")), CT = await import(path.join(here, "../tools/census.mjs"));
  const by = (d, Z) => CENSUS[d].find((m) => m.Z === Z), net = (m) => Math.min(m.bonds, m.lp) * -m.dimer.E;
  // counting: v bonds up to the shell's d + 1 orbitals, then 2(d + 1) − v bonds and v − (d + 1) lone pairs
  const counts = [[3, 7, 3, 1], [3, 8, 2, 2], [3, 9, 1, 3], [4, 7, 5, 0], [4, 8, 4, 1], [4, 10, 2, 3], [4, 11, 1, 4], [4, 20, 2, 3]].every(([d, Z, b, lp]) => { const v = CT.valence(Z, d); return v.bonds === b && v.lp === lp; });
  ok(counts && CENSUS[3].length === 3 && CENSUS[4].length === 18 && [...CENSUS[3], ...CENSUS[4]].every((m) => m.ok && m.minimum), "the census: bonds and lone pairs by counting, 21 hydrides, each converged and a minimum under random nudges");
  // the bake is reproducible: element 11's HX at its baked length
  const hx = by(4, 11), e = CT.hydride(CT.hydrideAtoms(11, 4, hx.R, null), 4).E;
  ok(Math.abs(e - hx.E) < 1e-5, `the baked census is what tools/census.mjs computes (4D element 11's HX, ${e.toFixed(6)})`);
  // polarity: hydrogen is negative only on mithium and todium; row 2's XH₄ is flat and has no dipole, row 3's is a pyramid
  const neg = CENSUS[4].filter((m) => m.qH < 0).map((m) => m.Z).join();
  ok(neg === "3,13" && Math.abs(by(4, 8).param - 90) < 0.5 && by(4, 8).dipole < 1e-3 && by(4, 18).param < 80 && by(4, 18).dipole > 1, `hydrogen negative only on ${neg}; element 8's XH₄ flat and without a dipole, element 18's a pyramid`);
  // the check: the network's pull orders our three as their boiling points (water, HF, ammonia)
  const w = net(by(3, 8)), hf = net(by(3, 9)), nh = net(by(3, 7));
  ok(w > hf && hf > nh, `our three in order: water ${(w * 627.51).toFixed(1)}, HF ${(hf * 627.51).toFixed(1)}, ammonia ${(nh * 627.51).toFixed(1)} kcal/mol, as their boiling points`);
  // the verdict: Xater and element 9's XH₃ within 10% of each other, each about three times water, every other below both
  const y = net(by(4, 10)), x9 = net(by(4, 9)), rest = CENSUS[4].filter((m) => m.dimer && m.dimer.E != null && m.Z !== 9 && m.Z !== 10).map(net);
  ok(Math.abs(y - x9) / Math.max(y, x9) < 0.1 && Math.min(y, x9) / w > 2.5 && rest.every((r) => r < Math.min(y, x9)), `Xater ${(y * 627.51).toFixed(1)} and element 9's XH₃ ${(x9 * 627.51).toFixed(1)} tie, ${(Math.min(y, x9) / w).toFixed(1)}× water and above every other`);
}

/* 21 · molecular dynamics (js/md.js): Ewald in any dimension, against known sums and NIST's SPC/E reference */
{
  const MD = await import(path.join(here, "../js/md.js"));
  // Madelung constants of the alternating lattice: 3D rock salt (1.7475646) and 4D (1.8393991, which an Evjen sum also gives)
  const lattice = (d, m) => { const x = [], q = []; const rec = (k, cur) => { if (k === d) { x.push(...cur); q.push(cur.reduce((a, v) => a + v, 0) % 2 ? -1 : 1); return; } for (let v = 0; v < m; v++) rec(k + 1, [...cur, v]); }; rec(0, []); return { x: Float64Array.from(x), q: Float64Array.from(q) }; };
  const mad = (d) => { const { x, q } = lattice(d, 4); return (-2 * new MD.Ewald(d, 4, { alpha: 1.8, rc: 2, nmax: 10 }).compute(x, q, new Float64Array(q.length * d)).E) / q.length; };
  const evjen = (d, R) => { let s = 0; const rec = (k, cur, w) => { if (k === d) { const r2 = cur.reduce((a, v) => a + v * v, 0); if (r2) s += ((cur.reduce((a, v) => a + v, 0) % 2 ? -1 : 1) * w) / Math.sqrt(r2); return; } for (let v = -R; v <= R; v++) rec(k + 1, [...cur, v], Math.abs(v) === R ? w / 2 : w); }; rec(0, [], 1); return -s; };
  const m3 = mad(3), m4 = mad(4), e4 = evjen(4, 8);
  ok(Math.abs(m3 - 1.7475646) < 2e-6 && Math.abs(m4 - e4) < 2e-6 && Math.abs(m4 - 1.8393991) < 2e-6, `Ewald's Madelung constants: rock salt ${m3.toFixed(7)}, the 4D alternating lattice ${m4.toFixed(7)} (Evjen ${e4.toFixed(7)})`);
  // Ewald's split is of 1/r itself, so the energy doesn't depend on α, and the forces are its slope, in 3D and 4D
  let worst = 0, drift = 0;
  for (const d of [3, 4]) {
    let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647), L = 7, n = 9, x = Float64Array.from({ length: n * d }, () => rnd() * L), q = Float64Array.from({ length: n }, (_, i) => (i % 3 ? 0.4 : -0.8)), ex = [[0, 1], [0, 2], [1, 2]];
    const E = new MD.Ewald(d, L, { alpha: 1.25, rc: 3.5, nmax: 12 }), F = new Float64Array(n * d), e0 = E.compute(x, q, F, ex).E;
    drift = Math.max(drift, Math.abs(e0 - new MD.Ewald(d, L, { alpha: 1.1, rc: 3.5, nmax: 12 }).compute(x, q, new Float64Array(n * d), ex).E));
    for (const k of [0, 7, 13, 20]) { const h = 1e-5, xp = x.slice(), xm = x.slice(); xp[k] += h; xm[k] -= h; worst = Math.max(worst, Math.abs(F[k] + (E.compute(xp, q, new Float64Array(n * d), ex).E - E.compute(xm, q, new Float64Array(n * d), ex).E) / (2 * h))); }
  }
  ok(worst < 1e-8 && drift < 1e-6, `Ewald in 3D and 4D: forces match finite differences (${worst.toExponential(1)}), energy independent of α (${drift.toExponential(1)})`);
  // NIST's SPC/E reference configuration 1 (100 molecules, 20 Å): every Ewald part, in K
  const lines = fs.readFileSync(path.join(here, "fixtures/nist-spce-1.txt"), "utf8").trim().split("\n"), M = +lines[1], xs = [], qs = [];
  for (let i = 0; i < 3 * M; i++) { const f = lines[2 + i].trim().split(/\s+/); xs.push(+f[1], +f[2], +f[3]); qs.push(f[4] === "O" ? -0.8476 : 0.4238); }
  const exs = []; for (let m = 0; m < M; m++) exs.push([3 * m, 3 * m + 1], [3 * m, 3 * m + 2], [3 * m + 1, 3 * m + 2]);
  const coul = (1.602176565e-19 ** 2 / (4 * Math.PI * 8.854187817e-12 * 1e-10)) / 1.3806488e-23, en = new MD.Ewald(3, 20, { alpha: 0.28, rc: 10, nmax: 5, n2max: 26 }).compute(Float64Array.from(xs), Float64Array.from(qs), new Float64Array(9 * M), exs);
  const mine = [en.Ereal, en.Erec, en.Eself, en.Eexcl].map((v) => v * coul), ref = [-5.58889e5, 6.27009e3, -2.84469e6, 2.80999e6];
  ok(mine.every((v, i) => Math.abs(v / ref[i] - 1) < 1e-5), `NIST's SPC/E reference, every part to its six figures: ${mine.map((v) => v.toPrecision(6)).join(", ")} K`);
  // a rigid 4D molecule-pair system conserves energy with the thermostat off
  const amu = 1822.888486, A = 1.8897261, th = 1.9106, kind = { sites: [{ m: 16 * amu, q: -0.8, t: "O", at: [0, 0, 0, 0] }, { m: amu, q: 0.4, t: "H", at: [A * Math.cos(th / 2), A * Math.sin(th / 2), 0, 0] }, { m: amu, q: 0.4, t: "H", at: [A * Math.cos(th / 2), -A * Math.sin(th / 2), 0, 0] }], constraints: [[0, 1], [0, 2], [1, 2]] };
  const sys = new MD.System({ d: 4, L: 2 * 3.4 * A, kind, N: 16, pairs: { "O|O": { lj: [2.5e-4, 3.2 * A] } }, rc: 3.4 * A, ewald: { alpha: 0.55, nmax: 6 }, seed: 2 });
  sys.thermalize(400 * 3.1668e-6); for (let k = 0; k < 40; k++) sys.step(41.34, 400 * 3.1668e-6, 1000);
  const Et = () => sys.Edyn + sys.kinetic(), e0 = Et(); let lo = e0, hi = e0; for (let k = 0; k < 120; k++) { sys.step(20.67); lo = Math.min(lo, Et()); hi = Math.max(hi, Et()); }
  const bonds = sys.cons.every(([i, j, l]) => Math.abs(Math.hypot(...sys.sep(i, j)) - l) < 1e-7);
  ok((hi - lo) / 16 < 3e-6 && bonds, `4D rigid molecules, thermostat off: total energy within ${((hi - lo) / 16 * 2625.5).toFixed(4)} kJ/mol per molecule over 120 steps, every bond held`);
}

/* 22 · force fields for the liquids: the model's terms, and the pair search's poses */
{
  const MD = await import(path.join(here, "../js/md.js")), FM = await import(path.join(here, "../js/ffmodel.js")), PS = await import(path.join(here, "../tools/pairsearch.mjs"));
  // the Tang–Toennies term's force is its slope
  const term = { tt: [12, 1.7, 30] }; let worst = 0;
  for (const r of [2.5, 3.7, 5.1, 7.9]) { const [, f] = MD.shortPair(term, r * r), h = 1e-6, du = (MD.shortPair(term, (r + h) ** 2)[0] - MD.shortPair(term, (r - h) ** 2)[0]) / (2 * h); worst = Math.max(worst, Math.abs(-du / r - f)); }
  // a pose's turn is orthonormal (an exponential of a turn generator, so never a mirror), in 3D and 4D
  let orth = 0;
  for (const d of [3, 4]) { const n = (d * (d - 1)) / 2, e = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 : 0))), R0 = e, x = [...Array.from({ length: n }, (_, k) => 0.3 + 0.2 * k), ...new Array(d).fill(0)], M = PS.posed(e, R0, x, d);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) orth = Math.max(orth, Math.abs(M.reduce((s, row) => s + row[i] * row[j], 0) - (i === j ? 1 : 0))); }
  // the model's energy doesn't care which molecule is first
  const p = [0.5, 3, 0.2, 40, 1.5, -0.4, 0.3, -0.9], A = [[0, 0, 0, 0], [1.6, 1.4, 0, 0], [1.6, -1.4, 0, 0]], B = [[5, 1, 0.5, -0.3], [6.1, 2.6, 0.2, 0], [6.4, -0.1, 1.1, 0.4]];
  const sym = Math.abs(FM.modelEnergy(p, A, B) - FM.modelEnergy(p, B, A));
  ok(worst < 1e-7 && orth < 1e-12 && sym < 1e-14, `Tang–Toennies force its slope (${worst.toExponential(1)}); a pose's turn a rotation (${orth.toExponential(1)}); the model symmetric in its pair`);
}

/* 23 · the pairs searched over every pose (js/pairmin.js): the census chapter's correction */
{
  const { PAIRMIN: P } = await import(path.join(here, "../js/pairmin.js")), K = 627.509, w = P[3], x = P[4], n9 = P["4.9"];
  const best = (r) => r.best.E <= Math.min(r.search, r.census, ...r.modelMinima.map((q) => q.hf)) + 1e-9;
  ok([w, x, n9].every(best) && Math.abs(w.search - w.census) * K < 0.2, `the search keeps the lowest it found; for our water the search and the census's linear pair agree (search ${(-w.search * K).toFixed(3)}, census ${(-w.census * K).toFixed(3)}, best from the ${w.best.from})`);
  ok(x.best.E < 1.8 * x.census && n9.best.E < 1.8 * n9.census && Math.abs(x.best.E - n9.best.E) / Math.abs(n9.best.E) < 0.05 && x.best.dXX < 5.2, `searched properly, Xater's pair binds ${(-x.best.E * K).toFixed(1)} and XH₃'s ${(-n9.best.E * K).toFixed(1)} kcal/mol (the census's ${(-x.census * K).toFixed(1)}, ${(-n9.census * K).toFixed(1)}): still a tie, at twice the strength, compact (Xater's heavy atoms ${x.best.dXX} bohr apart)`);
}

/* 24 · the descent behind the search chapter: every start of Xater's pair reaches the one basin, all the way down (the slope
   gone, not merely stalled), re-centring its turn as it winds */
{
  const L = await import(path.join(here, "../js/landscape.js")), { modelEnergy } = await import(path.join(here, "../js/ffmodel.js")), { FORCEFIELDS } = await import(path.join(here, "../js/forcefields.js"));
  const { PAIRMIN } = await import(path.join(here, "../js/pairmin.js")), { randomRotation } = await import(path.join(here, "../js/md.js")), K = 627.509, d = 4, p = FORCEFIELDS[4].p, A = PAIRMIN[4].best.A, rnd = L.rng(31), E = (B) => modelEnergy(p, A, B);
  let worst = 0, gmax = 0, rebased = 0;
  for (let s = 0; s < 5; s++) {
    const R0 = randomRotation(d, rnd), dir = Array.from({ length: d }, () => rnd() - 0.5), n = Math.hypot(...dir), x0 = [...new Array(6).fill(0), ...dir.map((v) => (v / n) * 6)];
    let last; for (const st of L.poseSteps(E, A, R0, x0, d)) { if (last && last.R0 !== st.R0) rebased++; last = st; }
    worst = Math.max(worst, Math.abs(last.f - PAIRMIN[4].modelMinima[0].model) * K); gmax = Math.max(gmax, last.g);
  }
  ok(gmax < 1e-6 && worst < 0.05, `five random starts of Xater's pair all descend to the force field's one basin (${(PAIRMIN[4].modelMinima[0].model * K).toFixed(2)} kcal/mol, within ${worst.toFixed(3)}; |g| < ${gmax.toExponential(0)}; the turn re-centred ${rebased} times on the way)`);
}

/* 25 · the clusters (js/clusters.js): what the search chapter's crowds section reads, internally consistent */
{
  const { CLUSTERS } = await import(path.join(here, "../js/clusters.js")), rows = Object.values(CLUSTERS).flatMap((v) => Object.values(v));
  ok(["3", "4", "4.9"].every((k) => [3, 4, 5, 6, 7].every((n) => CLUSTERS[k]?.[n])) && rows.every((r) => r.starts >= 300 && r.minima >= r.floor && r.floor >= 1 && r.late <= r.minima && r.seenOnce <= r.minima && r.chao1 >= r.minima - 1e-9 && r.best.every((q, i) => q.hits >= 1 && (i === 0 || q.E >= r.best[i - 1].E)) && r.curve.length > 0),
    `the cluster census covers 3–7 molecules for all three, each with ≥ 300 starts: minima sorted, the looser floor ≤ the count, Chao1 ≥ minima found (${rows.length} searches)`);
}

/* 26 · the names (js/names.js): the chapters' names where they gave one, 24 new elements, symbols unique and none of ours */
{
  const { names, OURS } = await import(path.join(here, "../js/names.js")), { TABLE } = await import(path.join(here, "../js/table.js"));
  const N = names(TABLE, 4), all = [...N.values()], at = (Z) => N.get(Z);
  const kept = { 1: "iydrogen", 3: "mithium", 7: "darbon", 9: "oitrogen", 10: "pxygen", 13: "todium" };
  const syms = all.filter((e) => e.sym).map((e) => e.sym), ours = new Set(OURS.map((o) => o.sym));
  ok(Object.entries(kept).every(([Z, n]) => at(+Z).name === n) && at(6).isNew && at(8).isNew && all.filter((e) => e.isNew).length === 24 && all.length === 78
    && new Set(all.filter((e) => e.ours).map((e) => e.ours.Z)).size === 54 && new Set(syms).size === syms.length
    && syms.filter((s) => ours.has(s)).every((s) => s === "H") && at(7).sym === "D" && at(10).sym === "Px" && at(3).sym === "Mi"
    && [...names(TABLE, 3).values()].every((e) => !e.isNew && e.name === OURS[e.Z - 1].name),
    `the 4D elements' names: 54 answer to our 54, one each (mithium, darbon, oitrogen, pxygen, todium as the chapters call them), 24 are new, elements 6 and 8 among them; symbols unique, none of ours but iydrogen's H`);
}

/* 27 · the filling diagram (four/table/filling.js): Madelung's diagonals, with 4D's capacities, are the order the
   solver filled every 4D atom in; the rows close where the table's noble gases are; the departures are d-block atoms
   lending s electrons to d */
{
  const F = await import(path.join(here, "../../table/filling.js")), { TABLE } = await import(path.join(here, "../js/table.js"));
  const seen = []; for (const el of TABLE[4]) for (const o of el.orb) if (!seen.includes(o.s)) seen.push(o.s);
  const order4 = F.order(4).map((q) => q.name), first = order4.slice(0, seen.length);
  let lend = 0, onlyD = true;
  for (const el of TABLE[4]) {
    const occ = F.parseConfig(el.config), plain = new Map(); let left = el.Z;
    for (const q of F.order(4)) { if (!left) break; const k = Math.min(left, q.cap); plain.set(q.name, k); left -= k; }
    const diff = [...new Set([...occ.keys(), ...plain.keys()])].filter((sh) => (occ.get(sh) ?? 0) !== (plain.get(sh) ?? 0));
    if (diff.length) { lend++; onlyD = onlyD && diff.every((sh) => /[sd]$/.test(sh)) && diff.some((sh) => sh.endsWith("d") && occ.get(sh) > plain.get(sh)); }
  }
  ok(seen.every((sh, i) => sh === first[i]) && F.nobles(4, 5).join() === "2,12,22,50,78" && F.nobles(3, 5).join() === "2,10,18,36,54" && lend === 20 && onlyD,
    `4D fills along our diagonals (${seen.join(" ")}), each box holding 2(l + 1)²: rows close at ${F.nobles(4, 5).join(", ")}; the ${lend} atoms off the plain filling are d-block atoms lending s electrons to d`);
}

/* 28 · the pages outside ATOM⁴'s chapters (where we are, the big table): every element their scripts draw into exists */
{
  for (const [page, script] of [["../../start/index.html", "../../start/start.js"], ["../../table/index.html", "../../table/viewer.js"], ["../../fields/index.html", "../../fields/fields.js"]]) {
    const html = fs.readFileSync(path.join(here, page), "utf8"), js = fs.readFileSync(path.join(here, script), "utf8");
    const want = [...new Set([...js.matchAll(/\$\(\s*["'`]([A-Za-z0-9_-]+)["'`]\s*\)/g)].map((m) => m[1]))], ids = new Set([...(html + js).matchAll(/id="([^"]+)"/g)].map((m) => m[1])); // the page's, and those the script writes itself
    const missing = want.filter((id) => !ids.has(id) && !/\$\{/.test(id));
    ok(missing.length === 0, `${page.split("/").at(-2)}/: every element its script draws into is on the page${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  }
}

/* 29 · gases (js/gas.js), the gases chapter: the integrator against closed forms and Lennard-Jones's known temperatures,
   the lattice sum against Lennard-Jones's fcc crystal, our argon's measured numbers inside the computed ranges, and
   the 4D claims the chapter states */
{
  const G = await import(path.join(here, "../js/gas.js")), FF = await import(path.join(here, "../js/forces.js")), { PAIRS, RS } = await import(path.join(here, "../js/pairs.js"));
  const { TABLE } = await import(path.join(here, "../js/table.js")), { RESPONSE } = await import(path.join(here, "../js/response.js")), KB = 3.166811563e-6;
  let worst = 0;
  for (const d of [2, 3, 4, 5]) {
    worst = Math.max(worst, Math.abs(G.B2(() => 0, d, 300, { rmin: 2 }) / G.hardSphereB2(d, 2) - 1), Math.abs(G.B2((r) => (r < 3 ? -0.001 : 0), d, 300, { rmin: 2 }) / G.squareWellB2(d, 2, 1.5, 0.001, 300) - 1));
  }
  const norm = [3, 4].map((d) => { let n = 0, m = 0; for (let v = 0.0005; v < 12; v += 0.001) { const f = G.maxwell(v, d, 1); n += f * 0.001; m += v * f * 0.001; } return [n, m / G.vMean(d, 1)]; });
  ok(worst < 1e-4 && norm.every(([n, m]) => near(n, 1, 1e-6) && near(m, 1, 1e-6)), `B₂ exact against hard spheres and square wells in 2–5D (worst ${worst.toExponential(1)}); Maxwell's speeds normalized, with the right mean, in 3D and 4D`);
  const lj = (r) => 4 * KB * (r ** -12 - r ** -6), o = { rmin: 0.5, rmax: 12, tail: [{ a: 4 * KB, n: 6 }], h: 0.0005 }, tb = G.boyle(lj, 3, o, 0.5, 100), ti = G.inversion(lj, 3, o, 0.5, 100);
  let fcc = 0; for (let a = 1.05; a < 1.15; a += 0.0005) fcc = Math.min(fcc, G.lattice(lj, 3, a, { tail: [{ a: 4 * KB, n: 6 }], rmax: 12 }).E / KB);
  ok(near(tb, 3.418, 1e-3) && near(ti, 6.431, 1e-3) && near(fcc, -8.61, 2e-3), `Lennard-Jones: Boyle ${tb.toFixed(4)} ε/k, inversion ${ti.toFixed(3)} ε/k, fcc crystal ${fcc.toFixed(3)} ε per atom (known: 3.418, 6.43, −8.61)`);
  const rows = G.nobleGases({ FF, PAIRS, RS, TABLE, RESPONSE }), g = (d, Z) => rows.find((r) => r.d === d && r.Z === Z), ar = g(3, 18), oe = g(4, 12), bg = g(4, 22), ie = g(4, 2);
  const inside = ([a, b], x) => a <= x && x <= b, A = G.ARGON;
  ok(inside(ar.boyle, A.boyle) && inside(ar.inversion, A.inversion) && [ar.tcWell, ar.tcBoyle, ar.tcCrystal].every((t) => inside(t, A.Tc)) && inside(g(3, 36).tcWell, 209.41) && inside(g(3, 10).tcWell, 44.4),
    `our argon, computed: Boyle ${ar.boyle.map(Math.round).join("–")} K (measured ~${A.boyle}), inversion ${ar.inversion.map(Math.round).join("–")} K (~${A.inversion}); all three critical-point rules hold its measured ${A.Tc} K`);
  const M = (P, m) => G.lattice(P.u, 4, P.well.R, P.opt, m).E, P12 = G.noblePotential(4, 12, { FF, PAIRS, RS, TABLE, RESPONSE });
  ok(near(M(P12, 6), M(P12, 8), 5e-3), `4D element 12's crystal sum has converged: ${(M(P12, 6) / KB).toFixed(0)} and ${(M(P12, 8) / KB).toFixed(0)} K per atom, summed out to 6 and 8 lattice steps`);
  const far = G.farShare(P12.u, 4, 3 * oe.eps[1], P12.opt, oe.R, 1.5);
  ok([oe, bg, ie].every((r) => r.boyleOverEps > 20 && r.firstShell < 0.45 && r.inversionOverBoyle > 1.6 && r.inversionOverBoyle < 2.1) && [ar, g(3, 36)].every((r) => r.boyleOverEps < 3.5 && r.firstShell > 0.75 && r.inversionOverBoyle > 1.6 && r.inversionOverBoyle < 2.1) && far > 0.5,
    `the chapter's claims: 4D's Boyle temperatures are ${[ie, oe, bg].map((r) => r.boyleOverEps.toFixed(0)).join(", ")} well depths (ours ${[ar, g(3, 36)].map((r) => r.boyleOverEps.toFixed(1)).join(", ")}); nearest neighbours give ${(100 * oe.firstShell).toFixed(0)}% of element 12's crystal (argon ${(100 * ar.firstShell).toFixed(0)}%); ${(100 * far).toFixed(0)}% of its pull is from beyond 1.5 R_min; inversion ÷ Boyle stays near 1.9`);
  ok(Math.min(oe.tcBoyle[0], oe.tcCrystal[0]) > 3 * oe.tcWell[0] && Math.max(oe.tcBoyle[1], oe.tcCrystal[1]) > 3 * oe.tcWell[1] && oe.inversion[0] > 3e4,
    `element 12 condenses below ${Math.round(Math.min(oe.tcBoyle[0], oe.tcCrystal[0]))}–${Math.round(Math.max(oe.tcBoyle[1], oe.tcCrystal[1]))} K by the crowd's rules, at each end over three times the well rule's ${oe.tcWell.map(Math.round).join("–")}; a throttle cools it below ${Math.round(oe.inversion[0])} K`);
}

/* 30 · ions for the gases chapter's salts (tools/ions.mjs): the solver strips aluminium within 5% of measured, and
   bluminium's three electrons and pxygen's first extra one come out as the chapter says */
{
  const { ions } = await import(path.join(here, "../tools/ions.mjs")), I = ions(), sum = (a) => a.reduce((s, x) => s + x, 0);
  ok(near(sum(I.Al), sum(I.measured.Al), 0.05) && sum(I.Bl) < sum(I.Al) && I.Px > I.O && I.O > 0,
    `aluminium stripped to Al³⁺ for ${sum(I.Al).toFixed(1)} eV (measured ${sum(I.measured.Al).toFixed(1)}); bluminium for ${sum(I.Bl).toFixed(1)}; pxygen takes an electron for ${I.Px.toFixed(2)} eV (oxygen ${I.O.toFixed(2)}, measured ${I.measured.O})`);
}

/* 31 · which crystal (tools/crystals.mjs): our noble gases and Lennard-Jones pick face-centred cubic, as real argon
   does; Lennard-Jones in 4D picks D4, the densest packing */
{
  const { crystals } = await import(path.join(here, "../tools/crystals.mjs")), C = Object.fromEntries((await crystals()).map((c) => [c.name, c]));
  ok(["Lennard-Jones", "argon", "krypton"].every((n) => C[n].rows[0].lattice === "fcc") && C["Lennard-Jones 4D"].rows[0].lattice === "D4" && Math.abs(C["Lennard-Jones"].rows[0].E + 8.61) < 0.03,
    `crystals: fcc first for Lennard-Jones (${C["Lennard-Jones"].rows[0].E} ε), argon and krypton; D4 first for Lennard-Jones in 4D (${C["Lennard-Jones 4D"].rows[0].E} ε); element 12's best two within ${(100 * (C["element 12"].rows[1].E - C["element 12"].rows[0].E) / -C["element 12"].rows[0].E).toFixed(1)}%`);
}

/* 32 · a salt (tools/salt.mjs): sodium fluoride within 6% of its measured spacing (4.38 bohr) and energy (~9.57 eV);
   4D's todium gluoride, whose far field is exact (matching the computed pairs within 10% at 14 bohr) and whose
   lattice sum is extrapolated over cubes, holds harder */
{
  const S = await import(path.join(here, "../tools/salt.mjs")), core3 = { "1s": 2, "2s": 2, "2p": 6 }, core4 = { "1s": 2, "2s": 2, "2p": 8 };
  const naf = S.salt(3, S.ion(11, 3, core3), S.ion(9, 3, core3)), tog = S.salt(4, S.ion(13, 4, core4), S.ion(11, 4, core4));
  const seam = Object.values(tog.seam).every(({ computed, far }) => Math.abs(computed / far - 1) < 0.1), conv = Math.abs(tog.conv[2] - tog.conv[1]) < 0.6 * Math.abs(tog.conv[1] - tog.conv[0]);
  ok(near(naf.a, 4.38, 0.06) && near(naf.U, 9.57, 0.06) && seam && conv && tog.U > naf.U,
    `sodium fluoride ${naf.a.toFixed(2)} bohr, ${naf.U.toFixed(2)} eV (measured 4.38, ~9.57); todium gluoride ${tog.a.toFixed(2)} bohr, ${tog.U.toFixed(2)} eV; its far field matches the computed pairs and its sum converges as 1/M`);
}

/* 33 · fields (four/fields/, from js/fields.js): a current loop's far field falls as r⁻³ under a 1/r kernel (ours and
   pinned 4D) and r⁻⁴ under 4D Maxwell's 1/r², and matches Biot–Savart's closed form on our axis; a charge in a 4D
   field turns at (|L| ± |R|)/2 and an all-left field closes its path; a neutral 4D shell-atom leaks a²/8s³ */
{
  const F = await import(path.join(here, "../js/fields.js")), slope = (f, a, b) => Math.log(f(b) / f(a)) / Math.log(b / a);
  const along = (d, p, z) => F.bivectorSize(F.loopField(d === 3 ? [0, 0, z] : [0, 0, z, 0], p));
  const s3 = slope((z) => along(3, 1, z), 20, 40), s4 = slope((z) => along(4, 1, z), 20, 40), sM = slope((z) => along(4, 2, z), 20, 40), axis = along(3, 1, 0.7) / ((2 * Math.PI) / 1.49 ** 1.5);
  const r = F.cyclotronRates([[0, 1, 0, 0], [-1, 0, 0, 0], [0, 0, 0, 0.4], [0, 0, -0.4, 0]]), back = F.cyclotronPath([[0, 1, 0, 0], [-1, 0, 0, 0], [0, 0, 0, 1], [0, 0, -1, 0]], [1, 0, 1, 0], 2 * Math.PI, 2000).at(-1);
  ok(near(s3, -3, 0.01) && near(s4, -3, 0.01) && near(sM, -4, 0.01) && near(axis, 1, 1e-6) && near(r.fast, 1, 1e-9) && near(r.slow, 0.4, 1e-9) && Math.hypot(...back) < 1e-6 && near(F.neutralShell(20, 1, 4) * 8 * 8000, 1, 0.01) && F.neutralShell(5, 1, 3) === 0,
    `fields: a loop's far field r^${s3.toFixed(2)} (ours), r^${s4.toFixed(2)} (pinned 4D), r^${sM.toFixed(2)} (4D Maxwell); cyclotron rates ${r.fast} and ${r.slow.toFixed(2)}; the all-left path closes; the neutral shell leaks a²/8s³`);
}

/* 34 · liquid and vapour, simulated (tools/coexist.mjs → js/coexist.js): Lennard-Jones in 3D condenses where it's
   published to (1.31 ε/k); our argon's computed pair holds the measured 150.87 K; a bigger box agrees; and element
   12's critical point is where the gases chapter says, at least three times the well-depth rule */
{
  const { COEXIST: X } = await import(path.join(here, "../js/coexist.js")), rng = (k) => [Math.min(X[k].Tc, X[k].TcOther), Math.max(X[k].Tc, X[k].TcOther)];
  const lj = rng("lj3"), ar = rng("ar").map((t, i) => (t * X.ar.epsK) / (i ? 1 : 1.8)), oe = rng("oe").map((t, i) => (t * X.oe.epsK) / (i ? 1 : 1.8));
  const size = X.oe.sizes[0].runs, dz = Math.max(Math.abs(size[0].l / size[1].l - 1), Math.abs(size[0].v / size[1].v - 1));
  ok(lj[0] <= 1.312 * 1.01 && lj[1] >= 1.312 * 0.99 && ar[0] <= 150.87 && ar[1] >= 150.87 && dz < 0.03 && oe[0] > 3 * 0.7 * 1.26 * X.oe.epsK && X.oe.lastSplit >= 8,
    `coexistence: Lennard-Jones 3D condenses below ${lj.map((t) => t.toFixed(3)).join("–")} ε/k (published 1.31); our argon below ${ar.map((t) => t.toFixed(0)).join("–")} K (measured 150.87); element 12 below ${oe.map((t) => t.toFixed(0)).join("–")} K; a doubled box moves its densities ${(100 * dz).toFixed(1)}%`);
}

/* 35 · stars (js/stars.js): the self-consistent star reproduces Lane–Emden's n = 1 profile and n = 3/2 concentration in
   3D; pinned 4D's monatomic star is bound with E = W/2 and Gauss's is marginal, each obeying the virial theorem; the
   shell theorem leaves no pull from outside in 3D; the tunnelling integral gives Gamow's 2πη */
{
  const S = await import(path.join(here, "../js/stars.js"));
  const n1 = S.polytrope("newton", 1, { N: 200 }), e1 = Math.max(...n1.r.map((x, i) => Math.abs(n1.rho[i] - Math.sin(Math.PI * x) / (Math.PI * x))));
  const n15 = S.polytrope("newton", 1.5, { N: 200 }), p4 = S.polytrope("pinned4", 2, { N: 200 }), g4 = S.polytrope("gauss4", 2, { N: 200 });
  const outer3 = Math.max(...S.outerPull(S.polytrope("newton", 1.5, { N: 80 })).map(([, f]) => Math.abs(f)));
  const E = 0.01, eta = S.E2 / (S.HBARC * Math.sqrt((2 * E) / 469.459)), G = S.gamow(E, { rn: 1e-6, langer: false });
  ok(e1 < 1e-4 && near(n15.centralOverMean, 5.99071, 1e-3) && near(p4.bound, 0.5, 1e-4) && Math.abs(g4.bound) < 1e-4 && [n15, p4, g4].every((p) => Math.abs(p.virial) < 1e-4) && outer3 < 1e-9 && near(G, 2 * Math.PI * eta, 1e-3),
    `stars: Lane–Emden n = 1 to ${e1.toExponential(1)}, n = 3/2 concentration ${n15.centralOverMean.toFixed(3)} (5.991); pinned 4D E/W = ${p4.bound.toFixed(4)}, Gauss 4D ${g4.bound.toFixed(4)}; no pull from outside in 3D; Gamow ${G.toFixed(3)} = 2πη`);
}

/* 36 · orbits (js/orbits.js): Kepler's orbit closes under 1/r; a 1/r³ correction turns it back by −(3π/4)⟨r²⟩/p² per
   orbit, as integration says, and the solved 4D star's outside carries exactly that correction; under Gauss's 1/r² a
   nudged circle runs away; two planets in one plane at radii 1 and 1.2 are thrown out, in orthogonal planes at equal
   radii they hold √2 apart; the angle between two planes holds while they turn */
{
  const O = await import(path.join(here, "../js/orbits.js")), S = await import(path.join(here, "../js/stars.js"));
  const kepler = Math.abs(O.measurePrecession((r) => 1 / r ** 2, 4, 0.3, 3)), b = 0.05, pre = O.measurePrecession((r) => 1 / r ** 2 - (3 * b) / r ** 4, 10, 0.2, 3) / O.precessionPerOrbit(8 * b, 10);
  const st = S.polytrope("pinned4", 2, { N: 120 }), dr = 1 / st.r.length, star = O.starPotential(st.r, st.rho.map((p, i) => p * 2 * Math.PI ** 2 * st.r[i] ** 3 * dr)), far = ((star.phi(6) + 1 / 6) * 8 * 216) / star.r2;
  const pinned = Math.max(...O.nudged(1, 4, 4).map((q) => q[1])), gauss = O.nudged(2, 4, 12).at(-1)[1];
  const thrown = O.twoPlanets(1.2, 0, { orbits: 20 }).lost, orth = O.twoPlanets(1.0, 90, { orbits: 300, per: 300 }), turn = O.twoPlanets(1.05, 60, { orbits: 300, per: 300, sample: 5 }).series;
  const angle = Math.max(...turn.map((q) => Math.abs(q[2] - 60))), swing = Math.max(...turn.map((q) => q[3]));
  ok(kepler < 1e-5 && near(pre, 1, 0.01) && near(far, 1, 0.02) && pinned < 1.05 && gauss > 4 && thrown !== null && orth.lost === null && orth.dmin > 1.41 && angle < 0.2 && swing > 0.02,
    `orbits: Kepler's closes to ${kepler.toExponential(1)} rad; a 1/r³ term precesses at ${pre.toFixed(4)}× the formula; the 4D star's outside correction is ${far.toFixed(3)}× ⟨r²⟩/8r³; a nudged circle reaches ${pinned.toFixed(3)} pinned and ${gauss.toFixed(1)} under Gauss; coplanar 1 and 1.2 thrown out on orbit ${thrown}, orthogonal 1 and 1 never closer than ${orth.dmin}; the planes' angle holds to ${angle.toFixed(2)}° while planet 1 swings ${(swing * 100).toFixed(1)}% out`);
}

/* 37 · geometry (js/geometry.js, the geometry chapter): the sphere formulas against random points; directions against sampling;
   D₄'s 24 shortest vectors and its packing; flats in general position; a double rotation that fixes no line; Hopf's
   circles at unit speed, apart, and equidistant */
{
  const GE = await import(path.join(here, "../js/geometry.js")), rel = (x, y, t) => Math.abs(x / y - 1) < t;
  let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), gs = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const inBall = (d, n) => { let k = 0; for (let i = 0; i < n; i++) { let r2 = 0; for (let c = 0; c < d; c++) r2 += (2 * rnd() - 1) ** 2; if (r2 < 1) k++; } return k / n; };
  const b3 = inBall(3, 200000), b4 = inBall(4, 200000), dbl = [2, 3, 4].every((d) => near(GE.sphereArea(d, 2) / GE.sphereArea(d, 1), 2 ** (d - 1), 1e-12));
  const exact = near(GE.ballVolume(4), Math.PI ** 2 / 2, 1e-12) && near(GE.sphereArea(4), 2 * Math.PI ** 2, 1e-12) && near(GE.ballVolume(3), (4 * Math.PI) / 3, 1e-12);
  const dirs = (d, n) => { let m = 0, cap = 0; for (let i = 0; i < n; i++) { const a = Array.from({ length: d }, gs), b = Array.from({ length: d }, gs), c = a.reduce((t, u, k) => t + u * b[k], 0) / (Math.hypot(...a) * Math.hypot(...b)); m += Math.abs(c); if (c > Math.cos(Math.PI / 6)) cap++; } return [m / n, cap / n]; };
  const [m4, c4] = dirs(4, 100000);
  const lat = []; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (let e = -2; e <= 2; e++) if ((a + b + c + e) % 2 === 0 && (a || b || c || e)) lat.push(a * a + b * b + c * c + e * e);
  const minN = Math.min(...lat), nMin = lat.filter((q) => q === minN).length;
  const det = (M) => { M = M.map((r) => r.slice()); const n = M.length; let D = 1; for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; if (Math.abs(M[p][i]) < 1e-14) return 0; if (p !== i) { [M[p], M[i]] = [M[i], M[p]]; D = -D; } D *= M[i][i]; for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c < n; c++) M[r][c] -= f * M[i][c]; } } return D; };
  const planesMeetAtPoint = Array.from({ length: 50 }, () => Math.abs(det(Array.from({ length: 4 }, () => Array.from({ length: 4 }, gs)))) > 1e-9).every(Boolean);
  const th = 0.7, c = Math.cos(th), sn = Math.sin(th), R = [[c, -sn, 0, 0], [sn, c, 0, 0], [0, 0, c, -sn], [0, 0, sn, c]], noFixed = Math.abs(det(R.map((r, i) => r.map((v, j) => v - (i === j ? 1 : 0))))) > 0.1;
  const C1 = GE.hopfCircle(0.5, 0, 0, 400), C2 = GE.hopfCircle(0.9, 0, 1.3, 2000), onS3 = C1.every((p) => near(Math.hypot(...p), 1, 1e-12));
  const unit = C1.every((p) => { const q = GE.J(p); return near(Math.hypot(...q), 1, 1e-12) && Math.abs(q.reduce((t, u, k) => t + u * p[k], 0)) < 1e-12; });
  const gaps = C1.map((p) => Math.min(...C2.map((q) => Math.hypot(...p.map((u, k) => u - q[k]))))), gMin = Math.min(...gaps), gMax = Math.max(...gaps);
  const T = [0, 1, 2, 3].map((k) => GE.cubeParts(4, k));
  ok(rel(b3, Math.PI / 6, 0.01) && rel(b4, Math.PI ** 2 / 32, 0.015) && dbl && exact && rel(m4, GE.meanAbsCos(4), 0.01) && rel(c4, GE.capShare(4, Math.PI / 6), 0.06) && minN === 2 && nMin === 24 && GE.shortestD(4).length === 24 && rel(GE.packing(4), Math.PI ** 2 / 16, 1e-12) && planesMeetAtPoint && noFixed && onS3 && unit && gMin > 0.1 && gMax - gMin < 0.003 && T.join() === "16,32,24,8" && T[0] - T[1] + T[2] - T[3] === 0,
    `geometry: a 4D ball fills ${(b4 * 100).toFixed(2)}% of its cube by sampling (π²/32 = ${((Math.PI ** 2 / 32) * 100).toFixed(2)}%), ours ${(b3 * 100).toFixed(2)}%; mean |cos| of random 4D directions ${m4.toFixed(4)} (${GE.meanAbsCos(4).toFixed(4)}), a 30° cone ${(c4 * 100).toFixed(2)}% (${(GE.capShare(4, Math.PI / 6) * 100).toFixed(2)}%); D₄'s shortest vectors: ${nMin} of length √${minN}; random planes meet only at the origin; an equal double rotation leaves no line; two Hopf circles stay ${gMin.toFixed(4)}–${gMax.toFixed(4)} apart; the tesseract ${T.join(", ")}`);
}

/* 38 · geometry, continued (js/geometry.js, the geometry chapter): Pólya's return chances from Montroll's integral
   against their known values and against simulated walks; points in thin shells against the sphere's surface; a
   tesseract's corner-first slices; the Clifford torus flat, on the 3-sphere, and projected to a √2 : 1 doughnut */
{
  const GE = await import(path.join(here, "../js/geometry.js")), rel = (x, y, t) => Math.abs(x / y - 1) < t;
  const p3 = GE.returnChance(3), p4 = GE.returnChance(4), p5 = GE.returnChance(5), w4 = GE.walkReturns(4, 3000, 4096).at(-1)[1];
  const k4 = GE.shellCounts(4, 12), inside = k4.slice(0, 12).reduce((a, b) => a + b, 0), shellsOk = [8, 9, 10, 11].every((r) => rel(k4[r], GE.ballVolume(4, r + 1) - GE.ballVolume(4, r), 0.08));
  const { V, E } = GE.tesseract(), sl = [-1.5, -0.5, 0, 0.5, 1.5].map((h) => GE.sliceCorners(V, E, [0.5, 0.5, 0.5, 0.5], h).length);
  let flat = true, ring = 0;
  for (let i = 0; i < 40; i++) {
    const a = i * 0.37, b = i * 0.91, P = GE.clifford(a, b), e = 1e-6, da = GE.clifford(a + e, b).map((x, k) => (x - P[k]) / e), db = GE.clifford(a, b + e).map((x, k) => (x - P[k]) / e);
    const dot = da.reduce((t, x, k) => t + x * db[k], 0);
    if (!(Math.abs(Math.hypot(...P) - 1) < 1e-12 && Math.abs(Math.hypot(...da) - Math.SQRT1_2) < 1e-5 && Math.abs(Math.hypot(...db) - Math.SQRT1_2) < 1e-5 && Math.abs(dot) < 1e-5)) flat = false;
    const q = GE.stereo(P); ring = Math.max(ring, Math.abs((Math.hypot(q[0], q[1]) - Math.SQRT2) ** 2 + q[2] ** 2 - 1));
  }
  ok(rel(p3, 0.340537, 1e-5) && rel(p4, 0.193206, 1e-4) && rel(p5, 0.135178, 1e-4) && rel(w4, p4, 0.06) && shellsOk && rel(inside, GE.ballVolume(4, 12), 0.02) && sl.join() === "4,12,6,12,4" && flat && ring < 1e-9,
    `geometry, continued: a walker comes home ${(p3 * 100).toFixed(2)}% of the time in ours, ${(p4 * 100).toFixed(2)}% in 4D (Pólya, Montroll: 34.05, 19.32), ${(w4 * 100).toFixed(1)}% of 3,000 simulated 4D walks within 4,096 steps; ${inside} whole-number points within radius 12 in 4D (the ball: ${GE.ballVolume(4, 12).toFixed(0)}); a corner-first tesseract's slices have ${sl.join(", ")} corners; the Clifford torus is flat and projects to a √2 : 1 doughnut (to ${ring.toExponential(0)})`);
}

/* 39 · the live five-molecule search (js/clusterlive.js, the search chapter): start s built in the page follows the
   runner's start s (tools/clusters.mjs) to the same minimum, so the page can name it from js/clusters.js. Water's start 0
   is where the runner first found its best; Xater's start 2 first found its fourth, which sits 0.02 kcal/mol from the
   third, so naming has to take the nearest */
{
  const CLV = await import(path.join(here, "../js/clusterlive.js")), run = (key, s) => { const C = CLV.clusterSearch(key, 5); let last; for (const st of C.steps(s)) last = st; return { e: last.f, g: last.g, nm: C.name(last.f), C }; };
  const w = run("3", 0), x = run("4", 2), first = (r, k) => r.C.ref.best[k - 1].first;
  ok(w.g < 2e-5 && x.g < 2e-5 && w.nm?.rank === 1 && first(w, 1) === 0 && x.nm?.rank === 4 && first(x, 4) === 2,
    `the live search: water's start 0 settles at ${(w.e * CLV.KCAL).toFixed(3)} kcal/mol, the runner's minimum #${w.nm?.rank} (first found by its start ${first(w, 1)}); Xater's start 2 at ${(x.e * CLV.KCAL).toFixed(3)}, #${x.nm?.rank} (first found by start ${first(x, 4)})`);
}

console.log(fails ? `\n✗ ${fails} of ${checks} atom4 checks failed` : `atom4: ${checks} checks in ${((Date.now() - t0) / 1000).toFixed(0)} s\n\n✓ atom4 selftest passed`);
process.exit(fails ? 1 : 0);
