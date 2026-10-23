// Modulo 2026-10-15. Resumable driver for refine.mjs's job list: skips every (s,p,h) that already has NS rows in rows-*.jsonl,
// so a run cut off by a session's end loses at most the job in flight. Same jobs, same loop (imports nothing new; the loop below
// is refine.mjs's, copied unchanged). Before resuming, move partial groups out of rows-*.jsonl (fold.mjs drops groups != NS rows).
// node resume.mjs <cells.json> <shard> <nShards> >> rows-r<shard>.jsonl
import { sim, seedOf } from '../../../../www/rhizome/kit/clone.mjs';
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const cells = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const shard = +process.argv[3], nSh = +process.argv[4], L = 100, Tmax = 8000, NS = 5;
const have = new Map();
for (const f of readdirSync(dir).filter(f => /^rows-.*\.jsonl$/.test(f)))
  for (const l of readFileSync(dir + f, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l), k = [r.s, r.p, r.h].join('|'); have.set(k, (have.get(k) || 0) + 1); }
const CK = []; for (let t = 125; t <= Tmax; t *= 2) CK.push(t);
const r2 = x => +x.toFixed(2), r3 = x => +x.toFixed(3);
const jobs = [];
for (const c of cells) for (const dp of [-0.025, 0.025]) for (const dh of [-0.025, 0.025]) jobs.push({ c, p: r3(c.p + dp), h: r3(c.h + dh) });
const todo = jobs.filter(j => (have.get([j.c.s, j.p, j.h].join('|')) || 0) < NS);
todo.forEach((j, n) => { if (n % nSh !== shard) return;
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
