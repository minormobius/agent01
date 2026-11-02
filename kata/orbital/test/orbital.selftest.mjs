/* ORBITAL's selftest: the atom against its own equation and ATOM⁴'s spectrum, the directions against Laplace's equation
   and each other, the radii, the dartboard against the exact distribution, and the page's claims about slices.
     node kata/orbital/test/orbital.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const H = await import(path.join(here, "../js/hydrogen.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
let seed = 12345; const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/* every state solves its radial equation at its energy, and the energies are ATOM⁴'s (4D) and Bohr's (3D) */
{
  let worst = 0, eWorst = 0, n0 = 0;
  for (const d of [3, 4]) for (let n = 1; n <= 4; n++) for (let l = 0; l <= Math.min(2, n - 1); l++) {
    const st = H.state(d, n, l), h = 1e-3; n0++;
    eWorst = Math.max(eWorst, Math.abs(st.E - (d === 4 ? -1 / (2 * (n + 0.5) ** 2) : -1 / (2 * n * n))));
    let scale = 0; for (let r = 0.3; r < st.r99; r += 0.37) scale = Math.max(scale, Math.abs(H.R(st, r)));
    for (let r = 0.3; r < st.r99; r += 0.37) {
      const f = (x) => H.R(st, x), R0 = f(r), d1 = (f(r + h) - f(r - h)) / (2 * h), d2 = (f(r + h) - 2 * R0 + f(r - h)) / (h * h);
      worst = Math.max(worst, Math.abs(d2 + ((d - 1) / r) * d1 + (2 * (st.E + 1 / r) - (l * (l + d - 2)) / (r * r)) * R0) / scale);
    }
  }
  ok(worst < 1e-4 && eWorst < 1e-12, `all ${n0} states (n ≤ 4, l ≤ 2, in 3D and 4D) solve R″ + (d−1)/r R′ + [2(E + 1/r) − l(l+d−2)/r²] R = 0 (worst ${worst.toExponential(1)}), at E = −1/2(n + ½)² in 4D (ATOM⁴'s) and −1/2n² in 3D`);
  ok(Math.abs(H.state(4, 1, 0).E * 27.211386 + 6.047) < 0.01, `4D hydrogen's ground state is bound by ${(-H.state(4, 1, 0).E * 27.211386).toFixed(2)} eV (ATOM⁴: 6.05), ours by ${(-H.state(3, 1, 0).E * 27.211386).toFixed(2)}`);
  let orth = 0; for (const d of [3, 4]) for (const l of [0, 1]) { const a = H.state(d, l + 1, l), b = H.state(d, l + 3, l); let s = 0; const hh = 0.005; for (let r = hh / 2; r < 120; r += hh) s += H.R(a, r) * H.R(b, r) * r ** (d - 1) * hh; orth = Math.max(orth, Math.abs(s)); }
  ok(orth < 1e-4, `states of one l and different n are orthogonal (worst overlap ${orth.toExponential(1)})`);
}

/* the directions: (l + 1)² in 4D and 2l + 1 in 3D, each harmonic (Laplacian zero), orthonormal on the sphere */
{
  for (const d of [3, 4]) {
    const counts = [0, 1, 2].map((l) => H.harmonics(d, l).length), want = [0, 1, 2].map((l) => (d === 4 ? (l + 1) ** 2 : 2 * l + 1));
    const traces = H.harmonics(d, 2).map((h) => h.Q.reduce((s, r, i) => s + r[i], 0));
    // orthonormality by Monte Carlo over the sphere (mean of Y_a Y_b × area): 400k directions
    const all = [0, 1, 2].flatMap((l) => H.harmonics(d, l)), G = all.map(() => all.map(() => 0)), M = 400000;
    for (let k = 0; k < M; k++) { const v = Array.from({ length: d }, () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())), m = Math.hypot(...v), x = v.map((c) => c / m), y = all.map((h) => H.P(h, x)); for (let a = 0; a < y.length; a++) for (let b = a; b < y.length; b++) G[a][b] += (y[a] * y[b] * H.AREA[d]) / M; }
    let off = 0, diag = 0; for (let a = 0; a < all.length; a++) for (let b = a; b < all.length; b++) { if (a === b) diag = Math.max(diag, Math.abs(G[a][a] - 1)); else off = Math.max(off, Math.abs(G[a][b])); }
    ok(counts.join() === want.join() && traces.every((t) => Math.abs(t) < 1e-12) && diag < 0.02 && off < 0.02, `${d}D: ${counts.join(", ")} directions for s, p, d (${d === 4 ? "(l + 1)²" : "2l + 1"}), each harmonic, orthonormal on the sphere (by 400k directions: ${diag.toFixed(3)}, ${off.toFixed(3)})`);
  }
}

