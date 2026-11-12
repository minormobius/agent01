const K=await import(new URL('../../../www/rhizome/kit/clone.mjs', import.meta.url).href);
const out=[];for(let r=1;r<=10;r++){const m=K.sim('B',K.seedOf(r));const row=[r];
for(const T of [500,2000,4000,8000]){while(m.t<T)m.step();const c=m.cover();row.push(`${T}:s${(c.sg+c.sb).toFixed(0)}/i${(c.ig+c.ib).toFixed(0)}`);}console.log(row.join(' '));}
