/* PULL's squeeze models. No DOM.

   The bench needs one number from a sheath: how hard it presses the fibres together. This file gets it three ways,
   so the bench's formula can be checked instead of trusted.

   1. THE SPHERE FORMULA (what the bench uses). Treat the skin as a round pressure vessel of the bundle's radius R:
      a skin under tension n (force per length of skin) presses P = n / R as a tube (3D rope) and P = 2n / R as a
      2-sphere (4D rope), and each outer fibre takes its share of P × the skin's area. [thin-walled vessels]
   2. A TAUT SKIN ON THE REAL BUNDLE (`band`, `skin`). The skin is not round: it lies on the outer fibres and runs
      straight between them. Here it is a net of springs, shrunk onto the fibres (rigid, in their packed places) and
      relaxed; the force on each fibre is read off, against the net's own mean tension. In 3D the answer is exact
      and known (a band turning 60° round each of six discs presses n on each), which checks the method.
   3. WHO CARRIES IT (`sharing`). The skin's force on an outer fibre goes inward through its contacts. With every
      fibre the same size and stiffness each contact carries the same; with fibres a little unequal, some contacts
      open and others carry more. A Monte Carlo over fibre diameters gives the spread.

   Lengths are in fibre diameters: fibre radius 0.5, neighbours one apart, the bundle's radius 1.5. */

/* --- 2. a band round six discs (the cross-section of our rope: seven fibres in a tube) --- */
export function band({ N = 720, shrink = 0.05, iters = 60000 } = {}) {
  const C = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]), r = 0.5, X = new Float64Array(2 * N), V = new Float64Array(2 * N), G = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) { const a = (2 * Math.PI * i) / N; X[2 * i] = 1.5 * Math.cos(a); X[2 * i + 1] = 1.5 * Math.sin(a); }
  const l0 = ((2 * Math.PI * 1.5) / N) * (1 - shrink), k = 1 / l0, on = new Int8Array(N).fill(-1);
  const project = () => { for (let i = 0; i < N; i++) { on[i] = -1; for (let c = 0; c < 6; c++) { const dx = X[2 * i] - C[c][0], dy = X[2 * i + 1] - C[c][1], d = Math.hypot(dx, dy); if (d < r) { X[2 * i] = C[c][0] + (dx * r) / d; X[2 * i + 1] = C[c][1] + (dy * r) / d; on[i] = c; } } } };
  const force = () => { G.fill(0); let T = 0; for (let i = 0; i < N; i++) { const j = (i + 1) % N, dx = X[2 * j] - X[2 * i], dy = X[2 * j + 1] - X[2 * i + 1], l = Math.hypot(dx, dy), f = k * (l - l0); T += f; G[2 * i] += (f * dx) / l; G[2 * i + 1] += (f * dy) / l; G[2 * j] -= (f * dx) / l; G[2 * j + 1] -= (f * dy) / l; } return T / N; };
  let n = 0; for (let it = 0; it < iters; it++) { n = force(); for (let q = 0; q < 2 * N; q++) { V[q] = 0.9 * V[q] + 0.2 * l0 * G[q]; X[q] += V[q]; } project(); }
  n = force(); const F = C.map(() => [0, 0]); for (let i = 0; i < N; i++) if (on[i] >= 0) { F[on[i]][0] += G[2 * i]; F[on[i]][1] += G[2 * i + 1]; }
  /* the inward part of the band's force on each disc, over the band's tension */
  const inward = F.map((f, c) => -(f[0] * C[c][0] + f[1] * C[c][1])), mean = inward.reduce((a, b) => a + b, 0) / 6;
  return { perTension: mean / n, sphere: (2 * Math.PI) / 6, exact: 1, tension: n };
}

/* --- 2. a skin round twelve balls (the cross-section of a 4D rope: thirteen fibres in a hose) --- */
export const FCC12 = (() => { const P = []; for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (const s of [1, -1]) for (const t of [1, -1]) { const v = [0, 0, 0]; v[a] = s / Math.SQRT2; v[b] = t / Math.SQRT2; P.push(v); } return P; })();
function icosphere(level) { const t = (1 + Math.sqrt(5)) / 2, V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = Math.hypot(...v); return v.map((q) => q / l); });
  let Fc = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < level; s++) { const mid = new Map(), m = (a, b) => { const key = a < b ? a * 1e6 + b : b * 1e6 + a; if (!mid.has(key)) { const v = [0, 1, 2].map((q) => V[a][q] + V[b][q]), l = Math.hypot(...v); V.push(v.map((q) => q / l)); mid.set(key, V.length - 1); } return mid.get(key); }, nf = [];
    for (const [a, b, c] of Fc) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); } Fc = nf; }
  return { V, F: Fc }; }
