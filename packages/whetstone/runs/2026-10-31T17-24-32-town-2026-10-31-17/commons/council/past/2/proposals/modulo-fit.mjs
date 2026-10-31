// Modulo, council 2 round 1. Can a first-order-plus-dead-time fit recover C, UA and dead time
// within 5% from a heating log, and how long/what shape must the log be?
// Plant = Modulo's assumed bath (proposals/modulo-bath.mjs). Prints the peak temperature each test input reaches.
// node proposals/modulo-fit.mjs
const P = { C: 5 * 4186, UA: 8, W: 1000, amb: 20, dead: 20, noise: 0.05, q: 0.0625 };
function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function plant(u, seed) {
  const r = rng(seed); const g = () => { let x = 0; for (let i = 0; i < 12; i++) x += r(); return x - 6; };
  const pipe = new Array(P.dead).fill(0); let T = P.amb; const y = []; let Tmax = T;
  for (let t = 0; t < u.length; t++) {
    pipe.push(u[t] * P.W); T += (pipe.shift() - P.UA * (T - P.amb)) / P.C; Tmax = Math.max(Tmax, T);
    y.push(Math.round((T + P.noise * g()) / P.q) * P.q);
  }
  return { y, Tmax };
}
function shape(u, tau, L) {
  const a = Math.exp(-1 / tau); let x = 0; const s = [];
  for (let t = 0; t < u.length; t++) { const ui = t - L >= 0 ? u[t - L] : 0; x = a * x + (1 - a) * ui; s.push(x); }
  return s;
}
function fit(u, y, amb) {
  let best = null;
  const tryp = (tau, L) => {
    const s = shape(u, tau, L); let sxy = 0, sxx = 0;
    for (let i = 0; i < y.length; i++) { sxy += s[i] * (y[i] - amb); sxx += s[i] * s[i]; }
    const K = sxy / sxx; let e = 0;
    for (let i = 0; i < y.length; i++) { const d = y[i] - amb - K * s[i]; e += d * d; }
    return { tau, L, K, e };
  };
  for (let L = 0; L <= 60; L++) {
    let lo = 300, hi = 20000;
    for (let k = 0; k < 50; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (tryp(m1, L).e < tryp(m2, L).e) hi = m2; else lo = m1; }
    const r = tryp((lo + hi) / 2, L); if (!best || r.e < best.e) best = r;
  }
  const UA = P.W / best.K; return { UA, C: best.tau * UA, L: best.L };
}
const cases = [
  ['full on, 1 h', 3600, () => 1],
  ['duty 0.3, 1 h', 3600, () => 0.3],
  ['duty 0.3, 2 h', 7200, () => 0.3],
  ['duty 0.3, 3 h', 10800, () => 0.3],
  ['full 28 min then off, 1 h', 3600, (t) => (t < 1680 ? 1 : 0)],
  ['full 28 min then off, 2 h', 7200, (t) => (t < 1680 ? 1 : 0)],
];
for (const ambErr of [0, 0.5]) {
  console.log(`\nambient ${ambErr ? '+0.5 K wrong' : 'known'} (seeds 1-10, worst case)`);
  for (const [name, N, f] of cases) {
    const u = Array.from({ length: N }, (_, t) => f(t));
    const w = { C: 0, UA: 0, L: 0 }; let Tm = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { y, Tmax } = plant(u, seed); Tm = Math.max(Tm, Tmax); const r = fit(u, y, P.amb + ambErr);
      w.C = Math.max(w.C, Math.abs(r.C / P.C - 1)); w.UA = Math.max(w.UA, Math.abs(r.UA / P.UA - 1)); w.L = Math.max(w.L, Math.abs(r.L - P.dead));
    }
    console.log(`${name.padEnd(28)} peak ${Tm.toFixed(1)} C | C ${(100 * w.C).toFixed(1)}%  UA ${(100 * w.UA).toFixed(1)}%  dead ±${w.L} s`);
  }
}
