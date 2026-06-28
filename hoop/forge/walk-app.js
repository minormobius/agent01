// walk-app.js — WALK THE UPPER RIND. A playable proto: an @ strolls a forge region's production floor —
// the grown concourse + the facilities (machines + material in motion) + the lift up to the nave. Reuses
// the game's pathFind/nearestNode over a free-roam nav graph (floor.js#regionWalk), the same control model
// as the v099 game (click/tap to walk), plus WASD. Camera follows, zoomed in so you're IN it.

import { buildForgeRegion, regionWalk } from './floor.js';
import { ENGINES } from './engines.js';
import { ambientOf, materialOf, fixtureOf } from './fixtures.js';
import { drawCore, drawMachine, drawCarrier, ambientGlow } from './sprites.js';
import { pathFind, nearestNode } from '../v099/v8/manager.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
const COUNT = Q.has('n') ? Math.max(3, Math.min(19, Q.get('n') | 0)) : 7;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, Z = 2.4;
let reg = null, walk = null, player = -1, pp = { x: 0, y: 0 }, cam = { x: 0, y: 0 };
let route = [], rseg = 0, clock = 0;
const SPEED = 95;   // world units / sec
const keys = new Set();

const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function shadeMix(baseHex, accentHex, a) { const b = parseInt(baseHex.slice(1), 16), c = parseInt(accentHex.slice(1), 16), m = (s, t) => Math.round(s + (t - s) * a); return `rgb(${m((b >> 16) & 255, (c >> 16) & 255)},${m((b >> 8) & 255, (c >> 8) & 255)},${m(b & 255, c & 255)})`; }

const SX = (x) => (x - cam.x) * Z + CW / 2, SY = (y) => (y - cam.y) * Z + CH / 2;
const wX = (sx) => (sx - CW / 2) / Z + cam.x, wY = (sy) => (sy - CH / 2) / Z + cam.y;

