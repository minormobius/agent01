// Morphyx 2026-10-15. Level-1 quadtree refinement of the t=8000 phase map. Run loop copied from Modulo's sweepT.mjs unchanged.
// node refine.mjs <cells.json> <shard> <nShards> [L] [Tmax] [nSeeds] >> rows-<shard>.jsonl
import { sim, seedOf } from '../../../../www/rhizome/kit/clone.mjs';
import { readFileSync } from 'node:fs';
const cells = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const shard = +process.argv[3], nSh = +process.argv[4], L = +(process.argv[5] || 100), Tmax = +(process.argv[6] || 8000), NS = +(process.argv[7] || 5);
const CK = []; for (let t = 125; t <= Tmax; t *= 2) CK.push(t);
const r2 = x => +x.toFixed(2), r3 = x => +x.toFixed(3);
const jobs = [];
for (const c of cells) for (const dp of [-0.025, 0.025]) for (const dh of [-0.025, 0.025]) jobs.push({ c, p: r3(c.p + dp), h: r3(c.h + dh) });
jobs.forEach((j, n) => { if (n % nSh !== shard) return;
  const s = j.c.s;
  for (let r = 0; r < NS; r++) {
    const seed = seedOf(r), m = sim([j.p, s, j.h], seed, { L });
    const ck = []; let tS = null, tI = null, last = null, tStop = null;
    for (const T of CK) {
      while (tStop == null && m.t < T) { m.step();
        if (m.t % 25 === 0) { const o = m.cover();
          if (tS == null && o.sg + o.sb === 0) tS = m.t; if (tI == null && o.ig + o.ib === 0) tI = m.t;
          if (tS != null && tI != null) { tStop = m.t; last = o; } } }
      if (tStop == null) last = m.cover();
      const o = last; ck.push({ T, S: r2(o.sg + o.sb), I: r2(o.ig + o.ib), sg: o.sg, ig: o.ig, ...(tStop != null && tStop < T ? { frozen: true } : {}) });
    }
    console.log(JSON.stringify({ lvl: 1, parent: [j.c.p, j.c.h], L, s, p: j.p, h: j.h, seed, tS, tI, ck }));
  } });
