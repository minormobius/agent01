// ─────────────────────────────────────────────────────────────────────────────
// stalk-render.js — the ONE yarrow stalk renderer. Every surface (the drying
// loft cards + gallery, the yijing cast, the yarrow reap-bundle) draws through
// this so a stalk looks the same everywhere; the same genome → the same model →
// the same drawing.
//
// Draws a dried milfoil stalk: a shaded, tapering cylinder (segmented strip for a
// length gradient + a highlight/shadow for roundness), furrow ribs, segmented
// nodes with scars, weathering mottle, optional villous fuzz and cut-end pith
// faces, plus warp bow and checking cracks. Feature density scales with the
// rendered pixel length and the `detail` opt, so it's lavish on one big gallery
// stalk and cheap on the forty-nine the oracle redraws each frame.
//
//   drawStalk(ctx, model, opts)
//   model = { lenPx, diaPx, col:{h,s,l}, warp, warpDir, check, nodes,
//             grainSeed, seasoned, taper }
//   opts  = { x, y, ang, detail, fuzz, ends }   // base point + orientation
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const cl=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
const hsl=(h,s,l)=>`hsl(${h} ${cl(s,0,100)}% ${cl(l,6,95)}%)`;

export function drawStalk(ctx, m, o){
  o=o||{};
  const ang=o.ang||0, detail=o.detail==null?1:o.detail;
  const len=Math.max(6, m.lenPx), R0=Math.max(0.8, (m.diaPx||3)*0.5);
  const col=m.col||{h:44,s:35,l:60}, taper=m.taper==null?0.42:m.taper;
  const warp=m.warp||0, warpDir=m.warpDir||1, nn=Math.max(2, m.nodes||4);
  const seasoned=!!m.seasoned, check=m.check||0;
  const rng=mulberry32(((m.grainSeed>>>0)||1));

  const dx=Math.sin(ang), dy=-Math.cos(ang);      // axis toward tip
  const B=[o.x,o.y], T=[o.x+dx*len, o.y+dy*len];
  const bow=warp*len*0.16*warpDir, px=Math.cos(ang), py=Math.sin(ang);
  const C=[o.x+dx*len*0.5 + px*bow, o.y+dy*len*0.5 + py*bow];
  const Q=t=>{const mt=1-t;return [mt*mt*B[0]+2*mt*t*C[0]+t*t*T[0], mt*mt*B[1]+2*mt*t*C[1]+t*t*T[1]];};
  const Tan=t=>{let ax=2*(1-t)*(C[0]-B[0])+2*t*(T[0]-C[0]), ay=2*(1-t)*(C[1]-B[1])+2*t*(T[1]-C[1]);
    const L=Math.hypot(ax,ay)||1; return [ax/L,ay/L];};
  const Perp=t=>{const tn=Tan(t); return [-tn[1],tn[0]];};

  const nodeC=[]; for(let k=1;k<=nn;k++) nodeC.push(k/(nn+1));
  const bulge=t=>{let b=1; for(const tn of nodeC){const d=Math.abs(t-tn); if(d<0.05) b=Math.max(b,1+0.18*(1-d/0.05));} return b;};
  const ndark=t=>{let v=0; for(const tn of nodeC){const d=Math.abs(t-tn); if(d<0.06) v=Math.max(v,1-d/0.06);} return v;};
  const hw=t=>R0*(1-taper*t)*bulge(t);
  const S=col.s + (seasoned?6:0);

  const N=Math.max(7, Math.min(46, Math.round(len/5*(0.55+0.45*detail))));
  const weath=[]; for(let i=0;i<=N;i++) weath.push((rng()-0.5)*4);
  const shadeL=t=>{ const i=Math.min(N,Math.max(0,Math.round(t*N)));
    return col.l + (t-0.4)*7 + weath[i] - ndark(t)*12 + (seasoned?-4:0); };

  ctx.lineCap='round'; ctx.lineJoin='round';

  // ── body: tapered, length-shaded strip ──
  for(let i=0;i<N;i++){
    const t0=i/N,t1=(i+1)/N,tm=(t0+t1)/2;
    const P0=Q(t0),P1=Q(t1),pe0=Perp(t0),pe1=Perp(t1),h0=hw(t0),h1=hw(t1);
    ctx.beginPath();
    ctx.moveTo(P0[0]-pe0[0]*h0,P0[1]-pe0[1]*h0);
    ctx.lineTo(P1[0]-pe1[0]*h1,P1[1]-pe1[1]*h1);
    ctx.lineTo(P1[0]+pe1[0]*h1,P1[1]+pe1[1]*h1);
    ctx.lineTo(P0[0]+pe0[0]*h0,P0[1]+pe0[1]*h0);
    ctx.closePath();
    ctx.fillStyle=hsl(col.h, S, shadeL(tm)); ctx.fill();
  }
  // ── roundness: a highlight stripe (lit side) + a core shadow (far side) ──
  const stripe=(offFrac,dL,a,wMul)=>{
    ctx.beginPath();
    for(let i=0;i<=N;i++){ const t=i/N,P=Q(t),pe=Perp(t),h=hw(t)*offFrac;
      const xx=P[0]+pe[0]*h, yy=P[1]+pe[1]*h; i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
    ctx.globalAlpha=a; ctx.lineWidth=Math.max(0.8,R0*wMul);
    ctx.strokeStyle=hsl(col.h,S,col.l+dL); ctx.stroke(); ctx.globalAlpha=1;
  };
  stripe(-0.42, 16, 0.5, 0.5);
  stripe( 0.58,-18, 0.45,0.6);

  // ── furrow ribs ──
  const ribs=Math.round(Math.min(4,R0)*detail);
  if(ribs>0 && R0>1.5){
    ctx.globalAlpha=0.18; ctx.lineWidth=0.6; ctx.strokeStyle=hsl(col.h,S+4,col.l-22);
    for(let k=0;k<ribs;k++){ const fr=ribs===1?0:(k/(ribs-1)-0.5);
      ctx.beginPath();
      for(let i=0;i<=N;i++){ const t=i/N,P=Q(t),pe=Perp(t),h=hw(t)*fr*1.3;
        const xx=P[0]+pe[0]*h, yy=P[1]+pe[1]*h; i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
      ctx.stroke(); }
    ctx.globalAlpha=1;
  }

  // ── nodes: a darker band across, plus a leaf-scar tick ──
  for(const tn of nodeC){
    const P=Q(tn),pe=Perp(tn),ta=Tan(tn),h=hw(tn);
    ctx.globalAlpha=0.7; ctx.lineWidth=Math.max(1,R0*0.5); ctx.strokeStyle=hsl(col.h,S+6,col.l-18);
    ctx.beginPath(); ctx.moveTo(P[0]-pe[0]*h*0.92,P[1]-pe[1]*h*0.92); ctx.lineTo(P[0]+pe[0]*h*0.92,P[1]+pe[1]*h*0.92); ctx.stroke();
    ctx.globalAlpha=0.5; ctx.lineWidth=0.7; ctx.strokeStyle=hsl(col.h,S,col.l-26);
    ctx.beginPath(); ctx.moveTo(P[0]+pe[0]*h*0.3,P[1]+pe[1]*h*0.3); ctx.lineTo(P[0]+pe[0]*h*0.3+ta[0]*h*0.8,P[1]+pe[1]*h*0.3+ta[1]*h*0.8); ctx.stroke();
    ctx.globalAlpha=1;
  }

  // ── checking crack (a dried split) ──
  if(check>0){
    const t0=0.2+rng()*0.2, span=0.26+check*0.3;
    ctx.strokeStyle='rgba(38,24,14,.6)'; ctx.lineWidth=Math.max(0.8,0.6+check); ctx.beginPath();
    for(let t=t0;t<=t0+span;t+=0.05){ const P=Q(t),pe=Perp(t),off=(rng()-0.5)*hw(t)*0.9;
      const xx=P[0]+pe[0]*off, yy=P[1]+pe[1]*off; t===t0?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy); }
    ctx.stroke();
  }

  // ── villous fuzz near the tip (big stalks only) ──
  if(o.fuzz!==false && len>130){
    const hairs=Math.round(len/16*detail);
    ctx.globalAlpha=0.35; ctx.lineWidth=0.5; ctx.strokeStyle=hsl(col.h,S-6,col.l+12);
    for(let k=0;k<hairs;k++){ const t=0.5+rng()*0.45, side=rng()<0.5?1:-1;
      const P=Q(t),pe=Perp(t),ta=Tan(t),h=hw(t), ex=P[0]+pe[0]*h*side, ey=P[1]+pe[1]*h*side, hl=R0*1.5+rng()*R0*1.5;
      const dirx=pe[0]*side*0.5+ta[0]*0.85, diry=pe[1]*side*0.5+ta[1]*0.85;
      ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex+dirx*hl,ey+diry*hl); ctx.stroke(); }
    ctx.globalAlpha=1;
  }

  // ── cut-end pith faces (or rounded caps when tiny) ──
  if(o.ends!==false && R0>1.6){
    for(const t of [0,1]){
      const P=Q(t),pe=Perp(t),h=hw(t),rot=Math.atan2(pe[1],pe[0]);
      ctx.save(); ctx.translate(P[0],P[1]); ctx.rotate(rot);
      ctx.fillStyle=hsl(col.h,S-10,col.l+12);
      ctx.beginPath(); ctx.ellipse(0,0,h,h*0.34,0,0,7); ctx.fill();
      ctx.strokeStyle=hsl(col.h,S,col.l-20); ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.ellipse(0,0,h*0.5,h*0.34*0.5,0,0,7); ctx.stroke();
      ctx.restore();
    }
  } else {
    for(const t of [0,1]){ const P=Q(t); ctx.fillStyle=hsl(col.h,S,col.l-8);
      ctx.beginPath(); ctx.arc(P[0],P[1],hw(t)*0.9,0,7); ctx.fill(); }
  }
}

if (typeof globalThis!=='undefined') globalThis.STALK={ drawStalk };
