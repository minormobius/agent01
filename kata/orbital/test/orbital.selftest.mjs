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
  for (const d of [3, 4]) for (let n = 1; n <= 4; n++) for (let l = 0; l <= n - 1; l++) {
    const st = H.state(d, n, l), h = 1e-3; n0++;
    eWorst = Math.max(eWorst, Math.abs(st.E - (d === 4 ? -1 / (2 * (n + 0.5) ** 2) : -1 / (2 * n * n))));
    let scale = 0; for (let r = 0.3; r < st.r99; r += 0.37) scale = Math.max(scale, Math.abs(H.R(st, r)));
    for (let r = 0.3; r < st.r99; r += 0.37) {
      const f = (x) => H.R(st, x), R0 = f(r), d1 = (f(r + h) - f(r - h)) / (2 * h), d2 = (f(r + h) - 2 * R0 + f(r - h)) / (h * h);
      worst = Math.max(worst, Math.abs(d2 + ((d - 1) / r) * d1 + (2 * (st.E + 1 / r) - (l * (l + d - 2)) / (r * r)) * R0) / scale);
    }
  }
  ok(worst < 1e-4 && eWorst < 1e-12, `all ${n0} states (n ≤ 4, every l, in 3D and 4D) solve R″ + (d−1)/r R′ + [2(E + 1/r) − l(l+d−2)/r²] R = 0 (worst ${worst.toExponential(1)}), at E = −1/2(n + ½)² in 4D (ATOM⁴'s) and −1/2n² in 3D`);
  ok(Math.abs(H.state(4, 1, 0).E * 27.211386 + 6.047) < 0.01, `4D hydrogen's ground state is bound by ${(-H.state(4, 1, 0).E * 27.211386).toFixed(2)} eV (ATOM⁴: 6.05), ours by ${(-H.state(3, 1, 0).E * 27.211386).toFixed(2)}`);
  let orth = 0; for (const d of [3, 4]) for (const l of [0, 1]) { const a = H.state(d, l + 1, l), b = H.state(d, l + 3, l); let s = 0; const hh = 0.005; for (let r = hh / 2; r < 120; r += hh) s += H.R(a, r) * H.R(b, r) * r ** (d - 1) * hh; orth = Math.max(orth, Math.abs(s)); }
  ok(orth < 1e-4, `states of one l and different n are orthogonal (worst overlap ${orth.toExponential(1)})`);
}

