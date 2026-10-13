// Prose desk for www/score: recounts the page numbers no other shelf script prints (21,039 / 10,520 / 68,441 / 48,421 / 10,525). node shelf/score/prose-count.mjs <abs www/score/wasm.js>. Modulo, 10-13 evening.
const { WASM_B64 } = await import(process.argv[2]);
const { instance } = await WebAssembly.instantiate(Buffer.from(WASM_B64,'base64')); const W=instance.exports;
let step=0,rep=0,leap=0,fourth=0,oldCopy=0;
for(let s=1;s<=100000;s++){const n=W.generate(s);const m=new Uint8Array(W.memory.buffer,W.buf(),2*n);
 const N=[];for(let i=0;i<n;i++)N.push({d:m[2*i]-2,len:m[2*i+1]});
 let t=0,gi=0;while(t<28)t+=N[gi++].len;const a=N[gi-1].d,prev=N[gi-2].d,x=Math.abs(a-4);
 if(x===0)rep++;else if(x===1)step++;else{leap++;if(x>=3)fourth++;
  const to=Math.abs(5-prev)<Math.abs(3-prev)?5:3; if(to===prev)oldCopy++;}}
console.log({step,rep,leap,fourth,oldCopy});
