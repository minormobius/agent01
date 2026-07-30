// swarm.js — the BEE-SWARM combat sprite, a compact vendor of the appearance layer from the Sprite Lab's
// bee kernel (mega/bees/swarm.js). That kernel splits a swarm into APPEARANCE (a baked micro-atlas of one
// ~3px bee) + MOTION (a live boids sim). For a battle sprite we only want the appearance, composed into a
// still CLOUD of bees that shimmers off the walk phase — so this copies the bee-pixel primitives (BODY /
// WINGS / beeColors / rotateCells / beeCells, verbatim from swarm.js) and adds buildSwarmGenome / swarmFrame
// in the SAME shape as the other beast kernels (poly/quad/axial/isopod): G.{w,h,seed,_plan}, frame → cells
// {x,y,c}. No boids sim, no DOM. Deterministic from the seed + the frame phase (no Date.now/Math.random).
//
// Re-sync the bee primitives from mega/bees/swarm.js if that kernel's look changes (the vendor discipline).

import { rngFor } from './sprite-core.js';

const TAU = Math.PI * 2;

// ── one bee, in local cell coords, nominally facing +x (copied from mega/bees/swarm.js) ──
const BODY = [
  { x: 1, y: 0, k: 'head' },   // head (dark, leads the heading)
  { x: 0, y: 0, k: 'thorax' }, // thorax (bright amber)
  { x: -1, y: 0, k: 'abdo' },  // abdomen (banded amber)
];
const WINGS = [
  [{ x: 0, y: -1, k: 'wingA' }, { x: 0, y: 1, k: 'wingA' }], // frame 0 — wings out
  [{ x: 0, y: -1, k: 'wingB' }, { x: 0, y: 1, k: 'wingB' }], // frame 1 — retracted (the buzz flicker)
];
function beeColors(seed) {
  const rnd = rngFor(seed + '::col');
  const hue = 38 + (rnd() * 12 - 6), sat = 82 + rnd() * 10;   // amber, small per-swarm jitter
  return {
    head: `hsl(${hue.toFixed(0)} ${(sat - 30).toFixed(0)}% 20%)`,
    thorax: `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 53%)`,
    abdo: `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 40%)`,
    wingA: 'rgba(222,228,240,0.85)',
    wingB: 'rgba(210,216,232,0.30)',
  };
}
// the ROBOT drone-swarm palette: grey/black metal, steel wings — a player's summoned construct (vs the
// organic amber of an enemy bee swarm), so the two read apart at a glance.
function robotColors(seed) {
  const rnd = rngFor(seed + '::rbt'), lum = 44 + rnd() * 8;
  return {
    head: 'hsl(210 6% 10%)',                       // near-black sensor head
    thorax: `hsl(210 5% ${lum.toFixed(0)}%)`,       // brushed grey body
    abdo: `hsl(210 6% ${(lum - 16).toFixed(0)}%)`,  // darker grey tail
    wingA: 'rgba(196,206,216,0.8)',                 // steel rotor
    wingB: 'rgba(150,160,172,0.28)',
  };
}
// rotate a base cell by angle, snap to the pixel lattice; head pixel wins collisions (legible silhouette).
function rotateCells(cells, ang, colors) {
  const c = Math.cos(ang), s = Math.sin(ang), seen = new Map();
  for (const cell of cells) {
    const x = Math.round(cell.x * c - cell.y * s), y = Math.round(cell.x * s + cell.y * c), key = x + ',' + y;
    const pri = cell.k === 'head' ? 3 : (cell.k === 'wingA' || cell.k === 'wingB') ? 1 : 2;
    const prev = seen.get(key);
    if (!prev || pri > prev.pri) seen.set(key, { x, y, c: colors[cell.k], pri });
  }
  return [...seen.values()].map(({ x, y, c }) => ({ x, y, c }));
}
function beeCells(angle, wing, colors) { return rotateCells([...BODY, ...WINGS[wing & 1]], angle, colors); }

