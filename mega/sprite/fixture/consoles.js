// consoles.js — wall fixtures that EMERGE FROM THE VORONOI TILING (not plopped on top).
//
// The previous cabinets read as decals. These instead CLAIM a cluster of the chamber's own cells at
// a wall and RE-ATTRIBUTE them: the wall-side cells stay continuous with the membrane (HALF ROOM —
// where we interface with the environment), and the room-side cells ERUPT into a distinctive, gold-
// seamed, emissive form (HALF ASSET). The fixture is therefore part of the tiling — same cells, same
// ray-traced light — only with alternate attributes. One per chamber, on the wall away from the
// lights; the kind (storage / bookshelf / arcade / vendor) flavours the eruption.
//
// growWallFixtures(scene, rng, {avoid, kindOf}) → fixtures (each = claimed cell indices + tiers);
// drawWallFixture(ctx, scene, F, {accent, hue, litAt}) repaints those cells.

import { bucketGrid } from './voronoi.js';   // to find the nearest wall by marching from the seed
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hex2rgb = (h) => { const c = h.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, l) => `rgb(${clamp(c[0] * l, 0, 255) | 0},${clamp(c[1] * l, 0, 255) | 0},${clamp(c[2] * l, 0, 255) | 0})`;
const GROUND = [10, 12, 16], GOLD = [244, 191, 98], WALLC = [9, 11, 15];
const goldS = (l, a) => `rgba(${(244 * l) | 0},${(191 * l) | 0},${(98 * l) | 0},${a})`;

export const CONSOLE_KINDS = ['storage', 'shelf', 'arcade', 'vendor'];
export const ROLE_CONSOLE = {
  store: 'storage', move: 'storage', make: 'storage', mend: 'storage',
  learn: 'shelf', govern: 'shelf', worship: 'shelf',
  play: 'arcade', serve: 'arcade',
  heal: 'vendor', grow: 'vendor', trade: 'vendor', dwell: 'vendor',
};
// the eruption envelope: half-width fraction (0..~1.1) at tier u (0 at wall → 1 at the tip).
export function profile(u, kind) {
  switch (kind) {
    case 'arcade': return 0.66 + 0.5 * Math.sin(Math.PI * clamp(u, 0, 1));   // bulges mid (a screen)
    case 'shelf': return 1.02 - 0.18 * u;                                    // near-rectangular bays
    case 'vendor': return 1.0 - 0.34 * u;                                    // broad, gridded
    default: return 1.0 - 0.5 * u;                                           // storage: blocky taper
  }
}

