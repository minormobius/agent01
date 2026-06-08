// mappa/viewer.js — renders a generated world (engine.js) with the atlas
// projection (projection.js). Orb (native sphere, graticule + axial tilt),
// Mercator (true projection, VECTOR — crisp at any zoom), Tectonic (plates).
// Cells are precomputed once and drawn as polygons; labels are screen-space,
// constant size, decluttered.
import { generateWorld, BIOMES, setTriangulator } from './engine.js';
import { projectAtlas } from './projection.js';
import { SITES, WINGS } from './sites.js';

// Rust/WASM engine. v2 = the FULL generate_world (used as the canonical engine,
// higher resolution). v1 = triangulation only. Absent = pure-JS fallback.
let rustMod=null, rustGen=false;
async function initEngine(){try{const m=await import('./pkg/mappa_engine.js?v=6');await m.default('./pkg/mappa_engine_bg.wasm?v=6');const v=(m.engine_version?m.engine_version():0);
  if(v>=2){rustMod=m;rustGen=true;setTriangulator(xy=>m.triangulate_xy(xy))}
  else if(v>=1){setTriangulator(xy=>m.triangulate_xy(xy))}
}catch(e){rustGen=false}}
const GEN_N=()=>rustGen?16000:9000;
// unpack the Rust engine's flat CSR arrays into the world shape viewer/projection use
function unpackRust(o){const N=o.n,pos=o.positions;
  const V=new Array(N);for(let i=0;i<N;i++)V[i]=[pos[3*i],pos[3*i+1],pos[3*i+2]];
  const cv=o.cell_verts,co=o.cell_offsets,cells=new Array(N);
  for(let i=0;i<N;i++){const s=co[i],e=co[i+1],poly=new Array(e-s);for(let k=s;k<e;k++)poly[k-s]=[cv[3*k],cv[3*k+1],cv[3*k+2]];cells[i]=poly}
  const af=o.adj,ao=o.adj_offsets,adj=new Array(N);
  for(let i=0;i<N;i++){const s=ao[i],e=ao[i+1],a=new Array(e-s);for(let k=s;k<e;k++)a[k-s]=af[k];adj[i]=a}
  const rv=o.rivers,rivers=[];for(let k=0;k+7<rv.length;k+=8)rivers.push({a:[rv[k],rv[k+1],rv[k+2]],b:[rv[k+3],rv[k+4],rv[k+5]],w:rv[k+6],flow:rv[k+7]});
  const bd=o.bounds,bounds=[];for(let k=0;k+6<bd.length;k+=7)bounds.push({a:[bd[k],bd[k+1],bd[k+2]],b:[bd[k+3],bd[k+4],bd[k+5]],c:bd[k+6]});
  const pp=o.plates_out,plates=[];for(let k=0;k+7<pp.length;k+=8)plates.push({center:[pp[k],pp[k+1],pp[k+2]],axis:[pp[k+3],pp[k+4],pp[k+5]],speed:pp[k+6],oceanic:pp[k+7]});
  const m=o.meta;
  return {N,V,cells,adj,elev:o.elev,water:o.water,plate:o.plate,plateType:o.plate_type,temperature:o.temperature,moisture:o.moisture,seasonality:o.seasonality,biome:o.biome,rivers,bounds,plates,
    meta:{seed:m.seed,N:m.n,plateCount:m.plate_count,oceanFraction:m.ocean_fraction,waterFrac:m.water_frac,seaCoverage:m.sea_coverage,axialTilt:m.axial_tilt,axialTiltDeg:m.axial_tilt_deg,solar:m.solar,planetRadius:m.planet_radius,age:m.age,ageSpan:m.age_span}};
}

const cv=document.getElementById('map'), ctx=cv.getContext('2d');
const tip=document.getElementById('tip'), legendEl=document.getElementById('legend'), tkey=document.getElementById('tkey'), statusEl=document.getElementById('status');
let DPR=Math.min(2,devicePixelRatio||1), W=0,H=0, seed=(Math.random()*1e9)|0;
let world=null, atlas=null, mode='orb', atlasOn=true;
const genome={oceanFraction:null,axialTilt:null,waterFrac:null,plateCount:null,solar:null,planetRadius:null,age:null}; // null = derive from seed
const pinned=new Set();
let orbR=320,spin=true,spinRAF=0,R=[[1,0,0],[0,1,0],[0,0,1]]; // orb orientation matrix (free trackball)
let driftT=0.5; // tectonic drift interval (how far back the plate trails reach)
let mview={x:0,y:0,s:1};
let MW=1400,MH=1100,S=1,ox=0,oy=0;
let cellPoly=[], cellFill=[], cellBase=[], rivMerc=[], bordMerc=[], roadMerc=[], countryBordMerc=[]; // precomputed geometry/colour

