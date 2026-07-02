// office-app.js — YOUR THREAD IS AN OFFICE. The map is only what's reachable from the thread you're
// on: your thread is rendered in full as a district of rooms (a v100-style office — Voronoi chambers
// partitioned into role rooms + a hallway), and EVERY OTHER thread is only a DOOR in your wall. Cross
// a door and that thread becomes your office, re-centred; the one you left is now a door behind you.
// The nexus (thread hub) opens onto all sibling offices of the same kind. This is nexus.html's
// thread-relative navigation, but each thread is a full modelled office — never a dead room next door.

import { buildCurveModel } from './curveseed.js';
import { certify } from './onedoor.js';
import { ROLES, ROLE_MIX } from './v100/econ.js';
import { assignZones, mulberry32 } from './v100/voronoi.js';
import { buildPolyGenome, polyFrame, FAMILIES } from './sprites/poly.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], GOLD = [244, 191, 98], TEAL = [127, 216, 208], HALL = [18, 34, 44];
const ROOMSIZE = 12;
// per-kind role pools: production threads run engine rooms, white threads run admin/ops rooms
const WHITE_ROLES = ['govern', 'serve', 'learn', 'trade', 'dwell', 'play', 'heal', 'store'];
const PROD_ROLES = ['make', 'make', 'store', 'mend', 'make', 'move', 'trade', 'grow'];

let m, cert, cells, threads, warpCol, prodCol, DROID = null;
const state = { thread: null, gi: -1, atNexus: false, trail: [], walk: null };
const view = { cx: 0, cy: 0, scale: 1 };
let office = null;              // { rooms, roomOf(Map gi→room), spine(Set gi) } for the CURRENT thread
let npcs = [];

const armsOf = (kind) => [...threads.values()].filter((t) => t.kind === kind).sort((a, b) => a.idx - b.idx);
const siblingsOf = (t) => armsOf(t.kind).filter((s) => s !== t);
const curThread = () => threads.get(state.thread);
const threadColor = (t) => t.kind === 'white' ? warpCol(t.idx) : prodCol(t.idx);
const threadLabel = (t) => t.kind === 'white' ? `${m.warps[t.idx].id}` : `${m.wefts[t.idx].id}`;
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

function pathWithin(t, a, b) {
  if (a === b) return [a];
  const prev = new Map([[a, -1]]), q = [a];
  for (let h = 0; h < q.length; h++) { if (q[h] === b) break; for (const nb of stepNbrs(q[h], t)) if (!prev.has(nb)) { prev.set(nb, q[h]); q.push(nb); } }
  if (!prev.has(b)) return null;
  const p = []; for (let c = b; c !== -1; c = prev.get(c)) p.push(c); return p.reverse();
}

// ── partition ONE thread's chambers into an office: rooms (role/glyph/colour) + a hallway spine ──
function buildOffice(t) {
  const gis = [...t.cells], li = new Map(gis.map((g, i) => [g, i]));
  const subEdges = [];
  for (const g of gis) for (const nb of stepNbrs(g, t)) if (nb > g && li.has(nb)) subEdges.push({ a: li.get(g), b: li.get(nb) });
  const nZones = Math.max(3, Math.round(gis.length / ROOMSIZE));
  const sd = (m.seed ^ (t.kind === 'white' ? 0x1111 : 0x2222) ^ (t.idx * 0x9e37)) >>> 0;
  const zone = assignZones(gis.length, subEdges, new Array(nZones).fill(1), sd);
  const rng = mulberry32((sd ^ 0x5bd1) >>> 0);
  const pool = t.kind === 'white' ? WHITE_ROLES : PROD_ROLES;
  const rooms = [], byZone = new Map(), roomOf = new Map();
  gis.forEach((g, i) => { const z = zone[i]; let r = byZone.get(z); if (!r) { r = { id: rooms.length, cells: [], cx: 0, cy: 0 }; byZone.set(z, r); rooms.push(r); } r.cells.push(g); });
  for (const r of rooms) {
    const role = pool[Math.floor(rng() * pool.length)], R = ROLES[role];
    r.role = role; r.glyph = R.glyph; r.color = mix(hex(R.color), threadColor(t), 0.35);   // role hue, tinted toward the thread
    let cx = 0, cy = 0; for (const g of r.cells) { cx += cells[g].x; cy += cells[g].y; roomOf.set(g, r); } r.cx = cx / r.cells.length; r.cy = cy / r.cells.length;
    r.people = role === 'dwell' ? 1 + (Math.floor(rng() * 3)) : 0;
  }
  // hallway = the spine from the nexus out to the rim-most chamber (the office's main corridor)
  let rim = t.nexusGi, br = -1; for (const g of t.cells) { const r = rfOf(g); if (r > br) { br = r; rim = g; } }
  const spinePath = pathWithin(t, t.nexusGi, rim) || [t.nexusGi];
  const spine = new Set(spinePath);
  // widen the hallway by one ring so it reads as a corridor
  for (const g of spinePath) for (const nb of stepNbrs(g, t)) spine.add(nb);
  return { rooms, roomOf, spine, rim };
}

