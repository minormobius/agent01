import { ready, K } from '/lib/wasm.js';
import { Plot } from '/lib/plot.js';
import { loadDataset } from '/lib/store.js';

const $ = id => document.getElementById(id);
function flash(m){ const f=$('flash'); f.textContent=m; f.classList.add('show'); clearTimeout(f._t); f._t=setTimeout(()=>f.classList.remove('show'),1800); }

let DS=null, fitPlot, histPlot, lastTau=null, popTaus=null;

function param(res, name){ const p=res.params.find(x=>x[0]===name); return p?p[1]:null; }

function setDataset(ds){
  DS=ds;
  if (!ds || !ds.bins){ $('dsInfo').textContent='no dataset'; return; }
  $('dsInfo').textContent=`${ds.n_curves} curves · ${ds.n_bins} bins`+(ds.meta?` · ${ds.meta.n_circles} spheres`:'');
  drawData();
}
function drawData(){
  fitPlot = fitPlot || new Plot($('fitPlot'),{height:340,xlabel:'r / R (center → surface)',ylabel:'intensity'});
  fitPlot.clear();
  if (DS){
    const up=DS.mean.map((m,i)=>m+DS.std[i]), dn=DS.mean.map((m,i)=>m-DS.std[i]);
    fitPlot.add({type:'band',x:DS.bins,y:up,y2:dn,color:'#7aa2ff',alpha:0.16});
    fitPlot.add({type:'line',x:DS.bins,y:DS.mean,color:'#7aa2ff',w:2.2});
  }
  fitPlot.draw();
}

function tableFrom(res){
  return res.params.map(([k,v])=>`<tr><td>${k}</td><td>${fmtNum(v)}</td></tr>`).join('')
    + `<tr><td>R²</td><td>${res.r2.toFixed(4)}</td></tr>`;
}
function fmtNum(v){ if(Math.abs(v)>=1e4||(v!==0&&Math.abs(v)<1e-3)) return v.toExponential(3); return (Math.round(v*10000)/10000).toString(); }

function doFit(){
  if (!DS){ flash('No dataset — generate one on the ImageJ page'); return; }
  const bins=new Float32Array(DS.bins);
  const mean=new Float32Array(DS.mean);

  const fic = K.fit_sphere_diffusion(bins, mean, 60);
  const exp = K.fit_exp_penetration(bins, mean);
  lastTau = param(fic,'tau');

  $('ficTbl').innerHTML = '<tbody>'+tableFrom(fic)+'</tbody>';
  $('ficNotes').innerHTML = fic.notes.map(n=>`<li>${n}</li>`).join('');
  $('expTbl').innerHTML = '<tbody>'+tableFrom(exp)+'</tbody>';
  $('expNotes').innerHTML = exp.notes.map(n=>`<li>${n}</li>`).join('');

  drawData();
  fitPlot.add({type:'line',x:DS.bins,y:Array.from(fic.fit),color:'#39d3bb',w:2.4});
  fitPlot.add({type:'line',x:DS.bins,y:Array.from(exp.fit),color:'#f0a020',w:2.0});
  fitPlot.draw();

  // population fit?
  popTaus=null;
  if ($('target').value==='each' && DS.curves){
    popTaus=[];
    for (let c=0;c<DS.n_curves;c++){
      const y=new Float32Array(DS.n_bins);
      for (let b=0;b<DS.n_bins;b++) y[b]=DS.curves[c*DS.n_bins+b];
      const r=K.fit_sphere_diffusion(bins,y,40);
      const t=param(r,'tau'); if (t!=null && isFinite(t)) popTaus.push(t);
    }
    drawHist(popTaus);
  } else {
    histPlot && histPlot.clear().draw();
    $('histInfo').textContent='switch fit target to "each curve" for a population histogram';
  }
  updateD();
  flash('fit complete');
}

