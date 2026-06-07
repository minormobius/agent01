#!/usr/bin/env node
// Build the Mappa Mundi — a procedurally-generated world atlas of mino.mobi.
//
// The nine theme-wings become COUNTRIES; every surface is a CITY inside its
// country. Tectonic/settlement history is real: a surface's founding date (`b`)
// places old surfaces in the ancient interior (cratons) and new ones out on the
// frontier coasts, and a time-scrubber plays the world filling in by founding
// order. Boundary-crossing surfaces (proteus, splice, …) are border towns up in
// the mountains between two countries.
//
// World generation is deterministic (seeded) and DOM-free (between GEN markers)
// so it can be self-tested here in node before shipping. Surface data is baked;
// the terrain is generated client-side on load (and reseedable).
//
//   node scripts/build-mappa.mjs
//
// Output: mappa/index.html (self-contained). Re-run after editing index.html's P.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- 1. parse the canonical P array -----------------------------------------
const html = readFileSync(join(root, 'index.html'), 'utf8');
const block = html.match(/var P = \[([\s\S]*?)\n  \];/)[1];
const surfaces = [];
for (const line of block.split('\n')) {
  const n = line.match(/n:'([^']+)'/); if (!n) continue;
  const g = (re, d) => { const m = line.match(re); return m ? m[1] : d; };
  surfaces.push({
    n:n[1], u:g(/u:'([^']+)'/,''), c:g(/c:'([^']+)'/,''),
    k:+(g(/k:(\d+)/,'1')), a:g(/a:'([^']+)'/,'warm'),
    b:g(/b:'([^']+)'/,''), p:g(/p:'([^']+)'/,''),
  });
}

// ---- 2. wings → countries (same model as the orrery) ------------------------
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

// founding dates → 0..1 (oldest=0). undated default to 0.6 (mid-late frontier).
const dates = surfaces.map(s=>s.b).filter(Boolean).map(d=>Date.parse(d));
const minB=Math.min(...dates), maxB=Math.max(...dates);
const foundNorm = s => s.b ? (Date.parse(s.b)-minB)/(maxB-minB||1) : 0.6;

const nodes = surfaces.map(s=>({ n:s.n, u:s.u, k:s.k, a:s.a, b:s.b||'',
  f:+foundNorm(s).toFixed(3), w:wingOf(s), w2:(SEAM[s.n]?SEAM[s.n][1]:null) }));

