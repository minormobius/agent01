// floor-app.js — THE DEMO FLOOR. Drives the vendored hoop/v100 foam-and-rooms engine over the
// tessweave hex tessellation: each hex chunk is a district of Voronoi rooms + a concourse, chunks
// abut at seam ports, and the corners where three chunks meet are forced NEXUS mixing points (per
// "greedy corners, don't care about single-species threads — nexus points mix regardless"). Walk it
// first-person-lite with a follow camera; residents dwell in rooms, spider-droids haul the concourse.

import { solveChunk } from './v100/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, edgeFree, buildWalk } from './v100/manager.js';
import { buildPolyGenome, polyFrame, FAMILIES } from './sprites/poly.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
const W = 900, H = 600, CELL = 16, ROOM = 16;
let rings = 1, showNexus = true, showDroids = true, showGlyphs = true;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let world = null, walk = null, cellPath = null, nexusPts = null, portPts = null, droids = null;
const cam = { x: 0, y: 0, scale: 0.7, tx: 0, ty: 0 };
const player = { node: 0, x: 0, y: 0, path: [], t: 0 };
let anim = 0, needDraw = true;

// v100 palette
const BG = '#04050a', TISSUE = [10, 14, 18], ROAD = [18, 34, 44], TEAL = '#7fd8d0', GOLD = '#f4bf62', INK = '#dfe7e2';
const hexc = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const centroidOf = (poly) => { let x = 0, y = 0; for (const v of poly) { x += v.x; y += v.y; } return [x / poly.length, y / poly.length]; };
const ckey = (c) => `${Math.round(c[0] / 8)},${Math.round(c[1] / 8)}`;

// ── generate the floor: centre chunk, then expand `rings` of hex neighbours (frontier growth) ──
function genWorld() {
  const w = createWorld();
  const c0 = solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: CELL, roomSize: ROOM, concourseWidth: 2 });
  addChunk(w, c0);
  const seen = new Set([ckey(centroidOf(c0.poly))]);
  let frontier = [0];
  for (let r = 0; r < rings; r++) {
    const next = [];
    for (const cid of frontier) {
      const ch = w.chunks[cid];
      for (let e = 0; e < ch.poly.length; e++) {
        if (!edgeFree(w, ch, e)) continue;
        const spec = neighbourSpec(w, cid, e), cc = centroidOf(spec.poly), k = ckey(cc);
        if (seen.has(k)) continue; seen.add(k);
        const rec = solveChunk({ seed: (seed * 131 + w.chunks.length * 17) >>> 0, foamSeed: seed, v2: true, poly: spec.poly, inherit: spec.inherit, W, H, cellSize: CELL, roomSize: ROOM, concourseWidth: 2 });
        addChunk(w, rec); next.push(rec.id);
      }
    }
    frontier = next;
  }
  return w;
}

// precompute a Path2D per cell (world coords) + door/port/nexus geometry
function bake() {
  cellPath = [];
  for (const ch of world.chunks) {
    const cp = [];
    for (const c of ch.cells) { const p = new Path2D(); const poly = c.poly; p.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0], poly[i][1]); p.closePath(); cp.push(p); }
    cellPath.push(cp);
  }
  // seam ports (dedup) = the doorways between chunks
  const pm = new Map();
  for (const ch of world.chunks) for (const p of ch.ports) { if (p.cell == null || p.cell < 0) continue; pm.set(`${Math.round(p.x)},${Math.round(p.y)}`, [p.x, p.y]); }
  portPts = [...pm.values()];
  // nexus corners = hexagon vertices shared by ≥3 chunks
  const bucket = new Map();
  for (const ch of world.chunks) for (const v of ch.poly) { const key = `${Math.round(v.x / 5)},${Math.round(v.y / 5)}`; const b = bucket.get(key) || { x: v.x, y: v.y, n: 0 }; b.n++; bucket.set(key, b); }
  nexusPts = [...bucket.values()].filter((b) => b.n >= 3);
  // droids: a couple of logistics haulers per chunk, wandering the concourse
  droids = [];
  const G = buildPolyGenome('rind-logi', { ...FAMILIES.spiderbot, w: 22, h: 22 });
  for (const ch of world.chunks) {
    const road = []; for (let i = 0; i < ch.cells.length; i++) if (ch.road[i]) road.push(i);
    if (!road.length) continue;
    for (let k = 0; k < 2; k++) { const li = road[(ch.id * 7 + k * 131) % road.length]; droids.push({ chunk: ch.id, node: base(ch.id) + li, x: ch.cells[li].x, y: ch.cells[li].y, path: [], t: 0, ph: (ch.id + k) * 1.7, G }); }
  }
}
const base = (cid) => walk.base[cid];

