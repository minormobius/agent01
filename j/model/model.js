import { ready, K } from '/lib/wasm.js';
import { Plot } from '/lib/plot.js';
import { loadDataset } from '/lib/store.js';

const $ = id => document.getElementById(id);
function flash(m){ const f=$('flash'); f.textContent=m; f.classList.add('show'); clearTimeout(f._t); f._t=setTimeout(()=>f.classList.remove('show'),1800); }

let DS=null, fitPlot, histPlot, lastTau=null, popTaus=null;

// The five candidate models. Each entry: [label, kernel fn, color, keyParam].
const MODELS = [
  ['Fickian sphere',  m=>K.fit_sphere_diffusion(m.bins,m.mean,60), '#39d3bb', 'tau'],
  ['Reaction–diffusion', m=>K.fit_reaction_diffusion(m.bins,m.mean), '#f0a020', 'phi'],
  ['Exp penetration', m=>K.fit_exp_penetration(m.bins,m.mean),      '#ff6b6b', 'lambda_over_R'],
  ['Stretched (Weibull)', m=>K.fit_weibull_penetration(m.bins,m.mean), '#c08cff', 'beta'],
  ['Bi-exponential',  m=>K.fit_biexp_penetration(m.bins,m.mean),    '#6bd16b', 'lambda1_over_R'],
];
function param(res,name){ const p=res.params.find(x=>x[0]===name); return p?p[1]:null; }
function fmtNum(v){ if(v==null) return '—'; if(Math.abs(v)>=1e4||(v!==0&&Math.abs(v)<1e-3)) return v.toExponential(3); return (Math.round(v*10000)/10000).toString(); }

function setDataset(ds){
  DS=ds;
  if (!ds || !ds.bins){ $('dsInfo').textContent='no dataset'; return; }
  $('dsInfo').textContent=`${ds.n_curves} curves · ${ds.n_bins} bins`
    + (ds.meta&&ds.meta.demo?` · demo: ${ds.meta.demo}`:'')
    + (ds.meta&&ds.meta.n_circles?` · ${ds.meta.n_circles} spheres`:'');
  drawData();
}
function drawData(extra){
  fitPlot = fitPlot || new Plot($('fitPlot'),{height:340,xlabel:'r / R (center → surface)',ylabel:'intensity'});
  fitPlot.clear();
  if (DS){
    const up=DS.mean.map((m,i)=>m+DS.std[i]), dn=DS.mean.map((m,i)=>m-DS.std[i]);
    fitPlot.add({type:'band',x:DS.bins,y:up,y2:dn,color:'#7aa2ff',alpha:0.16});
    fitPlot.add({type:'line',x:DS.bins,y:DS.mean,color:'#7aa2ff',w:2.2});
  }
  if (extra) extra(fitPlot);
  fitPlot.draw();
}

function doFit(){
  if (!DS){ flash('No dataset — generate a demo or send one from the ImageJ page'); return; }
  const bins=new Float32Array(DS.bins), mean=new Float32Array(DS.mean);
  const m={bins,mean};
  const n=bins.length;

  const results = MODELS.map(([label,fn,color,key])=>{
    const res=fn(m);
    const k=res.n_params, sse=res.sse;
    const aic = n*Math.log(sse/n) + 2*k;
    const bic = n*Math.log(sse/n) + k*Math.log(n);
    return {label,color,key,res,aic,bic};
  });
  results.sort((a,b)=>a.aic-b.aic);
  const best=results[0];
  results.forEach(r=>{ r.dAIC=r.aic-best.aic; r.dBIC=r.bic-results.reduce((mn,x)=>Math.min(mn,x.bic),Infinity); });

  // comparison table
  $('cmpTbl').innerHTML = '<thead><tr><th>model</th><th>key param</th><th>R²</th><th>ΔAIC</th></tr></thead><tbody>'
    + results.map(r=>{
        const kv=fmtNum(param(r.res,r.key));
        const hl=r===best?' style="color:var(--accent)"':'';
        return `<tr${hl}><td><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${r.color};margin-right:5px"></span>${r.label}</td><td>${r.key.replace('_over_R','/R')}=${kv}</td><td>${r.res.r2.toFixed(4)}</td><td>${r.dAIC.toFixed(1)}</td></tr>`;
      }).join('') + '</tbody>';

  // best-model details
  $('bestName').textContent = best.label;
  $('bestTbl').innerHTML = '<tbody>'
    + best.res.params.map(([k,v])=>`<tr><td>${k}</td><td>${fmtNum(v)}</td></tr>`).join('')
    + `<tr><td>R²</td><td>${best.res.r2.toFixed(4)}</td></tr>`
    + `<tr><td>AIC / BIC</td><td>${best.aic.toFixed(1)} / ${best.bic.toFixed(1)}</td></tr></tbody>`;
  $('bestNotes').innerHTML = best.res.notes.map(n=>`<li>${n}</li>`).join('');

  // overlay: best bold, others faint
  drawData(p=>{
    for (const r of results.slice().reverse()){
      const isBest = r===best;
      p.add({type:'line', x:DS.bins, y:Array.from(r.res.fit), color:r.color, w:isBest?2.8:1.3, alpha:isBest?1:0.55});
    }
  });

  // τ for the D card comes from the Fickian fit (if present)
  const fic = results.find(r=>r.res.model==='fickian_sphere');
  lastTau = fic?param(fic.res,'tau'):null;

  // population histogram (Fickian τ across curves)
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
  flash('best: '+best.label);
}

