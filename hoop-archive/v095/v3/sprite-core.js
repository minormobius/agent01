// sprite/core.js — the PURE, deterministic sprite kernel. No DOM, no canvas.
//
// ── VENDORED into hoop ───────────────────────────────────────────────────────────────────────────
// Source: mega/sprite/core.js (the Sprite Lab at mega.mino.mobi/sprite). hoop is a no-build static
// site served from hoop.mino.mobi and cannot import a sibling site's module at runtime, so this is a
// near-verbatim copy. Re-sync from source; don't fork it divergently (same rule as vendor/auth.js).
//
// ONE intentional, additive delta vs. source: buildGenome() honours an optional `opts.role` override
// (a key of ROLES). hoop's NPCs already carry a role solved by econ's buildSociety, so we pin the
// sprite's role to the resident's actual job — its accent colour, emblem and tool then agree with the
// building lighting and the inspector instead of the genome rolling an independent random role. The
// override is backward-compatible (absent ⇒ original pickRole behaviour) and should be upstreamed to
// mega/sprite when that branch merges.
// ──────────────────────────────────────────────────────────────────────────────────────────────────
//
// Consumed three ways from one source of truth:
//   • the browser lab  (import → draw frameRects() to a <canvas>)
//   • the HTTP API      (worker.js → frameSVG() string, no canvas needed)
//   • the node selftest (sprite.selftest.mjs)
// A sprite is fully described by its genome, and a genome is fully determined by (seed, opts):
// that is what makes every output a PORTABLE ASSET — a few bytes that regenerate identical pixels
// on any machine, the same property hoop's ship/econ engines rely on.

// ── House PRNG: xmur3 → mulberry32 (borges/js/prng.js family) ──
export function xmur3(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0;};}
export function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function rngFor(s){return mulberry32(xmur3(s)());}

// ── THE CIVIC GENOME — a faithful, trimmed copy of hoop/econ/econ.js (standalone, no runtime import) ──
export const ROLES={
  dwell:  {glyph:'⌂',color:'#d9b24a',tier:1,dom:false,item:'none'},
  grow:   {glyph:'❀',color:'#5aa845',tier:1,dom:true, item:'sprig'},
  make:   {glyph:'⚒',color:'#e0772f',tier:1,dom:true, item:'hammer'},
  mend:   {glyph:'⚙',color:'#9b6b3a',tier:1,dom:true, item:'tool'},
  trade:  {glyph:'⇄',color:'#cf3b3b',tier:1,dom:true, item:'scroll'},
  serve:  {glyph:'☕',color:'#c853a0',tier:1,dom:true, item:'tool'},
  play:   {glyph:'◍',color:'#3bb0c9',tier:2,dom:false,item:'none'},
  heal:   {glyph:'✚',color:'#dfe7e2',tier:2,dom:false,item:'staff'},
  learn:  {glyph:'❍',color:'#5570d8',tier:2,dom:false,item:'scroll'},
  worship:{glyph:'☥',color:'#b39bd8',tier:2,dom:false,item:'staff'},
  govern: {glyph:'⛬',color:'#33408f',tier:3,dom:false,item:'staff'},
  move:   {glyph:'↕',color:'#6b7a82',tier:3,dom:false,item:'none'},
  store:  {glyph:'▣',color:'#566066',tier:2,dom:true, item:'tool'},
};
export const ROLE_MIX=[['dwell',46],['make',12],['trade',9],['grow',7],['serve',6],['mend',4],['play',4],['store',3],['learn',3],['heal',2],['worship',1],['govern',1],['move',2]];
export const DOMAINS=[
  {id:'grain',good:'bread',hue:45},  {id:'fiber',good:'cloth',hue:200},
  {id:'metal',good:'tools',hue:212}, {id:'wood', good:'furniture',hue:28},
  {id:'glass',good:'glass',hue:180}, {id:'brew', good:'brew',hue:300},
  {id:'clay', good:'pottery',hue:20},{id:'oil',  good:'oil',hue:50},
  {id:'paper',good:'paper',hue:48},  {id:'spice',good:'spice',hue:8},
];
export const ARCHETYPES={
  balanced: {mix:{}, note:'a working middle, a few civic anchors'},
  dormitory:{mix:{dwell:1.3,learn:0.5,worship:0.4,play:0.5}, note:'mostly dwellings — a sleeper suburb'},
  company:  {mix:{make:1.7,trade:1.4,store:1.4,learn:0.5,worship:0.4,play:0.5}, note:'work-centric — uniform coats'},
  commons:  {mix:{learn:1.6,serve:1.5,play:1.6,worship:1.5}, note:'rich in third places'},
};
function effectiveMix(arc){ const m=(ARCHETYPES[arc]||ARCHETYPES.balanced).mix; return ROLE_MIX.map(([k,w])=>[k,Math.max(1,w*(m[k]||1))]); }
function pickRole(rnd,mix){ const tot=mix.reduce((s,m)=>s+m[1],0); let r=rnd()*tot; for(const[k,w]of mix){r-=w;if(r<=0)return k;} return 'dwell'; }

