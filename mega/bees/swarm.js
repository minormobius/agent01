// bees/swarm.js — the PURE bee-swarm kernel. No DOM, no canvas. Sister to sprite/core.js.
//
// The design split (see the discussion that spawned this): a swarm is TWO problems.
//   • APPEARANCE  — what one bee looks like. A bee is ~3px; identity doesn't matter. So we
//                   BAKE a tiny micro-atlas ONCE (a few heading bins × 2 wingbeat frames),
//                   fully deterministic from a seed → a PORTABLE asset, exactly like a sprite
//                   genome. The engine fetches it once and instances it. We never recompute a
//                   bee's pixels per frame (that's the people-sprite path; wasteful for a swarm).
//   • MOTION      — where each bee IS. This is a live agent sim (boids-lite + curl-noise), NOT a
//                   baked loop: a loop either synchronises every bee (uncanny) or rides fixed
//                   rails that ignore the player/wind/flower. The sim reacts and never repeats.
//
// Consumed three ways from one source, like core.js:
//   • the browser lab  (bees/index.html → step() the sim, stamp the atlas to <canvas>)
//   • the HTTP API     (worker.js → beeSVG()/beeAtlas() — the bake, no canvas needed)
//   • the node selftest (swarm.selftest.mjs)
//
// The sim is written in struct-of-arrays form with a pure fixed-timestep step(): that is exactly
// the shape a WebGPU compute pass / Rust loop wants, so this CPU kernel is a faithful preview of
// the GPU version, not a throwaway. fluoddity/engine.js is the reference if/when a shared scent
// field (true stigmergy) is layered on top — boids-lite is the cheap tier we ship first.

import { xmur3, mulberry32 } from '../sprite/core.js';

const TAU = Math.PI * 2;
const rngFor = (s) => mulberry32(xmur3(s)());

// ── APPEARANCE: the baked bee micro-atlas ────────────────────────────────────────────────────
// One bee in LOCAL cell coords, centred at (0,0), nominally facing East (+x). Three body pixels
// (head / thorax / banded abdomen) plus wings that flicker between two frames to read as buzz.
// Everything is rotated into `headings` bins and stamped — at 3px we pick a bin by velocity angle,
// the same heading→bin trick the people sprite uses for its 8 directions.
const BODY = [
  { x: 1, y: 0, k: 'head' },   // head (dark, leads the heading)
  { x: 0, y: 0, k: 'thorax' }, // thorax (bright amber)
  { x: -1, y: 0, k: 'abdo' },  // abdomen (banded amber)
];
// wing frames: symmetric flicker above & below the thorax. Frame A wings out, frame B retracted —
// the alternation shimmers in place = a buzzing blur, no per-bee phase rails.
const WINGS = [
  [{ x: 0, y: -1, k: 'wingA' }, { x: 0, y: 1, k: 'wingA' }], // frame 0
  [{ x: 0, y: -1, k: 'wingB' }, { x: 0, y: 1, k: 'wingB' }], // frame 1
];

function beeColors(seed) {
  const rnd = rngFor(seed + '::col');
  const hue = 38 + (rnd() * 12 - 6);          // amber, small per-swarm jitter
  const sat = 82 + rnd() * 10;
  return {
    head: `hsl(${hue.toFixed(0)} ${(sat - 30).toFixed(0)}% 20%)`,
    thorax: `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 53%)`,
    abdo: `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 40%)`,
    wingA: 'rgba(222,228,240,0.85)',
    wingB: 'rgba(210,216,232,0.30)',
  };
}

// rotate a base cell by angle and snap to the integer pixel lattice; head pixel wins collisions.
function rotateCells(cells, ang, colors) {
  const c = Math.cos(ang), s = Math.sin(ang), seen = new Map();
  for (const cell of cells) {
    const x = Math.round(cell.x * c - cell.y * s);
    const y = Math.round(cell.x * s + cell.y * c);
    const key = x + ',' + y;
    // priority so the silhouette stays legible after snapping: head > thorax/abdo > wings
    const pri = cell.k === 'head' ? 3 : (cell.k === 'wingA' || cell.k === 'wingB') ? 1 : 2;
    const prev = seen.get(key);
    if (!prev || pri > prev.pri) seen.set(key, { x, y, c: colors[cell.k], pri });
  }
  return [...seen.values()].map(({ x, y, c }) => ({ x, y, c }));
}

// cells for ONE arbitrary heading (radians) + wing frame — used by the single-bee SVG.
export function beeCells(seed, angle, wing, colors) {
  colors = colors || beeColors(seed);
  return rotateCells([...BODY, ...WINGS[wing & 1]], angle, colors);
}

// Bake the full atlas: `headings` bins around the circle × 2 wing frames. This is the artifact a
// Rust/WebGPU engine uploads to a texture once, then instances — the whole point of "bake, don't
// compute". Returns { seed, headings, frames, colors, cells:[bin][frame] -> [{x,y,c}] }.
export function beeAtlas(seed, opts = {}) {
  const headings = Math.max(4, Math.min(32, opts.headings | 0 || 8));
  const colors = beeColors(seed);
  const cells = [];
  for (let h = 0; h < headings; h++) {
    const ang = (h / headings) * TAU;
    cells.push([beeCells(seed, ang, 0, colors), beeCells(seed, ang, 1, colors)]);
  }
  return { seed, headings, frames: 2, colors, cells };
}

