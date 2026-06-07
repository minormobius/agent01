#!/usr/bin/env node
// Build the Orrery — an alternative, theme-first landing surface map.
//
// Parses the canonical PROJECTS array (`var P`) out of index.html and re-projects
// every surface into a 2-D themed field. Unlike the flat bluesky/work/data/tools/
// games buckets, the Orrery groups by *intellectual posture* (what you DO there)
// and lets boundary-crossing surfaces sit on the SEAM between two wings — so a
// thing like `proteus` or `splice`, which aspires to be both a game and a sandbox,
// is placed literally between the Arcade and the Sandbox rather than forced into one.
//
// Output: orrery/index.html (self-contained; data baked in, layout runs client-side
// so it reflows to the viewport). Reproducible: re-run after editing index.html's P.
//
//   node scripts/build-orrery.mjs

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
    n: n[1],
    u: g(/u:'([^']+)'/, ''),
    c: g(/c:'([^']+)'/, ''),
    k: +(g(/k:(\d+)/, '1')),
    a: g(/a:'([^']+)'/, 'warm'),
    p: g(/p:'([^']+)'/, ''),
  });
}

// ---- 2. the wings -----------------------------------------------------------
// cx,cy are normalized centroids (0..1). The field is read along two axes:
//   X: collective/feed-bound (left)  <->  solo/standalone (right)
//   Y: study/read (bottom)           <->  play/make (top)
const WINGS = [
  { id:'social',  label:'The Social Layer', hue:205, cx:0.13, cy:0.30, blurb:'ATProto apps you actually live in' },
  { id:'lenses',  label:'Lenses',           hue:265, cx:0.15, cy:0.66, blurb:'instruments that read a feed, a corpus, a person' },
  { id:'bench',   label:'The Workbench',    hue:30,  cx:0.17, cy:0.91, blurb:'business, money, lab & dev tooling' },
  { id:'cards',   label:'The Card Table',   hue:345, cx:0.44, cy:0.15, blurb:'decks, draws, collectible engines' },
  { id:'studio',  label:'The Studio',       hue:160, cx:0.47, cy:0.42, blurb:'make sound, image, body, bread' },
  { id:'arcade',  label:'The Arcade',       hue:50,  cx:0.81, cy:0.16, blurb:'things you actually play' },
  { id:'sandbox', label:'Simulations & Sandboxes', hue:120, cx:0.85, cy:0.45, blurb:'physics, chemistry, artificial life' },
  { id:'math',    label:'Interactive Mathematics', hue:190, cx:0.69, cy:0.81, blurb:'extremal geometry, dynamics, fractals' },
  { id:'reading', label:'The Reading Room', hue:18,  cx:0.92, cy:0.82, blurb:'deep texts, old tongues, and oracles' },
];
const WING = Object.fromEntries(WINGS.map(w => [w.id, w]));

// explicit assignment (top-level + the children that differ from their parent)
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

// seam-dwellers: belong to two wings, drawn on the midpoint with a blended hue
const SEAM = {
  proteus:['arcade','sandbox'],   // an amoeba that wants to be a game
  splice:['arcade','sandbox'],    // gene-splicing that wants to be a game
  fluoddity:['sandbox','arcade'], // a-life menagerie you can play
  garden:['sandbox','arcade'],
  weft:['lenses','social'],
  borges:['reading','studio'],    // a generated book
  canvas:['arcade','studio'],
};

const FALLBACK = { bluesky:'lenses', work:'bench', data:'bench', tools:'bench', games:'arcade' };

// resolve a wing for every surface: explicit -> inherit parent -> category fallback
const wingOf = {};
function resolve(s) {
  if (SEAM[s.n]) return SEAM[s.n][0];
  if (name2wing[s.n]) return name2wing[s.n];
  if (s.p && name2wing[s.p]) return name2wing[s.p];
  if (s.p && SEAM[s.p]) return SEAM[s.p][0];
  return FALLBACK[s.c] || 'bench';
}
for (const s of surfaces) wingOf[s.n] = resolve(s);

// ---- 3. emit the baked node list -------------------------------------------
const nodes = surfaces.map(s => ({
  n:s.n, u:s.u, k:s.k, a:s.a,
  w:wingOf[s.n],
  w2:(SEAM[s.n] ? SEAM[s.n][1] : null),
}));

// report
const counts = {};
for (const n of nodes) counts[n.w] = (counts[n.w]||0)+1;
console.log('Orrery:', nodes.length, 'surfaces across', WINGS.length, 'wings');
for (const w of WINGS) console.log('  '+w.label.padEnd(30), counts[w.id]||0);
console.log('  seams:', Object.keys(SEAM).filter(n=>nodes.find(x=>x.n===n)).join(', '));