// ── the SWARM sprite: a deterministic cloud of bees in a w×h box, each with a home point + orbit phase ──
export const FAMILIES = { swarm: {} };   // (parity with the other kernels; one look for now)
export function buildSwarmGenome(seed, genes = {}) {
  const rnd = rngFor('swarm:' + seed), colors = genes.robot ? robotColors('swarm:' + seed) : beeColors('swarm:' + seed);
  const count = Math.max(8, Math.min(40, genes.count || 22));
  const w = genes.w || 30, h = genes.h || 26, cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.42;
  const bees = [];
  for (let i = 0; i < count; i++) {
    // a Gaussian-ish clump toward the centre (two rolls averaged), each bee with its own orbit phase/heading
    const ux = (rnd() + rnd()) / 2 - 0.5, uy = (rnd() + rnd()) / 2 - 0.5;
    bees.push({ hx: cx + ux * 2 * rad, hy: cy + uy * 2 * rad, phase: rnd() * TAU, spin: rnd() * TAU, orbit: 0.8 + rnd() * 1.6, ang: rnd() * TAU });
  }
  return { _plan: 'swarm', seed: 'swarm:' + seed, w, h, colors, bees, count };
}
// one frame: each bee orbits its home point (phase advanced by t) and flickers its wings → a buzzing cloud.
export function swarmFrame(G, t) {
  const seen = new Map();
  const put = (x, y, c, pri) => { if (x < 0 || y < 0 || x >= G.w || y >= G.h) return; const key = x + ',' + y, prev = seen.get(key); if (!prev || pri > prev.pri) seen.set(key, { x, y, c, pri }); };
  const phi = (t || 0) * TAU;
  for (let i = 0; i < G.bees.length; i++) {
    const b = G.bees[i];
    const bx = Math.round(b.hx + Math.cos(b.phase + phi) * b.orbit);
    const by = Math.round(b.hy + Math.sin(b.spin + phi * 1.3) * b.orbit);
    const wing = (Math.floor((t || 0) * 4) + i) & 1;
    for (const cell of beeCells(b.ang, wing, G.colors)) put(bx + cell.x, by + cell.y, cell.c, cell.c === G.colors.head ? 3 : (cell.c === G.colors.wingA || cell.c === G.colors.wingB) ? 1 : 2);
  }
  return [...seen.values()].map(({ x, y, c }) => ({ x, y, c }));
}

// ── THE BOIDS SIM (vendored from mega/bees/swarm.js — the real swarm MOTION for the battle board) ──────
// Appearance (above) is baked; MOTION is a live boids-lite + curl-noise agent sim, so the cloud reacts and
// never repeats. Struct-of-arrays + a pure fixed-timestep step(). The battle overlay steps one small sim
// per swarm unit and stamps beeCells at each bee — so a swarm literally occupies a spread of board.

export { beeCells };   // the overlay stamps one bee at each boid position

// velocity heading → atlas bin (kept for parity with the lab; the overlay derives the bee angle live).
export function headingBin(angle, headings) { let a = angle % TAU; if (a < 0) a += TAU; return Math.round((a / TAU) * headings) % headings; }

