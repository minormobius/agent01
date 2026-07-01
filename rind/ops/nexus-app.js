// nexus-app.js — INHABIT A THREAD. The navigation/mapping prototype: you are the @, standing in ONE thread. Your
// thread is the sequence of its own chambers strung along its analytic curve (nexus → rim), rendered as one filled
// surface; it is WALLED except for (a) the doors where it crosses the other colour's threads and (b) the nexus at
// its centre end. Walk the corridor; cross a door and the whole map becomes the NEW thread's map, re-centred on the
// crossing. You start at the WHITE NEXUS. Built on curveseed (on-curve substrate) + onedoor's certificate (the doors).
//
// This is a proto: the @ walks the ordered on-curve chambers (that sequence is connected by construction — the
// Voronoi cells fragment, but the curve order does not), the polyhedra are drawn rough, top-down. Point of view first.

import { buildCurveModel } from './curveseed.js';
import { certify } from './onedoor.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12], GOLD = [255, 224, 122];

function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}

let m, cert, cells, threads, warpCol, prodCol;
const state = { mode: 'nexus', color: 'white', sel: 0, thread: null, gi: -1, trail: [] };
const view = { cx: 0, cy: 0, scale: 1 };

const armsOf = (color) => [...threads.values()].filter((t) => t.kind === color).sort((a, b) => a.idx - b.idx);
const threadColor = (t) => t.kind === 'white' ? warpCol(t.idx) : prodCol(t.idx);
const threadLabel = (t) => t.kind === 'white' ? `white arm · ${m.warps[t.idx].id}` : `production · ${m.wefts[t.idx].id}`;
const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;

function buildThreads() {
  const T = new Map();
  const get = (kind, idx) => { const k = (kind === 'white' ? 'W' : 'P') + idx; if (!T.has(k)) T.set(k, { key: k, kind, idx, seq: [], indexOf: null, doorAt: new Map() }); return T.get(k); };
  for (const c of cells) if (c.owner) get(c.owner.kind, c.owner.idx).seq.push(c.gi);
  for (const t of T.values()) { t.seq.sort((a, b) => (cells[a].x ** 2 + cells[a].y ** 2) - (cells[b].x ** 2 + cells[b].y ** 2)); t.indexOf = new Map(t.seq.map((gi, i) => [gi, i])); }
  for (const d of cert.doors) { get('white', d.w).doorAt.set(d.a, { toKey: 'P' + d.f, farGi: d.b }); get('prod', d.f).doorAt.set(d.b, { toKey: 'W' + d.w, farGi: d.a }); }
  return T;
}

// fit the view to a set of chambers (bbox of their vertices)
function fitTo(giList) {
  let minx = 9e9, maxx = -9e9, miny = 9e9, maxy = -9e9;
  for (const gi of giList) for (const v of (cells[gi].verts || [])) { minx = Math.min(minx, v[0]); maxx = Math.max(maxx, v[0]); miny = Math.min(miny, v[1]); maxy = Math.max(maxy, v[1]); }
  if (minx > maxx) { minx = miny = -m.R; maxx = maxy = m.R; }
  view.cx = (minx + maxx) / 2; view.cy = (miny + maxy) / 2;
  view.scale = Math.min(CW, CH) * 0.82 / Math.max(maxx - minx, maxy - miny, 1);
}
const P = (x, y) => [CW / 2 + (x - view.cx) * view.scale, CH / 2 - (y - view.cy) * view.scale];

