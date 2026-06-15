// lights.js — PHYSICAL LIGHT SOURCES that grow from the chamber walls, and the light field they cast.
//
// Every chamber has real emitters rooted on its wall membrane and growing INWARD "in interesting
// ways" (a deco bracket-sconce, a luminous branching coral, an angular crystal cluster). They glow
// in the CHAMBER'S HUE — which correlates with the component accent (one hue per chamber → fewer
// light×fixture colour combinations to reason about). So contrast inside a chamber comes from VALUE
// + SHAPE, not hue, and the emitters supply the chamber's occluded lighting (no faked central pool).
//
// Pure, deterministic, zero-dep. placeWallLights(scene, rng) → lights[]; lightField(lights) →
// litAt(x,y); drawWallLight(ctx, light, {hue, lit}).

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
import { bucketGrid } from './voronoi.js';   // ray-trace through the SAME tiling the chamber paints
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const LIGHT_KINDS = ['sconce', 'coral', 'crystal'];
export function lightGenome(rng) {
  return {
    kind: LIGHT_KINDS[(rng() * LIGHT_KINDS.length) | 0],
    len: 0.8 + rng() * 0.7,           // × roomSpacing
    depth: 3 + ((rng() * 2) | 0),     // coral recursion
    spread: 0.5 + rng() * 0.5,        // branch/shard fan
    shards: 3 + ((rng() * 3) | 0),
    seed: (rng() * 1e9) >>> 0,
  };
}

// place light sources on each room's wall membrane, growing toward the room centre.
export function placeWallLights(scene, rng, { perRoom = 3 } = {}) {
  const lights = [], sp = scene.roomSpacing || 40;
  for (const rc of scene.roomCells) {
    const seed = scene.roomSeeds[rc.id]; if (!seed) continue;
    const v = rc.poly; if (!v || v.length < 3) continue;
    const edges = [];
    for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; edges.push({ a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) }); }
    edges.sort((x, y) => y.L - x.L);
    const n = Math.min(perRoom, edges.length);
    for (let e = 0; e < n; e++) {
      const { a, b } = edges[e], t = 0.34 + rng() * 0.32;
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      let nx = seed.x - px, ny = seed.y - py; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const g = lightGenome(rng), len = sp * g.len;
      lights.push({ x: px, y: py, nx, ny, len, model: g, room: rc.id, tip: { x: px + nx * len * 0.82, y: py + ny * len * 0.82 } });
    }
  }
  return lights;
}

// the light field: ambient + an inverse-square-ish pool per emitter tip. litAt(x,y) ∈ [0, ~1.2].
export function lightField(lights, { ambient = 0.14, strength = 0.95 } = {}) {
  return (x, y) => {
    let v = ambient;
    for (const L of lights) { const dx = x - L.tip.x, dy = y - L.tip.y, R = L.len * 2.3; v += strength / (1 + (dx * dx + dy * dy) / (R * R)); }
    return clamp(v, 0, 1.2);
  };
}

// ── drawing — the structure (dark metal + gold) + a glow in the chamber hue at the luminous tips ──
const hsl = (h, s, l, a) => `hsla(${h} ${s}% ${clamp(l, 4, 96)}% / ${a == null ? 1 : a})`;
function glowAt(ctx, x, y, r, hue, lit) { for (let i = 4; i >= 1; i--) { ctx.beginPath(); ctx.arc(x, y, r * i / 1.7, 0, TAU); ctx.fillStyle = hsl(hue, 85, 62, (0.05 + (4 - i) * 0.05) * (0.6 + lit * 0.4)); ctx.fill(); } ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fillStyle = hsl(hue, 70, 88, 0.95); ctx.fill(); }
const GOLD = (lit, a) => `rgba(${(244 * lit) | 0},${(191 * lit) | 0},${(98 * lit) | 0},${a})`;

export function drawWallLight(ctx, L, { hue = 40, lit = 1 } = {}) {
  const g = L.model, ang = Math.atan2(L.ny, L.nx), len = L.len, rng = mulberry32(g.seed);
  ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(ang); ctx.lineCap = 'round'; ctx.lineJoin = 'round';   // +x = inward
  const metal = `hsl(${hue} 18% ${(13 * lit + 4).toFixed(0)}%)`;
  if (g.kind === 'sconce') {
    ctx.strokeStyle = GOLD(lit, 0.85); ctx.lineWidth = len * 0.07;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.28, len * 0.86, 0); ctx.stroke();   // the bracket arm
    ctx.strokeStyle = metal; ctx.lineWidth = len * 0.05; ctx.beginPath(); ctx.moveTo(0, -len * 0.12); ctx.lineTo(0, len * 0.12); ctx.stroke();   // wall plate
    glowAt(ctx, len * 0.86, 0, len * 0.16, hue, lit);
  } else if (g.kind === 'coral') {
    const grow = (x, y, a, l, d) => {
      const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
      ctx.strokeStyle = metal; ctx.lineWidth = Math.max(len * 0.02, l * 0.16); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      if (d <= 0) { glowAt(ctx, x2, y2, len * 0.1, hue, lit); return; }
      const s = g.spread * (0.5 + rng() * 0.5); grow(x2, y2, a - s, l * 0.72, d - 1); grow(x2, y2, a + s, l * 0.72, d - 1);
      if (rng() > 0.6) grow(x2, y2, a + (rng() - 0.5) * s, l * 0.6, d - 1);
    };
    grow(0, 0, 0, len * 0.5, g.depth);
  } else {                                                                         // crystal cluster
    for (let i = 0; i < g.shards; i++) {
      const a = (i / (g.shards - 1) - 0.5) * g.spread * 1.6, l = len * (0.5 + rng() * 0.6);
      const x2 = Math.cos(a) * l, y2 = Math.sin(a) * l, w = len * 0.12;
      ctx.beginPath(); ctx.moveTo(-Math.sin(a) * w, Math.cos(a) * w); ctx.lineTo(x2, y2); ctx.lineTo(Math.sin(a) * w, -Math.cos(a) * w); ctx.closePath();
      ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = GOLD(lit, 0.6); ctx.lineWidth = len * 0.015; ctx.stroke();
      glowAt(ctx, x2, y2, len * 0.09, hue, lit);
    }
  }
  ctx.restore();
}