// ---- 3. the DOM-free world generator (shared with the page) -----------------
const GEN = String.raw`
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash2(ix,iy,seed){let n=(ix*374761393+iy*668265263+seed*69069)|0;n=Math.imul(n^(n>>>13),1274126177);n=n^(n>>>16);return((n>>>0)/4294967296)}
function smooth(t){return t*t*(3-2*t)}
function vnoise(x,y,seed){const x0=Math.floor(x),y0=Math.floor(y);const fx=smooth(x-x0),fy=smooth(y-y0);
  const a=hash2(x0,y0,seed),b=hash2(x0+1,y0,seed),c=hash2(x0,y0+1,seed),d=hash2(x0+1,y0+1,seed);
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy}
function fbm(x,y,seed){let v=0,amp=0.5,fr=1;for(let o=0;o<5;o++){v+=amp*vnoise(x*fr,y*fr,seed+o*131);fr*=2;amp*=0.5}return v}

// makeWorld: seeded, returns terrain arrays + placed cities. No DOM.
function makeWorld(seed, GW, GH, wings, nodes){
  const rnd=mulberry32(seed);
  const seeds=wings.map(w=>({id:w.id, x:w.cx*GW + (rnd()-0.5)*GW*0.06, y:w.cy*GH + (rnd()-0.5)*GH*0.06}));
  const N=GW*GH;
  const elev=new Float32Array(N), country=new Int8Array(N), land=new Uint8Array(N), border=new Float32Array(N);
  const warp=GW*0.10;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){
    const idx=j*GW+i;
    // continental falloff (corners → ocean), softened by noise so coasts wander
    const nx=i/GW-0.5, ny=j/GH-0.5;
    const rad=Math.sqrt(nx*nx*1.05+ny*ny*1.5);
    let e=fbm(i*0.045,j*0.045,seed)*1.15 - rad*1.35 + 0.34;
    // guarantee land near each country seed (gaussian bump)
    let nearest=0,d1=1e9,d2=1e9;
    const wx=i+(vnoise(i*0.06,j*0.06,seed+7)-0.5)*warp, wy=j+(vnoise(i*0.06,j*0.06,seed+19)-0.5)*warp;
    for(let s=0;s<seeds.length;s++){const dx=wx-seeds[s].x,dy=wy-seeds[s].y;const d=Math.sqrt(dx*dx+dy*dy);
      if(d<d1){d2=d1;d1=d;nearest=s}else if(d<d2){d2=d}}
    // bump from the *unwarped* nearest real seed distance
    let bump=0; for(const s of seeds){const dx=i-s.x,dy=j-s.y;const sig=GW*0.16;bump+=0.55*Math.exp(-(dx*dx+dy*dy)/(2*sig*sig))}
    e+=Math.min(bump,0.6);
    elev[idx]=e; country[idx]=nearest;
    border[idx]=d1/(d2||1); // →1 at country borders
  }
  // sea level chosen for a healthy land fraction
  const sorted=Float32Array.from(elev).sort();
  const seaLevel=sorted[Math.floor(N*0.40)];
  for(let idx=0;idx<N;idx++) land[idx]= elev[idx]>seaLevel?1:0;
  // mountains: high border cells on land
  const mtn=new Uint8Array(N);
  for(let idx=0;idx<N;idx++) if(land[idx] && border[idx]>0.86 && elev[idx]>seaLevel+0.10) mtn[idx]=1;

  // city placement ----------------------------------------------------------
  const byC={}; for(const w of wings) byC[w.id]=[];
  for(const nd of nodes) byC[nd.w].push(nd);
  const landCells={}; // land cells per country
  for(const w of wings) landCells[w.id]=[];
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const idx=j*GW+i; if(land[idx]) landCells[wings[country[idx]].id].push(i+j*GW);}
  const cities=[];
  function centroid(id){let sx=0,sy=0,c=0;for(const idx of landCells[id]){sx+=idx%GW;sy+=(idx/GW|0);c++}return c?{x:sx/c,y:sy/c}:{x:GW/2,y:GH/2}}
  const cen={}; for(const w of wings) cen[w.id]=centroid(w.id);
  // border cells for seams (cells whose two nearest seeds are exactly a,b)
  function seamCells(a,b){const out=[];const ai=wings.findIndex(w=>w.id===a),bi=wings.findIndex(w=>w.id===b);
    for(let idx=0;idx<N;idx++){ if(!land[idx]||border[idx]<0.80) continue; const c1=country[idx]; if(c1!==ai&&c1!==bi) continue;
      // recompute 2nd-nearest country at this cell
      const i=idx%GW,j=idx/GW|0; let n1=0,n2=0,dd1=1e9,dd2=1e9;
      for(let s=0;s<seeds.length;s++){const dx=i-seeds[s].x,dy=j-seeds[s].y;const d=dx*dx+dy*dy; if(d<dd1){dd2=dd1;n2=n1;dd1=d;n1=s}else if(d<dd2){dd2=d;n2=s}}
      const pair=[n1,n2].sort().join(','); if(pair===[ai,bi].sort().join(',')) out.push(idx);
    } return out;}

  for(const w of wings){
    const mem=byC[w.id].slice().sort((p,q)=>q.k-p.k);
    const placed=[]; const cand=landCells[w.id];
    mem.forEach((nd,rank)=>{
      let px,py;
      if(nd.w2){ const sc=seamCells(nd.w,nd.w2); if(sc.length){const idx=sc[(Math.floor(rnd()*sc.length))]; px=idx%GW;py=idx/GW|0;} }
      if(px===undefined){
        if(rank===0 && cand.length){ // capital near the craton centroid
          px=cen[w.id].x; py=cen[w.id].y;
        } else if(cand.length){
          // sample candidates; reward spacing; old→interior, new→frontier
          let best=null,bs=-1e9;
          for(let t=0;t<24;t++){const idx=cand[Math.floor(rnd()*cand.length)];const ci=idx%GW,cj=idx/GW|0;
            let mind=1e9; for(const p of placed){const dx=p.x-ci,dy=p.y-cj;mind=Math.min(mind,dx*dx+dy*dy)}
            const dcx=ci-cen[w.id].x,dcy=cj-cen[w.id].y;const dCen=Math.sqrt(dcx*dcx+dcy*dcy);
            const ageBias=(nd.f-0.5)*dCen*0.9; // newer (f→1) rewarded for distance from centroid
            const score=Math.sqrt(mind)+ageBias+rnd()*2;
            if(score>bs){bs=score;best={x:ci,y:cj}}}
          px=best.x;py=best.y;
        } else { const s=seeds[wings.findIndex(x=>x.id===w.id)]; px=s.x;py=s.y; }
      }
      placed.push({x:px,y:py});
      cities.push({n:nd.n,u:nd.u,k:nd.k,a:nd.a,f:nd.f,b:nd.b,w:nd.w,w2:nd.w2,x:px,y:py,capital:rank===0});
    });
  }
  return {GW,GH,elev,country,land,mtn,border,cities,seaLevel,seeds};
}
`;

