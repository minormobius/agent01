// office-app.js — YOUR THREAD IS AN OFFICE. The map is only what's reachable from the thread you're
// on: your thread renders in full as a district of Voronoi-floored rooms; every other thread is only
// a DOOR — and through it you can SEE the neighbour's first chamber. Walk into it and you're simply
// on the new thread (no prompt, no portal — you just cross). The nexus opens onto sibling offices.

import { buildCurveModel } from './curveseed.js';
import { certify } from './onedoor.js';
import { ROLES } from './v100/econ.js';
import { assignZones, mulberry32, clipCell } from './v100/voronoi.js';
import { buildPolyGenome, polyFrame, FAMILIES } from './sprites/poly.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], GOLD = [244, 191, 98], TEAL = [127, 216, 208], DARK = [8, 11, 16];
const ROOMSIZE = 12, PEEK_DEPTH = 3;   // how many chambers of an adjacent thread show through a door
const WHITE_ROLES = ['govern', 'serve', 'learn', 'trade', 'dwell', 'play', 'heal', 'store'];
const PROD_ROLES = ['make', 'make', 'store', 'mend', 'make', 'move', 'trade', 'grow'];

let m, cert, cells, threads, warpCol, prodCol, DROID = null, floorPoly = null;
const state = { thread: null, gi: -1, atNexus: false, enteredAt: -1, trail: [], walk: null };
const view = { cx: 0, cy: 0, scale: 1 };
let office = null, npcs = [];

const armsOf = (kind) => [...threads.values()].filter((t) => t.kind === kind && !t.synthetic).sort((a, b) => a.idx - b.idx);
const siblingsOf = (t) => armsOf(t.kind).filter((s) => s !== t);
const curThread = () => threads.get(state.thread);
const threadColor = (t) => t.synthetic ? TEAL : (t.kind === 'white' ? warpCol(t.idx) : prodCol(t.idx));
const threadLabel = (t) => t.synthetic ? 'the nexus' : (t.kind === 'white' ? `${m.warps[t.idx].id}` : `${m.wefts[t.idx].id}`);
const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;
const stepNbrs = (gi, t) => [...cells[gi].adj].filter((nb) => t.cells.has(nb));

function buildThreads() {
  const T = new Map();
  const get = (kind, idx) => { const k = (kind === 'white' ? 'W' : 'P') + idx; if (!T.has(k)) T.set(k, { key: k, kind, idx, cells: new Set(), doorAt: new Map(), nexusGi: -1 }); return T.get(k); };
  for (const c of cells) if (c.owner) get(c.owner.kind, c.owner.idx).cells.add(c.gi);
  for (const d of cert.doors) { get('white', d.w).doorAt.set(d.a, { toKey: 'P' + d.f, farGi: d.b }); get('prod', d.f).doorAt.set(d.b, { toKey: 'W' + d.w, farGi: d.a }); }
  for (const t of T.values()) { let best = -1, bd = Infinity; for (const gi of t.cells) { const c = cells[gi], r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; best = gi; } } t.nexusGi = best; }
  return T;
}
// avoidDoors: never route THROUGH a door cell (except as the destination), so an autopath across
// your office can't trip a portal mid-way — you only cross a door when you actually target it.
function pathWithin(t, a, b, avoidDoors) {
  if (a === b) return [a];
  const prev = new Map([[a, -1]]), q = [a];
  for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepNbrs(q[h], t)) { if (prev.has(nb)) continue; if (avoidDoors && nb !== b && t.doorAt.has(nb)) continue; prev.set(nb, q[h]); q.push(nb); } }
  if (!prev.has(b)) return null;
  const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse();
}

// ── precompute a 2D Voronoi FLOOR TILE per cell (clipCell skips coincident vertical partners) ──
function precomputeFloors() {
  floorPoly = new Map();
  const gs = m.pitch * 1.6, grid = new Map(), gk = (x, y) => `${Math.floor(x / gs)},${Math.floor(y / gs)}`;
  for (const c of cells) { const k = gk(c.x, c.y); let b = grid.get(k); if (!b) { b = []; grid.set(k, b); } b.push(c); }
  const R = m.pitch * 2.2;
  for (const c of cells) {
    const bx = Math.floor(c.x / gs), by = Math.floor(c.y / gs), near = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const b = grid.get(`${bx + dx},${by + dy}`); if (b) for (const o of b) if (o !== c) near.push(o); }
    floorPoly.set(c.gi, clipCell({ x: c.x, y: c.y }, near, R));
  }
}

