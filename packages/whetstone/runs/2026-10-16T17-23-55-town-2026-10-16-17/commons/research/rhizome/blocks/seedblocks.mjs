// Modulo 2026-10-16 town. Do seed-grown blocks change the map? (the 10-16 reply to Lucy, 3mxyojsadep2c)
// node seedblocks.mjs <mode> <shard> <nShards>  mode = coord (the kit's s x s blocks, reproduces geom-coarse)
//                                                     | seed  (nearest-seed blocks by graph distance)
// Hex torus (kit 'tri6', 6 neighbours, the nearest regular cousin of a sphere's Voronoi cells), L 100, 5 seeds,
// s in 2,5,10 (at s=1 both rules are one tile per block, identical), p .1-.9, h .2-1.0: 243 cells.
// Seed blocks: one seed per coordinate block, placed uniformly at random inside it (its own rng stream),
// then every tile goes to its nearest seed by graph distance (multi-source BFS, ties to the seed reached
// first in BFS order). Same number of blocks, sizes vary. The trick: each tile gets fake x,y = the corner of
// its seed's coordinate block, so the kit's own line 112 lays the habitat, and every other draw
// (block order, planting, dynamics) comes from the same R stream as the coord run. Only membership changes.
import { sim, seedOf, rng, lattice } from './clone.mjs';
import { appendFileSync } from 'node:fs';
// mode coord2: the coord rule with seeds 5..9 instead of 0..4, the control (how much a fresh draw alone flips).
const [mode, shard, nSh] = [process.argv[2], +process.argv[3], +process.argv[4]];
const L = 100, Tmax = 8000, NS = 5, S = [2, 5, 10];
const P = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => +(i / 10).toFixed(1)), H = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => +(i / 10).toFixed(1));
export function seedGraph(G, s, R) {
  const nbk = L / s, owner = new Int32Array(G.N).fill(-1), q = [];
  const byBlock = Array.from({ length: nbk * nbk }, () => []);
  for (let i = 0; i < G.N; i++) byBlock[Math.min(nbk - 1, Math.floor(G.y[i] / s)) * nbk + Math.min(nbk - 1, Math.floor(G.x[i] / s))].push(i);
  for (let k = 0; k < byBlock.length; k++) { const c = byBlock[k][(R() * byBlock[k].length) | 0]; owner[c] = k; q.push(c); }
  for (let h = 0; h < q.length; h++) { const i = q[h]; for (let e = G.off[i]; e < G.off[i + 1]; e++) { const j = G.nb[e]; if (owner[j] < 0) { owner[j] = owner[i]; q.push(j); } } }
  const x = new Float64Array(G.N), y = new Float64Array(G.N);
  for (let i = 0; i < G.N; i++) { x[i] = (owner[i] % nbk) * s; y[i] = Math.floor(owner[i] / nbk) * s; }
  const size = new Int32Array(nbk * nbk); for (let i = 0; i < G.N; i++) size[owner[i]]++;
  return { G: { ...G, x, y }, size };
}
if ((process.argv[1] || '').endsWith('seedblocks.mjs')) {
  let n = 0;
  for (const s of S) for (const h of H) for (const p of P) { if (n++ % nSh !== shard) continue;
    for (let r = 0; r < NS; r++) { const seed = seedOf(r);
      const G0 = lattice('tri6', L, true, rng((seed ^ 0x2545F491) >>> 0));
      let G = G0, sd = null;
      if (mode === 'seed') { const o = seedGraph(G0, s, rng((seed ^ 0x5EEDB10C) >>> 0)); G = o.G; const z = [...o.size].sort((a, b) => a - b); sd = { min: z[0], med: z[z.length >> 1], max: z[z.length - 1] }; }
      const m = sim([p, s, h], mode === 'coord2' ? seedOf(r + NS) : seed, { L, graph: G });
      let tS = null, tI = null;
      while (m.t < Tmax) { m.step(); if (m.t % 25 === 0) { const o = m.cover();
        if (tS == null && o.sg + o.sb === 0) tS = m.t; if (tI == null && o.ig + o.ib === 0) tI = m.t; if (tS != null && tI != null) break; } }
      const o = m.cover();
      appendFileSync(new URL(`./sb-${mode}-${shard}.jsonl`, import.meta.url).pathname, JSON.stringify({ mode, s, p, h, seed, tS, tI, S: +(o.sg + o.sb).toFixed(2), I: +(o.ig + o.ib).toFixed(2), ...(sd ? { size: sd } : {}) }) + '\n');
    } }
}
