// consoles.js — v091 VENDORED + REWORKED from ../v5/consoles.js. Wall fixtures that EMERGE FROM THE
// VORONOI TILING (not plopped on top): a fixture CLAIMS a cluster of a room's own cells and erupts the
// room-side ones into a gold-seamed, emissive form while the base cells stay continuous with the wall.
//
// What v091 changes vs v5 (growWallFixtures only — drawWallFixture / tileGraph / ornaments are verbatim):
//   • AREA CAP. The fixture never grows past `maxAreaFrac` (≈20%) of the ROOM's floor area, so even a
//     modest room doesn't get a greedy console. Growth is a frontier flood from the anchor to budget.
//   • SHAPE-AWARE PLACEMENT. Oblong rooms (PCA aspect > ~1.6) anchor the fixture in a CORNER (an extreme
//     along the long axis where two walls meet); rounder rooms HUG a wall.
//   • NEVER ON THE DOOR. Door cells (passed per room) are excluded from anchor + growth — doors will
//     become non-navigable, so they must stay clear.
//   • BIAS AWAY FROM THE CONCOURSE. A cell whose neighbouring boundary is the concourse is penalised, so
//     fixtures prefer the room↔room / interior membranes where possible.
//
// growWallFixtures(scene, rng, {avoid, kindOf, doors, maxAreaFrac}) → fixtures (claimed cell indices +
// tiers + tile graph); drawWallFixture(ctx, scene, F, {accent, hue, litAt}) repaints those cells.

import { bucketGrid } from '../v5/voronoi.js';
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hex2rgb = (h) => { const c = h.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, l) => `rgb(${clamp(c[0] * l, 0, 255) | 0},${clamp(c[1] * l, 0, 255) | 0},${clamp(c[2] * l, 0, 255) | 0})`;
const GROUND = [10, 12, 16], GOLD = [244, 191, 98], WALLC = [9, 11, 15];
const goldS = (l, a) => `rgba(${(244 * l) | 0},${(191 * l) | 0},${(98 * l) | 0},${a})`;
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };

export const CONSOLE_KINDS = ['storage', 'shelf', 'arcade', 'vendor'];
export const ROLE_CONSOLE = {
  store: 'storage', move: 'storage', make: 'storage', mend: 'storage',
  learn: 'shelf', govern: 'shelf', worship: 'shelf',
  play: 'arcade', serve: 'arcade',
  heal: 'vendor', grow: 'vendor', trade: 'vendor', dwell: 'vendor',
};

// adjacency over a SET of cell indices: cells that share a voronoi edge are neighbours.
const vkey = (x, y) => Math.round(x / 2) + ',' + Math.round(y / 2);
function buildAdj(idxs, cells) {
  const edge = new Map();
  for (const i of idxs) { const v = cells[i].poly; for (let k = 0; k < v.length; k++) { const a = v[k], b = v[(k + 1) % v.length]; const ka = vkey(a[0], a[1]), kb = vkey(b[0], b[1]); const key = ka < kb ? ka + '|' + kb : kb + '|' + ka; let l = edge.get(key); if (!l) edge.set(key, l = []); l.push(i); } }
  const adj = new Map(); for (const i of idxs) adj.set(i, new Set());
  for (const l of edge.values()) if (l.length >= 2) for (let p = 0; p < l.length; p++) for (let q = p + 1; q < l.length; q++) if (l[p] !== l[q]) { adj.get(l[p]).add(l[q]); adj.get(l[q]).add(l[p]); }
  return adj;
}