// ── partition ONE thread into an office (rooms + hallway spine + the neighbours' first chambers) ──
function buildOffice(t) {
  const gis = [...t.cells], li = new Map(gis.map((g, i) => [g, i])), subEdges = [];
  for (const g of gis) for (const nb of stepNbrs(g, t)) if (nb > g && li.has(nb)) subEdges.push({ a: li.get(g), b: li.get(nb) });
  const nZones = Math.max(3, Math.round(gis.length / ROOMSIZE));
  const sd = (m.seed ^ (t.kind === 'white' ? 0x1111 : 0x2222) ^ (t.idx * 0x9e37)) >>> 0;
  const zone = assignZones(gis.length, subEdges, new Array(nZones).fill(1), sd);
  const rng = mulberry32((sd ^ 0x5bd1) >>> 0);
  const pool = t.kind === 'white' ? WHITE_ROLES : PROD_ROLES;
  const rooms = [], byZone = new Map(), roomOf = new Map();
  gis.forEach((g, i) => { const z = zone[i]; let r = byZone.get(z); if (!r) { r = { id: rooms.length, cells: [], cx: 0, cy: 0 }; byZone.set(z, r); rooms.push(r); } r.cells.push(g); });
  for (const r of rooms) {
    const role = pool[Math.floor(rng() * pool.length)];
    r.role = role; r.glyph = ROLES[role].glyph; r.shade = 0.02 + rng() * 0.12;              // subtle per-room lightness
    let cx = 0, cy = 0; for (const g of r.cells) { cx += cells[g].x; cy += cells[g].y; roomOf.set(g, r); } r.cx = cx / r.cells.length; r.cy = cy / r.cells.length;
    r.people = role === 'dwell' ? 1 + (Math.floor(rng() * 3)) : 0;
  }
  // hallway spine: nexus → rim-most chamber, widened one ring
  let rim = t.nexusGi, br = -1; for (const g of t.cells) { const r = rfOf(g); if (r > br) { br = r; rim = g; } }
  const spinePath = pathWithin(t, t.nexusGi, rim) || [t.nexusGi], spine = new Set(spinePath);
  for (const g of spinePath) for (const nb of stepNbrs(g, t)) spine.add(nb);
  // the neighbours' FIRST CHAMBERS: from each door's far cell, a couple of hops INTO the neighbour thread
  const peek = [], peekSet = new Set();
  for (const [gi, d] of t.doorAt) {
    const N = threads.get(d.toKey), col = threadColor(N), seen = new Map([[d.farGi, 0]]), q = [d.farGi];
    for (let h = 0; h < q.length; h++) { const dep = seen.get(q[h]); if (dep >= PEEK_DEPTH) continue; for (const nb of stepNbrs(q[h], N)) if (!seen.has(nb)) { seen.set(nb, dep + 1); q.push(nb); } }   // the first chambers of the neighbour
    for (const g of seen.keys()) { peek.push({ gi: g, col, door: gi }); peekSet.add(g); }
  }
  // at the NEXUS, show the six threads in FULL — six portals radiating across the chunk
  if (t.synthetic) { peek.length = 0; peekSet.clear(); for (const [gi, d] of t.doorAt) { const N = threads.get(d.toKey), col = threadColor(N); for (const g of N.cells) { peek.push({ gi: g, col, door: gi }); peekSet.add(g); } } }
  return { rooms, roomOf, spine, rim, peek, peekSet };
}

function rebuild(threadKey, gi) {
  state.thread = threadKey; state.gi = gi; state.walk = null;
  state.atNexus = curThread().synthetic || rfOf(gi) < (m.flatR || 0.16) + 0.06;
  office = buildOffice(curThread());
  spawnNPCs(); updateHUD();          // NB: NO camera refit — the chunk view stays fixed so crossing a door is CONTINUOUS
}