function rebuild(threadKey, gi) {
  state.thread = threadKey; state.gi = gi; state.walk = null;
  state.atNexus = rfOf(gi) < (m.flatR || 0.16) + 0.06;
  office = buildOffice(curThread());
  fitThread(); spawnNPCs(); updateHUD();
}

// ── camera: fit the whole current thread ──
function fitThread() {
  const t = curThread(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const gi of t.cells) { const c = cells[gi]; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  const pad = 40; view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
  view.scale = Math.min((CW - pad) / Math.max(1, x1 - x0), (CH - pad) / Math.max(1, y1 - y0));
}
const P = (x, y) => [CW / 2 + (x - view.cx) * view.scale, CH / 2 + (y - view.cy) * view.scale];

// ── NPCs (residents + a couple of droids) ──
function randCell(t) { const a = [...t.cells]; return a[(Math.random() * a.length) | 0]; }
function spawnNPCs() {
  npcs = []; const t = curThread();
  if (!DROID) DROID = buildPolyGenome('rind-office', { ...FAMILIES.spiderbot, w: 20, h: 20 });
  const n = Math.min(6, Math.max(2, (t.cells.size / 60) | 0));
  for (let i = 0; i < n; i++) { const gi = randCell(t); npcs.push({ gi, x: cells[gi].x, y: cells[gi].y, path: [gi], seg: 0, prog: 0, droid: i < 2, ph: i * 1.7 }); }
}
function retarget(nn, t) { for (let k = 0; k < 6; k++) { const dst = randCell(t); const p = pathWithin(t, nn.gi, dst); if (p && p.length > 1) { nn.path = p; nn.seg = 0; nn.prog = 0; return; } } nn.path = [nn.gi]; }
function updateNPCs() {
  const t = curThread();
  for (const nn of npcs) {
    if (nn.seg >= nn.path.length - 1) { retarget(nn, t); continue; }
    nn.prog += 0.05; if (nn.prog >= 1) { nn.prog = 0; nn.seg++; nn.gi = nn.path[Math.min(nn.seg, nn.path.length - 1)]; }
    const a = cells[nn.path[nn.seg]], b = cells[nn.path[Math.min(nn.seg + 1, nn.path.length - 1)]];
    nn.x = a.x + (b.x - a.x) * nn.prog; nn.y = a.y + (b.y - a.y) * nn.prog;
  }
}

// ── render: ONLY the current thread; other threads appear as door-portals ──
function drawDisc(x, y, r, fill) { const p = P(x, y); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fillStyle = fill; ctx.fill(); }
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, CW, CH);
  const t = curThread(), rad = Math.max(3, m.pitch * 0.5 * view.scale);
  // chambers: hallway vs room colour
  for (const gi of t.cells) {
    const c = cells[gi]; const onSpine = office.spine.has(gi);
    let col;
    if (onSpine) col = HALL;
    else { const r = office.roomOf.get(gi); col = r ? mix([10, 14, 18], r.color, 0.6) : [12, 16, 20]; }
    drawDisc(c.x, c.y, rad, rgba(col, 0.95));
  }
  // room glyphs
  if (view.scale > 0.35) for (const r of office.rooms) { const p = P(r.cx, r.cy); ctx.fillStyle = rgba(mix(r.color, INK, 0.5), 0.9); ctx.font = `${Math.max(9, 15 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.glyph, p[0], p[1]); }
  // NPCs
  for (const nn of npcs) { if (nn.droid) drawDroidAt(nn); else { drawDisc(nn.x, nn.y, rad * 0.42, rgba(TEAL, 0.9)); } }
  // DOORS = portals to other threads (NOT their rooms — just a door, coloured by the neighbour thread)
  for (const [gi, d] of t.doorAt) {
    const c = cells[gi], ncol = threadColor(threads.get(d.toKey)), here = gi === state.gi, p = P(c.x, c.y);
    // a short sightline stub pointing outward toward the neighbour's far cell (a hint, not the rooms)
    const far = cells[d.farGi]; const dx = far.x - c.x, dy = far.y - c.y, L = Math.hypot(dx, dy) || 1;
    const q = P(c.x + dx / L * m.pitch * 1.3, c.y + dy / L * m.pitch * 1.3);
    const g = ctx.createLinearGradient(p[0], p[1], q[0], q[1]); g.addColorStop(0, rgba(ncol, 0.7)); g.addColorStop(1, rgba(ncol, 0));
    ctx.strokeStyle = g; ctx.lineWidth = rad * 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    // the door itself: gold gate ringed in the neighbour's colour
    ctx.beginPath(); ctx.arc(p[0], p[1], here ? rad * 0.95 : rad * 0.7, 0, 7); ctx.fillStyle = rgba(GOLD, here ? 1 : 0.9); ctx.fill();
    ctx.beginPath(); ctx.arc(p[0], p[1], (here ? rad * 0.95 : rad * 0.7) + 2, 0, 7); ctx.strokeStyle = rgba(ncol, 0.95); ctx.lineWidth = 2; ctx.stroke();
  }
  // nexus hub
  const nx = P(cells[t.nexusGi].x, cells[t.nexusGi].y);
  ctx.beginPath(); ctx.arc(nx[0], nx[1], rad * 1.1, 0, 7); ctx.strokeStyle = rgba(TEAL, 0.9); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = rgba(TEAL, 0.85); ctx.font = `${Math.max(9, 13 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', nx[0], nx[1]);
  // player
  const pp = P(cells[state.gi].x, cells[state.gi].y);
  ctx.beginPath(); ctx.arc(pp[0], pp[1], rad * 1.15, 0, 7); ctx.fillStyle = rgba(TEAL, 0.18); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = `bold ${Math.max(12, 17 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', pp[0], pp[1]);
}
function drawDroidAt(nn) {
  const p = P(nn.x, nn.y), t = performance.now() / 1000 + nn.ph, px = polyFrame(DROID, t), s = Math.max(0.7, 1.0 * view.scale);
  ctx.fillStyle = 'rgba(4,6,10,0.8)'; ctx.beginPath(); ctx.arc(p[0], p[1], 8 * Math.max(0.6, view.scale), 0, 7); ctx.fill();
  for (const q of px) { ctx.fillStyle = q.c; ctx.fillRect(p[0] + (q.x - DROID.cx) * s, p[1] + (q.y - DROID.cy) * s, s + 0.5, s + 0.5); }
}

// ── walk / cross / nexus ──
function moveDir(dx, dy) {
  const t = curThread(), nbrs = stepNbrs(state.gi, t); if (!nbrs.length) return;
  const here = cells[state.gi]; let best = -1, bs = 0.25;
  for (const nb of nbrs) { const c = cells[nb], vx = c.x - here.x, vy = c.y - here.y, L = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / L; if (s > bs) { bs = s; best = nb; } }
  if (best >= 0) { state.gi = best; afterMove(); }
}
function setWalk(dst) { const p = pathWithin(curThread(), state.gi, dst); if (p && p.length > 1) state.walk = { path: p, i: 0 }; }
function afterMove() { state.atNexus = rfOf(state.gi) < (m.flatR || 0.16) + 0.06; updateHUD(); }
function cross() {
  const t = curThread(), d = t.doorAt.get(state.gi); if (!d) return;
  state.trail.push(threadLabel(t)); rebuild(d.toKey, d.farGi);
}
function enterSibling(key) { const s = threads.get(key); if (!s) return; state.trail.push('✦' + threadLabel(curThread())); rebuild(key, s.nexusGi); }

// ── HUD ──
function updateHUD() {
  const t = curThread(), r = office.roomOf.get(state.gi), onSpine = office.spine.has(state.gi), atDoor = t.doorAt.get(state.gi);
  $('oname').textContent = threadLabel(t);
  $('okind').textContent = t.kind === 'white' ? 'white-collar ops thread · an office' : 'production thread · an engine works';
  $('oname').style.color = rgba(threadColor(t), 1);
  const where = atDoor ? `<span class="role">▶ a door</span><div class="sub">to ${threadLabel(threads.get(atDoor.toKey))} — press Enter to cross</div>`
    : onSpine ? `<span class="role">the hallway</span><div class="sub">the office spine · ${(rfOf(state.gi) * 100) | 0}% out from the nexus</div>`
    : r ? `<span class="role">${r.glyph} ${r.role}</span><div class="sub">a ${r.role} room${r.people ? ' · ' + r.people + ' resident' + (r.people > 1 ? 's' : '') : ''}</div>`
    : `<span class="role">chamber</span>`;
  $('now').innerHTML = where;
  // doors list (the other threads, sorted by distance out)
  const doors = [...t.doorAt.entries()].sort((a, b) => rfOf(a[0]) - rfOf(b[0]));
  $('doors').innerHTML = doors.map(([gi, d]) => { const other = threads.get(d.toKey), here = gi === state.gi; return `<div class="door ${here ? 'here' : ''}" data-gi="${gi}"><span class="sw" style="background:${rgba(threadColor(other), 1)}"></span><span class="lab">${here ? '▶ cross to ' : ''}${threadLabel(other)}</span><span class="rf">${(rfOf(gi) * 100) | 0}%</span></div>`; }).join('');
  for (const el of $('doors').querySelectorAll('.door')) el.addEventListener('click', () => setWalk(+el.dataset.gi));
  // siblings at the nexus
  const sibs = siblingsOf(t), showSib = state.atNexus;
  $('sibhdr').style.display = showSib ? '' : 'none';
  $('sibs').innerHTML = showSib ? sibs.map((s) => `<div class="door" data-sib="${s.key}"><span class="sw" style="background:${rgba(threadColor(s), 1)}"></span><span class="lab">✦ ${threadLabel(s)}</span></div>`).join('') : '';
  for (const el of $('sibs').querySelectorAll('.door')) el.addEventListener('click', () => enterSibling(el.dataset.sib));
  $('trail').innerHTML = state.trail.length ? 'trail: ' + state.trail.map((x) => `<b>${x}</b>`).join(' → ') + ` → <b>${threadLabel(t)}</b>` : '';
}

// ── input + loop ──
addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w') { moveDir(0, -1); e.preventDefault(); }
  else if (k === 'ArrowDown' || k === 's') { moveDir(0, 1); e.preventDefault(); }
  else if (k === 'ArrowLeft' || k === 'a') { moveDir(-1, 0); e.preventDefault(); }
  else if (k === 'ArrowRight' || k === 'd') { moveDir(1, 0); e.preventDefault(); }
  else if (k === 'Enter' || k === ' ') { if (curThread().doorAt.has(state.gi)) cross(); e.preventDefault(); }
});
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const wx = view.cx + (sx - CW / 2) / view.scale, wy = view.cy + (sy - CH / 2) / view.scale;
  const t = curThread(); let best = -1, bd = Infinity;
  for (const gi of t.cells) { const c = cells[gi], dd = (c.x - wx) ** 2 + (c.y - wy) ** 2; if (dd < bd) { bd = dd; best = gi; } }
  if (best >= 0) { if (t.doorAt.has(best) && best === state.gi) cross(); else setWalk(best); }
});
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (office) { fitThread(); } }
addEventListener('resize', resize);
let frameN = 0;
function loop() {
  frameN++;
  if (state.walk && frameN % 4 === 0) { state.walk.i++; if (state.walk.i < state.walk.path.length) { state.gi = state.walk.path[state.walk.i]; afterMove(); } else state.walk = null; }
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
resize();
rebuild('W0', threads.get('W0').nexusGi);
$('load').style.display = 'none';
loop();