export function skin({ level = 4, shrink = 0.05, iters = 6000, rot = [0.37, 0.61] } = {}) {
  /* (the mesh is turned off the packing's axes, so no symmetry of the two can flatter the answer) */
  const { V, F: tris } = icosphere(level), N = V.length, r = 0.5, X = new Float64Array(3 * N), W = new Float64Array(3 * N), G = new Float64Array(3 * N), [ra, rb] = rot;
  for (let i = 0; i < N; i++) { let [x, y, z] = V[i]; [x, y] = [x * Math.cos(ra) - y * Math.sin(ra), x * Math.sin(ra) + y * Math.cos(ra)]; [y, z] = [y * Math.cos(rb) - z * Math.sin(rb), y * Math.sin(rb) + z * Math.cos(rb)]; X[3 * i] = 1.5 * x; X[3 * i + 1] = 1.5 * y; X[3 * i + 2] = 1.5 * z; }
  const seen = new Set(), E = []; for (const [a, b, c] of tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const key = p < q ? p * 1e6 + q : q * 1e6 + p; if (!seen.has(key)) { seen.add(key); E.push(p, q); } }
  const M = E.length / 2, L0 = new Float64Array(M), len = (e) => { const p = 3 * E[2 * e], q = 3 * E[2 * e + 1]; return Math.hypot(X[q] - X[p], X[q + 1] - X[p + 1], X[q + 2] - X[p + 2]); };
  for (let e = 0; e < M; e++) L0[e] = len(e) * (1 - shrink);
  const on = new Int8Array(N).fill(-1), fe = new Float64Array(M);
  const project = () => { for (let i = 0; i < N; i++) { on[i] = -1; const p = 3 * i; for (let c = 0; c < 12; c++) { const dx = X[p] - FCC12[c][0], dy = X[p + 1] - FCC12[c][1], dz = X[p + 2] - FCC12[c][2], d2 = dx * dx + dy * dy + dz * dz; if (d2 < r * r) { const d = Math.sqrt(d2); X[p] = FCC12[c][0] + (dx * r) / d; X[p + 1] = FCC12[c][1] + (dy * r) / d; X[p + 2] = FCC12[c][2] + (dz * r) / d; on[i] = c; } } } };
  const force = () => { G.fill(0); for (let e = 0; e < M; e++) { const a = E[2 * e], b = E[2 * e + 1], p = 3 * a, q = 3 * b, dx = X[q] - X[p], dy = X[q + 1] - X[p + 1], dz = X[q + 2] - X[p + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz), f = (l - L0[e]) / L0[e]; fe[e] = f; const s = f / l; G[p] += s * dx; G[p + 1] += s * dy; G[p + 2] += s * dz; G[q] -= s * dx; G[q + 1] -= s * dy; G[q + 2] -= s * dz; } };
  /* a node feels up to six springs of stiffness 1/l0 each, so the stable step is a fraction of l0 */
  const h = 0.12 * Math.sqrt((4 * Math.PI * 2.25) / N); let moved = 0;
  for (let it = 0; it < iters; it++) { force(); moved = 0; for (let q = 0; q < 3 * N; q++) { W[q] = 0.92 * W[q] + h * G[q]; X[q] += W[q]; } project(); /* a node on a ball keeps no speed into it */ for (let i = 0; i < N; i++) if (on[i] >= 0) { const c = FCC12[on[i]], p = 3 * i, nx = (X[p] - c[0]) / r, ny = (X[p + 1] - c[1]) / r, nz = (X[p + 2] - c[2]) / r, vn = W[p] * nx + W[p + 1] * ny + W[p + 2] * nz; if (vn < 0) { W[p] -= vn * nx; W[p + 1] -= vn * ny; W[p + 2] -= vn * nz; } } if (it === iters - 1) for (let q = 0; q < 3 * N; q++) if (Math.abs(W[q]) > moved) moved = Math.abs(W[q]); }
  force();
  /* the skin's force on each ball: the springs' pull on the nodes that lie on it */
  const FB = FCC12.map(() => [0, 0, 0]); let touching = 0; for (let i = 0; i < N; i++) if (on[i] >= 0) { touching++; for (let q = 0; q < 3; q++) FB[on[i]][q] += G[3 * i + q]; }
  const inward = FB.map((f, c) => -(f[0] * FCC12[c][0] + f[1] * FCC12[c][1] + f[2] * FCC12[c][2])), sideways = FB.map((f, c) => Math.hypot(f[0] + inward[c] * FCC12[c][0], f[1] + inward[c] * FCC12[c][1], f[2] + inward[c] * FCC12[c][2]));
  /* the skin's tension: for a membrane, Σ (spring force × length) over twice the area is the mean of its two
     principal tensions. Per node the same sum over a third of its triangles' area, for where the skin is tightest */
  let area = 0, virial = 0; const nodeA = new Float64Array(N), nodeV = new Float64Array(N);
  for (const [a, b, c] of tris) { const u = [0, 1, 2].map((q) => X[3 * b + q] - X[3 * a + q]), v = [0, 1, 2].map((q) => X[3 * c + q] - X[3 * a + q]), A = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]); area += A; nodeA[a] += A / 3; nodeA[b] += A / 3; nodeA[c] += A / 3; }
  for (let e = 0; e < M; e++) { const w = fe[e] * len(e); virial += w; nodeV[E[2 * e]] += w / 2; nodeV[E[2 * e + 1]] += w / 2; }
  const n = virial / (2 * area), local = Array.from(nodeV, (v, i) => v / (2 * nodeA[i])).sort((a, b) => a - b), mean = inward.reduce((a, b) => a + b, 0) / 12;
  return { nodes: N, perTension: mean / n, spread: (Math.max(...inward) - Math.min(...inward)) / mean, sideways: Math.max(...sideways) / mean, sphere: 2 * Math.PI, hull: HULL, tension: n, area, peak: local[Math.floor(0.99 * (N - 1))] / n, touching: touching / N, moved: moved / h };
}
/* the same force from geometry alone, if the skin were the convex hull of the twelve balls under one uniform tension:
   the virial of a closed film (Σ x·F = 2 n A) with the hull's area and mean curvature from Steiner's formula for the
   cuboctahedron of edge 1 (area 6 + 2√3, 24 edges of exterior angle acos(1/√3)) grown by the ball radius ½ */