// ---- 4. SELF-TEST the generator in node -------------------------------------
{
  const sandbox = {};
  new Function('exports', GEN + '\nexports.makeWorld=makeWorld;exports.mulberry32=mulberry32;')(sandbox);
  let ok = true;
  for (const seed of [1,7,42,2026]) {
    const w = sandbox.makeWorld(seed, 200, 130, WINGS, nodes);
    const placed = w.cities.length;
    const onLand = w.cities.filter(c=>{const idx=(c.y|0)*w.GW+(c.x|0); return w.land[idx]||c.capital;}).length;
    const finite = w.cities.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y));
    const landFrac = w.land.reduce((a,b)=>a+b,0)/(w.GW*w.GH);
    const emptyCountries = WINGS.filter(wg=>!w.cities.some(c=>c.w===wg.id)).map(x=>x.id);
    const seams = w.cities.filter(c=>c.w2).length;
    console.log(`seed ${String(seed).padStart(4)}: placed ${placed}/144, finite=${finite}, land=${(landFrac*100|0)}%, seams=${seams}, emptyCountries=[${emptyCountries}]`);
    if (placed!==144 || !finite || emptyCountries.length) ok=false;
  }
  if (!ok) { console.error('\n✗ self-test FAILED'); process.exit(1); }
  console.log('✓ world-gen self-test passed (all 144 cities placed, no empty countries)\n');
}

