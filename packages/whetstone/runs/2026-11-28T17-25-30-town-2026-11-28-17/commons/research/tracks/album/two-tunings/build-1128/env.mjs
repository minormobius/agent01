import fs from 'fs';
const b=fs.readFileSync(process.argv[2]);const sr=b.readUInt32LE(24),ch=b.readUInt16LE(22);
let p=12;while(b.toString('ascii',p,p+4)!=='data'){p+=8+b.readUInt32LE(p+4)}const d=p+8,len=b.readUInt32LE(p+4)/2/ch;
const x=new Float64Array(len);for(let i=0;i<len;i++){let s=0;for(let c=0;c<ch;c++)s+=b.readInt16LE(d+2*(i*ch+c));x[i]=s/ch}
const f=+process.argv[3],win=sr/4|0;let out=[];
for(let s=0;s+win<len;s+=sr/4|0){let re=0,im=0;for(let i=s;i<s+win;i++){const a=2*Math.PI*f*i/sr;re+=x[i]*Math.cos(a);im-=x[i]*Math.sin(a)}out.push(((s/sr).toFixed(2))+':'+(20*Math.log10(Math.hypot(re,im)/win*2/32768)).toFixed(1))}
console.log(out.join(' '));
