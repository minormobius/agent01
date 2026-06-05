// ─────────────────────────────────────────────────────────────────────────────
// soil.js — a small, deterministic soil-mechanics core for the geomancy sand table.
//
// Three pieces, all CPU + plain typed arrays so they unit-test in node and run
// anywhere (the WebGPU layer only *renders* what this computes):
//   1. classify()  — USDA texture class from a (sand, silt, clay) mix.
//   2. soilProps() — turns a composition into the numbers that drive behaviour:
//      a critical slope (angle of repose, raised by clay's cohesion), how readily
//      it avalanches, and a colour/grain for the renderer.
//   3. Field       — a height-field you can poke. A poke conserves mass (the soil
//      pushed down becomes a raised rim), then granular RELAXATION lets slopes
//      steeper than the soil can hold topple downhill until it settles — fast and
//      shallow in sand, barely at all in clay.
//
// Sources for the model (gross, not FEM): USDA soil texture triangle; angle of
// repose of dry sand ≈ 30–35°, cohesive soils standing far steeper; the classic
// "talus"/sandpile slope-relaxation cellular rule (mass-conserving toppling).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const clamp=(x,lo,hi)=>x<lo?lo:x>hi?hi:x;
const clamp01=x=>clamp(x,0,1);
const lerp=(a,b,t)=>a+(b-a)*t;
const DEG=Math.PI/180;

function xmur3(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0;};}
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ── 1. USDA texture classification ──────────────────────────────────────────
// Inputs are PERCENTAGES (sum ≈ 100). The canonical triangle boundaries.
export const TEXTURE_CLASSES = {
  sand:           'Sand',
  loamy_sand:     'Loamy sand',
  sandy_loam:     'Sandy loam',
  loam:           'Loam',
  silt_loam:      'Silt loam',
  silt:           'Silt',
  sandy_clay_loam:'Sandy clay loam',
  clay_loam:      'Clay loam',
  silty_clay_loam:'Silty clay loam',
  sandy_clay:     'Sandy clay',
  silty_clay:     'Silty clay',
  clay:           'Clay',
};
export function classify(sand, silt, clay){
  // normalise defensively
  const s=sand, si=silt, c=clay;
  let key;
  if (si + 1.5*c < 15) key='sand';
  else if (si + 1.5*c >= 15 && si + 2*c < 30) key='loamy_sand';
  else if ((c>=7 && c<20 && s>52 && si+2*c>=30) || (c<7 && si<50 && si+2*c>=30)) key='sandy_loam';
  else if (c>=7 && c<27 && si>=28 && si<50 && s<=52) key='loam';
  else if ((si>=50 && c>=12 && c<27) || (si>=50 && si<80 && c<12)) key='silt_loam';
  else if (si>=80 && c<12) key='silt';
  else if (c>=20 && c<35 && si<28 && s>45) key='sandy_clay_loam';
  else if (c>=27 && c<40 && s>20 && s<=45) key='clay_loam';
  else if (c>=27 && c<40 && s<=20) key='silty_clay_loam';
  else if (c>=35 && s>45) key='sandy_clay';
  else if (c>=40 && si>=40) key='silty_clay';
  else if (c>=40 && s<=45 && si<40) key='clay';
  else key='clay';
  return { key, name: TEXTURE_CLASSES[key] };
}

// ── 2. composition (+ wetness) → behaviour + look ────────────────────────────
// Inputs are FRACTIONS in [0,1] that sum to ~1; wet ∈ [0,1] (bone-dry → saturated).
export function soilProps(sand, silt, clay, wet=0.25){
  const tot = sand+silt+clay || 1;
  sand/=tot; silt/=tot; clay/=tot; wet=clamp01(wet);
  // intrinsic cohesion: clay binds strongly, silt a little, sand not at all (dry).
  const intrinsic = clamp01(clay*1.0 + silt*0.22);
  // capillary suction — the "damp sand" effect: zero when dry, peaks half-wet, gone when soaked.
  const capillary = 4*wet*(1-wet) * (0.55 + 0.45*(clay+silt));
  // saturation: past ~0.82 the pore water carries the load → it weakens and flows (liquefaction).
  const sat = clamp01((wet-0.82)/0.18);
  const cohesion = clamp01((intrinsic + 0.62*capillary) * (1 - 0.9*sat));
  // critical slope = angle of repose; lifted by cohesion (damp sand / clay hold steep), then
  // collapsed toward a slurry angle as it saturates.
  const dryRepose = lerp(33, 80, cohesion);        // dry sand ≈33°, cohesive ≈80°
  const reposeDeg = lerp(dryRepose, 12, sat);      // saturated → ~12°, runs out flat
  const maxSlope  = Math.tan(reposeDeg*DEG);
  // how briskly it topples once over-steep: sand pours, clay creeps, slurry gushes.
  let flowRate    = lerp(0.62, 0.05, cohesion);
  flowRate        = lerp(flowRate, 0.9, sat);
  const heave     = lerp(1.0, 0.55, cohesion);     // sand bulks & ejects more on a poke
  // desiccation cracking: needs clay AND dryness.
  const crack     = clamp01((clay-0.30)*2.6) * clamp01(1 - wet/0.34);
  // colour (sandy straw → silty buff → reddish clay), darkened & enriched as it wets.
  const C = (a,b,c)=> clamp01(sand*a + silt*b + clay*c);
  const dark = 1 - 0.40*Math.sqrt(wet);
  const color = { r:C(0.85,0.74,0.58)*dark, g:C(0.76,0.66,0.37)*dark, b:C(0.55,0.52,0.28)*dark };
  const grain = { amp: lerp(0.06,0.22,sand)*(1-0.6*wet), scale: lerp(2.0,9.0,sand), roughness: lerp(0.25,0.85,sand) };
  return { sand, silt, clay, wet, intrinsic, capillary, sat, cohesion, reposeDeg, maxSlope,
           flowRate, heave, crack, color, grain, class: classify(sand*100, silt*100, clay*100) };
}

