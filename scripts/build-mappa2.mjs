#!/usr/bin/env node
// Mappa Mundi v3 — real plate tectonics (continental + oceanic plates), with a
// flat map, a TECTONIC view, and an ORB (globe) view. Ships at /mappa2/.
//
// THE MODEL (v3):
//   • 9 CONTINENTAL plates = the theme-wings. High base + craton → always land.
//   • ~12 OCEANIC "spacer" plates seeded in the gaps and around the rim = the
//     SEAS between the countries. Low base → always water.
//   • Type-aware boundary tectonics:
//       cont–cont convergent → mountain RANGE (diffused inland, has width)
//       cont–ocean convergent → coastal arc on the continent + TRENCH offshore
//       ocean–ocean divergent → mid-ocean RIDGE;  cont–cont divergent → RIFT
//   • Rivers: priority-flood depression fill + downhill flow accumulation.
//   • Countries/cities ride on the continental plates; oceanic plates are seas.
//
// Deterministic + DOM-free generator (between GEN markers), self-tested in node.
//   node scripts/build-mappa2.mjs   →   mappa2/index.html

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- parse P + wing model (shared with v1) ----------------------------------
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
  { id:'social',  label:'The Social Layer', hue:205, cx:0.14, cy:0.28 },
  { id:'lenses',  label:'Lenses',           hue:265, cx:0.15, cy:0.62 },
  { id:'bench',   label:'The Workbench',    hue:32,  cx:0.20, cy:0.90 },
  { id:'cards',   label:'The Card Table',   hue:345, cx:0.46, cy:0.15 },
  { id:'studio',  label:'The Studio',       hue:158, cx:0.49, cy:0.45 },
  { id:'arcade',  label:'The Arcade',       hue:48,  cx:0.83, cy:0.16 },
  { id:'sandbox', label:'Simulations & Sandboxes', hue:122, cx:0.86, cy:0.45 },
  { id:'math',    label:'Interactive Mathematics', hue:190, cx:0.66, cy:0.85 },
  { id:'reading', label:'The Reading Room', hue:18,  cx:0.93, cy:0.85 },
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

