// splice-anim.js — the "splice theater": a staged, schematic animation of a
// restriction clone. ~2 steps of abstraction from molecular dynamics: DNA is
// drawn as a double-strand ribbon (two rails + rungs), sticky ends as
// interlocking base-teeth, enzymes as docking scissor-proteins. One <canvas>,
// pure 2D, no deps.
//
//   const ctrl = playSplice(canvas, spec, { speed, onDone });
//   ctrl.replay();  ctrl.stop();
//
// spec = {
//   leftEnz:  { name, overhang, type },   // enzyme at the left junction
//   rightEnz: { name, overhang, type },   // enzyme at the right junction
//   recombinantLen, insertLen,            // for the final label
// }

const ENZ_COLORS = {
  EcoRI:'#7aa2ff', HindIII:'#5ad1b0', BamHI:'#e3b341', SalI:'#c98bdb',
  XhoI:'#f0776a', SpeI:'#6fd3e3', KpnI:'#b6c2cf', PstI:'#e08a5a', NotI:'#7ad19a',
};
const enzColor = n => ENZ_COLORS[n] || '#7aa2ff';

const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth  = x => { x = clamp01(x); return x*x*(3 - 2*x); };
const lerp    = (a,b,t) => a + (b-a)*t;
// local eased progress of a phase spanning [a,b] of the global timeline t
const ph = (t,a,b) => smooth((t-a)/(b-a));

// ---- timeline phases (fractions of total duration) ----
const P = {
  intro:[0.00,0.10], dock:[0.10,0.26], cut:[0.26,0.37],
  open:[0.37,0.52], enter:[0.52,0.70], anneal:[0.70,0.84],
  ligate:[0.84,0.94], cheer:[0.94,1.00],
};

const TWO_PI = Math.PI*2;
const TOP = -Math.PI/2;

function polar(cx,cy,r,a){ return [cx+Math.cos(a)*r, cy+Math.sin(a)*r]; }

// double-strand arc from angle a0→a1 (a1 may be < a0; we wrap +2π), with rungs
function strandArc(g, cx,cy, R, w, a0, a1, color, opts={}){
  if(a1 < a0) a1 += TWO_PI;
  const glow = opts.glow||0;
  g.save();
  g.lineCap='round';
  if(glow){ g.shadowColor=color; g.shadowBlur=glow; }
  g.strokeStyle=color; g.lineWidth=opts.lw||2.5;
  g.beginPath(); g.arc(cx,cy,R+w,a0,a1); g.stroke();
  g.beginPath(); g.arc(cx,cy,R-w,a0,a1); g.stroke();
  g.shadowBlur=0;
  // rungs
  const span=a1-a0; const step=opts.rungStep||0.10;
  g.lineWidth=1; g.strokeStyle=opts.rung||'rgba(255,255,255,.13)';
  for(let a=a0+step*0.5; a<a1; a+=step){
    const [ix,iy]=polar(cx,cy,R-w+1.5,a), [ox,oy]=polar(cx,cy,R+w-1.5,a);
    g.beginPath(); g.moveTo(ix,iy); g.lineTo(ox,oy); g.stroke();
  }
  g.restore();
}

// staggered sticky-end teeth at a junction angle `a`, n teeth, optional mesh 0..1
function teeth(g, cx,cy,R,w,a,n,color,mesh=0){
  g.save(); g.strokeStyle=color; g.lineWidth=2; g.lineCap='round';
  const tang = a + Math.PI/2; // tangential direction
  for(let i=0;i<n;i++){
    const off = (i - (n-1)/2) * 0.5 * (1-mesh*0.55);
    const rr = (i%2===0)? R+w*0.4 : R-w*0.4; // stagger in/out for a toothy look
    const [bx,by]=polar(cx,cy,rr,a);
    const ex = bx + Math.cos(tang)*off*6, ey = by + Math.sin(tang)*off*6;
    g.beginPath(); g.moveTo(bx,by); g.lineTo(ex,ey); g.stroke();
  }
  g.restore();
}

