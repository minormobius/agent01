import { ready, K } from '/lib/wasm.js';
import { toImageData } from '/lib/colormap.js';
import { Plot } from '/lib/plot.js';
import { saveDataset, datasetToCSV, download } from '/lib/store.js';

const $ = id => document.getElementById(id);
function flash(msg){ const f=$('flash'); f.textContent=msg; f.classList.add('show'); clearTimeout(f._t); f._t=setTimeout(()=>f.classList.remove('show'),1800); }

// ---- application state ----
const S = {
  w:0,h:0, gray:null, rgba:null, edges:null,
  circles:[], line:null, dataset:null, scale:1,
};

const imgCv=$('img'), ov=$('ov');
let kernel=null;

// ---------- image display ----------
function setImage(rgba, w, h){
  S.rgba=rgba; S.w=w; S.h=h;
  S.gray = K.grayscale(rgba, w, h);
  S.edges=null; S.circles=[]; S.line=null; S.dataset=null;
  $('circleCount').textContent='—';
  $('toModelBtn').disabled=$('dlCsv').disabled=$('dlJson').disabled=true;
  $('mcCount').textContent='—';
  // size canvases: intrinsic = image px; CSS scaled to fit
  const maxW = Math.min(($('wrap').parentElement.clientWidth)||820, 900);
  S.scale = Math.min(maxW / w, 1.6);
  for (const c of [imgCv, ov]){ c.width=w; c.height=h; c.style.width=(w*S.scale)+'px'; c.style.height=(h*S.scale)+'px'; }
  $('dims').textContent = `${w}×${h}px`;
  render(); computeStats(); drawProfile(); drawMC();
}

function render(){
  const showEdges = $('showEdges').checked && S.edges;
  const src = showEdges ? S.edges : S.gray;
  const lo = showEdges ? 0 : +$('lo').value;
  const hi = showEdges ? 255 : +$('hi').value;
  const id = toImageData(src, S.w, S.h, $('cmap').value, lo, hi);
  imgCv.getContext('2d').putImageData(id, 0, 0);
  drawOverlay();
}

function drawOverlay(){
  const ctx=ov.getContext('2d'); ctx.clearRect(0,0,S.w,S.h);
  const lw = 1.6/S.scale;
  if ($('showCircles').checked && S.circles.length){
    ctx.lineWidth=lw; ctx.strokeStyle='#ff6b6b'; ctx.fillStyle='#ff6b6b';
    for (const c of S.circles){
      ctx.beginPath(); ctx.arc(c.cx,c.cy,c.r,0,7); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.cx,c.cy,Math.max(1.2,lw*1.4),0,7); ctx.fill();
    }
  }
  if (S.line){
    const {x0,y0,x1,y1}=S.line; const th=+$('lThick').value;
    ctx.lineWidth=lw*1.4; ctx.strokeStyle='#39d3bb';
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    if (th>1){ // show the band
      const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy)||1; const px=-dy/len*th/2, py=dx/len*th/2;
      ctx.globalAlpha=.25; ctx.fillStyle='#39d3bb';
      ctx.beginPath(); ctx.moveTo(x0+px,y0+py); ctx.lineTo(x1+px,y1+py); ctx.lineTo(x1-px,y1-py); ctx.lineTo(x0-px,y0-py); ctx.closePath(); ctx.fill();
      ctx.globalAlpha=1;
    }
  }
}

// ---------- stats ----------
let histPlot;
function computeStats(){
  const s = K.stats(S.gray);
  if (!s) return;
  const g=$('statsGrid');
  const rows=[['count',s.count],['mean',s.mean.toFixed(2)],['std',s.std.toFixed(2)],
    ['min',s.min.toFixed(0)],['max',s.max.toFixed(0)],['median',s.median.toFixed(0)],
    ['p1 / p99',`${s.p1.toFixed(0)} / ${s.p99.toFixed(0)}`],['integrated',s.integrated.toExponential(2)]];
  g.innerHTML = rows.map(([k,v])=>`<div class="k">${k}</div><div class="v">${v}</div>`).join('');
  histPlot = histPlot || new Plot($('histPlot'), {height:90, pad:{l:40,r:8,t:6,b:18}, ylabel:'', xlabel:''});
  const x=[], y=[]; for(let i=0;i<256;i++){x.push(i);y.push(s.hist[i]);}
  histPlot.clear().add({type:'hist',x,y,color:'#7aa2ff'}).draw();
}

