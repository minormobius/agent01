// elements-app.js — the periodic table → looping-Sankey endpoint. Tap an element; its CLOSED CYCLE is
// drawn as a ring that loops back on itself, with magnitudes from the unified ledger (ledger.js). Carbon
// shows the biome+forge grand loop + the pump; iron a pure industrial ring; N/O/H a biotic loop. Mobile-first.

import { elementFork, unifiedLedger, BIOTIC } from './ledger.js';
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
  sym = s; cycle = elementFork(sym, { u });
  for (const el of $('ptable').querySelectorAll('.cell')) el.classList.toggle('sel', el.dataset.sym === sym);
  const fam = (ELEMENT[sym] || {}).family, fc = FAMCOLOR[fam] || '#888';
  $('sw-flow').style.background = fc;
  $('eltitle').textContent = (ELEMENT[sym] || {}).name;
  const linkIn = (id) => cycle.links.filter((l) => l.to === id).reduce((a, l) => a + l.value, 0);
  const forms = cycle.nodes.filter((n) => n.kind === 'material');         // one per refining pathway
  const uses = cycle.nodes.filter((n) => n.kind === 'use').sort((a, b) => linkIn(b.id) - linkIn(a.id));
  let h = `<div class="ig"><span class="s" style="color:${fc}">${esc(sym)}</span><span class="n">${esc(cycle.name)}</span><span class="m">${esc(cycle.metabolism)}</span></div>` +
    `<div class="prod" style="margin-bottom:4px"><span>cycle throughput</span><b>${cycle.flow} ${esc(cycle.unit)}</b></div>`;
  h += `<div style="margin-top:9px;color:var(--accent);font-size:10px;letter-spacing:.12em;text-transform:uppercase">pathways (${forms.length})</div>`;
  for (const f of forms) {
    const proc = cycle.nodes.find((n) => n.id === 'ref' + f.id.slice(4)) || cycle.nodes.find((n) => n.kind === 'process');
    h += `<div class="prod"><span style="color:#cdb38a">${esc((proc || {}).process || 'refine')}</span><b style="color:${fc}">${esc(f.label)}${f.formula ? ' · ' + f.formula : ''}</b></div>`;
  }
  h += `<div style="margin-top:9px;color:var(--accent);font-size:10px;letter-spacing:.12em;text-transform:uppercase">endpoints (${uses.length})</div><div class="prods">`;
  for (const en of uses) h += `<div class="prod"><span>${esc((en.endpoints && en.endpoints[0] && en.endpoints[0].glyph) || '·')} ${esc(en.label)}</span><b>${linkIn(en.id).toFixed(1)}</b></div>`;
  h += `</div>`;
  $('elinfo').innerHTML = h;
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
const nodeColor = (n, flowCol) => n.kind === 'pool' ? flowCol : n.kind === 'biome' ? '#5aa845' : n.kind === 'crew' ? '#e6e8ee' : n.kind === 'pump' ? '#f4bf62' : n.kind === 'recover' ? '#5fd0c0' : n.kind === 'reserve' ? '#e0635a' : n.kind === 'process' ? '#cdb38a' : n.kind === 'material' ? flowCol : '#9aa7bb';
function render() {
  ctx.clearRect(0, 0, CW, CH);
  if (!cycle) return;
  const cx = CW / 2, cy = CH / 2, fam = (ELEMENT[sym] || {}).family, flowCol = FAMCOLOR[fam] || '#9aa7bb';
  // CATEGORIES (the backbone cycle: pool · refine · form · reclaim) sit on the AZIMUTH (the ring).
  // PARTICULARS (the product endpoints) expand RADIALLY outward from their pathway, not around the circle.
  const backbone = cycle.nodes.filter((n) => n.kind !== 'use');
  const leaves = cycle.nodes.filter((n) => n.kind === 'use');
  const R = Math.max(58, Math.min(Math.min(CW, CH) * 0.27, CW / 2 - 170, CH / 2 - 90));
  const Rleaf = R + Math.max(64, R * 0.7);
  const pos = {}, M = backbone.length;
  backbone.forEach((n, i) => { const a = -Math.PI / 2 + (i / M) * Math.PI * 2; pos[n.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a, ring: true }; });
  // leaves grouped by the pathway (form) that feeds them, fanned over a wedge around that form's angle
  const parentOf = {}; for (const l of cycle.links) if (leaves.some((n) => n.id === l.to)) parentOf[l.to] = l.from;
  const byParent = {}; for (const lf of leaves) { const p = parentOf[lf.id] || 'pool'; (byParent[p] = byParent[p] || []).push(lf); }
  for (const [pid, kids] of Object.entries(byParent)) {
    const pa = pos[pid] ? pos[pid].a : -Math.PI / 2, k = kids.length, spread = Math.min(0.34, 0.14 * k);
    kids.forEach((lf, i) => { const a = pa + (k > 1 ? spread * (i / (k - 1) - 0.5) : 0); pos[lf.id] = { x: cx + Rleaf * Math.cos(a), y: cy + Rleaf * Math.sin(a), a, leaf: true }; });
  }
  const maxV = Math.max(...cycle.links.map((l) => l.value), 1e-6), wScale = (R * 0.14) / Math.sqrt(maxV);
  // links: radial spokes (form→product) run nearly straight outward; ring + return links bow toward centre
  for (const l of [...cycle.links].sort((a, b) => b.value - a.value)) {
    const a = pos[l.from], b = pos[l.to]; if (!a || !b || l.value <= 1e-9) continue;
    const ret = l.to === 'reclaim' && a.leaf;                  // a product's recycle return (de-emphasise)
    let dA = Math.abs(a.a - b.a); dA = Math.min(dA, Math.PI * 2 - dA);
    const pull = (a.leaf || b.leaf) && !ret ? 0.06 : 0.12 + 0.72 * (dA / Math.PI);   // radial spokes ≈ straight
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ctrlx = mx + (cx - mx) * pull, ctrly = my + (cy - my) * pull;
    ctx.strokeStyle = KIND_COLOR[l.kind] || flowCol; ctx.globalAlpha = ret ? 0.16 : l.kind === 'flow' ? 0.6 : 0.78;
    ctx.lineWidth = Math.max(1, Math.sqrt(l.value) * wScale * (ret ? 0.5 : 1)); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(ctrlx, ctrly, b.x, b.y); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.textBaseline = 'middle';
  // ring (category) nodes — labelled toward the inside
  for (const n of backbone) {
    const p = pos[n.id], col = nodeColor(n, flowCol);
    ctx.fillStyle = '#0b0e14'; ctx.strokeStyle = col; ctx.lineWidth = n.kind === 'pool' ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, n.kind === 'pool' ? 9 : 6, 0, 7); ctx.fill(); ctx.stroke();
    const right = Math.cos(p.a) >= 0; ctx.textAlign = 'left'; ctx.font = '12px ui-monospace,monospace';
    const sub = n.formula || n.process || '';
    const tw = Math.max(ctx.measureText(n.label).width, sub ? 0.75 * ctx.measureText(sub).width : 0);
    let lx = right ? p.x + 13 : p.x - 13 - tw; lx = Math.max(4, Math.min(lx, CW - 4 - tw));
    ctx.fillStyle = '#06080c'; ctx.fillText(n.label, lx + 0.6, p.y - (sub ? 5 : 0) + 0.6);
    ctx.fillStyle = col; ctx.fillText(n.label, lx, p.y - (sub ? 5 : 0));
    if (sub) { ctx.font = '9px ui-monospace,monospace'; ctx.fillStyle = '#7d8597'; ctx.fillText(sub, lx, p.y + 7); }
  }
  // radial leaf (particular) nodes — small dot + label pointing outward
  ctx.font = '10.5px ui-monospace,monospace';
  for (const n of leaves) {
    const p = pos[n.id]; if (!p) continue;
    ctx.fillStyle = '#0b0e14'; ctx.strokeStyle = '#9aa7bb'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); ctx.stroke();
    const right = Math.cos(p.a) >= 0; ctx.textAlign = right ? 'left' : 'right';
    const gl = (n.endpoints && n.endpoints[0] && n.endpoints[0].glyph) ? n.endpoints[0].glyph + ' ' : '';
    const label = gl + n.label, lx = p.x + (right ? 7 : -7);
    ctx.fillStyle = '#06080c'; ctx.fillText(label, lx + 0.5, p.y + 0.5);
    ctx.fillStyle = '#aeb6c4'; ctx.fillText(label, lx, p.y);
  }
  // centre caption
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = flowCol; ctx.font = '700 30px ui-monospace,monospace'; ctx.fillText(sym, cx, cy - 6);
  ctx.fillStyle = '#8794a6'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText(`${cycle.flow} ${cycle.unit}`, cx, cy + 14);
  ctx.fillStyle = cycle.closes ? '#8fd06a' : '#e0635a'; ctx.fillText(cycle.closes ? '◯ closes' : '⚠ open', cx, cy + 28);
}

// ── controls ──
$('gf').addEventListener('input', (e) => { growFactor = +e.target.value; $('gfv').textContent = growFactor.toFixed(2).replace(/0$/, '') + '×'; recompute(); renderVerdict(); if (sym) select(sym); });
$('railtoggle').addEventListener('click', () => $('rail').classList.toggle('open'));
addEventListener('resize', resize);

// go
buildTable(); recompute(); renderVerdict(); resize(); select('C');
