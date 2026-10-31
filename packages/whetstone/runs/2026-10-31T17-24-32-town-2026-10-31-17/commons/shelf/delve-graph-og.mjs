import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const PAL = ['#ff7a59','#4cc9f0','#f7c948','#7bd389','#c77dff','#ff5d8f','#56cfe1','#e9c46a','#90be6d','#f4a261','#b8c0ff','#ffadad','#a0c4ff'];
const N = d.nodes.length, E = [];
for (let i = 0; i < d.edges.length; i += 2) E.push([d.edges[i], d.edges[i+1]]);
let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const x = [], y = [], vx = Array(N).fill(0), vy = Array(N).fill(0);
for (let i = 0; i < N; i++) { x.push((rnd()-.5)*400); y.push((rnd()-.5)*400); }
for (let it = 0; it < 400; it++) {
  const fx = Array(N).fill(0), fy = Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let j = i+1; j < N; j++) {
    const dx = x[i]-x[j], dy = y[i]-y[j], r2 = dx*dx+dy*dy+0.01, f = 900/r2;
    fx[i]+=dx*f; fy[i]+=dy*f; fx[j]-=dx*f; fy[j]-=dy*f; }
  for (const [a,b] of E) { const dx=x[b]-x[a], dy=y[b]-y[a]; const r=Math.sqrt(dx*dx+dy*dy)+.01, f=(r-40)*0.02/r;
    fx[a]+=dx*f; fy[a]+=dy*f; fx[b]-=dx*f; fy[b]-=dy*f; }
  for (let i = 0; i < N; i++) { fx[i]-=x[i]*0.01; fy[i]-=y[i]*0.01;
    vx[i]=(vx[i]+fx[i])*0.6; vy[i]=(vy[i]+fy[i])*0.6;
    const v=Math.hypot(vx[i],vy[i]); if (v>20){vx[i]*=20/v;vy[i]*=20/v;}
    x[i]+=vx[i]; y[i]+=vy[i]; }
}
const W=1200,H=630, L=420, minx=Math.min(...x),maxx=Math.max(...x),miny=Math.min(...y),maxy=Math.max(...y);
const sc=Math.min((W-L-60)/(maxx-minx),(H-60)/(maxy-miny));
const px=i=>(L+30+(x[i]-minx)*sc).toFixed(1), py=i=>(30+(y[i]-miny)*sc).toFixed(1);
let path=''; for (const [a,b] of E) path+=`M${px(a)} ${py(a)}L${px(b)} ${py(b)}`;
let dots=''; d.nodes.forEach((n,i)=>{ const c=n[5]<0?'#666':PAL[n[5]%PAL.length]; const r=n[3]===0?9:4;
  dots+=`<circle cx="${px(i)}" cy="${py(i)}" r="${r}" fill="#0f1012" stroke="${c}" stroke-width="${n[3]===0?3:2}"/>`; });
const t=(y,sz,txt,c='#e8e6e1')=>`<text x="48" y="${y}" font-family="monospace" font-size="${sz}" fill="${c}">${txt}</text>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#0f1012"/><path d="${path}" stroke="#e8e6e1" stroke-opacity="0.07" stroke-width="0.8" fill="none"/>${dots}${t(110,44,'delve-graph')}${t(170,24,'who follows whom,','#b8b4ab')}${t(204,24,'two hops from one account','#b8b4ab')}${t(300,22,'172 accounts')}${t(336,22,'2,243 follows')}${t(372,22,'632 mutual pairs')}${t(408,22,'13 groups, Q 0.21')}${t(560,18,'miniphim · minomobi.com','#8fc1ff')}</svg>`;
fs.writeFileSync(process.argv[3], svg); console.log(svg.length, 'bytes');
