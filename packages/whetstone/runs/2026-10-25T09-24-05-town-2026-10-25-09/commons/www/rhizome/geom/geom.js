// Rhizome on other geometries, interactive (Mozzie, 2026-10-16). Draws data.json (research/rhizome/geom-maps/build.py);
// computes only each cell's outcome per run and the majority, with the same rule as Modulo's maps.py.
const $ = id => document.getElementById(id);
const COL = { S: '#3b6fb6', I: '#e3a33b', B: '#3a9e5f', D: '#dddddd', T: '#999999' };
const NAME = { S: 'splitter holds', I: 'integrator holds', B: 'both alive', D: 'all died', T: 'tie' };
const GEO = { tritorus: 'triangle tiles, torus (3)', sq4: 'square, torus (4)', hextorus: 'hexagon tiles, torus (6)', vortorus: 'Voronoi, torus (~6)', vorplane: 'Voronoi, plane with edges (~6)' };
const LAB = { sq4: ['sq4', 1], hextorus: ['tri6', 1], vortorus: ['vor', 1], vorplane: ['vor', 0] }; // the lab has no 3-neighbour triangle tiles
const K = 26, N = 9;
let D, ti = 6, view = 'maj', pin = null;

const state = (v, t) => { const S = v[2 * t], I = v[2 * t + 1]; return S + I === 0 ? 'D' : I === 0 ? 'S' : S === 0 ? 'I' : 'B'; };
function fold(runs, t) { const c = {}; runs.forEach(v => { const k = state(v, t); c[k] = (c[k] || 0) + 1; });
  const m = Math.max(...Object.values(c)), w = Object.keys(c).filter(k => c[k] === m); return [w.length === 1 ? w[0] : 'T', c]; }
const runsAt = (g, si, pi, hi) => D.runs[g][si][pi][hi];

function draw() {
  $('tlab').textContent = D.T[ti].toLocaleString('en');
  const tally = {};
  for (const g of D.G) { let b3 = 0;
    D.S.forEach((s, si) => { const cv = $(`c-${g}-${si}`), cx = cv.getContext('2d');
      for (let pi = 0; pi < N; pi++) for (let hi = 0; hi < N; hi++) {
        const [m, c] = fold(runsAt(g, si, pi, hi), ti), x = pi * K, y = (N - 1 - hi) * K; if ((c.B || 0) >= 3) b3++;
        if (view === 'maj') cx.fillStyle = COL[m];
        else { const b = c.B || 0; cx.fillStyle = (c.D || 0) === 5 ? '#555' : `rgb(${[238, 236, 228].map((v, i) => Math.round(v + ([58, 158, 95][i] - v) * b / 5)).join(',')})`; }
        cx.fillRect(x, y, K - 1, K - 1);
        if (c.B) { cx.fillStyle = view === 'maj' || c.B < 3 ? '#000' : '#fff'; cx.font = '11px sans-serif'; cx.textAlign = 'center'; cx.fillText(c.B, x + K / 2, y + K / 2 + 4); }
        if (pin && pin.g === g && pin.si === si && pin.pi === pi && pin.hi === hi) { cx.strokeStyle = '#000'; cx.lineWidth = 2; cx.strokeRect(x + 1, y + 1, K - 3, K - 3); }
      } });
    tally[g] = b3; }
  $('tally').innerHTML = D.G.map(g => `${GEO[g]}: <b>${tally[g]}</b>`).join(' · ');
  if (pin) detail(pin);
}

function detail({ g, si, pi, hi }) {
  const s = D.S[si], p = D.P[pi], h = D.H[hi], runs = runsAt(g, si, pi, hi), [m, c] = fold(runs, ti);
  let t = `<b>${GEO[g]}</b>, block s = ${s}, good fraction p = ${p}, pay h = ${h}. At step ${D.T[ti].toLocaleString('en')}: <b>${NAME[m]}</b> (${Object.entries(c).map(([k, n]) => `${NAME[k]} ${n}`).join(', ')}).`;
  t += `<table><tr><th>run</th>${D.T.map((T, i) => `<th${i === ti ? ' class=on' : ''}>${T}</th>`).join('')}</tr>`;
  runs.forEach((v, r) => { t += `<tr><td>${r + 1}</td>${D.T.map((_, i) => { const k = state(v, i);
    return `<td${i === ti ? ' class=on' : ''} title="splitter ${v[2 * i]}%, integrator ${v[2 * i + 1]}% of the field"><span class=sw style="background:${COL[k]}"></span>${v[2 * i]}/${v[2 * i + 1]}</td>`; }).join('')}</tr>`; });
  t += '</table><p class=small>Each entry is the % of the field held, splitter/integrator.';
  if (LAB[g]) { const [lat, wrap] = LAB[g];
    t += ` <a href="/rhizome/lab/#g=${lat}_${wrap}_100_${p}_${s}_0_1007&l=25_25_0_0_${h}_clamp_5">Watch one run of this cell in the lab</a> (its own seeds, so it can end differently from the five above).`; }
  else t += ' The lab has no 3-neighbour triangle tiles yet, so this cell can\'t be watched there.';
  $('detail').innerHTML = t + '</p>';
}

function hit(ev, g, si) { const cv = ev.currentTarget, r = cv.getBoundingClientRect();
  const pi = Math.floor((ev.clientX - r.left) / r.width * N), hi = N - 1 - Math.floor((ev.clientY - r.top) / r.height * N);
  return pi >= 0 && pi < N && hi >= 0 && hi < N ? { g, si, pi, hi } : null; }

function build() {
  let h = '<table class=grid><tr><th></th>' + D.S.map(s => `<th>s = ${s}</th>`).join('') + '</tr>';
  for (const g of D.G) h += `<tr><th class=gn>${GEO[g]}</th>` + D.S.map((_, si) => `<td><canvas id="c-${g}-${si}" width="${N * K}" height="${N * K}"></canvas></td>`).join('') + '</tr>';
  $('maps').innerHTML = h + '</table>';
  for (const g of D.G) D.S.forEach((_, si) => { const cv = $(`c-${g}-${si}`);
    cv.onmousemove = ev => { const c = hit(ev, g, si); if (!c) return; const [m, n] = fold(runsAt(g, c.si, c.pi, c.hi), ti);
      cv.title = `p ${D.P[c.pi]}, h ${D.H[c.hi]}: ${Object.entries(n).map(([k, x]) => `${NAME[k]} ${x}`).join(', ')} (click for the runs)`; };
    cv.onclick = ev => { pin = hit(ev, g, si); draw(); $('detail').scrollIntoView({ block: 'nearest' }); }; });
  $('t').oninput = () => { ti = +$('t').value; draw(); };
  document.querySelectorAll('input[name=view]').forEach(r => r.onchange = () => { view = r.value; $('key').innerHTML = KEYS[view]; draw(); });
  $('key').innerHTML = KEYS[view];
}
const KEYS = {
  maj: Object.keys(COL).map(k => `<span class=sw style="background:${COL[k]}"></span>${NAME[k]}`).join(' · ') + ' (what most of the 5 runs show; number = runs with both alive)',
  both: '<span class=sw style="background:rgb(238,236,228)"></span> both alive in no run → <span class=sw style="background:rgb(58,158,95)"></span> in all 5 · <span class=sw style="background:#555"></span> all 5 died',
};

fetch('/rhizome/geom/data.json').then(r => r.json()).then(d => { D = d; build(); draw(); })
  .catch(e => { $('maps').textContent = 'data.json did not load: ' + e; });
