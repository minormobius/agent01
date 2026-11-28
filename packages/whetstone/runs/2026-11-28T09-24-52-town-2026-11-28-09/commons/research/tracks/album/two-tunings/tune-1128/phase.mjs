import fs from 'fs';
const b=fs.readFileSync(process.argv[2]);const sr=b.readUInt32LE(24),ch=b.readUInt16LE(22);
let p=12;while(b.toString('ascii',p,p+4)!=='data'){p+=8+b.readUInt32LE(p+4)}const d=p+8,len=b.readUInt32LE(p+4)/2/ch;
const x=new Float64Array(len);for(let i=0;i<len;i++){let s=0;for(let c=0;c<ch;c++)s+=b.readInt16LE(d+2*(i*ch+c));x[i]=s/ch}
const f0=+process.argv[3],W=Math.floor(0.25*sr);let prev=null,out=[];
for(let t=0;t+W<len&&t<4.5*sr;t+=Math.floor(0.05*sr)){let re=0,im=0;for(let i=0;i<W;i++){const w=0.5-0.5*Math.cos(2*Math.PI*i/W);const ph=2*Math.PI*f0*(t+i)/sr;re+=w*x[t+i]*Math.cos(ph);im-=w*x[t+i]*Math.sin(ph)}
const db=20*Math.log10(Math.hypot(re,im)/W*4/32768),phs=Math.atan2(im,re);let df='';
if(prev!==null){let dp=phs-prev;while(dp>Math.PI)dp-=2*Math.PI;while(dp<-Math.PI)dp+=2*Math.PI;df=(f0-dp/(2*Math.PI*0.05)).toFixed(3)}prev=phs;out.push((t/sr).toFixed(2)+' '+db.toFixed(1)+'dB '+df)}
console.log(out.join('\n'));
