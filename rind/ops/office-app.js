// office-app.js — YOUR THREAD IS AN OFFICE · LINE-OF-SIGHT. The map is what you can SEE.
//
// The portal mechanic is gone. Threads are physical: each one a solid colour that persists and
// bends out; walls have REAL gaps at every door, and sight rays pass through them (the kernel's
// occlusion grid is rasterised from the same trimmed walls that are drawn), so the thread behind
// a door SPILLS INTO VIEW in its own hue — walk toward it and you see more; walk through and
// you're simply on it (crossing is a no-op: "which thread am I on" = who owns the chamber under
// your feet). What you leave fades out behind you — no memory, no minimap: remembering the map
// would tangle the levels, so the map forms and unforms around your sight. Sight is also
// stratum-local (a z-window): the other-parity threads pass above/below unseen, and surface
// exactly where the weave brings them to grade — the doors.
//
// The model is officeweave.js (kernel; node-tested). This file renders and drives it.

import { buildOfficeWorld, HALL, plazaRf } from './officeweave.js';
import { buildPolyGenome, polyFrame, FAMILIES } from './sprites/poly.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const INK = [232, 236, 244], GOLD = [244, 191, 98], TEAL = [127, 216, 208], DARK = [8, 11, 16];
const WALL = [30, 36, 46], DOOR_RGB = [150, 112, 58];

let world, m, cells, threads;
let cellPath = null, cellBox = null, subPath = null;
const state = { gi: -1, key: null, walk: null };
const view = { cx: 0, cy: 0, scale: 1 };
let camFollow = true, debug = false, showDistricts = false, zoom = 1.9;
let vis = null, npcsBy = null, DROID = null;

const keyOf = (gi) => world.walk.keyOf(gi);
const curThread = () => threads.get(state.key);
const threadColor = (t) => t.kind === 'white' ? mix(hex(m.warps[t.idx].color), INK, 0.28 + (t.idx % 2) * 0.12) : hex(m.wefts[t.idx].color);
const threadLabel = (t) => t.kind === 'white' ? `${m.warps[t.idx].id}` : `${m.wefts[t.idx].id}`;
const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;
const districtOf = (gi) => world.districts.of[gi];
const FOG_R = () => m.pitch * 12, Z_WIN = () => m.vpitch * 2.6;   // see your own level (walkable steps ≤ ~2.2 decks); the far stratum stays unseen

// ── render geometry: Path2D + bbox per tile from the kernel's floor map ──
function bakePaths() {
  cellPath = new Map(); cellBox = new Map(); subPath = new Path2D();
  for (const [gi, poly] of world.floorMap.polys) {
    if (poly.length < 3) continue;
    const p = new Path2D(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    poly.forEach((v, i) => { i ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1]); x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); });
    p.closePath(); cellPath.set(gi, p); cellBox.set(gi, [x0, y0, x1, y1]); subPath.addPath(p);
  }
}

// ── VISIBILITY: target = line-of-sight AND same stratum; value fades toward target (no memory) ──
function updateVis(frameN) {
  const me = cells[state.gi];
  if (frameN % 3 === 0) {
    const R = FOG_R(), R2 = R * R, zw = Z_WIN(), S = world.sight;
    const pR = plazaRf(m) * m.R, meIn = me.x * me.x + me.y * me.y < pR * pR, meKind = cells[state.gi].owner && cells[state.gi].owner.kind;
    for (const c of cells) {
      const d2 = (c.x - me.x) ** 2 + (c.y - me.y) ** 2;
      if (d2 >= R2) { vis.target[c.gi] = 0; continue; }
      // level test: your walkable z-band — except inside the plaza, where the LEVEL is your
      // KIND's whole concourse floor (the flat core is two clean stacked floors by intent)
      const cIn = c.x * c.x + c.y * c.y < pR * pR;
      const level = (meIn && cIn) ? (c.owner && c.owner.kind === meKind) : Math.abs(c.z - me.z) < zw;
      vis.target[c.gi] = (level && S.visible(me.x, me.y, c.x, c.y, me.z)) ? 1 : 0;
    }
    vis.target[state.gi] = 1;
  }
  const up = 0.22, down = 0.055;   // what you see appears fast; what you leave fades out behind you
  for (let i = 0; i < vis.v.length; i++) { const t = vis.target[i], v = vis.v[i]; vis.v[i] = t > v ? Math.min(t, v + up) : Math.max(t, v - down); }
}
const vOf = (gi) => camFollow ? vis.v[gi] : 1;   // the chunk camera is the dev god-lens (no fog)

