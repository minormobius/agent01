// pocket-app.js — WALK THE POCKET DIMENSION. Each thread is a nave-scale floor (pocketweave.js);
// this page paints it with the FULL v101 skin (the verbatim vendored skin.js#paintChunk — the thing
// the foam could never feed), fogs it with v100's own sightBall (vision flows down the concourse and
// through doors; walls block it), and walks it with the v100 walk graph. Doors are nave doors; a
// station door crosses to the reciprocal station of the other thread (fade out, fade in — the
// no-memory rule covers the seam). The analytic map remains the truth: office.html is the map layer.
//
// STREAMING: a thread is 2–5 CHUNK SEGMENTS (pocketweave cuts the spine; one foamSeed per thread
// keeps the voronoi continuous across seams). The page solves + bakes ONE segment at a time — the
// segment you enter through first, the rest as you linger — and a door PREVIEW warms only the
// single segment its reciprocal door sits in. The commons no longer swallows six whole bands.

import { buildPocketWorld, reciprocalDoor } from './pocketweave.js';
import { ENGINES, ENGINE_RING, supplyChain } from './engines.js';
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
const pockets = new Map();                // key → { p, bakes, cellPath, vis, ball, npcs }
const state = { key: null, node: -1, walk: null, fade: 0, pending: null, lastInput: 0 };
const view = { cx: 0, cy: 0, scale: 1 };
let zoom = 1.15, DROID = null;
const SIGHT_HOPS = 20;   // restrictive — a room's worth of sight; the doors do the revealing

const threadColor = (key) => key[0] === 'X' ? [222, 184, 116] : key === 'CW' ? TEAL : key === 'CP' ? [200, 150, 90] : key[0] === 'W' ? mix(hex(world.warps[+key.slice(1)].color), INK, 0.3) : hex(world.wefts[+key.slice(1)].color);
// each commodity wears its PRODUCER's colour (metal = foundry orange, coolant = fluid blue …)
const COMMODITY_COLOR = (() => {
  const m = { waste: '#8a8f98' };
  for (const id of ENGINE_RING) for (const c of (ENGINES[id].output || [])) m[c] = ENGINES[id].color;
  return m;
})();

// ── bundles: a pocket SHELL now, chunks on demand ──
function ensure(key) {
  let b = pockets.get(key);
  if (b) return b;
  b = { key, p: world.pocket(key), bakes: new Map(), cellPath: new Map(), vis: null, ball: new Set(), npcs: [] };
  pockets.set(key, b);
  if (pockets.size > 7) for (const k of pockets.keys()) { if (k !== state.key && k !== key) { pockets.delete(k); break; } }
  return b;
}
function sync(b) {
  const w = b.p.walk; if (!w) return;
  if (!b.vis || b.vis.length < w.N) { const nv = new Float32Array(w.N); if (b.vis) nv.set(b.vis); b.vis = nv; }
}
// solve + bake ONE segment of a pocket (the streaming unit)
function ensureSegB(b, si) {
  const g = b.p.ensureSeg(si);
  sync(b);
  if (!b.bakes.has(g.chunkId)) bakeChunkOf(b, g.chunkId);
  if (b === cur) refreshSight();
  return g;
}
// which segment of the target does this door's preview need?
function needSeg(tp, d) {
  if (d.station && (d.toKey[0] === 'W' || d.toKey[0] === 'P')) return tp.segOf(d.station);
  return 0;   // interfaces, commons, hub ends: segment 0
}
// the reciprocal door WITHOUT solving anything — null until the target segment exists
function findRecip(tp, d) {
  if (d.toKey[0] === 'X') return tp.doors.find((x) => x.toKey === state.key) || null;
  if (d.station) return tp.doors.find((x) => x.station && x.station.w === d.station.w && x.station.f === d.station.f) || null;
  if (state.key === 'CW' || state.key === 'CP') return tp.doors.find((x) => !x.station) || null;
  return tp.doors.find((x) => x.toKey === state.key) || null;
}