function drawHist(taus){
  histPlot = histPlot || new Plot($('histPlot'),{height:200,xlabel:'τ = Dt/R² (Fickian, per curve)',ylabel:'count'});
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
  const D = lastTau*R*R/t;
  $('Dval').textContent = D.toExponential(2)+' µm²/s';
  if (popTaus && popTaus.length){
    const Ds=popTaus.map(tau=>tau*R*R/t);
    const m=Ds.reduce((a,b)=>a+b,0)/Ds.length;
    const sd=Math.sqrt(Ds.reduce((a,b)=>a+(b-m)**2,0)/Ds.length);
    $('Dpop').textContent=`population D = ${m.toExponential(2)} ± ${sd.toExponential(2)} µm²/s`;
  } else $('Dpop').textContent='';
}

// ---- analytic demo dataset (clean, so each fit can win its own physics) ----
function sphPhi(rho,tau,nt=40){ let r=Math.max(1e-4,rho),s=0; for(let n=1;n<=nt;n++){const nf=n,sg=n%2==0?1:-1; s+=sg/nf*Math.sin(nf*Math.PI*r)*Math.exp(-nf*nf*Math.PI*Math.PI*tau);} return 1+2/(Math.PI*r)*s; }
const DEMO = {
  fickian: [rho=>Math.max(0,sphPhi(rho,0.03)),                'Fickian τ=0.03'],
  thiele:  [rho=>{const p=6,sp=Math.sinh(p);return Math.sinh(p*Math.max(1e-3,rho))/(Math.max(1e-3,rho)*sp);}, 'reaction–diffusion φ=6'],
  weibull: [rho=>Math.exp(-Math.pow((1-rho)/0.18,0.6)),       'Weibull λ=0.18 β=0.6'],
  biexp:   [rho=>0.5*Math.exp(-(1-rho)/0.06)+0.5*Math.exp(-(1-rho)/0.5), 'bi-exp λ₁=0.06 λ₂=0.5'],
  exp:     [rho=>Math.exp(-(1-rho)/0.2),                      'exponential λ=0.2'],
};
function genDemo(){
  const NB=80, NC=40, noise=+$('demoNoise').value;
  const [g,label]=DEMO[$('demoModel').value];
  const bins=[]; for(let b=0;b<NB;b++) bins.push(b/(NB-1));
  let rng=Math.floor(Math.random()*1e9);
  const rnd=()=>{rng=(rng*1103515245+12345)&0x7fffffff; return rng/0x7fffffff;};
  const randn=()=>{let s=0;for(let i=0;i<6;i++)s+=rnd();return s-3;};
  const curves=new Float32Array(NC*NB);
  for (let c=0;c<NC;c++){
    const amp=1+(rnd()-0.5)*0.10;           // per-sphere brightness jitter
    for (let b=0;b<NB;b++) curves[c*NB+b]=35+210*amp*g(bins[b])+randn()*noise;
  }
  const mean=new Array(NB).fill(0), std=new Array(NB).fill(0);
  for (let b=0;b<NB;b++){ let s=0; for(let c=0;c<NC;c++)s+=curves[c*NB+b]; mean[b]=s/NC;
    let v=0; for(let c=0;c<NC;c++)v+=(curves[c*NB+b]-mean[b])**2; std[b]=Math.sqrt(v/NC); }
  setDataset({n_curves:NC,n_bins:NB,bins,mean,std,curves,meta:{demo:label}});
  flash('demo: '+label);
}

// ---- CSV/JSON import ----
function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l && !l.startsWith('#'));
  let bins=null; const curves=[]; let mean=null,std=null;
  for (const ln of lines){
    const parts=ln.split(','); const tag=parts[0].trim();
    const vals=parts.slice(1).map(Number);
    if (tag==='rho') bins=vals; else if (tag==='mean') mean=vals; else if (tag==='std') std=vals;
    else if (tag.startsWith('curve')) curves.push(vals);
  }
  if (!bins) return null;
  const n_bins=bins.length;
  if (!mean){ mean=new Array(n_bins).fill(0); for (let b=0;b<n_bins;b++){ let s=0; for(const c of curves)s+=c[b]; mean[b]=s/(curves.length||1); } }
  if (!std) std=new Array(n_bins).fill(0);
  return { n_curves:curves.length, n_bins, bins, mean, std, curves: curves.length?Float32Array.from(curves.flat()):null };
}

$('loadBtn').addEventListener('click', ()=>{ const d=loadDataset(); if(d){setDataset(d);flash('loaded from ImageJ tab');} else flash('nothing stored — run Monte-Carlo on the ImageJ page'); });
$('file').addEventListener('change', e=>{ const f=e.target.files[0]; if(!f)return; const rd=new FileReader();
  rd.onload=()=>{ try{ const ds = f.name.endsWith('.csv')?parseCSV(rd.result):JSON.parse(rd.result); if(ds) setDataset(ds); else flash('parse failed'); }catch(err){flash('parse error');console.error(err);} };
  rd.readAsText(f); });
$('demoBtn').addEventListener('click', genDemo);
$('demoNoise').addEventListener('input', e=>$('demoNoiseV').textContent=e.target.value);
$('fitBtn').addEventListener('click', doFit);
$('Rum').addEventListener('input', updateD);
$('tsec').addEventListener('input', updateD);

ready().then(()=>{ $('ver').textContent=K.version(); const d=loadDataset(); if(d) setDataset(d); else { $('dsInfo').textContent='no dataset — generate a demo below, or send one from the ImageJ page'; drawData(); } })
  .catch(e=>{ $('ver').textContent='wasm failed'; console.error(e); });