export function growWallFixtures(scene, rng, { avoid = {}, kindOf } = {}) {
  const sp = scene.roomSpacing || 40, cells = scene.paintCells, out = [];
  const grid = bucketGrid(scene.nuclei, Math.max(scene.roomSpacing, scene.wallSpacing) * 1.7);
  const cellAt = (x, y) => { let best = null, bd = Infinity; for (const q of grid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } } return best; };
  for (const rc of scene.roomCells) {
    const seed = scene.roomSeeds[rc.id]; if (!seed) continue;
    const av = avoid[rc.id] || [];
    // march outward from the seed in several directions to the NEAREST wall on this room's membrane;
    // pick the wall hit farthest from this room's lights (so the fixture sits opposite the sconces).
    const rot = rng() * Math.PI / 6, DIRS = 14; let best = null, bestScore = -1;
    for (let k = 0; k < DIRS; k++) {
      const ang = rot + k / DIRS * Math.PI * 2, cx = Math.cos(ang), cy = Math.sin(ang);
      let hit = null;
      for (let r = sp * 0.5; r < (scene.roomSize || 200) * 0.95; r += scene.wallSpacing * 0.7) {
        const x = seed.x + cx * r, y = seed.y + cy * r; if (x < 1 || y < 1 || x > scene.W - 1 || y > scene.H - 1) break;
        const nu = cellAt(x, y); if (nu && (nu.wall || nu.room !== rc.id)) { hit = { x: seed.x + cx * (r - scene.wallSpacing * 0.5), y: seed.y + cy * (r - scene.wallSpacing * 0.5), cx, cy }; break; }
      }
      if (!hit) continue;
      let near = Infinity; for (const p of av) near = Math.min(near, (p.x - hit.x) ** 2 + (p.y - hit.y) ** 2);
      const score = av.length ? near : 1; if (score > bestScore) { bestScore = score; best = hit; }
    }
    if (!best) continue;
    best.mx = best.x; best.my = best.y;
    const nx = -best.cx, ny = -best.cy, tx = -ny, ty = nx;     // inward = back toward the seed
    const kind = kindOf ? kindOf(rc.id) : CONSOLE_KINDS[(rng() * CONSOLE_KINDS.length) | 0];
    const reach = sp * (1.7 + rng() * 0.8), halfW = sp * (1.15 + rng() * 0.55), seedN = (rng() * 1e9) >>> 0;
    // claim cells: wall cells at the base (continuous with the membrane) + floor cells inside the
    // eruption envelope (the asset). u = inward distance, w = lateral.
    const claimed = [];
    for (let idx = 0; idx < cells.length; idx++) {
      const c = cells[idx]; if (c.poly.length < 3) continue;
      const u = (c.x - best.mx) * nx + (c.y - best.my) * ny, w = Math.abs((c.x - best.mx) * tx + (c.y - best.my) * ty);
      if (c.wall) { if (u > -sp * 0.5 && u < sp * 0.4 && w < halfW) claimed.push({ idx, tier: 0, base: true, w }); }
      else if (c.room === rc.id && u > 0 && u <= reach && w <= halfW * profile(u / reach, kind)) claimed.push({ idx, tier: u / reach, base: false, w });
    }
    if (claimed.filter((c) => !c.base).length < 1) continue;     // needs a real eruption
    claimed.sort((a, b2) => a.tier - b2.tier);                   // base → tip draw order
    // THE ENDPOINT-COHERENT GRAPH of the assigned tile set: connect cells that share a voronoi edge,
    // then BFS from the wall (base) cells → a spanning tree with a topological distance per cell. The
    // fixture's ornament + shading ride this graph, so they're provably coherent across the tiles.
    const graph = tileGraph(claimed, cells);
    const tipCells = claimed.filter((c) => c.tier > 0.7); const tip = tipCells.length
      ? { x: tipCells.reduce((s, c) => s + cells[c.idx].x, 0) / tipCells.length, y: tipCells.reduce((s, c) => s + cells[c.idx].y, 0) / tipCells.length }
      : { x: best.mx + nx * reach * 0.7, y: best.my + ny * reach * 0.7 };
    out.push({ room: rc.id, kind, nx, ny, tx, ty, halfW, reach, seedN, anchor: best, cells: claimed, tip, dist: graph.dist, parent: graph.parent, maxDist: graph.maxDist });
  }
  return out;
}

// adjacency (shared voronoi edge) + BFS distance/parent from the base (wall) cells.
const vkey = (x, y) => Math.round(x / 2) + ',' + Math.round(y / 2);
function tileGraph(claimed, cells) {
  const edgeMap = new Map();
  claimed.forEach((cl, li) => { const v = cells[cl.idx].poly; for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; const ka = vkey(a[0], a[1]), kb = vkey(b[0], b[1]); const k = ka < kb ? ka + '|' + kb : kb + '|' + ka; let l = edgeMap.get(k); if (!l) edgeMap.set(k, l = []); l.push(li); } });
  const adj = claimed.map(() => new Set());
  for (const l of edgeMap.values()) if (l.length >= 2) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { if (l[i] !== l[j]) { adj[l[i]].add(l[j]); adj[l[j]].add(l[i]); } }
  const dist = claimed.map(() => -1), parent = claimed.map(() => -1), q = [];
  claimed.forEach((c, i) => { if (c.base) { dist[i] = 0; q.push(i); } });
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const w of adj[u]) if (dist[w] < 0) { dist[w] = dist[u] + 1; parent[w] = u; q.push(w); } }
  let maxDist = 0; for (let i = 0; i < dist.length; i++) { if (dist[i] < 0) dist[i] = Math.round(claimed[i].tier * 4) + 1; if (dist[i] > maxDist) maxDist = dist[i]; }   // isolated cells fall back to tier
  return { dist, parent, maxDist: maxDist || 1 };
}

