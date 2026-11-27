/* The 4D hot-wire anemometer by strip theory, no DOM (README section 12; the Python original is strip4.py).
   Each station of the wire loses heat as a sphere does at its local speed:
     Lam theta'' + P (1 + theta) - pi Nu(Re U(w)) theta = 0,   theta'(0) = 0, theta(R) = 0
   theta = fractional rise in local resistance, P = current squared (dimensionless), lengths in wire diameters.
   NU is the sphere's Nusselt number at Prandtl 0.7, copied from data/nu-table.json (strip4.py table): remake both together. */
export const NU = [[0.001,2.0005],[0.003,2.0008],[0.01,2.0030],[0.012588,2.0039],[0.015846,2.0050],[0.019946,2.0063],[0.025108,2.0081],[0.031606,2.0102],[0.039785,2.0129],[0.050081,2.0162],[0.063041,2.0203],[0.079356,2.0253],[0.099892,2.0316],[0.12574,2.0393],[0.15828,2.0488],[0.19925,2.0604],[0.25081,2.0745],[0.31572,2.0917],[0.39742,2.1125],[0.50027,2.1375],[0.62973,2.1676],[0.7927,2.2034],[0.99785,2.2460],[1.2561,2.2964],[1.5811,2.3557],[1.9903,2.4250],[2.5054,2.5057],[3.1538,2.5992],[3.9699,2.7069],[4.9973,2.8304],[6.2906,2.9715],[7.9185,3.1320],[9.9677,3.3139],[12.547,3.5193],[15.794,3.7505],[19.882,4.0102],[25.027,4.3009],[31.504,4.6256],[39.657,4.9875],[49.919,5.3899],[62.838,5.8368],[79.1,6.3338],[99.57,6.8898],[125.34,7.5208],[157.77,8.2475],[198.6,9.0842],[250,10.0335]];
const LR = NU.map((r) => Math.log(r[0]));
export function nu(Re) { if (Re <= NU[0][0]) return 2 + ((NU[0][1] - 2) * Math.max(Re, 0)) / NU[0][0]; const x = Math.log(Re); let i = 1; while (i < NU.length - 1 && LR[i] < x) i++; const t = Math.min(1, (x - LR[i - 1]) / (LR[i] - LR[i - 1])); return NU[i - 1][1] + t * (NU[i][1] - NU[i - 1][1]); }
/* speed along the wire over the developed flow's centreline speed; every n carries the same flow rate (n = 2 developed, Infinity plug) */
export const profile = (x, n = 2) => (n === Infinity ? 0.4 : ((0.4 * (n + 3)) / n) * (1 - Math.pow(x, n)));
/* U, if given, replaces the profile: speed over the developed flow's centreline speed, as a function of w/R */
export function wire({ R, Lam, Re, n = 2, N = 400, U = null }) {
  const dw = R / N, h = new Float64Array(N + 1), a = Lam / (dw * dw), th = new Float64Array(N + 1), c = new Float64Array(N), d = new Float64Array(N);
  for (let i = 0; i <= N; i++) h[i] = Math.PI * nu(Re * (U ? U(i / N) : profile(i / N, n)));
  /* tridiagonal solve; null once P is past the runaway (a pivot turns negative) */
  function solve(P) { let b = 2 * a + h[0] - P; if (b <= 0) return null; c[0] = (-2 * a) / b; d[0] = P / b;
    for (let i = 1; i < N; i++) { b = 2 * a + h[i] - P + a * c[i - 1]; if (b <= 0) return null; c[i] = -a / b; d[i] = (P + a * d[i - 1]) / b; }
    th[N] = 0; th[N - 1] = d[N - 1]; for (let i = N - 2; i >= 0; i--) th[i] = d[i] - c[i] * th[i + 1];
    let m = 0.5 * th[0]; for (let i = 1; i < N; i++) { if (th[i] < 0) return null; m += th[i]; } return m / N; }
  /* the current that holds the mean overheat at tau (constant-temperature operation) */
  function at(tau) { let lo = 0, hi = 1; for (let k = 0; k < 60; k++) { const m = solve(hi); if (m === null || m > tau) break; lo = hi; hi *= 2; }
    for (let k = 0; k < 50; k++) { const mid = 0.5 * (lo + hi), m = solve(mid); if (m === null || m > tau) hi = mid; else lo = mid; }
    const P = lo; solve(P); let s = 0.5 * h[0] * th[0], peak = 0; for (let i = 1; i < N; i++) { s += h[i] * th[i]; peak = Math.max(peak, th[i]); } peak = Math.max(peak, th[0]);
    return { P, theta: Float64Array.from(th), stream: (s * dw) / (P * R * (1 + tau)), peak }; }
  function runaway() { let lo = 0, hi = 1; while (solve(hi) !== null && hi < 1e9) { lo = hi; hi *= 2; } for (let k = 0; k < 50; k++) { const mid = 0.5 * (lo + hi); if (solve(mid) === null) hi = mid; else lo = mid; } return lo; }
  return { solve, at, runaway, h };
}
/* the flow rate a developed-flow calibration would report for this reading, over the true one */
export function misread({ R, Lam, Re, n, tau }) { const P = wire({ R, Lam, Re, n }).at(tau).P; let lo = Math.log(Re * 0.05), hi = Math.log(Re * 2); for (let k = 0; k < 40; k++) { const mid = 0.5 * (lo + hi); if (wire({ R, Lam, Re: Math.exp(mid), n: 2, N: 200 }).at(tau).P < P) lo = mid; else hi = mid; } return Math.exp(0.5 * (lo + hi)) / Re; }

