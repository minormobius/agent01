// skein's question (10-26): is the generator effect repeatable across seeds, and does
// changing only the generator move the width? Three generators, same seeds, same N.
//  lcg-double: errorbar.js's as written (s*1103515245 overflows 2^53 in a double: not a true LCG)
//  lcg-exact:  the same constants in exact integer arithmetic
//  mulberry32
// Usage: node repro.mjs [N=50000] [seeds=8]
const N = +(process.argv[2] || 50000), S = +(process.argv[3] || 8);
const gens = {
  'lcg-double': (seed) => { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648; }; },
  'lcg-exact': (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return (s + 0.5) / 2147483648; }; },
  'mulberry32': (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296; }; },
};
const d = 0.5, R0 = 3, L = [-1 / 3, 1, 1 / 3], ts = [0, 1, 3], w = 0.5, sr = 0.034, step = 0.7;
function width(u) {
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  let ss = 0;
  for (let i = 0; i < N; i++) {
    let v = [g(), g(), g(), g()]; const n = Math.hypot(...v); v = v.map(x => x / n * step); v[3] = 0;
    const h = [R0, 0, 0, w]; const dist = (t, dw) => Math.hypot(...h.map((x, k) => x - v[k] * t - (k == 3 ? dw : 0)));
    let Q = 0; ts.forEach((t, j) => { const r = dist(t, 0) + g() * sr; Q += L[j] * r * r; });
    const R = dist(2, d) + g() * sr; const we = (Q + d * d - R * R) / (2 * d); ss += (we - w) ** 2;
  }
  return Math.sqrt(ss / N);
}
function normals(u, M = 1e6) {
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  let s1 = 0, s2 = 0, lag = 0, prev = g();
  for (let i = 0; i < M; i++) { const x = g(); s1 += x; s2 += x * x; lag += x * prev; prev = x; }
  const m = s1 / M, v = s2 / M - m * m; return [Math.sqrt(v), (lag / M - m * m) / v];
}
const mean = a => a.reduce((x, y) => x + y) / a.length, sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
console.log(`N=${N} walks per seed, ${S} seeds (1..${S}; seed 7 is errorbar.js's), σ=3.4 cm, step 0.7 m, notch 0.5 m`);
for (const [name, mk] of Object.entries(gens)) {
  const W = [], SD = [], LAG = [];
  for (let k = 1; k <= S; k++) { W.push(width(mk(k))); const [a, b] = normals(mk(k)); SD.push(a); LAG.push(b); }
  console.log(`${name.padEnd(11)} width ${mean(W).toFixed(4)} ± ${(sd(W) / Math.sqrt(S)).toFixed(4)} (seed spread ${sd(W).toFixed(4)})` +
    `  normals sd ${mean(SD).toFixed(4)} [${Math.min(...SD).toFixed(4)}–${Math.max(...SD).toFixed(4)}]  lag-1 ${mean(LAG).toFixed(4)} [${Math.min(...LAG).toFixed(4)}–${Math.max(...LAG).toFixed(4)}]`);
}
