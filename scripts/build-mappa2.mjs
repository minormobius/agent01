#!/usr/bin/env node
// Build Mappa Mundi v2 — a *real* procedural world atlas, on a Voronoi mesh with
// plate tectonics and flow-routed rivers. Ships at /mappa2/ alongside v1 (/mappa/).
//
// Upgrades over v1 (which was a square-grid value-noise toy):
//   1. VORONOI POLYGON MESH (Delaunay via Bowyer–Watson). Countries are unions of
//      cells; coastlines/borders are crisp polygons, not pixel stairs.
//   2. PLATE TECTONICS. The 9 theme-wings are drifting plates. Where plates
//      converge, real mountain ranges rise — and that's exactly where the seam
//      surfaces (proteus, splice, …) live. Cratons (plate interiors) stay high
//      and old; that's where the oldest surfaces settle.
//   3. RIVERS via priority-flood depression filling + downhill flow accumulation.
//
// The generator is deterministic and DOM-free (between GEN markers) so it is
// self-tested here in node before shipping. Surface data is baked.
//
//   node scripts/build-mappa2.mjs   →   mappa2/index.html

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- 1. parse P + 2. wing model (shared with v1) ----------------------------
const html = readFileSync(join(root, 'index.html'), 'utf8');
const block = html.match(/var P = \[([\s\S]*?)\n  \];/)[1];
const surfaces = [];
for (const line of block.split('\n')) {
  const n = line.match(/n:'([^']+)'/); if (!n) continue;
  const g = (re, d) => { const m = line.match(re); return m ? m[1] : d; };
  surfaces.push({ n:n[1], u:g(/u:'([^']+)'/,''), c:g(/c:'([^']+)'/,''),
    k:+(g(/k:(\d+)/,'1')), a:g(/a:'([^']+)'/,'warm'), b:g(/b:'([^']+)'/,''), p:g(/p:'([^']+)'/,'') });
}
const WINGS = [
  { id:'social',  label:'The Social Layer', hue:205, cx:0.13, cy:0.30 },
  { id:'lenses',  label:'Lenses',           hue:265, cx:0.16, cy:0.66 },
  { id:'bench',   label:'The Workbench',    hue:32,  cx:0.18, cy:0.90 },
  { id:'cards',   label:'The Card Table',   hue:345, cx:0.45, cy:0.16 },
  { id:'studio',  label:'The Studio',       hue:158, cx:0.47, cy:0.43 },
  { id:'arcade',  label:'The Arcade',       hue:48,  cx:0.81, cy:0.17 },
  { id:'sandbox', label:'Simulations & Sandboxes', hue:122, cx:0.84, cy:0.46 },
  { id:'math',    label:'Interactive Mathematics', hue:190, cx:0.69, cy:0.81 },
  { id:'reading', label:'The Reading Room', hue:18,  cx:0.91, cy:0.83 },
];
const ASSIGN = {
  social:'poll airchat zoom bisk cat atmosphere disk feedgen tetr',
  lenses:'weft empathy judge novelty echo density seek cluster wild answers track rite fodder redact ask atlas lexicon list web signal ternary ternary2 ternary3',
  reading:'read flow post01 pendragon mabinogi pwyll branwen manawydan math gawain culhwch orfeo owain vitamerlini geomancy iching borges sticks tablet yarrow yijing soil',
  math:'geometry erdos guthkatz hadwiger runner meander temperley-lieb aztec markov descent kakeya capset szemeredi-trotter heilbronn borsuk viazovska elements antoine lattice horned basket',
  sandbox:'g emsim mol mole globe helix ship stretch scope corn garden fluoddity',
  arcade:'pokemon torus pac torpac knotpac inpac chess mmo draw paint range curve games gen pizza canvas',
  cards:'cards techtree grow recipe yum diffract',
  studio:'photo thread astro prism orb fractal music noise bakery sweat',
  bench:'org pm wave wiki crm bounty io time mega finance bogo agimet stocks wars cult flows phylo labglass os ocr j ai-edu',
};
const name2wing = {};
for (const [w, names] of Object.entries(ASSIGN)) for (const nm of names.split(/\s+/)) name2wing[nm] = w;
const SEAM = {
  proteus:['arcade','sandbox'], splice:['arcade','sandbox'], fluoddity:['sandbox','arcade'],
  garden:['sandbox','arcade'], weft:['lenses','social'], borges:['reading','studio'], canvas:['arcade','studio'],
};
const FALLBACK = { bluesky:'lenses', work:'bench', data:'bench', tools:'bench', games:'arcade' };
const wingOf = s => SEAM[s.n]?SEAM[s.n][0] : name2wing[s.n] || (s.p&&name2wing[s.p]) || (s.p&&SEAM[s.p]&&SEAM[s.p][0]) || FALLBACK[s.c] || 'bench';
const dates = surfaces.map(s=>s.b).filter(Boolean).map(d=>Date.parse(d));
const minB=Math.min(...dates), maxB=Math.max(...dates);
const foundNorm = s => s.b ? (Date.parse(s.b)-minB)/(maxB-minB||1) : 0.6;
const nodes = surfaces.map(s=>({ n:s.n, u:s.u, k:s.k, a:s.a, b:s.b||'',
  f:+foundNorm(s).toFixed(3), w:wingOf(s), w2:(SEAM[s.n]?SEAM[s.n][1]:null) }));

