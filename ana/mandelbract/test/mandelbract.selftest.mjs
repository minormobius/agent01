// MANDELBRACT's claims, held: run `node ana/mandelbract/test/mandelbract.selftest.mjs`.
import { iterCZ, iterM, iterBicomplex, idempotent, bcMul, iterQuaternion, iterBulb, toHyper, fromHyper, iterate,
  SETS, march, MISIUREWICZ, tangent, patternK, twistFrame, hold } from '../js/fractal.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('✗ ' + msg); } };
let rng = 2024;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
const IT = 200;

// --- cz: the plane z₀ = 0 is the Mandelbrot set, and the plane c = const is that c's filled Julia set.
{
  const inM = [[0, 0], [-1, 0], [0, 1], [-2, 0], [0.25, 0], [-0.5, 0.3], [-0.1226, 0.7449], [-1.3, 0.05]];
  const outM = [[0.26, 0], [1, 0], [-2.01, 0], [0.5, 0.5], [-0.75, 0.2], [0, 1.05]];
  ok(inM.every(([x, y]) => !iterCZ([x, y, 0, 0], 2000).escaped), 'cz: known points of the Mandelbrot set stay bounded on z₀ = 0');
  ok(outM.every(([x, y]) => iterCZ([x, y, 0, 0], 2000).escaped), 'cz: known points outside it escape on z₀ = 0');
  // c = 0: the Julia set is the unit circle, so the filled set is the unit disk
  let disk = true;
  for (let k = 0; k < 200; k++) {
    const a = rand() * 2 * Math.PI, r = rand() < 0.5 ? 0.98 * rand() : 1.02 + rand();
    if (iterCZ([0, 0, r * Math.cos(a), r * Math.sin(a)], 600).escaped !== (r > 1)) disk = false;
  }
  ok(disk, 'cz: the plane c = 0 is the unit disk (the Julia set of z²)');
  // c = −2: the filled Julia set is the segment [−2, 2] on the real axis
  ok(!iterCZ([-2, 0, 1.3, 0], 500).escaped && iterCZ([-2, 0, 0, 0.05], 500).escaped, 'cz: the plane c = −2 is the segment [−2, 2]');
  // c = i (in M, a dendrite): z₀ = 0 is in its Julia set exactly when c is in M
  ok(!iterCZ([0, 1, 0, 0], 2000).escaped, 'cz: z₀ = 0 is bounded for c = i, in M');
}

// --- every set: the distance estimate is 0 inside, positive outside, and, measured, safe: points half an estimate
//     away from an outside point are still outside. (An estimate, not a bound: this is the margin the page marches
//     with.)
for (const set of SETS) {
  const box = set === 'bulb' ? 1.3 : 2.2;
  let tried = 0, safe = 0, zeroInside = true;
  for (let k = 0; k < 3000 && tried < 300; k++) {
    const p = [0, 1, 2, 3].map(() => (rand() * 2 - 1) * box + (set === 'bulb' ? 0 : -0.5 * (rand() < 0.5)));
    const it = iterate(set, p, IT);
    if (!it.escaped) { if (it.de !== 0) zeroInside = false; continue; }
    if (it.de < 1e-3 || it.de > 0.5) continue;
    tried++;
    let good = true;
    for (let j = 0; j < 6; j++) {
      let d = [0, 1, 2, 3].map(() => rand() - 0.5), m = Math.hypot(...d);
      const q = p.map((v, i) => v + 0.5 * it.de * d[i] / m);
      if (!iterate(set, q, IT).escaped) good = false;
    }
    if (good) safe++;
  }
  ok(zeroInside, `${set}: the estimate is 0 wherever the orbit stays bounded`);
  ok(tried > 50 && safe / tried >= 0.98, `${set}: half an estimate from an outside point is outside (${safe}/${tried}, measured)`);
}

// --- bicomplex: the idempotent decomposition is an algebra homomorphism, so iterating z² + c bicomplexly is iterating
//     the two complex factors separately, and the set is M × M.
{
  let worst = 0, product = true;
  for (let k = 0; k < 300; k++) {
    const c = [0, 1, 2, 3].map(() => (rand() * 2 - 1) * 1.4 - (rand() < 0.5 ? 0.4 : 0));
    let Z = [0, 0, 0, 0], w1 = [0, 0], w2 = [0, 0];
    const [c1, c2] = idempotent(c);
    for (let n = 0; n < 6; n++) {
      Z = bcMul(Z, Z).map((v, i) => v + c[i]);
      w1 = [w1[0] ** 2 - w1[1] ** 2 + c1[0], 2 * w1[0] * w1[1] + c1[1]];
      w2 = [w2[0] ** 2 - w2[1] ** 2 + c2[0], 2 * w2[0] * w2[1] + c2[1]];
      const [d1, d2] = idempotent(Z), scale = 1 + Math.hypot(...w1, ...w2);
      worst = Math.max(worst, Math.hypot(d1[0] - w1[0], d1[1] - w1[1], d2[0] - w2[0], d2[1] - w2[1]) / scale);
    }
    const inBoth = !iterM(c1[0], c1[1], IT).escaped && !iterM(c2[0], c2[1], IT).escaped;
    if (inBoth === iterBicomplex(c, IT).escaped) product = false;
  }
  ok(worst < 1e-9, `bicomplex: the orbit's idempotent parts are the two complex orbits (rel. err ${worst.toExponential(1)})`);
  ok(product, 'bicomplex: in the set exactly when both factors are in M');
  // the real axis (u = v = 0, y = 0): w₁ = w₂ = x, so it's M's real segment [−2, ¼]
  ok(!iterBicomplex([-1.9, 0, 0, 0], 2000).escaped && iterBicomplex([0.3, 0, 0, 0], 2000).escaped, 'bicomplex: its real axis is M\'s, [−2, ¼]');
}

