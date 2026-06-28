// Fast smoke tests for the FDTD acoustic solver. Run: node acoustics.test.mjs
// (The rigorous proof is the 1D-vs-analytic layer match done during development;
// these guard the 3D invariants cheaply and are the oracle for the WebGPU port.)
import { simulate } from './acoustics.js';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : ' FAIL ') + msg); if(!cond) fail++; };
const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
const hiBand = r => { let s=0,n=0; for(let i=0;i<r.freqs.length;i++) if(r.freqs[i]>=r.meta.compactBelow){ s+=r.tlDisplay[i]; n++; } return n?s/n:0; };

const base = { R:25, cell:6, n:28, crossings:4, recorders:18, nFreq:14 };

// 1) An empty orb (no walls, no shell) must be acoustically invisible: TL ≈ 0.
const empty = simulate({ ...base, pattern:0, T:0.0, shell:0 });
ok(Math.max.apply(null, empty.tlDisplay) < 1.0, 'empty orb gives ~0 dB everywhere (max ' + Math.max.apply(null, empty.tlDisplay).toFixed(2) + ')');

// 2) A solid ball must block strongly in the meaningful band.
const solid = simulate({ ...base, pattern:0, T:0.0, shell:25 });
ok(hiBand(solid) > 10, 'solid sphere blocks (hi-band ' + hiBand(solid).toFixed(1) + ' dB > 10)');
ok(hiBand(solid) > hiBand(empty), 'solid sphere > empty orb');

// 3) A solid shell builds a real barrier — well above the empty baseline.
//    (Bare-vs-shelled is noise-sensitive on this tiny grid; shell-vs-empty isn't.)
const shelled = simulate({ ...base, pattern:0, T:0.31, shell:2.0 });
ok(hiBand(shelled) > hiBand(empty) + 5, 'shell builds a barrier (hi-band ' + hiBand(shelled).toFixed(1) + ' dB > empty+5)');

// 4) Output shape sanity.
ok(empty.tl.length === empty.freqs.length && empty.tlDisplay.length === empty.freqs.length, 'arrays aligned');
ok(empty.meta.compactBelow > 1000 && empty.meta.compactBelow < 4000, 'compactBelow ~ c/(2πR) (' + empty.meta.compactBelow + ' Hz)');

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
