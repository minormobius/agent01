/* WAVELAB's selftest: the FFT, the dispersion relation each wave turns at, the exactness of the clock, and the four
   claims the page makes about kata's water against ours: a pebble's ring is a sphere, it fades as 1/r not 1/√r,
   shallow water leaves no tail behind its front (Huygens, odd dimensions), swell from out of the slice looks too fast
   for its length, and the orbitals stand still.
     node kata/wavelab/test/wavelab.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { makeFFT, makeGridFFT } = await import(path.join(here, "../js/fft.js"));
const { Pond, omega, G, cork, corkStep } = await import(path.join(here, "../js/waves.js"));
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
/* corks: the water's velocity is Airy's; pushed by −g∇η a cork rides Airy's orbit (in deep water a circle of the wave's
   height, along the wave's direction, so partly into w); in a rough sea they stay near home */
{
  const P = new Pond(3, 64, 0.75); P.decay = 0; const n = [3, 0, 4], k = n.map((x) => (2 * Math.PI * x) / P.L), kk = Math.hypot(...k), w = omega(kk), a = 0.1, kh = k.map((x) => x / kk);
  P.swell(n, a); P.t = 0.37; P.field(); const x0 = [10, 20, 30], th = k.reduce((s, x, i) => s + x * x0[i], 0) - w * P.t, u = P.velocity(x0);
  ok(Math.hypot(...u.map((v, i) => v - kh[i] * a * w * Math.cos(th))) < 1e-9, "the water's velocity at the surface is Airy's: (g k / ω) η along the wave's direction");
  const c = cork(x0); c.v = u; const T = (2 * Math.PI) / w, dt = 1 / 120, rows = [];
  for (let t = 0.37; t < 0.37 + 2 * T; t += dt) { P.t = t; P.field(); corkStep(c, P, dt, 0, Infinity); const e1 = [0, 1, 0], e2 = [kh[2], 0, -kh[0]]; rows.push([t + dt, c.xi.reduce((s, x, i) => s + x * kh[i], 0), c.xi.reduce((s, x, i) => s + x * e1[i], 0), c.xi.reduce((s, x, i) => s + x * e2[i], 0)]); }
  // fit the motion along the wave: A sin ωt + B cos ωt + C + D t (C, D: where it started, and the slow drift a 2.5% slope error leaves)
  const fitCol = (col) => { const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], y = [0, 0, 0, 0];
    for (const r of rows) { const t = r[0], v = r[col], f = [Math.sin(w * t), Math.cos(w * t), 1, t]; for (let i = 0; i < 4; i++) { y[i] += f[i] * v; for (let j = 0; j < 4; j++) M[i][j] += f[i] * f[j]; } }
    for (let i = 0; i < 4; i++) { let p = i; for (let r = i + 1; r < 4; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [y[i], y[p]] = [y[p], y[i]]; for (let r = 0; r < 4; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let j = 0; j < 4; j++) M[r][j] -= f * M[i][j]; y[r] -= f * y[i]; } }
    return y.map((v, i) => v / M[i][i]); };
  const fit = fitCol(1), amp = Math.hypot(fit[0], fit[1]), across = Math.max(...[2, 3].map((cI) => { const f = fitCol(cI); return Math.hypot(f[0], f[1]); }));
  ok(Math.abs(amp / a - 1) < 0.05 && across < 0.05 * a, `a cork in deep-water swell rides a circle the wave's height: ${amp.toFixed(4)} m for ${a} m, along the wave (its swing across ${(across / a * 100).toFixed(1)}% of that), so ${(100 * Math.abs(kh[2])).toFixed(0)}% of it into w`);
  const Sp = new Pond(3, 64, 0.75); Sp.decay = 0; Sp.sea(60, 0.035, 7); Sp.t = 3; Sp.field(); const cs = [0, 1, 2].map((j) => { const x = [6 + 12 * j, 24, 24], q = cork(x); q.v = Sp.velocity(x); return q; });
  let far = 0; for (let t = 3; t < 13; t += 0.05) { Sp.t = t; Sp.field(); for (const q of cs) { corkStep(q, Sp, 0.05); far = Math.max(far, Math.hypot(...q.xi)); } }
  ok(far < 1, `in a rough sea, corks started with the water's velocity stay near home (the furthest ${far.toFixed(2)} m in 10 s): orbits, not drift`);
}
/* tanks, by the method of images: walls hold the surface level against them (no flow through), open edges hold it at
   sea level; the seiche is the lowest walled mode, a slosh along any direction, one frequency, standing */
{
  for (const [sg, name] of [[1, "walls"], [-1, "open edges"]]) {
    const P = new Pond(3, 64, 0.75); P.decay = 0; P.setSym([sg, sg, sg]); P.drop([30, 33, 41], 0.3, 1.2); P.t = 4.3; P.field();
    let mx = 0; for (const e of P.eta) mx = Math.max(mx, Math.abs(e)); let jump = 0, val = 0;
    for (let j = 0; j < 40; j++) { const u = 24 + 24 * ((j * 0.618) % 1), v = 24 + 24 * ((j * 0.414) % 1); for (const W of [24, 48]) for (let ax = 0; ax < 3; ax++) {
      const at = (x) => { const q = [u, v, u]; q.splice(ax, 1, x); return P.at(q.slice(0, 3)); }; jump = Math.max(jump, Math.abs(at(W + 0.3) - at(W - 0.3))); val = Math.max(val, Math.abs(at(W))); } }
    ok(sg > 0 ? jump < 1e-6 * mx && val > 0.05 * mx : val < 1e-6 * mx && jump > 0.05 * mx, sg > 0 ? `walls: a pebble's waves meet every wall level, ∂η/∂n = 0 (the most it differs across one: ${jump.toExponential(1)} m), and reflect` : `open edges: the surface stays at sea level along every edge (at most ${val.toExponential(1)} m), and waves reflect upside down`);
  }
  const P = new Pond(3, 64, 0.75); P.decay = 0; P.setSym([1, 1, 1]); const d = [0.3, 0.5, 0.8]; P.seiche(d, 0.15);
  const a = Float32Array.from(P.field()), g0 = [36, 36, 36], h = 0.5, grad = [0, 1, 2].map((j) => { const p1 = g0.slice(), p2 = g0.slice(); p1[j] += h; p2[j] -= h; return (P.at(p1) - P.at(p2)) / (2 * h); });
  const cos = Math.abs(grad.reduce((s2, v, i) => s2 + v * d[i], 0)) / Math.hypot(...grad) / Math.hypot(...d), w0 = omega(Math.PI / 24);
  P.t = Math.PI / w0; const b = P.field(); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  ok(cos > 0.9999 && ab / Math.sqrt(aa * bb) < -0.9999, `a seiche along any direction (here (0.3, 0.5, 0.8)) is one mode: the water tilts along it (cos ${cos.toFixed(5)}) and half a period (${(Math.PI / w0).toFixed(2)} s) on it's tilted the other way (correlation ${(ab / Math.sqrt(aa * bb)).toFixed(5)})`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
