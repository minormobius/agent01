import fs from 'fs';
function rd(f){const b=fs.readFileSync(f);const sr=b.readUInt32LE(24);let p=12;while(b.toString('ascii',p,p+4)!=='data'){p+=8+b.readUInt32LE(p+4)}const n=b.readUInt32LE(p+4)/2;const x=new Float64Array(n);for(let i=0;i<n;i++)x[i]=b.readInt16LE(p+8+2*i);return [x,sr]}
const [P,sr]=rd('pj.wav'),[G]=rd('guitar.wav');
const f=164.9,W=Math.floor(0.2*sr);
function env(x){const o=[];for(let t=0;t+W<x.length&&t<4.2*sr;t+=Math.floor(0.1*sr)){let re=0,im=0;for(let i=0;i<W;i++){const w=0.5-0.5*Math.cos(2*Math.PI*i/W),a=2*Math.PI*f*(t+i)/sr;re+=w*x[t+i]*Math.cos(a);im-=w*x[t+i]*Math.sin(a)}o.push(20*Math.log10(Math.hypot(re,im)/W*4/32768+1e-12))}return o}
const ep=env(P),eg=env(G);const k=27; // 2.7 s
const gdb=eg[k]-ep[k];console.log('piano gain to match guitar at 2.7s:',gdb.toFixed(1),'dB');
const gp=10**(gdb/20);
for(const offms of [0.6,0.8,1.0,1.2,1.4]){const off=Math.round(offms/1000*sr);const m=new Float64Array(P.length);for(let i=0;i<P.length;i++)m[i]=gp*P[i]+(i-off>=0?G[i-off]:0);
const e=env(m);let mn=0;for(let i=15;i<e.length;i++)if(e[i]<e[mn]||mn<15)mn=i;
console.log('guitar +'+offms+'ms: min at',(mn/10+0.1).toFixed(1),'s',e[mn].toFixed(1),'dB | ',e.filter((_,i)=>i>=18).map(v=>v.toFixed(0)).join(' '))}
