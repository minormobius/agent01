// Phase sweep on other geometries. Morphyx, 2026-10-15 town, for the person's 3mxwecbinok2b.
// Same grid, seeds, checkpoints and loop as ../phase/sweepT.mjs (Modulo's), with the lattice swapped.
// clone.mjs here is a byte copy of www/rhizome/kit/clone.mjs, so the job's digest covers the code that makes the numbers.
// node geom.mjs <geom[,geom...]> <shard> <nShards>   appends each run as it ends to rows-<geom>-<shard>.jsonl here
// (resumable: skips (s,p,h,seed) already in rows-<geom>-*.jsonl, so a cut-off job loses only the run in flight)
// geoms:
//   vortorus  Voronoi cells of L*L uniform points on a torus (the kit's 'vor', wrapped)
//   vorplane  the same points and cells, no wrap: cells clipped to the box, no links across the edge
//   hextorus  hexagon tiles on a torus: each touches 6, which is the kit's 'tri6' adjacency, wrapped both ways.
//             Blocks are s x s in axial coordinates, so a block is a rhombus of hexagons, not a square.
//   tritorus  triangle tiles on a torus: each touches 3 (by edge), the honeycomb site lattice, p_c ~0.6970.
//             Row r, column c; up-pointing when r+c is even. Neighbours: left, right, and the row below (up)
//             or above (down). Blocks are s rows x s triangles (a parallelogram-ish strip, s triangles wide).
// Not here: the Voronoi sphere. A sphere has no s x s blocks; someone has to choose what a block is there.
import { sim, seedOf, rng, lattice } from './clone.mjs';
import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
const [geos, shard, nSh] = [process.argv[2], +process.argv[3], +process.argv[4]];
let geo = null;
const L = 100, Tmax = 8000, NS = 5;
const S = [1, 2, 5, 10], P = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => +(i / 10).toFixed(1)), H = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => +(i / 10).toFixed(1));
const CK = []; for (let t = 125; t <= Tmax; t *= 2) CK.push(t);
const r2 = x => +x.toFixed(2);
export function tri3(L) {
  const N = L * L, off = new Int32Array(N + 1), nb = [], x = new Float64Array(N), y = new Float64Array(N), top = new Uint8Array(N), bot = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = (i / L) | 0, c = i % L; x[i] = c; y[i] = r; top[i] = r === 0; bot[i] = r === L - 1;
    const v = (r + c) % 2 === 0 ? 1 : -1; // up-pointing touches the row below, down-pointing the row above
    for (const [dr, dc] of [[0, -1], [0, 1], [v, 0]]) nb.push(((r + dr + L) % L) * L + ((c + dc + L) % L));
    off[i + 1] = nb.length; }
  return { L, N, off, nb: Int32Array.from(nb), maxDeg: 3, x, y, top, bot };
}
function make(seed, p, s, h) {
  if (geo === 'vortorus') return sim([p, s, h], seed, { L, lat: 'vor' });
  if (geo === 'vorplane') return sim([p, s, h], seed, { L, graph: lattice('vor', L, false, rng((seed ^ 0x2545F491) >>> 0)) });
  if (geo === 'hextorus') return sim([p, s, h], seed, { L, lat: 'tri6' });
  if (geo === 'tritorus') return sim([p, s, h], seed, { L, graph: tri3(L) });
  throw new Error('unknown geometry ' + geo);
}
if (process.argv[1] && process.argv[1].endsWith('geom.mjs') && geos) for (geo of geos.split(',')) {
  if (L % 2) throw new Error('tritorus needs even L');
  const dir = new URL('.', import.meta.url).pathname, have = new Set(), out = dir + `rows-${geo}-${shard}.jsonl`;
  for (const f of readdirSync(dir).filter(f => f.startsWith(`rows-${geo}-`)))
    for (const l of readFileSync(dir + f, 'utf8').split('\n')) if (l.trim()) { try { const r = JSON.parse(l); have.add(`${r.s}|${r.p}|${r.h}|${r.seed}`); } catch {} }
  let n = 0;
  for (const s of S) for (const h of H) for (const p of P) { if (n++ % nSh !== shard) continue;
    for (let r = 0; r < NS; r++) { const seed = seedOf(r); if (have.has(`${s}|${p}|${h}|${seed}`)) continue;
      const m = make(seed, p, s, h);
      const ck = []; let tS = null, tI = null, last = null, tStop = null;
      for (const T of CK) {
        while (tStop == null && m.t < T) { m.step();
          if (m.t % 25 === 0) { const o = m.cover();
            if (tS == null && o.sg + o.sb === 0) tS = m.t; if (tI == null && o.ig + o.ib === 0) tI = m.t;
            if (tS != null && tI != null) { tStop = m.t; last = o; } } }
        if (tStop == null) last = m.cover();
        const o = last; ck.push({ T, S: r2(o.sg + o.sb), I: r2(o.ig + o.ib), sg: o.sg, ig: o.ig, ...(tStop != null && tStop < T ? { frozen: true } : {}) });
      }
      appendFileSync(out, JSON.stringify({ geo, L, s, p, h, seed, tS, tI, ck }) + '\n');
    } }
}
