// 1. Poisson in a 3-ball cross-section on a Cartesian grid (not the radial ODE): lap u = -1, u = 0 on r = 1
const N = 81, h = 2 / (N - 1), u = new Float64Array(N * N * N), inside = new Uint8Array(N * N * N), id = (i, j, k) => (i * N + j) * N + k, X = (i) => -1 + i * h;
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) if (X(i) ** 2 + X(j) ** 2 + X(k) ** 2 < 1) inside[id(i, j, k)] = 1;
const w = 1.9; for (let it = 0; it < 1500; it++) for (let i = 1; i < N - 1; i++) for (let j = 1; j < N - 1; j++) for (let k = 1; k < N - 1; k++) { const p = id(i, j, k); if (!inside[p]) continue; const g = (u[p - 1] + u[p + 1] + u[p - N] + u[p + N] + u[p - N * N] + u[p + N * N] + h * h) / 6; u[p] += w * (g - u[p]); }
let Q = 0; for (let p = 0; p < u.length; p++) Q += u[p] * h ** 3; const c = (N - 1) / 2;
console.log("centre", u[id(c, c, c)].toFixed(4), "exact 1/6 =", (1 / 6).toFixed(4), "| Q", Q.toFixed(4), "exact 4pi/45 =", (4 * Math.PI / 45).toFixed(4), "| centre/mean", (u[id(c, c, c)] / (Q / (4 * Math.PI / 3))).toFixed(3), "exact 2.5");
// 2. the start-up series at t = 0 must cancel the steady profile, and at later t must satisfy the heat equation
const ser = (r, t, K = 4000) => { let s = 0; for (let k = 1; k <= K; k++) s += 12 * (k % 2 ? 1 : -1) / (k * Math.PI) ** 3 * Math.sin(k * Math.PI * r) / r * Math.exp(-k * k * Math.PI ** 2 * t); return (1 - r * r - s) / 6; };
console.log("start-up u(r,0):", [0.2, 0.5, 0.8].map((r) => ser(r, 0).toExponential(1)).join(" "), "| u(0.5, t=1):", ser(0.5, 1).toFixed(5), "steady", (0.75 / 6).toFixed(5));
{ const r = 0.4, t = 0.05, d = 1e-3, ut = (ser(r, t + d) - ser(r, t - d)) / (2 * d), lap = (ser(r + d, t) - 2 * ser(r, t) + ser(r - d, t)) / d ** 2 + (2 / r) * (ser(r + d, t) - ser(r - d, t)) / (2 * d); console.log("u_t - (lap u + 1) at r 0.4, t 0.05:", (ut - lap - 1).toExponential(1)); }
// 3. Nusselt number, constant wall flux, by quadrature of the radial problem for m = 1, 2, 3
for (const m of [1, 2, 3]) { const n = 20000, dr = 1 / n; let flux = 0, th = 0, num = 0, den = 0; const T = [0];
  for (let i = 0; i < n; i++) { const r = (i + 0.5) * dr; flux += (1 - r * r) * r ** (m - 1) * dr; const g = flux / ((i + 1) * dr) ** (m - 1); th += g * dr; T.push(th); }
  for (let i = 0; i <= n; i++) { const r = i * dr, wgt = (1 - r * r) * r ** (m - 1) * (i === 0 || i === n ? 0.5 : 1); num += wgt * T[i]; den += wgt; }
  const gw = flux, Nu = 2 * gw / (T[n] - num / den); console.log("m", m, "Nu", Nu.toFixed(4), "formula", (2 * (m + 4) * (m + 6) / (5 * m + 12)).toFixed(4)); }