export function growWallFixtures(scene, rng, { avoid = {}, kindOf, doors = {}, maxAreaFrac = 0.2 } = {}) {
  const sp = scene.roomSpacing || 40, cells = scene.paintCells, out = [];
  for (let i = 0; i < cells.length; i++) cells[i]._i = i;                       // so a sampled nucleus knows its index
  const grid = bucketGrid(scene.nuclei, Math.max(scene.roomSpacing, scene.wallSpacing) * 1.7);
  const cellAt = (x, y) => { let best = null, bd = Infinity; for (const q of grid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } } return best; };
  const rad = (scene.wallSpacing || sp * 0.5) * 1.15, SAMP = 8;

  // group floor cells by room
  const byRoom = new Map();
  for (let i = 0; i < cells.length; i++) { const c = cells[i]; if (c.wall || c.room == null || c.room < 0) continue; let a = byRoom.get(c.room); if (!a) byRoom.set(c.room, a = []); a.push(i); }

  for (const rc of scene.roomCells) {
    const ri = rc.id, seed = scene.roomSeeds[ri]; if (!seed) continue;
    const idxs = byRoom.get(ri); if (!idxs || idxs.length < 3) continue;

    // ── room geometry: centroid, floor area, PCA (oblong?) + long axis ──
    let mx = 0, my = 0, roomArea = 0; for (const i of idxs) { mx += cells[i].x; my += cells[i].y; } mx /= idxs.length; my /= idxs.length;
    let sxx = 0, syy = 0, sxy = 0; for (const i of idxs) { const dx = cells[i].x - mx, dy = cells[i].y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; roomArea += polyArea(cells[i].poly); }
    sxx /= idxs.length; syy /= idxs.length; sxy /= idxs.length;
    const T = sxx + syy, D = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, T * T - 4 * D)), l1 = (T + disc) / 2, l2 = Math.max(1e-6, (T - disc) / 2);
    const oblong = Math.sqrt(l1 / l2) > 1.6;
    let ax, ay; if (Math.abs(sxy) > 1e-6) { ax = l1 - syy; ay = sxy; } else if (sxx >= syy) { ax = 1; ay = 0; } else { ax = 0; ay = 1; }
    const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    let maxProj = 1e-6; for (const i of idxs) maxProj = Math.max(maxProj, Math.abs((cells[i].x - mx) * ax + (cells[i].y - my) * ay));

    // ── per-cell wall info: boundary directions, concourse-adjacency, corner-ness, inward normal ──
    const info = new Map();
    for (const i of idxs) {
      const c = cells[i], dirs = []; let conc = false;
      for (let k = 0; k < SAMP; k++) { const a = k / SAMP * Math.PI * 2, nu = cellAt(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad); if (nu && (nu.wall || nu.room !== ri)) { dirs.push([Math.cos(a), Math.sin(a)]); if (!nu.wall && nu.room < 0) conc = true; } }
      let corner = 0; for (let p = 0; p < dirs.length; p++) for (let q = p + 1; q < dirs.length; q++) { const dot = dirs[p][0] * dirs[q][0] + dirs[p][1] * dirs[q][1]; if (Math.abs(dot) < 0.45) corner = 1; }
      let nx = 0, ny = 0; for (const d of dirs) { nx -= d[0]; ny -= d[1]; } const nl = Math.hypot(nx, ny); if (nl > 1e-6) { nx /= nl; ny /= nl; } else { nx = (mx - c.x); ny = (my - c.y); const m2 = Math.hypot(nx, ny) || 1; nx /= m2; ny /= m2; }
      info.set(i, { wallAdj: dirs.length > 0, conc, corner, nx, ny });
    }

    // door cells to keep clear (doors become non-navigable)
    const dps = doors[ri] || [], doorR2 = (sp * 1.3) ** 2;
    const nearDoor = (c) => { for (const d of dps) if ((c.x - d.x) ** 2 + (c.y - d.y) ** 2 < doorR2) return true; return false; };
    const av = avoid[ri] || [];

    // ── anchor: wall-adjacent, off the door, biased away from the concourse + the lamps/component; an
    //    oblong room favours the ENDS of the long axis (a corner), a rounder room favours a wall ──
    let best = -1, bestScore = -Infinity, bn = null;
    for (const i of idxs) {
      const inf = info.get(i); if (!inf.wallAdj) continue; const c = cells[i]; if (nearDoor(c)) continue;
      let s = 0;
      if (av.length) { let mn = Infinity; for (const p of av) mn = Math.min(mn, (p.x - c.x) ** 2 + (p.y - c.y) ** 2); s += Math.min(Math.sqrt(mn), sp * 3); }
      if (inf.conc) s -= sp * 2.2;
      s += inf.corner * sp * 0.9;
      if (oblong) s += Math.abs((c.x - mx) * ax + (c.y - my) * ay) / maxProj * sp * 1.6;
      if (s > bestScore) { bestScore = s; best = i; bn = inf; }
    }
    if (best < 0) continue;

    // ── grow: frontier flood from the anchor to the area budget, preferring wall-hugging cells, off the
    //    door, away from the concourse, near the anchor ──
    const adj = buildAdj(idxs, cells), budget = roomArea * maxAreaFrac;
    const claimedSet = new Set([best]); let claimedArea = polyArea(cells[best].poly); const a0 = cells[best];
    let guard = 0;
    while (claimedArea < budget && guard++ < 400) {
      const fr = new Set(); for (const ci of claimedSet) for (const nb of (adj.get(ci) || [])) if (!claimedSet.has(nb)) fr.add(nb);
      if (!fr.size) break;
      let pick = -1, ps = -Infinity;
      for (const ci of fr) { const c = cells[ci], inf = info.get(ci) || {}; if (nearDoor(c)) continue; let s = (inf.wallAdj ? sp * 0.8 : 0) - (inf.conc ? sp * 1.5 : 0) - Math.hypot(c.x - a0.x, c.y - a0.y) * 0.5; if (s > ps) { ps = s; pick = ci; } }
      if (pick < 0) break; claimedSet.add(pick); claimedArea += polyArea(cells[pick].poly);
    }

    // ── base: the WALL cells behind the claimed blob (re-attributed membrane) ──
    const baseSet = new Set();
    for (const ci of claimedSet) { const c = cells[ci]; for (let k = 0; k < SAMP; k++) { const a = k / SAMP * Math.PI * 2, nu = cellAt(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad); if (nu && nu.wall && nu._i != null) baseSet.add(nu._i); } }

    const claimed = [];
    for (const bi of baseSet) claimed.push({ idx: bi, base: true, w: 0, tier: 0 });
    for (const ci of claimedSet) claimed.push({ idx: ci, base: false, w: 0, tier: 0.5 });
    if (claimed.filter((c) => !c.base).length < 1) continue;
    const graph = tileGraph(claimed, cells), maxD = graph.maxDist;
    claimed.forEach((cl, li) => { cl.tier = cl.base ? 0 : clamp(graph.dist[li] / maxD, 0, 1); });

    const tipCells = claimed.filter((c) => !c.base && c.tier > 0.7);
    const tip = tipCells.length
      ? { x: tipCells.reduce((s, c) => s + cells[c.idx].x, 0) / tipCells.length, y: tipCells.reduce((s, c) => s + cells[c.idx].y, 0) / tipCells.length }
      : { x: a0.x + bn.nx * sp * 0.7, y: a0.y + bn.ny * sp * 0.7 };
    const nx = bn.nx, ny = bn.ny, tx = -ny, ty = nx, kind = kindOf ? kindOf(ri) : CONSOLE_KINDS[(rng() * CONSOLE_KINDS.length) | 0];
    out.push({ room: ri, kind, nx, ny, tx, ty, halfW: sp, reach: sp, seedN: (rng() * 1e9) >>> 0, roomArea, claimArea: claimedArea, oblong, anchor: { x: a0.x, y: a0.y, mx: a0.x, my: a0.y, cx: -nx, cy: -ny }, cells: claimed, tip, dist: graph.dist, parent: graph.parent, maxDist: graph.maxDist });
  }
  return out;
}

