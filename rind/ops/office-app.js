// office-app.js — YOUR THREAD IS AN OFFICE, over the SEVEN-HEXAGON weave, painted v101.
// The model lives in officeweave.js (the kernel the selftest pins); this file only renders and
// drives it. The map is still only what's reachable from the thread you're on: your thread is a
// full walled office (hall + traffic-sized rooms + doors + pooled light); every other thread is
// a DOOR in your wall, with the neighbour's first chambers visible through it. Walk through and
// you're simply on the new thread. The weave now spans the aperture-7 flower — seven districts
// the HUD reads back as you cross them.

import { buildOfficeWorld, HALL } from './officeweave.js';
import { clipCell } from './v100/voronoi.js';
import { buildPolyGenome, polyFrame, FAMILIES } from './sprites/poly.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const INK = [232, 236, 244], GOLD = [244, 191, 98], TEAL = [127, 216, 208], DARK = [8, 11, 16];
const WALL = [30, 36, 46], DOOR_RGB = [120, 92, 50], HALL_RGB = [40, 62, 56];   // the v101 stone/threshold/concourse palette

let world, m, cells, threads, warpCol, prodCol, DROID = null;
let floorPoly = null, cellPath = null, cellBox = null, subPath = null, edgeNbr = null;
const state = { thread: null, gi: -1, atNexus: false, enteredAt: -1, trail: [], walk: null };
const view = { cx: 0, cy: 0, scale: 1 };
let camFollow = true, debug = false, showDistricts = true, zoom = 1.7;
let office = null, npcs = [], walls = null, peekPaths = null;

const armsOf = (kind) => [...threads.values()].filter((t) => t.kind === kind && !t.synthetic).sort((a, b) => a.idx - b.idx);
const siblingsOf = (t) => armsOf(t.kind).filter((s) => s !== t);
const curThread = () => threads.get(state.thread);
const threadColor = (t) => t.synthetic ? TEAL : (t.kind === 'white' ? warpCol(t.idx) : prodCol(t.idx));
const threadLabel = (t) => t.synthetic ? 'the nexus' : (t.kind === 'white' ? `${m.warps[t.idx].id}` : `${m.wefts[t.idx].id}`);
const rfOf = (gi) => Math.hypot(cells[gi].x, cells[gi].y) / m.R;
const districtOf = (gi) => world.districts.of[gi];

// ── floor tiles: 2D Voronoi per cell, cached as Path2D + bbox (drawn under one canvas transform).
// Every tile EDGE is attributed to the 2D neighbour whose bisector cut it (the edge midpoint is
// equidistant to both nuclei) — the walls are laid on this 2D map adjacency, because the 3D face
// adjacency the walk graph uses projects to INTERLEAVED tiles, not abutting ones (measured: only
// ~9% of 3D-adjacent pairs share a 2D tile edge). Doors are drawn as lit thresholds instead. ──
// clip a convex tile to the hexagon footprint so rim tiles don't fan out as giant wedges — the
// map gets a clean sealed hex boundary (a rim edge attributes to no neighbour ⇒ a perimeter wall)
function clipToHex(poly) {
  const fp = m.footprint;
  let out = poly;
  for (let i = 0; i < fp.length && out.length >= 3; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length], ex = b[0] - a[0], ey = b[1] - a[1];
    const sref = ex * (0 - a[1]) - ey * (0 - a[0]);   // the hex is centred on the origin
    const f = (p) => (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) * sref, np = [];
    for (let k = 0; k < out.length; k++) { const P0 = out[k], Q0 = out[(k + 1) % out.length], dp = f(P0), dq = f(Q0); if (dp >= -1e-9) np.push(P0); if ((dp >= -1e-9) !== (dq >= -1e-9)) { const t = dp / (dp - dq); np.push([P0[0] + (Q0[0] - P0[0]) * t, P0[1] + (Q0[1] - P0[1]) * t]); } }
    out = np;
  }
  return out.length >= 3 ? out : [];
}
function precomputeFloors() {
  floorPoly = new Map(); cellPath = new Map(); cellBox = new Map(); edgeNbr = new Map();
  const gs = m.pitch * 1.6, grid = new Map(), gk = (x, y) => `${Math.floor(x / gs)},${Math.floor(y / gs)}`;
  for (const c of cells) { const k = gk(c.x, c.y); let b = grid.get(k); if (!b) { b = []; grid.set(k, b); } b.push(c); }
  const R = m.pitch * 2.2, eps = m.pitch * 0.08;
  subPath = new Path2D();
  for (const c of cells) {
    const bx = Math.floor(c.x / gs), by = Math.floor(c.y / gs), near = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const b = grid.get(`${bx + dx},${by + dy}`); if (b) for (const o of b) if (o !== c) near.push(o); }
    const poly = clipToHex(clipCell({ x: c.x, y: c.y }, near, R));
    floorPoly.set(c.gi, poly);
    if (poly.length < 3) continue;
    const p = new Path2D(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    poly.forEach((v, i) => { i ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1]); x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); });
    p.closePath(); cellPath.set(c.gi, p); cellBox.set(c.gi, [x0, y0, x1, y1]); subPath.addPath(p);
    const edges = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 < 1) continue;   // degenerate sliver edge
      const mx2 = (a[0] + b[0]) / 2, my2 = (a[1] + b[1]) / 2, dc = Math.hypot(mx2 - c.x, my2 - c.y);
      let nb = -1, bd = eps;
      for (const o of near) { const d = Math.abs(Math.hypot(mx2 - o.x, my2 - o.y) - dc); if (d < bd) { bd = d; nb = o.gi; } }
      edges.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], nb });
    }
    edgeNbr.set(c.gi, edges);
  }
}