/* r: where the electron is. The densest point is the nucleus; the most likely distance and the mean are further out,
   and further in 4D (a shell's size grows as r³, not r²) */
{
  const s4 = H.state(4, 1, 0), s3 = H.state(3, 1, 0);
  ok(Math.abs(s4.rMost - 2.25) < 0.01 && Math.abs(s4.rMean - 3) < 1e-3 && Math.abs(s3.rMost - 1) < 0.01 && Math.abs(s3.rMean - 1.5) < 1e-3, `ground state: most likely ${s4.rMost.toFixed(2)} bohr, on average ${s4.rMean.toFixed(2)} (ours ${s3.rMost.toFixed(2)}, ${s3.rMean.toFixed(2)}); densest at the nucleus in both`);
  const h = H.harmonics(4, 1)[1], st = H.state(4, 2, 1), draw = H.sampler(st, h, rng), N = 60000, bins = new Array(40).fill(0), w = st.r99 / 40; let mean = 0, ang = 0;
  for (let i = 0; i < N; i++) { const x = draw(), r = Math.hypot(...x); mean += r / N; ang += (x[1] * x[1]) / (r * r) / N; const b = Math.floor(r / w); if (b < 40) bins[b]++; }
  let dev = 0; for (let b = 0; b < 40; b++) { let p = 0; for (let k = 0; k < 10; k++) p += H.pr(st, (b + (k + 0.5) / 10) * w) * (w / 10); dev += Math.abs(bins[b] / N - p); }
  ok(dev < 0.03 && Math.abs(mean - st.rMean) < 0.05 && Math.abs(ang - 0.5) < 0.01, `the dartboard: 60k electrons drawn from the 4D 2p_y cloud fall at distances as P(r) says (total misfit ${(100 * dev).toFixed(1)}%), on average ${mean.toFixed(2)} bohr (exact ${st.rMean.toFixed(2)}), along y as y² says (⟨y²/r²⟩ ${ang.toFixed(3)}: ½)`);
}

/* slices: p_w is nothing in a slice through the nucleus; d_zw offset ana looks like p_z, kata the same upside down; the
   two-planes orbital is positive round the xy-plane and negative round the zw-plane */
{
  const st1 = H.state(4, 2, 1), pw = H.harmonics(4, 1)[3], st2 = H.state(4, 3, 2), D = H.harmonics(4, 2), zw = D.find((h) => h.name === "zw"), cl = D.find((h) => h.name === "x²+y²−z²−w²");
  let pwMax = 0; for (let i = 0; i < 500; i++) pwMax = Math.max(pwMax, Math.abs(H.psi(st1, pw, [8 * rng() - 4, 8 * rng() - 4, 8 * rng() - 4, 0])));
  let odd = 0, even = 0, flip = 0, mx = 0;
  for (let i = 0; i < 500; i++) { const x = 10 * rng() - 5, y = 10 * rng() - 5, z = 10 * rng() - 5, a = 2, f = (X, Y, Z, W) => H.psi(st2, zw, [X, Y, Z, W]);
    mx = Math.max(mx, Math.abs(f(x, y, z, a))); odd = Math.max(odd, Math.abs(f(x, y, z, a) + f(x, y, -z, a))); even = Math.max(even, Math.abs(f(x, y, z, a) - f(-x, -y, z, a))); flip = Math.max(flip, Math.abs(f(x, y, z, a) + f(x, y, z, -a))); }
  ok(pwMax === 0 && odd < 1e-12 * mx && even < 1e-12 * mx && flip < 1e-12 * mx, "a slice through the nucleus sees nothing of p_w; offset 2 bohr ana, d_zw is p_z's shape (odd in z, even in x and y), and kata it's the same upside down");
  const onXY = [0, 1, 2, 3].map((k) => H.psi(st2, cl, [3 * Math.cos(k), 3 * Math.sin(k), 0, 0])), onZW = [0, 1, 2, 3].map((k) => H.psi(st2, cl, [0, 0, 3 * Math.cos(k), 3 * Math.sin(k)]));
  ok(onXY.every((v) => v > 0) && onZW.every((v) => v < 0) && Math.abs(onXY[0] + onZW[0]) < 1e-12, "x²+y²−z²−w²: positive all round the xy-plane, negative all round the zw-plane, the two planes meeting only at the nucleus");
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
