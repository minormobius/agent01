// mappa/viewer.js — renders a generated world (engine.js) with the atlas
// projection (projection.js) overlaid. Orb (native sphere, graticule + axial
// tilt), Mercator (true projection), Tectonic (plates). Labels are drawn in
// SCREEN space at constant size with greedy collision rejection.
import { generateWorld, BIOMES } from './engine.js';
import { projectAtlas } from './projection.js';
import { SITES, WINGS } from './sites.js';

const cv=document.getElementById('map'), ctx=cv.getContext('2d');
const tip=document.getElementById('tip'), legendEl=document.getElementById('legend'), tkey=document.getElementById('tkey');
let DPR=Math.min(2,devicePixelRatio||1), W=0,H=0, seed=(Math.random()*1e9)|0;
let world=null, atlas=null, mode='orb', atlasOn=true, tiltAngle=0.4;
let yaw=0.4,pitch=0.30,orbR=320,spin=true,spinRAF=0;
let mview={x:0,y:0,s:1};
const merc=document.createElement('canvas'); let MW=1400,MH=1100,S=1,ox=0,oy=0;
let hot=null,selected=null,query='',active=new Set(WINGS.map(w=>w.id)),tcut=1,playing=false;

const LABEL_PX=11;
const hsl=(h,s,l,a)=>'hsl('+h+' '+s+'% '+l+'%'+(a!=null?' / '+a:'')+')';
const wing=id=>WINGS.find(w=>w.id===id);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function rotp(p){const cy=Math.cos(yaw),sy=Math.sin(yaw),x1=cy*p[0]+sy*p[1],y1=-sy*p[0]+cy*p[1];const cp=Math.cos(pitch),sp=Math.sin(pitch);return[x1,cp*y1-sp*p[2],sp*y1+cp*p[2]]}
function roll(q){const c=Math.cos(tiltAngle),s=Math.sin(tiltAngle);return[q[0]*c-q[1]*s,q[0]*s+q[1]*c,q[2]]} // lean the spin axis by the world's axial tilt
function orbV(v){return roll(rotp(v))} // full orb transform
const CLAT=1.40,YMAX=Math.log(Math.tan(Math.PI/4+CLAT/2));
function lonlat(v){return[Math.atan2(v[1],v[0]),Math.asin(Math.max(-1,Math.min(1,v[2])))]}
function mxy(v){const ll=lonlat(v),la=Math.max(-CLAT,Math.min(CLAT,ll[1]));return[(ll[0]+Math.PI)/(2*Math.PI)*MW,(YMAX-Math.log(Math.tan(Math.PI/4+la/2)))/(2*YMAX)*MH]}

// unit vector → screen {x,y} (mode-aware), or null if not visible/front
function projV(v){
  if(mode==='orb'){const q=orbV(v);if(q[2]<=0.035)return null;return{x:W/2+orbR*q[0],y:H/2-orbR*q[1],z:q[2]}}
  const m=mxy(v);const x=mview.x+mview.s*(ox+m[0]*S),y=mview.y+mview.s*(oy+m[1]*S);
  if(x<-60||x>W+60||y<-40||y>H+40)return null;return{x,y,z:1}}

function build(){world=generateWorld(seed);atlas=projectAtlas(world,WINGS,SITES);tiltAngle=world.meta.axialTilt;MH=Math.round(MW*YMAX/Math.PI);fit();renderMerc();draw()}
function fit(){S=Math.max(W/MW,H/MH);ox=(W-MW*S)/2;oy=(H-MH*S)/2}

function cellHSL(i){const b=BIOMES[world.biome[i]];let h=b.h,s=b.s,l=b.l;
  if(world.water[i]===0&&atlasOn){const wi=atlas.region[i];if(wi>=0){const w=WINGS[wi];if(!active.has(w.id)){s=Math.max(4,s*0.4);l=l*0.7+10}else{h=h+((w.hue-h+540)%360-180)*0.22;s=Math.min(70,s+8)}}}
  return[h,s,l]}
function shadeOf(i){if(world.water[i]!==0)return 0;let eR=world.elev[i],best=-2;for(const j of world.adj[i]){const d=world.V[j][0]-world.V[i][0];if(d>best){best=d;eR=world.elev[j]}}return Math.max(-0.16,Math.min(0.16,(world.elev[i]-eR)*1.2))}