const LABEL_PX=11;
const hsl=(h,s,l,a)=>'hsl('+h+' '+s+'% '+l+'%'+(a!=null?' / '+a:'')+')';
const wing=id=>WINGS.find(w=>w.id===id);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function mMul(A,B){const r=[[0,0,0],[0,0,0],[0,0,0]];for(let i=0;i<3;i++)for(let j=0;j<3;j++)r[i][j]=A[i][0]*B[0][j]+A[i][1]*B[1][j]+A[i][2]*B[2][j];return r}
function mV(M,v){return[M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]]}
function mVT(M,v){return[M[0][0]*v[0]+M[1][0]*v[1]+M[2][0]*v[2],M[0][1]*v[0]+M[1][1]*v[1]+M[2][1]*v[2],M[0][2]*v[0]+M[1][2]*v[1]+M[2][2]*v[2]]}
const RX=a=>{const c=Math.cos(a),s=Math.sin(a);return[[1,0,0],[0,c,-s],[0,s,c]]};
const RY=a=>{const c=Math.cos(a),s=Math.sin(a);return[[c,0,s],[0,1,0],[-s,0,c]]};
const RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return[[c,-s,0],[s,c,0],[0,0,1]]};
function orbV(v){return mV(R,v)}
const CLAT=1.40,YMAX=Math.log(Math.tan(Math.PI/4+CLAT/2));
function lonlat(v){return[Math.atan2(v[1],v[0]),Math.asin(Math.max(-1,Math.min(1,v[2])))]}
function mxy(v){const ll=lonlat(v),la=Math.max(-CLAT,Math.min(CLAT,ll[1]));return[(ll[0]+Math.PI)/(2*Math.PI)*MW,(YMAX-Math.log(Math.tan(Math.PI/4+la/2)))/(2*YMAX)*MH]}
function projV(v){ // unit vector → screen {x,y}, mode-aware, null if not visible
  if(mode==='orb'){const q=orbV(v);if(q[2]<=0.035)return null;return{x:W/2+orbR*q[0],y:H/2-orbR*q[1]}}
  const m=mxy(v),x=mview.x+mview.s*(ox+m[0]*S),y=mview.y+mview.s*(oy+m[1]*S);if(x<-60||x>W+60||y<-40||y>H+40)return null;return{x,y}}

function genJS(g){return generateWorld(seed,{N:rustGen?9000:GEN_N(),oceanFraction:g.oceanFraction??undefined,axialTilt:g.axialTilt??undefined,waterFrac:g.waterFrac??undefined,plateCount:g.plateCount??undefined,solar:g.solar??1.0,planetRadius:g.planetRadius??undefined,age:g.age??undefined})}
function build(){const g=genome;let w=null;
  if(rustGen){try{w=unpackRust(rustMod.generate_world(seed>>>0,GEN_N(),g.oceanFraction??-1,g.axialTilt??-1,g.waterFrac??-1,g.plateCount??0,g.solar??1.0,g.planetRadius??-1,g.age??0,EMPTY))}catch(e){console.warn('mappa: Rust engine failed, JS fallback',e);w=null}}
  world=w||genJS(g);driftT=(world.meta&&world.meta.ageSpan)||0.5;
  atlas=projectAtlas(world,WINGS,SITES);R=mMul(RZ(world.meta.axialTilt),RX(0.5)); // start tilted so the poles show
  MH=Math.round(MW*YMAX/Math.PI);precomputeGeom();recolor();fit();buildLegend();syncSliders();draw()}
const EMPTY=new Float64Array(0);
// feature points to refine: coastlines + high mountains + river lines (subsampled)
function featurePointsOf(w){const pts=[];
  for(let i=0;i<w.N;i++){if(w.water[i]===0){let c=false;for(const j of w.adj[i])if(w.water[j]===1){c=true;break}
    if(c||w.elev[i]>0.5)pts.push(w.V[i])}} // coasts + mountains
  for(const r of w.rivers)pts.push(r.a);   // river channels
  const MAX=1900,step=Math.max(1,Math.ceil(pts.length/MAX)),out=[];
  for(let i=0;i<pts.length;i+=step){const p=pts[i];out.push(p[0],p[1],p[2])}
  return new Float64Array(out)}
function refineDetail(){if(!world)return;const cp=featurePointsOf(world);if(!cp.length)return;
  if(statusEl){statusEl.textContent='refining detail…';statusEl.style.opacity=1}
  // PROGRESSIVE: each refine grows the base resolution past the present world, so
  // repeated clicks keep climbing (capped) — the gradient injection then concentrates
  // the new budget right on the feature borders.
  const RN=Math.min(60000,Math.max(GEN_N(),world.N||0));
  setTimeout(()=>{const g=genome;let w=null;
    if(rustGen){try{w=unpackRust(rustMod.generate_world(seed>>>0,RN,g.oceanFraction??-1,g.axialTilt??-1,g.waterFrac??-1,g.plateCount??0,g.solar??1.0,g.planetRadius??-1,g.age??0,cp))}catch(e){console.warn('refine failed',e);w=null}}
    if(!w)w=generateWorld(seed,{N:RN,oceanFraction:g.oceanFraction??undefined,axialTilt:g.axialTilt??undefined,waterFrac:g.waterFrac??undefined,plateCount:g.plateCount??undefined,solar:g.solar??1.0,planetRadius:g.planetRadius??undefined,age:g.age??undefined,refinePoints:cp,refinePer:6});
    world=w;driftT=(world.meta&&world.meta.ageSpan)||0.5;atlas=projectAtlas(world,WINGS,SITES);R=mMul(RZ(world.meta.axialTilt),RX(0.5));
    MH=Math.round(MW*YMAX/Math.PI);precomputeGeom();recolor();fit();buildLegend();syncSliders();draw();
    if(statusEl)statusEl.style.opacity=0;},20)}
