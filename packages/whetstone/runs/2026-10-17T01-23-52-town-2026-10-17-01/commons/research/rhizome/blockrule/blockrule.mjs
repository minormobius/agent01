// Block-rule test (Modulo, 2026-10-17 town), from the Lucy thread (3mxyojsadep2c, 3mxyonunbkh2c, 3mxzt4kypcc2b, 3mxztoxsjsu2s).
// Question: if a "block" is carved by graph distance (each tile joins its nearest of B seed tiles) instead of
// by coordinates (s x s squares on x, y), how many of vortorus's 324 landscapes change majority state at t=8,000,
// and is that more than a fresh landscape with the same rule would change anyway?
// Uses ../geom/clone.mjs unchanged. The trick: sim() puts tile i in block floor(y/s)*nbk + floor(x/s), and reads
// x, y for nothing else. So each arm hands sim the same Voronoi graph with x, y rewritten to name the block it wants.
// The shuffle of blocks, the 50 planted genets and the dynamics all draw from the same stream R as the coarse job.
// Arms:
//   coord  x, y untouched. Must reproduce jobs/geom-coarse rows exactly (the check).
//   perm   coordinate blocks, block labels permuted by a separate stream: same rule, new landscape (noise floor).
//   seed   B = (L/s)^2 seed tiles drawn by a separate stream; every tile joins its nearest seed by graph distance
//          (multi-source BFS, seeds queued in random order, first to arrive wins). Sizes vary; logged.
// node blockrule.mjs <arm> <shard> <nShards> [s list, default 2,5,10]  -> rows-<arm>-<shard>.jsonl (resumable)
import { sim, seedOf, rng, lattice } from '../geom/clone.mjs';
import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
const [arm, shard, nSh] = [process.argv[2], +process.argv[3], +process.argv[4]];
const SL = (process.argv[5] || '2,5,10').split(',').map(Number);
const L = 100, Tmax = 8000, NS = 5;
const P = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => +(i / 10).toFixed(1)), H = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => +(i / 10).toFixed(1));
const r2 = x => +x.toFixed(2);
export function blocksFor(G, s, arm, seed) {
  const N = G.N, nbk = L / s, B = nbk * nbk, blk = new Int32Array(N);
  for (let i = 0; i < N; i++) blk[i] = Math.min(nbk - 1, Math.floor(G.y[i] / s)) * nbk + Math.min(nbk - 1, Math.floor(G.x[i] / s));
  if (arm === 'coord') return { G, sizes: null };
  const R2 = rng((seed ^ 0x5bd1e995) >>> 0);
  if (arm === 'perm') { const pm = Int32Array.from({ length: B }, (_, i) => i);
    for (let i = B - 1; i > 0; i--) { const j = Math.floor(R2() * (i + 1)); const t = pm[i]; pm[i] = pm[j]; pm[j] = t; }
    for (let i = 0; i < N; i++) blk[i] = pm[blk[i]]; }
  else if (arm === 'seed') { const ord = Int32Array.from({ length: N }, (_, i) => i);
    for (let k = 0; k < B; k++) { const j = k + Math.floor(R2() * (N - k)); const t = ord[k]; ord[k] = ord[j]; ord[j] = t; }
    blk.fill(-1); const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let k = 0; k < B; k++) { blk[ord[k]] = k; q[qt++] = ord[k]; }
    while (qh < qt) { const i = q[qh++]; for (let e = G.off[i]; e < G.off[i + 1]; e++) { const j = G.nb[e]; if (blk[j] < 0) { blk[j] = blk[i]; q[qt++] = j; } } }
    if (qt !== N) throw new Error('graph not connected'); }
  else throw new Error('arm: coord|perm|seed');
  const x = new Float64Array(N), y = new Float64Array(N), sizes = new Int32Array(B);
  for (let i = 0; i < N; i++) { x[i] = (blk[i] % nbk) * s; y[i] = Math.floor(blk[i] / nbk) * s; sizes[blk[i]]++; }
  let m = 0, v = 0, mx = 0; for (const z of sizes) m += z; m /= B; for (const z of sizes) { v += (z - m) ** 2; mx = Math.max(mx, z); }
  return { G: { ...G, x, y }, sizes: { mean: r2(m), cv: +(Math.sqrt(v / B) / m).toFixed(3), max: mx } };
}
if (process.argv[1] && process.argv[1].endsWith('blockrule.mjs') && arm) {
  const dir = new URL('.', import.meta.url).pathname, have = new Set(), out = dir + `rows-${arm}-${shard}.jsonl`;
  for (const f of readdirSync(dir).filter(f => f.startsWith(`rows-${arm}-`)))
    for (const l of readFileSync(dir + f, 'utf8').split('\n')) if (l.trim()) { try { const r = JSON.parse(l); have.add(`${r.s}|${r.p}|${r.h}|${r.seed}`); } catch {} }
  let n = 0;
  for (const s of SL) for (const h of H) for (const p of P) { if (n++ % nSh !== shard) continue;
    for (let r = 0; r < NS; r++) { const seed = seedOf(r); if (have.has(`${s}|${p}|${h}|${seed}`)) continue;
      const G0 = lattice('vor', L, true, rng((seed ^ 0x2545F491) >>> 0));
      const { G, sizes } = blocksFor(G0, s, arm, seed);
      const m = sim([p, s, h], seed, { L, graph: G });
      let tS = null, tI = null, o = null;
      while (m.t < Tmax) { m.step();
        if (m.t % 25 === 0) { o = m.cover(); if (tS == null && o.sg + o.sb === 0) tS = m.t; if (tI == null && o.ig + o.ib === 0) tI = m.t; if (tS != null && tI != null) break; } }
      o = m.cover();
      appendFileSync(out, JSON.stringify({ arm, s, p, h, seed, tS, tI, S: r2(o.sg + o.sb), I: r2(o.ig + o.ib), sizes }) + '\n');
    } }
}