// ---------- edges + circles ----------
function ensureEdges(){
  if (!S.edges) S.edges = K.sobel(S.gray, S.w, S.h, +$('cBlur').value);
  return S.edges;
}
function detect(){
  if (!S.gray){ flash('Load an image first'); return; }
  S.edges = K.sobel(S.gray, S.w, S.h, +$('cBlur').value); // refresh with current σ
  S.circles = K.detect_circles(
    S.gray, S.w, S.h,
    +$('cBlur').value, +$('cMinR').value, +$('cMaxR').value,
    +$('cMinD').value, +$('cEdge').value, +$('cVote').value, +$('cMax').value
  ) || [];
  $('circleCount').textContent = S.circles.length;
  $('showCircles').checked = true;
  render();
  flash(`${S.circles.length} spheres detected`);
}

// ---------- line profile ----------
let profPlot;
function drawProfile(){
  profPlot = profPlot || new Plot($('profPlot'),{height:160,xlabel:'distance (px)',ylabel:'intensity'});
  if (!S.line || !S.gray){ profPlot.clear().draw(); $('profInfo').textContent='draw a line →'; return; }
  const {x0,y0,x1,y1}=S.line; const th=+$('lThick').value;
  const prof = K.line_profile(S.gray,S.w,S.h,x0,y0,x1,y1,th,0);
  const x=[],y=[]; for(let i=0;i<prof.length;i++){x.push(i);y.push(prof[i]);}
  profPlot.clear().add({type:'line',x,y,color:'#39d3bb'}).draw();
  const len=Math.hypot(x1-x0,y1-y0);
  $('profInfo').textContent=`len ${len.toFixed(1)}px · ${prof.length} samples · width ${th}px`;
}

// pointer drawing on overlay (image-pixel coordinates)
let dragging=false;
function toImg(e){ const r=ov.getBoundingClientRect(); return { x:(e.clientX-r.left)*(S.w/r.width), y:(e.clientY-r.top)*(S.h/r.height) }; }
ov.addEventListener('pointerdown', e=>{ if(!S.gray)return; dragging=true; ov.setPointerCapture(e.pointerId); const p=toImg(e); S.line={x0:p.x,y0:p.y,x1:p.x,y1:p.y}; drawOverlay(); });
ov.addEventListener('pointermove', e=>{ if(!dragging)return; const p=toImg(e); S.line.x1=p.x; S.line.y1=p.y;
  if (e.shiftKey){ if(Math.abs(p.x-S.line.x0)>Math.abs(p.y-S.line.y0)) S.line.y1=S.line.y0; else S.line.x1=S.line.x0; }
  drawOverlay(); drawProfile(); });
ov.addEventListener('pointerup', ()=>{ dragging=false; drawProfile(); });

