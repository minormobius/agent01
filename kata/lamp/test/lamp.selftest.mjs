/* LAVALAMP's selftest: the solver (the anisotropic FFT against a direct transform; the creeping flow satisfies Stokes
   and is divergence-free, to rounding; the box stays its own mirror image, so the walls are walls; the wax is
   conserved), and the page's claims: a rippled thread with kR = 1.18 straightens in 3D and pinches off in 4D (the
   thresholds are kR < 1 and kR < √2); with kR = 0.69 it pinches in 3D too (the control); a hot ball loses half its
   heat at least 1.6× faster in 4D; the 3D lamp in its glass cycles (wax reaches 0.7 of the height and its top blob comes
   back down) and never leaves the glass. (The 4D lamp costs ~180 ms a step here: its cycles aren't run.)
     node kata/lamp/test/lamp.selftest.mjs   (~80 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), Lm = await import(path.join(here, "../js/lamp.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const runTo = (L, T) => { while (L.t < T) Lm.step(L); };

/* the solver */
{
  const dims = [4, 8, 2], M = 64, re = new Float64Array(M).map((_, i) => Math.sin(i * 1.7)), im = new Float64Array(M).map((_, i) => Math.cos(i * 0.3)), R = new Float64Array(M), I = new Float64Array(M);
  for (let k = 0; k < M; k++) { const kk = [k % 4, Math.floor(k / 4) % 8, Math.floor(k / 32)]; for (let p = 0; p < M; p++) { const x = [p % 4, Math.floor(p / 4) % 8, Math.floor(p / 32)], ph = -2 * Math.PI * (kk[0] * x[0] / 4 + kk[1] * x[1] / 8 + kk[2] * x[2] / 2); R[k] += re[p] * Math.cos(ph) - im[p] * Math.sin(ph); I[k] += re[p] * Math.sin(ph) + im[p] * Math.cos(ph); } }
  Lm.makeFFTn(dims)(re, im); let e = 0; for (let k = 0; k < M; k++) e = Math.max(e, Math.abs(re[k] - R[k]), Math.abs(im[k] - I[k]));
  ok(e < 1e-10, `the FFT on a 4 × 8 × 2 grid matches a direct transform (${e.toExponential(1)})`);
}
for (const D of [3, 4]) {
  const L = Lm.makeLamp(D, 8, 16); Lm.START.lamp(L, 5); for (let p = 0; p < L.M; p++) L.T[p] = (L.yOf[p] < 16 ? L.yOf[p] : 31 - L.yOf[p]) / 16;
  Lm.flow(L);
  const { M, phi, T, P, mu, yOf } = L, f = [];
  for (let a = 0; a < D; a++) { const g = new Float64Array(M); for (let p = 0; p < M; p++) g[p] = (mu[p] * (phi[L.up[a][p]] - phi[L.dn[a][p]])) / 2; f.push(g); }
  for (let p = 0; p < M; p++) { const v = phi[p], rho = 0.5 * (1 + v) * (P.delta - P.aw * T[p]) - 0.5 * (1 - v) * P.al * T[p]; f[1][p] += (yOf[p] < 16 ? -1 : 1) * P.g * rho; }
  const tr = (g) => { const r = g.slice(), i = new Float64Array(M); L.fft(r, i, false); return [r, i]; }, F = f.map(tr), Uh = L.u.map(tr);
  let res = 0, scale = 0, div = 0;
  for (let p = 0; p < M; p++) { const kk = L.k2[p]; if (!kk || L.nyq[p]) continue; let dr = 0, di = 0, ur = 0, ui = 0; for (let a = 0; a < D; a++) { dr += L.kv[a][p] * F[a][0][p]; di += L.kv[a][p] * F[a][1][p]; ur += L.kv[a][p] * Uh[a][0][p]; ui += L.kv[a][p] * Uh[a][1][p]; }
    div = Math.max(div, Math.hypot(ur, ui));
    for (let a = 0; a < D; a++) { const pr = F[a][0][p] - (L.kv[a][p] * dr) / kk, pi = F[a][1][p] - (L.kv[a][p] * di) / kk; res = Math.max(res, Math.hypot(P.eta * kk * Uh[a][0][p] - pr, P.eta * kk * Uh[a][1][p] - pi)); scale = Math.max(scale, Math.hypot(pr, pi)); } }
  ok(res / scale < 1e-12 && div < 1e-10, `${D}D: the flow solves Stokes (residual ${(res / scale).toExponential(1)} of the force) and is divergence-free (${div.toExponential(1)}), the force's components packed two to a transform`);
}
{
  const L = Lm.makeLamp(3); Lm.START.lamp(L, 3); const m0 = L.phi.reduce((a, b) => a + b, 0); runTo(L, 60);
  let ep = 0, eu = 0; for (let p = 0; p < L.M; p++) { const q = Lm.mirror(L, p); ep = Math.max(ep, Math.abs(L.phi[p] - L.phi[q]), Math.abs(L.T[p] - L.T[q])); eu = Math.max(eu, Math.abs(L.u[1][p] + L.u[1][q]), Math.abs(L.u[0][p] - L.u[0][q])); }
  const m1 = L.phi.reduce((a, b) => a + b, 0);
  ok(ep < 1e-9 && eu < 1e-9 && Math.abs(m1 - m0) / L.M < 1e-9, `the doubled box stays its own mirror image (φ, T ${ep.toExponential(1)}; flow ${eu.toExponential(1)}), so nothing crosses the walls; the wax is conserved (mean φ moved ${(Math.abs(m1 - m0) / L.M).toExponential(1)})`);
}

