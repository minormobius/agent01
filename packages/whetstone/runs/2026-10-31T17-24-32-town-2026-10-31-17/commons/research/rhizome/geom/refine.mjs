// Morphyx 2026-10-15 (job-woken session). Level-1 refinement of each geometry's coarse map, for the person's 3mxwecbinok2b.
// cells.json = python3 -I plan.py ../../../jobs/geom-coarse/out  (plan.py: ../phase/refine/plan.py's rule, per geometry; pri 0 first)
// Each parent split in four (p, h ± 0.025), 5 seeds each, t to 8000. Run loop and make() copied from geom.mjs unchanged.
// node refine.mjs <shard> <nShards>   appends to rref-<shard>.jsonl; resumable (skips rows already in rref-*.jsonl).
import { sim, seedOf, rng, lattice } from './clone.mjs';
import { tri3 } from './geom.mjs';
import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
const shard = +process.argv[2], nSh = +process.argv[3], L = 100, Tmax = 8000, NS = 5;
const dir = new URL('.', import.meta.url).pathname;
const CK = []; for (let t = 125; t <= Tmax; t *= 2) CK.push(t);
const r2 = x => +x.toFixed(2), r3 = x => +x.toFixed(3);
function make(geo, seed, p, s, h) {
  if (geo === 'vortorus') return sim([p, s, h], seed, { L, lat: 'vor' });
  if (geo === 'vorplane') return sim([p, s, h], seed, { L, graph: lattice('vor', L, false, rng((seed ^ 0x2545F491) >>> 0)) });
  if (geo === 'hextorus') return sim([p, s, h], seed, { L, lat: 'tri6' });
  if (geo === 'tritorus') return sim([p, s, h], seed, { L, graph: tri3(L) });
  throw new Error('unknown geometry ' + geo);
}
const cells = JSON.parse(readFileSync(dir + 'cells.json', 'utf8'));
const have = new Set();
for (const f of readdirSync(dir).filter(f => /^rref-\d+\.jsonl$/.test(f)))
  for (const l of readFileSync(dir + f, 'utf8').split('\n')) if (l.trim()) { try { const r = JSON.parse(l); have.add(`${r.geo}|${r.s}|${r.p}|${r.h}|${r.seed}`); } catch {} }
const jobs = [];
for (const c of cells) for (const dp of [-0.025, 0.025]) for (const dh of [-0.025, 0.025]) jobs.push({ c, p: r3(c.p + dp), h: r3(c.h + dh) });
jobs.forEach((j, n) => { if (n % nSh !== shard) return;
  const { geo, s } = j.c;
  for (let r = 0; r < NS; r++) { const seed = seedOf(r); if (have.has(`${geo}|${s}|${j.p}|${j.h}|${seed}`)) continue;
    const m = make(geo, seed, j.p, s, j.h);
    const ck = []; let tS = null, tI = null, last = null, tStop = null;
    for (const T of CK) {
      while (tStop == null && m.t < T) { m.step();
        if (m.t % 25 === 0) { const o = m.cover();
          if (tS == null && o.sg + o.sb === 0) tS = m.t; if (tI == null && o.ig + o.ib === 0) tI = m.t;
          if (tS != null && tI != null) { tStop = m.t; last = o; } } }
      if (tStop == null) last = m.cover();
      const o = last; ck.push({ T, S: r2(o.sg + o.sb), I: r2(o.ig + o.ib), sg: o.sg, ig: o.ig, ...(tStop != null && tStop < T ? { frozen: true } : {}) });
    }
    appendFileSync(dir + `rref-${shard}.jsonl`, JSON.stringify({ lvl: 1, geo, parent: [j.c.p, j.c.h], pri: j.c.pri, L, s, p: j.p, h: j.h, seed, tS, tI, ck }) + '\n');
  } });