// ---- the DOM-free world generator -------------------------------------------
const GEN = String.raw`
const WW=1400, WH=900;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash2(ix,iy,s){let n=(ix*374761393+iy*668265263+s*69069)|0;n=Math.imul(n^(n>>>13),1274126177);n=n^(n>>>16);return((n>>>0)/4294967296)}
function sm(t){return t*t*(3-2*t)}
function vn(x,y,s){const x0=Math.floor(x),y0=Math.floor(y),fx=sm(x-x0),fy=sm(y-y0);
  const a=hash2(x0,y0,s),b=hash2(x0+1,y0,s),c=hash2(x0,y0+1,s),d=hash2(x0+1,y0+1,s);
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy}
function fbm(x,y,s){let v=0,a=0.5,f=1;for(let o=0;o<5;o++){v+=a*vn(x*f,y*f,s+o*131);f*=2;a*=0.5}return v}

function circum(P,a,b,c){const ax=P[a].x,ay=P[a].y,bx=P[b].x,by=P[b].y,cx=P[c].x,cy=P[c].y;
  const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by)); if(Math.abs(d)<1e-12)return{x:0,y:0,r2:Infinity};
  const A=ax*ax+ay*ay,B=bx*bx+by*by,C=cx*cx+cy*cy;
  const ux=(A*(by-cy)+B*(cy-ay)+C*(ay-by))/d, uy=(A*(cx-bx)+B*(ax-cx)+C*(bx-ax))/d;
  return {x:ux,y:uy,r2:(ax-ux)*(ax-ux)+(ay-uy)*(ay-uy)}}
function triangulate(pts){
  const n=pts.length; let mnX=1e9,mnY=1e9,mxX=-1e9,mxY=-1e9;
  for(const p of pts){if(p.x<mnX)mnX=p.x;if(p.y<mnY)mnY=p.y;if(p.x>mxX)mxX=p.x;if(p.y>mxY)mxY=p.y}
  const dm=Math.max(mxX-mnX,mxY-mnY)||1, mx=(mnX+mxX)/2, my=(mnY+mxY)/2;
  const P=pts.slice(),i0=n,i1=n+1,i2=n+2;
  P.push({x:mx-20*dm,y:my-dm},{x:mx,y:my+20*dm},{x:mx+20*dm,y:my-dm});
  let T=[[i0,i1,i2]];T[0].cc=circum(P,i0,i1,i2);
  for(let i=0;i<n;i++){const p=P[i],bad=[];
    for(const t of T){const cc=t.cc;if((p.x-cc.x)*(p.x-cc.x)+(p.y-cc.y)*(p.y-cc.y)<cc.r2-1e-9)bad.push(t)}
    const ed=[];for(const t of bad)ed.push([t[0],t[1]],[t[1],t[2]],[t[2],t[0]]);
    const poly=[];for(let a=0;a<ed.length;a++){let sh=false;for(let b=0;b<ed.length;b++){if(a!==b&&ed[a][0]===ed[b][1]&&ed[a][1]===ed[b][0]){sh=true;break}}if(!sh)poly.push(ed[a])}
    const bs=new Set(bad);T=T.filter(t=>!bs.has(t));
    for(const e of poly){const nt=[e[0],e[1],i];nt.cc=circum(P,nt[0],nt[1],nt[2]);T.push(nt)}}
  return T.filter(t=>t[0]<n&&t[1]<n&&t[2]<n);
}
function clipRect(poly){
  const planes=[p=>p.x>=0,p=>p.x<=WW,p=>p.y>=0,p=>p.y<=WH];
  const cut=[(a,b)=>({x:0,y:a.y+(b.y-a.y)*((0-a.x)/(b.x-a.x))}),(a,b)=>({x:WW,y:a.y+(b.y-a.y)*((WW-a.x)/(b.x-a.x))}),
            (a,b)=>({x:a.x+(b.x-a.x)*((0-a.y)/(b.y-a.y)),y:0}),(a,b)=>({x:a.x+(b.x-a.x)*((WH-a.y)/(b.y-a.y)),y:WH})];
  let out=poly;
  for(let k=0;k<4;k++){const ins=planes[k],ct=cut[k],inp=out;out=[];
    for(let i=0;i<inp.length;i++){const A=inp[i],B=inp[(i+1)%inp.length],ai=ins(A),bi=ins(B);
      if(ai){out.push(A);if(!bi)out.push(ct(A,B))}else if(bi)out.push(ct(A,B))}
    if(out.length===0)break}
  return out;
}
function MinHeap(){this.a=[]}
MinHeap.prototype.push=function(k,v){const a=this.a;a.push([k,v]);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;const t=a[p];a[p]=a[i];a[i]=t;i=p}};
MinHeap.prototype.pop=function(){const a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){let l=2*i+1,r=l+1,s=i;if(l<a.length&&a[l][0]<a[s][0])s=l;if(r<a.length&&a[r][0]<a[s][0])s=r;if(s===i)break;const t=a[s];a[s]=a[i];a[i]=t;i=s}}return top};
MinHeap.prototype.size=function(){return this.a.length};

function makeWorld(seed, wings, nodes){
  const rnd=mulberry32(seed);
  const target=1500, cols=Math.round(Math.sqrt(target*WW/WH)), rows=Math.round(target/cols);
  const cw=WW/cols, ch=WH/rows, P=[];
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)P.push({x:(i+0.5+(rnd()-0.5)*0.8)*cw,y:(j+0.5+(rnd()-0.5)*0.8)*ch});
  const Nreal=P.length;
  const fr=12;for(let i=0;i<=fr;i++){P.push({x:-WW*0.3+WW*1.6*i/fr,y:-WH*0.3},{x:-WW*0.3+WW*1.6*i/fr,y:WH*1.3},{x:-WW*0.3,y:-WH*0.3+WH*1.6*i/fr},{x:WW*1.3,y:-WH*0.3+WH*1.6*i/fr})}
  const N=P.length;

  const T=triangulate(P);const cc=T.map(t=>t.cc);
  const inc=Array.from({length:N},()=>[]);T.forEach((t,ti)=>{for(const v of t)inc[v].push(ti)});
  const adj=Array.from({length:N},()=>new Set());const emap=new Map();
  const ek=(a,b)=>a<b?a+','+b:b+','+a;
  T.forEach((t,ti)=>{const e=[[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]];for(const[a,b]of e){adj[a].add(b);adj[b].add(a);const k=ek(a,b);(emap.get(k)||emap.set(k,[]).get(k)).push(ti)}});
  const A=adj.map(s=>[...s]);
  const cells=new Array(N).fill(null);
  for(let i=0;i<Nreal;i++){const p=P[i];const cs=inc[i].map(ti=>({a:Math.atan2(cc[ti].y-p.y,cc[ti].x-p.x),c:cc[ti]}));cs.sort((u,v)=>u.a-v.a);let poly=cs.map(c=>c.c);if(poly.length>=3)cells[i]=clipRect(poly)}
  const vedges=[];for(const[k,t]of emap){if(t.length!==2)continue;const[a,b]=k.split(',').map(Number);if(a>=Nreal&&b>=Nreal)continue;vedges.push({i:a,j:b,ax:cc[t[0]].x,ay:cc[t[0]].y,bx:cc[t[1]].x,by:cc[t[1]].y})}

  // PLATES: 9 continental (wings) + oceanic spacer plates ---------------------
  const cont=wings.map(w=>({type:0,x:w.cx*WW,y:w.cy*WH})); // type 0 = continental
  const oA=[[-0.13,0.5],[1.13,0.5],[0.5,-0.13],[0.5,1.13],[-0.12,-0.12],[1.12,-0.12],[-0.12,1.12],[1.12,1.12],
    [0.31,0.30],[0.31,0.62],[0.33,0.88],[0.64,0.30],[0.67,0.58],[0.66,0.12],[0.50,0.70],[0.78,0.66]]; // rim + interior channel seas
  const ocean=oA.map(([ax,ay])=>({type:1,x:(ax+(rnd()-0.5)*0.05)*WW,y:(ay+(rnd()-0.5)*0.05)*WH})); // type 1 = oceanic
  const plates=cont.concat(ocean); const NC=cont.length;
  for(const pl of plates){const a=rnd()*6.283;pl.dx=Math.cos(a)*(0.6+rnd()*0.8);pl.dy=Math.sin(a)*(0.6+rnd()*0.8)}
  const plate=new Int16Array(N).fill(-1);
  for(let i=0;i<Nreal;i++){let bp=0,bd=1e18;for(let s=0;s<plates.length;s++){const dx=P[i].x-plates[s].x,dy=P[i].y-plates[s].y,d=dx*dx+dy*dy;if(d<bd){bd=d;bp=s}}plate[i]=bp}
  const ptype=i=>plates[plate[i]].type;

  // tectonics: per-site convergence + type-aware mountain / trench / ridge -----
  const conv=new Float32Array(N), mountSrc=new Float32Array(N), localF=new Float32Array(N);
  for(let i=0;i<Nreal;i++){let cs=0,nn=0,mt=0,lf=0;const ti=ptype(i);
    for(const j of A[i]){if(j>=Nreal||plate[j]===plate[i])continue;const tj=ptype(j);
      const dx=P[j].x-P[i].x,dy=P[j].y-P[i].y,L=Math.hypot(dx,dy)||1;
      const rel=(plates[plate[i]].dx-plates[plate[j]].dx)*(dx/L)+(plates[plate[i]].dy-plates[plate[j]].dy)*(dy/L);
      cs+=rel;nn++;
      if(rel>0){ // convergent
        if(ti===0&&tj===0)mt+=rel*1.0;            // cont-cont: mountains
        else if(ti===0&&tj===1)mt+=rel*0.75;       // cont side of subduction: coastal arc
        else if(ti===1&&tj===0)lf-=rel*1.15;       // ocean side: trench
        else lf+=rel*0.25;                          // ocean-ocean: island arc
      } else { const dv=-rel;
        if(ti===1)lf+=dv*0.35;                      // mid-ocean ridge
        else lf-=dv*0.45;                           // continental rift
      }}
    if(nn){conv[i]=cs/nn; if(ti===0&&mt>0)mountSrc[i]=mt; localF[i]=lf}}
  // diffuse mountains inland over continental sites (gives ranges width)
  let mf=Float32Array.from(mountSrc);
  for(let it=0;it<3;it++){const nf=Float32Array.from(mf);for(let i=0;i<Nreal;i++){if(ptype(i)!==0)continue;let m=mf[i];for(const j of A[i])if(j<Nreal&&ptype(j)===0)m=Math.max(m,mf[j]*0.66);nf[i]=m}mf=nf}

  // elevation: continents always above water, oceans below --------------------
  const elev=new Float32Array(N);
  for(let i=0;i<Nreal;i++){const p=P[i],ti=ptype(i);
    let e; const noise=(fbm(p.x*0.006,p.y*0.006,seed)-0.5)*(ti===0?0.20:0.30);
    if(ti===0){const pl=plates[plate[i]],dc=Math.hypot(p.x-pl.x,p.y-pl.y);
      const craton=0.30*Math.exp(-(dc*dc)/(2*(WW*0.22)*(WW*0.22)));
      e=0.24+craton+mf[i]*0.62+localF[i]*0.5+noise;
    } else { e=-0.55+mf[i]*0.55+localF[i]*0.6+noise; }
    elev[i]=e}
  const sl=0.0;
  const land=new Uint8Array(N);for(let i=0;i<Nreal;i++)land[i]=elev[i]>sl?1:0;
  const mtn=new Uint8Array(N);for(let i=0;i<Nreal;i++)mtn[i]=land[i]&&mf[i]>0.85?1:0; // snowcaps: high tectonic peaks only
  const shade=new Float32Array(N);
  for(let i=0;i<Nreal;i++){if(!land[i])continue;let eR=elev[i],best=1e9;for(const j of A[i])if(j<Nreal){const d=P[j].x-P[i].x;if(d>0&&d<best){best=d;eR=elev[j]}}shade[i]=Math.max(-0.16,Math.min(0.16,(elev[i]-eR)*1.3))}

  // rivers --------------------------------------------------------------------
  const filled=Float32Array.from(elev),inq=new Uint8Array(N),heap=new MinHeap();
  for(let i=0;i<Nreal;i++)if(!land[i]){inq[i]=1;heap.push(filled[i],i)}
  while(heap.size()){const[e,i]=heap.pop();for(const j of A[i]){if(j>=Nreal||inq[j])continue;filled[j]=Math.max(elev[j],e+1e-4);inq[j]=1;heap.push(filled[j],j)}}
  const down=new Int32Array(N).fill(-1);
  for(let i=0;i<Nreal;i++){if(!land[i])continue;let lo=filled[i],bj=-1;for(const j of A[i]){if(j>=Nreal)continue;if(filled[j]<lo){lo=filled[j];bj=j}}down[i]=bj}
  const order=[];for(let i=0;i<Nreal;i++)if(land[i])order.push(i);order.sort((a,b)=>filled[b]-filled[a]);
  const flow=new Float32Array(N);for(let i=0;i<Nreal;i++)if(land[i])flow[i]=1;
  for(const i of order){const j=down[i];if(j>=0&&land[j])flow[j]+=flow[i]}
  const rivers=[];for(const i of order){const j=down[i];if(j>=0&&land[j]&&flow[i]>16)rivers.push({ax:P[i].x,ay:P[i].y,bx:P[j].x,by:P[j].y,w:Math.min(5,0.6+Math.sqrt(flow[i])/6)})}

  // cities (on continental plates only) ---------------------------------------
  const landByW={};for(const w of wings)landByW[w.id]=[];
  for(let i=0;i<Nreal;i++)if(land[i]&&plate[i]<NC)landByW[wings[plate[i]].id].push(i);
  const cenByW={};for(let wi=0;wi<wings.length;wi++){const ls=landByW[wings[wi].id];let sx=0,sy=0;for(const i of ls){sx+=P[i].x;sy+=P[i].y}cenByW[wings[wi].id]=ls.length?{x:sx/ls.length,y:sy/ls.length}:{x:plates[wi].x,y:plates[wi].y}}
  function seamSites(a,b){const ai=wings.findIndex(w=>w.id===a),bi=wings.findIndex(w=>w.id===b),out=[];
    for(let i=0;i<Nreal;i++){if(!land[i]||(plate[i]!==ai&&plate[i]!==bi))continue;let tch=false;for(const j of A[i])if(j<Nreal&&(plate[j]===ai||plate[j]===bi)&&plate[j]!==plate[i]){tch=true;break}if(tch)out.push(i)}return out}
  const byW={};for(const w of wings)byW[w.id]=[];for(const nd of nodes)byW[nd.w].push(nd);
  const cities=[];
  for(const w of wings){const mem=byW[w.id].slice().sort((p,q)=>q.k-p.k),cand=landByW[w.id],placed=[],cen=cenByW[w.id];
    mem.forEach((nd,rank)=>{let site=-1;
      if(nd.w2){const ss=seamSites(nd.w,nd.w2);if(ss.length)site=ss[Math.floor(rnd()*ss.length)]}
      if(site<0){if(rank===0&&cand.length){let bd=1e18;for(const i of cand){const d=(P[i].x-cen.x)**2+(P[i].y-cen.y)**2;if(d<bd){bd=d;site=i}}}
        else if(cand.length){let best=-1,bs=-1e18;for(let t=0;t<26;t++){const i=cand[Math.floor(rnd()*cand.length)];let mind=1e18;for(const p of placed){const dx=P[p].x-P[i].x,dy=P[p].y-P[i].y;mind=Math.min(mind,dx*dx+dy*dy)}const dC=Math.hypot(P[i].x-cen.x,P[i].y-cen.y),ab=(nd.f-0.5)*dC*0.9,scv=Math.sqrt(mind)+ab+rnd()*40;if(scv>bs){bs=scv;best=i}}site=best}
        else site=0}
      if(site<0)site=cand.length?cand[0]:0;placed.push(site);
      cities.push({n:nd.n,u:nd.u,k:nd.k,a:nd.a,f:nd.f,b:nd.b,w:nd.w,w2:nd.w2,x:P[site].x,y:P[site].y,capital:rank===0})})}

  return {WW,WH,Nreal,NC,P,cells,land,elev,plate,ptype:Array.from({length:Nreal},(_,i)=>ptype(i)),mtn,shade,conv,vedges,rivers,cities,sl,cen:cenByW,plates};
}
`;