// ── rebuild on thread change: office from the kernel, walls + peek batches for the renderer ──
function rebuild(threadKey, gi) {
  state.thread = threadKey; state.gi = gi; state.walk = null;
  state.atNexus = curThread().synthetic || rfOf(gi) < (m.flatR || 0.16) + 0.06;
  const t = curThread();
  office = world.office(threadKey);
  // WALLS (the v101 read: walls are the default, doors are deliberately-placed gaps). An edge of
  // the 2D map is a wall when the regions on its two sides differ — room vs room, room vs hall,
  // or office vs the world outside. Each wall carries its bright side's lum for the rim-light.
  const regionOf = (x) => t.cells.has(x) ? office.roomOf.get(x) : 'out';
  walls = [];
  for (const gi0 of t.cells) {
    const za = regionOf(gi0), edges = edgeNbr.get(gi0);
    if (!edges) continue;
    for (const e of edges) {
      if (e.nb >= 0 && t.cells.has(e.nb) && e.nb < gi0) continue;   // draw each internal edge once
      const zb = e.nb < 0 ? 'rim' : regionOf(e.nb);
      if (za === zb) continue;
      const lum = Math.max(office.lum.get(gi0) || 0, (e.nb >= 0 && t.cells.has(e.nb) ? office.lum.get(e.nb) : 0) || 0);
      walls.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, kind: 0, lum });
    }
  }
  // door THRESHOLDS: the kernel's room doors (spanning-tree gaps) as warm lit bars at the pair's
  // midpoint — the 3D doorway surfaces on the 2D map as a threshold marker, not an edge gap.
  for (const d of office.doors) {
    const a = cells[d.a], b = cells[d.b];
    walls.push({ x1: (a.x + b.x) / 2, y1: (a.y + b.y) / 2, x2: 0, y2: 0, kind: 1, lum: 1 });
  }
  // peek tiles batched into one Path2D per neighbour thread (a fill per neighbour, not per cell)
  peekPaths = new Map();
  for (const p of office.peek) {
    if (t.cells.has(p.gi)) continue;
    const path = peekPaths.get(p.toKey) || peekPaths.set(p.toKey, new Path2D()).get(p.toKey);
    const cp = cellPath.get(p.gi); if (cp) path.addPath(cp);
  }
  spawnNPCs(); updateHUD();   // NB: no camera refit — crossing a door stays visually CONTINUOUS
}

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
function enterHub() { const hub = threads.get('HUB'); state.enteredAt = hub.nexusGi; state.trail.push('✦' + threadLabel(curThread())); if (state.trail.length > 8) state.trail.shift(); rebuild('HUB', hub.nexusGi); }