// ---- 3. the DOM-free world generator (Voronoi + tectonics + rivers) ---------
const GEN = String.raw`
const WW=1400, WH=900; // world coordinate domain
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash2(ix,iy,s){let n=(ix*374761393+iy*668265263+s*69069)|0;n=Math.imul(n^(n>>>13),1274126177);n=n^(n>>>16);return((n>>>0)/4294967296)}
function smooth(t){return t*t*(3-2*t)}
function vnoise(x,y,s){const x0=Math.floor(x),y0=Math.floor(y),fx=smooth(x-x0),fy=smooth(y-y0);
  const a=hash2(x0,y0,s),b=hash2(x0+1,y0,s),c=hash2(x0,y0+1,s),d=hash2(x0+1,y0+1,s);
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy}
function fbm(x,y,s){let v=0,a=0.5,f=1;for(let o=0;o<5;o++){v+=a*vnoise(x*f,y*f,s+o*131);f*=2;a*=0.5}return v}

// --- Delaunay (Bowyer–Watson), points = [{x,y}] → triangles [[i,j,k]] ---------
function circum(P,a,b,c){const ax=P[a].x,ay=P[a].y,bx=P[b].x,by=P[b].y,cx=P[c].x,cy=P[c].y;
  const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by)); if(Math.abs(d)<1e-12)return{x:0,y:0,r2:Infinity};
  const A=ax*ax+ay*ay,B=bx*bx+by*by,C=cx*cx+cy*cy;
  const ux=(A*(by-cy)+B*(cy-ay)+C*(ay-by))/d, uy=(A*(cx-bx)+B*(ax-cx)+C*(bx-ax))/d;
  return {x:ux,y:uy,r2:(ax-ux)*(ax-ux)+(ay-uy)*(ay-uy)}}
function triangulate(pts){
  const n=pts.length; let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(const p of pts){if(p.x<minX)minX=p.x;if(p.y<minY)minY=p.y;if(p.x>maxX)maxX=p.x;if(p.y>maxY)maxY=p.y}
  const dmax=Math.max(maxX-minX,maxY-minY)||1, mx=(minX+maxX)/2, my=(minY+maxY)/2;
  const P=pts.slice(); const i0=n,i1=n+1,i2=n+2;
  P.push({x:mx-20*dmax,y:my-dmax},{x:mx,y:my+20*dmax},{x:mx+20*dmax,y:my-dmax});
  let tris=[[i0,i1,i2]]; tris[0].cc=circum(P,i0,i1,i2);
  for(let i=0;i<n;i++){const p=P[i];const bad=[];
    for(const t of tris){const cc=t.cc;if((p.x-cc.x)*(p.x-cc.x)+(p.y-cc.y)*(p.y-cc.y)<cc.r2-1e-9)bad.push(t)}
    const edges=[];for(const t of bad){edges.push([t[0],t[1]],[t[1],t[2]],[t[2],t[0]])}
    const poly=[];for(let a=0;a<edges.length;a++){let sh=false;
      for(let b=0;b<edges.length;b++){if(a!==b&&edges[a][0]===edges[b][1]&&edges[a][1]===edges[b][0]){sh=true;break}}
      if(!sh)poly.push(edges[a])}
    const bs=new Set(bad); tris=tris.filter(t=>!bs.has(t));
    for(const e of poly){const nt=[e[0],e[1],i];nt.cc=circum(P,nt[0],nt[1],nt[2]);tris.push(nt)}}
  return {tris:tris.filter(t=>t[0]<n&&t[1]<n&&t[2]<n), P};
}
// clip polygon to the world rect (Sutherland–Hodgman) so no cell escapes the map
function clipRect(poly){
  const edges=[[1,0,0],[ -1,0,WW],[0,1,0],[0,-1,WH]]; // inside: a*x+b*y <= c  (rewritten below)
  let out=poly;
  const planes=[ p=>p.x>=0, p=>p.x<=WW, p=>p.y>=0, p=>p.y<=WH ];
  const isect=[ (a,b)=>({x:0,y:a.y+(b.y-a.y)*((0-a.x)/(b.x-a.x))}),
                (a,b)=>({x:WW,y:a.y+(b.y-a.y)*((WW-a.x)/(b.x-a.x))}),
                (a,b)=>({x:a.x+(b.x-a.x)*((0-a.y)/(b.y-a.y)),y:0}),
                (a,b)=>({x:a.x+(b.x-a.x)*((WH-a.y)/(b.y-a.y)),y:WH}) ];
  for(let k=0;k<4;k++){const inside=planes[k],cut=isect[k];const inp=out;out=[];
    for(let i=0;i<inp.length;i++){const A=inp[i],B=inp[(i+1)%inp.length];const ain=inside(A),bin=inside(B);
      if(ain){out.push(A);if(!bin)out.push(cut(A,B));}else if(bin){out.push(cut(A,B));}}
    if(out.length===0)break;}
  return out;
}

function MinHeap(){this.a=[]}
MinHeap.prototype.push=function(k,v){const a=this.a;a.push([k,v]);let i=a.length-1;
  while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;const t=a[p];a[p]=a[i];a[i]=t;i=p}};
MinHeap.prototype.pop=function(){const a=this.a,top=a[0],last=a.pop();
  if(a.length){a[0]=last;let i=0;for(;;){let l=2*i+1,r=l+1,s=i;
    if(l<a.length&&a[l][0]<a[s][0])s=l;if(r<a.length&&a[r][0]<a[s][0])s=r;if(s===i)break;const t=a[s];a[s]=a[i];a[i]=t;i=s}}return top};
MinHeap.prototype.size=function(){return this.a.length};

// --- the world ---------------------------------------------------------------
function makeWorld(seed, wings, nodes){
  const rnd=mulberry32(seed);
  // jittered-grid sample points (Poisson-ish, deterministic) + frame ring
  const target=1500, cols=Math.round(Math.sqrt(target*WW/WH)), rows=Math.round(target/cols);
  const cw=WW/cols, ch=WH/rows; const P=[]; const N0=cols*rows;
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++) P.push({x:(i+0.5+(rnd()-0.5)*0.8)*cw, y:(j+0.5+(rnd()-0.5)*0.8)*ch});
  const Nreal=P.length;
  const frame=[]; const fr=12;
  for(let i=0;i<=fr;i++){frame.push({x:-WW*0.3+(WW*1.6)*i/fr,y:-WH*0.3});frame.push({x:-WW*0.3+(WW*1.6)*i/fr,y:WH*1.3});
    frame.push({x:-WW*0.3,y:-WH*0.3+(WH*1.6)*i/fr});frame.push({x:WW*1.3,y:-WH*0.3+(WH*1.6)*i/fr});}
  for(const f of frame)P.push(f);
  const N=P.length;

  // mesh
  const {tris}=triangulate(P);
  const cc=tris.map(t=>t.cc);
  const inc=Array.from({length:N},()=>[]);
  tris.forEach((t,ti)=>{for(const v of t)inc[v].push(ti)});
  const adj=Array.from({length:N},()=>new Set());
  const emap=new Map(); // "i,j" → [triIdx,...] for Voronoi edges
  function ekey(a,b){return a<b?a+','+b:b+','+a}
  tris.forEach((t,ti)=>{const e=[[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]];
    for(const[a,b]of e){adj[a].add(b);adj[b].add(a);const k=ekey(a,b);(emap.get(k)||emap.set(k,[]).get(k)).push(ti)}});
  const A=adj.map(s=>[...s]);
  // cell polygons (ordered circumcenters), clipped to rect; frame sites → null
  const cells=new Array(N).fill(null);
  for(let i=0;i<Nreal;i++){const p=P[i];const cs=inc[i].map(ti=>({a:Math.atan2(cc[ti].y-p.y,cc[ti].x-p.x),c:cc[ti]}));
    cs.sort((u,v)=>u.a-v.a); let poly=cs.map(c=>c.c); if(poly.length>=3) cells[i]=clipRect(poly);}
  // Voronoi edges (for coastline)
  const vedges=[]; for(const[k,t]of emap){if(t.length!==2)continue;const[a,b]=k.split(',').map(Number);
    if(a>=Nreal&&b>=Nreal)continue; vedges.push({i:a,j:b,ax:cc[t[0]].x,ay:cc[t[0]].y,bx:cc[t[1]].x,by:cc[t[1]].y})}

  // PLATES = wings. assign each real site to nearest wing seed.
  const seeds=wings.map(w=>({x:w.cx*WW,y:w.cy*WH}));
  const drift=wings.map(()=>{const a=rnd()*6.283;return {x:Math.cos(a)*(0.6+rnd()*0.8),y:Math.sin(a)*(0.6+rnd()*0.8)}});
  const plate=new Int8Array(N).fill(-1);
  for(let i=0;i<Nreal;i++){let bp=0,bd=1e18;for(let s=0;s<seeds.length;s++){const dx=P[i].x-seeds[s].x,dy=P[i].y-seeds[s].y,d=dx*dx+dy*dy;if(d<bd){bd=d;bp=s}}plate[i]=bp}

  // boundary stress: convergence of drift across plate boundaries → uplift
  const stress=new Float32Array(N);
  for(let i=0;i<Nreal;i++){let s=0,c=0;for(const j of A[i]){if(j>=Nreal||plate[j]===plate[i])continue;
    const dx=P[j].x-P[i].x,dy=P[j].y-P[i].y,L=Math.hypot(dx,dy)||1;
    const rel=(drift[plate[i]].x-drift[plate[j]].x)*(dx/L)+(drift[plate[i]].y-drift[plate[j]].y)*(dy/L);
    s+=rel;c++} if(c)stress[i]=s/c;}
  // diffuse stress inland to make ranges/rifts with falloff
  let field=Float32Array.from(stress);
  for(let it=0;it<6;it++){const nf=Float32Array.from(field);
    for(let i=0;i<Nreal;i++){let m=field[i];for(const j of A[i])if(j<Nreal)m=field[i]>=0?Math.max(m,field[j]*0.78):Math.min(m,field[j]*0.78);nf[i]=m}field=nf}

  // elevation = plate craton bump + tectonic uplift + noise
  const elev=new Float32Array(N);
  const platCen=seeds; // craton cores at plate seeds
  for(let i=0;i<Nreal;i++){const p=P[i];
    const dcx=p.x-platCen[plate[i]].x,dcy=p.y-platCen[plate[i]].y, dc=Math.hypot(dcx,dcy);
    const craton=0.42*Math.exp(-(dc*dc)/(2*(WW*0.20)*(WW*0.20)));
    const tect=field[i]*0.55;
    const noise=(fbm(p.x*0.006,p.y*0.006,seed)-0.5)*0.5;
    const edge=-Math.max(0,(Math.hypot(p.x/WW-0.5,p.y/WH-0.5)-0.34))*1.1; // oceans at the rim
    elev[i]=0.18+craton+tect+noise+edge;}
  // sea level for ~55% land
  const sl=Float32Array.from(elev.subarray(0,Nreal)).sort()[Math.floor(Nreal*0.45)];
  const land=new Uint8Array(N); for(let i=0;i<Nreal;i++)land[i]=elev[i]>sl?1:0;
  const mtn=new Uint8Array(N); for(let i=0;i<Nreal;i++)mtn[i]=land[i]&&field[i]>0.18&&elev[i]>sl+0.12?1:0;
  // hillshade factor per site (E-W gradient)
  const shade=new Float32Array(N);
  for(let i=0;i<Nreal;i++){if(!land[i])continue;let eR=elev[i],best=1e9;for(const j of A[i])if(j<Nreal){const d=P[j].x-P[i].x;if(d>0&&d<best){best=d;eR=elev[j]}}shade[i]=Math.max(-0.16,Math.min(0.16,(elev[i]-eR)*1.4))}

  // RIVERS: priority-flood fill, then downhill flow accumulation -------------
  const filled=Float32Array.from(elev); const inq=new Uint8Array(N); const heap=new MinHeap();
  for(let i=0;i<Nreal;i++)if(!land[i]){inq[i]=1;heap.push(filled[i],i)}
  while(heap.size()){const[e,i]=heap.pop();for(const j of A[i]){if(j>=Nreal||inq[j])continue;
    filled[j]=Math.max(elev[j],e+1e-4);inq[j]=1;heap.push(filled[j],j)}}
  const down=new Int32Array(N).fill(-1);
  for(let i=0;i<Nreal;i++){if(!land[i])continue;let lo=filled[i],bj=-1;for(const j of A[i]){if(j>=Nreal)continue;if(filled[j]<lo){lo=filled[j];bj=j}}down[i]=bj}
  const order=[]; for(let i=0;i<Nreal;i++)if(land[i])order.push(i);
  order.sort((a,b)=>filled[b]-filled[a]);
  const flow=new Float32Array(N); for(let i=0;i<Nreal;i++)if(land[i])flow[i]=1;
  for(const i of order){const j=down[i];if(j>=0&&land[j])flow[j]+=flow[i]}
  const rivers=[]; const RT=14;
  for(const i of order){const j=down[i];if(j>=0&&land[j]&&flow[i]>RT)rivers.push({ax:P[i].x,ay:P[i].y,bx:P[j].x,by:P[j].y,w:Math.min(5,0.6+Math.sqrt(flow[i])/6)})}

  // CITIES: place surfaces on their plate's land -----------------------------
  const landByW={}; for(const w of wings)landByW[w.id]=[];
  for(let i=0;i<Nreal;i++)if(land[i])landByW[wings[plate[i]].id].push(i);
  const cenByW={}; for(let wi=0;wi<wings.length;wi++){const ls=landByW[wings[wi].id];let sx=0,sy=0;
    for(const i of ls){sx+=P[i].x;sy+=P[i].y} cenByW[wings[wi].id]=ls.length?{x:sx/ls.length,y:sy/ls.length}:{x:seeds[wi].x,y:seeds[wi].y};}
  function seamSites(a,b){const ai=wings.findIndex(w=>w.id===a),bi=wings.findIndex(w=>w.id===b);const out=[];
    for(let i=0;i<Nreal;i++){if(!land[i]||(plate[i]!==ai&&plate[i]!==bi))continue;
      let touch=false;for(const j of A[i])if(j<Nreal&&(plate[j]===ai||plate[j]===bi)&&plate[j]!==plate[i]){touch=true;break}
      if(touch)out.push(i)} return out;}
  const byW={}; for(const w of wings)byW[w.id]=[]; for(const nd of nodes)byW[nd.w].push(nd);
  const cities=[];
  for(const w of wings){const mem=byW[w.id].slice().sort((p,q)=>q.k-p.k);const cand=landByW[w.id];const placed=[];const cen=cenByW[w.id];
    mem.forEach((nd,rank)=>{let site=-1;
      if(nd.w2){const ss=seamSites(nd.w,nd.w2);if(ss.length)site=ss[Math.floor(rnd()*ss.length)]}
      if(site<0){ if(rank===0&&cand.length){let bd=1e18;for(const i of cand){const d=(P[i].x-cen.x)**2+(P[i].y-cen.y)**2;if(d<bd){bd=d;site=i}}}
        else if(cand.length){let best=-1,bs=-1e18;for(let t=0;t<26;t++){const i=cand[Math.floor(rnd()*cand.length)];
          let mind=1e18;for(const p of placed){const dx=P[p].x-P[i].x,dy=P[p].y-P[i].y;mind=Math.min(mind,dx*dx+dy*dy)}
          const dCen=Math.hypot(P[i].x-cen.x,P[i].y-cen.y);const ageBias=(nd.f-0.5)*dCen*0.9;
          const sc=Math.sqrt(mind)+ageBias+rnd()*40; if(sc>bs){bs=sc;best=i}} site=best;}
        else site=0; }
      if(site<0)site=cand.length?cand[0]:0; placed.push(site);
      cities.push({n:nd.n,u:nd.u,k:nd.k,a:nd.a,f:nd.f,b:nd.b,w:nd.w,w2:nd.w2,x:P[site].x,y:P[site].y,capital:rank===0});});}

  return {WW,WH,Nreal,P,cells,land,elev,plate,mtn,shade,vedges,rivers,cities,sl,cen:cenByW};
}
`;