// ---- SELF-TEST --------------------------------------------------------------
{
  const Sx={}; new Function('exports', GEN+'\nexports.makeWorld=makeWorld;')(Sx);
  let ok=true;
  for(const seed of [1,7,42,2026,99]){
    const w=Sx.makeWorld(seed,WINGS,nodes);
    const good=w.cells.slice(0,w.Nreal).filter(c=>c&&c.length>=3&&c.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).length;
    const landN=w.land.reduce((a,b)=>a+b,0),landFrac=landN/w.Nreal;
    // per-wing land fraction (continental sites)
    const wingLand={}; for(let wi=0;wi<WINGS.length;wi++)wingLand[wi]={l:0,t:0};
    let oceL=0,oceT=0,deep=0;
    for(let i=0;i<w.Nreal;i++){const p=w.plate[i];if(p<w.NC){wingLand[p].t++;if(w.land[i])wingLand[p].l++}else{oceT++;if(!w.land[i])oceL++}if(w.elev[i]<-0.6)deep++}
    const minWing=Math.min(...Object.values(wingLand).map(o=>o.t?o.l/o.t:1));
    const oceSea=oceT?oceL/oceT:1;
    const empty=WINGS.filter(wg=>!w.cities.some(c=>c.w===wg.id)).map(x=>x.id);
    const placed=w.cities.length,finite=w.cities.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y));
    const mtns=w.mtn.reduce((a,b)=>a+b,0);
    console.log(`seed ${String(seed).padStart(4)}: cells=${good}/${w.Nreal} land=${(landFrac*100|0)}% minWingLand=${(minWing*100|0)}% oceanIsSea=${(oceSea*100|0)}% deepTrench=${deep} cities=${placed}/144 mtns=${mtns} rivers=${w.rivers.length} empty=[${empty}]`);
    if(placed!==144||!finite||empty.length||good<w.Nreal*0.97||minWing<0.45||oceSea<0.85||w.rivers.length<4) ok=false;
  }
  if(!ok){console.error('\n✗ v3 self-test FAILED');process.exit(1)}
  console.log('✓ v3 self-test passed (continents above water, oceanic spacer plates below, trenches, 144 cities)\n');
}