function fit(){S=Math.max(W/MW,H/MH);ox=(W-MW*S)/2;oy=(H-MH*S)/2}

function cellHSL(i){const b=BIOMES[world.biome[i]];let h=b.h,s=b.s,l=b.l;
  if(world.water[i]===0&&atlasOn){const wi=atlas.region[i];if(wi>=0){const w=WINGS[wi];if(!active.has(w.id)){s=Math.max(4,s*0.4);l=l*0.7+10}else{h=h+((w.hue-h+540)%360-180)*0.22;s=Math.min(70,s+8)}}}
  return[h,s,l]}
function shadeOf(i){if(world.water[i]!==0)return 0;let eR=world.elev[i],best=-2;for(const j of world.adj[i]){const d=world.V[j][0]-world.V[i][0];if(d>best){best=d;eR=world.elev[j]}}return Math.max(-0.16,Math.min(0.16,(world.elev[i]-eR)*1.2))}

// ---- precompute cell polygons in Mercator (MW×MH) space, once per world ------
function precomputeGeom(){const N=world.N;cellPoly=new Array(N);
  for(let i=0;i<N;i++){const verts=world.cells[i];let sx=0,sy=0;for(const v of verts){const ll=lonlat(v);sx+=Math.cos(ll[0]);sy+=Math.sin(ll[0])}const ml=Math.atan2(sy,sx);
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    const pts=verts.map(v=>{const ll=lonlat(v),la=Math.max(-CLAT,Math.min(CLAT,ll[1]));let lo=ml+Math.atan2(Math.sin(ll[0]-ml),Math.cos(ll[0]-ml));const mx=(lo+Math.PI)/(2*Math.PI)*MW,my=(YMAX-Math.log(Math.tan(Math.PI/4+la/2)))/(2*YMAX)*MH;if(mx<x0)x0=mx;if(mx>x1)x1=mx;if(my<y0)y0=my;if(my>y1)y1=my;return[mx,my]});
    cellPoly[i]={pts,bb:[x0,y0,x1,y1],wrap:x0<0?MW:(x1>MW?-MW:0)}}
  rivMerc=world.rivers.map(r=>{const a=mxy(r.a),b=mxy(r.b);return{a,b,w:r.w,skip:Math.abs(a[0]-b[0])>MW*0.5}});
  bordMerc=[];for(let i=0;i<N;i++){if(atlas.region[i]<0)continue;for(const j of world.adj[i])if(j>i&&atlas.region[j]>=0&&atlas.region[j]!==atlas.region[i]){const a=mxy(world.V[i]),b=mxy(world.V[j]);if(Math.abs(a[0]-b[0])>MW*0.5)continue;bordMerc.push([a,b])}}
  roadMerc=(atlas.roads||[]).map(([i,j])=>{const a=mxy(world.V[i]),b=mxy(world.V[j]);return{a,b,skip:Math.abs(a[0]-b[0])>MW*0.5}});
  countryBordMerc=[];const cof=atlas.countryOf;if(cof)for(let i=0;i<N;i++){const ci=cof[i];if(ci<0)continue;for(const j of world.adj[i]){const cj=cof[j];if(j>i&&cj>=0&&cj!==ci){const a=mxy(world.V[i]),b=mxy(world.V[j]);if(Math.abs(a[0]-b[0])>MW*0.5)continue;countryBordMerc.push([a,b])}}}
}
const CIV_SEA=[206,40,40];
function recolor(){const N=world.N;cellFill=new Array(N);cellBase=new Array(N);
  for(let i=0;i<N;i++){
    if(mode==='tectonic'){const p=world.plate[i];cellFill[i]=world.plateType[i]===0?hsl((p*47)%360,24,world.water[i]?30:46):hsl(210,30,24+(p%4)*3);cellBase[i]=[0,0,0];continue}
    if(mode==='civ'){ // SOVEREIGNTY: one flat sea, land coloured by country (civilisation hue family)
      if(world.water[i]!==0){cellFill[i]=hsl(...CIV_SEA);cellBase[i]=CIV_SEA;continue}
      const ci=atlas.countryOf&&atlas.countryOf[i];
      if(ci>=0){const co=atlas.countries[ci],act=active.has(co.wing),l0=(act?53:33)+co.lo,s0=act?32:8,sh=shadeOf(i);
        cellFill[i]=hsl(co.hue,s0,Math.max(8,Math.min(92,l0+sh*28)));cellBase[i]=[co.hue,s0,l0]}
      else{cellFill[i]=hsl(40,6,40);cellBase[i]=[40,6,40]}
      continue}
    const c=cellHSL(i);cellBase[i]=c;let lm=c[2];if(world.water[i]===0)lm=Math.max(4,Math.min(96,c[2]+shadeOf(i)*45));cellFill[i]=hsl(c[0],c[1],lm)}
}
function tracePoly(pts,dx){ctx.beginPath();ctx.moveTo(pts[0][0]+dx,pts[0][1]);for(let k=1;k<pts.length;k++)ctx.lineTo(pts[k][0]+dx,pts[k][1]);ctx.closePath()}

