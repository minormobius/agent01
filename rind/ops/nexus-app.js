// nexus-app.js — WALK A THREAD. You are the @, standing in ONE thread of the zero-ladder weave (rings-1 / 7-chunk
// footprint, breathy spirals so every door is at grade). Your thread is its own connected run of Voronoi chambers —
// now genuinely continuous (the watershed owns each spiral as one corridor), so you walk the REAL cell adjacency, a
// wide corridor, not a one-room spine. It is WALLED except for its doors (the crossings with the other colour) and
// the nexus at the centre. Each door shows a SIGHTLINE — a peek into the neighbouring thread beyond it — so you can
// see where it leads before you cross. Cross a door and the whole map becomes the new thread's, re-centred on the
// crossing. Start at the WHITE NEXUS. Built on curveseed (curve+watershed) + onedoor's certificate (the 48 doors).

import { buildCurveModel } from './curveseed.js';
import { certify } from './onedoor.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12], GOLD = [255, 224, 122];
const PEEK = 6;   // how many chambers of the neighbour thread you can see through a door

function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}

let m, cert, cells, threads, warpCol, prodCol;
const state = { mode: 'nexus', color: 'white', sel: 0, thread: null, gi: -1, trail: [], walk: null };
const view = { cx: 0, cy: 0, scale: 1 };

const armsOf = (color) => [...threads.values()].filter((t) => t.kind === color).sort((a, b) => a.idx - b.idx);
const threadColor = (t) => t.kind === 'white' ? warpCol(t.idx) : prodCol(t.idx);
const threadLabel = (t) => t.kind === 'white' ? `white arm · ${m.warps[t.idx].id}` : `production · ${m.wefts[t.idx].id}`;
const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;

// each thread = its OWN chambers (a continuous corridor under watershed) + door cells + the nexus (centre-most) cell
function buildThreads() {
  const T = new Map();
  const get = (kind, idx) => { const k = (kind === 'white' ? 'W' : 'P') + idx; if (!T.has(k)) T.set(k, { key: k, kind, idx, cells: new Set(), doorAt: new Map(), nexusGi: -1 }); return T.get(k); };
  for (const c of cells) if (c.owner) get(c.owner.kind, c.owner.idx).cells.add(c.gi);
  for (const d of cert.doors) { get('white', d.w).doorAt.set(d.a, { toKey: 'P' + d.f, farGi: d.b }); get('prod', d.f).doorAt.set(d.b, { toKey: 'W' + d.w, farGi: d.a }); }
  for (const t of T.values()) { let best = -1, bd = Infinity; for (const gi of t.cells) { const c = cells[gi], r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; best = gi; } } t.nexusGi = best; }
  return T;
}
const curThread = () => threads.get(state.thread);
// neighbours of gi that stay on the same thread (the walkable corridor graph)
const stepNbrs = (gi, t) => [...cells[gi].adj].filter((nb) => t.cells.has(nb));
// shortest corridor path gi→dst within the thread (BFS)
function pathWithin(t, a, b) { if (a === b) return [a]; const prev = new Map([[a, -1]]), q = [a]; for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepNbrs(q[h], t)) if (!prev.has(nb)) { prev.set(nb, q[h]); q.push(nb); } } if (!prev.has(b)) return null; const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse(); }
// the chambers of the neighbour thread visible through a door (BFS out from the far cell, up to PEEK deep)
function peekOf(door) { const N = threads.get(door.toKey); const seen = new Map([[door.farGi, 0]]), q = [door.farGi]; for (let h = 0; h < q.length; h++) { const d = seen.get(q[h]); if (d >= PEEK) continue; for (const nb of stepNbrs(q[h], N)) if (!seen.has(nb)) { seen.set(nb, d + 1); q.push(nb); } } return { key: door.toKey, cells: seen }; }

function fitTo(giList) {
  let minx = 9e9, maxx = -9e9, miny = 9e9, maxy = -9e9;
  for (const gi of giList) for (const v of (cells[gi].verts || [])) { minx = Math.min(minx, v[0]); maxx = Math.max(maxx, v[0]); miny = Math.min(miny, v[1]); maxy = Math.max(maxy, v[1]); }
  if (minx > maxx) { minx = miny = -m.R; maxx = maxy = m.R; }
  view.cx = (minx + maxx) / 2; view.cy = (miny + maxy) / 2;
  view.scale = Math.min(CW, CH) * 0.80 / Math.max(maxx - minx, maxy - miny, 1);
}
const P = (x, y) => [CW / 2 + (x - view.cx) * view.scale, CH / 2 - (y - view.cy) * view.scale];

