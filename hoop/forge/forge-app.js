// forge-app.js — the /forge production-flow page. Renders the graph.js process network as a Factorio-style
// flow: feedstock pools (left) → refine → fabricate → assemble → product pools (right), with wear → scrap
// pools (bottom) → recyclers + bio-regen looping back to the feedstock pools. Edges are material flows,
// coloured by family, width ∝ rate. Drag the deployed setpoints to drive the whole thing; click any node
// for its recipe + wiki. No build step.

import { MATERIALS, PROCESSES, PROCESS, FAMILIES, BUILDERS, RECOVERERS, BUILDER_OF, solveFlow, energyDemand, fullOutputs } from './graph.js';
import { wikiEntry, fmtRecipe } from './wiki.js';
import { PRODUCTS as FORGE_PRODUCTS, DEFAULT_CONFIG } from './forge.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cv = $('cv'), ctx = cv.getContext('2d');
const WEAR = Object.fromEntries(FORGE_PRODUCTS.map((p) => [p.id, p.wear]));
const PRODUCT_IDS = FORGE_PRODUCTS.map((p) => p.id);
const famColor = (m) => (FAMILIES[(MATERIALS[m] || {}).family] || {}).color || '#888';

// ── state: deployed setpoints (the sliders) → demand → flow ──
const targets = { ...DEFAULT_CONFIG.target };
const ENERGY_BUDGET = 1400;   // tide's total_GW seam (display reference)
let flow = null;
function recompute() {
  const demand = {}; for (const p of PRODUCT_IDS) demand[p] = (targets[p] || 0) * WEAR[p];
  flow = solveFlow(demand); flow.energy = energyDemand(demand); flow.demand = demand;
}

// ── layout (static): builders in depth columns; feedstock/product/waste materials as POOL chips ──
const depthMemo = {};
function depth(pid) {
  if (pid in depthMemo) return depthMemo[pid]; depthMemo[pid] = 0;
  let d = 0; for (const m of Object.keys(PROCESS[pid].in)) { const q = BUILDER_OF[m]; if (q && q !== pid) d = Math.max(d, depth(q) + 1); }
  return depthMemo[pid] = d;
}
const nodes = new Map();   // id → { id, type, x, y, w, h, glyph, label, fam, kind }
const COLW = 200, ROWH = 66, PW = 150, PH = 46, CHIPW = 78, CHIPH = 28;
function layout() {
  nodes.clear();
  const maxD = Math.max(0, ...BUILDERS.map((p) => depth(p.id)));
  // builders by depth column
  const byD = {}; for (const p of BUILDERS) (byD[depth(p.id)] = byD[depth(p.id)] || []).push(p);
  for (let d = 0; d <= maxD; d++) {
    const col = (byD[d] || []).sort((a, b) => a.id.localeCompare(b.id));
    col.forEach((p, i) => nodes.set(p.id, { id: p.id, type: 'process', x: (d + 1) * COLW, y: (i - (col.length - 1) / 2) * ROWH, w: PW, h: PH, glyph: p.glyph, label: p.name, kind: p.kind }));
  }
  // feedstock pool chips (left column, x=0)
  const feed = Object.keys(MATERIALS).filter((m) => MATERIALS[m].kind === 'feedstock');
  feed.forEach((m, i) => nodes.set('mat:' + m, { id: m, type: 'material', x: -40, y: (i - (feed.length - 1) / 2) * (ROWH * 0.7), w: CHIPW, h: CHIPH, glyph: MATERIALS[m].glyph, label: MATERIALS[m].name, fam: MATERIALS[m].family, kind: 'feedstock' }));
  // product pool chips (far right)
  const prod = PRODUCT_IDS;
  prod.forEach((m, i) => nodes.set('mat:' + m, { id: m, type: 'material', x: (maxD + 2.2) * COLW, y: (i - (prod.length - 1) / 2) * ROWH, w: CHIPW, h: CHIPH, glyph: MATERIALS[m].glyph, label: MATERIALS[m].name, fam: MATERIALS[m].family, kind: 'product' }));
  // waste pool chips (bottom band)
  const waste = Object.keys(MATERIALS).filter((m) => MATERIALS[m].kind === 'waste');
  const bottomY = (maxD + 1) * ROWH * 0.5 + 200;
  waste.forEach((m, i) => nodes.set('mat:' + m, { id: m, type: 'material', x: (maxD + 1) * COLW - i * 118, y: bottomY, w: CHIPW, h: CHIPH, glyph: MATERIALS[m].glyph, label: MATERIALS[m].name, fam: MATERIALS[m].family, kind: 'waste' }));
  // recoverers (bottom band, flowing right→left back toward feedstock)
  RECOVERERS.forEach((p, i) => nodes.set(p.id, { id: p.id, type: 'process', x: (maxD - i) * COLW - 30, y: bottomY + ROWH * 1.3, w: PW, h: PH, glyph: p.glyph, label: p.name, kind: p.kind }));
}