// adjacency (shared voronoi edge) + BFS distance/parent from the base (wall) cells. [verbatim from v5]
function tileGraph(claimed, cells) {
  const edgeMap = new Map();
  claimed.forEach((cl, li) => { const v = cells[cl.idx].poly; for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; const ka = vkey(a[0], a[1]), kb = vkey(b[0], b[1]); const k = ka < kb ? ka + '|' + kb : kb + '|' + ka; let l = edgeMap.get(k); if (!l) edgeMap.set(k, l = []); l.push(li); } });
  const adj = claimed.map(() => new Set());
  for (const l of edgeMap.values()) if (l.length >= 2) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { if (l[i] !== l[j]) { adj[l[i]].add(l[j]); adj[l[j]].add(l[i]); } }
  const dist = claimed.map(() => -1), parent = claimed.map(() => -1), q = [];
  claimed.forEach((c, i) => { if (c.base) { dist[i] = 0; q.push(i); } });
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const w of adj[u]) if (dist[w] < 0) { dist[w] = dist[u] + 1; parent[w] = u; q.push(w); } }
  let maxDist = 0; for (let i = 0; i < dist.length; i++) { if (dist[i] < 0) dist[i] = Math.round(claimed[i].tier * 4) + 1; if (dist[i] > maxDist) maxDist = dist[i]; }
  return { dist, parent, maxDist: maxDist || 1 };
}

