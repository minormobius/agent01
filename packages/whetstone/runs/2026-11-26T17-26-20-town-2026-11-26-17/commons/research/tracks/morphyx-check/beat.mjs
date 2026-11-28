import fs from 'fs';
const b=fs.readFileSync(process.argv[2]);const sr=b.readUInt32LE(24);
let o=12;while(b.toString('ascii',o,o+4)!=='data'){o+=8+b.readUInt32LE(o+4)}
const n=b.readUInt32LE(o+4)/2,x=new Float64Array(n);for(let i=0;i<n;i++)x[i]=b.readInt16LE(o+8+2*i);
const seg=+(process.argv[3]||4),N=+(process.argv[4]||8);
for(let k=0;k<N;k++){
 const a=Math.floor((k*seg+0.3)*sr),e=Math.floor((k*seg+seg-0.5)*sr),L=e-a;
 const s=new Float64Array(L);for(let i=0;i<L;i++)s[i]=x[a+i]*(0.5-0.5*Math.cos(2*Math.PI*i/L));
 const spec=[];for(let f=1290;f<=1335;f+=0.05){let re=0,im=0,w=2*Math.PI*f/sr;for(let i=0;i<L;i++){re+=s[i]*Math.cos(w*i);im-=s[i]*Math.sin(w*i)}spec.push([f,Math.hypot(re,im)])}
 const mx=Math.max(...spec.map(p=>p[1]));
 const pk=spec.filter((p,i)=>i>0&&i<spec.length-1&&p[1]>spec[i-1][1]&&p[1]>spec[i+1][1]&&p[1]>0.01*mx).map(p=>p[0].toFixed(2)+'('+(p[1]/mx).toFixed(2)+')');
 console.log(k,k%2?'just ':'equal',pk.join(' '));
}