function drawCell(gi, fill, stroke, lw) {
  const c = cells[gi]; if (!c.verts || c.verts.length < 3) { const p = P(c.x, c.y); ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fillStyle = fill; ctx.fill(); return; }
  const hull = convexHull(c.verts.map((v) => P(v[0], v[1])));
  ctx.beginPath(); hull.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  if (state.mode === 'nexus') return renderNexus();
  const t = curThread(), col = threadColor(t), T = m.thickness, you = cells[state.gi];

  // (1) SIGHTLINES into the doors — peek at the neighbour thread beyond each door, fading with distance
  for (const [gi, d] of t.doorAt) {
    const peek = peekOf(d), ncol = threadColor(threads.get(d.toKey)), atYou = gi === state.gi;
    for (const [ngi, depth] of peek.cells) { const a = (atYou ? 0.5 : 0.28) * (1 - depth / (PEEK + 1)); drawCell(ngi, rgba(mix(ncol, BG, 0.5), a), rgba(mix(ncol, BG, 0.35), a * 0.7), 0.5); }
    // a faint line of sight from you to the door
    const a = P(you.x, you.y), b = P(cells[gi].x, cells[gi].y);
    ctx.strokeStyle = rgba(GOLD, atYou ? 0.5 : 0.16); ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
  }

  // (2) YOUR thread — its chambers, the walkable corridor (walls = the outline)
  for (const gi of t.cells) { const sh = 0.45 + 0.55 * (cells[gi].z / T); drawCell(gi, rgba(mix(col, BG, 0.12), 0.94 * sh), rgba(mix(col, BG, 0.5), 0.5), 0.7); }

  // (3) the nexus end + the door gates
  const np = P(cells[t.nexusGi].x, cells[t.nexusGi].y);
  ctx.fillStyle = rgba(GOLD, 0.14); ctx.beginPath(); ctx.arc(np[0], np[1], 14, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 0.85); ctx.font = '10px ui-sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NEXUS', np[0], np[1] - 17);
  for (const [gi] of t.doorAt) { const p = P(cells[gi].x, cells[gi].y), here = gi === state.gi; ctx.fillStyle = rgba(GOLD, here ? 1 : 0.85); ctx.beginPath(); ctx.arc(p[0], p[1], here ? 6 : 4, 0, 7); ctx.fill(); if (here) { ctx.strokeStyle = rgba(INK, 0.9); ctx.lineWidth = 1.5; ctx.stroke(); } }

  // (4) the @ — you
  const yp = P(you.x, you.y);
  ctx.fillStyle = rgba(BG, 0.82); ctx.beginPath(); ctx.arc(yp[0], yp[1], 11, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = 'bold 18px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', yp[0], yp[1] + 1); ctx.textBaseline = 'alphabetic';
}