// ---- Mercator offscreen (terrain only; labels are a screen-space overlay) ----
function mpath(g,verts){let sx=0,sy=0;for(const v of verts){const ll=lonlat(v);sx+=Math.cos(ll[0]);sy+=Math.sin(ll[0])}const ml=Math.atan2(sy,sx);
  const pts=verts.map(v=>{const ll=lonlat(v),la=Math.max(-CLAT,Math.min(CLAT,ll[1]));let lo=ml+Math.atan2(Math.sin(ll[0]-ml),Math.cos(ll[0]-ml));return[(lo+Math.PI)/(2*Math.PI)*MW,(YMAX-Math.log(Math.tan(Math.PI/4+la/2)))/(2*YMAX)*MH]});
  const minx=Math.min(...pts.map(p=>p[0])),maxx=Math.max(...pts.map(p=>p[0]));
  const draw=dx=>{g.beginPath();g.moveTo(pts[0][0]+dx,pts[0][1]);for(let k=1;k<pts.length;k++)g.lineTo(pts[k][0]+dx,pts[k][1]);g.closePath()};
  return{draw,wrap:minx<0?MW:(maxx>MW?-MW:0)}}
function renderMerc(){merc.width=MW;merc.height=MH;const g=merc.getContext('2d');
  if(mode==='tectonic'){g.fillStyle='#11161c';g.fillRect(0,0,MW,MH);
    for(let i=0;i<world.N;i++){const c=world.cells[i],p=world.plate[i];g.fillStyle=world.plateType[i]===0?hsl((p*47)%360,24,world.water[i]?30:46):hsl(210,30,24+(p%4)*3);const m=mpath(g,c);m.draw(0);g.fill();if(m.wrap){m.draw(m.wrap);g.fill()}}
    g.lineCap='round';for(const bd of world.bounds){const a=mxy(bd.a),b=mxy(bd.b);if(Math.abs(a[0]-b[0])>MW*0.5)continue;g.lineWidth=bd.c>0.18?2.6:1.8;g.strokeStyle=bd.c>0.18?'#e0603c':(bd.c<-0.18?'#3fb6a0':'#d8b24a');g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke()}
    return}
  g.fillStyle='#0c1a22';g.fillRect(0,0,MW,MH);
  for(let i=0;i<world.N;i++){const c=world.cells[i],[h,s,l]=cellHSL(i);g.fillStyle=hsl(h,s,l);const m=mpath(g,c);m.draw(0);g.fill();if(m.wrap){m.draw(m.wrap);g.fill()}
    if(world.water[i]===0){const sh=shadeOf(i);if(Math.abs(sh)>0.02){g.fillStyle=sh>0?'rgba(255,248,230,'+sh+')':'rgba(0,0,0,'+(-sh)+')';m.draw(0);g.fill();if(m.wrap){m.draw(m.wrap);g.fill()}}}}
  g.strokeStyle='#3a6f8c';g.lineCap='round';for(const r of world.rivers){const a=mxy(r.a),b=mxy(r.b);if(Math.abs(a[0]-b[0])>MW*0.5)continue;g.lineWidth=r.w;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke()}
  if(atlasOn){g.strokeStyle='rgba(20,12,6,.5)';g.lineWidth=1.4;g.beginPath();for(let i=0;i<world.N;i++){if(atlas.region[i]<0)continue;for(const j of world.adj[i])if(j>i&&atlas.region[j]>=0&&atlas.region[j]!==atlas.region[i]){const a=mxy(world.V[i]),b=mxy(world.V[j]);if(Math.abs(a[0]-b[0])>MW*0.5)continue;g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1])}}g.stroke()}
}