// ── the six-thread NEXUS as a synthetic "thread": the lobby floor with six doors, one per white arm ──
function buildHub() {
  const lobby = new Set();
  for (const c of cells) if (Math.hypot(c.x, c.y) / m.R < (m.flatR || 0.16) + 0.03) lobby.add(c.gi);
  let center = -1, bd = Infinity; for (const gi of lobby) { const c = cells[gi], r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; center = gi; } }
  if (center < 0) { for (const c of cells) { const r = c.x * c.x + c.y * c.y; if (r < bd) { bd = r; center = c.gi; } } lobby.add(center); }
  const doorAt = new Map(), used = new Set();
  for (const w of armsOf('white')) {
    let entry = -1;
    for (const nb of cells[w.nexusGi].adj) if (lobby.has(nb) && !used.has(nb)) { entry = nb; break; }
    if (entry < 0) { const wc = cells[w.nexusGi]; let bb = Infinity; for (const gi of lobby) { if (used.has(gi)) continue; const c = cells[gi], d = (c.x - wc.x) ** 2 + (c.y - wc.y) ** 2; if (d < bb) { bb = d; entry = gi; } } }
    if (entry >= 0) { used.add(entry); doorAt.set(entry, { toKey: w.key, farGi: w.nexusGi }); }
  }
  return { key: 'HUB', kind: 'white', synthetic: true, cells: lobby, doorAt, nexusGi: center };
}

