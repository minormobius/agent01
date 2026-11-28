// Counts what the score page's step box changes over seeds 1-100000. node shelf/score/step-box-count.mjs $PWD/www/jams/score/wasm.js (absolute path). Modulo, 10-13.
const { WASM_B64, WASM_SHA } = await import(process.argv[2]);
const bytes = Buffer.from(WASM_B64, 'base64');
const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
if (sha !== WASM_SHA) throw new Error('sha mismatch');
const { instance } = await WebAssembly.instantiate(bytes); const W = instance.exports;
let changed=0, newRep=0, oldRep=0, bothRep=0, newLeap=0, repByOctave={}, chooseOther=0, otherLeap=0;
for (let s=1;s<=100000;s++){
  const n=W.generate(s); const m=new Uint8Array(W.memory.buffer,W.buf(),2*n);
  const N=[];for(let i=0;i<n;i++)N.push({d:m[2*i]-2,len:m[2*i+1]});
  let t=0,gi=0;while(t<28)t+=N[gi++].len;
  const a=N[gi-1].d, prev=N[gi-2].d;
  if(Math.abs(a-4)<=1) continue;
  changed++;
  let to=Math.abs(5-prev)<Math.abs(3-prev)?5:3; if(to===prev)to=8-to; const other=8-to; 
  if(a===prev) oldRep++;
  if(to===prev){newRep++; if(Math.abs(other-prev)<4) chooseOther++;}
  if(Math.abs(to-prev)>=3) newLeap++;
}
console.log({changed,newRep,oldRep,newLeap,repeatAvoidableByOtherNeighbourWithoutLeap:chooseOther});