export const HULL = (() => { const A0 = 6 + 2 * Math.sqrt(3), Mc = 0.5 * 24 * Math.acos(1 / Math.sqrt(3)), rr = 0.5, A = A0 + 2 * Mc * rr + 4 * Math.PI * rr * rr, H = 2 * (Mc + 4 * Math.PI * rr); return (2 * A - rr * H) / 12 / 0.5; })();

/* --- 3. who carries it: thirteen balls with one-sided linear contacts, each outer ball pushed inward by 1 --- */
export function sharing({ sd = 0, trials = 200, overlap = 1e-3, seed = 1, iters = 4000 } = {}) {
  let s = seed >>> 0; const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const P = [[0, 0, 0], ...FCC12], pairs = []; for (let i = 0; i < 13; i++) for (let j = i + 1; j < 13; j++) if (Math.abs(Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]) - 1) < 1e-6) pairs.push([i, j]);
  /* stiffness such that with equal balls every contact closes by `overlap` under a wall force of 1 (each carries ⅓) */
  const k = 1 / (3 * overlap), out = { centre: [], ring: [], openCentre: 0, openRing: 0, onOuter: [], onCentre: [] };
  for (let t = 0; t < trials; t++) { const D = P.map(() => 1 + sd * overlap * gauss()), X = P.map((p) => [...p]), Nf = new Float64Array(pairs.length);
    for (let it = 0; it < iters; it++) { const f = X.map(() => [0, 0, 0]); for (let i = 1; i < 13; i++) for (let a = 0; a < 3; a++) f[i][a] -= P[i][a];
      for (let p = 0; p < pairs.length; p++) { const [i, j] = pairs[p], d = [0, 1, 2].map((a) => X[i][a] - X[j][a]), l = Math.hypot(...d), n = k * Math.max(0, (D[i] + D[j]) / 2 - l); Nf[p] = n; for (let a = 0; a < 3; a++) { f[i][a] += (n * d[a]) / l; f[j][a] -= (n * d[a]) / l; } }
      for (let i = 0; i < 13; i++) for (let a = 0; a < 3; a++) X[i][a] += (0.15 / k) * f[i][a]; }
    const tot = new Float64Array(13); pairs.forEach(([i, j], p) => { tot[i] += Nf[p]; tot[j] += Nf[p]; if (i === 0) { out.centre.push(Nf[p]); if (Nf[p] < 1e-6) out.openCentre++; } else { out.ring.push(Nf[p]); if (Nf[p] < 1e-6) out.openRing++; } });
    out.onCentre.push(tot[0]); for (let i = 1; i < 13; i++) out.onOuter.push(tot[i] + 1); /* (+1: the wall itself) */ }
  const st = (v) => { const a = Float64Array.from(v).sort(), n = a.length, m = a.reduce((p, q) => p + q, 0) / n; return { mean: m, sd: Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / n), p5: a[Math.floor(0.05 * (n - 1))], p95: a[Math.floor(0.95 * (n - 1))] }; };
  return { sd, centre: st(out.centre), ring: st(out.ring), openCentre: out.openCentre / out.centre.length, openRing: out.openRing / out.ring.length, onOuter: st(out.onOuter), onCentre: st(out.onCentre) };
}
