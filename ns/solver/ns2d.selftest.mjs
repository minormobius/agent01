#!/usr/bin/env node
// ns2d.selftest.mjs — known-answer tests for the 2D Navier–Stokes solver the
// /solver/ page runs. Imports the exact file the browser loads.
//
//   node ns/solver/ns2d.selftest.mjs
import './ns2d.js';
const { makeFFT, makeFFT2, create } = globalThis.NS2D;

let checks = 0, failed = 0;
function ok(cond, msg, detail = '') { checks++; if (!cond) { failed++; console.log('  ✗ ' + msg + (detail ? ' — ' + detail : '')); } else console.log('  ✓ ' + msg + (detail ? ' — ' + detail : '')); }
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// 1. FFT against a naive DFT --------------------------------------------------
{
  const n = 32, r = rnd(7), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = r() - 0.5; im[i] = r() - 0.5; }
  const dr = new Float64Array(n), di = new Float64Array(n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) { const a = -2 * Math.PI * j * k / n; dr[k] += re[j] * Math.cos(a) - im[j] * Math.sin(a); di[k] += re[j] * Math.sin(a) + im[j] * Math.cos(a); }
  const fr = Float64Array.from(re), fi = Float64Array.from(im); makeFFT(n)(fr, fi, false);
  let err = 0; for (let k = 0; k < n; k++) err = Math.max(err, Math.abs(fr[k] - dr[k]), Math.abs(fi[k] - di[k]));
  ok(err < 1e-12, 'forward FFT matches the naive DFT', 'max err ' + err.toExponential(2));
  makeFFT(n)(fr, fi, true);
  let rt = 0; for (let k = 0; k < n; k++) rt = Math.max(rt, Math.abs(fr[k] - re[k]), Math.abs(fi[k] - im[k]));
  ok(rt < 1e-13, 'inverse FFT round-trips', 'max err ' + rt.toExponential(2));
}
// 2. 2D round trip and a known transform ----------------------------------------
{
  const n = 16, fft2 = makeFFT2(n), re = new Float64Array(n * n), im = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[j * n + i] = Math.cos(3 * 2 * Math.PI * i / n) * Math.sin(2 * 2 * Math.PI * j / n);
  const r0 = Float64Array.from(re);
  fft2(re, im, false);
  // cos(3x) sin(2y) = ¼[(e^{3ix}+e^{-3ix})(e^{2iy}-e^{-2iy})/i] → four modes of modulus n²/4
  const mag = (i, j) => Math.hypot(re[j * n + i], im[j * n + i]);
  const expect = n * n / 4;
  ok(Math.abs(mag(3, 2) - expect) < 1e-9 && Math.abs(mag(n - 3, n - 2) - expect) < 1e-9 && Math.abs(mag(3, n - 2) - expect) < 1e-9 && Math.abs(mag(n - 3, 2) - expect) < 1e-9, '2D FFT puts cos(3x)sin(2y) on its four modes', 'moduli ' + mag(3, 2).toFixed(3));
  let other = 0; for (let m = 0; m < n * n; m++) { const i = m % n, j = (m - i) / n; if ([3, n - 3].includes(i) && [2, n - 2].includes(j)) continue; other = Math.max(other, Math.hypot(re[m], im[m])); }
  ok(other < 1e-9, 'and nowhere else', 'leak ' + other.toExponential(2));
  fft2(re, im, true);
  let rt = 0; for (let m = 0; m < n * n; m++) rt = Math.max(rt, Math.abs(re[m] - r0[m]), Math.abs(im[m]));
  ok(rt < 1e-12, '2D round trip', 'max err ' + rt.toExponential(2));
}
// 3. Taylor–Green: ω = 2cos x cos y decays exactly like e^{−2νt} ------------------
{
  const n = 32, nu = 0.1, sim = create(n, nu), w0 = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) w0[j * n + i] = 2 * Math.cos(2 * Math.PI * i / n) * Math.cos(2 * Math.PI * j / n);
  sim.setVorticity(w0);
  const d0 = sim.diagnostics();
  ok(Math.abs(d0.maxU - 1) < 1e-9, 'Taylor–Green velocity has |u|max = 1', d0.maxU.toFixed(9));
  ok(Math.abs(d0.E - 0.25) < 1e-9, 'and mean kinetic energy ½⟨u²+v²⟩ = ¼ (⟨cos²x sin²y⟩ = ¼ each)', d0.E.toFixed(9));
  const dt = 0.02; for (let s = 0; s < 150; s++) sim.step(dt);
  const { w } = sim.fields(); let err = 0; const decay = Math.exp(-2 * nu * sim.t);
  for (let m = 0; m < n * n; m++) err = Math.max(err, Math.abs(w[m] - w0[m] * decay));
  ok(err < 1e-10, 'after t = ' + sim.t.toFixed(2) + ' the vorticity is 2e^{−2νt}cos x cos y', 'max err ' + err.toExponential(2));
}
// 4. Energy and enstrophy decrease; the vorticity maximum does not grow ------------
{
  const n = 64, nu = 0.005, sim = create(n, nu), r = rnd(11), w0 = new Float64Array(n * n);
  // random smooth field: a handful of low modes with random phases
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = 2 * Math.PI * i / n, y = 2 * Math.PI * j / n; let s = 0; for (let a = 1; a <= 4; a++) for (let b = -4; b <= 4; b++) s += Math.sin(a * x + b * y + 7.3 * a - 2.1 * b) / (a * a + b * b + 1); w0[j * n + i] = s; }
  sim.setVorticity(w0);
  let d = sim.diagnostics(); const E0 = d.E, Z0 = d.Z, W0 = d.maxW; let Emono = true, Zmono = true, maxWratio = 1;
  const dt = 0.25 * (2 * Math.PI / n) / d.maxU;
  for (let s = 0; s < 200; s++) { const prev = d; sim.step(dt); d = sim.diagnostics(); if (d.E > prev.E + 1e-12) Emono = false; if (d.Z > prev.Z + 1e-10) Zmono = false; maxWratio = Math.max(maxWratio, d.maxW / W0); }
  ok(Emono, 'energy decreases monotonically', `E ${E0.toFixed(5)} → ${d.E.toFixed(5)} over ${sim.steps} steps`);
  ok(Zmono, 'enstrophy decreases monotonically (2D: dZ/dt = −2νP ≤ 0)', `Z ${Z0.toFixed(5)} → ${d.Z.toFixed(5)}`);
  ok(maxWratio < 1.03, 'max|ω| never exceeds its initial value by more than 3% (the 2D maximum principle, up to dealiasing)', 'peak ratio ' + maxWratio.toFixed(4));
  // the nonlinear term conserves energy and enstrophy exactly when ν = 0: check over a few steps
  const inv = create(n, 0); inv.setVorticity(w0); const e0 = inv.diagnostics();
  for (let s = 0; s < 40; s++) inv.step(dt); const e1 = inv.diagnostics();
  ok(Math.abs(e1.E - e0.E) / e0.E < 1e-6 && Math.abs(e1.Z - e0.Z) / e0.Z < 1e-5, 'inviscid run conserves energy and enstrophy', `ΔE/E ${((e1.E - e0.E) / e0.E).toExponential(2)}, ΔZ/Z ${((e1.Z - e0.Z) / e0.Z).toExponential(2)}`);
}
// 5. Kolmogorov shear + a tilted wave: perturbation energy grows first (Orr) ----------
{
  const n = 64, nu = 0.002, sim = create(n, nu), w0 = new Float64Array(n * n);
  const kx0 = 1, ky0 = 2, eps = 0.02;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = 2 * Math.PI * i / n, y = 2 * Math.PI * j / n; w0[j * n + i] = -Math.cos(y) + eps * (kx0 * kx0 + ky0 * ky0) * Math.cos(kx0 * x + ky0 * y); }
  sim.setVorticity(w0);
  let d = sim.diagnostics(); const Ep0 = d.Ep; let peak = Ep0, tPeak = 0;
  const dt = 0.02; for (let s = 0; s < 900; s++) { sim.step(dt); d = sim.diagnostics(); if (d.Ep > peak) { peak = d.Ep; tPeak = d.t; } }
  ok(peak > 1.5 * Ep0 && tPeak > 0.5 && tPeak < d.t - 2 && d.Ep < 0.9 * peak, 'the tilted wave on the shear gains energy transiently, then loses it (Orr)', `peak ${(peak / Ep0).toFixed(2)}× at t = ${tPeak.toFixed(2)}, then ${(d.Ep / Ep0).toFixed(2)}× at t = ${d.t.toFixed(2)}`);
  let uvMax = 0; for (let j = 0; j < n; j++) uvMax = Math.max(uvMax, Math.abs(d.uv[j]));
  ok(uvMax > 0, 'and carries a nonzero Reynolds stress ⟨u′v′⟩(y)', 'max |⟨u′v′⟩| ' + uvMax.toExponential(2));
}

console.log(`\n${failed === 0 ? '✓' : '✗'} ns2d selftest: ${checks - failed}/${checks} checks passed`);
process.exit(failed ? 1 : 0);
