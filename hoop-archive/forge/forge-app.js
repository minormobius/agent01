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
const PW = 132, PH = 50, CHIPW = 104, CHIPH = 40, ROWY = 132, COLX = 150;   // mobile-friendly: tall tap targets
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// VERTICAL flow (top→down), so it reads on a portrait phone: feedstock → refine → bio → fabricate →
// assemble → products → scrap → recyclers, each tier a row; recovery loops curve back up.
function rowOf(p) {
  if (p.kind === 'refine') return 1;
  if (p.kind === 'bioregen' && BUILDERS.includes(p)) return 2;   // synth · grow · mill
  if (p.kind === 'fabricate') return 3;
  if (p.kind === 'assemble') return 4;
  return 7;   // recyclers · digester · condenser
}
function placeRow(items, row, mk) {
  const n = items.length;
  items.forEach((it, i) => { const node = mk(it, (i - (n - 1) / 2) * COLX, row * ROWY); nodes.set(node.key, node.node); });
}
function layout() {
  nodes.clear();
  const feed = Object.keys(MATERIALS).filter((m) => MATERIALS[m].kind === 'feedstock');
  const waste = Object.keys(MATERIALS).filter((m) => MATERIALS[m].kind === 'waste');
  placeRow(feed, 0, (m, x, y) => ({ key: 'mat:' + m, node: { id: m, type: 'material', x, y, w: CHIPW, h: CHIPH, glyph: MATERIALS[m].glyph, label: MATERIALS[m].name, fam: MATERIALS[m].family, kind: 'feedstock' } }));
  for (const row of [1, 2, 3, 4, 7]) { const ps = PROCESSES.filter((p) => rowOf(p) === row).sort((a, b) => a.id.localeCompare(b.id)); placeRow(ps, row, (p, x, y) => ({ key: p.id, node: { id: p.id, type: 'process', x, y, w: PW, h: PH, glyph: p.glyph, label: p.name, kind: p.kind } })); }
  placeRow(PRODUCT_IDS, 5, (m, x, y) => ({ key: 'mat:' + m, node: { id: m, type: 'material', x, y, w: CHIPW, h: CHIPH, glyph: MATERIALS[m].glyph, label: MATERIALS[m].name, fam: MATERIALS[m].family, kind: 'product' } }));
  placeRow(waste, 6, (m, x, y) => ({ key: 'mat:' + m, node: { id: m, type: 'material', x, y, w: CHIPW, h: CHIPH, glyph: MATERIALS[m].glyph, label: MATERIALS[m].name, fam: MATERIALS[m].family, kind: 'waste' } }));
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
function bbox() { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const n of nodes.values()) { x0 = Math.min(x0, n.x - n.w / 2); y0 = Math.min(y0, n.y - n.h / 2); x1 = Math.max(x1, n.x + n.w / 2); y1 = Math.max(y1, n.y + n.h / 2); } return { x0, y0, x1, y1 }; }
// fit the WIDTH (so a portrait phone shows the chain across), legibly clamped, anchored at the top — the
// vertical chain then scrolls. On a wide desktop canvas this just shows the whole graph.
function fit() {
  const b = bbox(), gw = b.x1 - b.x0 || 1, gh = b.y1 - b.y0 || 1, pad = 14;
  // fit the WIDTH fully (with a safety margin) so the whole chain is across-screen on a phone; the taller
  // chain then scrolls vertically. If it ALSO fits in height, use the smaller scale so nothing clips.
  const sWidth = ((CW - 2 * pad) / gw) * 0.97;
  const sBoth = Math.min(sWidth, (CH - 2 * pad) / gh);
  cam.s = clamp(gh * sWidth <= CH - 2 * pad ? sBoth : sWidth, 0.18, 1.1);
  cam.ox = CW / 2 - ((b.x0 + b.x1) / 2) * cam.s;          // centre horizontally
  cam.oy = (gh * cam.s <= CH - 2 * pad) ? (CH - gh * cam.s) / 2 - b.y0 * cam.s : pad - b.y0 * cam.s;   // centre if it fits, else top-anchor + scroll
}
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (cam.s === 1 && cam.ox === 0) fit(); render(); }