// a static desiccation-crack pattern (Worley cell boundaries) in [0,1], 1 on a crack.
// Deterministic; the renderer just multiplies it by the live `crack` intensity.
export function crackMask(N, freq=9, seed=7){
  const out=new Float32Array(N*N);
  const ss=(a,b,x)=>{ const t=clamp01((x-a)/(b-a)); return t*t*(3-2*t); };
  const pt=(ix,iy)=>{ const r=mulberry32((Math.imul(ix+1,374761393)^Math.imul(iy+131,668265263)^Math.imul(seed,2654435761))>>>0);
    return [ix+r(), iy+r()]; };
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const fx=(x/N)*freq, fy=(y/N)*freq, ix=Math.floor(fx), iy=Math.floor(fy);
    let f1=1e9,f2=1e9;
    for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){
      const [px,py]=pt(ix+i,iy+j); const dx=px-fx, dy=py-fy; const d=Math.sqrt(dx*dx+dy*dy);
      if(d<f1){ f2=f1; f1=d; } else if(d<f2){ f2=d; } }
    out[y*N+x]=1-ss(0.0,0.06,f2-f1);
  }
  return out;
}

// ── 3. the height-field ──────────────────────────────────────────────────────
const NB8 = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];

export class Field {
  constructor(N=192){
    this.N = N;
    this.h = new Float32Array(N*N);
    this._d = new Float32Array(N*N);   // scratch delta buffer for relaxation
    this.reset(1);
  }
  idx(x,y){ return y*this.N+x; }

