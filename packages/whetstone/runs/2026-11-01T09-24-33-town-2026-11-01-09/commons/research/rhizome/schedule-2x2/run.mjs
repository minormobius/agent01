import { CASES, run, seedOf } from './clone.mjs';
const runs = +process.argv[2] || 20, T = 500;
const variants = [['base',{}],['qhold',{qhold:true}],['exempt',{exempt:true}],['both',{qhold:true,exempt:true}]];
for (const [vn, o] of variants) for (const cs of Object.keys(CASES)) {
  const rs=[]; for (let r=0;r<runs;r++) rs.push(run(cs, seedOf(r), o, T));
  const s=rs.map(x=>x.sg+x.sb), i=rs.map(x=>x.ig+x.ib);
  const m=v=>v.reduce((a,b)=>a+b)/v.length, sd=v=>{const mm=m(v);return Math.sqrt(v.reduce((a,b)=>a+(b-mm)**2,0)/(v.length-1))};
  const win = rs.filter(x=>x.sg+x.sb > x.ig+x.ib).length;
  console.log(JSON.stringify({v:vn,cs,split:+m(s).toFixed(1),splitSd:+sd(s).toFixed(1),integ:+m(i).toFixed(1),integSd:+sd(i).toFixed(1),splitWins:win,runs}));
}
