// mappa/engine.js — a standalone, deterministic, dependency-free world engine.
//
// generateWorld(seed, opts) builds a whole planet on the unit sphere from a
// single integer seed and returns plain, serializable structures. It knows
// NOTHING about mino.mobi sites — the atlas (countries/cities) is a separate
// projection laid on top (see projection.js). This file is the API core: a
// Cloudflare Worker can import it unchanged and serve GET /api/world?seed=.
//
// Pipeline (all spherical):
//   Fibonacci points → spherical Delaunay/Voronoi (stereographic + ghost pole,
//   Euler-verified) → RANDOM plates (Euler-pole rotors) → tectonic elevation →
//   sea level → climate (temperature + moisture) → Whittaker biomes →
//   priority-flood lakes + flow-accumulation rivers.
//
// Deterministic: same seed ⇒ same world, in node and the browser.

// ---- prng + vec3 ------------------------------------------------------------
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
// Optional fast triangulator (Rust/WASM). null → use the built-in JS Bowyer–Watson.
// fn(Float64Array of [x0,y0,x1,y1,…]) → Uint32Array of triangle vertex indices.
let extTri=null; export function setTriangulator(fn){extTri=fn}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return[a[0]/l,a[1]/l,a[2]/l]};

// ---- 3D value noise (sampled on the sphere surface) -------------------------
function h3(i,j,k,s){let n=(i*374761393+j*668265263+k*1610612741+s*69069)|0;n=Math.imul(n^(n>>>13),1274126177);n=n^(n>>>16);return((n>>>0)/4294967296)}
const smooth=t=>t*t*(3-2*t);
function vn3(x,y,z,s){const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z),fx=smooth(x-x0),fy=smooth(y-y0),fz=smooth(z-z0);
  const L=(a,b,t)=>a*(1-t)+b*t;
  const c000=h3(x0,y0,z0,s),c100=h3(x0+1,y0,z0,s),c010=h3(x0,y0+1,z0,s),c110=h3(x0+1,y0+1,z0,s),
        c001=h3(x0,y0,z0+1,s),c101=h3(x0+1,y0,z0+1,s),c011=h3(x0,y0+1,z0+1,s),c111=h3(x0+1,y0+1,z0+1,s);
  return L(L(L(c000,c100,fx),L(c010,c110,fx),fy),L(L(c001,c101,fx),L(c011,c111,fx),fy),fz)}
function fbm3(x,y,z,s,oct=5){let v=0,a=0.5,f=1;for(let o=0;o<oct;o++){v+=a*vn3(x*f,y*f,z*f,s+o*131);f*=2;a*=0.5}return v}

// ---- planar Bowyer–Watson (after stereographic projection) ------------------
function circum(P,a,b,c){const ax=P[a][0],ay=P[a][1],bx=P[b][0],by=P[b][1],cx=P[c][0],cy=P[c][1];
  const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));if(Math.abs(d)<1e-15)return{x:0,y:0,r2:Infinity};
  const A=ax*ax+ay*ay,B=bx*bx+by*by,C=cx*cx+cy*cy;
  const ux=(A*(by-cy)+B*(cy-ay)+C*(ay-by))/d,uy=(A*(cx-bx)+B*(ax-cx)+C*(bx-ax))/d;
  return{x:ux,y:uy,r2:(ax-ux)*(ax-ux)+(ay-uy)*(ay-uy)}}
