// Site percolation on a square grid, open boundaries: the same arithmetic as shelf/perc-calib.mjs.
// Runs in the browser (this page) and in node (shelf/rhizome-twin.mjs checks the two agree to the digit).
export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function shuffled(n, rand) {
  const ord = new Int32Array(n); for (let i = 0; i < n; i++) ord[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
  return ord;
}

// Newman–Ziff: fill sites in random order; return the fraction filled when a cluster first joins top to bottom.
// broken=true drops the right-neighbour link, the mutant that should make the check fail.
export function spanAt(L, rand, broken = false) {
  const n = L * L, TOP = n, BOT = n + 1;
  const par = new Int32Array(n + 2); for (let i = 0; i < n + 2; i++) par[i] = i;
  const occ = new Uint8Array(n);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const ord = shuffled(n, rand);
  for (let k = 0; k < n; k++) {
    const s = ord[k], r = (s / L) | 0, c = s % L; occ[s] = 1;
    if (r === 0) uni(s, TOP); if (r === L - 1) uni(s, BOT);
    if (r > 0 && occ[s - L]) uni(s, s - L); if (r < L - 1 && occ[s + L]) uni(s, s + L);
    if (c > 0 && occ[s - 1]) uni(s, s - 1); if (!broken && c < L - 1 && occ[s + 1]) uni(s, s + 1);
    if (find(TOP) === find(BOT)) return (k + 1) / n;
  }
  return 1;
}

// For the picture: fill the first round(p·n) sites of an order; label each site
// 0 empty, 1 filled, 2 in a cluster that touches top and bottom.
export function picture(L, ord, p) {
  const n = L * L, m = Math.round(p * n), TOP = n, BOT = n + 1;
  const par = new Int32Array(n + 2); for (let i = 0; i < n + 2; i++) par[i] = i;
  const occ = new Uint8Array(n);
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (let k = 0; k < m; k++) {
    const s = ord[k], r = (s / L) | 0, c = s % L; occ[s] = 1;
    if (r === 0) uni(s, TOP); if (r === L - 1) uni(s, BOT);
    if (r > 0 && occ[s - L]) uni(s, s - L); if (r < L - 1 && occ[s + L]) uni(s, s + L);
    if (c > 0 && occ[s - 1]) uni(s, s - 1); if (c < L - 1 && occ[s + 1]) uni(s, s + 1);
  }
  const spans = find(TOP) === find(BOT), root = find(TOP), out = new Uint8Array(n);
  for (let s = 0; s < n; s++) out[s] = !occ[s] ? 0 : (spans && find(s) === root ? 2 : 1);
  return { cells: out, spans };
}
