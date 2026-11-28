#!/usr/bin/env node
// rhizome-kit CLI. Read README.md first. Node 22, no install, no network, writes nothing.
//   node cli.mjs health                          a few seconds: the copy runs and pins one digit string
//   node cli.mjs selftest                        ~30 s: twin digits, three lattice thresholds, two mutants caught
//   node cli.mjs perc <sq4|sq8|tri6> [L=128] [n=400] [seed=1]
//   node cli.mjs run <sq4|sq8|tri6> [runs=20] [clamp|linear] [B,A1,...] [steps=500]
//   node cli.mjs run custom:<p>,<s>,<h> ...      your own habitat (L=100, so s must divide 100)
import { CASES, LATTICES, run, seedOf, spanAt, rng } from './clone.mjs';
const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'health' || cmd === 'selftest') { const { main } = await import('./selftest.mjs'); process.exit(await main(cmd === 'health')); }
else if (cmd === 'perc') {
  const lat = a[0] || 'sq4', L = +(a[1] || 128), n = +(a[2] || 400), R = rng(+(a[3] || 1));
  let s = 0, s2 = 0; for (let i = 0; i < n; i++) { const p = spanAt(lat, L, R); s += p; s2 += p * p; }
  const m = s / n, se = Math.sqrt((s2 / n - m * m) / (n - 1));
  console.log(`${lat} L=${L} n=${n}: first span at ${m.toFixed(5)} ± ${se.toFixed(5)} (known p_c ${LATTICES[lat].pc})`);
} else if (cmd === 'run') {
  const lat = a[0] || 'sq4', runs = +(a[1] || 20), wmode = a[2] || 'clamp', T = +(a[4] || 500);
  const list = (a[3] || Object.keys(CASES).join(',')).split(/,(?![\d.])/);
  console.log(`lattice=${lat} (${LATTICES[lat].about}), w=${wmode}, ${runs} runs (seeds 1000r+7), 100x100 torus, ${T} steps.`);
  console.log('case  p    s h    | split good  split bad  | integ good  integ bad  | split alive  integ alive');
  for (const name of list) {
    const cs = name.startsWith('custom:') ? name.slice(7).split(',').map(Number) : name;
    const rs = []; for (let r = 0; r < runs; r++) rs.push(run(cs, seedOf(r), { wmode, lat }, T));
    const ms = k => { const v = rs.map(x => x[k]), m = v.reduce((x, y) => x + y) / v.length,
      sd = Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, v.length - 1)); return `${m.toFixed(1).padStart(5)}±${sd.toFixed(1).padEnd(4)}`; };
    const alive = f => String(rs.filter(f).length).padStart(5);
    const [p, s, h] = Array.isArray(cs) ? cs : CASES[cs];
    console.log(`${(Array.isArray(cs) ? 'cust' : cs).padEnd(4)} ${p.toFixed(2)} ${s} ${h.toFixed(1)}  | ${ms('sg')}  ${ms('sb')}  | ${ms('ig')}  ${ms('ib')}  | ${alive(x => x.sg + x.sb > 0)}/${runs}      ${alive(x => x.ig + x.ib > 0)}/${runs}`);
  }
} else { console.log('usage: node cli.mjs health | selftest | perc <lattice> [L] [n] [seed] | run <lattice> [runs] [clamp|linear] [cases] [steps]  (README.md)'); process.exit(cmd ? 2 : 0); }
