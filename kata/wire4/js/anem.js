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