// --- quaternion: the set is the Mandelbrot set spun round its real axis. Turning the imaginary part about any axis
//     leaves the orbit's length history, and so the escape count, unchanged.
{
  let same = true, onM = true;
  for (let k = 0; k < 400; k++) {
    const x = rand() * 2.6 - 2, y = rand() * 1.3;
    let u = [rand() - 0.5, rand() - 0.5, rand() - 0.5], m = Math.hypot(...u);
    u = u.map((v) => (v / m) * y);
    const a = iterQuaternion([x, y, 0, 0], IT), b = iterQuaternion([x, ...u], IT);
    if (a.n !== b.n) same = false;
    if (a.escaped !== iterM(x, y, IT).escaped) onM = false;
  }
  ok(same, 'quaternion: escape count depends only on the real part and the imaginary part\'s length');
  ok(onM, 'quaternion: the plane through 1 and i is the Mandelbrot set itself');
}

// --- hyperbulb: the hyperspherical coordinates invert, the subspace w = 0 is invariant (so its slice there is a
//     3D bulb of the same formula), and it's symmetric under w → −w.
{
  let inv = 0;
  for (let k = 0; k < 200; k++) {
    const p = [0, 1, 2, 3].map(() => rand() * 2 - 1);
    const h = toHyper(p), q = fromHyper(...h);
    inv = Math.max(inv, Math.hypot(...q.map((v, i) => v - p[i])));
  }
  ok(inv < 1e-12, `bulb: hyperspherical coordinates invert (err ${inv.toExponential(1)})`);
  let flat = true, mirror = true;
  for (let k = 0; k < 200; k++) {
    const p = [rand() * 2.4 - 1.2, rand() * 2.4 - 1.2, rand() * 2.4 - 1.2, 0];
    let z = p.slice();
    for (let n = 0; n < 4; n++) {
      const [r, a, b, g] = toHyper(z);
      if (r > 2) break;
      z = fromHyper(r ** 8, 8 * a, 8 * b, 8 * g).map((v, j) => v + p[j]);
      if (Math.abs(z[3]) > 1e-9 * (1 + Math.hypot(...z))) flat = false;
    }
    const w = rand() * 1.2 - 0.6, q = [p[0], p[1], p[2], w], qm = [p[0], p[1], p[2], -w];
    if (iterBulb(q, 30).n !== iterBulb(qm, 30).n) mirror = false;
  }
  ok(flat, 'bulb: an orbit that starts with w = 0 keeps w = 0');
  ok(mirror, 'bulb: symmetric under w → −w');
  ok(!iterBulb([0, 0, 0, 0], 50).escaped && iterBulb([1.3, 0, 0, 0], 50).escaped, 'bulb: the origin is in it, 1.3 along x is not');
}

// --- the march: a ray fired at the set stops on its edge: where it stops is in the set or within eps of escaping, and a
//     little way back along the ray is outside.
for (const set of SETS) {
  let good = 0, hits = 0;
  for (let k = 0; k < 60; k++) {
    let d = [0, 1, 2, 3].map(() => rand() - 0.5), m = Math.hypot(...d);
    d = d.map((v) => v / m);
    const target = set === 'bulb' ? [0, 0, 0, 0] : [-0.3, 0, 0, 0];
    const ro = target.map((v, j) => v - 4 * d[j]);
    const h = march(set, ro, d, { maxIter: 40, eps: 1e-4, tMax: 8 });
    if (!h) continue;
    hits++;
    const back = ro.map((v, j) => v + (h.t - 0.01) * d[j]);
    const it = iterate(set, h.p, 40);
    if ((!it.escaped || it.de < 2e-4) && iterate(set, back, 40).escaped) good++;
  }
  ok(hits > 40 && good === hits, `${set}: marched rays stop on the edge (${good}/${hits})`);
}

// --- the plane z₀ = c is the Mandelbrot set again: starting at c is starting at 0, one step later.
{
  let shifted = true;
  for (let k = 0; k < 400; k++) {
    const c = [rand() * 2.6 - 2, rand() * 2.4 - 1.2];
    const m = iterCZ([c[0], c[1], 0, 0], IT), d = iterCZ([c[0], c[1], c[0], c[1]], IT);
    if (m.escaped !== d.escaped || (m.escaped && d.n !== m.n - 1)) shifted = false;
  }
  ok(shifted, 'cz: the plane z₀ = c is the Mandelbrot set, one iteration ahead');
}

