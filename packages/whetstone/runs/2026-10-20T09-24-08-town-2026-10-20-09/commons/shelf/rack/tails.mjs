// node tails.mjs ./wasm.js   (Modulo, 10-20; wasm.js is at miniphim.minomobi.com/jams/rack/wasm.js)
// env: WARM=<blocks> runs that many unmeasured blocks first (750 = 2 s); ORDER=js,wasm; MODES=quiet,busy
// timing region: the render call only, performance.now() around it. Unpaced: blocks run back to back, no waiting.
// "over 2.667 ms" counts render calls longer than one 128-sample block at 48 kHz. Not deadline misses in a paced loop.
// per-block render times, organ, 64 voices, wasm vs JS twin; quiet and with a garbage-making load between blocks
import { pathToFileURL } from 'node:url'; import { resolve } from 'node:path';
const p = pathToFileURL(resolve(process.argv[2])).href;
const bytes = Buffer.from((await import(p)).WASM_B64, 'base64');
const { instance } = await WebAssembly.instantiate(bytes); const W = instance.exports;
const SR = 48000, B = 128, N = 64, SEC = 60, NB0 = SR*SEC/B, DL = B/SR*1000;
const TBL=4096,SINE=new Float32Array(TBL);for(let i=0;i<TBL;i++)SINE[i]=Math.sin(i/TBL*2*Math.PI);
const sinT=x=>{const p=(x-Math.floor(x))*TBL,i=p|0,f=p-i;const a=SINE[i&4095],b=SINE[(i+1)&4095];return a+(b-a)*f;};
let junk=[];
const load = () => { for (let i=0;i<20000;i++) junk.push({a:i,b:[i,i]}); if (junk.length>400000) junk=[]; };
function run(kind, busy, warm=0) {
  const NB = warm||NB0; const t = new Float64Array(NB);
  if (kind==='wasm'){ W.init(SR); for(let i=0;i<N;i++) W.note(0,110*2**(i/12%3),0.01,0,SR*(SEC+1)); }
  const vs=[]; for(let i=0;i<N;i++) vs.push({f:110*2**(i/12%3),p:0,age:0});
  const out=new Float32Array(B);
  for (let b=0;b<NB;b++){
    if (busy) load();
    const t0=performance.now();
    if (kind==='wasm') W.render(B);
    else { out.fill(0); for(const v of vs) for(let i=0;i<B;i++){const tt=v.age/SR;const a=tt<0.005?tt/0.005:1;v.p+=v.f/SR;if(v.p>=1)v.p-=1;
      out[i]+=a*(sinT(v.p)+0.5*sinT(2*v.p)+0.25*sinT(3*v.p))*0.5*0.01; v.age++;} for(let i=0;i<B;i++)out[i]=Math.max(-1,Math.min(1,out[i])); }
    t[b]=performance.now()-t0;
  }
  const s=[...t].sort((a,b)=>a-b), q=x=>s[Math.min(s.length-1,Math.floor(x*s.length))];
  const miss=s.filter(x=>x>DL).length; const at=[...t].map((x,i)=>x>1?i:-1).filter(i=>i>=0).slice(0,10);
  if (warm) return; console.log(`${kind.padEnd(4)} ${busy?'busy ':'quiet'} blocks ${NB}  p50 ${q(.5).toFixed(3)}  p99 ${q(.99).toFixed(3)}  p99.9 ${q(.999).toFixed(3)}  max ${s[s.length-1].toFixed(3)} ms  over ${DL.toFixed(3)} ms: ${miss}  blocks>1ms at ${at}`);
}
console.log(`node ${process.version}, ${N} organ voices, ${SEC} s of audio per run, per-block ms`);
const order=(process.env.ORDER||"wasm,js").split(","), modes=(process.env.MODES||"quiet,busy").split(",");
for (const m of modes) for (const k of order) { if (process.env.WARM) run(k,m==="busy",+process.env.WARM); run(k,m==="busy"); }
