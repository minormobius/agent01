// Cross-page, in-browser handoff for the Monte-Carlo radial dataset.
// Nothing leaves the tab — localStorage on j.mino.mobi only.
const KEY = 'jimagej.radial.v1';

export function saveDataset(ds){
  try { localStorage.setItem(KEY, JSON.stringify(ds)); return true; }
  catch(e){ console.warn('saveDataset failed', e); return false; }
}
export function loadDataset(){
  try { const s=localStorage.getItem(KEY); return s?JSON.parse(s):null; }
  catch(e){ return null; }
}
export function hasDataset(){ return !!localStorage.getItem(KEY); }

// CSV: first row = normalized radius bins; following rows = per-curve intensity,
// plus a final "mean" row. Keeps everything client-side for download.
export function datasetToCSV(ds){
  const lines = [];
  lines.push('# j.mino.mobi radial brightness dataset');
  lines.push('# n_curves='+ds.n_curves+' n_bins='+ds.n_bins);
  lines.push('rho,'+ds.bins.map(b=>b.toFixed(4)).join(','));
  if (ds.curves){
    for (let c=0;c<ds.n_curves;c++){
      const row=[];
      for (let b=0;b<ds.n_bins;b++) row.push(ds.curves[c*ds.n_bins+b].toFixed(3));
      lines.push('curve'+c+','+row.join(','));
    }
  }
  lines.push('mean,'+ds.mean.map(v=>v.toFixed(3)).join(','));
  lines.push('std,'+ds.std.map(v=>v.toFixed(3)).join(','));
  return lines.join('\n');
}

export function download(name, text, mime='text/plain'){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