// ---- Mercator / Tectonic: VECTOR render, viewport-culled ---------------------
function draw(){if(mode==='orb'){drawOrb();return}
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle=mode==='tectonic'?'#11161c':'#0c1a22';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(mview.x,mview.y);ctx.scale(mview.s,mview.s);ctx.translate(ox,oy);ctx.scale(S,S);
  const inv=(sx,sy)=>[((sx-mview.x)/mview.s-ox)/S,((sy-mview.y)/mview.s-oy)/S];
  const a=inv(0,0),b=inv(W,H),vx0=Math.min(a[0],b[0])-20,vx1=Math.max(a[0],b[0])+20,vy0=Math.min(a[1],b[1])-20,vy1=Math.max(a[1],b[1])+20;
  const px=k=>k/(mview.s*S); // k screen-px → world units
  const kLo=Math.floor(vx0/MW), kHi=Math.floor(vx1/MW); // world copies → seamless Mercator cylinder
  for(let kk=kLo;kk<=kHi;kk++){const off=kk*MW, wx0=vx0-off, wx1=vx1-off;
    ctx.save();ctx.translate(off,0);
    for(let i=0;i<world.N;i++){const g=cellPoly[i],bb=g.bb;if(bb[2]<wx0||bb[0]>wx1||bb[3]<vy0||bb[1]>vy1)continue;ctx.fillStyle=cellFill[i];tracePoly(g.pts,0);ctx.fill()}
    if(mode==='tectonic'){ctx.lineCap='round';for(const bd of world.bounds){const p=mxy(bd.a),q=mxy(bd.b);if(Math.abs(p[0]-q[0])>MW*0.5)continue;ctx.lineWidth=px(bd.c>0.18?2.4:1.6);ctx.strokeStyle=bd.c>0.18?'#e0603c':(bd.c<-0.18?'#3fb6a0':'#d8b24a');ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke()}}
    else{ctx.strokeStyle='#3a6f8c';ctx.lineCap='round';for(const r of rivMerc){if(r.skip)continue;ctx.lineWidth=px(0.5+r.w*0.55);ctx.beginPath();ctx.moveTo(r.a[0],r.a[1]);ctx.lineTo(r.b[0],r.b[1]);ctx.stroke()}
      if(mode==='civ'&&atlasOn){ // sovereignty: country borders (thin) + civilisation borders (thick) + roads
        ctx.strokeStyle='rgba(22,15,9,.42)';ctx.lineWidth=px(0.8);ctx.beginPath();for(const e of countryBordMerc){ctx.moveTo(e[0][0],e[0][1]);ctx.lineTo(e[1][0],e[1][1])}ctx.stroke();
        ctx.strokeStyle='rgba(12,7,3,.72)';ctx.lineWidth=px(2.2);ctx.beginPath();for(const e of bordMerc){ctx.moveTo(e[0][0],e[0][1]);ctx.lineTo(e[1][0],e[1][1])}ctx.stroke();
        ctx.strokeStyle='rgba(58,28,10,.85)';ctx.lineCap='round';ctx.lineWidth=px(1.4);ctx.beginPath();for(const r of roadMerc){if(r.skip)continue;ctx.moveTo(r.a[0],r.a[1]);ctx.lineTo(r.b[0],r.b[1])}ctx.stroke();
      } else if(atlasOn){ctx.strokeStyle='rgba(20,12,6,.55)';ctx.lineWidth=px(1.2);ctx.beginPath();for(const e of bordMerc){ctx.moveTo(e[0][0],e[0][1]);ctx.lineTo(e[1][0],e[1][1])}ctx.stroke()}}
    ctx.restore();}
  ctx.restore();
  if(mode==='tectonic')drawDrift();
  renderAtlasOverlay();
}
// rotate unit vector v about unit axis a by angle phi (Rodrigues) — plate Euler motion
function rotAxis(v,a,phi){const c=Math.cos(phi),s=Math.sin(phi),d=a[0]*v[0]+a[1]*v[1]+a[2]*v[2];
  return[v[0]*c+(a[1]*v[2]-a[2]*v[1])*s+a[0]*d*(1-c),v[1]*c+(a[2]*v[0]-a[0]*v[2])*s+a[1]*d*(1-c),v[2]*c+(a[0]*v[1]-a[1]*v[0])*s+a[2]*d*(1-c)]}
function drawDrift(){const T=driftT,STEPS=16; // how far each plate centre has drifted along its Euler rotation
  for(const pl of world.plates){const th=pl.speed*T; // radians of rotation over the interval
    ctx.strokeStyle=pl.oceanic?'rgba(120,180,210,.85)':'rgba(233,220,192,.9)';ctx.lineWidth=2;ctx.beginPath();let started=false,prev=null;
    for(let k=0;k<=STEPS;k++){const q=projVm(rotAxis(pl.center,pl.axis,-th*(1-k/STEPS)));
      if(prev&&Math.abs(q.x-prev.x)>W*0.5)started=false;
      if(!started){ctx.moveTo(q.x,q.y);started=true}else ctx.lineTo(q.x,q.y);prev=q}
    ctx.stroke();
    const now=projVm(pl.center),back=projVm(rotAxis(pl.center,pl.axis,-th/STEPS)),an=Math.atan2(now.y-back.y,now.x-back.x);
    if(Math.abs(now.x-back.x)<W*0.5){ctx.beginPath();ctx.moveTo(now.x,now.y);ctx.lineTo(now.x-8*Math.cos(an-0.45),now.y-8*Math.sin(an-0.45));ctx.moveTo(now.x,now.y);ctx.lineTo(now.x-8*Math.cos(an+0.45),now.y-8*Math.sin(an+0.45));ctx.stroke()}
    const o=projVm(rotAxis(pl.center,pl.axis,-th));ctx.fillStyle='rgba(150,120,80,.55)';ctx.beginPath();ctx.arc(o.x,o.y,2.4,0,7);ctx.fill()}}