// ── walk graph helpers ──
function nearestNode(wx, wy) { let bi = 0, bd = Infinity; for (let i = 0; i < walk.N; i++) { const dx = walk.pos[i * 2] - wx, dy = walk.pos[i * 2 + 1] - wy; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } } return bi; }
function bfs(from, to) {
  const prev = new Int32Array(walk.N).fill(-2); prev[from] = -1; const q = [from]; let h = 0;
  while (h < q.length) { const u = q[h++]; if (u === to) break; for (const v of walk.adj[u]) if (prev[v] === -2) { prev[v] = u; q.push(v); } }
  if (prev[to] === -2) return [];
  const path = []; let u = to; while (u !== -1) { path.push(u); u = prev[u]; } return path.reverse();
}
function stepDir(node, dx, dy) {
  let best = -1, bs = -Infinity; const px = walk.pos[node * 2], py = walk.pos[node * 2 + 1];
  for (const v of walk.adj[node]) { const vx = walk.pos[v * 2] - px, vy = walk.pos[v * 2 + 1] - py, L = Math.hypot(vx, vy) || 1; const s = (vx * dx + vy * dy) / L; if (s > bs) { bs = s; best = v; } }
  return bs > 0.25 ? best : -1;
}

// ── camera / transform ──
function worldFit() { // start scale so the player's chunk fills a good fraction
  cam.scale = Math.min(CW, CH) / 720;
  cam.x = player.x; cam.y = player.y; cam.tx = player.x; cam.ty = player.y;
}
const W2S = (x, y) => ({ X: CW / 2 + (x - cam.x) * cam.scale, Y: CH / 2 + (y - cam.y) * cam.scale });

