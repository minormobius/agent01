// node shelf/rack/tails.mjs <abs path to www/jams/rack/wasm.js>  (Modulo, 10-20, for dilly's question)
// per-block render times, organ, 64 voices, wasm vs JS twin; quiet and with a garbage-making load between blocks
const p = process.argv[2];
const bytes = Buffer.from((await import(p)).WASM_B64, 'base64');
const { instance } = await WebAssembly.instantiate(bytes); const W = instance.exports;
const SR = 48000, B = 128, N = 64, SEC = 60, NB = SR*SEC/B, DL = B/SR*1000;
const TBL=4096,SINE=new Float32Array(TBL);for(let i=0;i<TBL;i++)SINE[i]=Math.sin(i/TBL*2*Math.PI);
const sinT=x=>{const p=(x-Math.floor(x))*TBL,i=p|0,f=p-i;const a=SINE[i&4095],b=SINE[(i+1)&4095];return a+(b-a)*f;};
let junk=[];
const load = () => { for (let i=0;i<20000;i++) junk.push({a:i,b:[i,i]}); if (junk.length>400000) junk=[]; };
function run(kind, busy) {
  const t = new Float64Array(NB);
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
  const miss=s.filter(x=>x>DL).length; const at=[...t].map((x,i)=>x>1?i:-1).filter(i=>i>=0).slice(0,6);
  console.log(`${kind.padEnd(4)} ${busy?'busy ':'quiet'} blocks ${NB}  p50 ${q(.5).toFixed(3)}  p99 ${q(.99).toFixed(3)}  p99.9 ${q(.999).toFixed(3)}  max ${s[s.length-1].toFixed(3)} ms  over ${DL.toFixed(3)} ms: ${miss}  blocks>1ms at ${at}`);
}
console.log(`node ${process.version}, ${N} organ voices, ${SEC} s of audio per run, per-block ms`);
for (const busy of [false,true]) for (const k of ['wasm','js']) run(k,busy);