function projVm(v){const m=mxy(v);return{x:mview.x+mview.s*(ox+m[0]*S),y:mview.y+mview.s*(oy+m[1]*S)}}

// ---- Orb (native sphere) -----------------------------------------------------
const LIGHT=(()=>{const v=[-0.5,0.55,0.66],l=Math.hypot(...v);return v.map(c=>c/l)})();
function drawOrb(){ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#05070a';ctx.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2,R=orbR;ctx.beginPath();ctx.arc(cx,cy,R+1,0,7);ctx.fillStyle='#081820';ctx.fill();
  const front=[];for(let i=0;i<world.N;i++){const n=orbV(world.V[i]);if(n[2]>0.02)front.push([i,n])}front.sort((a,b)=>a[1][2]-b[1][2]);
  for(const[i,n]of front){const c=world.cells[i],nd=Math.max(0,n[0]*LIGHT[0]+n[1]*LIGHT[1]+n[2]*LIGHT[2]);
    let[h,s,l]=cellBase[i];if(world.water[i]===0){l=Math.max(4,Math.min(96,l*(0.62+0.5*nd)+shadeOf(i)*40))}else l=l*(0.6+0.55*nd);
    ctx.fillStyle=hsl(h,s,l);ctx.beginPath();let st=false;for(const v of c){const q=orbV(v),sx=cx+R*q[0],sy=cy-R*q[1];if(!st){ctx.moveTo(sx,sy);st=true}else ctx.lineTo(sx,sy)}ctx.closePath();ctx.fill()}
  ctx.strokeStyle='#3a6f8c';ctx.lineCap='round';for(const r of world.rivers){const a=orbV(r.a),b=orbV(r.b);if(a[2]<=0.02||b[2]<=0.02)continue;ctx.lineWidth=r.w*0.6;ctx.beginPath();ctx.moveTo(cx+R*a[0],cy-R*a[1]);ctx.lineTo(cx+R*b[0],cy-R*b[1]);ctx.stroke()}
  drawGraticule(cx,cy,R);
  const g=ctx.createRadialGradient(cx-R*0.3,cy-R*0.35,R*0.1,cx,cy,R);g.addColorStop(0,'rgba(255,250,235,.10)');g.addColorStop(.7,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.45)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fill();
  renderAtlasOverlay();
}
function drawGraticule(cx,cy,R){
  for(const latDeg of[0,30,-30,60,-60]){const la=latDeg*Math.PI/180;ctx.strokeStyle=latDeg===0?'rgba(255,250,235,.20)':'rgba(255,250,235,.09)';ctx.lineWidth=latDeg===0?1.2:1;ctx.beginPath();let st=false;
    for(let k=0;k<=72;k++){const lo=k/72*2*Math.PI,v=[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)],q=orbV(v);if(q[2]>0.02){const x=cx+R*q[0],y=cy-R*q[1];if(!st){ctx.moveTo(x,y);st=true}else ctx.lineTo(x,y)}else st=false}ctx.stroke()}
  for(let mlon=0;mlon<360;mlon+=30){const lo=mlon*Math.PI/180;ctx.strokeStyle='rgba(255,250,235,.07)';ctx.lineWidth=1;ctx.beginPath();let st=false;
    for(let k=0;k<=48;k++){const la=-Math.PI/2+k/48*Math.PI,v=[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)],q=orbV(v);if(q[2]>0.02){const x=cx+R*q[0],y=cy-R*q[1];if(!st){ctx.moveTo(x,y);st=true}else ctx.lineTo(x,y)}else st=false}ctx.stroke()}
  for(const[pole,lab]of[[[0,0,1],'N'],[[0,0,-1],'S']]){const q=orbV(pole),x=cx+R*q[0],y=cy-R*q[1];if(q[2]<=-0.2)continue;
    ctx.fillStyle=q[2]>0?'rgba(255,252,240,.95)':'rgba(255,252,240,.4)';ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill();
    ctx.font='bold 11px ui-sans-serif';ctx.textAlign='center';ctx.fillStyle=q[2]>0?'#fff':'rgba(255,255,255,.5)';ctx.fillText(lab,x,y-7)}
}

