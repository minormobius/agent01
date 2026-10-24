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
  ok(miss.join() === "24,29", `3D configurations match ours for all of Z = 1–36 but chromium and copper (misses: ${miss.join(", ") || "none"})`);
  ok(P.realConfig(24) === "1s2 2s2 2p6 3s2 3p6 3d5 4s1" && P.realConfig(26) === "1s2 2s2 2p6 3s2 3p6 3d6 4s2", "our real configurations, as written");
  const n3 = TABLE[3].filter((el) => P.isNoble(el, 3)).map((el) => el.Z);
  ok(n3.join() === "2,10,18,36", `3D noble gases ${n3.join(", ")}`);
  ok(!P.isNoble(TABLE[3][3], 3) && !P.isNoble(TABLE[3][29], 3) && !P.isNoble(TABLE[4][67], 4), "beryllium, zinc and 4D's palladium-like element 68 aren't noble gases");
  // ionization: the solver's peaks and troughs fall where the measured ones do
  const ie = TABLE[3].map((el) => el.ion * 27.211386), peaks = [2, 10, 18, 36].every((z) => ie[z - 1] > ie[z - 2] && (z === 36 || ie[z - 1] > ie[z]));
  const ratio = TABLE[3].map((el, i) => ie[i] / P.IE_REAL[i]).sort((a, b) => a - b), median = ratio[18];
  const mean = (x) => x.reduce((a, v) => a + v, 0) / x.length, ma = mean(ie), mb = mean(P.IE_REAL);
  const corr = ie.reduce((a, v, i) => a + (v - ma) * (P.IE_REAL[i] - mb), 0) / Math.sqrt(ie.reduce((a, v) => a + (v - ma) ** 2, 0) * P.IE_REAL.reduce((a, v) => a + (v - mb) ** 2, 0));
  ok(peaks && corr > 0.9 && median > 0.6 && median < 0.8, `3D ionization peaks at the noble gases and follows the measured values (correlation ${corr.toFixed(3)}), about a third low (median ${median.toFixed(2)} of measured), as the page says`);
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
  const falls = i3.every((v, i) => !i || v < i3[i - 1]), rises = i4.slice(1).every((v, i) => !i || v > i4[i]);
  ok(falls && rises, `noble gases: 3D ionization falls down the column, 4D rises from row 2 on (${i4.map((v) => (v * 27.2114).toFixed(1)).join(", ")} eV)`);
  ok(cf.length === i4.length && cf.every((c, i) => c.Z === nob(4)[i].Z) && cf.slice(1).every((c, i) => c.ion < 0.7 * i4[i + 1]) && Math.max(...cf.slice(1).map((c) => c.ion)) < 1.25 * Math.min(...cf.slice(1).map((c) => c.ion)),
    `with the shell theorem forced on, 4D's noble gases lose the rise (${cf.map((c) => (c.ion * 27.2114).toFixed(1)).join(", ")} eV)`);
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

console.log(fails ? `\n✗ ${fails} of ${checks} atom4 checks failed` : `atom4: ${checks} checks in ${((Date.now() - t0) / 1000).toFixed(0)} s\n\n✓ atom4 selftest passed`);
process.exit(fails ? 1 : 0);