  // a gently undulating, grainy starting surface (small relative to a poke)
  reset(seed=1){
    const N=this.N, h=this.h;
    const r = mulberry32(xmur3('soil:'+(seed>>>0))());
    // value-noise fbm, low amplitude
    const oct=[ {f:1.4,a:0.55}, {f:3.1,a:0.28}, {f:6.7,a:0.14} ];
    // precompute a small random lattice per octave via hashed gradients
    const hash=(ix,iy,s)=>{ let v=mulberry32((Math.imul(ix+1,374761393)^Math.imul(iy+1,668265263)^Math.imul(s+1,2246822519))>>>0)(); return v; };
    const smoothstep=t=>t*t*(3-2*t);
    const vnoise=(u,v,s,freq)=>{ const fx=u*freq, fy=v*freq; const ix=Math.floor(fx), iy=Math.floor(fy);
      const tx=smoothstep(fx-ix), ty=smoothstep(fy-iy);
      const a=hash(ix,iy,s), b=hash(ix+1,iy,s), c=hash(ix,iy+1,s), d=hash(ix+1,iy+1,s);
      return lerp(lerp(a,b,tx), lerp(c,d,tx), ty); };
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){
      const u=x/N, v=y/N; let e=0, sIdx=0;
      for(const o of oct){ e += (vnoise(u,v,sIdx++,o.f)-0.5)*o.a; }
      h[this.idx(x,y)] = e*1.6;     // units; a poke is ~6–12 units deep
    }
    this._d.fill(0);
    return this;
  }

  mass(){ let s=0; const h=this.h; for(let i=0;i<h.length;i++) s+=h[i]; return s; }

  // press an indenter at normalised (nx,ny) ∈ [0,1]; radius in cells, depth in units.
  // Mass-conserving: the dish removed is heaved back up as a rim hugging the crater.
  poke(nx, ny, R, depth, heave=1){
    const N=this.N, h=this.h;
    const cx=nx*(N-1), cy=ny*(N-1);
    const R2=R*R;
    let removed=0;
    // crater: a smooth paraboloid dish
    const lo=(c)=>Math.max(0,Math.floor(c-R*2.4)), hi=(c)=>Math.min(N-1,Math.ceil(c+R*2.4));
    for(let y=lo(cy);y<=hi(cy);y++) for(let x=lo(cx);x<=hi(cx);x++){
      const dx=x-cx, dy=y-cy, r2=dx*dx+dy*dy;
      if(r2<R2){ const d=depth*(1-r2/R2); h[this.idx(x,y)] -= d; removed+=d; }
    }
    if(removed<=0) return this;
    // rim: a parabolic bump hugging the crater lip, scaled to carry the heaved volume
    const rPeak=R*1.18, halfW=R*0.95;
    const cells=[]; let sumM=0;
    for(let y=lo(cy);y<=hi(cy);y++) for(let x=lo(cx);x<=hi(cx);x++){
      const dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy);
      if(r>=R*0.9){ const t=(r-rPeak)/halfW; const m=1-t*t; if(m>0){ cells.push(this.idx(x,y)); sumM+=m;
        // stash m alongside (recompute on apply to avoid a parallel array)
      } }
    }
    if(sumM>0){ const k=(removed*heave)/sumM;
      for(let y=lo(cy);y<=hi(cy);y++) for(let x=lo(cx);x<=hi(cx);x++){
        const dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy);
        if(r>=R*0.9){ const t=(r-rPeak)/halfW; const m=1-t*t; if(m>0) h[this.idx(x,y)] += m*k; }
      }
    }
    return this;
  }

  // pour material on top — a cone that relaxation spreads to a pile at the angle of
  // repose. NOT mass-conserving on purpose: you're adding soil to the table.
  heap(nx, ny, R, amount){
    const N=this.N, h=this.h, cx=nx*(N-1), cy=ny*(N-1), R2=R*R;
    const lo=c=>Math.max(0,Math.floor(c-R)), hi=c=>Math.min(N-1,Math.ceil(c+R));
    for(let y=lo(cy);y<=hi(cy);y++) for(let x=lo(cx);x<=hi(cx);x++){
      const dx=x-cx, dy=y-cy, r2=dx*dx+dy*dy;
      if(r2<R2) h[this.idx(x,y)] += amount*(1-r2/R2);
    }
    return this;
  }

  // smooth a disc toward its own mean — a finger flattening the sand (≈mass-neutral)
  smoothDisc(nx, ny, R, strength=0.5){
    const N=this.N, h=this.h, cx=nx*(N-1), cy=ny*(N-1), R2=R*R;
    const lo=c=>Math.max(0,Math.floor(c-R)), hi=c=>Math.min(N-1,Math.ceil(c+R));
    let sum=0, cnt=0;
    for(let y=lo(cy);y<=hi(cy);y++) for(let x=lo(cx);x<=hi(cx);x++){
      const dx=x-cx, dy=y-cy; if(dx*dx+dy*dy<R2){ sum+=h[this.idx(x,y)]; cnt++; } }
    if(!cnt) return this; const mean=sum/cnt;
    for(let y=lo(cy);y<=hi(cy);y++) for(let x=lo(cx);x<=hi(cx);x++){
      const dx=x-cx, dy=y-cy, r2=dx*dx+dy*dy;
      if(r2<R2){ const i=this.idx(x,y); const f=strength*(1-Math.sqrt(r2)/R); h[i]+=(mean-h[i])*f; } }
    return this;
  }

  // the largest slope-overshoot anywhere (how far from settled), in units/cell
  maxViolation(props){
    const N=this.N, h=this.h; let mx=0;
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){
      const i=this.idx(x,y), hi=h[i];
      for(const [dx,dy,dist] of NB8){ const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=N||ny>=N) continue;
        const over=(hi-h[this.idx(nx,ny)]) - props.maxSlope*dist;
        if(over>mx) mx=over;
      }
    }
    return mx;
  }

  // one granular-relaxation pass: any over-steep pair topples a little downhill.
  // Mass-conserving (every transfer is paired). Returns the max overshoot seen.
  relaxStep(props){
    const N=this.N, h=this.h, d=this._d;
    const c=0.04 + 0.16*clamp01(props.flowRate/0.62);   // per-pair transfer coefficient (stable for 8-nbr)
    d.fill(0);
    let mx=0;
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){
      const i=this.idx(x,y), hi=h[i];
      for(const [dx,dy,dist] of NB8){ const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=N||ny>=N) continue;
        const j=this.idx(nx,ny);
        const over=(hi-h[j]) - props.maxSlope*dist;
        if(over>0){ const move=c*over; d[i]-=move; d[j]+=move; if(over>mx) mx=over; }
      }
    }
    for(let k=0;k<d.length;k++) h[k]+=d[k];
    return mx;
  }

  // run up to `iters` passes; stop early once essentially settled. Returns {iters, settled}.
  settle(props, iters=8, eps=1e-3){
    let i=0, mx=0;
    for(; i<iters; i++){ mx=this.relaxStep(props); if(mx<eps) { i++; break; } }
    return { iters:i, settled: mx<eps, maxViolation:mx };
  }
}

// handy for the renderer / tests: surface normal at a cell from central differences
export function normalAt(h, N, x, y, zScale=1){
  const gx=(h[y*N+Math.min(N-1,x+1)] - h[y*N+Math.max(0,x-1)]);
  const gy=(h[Math.min(N-1,y+1)*N+x] - h[Math.max(0,y-1)*N+x]);
  const nx=-gx*zScale, ny=-gy*zScale, nz=2;
  const L=Math.hypot(nx,ny,nz)||1; return [nx/L,ny/L,nz/L];
}
