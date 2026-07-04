// pocket-app.js — WALK THE POCKET DIMENSION. Each thread is a nave-scale floor (pocketweave.js);
// this page paints it with the FULL v101 skin (the verbatim vendored skin.js#paintChunk — the thing
// the foam could never feed), fogs it with v100's own sightBall (vision flows down the concourse and
// through doors; walls block it), and walks it with the v100 walk graph. Doors are nave doors; a
// station door crosses to the reciprocal station of the other thread (fade out, fade in — the
// no-memory rule covers the seam). The analytic map remains the truth: office.html is the map layer.

import { buildPocketWorld, reciprocalDoor } from './pocketweave.js';
import { paintChunk } from './v101/skin.js';
import { drawWallFixture } from './v101/consoles.js';
import { drawDevice } from './v101/v5/deco.js';
import { drawWallLight } from './v101/v5/lights.js';
import { pathFind, nearestNode, sightBall } from './v100/manager.js';
import { buildGenome, frameRects, dirFromKey } from './sprites/core.js';
import { buildPolyGenome, polyFrame, FAMILIES } from './sprites/poly.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, fogCv = null;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], GOLD = [244, 191, 98], TEAL = [127, 216, 208];

let world, cur = null;                    // cur = the active pocket bundle
const pockets = new Map();                // key → { p, paint, bake, cellPath, vis, npcs }
const state = { key: null, node: -1, walk: null, fade: 0, pending: null };
const view = { cx: 0, cy: 0, scale: 1 };
let zoom = 1.15, DROID = null;
const SIGHT_HOPS = 20;   // restrictive — a room's worth of sight; the doors do the revealing

const threadColor = (key) => key === 'CW' ? TEAL : key === 'CP' ? [200, 150, 90] : key[0] === 'W' ? mix(hex(world.warps[+key.slice(1)].color), INK, 0.3) : hex(world.wefts[+key.slice(1)].color);

// ── enter/build a pocket: solve, paint with the FULL v101 skin, bake once, arm the fog ──
function ensure(key) {
  let b = pockets.get(key);
  if (b) return b;
  const p = world.pocket(key);
  const paint = paintChunk(p.rec, {});
  const scale = Math.min(2, 3400 / Math.max(p.W, p.H)), bake = document.createElement('canvas');
  bake.width = Math.ceil(p.W * scale); bake.height = Math.ceil(p.H * scale);
  const bc = bake.getContext('2d'); bc.scale(scale, scale);
  bc.fillStyle = '#04050a'; bc.fillRect(0, 0, p.W, p.H);
  for (const c of paint.paintCells) { bc.fillStyle = c.color; bc.beginPath(); c.poly.forEach((v, i) => i ? bc.lineTo(v[0], v[1]) : bc.moveTo(v[0], v[1])); bc.closePath(); bc.fill(); }
  const scene = { paintCells: paint.paintCells, wallSpacing: paint.wallSpacing, roomSpacing: paint.roomSpacing };
  for (const F of paint.fixtures) drawWallFixture(bc, scene, F, { accent: F.accent, hue: F.hue, litAt: () => 0.9 });
  for (const L of paint.lights) drawWallLight(bc, L, { hue: L.hue, lit: L.lit });
  for (const c of paint.comps) {
    drawDevice(bc, c.cx, c.cy, c.r, c.g, { lit: c.lit, accent: c.accent });
    bc.fillStyle = rgba(INK, 0.75); bc.font = '10px "JetBrains Mono", monospace'; bc.textAlign = 'center'; bc.textBaseline = 'middle';
    bc.fillText(c.glyph || '', c.cx, c.cy - c.r - 8);
  }
  const cellPath = p.rec.cells.map((c) => { const path = new Path2D(); c.poly.forEach((v, i) => i ? path.lineTo(v[0], v[1]) : path.moveTo(v[0], v[1])); path.closePath(); return path; });
  b = { key, p, paint, bake, scale, cellPath, vis: new Float32Array(p.walk.N), ball: new Set(), npcs: makeNPCs(key, p) };
  pockets.set(key, b);
  if (pockets.size > 7) for (const k of pockets.keys()) { if (k !== state.key && k !== key) { pockets.delete(k); break; } }
  return b;
}

