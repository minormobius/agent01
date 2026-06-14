// consoles.js — a SECOND active fixture per chamber: a wall-mounted interaction point (storage /
// bookshelf / arcade / vendor). Mounts on a wall like the light sconces but is an interactable, not
// an emitter — drawn in the deco-painterly hand (faceted fbm body + gold trim + a kind-specific
// face), lit by the ray-traced field (value contrast; hue owned by the chamber light). One per room,
// placed on the wall edge farthest from that room's lights so the two fixtures don't crowd.
//
// Pure, deterministic. placeConsoles(scene, rng, {avoid}) → consoles[]; drawConsole(ctx, C, opts).

import { fbm, mulberry32 } from './deco.js';
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hex2rgb = (h) => { const c = h.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, l) => `rgb(${clamp(c[0] * l, 0, 255) | 0},${clamp(c[1] * l, 0, 255) | 0},${clamp(c[2] * l, 0, 255) | 0})`;
const GROUND = [11, 13, 17], GOLD = [244, 191, 98];
const goldS = (l, a) => `rgba(${(244 * l) | 0},${(191 * l) | 0},${(98 * l) | 0},${a})`;

export const CONSOLE_KINDS = ['storage', 'shelf', 'arcade', 'vendor'];
// the chamber's role suggests the apt console (a second interaction that suits the place)
export const ROLE_CONSOLE = {
  store: 'storage', move: 'storage', make: 'storage', mend: 'storage',
  learn: 'shelf', govern: 'shelf', worship: 'shelf',
  play: 'arcade', serve: 'arcade',
  heal: 'vendor', grow: 'vendor', trade: 'vendor', dwell: 'vendor',
};
export function consoleGenome(rng, kind) {
  return {
    kind: kind || CONSOLE_KINDS[(rng() * CONSOLE_KINDS.length) | 0],
    w: 0.9 + rng() * 0.5,           // × roomSpacing, along the wall
    depth: 0.34 + rng() * 0.16,     // × roomSpacing, into the room
    cols: 3 + ((rng() * 3) | 0), rows: 2 + ((rng() * 2) | 0),
    seed: (rng() * 1e9) >>> 0,
  };
}

// one console per room, on the wall edge whose midpoint is farthest from `avoid[room]` (the lights).
export function placeConsoles(scene, rng, { avoid = {}, kindOf } = {}) {
  const out = [], sp = scene.roomSpacing || 40;
  for (const rc of scene.roomCells) {
    const seed = scene.roomSeeds[rc.id]; if (!seed) continue;
    const v = rc.poly; if (!v || v.length < 3) continue;
    const av = avoid[rc.id] || [];
    let best = null, bestScore = -1;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < sp * 0.9) continue;                       // need room for the cabinet
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let near = Infinity; for (const p of av) near = Math.min(near, (p.x - mx) ** 2 + (p.y - my) ** 2);
      const score = (av.length ? near : L) + L;          // prefer far-from-lights, long-enough edges
      if (score > bestScore) { bestScore = score; best = { a, b, mx, my, L }; }
    }
    if (!best) continue;
    let nx = seed.x - best.mx, ny = seed.y - best.my; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const kind = kindOf ? kindOf(rc.id) : null, g = consoleGenome(rng, kind);
    const dep = sp * g.depth;
    out.push({ x: best.mx, y: best.my, nx, ny, model: g, room: rc.id, face: { x: best.mx + nx * dep, y: best.my + ny * dep } });
  }
  return out;
}