function build() {
  reg = buildForgeRegion(seed, { count: COUNT, optimize: true });
  walk = regionWalk(reg);
  // start on a ROAD node near the fulfillment hub (the lift) — the natural arrival point
  const hub = reg.facilities.find((f) => f.navePort) || reg.facilities[0];
  player = nearestRoadNode(hub.x, hub.y);
  pp.x = walk.pos[2 * player]; pp.y = walk.pos[2 * player + 1]; cam.x = pp.x; cam.y = pp.y;
  route = []; whereAmI();
  const u = new URL(location); u.searchParams.set('seed', seed); u.searchParams.set('n', COUNT); history.replaceState(null, '', u);
}
// nearest node that is a carved-road cell (so you spawn on the concourse, not inside a machine)
function nearestRoadNode(x, y) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < walk.N; i++) { const ch = reg.recs[walk.nodeChunk[i]]; if (!ch.road[walk.nodeLocal[i]]) continue; const d = (walk.pos[2 * i] - x) ** 2 + (walk.pos[2 * i + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best >= 0 ? best : nearestNode(walk, x, y);
}

// the facility the player is standing in (the cell's room → its facility), or the nearest by distance.
function facilityAt() {
  const ch = reg.recs[walk.nodeChunk[player]], lc = walk.nodeLocal[player], rid = ch.roomOf[lc];
  if (rid >= 0 && ch.rooms[rid] && ch.rooms[rid].facility >= 0) { return globalFac(walk.nodeChunk[player], ch.rooms[rid].facility); }
  // on the concourse → nearest facility centroid
  let best = null, bd = Infinity; for (const f of reg.facilities) { const d = (f.x - pp.x) ** 2 + (f.y - pp.y) ** 2; if (d < bd) { bd = d; best = f; } }
  return best;
}
function globalFac(chunk, localFacId) { return reg.facilities.find((f) => f.chunk === chunk && reg.recs[chunk].facilities[localFacId] && f.engine === reg.recs[chunk].facilities[localFacId].engine && nearFac(f, chunk, localFacId)) || reg.facilities.find((f) => f.chunk === chunk); }
function nearFac(f, chunk, localFacId) { return true; }

function whereAmI() {
  const f = facilityAt(); if (!f) { $('where').innerHTML = 'the upper rind'; return; }
  const e = ENGINES[f.engine], mat = materialOf(f.engine), inRoom = (() => { const ch = reg.recs[walk.nodeChunk[player]], rid = ch.roomOf[walk.nodeLocal[player]]; return rid >= 0 && ch.rooms[rid] && ch.rooms[rid].facility >= 0; })();
  $('where').innerHTML =
    `<b style="color:${f.color}">${e.glyph} ${esc(e.label)}</b> <span class="note">· ${e.family}${f.navePort ? ' · the nave lift ⇅' : ''}</span><br>` +
    `<span class="note">${inRoom ? 'inside · ' : 'on the concourse near · '}${esc(e.note)}</span><br>` +
    `<span class="note">makes ${(e.output || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span><br>` +
    `<span class="note" style="color:${tint(f.color, 0.95)}">↻ ${esc(mat.label)}</span>` +
    (f.navePort ? `<br><span class="note" style="color:#cbd3e0">⇅ stand here — product rides up to the nave (~${reg.nave.pop} crew)</span>` : '');
}

// ── render ──
function render() {
  ctx.clearRect(0, 0, CW, CH);
  const vx0 = wX(-40), vy0 = wY(-40), vx1 = wX(CW + 40), vy1 = wY(CH + 40);   // viewport in world coords (cull)
  for (const ch of reg.recs) {
    const bb = ch.region; if (bb.x1 < vx0 || bb.x0 > vx1 || bb.y1 < vy0 || bb.y0 > vy1) continue;
    const facEng = ch.facilities.map((f) => f.engine), facCol = ch.facilities.map((f) => f.color);
    for (let i = 0; i < ch.cells.length; i++) {
      const c = ch.cells[i]; if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
      const poly = c.poly; if (poly.length < 3) continue;
      const rid = ch.roomOf[i]; let fill;
      if (ch.road[i]) fill = '#0c111b';
      else if (rid >= 0 && ch.rooms[rid] && ch.rooms[rid].facility >= 0) fill = shadeMix(ambientOf(facEng[ch.rooms[rid].facility]).floor, facCol[ch.rooms[rid].facility] || '#444', 0.18);
      else if (rid >= 0) fill = '#0e1219';
      else fill = '#08090d';
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
      if (!ch.road[i] && rid >= 0) { ctx.strokeStyle = 'rgba(4,7,11,.55)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    }
  }
  // ambient glow + fixtures + carriers per visible chunk
  for (const ch of reg.recs) {
    const bb = ch.region; if (bb.x1 < vx0 || bb.x0 > vx1 || bb.y1 < vy0 || bb.y0 > vy1) continue;
    for (const f of ch.facilities) { if (!f.rooms.length || f.core < 0) continue; const c = ch.rooms[f.core]; ambientGlow(ctx, SX(c.x), SY(c.y), Math.max(40, f.rooms.length ** 0.5 * Z * 4), ambientOf(f.engine).light); }
    for (const r of ch.rooms) {
      if (r.facility < 0) continue; const eng = ch.facilities[r.facility].engine, light = ambientOf(eng).light, rr = Math.max(8, Math.sqrt(r.cells.length) * Z * 0.9);
      if (r.isCore) drawCore(ctx, fixtureOf(eng, r.step), SX(r.x), SY(r.y), rr * 1.3, light, clock);
      else drawMachine(ctx, '', SX(r.x), SY(r.y), rr * 0.85, light);
    }
    for (const e of ch.flow) {
      const a = ch.rooms[e.from], b = ch.rooms[e.to]; if (!a || !b) continue;
      const mat = materialOf(e.engine), col = ambientOf(e.engine).light, cr = Math.max(2.4, Z * 1.7);
      for (let k = 0; k < 3; k++) { const ph = (clock * mat.speed * 0.5 + e.from * 0.13 + k / 3) % 1; drawCarrier(ctx, mat.shape, SX(a.x + (b.x - a.x) * ph), SY(a.y + (b.y - a.y) * ph), cr, col, mat.hot); }
    }
  }
  // the nave node + lift (above the region)
  const nv = reg.nave;
  for (const c of reg.conduits) if (c.nave) { ctx.strokeStyle = 'rgba(203,211,224,.85)'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(SX(c.ax), SY(c.ay)); ctx.lineTo(SX(c.bx), SY(c.by)); ctx.stroke(); const ph = (clock * 0.35) % 1; drawCarrier(ctx, 'crate', SX(c.bx + (c.ax - c.bx) * ph), SY(c.by + (c.ay - c.by) * ph), Math.max(2.4, Z * 1.9), '#cbd3e0', false); }
  ctx.fillStyle = 'rgba(203,211,224,.14)'; ctx.strokeStyle = 'rgba(203,211,224,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(SX(nv.x), SY(nv.y), 16, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cbd3e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '13px ui-monospace,monospace'; ctx.fillText('⌂', SX(nv.x), SY(nv.y));
  ctx.fillStyle = 'rgba(203,211,224,.85)'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText('the nave ↑', SX(nv.x), SY(nv.y) - 24);

  // the route ribbon (where you're walking)
  if (route.length > rseg) { ctx.strokeStyle = 'rgba(244,191,98,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(SX(pp.x), SY(pp.y)); for (let i = rseg; i < route.length; i++) ctx.lineTo(SX(walk.pos[2 * route[i]]), SY(walk.pos[2 * route[i] + 1])); ctx.stroke(); }

  // the player @
  const f = facilityAt(), pl = f ? ambientOf(f.engine).light : '#f4bf62';
  ambientGlow(ctx, SX(pp.x), SY(pp.y), 26, pl);
  ctx.fillStyle = '#0a0c10'; ctx.beginPath(); ctx.arc(SX(pp.x), SY(pp.y), 9, 0, 7); ctx.fill();
  ctx.strokeStyle = pl; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', SX(pp.x), SY(pp.y) + 0.5);

  // vignette
  const g = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.35, CW / 2, CH / 2, Math.max(CW, CH) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
}

// ── movement: click/tap to walk (pathFind), WASD/arrows nudge ──
function goTo(wx, wy) { const dst = nearestNode(walk, wx, wy); if (dst < 0) return; const p = pathFind(walk, player, dst); if (p && p.length > 1) { route = p; rseg = 1; } else if (dst !== player) { route = [player, dst]; rseg = 1; } }
cv.addEventListener('pointerdown', (e) => { const r = cv.getBoundingClientRect(); goTo(wX(e.clientX - r.left), wY(e.clientY - r.top)); });
addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if ('wasd'.includes(k) || k.startsWith('arrow')) { keys.add(k); e.preventDefault(); } });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function keyDir() { let dx = 0, dy = 0; if (keys.has('a') || keys.has('arrowleft')) dx -= 1; if (keys.has('d') || keys.has('arrowright')) dx += 1; if (keys.has('w') || keys.has('arrowup')) dy -= 1; if (keys.has('s') || keys.has('arrowdown')) dy += 1; return { dx, dy }; }

$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; build(); });
$('recenter').addEventListener('click', () => { const hub = reg.facilities.find((f) => f.navePort) || reg.facilities[0]; player = nearestRoadNode(hub.x, hub.y); pp.x = walk.pos[2 * player]; pp.y = walk.pos[2 * player + 1]; route = []; whereAmI(); });

// ── frame loop ──
let _last = 0, _whereT = 0;
function frame(ts) {
  const dt = _last ? Math.min(0.05, (ts - _last) / 1000) : 0; _last = ts; clock += dt;
  // keyboard: steer toward a point ahead in the held direction (re-pathed continuously)
  const { dx, dy } = keyDir();
  if (dx || dy) { const m = Math.hypot(dx, dy); goTo(pp.x + (dx / m) * 70, pp.y + (dy / m) * 70); }
  // advance along the route (consume as many segments as `step` covers this frame)
  let step = SPEED * dt;
  while (route.length > rseg && step > 0) {
    const tgt = route[rseg], tx = walk.pos[2 * tgt], ty = walk.pos[2 * tgt + 1];
    const ddx = tx - pp.x, ddy = ty - pp.y, d = Math.hypot(ddx, ddy);
    if (d <= step) { pp.x = tx; pp.y = ty; player = tgt; rseg++; step -= d; }
    else { pp.x += (ddx / d) * step; pp.y += (ddy / d) * step; step = 0; }
  }
  if (rseg >= route.length) route = [];
  // camera ease toward the player
  cam.x += (pp.x - cam.x) * Math.min(1, dt * 6); cam.y += (pp.y - cam.y) * Math.min(1, dt * 6);
  render();
  if (ts - _whereT > 250) { _whereT = ts; whereAmI(); }
  requestAnimationFrame(frame);
}

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
resize(); build(); requestAnimationFrame(frame);
