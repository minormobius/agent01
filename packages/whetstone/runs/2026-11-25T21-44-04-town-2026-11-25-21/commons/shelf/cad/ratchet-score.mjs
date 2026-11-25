// ratchet-score.mjs — from engines/cad: node ../../shelf/cad/ratchet-score.mjs <asm.json> [step°]
// Scores a ratchet assembly from the same pose map as ratchet-map.mjs: peakLift (lowest lift cap that still lets the wheel go a tooth forward),
// mustReach (how far past -18° the wheel must go before the pawl can fall), slack after the drop, hold. — Morphyx, 10-25
// score.mjs <asm> <step> : peak lift needed to go forward a tooth, backlash, hold
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const src = JSON.parse(readFileSync(process.argv[2],'utf8')), st=+process.argv[3]||1;
const R=(a,b)=>{const o=[];for(let x=a;x<=b+1e-9;x+=st)o.push(+x.toFixed(3));return o};
if (![0,-18].every(v=>Number.isInteger((v+22)/st))) { console.error('step must land on 0 and -18 from -22 (use 1 or 2)'); process.exit(2); }
const turns=R(-22,6), lifts=R(0,18), tmp='/tmp/ratchet-score-'+process.pid+'.json';
const clear=(t,l)=>{const d=structuredClone(src);d.inputs.turn={...d.inputs.turn,min:t,max:t+1e-6,steps:2};d.inputs.lift={...d.inputs.lift,min:l,max:l+1e-6,steps:2};writeFileSync(tmp,JSON.stringify(d));let o;try{o=execFileSync('node',['agent/check.mjs',tmp,'--grid','--json'],{stdio:['ignore','pipe','ignore']})}catch(e){o=e.stdout}return !JSON.parse(o).pairs.some(p=>p.a!=='frame'&&p.b!=='frame'&&p.volume>0.01)};
const G=lifts.map(l=>turns.map(t=>clear(t,l)));
const j0=turns.indexOf(0);
const reachSet=(cap)=>{const s=new Set(['0,'+j0]),q=[[0,j0]];while(q.length){const[i,j]=q.shift();for(const[a,b]of[[1,0],[-1,0],[0,1],[0,-1]]){const I=i+a,J=j+b;if(lifts[I]<=cap&&G[I]?.[J]&&!s.has(I+','+J)){s.add(I+','+J);q.push([I,J])}}}return s};
const peak=lifts.find(c=>reachSet(c).has('0,'+turns.indexOf(-18)));
const all=reachSet(99);
// backlash: smallest |turn| beyond 18 needed before lift 0 is clear again past the tooth (first clear lift-0 cell left of the band)
let drop=null; for(let j=turns.indexOf(-18);j>=0;j--){ if(G[0][j]){drop=turns[j];} else break; }
const firstDrop = (()=>{ for (let j=j0-1;j>=0;j--) if (G[0][j] && !G[0][j+1]) return turns[j]; return null })();
const back=lifts.find((l,i)=>all.has(i+','+(turns.length-1)));
const holdOK = !lifts.some((l,i)=>l<=6&&all.has(i+','+(turns.length-1)));
const reachT=(T)=>{const s=new Set(['0,'+j0]),q=[[0,j0]];while(q.length){const[i,j]=q.shift();for(const[a,b]of[[1,0],[-1,0],[0,1],[0,-1]]){const I=i+a,J=j+b;if(turns[J]>=T&&G[I]?.[J]&&!s.has(I+','+J)){s.add(I+','+J);q.push([I,J])}}}return s};
const mustReach=[...turns].reverse().find(T=>T<=-18&&reachT(T).has('0,'+turns.indexOf(-18)));
let slack=0;for(let j=turns.indexOf(-18)+1;j<turns.length&&G[0][j];j++)slack+=st;
console.log(JSON.stringify({mustReach,slackAfterDrop:slack,peakLift:peak, pawlFallsAt:firstDrop, holds:holdOK, liftToRelease:back??'none'}));
