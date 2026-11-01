/* WAVELAB's selftest: the FFT, the dispersion relation each wave turns at, the exactness of the clock, and the four
   claims the page makes about kata's water against ours: a pebble's ring is a sphere, it fades as 1/r not 1/√r,
   shallow water leaves no tail behind its front (Huygens, odd dimensions), swell from out of the slice looks too fast
   for its length, and the orbitals stand still.
     node kata/wavelab/test/wavelab.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { makeFFT, makeGridFFT } = await import(path.join(here, "../js/fft.js"));
const { Pond, omega, G } = await import(path.join(here, "../js/waves.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };

/* the FFT: against the sum it stands for, and back again */
{
  const n = 16, f = makeFFT(n), re = Array.from({ length: n }, (_, i) => Math.sin(3 * i) + 0.3 * i), im = Array.from({ length: n }, (_, i) => Math.cos(5 * i));
  const R = Float64Array.from(re), I = Float64Array.from(im); f(R, I);
  let err = 0; for (let k = 0; k < n; k++) { let sr = 0, si = 0; for (let x = 0; x < n; x++) { const a = (-2 * Math.PI * k * x) / n; sr += re[x] * Math.cos(a) - im[x] * Math.sin(a); si += re[x] * Math.sin(a) + im[x] * Math.cos(a); } err = Math.max(err, Math.abs(sr - R[k]), Math.abs(si - I[k])); }
  const g = makeGridFFT(8, 3), A = Float64Array.from({ length: 512 }, (_, i) => Math.sin(i * 1.7)), B = new Float64Array(512), A0 = A.slice(); g(A, B); g(A, B, true);
  let back = 0; for (let i = 0; i < 512; i++) back = Math.max(back, Math.abs(A[i] / 512 - A0[i]), Math.abs(B[i] / 512));
  ok(err < 1e-9 && back < 1e-12, `the FFT is the discrete Fourier sum (worst ${err.toExponential(1)}), and the 3D one inverts (${back.toExponential(1)})`);
}

/* each plane wave turns at ω² = g k tanh(k h), deep or shallow; the clock steps exactly */
{
  let worst = 0;
  for (const h of [Infinity, 2, 0.25]) {
    const P = new Pond(3, 16, 0.75, h); P.decay = 0; const n = [2, 1, 3], L = P.L, k = n.map((x) => (2 * Math.PI * x) / L), kk = Math.hypot(...k), w = omega(kk, h);
    P.swell(n, 0.1); P.t = 3.7; P.field();
    for (const x of [[1.5, 2.25, 0.75], [6, 3, 9]]) worst = Math.max(worst, Math.abs(P.at(x) - 0.1 * Math.cos(k[0] * x[0] + k[1] * x[1] + k[2] * x[2] - w * P.t)));
  }
  ok(worst < 1e-6, `a plane wave on the 3D surface is a cos(k·x − ωt) with ω² = g k tanh(k h), deep and shallow (worst ${worst.toExponential(1)} m)`);
  ok(Math.abs(omega(1, 1e6) - Math.sqrt(G)) < 1e-9 && Math.abs(omega(0.01, 0.25) / 0.01 - Math.sqrt(G * 0.25)) < 1e-3, "deep water: ω² = g k; long waves in shallow water: speed √(g h)");
  const a = new Pond(3, 32, 0.75); a.decay = 0; a.drop([12, 12, 12]); a.t = 0; a.field(); for (let i = 0; i < 30; i++) { a.advance(1 / 60); a.field(); }
  const b = new Pond(3, 32, 0.75); b.decay = 0; b.drop([12, 12, 12]); b.t = 0.5; b.field();
  let d = 0; for (let i = 0; i < a.M; i++) d = Math.max(d, Math.abs(a.eta[i] - b.eta[i]));
  ok(d < 1e-6, `stepping the clock frame by frame lands where jumping straight there does (${d.toExponential(1)}): no time-step error`);
}