// cheap deterministic value-noise → curl, for divergence-free turbulence (bees swirl, don't drain to a sink).
function hash2(ix, iy, t) { let h = (ix * 374761393 + iy * 668265263 + t * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const smoothN = (u) => u * u * (3 - 2 * u);
function vnoise(x, y, t) { const ix = Math.floor(x), iy = Math.floor(y), fx = smoothN(x - ix), fy = smoothN(y - iy); const a = hash2(ix, iy, t), b = hash2(ix + 1, iy, t), c = hash2(ix, iy + 1, t), d = hash2(ix + 1, iy + 1, t); return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy; }
function curl(x, y, t) { const e = 0.35, dPdy = (vnoise(x, y + e, t) - vnoise(x, y - e, t)) / (2 * e), dPdx = (vnoise(x + e, y, t) - vnoise(x - e, y, t)) / (2 * e); return { x: dPdy, y: -dPdx }; }

// battle-tuned params: a tight, buzzing knot that orbits the unit's centre (scaled for a small px box).
export const BATTLE_SWARM_PARAMS = { follow: 46, swirl: 40, cohesion: 6, alignment: 10, separation: 70, wander: 62, noiseFreq: 0.05, noiseDrift: 0.7, windX: 0, windY: 0, maxSpeed: 48, drag: 0.86, neighborRadius: 15, sepRadius: 6 };

export class Swarm {
  constructor(opts = {}) {
    this.w = opts.width || 120; this.h = opts.height || 120;
    this.count = Math.max(1, Math.min(200, opts.count | 0 || 22));
    this.params = { ...BATTLE_SWARM_PARAMS, ...(opts.params || {}) };
    this.headings = 8; this.seed = opts.seed || 'hive:0';
    this.target = { x: this.w * 0.5, y: this.h * 0.5 };
    this.t = 0; this.acc = 0; this.H = 1 / 60;
    const n = this.count;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.phase = new Uint8Array(n);
    const rnd = rngFor(this.seed + '::init');
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = rnd() * Math.min(this.w, this.h) * 0.3; this.px[i] = this.target.x + Math.cos(a) * r; this.py[i] = this.target.y + Math.sin(a) * r; const sp = 8 + rnd() * 18, va = rnd() * TAU; this.vx[i] = Math.cos(va) * sp; this.vy[i] = Math.sin(va) * sp; this.phase[i] = (rnd() * 256) | 0; }
    this._grid = new Map();
  }
  setTarget(x, y) { this.target.x = x; this.target.y = y; }
  step(dt) { this.acc += Math.min(dt, 0.1); let guard = 0; while (this.acc >= this.H && guard++ < 8) { this._sub(this.H); this.acc -= this.H; this.t += this.H; } }
  _rebuildGrid() { const g = this._grid; g.clear(); const cs = Math.max(6, this.params.neighborRadius); this._cs = cs; for (let i = 0; i < this.count; i++) { const key = Math.floor(this.px[i] / cs) + ',' + Math.floor(this.py[i] / cs); let bk = g.get(key); if (!bk) { bk = []; g.set(key, bk); } bk.push(i); } }
  _sub(h) {
    const P = this.params, g = this._grid, cs = (this._rebuildGrid(), this._cs);
    const nr2 = P.neighborRadius * P.neighborRadius, sr2 = P.sepRadius * P.sepRadius, noiseT = Math.floor(this.t * P.noiseDrift), tx = this.target.x, ty = this.target.y, margin = 6;
    for (let i = 0; i < this.count; i++) {
      const x = this.px[i], y = this.py[i]; let ax = 0, ay = 0;
      let dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1e-3;
      ax += (dx / d) * P.follow; ay += (dy / d) * P.follow; ax += (-dy / d) * P.swirl; ay += (dx / d) * P.swirl;
      let sepx = 0, sepy = 0, cx = 0, cy = 0, ax2 = 0, ay2 = 0, nN = 0; const gcx = Math.floor(x / cs), gcy = Math.floor(y / cs);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const bucket = g.get((gcx + ox) + ',' + (gcy + oy)); if (!bucket) continue; for (let b = 0; b < bucket.length; b++) { const j = bucket[b]; if (j === i) continue; const jx = this.px[j] - x, jy = this.py[j] - y, dd = jx * jx + jy * jy; if (dd > nr2) continue; if (dd < sr2) { const inv = 1 / (Math.sqrt(dd) + 1e-3); sepx -= jx * inv; sepy -= jy * inv; } cx += this.px[j]; cy += this.py[j]; ax2 += this.vx[j]; ay2 += this.vy[j]; nN++; } }
      if (nN > 0) { cx = cx / nN - x; cy = cy / nN - y; const cl = Math.hypot(cx, cy) || 1; ax += (cx / cl) * P.cohesion; ay += (cy / cl) * P.cohesion; const al = Math.hypot(ax2, ay2) || 1; ax += (ax2 / al) * P.alignment; ay += (ay2 / al) * P.alignment; }
      const sl = Math.hypot(sepx, sepy); if (sl > 0) { ax += (sepx / sl) * P.separation; ay += (sepy / sl) * P.separation; }
      const cn = curl(x * P.noiseFreq, y * P.noiseFreq, noiseT); ax += cn.x * P.wander; ay += cn.y * P.wander; ax += P.windX; ay += P.windY;
      if (x < margin) ax += (margin - x) * 2; else if (x > this.w - margin) ax += (this.w - margin - x) * 2;
      if (y < margin) ay += (margin - y) * 2; else if (y > this.h - margin) ay += (this.h - margin - y) * 2;
      let vx = this.vx[i] + ax * h, vy = this.vy[i] + ay * h; const damp = Math.pow(P.drag, h); vx *= damp; vy *= damp; const sp = Math.hypot(vx, vy); if (sp > P.maxSpeed) { const k = P.maxSpeed / sp; vx *= k; vy *= k; } this.vx[i] = vx; this.vy[i] = vy; this.px[i] = x + vx * h; this.py[i] = y + vy * h;
    }
  }
  // read each bee for drawing: cb(px, py, angle, wing, i). Pure — never mutates. Wing shimmers off a buzz clock.
  forEachBee(cb, buzzHz = 20) { const slot = Math.floor(this.t * buzzHz); for (let i = 0; i < this.count; i++) { cb(this.px[i], this.py[i], Math.atan2(this.vy[i], this.vx[i]), (slot + this.phase[i]) & 1, i); } }
}

export default { buildSwarmGenome, swarmFrame, FAMILIES, Swarm, beeCells, BATTLE_SWARM_PARAMS };
