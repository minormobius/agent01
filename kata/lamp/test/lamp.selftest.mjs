/* LAVALAMP's selftest: the solver (the anisotropic FFT against a direct transform; the creeping flow satisfies Stokes
   and is divergence-free, to rounding; the box stays its own mirror image, so the walls are walls; the wax is
   conserved), and the page's claims: a rippled thread with kR = 1.18 straightens in 3D and pinches off in 4D (the
   thresholds are kR < 1 and kR < √2); with kR = 0.69 it pinches in 3D too (the control); a hot ball loses half its
   heat at least 1.6× faster in 4D; the 3D lamp in its glass cycles (wax reaches 0.7 of the height and its top blob comes
   back down) and never leaves the glass. (The 4D lamp costs ~180 ms a step here: its cycles aren't run.)
   Also: the threaded FFT matches the single-threaded one exactly, and the first blob rises out of the pool (it isn't
   carried up dissolved and condensed at the top).
     node kata/lamp/test/lamp.selftest.mjs   (~60 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), Lm = await import(path.join(here, "../js/lamp.js"));
// (the page's lamp settings, as worker.js gives them)
const LAMP = { glass: true, eps: 0.7, waxShare: 0.2, heat: 0.8, coolGlass: 0.15, coolFrom: 0.65, mob: 0.35, capF: 0.3, cfl: 0.7, flowEvery: 2 };
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

/* the threaded FFT (node's worker_threads standing in for Web Workers): the same numbers, to the last bit */
{
  const { Worker } = await import(path.join(here, "nodeworker.mjs")); globalThis.Worker = Worker;
  const { makeThreadedFFT } = await import(path.join(here, "../js/pfft.js"));
  const dims = [16, 64, 16, 16], M = dims.reduce((a, b) => a * b), sab = () => new Float64Array(new SharedArrayBuffer(8 * M)), re = sab(), im = sab();
  for (let i = 0; i < M; i++) { re[i] = Math.sin(i * 0.37); im[i] = Math.cos(i * 0.11); }
  const c = re.slice(), d = im.slice(); Lm.makeFFTn(dims)(c, d, true);
  const P = await makeThreadedFFT(dims, 3, [re, im]); P.fft(re, im, true); P.close();
  let e = 0; for (let i = 0; i < M; i++) e = Math.max(e, Math.abs(re[i] - c[i]), Math.abs(im[i] - d[i]));
  ok(e === 0, `the 4D transform split across 3 threads sharing memory gives the same numbers as one thread, exactly (${e})`);
}

/* the lamp, in its glass, as the page runs it: the wax's centre rises past 0.45 of the height, comes back below 0.3,
   and rises past 0.45 again (a cycle), and none of it is ever outside the glass */
{
  const L = Lm.makeLamp(3, 16, 32, LAMP); Lm.START.lamp(L, 1); const marks = []; let phase = 0, outMax = -1, waxOut = 0;
  while (L.t < 400 && phase < 3) {
    Lm.step(L); if (L.steps % 5) continue;
    const h = Lm.stats(L).height;
    if (phase === 0 && h > 0.45) { marks.push(L.t); phase = 1; } else if (phase === 1 && h < 0.3) { marks.push(L.t); phase = 2; } else if (phase === 2 && h > 0.45) { marks.push(L.t); phase = 3; }
    let w = 0, n = 0; for (let p = 0; p < L.M; p++) if (L.yOf[p] < L.ny) { if (L.phi[p] > 0) { n++; if (!L.inside[p]) w++; } if (!L.inside[p]) outMax = Math.max(outMax, L.phi[p]); } waxOut = Math.max(waxOut, w / Math.max(1, n));
  }
  ok(phase === 3 && waxOut === 0 && outMax < -0.5, `the 3D lamp in its glass cycles: the wax's centre up past 0.45 of the height at t ${marks[0]?.toFixed(0)}, back below 0.3 at t ${marks[1]?.toFixed(0)}, up again at t ${marks[2]?.toFixed(0)}; none of it ever outside the glass (the liquid there no richer than φ = ${outMax.toFixed(2)})`);
}

/* the wax stays wax: over the second half of a 400-long run, on average at least half the cells that began as wax are
   still more than half wax. (Two things once stirred it into a mush: limited-upwind transport of φ, whose numerical
   diffusion low mobility can't undo, and the interface's tension acting at the glass, where the wall's potential makes a
   step against any wax touching it, which drove a flow that never stopped) */
{
  const L = Lm.makeLamp(3, 16, 32, LAMP); Lm.START.lamp(L, 1); const w0 = Lm.stats(L).wax; let s = 0, n = 0, last = 0;
  while (L.t < 400) { Lm.step(L); if (L.t > 200 && L.t - last >= 2) { last = L.t; s += Lm.stats(L).wax / w0; n++; } }
  ok(s / n >= 0.5, `the wax stays wax: ${(100 * s / n).toFixed(0)}% of it, on average over t 200–400, still more than half wax`);
}

/* where the first blob comes from: the pool. Follow the top of the wax (its highest cell more than half wax) every
   other step until it reaches 0.7 of the height: wax that rises gets there a little at a time; wax that went up
   dissolved, or appeared from nothing, shows up there all at once. Both happened: with the wax free to diffuse
   (mobility 1) it went up dissolved; and the flow next to the glass, not quite divergence-free once the glass's faces
   are shut, rarefied pure liquid toward φ = 0 under the cap until advection took out the f ∇·u it was adding */
const climb = (phys) => {
  const L = Lm.makeLamp(3, 16, 32, phys); Lm.START.lamp(L, 1); let prev = 0, jump = 0;
  while (L.t < 300) {
    Lm.step(L); if (L.steps % 2) continue;
    let top = 0; for (let p = 0; p < L.M; p++) if (L.yOf[p] < L.ny && L.phi[p] > 0) top = Math.max(top, L.yOf[p]);
    jump = Math.max(jump, top - prev); prev = top; if (top >= 0.7 * L.ny) return { t: L.t, jump };
  }
  return { t: null, jump };
};
{
  const a = climb(LAMP);
  ok(a.t != null && a.jump <= 6, `the first blob rises from the pool: the top of the wax climbs to 0.7 of the height by t ${a.t?.toFixed(0)}, never more than ${a.jump} cells between looks (before the fix below it jumped 16 cells at once: wax appeared under the cap from nothing)`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