let selected = null;
// ── render ──
function render() {
  ctx.clearRect(0, 0, CW, CH);
  const E = edges();
  // edges (bezier top→down; recovery/wear loops dashed and bowed to the side when they run back UP)
  for (const e of E) {
    const up = e.b.y < e.a.y;   // a back-edge (recovery climbing toward feedstock)
    const ax = SX(e.a.x), ay = SY(e.a.y + (up ? -e.a.h / 2 : e.a.h / 2)), bx = SX(e.b.x), by = SY(e.b.y + (up ? e.b.h / 2 : -e.b.h / 2));
    ctx.strokeStyle = e.color; ctx.globalAlpha = e.dashed ? 0.45 : 0.85; ctx.lineWidth = Math.max(0.6, e.w * cam.s * 0.6);
    ctx.setLineDash(e.dashed ? [5, 5] : []);
    ctx.beginPath(); ctx.moveTo(ax, ay);
    const my = (ay + by) / 2, bow = up ? (e.a.x + e.b.x > 0 ? 1 : -1) * 120 * cam.s : 0;   // bow back-edges out to a side
    ctx.bezierCurveTo(ax + bow, my, bx + bow, my, bx, by); ctx.stroke();
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
    ctx.lineWidth = sel ? 2 : 1; roundRect(x, y, w, h, 8 * cam.s); ctx.fill(); ctx.stroke();
    if (h > 13) {   // labels stay legible down to a small zoom (was a hard cutoff that blanked them)
      const gx = x + 8 * cam.s, two = h > 40, fs = clamp(8.5, 12 * cam.s, 15);
      ctx.fillStyle = n.type === 'material' ? famColor(n.id) : '#e6e8ee'; ctx.font = `${clamp(11, 15 * cam.s, 19)}px ui-monospace,monospace`;
      ctx.fillText(n.glyph, gx, y + h / 2);
      ctx.fillStyle = n.type === 'material' ? '#cfd6e2' : '#dde2ec'; ctx.font = `${fs}px ui-monospace,monospace`;
      ctx.fillText(clip(n.label, (n.w - 26) * cam.s / cam.s), x + 26 * cam.s, y + h / 2 - (n.type === 'process' && two ? fs * 0.55 : 0));
      if (n.type === 'process' && two) { ctx.fillStyle = '#8a93a6'; ctx.font = `${clamp(8, 10 * cam.s, 12)}px ui-monospace,monospace`; const r = flow.rate[n.id] || 0; ctx.fillText(`${n.kind} · ${r.toFixed(1)}/s`, x + 26 * cam.s, y + h / 2 + fs * 0.7); }
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

// ── hit-test + interaction (pan · tap · wheel · pinch · zoom buttons · mobile drawer) ──
function nodeAt(cx, cy) {
  const mx = (cx - cam.ox) / cam.s, my = (cy - cam.oy) / cam.s;
  for (const n of nodes.values()) if (Math.abs(mx - n.x) < n.w / 2 && Math.abs(my - n.y) < n.h / 2) return n;
  return null;
}
function zoomAt(px, py, ns) { ns = clamp(ns, 0.15, 6); cam.ox = px - (px - cam.ox) * (ns / cam.s); cam.oy = py - (py - cam.oy) * (ns / cam.s); cam.s = ns; render(); }
const pointers = new Map();
let down = null, moved = false, pinchD = 0;
cv.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.setPointerCapture(e.pointerId); if (pointers.size === 1) { down = { x: e.clientX, y: e.clientY }; moved = false; cv.classList.add('drag'); } pinchD = 0; });
cv.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {                                  // pinch-zoom about the two-finger midpoint
    const p = [...pointers.values()], d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), r = cv.getBoundingClientRect();
    if (pinchD) zoomAt((p[0].x + p[1].x) / 2 - r.left, (p[0].y + p[1].y) / 2 - r.top, cam.s * (d / pinchD));
    pinchD = d; moved = true; return;
  }
  cam.ox += e.clientX - prev.x; cam.oy += e.clientY - prev.y; if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) moved = true; render();
});
cv.addEventListener('pointerup', (e) => {
  const had = pointers.size; pointers.delete(e.pointerId); if (pointers.size < 2) pinchD = 0; if (pointers.size === 0) cv.classList.remove('drag');
  if (had === 1 && !moved) { const r = cv.getBoundingClientRect(), n = nodeAt(e.clientX - r.left, e.clientY - r.top); if (n) openInfo(n.id); else { $('info').classList.remove('on'); selected = null; render(); } }
});
cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchD = 0; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, cam.s * Math.exp(-e.deltaY * 0.0014)); }, { passive: false });
$('zin').addEventListener('click', () => zoomAt(CW / 2, CH / 2, cam.s * 1.35));
$('zout').addEventListener('click', () => zoomAt(CW / 2, CH / 2, cam.s / 1.35));
$('zfit').addEventListener('click', () => { fit(); render(); });
$('railtoggle').addEventListener('click', () => $('rail').classList.toggle('open'));
addEventListener('resize', resize);

// ── go ──
recompute(); layout(); buildSliders(); resize(); sidebar();