function draw(){if(mode==='orb'){drawOrb();return}
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#070a0c';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(mview.x,mview.y);ctx.scale(mview.s,mview.s);ctx.imageSmoothingEnabled=true;
  ctx.drawImage(merc,0,0,MW,MH,ox,oy,MW*S,MH*S);ctx.restore();
  if(mode==='tectonic'){for(const pl of world.plates){const vv=[pl.axis[1]*pl.center[2]-pl.axis[2]*pl.center[1],pl.axis[2]*pl.center[0]-pl.axis[0]*pl.center[2],pl.axis[0]*pl.center[1]-pl.axis[1]*pl.center[0]];
    const sp=projVm(pl.center),tg=projVm([pl.center[0]+vv[0]*0.12,pl.center[1]+vv[1]*0.12,pl.center[2]+vv[2]*0.12]);if(!sp||!tg||Math.abs(sp.x-tg.x)>W*0.5)continue;
    ctx.strokeStyle=pl.oceanic?'rgba(120,180,210,.85)':'rgba(233,220,192,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sp.x,sp.y);ctx.lineTo(tg.x,tg.y);ctx.stroke();
    const an=Math.atan2(tg.y-sp.y,tg.x-sp.x);ctx.beginPath();ctx.moveTo(tg.x,tg.y);ctx.lineTo(tg.x-7*Math.cos(an-0.4),tg.y-7*Math.sin(an-0.4));ctx.moveTo(tg.x,tg.y);ctx.lineTo(tg.x-7*Math.cos(an+0.4),tg.y-7*Math.sin(an+0.4));ctx.stroke()}}
  renderAtlasOverlay();
}
function projVm(v){const m=mxy(v);return{x:mview.x+mview.s*(ox+m[0]*S),y:mview.y+mview.s*(oy+m[1]*S)}}