// ---- screen-space atlas overlay: constant-size dots + decluttered labels -----
function dotR(c){return(c.capital?3.2:2.0)+Math.min(5.5,Math.sqrt(c.k)*0.85)}
const overlaps=(b,arr)=>arr.some(o=>!(b[2]<o[0]||b[0]>o[2]||b[3]<o[1]||b[1]>o[3]));
// screen position(s) of a unit vector — multiple copies across the Mercator cylinder, one on the orb
function screenCopies(v){
  if(mode==='orb'){const q=orbV(v);if(q[2]<=0.035)return [];return [{x:W/2+orbR*q[0],y:H/2-orbR*q[1]}]}
  const m=mxy(v),baseX=mview.x+mview.s*(ox+m[0]*S),y=mview.y+mview.s*(oy+m[1]*S);if(y<-40||y>H+40)return [];
  const stepX=mview.s*S*MW,out=[],kLo=Math.ceil((-60-baseX)/stepX),kHi=Math.floor((W+60-baseX)/stepX);
  for(let k=kLo;k<=kHi;k++)out.push({x:baseX+k*stepX,y});return out}
function renderAtlasOverlay(){if(!atlasOn||mode==='tectonic')return;
  const placed=[];ctx.textAlign='center';ctx.textBaseline='alphabetic';
  for(const w of WINGS){if(!active.has(w.id))continue;const rk=atlas.wingRegion[w.id],cc=atlas.centroids[rk];if(!cc)continue;
    const txt=w.label.toUpperCase();ctx.font='italic 12px ui-serif,Georgia,serif';const tw=ctx.measureText(txt).width;
    for(const p of screenCopies(cc)){ctx.fillStyle='rgba(6,4,2,.55)';ctx.fillText(txt,p.x+0.5,p.y+0.5);ctx.fillStyle=hsl(w.hue,34,87,.62);ctx.fillText(txt,p.x,p.y);placed.push([p.x-tw/2-3,p.y-12,p.x+tw/2+3,p.y+3])}}
  const items=[];for(const c of atlas.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;
    for(const p of screenCopies(c.v))items.push({c,x:p.x,y:p.y,prio:(c.capital?5e5:0)+c.k+(c===hot?1e9:0)})}
  items.sort((a,b)=>b.prio-a.prio);
  for(const it of items){const c=it.c,w=wing(c.w),r=dotR(c);ctx.beginPath();ctx.arc(it.x,it.y,r,0,7);ctx.fillStyle=c.w2?hsl((w.hue+wing(c.w2).hue)/2,60,64):hsl(w.hue,60,hot===c?78:62);ctx.fill();
    ctx.lineWidth=c.capital?1.4:0.8;ctx.strokeStyle=c===hot?'#fff':'rgba(6,4,2,.8)';ctx.stroke();
    if(c.capital){ctx.strokeStyle=hsl(w.hue,65,85,.9);ctx.lineWidth=1;ctx.beginPath();ctx.arc(it.x,it.y,r+2.4,0,7);ctx.stroke()}}
  for(const it of items){const c=it.c,cap=c.capital,r=dotR(c),w=wing(c.w);ctx.font=(cap?'600 ':'')+LABEL_PX+'px ui-serif,Georgia,serif';const tw=ctx.measureText(c.n).width;
    const lx=it.x,ly=it.y+r+LABEL_PX-1,box=[lx-tw/2-2,ly-LABEL_PX,lx+tw/2+2,ly+2];
    if(c===hot||!overlaps(box,placed)){ctx.textAlign='center';ctx.fillStyle='rgba(6,4,2,.92)';ctx.fillText(c.n,lx+0.4,ly+0.4);ctx.fillStyle=hsl(w.hue,46,92);ctx.fillText(c.n,lx,ly);placed.push(box)}}
}
function orbSpin(){if(mode!=='orb'||!spin){spinRAF=0;return}R=mMul(R,RZ(0.0015));draw();spinRAF=requestAnimationFrame(orbSpin)} // spin about the planet's own pole

// ---- picking + tooltip -------------------------------------------------------
function pickCity(px,py,touch){if(!atlasOn)return null;let best=null,bd=1e18;
  for(const c of atlas.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;for(const p of screenCopies(c.v)){const d=(p.x-px)**2+(p.y-py)**2;if(d<bd){bd=d;best=c}}}return bd<(touch?22:13)**2?best:null}
function pickCell(px,py){let dir;
  if(mode==='orb'){const cx=W/2,cy=H/2,RR=orbR,nx=(px-cx)/RR,ny=-(py-cy)/RR,r2=nx*nx+ny*ny;if(r2>1)return -1;const nz=Math.sqrt(1-r2);dir=mVT(R,[nx,ny,nz])}
  else{const mx=((px-mview.x)/mview.s-ox)/S,my=((py-mview.y)/mview.s-oy)/S;const lon=mx/MW*2*Math.PI-Math.PI;const t=(1-my/MH*2)*YMAX;const lat=2*Math.atan(Math.exp(t))-Math.PI/2;const cl=Math.cos(lat);dir=[cl*Math.cos(lon),cl*Math.sin(lon),Math.sin(lat)]}
  let bi=-1,bd=-2;for(let i=0;i<world.N;i++){const d=dot(world.V[i],dir);if(d>bd){bd=d;bi=i}}return bi}
