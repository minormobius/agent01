// Phase sweep with log-spaced checkpoints. Modulo, 2026-10-14. node sweepT.mjs <s> [L] [Tmax] [hList] [pList] [nSeeds] [skip.jsonl] >> sweepT-s<s>.jsonl
// Resumable: rows (s,p,h,seed) already in skip.jsonl are not rerun.
// Same grid/seeds as sweep.mjs. Checks extinction every 25 steps; a run stops only when both kinds are gone (the one absorbing state); later checkpoints are then all zero (frozen:true). tS/tI = first check (25-step grain) at which that kind was gone, null if never by Tmax. A first version stopped at the first extinction; that was wrong (the survivor can still die) and was discarded unpublished.
import { sim, seedOf } from '../../../www/rhizome/kit/clone.mjs';
const s = +process.argv[2], L = +(process.argv[3] || 100), Tmax = +(process.argv[4] || 8000);
const CK = []; for (let t = 125; t <= Tmax; t *= 2) CK.push(t);
const P = process.argv[6] ? process.argv[6].split(',').map(Number) : Array.from({ length: 19 }, (_, i) => +(0.05 * (i + 1)).toFixed(2));
const H = process.argv[5] ? process.argv[5].split(',').map(Number) : Array.from({ length: 9 }, (_, i) => +(0.2 + 0.1 * i).toFixed(1));
const r2 = x => +x.toFixed(2);
const NS = +(process.argv[7] || 10);
import { readFileSync, existsSync } from 'node:fs';
const done = new Set(process.argv[8] && existsSync(process.argv[8]) ? readFileSync(process.argv[8], 'utf8').trim().split('\n').filter(Boolean).map(l => { const r = JSON.parse(l); return `${r.s}|${r.p}|${r.h}|${r.seed}`; }) : []);
for (const h of H) for (const p of P) for (let r = 0; r < NS; r++) {
  if (done.has(`${s}|${p}|${h}|${seedOf(r)}`)) continue;
  const seed = seedOf(r), m = sim([p, s, h], seed, { L });
  const ck = []; let tS = null, tI = null, last = null, tStop = null;
  for (const T of CK) {
    while (tStop == null && m.t < T) { m.step();
      if (m.t % 25 === 0) { const o = m.cover();
        if (tS == null && o.sg + o.sb === 0) tS = m.t; if (tI == null && o.ig + o.ib === 0) tI = m.t;
        if (tS != null && tI != null) { tStop = m.t; last = o; } } }
    if (tStop == null) last = m.cover();
    const o = last; ck.push({ T, S: r2(o.sg + o.sb), I: r2(o.ig + o.ib), sg: o.sg, ig: o.ig, ...(tStop != null && tStop < T ? { frozen: true } : {}) });
  }
  console.log(JSON.stringify({ L, s, p, h, seed, tS, tI, ck }));
}
