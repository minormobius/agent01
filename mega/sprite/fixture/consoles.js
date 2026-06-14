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
    const tipCells = claimed.filter((c) => c.tier > 0.7); const tip = tipCells.length
      ? { x: tipCells.reduce((s, c) => s + cells[c.idx].x, 0) / tipCells.length, y: tipCells.reduce((s, c) => s + cells[c.idx].y, 0) / tipCells.length }
      : { x: best.mx + nx * reach * 0.7, y: best.my + ny * reach * 0.7 };
    out.push({ room: rc.id, kind, nx, ny, tx, ty, halfW, reach, seedN, anchor: best, cells: claimed, tip });
  }
  return out;
}

// repaint the claimed cells with the fixture's alternate attributes, lit by the ray-traced field.
export function drawWallFixture(ctx, scene, F, { accent = '#888', hue = 40, litAt = () => 1 } = {}) {
  const acc = hex2rgb(accent), cells = scene.paintCells, peak = hue;
  const poly = (p) => { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); };
  for (const cl of F.cells) {
    const c = cells[cl.idx], lit = clamp(litAt(c.x, c.y), 0.22, 1.2), t = cl.tier;
    let col;
    if (cl.base) col = mix(WALLC, acc, 0.4);                                   // HALF ROOM — wall, marked
    else {
      col = mix(mix(GROUND, acc, 0.45), mix(acc, GOLD, 0.4), t);               // HALF ASSET — rises to gold
      if (F.kind === 'shelf') col = mix(col, GOLD, (Math.floor(cl.w / (scene.roomSpacing * 0.18)) % 2) ? 0.35 : 0);   // shelved bands
      if (F.kind === 'storage') col = mix(col, [0, 0, 0], 0.12);
    }
    ctx.fillStyle = (cl.base) ? css(col, lit * 0.8 + 0.06) : css(col, lit * 0.7 + 0.18);
    poly(c.poly); ctx.fill();
    // gold seams trace the asset's cell facets
    if (!cl.base) { ctx.strokeStyle = goldS(lit, 0.25 + t * 0.45); ctx.lineWidth = 0.7; poly(c.poly); ctx.stroke(); }
  }
  // the eruption FACE — kind-specific emissive treatment near the tip
  const tipCells = F.cells.filter((c) => c.tier > 0.72);
  if (F.kind === 'arcade' || F.kind === 'vendor') {
    for (const cl of tipCells) { const c = cells[cl.idx]; ctx.fillStyle = `hsla(${peak} 82% ${(46 + 16 * clamp(litAt(c.x, c.y), 0, 1)).toFixed(0)}% / 0.9)`; poly(c.poly); ctx.fill(); ctx.strokeStyle = goldS(1, 0.5); ctx.lineWidth = 0.8; poly(c.poly); ctx.stroke(); }
  }
  // a soft emissive halo + a bright interaction node at the tip (reads as ACTIVE)
  const sp = scene.roomSpacing || 40;
  for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(F.tip.x, F.tip.y, sp * 0.18 * i / 1.7, 0, 6.283); ctx.fillStyle = `hsla(${peak} 85% 62% / ${0.05 + (3 - i) * 0.04})`; ctx.fill(); }
  ctx.beginPath(); ctx.arc(F.tip.x, F.tip.y, sp * 0.08, 0, 6.283); ctx.fillStyle = `hsla(${peak} 75% 84% / 0.95)`; ctx.fill();
}

const CONSOLES = { CONSOLE_KINDS, ROLE_CONSOLE, growWallFixtures, drawWallFixture, profile };
if (typeof globalThis !== 'undefined') globalThis.CONSOLES = CONSOLES;
export default CONSOLES;