// ── RAY-TRACED OCCLUSION through the voronoi tiling ─────────────────────────────────────────────
// Rasterise the tiling into a wall occupancy grid (nearest-nucleus → wall?), then for each light→
// point ray do an Amanatides-Woo voxel walk: a wall cell between source and target blocks it. Light
// therefore POOLS in its room and SPILLS THROUGH DOORWAYS (door cells are floor, not wall) — the
// dark-ship occluded look, physically. Colours accumulate per emitter hue, so a doorway catches a
// neighbour chamber's tint.
export function hslToRgb(h, s, l) { h /= 360; const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; }
export function tintLights(lights, hueOf, { sat = 0.72, lum = 0.6 } = {}) { for (const L of lights) { L.hue = hueOf(L.room); L.rgb = hslToRgb(L.hue, sat, lum); } return lights; }

export function occlusionGrid(scene, step) {
  step = step || (scene.wallSpacing || 10) * 0.5;
  const nx = Math.ceil(scene.W / step) + 1, ny = Math.ceil(scene.H / step) + 1;
  const grid = bucketGrid(scene.nuclei, Math.max(scene.roomSpacing, scene.wallSpacing) * 1.7);
  const wall = new Uint8Array(nx * ny);
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) {
    const x = gx * step, y = gy * step; let best = null, bd = Infinity;
    for (const q of grid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
    if (best && best.wall) wall[gy * nx + gx] = 1;
  }
  return { step, nx, ny, wall };
}
const isWallG = (occ, gx, gy) => (gx < 0 || gy < 0 || gx >= occ.nx || gy >= occ.ny ? 0 : occ.wall[gy * occ.nx + gx]);
export function visible(occ, x0, y0, x1, y1) {
  const s = occ.step; let gx = Math.floor(x0 / s), gy = Math.floor(y0 / s);
  const gx1 = Math.floor(x1 / s), gy1 = Math.floor(y1 / s), dx = x1 - x0, dy = y1 - y0;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx !== 0 ? Math.abs(s / dx) : Infinity, tdy = dy !== 0 ? Math.abs(s / dy) : Infinity;
  let tmx = dx !== 0 ? (sx > 0 ? (gx + 1) * s - x0 : x0 - gx * s) / Math.abs(dx) : Infinity;
  let tmy = dy !== 0 ? (sy > 0 ? (gy + 1) * s - y0 : y0 - gy * s) / Math.abs(dy) : Infinity;
  let guard = 0;
  while (!(gx === gx1 && gy === gy1) && guard++ < 8192) {
    if (tmx < tmy) { gx += sx; tmx += tdx; } else { gy += sy; tmy += tdy; }
    if (gx === gx1 && gy === gy1) break;
    if (isWallG(occ, gx, gy)) return 0;     // a wall lies between → occluded
  }
  return 1;
}

// accumulate colour from every VISIBLE emitter at a point (inverse-square-ish falloff × hue).
export function lightAtRGB(lights, occ, x, y, { ambient = 0.05, strength = 1, reach = 2.4 } = {}) {
  let r = ambient, g = ambient, b = ambient;
  for (const L of lights) {
    const dx = x - L.tip.x, dy = y - L.tip.y, R = L.len * reach, fall = strength / (1 + (dx * dx + dy * dy) / (R * R));
    if (fall < 0.015 || !visible(occ, L.tip.x, L.tip.y, x, y)) continue;
    r += L.rgb[0] * fall; g += L.rgb[1] * fall; b += L.rgb[2] * fall;
  }
  return [r, g, b];
}
// bake a colour per FLOOR paint-cell (walls/void → null).
export function bakeFloorRGB(scene, lights, occ, opts = {}) {
  const out = new Array(scene.paintCells.length).fill(null);
  for (let i = 0; i < scene.paintCells.length; i++) { const c = scene.paintCells[i]; if (c.wall || c.room == null) continue; out[i] = lightAtRGB(lights, occ, c.x, c.y, opts); }
  return out;
}

const LIGHTS = { mulberry32, LIGHT_KINDS, lightGenome, placeWallLights, lightField, drawWallLight,
  hslToRgb, occlusionGrid, visible, tintLights, bakeFloorRGB, lightAtRGB };
if (typeof globalThis !== 'undefined') globalThis.LIGHTS = LIGHTS;
export default LIGHTS;