// ---- emit the page ----------------------------------------------------------
const DATA = JSON.stringify({ wings:WINGS, nodes, minB, maxB });
const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#0c0a07">
<title>mino.mobi · mappa mundi II</title>
<meta name="description" content="A procedurally-generated world: continental plates as countries, oceanic spacer plates as seas, real tectonics, rivers — flat map, tectonic view, and a draggable globe.">
<style>
:root{--gold:#a9802f;--parch:#e8dcc0}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
body{background:#0c0a07;color:var(--parch);font:14px/1.5 ui-sans-serif,system-ui,sans-serif;overflow:hidden;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#map{position:fixed;inset:0;display:block;cursor:grab;background:#0c0a07;touch-action:none}
#map.drag{cursor:grabbing}
header{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:10px;padding:11px 16px;pointer-events:none;background:linear-gradient(#0c0a07cc,#0c0a0700)}
header a{pointer-events:auto;color:var(--gold);text-decoration:none;font-weight:700;letter-spacing:.05em}
header h1{font:600 16px/1 ui-serif,'Iowan Old Style',Georgia,serif;letter-spacing:.04em}
.modes{display:flex;gap:4px;pointer-events:auto;background:#140f08aa;border:1px solid #2c2316;border-radius:8px;padding:3px}
.modes button{background:none;border:0;color:#b7a988;padding:4px 11px;border-radius:6px;cursor:pointer;font-size:12.5px}
.modes button.on{background:#2a2114;color:var(--gold)}
.right{margin-left:auto;display:flex;gap:8px;pointer-events:auto}
button,input{font:inherit}
.btn{background:#1a140cdd;border:1px solid #3a2e1c;color:var(--parch);padding:6px 11px;border-radius:6px;cursor:pointer;font-size:12.5px}
.btn:hover{border-color:var(--gold)}.btn.on{border-color:var(--gold);color:var(--gold)}
#q{background:#1a140cdd;border:1px solid #3a2e1c;color:var(--parch);padding:6px 11px;border-radius:999px;width:138px;outline:none;font-size:12.5px}
#q:focus{border-color:var(--gold)}
footer{position:fixed;bottom:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:14px;padding:10px 16px;pointer-events:none;background:linear-gradient(#0c0a0700,#0c0a07dd)}
.scrub{pointer-events:auto;display:flex;align-items:center;gap:10px;flex:1;max-width:500px}
.scrub input[type=range]{flex:1;accent-color:var(--gold)}
.era{font-size:12px;color:#b7a988;font-variant-numeric:tabular-nums;min-width:90px}
.legend{pointer-events:auto;display:flex;flex-wrap:wrap;gap:5px 7px;justify-content:flex-end;max-width:44vw}
.chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid #3a2e1c;background:#1a140ccc;font-size:11.5px;color:#b7a988;cursor:pointer}
.chip .dot{width:8px;height:8px;border-radius:2px}.chip.off{opacity:.35}
#tip{position:fixed;z-index:9;pointer-events:none;opacity:0;transform:translate(-50%,-135%);background:#19120bf5;border:1px solid #3a2e1c;border-radius:7px;padding:6px 9px;max-width:230px;font-size:12px;transition:opacity .1s}
#tip b{color:var(--gold)}#tip .m{color:#9c8a6c;font-size:11px}#tip .open{color:var(--gold);font-size:10.5px}
#tkey{position:fixed;left:16px;bottom:64px;z-index:6;background:#140f08e0;border:1px solid #2c2316;border-radius:8px;padding:8px 11px;font-size:11.5px;color:#b7a988;display:none}
#tkey.show{display:block}#tkey b{color:var(--parch)}#tkey i{display:inline-block;width:18px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
@media (max-width:680px){
  header{padding:8px 9px;gap:6px;flex-wrap:wrap}header h1{display:none}
  .right{width:100%;margin-left:0;margin-top:2px}#q{flex:1;width:auto}
  footer{flex-direction:column;align-items:stretch;gap:8px;padding:8px 9px 12px}.scrub{max-width:none}
  .legend{max-width:none;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px}.legend::-webkit-scrollbar{display:none}.chip{flex:0 0 auto}
  #tkey{bottom:auto;top:96px}
}
</style>
</head>
<body>
<canvas id="map"></canvas>
<header>
  <a href="https://mino.mobi/">mino.mobi</a>
  <span class="modes"><button data-m="map" class="on">Map</button><button data-m="tectonic">Tectonic</button><button data-m="orb">Orb</button></span>
  <span class="right"><input id="q" placeholder="find a city…" autocomplete="off"><button class="btn" id="reseed">↻ new world</button></span>
</header>
<div id="tkey"><b>Plate boundaries</b><br><i style="background:#e0603c"></i>convergent · ranges/trenches<br><i style="background:#3fb6a0"></i>divergent · rifts/ridges<br><i style="background:#d8b24a"></i>transform<br><span style="opacity:.7">▸ arrows = plate drift · cool fill = oceanic plate</span></div>
<div id="tip"></div>
<footer>
  <div class="scrub"><button class="btn" id="play">▶ chronicle</button>
    <input type="range" id="time" min="0" max="1000" value="1000"><span class="era" id="era">all founded</span></div>
  <div class="legend" id="legend"></div>
</footer>
<script>
const D=${DATA};
/*GEN_START*/${GEN}/*GEN_END*/
const cv=document.getElementById('map'),ctx=cv.getContext('2d'),tip=document.getElementById('tip'),tkey=document.getElementById('tkey');
let DPR=Math.min(2,devicePixelRatio||1),W=0,H=0,world=null,seed=(Math.random()*1e9)|0,mode='map';
let view={x:0,y:0,s:1},hot=null,selected=null,query='',active=new Set(D.wings.map(w=>w.id)),tcut=1,playing=false;
let yaw=0.3,pitch=0.35,orbR=320,spin=true,spinRAF=0;
const terr=document.createElement('canvas');let S=1,ox=0,oy=0;
const hsl=(h,s,l,a)=>'hsl('+h+' '+s+'% '+l+'%'+(a!=null?' / '+a:'')+')';
const wing=id=>D.wings.find(w=>w.id===id);
function fit(){S=Math.max(W/WW,H/WH);ox=(W-WW*S)/2;oy=(H-WH*S)/2}
function build(){world=makeWorld(seed,D.wings,D.nodes);fit();renderTerr();draw()}

// per-cell colour as [h,s,l] (shared by flat + orb) -----------------------------
function cellHSL(i){
  if(!world.land[i]){const d=Math.max(0,world.sl-world.elev[i]);return [205,44,Math.max(8,21-d*20)]}
  const w=wing(D.wings[world.plate[i]].id),t=Math.min(1,(world.elev[i]-world.sl)/0.85);
  let l=38+t*26,s=36-t*9;if(world.mtn[i]){l=72;s=10}if(!active.has(w.id)){l=24+t*5;s=7}return [w.hue,s,l]}
function poly(c,p){c.beginPath();c.moveTo(p[0].x,p[0].y);for(let k=1;k<p.length;k++)c.lineTo(p[k].x,p[k].y);c.closePath()}

// offscreen terrain (map) OR tectonic raster -----------------------------------
function renderTerr(){
  terr.width=WW;terr.height=WH;const tx=terr.getContext('2d');
  if(mode==='tectonic'){renderTect(tx);return}
  tx.fillStyle='#0e2029';tx.fillRect(0,0,WW,WH);
  for(let i=0;i<world.Nreal;i++){const c=world.cells[i];if(!c)continue;const[h,s,l]=cellHSL(i);tx.fillStyle=hsl(h,s,l);poly(tx,c);tx.fill();
    if(world.land[i]){const sh=world.shade[i];if(sh>0.02){tx.fillStyle='rgba(255,247,228,'+sh+')';poly(tx,c);tx.fill()}else if(sh<-0.02){tx.fillStyle='rgba(0,0,0,'+(-sh)+')';poly(tx,c);tx.fill()}}}
  tx.lineWidth=1.5;tx.strokeStyle='rgba(16,11,6,.7)';tx.beginPath();
  for(const e of world.vedges)if(world.land[e.i]!==world.land[e.j]){tx.moveTo(e.ax,e.ay);tx.lineTo(e.bx,e.by)}tx.stroke();
  tx.strokeStyle='#3e6f8a';tx.lineCap='round';for(const r of world.rivers){tx.lineWidth=r.w;tx.beginPath();tx.moveTo(r.ax,r.ay);tx.lineTo(r.bx,r.by);tx.stroke()}
  // toned-down mountain carets: only true peaks, small, faint
  tx.strokeStyle='rgba(58,44,26,.34)';tx.lineWidth=0.9;tx.beginPath();let mc=0;
  for(let i=0;i<world.Nreal;i++){if(!world.mtn[i])continue;if((mc++%3))continue;const p=world.P[i],h=2.4+world.elev[i]*2.4;tx.moveTo(p.x-h*0.55,p.y+h*0.38);tx.lineTo(p.x,p.y-h*0.46);tx.lineTo(p.x+h*0.55,p.y+h*0.38)}tx.stroke();
}
function renderTect(tx){
  tx.fillStyle='#11161c';tx.fillRect(0,0,WW,WH);
  for(let i=0;i<world.Nreal;i++){const c=world.cells[i];if(!c)continue;const p=world.plate[i];
    if(world.ptype[i]===0){const w=D.wings[p];tx.fillStyle=hsl(w.hue,22,world.land[i]?46:32)}
    else tx.fillStyle=hsl(210,34,26+(p%3)*3);
    poly(tx,c);tx.fill()}
  // boundaries by type
  for(const e of world.vedges){if(world.plate[e.i]===world.plate[e.j])continue;const cnv=(world.conv[e.i]+world.conv[e.j])/2;
    tx.lineWidth=cnv>0.18?2.6:1.8;tx.strokeStyle=cnv>0.18?'#e0603c':(cnv<-0.18?'#3fb6a0':'#d8b24a');
    tx.beginPath();tx.moveTo(e.ax,e.ay);tx.lineTo(e.bx,e.by);tx.stroke()}
}

function draw(){if(mode==='orb'){drawOrb();return}
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#0c0a07';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.s,view.s);ctx.imageSmoothingEnabled=true;
  ctx.drawImage(terr,0,0,WW,WH,ox,oy,WW*S,WH*S);
  if(mode==='tectonic'){ // drift arrows
    ctx.lineCap='round';for(const pl of world.plates){const x=ox+pl.x*S,y=oy+pl.y*S,L=26;
      ctx.strokeStyle=pl.type===0?'rgba(233,220,192,.8)':'rgba(120,180,210,.8)';ctx.lineWidth=2;
      const ex=x+pl.dx*L,ey=y+pl.dy*L;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
      const ang=Math.atan2(pl.dy,pl.dx);ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-7*Math.cos(ang-0.4),ey-7*Math.sin(ang-0.4));ctx.moveTo(ex,ey);ctx.lineTo(ex-7*Math.cos(ang+0.4),ey-7*Math.sin(ang+0.4));ctx.stroke()}
  }
  ctx.textAlign='center';
  for(const w of D.wings){if(!active.has(w.id))continue;const cen=world.cen[w.id],x=ox+cen.x*S,y=oy+cen.y*S;
    ctx.font='italic 14px ui-serif,Georgia,serif';ctx.fillStyle=hsl(w.hue,30,84,mode==='tectonic'?.85:.5);ctx.fillText(w.label.toUpperCase(),x,y)}
  if(mode==='map')for(const c of world.cities){const vis=active.has(c.w)&&c.f<=tcut&&(!query||c.n.toLowerCase().includes(query));
    const x=ox+c.x*S,y=oy+c.y*S,r=(c.capital?3.4:2)+Math.sqrt(c.k)*0.9;
    if(!vis){if(c.f<=tcut){ctx.fillStyle='rgba(180,165,130,.10)';ctx.beginPath();ctx.arc(x,y,1.4,0,7);ctx.fill()}continue}
    cityDot(ctx,c,x,y,r)}
  ctx.restore();
}
function cityDot(g,c,x,y,r){const w=wing(c.w);g.beginPath();g.arc(x,y,r,0,7);
  g.fillStyle=c.w2?hsl((w.hue+wing(c.w2).hue)/2,55,62):hsl(w.hue,52,hot===c?72:58);g.fill();
  g.lineWidth=c.capital?1.4:0.8;g.strokeStyle=c===hot?'#fff':'rgba(20,14,8,.7)';g.stroke();
  if(c.capital){g.strokeStyle=hsl(w.hue,60,82,.9);g.lineWidth=1;g.beginPath();g.arc(x,y,r+2.6,0,7);g.stroke()}
  if(c===hot||c.capital||view.s>1.6||c.k>=15){g.font=(c.capital?'600 ':'')+'10px ui-serif,Georgia,serif';g.textAlign='center';
    g.fillStyle='rgba(20,13,7,.92)';g.fillText(c.n,x,y+r+10);g.fillStyle=hsl(w.hue,40,90,.95);g.fillText(c.n,x,y+r+9.4)}}

// --- ORB (orthographic globe, vanilla canvas) ---------------------------------
function llOf(x,y){return [(x/WW-0.5)*Math.PI*1.96,(0.5-y/WH)*Math.PI*0.98]}
function sph(lon,lat){const cl=Math.cos(lat);return [cl*Math.sin(lon),Math.sin(lat),cl*Math.cos(lon)]}
function rotp(p){const cy=Math.cos(yaw),sy=Math.sin(yaw),x1=cy*p[0]+sy*p[2],z1=-sy*p[0]+cy*p[2];
  const cp=Math.cos(pitch),sp=Math.sin(pitch);return [x1,cp*p[1]-sp*z1,sp*p[1]+cp*z1]}
const LIGHT=(()=>{const v=[-0.5,0.62,0.6],l=Math.hypot(...v);return v.map(c=>c/l)})();
function drawOrb(){
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#08080c';ctx.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2,R=orbR;
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R+1,0,7);ctx.fillStyle='#0a1a24';ctx.fill();
  // collect front-facing cells, painter-sort by depth
  const front=[];for(let i=0;i<world.Nreal;i++){const c=world.cells[i];if(!c)continue;const n=rotp(sph(...llOf(world.P[i].x,world.P[i].y)));if(n[2]>0.04)front.push([i,n])}
  front.sort((a,b)=>a[1][2]-b[1][2]);
  for(const[i,n]of front){const c=world.cells[i];const nd=Math.max(0,n[0]*LIGHT[0]+n[1]*LIGHT[1]+n[2]*LIGHT[2]);
    const[h,s,l]=cellHSL(i);ctx.fillStyle=hsl(h,s,Math.min(96,l*(0.5+0.62*nd)));
    ctx.beginPath();let st=false;for(const v of c){const q=rotp(sph(...llOf(v.x,v.y)));const sx=cx+R*q[0],sy=cy-R*q[1];if(!st){ctx.moveTo(sx,sy);st=true}else ctx.lineTo(sx,sy)}ctx.closePath();ctx.fill()}
  // limb shade + highlight
  const g=ctx.createRadialGradient(cx-R*0.3,cy-R*0.35,R*0.1,cx,cy,R);g.addColorStop(0,'rgba(255,250,235,.10)');g.addColorStop(0.7,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.45)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fill();
  ctx.restore();
  // cities on the near hemisphere
  for(const c of world.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;
    const q=rotp(sph(...llOf(c.x,c.y)));if(q[2]<=0.05)continue;const x=cx+R*q[0],y=cy-R*q[1],r=(c.capital?2.6:1.6)+Math.sqrt(c.k)*0.7;
    const w=wing(c.w);ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle=hsl(w.hue,55,hot===c?75:60);ctx.fill();
    ctx.lineWidth=0.8;ctx.strokeStyle=c===hot?'#fff':'rgba(10,8,5,.7)';ctx.stroke();
    if(c===hot||(c.capital&&q[2]>0.4)){ctx.font='10px ui-serif,Georgia,serif';ctx.textAlign='center';ctx.fillStyle='rgba(8,6,3,.9)';ctx.fillText(c.n,x,y-r-3.6);ctx.fillStyle=hsl(w.hue,45,92);ctx.fillText(c.n,x,y-r-4)}}
}
function orbSpin(){if(mode!=='orb'||!spin){spinRAF=0;return}yaw+=0.0016;draw();spinRAF=requestAnimationFrame(orbSpin)}

// --- interaction --------------------------------------------------------------
function s2w(px,py){return{x:(px-view.x)/view.s,y:(py-view.y)/view.s}}
function pick(px,py,touch){if(mode==='orb')return pickOrb(px,py,touch);if(mode!=='map')return null;
  const p=s2w(px,py);let best=null,bd=1e18;for(const c of world.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;const x=ox+c.x*S,y=oy+c.y*S,d=(x-p.x)**2+(y-p.y)**2;if(d<bd){bd=d;best=c}}return bd<((touch?22:13)/view.s)**2?best:null}
function pickOrb(px,py,touch){const cx=W/2,cy=H/2,R=orbR;let best=null,bd=1e18;
  for(const c of world.cities){if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;const q=rotp(sph(...llOf(c.x,c.y)));if(q[2]<=0.05)continue;const x=cx+R*q[0],y=cy-R*q[1],d=(x-px)**2+(y-py)**2;if(d<bd){bd=d;best=c}}return bd<(touch?22:14)**2?best:null}
const cz=s=>Math.max(0.5,Math.min(9,s));
function showTip(c,px,py,t){tip.style.opacity=1;tip.style.left=Math.max(80,Math.min(innerWidth-80,px))+'px';tip.style.top=Math.max(54,py)+'px';
  const seam=c.w2?'border town · '+wing(c.w).label+' ✕ '+wing(c.w2).label:wing(c.w).label;
  tip.innerHTML='<b>'+c.n+'</b> '+(c.capital?'★':'')+'<br><span class="m">'+seam+' · founded '+(c.b||'—')+'</span>'+(c.u?'<br><span class="open">'+(t?'tap again to open ↗':'click to open ↗')+'</span>':'')}
const ptrs=new Map();let gesture=null,tapStart=null;const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});spin=false;
  if(ptrs.size===1){tapStart={x:e.clientX,y:e.clientY,t:Date.now(),touch:e.pointerType!=='mouse'};
    gesture=mode==='orb'?{mode:'rot',x:e.clientX,y:e.clientY,yaw,pitch}:{mode:'pan',x:e.clientX,y:e.clientY,vx:view.x,vy:view.y};cv.classList.add('drag')}
  else if(ptrs.size===2){const p=[...ptrs.values()];gesture={mode:'pinch',d:dist(p[0],p[1]),s:view.s,r:orbR,vx:view.x,vy:view.y};tapStart=null;tip.style.opacity=0}});
cv.addEventListener('pointermove',e=>{if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gesture&&gesture.mode==='pinch'&&ptrs.size>=2){const p=[...ptrs.values()],f=dist(p[0],p[1])/(gesture.d||1);
    if(mode==='orb'){orbR=Math.max(120,Math.min(900,gesture.r*f))}else{const ns=cz(gesture.s*f),cmx=(p[0].x+p[1].x)/2,cmy=(p[0].y+p[1].y)/2,rx=(cmx-gesture.vx)/gesture.s,ry=(cmy-gesture.vy)/gesture.s;view.s=ns;view.x=cmx-rx*ns;view.y=cmy-ry*ns}draw();return}
  if(gesture&&gesture.mode==='rot'&&ptrs.size===1){yaw=gesture.yaw-(e.clientX-gesture.x)*0.006;pitch=Math.max(-1.45,Math.min(1.45,gesture.pitch+(e.clientY-gesture.y)*0.006));
    if(tapStart&&Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>8)tapStart=null;draw();return}
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
  else if(ptrs.size===1){const p=[...ptrs.values()][0];gesture=mode==='orb'?{mode:'rot',x:p.x,y:p.y,yaw,pitch}:{mode:'pan',x:p.x,y:p.y,vx:view.x,vy:view.y};tapStart=null}}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY<0?1.12:1/1.12;
  if(mode==='orb'){orbR=Math.max(120,Math.min(900,orbR*f))}else{const ns=cz(view.s*f),rx=(e.clientX-view.x)/view.s,ry=(e.clientY-view.y)/view.s;view.x=e.clientX-rx*ns;view.y=e.clientY-ry*ns;view.s=ns}draw()},{passive:false});
cv.addEventListener('dblclick',e=>{if(mode==='orb')return;const ns=cz(view.s*1.8),rx=(e.clientX-view.x)/view.s,ry=(e.clientY-view.y)/view.s;view.x=e.clientX-rx*ns;view.y=e.clientY-ry*ns;view.s=ns;draw()});

// modes
document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;
  document.querySelectorAll('.modes button').forEach(x=>x.classList.toggle('on',x===b));
  tkey.classList.toggle('show',mode==='tectonic');tip.style.opacity=0;hot=selected=null;
  if(mode!=='orb')renderTerr();
  if(mode==='orb'){spin=true;if(!spinRAF)spinRAF=requestAnimationFrame(orbSpin)}else{spin=false}
  draw()});
// time scrubber
const tEl=document.getElementById('time'),eraEl=document.getElementById('era');
function eraLabel(){return tcut>=1?'all founded':'↤ '+new Date(D.minB+(D.maxB-D.minB)*tcut).toISOString().slice(0,10)}
tEl.addEventListener('input',()=>{tcut=+tEl.value/1000;eraEl.textContent=eraLabel();draw()});
document.getElementById('play').addEventListener('click',()=>{playing=!playing;if(playing){tcut=0;tEl.value=0;step()}});
function step(){if(!playing)return;tcut=Math.min(1,tcut+0.006);tEl.value=tcut*1000;eraEl.textContent=eraLabel();draw();
  if(tcut>=1){playing=false;document.getElementById('play').textContent='▶ chronicle';return}document.getElementById('play').textContent='⏸';requestAnimationFrame(step)}
// legend
const lg=document.getElementById('legend');
for(const w of D.wings){const c=document.createElement('span');c.className='chip';c.dataset.w=w.id;
  c.innerHTML='<span class="dot" style="background:'+hsl(w.hue,50,58)+'"></span>'+w.label;
  c.onclick=()=>{if(active.size===1&&active.has(w.id))active=new Set(D.wings.map(x=>x.id));else active=new Set([w.id]);
    for(const ch of lg.children)ch.classList.toggle('off',!active.has(ch.dataset.w));if(mode!=='orb')renderTerr();draw()};lg.appendChild(c)}
document.getElementById('q').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();draw()});
document.getElementById('reseed').addEventListener('click',()=>{seed=(Math.random()*1e9)|0;build()});
function resize(){DPR=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';orbR=Math.min(W,H)*0.42;if(world){fit();draw()}}
addEventListener('resize',resize);resize();build();
</script>
</body>
</html>
`;
mkdirSync(join(root,'mappa2'),{recursive:true});
writeFileSync(join(root,'mappa2','index.html'),page);
console.log('wrote mappa2/index.html  ('+(page.length/1024|0)+' KB,', nodes.length,'cities · 9 continental + 12 oceanic plates)');