// ---- 5. emit the page -------------------------------------------------------
const DATA = JSON.stringify({ wings:WINGS, nodes, minB, maxB });
const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mino.mobi · mappa mundi</title>
<meta name="description" content="A procedurally-generated world where every mino.mobi surface is a city. Theme-wings are countries; founding dates are tectonic history.">
<style>
:root{--ink:#2a2118;--sea:#3a5a6b;--gold:#a9802f;--parch:#e8dcc0;--frame:#1c150d}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
body{background:#0c0a07;color:var(--parch);font:14px/1.5 ui-sans-serif,system-ui,sans-serif;overflow:hidden}
#map{position:fixed;inset:0;display:block;cursor:grab;background:#0c0a07}
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
#q{background:#1a140cdd;border:1px solid #3a2e1c;color:var(--parch);padding:6px 11px;border-radius:999px;width:160px;outline:none;font-size:12.5px}
#q:focus{border-color:var(--gold)}
footer{position:fixed;bottom:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:14px;padding:10px 18px;pointer-events:none;
  background:linear-gradient(#0c0a0700,#0c0a07dd)}
.scrub{pointer-events:auto;display:flex;align-items:center;gap:10px;flex:1;max-width:560px}
.scrub input[type=range]{flex:1;accent-color:var(--gold)}
.era{font-size:12px;color:#b7a988;font-variant-numeric:tabular-nums;min-width:96px}
.legend{pointer-events:auto;display:flex;flex-wrap:wrap;gap:5px 7px;justify-content:flex-end;max-width:48vw}
.chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid #3a2e1c;background:#1a140ccc;font-size:11.5px;color:#b7a988;cursor:pointer}
.chip .dot{width:8px;height:8px;border-radius:2px}.chip.off{opacity:.35}
#tip{position:fixed;z-index:9;pointer-events:none;opacity:0;transform:translate(-50%,-135%);background:#19120bf5;border:1px solid #3a2e1c;
  border-radius:7px;padding:6px 9px;max-width:230px;font-size:12px;transition:opacity .1s}
#tip b{color:var(--gold)}#tip .m{color:#9c8a6c;font-size:11px}
</style>
</head>
<body>
<canvas id="map"></canvas>
<header>
  <a href="https://mino.mobi/">mino.mobi</a>
  <h1>mappa mundi</h1>
  <span class="sub">— every surface a city; the wings are countries; founding dates are tectonics</span>
  <span class="right"><input id="q" placeholder="find a city…" autocomplete="off"><button class="btn" id="reseed">↻ new world</button></span>
</header>
<div id="tip"></div>
<footer>
  <div class="scrub">
    <button class="btn" id="play">▶ chronicle</button>
    <input type="range" id="time" min="0" max="1000" value="1000">
    <span class="era" id="era">all founded</span>
  </div>
  <div class="legend" id="legend"></div>
</footer>
<script>
const D=${DATA};
/*GEN_START*/${GEN}/*GEN_END*/
const cv=document.getElementById('map'),ctx=cv.getContext('2d'),tip=document.getElementById('tip');
let DPR=Math.min(2,window.devicePixelRatio||1), W=0,H=0, world=null, seed=(Math.random()*1e9)|0;
let view={x:0,y:0,s:1}, hot=null, query='', active=new Set(D.wings.map(w=>w.id)), tcut=1, playing=false;
const GW=200,GH=130;
const hsl=(h,s,l,a)=> 'hsl('+h+' '+s+'% '+l+'%'+(a!=null?' / '+a:'')+')';
const wing=id=>D.wings.find(w=>w.id===id);
function fmtDate(b){return b||'—'}

function build(){ world=makeWorld(seed,GW,GH,D.wings,D.nodes); fit(); draw(); }
function fit(){ // scale world grid to cover viewport
  const sx=W/GW, sy=H/GH; world.cell=Math.max(sx,sy); world.ox=(W-GW*world.cell)/2; world.oy=(H-GH*world.cell)/2; }

function landShade(id,e,sl){ const w=wing(id); const t=Math.min(1,(e-sl)/0.6); // coast→interior
  const l=46+t*26, s=26+t*10; return hsl(w.hue,s,l); }
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0); ctx.clearRect(0,0,W,H);
  ctx.save(); ctx.translate(view.x,view.y); ctx.scale(view.s,view.s);
  const cell=world.cell, ox=world.ox, oy=world.oy, {elev,land,country,mtn,seaLevel}=world;
  // sea
  ctx.fillStyle='#0c0a07'; ctx.fillRect(-view.x/view.s,-view.y/view.s,W/view.s,H/view.s);
  // terrain raster
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const idx=j*GW+i;const x=ox+i*cell,y=oy+j*cell;
    if(!land[idx]){ const d=Math.max(0,seaLevel-elev[idx]); ctx.fillStyle=hsl(205,38,Math.max(8,20-d*30)); ctx.fillRect(x,y,cell+1,cell+1); continue; }
    const id=D.wings[country[idx]].id; let col=landShade(id,elev[idx],seaLevel);
    if(mtn[idx]) col=hsl(wing(id).hue,12,72);
    if(!active.has(id)) col=hsl(wing(id).hue,8,28);
    // simple hillshade from east-west gradient
    const eR=land[idx+1]?elev[idx+1]:elev[idx]; const sh=Math.max(-0.12,Math.min(0.12,(elev[idx]-eR)*1.5));
    ctx.fillStyle=col; ctx.fillRect(x,y,cell+1,cell+1);
    if(sh>0.02){ctx.fillStyle='rgba(255,245,220,'+sh+')';ctx.fillRect(x,y,cell+1,cell+1);} else if(sh<-0.02){ctx.fillStyle='rgba(0,0,0,'+(-sh)+')';ctx.fillRect(x,y,cell+1,cell+1);}
  }
  // coastline ink
  ctx.strokeStyle='rgba(20,14,8,.55)';ctx.lineWidth=1/view.s;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const idx=j*GW+i; if(!land[idx])continue;
    if(i+1<GW&&!land[idx+1]||j+1<GH&&!land[idx+GW]||i>0&&!land[idx-1]||j>0&&!land[idx-GW]){
      ctx.fillStyle='rgba(20,14,8,.5)';ctx.fillRect(ox+i*cell,oy+j*cell,cell+1,cell+1);}}
  // country labels (capitals' country names) — drawn faint behind cities
  ctx.textAlign='center';
  for(const w of D.wings){ if(!active.has(w.id))continue; const cap=world.cities.find(c=>c.w===w.id&&c.capital); if(!cap)continue;
    const x=ox+cap.x*cell,y=oy+cap.y*cell; ctx.font='italic '+(13)+'px ui-serif,Georgia,serif';
    ctx.fillStyle=hsl(w.hue,30,82,.5); ctx.fillText(w.label.toUpperCase(),x,y-16); }
  // cities
  for(const c of world.cities){
    const vis=active.has(c.w)&&(c.f<=tcut)&&(!query||c.n.toLowerCase().includes(query));
    const x=ox+c.x*cell,y=oy+c.y*cell; const r=(c.capital?3.4:2.0)+Math.sqrt(c.k)*0.9;
    if(!vis){ if(c.f<=tcut){ctx.fillStyle='rgba(180,165,130,.10)';ctx.beginPath();ctx.arc(x,y,1.4,0,7);ctx.fill();} continue; }
    const w=wing(c.w);
    ctx.beginPath();ctx.arc(x,y,r,0,7);
    ctx.fillStyle=c.w2?hsl((w.hue+wing(c.w2).hue)/2,55,60):hsl(w.hue,50,hot===c?70:58);
    ctx.fill();
    ctx.lineWidth=(c.capital?1.4:0.8)/1; ctx.strokeStyle=c===hot?'#fff':'rgba(20,14,8,.7)'; ctx.stroke();
    if(c.capital){ // capital star ring
      ctx.strokeStyle=hsl(w.hue,60,80,.9);ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r+2.5,0,7);ctx.stroke(); }
    if(c===hot||c.capital||view.s>1.6||c.k>=15){ ctx.font=(c.capital?'600 ':'')+ (10) +'px ui-serif,Georgia,serif';
      ctx.fillStyle='rgba(24,16,9,.92)';ctx.textAlign='center'; ctx.fillText(c.n,x,y+r+10);
      ctx.fillStyle=hsl(w.hue,40,90,.95); ctx.fillText(c.n,x,y+r+9.4); }
  }
  ctx.restore();
}
function screenToWorld(px,py){ return {x:(px-view.x)/view.s, y:(py-view.y)/view.s}; }
function pick(px,py){ const p=screenToWorld(px,py); const cell=world.cell,ox=world.ox,oy=world.oy; let best=null,bd=1e9;
  for(const c of world.cities){ if(!active.has(c.w)||c.f>tcut||(query&&!c.n.toLowerCase().includes(query)))continue;
    const x=ox+c.x*cell,y=oy+c.y*cell;const d=(x-p.x)**2+(y-p.y)**2; if(d<bd){bd=d;best=c} }
  return bd< (12/view.s)**2 ? best : null; }