const LIGHT=(()=>{const v=[-0.5,0.55,0.66],l=Math.hypot(...v);return v.map(c=>c/l)})();
function drawOrb(){ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#05070a';ctx.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2,R=orbR;ctx.beginPath();ctx.arc(cx,cy,R+1,0,7);ctx.fillStyle='#081820';ctx.fill();
  const front=[];for(let i=0;i<world.N;i++){const n=orbV(world.V[i]);if(n[2]>0.02)front.push([i,n])}front.sort((a,b)=>a[1][2]-b[1][2]);
  for(const[i,n]of front){const c=world.cells[i],nd=Math.max(0,n[0]*LIGHT[0]+n[1]*LIGHT[1]+n[2]*LIGHT[2]);
    let[h,s,l]=cellHSL(i);if(world.water[i]===0){const sh=shadeOf(i);l=Math.max(4,Math.min(96,l*(0.62+0.5*nd)+sh*40))}else l=l*(0.6+0.55*nd);
    ctx.fillStyle=hsl(h,s,l);ctx.beginPath();let st=false;for(const v of c){const q=orbV(v),sx=cx+R*q[0],sy=cy-R*q[1];if(!st){ctx.moveTo(sx,sy);st=true}else ctx.lineTo(sx,sy)}ctx.closePath();ctx.fill()}
  ctx.strokeStyle='#3a6f8c';ctx.lineCap='round';for(const r of world.rivers){const a=orbV(r.a),b=orbV(r.b);if(a[2]<=0.02||b[2]<=0.02)continue;ctx.lineWidth=r.w*0.7;ctx.beginPath();ctx.moveTo(cx+R*a[0],cy-R*a[1]);ctx.lineTo(cx+R*b[0],cy-R*b[1]);ctx.stroke()}
  drawGraticule(cx,cy,R);
  const g=ctx.createRadialGradient(cx-R*0.3,cy-R*0.35,R*0.1,cx,cy,R);g.addColorStop(0,'rgba(255,250,235,.10)');g.addColorStop(.7,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.45)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fill();
  renderAtlasOverlay();
}
function drawGraticule(cx,cy,R){
  for(const latDeg of [0,30,-30,60,-60]){const la=latDeg*Math.PI/180;ctx.strokeStyle=latDeg===0?'rgba(255,250,235,.20)':'rgba(255,250,235,.09)';ctx.lineWidth=latDeg===0?1.2:1;ctx.beginPath();let st=false;
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
function renderAtlasOverlay(){if(!atlasOn||mode==='tectonic')return;
  const placed=[];
  // country labels first (high priority, reserve space)
  ctx.textAlign='center';ctx.textBaseline='alphabetic';
  for(const w of WINGS){if(!active.has(w.id))continue;const rk=atlas.wingRegion[w.id],cc=atlas.centroids[rk];if(!cc)continue;const p=projV(cc);if(!p)continue;
    const txt=w.label.toUpperCase();ctx.font='italic 12px ui-serif,Georgia,serif';const tw=ctx.measureText(txt).width;
    ctx.fillStyle='rgba(6,4,2,.55)';ctx.fillText(txt,p.x+0.5,p.y+0.5);ctx.fillStyle=hsl(w.hue,34,87,.62);ctx.fillText(txt,p.x,p.y);
    placed.push([p.x-tw/2-3,p.y-12,p.x+tw/2+3,p.y+3])}
  // gather visible cities
  const items=[];for(const c of atlas.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;const p=projV(c.v);if(!p)continue;items.push({c,x:p.x,y:p.y,prio:(c.capital?5e5:0)+c.k+(c===hot?1e9:0)})}
  items.sort((a,b)=>b.prio-a.prio);
  for(const it of items){const c=it.c,w=wing(c.w),r=dotR(c);ctx.beginPath();ctx.arc(it.x,it.y,r,0,7);
    ctx.fillStyle=c.w2?hsl((w.hue+wing(c.w2).hue)/2,60,64):hsl(w.hue,60,hot===c?78:62);ctx.fill();
    ctx.lineWidth=c.capital?1.4:0.8;ctx.strokeStyle=c===hot?'#fff':'rgba(6,4,2,.8)';ctx.stroke();
    if(c.capital){ctx.strokeStyle=hsl(w.hue,65,85,.9);ctx.lineWidth=1;ctx.beginPath();ctx.arc(it.x,it.y,r+2.4,0,7);ctx.stroke()}}
  // labels, greedy by priority, constant size, no overlap
  for(const it of items){const c=it.c,cap=c.capital,r=dotR(c),w=wing(c.w);
    ctx.font=(cap?'600 ':'')+LABEL_PX+'px ui-serif,Georgia,serif';const tw=ctx.measureText(c.n).width;
    const lx=it.x,ly=it.y+r+LABEL_PX-1,box=[lx-tw/2-2,ly-LABEL_PX,lx+tw/2+2,ly+2];
    if(c===hot||!overlaps(box,placed)){ctx.textAlign='center';ctx.fillStyle='rgba(6,4,2,.92)';ctx.fillText(c.n,lx+0.4,ly+0.4);ctx.fillStyle=hsl(w.hue,46,92);ctx.fillText(c.n,lx,ly);placed.push(box)}}
}
function orbSpin(){if(mode!=='orb'||!spin){spinRAF=0;return}yaw+=0.0014;draw();spinRAF=requestAnimationFrame(orbSpin)}

// ---- picking + tooltip -------------------------------------------------------
function pickCity(px,py,touch){if(!atlasOn)return null;let best=null,bd=1e18;
  for(const c of atlas.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;const p=projV(c.v);if(!p)continue;const d=(p.x-px)**2+(p.y-py)**2;if(d<bd){bd=d;best=c}}
  return bd<(touch?22:13)**2?best:null}
function pickCell(px,py){let dir;
  if(mode==='orb'){const cx=W/2,cy=H/2,R=orbR;let nx=(px-cx)/R,ny=-(py-cy)/R;
    // undo axial-tilt roll, then undo camera rotation
    const cr=Math.cos(-tiltAngle),sr=Math.sin(-tiltAngle);const rx=nx*cr-ny*sr,ry=nx*sr+ny*cr;const r2=rx*rx+ry*ry;if(r2>1)return -1;const rz=Math.sqrt(1-r2);
    const cp=Math.cos(-pitch),sp=Math.sin(-pitch),y1=cp*ry-sp*rz,z1=sp*ry+cp*rz;const cyw=Math.cos(-yaw),syw=Math.sin(-yaw);dir=[cyw*rx+syw*y1,-syw*rx+cyw*y1,z1]}
  else{const mx=((px-mview.x)/mview.s-ox)/S,my=((py-mview.y)/mview.s-oy)/S;const lon=mx/MW*2*Math.PI-Math.PI;const t=(1-my/MH*2)*YMAX;const lat=2*Math.atan(Math.exp(t))-Math.PI/2;const cl=Math.cos(lat);dir=[cl*Math.cos(lon),cl*Math.sin(lon),Math.sin(lat)]}
  let bi=-1,bd=-2;for(let i=0;i<world.N;i++){const d=dot(world.V[i],dir);if(d>bd){bd=d;bi=i}}return bi}
function showTip(px,py){tip.style.left=Math.max(80,Math.min(innerWidth-80,px))+'px';tip.style.top=Math.max(54,py)+'px';tip.style.opacity=1}
function tipCity(c,px,py,t){showTip(px,py);const seam=c.w2?'border · '+wing(c.w).label+' ✕ '+wing(c.w2).label:wing(c.w).label;
  tip.innerHTML='<b>'+c.n+'</b> '+(c.capital?'★':'')+'<br><span class="m">'+seam+' · founded '+(c.b||'—')+'</span>'+(c.u?'<br><span class="open">'+(t?'tap again to open ↗':'click to open ↗')+'</span>':'')}
function tipCell(i,px,py){if(i<0){tip.style.opacity=0;return}showTip(px,py);const b=BIOMES[world.biome[i]],T=world.temperature[i],M=world.moisture[i],e=world.elev[i],ws=world.seasonality[i];
  tip.innerHTML='<b>'+b.name+'</b><br><span class="m">'+(T|0)+'°C mean · winter −'+(ws*0.5|0)+'° · moisture '+(M*100|0)+'%<br>'+(world.water[i]?'sea':(Math.max(0,e)*4000|0)+' m')+'</span>'}

const cz=s=>Math.max(0.5,Math.min(9,s));
const ptrs=new Map();let gesture=null,tapStart=null;const di=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});spin=false;
  if(ptrs.size===1){tapStart={x:e.clientX,y:e.clientY,t:Date.now(),touch:e.pointerType!=='mouse'};gesture=mode==='orb'?{mode:'rot',x:e.clientX,y:e.clientY,yaw,pitch}:{mode:'pan',x:e.clientX,y:e.clientY,vx:mview.x,vy:mview.y};cv.classList.add('drag')}
  else if(ptrs.size===2){const p=[...ptrs.values()];gesture={mode:'pinch',d:di(p[0],p[1]),s:mview.s,r:orbR,vx:mview.x,vy:mview.y};tapStart=null;tip.style.opacity=0}});