// ── residents: sprite people commuting room↔room on the walk graph; droids on the engine floors ──
function makeNPCs(key, p) {
  const droid = key[0] === 'P';
  if (!DROID) DROID = buildPolyGenome('rind-pocket', { ...FAMILIES.spiderbot, w: 20, h: 20 });
  const rooms = p.rec.rooms.filter((r) => r.door >= 0 && r.cells.length);
  const out = [], n = Math.min(10, Math.max(4, (p.rec.cells.length / 260) | 0));
  for (let i = 0; i < n; i++) {
    const id = `pocket:${world.seed}:${key}#${i}`;
    const role = rooms.length ? rooms[(i * 7) % rooms.length].role : 'move';
    const home = rooms.length ? rooms[(i * 7) % rooms.length] : null;
    const node = home ? home.cells[0] : 0;
    out.push({ node, x: p.walk.pos[2 * node], y: p.walk.pos[2 * node + 1], path: null, seg: 0, prog: 0, dwell: (i * 97) % 300, dir: 'S', phase: 0, ph: i * 1.7, droid, rooms, genome: droid ? null : buildGenome(id, { role, size: 13 }) });
  }
  return out;
}
function stepNPCs(b) {
  const w = b.p.walk;
  for (const nn of b.npcs) {
    if (nn.dwell > 0) { nn.dwell--; continue; }
    if (!nn.path || nn.seg >= nn.path.length - 1) {
      const rs = nn.rooms;
      const dst = rs.length ? rs[(Math.random() * rs.length) | 0].cells[(Math.random() * 4) | 0] ?? rs[0].cells[0] : nn.node;
      nn.path = pathFind(w, nn.node, dst); nn.seg = 0; nn.prog = 0;
      nn.dwell = 200 + ((Math.random() * 700) | 0);
      if (!nn.path || nn.path.length < 2) { nn.path = null; continue; }
    }
    nn.prog += nn.droid ? 0.06 : 0.04;
    if (nn.prog >= 1) { nn.prog = 0; nn.seg++; nn.node = nn.path[Math.min(nn.seg, nn.path.length - 1)]; }
    const a = nn.path[nn.seg], c = nn.path[Math.min(nn.seg + 1, nn.path.length - 1)];
    const ax = w.pos[2 * a], ay = w.pos[2 * a + 1], bx = w.pos[2 * c], by = w.pos[2 * c + 1];
    nn.dir = dirKeyOf(bx - ax, by - ay); nn.phase += 0.16;
    nn.x = ax + (bx - ax) * nn.prog; nn.y = ay + (by - ay) * nn.prog;
  }
}
const DKEYS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const dirKeyOf = (dx, dy) => { if (!dx && !dy) return 'S'; let k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); k = ((k % 8) + 8) % 8; return DKEYS[k]; };

// ── the fog: v100's sightBall — vision flows the concourse and through doors, walls block ──
function refreshSight() { cur.ball = sightBall(cur.p.walk, state.node, SIGHT_HOPS); }
function fadeVis() {
  const v = cur.vis;
  for (let i = 0; i < v.length; i++) { const t = cur.ball.has(i) ? 1 : 0; v[i] = t > v[i] ? Math.min(t, v[i] + 0.2) : Math.max(t, v[i] - 0.06); }
}

// ── movement (the walk graph): WASD nudges, strict click-what-you-see, doors cross on arrival ──
function arrive(node) {
  if (node === state.node) return;
  state.node = node;
  const d = cur.p.doorAt.get(cur.p.walk.nodeLocal[node]);
  if (d) { crossThrough(d); return; }
  refreshSight(); updateHUD();
}
function crossThrough(d) {
  const r = reciprocalDoor(world, state.key, d);
  state.pending = { key: d.toKey, node: r ? r.node : 0 };
  state.walk = null;
}
function finishCross() {
  const { key, node } = state.pending; state.pending = null;
  cur = ensure(key); state.key = key; state.node = node;
  cur.vis.fill(0); refreshSight();
  const w = cur.p.walk; view.cx = w.pos[2 * node]; view.cy = w.pos[2 * node + 1];
  updateHUD();
}
function moveDir(dx, dy) {
  const w = cur.p.walk, here = [w.pos[2 * state.node], w.pos[2 * state.node + 1]];
  let best = -1, bs = 0.25;
  for (const nb of w.adj[state.node]) { const vx = w.pos[2 * nb] - here[0], vy = w.pos[2 * nb + 1] - here[1], L = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / L; if (s > bs) { bs = s; best = nb; } }
  if (best >= 0) { state.walk = null; arrive(best); }
}
function setWalk(dst) { const path = pathFind(cur.p.walk, state.node, dst); if (path && path.length > 1) state.walk = { path, i: 0 }; }