// map a velocity heading (radians) to an atlas bin.
export function headingBin(angle, headings) {
  let a = angle % TAU; if (a < 0) a += TAU;
  return Math.round((a / TAU) * headings) % headings;
}

// Single-bee SVG (portable appearance asset, canvas-free — same role as frameSVG in core.js).
export function beeSVG(seed, angleDeg, wing, scale) {
  scale = scale || 14;
  const ang = (angleDeg || 0) * Math.PI / 180;
  const cells = beeCells(seed, ang, wing || 0);
  const pad = 3, side = (pad * 2 + 1) * scale; // a small fixed frame around the centred bee
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">`;
  for (const r of cells) {
    s += `<rect x="${(r.x + pad) * scale}" y="${(r.y + pad) * scale}" width="${scale}" height="${scale}" fill="${r.c}"/>`;
  }
  return s + `</svg>`;
}

// ── MOTION: cheap deterministic value-noise → curl, for organic turbulence (no shared field) ──
// A scalar potential P(x,y,t); the swarm wander force is curl(P) = (∂P/∂y, −∂P/∂x). Divergence-free,
// so bees swirl instead of all draining toward one sink — the "chaos" a baked loop can't give.
function hash2(ix, iy, t) {
  let h = (ix * 374761393 + iy * 668265263 + t * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296; // 0..1
}
function smooth(u) { return u * u * (3 - 2 * u); }
function vnoise(x, y, t) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy, t), b = hash2(ix + 1, iy, t);
  const c = hash2(ix, iy + 1, t), d = hash2(ix + 1, iy + 1, t);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
function curl(x, y, t) {
  const e = 0.35;
  const dPdy = (vnoise(x, y + e, t) - vnoise(x, y - e, t)) / (2 * e);
  const dPdx = (vnoise(x + e, y, t) - vnoise(x - e, y, t)) / (2 * e);
  return { x: dPdy, y: -dPdx };
}

export const DEFAULT_PARAMS = {
  follow: 70,        // pull toward the attractor (flower/hive)
  swirl: 34,         // tangential component → bees orbit the flower instead of collapsing onto it
  cohesion: 9,       // steer toward neighbour centroid
  alignment: 14,     // match neighbour heading
  separation: 130,   // push off close neighbours (short range, strong — keeps it from clumping)
  wander: 95,        // curl-noise turbulence strength
  noiseFreq: 0.012,  // spatial scale of the turbulence
  noiseDrift: 0.6,   // how fast the noise field evolves in time
  windX: 0, windY: 0,
  maxSpeed: 78,
  drag: 0.9,         // per-second velocity retention
  neighborRadius: 38,
  sepRadius: 13,
};

export function clampParams(p = {}) {
  const o = { ...DEFAULT_PARAMS };
  const num = (k, lo, hi) => { if (p[k] != null && p[k] !== '' && isFinite(+p[k])) o[k] = Math.max(lo, Math.min(hi, +p[k])); };
  num('follow', 0, 400); num('swirl', -200, 200); num('cohesion', 0, 200); num('alignment', 0, 200);
  num('separation', 0, 600); num('wander', 0, 400); num('noiseFreq', 0.001, 0.1); num('noiseDrift', 0, 4);
  num('windX', -200, 200); num('windY', -200, 200); num('maxSpeed', 10, 300); num('drag', 0.5, 0.999);
  num('neighborRadius', 8, 160); num('sepRadius', 3, 80);
  return o;
}