// ---- 4. SELF-TEST in node ---------------------------------------------------
{
  const S={}; new Function('exports', GEN+'\nexports.makeWorld=makeWorld;')(S);
  let ok=true;
  for(const seed of [1,7,42,2026]){
    const w=S.makeWorld(seed,WINGS,nodes);
    const realCells=w.cells.slice(0,w.Nreal);
    const goodCells=realCells.filter(c=>c&&c.length>=3&&c.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).length;
    const landN=w.land.reduce((a,b)=>a+b,0), landFrac=landN/w.Nreal;
    const empty=WINGS.filter(wg=>!w.cities.some(c=>c.w===wg.id)).map(x=>x.id);
    const placed=w.cities.length, finite=w.cities.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y));
    const seams=w.cities.filter(c=>c.w2).length, mtns=w.mtn.reduce((a,b)=>a+b,0);
    console.log(`seed ${String(seed).padStart(4)}: sites=${w.Nreal} cells=${goodCells}/${w.Nreal} land=${(landFrac*100|0)}% cities=${placed}/144 finite=${finite} rivers=${w.rivers.length} mtns=${mtns} seams=${seams} empty=[${empty}]`);
    if(placed!==144||!finite||empty.length||goodCells<w.Nreal*0.97||w.rivers.length<5){ok=false}
  }
  if(!ok){console.error('\n✗ v2 self-test FAILED');process.exit(1)}
  console.log('✓ v2 self-test passed (valid mesh, all countries have land, 144 cities, rivers present)\n');
}

