// elements-app.js — the periodic table → looping-Sankey endpoint. Tap an element; its CLOSED CYCLE is
// drawn as a ring that loops back on itself, with magnitudes from the unified ledger (ledger.js). Carbon
// shows the biome+forge grand loop + the pump; iron a pure industrial ring; N/O/H a biotic loop. Mobile-first.

import { elementCycle, unifiedLedger, BIOTIC } from './ledger.js';
import { ELEMENTS, ELEMENT } from './catalogue.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cv = $('cv'), ctx = cv.getContext('2d');
const FAMCOLOR = { metal: '#c98a4a', mineral: '#7f8aa0', carbon: '#c45b8f', water: '#3bb0c9', organic: '#5aa845', volatiles: '#c45b8f', trace: '#b39bd8' };
const KIND_COLOR = { recycle: '#5fd0c0', pump: '#f4bf62', makeup: '#e0635a' };
const metab = (sym) => sym === 'C' ? 'shared' : BIOTIC.includes(sym) ? 'biotic' : 'industrial';

let sym = 'C', growFactor = 3, people = 1000, u = null, cycle = null;
let DPR = 1, CW = 0, CH = 0;

// ── periodic table (the 14 tracked elements in their real period/group cells) ──
function buildTable() {
  $('ptable').innerHTML = ELEMENTS.map((e) => {
    const col = e.bucket ? 4 : e.group;                 // park the rare-earth bucket in the lanthanide strip
    const row = e.bucket ? 8 : e.period;
    return `<div class="cell ${metab(e.sym)}" data-sym="${e.sym}" style="grid-column:${col};grid-row:${row}">
      <span class="z">${e.z}</span><span class="sym">${esc(e.sym)}</span></div>`;
  }).join('');
  for (const el of $('ptable').querySelectorAll('[data-sym]')) el.addEventListener('click', () => select(el.dataset.sym));
}

function recompute() { u = unifiedLedger({ people, growFactor, biomeDays: 150 }); }
function select(s) {
  sym = s; cycle = elementCycle(sym, { u });
  for (const el of $('ptable').querySelectorAll('.cell')) el.classList.toggle('sel', el.dataset.sym === sym);
  const fam = (ELEMENT[sym] || {}).family, fc = FAMCOLOR[fam] || '#888';
  $('sw-flow').style.background = fc;
  $('eltitle').textContent = (ELEMENT[sym] || {}).name;
  $('elinfo').innerHTML =
    `<div class="ig"><span class="s" style="color:${fc}">${esc(sym)}</span><span class="n">${esc(cycle.name)}</span><span class="m">${esc(cycle.metabolism)}</span></div>` +
    `<div class="prod" style="margin-bottom:6px"><span>cycle throughput</span><b>${cycle.flow} ${esc(cycle.unit)}</b></div>` +
    (cycle.topProducts.length ? `<div class="prods">${cycle.topProducts.map((p) => `<div class="prod"><span>${esc(p.glyph || '·')} ${esc(p.name)}</span><b>${Math.round(p.frac * 100)}%</b></div>`).join('')}</div>` : '');
  // named processes (the molecular detail): real reactions, atom-balanced
  const rxns = (cycle.nodes || []).filter((n) => n.process && n.reaction);
  if (rxns.length) {
    $('elinfo').innerHTML += `<div style="margin-top:10px;color:var(--accent);font-size:10px;letter-spacing:.12em;text-transform:uppercase">named processes</div>` +
      rxns.map((n) => `<div style="margin:5px 0;font-size:11.5px"><b style="color:#cdb38a">${esc(n.process)}</b><br><span style="color:var(--soft)">${esc(n.reaction)}</span></div>`).join('');
  }
  render();
}

function renderVerdict() {
  const c = u.perElement.C;
  $('verdict').innerHTML = c.closes
    ? `carbon <b class="ok">closes</b> — biome fixes <b>${c.nppSurplusKgCDay}</b> kgC/day surplus ≥ the forge's <b>${c.forgeCarbonDrawKg}</b> kgC/day draw. The pump locks <b>${c.pumpLockedKgC}</b> kgC/day into structure.`
    : `carbon <b class="no">short</b> — biome's <b>${c.nppSurplusKgCDay}</b> kgC/day surplus can't meet the forge's <b>${c.forgeCarbonDrawKg}</b> kgC/day draw. Over-grow more.`;
}