// ── edges: built from recipes + the current flow (rate) ──
function edges() {
  const E = [], rate = flow.rate, demand = flow.demand;
  const at = (id) => nodes.get(id);
  const push = (from, to, m, fl, dashed) => { const a = at(from), b = at(to); if (a && b && fl > 1e-3) E.push({ a, b, color: famColor(m), w: 1 + Math.sqrt(fl) * 0.9, fl, dashed, m }); };
  // builder inputs: from builder producer (intermediate) or feedstock chip
  for (const p of [...BUILDERS, ...RECOVERERS]) {
    const r = rate[p.id] || 0; if (r <= 1e-6) continue;
    for (const [m, q] of Object.entries(p.in)) {
      const fl = r * q, prod = BUILDER_OF[m];
      if (MATERIALS[m].kind === 'waste') push('mat:' + m, p.id, m, fl, true);
      else if (prod && prod !== p.id) push(prod, p.id, m, fl, false);
      else push('mat:' + m, p.id, m, fl, false);
    }
  }
  // assembler → product pool (the primary product output)
  for (const pid of PRODUCT_IDS) { const bp = BUILDER_OF[pid]; if (bp) push(bp, 'mat:' + pid, pid, demand[pid] || 0, false); }
  // product wear → waste pools (by composition), drawn dashed
  for (const pid of PRODUCT_IDS) {
    const d = demand[pid] || 0; if (d <= 1e-6) continue;
    const we = wikiEntry(pid), comp = we.composition || {};
    const COMMODITY_FAMILY = { metal: 'metal', silica: 'mineral', polymer: 'carbon', volatiles: 'carbon', water: 'water', biomass: 'organic', trace: 'trace' };
    for (const [c, mc] of Object.entries(comp)) { const s = FAMILIES[COMMODITY_FAMILY[c]].scrap; push('mat:' + pid, 'mat:' + s, s, d * mc / MATERIALS[s].mass, true); }
  }
  // recoverer → feedstock pool (the closing loop)
  for (const p of RECOVERERS) { const r = rate[p.id] || 0; if (r <= 1e-6) continue; for (const [m, q] of Object.entries(fullOutputs(p))) if (MATERIALS[m].kind === 'feedstock') push(p.id, 'mat:' + m, m, r * q, true); }
  // builder loss → waste pool (thin dashed)
  for (const p of BUILDERS) { const r = rate[p.id] || 0; if (r <= 1e-6) continue; for (const [m, q] of Object.entries(fullOutputs(p))) if (MATERIALS[m].kind === 'waste') push(p.id, 'mat:' + m, m, r * q, true); }
  return E;
}

// ── camera ──
let DPR = 1, CW = 0, CH = 0, cam = { s: 1, ox: 0, oy: 0 };
const SX = (x) => x * cam.s + cam.ox, SY = (y) => y * cam.s + cam.oy;
function fit() {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of nodes.values()) { x0 = Math.min(x0, n.x - n.w / 2); y0 = Math.min(y0, n.y - n.h / 2); x1 = Math.max(x1, n.x + n.w / 2); y1 = Math.max(y1, n.y + n.h / 2); }
  const pad = 50, s = Math.min((CW - 2 * pad) / (x1 - x0 || 1), (CH - 2 * pad) / (y1 - y0 || 1));
  cam = { s, ox: (CW - (x1 - x0) * s) / 2 - x0 * s, oy: (CH - (y1 - y0) * s) / 2 - y0 * s };
}
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (cam.s === 1 && cam.ox === 0) fit(); render(); }