cv.addEventListener('pointermove',e=>{if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gesture&&gesture.mode==='pinch'&&ptrs.size>=2){const p=[...ptrs.values()],f=di(p[0],p[1])/(gesture.d||1);if(mode==='orb')orbR=Math.max(120,Math.min(1100,gesture.r*f));else{const ns=cz(gesture.s*f),cmx=(p[0].x+p[1].x)/2,cmy=(p[0].y+p[1].y)/2,rx=(cmx-gesture.vx)/gesture.s,ry=(cmy-gesture.vy)/gesture.s;mview.s=ns;mview.x=cmx-rx*ns;mview.y=cmy-ry*ns}draw();return}
  if(gesture&&gesture.mode==='rot'&&ptrs.size===1){yaw=gesture.yaw-(e.clientX-gesture.x)*0.006;pitch=Math.max(-1.45,Math.min(1.45,gesture.pitch+(e.clientY-gesture.y)*0.006));if(tapStart&&Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>8)tapStart=null;draw();return}
  if(gesture&&gesture.mode==='pan'&&ptrs.size===1){mview.x=gesture.vx+(e.clientX-gesture.x);mview.y=gesture.vy+(e.clientY-gesture.y);if(tapStart&&Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>8){tapStart=null;tip.style.opacity=0}draw();return}
  if(e.pointerType==='mouse'&&ptrs.size===0){const c=pickCity(e.clientX,e.clientY);if(c!==hot){hot=c;draw()}
    if(c){tipCity(c,e.clientX,e.clientY,false);cv.style.cursor='pointer'}else{tipCell(pickCell(e.clientX,e.clientY),e.clientX,e.clientY);cv.style.cursor='grab'}}});