// ── render ──
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, CW, CH);
  // world transform
  ctx.setTransform(DPR * cam.scale, 0, 0, DPR * cam.scale, DPR * (CW / 2 - cam.x * cam.scale), DPR * (CH / 2 - cam.y * cam.scale));

  const pChunk = walk.nodeChunk[player.node], pRoom = world.chunks[pChunk].roomOf[walk.nodeLocal[player.node]];
  // cells
  for (const ch of world.chunks) {
    const cp = cellPath[ch.id];
    for (let i = 0; i < ch.cells.length; i++) {
      let col;
      if (ch.road[i]) col = ROAD;
      else { const r = ch.roomOf[i]; if (r >= 0) { const rc = hexc(world.chunks[ch.id].rooms[r].color); const hot = (ch.id === pChunk && r === pRoom); col = mix(TISSUE, rc, hot ? 0.5 : 0.24); } else col = TISSUE; }
      ctx.fillStyle = rgb(col); ctx.fill(cp[i]);
    }
    // room cell hairlines (subtle)
    ctx.strokeStyle = 'rgba(120,150,150,0.05)'; ctx.lineWidth = 0.6 / cam.scale;
    for (let i = 0; i < ch.cells.length; i++) ctx.stroke(cp[i]);
  }
  // doors (gold gaps) + glyphs
  for (const ch of world.chunks) {
    for (const r of ch.rooms) {
      for (const [a, b] of (r.doorPairs || [])) {
        const ca = ch.cells[a], cb = ch.cells[b]; if (!ca || !cb) continue;
        ctx.strokeStyle = rgba(hexc(GOLD), 0.7); ctx.lineWidth = 2.2 / cam.scale; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ca.x, ca.y); ctx.lineTo(cb.x, cb.y); ctx.stroke();
      }
      if (showGlyphs && cam.scale > 0.5) { ctx.fillStyle = rgba(hexc(TEAL), 0.85); ctx.font = `${Math.max(8, 13 / cam.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.glyph || '·', r.x, r.y); }
    }
  }
  // seam ports = gold diamonds (doorways between chunks)
  for (const [x, y] of portPts) { const s = 5 / cam.scale; ctx.fillStyle = rgba(hexc(GOLD), 0.9); ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); }
  // nexus corners = gold rings (the mixing points)
  if (showNexus) for (const v of nexusPts) { const r = 8 / cam.scale; ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, 7); ctx.strokeStyle = rgba(hexc(GOLD), 0.85); ctx.lineWidth = 2 / cam.scale; ctx.stroke(); ctx.beginPath(); ctx.arc(v.x, v.y, r * 0.35, 0, 7); ctx.fillStyle = rgba(hexc(GOLD), 0.55); ctx.fill(); }
  // droids
  if (showDroids) for (const d of droids) drawDroid(d);
  // player
  drawPlayer();
}

function drawDroid(d) {
  const t = performance.now() / 1000 + d.ph;
  const px = polyFrame(d.G, t);
  const s = (d.G.pxUnit || 1.1) / cam.scale * 0.9;
  ctx.fillStyle = 'rgba(4,6,10,0.85)'; ctx.beginPath(); ctx.arc(d.x, d.y, 9 / cam.scale, 0, 7); ctx.fill();
  for (const p of px) { ctx.fillStyle = p.c; ctx.fillRect(d.x + (p.x - d.G.cx) * s, d.y + (p.y - d.G.cy) * s, s + 0.4, s + 0.4); }
}
function drawPlayer() {
  ctx.beginPath(); ctx.arc(player.x, player.y, 7 / cam.scale, 0, 7); ctx.fillStyle = rgba(hexc(TEAL), 0.22); ctx.fill();
  ctx.fillStyle = GOLD; ctx.font = `bold ${Math.max(11, 15 / cam.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', player.x, player.y);
}

// ── animation loop (runs while moving / camera settling) ──
function tick() {
  const spd = 190; // world units / s
  const dt = 1 / 60;
  let moving = false;
  // player follows its node path
  if (player.path.length) {
    const nx = player.path[0], tx = walk.pos[nx * 2], ty = walk.pos[nx * 2 + 1];
    const dx = tx - player.x, dy = ty - player.y, L = Math.hypot(dx, dy);
    if (L < 2) { player.x = tx; player.y = ty; player.node = nx; player.path.shift(); }
    else { player.x += dx / L * spd * dt; player.y += dy / L * spd * dt; }
    moving = true;
  }
  // droids wander
  if (showDroids) for (const d of droids) {
    if (!d.path.length) { const ch = world.chunks[d.chunk]; const road = []; for (let i = 0; i < ch.cells.length; i++) if (ch.road[i]) road.push(base(d.chunk) + i); if (road.length) d.path = bfs(d.node, road[(Math.floor(performance.now() / 900 + d.ph * 13)) % road.length]); }
    if (d.path.length) { const nx = d.path[0], tx = walk.pos[nx * 2], ty = walk.pos[nx * 2 + 1]; const dx = tx - d.x, dy = ty - d.y, L = Math.hypot(dx, dy); if (L < 2) { d.x = tx; d.y = ty; d.node = nx; d.path.shift(); } else { d.x += dx / L * 70 * dt; d.y += dy / L * 70 * dt; } moving = true; }
  }
  // camera lerps to player
  cam.x += (player.x - cam.x) * 0.12; cam.y += (player.y - cam.y) * 0.12;
  if (Math.abs(player.x - cam.x) > 0.5 || Math.abs(player.y - cam.y) > 0.5) moving = true;
  draw(); updateHere();
  if (moving || showDroids) anim = requestAnimationFrame(tick); else anim = 0;
}
function kick() { if (!anim) anim = requestAnimationFrame(tick); }

function updateHere() {
  const ch = world.chunks[walk.nodeChunk[player.node]], loc = walk.nodeLocal[player.node], r = ch.roomOf[loc];
  const room = r >= 0 ? ch.rooms[r] : null;
  $('here').innerHTML = ch.road[loc] || !room
    ? `<div class="role">the concourse</div><div class="sub">chunk ${ch.id} · seam network</div>`
    : `<div class="role">${room.glyph || ''} ${room.role}</div><div class="sub">chunk ${ch.id} · ${room.domain || ''}${room.people && room.people.length ? ' · ' + room.people.length + ' resident' + (room.people.length > 1 ? 's' : '') : ''}</div>`;
}

function cert() {
  let cells = 0, rooms = 0; for (const ch of world.chunks) { cells += ch.cells.length; rooms += ch.rooms.length; }
  const row = (k, v) => `<div class="row"><span>${k}</span><span class="v">${v}</span></div>`;
  $('cert').innerHTML = `<h4>the demo floor</h4>` +
    row('chunks (districts)', world.chunks.length) +
    row('rooms', rooms) + row('cells', cells) +
    row('seam doors', portPts.length) + row('nexus corners', nexusPts.length) +
    row('walk nodes', walk.N) +
    `<p>The v100 foam engine grows Voronoi rooms + a concourse in every hex district; districts abut at seam doors; the corners where three meet are the <b style="color:var(--gold)">nexus</b> mixing points. Walk it.</p>`;
}

// ── build + input ──
function build() {
  $('load').style.display = 'flex';
  requestAnimationFrame(() => {
    world = genWorld(); walk = buildWalk(world); bake();
    // start on a concourse cell near centre
    let start = 0; for (let i = 0; i < world.chunks[0].cells.length; i++) if (world.chunks[0].road[i]) { start = base(0) + i; break; }
    player.node = start; player.x = walk.pos[start * 2]; player.y = walk.pos[start * 2 + 1]; player.path = [];
    worldFit(); cert(); $('load').style.display = 'none'; needDraw = true; kick(); draw(); updateHere();
  });
}

function resize() { DPR = Math.min(2, devicePixelRatio || 1); const r = cv.getBoundingClientRect(); CW = r.width; CH = r.height; cv.width = CW * DPR; cv.height = CH * DPR; if (world) draw(); }
addEventListener('resize', resize);
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const wx = cam.x + (sx - CW / 2) / cam.scale, wy = cam.y + (sy - CH / 2) / cam.scale;
  const to = nearestNode(wx, wy); player.path = bfs(player.node, to).slice(1); kick();
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.scale = Math.max(0.28, Math.min(2.2, cam.scale * Math.exp(-e.deltaY * 0.0012))); draw(); }, { passive: false });
addEventListener('keydown', (e) => {
  const d = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
  if (!d) return; e.preventDefault();
  const nx = stepDir(player.node, d[0], d[1]); if (nx >= 0) { player.path = [nx]; kick(); }
});

const tog = (id, get, set) => $(id).addEventListener('click', () => { set(!get()); $(id).classList.toggle('on', get()); draw(); kick(); });
tog('nexus', () => showNexus, (v) => showNexus = v);
tog('droids', () => showDroids, (v) => showDroids = v);
tog('glyphs', () => showGlyphs, (v) => showGlyphs = v);
$('rings').addEventListener('click', () => { rings = rings >= 2 ? 1 : rings + 1; $('rings').textContent = rings === 1 ? '7 chunks' : '19 chunks'; build(); });
$('seedUp').addEventListener('click', () => { seed = (seed + 1) >>> 0; build(); });
$('seedDn').addEventListener('click', () => { seed = (seed - 1) >>> 0; build(); });

resize();
build();