function drawCellPoly(gi, fill, stroke, lw) {
  const c = cells[gi]; if (!c.verts || c.verts.length < 3) { const p = P(c.x, c.y); ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7); ctx.fillStyle = fill; ctx.fill(); return; }
  const hull = convexHull(c.verts.map((v) => P(v[0], v[1])));
  ctx.beginPath(); hull.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  if (state.mode === 'nexus') return renderNexus();
  const t = threads.get(state.thread), col = threadColor(t), T = m.thickness;

  // the thread as a filled SURFACE (its own chambers), shaded by deck height; walls = the outline
  for (const gi of t.seq) { const sh = 0.4 + 0.6 * (cells[gi].z / T); drawCellPoly(gi, rgba(mix(col, BG, 0.15), 0.9 * sh), rgba(mix(col, BG, 0.55), 0.5), 0.8); }

  // the analytic curve this thread is seeded along (faint spine)
  const lineFn = t.kind === 'white' ? m.lineW : m.lineP; ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1.4; ctx.beginPath();
  for (let k = 0; k <= 120; k++) { const rf = 0.014 + 0.986 * k / 120, q = lineFn(t.idx, rf), p = P(q[0], q[1]); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke();

  // the nexus end (centre-most chamber) — the way back to the shared hub
  const nx = t.seq[0], np = P(cells[nx].x, cells[nx].y);
  ctx.fillStyle = rgba(GOLD, 0.16); ctx.beginPath(); ctx.arc(np[0], np[1], 15, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 0.9); ctx.font = '10px ui-sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NEXUS', np[0], np[1] - 18);

  // the doors — gold gates with a stub toward the crossing thread
  for (const [gi, d] of t.doorAt) { const a = P(cells[gi].x, cells[gi].y), far = cells[d.farGi], b = P(far.x, far.y);
    const dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.strokeStyle = rgba(GOLD, 0.85); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + Math.cos(dir) * 16, a[1] + Math.sin(dir) * 16); ctx.stroke();
    ctx.fillStyle = rgba(GOLD, 0.95); ctx.beginPath(); ctx.arc(a[0], a[1], 4, 0, 7); ctx.fill();
  }

  // the @ — you
  const you = P(cells[state.gi].x, cells[state.gi].y);
  ctx.fillStyle = rgba(BG, 0.85); ctx.beginPath(); ctx.arc(you[0], you[1], 11, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = 'bold 18px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', you[0], you[1] + 1);
  ctx.textBaseline = 'alphabetic';
}

