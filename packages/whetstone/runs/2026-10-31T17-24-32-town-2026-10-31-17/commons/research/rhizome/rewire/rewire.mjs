// Modulo 2026-10-16. node rewire.mjs <f> <shard> <nShards> -> rw-<f>-<shard>.jsonl. See PREDICTION.md.
import { sim, seedOf, rng } from './clone.mjs';
import { tri3 } from './geom.mjs';
import { appendFileSync, readFileSync } from 'node:fs';
const f = +process.argv[2], shard = +process.argv[3], nSh = +process.argv[4], L = 100, Tmax = 8000, NS = 5;
const dir = new URL('.', import.meta.url).pathname;
const cells = JSON.parse(readFileSync(dir + 'cells.json', 'utf8'));
export function rewire(G, f, R) {
  const N = G.N, adj = Array.from({ length: N }, (_, i) => new Set(G.nb.subarray(G.off[i], G.off[i + 1])));
  const E = []; for (let i = 0; i < N; i++) for (const j of adj[i]) if (i < j) E.push([i, j]);
  let want = Math.round(f * E.length / 2), done = 0, tries = 0;   // each swap moves 2 edges
  while (done < want && tries < want * 50) { tries++;
    const a = (R() * E.length) | 0, b = (R() * E.length) | 0; if (a === b) continue;
    let [u, v] = E[a], [x, y] = E[b]; if (R() < 0.5) [x, y] = [y, x];
    if (u === x || u === y || v === x || v === y || adj[u].has(x) || adj[v].has(y)) continue;
    adj[u].delete(v); adj[v].delete(u); adj[x].delete(y); adj[y].delete(x);
    adj[u].add(x); adj[x].add(u); adj[v].add(y); adj[y].add(v); E[a] = [u, x]; E[b] = [v, y]; done++; }
  const off = new Int32Array(N + 1), nb = [];
  for (let i = 0; i < N; i++) { for (const j of adj[i]) nb.push(j); off[i + 1] = nb.length; }
  return { ...G, off, nb: Int32Array.from(nb), swaps: done };
}
if ((process.argv[1] || '').endsWith('rewire.mjs')) {
  let n = 0;
  for (const c of cells) for (let r = 0; r < NS; r++) { if (n++ % nSh !== shard) continue;
    const seed = seedOf(r), G = f > 0 ? rewire(tri3(L), f, rng((seed ^ 0x51ED27) >>> 0)) : tri3(L);
    const m = sim([c.p, c.s, c.h], seed, { L, graph: G });
    let tS = null, tI = null;
    while (m.t < Tmax) { m.step(); if (m.t % 25 === 0) { const o = m.cover();
      if (tS == null && o.sg + o.sb === 0) tS = m.t; if (tI == null && o.ig + o.ib === 0) tI = m.t; if (tS != null && tI != null) break; } }
    const o = m.cover();
    appendFileSync(dir + `rw-${f}-${shard}.jsonl`, JSON.stringify({ f, swaps: G.swaps ?? 0, s: c.s, p: c.p, h: c.h, seed, tS, tI, S: +(o.sg + o.sb).toFixed(2), I: +(o.ig + o.ib).toFixed(2) }) + '\n');
  }
}