// ── bake one chunk with the FULL v101 skin: retile, fixtures, sconces, deco components ──
function bakeChunkOf(b, chunkId) {
  if (b.bakes.has(chunkId)) return;
  const rec = b.p.world.chunks[chunkId];
  const paint = paintChunk(rec, {});
  const m = 44, x0 = rec.region.x0 - m, y0 = rec.region.y0 - m;
  const bw = rec.region.x1 - rec.region.x0 + 2 * m, bh = rec.region.y1 - rec.region.y0 + 2 * m;
  const scale = Math.min(2, 3400 / Math.max(bw, bh));
  const bake = document.createElement('canvas');
  bake.width = Math.ceil(bw * scale); bake.height = Math.ceil(bh * scale);
  const bc = bake.getContext('2d'); bc.scale(scale, scale); bc.translate(-x0, -y0);
  for (const c of paint.paintCells) { bc.fillStyle = c.color; bc.beginPath(); c.poly.forEach((v, i) => i ? bc.lineTo(v[0], v[1]) : bc.moveTo(v[0], v[1])); bc.closePath(); bc.fill(); }
  // TIER 2 — the polished obsidian ledger. Concourse tiles are lacquered near-black; the baked
  // light ghosts through the polish as reflections; a few tiles carry a glassy sheen; and sparse
  // tally rows are etched in — the ledger of breath, misread by outsiders as grain yields. On the
  // eight engine floors the ROOM tiles take the engine's own hue: the production vertical, colour-coded.
  const engineFloor = b.key[0] === 'P';
  const tintC = threadColor(b.key);
  for (let i = 0; i < rec.cells.length; i++) {
    const c = rec.cells[i];
    const trace = () => { bc.beginPath(); c.poly.forEach((v, j) => j ? bc.lineTo(v[0], v[1]) : bc.moveTo(v[0], v[1])); bc.closePath(); };
    if (rec.road[i]) {
      trace(); bc.fillStyle = 'rgba(5,6,11,0.62)'; bc.fill();
      const h = (Math.imul(i + 1, 2654435761) >>> 0) % 1000;
      if (h < 150) { trace(); bc.fillStyle = 'rgba(165,185,230,0.055)'; bc.fill(); }   // the polish catches a light
      if (h >= 945) {                                                                   // the etched tallies
        bc.fillStyle = 'rgba(205,220,240,0.11)'; bc.font = '5px "JetBrains Mono", monospace'; bc.textAlign = 'center'; bc.textBaseline = 'middle';
        bc.fillText('||| |', c.x, c.y);
      }
    } else if (engineFloor && rec.roomOf[i] >= 0) {
      trace(); bc.fillStyle = rgba(tintC, 0.13); bc.fill();
    }
  }
  const scene = { paintCells: paint.paintCells, wallSpacing: paint.wallSpacing, roomSpacing: paint.roomSpacing };
  for (const F of paint.fixtures) drawWallFixture(bc, scene, F, { accent: F.accent, hue: F.hue, litAt: () => 0.9 });
  for (const L of paint.lights) drawWallLight(bc, L, { hue: L.hue, lit: L.lit });
  for (const c of paint.comps) {
    drawDevice(bc, c.cx, c.cy, c.r, c.g, { lit: c.lit, accent: c.accent });
    bc.fillStyle = rgba(INK, 0.75); bc.font = '10px "JetBrains Mono", monospace'; bc.textAlign = 'center'; bc.textBaseline = 'middle';
    bc.fillText(c.glyph || '', c.cx, c.cy - c.r - 8);
  }
  b.bakes.set(chunkId, { cv: bake, x0, y0, w: bw, h: bh });
  b.cellPath.set(chunkId, rec.cells.map((c) => { const path = new Path2D(); c.poly.forEach((v, i) => i ? path.lineTo(v[0], v[1]) : path.moveTo(v[0], v[1])); path.closePath(); return path; }));
  const base = b.p.walk.base[chunkId];
  for (const r of rec.rooms) if (r.nexus) b.nexus = { x: r.x, y: r.y, node: base + (r.door >= 0 ? r.door : r.cells[0]) };
  addNPCsForChunk(b, chunkId);
}

