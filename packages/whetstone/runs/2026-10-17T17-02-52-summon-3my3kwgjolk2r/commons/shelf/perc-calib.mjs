// Site percolation calibration, square lattice, open boundaries.
// Newman–Ziff: occupy sites in random order, union-find, record the fraction
// at which a cluster first spans top to bottom. The mean over samples estimates
// p_c(L); it should approach 0.5927462 (Newman & Ziff 2000) as L grows.
// usage: node shelf/perc-calib.mjs [samples=2000] [seed=1] [L list, e.g. 32,64,128,256]
const N_SAMP = +(process.argv[2] ?? 2000), SEED = +(process.argv[3] ?? 1);
const Ls = (process.argv[4] ?? '32,64,128,256').split(',').map(Number);
const PC = 0.5927462;

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function spanAt(L, rand) {
  const n = L * L, TOP = n, BOT = n + 1;
  const par = new Int32Array(n + 2); for (let i = 0; i < n + 2; i++) par[i] = i;
  const occ = new Uint8Array(n);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const ord = new Int32Array(n); for (let i = 0; i < n; i++) ord[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
  for (let k = 0; k < n; k++) {
    const s = ord[k], r = (s / L) | 0, c = s % L; occ[s] = 1;
    if (r === 0) uni(s, TOP); if (r === L - 1) uni(s, BOT);
    if (r > 0 && occ[s - L]) uni(s, s - L); if (r < L - 1 && occ[s + L]) uni(s, s + L);
    if (c > 0 && occ[s - 1]) uni(s, s - 1); if (c < L - 1 && occ[s + 1]) uni(s, s + 1);
    if (find(TOP) === find(BOT)) return (k + 1) / n;
  }
  return 1;
}

// selftest: L=1 spans at the first site; L=2 needs at least 2 sites.
{ const r = rng(7); if (spanAt(1, r) !== 1) throw new Error('selftest L=1');
  for (let i = 0; i < 200; i++) { const p = spanAt(2, r); if (p < 0.5 || p > 0.75) throw new Error('selftest L=2 ' + p); } }

const rand = rng(SEED);
console.log(`samples=${N_SAMP} seed=${SEED}  target p_c=${PC}`);
for (const L of Ls) {
  let s = 0, s2 = 0;
  for (let i = 0; i < N_SAMP; i++) { const p = spanAt(L, rand); s += p; s2 += p * p; }
  const m = s / N_SAMP, se = Math.sqrt((s2 / N_SAMP - m * m) / (N_SAMP - 1));
  console.log(`L=${String(L).padStart(4)}  mean=${m.toFixed(5)} ± ${se.toFixed(5)} (1 s.e.)  off by ${(m - PC).toFixed(5)} = ${((m - PC) / se).toFixed(1)} s.e.`);
}
