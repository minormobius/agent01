// biome/sprite/physics-proof.mjs — headless proof of the gravity-solved walker: step the rigid-body sim
// and render the reduced model (trunk skeleton + leg sticks + feet on the ground) at successive times,
// so the muscle-driven, gravity-loaded walk can be eyeballed without a browser.  node physics-proof.mjs [id]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from './bauplan.mjs';
import { solve } from './render.mjs';
import { growMuscles } from './myology.mjs';
import { makeWalker } from './physics.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ORG = JSON.parse(readFileSync(join(here, '../gacha/catalog.json'), 'utf8')).organisms;
const id = process.argv[2] || 'horse';
const sp = build(ORG[id]); const muscles = growMuscles(sp).muscles;
const W = solve(sp, 0);
const nonLeg = sp.segs.filter((s) => !s.leg).map((s) => ({ base: W[s.id].base, tip: W[s.id].tip, w: ((s.w0||1)+(s.w1||1))/2 }));
const walker = makeWalker(sp, muscles, {});
const restT = walker.restTrunk;

// fit
let minx=1e9,maxx=-1e9,miny=1e9; for(const s of nonLeg) for(const p of [s.base,s.tip]){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);miny=Math.min(miny,p.y);}
const FR=6, CELL=240, gy=CELL*0.82, scale=Math.min((CELL-40)/(maxx-minx), (CELL*0.6)/(walker.groundY-miny));
const f=(n)=>(+n).toFixed(2);
const xf=(p,tp)=>{ const dx=p.x-restT.x, dy=p.y-restT.y, c=Math.cos(tp.a), s=Math.sin(tp.a); return {x:tp.x+dx*c-dy*s, y:tp.y+dx*s+dy*c}; };

let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${FR*CELL}" height="${CELL}" viewBox="0 0 ${FR*CELL} ${CELL}"><rect width="100%" height="100%" fill="#0b120f"/>`;
let feet=[]; const x0=walker.trunkPos().x;
for(let k=0;k<FR;k++){
  const steps=k===0?2:Math.round((2*Math.PI/2.0)*60/FR)*2; // ~even over a stride
  let r; for(let i=0;i<steps;i++) r=walker.walkStep(1/120,{}); feet=r.feet;
  const tp=walker.trunkPos(); const S=scale, camX=tp.x;
  const W2S=(wx,wy)=>({x:(wx-camX)*S+CELL/2, y:(wy-walker.groundY)*S+gy});
  svg+=`<g transform="translate(${k*CELL} 0)"><rect x="2" y="2" width="${CELL-4}" height="${CELL-4}" fill="#0e1814" stroke="#27362f" rx="8"/>`;
  svg+=`<line x1="6" y1="${gy}" x2="${CELL-6}" y2="${gy}" stroke="#3a5446" stroke-width="2"/>`;
  for(const s of nonLeg){ const a=W2S(...vals(xf(s.base,tp))), b=W2S(...vals(xf(s.tip,tp))); svg+=`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="#5b6b63" stroke-width="${f(Math.max(0.8,s.w*S*0.7))}" stroke-linecap="round"/>`; }
  for(const L of walker.legs) for(const bi of [L.thigh,L.shank]){ const b=walker.bodies[bi]; const dx=Math.cos(b.a)*b.len/2, dy=Math.sin(b.a)*b.len/2; const p1=W2S(b.x-dx,b.y-dy), p2=W2S(b.x+dx,b.y+dy); svg+=`<line x1="${f(p1.x)}" y1="${f(p1.y)}" x2="${f(p2.x)}" y2="${f(p2.y)}" stroke="#7c8a82" stroke-width="${f(Math.max(1.5,5*S))}" stroke-linecap="round"/>`; }
  for(const ft of feet){ const sp2=W2S(ft.x,ft.y); svg+=`<circle cx="${f(sp2.x)}" cy="${f(sp2.y)}" r="3.5" fill="${ft.contact?'#d8b25a':'#5a6b62'}"/>`; }
  svg+=`<text x="10" y="${CELL-10}" fill="#7f9b8d" font-size="11" font-family="monospace">+${(tp.x-x0).toFixed(0)} · ${feet.filter(x=>x.contact).length}/4 down</text></g>`;
}
svg+=`</svg>`;
function vals(o){ return [o.x,o.y]; }
process.stdout.write(svg);