// ── residents: sprite people commuting room↔room on the walk graph; droids on the engine floors ──
function addNPCsForChunk(b, chunkId) {
  const rec = b.p.world.chunks[chunkId], base = b.p.walk.base[chunkId];
  const droid = b.key[0] === 'P' || b.key === 'CP';
  if (!DROID) DROID = buildPolyGenome('rind-pocket', { ...FAMILIES.spiderbot, w: 20, h: 20 });
  const rooms = rec.rooms.filter((r) => r.door >= 0 && r.cells.length).map((r) => ({ role: r.role, cells: r.cells.map((c) => base + c) }));
  if (!rooms.length) return;
  const w = b.p.walk, n = Math.min(6, Math.max(2, (rec.cells.length / 300) | 0));
  for (let i = 0; i < n; i++) {
    const id = `pocket:${world.seed}:${b.key}:${chunkId}#${i}`;
    const home = rooms[(i * 7) % rooms.length];
    const node = home.cells[0];
    b.npcs.push({ node, x: w.pos[2 * node], y: w.pos[2 * node + 1], path: null, seg: 0, prog: 0, dwell: (i * 97) % 300, dir: 'S', phase: 0, ph: i * 1.7, droid, rooms, genome: droid ? null : buildGenome(id, { role: home.role, size: 13 }) });
  }
}
// THE PHYSICAL COMMODITY TRANSFER (the forge's supply-chain model, walked). On an ENGINE floor a
// droid alternates trips: intake arrives at the hub door and is shelved in a store room; output
// leaves the make rooms for the hub — the chain, embodied. On the WORKS floor droids walk the
// derived inter-engine supply chain door → door — and FULFILLMENT IS THE NEXUS: product flows into
// the progression chamber, waste flows out of it to reclaim. Each commodity wears its producer's colour.
function nextHaul(b, nn) {
  if (b.key === 'CP') {
    if (!b.chain) {
      const doorOf = {};
      for (const d of b.p.doors) if (d.toKey[0] === 'P') { const eng = world.wefts[+d.toKey.slice(1)]; if (eng) doorOf[eng.id] = d.node; }
      if (b.nexus) doorOf.fulfillment = b.nexus.node;
      b.chain = supplyChain().map((e) => ({ from: doorOf[e.from], to: doorOf[e.to], commodity: e.commodity }))
        .filter((e) => e.from != null && e.to != null);
    }
    if (!b.chain.length) return null;
    const e = b.chain[(Math.random() * b.chain.length) | 0];
    return [{ to: e.from, carry: null }, { to: e.to, carry: COMMODITY_COLOR[e.commodity] || '#9aa3b2' }];
  }
  const eng = world.wefts[+b.key.slice(1)]; if (!eng) return null;
  const hub = b.p.hubDoor >= 0 ? b.p.hubDoor : (b.p.doors[0] ? b.p.doors[0].node : -1);
  if (hub < 0) return null;
  const pick = (roles) => { const rs = nn.rooms.filter((r) => roles.includes(r.role)); const use = rs.length ? rs : nn.rooms; const r = use[(Math.random() * use.length) | 0]; return r.cells[(Math.random() * r.cells.length) | 0]; };
  nn.trip = (nn.trip || 0) + 1;
  const goods = (nn.trip % 2 ? eng.intake : eng.output) || [];
  const carry = COMMODITY_COLOR[goods[(Math.random() * Math.max(1, goods.length)) | 0]] || '#9aa3b2';
  return nn.trip % 2
    ? [{ to: hub, carry: null }, { to: pick(['store', 'make']), carry }]      // intake: hub → shelves
    : [{ to: pick(['make', 'store']), carry: null }, { to: hub, carry }];     // output: works → the chain
}
function stepNPCs(b) {
  const w = b.p.walk;
  for (const nn of b.npcs) {
    if (nn.dwell > 0) { nn.dwell--; continue; }
    if (!nn.path || nn.seg >= nn.path.length - 1) {
      if (nn.droid) {
        if (nn.path && nn.legs && nn.legs.length) {   // a completed walk retires its leg (the hand-off dwell)
          nn.legs.shift(); nn.carry = null; nn.path = null; nn.dwell = 60 + ((Math.random() * 90) | 0); continue;
        }
        if (!nn.legs || !nn.legs.length) nn.legs = nextHaul(b, nn);
        if (!nn.legs || !nn.legs.length) { nn.dwell = 240; continue; }
        const leg = nn.legs[0]; nn.carry = leg.carry;
        nn.path = pathFind(w, nn.node, leg.to); nn.seg = 0; nn.prog = 0;
        if (!nn.path || nn.path.length < 2) { nn.path = null; nn.legs.shift(); nn.carry = null; nn.dwell = 60; continue; }
      } else {
        const rs = nn.rooms;
        const dst = rs.length ? rs[(Math.random() * rs.length) | 0].cells[(Math.random() * 4) | 0] ?? rs[0].cells[0] : nn.node;
        nn.path = pathFind(w, nn.node, dst); nn.seg = 0; nn.prog = 0;
        nn.dwell = 200 + ((Math.random() * 700) | 0);
        if (!nn.path || nn.path.length < 2) { nn.path = null; continue; }
      }
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
function refreshSight() { if (state.node < 0) return; cur.ball = sightBall(cur.p.walk, state.node, SIGHT_HOPS); }
function fadeVis() {
  const v = cur.vis; if (!v) return;
  for (let i = 0; i < v.length; i++) { const t = cur.ball.has(i) ? 1 : 0; v[i] = t > v[i] ? Math.min(t, v[i] + 0.2) : Math.max(t, v[i] - 0.06); }
}

// ── movement (the walk graph): WASD nudges, strict click-what-you-see, doors cross on arrival ──
function arrive(node) {
  if (node === state.node) return;
  state.node = node;
  const d = cur.p.doorAt.get(node);
  if (d) { crossThrough(d); return; }
  refreshSight(); updateHUD();
}
function crossThrough(d) {
  const r = reciprocalDoor(world, state.key, d);   // lazily solves EXACTLY the segment we land in
  const quick = d.toKey[0] === 'X' || state.key[0] === 'X';   // foyer hops barely blink — it was already in view
  state.pending = { key: d.toKey, node: r ? r.node : 0, cap: quick ? 0.5 : 1 };
  state.walk = null;
}
function finishCross() {
  const { key, node } = state.pending; state.pending = null;
  cur = ensure(key); state.key = key;
  sync(cur);
  const cid = cur.p.walk.nodeChunk[node];
  if (!cur.bakes.has(cid)) bakeChunkOf(cur, cid);
  state.node = node;
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
  // the space BEYOND each door, drawn first — our own floor then covers it everywhere but the gap.
  // Alignment: our door == their door; every baked segment of the target draws at that offset.
  for (const d of cur.p.doors) {
    const v = cur.vis[d.node]; if (v <= 0.15) continue;
    const tb = pockets.get(d.toKey); if (!tb || !tb.p.walk || !tb.bakes.size) continue;
    const r = findRecip(tb.p, d); if (!r) continue;
    const x = w.pos[2 * d.node], y = w.pos[2 * d.node + 1];
    const tw = tb.p.walk, ox = x - tw.pos[2 * r.node], oy = y - tw.pos[2 * r.node + 1];
    const S = d.toKey[0] === 'X' ? 210 : 150;
    ctx.save(); ctx.globalAlpha = Math.min(1, v) * 0.92;
    ctx.beginPath(); ctx.arc(x, y, S * 0.95, 0, 7); ctx.clip();
    for (const bk of tb.bakes.values()) ctx.drawImage(bk.cv, bk.x0 + ox, bk.y0 + oy, bk.w, bk.h);
    ctx.restore();
    d._peek = { x, y, S, v };
  }
  for (const bk of cur.bakes.values()) ctx.drawImage(bk.cv, bk.x0, bk.y0, bk.w, bk.h);
  // district arches — the seven hexes read along the strip
  ctx.setLineDash([10, 8]); ctx.lineWidth = 1.6 / view.scale;
  for (const a of cur.p.arches) { ctx.strokeStyle = rgba(TEAL, 0.4); ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke(); }
  ctx.setLineDash([]);
  // THE NEXUS — the works floor's progression chamber: a slow gold pulse over the gilded room
  if (cur.nexus) {
    const v = cur.vis[cur.nexus.node] || 0;
    if (v > 0.1) {
      const pulse = 0.5 + 0.5 * Math.sin(frameN * 0.06);
      ctx.globalAlpha = v * (0.3 + 0.3 * pulse);
      ctx.strokeStyle = rgba(GOLD, 1); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cur.nexus.x, cur.nexus.y, 26 + pulse * 6, 0, 7); ctx.stroke();
      ctx.globalAlpha = Math.min(0.9, v);
      ctx.fillStyle = rgba(GOLD, 1); ctx.font = '13px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('◈', cur.nexus.x, cur.nexus.y);
      ctx.globalAlpha = 1;
    }
  }
  // doors: INVISIBLE portals — the MOVE CHAMBER. No circle, no ring: the space beyond the gap is
  // simply the next floor, drawn inline (aligned so its reciprocal door meets ours) and revealed by
  // a soft hole in the fog. Behind you: your thread. Ahead: the foyer. Both gated by the chamber.
  for (const d of cur.p.doors) {
    const v = cur.vis[d.node]; if (v <= 0.05) continue;
    const x = w.pos[2 * d.node], y = w.pos[2 * d.node + 1];
    // the move-verb chamber marker — subtle: a faint threshold glyph, nothing more
    ctx.globalAlpha = Math.min(0.55, v * 0.55);
    ctx.fillStyle = rgba(INK, 0.8); ctx.font = '11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('↕', x, y);
  }
  ctx.globalAlpha = 1;
  // residents
  stepNPCs(cur);
  for (const nn of cur.npcs) {
    const v = cur.vis[nn.node]; if (v <= 0.25) continue;
    ctx.globalAlpha = v;
    if (nn.droid) {
      const t = performance.now() / 1000 + nn.ph, px = polyFrame(DROID, t); ctx.fillStyle = 'rgba(4,6,10,0.7)'; ctx.beginPath(); ctx.arc(nn.x, nn.y, 8, 0, 7); ctx.fill(); for (const q of px) { ctx.fillStyle = q.c; ctx.fillRect(nn.x + (q.x - DROID.cx) * 0.9, nn.y + (q.y - DROID.cy) * 0.9, 1.05, 1.05); }
      if (nn.carry) {   // the hauled commodity, riding the droid's back in its producer's colour
        ctx.fillStyle = nn.carry; ctx.fillRect(nn.x - 2.4, nn.y - 10.5, 4.8, 4.8);
        ctx.strokeStyle = 'rgba(232,236,244,0.5)'; ctx.lineWidth = 0.6; ctx.strokeRect(nn.x - 2.4, nn.y - 10.5, 4.8, 4.8);
      }
    }
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
    const paths = cur.cellPath.get(w.nodeChunk[i]); if (!paths) continue;
    fc.fillStyle = `rgba(0,0,0,${Math.min(1, v)})`; fc.fill(paths[w.nodeLocal[i]]);
  }
  for (const d of cur.p.doors) {   // the doors breathe a soft hole in the fog — the foyer beyond shows through
    if (!d._peek) continue;
    const pk = d._peek; d._peek = null;
    const g = fc.createRadialGradient(pk.x, pk.y, 0, pk.x, pk.y, pk.S * 0.9);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(1, pk.v) * 0.95})`); g.addColorStop(0.7, `rgba(0,0,0,${Math.min(1, pk.v) * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    fc.fillStyle = g; fc.beginPath(); fc.arc(pk.x, pk.y, pk.S * 0.9, 0, 7); fc.fill();
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(fogCv, 0, 0, CW, CH);
  // player
  const pp = P(w.pos[2 * state.node], w.pos[2 * state.node + 1]);
  ctx.beginPath(); ctx.arc(pp[0], pp[1], 14 * view.scale, 0, 7); ctx.fillStyle = rgba(TEAL, 0.16); ctx.fill();
  ctx.fillStyle = rgba(GOLD, 1); ctx.font = `bold ${Math.max(13, 15 * view.scale) | 0}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('@', pp[0], pp[1]);
  // the crossing fade (the pocket seam, covered by the no-memory rule)
  if (state.pending || state.fade > 0) {
    const cap = state.pending ? state.pending.cap : 1;
    state.fade = Math.min(cap + 0.2, state.fade + (state.pending ? 0.16 : -0.09));
    if (state.pending && state.fade >= cap) finishCross();
    if (state.fade > 0) { ctx.fillStyle = `rgba(2,3,6,${Math.min(1, state.fade)})`; ctx.fillRect(0, 0, CW, CH); }
  } else if (state.fade < 0) state.fade = 0;
}

// ── HUD ──
function updateHUD() {
  const p = cur.p, w = p.walk, cid = w.nodeChunk[state.node], local = w.nodeLocal[state.node];
  const rec = p.world.chunks[cid], rid = rec.roomOf[local];
  const room = rid >= 0 ? rec.rooms[rid] : null;
  $('oname').textContent = world.label(state.key); $('oname').style.color = rgba(threadColor(state.key), 1);
  const warp = state.key[0] === 'W' && state.key !== 'CW' ? world.warps[+state.key.slice(1)] : null;
  $('okind').textContent = state.key[0] === 'X' ? 'the INTERFACE — one chamber, shared by both threads'
    : state.key === 'CW' ? 'the commons — six white threads attach here' : state.key === 'CP' ? 'the works floor — eight engines attach here'
    : warp && warp.ward ? `${warp.factionLabel} · ward of ${warp.ward.exclusive} (${warp.ward.level}) — the twin thread lies dead opposite` : state.key[0] === 'W' ? 'white-collar ops · a pocket floor (walk it hub → rim)' : 'production · an engine floor (droids haul the chain)';
  $('now').innerHTML = room ? (room.nexus
    ? `<span class="role">◈ the nexus</span><div class="sub">the works floor's heart — player progression (coming online)</div>`
    : `<span class="role">${room.glyph} ${room.role}</span><div class="sub">${room.people && room.people.length ? room.people.length + ' resident(s)' : 'a work room'}</div>`)
    : `<span class="role">the concourse</span><div class="sub">${state.key[0] === 'P' || state.key === 'CP' ? 'polished obsidian underfoot — the ledger of breath, misread as grain yields' : 'stations ahead — each door is another thread'}</div>`;
  const seen = p.doors.filter((d) => cur.vis && d.node < cur.vis.length && cur.vis[d.node] > 0.2);
  $('doors').innerHTML = seen.length
    ? seen.map((d) => { const s = d.station, k = d.other || d.toKey; return `<div class="door" data-n="${d.node}"><span class="sw" style="background:${rgba(threadColor(k), 1)}"></span><span class="lab">${world.label(k)}</span><span class="rf">${s ? '⬡' + (s.district + 1) + (s.over ? ' · over' : ' · under') : 'hub'}</span></div>`; }).join('')
    : '<p style="margin:4px 0">no doors in sight — walk the concourse.</p>';
  for (const el of $('doors').querySelectorAll('.door')) el.addEventListener('click', () => setWalk(+el.dataset.n));
}

// ── THE MINIMAP: the ANALYTIC weave (the map that tells the truth), with you on it. The pocket
// fakes the metric, so the inset shows your TRUE position: nearest spine sample → rf → the point
// on your thread's own analytic line; an interface sits at its exact station crossing; the
// commons at the hub. Static weave baked once; your thread highlights, the gold dot is you. ──
const mm = $('mm'), mctx = mm ? mm.getContext('2d') : null;
const MMS = 170;
let mmBase = null;
function mmLine(c2, kind, idx, S, colStr, lw) {
  c2.strokeStyle = colStr; c2.lineWidth = lw; c2.beginPath();
  for (let i = 0; i <= 48; i++) {
    const rf = world.lines.flatR + (1 - world.lines.flatR) * i / 48;
    const p = kind === 'W' ? world.lines.lineW(idx, rf) : world.lines.lineP(idx, rf);
    const x = MMS / 2 + p[0] * S, y = MMS / 2 + p[1] * S;
    i ? c2.lineTo(x, y) : c2.moveTo(x, y);
  }
  c2.stroke();
}
function mmScale() { return (MMS / 2 - 8) / world.geo.R; }
function mmBake() {
  const d = Math.min(2, devicePixelRatio || 1);
  mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = MMS * d;
  const c2 = mmBase.getContext('2d'); c2.scale(d, d);
  const S = mmScale();
  c2.strokeStyle = 'rgba(127,216,208,0.3)'; c2.lineWidth = 1;
  c2.beginPath(); c2.arc(MMS / 2, MMS / 2, world.lines.flatR * world.geo.R * S, 0, 7); c2.stroke();
  for (let i = 0; i < 6; i++) mmLine(c2, 'W', i, S, rgba(threadColor('W' + i), 0.38), 1);
  for (let j = 0; j < 8; j++) mmLine(c2, 'P', j, S, rgba(threadColor('P' + j), 0.38), 1);
}
function mmPos() {   // the player's ANALYTIC [x,y]
  const k = state.key;
  if (k === 'CW' || k === 'CP') return [0, 0];
  if (k[0] === 'X') {
    const [w0, f0] = k.slice(1).split(':').map(Number);
    const st = world.stations.find((s) => s.w === w0 && s.f === f0);
    return st ? world.lines.lineW(w0, st.rf) : [0, 0];
  }
  const sp = cur.p.spine; if (!sp) return [0, 0];
  const w = cur.p.walk, px = w.pos[2 * state.node], py = w.pos[2 * state.node + 1];
  let bi = 0, bd = Infinity;
  for (let i = 0; i < sp.length; i++) { const d = (sp[i].x - px) ** 2 + (sp[i].y - py) ** 2; if (d < bd) { bd = d; bi = i; } }
  const idx = +k.slice(1);
  return k[0] === 'W' ? world.lines.lineW(idx, sp[bi].rf) : world.lines.lineP(idx, sp[bi].rf);
}
function drawMinimap() {
  if (!mm) return;
  const d = Math.min(2, devicePixelRatio || 1);
  if (!mmBase) mmBake();
  if (mm.width !== MMS * d) { mm.width = mm.height = MMS * d; }
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mm.width, mm.height);
  mctx.drawImage(mmBase, 0, 0);
  mctx.setTransform(d, 0, 0, d, 0, 0);
  const S = mmScale(), k = state.key;
  if (k[0] === 'W' && k !== 'CW') {
    const wi = +k.slice(1), sib = (wi + 3) % world.geo.NW;   // the faction's twin — antipodal, the axis bisects
    if (world.geo.NW === 6 && world.warps[sib].faction === world.warps[wi].faction) mmLine(mctx, 'W', sib, S, rgba(threadColor('W' + sib), 0.55), 1.4);
    mmLine(mctx, 'W', wi, S, rgba(threadColor(k), 0.95), 2);
  }
  else if (k[0] === 'P' && k !== 'CP') mmLine(mctx, 'P', +k.slice(1), S, rgba(threadColor(k), 0.95), 2);
  else if (k[0] === 'X') {
    const [w0, f0] = k.slice(1).split(':').map(Number);
    mmLine(mctx, 'W', w0, S, rgba(threadColor('W' + w0), 0.85), 1.6);
    mmLine(mctx, 'P', f0, S, rgba(threadColor('P' + f0), 0.85), 1.6);
  } else { mctx.strokeStyle = rgba(TEAL, 0.9); mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(MMS / 2, MMS / 2, world.lines.flatR * world.geo.R * S, 0, 7); mctx.stroke(); }
  const p = mmPos(), x = MMS / 2 + p[0] * S, y = MMS / 2 + p[1] * S;
  const pulse = 0.5 + 0.5 * Math.sin(frameN * 0.1);
  mctx.beginPath(); mctx.arc(x, y, 4 + pulse * 2.5, 0, 7); mctx.strokeStyle = rgba(GOLD, 0.4 + 0.4 * pulse); mctx.lineWidth = 1.2; mctx.stroke();
  mctx.beginPath(); mctx.arc(x, y, 2.2, 0, 7); mctx.fillStyle = rgba(GOLD, 1); mctx.fill();
}

// ── input + loop ──
addEventListener('keydown', (e) => { const d = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[e.key]; if (d) { state.lastInput = frameN; moveDir(d[0], d[1]); e.preventDefault(); } });
cv.addEventListener('pointerdown', (e) => {
  state.lastInput = frameN;
  const r = cv.getBoundingClientRect(), wx = view.cx + (e.clientX - r.left - CW / 2) / view.scale, wy = view.cy + (e.clientY - r.top - CH / 2) / view.scale;
  const w = cur.p.walk; let best = -1, bd = 26 * 26;
  for (let i = 0; i < w.N; i++) { if (cur.vis[i] <= 0.25) continue; const d = (w.pos[2 * i] - wx) ** 2 + (w.pos[2 * i + 1] - wy) ** 2; if (d < bd) { bd = d; best = i; } }
  if (best >= 0) { setWalk(best); return; }
  // the WHOLE preview is the affordance: a click anywhere inside a door's peek disc — the visible
  // slice of the next floor — walks you to that portal and through. No pixel-hunting the threshold.
  let bD = null, bDist = Infinity;
  for (const d of cur.p.doors) {
    if (cur.vis[d.node] <= 0.15) continue;
    const S = (d.toKey[0] === 'X' ? 210 : 150) * 0.95;
    const dist = Math.hypot(w.pos[2 * d.node] - wx, w.pos[2 * d.node + 1] - wy);
    if (dist < S && dist < bDist) { bDist = dist; bD = d; }
  }
  if (bD) setWalk(bD.node);
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.4, Math.min(3, zoom * Math.exp(-e.deltaY * 0.0012))); }, { passive: false });
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; if (!fogCv) fogCv = document.createElement('canvas'); fogCv.width = cv.width; fogCv.height = cv.height; }
addEventListener('resize', resize);
let frameN = 0;
// the GRADE: threads run uphill and downhill (the analytic over/under z rides the spine). Stand
// still and you SLIDE with it — a gentle drift down the corridor, never through a portal.
function slide() {
  const sp = cur.p.spine; if (!sp) return;
  const w = cur.p.walk, px = w.pos[2 * state.node], py = w.pos[2 * state.node + 1];
  let k = 1, bd = Infinity;
  for (let i = 1; i < sp.length - 1; i++) { const d = (sp[i].x - px) ** 2 + (sp[i].y - py) ** 2; if (d < bd) { bd = d; k = i; } }
  const dz = sp[k + 1].z - sp[k - 1].z, ds = Math.hypot(sp[k + 1].x - sp[k - 1].x, sp[k + 1].y - sp[k - 1].y) || 1;
  if (Math.abs(dz / ds) < 0.14) return;                          // gentler than the slip grade — no drift
  const tx = sp[k + 1].x - sp[k - 1].x, ty = sp[k + 1].y - sp[k - 1].y, L = Math.hypot(tx, ty) || 1;
  const sgn = dz > 0 ? -1 : 1;                                    // downhill
  const dx = tx / L * sgn, dy = ty / L * sgn, here = [px, py];
  // CONTINUOUS z along the spine (project onto the polyline, interpolate) — the old nearest-sample
  // read made neighbouring cells share one z and killed most slides; monotone descent stays.
  const zSm = (x, y) => {
    let kk = 1, bb = Infinity;
    for (let i = 1; i < sp.length - 1; i++) { const d = (sp[i].x - x) ** 2 + (sp[i].y - y) ** 2; if (d < bb) { bb = d; kk = i; } }
    let z = sp[kk].z, bs2 = Infinity;
    for (const [a, b2] of [[Math.max(0, kk - 1), kk], [kk, Math.min(sp.length - 1, kk + 1)]]) {
      const A = sp[a], B = sp[b2], vx = B.x - A.x, vy = B.y - A.y, dd = vx * vx + vy * vy || 1;
      let t = ((x - A.x) * vx + (y - A.y) * vy) / dd; t = Math.max(0, Math.min(1, t));
      const qx = A.x + vx * t, qy = A.y + vy * t, d = (x - qx) ** 2 + (y - qy) ** 2;
      if (d < bs2) { bs2 = d; z = A.z + (B.z - A.z) * t; }
    }
    return z;
  };
  const zHere = zSm(px, py);
  let best = -1, bs = 0.45;
  for (const nb of w.adj[state.node]) {
    if (cur.p.doorAt.has(nb)) continue;                           // gravity never pushes you through a door
    const nx2 = w.pos[2 * nb], ny2 = w.pos[2 * nb + 1];
    if (zSm(nx2, ny2) > zHere - 0.5) continue;                    // MONOTONE: only steps that genuinely descend (kills the trough bounce)
    const vx = nx2 - here[0], vy = ny2 - here[1], Ln = Math.hypot(vx, vy) || 1, sc = (vx * dx + vy * dy) / Ln;
    if (sc > bs) { bs = sc; best = nb; }
  }
  if (best >= 0) arrive(best);
}
function loop() {
  frameN++;
  if (!state.pending && state.walk && frameN % 3 === 0) { state.walk.i++; if (state.walk.i < state.walk.path.length) arrive(state.walk.path[state.walk.i]); else state.walk = null; }
  if (!state.pending && !state.walk && frameN - state.lastInput > 50 && frameN % 10 === 0) slide();   // severe grade: slides bite sooner
  const w = cur.p.walk;
  view.scale = zoom; view.cx += (w.pos[2 * state.node] - view.cx) * 0.18; view.cy += (w.pos[2 * state.node + 1] - view.cy) * 0.18;
  sync(cur);
  fadeVis();
  render();
  if (frameN % 2 === 0) drawMinimap();
  if (frameN % 30 === 0) updateHUD();
  if (frameN % 45 === 0 && !state.pending) {
    // STREAM: first finish the floor underfoot (one segment per interval), then warm ONE visible
    // door's preview — a single segment of its target, never a whole thread.
    const un = cur.p.segs.findIndex((s) => !s.solved);
    if (un >= 0) ensureSegB(cur, un);
    else for (const d of cur.p.doors) {
      if (cur.vis[d.node] <= 0.2) continue;
      const tb = ensure(d.toKey), si = needSeg(tb.p, d), g = tb.p.segs[si];
      if (!g.solved || !tb.bakes.has(g.chunkId)) { ensureSegB(tb, si); break; }
    }
  }
  requestAnimationFrame(loop);
}

// ── boot ──
const params = new URLSearchParams(location.search);
const seed = (params.get('seed') | 0) >>> 0 || 7;
const at = /^(CW|CP|W[0-5]|P[0-7])$/.test(params.get('at') || '') ? params.get('at') : 'CW';
await new Promise((r) => setTimeout(r, 30));
world = buildPocketWorld(seed);
cur = ensure(at); state.key = at;
ensureSegB(cur, 0);
state.node = nearestNode(cur.p.walk, cur.p.W / 2, cur.p.H / 2);
resize();
refreshSight();
view.cx = cur.p.walk.pos[2 * state.node]; view.cy = cur.p.walk.pos[2 * state.node + 1]; view.scale = zoom;
updateHUD();
$('load').style.display = 'none';
globalThis.__pocket = { state, view, get cur() { return cur; }, get world() { return world; } };   // headless-test handle
loop();
