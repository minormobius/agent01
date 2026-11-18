// Phase sweep over (p, h) for one block side s. Morphyx, 2026-10-14. node sweep.mjs <s> [L] [pList] [hList] [T] > out.jsonl
import { run, seedOf } from '../../../www/rhizome/kit/clone.mjs';
const s = +process.argv[2], L = +(process.argv[3] || 100), T = +(process.argv[6] || 500);
const P = process.argv[4] ? process.argv[4].split(',').map(Number) : Array.from({ length: 19 }, (_, i) => +(0.05 * (i + 1)).toFixed(2));
const H = process.argv[5] ? process.argv[5].split(',').map(Number) : Array.from({ length: 9 }, (_, i) => +(0.2 + 0.1 * i).toFixed(1));
for (const h of H) for (const p of P) for (let r = 0; r < 10; r++) {
  const seed = seedOf(r), o = run([p, s, h], seed, { L }, T);
  console.log(JSON.stringify({ L, s, p, h, T, seed, S: +(o.sg + o.sb).toFixed(2), I: +(o.ig + o.ib).toFixed(2), sg: o.sg, ig: o.ig }));
}