const TAU = Math.PI * 2, GA = 2.39996323;   // golden angle — the phyllotaxis of Romanesco
// ── a VARIETY of ornamentation math — one per fixture (chosen from F.seedN) ──────────────────────
function o_romanesco(ctx, cx, cy, r, ang, acc, lit, depth) {
  const n = depth > 0 ? 12 : 8;
  for (let i = 0; i < n; i++) {
    const a = i * GA + ang, t = (i + 0.5) / n, rr = r * Math.sqrt(t), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, sz = r * 0.17 * (1 - 0.4 * t);
    ctx.fillStyle = css(mix(acc, GOLD, 0.22 + 0.62 * t), lit * (0.7 + 0.4 * t)); ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
    if (depth > 0 && i % 2 === 0 && t > 0.32) o_romanesco(ctx, x, y, sz * 1.5, a, acc, lit, depth - 1);
  }
  ctx.fillStyle = css(mix(acc, GOLD, 0.55), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, TAU); ctx.fill();
}
function o_rose(ctx, cx, cy, r, ang, acc, lit) {
  ctx.beginPath(); for (let i = 0; i <= 120; i++) { const th = i / 120 * TAU, rr = r * Math.abs(Math.cos(3 * th)), x = cx + Math.cos(th + ang) * rr, y = cy + Math.sin(th + ang) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath();
  ctx.fillStyle = css(mix(acc, GOLD, 0.32), lit * 0.85); ctx.fill(); ctx.strokeStyle = goldS(lit, 0.6); ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = css(mix(acc, GOLD, 0.6), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, TAU); ctx.fill();
}
function o_branch(ctx, cx, cy, r, ang, acc, lit) {
  const rec = (x, y, a, len, d) => { const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; ctx.strokeStyle = css(mix(acc, GOLD, 0.3 + 0.3 * (3 - d) / 3), lit); ctx.lineWidth = Math.max(0.6, len * 0.13); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); if (d <= 0) { ctx.fillStyle = css(mix(acc, GOLD, 0.6), lit); ctx.beginPath(); ctx.arc(x2, y2, len * 0.22, 0, TAU); ctx.fill(); return; } rec(x2, y2, a - 0.5, len * 0.72, d - 1); rec(x2, y2, a + 0.5, len * 0.72, d - 1); };
  rec(cx, cy, ang, r * 0.85, 3);
}
function o_gasket(ctx, cx, cy, r, ang, acc, lit, depth) {
  ctx.strokeStyle = goldS(lit, 0.5); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  const n = 6; for (let i = 0; i < n; i++) { const a = ang + i / n * TAU, x = cx + Math.cos(a) * r * 0.55, y = cy + Math.sin(a) * r * 0.55, rr = r * 0.32; ctx.fillStyle = css(mix(acc, GOLD, 0.25 + 0.35 * (i / n)), lit * 0.8); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill(); ctx.strokeStyle = goldS(lit, 0.4); ctx.stroke(); if (depth > 0) o_gasket(ctx, x, y, rr * 0.66, a, acc, lit, depth - 1); }
  ctx.fillStyle = css(mix(acc, GOLD, 0.55), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, TAU); ctx.fill();
}
function o_spokes(ctx, cx, cy, r, ang, acc, lit) {
  const n = 12; ctx.strokeStyle = goldS(lit, 0.5); ctx.lineWidth = 0.8;
  for (let i = 0; i < n; i++) { const a = ang + i / n * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
  for (const rr of [r * 0.45, r * 0.8]) { ctx.strokeStyle = goldS(lit, 0.4); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = css(mix(acc, GOLD, 0.55), lit); ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, TAU); ctx.fill();
}
const ORNAMENTS = [o_romanesco, o_rose, o_branch, o_gasket, o_spokes];

// EXTRUDE + ORNAMENT over the tile graph (verbatim from v5/consoles.js).
export function drawWallFixture(ctx, scene, F, { accent = '#888', hue = 40, litAt = () => 1 } = {}) {
  const acc = hex2rgb(accent), cells = scene.paintCells, sp = scene.roomSpacing || 40, maxH = sp * 0.7, maxD = F.maxDist || 1;
  const fieldOf = (li) => (F.cells[li].base ? 0 : F.dist[li] / maxD);
  const zOf = (li) => (F.cells[li].base ? 0.1 : 0.14 + 0.72 * fieldOf(li)) * maxH;
  const litC = (li) => clamp(litAt(cells[F.cells[li].idx].x, cells[F.cells[li].idx].y), 0.22, 1.2);
  const vV = new Map(), vL = new Map();
  F.cells.forEach((cl, li) => { const c = cells[cl.idx], f = fieldOf(li), lt = litC(li); for (const p of c.poly) { const k = vkey(p[0], p[1]); let a = vV.get(k); if (!a) vV.set(k, a = [0, 0]); a[0] += f; a[1]++; let b = vL.get(k); if (!b) vL.set(k, b = [0, 0]); b[0] += lt; b[1]++; } });
  const vval = (p) => { const a = vV.get(vkey(p[0], p[1])); return a ? a[0] / a[1] : 0; };
  const vlit = (p) => { const a = vL.get(vkey(p[0], p[1])); return a ? a[0] / a[1] : 1; };
  const rampCol = (f) => mix(mix(GROUND, acc, 0.5), mix(acc, GOLD, 0.5), clamp(f, 0, 1));
  const sideDark = mix(GROUND, acc, 0.14), oi = F.seedN % ORNAMENTS.length, ornament = ORNAMENTS[oi], uiList = [];
  const UI_F = 0.72;
  const path = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
  const topCent = (li) => { const v = cells[F.cells[li].idx].poly, z = zOf(li); let x = 0, y = 0; for (const p of v) { x += p[0]; y += p[1]; } return [x / v.length, y / v.length - z]; };
  const order = F.cells.map((_, li) => li).sort((a, b) => topCent(a)[1] - topCent(b)[1]);
  ctx.strokeStyle = goldS(0.6, 0.18); ctx.lineWidth = 1;
  for (let li = 0; li < F.cells.length; li++) { const pa = F.parent[li]; if (pa < 0) continue; const A = topCent(li), B = topCent(pa); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
  for (const li of order) {
    const cl = F.cells[li], c = cells[cl.idx], v = c.poly, z = zOf(li), top = v.map((p) => [p[0], p[1] - z]);
    for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length], ta = top[i], tb = top[(i + 1) % v.length], front = (a[1] + b[1]) / 2 > c.y; ctx.fillStyle = css(sideDark, litC(li) * (front ? 0.5 : 0.3) + 0.04); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(tb[0], tb[1]); ctx.lineTo(ta[0], ta[1]); ctx.closePath(); ctx.fill(); }
    const tc = [top.reduce((s, p) => s + p[0], 0) / top.length, top.reduce((s, p) => s + p[1], 0) / top.length], cf = fieldOf(li), clt = litC(li);
    for (let i = 0; i < top.length; i++) {
      const va = v[i], vb = v[(i + 1) % v.length], f = (cf + vval(va) + vval(vb)) / 3, lt = (clt + vlit(va) + vlit(vb)) / 3;
      const col = cl.base ? mix(WALLC, acc, 0.42) : rampCol(f);
      ctx.fillStyle = css(col, lt * 0.66 + 0.2);
      ctx.beginPath(); ctx.moveTo(tc[0], tc[1]); ctx.lineTo(top[i][0], top[i][1]); ctx.lineTo(top[(i + 1) % top.length][0], top[(i + 1) % top.length][1]); ctx.closePath(); ctx.fill();
    }
    if (!cl.base) {
      if (cf >= UI_F) uiList.push({ top, tc });
      else {
        let r = 0; for (const p of v) r += Math.hypot(p[0] - c.x, p[1] - c.y); r /= v.length;
        const pa = F.parent[li]; let ang = Math.atan2(F.ny, F.nx); if (pa >= 0) { const B = topCent(pa); ang = Math.atan2(tc[1] - B[1], tc[0] - B[0]); }
        ornament(ctx, tc[0], tc[1], r * (0.7 + 0.5 * cf), ang, acc, clt * 0.8 + 0.25, cf > 0.5 ? 1 : 0);
      }
    }
  }
  if (uiList.length) {
    for (const u of uiList) { ctx.fillStyle = `hsl(${hue} 26% 5%)`; path(u.top); ctx.fill(); }
    for (const u of uiList) { ctx.strokeStyle = `hsla(${hue} 70% 55% / 0.22)`; ctx.lineWidth = 0.8; path(u.top); ctx.stroke(); }
    ctx.strokeStyle = `hsla(${hue} 85% 72% / 0.2)`; ctx.lineWidth = 0.6;
    for (const u of uiList) { let r = 0; for (const p of u.top) r += Math.hypot(p[0] - u.tc[0], p[1] - u.tc[1]); r /= u.top.length; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(u.tc[0] - r * 0.55, u.tc[1] + k * r * 0.42); ctx.lineTo(u.tc[0] + r * 0.55, u.tc[1] + k * r * 0.42); ctx.stroke(); } }
  }
  const tipZ = (0.14 + 0.72) * maxH, tx = F.tip.x, ty = F.tip.y - tipZ;
  for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(tx, ty, sp * 0.16 * i / 1.7, 0, TAU); ctx.fillStyle = `hsla(${hue} 85% 64% / ${0.05 + (3 - i) * 0.05})`; ctx.fill(); }
  ctx.beginPath(); ctx.arc(tx, ty, sp * 0.06, 0, TAU); ctx.fillStyle = `hsla(${hue} 75% 88% / 0.95)`; ctx.fill();
}

const CONSOLES = { CONSOLE_KINDS, ROLE_CONSOLE, growWallFixtures, drawWallFixture };
if (typeof globalThis !== 'undefined') globalThis.CONSOLES = CONSOLES;
export default CONSOLES;