const TAU = Math.PI * 2, GA = 2.39996323;   // golden angle — the phyllotaxis of Romanesco
// ── a VARIETY of ornamentation math — one per fixture (chosen from F.seedN) ──────────────────────
function o_romanesco(ctx, cx, cy, r, ang, acc, lit, depth) {     // golden-angle spiral of cones, recursive
  const n = depth > 0 ? 12 : 8;
  for (let i = 0; i < n; i++) {
    const a = i * GA + ang, t = (i + 0.5) / n, rr = r * Math.sqrt(t), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, sz = r * 0.17 * (1 - 0.4 * t);
    ctx.fillStyle = css(mix(acc, GOLD, 0.22 + 0.62 * t), lit * (0.7 + 0.4 * t)); ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
    if (depth > 0 && i % 2 === 0 && t > 0.32) o_romanesco(ctx, x, y, sz * 1.5, a, acc, lit, depth - 1);
  }
  ctx.fillStyle = css(mix(acc, GOLD, 0.55), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, TAU); ctx.fill();
}
function o_rose(ctx, cx, cy, r, ang, acc, lit) {                 // a rhodonea (rose) curve — petals
  ctx.beginPath(); for (let i = 0; i <= 120; i++) { const th = i / 120 * TAU, rr = r * Math.abs(Math.cos(3 * th)), x = cx + Math.cos(th + ang) * rr, y = cy + Math.sin(th + ang) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath();
  ctx.fillStyle = css(mix(acc, GOLD, 0.32), lit * 0.85); ctx.fill(); ctx.strokeStyle = goldS(lit, 0.6); ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = css(mix(acc, GOLD, 0.6), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, TAU); ctx.fill();
}
function o_branch(ctx, cx, cy, r, ang, acc, lit) {               // recursive Y branching (an L-system bush)
  const rec = (x, y, a, len, d) => { const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; ctx.strokeStyle = css(mix(acc, GOLD, 0.3 + 0.3 * (3 - d) / 3), lit); ctx.lineWidth = Math.max(0.6, len * 0.13); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); if (d <= 0) { ctx.fillStyle = css(mix(acc, GOLD, 0.6), lit); ctx.beginPath(); ctx.arc(x2, y2, len * 0.22, 0, TAU); ctx.fill(); return; } rec(x2, y2, a - 0.5, len * 0.72, d - 1); rec(x2, y2, a + 0.5, len * 0.72, d - 1); };
  rec(cx, cy, ang, r * 0.85, 3);
}
function o_gasket(ctx, cx, cy, r, ang, acc, lit, depth) {        // nested circles (Apollonian-ish)
  ctx.strokeStyle = goldS(lit, 0.5); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  const n = 6; for (let i = 0; i < n; i++) { const a = ang + i / n * TAU, x = cx + Math.cos(a) * r * 0.55, y = cy + Math.sin(a) * r * 0.55, rr = r * 0.32; ctx.fillStyle = css(mix(acc, GOLD, 0.25 + 0.35 * (i / n)), lit * 0.8); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); ctx.strokeStyle = goldS(lit, 0.4); ctx.stroke(); if (depth > 0) o_gasket(ctx, x, y, rr * 0.66, a, acc, lit, depth - 1); }
  ctx.fillStyle = css(mix(acc, GOLD, 0.55), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, TAU); ctx.fill();
}
function o_spokes(ctx, cx, cy, r, ang, acc, lit) {               // a deco sunburst + concentric rings
  const n = 12; ctx.strokeStyle = goldS(lit, 0.5); ctx.lineWidth = 0.8;
  for (let i = 0; i < n; i++) { const a = ang + i / n * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
  for (const rr of [r * 0.45, r * 0.8]) { ctx.strokeStyle = goldS(lit, 0.4); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = css(mix(acc, GOLD, 0.55), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, TAU); ctx.fill();
}
const ORNAMENTS = [o_romanesco, o_rose, o_branch, o_gasket, o_spokes];

// EXTRUDE + ORNAMENT over the tile graph: height by graph distance, tops shaded by a continuous
// vertex field (tiles blend across shared corners), and a Romanesco floret per cell oriented along
// the spanning tree (parent → child). The whole fixture is one provably-coherent fractal of tiles.
export function drawWallFixture(ctx, scene, F, { accent = '#888', hue = 40, litAt = () => 1 } = {}) {
  const acc = hex2rgb(accent), cells = scene.paintCells, sp = scene.roomSpacing || 40, maxH = sp * 0.7, maxD = F.maxDist || 1;
  const fieldOf = (li) => (F.cells[li].base ? 0 : F.dist[li] / maxD);          // topological 0..1
  const zOf = (li) => (F.cells[li].base ? 0.1 : 0.14 + 0.72 * fieldOf(li)) * maxH;
  const litC = (li) => clamp(litAt(cells[F.cells[li].idx].x, cells[F.cells[li].idx].y), 0.22, 1.2);
  // ── coherent shading field: each vertex = the mean field + mean light of the cells that share it ──
  const vV = new Map(), vL = new Map();
  F.cells.forEach((cl, li) => { const c = cells[cl.idx], f = fieldOf(li), lt = litC(li); for (const p of c.poly) { const k = vkey(p[0], p[1]); let a = vV.get(k); if (!a) vV.set(k, a = [0, 0]); a[0] += f; a[1]++; let b = vL.get(k); if (!b) vL.set(k, b = [0, 0]); b[0] += lt; b[1]++; } });
  const vval = (p) => { const a = vV.get(vkey(p[0], p[1])); return a ? a[0] / a[1] : 0; };
  const vlit = (p) => { const a = vL.get(vkey(p[0], p[1])); return a ? a[0] / a[1] : 1; };
  const rampCol = (f) => mix(mix(GROUND, acc, 0.5), mix(acc, GOLD, 0.5), clamp(f, 0, 1));
  const sideDark = mix(GROUND, acc, 0.14), oi = F.seedN % ORNAMENTS.length, ornament = ORNAMENTS[oi], uiList = [];
  const UI_F = 0.72;                                                            // cells past this field are the room-facing UI screen
  const path = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
  const topCent = (li) => { const v = cells[F.cells[li].idx].poly, z = zOf(li); let x = 0, y = 0; for (const p of v) { x += p[0]; y += p[1]; } return [x / v.length, y / v.length - z]; };
  const order = F.cells.map((_, li) => li).sort((a, b) => topCent(a)[1] - topCent(b)[1]);   // back → front
  // faint stalks along the spanning tree (the broccoli branching)
  ctx.strokeStyle = goldS(0.6, 0.18); ctx.lineWidth = 1;
  for (let li = 0; li < F.cells.length; li++) { const pa = F.parent[li]; if (pa < 0) continue; const A = topCent(li), B = topCent(pa); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
  for (const li of order) {
    const cl = F.cells[li], c = cells[cl.idx], v = c.poly, z = zOf(li), top = v.map((p) => [p[0], p[1] - z]);
    // side walls
    for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length], ta = top[i], tb = top[(i + 1) % v.length], front = (a[1] + b[1]) / 2 > c.y; ctx.fillStyle = css(sideDark, litC(li) * (front ? 0.5 : 0.3) + 0.04); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(tb[0], tb[1]); ctx.lineTo(ta[0], ta[1]); ctx.closePath(); ctx.fill(); }
    // top: Gouraud-ish fan, colours interpolated through shared vertices ⇒ tiles shade into each other
    const tc = [top.reduce((s, p) => s + p[0], 0) / top.length, top.reduce((s, p) => s + p[1], 0) / top.length], cf = fieldOf(li), clt = litC(li);
    for (let i = 0; i < top.length; i++) {
      const va = v[i], vb = v[(i + 1) % v.length], f = (cf + vval(va) + vval(vb)) / 3, lt = (clt + vlit(va) + vlit(vb)) / 3;
      const col = cl.base ? mix(WALLC, acc, 0.42) : rampCol(f);
      ctx.fillStyle = css(col, lt * 0.66 + 0.2);
      ctx.beginPath(); ctx.moveTo(tc[0], tc[1]); ctx.lineTo(top[i][0], top[i][1]); ctx.lineTo(top[(i + 1) % top.length][0], top[(i + 1) % top.length][1]); ctx.closePath(); ctx.fill();
    }
    // ORNAMENT on the structure; but the room-facing tip cells are deferred to one black UI surface
    if (!cl.base) {
      if (cf >= UI_F) uiList.push({ top, tc });
      else {
        let r = 0; for (const p of v) r += Math.hypot(p[0] - c.x, p[1] - c.y); r /= v.length;
        const pa = F.parent[li]; let ang = Math.atan2(F.ny, F.nx); if (pa >= 0) { const B = topCent(pa); ang = Math.atan2(tc[1] - B[1], tc[0] - B[0]); }
        ornament(ctx, tc[0], tc[1], r * (0.7 + 0.5 * cf), ang, acc, clt * 0.8 + 0.25, cf > 0.5 ? 1 : 0);
      }
    }
  }
  // a COHERENT BLACK SURFACE toward room centre — implies a user interface (drawn last, on top)
  if (uiList.length) {
    for (const u of uiList) { ctx.fillStyle = `hsl(${hue} 26% 5%)`; path(u.top); ctx.fill(); }
    for (const u of uiList) { ctx.strokeStyle = `hsla(${hue} 70% 55% / 0.22)`; ctx.lineWidth = 0.8; path(u.top); ctx.stroke(); }
    ctx.strokeStyle = `hsla(${hue} 85% 72% / 0.2)`; ctx.lineWidth = 0.6;   // short scanlines (bounded to each cell)
    for (const u of uiList) { let r = 0; for (const p of u.top) r += Math.hypot(p[0] - u.tc[0], p[1] - u.tc[1]); r /= u.top.length; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(u.tc[0] - r * 0.55, u.tc[1] + k * r * 0.42); ctx.lineTo(u.tc[0] + r * 0.55, u.tc[1] + k * r * 0.42); ctx.stroke(); } }
  }
  // emissive crown at the lifted tip
  const tipZ = (0.14 + 0.72) * maxH, tx = F.tip.x, ty = F.tip.y - tipZ;
  for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(tx, ty, sp * 0.16 * i / 1.7, 0, TAU); ctx.fillStyle = `hsla(${hue} 85% 64% / ${0.05 + (3 - i) * 0.05})`; ctx.fill(); }
  ctx.beginPath(); ctx.arc(tx, ty, sp * 0.06, 0, TAU); ctx.fillStyle = `hsla(${hue} 75% 88% / 0.95)`; ctx.fill();
}

const CONSOLES = { CONSOLE_KINDS, ROLE_CONSOLE, growWallFixtures, drawWallFixture, profile };
if (typeof globalThis !== 'undefined') globalThis.CONSOLES = CONSOLES;
export default CONSOLES;