// ── the circular looping Sankey ──
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); render(); }
function render() {
  ctx.clearRect(0, 0, CW, CH);
  if (!cycle) return;
  const cx = CW / 2, cy = CH / 2, R = Math.max(70, Math.min(Math.min(CW, CH) * 0.34, CW / 2 - 116, CH / 2 - 48));   // clamp so node labels fit on-screen
  const N = cycle.nodes.length, fam = (ELEMENT[sym] || {}).family, flowCol = FAMCOLOR[fam] || '#9aa7bb';
  const pos = {}; cycle.nodes.forEach((n, i) => { const a = -Math.PI / 2 + (i / N) * Math.PI * 2; pos[n.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }; });
  const maxV = Math.max(...cycle.links.map((l) => l.value), 1e-6), wScale = (R * 0.16) / Math.sqrt(maxV);
  const idx = Object.fromEntries(cycle.nodes.map((n, i) => [n.id, i]));
  // links (big behind), curved toward centre by angular distance — adjacent hug the rim, returns bow across
  for (const l of [...cycle.links].sort((a, b) => b.value - a.value)) {
    const a = pos[l.from], b = pos[l.to]; if (!a || !b || l.value <= 1e-9) continue;
    let d = Math.abs(idx[l.to] - idx[l.from]); d = Math.min(d, N - d);
    const pull = 0.12 + 0.78 * (d / (N / 2));                  // 0 adjacent … ~0.9 opposite
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ctrlx = mx + (cx - mx) * pull, ctrly = my + (cy - my) * pull;
    ctx.strokeStyle = KIND_COLOR[l.kind] || flowCol; ctx.globalAlpha = l.kind === 'flow' ? 0.6 : 0.78;
    ctx.lineWidth = Math.max(1.4, Math.sqrt(l.value) * wScale); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(ctrlx, ctrly, b.x, b.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // nodes + labels
  ctx.textBaseline = 'middle'; ctx.font = '12px ui-monospace,monospace';
  for (const n of cycle.nodes) {
    const p = pos[n.id], col = n.kind === 'pool' ? flowCol : n.kind === 'biome' ? '#5aa845' : n.kind === 'crew' ? '#e6e8ee' : n.kind === 'pump' ? '#f4bf62' : n.kind === 'recover' ? '#5fd0c0' : n.kind === 'reserve' ? '#e0635a' : n.kind === 'process' ? '#cdb38a' : n.kind === 'material' ? flowCol : '#9aa7bb';
    ctx.fillStyle = '#0b0e14'; ctx.strokeStyle = col; ctx.lineWidth = n.kind === 'pool' ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, n.kind === 'pool' ? 9 : 6, 0, 7); ctx.fill(); ctx.stroke();
    const right = Math.cos(p.a) >= 0; ctx.textAlign = 'left';
    ctx.font = '12px ui-monospace,monospace';
    const sub = n.formula || n.process || (n.endpoints && n.endpoints.length ? n.endpoints.map((e) => e.glyph).join('') : '');
    const tw = Math.max(ctx.measureText(n.label).width, sub ? 9 / 12 * ctx.measureText(sub).width : 0), ly = p.y;
    let lx = right ? p.x + 13 : p.x - 13 - tw;
    lx = Math.max(4, Math.min(lx, CW - 4 - tw));   // clamp so labels never clip off-screen
    ctx.fillStyle = '#06080c'; ctx.fillText(n.label, lx + 0.6, ly - (sub ? 5 : 0) + 0.6);
    ctx.fillStyle = col; ctx.fillText(n.label, lx, ly - (sub ? 5 : 0));
    if (sub) { ctx.font = '9px ui-monospace,monospace'; ctx.fillStyle = '#7d8597'; ctx.fillText(sub, lx, ly + 7); }
  }
  // centre caption
  ctx.textAlign = 'center'; ctx.fillStyle = flowCol; ctx.font = '700 30px ui-monospace,monospace'; ctx.fillText(sym, cx, cy - 6);
  ctx.fillStyle = '#8794a6'; ctx.font = '11px ui-monospace,monospace';
  ctx.fillText(`${cycle.flow} ${cycle.unit}`, cx, cy + 14);
  ctx.fillStyle = cycle.closes ? '#8fd06a' : '#e0635a'; ctx.fillText(cycle.closes ? '◯ closes' : '⚠ open', cx, cy + 28);
}

// ── controls ──
$('gf').addEventListener('input', (e) => { growFactor = +e.target.value; $('gfv').textContent = growFactor.toFixed(2).replace(/0$/, '') + '×'; recompute(); renderVerdict(); if (sym) select(sym); });
$('railtoggle').addEventListener('click', () => $('rail').classList.toggle('open'));
addEventListener('resize', resize);

// go
buildTable(); recompute(); renderVerdict(); resize(); select('C');