cv.addEventListener('mousemove',e=>{ if(drag){view.x=drag.vx+(e.clientX-drag.x);view.y=drag.vy+(e.clientY-drag.y);draw();return;}
  const c=pick(e.clientX,e.clientY); if(c!==hot){hot=c;draw();}
  if(c){ tip.style.opacity=1; tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';
    const seam=c.w2?'border town · '+wing(c.w).label+' ✕ '+wing(c.w2).label:wing(c.w).label;
    tip.innerHTML='<b>'+c.n+'</b> '+(c.capital?'★':'')+'<br><span class="m">'+seam+' · founded '+fmtDate(c.b)+'</span>';
    cv.style.cursor='pointer'; } else { tip.style.opacity=0; cv.style.cursor=drag?'grabbing':'grab'; } });
let drag=null;
cv.addEventListener('mousedown',e=>{drag={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y};cv.classList.add('drag')});
window.addEventListener('mouseup',()=>{drag=null;cv.classList.remove('drag')});
cv.addEventListener('click',e=>{ if(drag&&(Math.abs(e.clientX-drag.x)>3))return; const c=pick(e.clientX,e.clientY); if(c&&c.u)window.open(c.u,'_blank'); });
cv.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY<0?1.12:1/1.12;const ns=Math.max(0.6,Math.min(6,view.s*f));
  const rx=(e.clientX-view.x)/view.s,ry=(e.clientY-view.y)/view.s;view.x=e.clientX-rx*ns;view.y=e.clientY-ry*ns;view.s=ns;draw();},{passive:false});