// ── THE SWARM: struct-of-arrays + a pure fixed-timestep step(). GPU-portable by construction. ──
export class Swarm {
  constructor(opts = {}) {
    this.w = opts.width || 640;
    this.h = opts.height || 420;
    this.count = Math.max(1, Math.min(8000, opts.count | 0 || 320));
    this.params = clampParams(opts.params || {});
    this.headings = Math.max(4, Math.min(32, opts.headings | 0 || 8));
    this.seed = opts.seed || 'hive:0';
    this.target = { x: this.w * 0.5, y: this.h * 0.5 }; // the attractor (flower/hive/cursor)
    this.t = 0;          // sim clock (deterministic: stepCount * H)
    this.acc = 0;        // fixed-timestep accumulator
    this.H = 1 / 60;     // fixed substep — reproducible regardless of render FPS

    const n = this.count;
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.phase = new Uint8Array(n); // per-bee wingbeat offset so the buzz isn't lock-step
    const rnd = rngFor(this.seed + '::init');
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rnd() * Math.min(this.w, this.h) * 0.3;
      this.px[i] = this.target.x + Math.cos(a) * r;
      this.py[i] = this.target.y + Math.sin(a) * r;
      const sp = 20 + rnd() * 40, va = rnd() * TAU;
      this.vx[i] = Math.cos(va) * sp; this.vy[i] = Math.sin(va) * sp;
      this.phase[i] = (rnd() * 256) | 0;
    }
    this._grid = new Map(); // uniform spatial hash, rebuilt per substep
  }

  setTarget(x, y) { this.target.x = x; this.target.y = y; }
  setParams(p) { this.params = clampParams({ ...this.params, ...p }); }

  // advance by real dt seconds, in fixed substeps (so the sim is reproducible from (seed, #steps)).
  step(dt) {
    this.acc += Math.min(dt, 0.1); // clamp so a stalled tab doesn't fast-forward into chaos
    let guard = 0;
    while (this.acc >= this.H && guard++ < 8) { this._sub(this.H); this.acc -= this.H; this.t += this.H; }
  }

  _rebuildGrid() {
    const g = this._grid; g.clear();
    const cs = Math.max(8, this.params.neighborRadius);
    this._cs = cs;
    for (let i = 0; i < this.count; i++) {
      const cx = Math.floor(this.px[i] / cs), cy = Math.floor(this.py[i] / cs);
      const key = cx + ',' + cy;
      let bucket = g.get(key); if (!bucket) { bucket = []; g.set(key, bucket); }
      bucket.push(i);
    }
  }

  _sub(h) {
    const P = this.params, g = this._grid, cs = (this._rebuildGrid(), this._cs);
    const nr2 = P.neighborRadius * P.neighborRadius, sr2 = P.sepRadius * P.sepRadius;
    const noiseT = Math.floor(this.t * P.noiseDrift); // integer time slices → deterministic field
    const tx = this.target.x, ty = this.target.y;
    const margin = 28; // soft wall steer keeps the swarm on-screen (no toroidal wrap — a flower is local)

    for (let i = 0; i < this.count; i++) {
      const x = this.px[i], y = this.py[i];
      let ax = 0, ay = 0;

      // attractor: radial pull + tangential swirl (orbit, don't collapse)
      let dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1e-3;
      ax += (dx / d) * P.follow; ay += (dy / d) * P.follow;
      ax += (-dy / d) * P.swirl; ay += (dx / d) * P.swirl;

      // neighbours via the 3×3 grid neighbourhood
      let sepx = 0, sepy = 0, cx = 0, cy = 0, ax2 = 0, ay2 = 0, nN = 0;
      const gcx = Math.floor(x / cs), gcy = Math.floor(y / cs);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const bucket = g.get((gcx + ox) + ',' + (gcy + oy)); if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const j = bucket[b]; if (j === i) continue;
          const jx = this.px[j] - x, jy = this.py[j] - y, dd = jx * jx + jy * jy;
          if (dd > nr2) continue;
          if (dd < sr2) { const inv = 1 / (Math.sqrt(dd) + 1e-3); sepx -= jx * inv; sepy -= jy * inv; }
          cx += this.px[j]; cy += this.py[j]; ax2 += this.vx[j]; ay2 += this.vy[j]; nN++;
        }
      }
      if (nN > 0) {
        cx = cx / nN - x; cy = cy / nN - y;
        const cl = Math.hypot(cx, cy) || 1; ax += (cx / cl) * P.cohesion; ay += (cy / cl) * P.cohesion;
        const al = Math.hypot(ax2, ay2) || 1; ax += (ax2 / al) * P.alignment; ay += (ay2 / al) * P.alignment;
      }
      const sl = Math.hypot(sepx, sepy);
      if (sl > 0) { ax += (sepx / sl) * P.separation; ay += (sepy / sl) * P.separation; }

      // curl-noise wander + wind
      const cn = curl(x * P.noiseFreq, y * P.noiseFreq, noiseT);
      ax += cn.x * P.wander; ay += cn.y * P.wander;
      ax += P.windX; ay += P.windY;

      // soft walls
      if (x < margin) ax += (margin - x) * 2; else if (x > this.w - margin) ax += (this.w - margin - x) * 2;
      if (y < margin) ay += (margin - y) * 2; else if (y > this.h - margin) ay += (this.h - margin - y) * 2;

      // integrate (semi-implicit Euler) with drag + speed clamp
      let vx = this.vx[i] + ax * h, vy = this.vy[i] + ay * h;
      const damp = Math.pow(P.drag, h); vx *= damp; vy *= damp;
      const sp = Math.hypot(vx, vy);
      if (sp > P.maxSpeed) { const k = P.maxSpeed / sp; vx *= k; vy *= k; }
      this.vx[i] = vx; this.vy[i] = vy;
      this.px[i] = x + vx * h; this.py[i] = y + vy * h;
    }
  }

  // rendering hook: cb(px, py, headingBin, wingFrame, beeIndex). wingFrame from a global buzz clock
  // offset by per-bee phase, so wings shimmer out of sync. Pure read — never mutates state.
  forEachBee(cb, buzzHz = 18) {
    const slot = Math.floor(this.t * buzzHz);
    for (let i = 0; i < this.count; i++) {
      const bin = headingBin(Math.atan2(this.vy[i], this.vx[i]), this.headings);
      const wing = (slot + this.phase[i]) & 1;
      cb(this.px[i], this.py[i], bin, wing, i);
    }
  }
}
