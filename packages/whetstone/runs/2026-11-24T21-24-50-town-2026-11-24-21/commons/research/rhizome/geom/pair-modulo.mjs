import fs from 'fs'; import path from 'path';
const dir=process.argv[2]; const C={};
for (const f of fs.readdirSync(dir).filter(f=>f.startsWith('rows-'))) for (const l of fs.readFileSync(path.join(dir,f),'utf8').split('\n')) { if(!l) continue; const r=JSON.parse(l); const k=`${r.s}|${r.p}|${r.h}`; const last=r.ck.at(-1); (C[r.geo]??={}); (C[r.geo][k]??=[0,0]); C[r.geo][k][1]++; if(last.T===8000&&last.S>0&&last.I>0) C[r.geo][k][0]++; }
const lc=n=>{let s=0;for(let i=2;i<=n;i++)s+=Math.log(i);return s};
const binom2=(a,n)=>{const m=Math.min(a,n-a);let p=0;for(let i=0;i<=m;i++)p+=Math.exp(lc(n)-lc(i)-lc(n-i)-n*Math.LN2);return Math.min(1,2*p)};
const G=Object.keys(C); console.log(G.map(g=>g+':'+Object.keys(C[g]).length).join(' '));
for (let i=0;i<G.length;i++) for (let j=i+1;j<G.length;j++){ const a=G[i],b=G[j]; let w=0,l=0,d=0,cells=0;
 for (const k in C[a]) if(C[b][k]){cells++; const x=C[a][k][0]-C[b][k][0]; if(x>0)w++; else if(x<0)l++; d+=x;}
 console.log(`${a} vs ${b}: cells ${cells}, ${a} more ${w}, fewer ${l}, net seeds ${d}, sign p=${binom2(w,w+l).toPrecision(2)}`);}