function renderNexus() {
  const arms = armsOf(state.color), col0 = state.color === 'white' ? [230, 233, 242] : [87, 166, 214];
  // fit to all same-colour arms
  const all = []; for (const t of arms) all.push(...t.seq); fitTo(all);
  for (const t of arms) { const col = threadColor(t), sel = arms[state.sel] === t;
    for (const gi of t.seq) { const sh = 0.35 + 0.55 * (cells[gi].z / m.thickness); drawCellPoly(gi, rgba(mix(col, BG, sel ? 0.05 : 0.55), (sel ? 0.92 : 0.4) * sh), null, 0); }
  }
  const c = P(0, 0);
  ctx.fillStyle = rgba(GOLD, 0.15); ctx.beginPath(); ctx.arc(c[0], c[1], 26, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = 'bold 13px ui-sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(state.color === 'white' ? 'WHITE NEXUS' : 'PRODUCTION NEXUS', c[0], c[1] - 34);
  ctx.fillText('@', c[0], c[1] + 5);
  // label the selected arm's rim end
  const selT = arms[state.sel], e = selT.seq[selT.seq.length - 1], ep = P(cells[e].x, cells[e].y);
  ctx.fillStyle = rgba(threadColor(selT), 1); ctx.font = '11px ui-sans-serif'; ctx.fillText('▶ ' + threadLabel(selT), ep[0], ep[1]);
}

function updateHUD() {
  if (state.mode === 'nexus') {
    const arms = armsOf(state.color), t = arms[state.sel];
    $('now').innerHTML = `<span style="color:${rgba(state.color === 'white' ? [230, 233, 242] : [87, 166, 214], 1)}">${state.color === 'white' ? 'WHITE NEXUS' : 'PRODUCTION NEXUS'}</span><br><span class="sub">pick an arm to walk out — ← → to choose, Enter to enter</span>`;
    $('doors').innerHTML = arms.map((a, i) => `<div class="d ${i === state.sel ? 'here' : ''}" data-arm="${i}"><span class="sw" style="background:${rgba(threadColor(a), 1)}"></span><span class="lab">${threadLabel(a)}</span></div>`).join('');
    for (const el of $('doors').querySelectorAll('.d')) el.addEventListener('click', () => { state.sel = +el.dataset.arm; enter(); });
    $('trail').innerHTML = state.trail.length ? state.trail.map((s) => `<b>${s}</b>`).join(' → ') : '(you are at the white nexus)';
    return;
  }
  const t = threads.get(state.thread), i = t.indexOf.get(state.gi), col = threadColor(t);
  $('now').innerHTML = `<span style="color:${rgba(col, 1)}">${threadLabel(t)}</span><br><span class="sub">chamber ${i + 1} of ${t.seq.length} · ${(rfOf(state.gi) * 100) | 0}% out toward the rim</span>`;
  const doorRows = [...t.doorAt.entries()].sort((a, b) => t.indexOf.get(a[0]) - t.indexOf.get(b[0])).map(([gi, d]) => {
    const other = threads.get(d.toKey), here = gi === state.gi;
    return `<div class="d ${here ? 'here' : ''}" data-gi="${gi}"><span class="sw" style="background:${rgba(threadColor(other), 1)}"></span><span class="lab">${here ? '▶ cross to ' : 'to '}${threadLabel(other)}</span><span class="rf">${(rfOf(gi) * 100) | 0}%</span></div>`;
  }).join('');
  $('doors').innerHTML = doorRows || '<span style="color:var(--dim)">no doors reach this thread here</span>';
  for (const el of $('doors').querySelectorAll('.d')) el.addEventListener('click', () => { const gi = +el.dataset.gi; if (gi === state.gi) cross(); else { walkTo(gi); } });
  $('trail').innerHTML = state.trail.map((s) => `<b>${s}</b>`).join(' → ');
}

function walkTo(gi) { state.gi = gi; updateHUD(); }
function step(dir) { const t = threads.get(state.thread), i = t.indexOf.get(state.gi), j = Math.max(0, Math.min(t.seq.length - 1, i + dir)); state.gi = t.seq[j]; updateHUD(); }

function cross() {
  const t = threads.get(state.thread), d = t.doorAt.get(state.gi); if (!d) return;
  state.trail.push(threadLabel(t).split(' · ')[1] || t.key);
  const nt = threads.get(d.toKey);
  state.thread = d.toKey; state.gi = d.farGi; fitTo(nt.seq); updateHUD();
}
function enter() { const t = armsOf(state.color)[state.sel]; state.mode = 'thread'; state.thread = t.key; state.gi = t.seq[0]; state.trail.push(state.color === 'white' ? 'white nexus' : 'prod nexus'); fitTo(t.seq); updateHUD(); }
function toNexus() { const t = threads.get(state.thread); state.mode = 'nexus'; state.color = t.kind; state.sel = t.idx; updateHUD(); }

addEventListener('keydown', (e) => {
  if (state.mode === 'nexus') {
    const arms = armsOf(state.color);
    if (e.key === 'ArrowLeft' || e.key === 'a') { state.sel = (state.sel + arms.length - 1) % arms.length; updateHUD(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { state.sel = (state.sel + 1) % arms.length; updateHUD(); }
    else if (e.key === 'Enter' || e.key === ' ') { enter(); }
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'a') { const i = threads.get(state.thread).indexOf.get(state.gi); if (i === 0) toNexus(); else step(-1); }
  else if (e.key === 'ArrowRight' || e.key === 'd') step(1);
  else if (e.key === 'Enter' || e.key === ' ') { if (threads.get(state.thread).doorAt.has(state.gi)) cross(); else if (threads.get(state.thread).indexOf.get(state.gi) === 0) toNexus(); }
});

// click a chamber of your thread to walk there; click a door to cross
cv.addEventListener('click', (e) => {
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (state.mode === 'nexus') { const arms = armsOf(state.color); let best = -1, bd = 40 * 40; arms.forEach((t, i) => { const el = t.seq[t.seq.length - 1], p = P(cells[el].x, cells[el].y), d = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (d < bd) { bd = d; best = i; } }); if (best >= 0) { state.sel = best; enter(); } return; }
  const t = threads.get(state.thread); let best = -1, bd = 26 * 26; for (const gi of t.seq) { const c = cells[gi], p = P(c.x, c.y), d = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (d < bd) { bd = d; best = gi; } }
  if (best >= 0) { if (t.doorAt.has(best) && best === state.gi) cross(); else walkTo(best); }
});

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (m) { if (state.mode === 'thread') fitTo(threads.get(state.thread).seq); } }
addEventListener('resize', resize);
function loop() { render(); requestAnimationFrame(loop); }

// build the world (heavy — let the "building…" note paint first)
const Q = new URLSearchParams(location.search); const seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 42;
setTimeout(() => {
  m = buildCurveModel(seed, { rings: 1, flatR: 0.16, layers: 8, pitch: 36 });
  cert = certify(m); cells = m.cells;
  warpCol = (w) => mix(hex(m.warps[w].color), INK, (w % 2) * 0.28); prodCol = (f) => hex(m.wefts[f].color);
  threads = buildThreads();
  $('loading').style.display = 'none';
  resize(); updateHUD(); loop();
}, 40);