/* ---- the ribbon (README section 13; the Python original is ribbon4.py) ----
   A ribbon spanning a disc of the pipe: at distance s from the axis it is a cylinder on the centreline of a plane channel
   of half-height H = sqrt(R^2 - s^2) with cold walls, in a stream of centre speed 1 - s^2/R^2. RG is that problem's
   Nusselt number on a grid of (H, local Reynolds number), copied from data/ribbon-grid.json (ribbon4.py grid): remake both
   together. The sheet's balance:  Lam (1/s)(s theta')' + P (1 + theta) - pi Nu(s) theta = 0,  theta(R) = 0. */
export const RG = { H: [1.0, 1.5, 2.25, 4.0, 9.0, 20.0, 50.0, 125.0, 250.0, 500.0], Re: [0.001, 0.01, 0.05, 0.25, 1.0, 4.0, 10.0, 20.0, 40.0], Nu: [[2.1512, 2.1512, 2.1513, 2.1518, 2.1603, 2.2783, 2.6792, 3.3294, 4.2598], [1.4931, 1.4931, 1.4931, 1.4943, 1.512, 1.7228, 2.2395, 2.8629, 3.6974], [1.1456, 1.1456, 1.1457, 1.1481, 1.1831, 1.5019, 2.0455, 2.6363, 3.4442], [0.8616, 0.8616, 0.8618, 0.8681, 0.949, 1.3787, 1.9133, 2.496, 3.2924], [0.6385, 0.6386, 0.6395, 0.6618, 0.8397, 1.3123, 1.8515, 2.4386, 3.2357], [0.5089, 0.5091, 0.5126, 0.5758, 0.8135, 1.2932, 1.8389, 2.4307, 3.2325], [0.4211, 0.4217, 0.434, 0.5542, 0.8046, 1.2903, 1.8391, 2.4333, 3.2382], [0.3877, 0.3896, 0.4156, 0.554, 0.8061, 1.2927, 1.842, 2.4368, 3.2426], [0.3795, 0.3838, 0.416, 0.5551, 0.8069, 1.2935, 1.8428, 2.4376, 3.2436], [0.378, 0.3834, 0.4166, 0.5555, 0.8072, 1.2936, 1.843, 2.4378, 3.2438]] };
const lH = RG.H.map(Math.log), lR = RG.Re.map(Math.log), lN = RG.Nu.map((r) => r.map(Math.log));
export function nuRibbon(H, Rel) { const x = Math.min(lH[lH.length - 1], Math.max(lH[0], Math.log(H))), y = Math.min(lR[lR.length - 1], Math.max(lR[0], Math.log(Math.max(Rel, 1e-300)))); let i = 1, j = 1; while (i < lH.length - 1 && lH[i] < x) i++; while (j < lR.length - 1 && lR[j] < y) j++;
  const tx = (x - lH[i - 1]) / (lH[i] - lH[i - 1]), ty = (y - lR[j - 1]) / (lR[j] - lR[j - 1]); return Math.exp((lN[i - 1][j - 1] * (1 - tx) + lN[i][j - 1] * tx) * (1 - ty) + (lN[i - 1][j] * (1 - tx) + lN[i][j] * tx) * ty); }
export function ribbon({ R, Lam, Re, N = 400 }) { const ds = R / N, a = Lam / (ds * ds), h = new Float64Array(N + 1), lo = new Float64Array(N), up = new Float64Array(N), di = new Float64Array(N), wg = new Float64Array(N + 1), th = new Float64Array(N + 1), c = new Float64Array(N), d = new Float64Array(N);
  for (let i = 0; i <= N; i++) { const x = i / N; h[i] = Math.PI * nuRibbon(R * Math.sqrt(Math.max(0, 1 - x * x)), Re * (1 - x * x)); wg[i] = (2 * i) / (N * N); } wg[0] = 1 / (4 * N * N); wg[N] = 1 / N;
  up[0] = -4 * a; di[0] = 4 * a; for (let i = 1; i < N; i++) { lo[i] = (-a * (i - 0.5)) / i; up[i] = (-a * (i + 0.5)) / i; di[i] = -(lo[i] + up[i]); }
  function solve(P) { let b = di[0] + h[0] - P; if (b <= 0) return null; c[0] = up[0] / b; d[0] = P / b;
    for (let i = 1; i < N; i++) { b = di[i] + h[i] - P - lo[i] * c[i - 1]; if (b <= 0) return null; c[i] = up[i] / b; d[i] = (P - lo[i] * d[i - 1]) / b; }
    th[N] = 0; th[N - 1] = d[N - 1]; for (let i = N - 2; i >= 0; i--) th[i] = d[i] - c[i] * th[i + 1];
    let m = 0; for (let i = 0; i < N; i++) { if (th[i] < 0) return null; m += wg[i] * th[i]; } return m; }
  function at(tau) { let l = 0, u = 1; for (let k = 0; k < 60; k++) { const m = solve(u); if (m === null || m > tau) break; l = u; u *= 2; }
    for (let k = 0; k < 50; k++) { const mid = 0.5 * (l + u), m = solve(mid); if (m === null || m > tau) u = mid; else l = mid; }
    solve(l); let s = 0, peak = 0; for (let i = 0; i < N; i++) { s += wg[i] * h[i] * th[i]; peak = Math.max(peak, th[i]); } return { P: l, theta: Float64Array.from(th), stream: s / (l * (1 + tau)), peak }; }
  return { solve, at, h }; }
