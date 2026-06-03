// Tiny dependency-free canvas plotting: line series, scatter, shaded bands,
// histograms. Coordinates are auto-scaled unless an explicit domain is given.

const COLORS = ['#39d3bb','#7aa2ff','#f0a020','#ff6b6b','#6bd16b','#c08cff','#ff8cc0'];

export class Plot {
  constructor(canvas, opts={}){
    this.cv = canvas;
    this.opts = Object.assign({
      pad:{l:48,r:12,t:12,b:34}, xlabel:'', ylabel:'', grid:true,
      bg:'#1c2330', ink:'#9aa7b4', line:'#2b3340'
    }, opts);
    this.series = [];
    this._fit();
  }
  _fit(){
    // hi-DPI: back the canvas with devicePixelRatio
    const dpr = window.devicePixelRatio||1;
    const rect = this.cv.getBoundingClientRect();
    const w = Math.max(280, rect.width||this.cv.width||480);
    const h = this.opts.height || Math.round(w*0.6);
    this.cv.width = w*dpr; this.cv.height = h*dpr;
    this.cv.style.height = h+'px';
    this.W=w; this.H=h; this.dpr=dpr;
  }
  clear(){ this.series=[]; return this; }
  // type: 'line' | 'scatter' | 'band'(needs y2) | 'hist'
  add(s){ this.series.push(s); return this; }
  setDomain(xmin,xmax,ymin,ymax){ this.dom={xmin,xmax,ymin,ymax}; return this; }

  _autoDomain(){
    if (this.dom) return this.dom;
    let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    for (const s of this.series){
      const xs=s.x, ys=s.y, y2=s.y2;
      for (let i=0;i<xs.length;i++){
        if (xs[i]<xmin)xmin=xs[i]; if (xs[i]>xmax)xmax=xs[i];
        if (ys[i]<ymin)ymin=ys[i]; if (ys[i]>ymax)ymax=ys[i];
        if (y2){ if(y2[i]<ymin)ymin=y2[i]; if(y2[i]>ymax)ymax=y2[i]; }
      }
    }
    if (!isFinite(xmin)){xmin=0;xmax=1;ymin=0;ymax=1;}
    if (xmin===xmax){xmax=xmin+1;}
    const pad=(ymax-ymin)*0.06||1; ymin-=pad; ymax+=pad;
    return {xmin,xmax,ymin,ymax};
  }
  draw(){
    this._fit();
    const ctx=this.cv.getContext('2d');
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    const {l,r,t,b}=this.opts.pad; const W=this.W,H=this.H;
    const pw=W-l-r, ph=H-t-b;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=this.opts.bg; ctx.fillRect(0,0,W,H);
    const d=this._autoDomain();
    const X=v=>l+(v-d.xmin)/(d.xmax-d.xmin)*pw;
    const Y=v=>t+ph-(v-d.ymin)/(d.ymax-d.ymin)*ph;

    // grid + ticks
    ctx.font='11px ui-monospace,monospace'; ctx.fillStyle=this.opts.ink;
    ctx.strokeStyle=this.opts.line; ctx.lineWidth=1;
    const nx=5, ny=4;
    ctx.textAlign='center'; ctx.textBaseline='top';
    for (let i=0;i<=nx;i++){
      const xv=d.xmin+(d.xmax-d.xmin)*i/nx, px=X(xv);
      if (this.opts.grid){ctx.beginPath();ctx.moveTo(px,t);ctx.lineTo(px,t+ph);ctx.globalAlpha=.35;ctx.stroke();ctx.globalAlpha=1;}
      ctx.fillText(fmt(xv), px, t+ph+5);
    }
    ctx.textAlign='right'; ctx.textBaseline='middle';
    for (let i=0;i<=ny;i++){
      const yv=d.ymin+(d.ymax-d.ymin)*i/ny, py=Y(yv);
      if (this.opts.grid){ctx.beginPath();ctx.moveTo(l,py);ctx.lineTo(l+pw,py);ctx.globalAlpha=.35;ctx.stroke();ctx.globalAlpha=1;}
      ctx.fillText(fmt(yv), l-6, py);
    }
    // axis labels
    ctx.fillStyle=this.opts.ink; ctx.textAlign='center'; ctx.textBaseline='bottom';
    if (this.opts.xlabel) ctx.fillText(this.opts.xlabel, l+pw/2, H-2);
    if (this.opts.ylabel){ ctx.save(); ctx.translate(11,t+ph/2); ctx.rotate(-Math.PI/2); ctx.textBaseline='top'; ctx.fillText(this.opts.ylabel,0,0); ctx.restore(); }

    // series
    let ci=0;
    for (const s of this.series){
      const col=s.color||COLORS[ci++%COLORS.length];
      if (s.type==='band'){
        ctx.beginPath();
        for (let i=0;i<s.x.length;i++){ const px=X(s.x[i]),py=Y(s.y[i]); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
        for (let i=s.x.length-1;i>=0;i--){ ctx.lineTo(X(s.x[i]),Y(s.y2[i])); }
        ctx.closePath(); ctx.fillStyle=col; ctx.globalAlpha=s.alpha??0.18; ctx.fill(); ctx.globalAlpha=1;
      } else if (s.type==='scatter'){
        ctx.fillStyle=col;
        const rad=s.r||2;
        for (let i=0;i<s.x.length;i++){ ctx.beginPath(); ctx.arc(X(s.x[i]),Y(s.y[i]),rad,0,7); ctx.fill(); }
      } else if (s.type==='hist'){
        ctx.fillStyle=col; ctx.globalAlpha=s.alpha??0.8;
        const bw=pw/s.x.length;
        for (let i=0;i<s.x.length;i++){ const px=X(s.x[i]); const py=Y(s.y[i]); const y0=Y(d.ymin<0?0:d.ymin); ctx.fillRect(px-bw/2, py, Math.max(1,bw-1), y0-py); }
        ctx.globalAlpha=1;
      } else { // line
        ctx.strokeStyle=col; ctx.lineWidth=s.w||1.6; ctx.globalAlpha=s.alpha??1;
        ctx.beginPath();
        for (let i=0;i<s.x.length;i++){ const px=X(s.x[i]),py=Y(s.y[i]); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }
        ctx.stroke(); ctx.globalAlpha=1;
      }
    }
    // frame
    ctx.strokeStyle=this.opts.line; ctx.strokeRect(l,t,pw,ph);
    return this;
  }
}
function fmt(v){
  const a=Math.abs(v);
  if (a!==0 && (a<0.01||a>=10000)) return v.toExponential(1);
  if (a<1) return v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
  if (a<100) return (Math.round(v*100)/100).toString();
  return Math.round(v).toString();
}