// ---- 4. write the page ------------------------------------------------------
const DATA = JSON.stringify({ wings:WINGS, nodes });
const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mino.mobi · the orrery</title>
<meta name="description" content="A theme-first map of every mino.mobi surface — grouped by what you do there, with boundary-crossers placed on the seam.">
<style>
:root{--bg:#0b0d12;--ink:#e8e6df;--dim:#8a8f9c;--gold:#d8a657;--line:#1c2029;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:radial-gradient(120% 90% at 50% -10%,#11151d 0%,var(--bg) 60%);color:var(--ink);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
header{position:fixed;top:0;left:0;right:0;z-index:5;display:flex;align-items:baseline;gap:14px;
  padding:14px 20px;background:linear-gradient(#0b0d12ee,#0b0d1200);pointer-events:none}
header .crumb{pointer-events:auto;color:var(--gold);text-decoration:none;font-weight:600;letter-spacing:.04em}
header h1{font:600 16px/1 ui-serif,Georgia,serif;letter-spacing:.02em}
header .sub{color:var(--dim);font-size:13px}
header .search{pointer-events:auto;margin-left:auto}
header .search input{background:#0e1219;border:1px solid var(--line);color:var(--ink);
  padding:7px 12px;border-radius:999px;width:200px;outline:none;font-size:13px}
header .search input:focus{border-color:var(--gold)}
#stage{position:fixed;inset:0}
svg{width:100%;height:100%;display:block;cursor:grab}
svg.drag{cursor:grabbing}
.axis{fill:var(--dim);font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.5}
.wlabel{font:600 13px/1 ui-serif,Georgia,serif;letter-spacing:.03em;fill:var(--ink);
  paint-order:stroke;stroke:#0b0d12;stroke-width:4px;cursor:pointer;opacity:.92}
.wblurb{fill:var(--dim);font-size:10.5px;font-style:italic;letter-spacing:.01em;opacity:.7}
.halo{opacity:.05;transition:opacity .2s}
.node circle{cursor:pointer;transition:opacity .15s,stroke-width .15s}
.node text{fill:var(--ink);font-size:10px;pointer-events:none;opacity:0;transition:opacity .12s}
.node:hover text,.node.lit text{opacity:1}
.node.dim{opacity:.12}
.seamring{fill:none;stroke:var(--gold);stroke-width:1;stroke-dasharray:2 2;opacity:.8}
footer{position:fixed;bottom:0;left:0;right:0;z-index:5;display:flex;flex-wrap:wrap;gap:6px 8px;
  padding:12px 20px;background:linear-gradient(#0b0d1200,#0b0d12ee);pointer-events:none}
.chip{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
  border:1px solid var(--line);background:#0e1219cc;font-size:12px;color:var(--dim);cursor:pointer;user-select:none}
.chip .dot{width:8px;height:8px;border-radius:50%}
.chip.off{opacity:.35}
.chip.note{margin-left:auto;border-color:transparent;background:none;cursor:default}
#tip{position:fixed;z-index:9;pointer-events:none;opacity:0;transform:translate(-50%,-130%);
  background:#0e1219f2;border:1px solid var(--line);border-radius:8px;padding:7px 10px;max-width:240px;
  font-size:12px;transition:opacity .1s}
#tip b{color:var(--gold)} #tip .ep{color:var(--dim);font-size:11px;word-break:break-all}
</style>
</head>
<body>
<header>
  <a class="crumb" href="https://mino.mobi/">mino.mobi</a>
  <h1>the orrery</h1>
  <span class="sub">— surfaces by what you do there, not what they're built on</span>
  <span class="search"><input id="q" placeholder="filter surfaces…" autocomplete="off"></span>
</header>
<div id="stage"><svg id="svg"></svg></div>
<div id="tip"></div>
<footer id="legend"></footer>
<script>
const D = ${DATA};
const svg = document.getElementById('svg');
const SVGNS = 'http://www.w3.org/2000/svg';
const tip = document.getElementById('tip');
let W=0,H=0, layout=[], view={x:0,y:0,s:1}, active=new Set(D.wings.map(w=>w.id)), query='';

const hsl=(h,s,l)=>'hsl('+h+' '+s+'% '+l+'%)';
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function computeLayout(){
  const wc={}; for(const w of D.wings) wc[w.id]={x:w.cx*W,y:w.cy*H,n:0,members:[]};
  // membership counts for spread sizing
  for(const nd of D.nodes){ wc[nd.w].n++; if(nd.w2) wc[nd.w2].n++; }
  // place: order each wing's members by weight desc, spiral out (heavy = central)
  const groups={}; for(const w of D.wings) groups[w.id]=[];
  for(const nd of D.nodes) groups[nd.w].push(nd);
  layout=[];
  const minWH=Math.min(W,H);
  for(const w of D.wings){
    const mem=groups[w.id].sort((a,b)=>b.k-a.k);
    const c=wc[w.id];
    const spread=Math.max(60, Math.sqrt(mem.length)* (minWH*0.052));
    let i=0;
    for(const nd of mem){
      let cx=c.x, cy=c.y;
      if(nd.w2){ const c2=wc[nd.w2]; cx=(c.x+c2.x)/2; cy=(c.y+c2.y)/2; }
      const ga=2.39996323*i; const rr=spread*Math.sqrt((i+0.6)/(mem.length+1));
      const x=cx+Math.cos(ga)*rr, y=cy+Math.sin(ga)*rr*0.82;
      const r=4+Math.sqrt(nd.k)*2.0;
      layout.push({nd,x,y,r,wing:w});
      i++;
    }
  }
  // gentle de-overlap (deterministic)
  const rnd=mulberry32(20260607);
  for(let pass=0;pass<60;pass++){
    for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){
      const a=layout[i],b=layout[j]; let dx=b.x-a.x,dy=b.y-a.y; let d=Math.hypot(dx,dy)||0.01;
      const md=a.r+b.r+3; if(d<md){ const push=(md-d)/2; if(d<0.02){dx=rnd()-0.5;dy=rnd()-0.5;d=1;} const ux=dx/d,uy=dy/d; a.x-=ux*push;a.y-=uy*push;b.x+=ux*push;b.y+=uy*push; }
    }
  }
}

function draw(){
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  const g=document.createElementNS(SVGNS,'g');
  g.setAttribute('transform','translate('+view.x+' '+view.y+') scale('+view.s+')');
  svg.appendChild(g);

  // axis hints
  const axes=[['collective · feed',18,H/2,'start'],['solo · standalone',W-18,H/2,'end'],
              ['play · make',W/2,26,'middle'],['study · read',W/2,H-12,'middle']];
  for(const [t,x,y,anc] of axes){ const e=document.createElementNS(SVGNS,'text');
    e.setAttribute('class','axis');e.setAttribute('x',x);e.setAttribute('y',y);e.setAttribute('text-anchor',anc);e.textContent=t;g.appendChild(e);}

  // wing halos + labels
  for(const w of D.wings){
    const on=active.has(w.id);
    const halo=document.createElementNS(SVGNS,'circle');
    halo.setAttribute('class','halo');halo.setAttribute('cx',w.cx*W);halo.setAttribute('cy',w.cy*H);
    halo.setAttribute('r',Math.min(W,H)*0.16);halo.setAttribute('fill',hsl(w.hue,55,55));
    halo.style.opacity=on?0.06:0.02;g.appendChild(halo);
    const lab=document.createElementNS(SVGNS,'text');
    lab.setAttribute('class','wlabel');lab.setAttribute('x',w.cx*W);lab.setAttribute('y',w.cy*H- Math.min(W,H)*0.105);
    lab.setAttribute('text-anchor','middle');lab.textContent=w.label;lab.style.fill=on?'':'var(--dim)';
    lab.onclick=()=>{ if(active.size===1&&active.has(w.id)){active=new Set(D.wings.map(x=>x.id));} else {active=new Set([w.id]);} syncChips();draw(); };
    g.appendChild(lab);
    const bl=document.createElementNS(SVGNS,'text');
    bl.setAttribute('class','wblurb');bl.setAttribute('x',w.cx*W);bl.setAttribute('y',w.cy*H- Math.min(W,H)*0.105+14);
    bl.setAttribute('text-anchor','middle');bl.textContent=w.blurb;g.appendChild(bl);
  }

  // nodes
  for(const L of layout){
    const nd=L.nd; const on=active.has(nd.w)||(nd.w2&&active.has(nd.w2));
    const match=!query||nd.n.toLowerCase().includes(query);
    const ng=document.createElementNS(SVGNS,'g');
    ng.setAttribute('class','node'+((on&&match)?'':' dim'));
    ng.setAttribute('transform','translate('+L.x+' '+L.y+')');
    if(nd.w2){ const ring=document.createElementNS(SVGNS,'circle');ring.setAttribute('class','seamring');ring.setAttribute('r',L.r+3.5);ng.appendChild(ring); }
    const ci=document.createElementNS(SVGNS,'circle');
    ci.setAttribute('r',L.r);
    const fill=nd.w2? 'url(#seam-'+nd.n+')' : hsl(L.wing.hue,58,58);
    ci.setAttribute('fill',fill);
    ci.setAttribute('opacity',nd.a==='hot'?0.95:nd.a==='warm'?0.7:0.42);
    ci.setAttribute('stroke',hsl(L.wing.hue,60,75));ci.setAttribute('stroke-width',nd.a==='hot'?1.2:0.4);
    ng.appendChild(ci);
    const tx=document.createElementNS(SVGNS,'text');tx.setAttribute('x',0);tx.setAttribute('y',L.r+11);
    tx.setAttribute('text-anchor','middle');tx.textContent=nd.n;ng.appendChild(tx);
    ng.onmouseenter=e=>{ ng.classList.add('lit'); showTip(e,nd); };
    ng.onmousemove=e=>moveTip(e);
    ng.onmouseleave=()=>{ ng.classList.remove('lit'); tip.style.opacity=0; };
    ng.onclick=()=>{ if(nd.u) window.open(nd.u,'_blank'); };
    g.appendChild(ng);
  }

  // seam gradients (defs)
  const defs=document.createElementNS(SVGNS,'defs');
  for(const nd of D.nodes) if(nd.w2){
    const w1=D.wings.find(w=>w.id===nd.w),w2=D.wings.find(w=>w.id===nd.w2);
    const lg=document.createElementNS(SVGNS,'linearGradient');lg.setAttribute('id','seam-'+nd.n);
    const s1=document.createElementNS(SVGNS,'stop');s1.setAttribute('offset','0%');s1.setAttribute('stop-color',hsl(w1.hue,58,58));
    const s2=document.createElementNS(SVGNS,'stop');s2.setAttribute('offset','100%');s2.setAttribute('stop-color',hsl(w2.hue,58,58));
    lg.appendChild(s1);lg.appendChild(s2);defs.appendChild(lg);
  }
  svg.appendChild(defs);
}

function showTip(e,nd){ const seam=nd.w2?' · on the seam of '+wlabel(nd.w)+' ✕ '+wlabel(nd.w2):' · '+wlabel(nd.w);
  tip.innerHTML='<b>'+nd.n+'</b>'+seam+'<br><span class="ep">'+nd.u.replace(/^https?:\\/\\//,'')+'</span>'; tip.style.opacity=1; moveTip(e); }
function moveTip(e){ tip.style.left=e.clientX+'px'; tip.style.top=e.clientY+'px'; }
function wlabel(id){ const w=D.wings.find(x=>x.id===id); return w?w.label:id; }

function buildLegend(){ const lg=document.getElementById('legend'); lg.innerHTML='';
  for(const w of D.wings){ const c=document.createElement('span');c.className='chip';c.dataset.w=w.id;
    c.innerHTML='<span class="dot" style="background:'+hsl(w.hue,58,58)+'"></span>'+w.label;
    c.onclick=()=>{ if(active.has(w.id)&&active.size<D.wings.length){active.add(w.id);} if(active.has(w.id)){active.delete(w.id);}else{active.add(w.id);} if(active.size===0)active=new Set(D.wings.map(x=>x.id)); syncChips();draw(); };
    lg.appendChild(c); }
  const note=document.createElement('span');note.className='chip note';
  note.textContent='◷ '+D.nodes.length+' surfaces · click a wing to isolate · ◌ dashed = lives on a seam';lg.appendChild(note);
  syncChips();
}
function syncChips(){ for(const c of document.querySelectorAll('.chip[data-w]')) c.classList.toggle('off',!active.has(c.dataset.w)); }

function resize(){ const r=svg.getBoundingClientRect(); W=r.width;H=r.height; svg.setAttribute('viewBox','0 0 '+W+' '+H); computeLayout(); draw(); }
document.getElementById('q').addEventListener('input',e=>{ query=e.target.value.trim().toLowerCase(); draw(); });

// pan + zoom
let drag=null;
svg.addEventListener('mousedown',e=>{ drag={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y}; svg.classList.add('drag'); });
window.addEventListener('mousemove',e=>{ if(!drag)return; view.x=drag.vx+(e.clientX-drag.x); view.y=drag.vy+(e.clientY-drag.y); draw(); });
window.addEventListener('mouseup',()=>{ drag=null; svg.classList.remove('drag'); });
svg.addEventListener('wheel',e=>{ e.preventDefault(); const f=e.deltaY<0?1.1:1/1.1; const ns=Math.max(0.5,Math.min(4,view.s*f));
  const rx=(e.clientX-view.x)/view.s, ry=(e.clientY-view.y)/view.s; view.x=e.clientX-rx*ns; view.y=e.clientY-ry*ns; view.s=ns; draw(); },{passive:false});

window.addEventListener('resize',resize);
buildLegend(); resize();
</script>
</body>
</html>
`;
mkdirSync(join(root, 'orrery'), { recursive: true });
writeFileSync(join(root, 'orrery', 'index.html'), page);
console.log('\nwrote orrery/index.html  ('+(page.length/1024|0)+' KB)');