// ── draw — a wall cabinet seen top-down: extends inward (+x), spans the wall (±y) ────────────────
export function drawConsole(ctx, C, { hue = 40, lit = 1, accent = '#888', sp = 40 } = {}) {
  const g = C.model, w = g.w * sp, dep = g.depth * sp, acc = hex2rgb(accent), rng = mulberry32(g.seed);
  const body = [mix(GROUND, acc, 0.16), mix(GROUND, acc, 0.45), mix(GROUND, acc, 0.7)];
  ctx.save(); ctx.translate(C.x, C.y); ctx.rotate(Math.atan2(C.ny, C.nx)); ctx.lineJoin = 'round'; ctx.lineCap = 'round';   // +x = inward
  // dark backing flush to the wall (so it reads as mounted, against the lit floor)
  ctx.fillStyle = 'rgba(4,5,9,0.8)'; ctx.fillRect(-2, -w / 2 - 2, dep + 2, w + 4);
  // faceted painterly body (grid of facets tinted by fBm)
  for (let cx = 0; cx < g.cols; cx++) for (let cy = 0; cy < g.rows; cy++) {
    const x0 = (cx / g.cols) * dep, x1 = ((cx + 1) / g.cols) * dep, y0 = -w / 2 + (cy / g.rows) * w, y1 = -w / 2 + ((cy + 1) / g.rows) * w;
    const n = fbm((cx + 0.5) * 1.7 + 2, (cy + 0.5) * 1.7 + 2, g.seed, 3);
    let col = mix(body[0], body[2], clamp(n * 1.1, 0, 1)); col = mix(col, [0, 0, 0], 0.12);
    ctx.fillStyle = css(col, lit); ctx.fillRect(x0, y0, x1 - x0 + 0.4, y1 - y0 + 0.4);
  }
  // gold trim on the room-facing edge + corners
  ctx.strokeStyle = goldS(lit, 0.85); ctx.lineWidth = sp * 0.03; ctx.strokeRect(0, -w / 2, dep, w);
  ctx.strokeStyle = goldS(lit, 0.5); ctx.lineWidth = sp * 0.016; ctx.beginPath(); ctx.moveTo(dep, -w / 2); ctx.lineTo(dep, w / 2); ctx.stroke();
  // kind-specific face
  const faceX = dep * 0.58;
  if (g.kind === 'storage') {                              // drawers + handles
    ctx.strokeStyle = goldS(lit, 0.5); ctx.lineWidth = sp * 0.012;
    for (let i = 1; i < g.rows + 1; i++) { const y = -w / 2 + (i / (g.rows + 1)) * w; ctx.beginPath(); ctx.moveTo(dep * 0.12, y); ctx.lineTo(dep * 0.92, y); ctx.stroke(); ctx.fillStyle = goldS(lit, 0.8); ctx.beginPath(); ctx.arc(faceX, y, sp * 0.03, 0, 6.283); ctx.fill(); }
  } else if (g.kind === 'shelf') {                         // shelves of small faceted goods
    for (let i = 0; i < g.rows; i++) { const y = -w / 2 + (i + 0.5) / g.rows * w; let x = dep * 0.12; while (x < dep * 0.9) { const bw = sp * (0.05 + rng() * 0.07); ctx.fillStyle = css(mix(acc, GOLD, rng() * 0.5), lit * (0.7 + rng() * 0.4)); ctx.fillRect(x, y - sp * 0.07, bw, sp * 0.13); x += bw + sp * 0.02; } }
  } else if (g.kind === 'arcade') {                        // an emissive screen + a control nub
    ctx.fillStyle = `hsla(${hue} 80% ${(38 + 22 * lit).toFixed(0)}% / 0.95)`; ctx.fillRect(dep * 0.18, -w * 0.32, dep * 0.64, w * 0.5);
    ctx.strokeStyle = `hsla(${hue} 80% 70% / 0.5)`; ctx.lineWidth = sp * 0.01; for (let i = 0; i < 4; i++) { const y = -w * 0.32 + (i / 4) * w * 0.5; ctx.beginPath(); ctx.moveTo(dep * 0.18, y); ctx.lineTo(dep * 0.82, y); ctx.stroke(); }
    ctx.fillStyle = goldS(lit, 0.9); ctx.beginPath(); ctx.arc(faceX, w * 0.34, sp * 0.05, 0, 6.283); ctx.fill();
  } else {                                                  // vendor: a grid of compartments + a slot
    for (let i = 0; i < g.cols; i++) for (let j = 0; j < g.rows; j++) { ctx.strokeStyle = goldS(lit, 0.4); ctx.lineWidth = sp * 0.01; ctx.strokeRect(dep * (0.12 + 0.76 * i / g.cols), -w * 0.36 + w * 0.7 * j / g.rows, dep * 0.7 / g.cols, w * 0.62 / g.rows); }
    ctx.fillStyle = `hsla(${hue} 70% ${(30 + 18 * lit).toFixed(0)}% / 0.85)`; ctx.fillRect(dep * 0.2, w * 0.3, dep * 0.6, w * 0.1);
  }
  // interaction indicator — a soft bright node so it reads as ACTIVE (cousin of the component)
  ctx.fillStyle = goldS(1, 0.18); ctx.beginPath(); ctx.arc(dep * 0.5, 0, sp * 0.14, 0, 6.283); ctx.fill();
  ctx.fillStyle = `hsla(${hue} 75% 82% / 0.95)`; ctx.beginPath(); ctx.arc(dep * 0.5, 0, sp * 0.045, 0, 6.283); ctx.fill();
  ctx.restore();
}

const CONSOLES = { CONSOLE_KINDS, ROLE_CONSOLE, consoleGenome, placeConsoles, drawConsole };
if (typeof globalThis !== 'undefined') globalThis.CONSOLES = CONSOLES;
export default CONSOLES;