// ── NPCs: half-scale residents on white threads (v101: boids separation, room anchors), droids on production ──
function randRoomCell(rng) {
  const rooms = office.rooms;
  if (!rooms.length) { const a = [...curThread().cells]; return a[(rng() * a.length) | 0]; }
  const r = rooms[(rng() * rooms.length) | 0];
  return r.cells[(rng() * r.cells.length) | 0];
}
function spawnNPCs() {
  npcs = []; const t = curThread(), droidKind = t.kind === 'prod' && !t.synthetic;
  if (!DROID) DROID = buildPolyGenome('rind-office', { ...FAMILIES.spiderbot, w: 20, h: 20 });
  const n = Math.min(9, Math.max(4, (t.cells.size / 70) | 0));
  for (let i = 0; i < n; i++) {
    const gi = randRoomCell(Math.random);
    npcs.push({ gi, x: cells[gi].x, y: cells[gi].y, bx: cells[gi].x, by: cells[gi].y, sepx: 0, sepy: 0, path: [gi], seg: 0, prog: 0, dwell: (Math.random() * 300) | 0, droid: droidKind, ph: i * 1.7 });
  }
}
function retarget(nn) {
  for (let k = 0; k < 6; k++) {
    const dst = randRoomCell(Math.random);
    const p = office.pathWithin(nn.gi, dst, true);
    if (p && p.length > 1) { nn.path = p; nn.seg = 0; nn.prog = 0; return; }
  }
  nn.path = [nn.gi];
}
function updateNPCs() {
  for (const nn of npcs) {
    if (nn.dwell > 0) { nn.dwell--; continue; }
    if (nn.seg >= nn.path.length - 1) { retarget(nn); nn.dwell = 120 + ((Math.random() * 400) | 0); continue; }
    nn.prog += nn.droid ? 0.05 : 0.035; if (nn.prog >= 1) { nn.prog = 0; nn.seg++; nn.gi = nn.path[Math.min(nn.seg, nn.path.length - 1)]; }
    const a = cells[nn.path[nn.seg]], b = cells[nn.path[Math.min(nn.seg + 1, nn.path.length - 1)]];
    nn.bx = a.x + (b.x - a.x) * nn.prog; nn.by = a.y + (b.y - a.y) * nn.prog;
  }
  // v101 npc.js's boids SEPARATION, inlined: a clamped push apart so residents never stack —
  // the render point is base + push, so the nudge can't drift anyone off the walk graph.
  const sep = m.pitch * 0.55, sepMax = m.pitch * 0.3, sep2 = sep * sep;
  for (const a of npcs) {
    let dx = 0, dy = 0;
    for (const o of npcs) {
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
}

// ── render ──
function render() {
  screenT(); ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, CW, CH);
  const t = curThread(), TC = threadColor(t), isHub = !!t.synthetic;
  const vx0 = view.cx - CW / 2 / view.scale, vy0 = view.cy - CH / 2 / view.scale, vx1 = view.cx + CW / 2 / view.scale, vy1 = view.cy + CH / 2 / view.scale;
  const vis = (gi) => { const b = cellBox.get(gi); return b && b[2] > vx0 && b[0] < vx1 && b[3] > vy0 && b[1] < vy1; };

  worldT();
  // the aperture-7 chunk boundary
  ctx.beginPath(); m.footprint.forEach((v, i) => i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath();
  ctx.fillStyle = 'rgba(9,13,19,0.55)'; ctx.fill();
  ctx.strokeStyle = rgba([120, 142, 172], 0.55); ctx.lineWidth = 1.6 / view.scale; ctx.stroke();
  // SUBSTRATE — the whole foam in one batched fill, so there are no black gaps
  ctx.fillStyle = 'rgba(12,15,21,0.97)'; ctx.fill(subPath);
  ctx.strokeStyle = debug ? 'rgba(48,60,78,0.5)' : 'rgba(36,45,58,0.32)'; ctx.lineWidth = 1 / view.scale; ctx.stroke(subPath);
  // the SEVEN DISTRICTS — the child-hex flower the weave now spans
  if (showDistricts) {
    ctx.lineWidth = 1.4 / view.scale; ctx.setLineDash([8 / view.scale, 7 / view.scale]);
    world.districts.hexes.forEach((h, i) => {
      ctx.beginPath(); h.forEach((v, k) => k ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])); ctx.closePath();
      ctx.strokeStyle = rgba(mix(TEAL, [120, 142, 172], 0.55), i === districtOf(state.gi) ? 0.7 : 0.28); ctx.stroke();
    });
    ctx.setLineDash([]);
  }
  // the neighbours' first chambers through each door — batched per neighbour thread
  for (const [toKey, path] of peekPaths) {
    const col = threadColor(threads.get(toKey));
    ctx.fillStyle = rgba(mix(DARK, col, 0.5), 0.98); ctx.fill(path);
    ctx.strokeStyle = rgba(mix(col, INK, 0.2), 0.5); ctx.lineWidth = 1 / view.scale; ctx.stroke(path);
  }
  // YOUR office — v101 paint: role albedo × pooled light; the hall reads as warm concourse
  for (const gi of t.cells) {
    if (!vis(gi)) continue;
    const p = cellPath.get(gi); if (!p) continue;
    const rid = office.roomOf.get(gi), lum = office.lum.get(gi) || 0;
    let base;
    if (rid === HALL) base = mix(HALL_RGB, GOLD, clamp(lum * 0.3, 0, 0.35));
    else { const r = office.rooms[officeRoomIndex(rid)], role = hex(r.color); base = mix(mix(DARK, TC, 0.34), role, 0.42); base = mix(base, INK, r.shade); }
    const g = rid === HALL ? 0.5 + lum * 0.55 : 0.34 + lum * 0.66;
    ctx.fillStyle = rgba([base[0] * g, base[1] * g, base[2] * g], 1);
    ctx.fill(p);
  }
  // WALLS — dark stone rim-lit by the room light beside them; door THRESHOLDS are warm markers
  if (walls) {
    ctx.lineCap = 'round';
    for (const w of walls) {
      if (w.kind === 0) {
        ctx.strokeStyle = rgba(mix(WALL, INK, 0.07 + clamp(w.lum, 0, 1) * 0.24), 0.9);
        ctx.lineWidth = m.pitch * 0.13;
        ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
      } else {
        ctx.fillStyle = rgba(DOOR_RGB, 0.95);
        ctx.beginPath(); ctx.arc(w.x1, w.y1, m.pitch * 0.12, 0, 7); ctx.fill();
        ctx.strokeStyle = rgba(GOLD, 0.5); ctx.lineWidth = 1.2 / view.scale;
        ctx.beginPath(); ctx.arc(w.x1, w.y1, m.pitch * 0.17, 0, 7); ctx.stroke();
      }
    }
  }
  // self-emitting room COMPONENTS — the glow pool + the medallion (glyphs drawn later, in screen space)
  for (const r of office.rooms) {
    if (!vis(r.compGi)) continue;
    const c = cells[r.compGi], col = hex(r.color), rad = m.pitch * (r.grand ? 2.2 : 1.5);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad);
    g.addColorStop(0, rgba(col, r.grand ? 0.32 : 0.2)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(c.x, c.y, m.pitch * (r.grand ? 0.30 : 0.22), 0, 7);
    ctx.fillStyle = rgba(mix(col, INK, 0.25), 0.95); ctx.fill();
    ctx.strokeStyle = rgba(GOLD, r.grand ? 0.9 : 0.45); ctx.lineWidth = 1.4 / view.scale; ctx.stroke();
  }
  // BOLLARD lamps along the hall (v101's concourse lights)
  for (const e of office.emitters) {
    if (e.kind !== 'bollard' || !vis(e.gi)) continue;
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, m.pitch * 1.2);
    g.addColorStop(0, rgba(GOLD, 0.22)); g.addColorStop(1, rgba(GOLD, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, m.pitch * 1.2, 0, 7); ctx.fill();
    ctx.fillStyle = rgba(GOLD, 0.85); ctx.beginPath(); ctx.arc(e.x, e.y, m.pitch * 0.07, 0, 7); ctx.fill();
  }
  // debug: the hall spine + the live walk path
  if (debug) {
    if (office.spinePath && office.spinePath.length > 1) { ctx.beginPath(); office.spinePath.forEach((g, i) => { const c = cells[g]; i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y); }); ctx.strokeStyle = rgba(mix(TC, INK, 0.4), 0.55); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
    if (state.walk) { const pa = state.walk.path; ctx.beginPath(); for (let i = Math.max(0, state.walk.i); i < pa.length; i++) { const c = cells[pa[i]]; i === Math.max(0, state.walk.i) ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y); } ctx.strokeStyle = rgba([120, 224, 180], 0.95); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  // NPCs (world space; residents at v101 half scale)
  for (const nn of npcs) { if (nn.droid) drawDroidAt(nn); else drawPerson(nn.x, nn.y, m.pitch * 0.26); }

  // ── screen space: glyphs, door markers, nexus, player ──
  screenT();
  if (view.scale > 0.35) for (const r of office.rooms) {
    if (!vis(r.compGi)) continue;
    const p = P(r.cx, r.cy);
    ctx.fillStyle = rgba(mix(hex(r.color), INK, 0.55), r.grand ? 0.85 : 0.5);
    ctx.font = `${Math.max(9, (r.grand ? 15 : 12) * view.scale) | 0}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.glyph, p[0], p[1]);
  }
  for (const [gi, d] of t.doorAt) {
    const c = cells[gi], far = cells[d.farGi], p = P((c.x + far.x) / 2, (c.y + far.y) / 2), ncol = threadColor(threads.get(d.toKey));
    if (isHub) {
      const rr = Math.max(6, 9 * view.scale);
      ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, 7); ctx.fillStyle = rgba(ncol, 0.9); ctx.fill();
      ctx.beginPath(); ctx.arc(p[0], p[1], rr + 2, 0, 7); ctx.strokeStyle = rgba(GOLD, 0.9); ctx.lineWidth = 1.6; ctx.stroke();
      // fan each label out along ITS thread's spiral heading, so the six don't stack at the centre
      const other = threads.get(d.toKey), ang = m.aW ? m.aW(other.idx, (m.flatR || 0.16) + 0.05) : (other.idx / 6) * Math.PI * 2;
      const off = rr + 30;
      ctx.fillStyle = rgba(INK, 0.92); ctx.font = `${Math.max(10, 12 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(threadLabel(other), p[0] + Math.cos(ang) * off, p[1] + Math.sin(ang) * off);
    } else { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2.5, 3.5 * view.scale), 0, 7); ctx.fillStyle = rgba(mix(GOLD, ncol, 0.4), 0.85); ctx.fill(); }
  }
  const rad = Math.max(3, m.pitch * 0.3 * view.scale);
  const nx = P(cells[t.nexusGi].x, cells[t.nexusGi].y);
  ctx.beginPath(); ctx.arc(nx[0], nx[1], rad, 0, 7); ctx.strokeStyle = rgba(TEAL, 0.85); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = rgba(TEAL, 0.8); ctx.font = `${Math.max(9, 12 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', nx[0], nx[1]);
  const pp = P(cells[state.gi].x, cells[state.gi].y);
  ctx.beginPath(); ctx.arc(pp[0], pp[1], rad * 1.1, 0, 7); ctx.fillStyle = rgba(TEAL, 0.16); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = `bold ${Math.max(12, 17 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', pp[0], pp[1]);
}
const roomIdx = new Map();
function officeRoomIndex(rid) { let i = roomIdx.get(office); if (!i) { i = new Map(office.rooms.map((r, k) => [r.id, k])); roomIdx.set(office, i); } return i.get(rid); }
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

// ── movement: arrive() crosses ONLY on a deliberate step (a WASD nudge, or the FINAL cell of a walk) ──
function arrive(gi, allowCross) {
  if (gi === state.gi) return;
  state.gi = gi;
  if (gi !== state.enteredAt) state.enteredAt = -1;
  const d = curThread().doorAt.get(gi);
  if (allowCross && d && state.enteredAt === -1) { state.walk = null; crossThrough(d); return; }
  afterMove();
}
function crossThrough(d) { const t = curThread(); state.trail.push(threadLabel(t)); if (state.trail.length > 8) state.trail.shift(); state.enteredAt = d.farGi; rebuild(d.toKey, d.farGi); }
function afterMove() { state.atNexus = curThread().synthetic || rfOf(state.gi) < (m.flatR || 0.16) + 0.06; updateHUD(); }
function moveDir(dx, dy) {
  const nbrs = office.stepNbrs(state.gi); if (!nbrs.length) return;
  const here = cells[state.gi]; let best = -1, bs = 0.25;
  for (const nb of nbrs) { const c = cells[nb], vx = c.x - here.x, vy = c.y - here.y, L = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / L; if (s > bs) { bs = s; best = nb; } }
  if (best >= 0) arrive(best, true);
}
function setWalk(dst) { const p = office.pathWithin(state.gi, dst, true) || office.pathWithin(state.gi, dst, false); if (p && p.length > 1) state.walk = { path: p, i: 0 }; }
function enterSibling(key) { const s = threads.get(key); if (!s) return; state.trail.push('✦' + threadLabel(curThread())); state.enteredAt = s.nexusGi; rebuild(key, s.nexusGi); }

// ── HUD ──
function updateHUD() {
  const t = curThread(), isHub = !!t.synthetic, rid = office.roomOf.get(state.gi), atDoor = t.doorAt.get(state.gi);
  const r = rid !== HALL ? office.rooms[officeRoomIndex(rid)] : null;
  $('oname').textContent = isHub ? 'the nexus' : threadLabel(t); $('oname').style.color = rgba(threadColor(t), 1);
  $('okind').textContent = isHub ? 'six white threads start here — six portals' : (t.kind === 'white' ? 'white-collar ops · an office (residents)' : 'production · an engine works (droids)');
  const dHere = districtOf(state.gi);
  const where = atDoor ? `<span class="role">▶ into ${threadLabel(threads.get(atDoor.toKey))}</span><div class="sub">just walk through — you're already crossing</div>`
    : isHub ? `<span class="role">✦ the nexus</span><div class="sub">walk into one of the six threads</div>`
    : rid === HALL ? `<span class="role">the hallway</span><div class="sub">${(rfOf(state.gi) * 100) | 0}% out from the nexus · hex ${dHere + 1}/7</div>`
    : r ? `<span class="role">${r.glyph} ${r.role}${r.grand ? ' · the grand room' : ''}</span><div class="sub">${r.people ? r.people + ' resident' + (r.people > 1 ? 's' : '') : 'a work room'} · ${r.cells.length} chambers · hex ${dHere + 1}/7</div>`
    : `<span class="role">chamber</span><div class="sub">hex ${dHere + 1}/7</div>`;
  $('now').innerHTML = where;
  const doors = [...t.doorAt.entries()].sort((a, b) => rfOf(a[0]) - rfOf(b[0]));
  $('doors').innerHTML = doors.map(([gi, d]) => { const other = threads.get(d.toKey), here = gi === state.gi; return `<div class="door ${here ? 'here' : ''}" data-gi="${gi}"><span class="sw" style="background:${rgba(threadColor(other), 1)}"></span><span class="lab">${here ? '▶ ' : ''}${threadLabel(other)}</span><span class="rf">⬡${districtOf(gi) + 1} · ${(rfOf(gi) * 100) | 0}%</span></div>`; }).join('');
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
  for (const p of office.peek) { const c = cells[p.gi], dd = (c.x - wx) ** 2 + (c.y - wy) ** 2; if (dd < bd) { bd = dd; best = p.door; } }
  if (best >= 0) setWalk(best);
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0012); if (camFollow) zoom = Math.max(0.25, Math.min(5, zoom * f)); else view.scale = Math.max(0.15, Math.min(5, view.scale * f)); }, { passive: false });
function setCam(follow) { camFollow = follow; $('cam').textContent = follow ? '⊕ follow' : '⬡ chunk'; $('cam').classList.toggle('on', follow); if (follow) { view.scale = zoom; const c = cells[state.gi]; view.cx = c.x; view.cy = c.y; } else fitChunk(); }
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (m && !camFollow) fitChunk(); }
addEventListener('resize', resize);
if ($('cam')) $('cam').addEventListener('click', () => setCam(!camFollow));
if ($('dbg')) $('dbg').addEventListener('click', () => { debug = !debug; $('dbg').classList.toggle('on', debug); });
if ($('dis')) $('dis').addEventListener('click', () => { showDistricts = !showDistricts; $('dis').classList.toggle('on', showDistricts); });
let frameN = 0;
function loop() {
  frameN++;
  if (state.walk && frameN % 4 === 0) { state.walk.i++; if (state.walk.i < state.walk.path.length) { arrive(state.walk.path[state.walk.i], state.walk.i === state.walk.path.length - 1); } else state.walk = null; }
  if (camFollow && state.gi >= 0) { view.scale = zoom; const c = cells[state.gi]; view.cx += (c.x - view.cx) * 0.2; view.cy += (c.y - view.cy) * 0.2; }
  if (office) { updateNPCs(); render(); }
  requestAnimationFrame(loop);
}

// ── boot (yield a frame so the loading card paints before the ~6 s weave build) ──
const seed = (new URLSearchParams(location.search).get('seed') | 0) >>> 0 || 7;
await new Promise((r) => setTimeout(r, 30));
world = buildOfficeWorld(seed);      // seven hexagons: hexScale √7, the full certificate, probes: 0
m = world.m; cells = world.cells; threads = world.threads;
warpCol = (w) => mix(hex(m.warps[w].color), INK, 0.28 + (w % 2) * 0.12);
prodCol = (f) => hex(m.wefts[f].color);
precomputeFloors();
resize();
rebuild('HUB', threads.get('HUB').nexusGi);   // START at the nexus — six white threads, six portals
setCam(camFollow);
$('load').style.display = 'none';
loop();