// --- Tan Lei, as a 4D fact. Each listed point is Misiurewicz; and zoomed in on it, the plane at any angle θ between
//     "c moves" and "z₀ moves", with K(θ) undone, shows the same picture as the plane z₀ = c (the Mandelbrot set),
//     closer and closer as the window shrinks. Without the hold, the Julia plane does not match.
{
  const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  for (const m of MISIUREWICZ) {
    let z = [0, 0];
    const orbit = [z];
    for (let i = 0; i < m.k + m.p + 30; i++) { z = cm(z, z); z = [z[0] + m.c[0], z[1] + m.c[1]]; orbit.push(z); }
    const lands = Math.hypot(orbit[m.k + m.p][0] - orbit[m.k][0], orbit[m.k + m.p][1] - orbit[m.k][1]) < 1e-9;
    const notSooner = Math.hypot(orbit[m.k - 1 + m.p][0] - orbit[m.k - 1][0], orbit[m.k - 1 + m.p][1] - orbit[m.k - 1][1]) > 1e-6;
    ok(lands && notSooner, `${m.name}: Misiurewicz, preperiod ${m.k}, period ${m.p}`);
  }
  // the pattern near P, as a mask of pixels within a pixel of the set, the distance read in pattern units
  function mask(c0, th, U, N, K, G) {
    const out = new Uint8Array(N * N), k = [Math.cos(th), Math.sin(th)];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const t = cdiv([(i / (N - 1) * 2 - 1) * U, (j / (N - 1) * 2 - 1) * U], K);
      const r = iterCZ([c0[0] + k[0] * t[0], c0[1] + k[0] * t[1], c0[0] + k[1] * t[0], c0[1] + k[1] * t[1]], 300);
      out[j * N + i] = !r.escaped || r.de * G < (2 * U) / (N - 1) ? 1 : 0;
    }
    return out;
  }
  const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 1; };
  for (const m of MISIUREWICZ) {
    const { A, B } = tangent(m.c, m.c), G = Math.hypot(...A, ...B), N = 48, ref45 = Math.PI / 4;
    const at = (U, deg, held = true) => mask(m.c, (deg * Math.PI) / 180, U, N, patternK(A, B, held ? (deg * Math.PI) / 180 : ref45), G);
    const tiny = 1e-4, ref = at(tiny, 45);
    const held = [0, 60, 90].map((d) => iou(ref, at(tiny, d)));
    const unheld = iou(ref, at(tiny, 90, false));
    const coarse = iou(at(1e-2, 45), at(1e-2, 90));
    ok(held.every((v) => v >= 0.95) && unheld < 0.6,
      `${m.name}: held, the planes at 0°, 60°, 90° match z₀ = c (IoU ${held.map((v) => v.toFixed(2)).join(', ')}); unheld, the Julia plane doesn't (${unheld.toFixed(2)})`);
    ok(held[2] > coarse, `${m.name}: the match tightens as you zoom in (Julia plane: ${coarse.toFixed(2)} at 10⁻², ${held[2].toFixed(2)} at 10⁻⁴)`);
  }
  // c = i: the ratio A/B settles at −0.2 − 0.4i
  { const { A, B } = tangent([0, 1], [0, 1]), r = cdiv(A, B);
    ok(Math.abs(r[0] + 0.2) < 1e-6 && Math.abs(r[1] + 0.4) < 1e-6, `c = i: A/B = ${r.map((v) => v.toFixed(6)).join(' ')}i, settled`); }
  // the frames are rotations, and the hold undoes K: K(θ)·e^{iφ}/zoom is the same at every θ
  { let orth = 0, same = 0;
    const { A, B } = tangent(MISIUREWICZ[2].c, MISIUREWICZ[2].c), K0 = patternK(A, B, Math.PI / 4);
    for (const deg of [0, 20, 45, 70, 90]) {
      const th = (deg * Math.PI) / 180, phi = 0.3 + hold(A, B, th).phi, Rm = twistFrame(th, phi);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let d = 0; for (let k = 0; k < 4; k++) d += Rm[i * 4 + k] * Rm[j * 4 + k];
        orth = Math.max(orth, Math.abs(d - (i === j ? 1 : 0)));
      }
      const h = hold(A, B, th), v = cm(patternK(A, B, th), [Math.cos(h.phi) / h.zoom, Math.sin(h.phi) / h.zoom]);
      same = Math.max(same, Math.hypot(v[0] - K0[0], v[1] - K0[1]));
    }
    ok(orth < 1e-6 && same < 1e-12, `twistFrame is a rotation (${orth.toExponential(1)}); hold undoes K(θ) (${same.toExponential(1)})`); }
}

console.log(`${fails ? '✗' : '✓'} mandelbract: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