// time scrubber
const tEl=document.getElementById('time'),eraEl=document.getElementById('era');
function eraLabel(){ if(tcut>=1)return 'all founded'; const ms=D.minB+(D.maxB-D.minB)*tcut; return '↤ '+new Date(ms).toISOString().slice(0,10); }
tEl.addEventListener('input',()=>{tcut=+tEl.value/1000;eraEl.textContent=eraLabel();draw();});
document.getElementById('play').addEventListener('click',()=>{ playing=!playing; if(playing){tcut=0;tEl.value=0;step();} });
function step(){ if(!playing)return; tcut=Math.min(1,tcut+0.006); tEl.value=tcut*1000; eraEl.textContent=eraLabel(); draw();
  if(tcut>=1){playing=false;document.getElementById('play').textContent='▶ chronicle';return;} document.getElementById('play').textContent='⏸';requestAnimationFrame(step); }

// legend
const lg=document.getElementById('legend');
for(const w of D.wings){const c=document.createElement('span');c.className='chip';c.dataset.w=w.id;
  c.innerHTML='<span class="dot" style="background:'+hsl(w.hue,50,58)+'"></span>'+w.label;
  c.onclick=()=>{ if(active.size===1&&active.has(w.id))active=new Set(D.wings.map(x=>x.id)); else active=new Set([w.id]);
    for(const ch of lg.children) ch.classList.toggle('off',!active.has(ch.dataset.w)); draw(); };
  lg.appendChild(c);}
document.getElementById('q').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();draw();});
document.getElementById('reseed').addEventListener('click',()=>{seed=(Math.random()*1e9)|0;build();});

function resize(){ DPR=Math.min(2,window.devicePixelRatio||1); W=innerWidth;H=innerHeight; cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px'; if(world){fit();draw();} }
window.addEventListener('resize',resize);
resize(); build();
</script>
</body>
</html>
`;
mkdirSync(join(root,'mappa'),{recursive:true});
writeFileSync(join(root,'mappa','index.html'),page);
console.log('wrote mappa/index.html  ('+(page.length/1024|0)+' KB,', nodes.length,'cities across',WINGS.length,'countries)');