// ---------- Monte-Carlo radial ----------
let mcPlot;
function runMC(){
  if (!S.circles.length){ flash('Detect circles first'); return; }
  const cx=new Float64Array(S.circles.map(c=>c.cx));
  const cy=new Float64Array(S.circles.map(c=>c.cy));
  const rr=new Float64Array(S.circles.map(c=>c.r));
  const seed = BigInt(Math.floor(Math.random()*1e15));
  const ds = K.monte_carlo_radial(S.gray,S.w,S.h,cx,cy,rr,
    +$('mcAngles').value, +$('mcThick').value, +$('mcBins').value, seed);
  ds.meta = {w:S.w,h:S.h, n_circles:S.circles.length, generated:new Date().toISOString()};
  S.dataset = ds;
  $('mcCount').textContent = ds.n_curves;
  $('toModelBtn').disabled=$('dlCsv').disabled=$('dlJson').disabled = ds.n_curves===0;
  drawMC();
  flash(`${ds.n_curves} radial curves`);
}
function drawMC(){
  mcPlot = mcPlot || new Plot($('mcPlot'),{height:170,xlabel:'r / R (center→surface)',ylabel:'intensity'});
  const ds=S.dataset;
  if (!ds || !ds.n_curves){ mcPlot.clear().draw(); return; }
  mcPlot.clear();
  // sample up to 40 individual curves, faint
  const step=Math.max(1, Math.floor(ds.n_curves/40));
  for (let c=0;c<ds.n_curves;c+=step){
    const y=[]; for(let b=0;b<ds.n_bins;b++) y.push(ds.curves[c*ds.n_bins+b]);
    mcPlot.add({type:'line',x:ds.bins,y,color:'#7aa2ff',alpha:0.10,w:1});
  }
  // ±1σ band + mean
  const up=ds.mean.map((m,i)=>m+ds.std[i]), dn=ds.mean.map((m,i)=>m-ds.std[i]);
  mcPlot.add({type:'band',x:ds.bins,y:up,y2:dn,color:'#39d3bb',alpha:0.18});
  mcPlot.add({type:'line',x:ds.bins,y:ds.mean,color:'#39d3bb',w:2.4});
  mcPlot.draw();
}

// ---------- wiring ----------
function readFile(file){
  const url=URL.createObjectURL(file); const im=new Image();
  im.onload=()=>{ const c=document.createElement('canvas'); c.width=im.naturalWidth;c.height=im.naturalHeight;
    const cx=c.getContext('2d'); cx.drawImage(im,0,0);
    const id=cx.getImageData(0,0,c.width,c.height);
    setImage(new Uint8Array(id.data.buffer.slice(0)), c.width, c.height);
    URL.revokeObjectURL(url); flash('image loaded'); };
  im.onerror=()=>flash('could not decode image');
  im.src=url;
}
function genSynth(){
  const seed=BigInt(Math.floor(Math.random()*1e15));
  const rgba=K.synth_image(512,512,18,18,46,0.18,6,seed);
  setImage(new Uint8Array(rgba), 512,512);
  flash('synthetic confocal field generated');
}

$('file').addEventListener('change',e=>{ if(e.target.files[0]) readFile(e.target.files[0]); });
$('synthBtn').addEventListener('click', genSynth);
$('detectBtn').addEventListener('click', detect);
$('mcBtn').addEventListener('click', runMC);
$('cmap').addEventListener('change', render);
$('lo').addEventListener('input', render);
$('hi').addEventListener('input', render);
$('showEdges').addEventListener('change', e=>{ if(e.target.checked) ensureEdges(); render(); });
$('showCircles').addEventListener('change', render);
$('lThick').addEventListener('input', e=>{ $('lThickV').textContent=e.target.value; drawOverlay(); drawProfile(); });
for (const [id,vid] of [['cBlur','cBlurV'],['cEdge','cEdgeV'],['cVote','cVoteV'],['mcThick','mcThickV']])
  $(id).addEventListener('input', e=>$(vid).textContent=(+e.target.value).toFixed(2).replace(/\.?0+$/,''));
$('mcThick').addEventListener('input', e=>$('mcThickV').textContent=e.target.value);

$('toModelBtn').addEventListener('click', ()=>{ if(S.dataset){ saveDataset(S.dataset); location.href='/model/'; }});
$('dlCsv').addEventListener('click', ()=>{ if(S.dataset) download('radial.csv', datasetToCSV(S.dataset),'text/csv'); });
$('dlJson').addEventListener('click', ()=>{ if(S.dataset) download('radial.json', JSON.stringify(S.dataset),'application/json'); });
window.addEventListener('resize', ()=>{ if(S.gray){ histPlot&&computeStats(); drawProfile(); drawMC(); }});

// ---------- boot ----------
ready().then(()=>{ kernel=K; $('ver').textContent=K.version(); genSynth(); })
  .catch(err=>{ $('ver').textContent='wasm failed'; console.error(err); flash('WASM failed to load'); });
