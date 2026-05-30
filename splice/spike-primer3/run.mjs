import { readFileSync } from 'node:fs';
const bytes = readFileSync(new URL('./tm.wasm', import.meta.url));
let mem;
const env = {
  log:Math.log, log10:Math.log10, exp:Math.exp, pow:Math.pow, sqrt:Math.sqrt,
  strlen:(p)=>{ const u=new Uint8Array(mem.buffer); let e=p; while(u[e]) e++; return e-p; },
};
const { instance } = await WebAssembly.instantiate(bytes, { env });
mem = instance.exports.memory;
const enc = new TextEncoder();
function tm(seq){
  const ptr = instance.exports.tmbuf();
  new Uint8Array(mem.buffer).set(enc.encode(seq), ptr);
  return instance.exports.tm_w(seq.length);
}
for(const p of ['GTAAAACGACGGCCAGT','CAGGAAACAGCTATGAC','ATGCGTACGTTAGCTAGCTAG','GGGGCCCCGGGGCCCC'])
  console.log(p, tm(p).toFixed(4));
