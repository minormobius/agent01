// delve-graph-modularity.mjs — are there clusters, or just a blob? (net off)
// usage: node shelf/delve-graph-modularity.mjs <crawl.json> [out.json]
// Mutual-follow graph, greedy local-moving modularity (Louvain level 1), 200 seeds; best Q is compared
// to the same procedure on 20 degree-preserving rewirings (best of 20 seeds each). Q above the null max = structure.
// out.json gets { summary, comm } where comm[i] is the community of node i in the best run (-1 = no mutual pair).
import { readFileSync, writeFileSync } from 'node:fs';
const [file, out] = process.argv.slice(2);
const c = JSON.parse(readFileSync(file, 'utf8'));
const N = c.nodes.length, E = c.edges, dir = new Set();
for (let i = 0; i < E.length; i += 2) dir.add(E[i] * N + E[i + 1]);
let adj = Array.from({ length: N }, () => []); let m = 0;
for (const k of dir) { const a = Math.floor(k / N), b = k % N; if (a < b && dir.has(b * N + a)) { adj[a].push(b); adj[b].push(a); m++; } }
const real = adj.map((a) => a.slice());
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lm(seed) {
  const r = rng(seed), deg = adj.map((a) => a.length), com = [...Array(N).keys()], tot = deg.slice();
  for (let pass = 0; pass < 50; pass++) {
    let moved = 0; const ord = [...Array(N).keys()];
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
    for (const v of ord) {
      if (!deg[v]) continue;
      const k = new Map(); for (const u of adj[v]) k.set(com[u], (k.get(com[u]) || 0) + 1);
      const cv = com[v]; tot[cv] -= deg[v];
      let best = cv, bg = (k.get(cv) || 0) - tot[cv] * deg[v] / (2 * m);
      for (const [cc, kv] of k) { const g = kv - tot[cc] * deg[v] / (2 * m); if (g > bg + 1e-12) { bg = g; best = cc; } }
      com[v] = best; tot[best] += deg[v]; if (best !== cv) moved++;
    }
    if (!moved) break;
  }
  return com;
}
function Q(lab) {
  const inn = new Map(), tot = new Map();
  for (let v = 0; v < N; v++) { tot.set(lab[v], (tot.get(lab[v]) || 0) + adj[v].length); for (const u of adj[v]) if (lab[u] === lab[v]) inn.set(lab[v], (inn.get(lab[v]) || 0) + 1); }
  let q = 0; for (const [l, t] of tot) q += (inn.get(l) || 0) / (2 * m) - (t / (2 * m)) ** 2; return q;
}
const sizes = (lab) => { const s = new Map(); lab.forEach((l, v) => adj[v].length && s.set(l, (s.get(l) || 0) + 1)); return [...s.values()].sort((a, b) => b - a); };
const res = []; for (let s = 1; s <= 200; s++) { const l = lm(s); res.push({ s, l, q: Q(l) }); }
res.sort((a, b) => b.q - a.q);
const qs = res.map((r) => r.q).sort((a, b) => a - b);
const best = res[0];
// null model
const pairs = []; for (let a = 0; a < N; a++) for (const b of adj[a]) if (a < b) pairs.push([a, b]);
const R = rng(7), nullQ = [], key = (a, b) => (a < b ? a * N + b : b * N + a);
for (let g = 0; g < 20; g++) {
  const P = pairs.map((p) => p.slice()), S = new Set(P.map((p) => key(p[0], p[1])));
  for (let t = 0; t < P.length * 10; t++) {
    const i = Math.floor(R() * P.length), j = Math.floor(R() * P.length);
    const [a, b] = P[i], [x, d] = P[j];
    if (a === d || x === b || a === x || b === d || S.has(key(a, d)) || S.has(key(x, b))) continue;
    S.delete(key(a, b)); S.delete(key(x, d)); P[i] = [a, d]; P[j] = [x, b]; S.add(key(a, d)); S.add(key(x, b));
  }
  adj = Array.from({ length: N }, () => []); for (const [a, b] of P) { adj[a].push(b); adj[b].push(a); }
  let bq = -1; for (let s = 1; s <= 20; s++) bq = Math.max(bq, Q(lm(s))); nullQ.push(bq);
}
adj = real;
nullQ.sort((a, b) => a - b);
const f = (x) => +x.toFixed(4);
const summary = {
  method: 'mutual-follow graph; greedy local-moving modularity, 200 seeds; null = 20 degree-preserving rewirings, best of 20 seeds each',
  nodes: N, mutualPairs: m, withoutMutual: adj.filter((a) => !a.length).length,
  Q: { best: f(best.q), median: f(qs[100]), p10: f(qs[20]) },
  nullBestQ: { min: f(nullQ[0]), median: f(nullQ[10]), max: f(nullQ[19]) },
  bestSizes: sizes(best.l), bestSeed: best.s,
};
console.log(JSON.stringify(summary, null, 1));
if (out) {
  const ids = new Map(), sz = sizes(best.l);
  const order = [...new Set(best.l.filter((_, v) => adj[v].length))].sort((a, b) => best.l.filter((x) => x === b).length - best.l.filter((x) => x === a).length);
  order.forEach((l, i) => ids.set(l, i));
  writeFileSync(out, JSON.stringify({ summary, comm: best.l.map((l, v) => (adj[v].length ? ids.get(l) : -1)) }));
  void sz;
}