// an enzyme "scissor protein": rounded blob with a wedge mouth facing center
function enzymeGlyph(g, x,y, faceAng, color, label, chomp){
  g.save();
  g.translate(x,y); g.rotate(faceAng);
  const r = 15;
  g.fillStyle=color; g.shadowColor=color; g.shadowBlur=10;
  g.beginPath();
  const mouth = 0.5 + chomp*0.5; // radians half-mouth
  g.moveTo(0,0);
  g.arc(0,0,r, mouth, TWO_PI - mouth);
  g.closePath(); g.fill();
  g.shadowBlur=0;
  g.rotate(-faceAng);
  g.fillStyle='#0a0d12'; g.font='bold 9px ui-monospace,monospace';
  g.textAlign='center'; g.textBaseline='middle';
  g.restore();
  // label outside
  g.save(); g.fillStyle=color; g.font='11px ui-monospace,monospace';
  g.textAlign='center'; g.fillText(label, x, y - 22); g.restore();
}

function render(g, W,H, spec, t){
  g.clearRect(0,0,W,H);
  // backdrop
  const grad=g.createRadialGradient(W/2,H/2,20, W/2,H/2,Math.max(W,H)/1.4);
  grad.addColorStop(0,'#10151c'); grad.addColorStop(1,'#0a0d12');
  g.fillStyle=grad; g.fillRect(0,0,W,H);

  const cx=W/2, cy=H/2+6, R=Math.min(W,H)*0.30, w=7;
  const cL=enzColor(spec.leftEnz.name), cR=enzColor(spec.rightEnz.name);
  const backboneCol='#6f8296', insertCol='#5ad1b0';

  // gap half-angle: starts small (sites near top), springs open after the cut
  const site0=0.20;
  const gapHalf = lerp(site0, 0.62, ph(t,P.open[0],P.open[1]));
  const aL = TOP - gapHalf;          // left junction
  const aR = TOP + gapHalf;          // right junction

  // a gentle settle-in rotation that eases to 0 before the surgery starts
  const spin = (1 - ph(t,P.intro[0],P.intro[1])) * 0.10;
  g.save(); g.translate(cx,cy); g.rotate(spin); g.translate(-cx,-cy);

  const cut = ph(t,P.cut[0],P.cut[1]);
  const cheer = ph(t,P.cheer[0],P.cheer[1]);

  // ---- backbone (major arc aR → aL+2π) ----
  const ligated = ph(t,P.ligate[0],P.ligate[1]);
  const glow = cheer>0 ? 14*cheer : (ligated>0?8*ligated:0);
  strandArc(g, cx,cy, R, w, aR, aL, backboneCol, { glow, lw:3 });

  // ---- the small MCS "stuffer" that gets cut out (drifts up and fades) ----
  const leave = ph(t,P.cut[1],P.open[1]); // 0..1 as it drifts away
  if(leave < 1){
    const [sx,sy] = polar(cx,cy,R,TOP);   // stuffer centroid (top of ring)
    g.save();
    g.globalAlpha = 1 - leave;
    // scale + lift about the stuffer's own centroid so it shrinks in place then rises
    g.translate(sx, sy - leave*80);
    g.scale(1 - leave*0.5, 1 - leave*0.5);
    g.translate(-sx, -sy);
    strandArc(g, cx,cy, R, w, TOP-site0, TOP+site0, '#52617a', { lw:2.5, rungStep:0.12 });
    g.restore();
  }

  // ---- the insert: slides into the gap, highlighted ----
  const enter = ph(t,P.enter[0],P.enter[1]);
  if(enter>0){
    g.save();
    g.globalAlpha = enter;
    const drop = (1-enter)*90;          // comes down from above
    g.translate(0,-drop);
    strandArc(g, cx,cy, R, w, aL, aR, insertCol, { glow: 4+glow, lw:3, rung:'rgba(90,209,176,.30)' });
    g.restore();
  }

  // ---- sticky-end teeth at both junctions ----
  const annealed = ph(t,P.anneal[0],P.anneal[1]);
  if(cut>0){
    const nL=Math.max(2,(spec.leftEnz.overhang||'NN').length);
    const nR=Math.max(2,(spec.rightEnz.overhang||'NN').length);
    // backbone-side teeth (always shown once cut)
    teeth(g, cx,cy,R,w, aL, nL, cL, annealed);
    teeth(g, cx,cy,R,w, aR, nR, cR, annealed);
  }

  // ---- ligation sparks sweeping the two seams ----
  if(ligated>0 && ligated<1){
    for(const a of [aL,aR]){
      const [sx,sy]=polar(cx,cy,R, a);
      g.save(); g.fillStyle='#fff'; g.shadowColor='#fff'; g.shadowBlur=16;
      const pr=2+4*Math.sin(ligated*Math.PI);
      g.beginPath(); g.arc(sx,sy,pr,0,TWO_PI); g.fill(); g.restore();
    }
  }

  g.restore(); // end spin

  // ---- enzymes docking (drawn in screen space, not spun) ----
  const dock = ph(t,P.dock[0],P.dock[1]);
  const retract = ph(t,P.open[0],P.open[1]);
  if(dock>0 && retract<1){
    const vis = dock*(1-retract);
    const chomp = (cut>0 && cut<1) ? Math.sin(cut*Math.PI) : 0;
    [[aL,cL,spec.leftEnz.name,-1],[aR,cR,spec.rightEnz.name,1]].forEach(([a,c,name,dir])=>{
      const restR = R + 30, startR = R + 150;
      const rr = lerp(startR, restR, dock);
      const [x,y]=polar(cx,cy, rr, a);
      g.save(); g.globalAlpha=vis;
      enzymeGlyph(g, x,y, a+Math.PI, c, name, chomp);
      g.restore();
    });
  }

  // ---- center label ----
  g.save();
  g.textAlign='center'; g.textBaseline='middle';
  if(cheer>0){
    g.globalAlpha=cheer;
    g.fillStyle='#e6edf3'; g.font='bold 15px ui-monospace,monospace';
    g.fillText('recombinant', cx, cy-8);
    g.fillStyle='#5ad1b0'; g.font='13px ui-monospace,monospace';
    g.fillText(`${spec.recombinantLen} bp`, cx, cy+12);
  } else {
    g.globalAlpha=0.8;
    g.fillStyle='#9aa7b4'; g.font='12px ui-monospace,monospace';
    const phase = t<P.dock[1]?'docking enzymes…' : t<P.open[1]?'cutting…' : t<P.enter[1]?'inserting…' : t<P.ligate[1]?'ligating…' : '';
    if(phase) g.fillText(phase, cx, cy);
  }
  g.restore();

  // legend chips for the two junction enzymes
  g.save(); g.font='11px ui-monospace,monospace'; g.textBaseline='middle';
  g.textAlign='left';
  g.fillStyle=cL; g.fillText(`● ${spec.leftEnz.name} ${spec.leftEnz.type==='blunt'?'blunt':spec.leftEnz.type+' '+spec.leftEnz.overhang}`, 14, 16);
  g.fillStyle=cR; g.fillText(`● ${spec.rightEnz.name} ${spec.rightEnz.type==='blunt'?'blunt':spec.rightEnz.type+' '+spec.rightEnz.overhang}`, 14, 32);
  g.restore();
}

export function playSplice(canvas, spec, opts={}){
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const speed = opts.speed || 1;
  const DUR = 7000 / speed;
  let raf=0, start=0, stopped=false;

  function frame(now){
    if(stopped) return;
    if(!start) start=now;
    const t = clamp01((now-start)/DUR);
    render(g, W,H, spec, t);
    if(t<1){ raf=requestAnimationFrame(frame); }
    else {
      // hold a gentle idle on the finished recombinant
      idle(now);
      if(opts.onDone) opts.onDone();
    }
  }
  function idle(t0){
    if(stopped) return;
    const tt = (performance.now()/1000);
    // re-render the cheer frame with slow shimmer
    render(g, W,H, spec, 0.97 + 0.03*(0.5+0.5*Math.sin(tt*0.8)));
    raf=requestAnimationFrame(()=>idle());
  }
  function replay(){ cancelAnimationFrame(raf); stopped=false; start=0; raf=requestAnimationFrame(frame); }
  function stop(){ stopped=true; cancelAnimationFrame(raf); }

  render(g, W,H, spec, 0); // first frame immediately
  raf=requestAnimationFrame(frame);
  return { replay, stop };
}