/* a pebble: a sphere on kata's water; fading as 1/r against ours' 1/√r; in shallow water, nothing behind its front */
{
  const c3 = [24, 24, 24], P = new Pond(3, 64, 0.75); P.decay = 0; P.drop(c3); P.t = 5; P.field();
  let iso = 0; for (const r of [3, 6.75, 9]) { const v = [P.at([24 + r, 24, 24]), P.at([24, 24 + r, 24]), P.at([24, 24, 24 + r])]; iso = Math.max(iso, Math.max(...v) - Math.min(...v)); }
  ok(iso < 1e-7, `a pebble's waves are the same along x, z and w: a sphere (spread ${iso.toExponential(1)} m)`);
  const shallow = (D) => {
    const N = D === 3 ? 64 : 256, p = new Pond(D, N, 0.75, 0.25); p.decay = 0; const c = Array(D).fill((N * 0.75) / 2); p.drop(c, 0.3, 1.2);
    const at = (T) => { p.t = T; p.field(); const prof = []; for (let r = 0; r <= 22; r += 0.25) prof.push(p.at(c.map((v, d) => v + (d === 0 ? r : 0)))); return prof; };
    return { a: at(4), b: at(8) };
  };
  const s3 = shallow(3), s2 = shallow(2), cg = Math.sqrt(G * 0.25), peak = (pr) => Math.max(...pr.map(Math.abs));
  const behind = (pr, T) => Math.max(...pr.filter((_, i) => i * 0.25 < cg * T - 4).map(Math.abs)) / peak(pr);
  ok(behind(s3.b, 8) < 0.03 && behind(s2.b, 8) > 0.1, `shallow water: behind its front kata's pulse leaves ${(100 * behind(s3.b, 8)).toFixed(1)}% of its height, ours ${(100 * behind(s2.b, 8)).toFixed(0)}%: Huygens' principle holds on a 3D surface, not a 2D one`);
  const ex = (pr) => Math.log(peak(pr.b) / peak(pr.a)) / Math.log(2); // the front doubles its radius from t = 4 to t = 8
  ok(Math.abs(ex(s3) + 1) < 0.15 && Math.abs(ex(s2) + 0.5) < 0.15, `as its front's radius doubles, kata's pulse falls as r^${ex(s3).toFixed(2)} (a sphere: 1/r), ours as r^${ex(s2).toFixed(2)} (a circle: 1/√r)`);
}

/* swell from out of the slice: its crests, watched in the slice, move at ω / k_slice, faster than a wave that long */
{
  const P = new Pond(3, 64, 0.75); P.decay = 0; const n = [3, 0, 4], k = n.map((x) => (2 * Math.PI * x) / P.L), kk = Math.hypot(...k), w = omega(kk);
  // where its crests are along the slice (x, at z = w = 24 m): the phase of the field's own x-wave there, from the samples
  P.swell(n, 0.1); const phase = (t) => { P.t = t; P.field(); let c = 0, q = 0; for (let i = 0; i < 64; i++) { const v = P.eta[i + 64 * (32 + 64 * 32)]; c += v * Math.cos(k[0] * i * P.dx); q += v * Math.sin(k[0] * i * P.dx); } return Math.atan2(q, c); };
  let dph = phase(0.1) - phase(0); dph = ((dph + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const seen = dph / k[0] / 0.1, free = omega(k[0]) / k[0];
  ok(Math.abs(seen - w / k[0]) < 0.05 && seen > free * 1.2, `swell travelling 53° out of the slice: its crests sweep along the slice at ${seen.toFixed(2)} m/s (ω/k_slice ${(w / k[0]).toFixed(2)}), faster than a ${(2 * Math.PI / k[0]).toFixed(0)} m wave travels (${free.toFixed(2)} m/s)`);
}

/* the orbitals: one frequency, standing: half a period on, the same shape upside down; the s orbital round */
{
  for (const l of [0, 1, 2]) {
    const P = new Pond(3, 64, 0.75); P.decay = 0; P.orbital(l, 0.8, l === 1 ? [1, 0, 1] : [0, 0, 1], [24, 24, 24], 0.25);
    const a = Float32Array.from(P.field()); P.t = Math.PI / omega(0.8); const b = P.field();
    let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
    let mx = 0; for (const v of a) mx = Math.max(mx, Math.abs(v)); const corr = ab / Math.sqrt(aa * bb);
    let extra = "";
    if (l === 0) { P.t = 0; P.field(); const v = [P.at([30, 24, 24]), P.at([24, 30, 24]), P.at([24, 24, 30])]; extra = `, round (${(Math.max(...v) - Math.min(...v)).toExponential(1)})`; if (Math.max(...v) - Math.min(...v) > 1e-6) fails++, checks++; }
    if (l === 1) { P.t = 0; P.field(); const u = P.at([27, 24, 27]), d = P.at([21, 24, 21]); extra = `, its lobes opposite (${u.toFixed(3)} / ${d.toFixed(3)})`; if (!(u * d < 0 && Math.abs(u + d) < 1e-6)) fails++, checks++; }
    ok(corr < -0.97 && Math.abs(mx - 0.25) < 1e-3, `the ${"spd"[l]} orbital stands: half a period on it's itself upside down (correlation ${corr.toFixed(3)}), its crest ${mx.toFixed(3)} m${extra}`);
  }
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