// ── camera ──
function fitChunk() {
  const fp = m.footprint; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const v of fp) { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); }
  const pad = 56; view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
  view.scale = Math.min((CW - pad) / Math.max(1, x1 - x0), (CH - pad) / Math.max(1, y1 - y0));
}
const P = (x, y) => [CW / 2 + (x - view.cx) * view.scale, CH / 2 + (y - view.cy) * view.scale];
const worldT = () => ctx.setTransform(DPR * view.scale, 0, 0, DPR * view.scale, DPR * (CW / 2 - view.cx * view.scale), DPR * (CH / 2 - view.cy * view.scale));
const screenT = () => ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

// ── NPCs: one small crew per thread, persistent (they live there whether you look or not) ──
function ensureNPCs(key) {
  if (npcsBy.has(key)) return npcsBy.get(key);
  const t = threads.get(key), off = world.office(key), droid = t.kind === 'prod';
  if (!DROID) DROID = buildPolyGenome('rind-office', { ...FAMILIES.spiderbot, w: 20, h: 20 });
  const list = [];
  const roomCell = () => { const rs = off.rooms; if (!rs.length) { const a = [...t.cells]; return a[(Math.random() * a.length) | 0]; } const r = rs[(Math.random() * rs.length) | 0]; return r.cells[(Math.random() * r.cells.length) | 0]; };
  const n = Math.min(8, Math.max(4, (t.cells.size / 80) | 0));
  for (let i = 0; i < n; i++) { const gi = roomCell(); list.push({ gi, x: cells[gi].x, y: cells[gi].y, bx: cells[gi].x, by: cells[gi].y, sepx: 0, sepy: 0, path: [gi], seg: 0, prog: 0, dwell: (Math.random() * 300) | 0, droid, ph: i * 1.7, off, roomCell }); }
  npcsBy.set(key, list);
  return list;
}
function activeNPCs() {
  const me = cells[state.gi], R2 = (FOG_R() * 1.2) ** 2, out = [];
  for (const key of threads.keys()) {
    const t = threads.get(key);
    const nx = cells[t.nexusGi];   // cheap gate: thread near the player at all?
    let near = (nx.x - me.x) ** 2 + (nx.y - me.y) ** 2 < R2 * 9;
    if (!near) { for (const gi of [t.rim ?? t.nexusGi]) if ((cells[gi].x - me.x) ** 2 + (cells[gi].y - me.y) ** 2 < R2 * 9) near = true; }
    if (!near && key !== state.key) continue;
    out.push(...ensureNPCs(key));
  }
  return out;
}
function stepNPCs() {
  const agents = activeNPCs(), me = cells[state.gi], R2 = (FOG_R() * 1.3) ** 2;
  for (const nn of agents) {
    if ((nn.bx - me.x) ** 2 + (nn.by - me.y) ** 2 > R2) continue;   // far agents stay frozen
    if (nn.dwell > 0) { nn.dwell--; continue; }
    if (nn.seg >= nn.path.length - 1) {
      for (let k = 0; k < 6; k++) { const dst = nn.roomCell(); const p = nn.off.pathWithin(nn.gi, dst, true); if (p && p.length > 1) { nn.path = p; nn.seg = 0; nn.prog = 0; break; } }
      nn.dwell = 120 + ((Math.random() * 400) | 0); continue;
    }
    nn.prog += nn.droid ? 0.05 : 0.035; if (nn.prog >= 1) { nn.prog = 0; nn.seg++; nn.gi = nn.path[Math.min(nn.seg, nn.path.length - 1)]; }
    const a = cells[nn.path[nn.seg]], b = cells[nn.path[Math.min(nn.seg + 1, nn.path.length - 1)]];
    nn.bx = a.x + (b.x - a.x) * nn.prog; nn.by = a.y + (b.y - a.y) * nn.prog;
  }
  // v101 npc.js's boids separation, inlined: render point = base + clamped push, so residents
  // sharing a room spread instead of stacking and the nudge can't drift the walk.
  const sep = m.pitch * 0.55, sepMax = m.pitch * 0.3, sep2 = sep * sep;
  for (const a of agents) {
    let dx = 0, dy = 0;
    for (const o of agents) {
      if (o === a) continue;
      const ex = a.bx - o.bx, ey = a.by - o.by, d2 = ex * ex + ey * ey;
      if (d2 === 0) { dx += a.ph < o.ph ? 0.5 : -0.5; continue; }
      if (d2 >= sep2) continue;
      const d = Math.sqrt(d2), w = (sep - d) / sep; dx += (ex / d) * w; dy += (ey / d) * w;
    }
    const mag = Math.hypot(dx, dy);
    if (mag > 1e-6) { const s = Math.min(sepMax, mag * sep * 0.5) / mag; a.sepx = dx * s; a.sepy = dy * s; } else { a.sepx = 0; a.sepy = 0; }
    a.x = a.bx + a.sepx; a.y = a.by + a.sepy;
  }
  return agents;
}

