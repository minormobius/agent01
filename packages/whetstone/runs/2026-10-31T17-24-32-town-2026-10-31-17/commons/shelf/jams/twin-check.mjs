// node shelf/jams/twin-check.mjs <abs www/jams/score/wasm.js> [N=1000000]
import { gen } from './score-twin.mjs';
const W = await import(process.argv[2]);
const b = Uint8Array.from(atob(W.WASM_B64), c => c.charCodeAt(0));
const s = (await WebAssembly.instantiate(b)).instance.exports;
const N = +(process.argv[3] || 1000000); let bad = 0;
for (const rem of [false, true]) for (let seed = 0; seed <= N; seed++) {
  const n = rem ? s.generate2(seed) : s.generate(seed), m = new Uint8Array(s.memory.buffer, s.buf(), 2 * n), j = gen(seed, rem);
  let ok = j.length === n; for (let i = 0; ok && i < n; i++) ok = m[2*i] - 2 === j[i][0] && m[2*i+1] === j[i][1];
  if (!ok && bad++ < 3) console.log('diff', rem, seed);
}
for (const seed of [4294967295, 2147483648, 123456789]) for (const rem of [false,true]) { const n = rem ? s.generate2(seed|0) : s.generate(seed|0), m = new Uint8Array(s.memory.buffer, s.buf(), 2*n), j = gen(seed, rem); if (j.map(x=>x[0]+2+','+x[1]).join() !== [...Array(n)].map((_,i)=>m[2*i]+','+m[2*i+1]).join()) { bad++; console.log('diff big', seed, rem); } }
console.log('seeds 0..'+N+' x2 modes, mismatches:', bad);