// ── camera: fit the whole CHUNK (the hexagon boundary) — fixed, set once ──
function fitChunk() {
  const fp = m.footprint; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const v of fp) { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); }
  const pad = 56; view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
  view.scale = Math.min((CW - pad) / Math.max(1, x1 - x0), (CH - pad) / Math.max(1, y1 - y0));
}
function enterHub() { const hub = threads.get('HUB'); state.enteredAt = hub.nexusGi; state.trail.push('✦' + threadLabel(curThread())); if (state.trail.length > 8) state.trail.shift(); rebuild('HUB', hub.nexusGi); }
const P = (x, y) => [CW / 2 + (x - view.cx) * view.scale, CH / 2 + (y - view.cy) * view.scale];
function fillFloor(gi, fill, stroke) {
  const poly = floorPoly.get(gi); if (!poly || poly.length < 3) return;
  ctx.beginPath(); for (let i = 0; i < poly.length; i++) { const p = P(poly[i][0], poly[i][1]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// ── NPCs: residents on WHITE threads, droids on PRODUCTION threads ──
function randCell(t) { const a = [...t.cells]; return a[(Math.random() * a.length) | 0]; }
function spawnNPCs() {
  npcs = []; const t = curThread(), droidKind = t.kind === 'prod';
  if (!DROID) DROID = buildPolyGenome('rind-office', { ...FAMILIES.spiderbot, w: 20, h: 20 });
  const n = Math.min(7, Math.max(3, (t.cells.size / 40) | 0));
  for (let i = 0; i < n; i++) { const gi = randCell(t); npcs.push({ gi, x: cells[gi].x, y: cells[gi].y, path: [gi], seg: 0, prog: 0, droid: droidKind, ph: i * 1.7 }); }
}
function retarget(nn, t) { for (let k = 0; k < 6; k++) { const dst = randCell(t); const p = pathWithin(t, nn.gi, dst); if (p && p.length > 1) { nn.path = p; nn.seg = 0; nn.prog = 0; return; } } nn.path = [nn.gi]; }
function updateNPCs() {
  const t = curThread();
  for (const nn of npcs) {
    if (nn.seg >= nn.path.length - 1) { retarget(nn, t); continue; }
    nn.prog += nn.droid ? 0.05 : 0.035; if (nn.prog >= 1) { nn.prog = 0; nn.seg++; nn.gi = nn.path[Math.min(nn.seg, nn.path.length - 1)]; }
    const a = cells[nn.path[nn.seg]], b = cells[nn.path[Math.min(nn.seg + 1, nn.path.length - 1)]];
    nn.x = a.x + (b.x - a.x) * nn.prog; nn.y = a.y + (b.y - a.y) * nn.prog;
  }
}

// ── render ──
function drawChunk() {
  const fp = m.footprint; ctx.beginPath();
  for (let i = 0; i < fp.length; i++) { const p = P(fp[i][0], fp[i][1]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
  ctx.closePath(); ctx.fillStyle = 'rgba(9,13,19,0.55)'; ctx.fill();               // the chunk interior (boundary conditions)
  ctx.strokeStyle = rgba([120, 142, 172], 0.55); ctx.lineWidth = 1.6; ctx.stroke();
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, CW, CH);
  const t = curThread(), TC = threadColor(t), isHub = !!t.synthetic;
  drawChunk();
  // the neighbours' first chambers (peeks) — dim, behind the current thread
  for (const p of office.peek) { if (t.cells.has(p.gi)) continue; fillFloor(p.gi, rgba(mix(DARK, p.col, 0.34), 0.92), rgba(mix(DARK, p.col, 0.55), 0.5)); }
  // the current thread floor — ONE colour, rooms only slightly varied, hallway darker (a neutral slate for the hub)
  const BASE = isHub ? [54, 66, 82] : TC;
  for (const gi of t.cells) {
    const onSpine = office.spine.has(gi), r = office.roomOf.get(gi);
    const fill = onSpine ? mix(DARK, BASE, 0.14) : mix(DARK, BASE, 0.30 + (r ? r.shade : 0));
    fillFloor(gi, rgba(fill, isHub ? 0.9 : 0.98), rgba(mix(DARK, BASE, 0.5), 0.35));
  }
  // muted role glyphs (not on the hub lobby)
  if (!isHub && view.scale > 0.4) for (const r of office.rooms) { const p = P(r.cx, r.cy); ctx.fillStyle = rgba(mix(TC, INK, 0.6), 0.22); ctx.font = `${Math.max(8, 12 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.glyph, p[0], p[1]); }
  // doors: a subtle gold seam mid-thread (hidden portal); at the nexus the six are bright labelled portals
  for (const [gi, d] of t.doorAt) {
    const c = cells[gi], far = cells[d.farGi], p = P((c.x + far.x) / 2, (c.y + far.y) / 2), ncol = threadColor(threads.get(d.toKey));
    if (isHub) {
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(6, 9 * view.scale), 0, 7); ctx.fillStyle = rgba(ncol, 0.9); ctx.fill();
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(6, 9 * view.scale) + 2, 0, 7); ctx.strokeStyle = rgba(GOLD, 0.9); ctx.lineWidth = 1.6; ctx.stroke();
      if (view.scale > 0.4) { ctx.fillStyle = rgba(INK, 0.85); ctx.font = `${Math.max(9, 11 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(threadLabel(threads.get(d.toKey)), p[0], p[1] - Math.max(11, 15 * view.scale)); }
    } else { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2, 3 * view.scale), 0, 7); ctx.fillStyle = rgba(mix(GOLD, ncol, 0.4), 0.7); ctx.fill(); }
  }
  // NPCs
  const rad = Math.max(3, m.pitch * 0.5 * view.scale);
  for (const nn of npcs) { if (nn.droid) drawDroidAt(nn); else drawPerson(nn.x, nn.y, rad); }
  // nexus + player
  const nx = P(cells[t.nexusGi].x, cells[t.nexusGi].y);
  ctx.beginPath(); ctx.arc(nx[0], nx[1], rad * 1.0, 0, 7); ctx.strokeStyle = rgba(TEAL, 0.85); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = rgba(TEAL, 0.8); ctx.font = `${Math.max(9, 12 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', nx[0], nx[1]);
  const pp = P(cells[state.gi].x, cells[state.gi].y);
  ctx.beginPath(); ctx.arc(pp[0], pp[1], rad * 1.1, 0, 7); ctx.fillStyle = rgba(TEAL, 0.16); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = `bold ${Math.max(12, 17 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', pp[0], pp[1]);
}
function drawPerson(x, y, r) {
  const p = P(x, y), col = [206, 214, 222];
  ctx.fillStyle = 'rgba(4,6,10,0.55)'; ctx.beginPath(); ctx.ellipse(p[0], p[1] + r * 0.15, r * 0.5, r * 0.72, 0, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.ellipse(p[0], p[1] + r * 0.25, r * 0.32, r * 0.55, 0, 0, 7); ctx.fill();      // body
  ctx.beginPath(); ctx.arc(p[0], p[1] - r * 0.42, r * 0.3, 0, 7); ctx.fill();                                                        // head
}
function drawDroidAt(nn) {
  const p = P(nn.x, nn.y), t = performance.now() / 1000 + nn.ph, px = polyFrame(DROID, t), s = Math.max(0.7, 1.0 * view.scale);
  ctx.fillStyle = 'rgba(4,6,10,0.75)'; ctx.beginPath(); ctx.arc(p[0], p[1], 8 * Math.max(0.6, view.scale), 0, 7); ctx.fill();
  for (const q of px) { ctx.fillStyle = q.c; ctx.fillRect(p[0] + (q.x - DROID.cx) * s, p[1] + (q.y - DROID.cy) * s, s + 0.5, s + 0.5); }
}

// ── movement: arrive() crosses ONLY on a deliberate step (a WASD nudge, or the FINAL cell of a walk) ──
// so autopathing across your office never trips a portal in passing.
function arrive(gi, allowCross) {
  if (gi === state.gi) return;
  state.gi = gi;
  if (gi !== state.enteredAt) state.enteredAt = -1;                 // we've left the cell we just crossed into
  const d = curThread().doorAt.get(gi);
  if (allowCross && d && state.enteredAt === -1) { state.walk = null; crossThrough(d); return; }
  afterMove();
}
function crossThrough(d) { const t = curThread(); state.trail.push(threadLabel(t)); if (state.trail.length > 8) state.trail.shift(); state.enteredAt = d.farGi; rebuild(d.toKey, d.farGi); }
function afterMove() { state.atNexus = curThread().synthetic || rfOf(state.gi) < (m.flatR || 0.16) + 0.06; updateHUD(); }
function moveDir(dx, dy) {
  const t = curThread(), nbrs = stepNbrs(state.gi, t); if (!nbrs.length) return;
  const here = cells[state.gi]; let best = -1, bs = 0.25;
  for (const nb of nbrs) { const c = cells[nb], vx = c.x - here.x, vy = c.y - here.y, L = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / L; if (s > bs) { bs = s; best = nb; } }
  if (best >= 0) arrive(best, true);        // a WASD step onto a door is a deliberate crossing
}
function setWalk(dst) { const t = curThread(); const p = pathWithin(t, state.gi, dst, true) || pathWithin(t, state.gi, dst, false); if (p && p.length > 1) state.walk = { path: p, i: 0 }; }
function enterSibling(key) { const s = threads.get(key); if (!s) return; state.trail.push('✦' + threadLabel(curThread())); state.enteredAt = s.nexusGi; rebuild(key, s.nexusGi); }

// ── HUD ──
function updateHUD() {
  const t = curThread(), isHub = !!t.synthetic, r = office.roomOf.get(state.gi), onSpine = office.spine.has(state.gi), atDoor = t.doorAt.get(state.gi);
  $('oname').textContent = isHub ? 'the nexus' : threadLabel(t); $('oname').style.color = rgba(threadColor(t), 1);
  $('okind').textContent = isHub ? 'six white threads start here — six portals' : (t.kind === 'white' ? 'white-collar ops · an office (residents)' : 'production · an engine works (droids)');
  const where = atDoor ? `<span class="role">▶ into ${threadLabel(threads.get(atDoor.toKey))}</span><div class="sub">just walk through — you're already crossing</div>`
    : isHub ? `<span class="role">✦ the nexus</span><div class="sub">walk into one of the six threads</div>`
    : onSpine ? `<span class="role">the hallway</span><div class="sub">${(rfOf(state.gi) * 100) | 0}% out from the nexus</div>`
    : r ? `<span class="role">${r.glyph} ${r.role}</span><div class="sub">${r.people ? r.people + ' resident' + (r.people > 1 ? 's' : '') : 'a work room'}</div>`
    : `<span class="role">chamber</span>`;
  $('now').innerHTML = where;
  const doors = [...t.doorAt.entries()].sort((a, b) => rfOf(a[0]) - rfOf(b[0]));
  $('doors').innerHTML = doors.map(([gi, d]) => { const other = threads.get(d.toKey), here = gi === state.gi; return `<div class="door ${here ? 'here' : ''}" data-gi="${gi}"><span class="sw" style="background:${rgba(threadColor(other), 1)}"></span><span class="lab">${here ? '▶ ' : ''}${threadLabel(other)}</span><span class="rf">${(rfOf(gi) * 100) | 0}%</span></div>`; }).join('');
  for (const el of $('doors').querySelectorAll('.door')) el.addEventListener('click', () => setWalk(+el.dataset.gi));
  const sibs = siblingsOf(t), showSib = state.atNexus && !isHub;
  $('sibhdr').style.display = showSib ? '' : 'none';
  $('sibs').innerHTML = showSib
    ? `<div class="door" data-hub="1"><span class="sw" style="background:${rgba(TEAL, 1)}"></span><span class="lab">✦ the six-thread nexus</span></div>` + sibs.map((s) => `<div class="door" data-sib="${s.key}"><span class="sw" style="background:${rgba(threadColor(s), 1)}"></span><span class="lab">✦ ${threadLabel(s)}</span></div>`).join('')
    : '';
  for (const el of $('sibs').querySelectorAll('.door')) el.addEventListener('click', () => { if (el.dataset.hub) enterHub(); else enterSibling(el.dataset.sib); });
  $('trail').innerHTML = state.trail.length ? 'trail: ' + state.trail.map((x) => `<b>${x}</b>`).join(' → ') + ` → <b>${isHub ? 'the nexus' : threadLabel(t)}</b>` : '';
}

// ── input + loop ──
addEventListener('keydown', (e) => {
  const k = e.key, d = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[k];
  if (d) { moveDir(d[0], d[1]); e.preventDefault(); }
});
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const wx = view.cx + (sx - CW / 2) / view.scale, wy = view.cy + (sy - CH / 2) / view.scale, t = curThread();
  let best = -1, bd = Infinity;
  for (const gi of t.cells) { const c = cells[gi], dd = (c.x - wx) ** 2 + (c.y - wy) ** 2; if (dd < bd) { bd = dd; best = gi; } }
  // clicking on a visible neighbour peek walks you to its door (then you cross through)
  for (const p of office.peek) { const c = cells[p.gi], dd = (c.x - wx) ** 2 + (c.y - wy) ** 2; if (dd < bd) { bd = dd; best = p.door; } }
  if (best >= 0) setWalk(best);
});
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (m) fitChunk(); }
addEventListener('resize', resize);
let frameN = 0;
function loop() {
  frameN++;
  if (state.walk && frameN % 4 === 0) { state.walk.i++; if (state.walk.i < state.walk.path.length) { arrive(state.walk.path[state.walk.i], state.walk.i === state.walk.path.length - 1); } else state.walk = null; }
  if (office) { updateNPCs(); render(); }
  requestAnimationFrame(loop);
}

// ── boot ──
const seed = (new URLSearchParams(location.search).get('seed') | 0) >>> 0 || 7;
m = buildCurveModel(seed, { rings: 1, flatR: 0.35, layers: 8, pitch: 28, width: 6, NW: 6, NF: 8, turnScale: 0.35, lobby: true });
cert = certify(m, { concourse: 'flood' });
cells = m.cells;
warpCol = (w) => mix(hex(m.warps[w].color), INK, 0.28 + (w % 2) * 0.12);
prodCol = (f) => hex(m.wefts[f].color);
threads = buildThreads();
threads.set('HUB', buildHub());          // the six-thread top nexus
precomputeFloors();
resize();
rebuild('HUB', threads.get('HUB').nexusGi);   // START at the nexus — six white threads, six portals
$('load').style.display = 'none';
loop();
