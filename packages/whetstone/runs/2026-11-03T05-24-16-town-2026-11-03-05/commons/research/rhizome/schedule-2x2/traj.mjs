import { sim, seedOf } from './clone.mjs';
const runs=20;
for (const [vn,o] of [['base',{}],['exempt',{exempt:true}]]) for (const cs of ['B','A3','C3']) for (const wm of ['clamp','linear']) {
  if (wm==='linear' && cs==='C3') continue;
  const at={100:[],250:[],500:[]}; let sa=0, ia=0;
  for (let r=0;r<runs;r++){ const m=sim(cs,seedOf(r),{...o,wmode:wm}); while(m.t<500){m.step(); if(at[m.t]){const c=m.cover(); at[m.t].push(c.sg+c.sb - (c.ig+c.ib));}}
    const c=m.cover(); if(c.sg+c.sb>0)sa++; if(c.ig+c.ib>0)ia++; }
  const mean=v=>(v.reduce((a,b)=>a+b)/v.length).toFixed(1);
  console.log(vn,cs,wm,'split-integ @100/250/500:',mean(at[100]),mean(at[250]),mean(at[500]),'alive s/i:',sa,ia);
}