function showTip(px,py){tip.style.left=Math.max(80,Math.min(innerWidth-80,px))+'px';tip.style.top=Math.max(54,py)+'px';tip.style.opacity=1}
function tipCity(c,px,py,t){showTip(px,py);const seam=c.w2?'border · '+wing(c.w).label+' ✕ '+wing(c.w2).label:wing(c.w).label;
  tip.innerHTML='<b>'+c.n+'</b> '+(c.capital?'★':'')+'<br><span class="m">'+seam+' · founded '+(c.b||'—')+'</span>'+(c.u?'<br><span class="open">'+(t?'tap again to open ↗':'click to open ↗')+'</span>':'')}
function tipCell(i,px,py){if(i<0){tip.style.opacity=0;return}showTip(px,py);const b=BIOMES[world.biome[i]],T=world.temperature[i],M=world.moisture[i],e=world.elev[i],ws=world.seasonality[i];
  tip.innerHTML='<b>'+b.name+'</b><br><span class="m">'+(T|0)+'°C mean · winter −'+(ws*0.5|0)+'° · moisture '+(M*100|0)+'%<br>'+(world.water[i]?'sea':(Math.max(0,e)*4000|0)+' m')+'</span>'}

const cz=s=>Math.max(0.5,Math.min(40,s));
const ptrs=new Map();let gesture=null,tapStart=null;const di=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});spin=false;
  if(ptrs.size===1){tapStart={x:e.clientX,y:e.clientY,t:Date.now(),touch:e.pointerType!=='mouse'};gesture=mode==='orb'?{mode:'rot',x:e.clientX,y:e.clientY,R0:R}:{mode:'pan',x:e.clientX,y:e.clientY,vx:mview.x,vy:mview.y};cv.classList.add('drag')}
  else if(ptrs.size===2){const p=[...ptrs.values()];gesture={mode:'pinch',d:di(p[0],p[1]),s:mview.s,r:orbR,vx:mview.x,vy:mview.y};tapStart=null;tip.style.opacity=0}});
cv.addEventListener('pointermove',e=>{if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gesture&&gesture.mode==='pinch'&&ptrs.size>=2){const p=[...ptrs.values()],f=di(p[0],p[1])/(gesture.d||1);if(mode==='orb')orbR=Math.max(120,Math.min(2400,gesture.r*f));else{const ns=cz(gesture.s*f),cmx=(p[0].x+p[1].x)/2,cmy=(p[0].y+p[1].y)/2,rx=(cmx-gesture.vx)/gesture.s,ry=(cmy-gesture.vy)/gesture.s;mview.s=ns;mview.x=cmx-rx*ns;mview.y=cmy-ry*ns}draw();return}
  if(gesture&&gesture.mode==='rot'&&ptrs.size===1){const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;R=mMul(mMul(RX(dy*0.006),RY(dx*0.006)),gesture.R0);if(tapStart&&Math.hypot(dx,dy)>8)tapStart=null;draw();return}
  if(gesture&&gesture.mode==='pan'&&ptrs.size===1){mview.x=gesture.vx+(e.clientX-gesture.x);mview.y=gesture.vy+(e.clientY-gesture.y);if(tapStart&&Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>8){tapStart=null;tip.style.opacity=0}draw();return}
  if(e.pointerType==='mouse'&&ptrs.size===0){const c=pickCity(e.clientX,e.clientY);if(c!==hot){hot=c;draw()}
    if(c){tipCity(c,e.clientX,e.clientY,false);cv.style.cursor='pointer'}else{tipCell(pickCell(e.clientX,e.clientY),e.clientX,e.clientY);cv.style.cursor='grab'}}});
function endPtr(e){ptrs.delete(e.pointerId);
  if(ptrs.size===0){cv.classList.remove('drag');
    if(tapStart&&Date.now()-tapStart.t<400){const c=pickCity(tapStart.x,tapStart.y,tapStart.touch);
      if(c){if(!tapStart.touch){if(c.u)open(c.u,'_blank')}else if(selected===c&&c.u){open(c.u,'_blank')}else{selected=c;hot=c;tipCity(c,tapStart.x,tapStart.y,true);draw()}}
      else{selected=null;hot=null;if(tapStart.touch)tipCell(pickCell(tapStart.x,tapStart.y),tapStart.x,tapStart.y);else tip.style.opacity=0;draw()}}
    gesture=null;tapStart=null}
  else if(ptrs.size===1){const p=[...ptrs.values()][0];gesture=mode==='orb'?{mode:'rot',x:p.x,y:p.y,R0:R}:{mode:'pan',x:p.x,y:p.y,vx:mview.x,vy:mview.y};tapStart=null}}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY<0?1.12:1/1.12;if(mode==='orb')orbR=Math.max(120,Math.min(2400,orbR*f));else{const ns=cz(mview.s*f),rx=(e.clientX-mview.x)/mview.s,ry=(e.clientY-mview.y)/mview.s;mview.x=e.clientX-rx*ns;mview.y=e.clientY-ry*ns;mview.s=ns}draw()},{passive:false});

// ---- chrome ------------------------------------------------------------------
let hot=null,selected=null,query='',active=new Set(WINGS.map(w=>w.id)),tcut=1,playing=false;
document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;document.querySelectorAll('.modes button').forEach(x=>x.classList.toggle('on',x===b));
  tkey.classList.toggle('show',mode==='tectonic');tip.style.opacity=0;hot=selected=null;recolor();if(mode==='orb'){spin=true;if(!spinRAF)spinRAF=requestAnimationFrame(orbSpin)}else spin=false;buildLegend();draw()});