// ── HEAD + FACE variance — the new genes ──
export const HEADS={ round:{rr:0.80,inset:0}, wide:{rr:0.45,inset:0}, tall:{rr:1.00,inset:1}, square:{rr:0.30,inset:0} };
const HEAD_KEYS=Object.keys(HEADS);
export const EYE_STYLES=['dot','round','sleepy','wide'];
export const MOUTH_STYLES=['line','smile','frown','small'];

// ── colour helpers ──
export function hexHue(hex){ const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; if(!d)return 0;
  let h; if(mx===r)h=((g-b)/d)%6; else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; return (h*60+360)%360; }
export function ramp(rnd,hue,sat,jit){ jit=jit==null?15:jit; hue=((hue+rnd()*jit*2-jit)%360+360)%360; const s=sat+rnd()*14,out=[];
  for(let i=0;i<4;i++) out.push(`hsl(${hue.toFixed(0)} ${s.toFixed(0)}% ${(20+i*17+rnd()*4).toFixed(0)}%)`); return out; }

export const DEFAULT_OPTS={size:15, dens:0.80, arch:'balanced', frames:4, sym:true, head:true, legs:true, eyes:true, item:true};

// one coat per "company" street — derived once from the street base so the crowd dresses alike
export function sharedClothFor(base){ const rnd=rngFor((base||'')+'::cloth'); return ramp(rnd, rnd()*360, 46); }

// ── Genome: pure f(seed, opts, sharedCloth?) ──
export function buildGenome(seed, o, sharedCloth){
  o = {...DEFAULT_OPTS, ...o};
  const rnd=rngFor(seed);
  const N=o.size, HALF=Math.ceil(N/2), headBottom=Math.round(N*0.30);
  const forced=(o.role&&ROLES[o.role])?o.role:null;
  const rolled=pickRole(rnd, effectiveMix(o.arch));   // always drawn, so the body stays seed-stable regardless of override
  const role=forced||rolled;
  const R=ROLES[role];
  const domain=R.dom ? DOMAINS[Math.floor(rnd()*DOMAINS.length)] : null;
  const cloth = (o.arch==='company' && sharedCloth) ? sharedCloth
              : domain ? ramp(rnd, domain.hue, 46)
              : ramp(rnd, rnd()*360, 50);
  const ramps={
    skin: ramp(rnd, 26, 40, 10),
    hair: ramp(rnd, 30, 34, 26),
    cloth,
    pants: ramp(rnd, 222, 26, 10),
    metal: ramp(rnd, 212, 10),
    accent: ramp(rnd, hexHue(R.color), 58, 8),
  };
  const cells=[];
  for(let y=0;y<N;y++){const row=[];for(let x=0;x<HALF;x++){
    let v=0;
    if(y<headBottom){ v=1; }                       // solid head (masks shape it; a face needs a face)
    else {
      const edge = x===0 ? o.dens-0.40 : o.dens;
      if(rnd()<edge){
        if(y>N-3 && rnd()<.75) v=3;                // feet → metal
        else if(rnd()<.16) v = rnd()<.5?3:4;       // trim → metal/accent
        else v=2;                                  // body → cloth
      }
    }
    row.push(v);
  } cells.push(row);}
  // head + face genes (rolled after the body so existing silhouettes are stable; these are overlays)
  const head=HEAD_KEYS[Math.floor(rnd()*HEAD_KEYS.length)];
  const face={ eye:EYE_STYLES[Math.floor(rnd()*EYE_STYLES.length)],
               mouth:MOUTH_STYLES[Math.floor(rnd()*MOUTH_STYLES.length)],
               brow: rnd()<0.45 };
  return {seed, size:N, half:HALF, headBottom, role, glyph:R.glyph, tier:R.tier,
          item:R.item, domain:domain?domain.id:null, good:domain?domain.good:null,
          head, face, ramps, cells, opts:{...o}};
}

