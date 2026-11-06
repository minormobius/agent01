// delve-graph-lpa.mjs — community detection on a compact crawl (net off).
// usage: node shelf/delve-graph-lpa.mjs <crawl.json> [runs=200] [out.json]
// Graph: undirected, one edge per MUTUAL follow pair. Asynchronous label propagation,
// seeded (mulberry32), ties broken at random. Reports modularity Q for each run, keeps the best,
// and measures stability as the mean pairwise adjusted-Rand-free "same-pair agreement" vs the best.
import { readFileSync, writeFileSync } from 'node:fs';
const [file, runsArg, out] = process.argv.slice(2);
const runs = Number(runsArg ?? 200);
const c = JSON.parse(readFileSync(file, 'utf8'));
const N = c.nodes.length, E = c.edges;
const dir = new Set();
for (let i = 0; i < E.length; i += 2) dir.add(E[i] * N + E[i + 1]);
const adj = Array.from({ length: N }, () => []);
let m = 0;
for (const k of dir) { const a = Math.floor(k / N), b = k % N; if (a < b && dir.has(b * N + a)) { adj[a].push(b); adj[b].push(a); m++; } }
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lpa(seed) {
  const r = rng(seed), lab = [...Array(N).keys()], order = [...Array(N).keys()];
  for (let it = 0; it < 100; it++) {
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let changed = 0;
    for (const v of order) {
      if (!adj[v].length) continue;
      const cnt = new Map(); for (const u of adj[v]) cnt.set(lab[u], (cnt.get(lab[u]) || 0) + 1);
      let best = -1, cands = [];
      for (const [l, n] of cnt) { if (n > best) { best = n; cands = [l]; } else if (n === best) cands.push(l); }
      if (cands.includes(lab[v])) continue;
      lab[v] = cands[Math.floor(r() * cands.length)]; changed++;
    }
    if (!changed) break;
  }
  return lab;
}
function Q(lab) {
  const deg = adj.map((a) => a.length), inn = new Map(), tot = new Map();
  for (let v = 0; v < N; v++) { tot.set(lab[v], (tot.get(lab[v]) || 0) + deg[v]); for (const u of adj[v]) if (lab[u] === lab[v]) inn.set(lab[v], (inn.get(lab[v]) || 0) + 1); }
  let q = 0; for (const [l, t] of tot) q += (inn.get(l) || 0) / (2 * m) - (t / (2 * m)) ** 2; return q;
}
const sizes = (lab) => { const s = new Map(); lab.forEach((l, v) => adj[v].length && s.set(l, (s.get(l) || 0) + 1)); return [...s.values()].sort((a, b) => b - a); };
const res = [];
for (let s = 1; s <= runs; s++) { const lab = lpa(s); res.push({ s, lab, q: Q(lab), k: sizes(lab).filter((x) => x > 1).length }); }
res.sort((a, b) => b.q - a.q);
const best = res[0];
// agreement: fraction of mutual-edge endpoints (connected nodes) pairs where "same community" matches best
const conn = [...Array(N).keys()].filter((v) => adj[v].length);
function agree(a, b) { let same = 0, tot = 0; for (let i = 0; i < conn.length; i++) for (let j = i + 1; j < conn.length; j++) { const x = conn[i], y = conn[j]; tot++; if ((a[x] === a[y]) === (b[x] === b[y])) same++; } return same / tot; }
const ag = res.map((r) => agree(r.lab, best.lab)).sort((a, b) => a - b);
const qs = res.map((r) => r.q).sort((a, b) => a - b), ks = res.map((r) => r.k).sort((a, b) => a - b);
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const summary = {
  nodes: N, mutualPairs: m, isolatedInMutual: N - conn.length, runs,
  Q: { best: +best.q.toFixed(4), median: +pct(qs, 0.5).toFixed(4), p10: +pct(qs, 0.1).toFixed(4) },
  communitiesSize2plus: { best: best.k, median: pct(ks, 0.5), min: ks[0], max: ks[ks.length - 1] },
  bestSizes: sizes(best.lab),
  agreementWithBest: { median: +pct(ag, 0.5).toFixed(3), p10: +pct(ag, 0.1).toFixed(3) },
  bestSeed: best.s,
};
console.log(JSON.stringify(summary, null, 1));
if (out) {
  const ids = new Map(); const comm = best.lab.map((l, v) => (adj[v].length ? (ids.has(l) ? ids.get(l) : (ids.set(l, ids.size), ids.size - 1)) : -1));
  writeFileSync(out, JSON.stringify({ summary, comm }));
}