document.getElementById('atlas').onclick=e=>{atlasOn=!atlasOn;e.target.classList.toggle('on',atlasOn);recolor();buildLegend();draw()};
function regen(){if(statusEl){statusEl.textContent='forging world…';statusEl.style.opacity=1}setTimeout(()=>{build();if(statusEl)statusEl.style.opacity=0},20)}
document.getElementById('reseed').onclick=()=>{seed=(Math.random()*1e9)|0;regen()};
document.getElementById('q').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();draw()});
const tEl=document.getElementById('time'),eraEl=document.getElementById('era');
const eraLabel=()=>tcut>=1?'all founded':'↤ '+new Date(SITES.minB+(SITES.maxB-SITES.minB)*tcut).toISOString().slice(0,10);
tEl.addEventListener('input',()=>{tcut=+tEl.value/1000;eraEl.textContent=eraLabel();draw()});
document.getElementById('play').onclick=()=>{playing=!playing;if(playing){tcut=0;tEl.value=0;step()}};
function step(){if(!playing)return;tcut=Math.min(1,tcut+0.006);tEl.value=tcut*1000;eraEl.textContent=eraLabel();draw();if(tcut>=1){playing=false;document.getElementById('play').textContent='▶ chronicle';return}document.getElementById('play').textContent='⏸';requestAnimationFrame(step)}
function buildLegend(){legendEl.innerHTML='';if(mode==='tectonic')return;
  if(atlasOn){for(const w of WINGS){const c=document.createElement('span');c.className='chip';c.dataset.w=w.id;c.innerHTML='<span class="dot" style="background:'+hsl(w.hue,55,58)+'"></span>'+w.label;
    c.onclick=()=>{if(active.size===1&&active.has(w.id))active=new Set(WINGS.map(x=>x.id));else active=new Set([w.id]);for(const ch of legendEl.children)if(ch.dataset.w)ch.classList.toggle('off',!active.has(ch.dataset.w));recolor();draw()};legendEl.appendChild(c)}}
  else{const seen=new Set();for(let i=0;i<world.N;i++)seen.add(world.biome[i]);for(let bi=3;bi<BIOMES.length;bi++){if(!seen.has(bi))continue;const b=BIOMES[bi];const c=document.createElement('span');c.className='chip';c.style.cursor='default';c.innerHTML='<span class="dot" style="background:'+hsl(b.h,b.s,b.l)+'"></span>'+b.name;legendEl.appendChild(c)}}}
// --- map builder: the genome as sliders ---
const $=id=>document.getElementById(id);
const sliders=[
  ['solar',         $('sSolar'),  $('vSolar'),  v=>v.toFixed(2)+'×',     v=>+v,            m=>(m.solar??1)],
  ['axialTilt',     $('sTilt'),   $('vTilt'),   v=>v+'°',                v=>v*Math.PI/180, m=>m.axialTiltDeg],
  ['waterFrac',     $('sWater'),  $('vWater'),  v=>v+'% water',          v=>v/100,         m=>Math.round(m.waterFrac*100)],
  ['oceanFraction', $('sOcean'),  $('vOcean'),  v=>v+'% crust',          v=>v/100,         m=>Math.round(m.oceanFraction*100)],
  ['plateCount',    $('sPlates'), $('vPlates'), v=>v+' plates',          v=>v|0,           m=>m.plateCount],
  ['planetRadius',  $('sRadius'), $('vRadius'), v=>v.toFixed(2)+'×R⊕',    v=>+v,            m=>(m.planetRadius??1)],
  ['age',           $('sAge'),    $('vAge'),    v=>v+' epochs',          v=>v|0,           m=>(m.age??4)],
];
function syncSliders(){const m=world.meta;
  for(const [p,sl,vl,fmt,,fromMeta] of sliders){const lab=sl.closest('label');
    if(!pinned.has(p)){const mv=fromMeta(m);sl.value=mv;vl.textContent=fmt(+mv);lab.classList.remove('pin')}
    else{lab.classList.add('pin')}}
  $('bMeta').textContent='seed '+m.seed+' · '+(m.N/1000).toFixed(1)+'k · '+Math.round(m.seaCoverage*100)+'% sea';
}
let regenT=0;
for(const [p,sl,vl,fmt,toG] of sliders){
  sl.addEventListener('input',()=>{vl.textContent=fmt(+sl.value);sl.closest('label').classList.add('pin');pinned.add(p);genome[p]=toG(+sl.value);clearTimeout(regenT);regenT=setTimeout(regen,200)});
}
$('bAuto').onclick=()=>{pinned.clear();for(const k in genome)genome[k]=null;regen()};
$('builderToggle').onclick=()=>$('builder').classList.toggle('show');
const _br=document.getElementById('bRefine');if(_br)_br.onclick=refineDetail;
$('builderClose').onclick=()=>$('builder').classList.remove('show');

function resize(){DPR=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';orbR=Math.min(W,H)*0.42;if(world){fit();draw()}}
addEventListener('resize',resize);resize();initEngine().finally(()=>regen());

// kernel: mappa/pkg built by build-mappa-engine.yml (fast Delaunay, 15k cells)
