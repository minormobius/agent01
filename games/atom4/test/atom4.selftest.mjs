/* ATOM⁴ selftest: the solver against closed forms (hydrogen in both worlds, the sphere-averaged kernel), against
   known numbers (helium's Hartree–Fock energy), against our own periodic table (3D), and the baked table against
   the solver that made it. The field theory's closed forms too.
     node games/atom4/test/atom4.selftest.mjs */
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
const OPT = await import(path.join(here, "../../lumen4/js/optics.js"));
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

/* 14 · the chapters: one landing and nine pages, the same nav on each, no id twice, every drawing's element somewhere */
{
  const dir = path.join(here, ".."), pages = ["index", "force", "light", "motion", "hydrogen", "table", "shapes", "darbon", "forces", "yater"], html = Object.fromEntries(pages.map((p) => [p, fs.readFileSync(path.join(dir, p + ".html"), "utf8")]));
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

/* 19 · molecules: Hartree–Fock in any dimension (js/gauss.js), then Pxygen and Yater (js/molecules.js) */
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
  // the bake is reproducible: Yater at its baked shape, small basis
  const y = MT.monomer(4, M[4].small.R, M[4].small.theta, "small");
  ok(Math.abs(y.E - M[4].small.E) < 1e-5 && y.converged, `the baked Yater is what tools/molecules.mjs computes (${y.E.toFixed(6)})`);
  // our water, the check: the big basis within reach of the Hartree–Fock limit (1.776 bohr, 106.3°, 0.78)
  const w = M[3].big;
  ok(Math.abs(w.R - 1.776) < 0.01 && Math.abs(w.theta - 106.3) < 0.5 && Math.abs(w.dipole - 0.78) < 0.03 && w.ok, `our water at the big basis: ${w.R} bohr, ${w.theta}°, dipole ${w.dipole} (Hartree–Fock limit about 1.776, 106.3°, 0.78)`);
  // the conclusions
  const Y = M[4].big, s4 = M[4].small;
  ok(Y.ok && s4.ok && Y.theta > 117 && Y.theta < 123 && Math.abs(Y.theta - s4.theta) < 5, `Yater is bent at ${Y.theta}° (small basis ${s4.theta}°): wider than water and than sp⁴'s 104.48°`);
  ok(Y.dipole / w.dipole > 1.9 && Y.linear < 0.25 * w.linear && Math.abs(Y.homo - Y.homo2) < 2e-4 && M[4].big.atom.hund < M[4].big.atom.closed, `Yater's dipole ${Y.dipole} is ${(Y.dipole / w.dipole).toFixed(2)}× water's; straightening it costs ${(Y.linear * 27.2114).toFixed(2)} eV (water ${(w.linear * 27.2114).toFixed(2)}); its top orbital is two-fold (the ring); Pxygen's Hund state is its ground`);
  const D3 = M[3].dimer, D4 = M[4].dimer;
  ok(D3.ok && D4.ok && D3.E < 0 && D4.E / D3.E > 2.5 && (D4.RXX - D4.r) / D4.r < 1.5 && (D3.RXX - D3.r) / D3.r > 2, `the hydrogen bond: Yater's ${(-D4.E * 627.51).toFixed(1)} kcal/mol at ${D4.RXX} bohr, water's ${(-D3.E * 627.51).toFixed(1)} at ${D3.RXX}, the same way`);
}

console.log(fails ? `\n✗ ${fails} of ${checks} atom4 checks failed` : `atom4: ${checks} checks in ${((Date.now() - t0) / 1000).toFixed(0)} s\n\n✓ atom4 selftest passed`);
process.exit(fails ? 1 : 0);