function drawHist(taus){
  histPlot = histPlot || new Plot($('histPlot'),{height:200,xlabel:'τ = Dt/R²',ylabel:'count'});
  if (!taus.length){ histPlot.clear().draw(); return; }
  const mn=Math.min(...taus), mx=Math.max(...taus); const nb=24;
  const span=(mx-mn)||1; const counts=new Array(nb).fill(0); const centers=[];
  for (let i=0;i<nb;i++) centers.push(mn+span*(i+0.5)/nb);
  for (const t of taus){ let i=Math.floor((t-mn)/span*nb); if(i>=nb)i=nb-1; if(i<0)i=0; counts[i]++; }
  histPlot.clear().add({type:'hist',x:centers,y:counts,color:'#c08cff'}).draw();
  const mean=taus.reduce((a,b)=>a+b,0)/taus.length;
  const sd=Math.sqrt(taus.reduce((a,b)=>a+(b-mean)**2,0)/taus.length);
  $('histInfo').textContent=`population τ = ${mean.toFixed(4)} ± ${sd.toFixed(4)} (n=${taus.length})`;
}

function updateD(){
  const R=+$('Rum').value, t=+$('tsec').value;
  if (lastTau==null || !(R>0) || !(t>0)){ $('Dval').textContent='—'; $('Dpop').textContent=''; return; }
  const D = lastTau*R*R/t; // µm²/s
  $('Dval').textContent = D.toExponential(2)+' µm²/s';
  if (popTaus && popTaus.length){
    const Ds=popTaus.map(tau=>tau*R*R/t);
    const m=Ds.reduce((a,b)=>a+b,0)/Ds.length;
    const sd=Math.sqrt(Ds.reduce((a,b)=>a+(b-m)**2,0)/Ds.length);
    $('Dpop').textContent=`population D = ${m.toExponential(2)} ± ${sd.toExponential(2)} µm²/s`;
  } else $('Dpop').textContent='';
}

// ---- CSV/JSON import ----
function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l && !l.startsWith('#'));
  let bins=null; const curves=[]; let mean=null,std=null;
  for (const ln of lines){
    const parts=ln.split(','); const tag=parts[0].trim();
    const vals=parts.slice(1).map(Number);
    if (tag==='rho') bins=vals;
    else if (tag==='mean') mean=vals;
    else if (tag==='std') std=vals;
    else if (tag.startsWith('curve')) curves.push(vals);
  }
  if (!bins) return null;
  const n_bins=bins.length;
  if (!mean){ // derive from curves
    mean=new Array(n_bins).fill(0); std=new Array(n_bins).fill(0);
    for (let b=0;b<n_bins;b++){ let s=0; for(const c of curves)s+=c[b]; mean[b]=s/(curves.length||1); }
  }
  if (!std) std=new Array(n_bins).fill(0);
  return { n_curves:curves.length, n_bins, bins, mean, std,
    curves: curves.length?Float32Array.from(curves.flat()):null };
}

$('loadBtn').addEventListener('click', ()=>{ const d=loadDataset(); if(d){setDataset(d);flash('loaded from ImageJ tab');} else flash('nothing stored — run Monte-Carlo on the ImageJ page'); });
$('file').addEventListener('change', e=>{ const f=e.target.files[0]; if(!f)return; const rd=new FileReader();
  rd.onload=()=>{ try{ const ds = f.name.endsWith('.csv')?parseCSV(rd.result):JSON.parse(rd.result); if(ds) setDataset(ds); else flash('parse failed'); }catch(err){flash('parse error');console.error(err);} };
  rd.readAsText(f); });
$('fitBtn').addEventListener('click', doFit);
$('Rum').addEventListener('input', updateD);
$('tsec').addEventListener('input', updateD);

ready().then(()=>{ $('ver').textContent=K.version(); const d=loadDataset(); if(d) setDataset(d); else { $('dsInfo').textContent='no dataset — run Monte-Carlo on the ImageJ page, then “Send to /model”'; drawData(); } })
  .catch(e=>{ $('ver').textContent='wasm failed'; console.error(e); });