function renderNexus() {
  const arms = armsOf(state.color), all = []; for (const t of arms) all.push(...t.cells); fitTo(all);
  for (const t of arms) { const col = threadColor(t), sel = arms[state.sel] === t; for (const gi of t.cells) { const sh = 0.35 + 0.55 * (cells[gi].z / m.thickness); drawCell(gi, rgba(mix(col, BG, sel ? 0.06 : 0.55), (sel ? 0.92 : 0.4) * sh), null, 0); } }
  const c = P(0, 0);
  ctx.fillStyle = rgba(GOLD, 0.15); ctx.beginPath(); ctx.arc(c[0], c[1], 24, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = 'bold 13px ui-sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(state.color === 'white' ? 'WHITE NEXUS' : 'PRODUCTION NEXUS', c[0], c[1] - 32); ctx.fillText('@', c[0], c[1] + 5);
  const selT = arms[state.sel], e = selT.nexusGi >= 0 ? [...selT.cells].reduce((b, gi) => rfOf(gi) > rfOf(b) ? gi : b, selT.nexusGi) : selT.nexusGi, ep = P(cells[e].x, cells[e].y);
  ctx.fillStyle = rgba(threadColor(selT), 1); ctx.font = '11px ui-sans-serif'; ctx.fillText('▶ ' + threadLabel(selT), ep[0], ep[1]);
}

function updateHUD() {
  if (state.mode === 'nexus') {
    const arms = armsOf(state.color);
    $('now').innerHTML = `<span style="color:${rgba(state.color === 'white' ? [230, 233, 242] : [87, 166, 214], 1)}">${state.color === 'white' ? 'WHITE NEXUS' : 'PRODUCTION NEXUS'}</span><br><span class="sub">pick an arm to walk out — ← → choose, Enter to enter</span>`;
    $('doors').innerHTML = arms.map((a, i) => `<div class="d ${i === state.sel ? 'here' : ''}" data-arm="${i}"><span class="sw" style="background:${rgba(threadColor(a), 1)}"></span><span class="lab">${threadLabel(a)}</span></div>`).join('');
    for (const el of $('doors').querySelectorAll('.d')) el.addEventListener('click', () => { state.sel = +el.dataset.arm; enter(); });
    $('trail').innerHTML = state.trail.length ? state.trail.map((s) => `<b>${s}</b>`).join(' → ') : '(at the white nexus)';
    return;
  }
  const t = curThread(), col = threadColor(t);
  $('now').innerHTML = `<span style="color:${rgba(col, 1)}">${threadLabel(t)}</span><br><span class="sub">${t.cells.size} chambers · you're ${(rfOf(state.gi) * 100) | 0}% out · on a door: ${t.doorAt.has(state.gi) ? '<b style="color:var(--gold)">yes — Enter to cross</b>' : 'no'}</span>`;
  const rows = [...t.doorAt.entries()].sort((a, b) => rfOf(a[0]) - rfOf(b[0])).map(([gi, d]) => { const other = threads.get(d.toKey), here = gi === state.gi; return `<div class="d ${here ? 'here' : ''}" data-gi="${gi}"><span class="sw" style="background:${rgba(threadColor(other), 1)}"></span><span class="lab">${here ? '▶ cross to ' : 'to '}${threadLabel(other)}</span><span class="rf">${(rfOf(gi) * 100) | 0}%</span></div>`; }).join('');
  $('doors').innerHTML = rows;
  for (const el of $('doors').querySelectorAll('.d')) el.addEventListener('click', () => { const gi = +el.dataset.gi; if (gi === state.gi) cross(); else setWalk(gi); });
  $('trail').innerHTML = state.trail.map((s) => `<b>${s}</b>`).join(' → ');
}

function setWalk(dst) { const p = pathWithin(curThread(), state.gi, dst); if (p && p.length > 1) state.walk = { path: p, i: 0 }; }
function moveDir(dx, dy) { const t = curThread(), nbrs = stepNbrs(state.gi, t); if (!nbrs.length) return; const yp = P(cells[state.gi].x, cells[state.gi].y);
  let best = -1, bs = -Infinity; for (const nb of nbrs) { const p = P(cells[nb].x, cells[nb].y), vx = p[0] - yp[0], vy = p[1] - yp[1], L = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / L; if (s > bs) { bs = s; best = nb; } }
  if (best >= 0 && bs > 0.2) { state.gi = best; state.walk = null; updateHUD(); } }
function cross() { const t = curThread(), d = t.doorAt.get(state.gi); if (!d) return; state.trail.push(threadLabel(t).split(' · ')[1] || t.key); state.walk = null; state.thread = d.toKey; state.gi = d.farGi; fitTo(threads.get(d.toKey).cells); updateHUD(); }
function enter() { const t = armsOf(state.color)[state.sel]; state.mode = 'thread'; state.thread = t.key; state.gi = t.nexusGi; state.trail.push(state.color === 'white' ? 'white nexus' : 'prod nexus'); fitTo(t.cells); updateHUD(); }
function toNexus() { const t = curThread(); state.mode = 'nexus'; state.color = t.kind; state.sel = t.idx; state.walk = null; updateHUD(); }

addEventListener('keydown', (e) => {
  if (state.mode === 'nexus') { const arms = armsOf(state.color);
    if (e.key === 'ArrowLeft' || e.key === 'a') { state.sel = (state.sel + arms.length - 1) % arms.length; updateHUD(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { state.sel = (state.sel + 1) % arms.length; updateHUD(); }
    else if (e.key === 'Enter' || e.key === ' ') enter();
    return;
  }
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w') moveDir(0, -1);
  else if (k === 'ArrowDown' || k === 's') moveDir(0, 1);
  else if (k === 'ArrowLeft' || k === 'a') moveDir(-1, 0);
  else if (k === 'ArrowRight' || k === 'd') moveDir(1, 0);
  else if (k === 'Enter' || k === ' ') { if (curThread().doorAt.has(state.gi)) cross(); else if (state.gi === curThread().nexusGi) toNexus(); }
});

cv.addEventListener('click', (e) => {
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (state.mode === 'nexus') { const arms = armsOf(state.color); let best = -1, bd = 30 * 30;   // pick the arm whose nearest chamber is under the click
    arms.forEach((t, i) => { for (const gi of t.cells) { const p = P(cells[gi].x, cells[gi].y), d = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (d < bd) { bd = d; best = i; } } }); if (best >= 0) { state.sel = best; enter(); } return; }
  const t = curThread(); let best = -1, bd = 24 * 24; for (const gi of t.cells) { const p = P(cells[gi].x, cells[gi].y), d = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (d < bd) { bd = d; best = gi; } }
  if (best >= 0) { if (t.doorAt.has(best) && best === state.gi) cross(); else setWalk(best); }
});

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (m && state.mode === 'thread') fitTo(curThread().cells); }
addEventListener('resize', resize);

let frameN = 0;
function loop() { frameN++; if (state.walk && frameN % 4 === 0) { state.walk.i++; if (state.walk.i < state.walk.path.length) { state.gi = state.walk.path[state.walk.i]; updateHUD(); } else state.walk = null; } render(); requestAnimationFrame(loop); }

const Q = new URLSearchParams(location.search), seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 42;
setTimeout(() => {
  m = buildCurveModel(seed, { rings: 1, flatR: 0.16, layers: 8, pitch: 36, width: 6, NW: 6, NF: 8, turnScale: 0.35 });   // the breathy, zero-ladder, 7-chunk world
  cert = certify(m); cells = m.cells;
  warpCol = (w) => mix(hex(m.warps[w].color), INK, (w % 2) * 0.28); prodCol = (f) => hex(m.wefts[f].color);
  threads = buildThreads();
  $('loading').style.display = 'none';
  resize(); updateHUD(); loop();
}, 40);