// ── 8-WAY DIRECTION ──
export const DIR8=[
  {k:"S", dx:0,dy:1}, {k:"SE",dx:1,dy:1}, {k:"E",dx:1,dy:0}, {k:"NE",dx:1,dy:-1},
  {k:"N", dx:0,dy:-1},{k:"NW",dx:-1,dy:-1},{k:"W",dx:-1,dy:0},{k:"SW",dx:-1,dy:1},
];
export const DIR_OF={}; DIR8.forEach(d=>DIR_OF[d.k]=d);
export function dirFromKey(k){ return DIR_OF[k]||DIR_OF.S; }

// ── WALK CYCLE — poses derived from a phase; phase==null ⇒ neutral standing ──
export function walkPose(phase, frames, profile){
  if(phase==null) return {bob:0,lLeg:{dx:0,dy:0},rLeg:{dx:0,dy:0},item:{dx:0,dy:0}};
  frames=frames||4;
  const t=(phase%frames)/frames, s=Math.sin(2*Math.PI*t);
  const swing=Math.round(s);
  const bob = Math.abs(s)<0.35 ? -1 : 0;
  if(profile) return {bob, lLeg:{dx:swing,dy:0}, rLeg:{dx:-swing,dy:0}, item:{dx:-swing,dy:0}};
  const lDy = s> 0.5?-1:0, rDy = s<-0.5?-1:0;
  return {bob, lLeg:{dx:0,dy:lDy}, rLeg:{dx:0,dy:rDy}, item:{dx:0,dy:(s>0.5?-1:s<-0.5?1:0)}};
}

// eye/mouth style → cell offsets (relative to an anchor)
function eyeShape(style,big){
  if(style==='sleepy') return [{dx:0,dy:0},{dx:-1,dy:0}];
  return big?[{dx:0,dy:0},{dx:0,dy:1}]:[{dx:0,dy:0}];   // dot / round / wide
}
function mouthShape(style){
  if(style==='smile') return [{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:1}];
  if(style==='frown') return [{dx:-1,dy:1},{dx:1,dy:1},{dx:0,dy:0}];
  if(style==='small') return [{dx:0,dy:0}];
  return [{dx:-1,dy:0},{dx:0,dy:0},{dx:1,dy:0}];        // line
}

// ── THE RENDERER-AGNOSTIC FRAME: returns [{x,y,c}] grid cells (flip baked, 0..N-1) ──
export function frameRects(g, dir, phase){
  dir = dir || DIR_OF.S;
  const N=g.size, o=g.opts;
  const flip=dir.dx<0, turn=Math.abs(dir.dx), face=dir.dy;
  const center=Math.round((N-1)/2), hb=g.headBottom;
  const H=HEADS[g.head]||HEADS.round, rr=Math.max(1,Math.round(hb*H.rr)), inset=H.inset;
  const legTop=Math.round(N*0.66), gapHalf=N>=23?1:0;
  const hairLine=face<=0?Math.round(hb*0.62):Math.round(hb*0.30);
  const pose=walkPose(phase, o.frames||4, face===0);
  const mats=[null,g.ramps.skin,g.ramps.cloth,g.ramps.metal,g.ramps.accent];
  const out=[];
  const push=(cx,cy,c)=>{ if(cy<0||cy>=N)return; const X=flip?(N-1-cx):cx; if(X<0||X>=N)return; out.push({x:X,y:cy,c}); };

  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const hx = o.sym ? (x<g.half?x:(N-1-x)) : Math.min(g.half-1, x<g.half?x:(x-g.half));
    let v=g.cells[y][hx]; if(!v) continue;
    if(o.head && y<hb){
      if(Math.min(x,N-1-x) < inset) continue;                  // narrow head (tall shape)
      if(y<rr && Math.min(x,N-1-x) < (rr-y)) continue;         // rounded NE/NW corners
    }
    if(o.legs && y>=legTop && Math.abs(x-center)<=gapHalf) continue;  // split the legs
    let r;
    if(v===1 && y<hairLine) r=g.ramps.hair;
    else if(o.legs && y>=legTop && v===2) r=g.ramps.pants;
    else r=mats[v];
    const shade=(v===1 && y>=hairLine)?2:Math.min(3,Math.max(0,Math.floor((y/N)*4)));
    let ox=0, oy=0;
    if(y<legTop) oy=pose.bob; else { const leg=(x<center)?pose.lLeg:pose.rLeg; ox=leg.dx; oy=leg.dy; }
    push(x+ox, y+oy, r[shade]);
  }

  if(o.eyes && hb>=2) faceCells(push, g, N, hb, turn, face, center, pose.bob);

  if(o.item && g.item!=='none' && !(face===-1 && turn===0)){
    const hx=N-2+pose.item.dx, hy=Math.round(N*0.54)+pose.bob+pose.item.dy;
    const top=g.ramps.accent[3], mid=g.ramps.accent[1];
    if(g.item==='staff'||g.item==='hammer'){ for(let k=0;k<Math.min(4,N-Math.round(N*0.54));k++) push(hx,hy-2+k,k===0?top:mid); }
    else if(g.item==='sprig'){ push(hx,hy,g.ramps.accent[2]); push(hx,hy-1,top); push(hx-1,hy-1,top); }
    else if(g.item==='scroll'){ push(hx,hy,top); push(hx,hy+1,mid); }
    else push(hx,hy,top);
  }
  return out;
}