/* the directions: (l + 1)² in 4D and 2l + 1 in 3D, each harmonic (Laplacian zero), orthonormal on the sphere */
{
  for (const d of [3, 4]) {
    const counts = [0, 1, 2, 3].map((l) => H.harmonics(d, l).length), want = [0, 1, 2, 3].map((l) => (d === 4 ? (l + 1) ** 2 : 2 * l + 1));
    const traces = H.harmonics(d, 2).map((h) => h.Q.reduce((s, r, i) => s + r[i], 0));
    // f: harmonic by a finite-difference Laplacian of the cubic
    let flap = 0; for (const q of H.harmonics(d, 3)) for (let t = 0; t < 10; t++) { const x = Array.from({ length: d }, () => 2 * rng() - 1), e = 1e-3; let L = 0; for (let k = 0; k < d; k++) { const a = x.slice(), b = x.slice(); a[k] += e; b[k] -= e; L += (H.P(q, a) - 2 * H.P(q, x) + H.P(q, b)) / (e * e); } flap = Math.max(flap, Math.abs(L)); } traces.push(flap * 1e-3);
    // orthonormality by Monte Carlo over the sphere (mean of Y_a Y_b × area): 400k directions
    const all = [0, 1, 2, 3].flatMap((l) => H.harmonics(d, l)), G = all.map(() => all.map(() => 0)), M = 400000;
    for (let k = 0; k < M; k++) { const v = Array.from({ length: d }, () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())), m = Math.hypot(...v), x = v.map((c) => c / m), y = all.map((h) => H.P(h, x)); for (let a = 0; a < y.length; a++) for (let b = a; b < y.length; b++) G[a][b] += (y[a] * y[b] * H.AREA[d]) / M; }
    let off = 0, diag = 0; for (let a = 0; a < all.length; a++) for (let b = a; b < all.length; b++) { if (a === b) diag = Math.max(diag, Math.abs(G[a][a] - 1)); else off = Math.max(off, Math.abs(G[a][b])); }
    ok(counts.join() === want.join() && traces.every((t) => Math.abs(t) < 1e-12) && diag < 0.02 && off < 0.02, `${d}D: ${counts.join(", ")} directions for s, p, d, f (${d === 4 ? "(l + 1)²" : "2l + 1"}), each harmonic, all ${all.length} orthonormal on the sphere (by 400k directions: ${diag.toFixed(3)}, ${off.toFixed(3)})`);
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
/* the whole equation: every orbital, and every hybrid, satisfies −½∇²ψ − ψ/r = Eψ in four dimensions (a finite-
   difference Laplacian at random points), not just its radial part */
{
  let worst = 0, count = 0; const h = 2e-3;
  const lap = (f, x) => { let s2 = 0; for (let k = 0; k < 4; k++) { const a = x.slice(), b = x.slice(); a[k] += h; b[k] -= h; s2 += (f(a) - 2 * f(x) + f(b)) / (h * h); } return s2; };
  const check = (f, E, R) => { let scale = 0, res = 0; for (let i = 0; i < 60; i++) { const x = [0, 1, 2, 3].map(() => (2 * rng() - 1) * R); if (Math.hypot(...x) < 0.4) continue; const v = f(x); scale = Math.max(scale, Math.abs(v)); res = Math.max(res, Math.abs(-0.5 * lap(f, x) - v / Math.hypot(...x) - E * v)); } count++; return res / scale; };
  for (let n = 1; n <= 4; n++) for (let l = 0; l < n; l++) { const st = H.state(4, n, l); for (const hh of H.harmonics(4, l)) worst = Math.max(worst, check((x) => H.psi(st, hh, x), st.E, st.r99 * 0.6)); }
  for (const n of [2, 3]) for (const hy of H.hybrids(4, n)) worst = Math.max(worst, check((x) => H.psiOf(hy.parts, x), hy.parts[0].st.E, hy.parts[0].st.r99 * 0.6));
  ok(worst < 2e-4, `all ${count} orbitals (every s, p, d and f with n ≤ 4, and the sp⁴ hybrids of n = 2 and 3) satisfy the full 4D Schrödinger equation −½∇²ψ − ψ/r = Eψ (worst residual ${worst.toExponential(1)} of the orbital's size)`);
}

/* sp⁴: five hybrids, orthonormal, pointing at the 5-cell's corners, 104.48° apart (ours, sp³: four at 109.47°); sliced
   straight, the four that aren't along w make our tetrahedron */
{
  const hy = H.hybrids(4), D = hy.map((q) => q.dir), cosA = D[0].reduce((s2, v, k) => s2 + v * D[1][k], 0), t3 = H.simplex(3), cos3 = t3[0].reduce((s2, v, k) => s2 + v * t3[1][k], 0);
  // orthonormality by importance sampling: q = (1/5) Σ |h_i|² (each drawn by its own sampler), ⟨h_i|h_j⟩ = E_q[h_i h_j / q]
  const draws = hy.map((q) => H.mixSampler(q.parts, rng)), G = hy.map(() => hy.map(() => 0)), M = 30000;
  for (let m = 0; m < M; m++) { const x = draws[m % 5](), v = hy.map((q) => H.psiOf(q.parts, x)), qd = v.reduce((s2, a) => s2 + a * a, 0) / 5; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) G[i][j] += (v[i] * v[j]) / qd / M; }
  let off = 0, diag = 0; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { if (i === j) diag = Math.max(diag, Math.abs(G[i][i] - 1)); else off = Math.max(off, Math.abs(G[i][j])); }
  ok(Math.abs(cosA + 0.25) < 1e-12 && Math.abs(cos3 + 1 / 3) < 1e-12 && diag < 0.03 && off < 0.03, `five sp⁴ hybrids, orthonormal (by 30k electrons: ${diag.toFixed(3)}, ${off.toFixed(3)}), ${(Math.acos(cosA) * 180 / Math.PI).toFixed(2)}° apart, the 5-cell's corners; ours, sp³, four at ${(Math.acos(cos3) * 180 / Math.PI).toFixed(2)}°`);
  let align = 1; for (const q of hy) { const dr = H.mixSampler(q.parts, rng), m = [0, 0, 0, 0]; for (let i = 0; i < 6000; i++) { const x = dr(), r = Math.hypot(...x); x.forEach((v, k) => (m[k] += v / r)); } align = Math.min(align, m.reduce((s2, v, k) => s2 + v * q.dir[k], 0) / Math.hypot(...m)); }
  const proj = D.slice(0, 4).map((v) => { const p = v.slice(0, 3), mm = Math.hypot(...p); return p.map((c) => c / mm); }), pc = proj[0].reduce((s2, v, k) => s2 + v * proj[1][k], 0);
  ok(align > 0.99 && Math.abs(pc + 1 / 3) < 1e-12 && D[4][3] === 1, `each hybrid's electrons lean toward its own corner (worst alignment ${align.toFixed(3)}); one points straight along w, and the other four, seen in x y z, are our tetrahedron (cos ${pc.toFixed(4)} = −1/3), each tipped ${(Math.asin(0.25) * 180 / Math.PI).toFixed(2)}° kata`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