function triangulate(pts){
  const n=pts.length;let mnX=1e9,mnY=1e9,mxX=-1e9,mxY=-1e9;
  for(const p of pts){if(p[0]<mnX)mnX=p[0];if(p[1]<mnY)mnY=p[1];if(p[0]>mxX)mxX=p[0];if(p[1]>mxY)mxY=p[1]}
  const dm=Math.max(mxX-mnX,mxY-mnY)||1,mx=(mnX+mxX)/2,my=(mnY+mxY)/2;
  const P=pts.slice(),i0=n,i1=n+1,i2=n+2;
  P.push([mx-20*dm,my-dm],[mx,my+20*dm],[mx+20*dm,my-dm]);
  let T=[[i0,i1,i2]];T[0].cc=circum(P,i0,i1,i2);
  for(let i=0;i<n;i++){const p=P[i],bad=[];
    for(const t of T){const cc=t.cc;if((p[0]-cc.x)*(p[0]-cc.x)+(p[1]-cc.y)*(p[1]-cc.y)<cc.r2-1e-9)bad.push(t)}
    const ed=[];for(const t of bad)ed.push([t[0],t[1]],[t[1],t[2]],[t[2],t[0]]);
    const poly=[];for(let a=0;a<ed.length;a++){let sh=false;for(let b=0;b<ed.length;b++){if(a!==b&&ed[a][0]===ed[b][1]&&ed[a][1]===ed[b][0]){sh=true;break}}if(!sh)poly.push(ed[a])}
    const bs=new Set(bad);T=T.filter(t=>!bs.has(t));
    for(const e of poly){const nt=[e[0],e[1],i];nt.cc=circum(P,nt[0],nt[1],nt[2]);T.push(nt)}}
  return T.filter(t=>t[0]<n&&t[1]<n&&t[2]<n);
}
function MinHeap(){this.a=[]}
MinHeap.prototype.push=function(k,v){const a=this.a;a.push([k,v]);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;const t=a[p];a[p]=a[i];a[i]=t;i=p}};
MinHeap.prototype.pop=function(){const a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){let l=2*i+1,r=l+1,s=i;if(l<a.length&&a[l][0]<a[s][0])s=l;if(r<a.length&&a[r][0]<a[s][0])s=r;if(s===i)break;const t=a[s];a[s]=a[i];a[i]=t;i=s}}return top};
MinHeap.prototype.size=function(){return this.a.length};

// ---- biome table (Whittaker-ish). index → {name, h,s,l} ---------------------
export const BIOMES = [
  {id:'ocean_deep',    name:'deep ocean',          h:212,s:48,l:16},
  {id:'ocean_shelf',   name:'shelf sea',           h:198,s:46,l:30},
  {id:'lake',          name:'lake',                h:202,s:46,l:42},
  {id:'ice',           name:'ice sheet',           h:205,s:10,l:90},
  {id:'tundra',        name:'tundra',              h:150,s:12,l:60},
  {id:'taiga',         name:'boreal forest',       h:150,s:26,l:33},
  {id:'cold_desert',   name:'cold desert',         h:42, s:16,l:56},
  {id:'steppe',        name:'grassland / steppe',  h:74, s:34,l:52},
  {id:'temperate_for', name:'temperate forest',    h:112,s:32,l:37},
  {id:'temperate_rain',name:'temperate rainforest',h:142,s:38,l:31},
  {id:'desert',        name:'desert',              h:44, s:56,l:62},
  {id:'savanna',       name:'savanna',             h:64, s:44,l:51},
  {id:'trop_seasonal', name:'tropical seasonal',   h:92, s:44,l:40},
  {id:'trop_rain',     name:'tropical rainforest', h:134,s:50,l:29},
  {id:'alpine',        name:'alpine / bare',       h:28, s:8, l:70},
  {id:'snow',          name:'snowcap',             h:0,  s:0, l:94},
];
const BI = Object.fromEntries(BIOMES.map((b,i)=>[b.id,i]));
function classify(T, M, elevAbove){ // T °C, M 0..1, elevAbove = elevation above sea
  if(elevAbove>0.72) return T<1?BI.snow:BI.alpine;
  if(T<-12) return BI.ice;
  if(T<0)  return M<0.30?BI.cold_desert:BI.tundra;
  if(T<7)  return M<0.25?BI.cold_desert:(M<0.5?BI.steppe:BI.taiga);
  if(T<20) return M<0.2?BI.desert:(M<0.42?BI.steppe:(M<0.7?BI.temperate_for:BI.temperate_rain));
  return M<0.2?BI.desert:(M<0.42?BI.savanna:(M<0.65?BI.trop_seasonal:BI.trop_rain));
}