function faceCells(push, g, N, hb, turn, face, center, dy){
  if(face===-1) return;                          // back & back-¾: hair cap carries it
  dy=dy||0;
  const F=g.face||{eye:'dot',mouth:'line',brow:false}, dark="#0a0b0e", big=N>=15;
  const eyeDX=Math.max(1,Math.round(N*0.16))+(F.eye==='wide'?1:0);
  const baseRow=Math.max(0,Math.min(hb-2,Math.round(hb*0.42)));
  const eyeRow=baseRow+dy, mr=Math.min(hb-1, baseRow+Math.max(1,Math.round(N*0.13)))+dy;
  const stampEye=ax=>{ for(const d of eyeShape(F.eye,big)) push(ax+d.dx, eyeRow+d.dy, dark); };
  const stampMouth=mx=>{ for(const m of mouthShape(F.mouth)) push(mx+m.dx, mr+m.dy, g.ramps.skin[0]); };
  if(turn===0){                                   // front
    const lx=center-eyeDX, rx=center+eyeDX;
    stampEye(lx); stampEye(rx);
    if(F.brow && big){ push(lx,eyeRow-1,g.ramps.hair[1]); push(rx,eyeRow-1,g.ramps.hair[1]); }
    stampMouth(center);
  } else if(face===1){                            // ¾ front, turned right
    const nearX=center+eyeDX, farX=center-(eyeDX>1?1:0);
    stampEye(nearX); push(farX,eyeRow,dark);
    push(nearX+1,eyeRow+1,g.ramps.skin[1]);
    stampMouth(center+1);
  } else {                                        // profile, facing right
    const ex=center+eyeDX;
    stampEye(ex);
    push(ex+1,eyeRow+1,g.ramps.skin[2]);          // nose past the edge
    push(ex,mr,g.ramps.skin[0]);
  }
}

// ── SVG renderer (string only — runs in a Worker, no canvas). The portable image asset. ──
export function frameSVG(g, dir, phase, scale){
  scale = scale||16;
  const N=g.size, side=(N+2)*scale;
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">`;
  for(const r of frameRects(g,dir,phase)) s+=`<rect x="${(r.x+1)*scale}" y="${(r.y+1)*scale}" width="${scale}" height="${scale}" fill="${r.c}"/>`;
  return s+`</svg>`;
}

// ── Build a genome from loose params (query string / record), clamped to sane bounds ──
export function genomeFromParams(p={}){
  const o={...DEFAULT_OPTS};
  if(p.size!=null){ let s=Math.round(+p.size)||DEFAULT_OPTS.size; s=Math.max(9,Math.min(49,s)); if(s%2===0)s++; o.size=s; }
  if(p.dens!=null) o.dens=Math.max(0.4,Math.min(0.99,+p.dens||DEFAULT_OPTS.dens));
  if(p.frames!=null) o.frames=Math.max(1,Math.min(12,Math.round(+p.frames)||4));
  if(p.arch && ARCHETYPES[p.arch]) o.arch=p.arch;
  const bool=v=>!(v==='0'||v==='false'||v===false||v===0);
  for(const k of ['sym','head','legs','eyes','item']) if(p[k]!=null) o[k]=bool(p[k]);
  const seed=(p.seed!=null?String(p.seed):'hoop:0:0#0');
  const base=seed.split('#')[0];
  return buildGenome(seed, o, sharedClothFor(base));
}