/* the thread */
const thread = (D, R, n, T) => { const L = Lm.makeLamp(D, 16, 32, { g: 0, heat: 0, cool: 0 }); Lm.START.thread(L, R, n); const a0 = Lm.ripple(L, n).amp; let pinchedAt = null; while (L.t < T) { Lm.step(L); if (pinchedAt == null && L.steps % 5 === 0 && Lm.ripple(L, n).pinched) pinchedAt = L.t; } return { a0, ...Lm.ripple(L, n), pinchedAt }; };
{
  const kR = (Math.PI * 3 * 4) / 32, t3 = thread(3, 4, 3, 150), t4 = thread(4, 4, 3, 120);
  ok(t3.amp < t3.a0 / 2 && !t3.pinched && t4.pinchedAt != null, `a thread rippled at kR = ${kR.toFixed(2)}: in 3D it straightens (ripple ${t3.a0.toFixed(2)} → ${t3.amp.toFixed(2)}, never pinched; it breaks only under kR = 1); in 4D it pinches off by t ${t4.pinchedAt?.toFixed(0)} (it breaks under kR = √2)`);
  const c3 = thread(3, 3.5, 2, 150);
  ok(c3.pinchedAt != null, `the control, kR = ${((Math.PI * 2 * 3.5) / 32).toFixed(2)}: under 1, so ours pinches too (by t ${c3.pinchedAt?.toFixed(0)})`);
}

/* the cooling */
{
  const hl = {}; for (const D of [3, 4]) { const L = Lm.makeLamp(D, 16, 32, { g: 0, heat: 0, cool: 0 }); Lm.START.cooling(L, 5); let prev = { t: 0, h: 1 }; while (L.t < 60) { Lm.step(L); const h = Lm.heatIn(L, 5); if (h <= 0.5) { hl[D] = prev.t + ((prev.h - 0.5) / (prev.h - h)) * (L.t - prev.t); break; } prev = { t: L.t, h }; } }
  ok(hl[3] / hl[4] > 1.6, `a hot ball (R = 5) keeps half its heat until t ${hl[3].toFixed(1)} in 3D and t ${hl[4].toFixed(1)} in 4D: ${(hl[3] / hl[4]).toFixed(2)}× faster (4/3 the surface per volume, and more room for the heat to go)`);
}

/* the lamp, in its glass (the page's: ε 0.7, a fifth of the glass wax, heater 0.3) */
{
  const L = Lm.makeLamp(3, 16, 32, { glass: true, eps: 0.7, waxShare: 0.2, heat: 0.3 }); Lm.START.lamp(L, 1); let up = null, down = null, outMax = -1, waxOut = 0;
  while (L.t < 250) {
    Lm.step(L); if (L.steps % 5) continue;
    // up: wax at 0.7 of the height; down: after that, a cold blob (it cooled up there) low in the lamp, on its way back
    const s = Lm.stats(L), top = Math.max(0, ...s.blobs.filter((b) => b.n > 30).map((b) => b.y));
    if (up == null && top > 0.7) up = L.t; if (up != null && down == null && L.t > up + 10 && s.blobs.some((b) => b.n > 30 && b.T < 0.25 && b.y < 0.5 && b.y > 0.2)) down = L.t;
    let w = 0, n = 0; for (let p = 0; p < L.M; p++) if (L.yOf[p] < L.ny) { if (L.phi[p] > 0) { n++; if (!L.inside[p]) w++; } if (!L.inside[p]) outMax = Math.max(outMax, L.phi[p]); } waxOut = Math.max(waxOut, w / Math.max(1, n));
  }
  ok(up != null && down != null && waxOut === 0 && outMax < -0.5, `the 3D lamp in its glass cycles: wax reaches 0.7 of the height by t ${up?.toFixed(0)}, and a blob cooled up there is back below half height by t ${down?.toFixed(0)}; none of it ever outside the glass (the liquid there no richer than φ = ${outMax.toFixed(2)})`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