// ── render ──
const P = (x, y) => [CW / 2 + (x - view.cx) * view.scale, CH / 2 + (y - view.cy) * view.scale];
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, CW, CH);
  const w = cur.p.walk;
  ctx.setTransform(DPR * view.scale, 0, 0, DPR * view.scale, DPR * (CW / 2 - view.cx * view.scale), DPR * (CH / 2 - view.cy * view.scale));
  ctx.drawImage(cur.bake, 0, 0, cur.p.W, cur.p.H);
  // district arches — the seven hexes read along the strip
  ctx.setLineDash([10, 8]); ctx.lineWidth = 1.6 / view.scale;
  for (const a of cur.p.arches) { ctx.strokeStyle = rgba(TEAL, 0.4); ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke(); }
  ctx.setLineDash([]);
  // doors: THE PEEK — walking past, you look INTO the adjacent pocket through the doorway: a disc
  // of the neighbour's floor, aligned so its reciprocal door sits in the frame (walk in and you're
  // standing where you were looking). Ringed in the target thread's hue.
  for (const d of cur.p.doors) {
    const v = cur.vis[d.node]; if (v <= 0.05) continue;
    const x = w.pos[2 * d.node], y = w.pos[2 * d.node + 1], col = threadColor(d.toKey);
    const tb = pockets.get(d.toKey);
    if (tb && v > 0.2) {
      const r = reciprocalDoor(world, state.key, d);
      if (r) {
        const tw = tb.p.walk, tx = tw.pos[2 * r.node], ty = tw.pos[2 * r.node + 1];
        const pr = 64;
        ctx.save(); ctx.globalAlpha = Math.min(1, v) * 0.92;
        ctx.beginPath(); ctx.arc(x, y, pr, 0, 7); ctx.clip();
        ctx.translate(x - tx, y - ty);
        ctx.drawImage(tb.bake, 0, 0, tb.p.W, tb.p.H);
        ctx.restore();
        ctx.globalAlpha = Math.min(1, v);
        ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 3 / view.scale;
        ctx.beginPath(); ctx.arc(x, y, pr, 0, 7); ctx.stroke();
      }
    } else {
      ctx.globalAlpha = v;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fillStyle = rgba(mix([8, 11, 16], col, 0.55), 0.95); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, v);
    ctx.strokeStyle = rgba(GOLD, 0.9); ctx.lineWidth = 2 / view.scale; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // residents
  stepNPCs(cur);
  for (const nn of cur.npcs) {
    const v = cur.vis[nn.node]; if (v <= 0.25) continue;
    ctx.globalAlpha = v;
    if (nn.droid) { const t = performance.now() / 1000 + nn.ph, px = polyFrame(DROID, t); ctx.fillStyle = 'rgba(4,6,10,0.7)'; ctx.beginPath(); ctx.arc(nn.x, nn.y, 8, 0, 7); ctx.fill(); for (const q of px) { ctx.fillStyle = q.c; ctx.fillRect(nn.x + (q.x - DROID.cx) * 0.9, nn.y + (q.y - DROID.cy) * 0.9, 1.05, 1.05); } }
    else { const g = nn.genome, N = g.size, s = 16 * 0.9 / N, px = frameRects(g, dirFromKey(nn.dir), nn.phase); ctx.fillStyle = 'rgba(4,6,10,0.45)'; ctx.beginPath(); ctx.ellipse(nn.x, nn.y + N * s * 0.34, N * s * 0.3, N * s * 0.16, 0, 0, 7); ctx.fill(); for (const q of px) { ctx.fillStyle = q.c; ctx.fillRect(nn.x + (q.x - N / 2) * s, nn.y + (q.y - N / 2) * s, s + 0.12, s + 0.12); } }
  }
  ctx.globalAlpha = 1;
  // the fog (gap-free destination-out mask over walk-cell polys)
  const fc = fogCv.getContext('2d');
  fc.setTransform(DPR, 0, 0, DPR, 0, 0); fc.globalCompositeOperation = 'source-over';
  fc.clearRect(0, 0, CW, CH); fc.fillStyle = 'rgba(4,5,10,0.985)'; fc.fillRect(0, 0, CW, CH);
  fc.setTransform(DPR * view.scale, 0, 0, DPR * view.scale, DPR * (CW / 2 - view.cx * view.scale), DPR * (CH / 2 - view.cy * view.scale));
  fc.globalCompositeOperation = 'destination-out';
  const vx0 = view.cx - CW / 2 / view.scale, vx1 = view.cx + CW / 2 / view.scale, vy0 = view.cy - CH / 2 / view.scale, vy1 = view.cy + CH / 2 / view.scale;
  for (let i = 0; i < w.N; i++) {
    const v = cur.vis[i]; if (v <= 0.02) continue;
    const x = w.pos[2 * i], y = w.pos[2 * i + 1];
    if (x < vx0 - 20 || x > vx1 + 20 || y < vy0 - 20 || y > vy1 + 20) continue;
    fc.fillStyle = `rgba(0,0,0,${Math.min(1, v)})`; fc.fill(cur.cellPath[w.nodeLocal[i]]);
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(fogCv, 0, 0, CW, CH);
  // player
  const pp = P(w.pos[2 * state.node], w.pos[2 * state.node + 1]);
  ctx.beginPath(); ctx.arc(pp[0], pp[1], 14 * view.scale, 0, 7); ctx.fillStyle = rgba(TEAL, 0.16); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = `bold ${Math.max(13, 15 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', pp[0], pp[1]);
  // the crossing fade (the pocket seam, covered by the no-memory rule)
  if (state.pending || state.fade > 0) {
    state.fade = Math.min(1.2, state.fade + (state.pending ? 0.09 : -0.06));
    if (state.pending && state.fade >= 1) finishCross();
    if (state.fade > 0) { ctx.fillStyle = `rgba(2,3,6,${Math.min(1, state.fade)})`; ctx.fillRect(0, 0, CW, CH); }
  } else if (state.fade < 0) state.fade = 0;
}

// ── HUD ──
function updateHUD() {
  const p = cur.p, local = p.walk.nodeLocal[state.node], rid = p.rec.roomOf[local];
  const room = rid >= 0 ? p.rec.rooms[rid] : null;
  $('oname').textContent = world.label(state.key); $('oname').style.color = rgba(threadColor(state.key), 1);
  $('okind').textContent = state.key === 'CW' ? 'the commons — six white threads attach here' : state.key === 'CP' ? 'the works floor — eight engines attach here'
    : state.key[0] === 'W' ? 'white-collar ops · a pocket floor (walk it hub → rim)' : 'production · an engine floor (droids)';
  $('now').innerHTML = room ? `<span class="role">${room.glyph} ${room.role}</span><div class="sub">${room.people && room.people.length ? room.people.length + ' resident(s)' : 'a work room'}</div>`
    : `<span class="role">the concourse</span><div class="sub">stations ahead — each door is another thread</div>`;
  const seen = p.doors.filter((d) => cur.vis[d.node] > 0.2);
  $('doors').innerHTML = seen.length
    ? seen.map((d) => { const s = d.station; return `<div class="door" data-n="${d.node}"><span class="sw" style="background:${rgba(threadColor(d.toKey), 1)}"></span><span class="lab">${world.label(d.toKey)}</span><span class="rf">${s ? '⬡' + (s.district + 1) + (s.over ? ' · over' : ' · under') : 'hub'}</span></div>`; }).join('')
    : '<p style="margin:4px 0">no doors in sight — walk the concourse.</p>';
  for (const el of $('doors').querySelectorAll('.door')) el.addEventListener('click', () => setWalk(+el.dataset.n));
}

// ── input + loop ──
addEventListener('keydown', (e) => { const d = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[e.key]; if (d) { moveDir(d[0], d[1]); e.preventDefault(); } });
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), wx = view.cx + (e.clientX - r.left - CW / 2) / view.scale, wy = view.cy + (e.clientY - r.top - CH / 2) / view.scale;
  const w = cur.p.walk; let best = -1, bd = 26 * 26;
  for (let i = 0; i < w.N; i++) { if (cur.vis[i] <= 0.25) continue; const d = (w.pos[2 * i] - wx) ** 2 + (w.pos[2 * i + 1] - wy) ** 2; if (d < bd) { bd = d; best = i; } }
  if (best >= 0) setWalk(best);
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.4, Math.min(3, zoom * Math.exp(-e.deltaY * 0.0012))); }, { passive: false });
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (!fogCv) fogCv = document.createElement('canvas'); fogCv.width = cv.width; fogCv.height = cv.height; }
addEventListener('resize', resize);
let frameN = 0;
function loop() {
  frameN++;
  if (!state.pending && state.walk && frameN % 3 === 0) { state.walk.i++; if (state.walk.i < state.walk.path.length) arrive(state.walk.path[state.walk.i]); else state.walk = null; }
  const w = cur.p.walk;
  view.scale = zoom; view.cx += (w.pos[2 * state.node] - view.cx) * 0.18; view.cy += (w.pos[2 * state.node + 1] - view.cy) * 0.18;
  fadeVis();
  render();
  if (frameN % 30 === 0) updateHUD();
  if (frameN % 45 === 0 && !state.pending) {
    for (const d of cur.p.doors) if (cur.vis[d.node] > 0.2 && !pockets.has(d.toKey)) { ensure(d.toKey); break; }   // one neighbour per interval — the peek warms as you approach
  }
  requestAnimationFrame(loop);
}

// ── boot ──
const seed = (new URLSearchParams(location.search).get('seed') | 0) >>> 0 || 7;
await new Promise((r) => setTimeout(r, 30));
world = buildPocketWorld(seed);
cur = ensure('CW'); state.key = 'CW';
state.node = nearestNode(cur.p.walk, cur.p.W / 2, cur.p.H / 2);
resize();
refreshSight();
view.cx = cur.p.walk.pos[2 * state.node]; view.cy = cur.p.walk.pos[2 * state.node + 1]; view.scale = zoom;
updateHUD();
$('load').style.display = 'none';
loop();