// ---- the engine -------------------------------------------------------------
export function generateWorld(seed, opts={}){
  const rnd=mulberry32(seed>>>0);
  const targetN=opts.N||9000;
  const _of=0.58+rnd()*0.12, _at=0.12+rnd()*0.47; // always draw (keep RNG stream stable under overrides)
  const oceanFraction = opts.oceanFraction ?? _of; // varies per world
  const axialTilt = opts.axialTilt ?? _at;          // ~7°–34°, drives seasonality
  const solar = opts.solar ?? 1.0;                  // stellar luminosity (1 = sun-like) → global temperature
  const planetRadius = opts.planetRadius ?? 1.0;    // Earth=1. bigger → more plates + (higher gravity) lower relief
  const age = Math.max(1, Math.round(opts.age ?? 4)); // geological epochs → plate drift + orogenic-belt development
  const plateScale = Math.min(3.0, Math.max(0.35, Math.pow(planetRadius,1.3)));   // area ∝ r²
  const reliefScale = Math.min(1.9, Math.max(0.45, Math.pow(planetRadius,-0.55))); // relief ∝ 1/gravity
  const DT=0.1, ageSpan = age*DT;                   // total plate-drift time
  const rotAx=(v,a,phi)=>{const c=Math.cos(phi),s=Math.sin(phi),d=a[0]*v[0]+a[1]*v[1]+a[2]*v[2];
    return [v[0]*c+(a[1]*v[2]-a[2]*v[1])*s+a[0]*d*(1-c), v[1]*c+(a[2]*v[0]-a[0]*v[2])*s+a[1]*d*(1-c), v[2]*c+(a[0]*v[1]-a[1]*v[0])*s+a[2]*d*(1-c)]};

  // 0. plates first — so sampling can concentrate resolution where it matters --
  const ga=Math.PI*(3-Math.sqrt(5));
  const _pc=12+Math.floor(rnd()*10); const plateCount = opts.plateCount || Math.max(4,Math.min(44,Math.round(_pc*plateScale)));
  const plates=[];
  for(let i=0;i<plateCount;i++){const c0=norm([rnd()*2-1,rnd()*2-1,rnd()*2-1]);const oceanic=rnd()<oceanFraction?1:0;const axis=norm([rnd()-0.5,rnd()-0.5,rnd()-0.5]);const speed=0.4+rnd()*1.0;const buoy=0.12+rnd()*0.30;
    plates.push({ center0:c0, center:rotAx(c0,axis,speed*ageSpan), oceanic, axis, speed, buoy });} // center = present (drifted) position
  const top2=p=>{let d1=-2,d2=-2,k1=0;for(let s=0;s<plateCount;s++){const d=p[0]*plates[s].center[0]+p[1]*plates[s].center[1]+p[2]*plates[s].center[2];if(d>d1){d2=d1;d1=d;k1=s}else if(d>d2)d2=d}return[d1,d2,k1]};
  // domain-warp the plate query → fractal, jagged boundaries (not smooth Voronoi arcs)
  const warp=p=>{const f=2.6,g=6.3,A=0.34,B=0.14;
    const x=p[0]+(fbm3(p[0]*f,p[1]*f,p[2]*f,seed+201)-0.5)*A+(fbm3(p[0]*g,p[1]*g,p[2]*g,seed+204)-0.5)*B;
    const y=p[1]+(fbm3(p[0]*f,p[1]*f,p[2]*f,seed+202)-0.5)*A+(fbm3(p[0]*g,p[1]*g,p[2]*g,seed+205)-0.5)*B;
    const z=p[2]+(fbm3(p[0]*f,p[1]*f,p[2]*f,seed+203)-0.5)*A+(fbm3(p[0]*g,p[1]*g,p[2]*g,seed+206)-0.5)*B;
    const l=Math.hypot(x,y,z)||1;return[x/l,y/l,z/l]};

  // 1. ADAPTIVE sampling: dense on continents + extra-dense along the (warped)
  //    plate boundaries — coasts, mountains, trenches, arcs. Sparse deep ocean.
  const rotA=rnd()*6.283, M=Math.round(targetN*2.1);
  const V=[], plateRaw=[];
  for(let i=0;i<M;i++){const z=1-(2*i+1)/M,r=Math.sqrt(1-z*z),th=ga*i+rotA;const p=[r*Math.cos(th),r*Math.sin(th),z];
    const t=top2(warp(p)), bp=Math.exp(-(t[0]-t[1])/0.035); // bp→1 near a (jagged) plate boundary
    if(rnd()<Math.min(1,(plates[t[2]].oceanic?0.12:0.52)+bp*0.78)){V.push(p);plateRaw.push(t[2])}}
  // COAST REFINEMENT: inject dense jittered clusters around a supplied coastline
  // (the previous pass's emergent coast) → a high-resolution pass right at the shore.
  const refine=opts.refinePoints; // flat [x,y,z,…] unit vectors
  // PROGRESSIVE RESOLUTION GRADIENT: rather than a uniform jittered cloud, place
  // each injected point at a radius drawn from t=rnd()*rnd() (biased toward 0), so
  // density is highest right on the feature border and thins outward over a thicker
  // band. Applies to all three feature kinds (coast, mountain, river).
  if(refine&&refine.length){const per=opts.refinePer??6, jit=opts.refineJitter??0.014;
    for(let r=0;r+2<refine.length;r+=3){const rx=refine[r],ry=refine[r+1],rz=refine[r+2];
      for(let q=0;q<per;q++){const t=rnd()*rnd();const rad=jit*(0.12+t*3.0);
        const dx=rnd()-0.5,dy=rnd()-0.5,dz=rnd()-0.5,dl=Math.hypot(dx,dy,dz)||1;
        const p=norm([rx+dx/dl*rad,ry+dy/dl*rad,rz+dz/dl*rad]);V.push(p);plateRaw.push(top2(warp(p))[2])}}}
  const N=V.length;

  // 2. spherical Delaunay/Voronoi ---------------------------------------------
  const proj=V.map(p=>[p[0]/(1-p[2]),p[1]/(1-p[2])]);
  let triR;
  if(extTri){const flat=new Float64Array(N*2);for(let i=0;i<N;i++){flat[2*i]=proj[i][0];flat[2*i+1]=proj[i][1]}const t=extTri(flat);triR=[];for(let k=0;k+2<t.length;k+=3)triR.push([t[k],t[k+1],t[k+2]])}
  else triR=triangulate(proj);
  const ek=(a,b)=>a<b?a+','+b:b+','+a;
  const ecount=new Map();
  for(const t of triR){for(const[a,b]of[[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]])ecount.set(ek(a,b),(ecount.get(ek(a,b))||0)+1)}
  const GH=N, tris=triR.map(t=>[t[0],t[1],t[2]]);
  for(const[k,c]of ecount)if(c===1){const[a,b]=k.split(',').map(Number);tris.push([a,b,GH])}
  const PV=V.concat([[0,0,1]]);
  const cc=tris.map(t=>{let c=norm(cross(sub(PV[t[1]],PV[t[0]]),sub(PV[t[2]],PV[t[0]])));if(dot(c,add(add(PV[t[0]],PV[t[1]]),PV[t[2]]))<0)c=scl(c,-1);return c});
  const inc=Array.from({length:N},()=>[]),adjS=Array.from({length:N},()=>new Set());
  const e2t=new Map();
  tris.forEach((t,ti)=>{for(const v of t)if(v<N)inc[v].push(ti);
    for(let a=0;a<3;a++){const u=t[a],w=t[(a+1)%3];if(u<N&&w<N){adjS[u].add(w);adjS[w].add(u);const k=ek(u,w);(e2t.get(k)||e2t.set(k,[]).get(k)).push(ti)}}});
  const adj=adjS.map(s=>[...s]);
  const cells=new Array(N);
  for(let i=0;i<N;i++){const p=V[i];const e1=norm(cross(p,Math.abs(p[2])<0.9?[0,0,1]:[1,0,0])),e2=cross(p,e1);
    const cs=inc[i].map(ti=>{const c=cc[ti];return{a:Math.atan2(dot(c,e2),dot(c,e1)),c}});cs.sort((u,v)=>u.a-v.a);cells[i]=cs.map(o=>o.c)}

  // 3. plate assignment (already chosen during adaptive sampling) --------------
  const plate=Int16Array.from(plateRaw);
  const ptype=i=>plates[plate[i]].oceanic;
  const vel=i=>scl(cross(plates[plate[i]].axis,V[i]),plates[plate[i]].speed);

  // 4. tectonics → elevation ---------------------------------------------------
  const conv=new Float32Array(N),mountSrc=new Float32Array(N),localF=new Float32Array(N),ridge=new Uint8Array(N);
  for(let i=0;i<N;i++){let cs=0,nn=0,mt=0,lf=0;const oi=ptype(i),vi=vel(i);
    for(const j of adj[i]){if(plate[j]===plate[i])continue;const oj=ptype(j);
      const dir=norm(sub(V[j],scl(V[i],dot(V[i],V[j]))));
      const rel=dot(sub(vi,vel(j)),dir);cs+=rel;nn++;
      if(rel>0){ if(!oi&&!oj)mt+=rel*1.0; else if(!oi&&oj)mt+=rel*0.7; else if(oi&&!oj)lf-=rel*1.15;
        else { const volc=fbm3(V[i][0]*9.3,V[i][1]*9.3,V[i][2]*9.3,seed+71); lf+=rel*(volc>0.64?0.55:0.04); } } // ocean-ocean: SPARSE volcanic arc, not a welded strip
      else { const dv=-rel; if(oi){lf+=dv*0.35; if(dv>0.05)ridge[i]=1;} else lf-=dv*0.45; }} // oceanic divergent = mid-ocean ridge
    if(nn){conv[i]=cs/nn;if(!oi&&mt>0)mountSrc[i]=mt;localF[i]=lf}}
  // multi-epoch OROGENY: as the plates drift over `age` epochs, accumulate
  // continental convergence — so mountain belts develop and WIDEN with geological
  // age (history, not a single snapshot). Boundaries are the same warped/jagged
  // lines as the present (wV reused across epochs).
  const wV=V.map(p=>warp(p));
  const mountAccum=new Float32Array(N);
  const STEPS=Math.max(2,Math.min(12,age+1));
  for(let s=0;s<STEPS;s++){const t=ageSpan*s/(STEPS-1);
    const ct=plates.map(pl=>rotAx(pl.center0,pl.axis,pl.speed*t));
    const pe=new Int16Array(N);
    for(let i=0;i<N;i++){let bk=0,bd=-2;for(let k=0;k<plateCount;k++){const d=wV[i][0]*ct[k][0]+wV[i][1]*ct[k][1]+wV[i][2]*ct[k][2];if(d>bd){bd=d;bk=k}}pe[i]=bk}
    for(let i=0;i<N;i++){if(plates[pe[i]].oceanic)continue;const a=plates[pe[i]].axis,sp=plates[pe[i]].speed,vi=scl(cross(a,V[i]),sp);let up=0;
      for(const j of adj[i]){if(pe[j]===pe[i])continue;const oj=plates[pe[j]].oceanic;
        const dir=norm(sub(V[j],scl(V[i],dot(V[i],V[j]))));const vj=scl(cross(plates[pe[j]].axis,V[j]),plates[pe[j]].speed);
        const rel=dot(sub(vi,vj),dir);if(rel>0)up+= oj?rel*0.7:rel*1.0;}
      if(up>mountAccum[i])mountAccum[i]=up;}} // MAX over epochs: present strength, belts widen with drift
  for(let i=0;i<N;i++)mountSrc[i]=mountAccum[i];
  let mf=Float32Array.from(mountSrc);
  for(let it=0;it<3;it++){const nf=Float32Array.from(mf);for(let i=0;i<N;i++){if(ptype(i))continue;let m=mf[i];for(const j of adj[i])if(!ptype(j))m=Math.max(m,mf[j]*0.66);nf[i]=m}mf=nf}
  // SEAFLOOR AGE (half-space cooling bathymetry): oceanic crust is born at the
  // mid-ocean ridges (ridge[i]) and ages as it spreads away. BFS hop-distance over
  // oceanic cells = a proxy for crustal age; depth ∝ √age (ridges shallow, abyssal
  // plains deep). Continental cells are skipped.
  const sfAge=new Float32Array(N).fill(-1);
  {const q=[];for(let i=0;i<N;i++)if(ridge[i]&&ptype(i)){sfAge[i]=0;q.push(i)}
    for(let h=0;h<q.length;h++){const i=q[h];for(const j of adj[i])if(ptype(j)&&sfAge[j]<0){sfAge[j]=sfAge[i]+1;q.push(j)}}}
  let sfMax=1;for(let i=0;i<N;i++)if(sfAge[i]>sfMax)sfMax=sfAge[i];
  const elevRaw=new Float32Array(N);
  for(let i=0;i<N;i++){const p=V[i],oi=ptype(i),pl=plates[plate[i]];
    const gd=Math.acos(Math.max(-1,Math.min(1,dot(p,pl.center))));
    const noise=(fbm3(p[0]*2.0,p[1]*2.0,p[2]*2.0,seed)-0.5)*(oi?0.30:0.22);
    if(!oi){const craton=pl.buoy*Math.exp(-(gd*gd)/(2*0.5*0.5));elevRaw[i]=0.10+craton+mf[i]*0.6+localF[i]*0.5+noise;}
    else{const sa=sfAge[i]<0?1:Math.sqrt(sfAge[i]/sfMax);elevRaw[i]=-0.20-0.50*sa+mf[i]*0.55+localF[i]*0.55+noise;}}
  // cell areas (true spherical Voronoi area) — for water volume + drainage weight
  const triArea=(a,b,c)=>{const bc=cross(b,c);return 2*Math.atan2(Math.abs(dot(a,bc)),1+dot(a,b)+dot(b,c)+dot(c,a))};
  const area=new Float32Array(N);for(let i=0;i<N;i++){const cc2=cells[i];let s=0;for(let k=0;k<cc2.length;k++)s+=triArea(V[i],cc2[k],cc2[(k+1)%cc2.length]);area[i]=s}
  // SEA LEVEL by water VOLUME: pour a fixed volume over the topography and let it
  // settle — solve Σ areaᵢ·max(0, h−elevᵢ) = V. Deep basins hold water at depth.
  const _wf=0.10+rnd()*0.10; const waterFrac=opts.waterFrac??_wf;
  const seaLevelByVolume=()=>{let eMin=1e9,eMax=-1e9;for(let i=0;i<N;i++){if(elevRaw[i]<eMin)eMin=elevRaw[i];if(elevRaw[i]>eMax)eMax=elevRaw[i]}
    const wv=h=>{let v=0;for(let i=0;i<N;i++){const d=h-elevRaw[i];if(d>0)v+=area[i]*d}return v};
    const Vt=wv(eMax)*waterFrac;let lo=eMin,hi=eMax;for(let it=0;it<40;it++){const m=(lo+hi)/2;if(wv(m)<Vt)lo=m;else hi=m}return (lo+hi)/2};
  let sl=seaLevelByVolume();
  // HYDRAULIC EROSION — carve valleys ∝ drainage area, diffuse hillslopes. Gives
  // dendritic drainage networks (texture), sharp continental divides (rivers run
  // in carved valleys and never cross ridges), and eroded coastlines.
  {const CARVE=0.16, DIFF=0.10, ITER=opts.erodeIter??4;
   for(let it=0;it<ITER;it++){
     const fl=Float32Array.from(elevRaw),iq=new Uint8Array(N),hp=new MinHeap();
     for(let i=0;i<N;i++)if(elevRaw[i]<=sl){iq[i]=1;hp.push(fl[i],i)}
     while(hp.size()){const[e,i]=hp.pop();for(const j of adj[i]){if(iq[j])continue;fl[j]=Math.max(elevRaw[j],e+1e-5);iq[j]=1;hp.push(fl[j],j)}}
     const dn=new Int32Array(N).fill(-1);
     for(let i=0;i<N;i++){if(elevRaw[i]<=sl)continue;let loE=fl[i],bj=-1;for(const j of adj[i])if(fl[j]<loE){loE=fl[j];bj=j}dn[i]=bj}
     const ord=[];for(let i=0;i<N;i++)if(elevRaw[i]>sl)ord.push(i);ord.sort((a,b)=>fl[b]-fl[a]);
     const drain=Float32Array.from(area);for(const i of ord){const j=dn[i];if(j>=0)drain[j]+=drain[i]}
     let maxD=1e-9;for(let i=0;i<N;i++)if(drain[i]>maxD)maxD=drain[i];
     const ne=Float32Array.from(elevRaw);
     for(const i of ord)ne[i]=elevRaw[i]-CARVE*Math.pow(drain[i]/maxD,0.35);
     for(let i=0;i<N;i++){if(elevRaw[i]<=sl)continue;let s=0,c=0;for(const j of adj[i]){s+=ne[j];c++}ne[i]+=DIFF*(s/c-ne[i])}
     for(let i=0;i<N;i++)elevRaw[i]=ne[i];
   }}
  sl=seaLevelByVolume(); // re-settle the sea once over the eroded topography
  const elev=new Float32Array(N);for(let i=0;i<N;i++)elev[i]=elevRaw[i]-sl; // 0 = shore
  // mild hypsometry compression (erosion already does most of the shaping)
  let landMax=1e-6;for(let i=0;i<N;i++)if(elev[i]>landMax)landMax=elev[i];
  for(let i=0;i<N;i++)if(elev[i]>0)elev[i]=Math.pow(elev[i]/landMax,1.5)*0.95*reliefScale; // gravity scales relief
  const water=new Uint8Array(N);// 0 land, 1 ocean, 2 lake
  for(let i=0;i<N;i++)water[i]=elev[i]>0?0:1;

  // 5. rivers + lakes (priority-flood + flow accumulation) ---------------------
  const filled=Float32Array.from(elev),inq=new Uint8Array(N),heap=new MinHeap();
  for(let i=0;i<N;i++)if(water[i]){inq[i]=1;heap.push(filled[i],i)}
  while(heap.size()){const[e,i]=heap.pop();for(const j of adj[i]){if(inq[j])continue;filled[j]=Math.max(elev[j],e+1e-4);inq[j]=1;heap.push(filled[j],j)}}
  for(let i=0;i<N;i++)if(!water[i]&&filled[i]-elev[i]>0.02)water[i]=2; // filled depression → lake
  const down=new Int32Array(N).fill(-1);
  for(let i=0;i<N;i++){if(water[i]===1)continue;let lo=filled[i],bj=-1;for(const j of adj[i])if(filled[j]<lo){lo=filled[j];bj=j}down[i]=bj}
  const order=[];for(let i=0;i<N;i++)if(water[i]!==1)order.push(i);order.sort((a,b)=>filled[b]-filled[a]);
  const flow=new Float32Array(N);for(let i=0;i<N;i++)if(water[i]!==1)flow[i]=1;
  for(const i of order){const j=down[i];if(j>=0&&water[j]!==1)flow[j]+=flow[i]}
  const rivers=[];for(const i of order){if(water[i]!==0)continue;const j=down[i];if(j>=0&&flow[i]>18)rivers.push({a:V[i],b:V[j],flow:flow[i],w:Math.min(5,0.6+Math.sqrt(flow[i])/6)})}

  // 6. atmosphere: rotation → prevailing winds → advected & orographic moisture -
  // rotationRate Ω (Earth=1). SIGN = spin direction: + prograde, − retrograde.
  // |Ω| sets how many circulation cells fit per hemisphere and how zonal the flow
  // is; the sign sets the Coriolis deflection (retrograde ⇒ prevailing winds flip).
  const _rrMag=0.5+rnd()*1.4, _rrSign=rnd()<0.12?-1:1;          // always draw (RNG stream stable under override)
  const rotationRate = opts.rotationRate ?? (_rrMag*_rrSign);
  const Omega = Math.abs(rotationRate)<0.05 ? (rotationRate<0?-0.05:0.05) : rotationRate;
  const aOmega=Math.abs(Omega), coriolisSign=Omega<0?-1:1;
  const windCells=Math.max(1,Math.min(6,Math.round(3*Math.sqrt(aOmega)))); // circulation cells per hemisphere
  const zonalFrac=Math.max(0.30,Math.min(0.92,0.35+0.45*Math.sqrt(aOmega))); // faster spin → more east-west
  const lat=i=>Math.asin(Math.max(-1,Math.min(1,V[i][2])));
  // prevailing surface wind per cell (tangent 3-vector) from the banded cell model
  const windV=new Array(N), zAx=[0,0,1];
  for(let i=0;i<N;i++){const p=V[i],z=p[2];
    let eE=cross(zAx,p);const le=Math.hypot(eE[0],eE[1],eE[2]);     // east basis
    eE = le<1e-6 ? [1,0,0] : [eE[0]/le,eE[1]/le,eE[2]/le];
    const eN=cross(p,eE);                                           // north basis (unit)
    const alat=Math.min(0.999,Math.abs(lat(i))/(Math.PI/2));
    const k=Math.min(windCells-1,Math.floor(alat*windCells));       // 0 = equatorial cell
    const equatorward=(k%2===0);                                    // Hadley/Polar surface → equatorward; Ferrel → poleward
    const zsign=coriolisSign*(equatorward?-1:1);                    // zonal east(+)/west(−), hemisphere-independent
    const vsign=(equatorward?-1:1)*(z>=0?1:-1);                     // meridional toward/away from equator
    const u=zsign*zonalFrac, v=vsign*(1-zonalFrac);
    windV[i]=[eE[0]*u+eN[0]*v, eE[1]*u+eN[1]*v, eE[2]*u+eN[2]*v]}
  // upwind neighbour (the cell the wind blows FROM) for moisture advection
  const upwind=new Int32Array(N).fill(-1);
  for(let i=0;i<N;i++){const w=windV[i],wl=Math.hypot(w[0],w[1],w[2])||1,wx=-w[0]/wl,wy=-w[1]/wl,wz=-w[2]/wl;
    let bj=-1,bd=0.2;for(const j of adj[i]){let dx=V[j][0]-V[i][0],dy=V[j][1]-V[i][1],dz=V[j][2]-V[i][2];const dl=Math.hypot(dx,dy,dz)||1;const d=(dx*wx+dy*wy+dz*wz)/dl;if(d>bd){bd=d;bj=j}}upwind[i]=bj}
  // advect ocean humidity downwind: decays over land, replenished over sea, rains
  // out on ascent → windward coasts wet, deep interiors & lee sides dry. Directional.
  const ocean=new Uint8Array(N);for(let i=0;i<N;i++)ocean[i]=water[i]===1?1:0;
  let A=new Float32Array(N);for(let i=0;i<N;i++)A[i]=ocean[i]?1:0;
  for(let it=0;it<16;it++){const An=Float32Array.from(A);
    for(let i=0;i<N;i++){if(ocean[i]){An[i]=1;continue}const j=upwind[i];if(j<0)continue;
      const climb=Math.max(0,elev[i]-elev[j]);                      // orographic rain-out steepens decay
      An[i]=Math.max(An[i], A[j]*(0.93-Math.min(0.5,climb*3.0)) + (water[i]===2?0.05:0))}
    A=An}
  // orographic term: windward ascent wetter, lee descent (rain shadow) drier
  const oro=new Float32Array(N);for(let i=0;i<N;i++){const j=upwind[i];oro[i]=j<0?0:Math.max(-0.5,Math.min(0.6,(elev[i]-elev[j])*4.0))}

  // 6b. temperature + moisture(v2) + seasonality → biomes ----------------------
  const temperature=new Float32Array(N), moisture=new Float32Array(N), seasonality=new Float32Array(N), biome=new Uint8Array(N);
  const distSea=new Int16Array(N).fill(-1);{const q=[];for(let i=0;i<N;i++)if(water[i]===1){distSea[i]=0;q.push(i)}
    for(let h=0;h<q.length;h++){const i=q[h];for(const j of adj[i])if(distSea[j]<0){distSea[j]=distSea[i]+1;q.push(j)}}}
  let maxD=1;for(let i=0;i<N;i++)if(distSea[i]>maxD)maxD=distSea[i];
  for(let i=0;i<N;i++){
    const la=lat(i), alat=Math.abs(la)/(Math.PI/2);
    let T=28 - 45*Math.pow(alat,1.25) + (solar-1)*38;  // mean annual temperature (solar luminosity shifts it)
    if(water[i]===0)T-=Math.max(0,elev[i])*42;     // altitude lapse on land
    T+=(fbm3(V[i][0]*3+9,V[i][1]*3,V[i][2]*3,seed+5)-0.5)*5;
    temperature[i]=T;
    // moisture v2 = advected ocean air (A, directional) + a soft isotropic coastal
    // floor + circulation rainfall bands (rising branches of the cells wet, sinking
    // subtropics/poles dry) + orographic relief (windward wet / lee rain-shadow)
    const coast=Math.exp(-(distSea[i]/Math.max(3,maxD*0.5)));
    const band=0.5+0.5*Math.cos(windCells*Math.PI*Math.min(1,alat));
    let M=Math.max(0,Math.min(1, A[i]*0.42 + coast*0.20 + band*0.36 + oro[i]*0.45 - Math.max(0,elev[i])*0.12
        + (fbm3(V[i][0]*2-4,V[i][1]*2,V[i][2]*2,seed+11)-0.5)*0.22));
    moisture[i]=M;
    // seasonality: axial tilt × latitude × continentality → annual winter depth
    const contl = water[i]===1?0 : Math.min(1, distSea[i]/Math.max(3,maxD*0.5));
    const seas = (axialTilt/0.41) * (8 + 34*Math.pow(alat,1.1)) * (0.55+0.75*contl);
    seasonality[i]=seas;
    const Teff = T - 0.32*seas; // growing-season-limited temperature for biomes
    biome[i]= water[i]===1 ? (elev[i]>-0.12?BI.ocean_shelf:BI.ocean_deep)
            : water[i]===2 ? BI.lake
            : classify(Teff,M,elev[i]);
  }

  // plate-boundary segments (for tectonic view)
  const bounds=[];for(const[k,ts]of e2t){if(ts.length!==2)continue;const[a,b]=k.split(',').map(Number);if(plate[a]===plate[b])continue;bounds.push({a:cc[ts[0]],b:cc[ts[1]],c:(conv[a]+conv[b])/2})}

  let oceanA=0,totA=0;for(let i=0;i<N;i++){totA+=area[i];if(water[i]!==0)oceanA+=area[i]}
  return {
    meta:{seed,N,plateCount,oceanFraction:+oceanFraction.toFixed(3),waterFrac:+waterFrac.toFixed(3),
      seaCoverage:+(oceanA/totA).toFixed(3),axialTilt:+axialTilt.toFixed(3),
      axialTiltDeg:Math.round(axialTilt*180/Math.PI),solar:+solar.toFixed(3),
      planetRadius:+planetRadius.toFixed(3),age,ageSpan:+ageSpan.toFixed(3),seaLevelRaw:+sl.toFixed(4),
      rotationRate:+rotationRate.toFixed(3),windCells,coriolisSign,dayLengthRel:+(1/aOmega).toFixed(3)},
    N, V, cells, adj, area, plate, plateType:Uint8Array.from({length:N},(_,i)=>ptype(i)),
    plates:plates.map(p=>({center:p.center,oceanic:p.oceanic,axis:p.axis,speed:p.speed})),
    elev, water, temperature, moisture, seasonality, biome, conv, bounds, rivers,
    _euler:{tris:tris.length, Vc:N+1},
  };
}