// ---- 5. emit the page (UI shell shared with v1; renderer is polygon-based) ---
const DATA = JSON.stringify({ wings:WINGS, nodes, minB, maxB });
const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#0c0a07">
<title>mino.mobi · mappa mundi II</title>
<meta name="description" content="A procedurally-generated world on a Voronoi mesh with plate tectonics and rivers. Theme-wings are tectonic plates; surfaces are cities.">
<style>
:root{--ink:#2a2118;--gold:#a9802f;--parch:#e8dcc0}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
body{background:#0c0a07;color:var(--parch);font:14px/1.5 ui-sans-serif,system-ui,sans-serif;overflow:hidden;
  overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#map{position:fixed;inset:0;display:block;cursor:grab;background:#0c0a07;touch-action:none}
#map.drag{cursor:grabbing}
header{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;align-items:baseline;gap:12px;padding:12px 18px;pointer-events:none;
  background:linear-gradient(#0c0a07cc,#0c0a0700)}
header a{pointer-events:auto;color:var(--gold);text-decoration:none;font-weight:700;letter-spacing:.05em}
header h1{font:600 16px/1 ui-serif,'Iowan Old Style',Georgia,serif;letter-spacing:.04em;color:var(--parch)}
header .sub{color:#b7a988;font-size:12.5px;font-style:italic}
header .right{margin-left:auto;display:flex;gap:8px;pointer-events:auto}
button,input{font:inherit}
.btn{background:#1a140cdd;border:1px solid #3a2e1c;color:var(--parch);padding:6px 11px;border-radius:6px;cursor:pointer;font-size:12.5px}
.btn:hover{border-color:var(--gold)}
.btn.on{border-color:var(--gold);color:var(--gold)}
#q{background:#1a140cdd;border:1px solid #3a2e1c;color:var(--parch);padding:6px 11px;border-radius:999px;width:150px;outline:none;font-size:12.5px}
#q:focus{border-color:var(--gold)}
footer{position:fixed;bottom:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:14px;padding:10px 18px;pointer-events:none;
  background:linear-gradient(#0c0a0700,#0c0a07dd)}
.scrub{pointer-events:auto;display:flex;align-items:center;gap:10px;flex:1;max-width:520px}
.scrub input[type=range]{flex:1;accent-color:var(--gold)}
.era{font-size:12px;color:#b7a988;font-variant-numeric:tabular-nums;min-width:92px}
.legend{pointer-events:auto;display:flex;flex-wrap:wrap;gap:5px 7px;justify-content:flex-end;max-width:46vw}
.chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid #3a2e1c;background:#1a140ccc;font-size:11.5px;color:#b7a988;cursor:pointer}
.chip .dot{width:8px;height:8px;border-radius:2px}.chip.off{opacity:.35}
#tip{position:fixed;z-index:9;pointer-events:none;opacity:0;transform:translate(-50%,-135%);background:#19120bf5;border:1px solid #3a2e1c;
  border-radius:7px;padding:6px 9px;max-width:230px;font-size:12px;transition:opacity .1s}
#tip b{color:var(--gold)}#tip .m{color:#9c8a6c;font-size:11px}#tip .open{color:var(--gold);font-size:10.5px}
@media (max-width:640px){
  header{padding:8px 10px;gap:6px;flex-wrap:wrap}header h1{font-size:14px}header .sub{display:none}
  header .right{width:100%;margin-left:0;margin-top:2px}#q{flex:1;width:auto}
  footer{flex-direction:column;align-items:stretch;gap:8px;padding:8px 10px 12px}.scrub{max-width:none}
  .legend{max-width:none;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px}.legend::-webkit-scrollbar{display:none}.chip{flex:0 0 auto}
}
</style>
</head>
<body>
<canvas id="map"></canvas>
<header>
  <a href="https://mino.mobi/">mino.mobi</a>
  <h1>mappa mundi <span style="color:var(--gold)">II</span></h1>
  <span class="sub">— Voronoi mesh · plate tectonics · rivers. wings are plates; surfaces are cities</span>
  <span class="right"><input id="q" placeholder="find a city…" autocomplete="off"><button class="btn" id="plates" title="toggle plate-boundary glow">plates</button><button class="btn" id="reseed">↻ new world</button></span>
</header>
<div id="tip"></div>
<footer>
  <div class="scrub"><button class="btn" id="play">▶ chronicle</button>
    <input type="range" id="time" min="0" max="1000" value="1000"><span class="era" id="era">all founded</span></div>
  <div class="legend" id="legend"></div>
</footer>
<script>
const D=${DATA};
/*GEN_START*/${GEN}/*GEN_END*/
const cv=document.getElementById('map'),ctx=cv.getContext('2d'),tip=document.getElementById('tip');
let DPR=Math.min(2,devicePixelRatio||1),W=0,H=0,world=null,seed=(Math.random()*1e9)|0;
let view={x:0,y:0,s:1},hot=null,selected=null,query='',active=new Set(D.wings.map(w=>w.id)),tcut=1,playing=false,showPlates=false;
const terr=document.createElement('canvas');let S=1,ox=0,oy=0;
const hsl=(h,s,l,a)=>'hsl('+h+' '+s+'% '+l+'%'+(a!=null?' / '+a:'')+')';
const wing=id=>D.wings.find(w=>w.id===id);
function fit(){S=Math.max(W/WW,H/WH);ox=(W-WW*S)/2;oy=(H-WH*S)/2}
function build(){world=makeWorld(seed,D.wings,D.nodes);fit();renderTerrain();draw()}

function landColor(i){const w=wing(D.wings[world.plate[i]].id);const t=Math.min(1,(world.elev[i]-world.sl)/0.55);
  let l=44+t*26,s=28+t*8; if(world.mtn[i]){l=70-t*6;s=12} if(!active.has(w.id)){l=26+t*6;s=8} return hsl(w.hue,s,l)}
function renderTerrain(){
  terr.width=WW;terr.height=WH;const tx=terr.getContext('2d');
  tx.fillStyle='#10222b';tx.fillRect(0,0,WW,WH); // sea base
  // ocean depth shading
  for(let i=0;i<world.Nreal;i++){const c=world.cells[i];if(!c||world.land[i])continue;
    const d=Math.max(0,world.sl-world.elev[i]);tx.fillStyle=hsl(205,40,Math.max(9,21-d*26));poly(tx,c);tx.fill()}
  // land cells
  for(let i=0;i<world.Nreal;i++){const c=world.cells[i];if(!c||!world.land[i])continue;
    tx.fillStyle=landColor(i);poly(tx,c);tx.fill();
    const sh=world.shade[i];if(sh>0.02){tx.fillStyle='rgba(255,246,225,'+sh+')';poly(tx,c);tx.fill()}
    else if(sh<-0.02){tx.fillStyle='rgba(0,0,0,'+(-sh)+')';poly(tx,c);tx.fill()}}
  // coastline ink
  tx.lineWidth=1.6;tx.strokeStyle='rgba(18,12,7,.75)';tx.beginPath();
  for(const e of world.vedges){const li=world.land[e.i],lj=world.land[e.j];if(li!==lj){tx.moveTo(e.ax,e.ay);tx.lineTo(e.bx,e.by)}}tx.stroke();
  // plate boundaries (optional glow)
  if(showPlates){tx.lineWidth=2.4;tx.strokeStyle='rgba(220,120,60,.5)';tx.beginPath();
    for(const e of world.vedges){if(world.plate[e.i]!==world.plate[e.j]&&world.land[e.i]&&world.land[e.j]){tx.moveTo(e.ax,e.ay);tx.lineTo(e.bx,e.by)}}tx.stroke()}
  // rivers
  tx.strokeStyle='#3b6b86';tx.lineCap='round';
  for(const r of world.rivers){tx.lineWidth=r.w;tx.beginPath();tx.moveTo(r.ax,r.ay);tx.lineTo(r.bx,r.by);tx.stroke()}
  // mountain carets
  tx.strokeStyle='rgba(40,30,18,.6)';tx.lineWidth=1.1;tx.beginPath();
  for(let i=0;i<world.Nreal;i++){if(!world.mtn[i])continue;const p=world.P[i];const h=4+world.elev[i]*5;
    tx.moveTo(p.x-h*0.7,p.y+h*0.5);tx.lineTo(p.x,p.y-h*0.6);tx.lineTo(p.x+h*0.7,p.y+h*0.5)}tx.stroke();
}
function poly(c,pts){c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let k=1;k<pts.length;k++)c.lineTo(pts[k].x,pts[k].y);c.closePath()}

function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#0c0a07';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.s,view.s);ctx.imageSmoothingEnabled=true;
  ctx.drawImage(terr,0,0,WW,WH,ox,oy,WW*S,WH*S);
  // country labels
  ctx.textAlign='center';
  for(const w of D.wings){if(!active.has(w.id))continue;const cen=world.cen[w.id];const x=ox+cen.x*S,y=oy+cen.y*S;
    ctx.font='italic 14px ui-serif,Georgia,serif';ctx.fillStyle=hsl(w.hue,30,84,.5);ctx.fillText(w.label.toUpperCase(),x,y)}
  // cities
  for(const c of world.cities){const vis=active.has(c.w)&&c.f<=tcut&&(!query||c.n.toLowerCase().includes(query));
    const x=ox+c.x*S,y=oy+c.y*S,r=(c.capital?3.4:2.0)+Math.sqrt(c.k)*0.9;
    if(!vis){if(c.f<=tcut){ctx.fillStyle='rgba(180,165,130,.10)';ctx.beginPath();ctx.arc(x,y,1.4,0,7);ctx.fill()}continue}
    const w=wing(c.w);ctx.beginPath();ctx.arc(x,y,r,0,7);
    ctx.fillStyle=c.w2?hsl((w.hue+wing(c.w2).hue)/2,55,62):hsl(w.hue,52,hot===c?72:58);ctx.fill();
    ctx.lineWidth=c.capital?1.4:0.8;ctx.strokeStyle=c===hot?'#fff':'rgba(20,14,8,.7)';ctx.stroke();
    if(c.capital){ctx.strokeStyle=hsl(w.hue,60,82,.9);ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r+2.6,0,7);ctx.stroke()}
    if(c===hot||c.capital||view.s>1.6||c.k>=15){ctx.font=(c.capital?'600 ':'')+'10px ui-serif,Georgia,serif';
      ctx.fillStyle='rgba(20,13,7,.92)';ctx.fillText(c.n,x,y+r+10);ctx.fillStyle=hsl(w.hue,40,90,.95);ctx.fillText(c.n,x,y+r+9.4)}}
  ctx.restore();
}

// --- interaction (pointer events: pan / pinch / tap) ---
function s2w(px,py){return{x:(px-view.x)/view.s,y:(py-view.y)/view.s}}
function pick(px,py,touch){const p=s2w(px,py);let best=null,bd=1e18;
  for(const c of world.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;
    const x=ox+c.x*S,y=oy+c.y*S,d=(x-p.x)**2+(y-p.y)**2;if(d<bd){bd=d;best=c}}
  return bd<((touch?22:13)/view.s)**2?best:null}
const cz=s=>Math.max(0.5,Math.min(9,s));
function showTip(c,px,py,t){tip.style.opacity=1;tip.style.left=Math.max(80,Math.min(innerWidth-80,px))+'px';tip.style.top=Math.max(54,py)+'px';
  const seam=c.w2?'border town · '+wing(c.w).label+' ✕ '+wing(c.w2).label:wing(c.w).label;
  tip.innerHTML='<b>'+c.n+'</b> '+(c.capital?'★':'')+'<br><span class="m">'+seam+' · founded '+(c.b||'—')+'</span>'+(c.u?'<br><span class="open">'+(t?'tap again to open ↗':'click to open ↗')+'</span>':'')}
const ptrs=new Map();let gesture=null,tapStart=null;const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===1){tapStart={x:e.clientX,y:e.clientY,t:Date.now(),touch:e.pointerType!=='mouse'};gesture={mode:'pan',x:e.clientX,y:e.clientY,vx:view.x,vy:view.y};cv.classList.add('drag')}
  else if(ptrs.size===2){const p=[...ptrs.values()];gesture={mode:'pinch',d:dist(p[0],p[1]),s:view.s,vx:view.x,vy:view.y};tapStart=null;tip.style.opacity=0}});
cv.addEventListener('pointermove',e=>{if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gesture&&gesture.mode==='pinch'&&ptrs.size>=2){const p=[...ptrs.values()];const ns=cz(gesture.s*(dist(p[0],p[1])/(gesture.d||1)));
    const cmx=(p[0].x+p[1].x)/2,cmy=(p[0].y+p[1].y)/2,rx=(cmx-gesture.vx)/gesture.s,ry=(cmy-gesture.vy)/gesture.s;
    view.s=ns;view.x=cmx-rx*ns;view.y=cmy-ry*ns;draw();return}
  if(gesture&&gesture.mode==='pan'&&ptrs.size===1){view.x=gesture.vx+(e.clientX-gesture.x);view.y=gesture.vy+(e.clientY-gesture.y);
    if(tapStart&&Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>8){tapStart=null;tip.style.opacity=0}draw();return}
  if(e.pointerType==='mouse'&&ptrs.size===0){const c=pick(e.clientX,e.clientY);if(c!==hot){hot=c;draw()}
    if(c){showTip(c,e.clientX,e.clientY,false);cv.style.cursor='pointer'}else{if(!selected)tip.style.opacity=0;cv.style.cursor='grab'}}});
function endPtr(e){ptrs.delete(e.pointerId);
  if(ptrs.size===0){cv.classList.remove('drag');
    if(tapStart&&Date.now()-tapStart.t<400){const c=pick(tapStart.x,tapStart.y,tapStart.touch);
      if(c){if(!tapStart.touch){if(c.u)open(c.u,'_blank')}else if(selected===c&&c.u){open(c.u,'_blank')}else{selected=c;hot=c;showTip(c,tapStart.x,tapStart.y,true);draw()}}
      else{selected=null;hot=null;tip.style.opacity=0;draw()}}
    gesture=null;tapStart=null}
  else if(ptrs.size===1){const p=[...ptrs.values()][0];gesture={mode:'pan',x:p.x,y:p.y,vx:view.x,vy:view.y};tapStart=null}}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY<0?1.12:1/1.12,ns=cz(view.s*f),rx=(e.clientX-view.x)/view.s,ry=(e.clientY-view.y)/view.s;
  view.x=e.clientX-rx*ns;view.y=e.clientY-ry*ns;view.s=ns;draw()},{passive:false});