let selected = null;
// ── render ──
function render() {
  ctx.clearRect(0, 0, CW, CH);
  const E = edges();
  // edges (bezier left→right; dashed for recovery/wear loops)
  for (const e of E) {
    const ax = SX(e.a.x + e.a.w / 2), ay = SY(e.a.y), bx = SX(e.b.x - e.b.w / 2), by = SY(e.b.y);
    ctx.strokeStyle = e.color; ctx.globalAlpha = e.dashed ? 0.5 : 0.8; ctx.lineWidth = Math.max(0.5, e.w * cam.s * 0.5);
    ctx.setLineDash(e.dashed ? [4, 4] : []);
    ctx.beginPath(); ctx.moveTo(ax, ay); const mx = (ax + bx) / 2; ctx.bezierCurveTo(mx, ay, mx, by, bx, by); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // nodes
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const n of nodes.values()) {
    const x = SX(n.x - n.w / 2), y = SY(n.y - n.h / 2), w = n.w * cam.s, h = n.h * cam.s;
    const sel = selected === (n.type === 'process' ? n.id : 'mat:' + n.id);
    if (n.type === 'process') {
      ctx.fillStyle = n.kind === 'recycle' ? '#161d22' : n.kind === 'bioregen' ? '#14201a' : n.kind === 'seam' ? '#141a22' : '#1a1712';
      ctx.strokeStyle = sel ? '#f4bf62' : (n.kind === 'recycle' || n.kind === 'bioregen' || n.kind === 'seam') ? '#3a5a52' : '#5a4a30';
    } else {
      ctx.fillStyle = '#0c0f15'; ctx.strokeStyle = sel ? '#f4bf62' : famColor(n.id);
    }
    ctx.lineWidth = sel ? 2 : 1; roundRect(x, y, w, h, 7 * cam.s); ctx.fill(); ctx.stroke();
    if (cam.s > 0.32) {
      const fs = Math.min(15, 11 * cam.s);
      ctx.fillStyle = n.type === 'material' ? famColor(n.id) : '#e6e8ee'; ctx.font = `${Math.min(18, 13 * cam.s)}px ui-monospace,monospace`;
      ctx.fillText(n.glyph, x + 7 * cam.s, y + h / 2);
      ctx.fillStyle = n.type === 'material' ? '#cfd6e2' : '#cdd3df'; ctx.font = `${fs}px ui-monospace,monospace`;
      const label = n.type === 'process' ? n.label : n.label;
      ctx.fillText(clip(label, n.w - 30), x + 24 * cam.s, y + h / 2 - (n.type === 'process' ? 5 * cam.s : 0));
      if (n.type === 'process' && cam.s > 0.5) { ctx.fillStyle = '#7d8597'; ctx.font = `${10 * cam.s}px ui-monospace,monospace`; const r = flow.rate[n.id] || 0; ctx.fillText(`${n.kind} · ${r.toFixed(1)}/s`, x + 24 * cam.s, y + h / 2 + 9 * cam.s); }
    }
  }
}
function roundRect(x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function clip(s, px) { const max = Math.floor(px / 7); return s.length > max ? s.slice(0, max - 1) + '…' : s; }

// ── sidebar: sliders, closure bars, energy, legend ──
function buildSliders() {
  $('sliders').innerHTML = FORGE_PRODUCTS.map((p) => `<div class="ctrl"><label>${esc(p.glyph)} ${esc(p.name)} <b id="tv_${p.id}">${targets[p.id]}</b></label><input type="range" id="t_${p.id}" min="0" max="${Math.round(p.id === 'consumable' ? 120 : (DEFAULT_CONFIG.target[p.id] * 2))}" value="${targets[p.id]}"></div>`).join('');
  for (const p of FORGE_PRODUCTS) $('t_' + p.id).addEventListener('input', (e) => { targets[p.id] = +e.target.value; $('tv_' + p.id).textContent = targets[p.id]; recompute(); render(); sidebar(); });
}
function sidebar() {
  // closure bars (makeup ratio per feedstock)
  const cl = flow.closure, ids = Object.keys(cl).sort((a, b) => (cl[b].demand) - (cl[a].demand));
  $('closure').innerHTML = ids.map((m) => {
    const c = cl[m], ratio = c.demand ? c.shortfall / c.demand : 0, pct = Math.round(ratio * 100);
    const col = ratio < 0.02 ? 'var(--green)' : ratio < 0.15 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="bar"><div class="t"><span style="color:${famColor(m)}">${esc(MATERIALS[m].glyph)} ${esc(m)}</span><b>${pct ? pct + '% makeup' : 'closed'}</b></div><div class="track"><i style="width:${Math.min(100, pct)}%;background:${col}"></i></div></div>`;
  }).join('') || '<span class="sub">set a setpoint to see flow</span>';
  // energy
  const e = flow.energy, frac = Math.min(1, e / ENERGY_BUDGET);
  $('ev').textContent = `${e.toFixed(0)} / ${ENERGY_BUDGET}`;
  $('ebar').style.width = (frac * 100) + '%'; $('ebar').style.background = frac > 1 ? 'var(--bad)' : frac > 0.85 ? 'var(--warn)' : 'var(--accent)';
  // legend
  $('legend').innerHTML = Object.entries(FAMILIES).map(([k, f]) => `<div class="row"><span class="sw" style="background:${f.color}"></span>${esc(f.name)}</div>`).join('') + `<div class="row"><span class="sw" style="background:#888;border-top:1px dashed #aaa"></span>recovery / wear</div>`;
}

// ── info panel (wiki) ──
function openInfo(id) {
  const e = wikiEntry(id); if (!e) return;
  selected = e.kind === 'process' ? id : 'mat:' + id;
  let h = `<div class="ih"><span class="ig">${esc(e.glyph)}</span><span class="it">${esc(e.title)}</span></div><div class="cat">${esc(e.kind === 'process' ? e.category + ' · ' + e.machine : (e.materialKind + ' · ' + (FAMILIES[e.family] || {}).name))}</div>`;
  h += `<div class="prose">${esc(e.prose)}</div>`;
  if (e.kind === 'process') {
    h += `<div class="reck">recipe</div><div class="rec"><span class="io">in:</span> ${esc(fmtRecipe(e.inputs))}<br><span class="io">out:</span> ${esc(fmtRecipe(e.outputs))}<br><span class="energy">⚡ ${e.energy} energy/run · ${flow.rate[id] ? (flow.rate[id]).toFixed(1) + ' runs/step' : 'idle'}</span></div>`;
  } else {
    if (e.composition) h += `<div class="reck">made of</div><div class="rec">${esc(fmtRecipe(e.composition))}</div>`;
    if (e.madeBy.length) h += `<div class="reck">made by</div><div class="chips">${e.madeBy.map((p) => chip(p)).join('')}</div>`;
    if (e.usedBy.length) h += `<div class="reck">used by</div><div class="chips">${e.usedBy.map((p) => chip(p)).join('')}</div>`;
  }
  if (e.kind === 'process') h += `<div class="reck">materials</div><div class="chips">${e.see.map((m) => chip(m)).join('')}</div>`;
  $('ibody').innerHTML = h; $('info').classList.add('on');
  for (const el of $('ibody').querySelectorAll('[data-id]')) el.addEventListener('click', () => openInfo(el.dataset.id));
  render();
}
const chip = (id) => { const M = MATERIALS[id], P = PROCESS[id]; const g = (M || P).glyph, name = (M || P).name; return `<span class="chip" data-id="${esc(id)}" style="${M ? 'border-color:' + famColor(id) + '66' : ''}">${esc(g)} ${esc(name)}</span>`; };
$('ix').addEventListener('click', () => { $('info').classList.remove('on'); selected = null; render(); });

// ── hit-test + interaction ──
function nodeAt(cx, cy) {
  const mx = (cx - cam.ox) / cam.s, my = (cy - cam.oy) / cam.s;
  for (const n of nodes.values()) if (Math.abs(mx - n.x) < n.w / 2 && Math.abs(my - n.y) < n.h / 2) return n;
  return null;
}
let dragging = false, last = null, down = null, moved = false;
cv.addEventListener('pointerdown', (e) => { dragging = true; moved = false; last = down = { x: e.clientX, y: e.clientY }; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!dragging) return; if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) moved = true; cam.ox += e.clientX - last.x; cam.oy += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; render(); });
cv.addEventListener('pointerup', (e) => {
  dragging = false; cv.classList.remove('drag');
  if (!moved) { const r = cv.getBoundingClientRect(), n = nodeAt(e.clientX - r.left, e.clientY - r.top); if (n) openInfo(n.id); else { $('info').classList.remove('on'); selected = null; render(); } }
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0014), ns = Math.max(0.18, Math.min(6, cam.s * f)); cam.ox = mx - (mx - cam.ox) * (ns / cam.s); cam.oy = my - (my - cam.oy) * (ns / cam.s); cam.s = ns; render(); }, { passive: false });
addEventListener('resize', resize);

// ── go ──
recompute(); layout(); buildSliders(); resize(); sidebar();