// ── render ──
function render(agents) {
  screenT(); ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, CW, CH);
  const vx0 = view.cx - CW / 2 / view.scale, vy0 = view.cy - CH / 2 / view.scale, vx1 = view.cx + CW / 2 / view.scale, vy1 = view.cy + CH / 2 / view.scale;
  const inView = (gi) => { const b = cellBox.get(gi); return b && b[2] > vx0 && b[0] < vx1 && b[3] > vy0 && b[1] < vy1; };

  worldT();
  // the hex boundary + the void texture (the unknown is dark, but not empty)
  ctx.beginPath(); m.footprint.forEach((v, i) => i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath();
  ctx.fillStyle = 'rgba(9,12,17,0.6)'; ctx.fill();
  ctx.strokeStyle = rgba([120, 142, 172], 0.35); ctx.lineWidth = 1.6 / view.scale; ctx.stroke();
  ctx.strokeStyle = 'rgba(30,37,48,0.28)'; ctx.lineWidth = 1 / view.scale; ctx.stroke(subPath);
  if (showDistricts || !camFollow) {
    ctx.lineWidth = 1.4 / view.scale; ctx.setLineDash([8 / view.scale, 7 / view.scale]);
    world.districts.hexes.forEach((h, i) => {
      ctx.beginPath(); h.forEach((v, k) => k ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath();
      ctx.strokeStyle = rgba(mix(TEAL, [120, 142, 172], 0.55), i === districtOf(state.gi) ? 0.6 : 0.24); ctx.stroke();
    });
    ctx.setLineDash([]);
  }
  // FLOORS — every visible chamber in its OWNING THREAD'S solid hue (the thread persists and
  // bends out; the office structure shows as shading: hall darker, rooms lighter, light pools)
  for (const c of cells) {
    const v = vOf(c.gi);
    if (v <= 0.02 || !inView(c.gi)) continue;
    const p = cellPath.get(c.gi); if (!p) continue;
    const key = keyOf(c.gi); if (!key) continue;
    const t = threads.get(key), off = world.office(key), rid = off.roomOf.get(c.gi), lum = off.lum.get(c.gi) || 0;
    const hue = threadColor(t);
    const shade = rid === HALL ? 0.30 : 0.52 + (off.rooms[roomIdxOf(off, rid)] || { shade: 0 }).shade;
    const g = 0.34 + 0.66 * Math.min(1, lum);
    const base = mix(DARK, hue, shade);
    ctx.globalAlpha = Math.min(1, v);
    ctx.fillStyle = rgba([base[0] * g, base[1] * g, base[2] * g], 1);
    ctx.fill(p);
  }
  ctx.globalAlpha = 1;
  // WALLS — the trimmed pieces; alpha follows the brighter flank's visibility (fade with the map)
  ctx.lineCap = 'round'; ctx.lineWidth = m.pitch * 0.13;
  for (const s of world.walls) {
    const v = Math.max(vOf(s.a), s.b >= 0 ? vOf(s.b) : 0);
    if (v <= 0.03) continue;
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    if (mx < vx0 || mx > vx1 || my < vy0 || my > vy1) continue;
    const offA = keyOf(s.a) && world.office(keyOf(s.a)), lum = offA ? (offA.lum.get(s.a) || 0) : 0;
    ctx.strokeStyle = rgba(mix(WALL, INK, 0.07 + clamp(lum, 0, 1) * 0.24), 0.9 * v);
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  // DOOR THRESHOLDS — warm markers in the gaps (K-doors ringed gold: another thread beyond)
  for (const p of world.doorPts) {
    const v = Math.max(vOf(p.a), vOf(p.b));
    if (v <= 0.05) continue;
    const mx = p.x, my = p.y; if (mx < vx0 || mx > vx1 || my < vy0 || my > vy1) continue;
    ctx.globalAlpha = v;
    ctx.fillStyle = rgba(DOOR_RGB, 0.95); ctx.beginPath(); ctx.arc(p.x, p.y, m.pitch * 0.11, 0, 7); ctx.fill();
    if (p.kind === 'K') { ctx.strokeStyle = rgba(GOLD, 0.85); ctx.lineWidth = 1.6 / view.scale; ctx.beginPath(); ctx.arc(p.x, p.y, m.pitch * 0.19, 0, 7); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  // COMPONENTS + BOLLARDS — the light sources, seen only where you see the floor
  for (const key of threads.keys()) {
    const off = world.office(key);
    for (const r of off.rooms) {
      const v = vOf(r.compGi); if (v <= 0.15 || !inView(r.compGi)) continue;
      const c = cells[r.compGi], col = hex(r.color), rad = m.pitch * (r.grand ? 2.2 : 1.5);
      ctx.globalAlpha = v;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad);
      g.addColorStop(0, rgba(col, r.grand ? 0.32 : 0.2)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, m.pitch * (r.grand ? 0.30 : 0.22), 0, 7);
      ctx.fillStyle = rgba(mix(col, INK, 0.25), 0.95); ctx.fill();
      ctx.strokeStyle = rgba(GOLD, r.grand ? 0.9 : 0.45); ctx.lineWidth = 1.4 / view.scale; ctx.stroke();
    }
    for (const e of off.emitters) {
      if (e.kind !== 'bollard') continue;
      const v = vOf(e.gi); if (v <= 0.15 || !inView(e.gi)) continue;
      ctx.globalAlpha = v;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, m.pitch * 1.2);
      g.addColorStop(0, rgba(GOLD, 0.2)); g.addColorStop(1, rgba(GOLD, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, m.pitch * 1.2, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(GOLD, 0.85); ctx.beginPath(); ctx.arc(e.x, e.y, m.pitch * 0.07, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (debug && state.walk) { const pa = state.walk.path; ctx.beginPath(); for (let i = Math.max(0, state.walk.i); i < pa.length; i++) { const c = cells[pa[i]]; i === Math.max(0, state.walk.i) ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y); } ctx.strokeStyle = rgba([120, 224, 180], 0.9); ctx.lineWidth = 3; ctx.stroke(); }
  // NPCs — only the ones you can see
  for (const nn of agents) {
    const v = vOf(nn.gi); if (v <= 0.25 || !inView(nn.gi)) continue;
    ctx.globalAlpha = v;
    if (nn.droid) drawDroidAt(nn); else drawPerson(nn.x, nn.y, m.pitch * 0.26);
  }
  ctx.globalAlpha = 1;

  // ── screen space: room glyphs (lit rooms only), the player ──
  screenT();
  if (view.scale > 0.35) for (const key of threads.keys()) {
    const off = world.office(key);
    for (const r of off.rooms) {
      const v = vOf(r.compGi); if (v <= 0.3 || !inView(r.compGi)) continue;
      const p = P(r.cx, r.cy);
      ctx.globalAlpha = v;
      ctx.fillStyle = rgba(mix(hex(r.color), INK, 0.55), r.grand ? 0.85 : 0.5);
      ctx.font = `${Math.max(9, (r.grand ? 15 : 12) * view.scale) | 0}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.glyph, p[0], p[1]);
    }
  }
  ctx.globalAlpha = 1;
  const rad = Math.max(3, m.pitch * 0.3 * view.scale);
  const pp = P(cells[state.gi].x, cells[state.gi].y);
  ctx.beginPath(); ctx.arc(pp[0], pp[1], rad * 1.1, 0, 7); ctx.fillStyle = rgba(TEAL, 0.16); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = `bold ${Math.max(12, 17 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', pp[0], pp[1]);
}
const roomIdxCache = new Map();
function roomIdxOf(off, rid) { let i = roomIdxCache.get(off); if (!i) { i = new Map(off.rooms.map((r, k) => [r.id, k])); roomIdxCache.set(off, i); } return i.get(rid); }
function drawPerson(x, y, r) {
  const col = [206, 214, 222];
  ctx.fillStyle = 'rgba(4,6,10,0.55)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 0.5, r * 0.72, 0, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.ellipse(x, y + r * 0.25, r * 0.32, r * 0.55, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - r * 0.42, r * 0.3, 0, 7); ctx.fill();
}
function drawDroidAt(nn) {
  const t = performance.now() / 1000 + nn.ph, px = polyFrame(DROID, t), s = 0.9;
  ctx.fillStyle = 'rgba(4,6,10,0.75)'; ctx.beginPath(); ctx.arc(nn.x, nn.y, 8, 0, 7); ctx.fill();
  for (const q of px) { ctx.fillStyle = q.c; ctx.fillRect(nn.x + (q.x - DROID.cx) * s, nn.y + (q.y - DROID.cy) * s, s + 0.5, s + 0.5); }
}

// ── movement: crossing a door is just WALKING — the thread under your feet is the thread you're on ──
function arrive(gi) {
  if (gi === state.gi) return;
  state.gi = gi;
  const k = keyOf(gi);
  if (k && k !== state.key) { state.key = k; ensureNPCs(k); }
  updateHUD();
}
function moveDir(dx, dy) {
  const nbrs = world.walk.stepNbrs(state.gi); if (!nbrs.length) return;
  const here = cells[state.gi]; let best = -1, bs = 0.25;
  for (const nb of nbrs) { const c = cells[nb], vx = c.x - here.x, vy = c.y - here.y, L = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / L; if (s > bs) { bs = s; best = nb; } }
  if (best >= 0) { state.walk = null; arrive(best); }
}
function setWalk(dst) { const p = world.walk.pathBetween(state.gi, dst); if (p && p.length > 1) state.walk = { path: p, i: 0 }; }

// ── HUD ──
function updateHUD() {
  const t = curThread(), off = world.office(state.key), rid = off.roomOf.get(state.gi);
  const r = rid !== HALL ? off.rooms[roomIdxOf(off, rid)] : null;
  const dHere = districtOf(state.gi), inPlaza = rfOf(state.gi) < plazaRf(m);
  $('oname').textContent = threadLabel(t); $('oname').style.color = rgba(threadColor(t), 1);
  $('okind').textContent = t.kind === 'white' ? 'white-collar ops · an office (residents)' : 'production · an engine works (droids)';
  $('now').innerHTML = inPlaza && rid === HALL ? `<span class="role">✦ the plaza</span><div class="sub">the ${t.kind === 'white' ? 'six white threads' : 'eight engines'} share this floor — walk any of them · hex ${dHere + 1}/7</div>`
    : rid === HALL ? `<span class="role">the hallway</span><div class="sub">${(rfOf(state.gi) * 100) | 0}% out from the nexus · hex ${dHere + 1}/7</div>`
    : r ? `<span class="role">${r.glyph} ${r.role}${r.grand ? ' · the grand room' : ''}</span><div class="sub">${r.people ? r.people + ' resident' + (r.people > 1 ? 's' : '') : 'a work room'} · ${r.cells.length} chambers · hex ${dHere + 1}/7</div>`
    : `<span class="role">chamber</span><div class="sub">hex ${dHere + 1}/7</div>`;
  refreshSightList();
}
// the rail lists only the doors you can currently SEE — the map is your line of sight
function refreshSightList() {
  const seen = [];
  for (const p of world.doorPts) {
    if (p.kind !== 'K') continue;
    const v = Math.max(vis.v[p.a], vis.v[p.b]);
    if (v <= 0.22) continue;
    const other = threads.get(p.bKey === state.key ? p.aKey : p.bKey);   // the side that isn't you (or the far side)
    const me = cells[state.gi], d = Math.hypot(p.x - me.x, p.y - me.y);
    seen.push({ p, other, d, v });
  }
  seen.sort((a, b) => a.d - b.d);
  $('doors').innerHTML = seen.length
    ? seen.map(({ p, other, d }) => `<div class="door" data-a="${p.a}" data-b="${p.b}"><span class="sw" style="background:${rgba(threadColor(other), 1)}"></span><span class="lab">${threadLabel(other)}</span><span class="rf">${(d / m.pitch) | 0} rooms off</span></div>`).join('')
    : '<p style="margin:4px 0">no doors in sight — walk until one opens a view.</p>';
  for (const el of $('doors').querySelectorAll('.door')) el.addEventListener('click', () => { const a = +el.dataset.a, b = +el.dataset.b; setWalk(keyOf(a) === state.key ? b : a); });
}

// ── input + loop ──
addEventListener('keydown', (e) => {
  const k = e.key, d = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[k];
  if (d) { moveDir(d[0], d[1]); e.preventDefault(); }
});
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const wx = view.cx + (sx - CW / 2) / view.scale, wy = view.cy + (sy - CH / 2) / view.scale;
  let best = -1, bd = Infinity;   // you can only walk where you can SEE
  for (const c of cells) { if (vOf(c.gi) <= 0.25) continue; const dd = (c.x - wx) ** 2 + (c.y - wy) ** 2; if (dd < bd) { bd = dd; best = c.gi; } }
  if (best >= 0) setWalk(best);
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0012); if (camFollow) zoom = Math.max(0.25, Math.min(5, zoom * f)); else view.scale = Math.max(0.15, Math.min(5, view.scale * f)); }, { passive: false });
function setCam(follow) { camFollow = follow; $('cam').textContent = follow ? '⊕ follow' : '⬡ god'; $('cam').classList.toggle('on', follow); if (follow) { view.scale = zoom; const c = cells[state.gi]; view.cx = c.x; view.cy = c.y; } else fitChunk(); }
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (m && !camFollow) fitChunk(); }
addEventListener('resize', resize);
if ($('cam')) $('cam').addEventListener('click', () => setCam(!camFollow));
if ($('dbg')) $('dbg').addEventListener('click', () => { debug = !debug; $('dbg').classList.toggle('on', debug); });
if ($('dis')) $('dis').addEventListener('click', () => { showDistricts = !showDistricts; $('dis').classList.toggle('on', showDistricts); });
let frameN = 0;
function loop() {
  frameN++;
  if (state.walk && frameN % 4 === 0) { state.walk.i++; if (state.walk.i < state.walk.path.length) arrive(state.walk.path[state.walk.i]); else state.walk = null; }
  if (camFollow && state.gi >= 0) { view.scale = zoom; const c = cells[state.gi]; view.cx += (c.x - view.cx) * 0.2; view.cy += (c.y - view.cy) * 0.2; }
  updateVis(frameN);
  const agents = stepNPCs();
  render(agents);
  if (frameN % 30 === 0) refreshSightList();   // the in-sight rail tracks what you can see
  requestAnimationFrame(loop);
}

// ── boot (yield a frame so the loading card paints before the ~7 s weave build) ──
const seed = (new URLSearchParams(location.search).get('seed') | 0) >>> 0 || 7;
await new Promise((r) => setTimeout(r, 30));
world = buildOfficeWorld(seed);
m = world.m; cells = world.cells; threads = world.threads;
vis = { v: new Float32Array(cells.length), target: new Float32Array(cells.length) };
npcsBy = new Map();
bakePaths();
resize();
state.gi = world.spawnGi; state.key = keyOf(state.gi);
ensureNPCs(state.key);
updateHUD();
setCam(camFollow);
$('load').style.display = 'none';
loop();