cv.addEventListener('dblclick',e=>{const ns=cz(view.s*1.8),rx=(e.clientX-view.x)/view.s,ry=(e.clientY-view.y)/view.s;view.x=e.clientX-rx*ns;view.y=e.clientY-ry*ns;view.s=ns;draw()});

// time scrubber
const tEl=document.getElementById('time'),eraEl=document.getElementById('era');
function eraLabel(){if(tcut>=1)return 'all founded';return '↤ '+new Date(D.minB+(D.maxB-D.minB)*tcut).toISOString().slice(0,10)}
tEl.addEventListener('input',()=>{tcut=+tEl.value/1000;eraEl.textContent=eraLabel();draw()});
document.getElementById('play').addEventListener('click',()=>{playing=!playing;if(playing){tcut=0;tEl.value=0;step()}});
function step(){if(!playing)return;tcut=Math.min(1,tcut+0.006);tEl.value=tcut*1000;eraEl.textContent=eraLabel();draw();
  if(tcut>=1){playing=false;document.getElementById('play').textContent='▶ chronicle';return}document.getElementById('play').textContent='⏸';requestAnimationFrame(step)}
// legend
const lg=document.getElementById('legend');
for(const w of D.wings){const c=document.createElement('span');c.className='chip';c.dataset.w=w.id;
  c.innerHTML='<span class="dot" style="background:'+hsl(w.hue,50,58)+'"></span>'+w.label;
  c.onclick=()=>{if(active.size===1&&active.has(w.id))active=new Set(D.wings.map(x=>x.id));else active=new Set([w.id]);
    for(const ch of lg.children)ch.classList.toggle('off',!active.has(ch.dataset.w));renderTerrain();draw()};lg.appendChild(c)}
document.getElementById('q').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();draw()});
document.getElementById('reseed').addEventListener('click',()=>{seed=(Math.random()*1e9)|0;build()});
document.getElementById('plates').addEventListener('click',e=>{showPlates=!showPlates;e.target.classList.toggle('on',showPlates);renderTerrain();draw()});
function resize(){DPR=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';if(world){fit();draw()}}
addEventListener('resize',resize);resize();build();
</script>
</body>
</html>
`;
mkdirSync(join(root,'mappa2'),{recursive:true});
writeFileSync(join(root,'mappa2','index.html'),page);
console.log('wrote mappa2/index.html  ('+(page.length/1024|0)+' KB,', nodes.length,'cities across',WINGS.length,'plates)');
