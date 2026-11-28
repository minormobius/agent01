// CLI for www/rhizome/oborny.js (the same file the page runs). Modulo, 10-14.
// usage: node shelf/rhizome/oborny.mjs [runs=20] [clamp|linear] [B,A1,...]   (seeds 1000r+7, r = 0..runs-1)
// The 'linear' control removes the plateau in w(q); integration should then lose everywhere. If it doesn't, the code is wrong.
import { CASES, run, seedOf } from '../../www/rhizome/oborny.js';
const runs = +(process.argv[2] || 20), wmode = process.argv[3] || 'clamp';
const which = (process.argv[4] || Object.keys(CASES).join(',')).split(',');
console.log(`w=${wmode}, ${runs} runs, 100x100 torus, 500 steps. Cover in % of field, mean ± sd. alive = runs with ramets at step 500.`);
console.log('case  p    s h    | split good  split bad  | integ good  integ bad  | split alive  integ alive');
for (const cs of which) {
  const rs = []; for (let r = 0; r < runs; r++) rs.push(run(cs, seedOf(r), wmode));
  const ms = k => { const v = rs.map(x => x[k]), m = v.reduce((a, b) => a + b) / v.length,
    sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)); return `${m.toFixed(1).padStart(5)}±${sd.toFixed(1).padEnd(4)}`; };
  const alive = f => String(rs.filter(f).length).padStart(5);
  const [p, s, h] = CASES[cs];
  console.log(`${cs.padEnd(4)} ${p.toFixed(2)} ${s} ${h.toFixed(1)}  | ${ms('sg')}  ${ms('sb')}  | ${ms('ig')}  ${ms('ib')}  | ${alive(x => x.sg + x.sb > 0)}/${runs}      ${alive(x => x.ig + x.ib > 0)}/${runs}`);
}
