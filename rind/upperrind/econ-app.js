// econ-app.js — the dashboard over econ.js (the production solver). No canvas: DOM bars, resolved live
// from the demand + population sliders. Everything shown is SOLVED (econ.solveEconomy), not supposed.
import { solveEconomy, WHITES, DEFAULT_POPS, RECIPES } from './econ.js';
import { ENGINES } from '../ops/engines.js';

const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const engHue = (id) => (ENGINES[id] && ENGINES[id].color) || '#7f8a9a';
const barColor = (util) => util > 1.001 ? '#d9534f' : util > 0.85 ? '#e0954e' : '#5fbf86';   // over / hot / ok
const effColor = (e) => e >= 0.999 ? '#5fbf86' : e >= 0.7 ? '#e0954e' : '#d9534f';

// build the six white sliders from the WHITES table
const wq = $('whites');
for (const w of WHITES) {
  const d = document.createElement('div'); d.className = 'ctl';
  d.innerHTML = `<label>${w.role} <b id="v-${w.role}">${DEFAULT_POPS.whites[w.role]}</b></label>`
    + `<input type="range" id="w-${w.role}" min="1" max="40" value="${DEFAULT_POPS.whites[w.role]}" step="1"><div class="sub">${w.note}</div>`;
  wq.appendChild(d);
}

function readPops() {
  const whites = {};
  for (const w of WHITES) whites[w.role] = +$('w-' + w.role).value;
  return { bots: +$('bots').value, whites };
}

function bar(frac, color, capMark) {
  return `<div class="bar"><span style="width:${(clamp01(frac) * 100).toFixed(1)}%;background:${color}"></span>${capMark != null ? `<i class="cap" style="left:${(clamp01(capMark) * 100).toFixed(1)}%"></i>` : ''}</div>`;
}
const ENGINE_ORDER = ['fluid', 'foundry', 'chemworks', 'fab', 'weave', 'mill', 'assembly', 'reclaim'];

function render() {
  $('v-demand').textContent = $('demand').value;
  $('v-bots').textContent = $('bots').value;
  for (const w of WHITES) $('v-' + w.role).textContent = $('w-' + w.role).value;

  const r = solveEconomy({ demand: +$('demand').value, pops: readPops() });

  // hero
  const tierColor = { Thriving: '#5fbf86', Healthy: '#8fce4e', Stable: '#f4bf62', Fragile: '#e0954e', Failing: '#d9534f' }[r.tier] || '#dfe7e2';
  $('tier').textContent = r.tier; $('tier').style.color = tierColor;
  $('score').textContent = `score ${r.score} / 100`;
  $('out').textContent = `${r.achievable} / ${r.demand}`;
  $('outsub').textContent = `(${(r.throughputEff * 100) | 0}% of demand met)`;
  const [kkind, kwho] = r.keystone.split(':');
  $('key').innerHTML = `keystone — the binding constraint is <b>${r.keystone.replace('ops:', 'ops · ').replace('bays:', 'the ')}</b> at ${(r.keystoneUtil * 100) | 0}% load. ${r.keystoneUtil > 1 ? 'Add capacity here first — it caps everything downstream.' : 'Nothing is over capacity — the plant meets demand.'}`;

  // engines
  $('engines').innerHTML = ENGINE_ORDER.map((id) => {
    const e = r.engine[id], util = e.util;
    return `<div class="row"><div class="nm"><span style="color:${engHue(id)}">${ENGINES[id].glyph || '■'}</span> ${id} <span class="g">${ENGINES[id].family}</span></div>`
      + bar(util, barColor(util), 1)
      + `<div class="val"><b>${(util * 100) | 0}%</b> · ${e.run}/${e.cap}</div></div>`;
  }).join('');
  $('enginenote').textContent = `The metal spine runs hot: mill + foundry carry 2× the throughput (2 metal → 2 stock per product), so they choke first — add bays there before anywhere else.`;

  // levers
  $('levers').innerHTML = WHITES.map((w) => {
    const key = w.lever === 'logistics' ? null : w.lever;
    let e = key ? r.lever[key] : r.logisticsEff;   // dispatch shows up as the logistics ceiling
    if (w.lever === 'logistics') e = r.logisticsEff;
    return `<div class="row"><div class="nm">${w.role} <span class="g">${w.lever}</span></div>`
      + bar(e, effColor(e)) + `<div class="val"><b>${(e * 100) | 0}%</b></div></div>`;
  }).join('');

  // closure
  $('closure').innerHTML = Object.entries(r.closure).map(([c, cl]) => {
    return `<div class="row"><div class="nm">${c}</div>` + bar(cl.frac, effColor(clamp01(cl.frac)))
      + `<div class="val"><b>${(cl.frac * 100) | 0}%</b>${cl.leak > 0.05 ? ` · leak ${cl.leak}` : ''}</div></div>`;
  }).join('') + `<p class="note">Recovery &lt; 1 is the generation-ship clock: water dissipates worst (coolant → vapour), so it needs the most makeup. Under-staff <b>telemetry</b> and every recovery drops.</p>`;

  // hubs
  const hubEntries = Object.entries(r.hub).sort((a, b) => b[1].degree - a[1].degree);
  const maxDeg = hubEntries[0][1].degree;
  $('hubs').innerHTML = hubEntries.map(([id, h]) => {
    const ring = h.degree >= 5;
    return `<div class="row"><div class="nm">${id}</div>` + bar(h.degree / maxDeg, ring ? '#f4bf62' : '#5b7fa0')
      + `<div class="val"><b>${h.degree}</b> threads</div></div>`;
  }).join('');
  const asm = r.hub.assembly.degree, rec = r.hub.reclaim.degree;
  $('rings').innerHTML = `<div class="hd">↻ the ring hypothesis</div>`
    + `<p><span class="chip">assembly · ${asm}</span> converges four commodities and <span class="chip">reclaim · ${rec}</span> fans five raws — each touches the most other threads by a wide margin. On the map they're single spiral arms, but the flow says they're <b>hubs every thread meets</b>.</p>`
    + `<p>The map feedback: promote assembly &amp; reclaim from arms to <b>rings around the weave</b> — a converging ring the eight engines feed, and a decomposer ring that feeds them back — so the K-contacts they need land by construction instead of by spiral crossing.</p>`;

  // flows
  $('flows').innerHTML = r.flows.edges.slice().sort((a, b) => b.rate - a.rate)
    .map((e) => `<div>${e.from} → ${e.to} <b>${e.rate.toFixed(1)}</b> <span style="color:#566">${e.commodity}</span></div>`).join('');
}

for (const el of document.querySelectorAll('input[type=range]')) el.addEventListener('input', render);
render();
