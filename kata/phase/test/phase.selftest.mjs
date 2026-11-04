/* PHASELAB's selftest: the solver (the batched FFT agrees with WAVELAB's; each liquid's amount is conserved; the free
   energy never rises; a flat interface carries σ = 2√2/3 in 3D and 4D alike), then the page's claims: a droplet's own
   squeeze μR/σ is 1 in 3D and 3/2 in 4D (Gibbs–Thomson, curvature (d − 1)/R); the same R = 7 droplet in the same liquid
   grows in 3D and dissolves in 4D (critical radii 5.5 and 8.3); a quarter-minority breaks into pieces in 3D while it
   stays one network in 4D.
     node kata/phase/test/phase.selftest.mjs   (~90 s: the 4D runs are a million cells) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), P = await import(path.join(here, "../js/phase.js")), F = await import(path.join(here, "../../wavelab/js/fft.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const run = (ch, T, f = P.dtAt) => { while (ch.t < T) P.step(ch, Math.min(f(ch.t), T - ch.t + 1e-9)); };

/* the solver */
{
  let e = 0; for (const [D, N] of [[3, 16], [4, 8]]) { const M = N ** D, a = new Float64Array(M).map(Math.random), b = new Float64Array(M).map(Math.random), a2 = a.slice(), b2 = b.slice(); P.makeBatchFFT(N, D)(a, b); F.makeGridFFT(N, D)(a2, b2); for (let i = 0; i < M; i++) e = Math.max(e, Math.abs(a[i] - a2[i]), Math.abs(b[i] - b2[i])); }
  ok(e < 1e-9, `the batched FFT agrees with WAVELAB's line-by-line one, 3D and 4D (${e.toExponential(1)})`);
}
for (const D of [3, 4]) {
  const ch = P.makeCH(D, 16); P.quench(ch, -0.2, 3); const m0 = ch.phi.reduce((a, b) => a + b, 0) / ch.M; let E = P.energy(ch), up = 0;
  for (let i = 0; i < 60; i++) { P.step(ch, P.dtAt(ch.t)); const E2 = P.energy(ch); if (E2 > E + 1e-9 * Math.abs(E)) up++; E = E2; }
  const m1 = ch.phi.reduce((a, b) => a + b, 0) / ch.M;
  ok(Math.abs(m1 - m0) < 1e-12 && up === 0, `${D}D: each liquid's amount conserved (mean φ ${m0.toFixed(6)} → ${m1.toFixed(6)}), the free energy never rises over 60 steps`);
}
for (const D of [3, 4]) {
  // two flat interfaces across a periodic box: the free energy above the uniform −1 is 2σ per unit of cross-section
  const N = 16, ch = P.makeCH(D, N); P.setPhi(ch, (x) => Math.tanh((N / 4 - Math.abs(x[0] + 0.5 - N / 2)) / (Math.SQRT2 * P.EPS)));
  run(ch, 50, () => 1); const sig = P.energy(ch) / (2 * N ** (D - 1));
  ok(Math.abs(sig / P.SIGMA - 1) < 0.02, `${D}D: a flat interface carries σ = ${sig.toFixed(4)} per unit of interface (2√2/3 = ${P.SIGMA.toFixed(4)}): the same in both`);
}

/* the droplet's squeeze */
const gt = {};
for (const D of [3, 4]) { const ch = P.makeCH(D, 32); P.droplet(ch, 8, -0.9); run(ch, 800, P.dtDrop); const R = P.radiusOf(D, P.clusters(ch, 1).sizes[0]); gt[D] = (P.farMu(ch) * R) / P.SIGMA; gt[D + "R"] = R; }
ok(Math.abs(gt[3] - 1) < 0.05 && Math.abs(gt[4] - 1.5) < 0.1 && gt[4] / gt[3] > 1.38, `a droplet's squeeze μR/σ: 3D ${gt[3].toFixed(3)} (R ${gt["3R"].toFixed(2)}; two curvatures, want 1), 4D ${gt[4].toFixed(3)} (R ${gt["4R"].toFixed(2)}; three, want 1.5): ${(gt[4] / gt[3]).toFixed(2)}× as squeezed`);

/* the nucleus */
{
  const r = {}; for (const D of [3, 4]) { const ch = P.makeCH(D, 32); P.droplet(ch, 7, -0.9); run(ch, 1000, P.dtDrop); const sz = P.clusters(ch, 1).sizes[0] || 0; r[D] = sz ? P.radiusOf(D, sz) : 0; }
  ok(r[3] > 7.2 && r[4] < 1, `the same R = 7 droplet in the same liquid (μ = 0.171): in 3D it grows (R ${r[3].toFixed(2)}, critical 5.5); in 4D it dissolves (${r[4] ? `R ${r[4].toFixed(2)}` : "gone"}, critical 8.3)`);
}

/* the emulsion */
{
  const out = []; let pass = true;
  for (const seed of [11, 12]) { const share = {}; for (const D of [3, 4]) { const ch = P.makeCH(D, 32); P.quench(ch, -0.4, seed); share[D] = []; for (const T of [200, 300, 400]) { run(ch, T); share[D].push(P.stats(ch)); } }
    const min3 = Math.min(...share[3].map((s) => s.largest)), all4 = share[4].every((s) => s.pieces === 1);
    pass = pass && min3 < 0.8 && all4; out.push(`seed ${seed}: 3D largest piece down to ${(min3 * 100).toFixed(0)}% (${share[3].map((s) => s.pieces).join(", ")} pieces), 4D ${share[4].map((s) => s.pieces).join(", ")}`); }
  ok(pass, `a quarter-minority, at t 200, 300, 400: ${out.join("; ")}`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
