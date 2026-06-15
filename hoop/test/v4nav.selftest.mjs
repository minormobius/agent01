// v4nav.selftest.mjs — the v4 INTRACELL navigation contract. Mirrors the nav helpers in
// hoop/v4/index.html (wallClearance / clampOffWalls) and the exact-endpoint routing: a tap
// walks to the EXACT point inside a roomy chamber (not its centre), clamped onto open floor,
// and every route stays wall-clean (no stampede). Same substrate drives NPC movement.
// Run: node hoop/test/v4nav.selftest.mjs
import { ringLattice } from '../econ/region.js';
import { coarseSolve, solveRegion } from '../econ/record.js';
import { deckScene, buildWalk, walkRoute, losSimplify } from '../econ/deck.js';
const SEED=7, PX=280, AXSPAN=8;
const L = ringLattice({Ri:150,T:12,cell:2,regionsPerRing:30});
const record = coarseSolve({lattice:L,seed:SEED,axMin:0,axMax:5});
const az=record.hubs[0].az, ax=record.hubs[0].ax, gz=Math.floor(L.nz/2);
const solved = solveRegion({lattice:L,seed:SEED,grade:0.4,record,az,ax,axSpan:AXSPAN});
const d = deckScene({lattice:L,seed:SEED,record,az,ax,axSpan:AXSPAN,pxPerCell:PX,roomSpacing:PX*0.20,wallSpacing:PX*0.045,gz,solved});
const ws = (d.scene.wallSpacing||14)*4;
// replicate the page helpers
function wallClearance(v,x,y){let best=Infinity;for(const s of v.walls||[]){const ax=s[0],ay=s[1],dx=s[2]-ax,dy=s[3]-ay,L2=dx*dx+dy*dy||1;let t=((x-ax)*dx+(y-ay)*dy)/L2;t=t<0?0:t>1?1:t;const px=ax+dx*t,py=ay+dy*t,dd=(x-px)**2+(y-py)**2;if(dd<best)best=dd;}return Math.sqrt(best);}
function clampOffWalls(v,x,y,sx,sy){const band=(v.scene.wallSpacing||14)*0.9,step=band*0.9;let cx=x,cy=y;for(let i=0;i<10;i++){if(wallClearance(v,cx,cy)>=band)return{x:cx,y:cy};const dx=sx-cx,dy=sy-cy,Ln=Math.hypot(dx,dy);if(Ln<step)return{x:sx,y:sy};cx+=dx/Ln*step;cy+=dy/Ln*step;}return{x:cx,y:cy};}
function segCross(ax,ay,bx,by,cx,cy,dx,dy){const d1=(cx-ax)*(dy-ay)-(cy-ay)*(dx-ax),d2=(cx-bx)*(dy-by)-(cy-by)*(dx-bx),d3=(ax-cx)*(by-cy)-(ay-cy)*(bx-cx),d4=(ax-dx)*(by-dy)-(ay-dy)*(bx-dx);return((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));}
function pathCrossings(pts){let n=0;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dy=b[1]-a[1],ln=Math.hypot(dx,dy)||1,ux=dx/ln*1.2,uy=dy/ln*1.2,A=[a[0]+ux,a[1]+uy],B=[b[0]-ux,b[1]-uy];for(const w of d.walls)if(segCross(A[0],A[1],B[0],B[1],w[0],w[1],w[2],w[3]))n++;}return n;}

let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log((c?'✓':'✗')+' '+m);};

// (A) clampOffWalls: a point ON a wall membrane gets pushed to clearance >= band
let wallPt=null; for(const c of d.scene.paintCells){if(c.wall&&c.poly.length>2){wallPt=c.poly[0];break;}}
const band=(d.scene.wallSpacing||14)*0.9;
// find nearest chamber seed to that wall point
let bs=0,bd=Infinity; for(let i=0;i<d.nReal;i++){const p=d.seeds[i],dd=(p.x-wallPt[0])**2+(p.y-wallPt[1])**2;if(dd<bd){bd=dd;bs=i;}}
const before=wallClearance(d,wallPt[0],wallPt[1]); const cl=clampOffWalls(d,wallPt[0],wallPt[1],d.seeds[bs].x,d.seeds[bs].y);
ok(wallClearance(d,cl.x,cl.y)>=band-1e-6, `clampOffWalls pushes off wall (clearance ${before.toFixed(1)} -> ${wallClearance(d,cl.x,cl.y).toFixed(1)} >= ${band.toFixed(1)})`);

// (B) intracell: walk within a chamber to an OFFSET point — path is straight, ends AT the point, no wall cross
const seed=d.seeds[0]; const exact={x:seed.x+PX*0.3,y:seed.y+PX*0.2}; const cex=clampOffWalls(d,exact.x,exact.y,seed.x,seed.y);
const intp=losSimplify([[seed.x-PX*0.25,seed.y],[seed.x,seed.y],[cex.x,cex.y]], d.walls, ws);
const end=intp[intp.length-1];
ok(Math.hypot(end[0]-cex.x,end[1]-cex.y)<1, 'intracell route ENDS at the clamped tapped point (not the centre)');
ok(pathCrossings(intp)===0, 'intracell route crosses 0 walls');

// (C) cross-chamber route to an exact offset point: still wall-clean
let target=-1; for(let i=1;i<d.nReal;i++){const r=walkRoute(d,0,i); if(r&&r.pts.length>=3){target=i;break;}}
const r=walkRoute(d,0,target); const ts=d.seeds[target]; const tex=clampOffWalls(d,ts.x+PX*0.28,ts.y-PX*0.18,ts.x,ts.y);
const dense=r.pts.slice(); dense.push([tex.x,tex.y]); const full=losSimplify(dense, d.walls, ws);
ok(pathCrossings(full)===0, `cross-chamber route to exact point crosses 0 walls (${full.length} pts, chamber 0 -> ${target})`);
const fe=full[full.length-1]; ok(Math.hypot(fe[0]-tex.x,fe[1]-tex.y)<1,'cross-chamber route ENDS at the exact point');

// (D) NPC: replace walkRoute final centre with a clamped in-room point — stays wall-clean
const np=r.pts.slice(); const jt=clampOffWalls(d,ts.x+(0.2)*PX*0.55,ts.y-(0.2)*PX*0.55,ts.x,ts.y); np[np.length-1]=[jt.x,jt.y];
ok(pathCrossings(np)===0,'NPC intracell target keeps the walk wall-clean');

console.log(`\nnav.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