function endPtr(e){ptrs.delete(e.pointerId);
  if(ptrs.size===0){cv.classList.remove('drag');
    if(tapStart&&Date.now()-tapStart.t<400){const c=pickCity(tapStart.x,tapStart.y,tapStart.touch);
      if(c){if(!tapStart.touch){if(c.u)open(c.u,'_blank')}else if(selected===c&&c.u){open(c.u,'_blank')}else{selected=c;hot=c;tipCity(c,tapStart.x,tapStart.y,true);draw()}}
      else{selected=null;hot=null;if(tapStart.touch)tipCell(pickCell(tapStart.x,tapStart.y),tapStart.x,tapStart.y);else tip.style.opacity=0;draw()}}
    gesture=null;tapStart=null}
  else if(ptrs.size===1){const p=[...ptrs.values()][0];gesture=mode==='orb'?{mode:'rot',x:p.x,y:p.y,yaw,pitch}:{mode:'pan',x:p.x,y:p.y,vx:mview.x,vy:mview.y};tapStart=null}}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY<0?1.12:1/1.12;if(mode==='orb')orbR=Math.max(120,Math.min(1100,orbR*f));else{const ns=cz(mview.s*f),rx=(e.clientX-mview.x)/mview.s,ry=(e.clientY-mview.y)/mview.s;mview.x=e.clientX-rx*ns;mview.y=e.clientY-ry*ns;mview.s=ns}draw()},{passive:false});

// ---- chrome ------------------------------------------------------------------
document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;document.querySelectorAll('.modes button').forEach(x=>x.classList.toggle('on',x===b));
  tkey.classList.toggle('show',mode==='tectonic');tip.style.opacity=0;hot=selected=null;if(mode!=='orb')renderMerc();if(mode==='orb'){spin=true;if(!spinRAF)spinRAF=requestAnimationFrame(orbSpin)}else spin=false;buildLegend();draw()});
document.getElementById('atlas').onclick=e=>{atlasOn=!atlasOn;e.target.classList.toggle('on',atlasOn);if(mode!=='orb')renderMerc();buildLegend();draw()};
document.getElementById('reseed').onclick=()=>{seed=(Math.random()*1e9)|0;build()};
document.getElementById('q').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();draw()});
const tEl=document.getElementById('time'),eraEl=document.getElementById('era');
const eraLabel=()=>tcut>=1?'all founded':'↤ '+new Date(SITES.minB+(SITES.maxB-SITES.minB)*tcut).toISOString().slice(0,10);
tEl.addEventListener('input',()=>{tcut=+tEl.value/1000;eraEl.textContent=eraLabel();draw()});
document.getElementById('play').onclick=()=>{playing=!playing;if(playing){tcut=0;tEl.value=0;step()}};
function step(){if(!playing)return;tcut=Math.min(1,tcut+0.006);tEl.value=tcut*1000;eraEl.textContent=eraLabel();draw();if(tcut>=1){playing=false;document.getElementById('play').textContent='▶ chronicle';return}document.getElementById('play').textContent='⏸';requestAnimationFrame(step)}
function buildLegend(){legendEl.innerHTML='';if(mode==='tectonic')return;
  if(atlasOn){for(const w of WINGS){const c=document.createElement('span');c.className='chip';c.dataset.w=w.id;c.innerHTML='<span class="dot" style="background:'+hsl(w.hue,55,58)+'"></span>'+w.label;
    c.onclick=()=>{if(active.size===1&&active.has(w.id))active=new Set(WINGS.map(x=>x.id));else active=new Set([w.id]);for(const ch of legendEl.children)if(ch.dataset.w)ch.classList.toggle('off',!active.has(ch.dataset.w));if(mode!=='orb')renderMerc();draw()};legendEl.appendChild(c)}}
  else{const seen=new Set();for(let i=0;i<world.N;i++)seen.add(world.biome[i]);for(let bi=3;bi<BIOMES.length;bi++){if(!seen.has(bi))continue;const b=BIOMES[bi];const c=document.createElement('span');c.className='chip';c.style.cursor='default';c.innerHTML='<span class="dot" style="background:'+hsl(b.h,b.s,b.l)+'"></span>'+b.name;legendEl.appendChild(c)}}}
function resize(){DPR=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';orbR=Math.min(W,H)*0.42;if(world){fit();draw()}}
addEventListener('resize',resize);resize();build();buildLegend();
