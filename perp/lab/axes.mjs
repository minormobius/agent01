// Fast path: refit at the reproducible rank and print the axis table.
// behaviorome.mjs selects this rank automatically from restart similarity and
// prints the same table at the end of a full run; this script skips straight to
// it (~2 min instead of ~20) when only the axes are wanted.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpAls } from './tca.mjs';
import { stats } from '../../packages/dataviz/index.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const AGG = 3, R = 3;
const store = JSON.parse(readFileSync(join(HERE, 'micro.json'), 'utf8'));
const FEAT = store.FEATURES, F = FEAT.length;
const dates = Object.keys(store.days).sort().filter((d) => store.days[d] && store.days[d].every(Boolean));
const S = Math.floor(store.days[dates[0]].length / AGG), D = dates.length;
const day = dates.map((d) => { const raw = store.days[d];
  return Array.from({ length: S }, (_, s) => Float64Array.from({ length: F }, (_, f) => {
    let a = 0; for (let i = 0; i < AGG; i++) a += raw[s * AGG + i][f]; return a / AGG; })); });
const flat = (f) => { const o = []; for (let k = 0; k < D; k++) for (let s = 0; s < S; s++) o.push(day[k][s][f]); return o; };
const X = Array.from({ length: F }, (_, f) => { const c = flat(f), m = stats.mean(c), sd = stats.sd(c) || 1;
  return Array.from({ length: S }, (_, s) => Float64Array.from({ length: D }, (_, k) => (day[k][s][f] - m) / sd)); });

const fits = [0,1,2,3].map((s) => cpAls(X, R, { seed: 77 + s * 19, iters: 250 }));
const fit = fits.reduce((a, b) => a.err < b.err ? a : b);
console.log(`=== behaviorome axes at the reproducible rank R=${R} (R^2 ${fit.fitR2.toFixed(4)}) ===\n`);
console.log('feature      ' + Array.from({length:R},(_,r)=>`axis${r+1}`.padStart(9)).join(''));
FEAT.forEach((f,i)=>console.log(f.padEnd(13)+Array.from({length:R},(_,r)=>fit.A[i][r].toFixed(3).padStart(9)).join('')));
const hh=(s)=>`${String(Math.floor(s*AGG*5/60)).padStart(2,'0')}:${String((s*AGG*5)%60).padStart(2,'0')}`;
console.log('\naxis  share   within-day shape                       day lag-1 AC');
const tot = [...fit.lambda].reduce((a,b)=>a+b,0);
for (let r=0;r<R;r++){
  const b=fit.B.map(x=>x[r]), c=fit.C.map(x=>x[r]);
  console.log(`  ${r+1}   ${(100*fit.lambda[r]/tot).toFixed(1).padStart(5)}%   peak ${hh(b.indexOf(Math.max(...b)))}  trough ${hh(b.indexOf(Math.min(...b)))}  flatness ${(stats.sd(b)/(Math.abs(stats.mean(b))||1e-9)).toFixed(2).padStart(5)}      ${stats.correlation(c.slice(0,-1),c.slice(1)).toFixed(3).padStart(7)}`);
}
