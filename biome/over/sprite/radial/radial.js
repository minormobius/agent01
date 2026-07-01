// sprite/radial/radial.js — the RADIAL critter kernel: psychic echinoderm megafauna in the style of
// clock/basket (Gorgonocephalus). A SECOND body plan beside the humanoid core.js — where that one is
// bilateral (mirror x, 2-leg walk, DIR8), this one is RADIAL: N-fold rotational symmetry, recursively
// BRANCHING arms, and a Kuramoto-coupled phase wave for the "psychic" undulation. No DOM, no canvas.
//
// The split mirrors the bee kernels: a pure, deterministic generator + still (buildRadialGenome /
// radialFrame / radialSVG) and a stateful animator (RadialCritter, Kuramoto oscillators with a pure
// fixed-timestep step()). A still is just the rest pose (phases = 0), so the SVG API stays immutable.
//
// Why radial sidesteps core.js's hard parts: a starfish looks like a starfish from any angle, so there
// is no DIR8 and no gait — you animate the WRITHE, not a heading. Symmetry comes from stamping ONE
// seeded arm tree N times rotated by 2π/N; the living asymmetry comes from each arm's Kuramoto phase.

import { rngFor, ramp } from '../core.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

export const DEFAULT_GENES = {
  arms: 5,         // N-fold symmetry (3..9) — 5 = pentaradial, the echinoderm default
  depth: 3,        // bifurcation generations (0 = simple brittle-star arms, 5 = dense basket-star)
  splay: 0.52,     // bifurcation half-angle (radians)
  taper: 0.64,     // length ratio per generation
  reach: 0.92,     // how far arms extend (fraction of the half-grid)
  writhe: 0.5,     // how hard the Kuramoto phase bends each segment
  waveDelay: 0.7,  // phase lag per generation → the pulse travels OUTWARD along the arm
  coupling: 1.4,   // Kuramoto K: 0 = arms drift independently (chaos), high = synchronized pulsing
  baseFreq: 1.1,   // mean oscillator frequency
  glow: 1,         // psychic halo intensity (0..2)
  hue: 42,         // arm hue (amber/gold)
  accentHue: 282,  // psychic pulse hue (violet) — the traveling wave + glow
  size: 41,        // grid N
};

// ── one seeded arm tree, reused (rotated) for every arm → exact N-fold symmetry at rest ──
function buildArmTree(rnd, genes) {
  function node(gen) {
    const n = { gen, rel: 0, kids: [] };
    if (gen < genes.depth) {
      const count = gen === 0 ? 1 : 2;                 // a stalk, then bifurcate each generation
      for (let i = 0; i < count; i++) {
        const kid = node(gen + 1);
        const sign = i === 0 ? -1 : 1;
        kid.rel = (count === 1 ? 0 : sign) * genes.splay * (0.6 + rnd() * 0.8);
        n.kids.push(kid);
      }
    }
    return n;
  }
  return node(0);
}

export function buildRadialGenome(seed, genes = {}) {
  const g = { ...DEFAULT_GENES, ...genes };
  g.arms = clamp(g.arms | 0 || 5, 3, 9);
  g.depth = clamp(g.depth | 0, 0, 6);
  const rnd = rngFor(seed);
  const N = g.size | 0 || 41;
  const discR = Math.max(2, Math.round(N * 0.10));
  // length per generation, scaled so the longest path reaches reach·(half-grid)
  const raw = []; let sum = 0;
  for (let i = 0; i <= g.depth; i++) { const l = Math.pow(g.taper, i); raw.push(l); sum += l; }
  const scale = (g.reach * (N / 2 - 1) - discR) / (sum || 1);
  const lenByGen = raw.map((l) => l * scale);
  const tree = buildArmTree(rnd, g);
  return {
    seed, size: N, arms: g.arms, depth: g.depth, rot: rnd() * TAU,
    discR, lenByGen, tree,
    writhe: g.writhe, waveDelay: g.waveDelay, coupling: g.coupling, baseFreq: g.baseFreq, glow: g.glow,
    ramps: { arm: ramp(rnd, g.hue, 66, 8) },
    tip: 'hsl(46 92% 72%)',
    psychicTip: `hsl(${g.accentHue} 92% 73%)`,
    glowCol: `hsl(${g.accentHue} 70% 34%)`,
    genes: g,
  };
}

function segColor(genome, gen, local) {
  const pulse = 0.5 + 0.5 * Math.cos(local);              // 0..1, peaks as the wave passes
  if (pulse > 0.82) return { c: genome.psychicTip, pri: 3 };   // bright psychic pulse crest
  const idx = Math.min(3, 1 + (gen % 3));
  return { c: genome.ramps.arm[idx], pri: 2 };
}

// ── THE CENTRAL EYE — a derived feature, NOT a gene. It "chases the eight axes": the pupil is an
// arms-pointed star (body plan), spiked by depth+splay, that DILATES as the Kuramoto sync drops and
// the gaze drifts toward the mean phase (constricts + centres when locked); iris colour rides the
// accent hue, brightness rides glow + the phase pulse, and writhe gives the pupil a tremor. ──
function eyeCells(put, genome, theta, c, dR) {
  const N = genome.arms, gg = genome.genes;
  let sx = 0, sy = 0;
  if (theta) for (let i = 0; i < N; i++) { sx += Math.cos(theta[i]); sy += Math.sin(theta[i]); }
  const r = theta ? Math.hypot(sx, sy) / N : 1;            // order parameter (rest = locked)
  const psi = theta ? Math.atan2(sy, sx) : 0;              // mean phase → gaze direction
  const pulse = 0.5 + 0.5 * Math.cos(psi);                 // global brightness pulse
  const taperN = (0.82 - gg.taper) / 0.34;                 // 0 (fat arms) .. 1 (thin arms)
  const pupilR = dR * (0.30 + 0.42 * (1 - r)) * (1 - 0.18 * taperN);  // dilates as sync drops
  const spike = Math.min(0.85, 0.12 + 0.095 * genome.depth + 0.28 * gg.splay); // depth+splay → spikier
  const orient = genome.rot + gg.writhe * 0.6 * Math.sin(psi);        // writhe tremor on the pupil
  const gaze = dR * 0.5 * (1 - r);                                    // wander when desynced
  const gx = c + Math.cos(psi) * gaze, gy = c + Math.sin(psi) * gaze;
  const L = (b) => Math.round(b + 14 * gg.glow * 0.5 + 16 * pulse);
  const iris = `hsl(${gg.accentHue} 88% ${Math.min(78, L(40))}%)`;
  const irisIn = `hsl(${gg.accentHue} 80% ${Math.min(60, L(24))}%)`;
  const dark = '#06070a';
  for (let yy = -dR; yy <= dR; yy++) for (let xx = -dR; xx <= dR; xx++) {
    if (xx * xx + yy * yy > dR * dR) continue;
    const px = c + xx, py = c + yy, dx = px - gx, dy = py - gy;
    const rho = Math.hypot(dx, dy), phi = Math.atan2(dy, dx);
    const starR = pupilR * (1 - spike * 0.5 * (1 - Math.cos(N * (phi - orient)))); // N-pointed pupil
    if (rho <= starR) put(px, py, dark, 6);                 // the pupil
    else put(px, py, (rho - starR) < 1.3 ? iris : irisIn, 5); // iris ring
  }
  // catchlight — a living glint, opposite the gaze
  put(Math.round(gx - Math.cos(psi) * pupilR * 0.55), Math.round(gy - Math.sin(psi) * pupilR * 0.55), '#f3efe4', 7);
}

// ── THE FRAME: genome + per-arm phases → [{x,y,c}] cells. Pure given (genome, theta). ──
export function radialFrame(genome, theta, N) {
  N = N || genome.size;
  const c = (N - 1) / 2, out = new Map();
  const put = (x, y, col, pri) => {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= N || y >= N) return;
    const k = x + ',' + y, prev = out.get(k);
    if (!prev || pri >= prev.pri) out.set(k, { x, y, c: col, pri });
  };
  const rasterLine = (x0, y0, x1, y1, col, gen) => {
    const dx = x1 - x0, dy = y1 - y0, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = x0 + dx * t, y = y0 + dy * t;
      put(x, y, col.c, col.pri);
      if (gen <= 1) put(x + (Math.abs(dx) > Math.abs(dy) ? 0 : 0.7), y + (Math.abs(dx) > Math.abs(dy) ? 0.7 : 0), col.c, col.pri - 1); // thicken the trunk
    }
  };
  const walk = (node, x, y, ang, armPhase) => {
    const gen = node.gen, local = armPhase - gen * genome.waveDelay;
    const a = ang + node.rel + genome.writhe * Math.sin(local);
    const len = genome.lenByGen[gen] ?? genome.lenByGen[genome.lenByGen.length - 1];
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    rasterLine(x, y, ex, ey, segColor(genome, gen, local), gen);
    for (const k of node.kids) walk(k, ex, ey, a, armPhase);
  };

  // central disc (the body) — base fill; the EYE is stamped over it below
  const dR = genome.discR;
  for (let yy = -dR; yy <= dR; yy++) for (let xx = -dR; xx <= dR; xx++) {
    const d2 = xx * xx + yy * yy; if (d2 > dR * dR) continue;
    put(c + xx, c + yy, d2 > (dR - 1) * (dR - 1) ? genome.ramps.arm[1] : genome.ramps.arm[3], 4);
  }

  // the arms — one seeded tree stamped N times; each arm carries its own Kuramoto phase
  for (let a = 0; a < genome.arms; a++) {
    const base = a * TAU / genome.arms + genome.rot;
    const ph = theta ? theta[a] : 0;
    walk(genome.tree, c + Math.cos(base) * dR, c + Math.sin(base) * dR, base, ph);
  }

  eyeCells(put, genome, theta, c, dR);   // the central eye: a readout of body plan + psyche

  // psychic glow: a dim accent halo around lit filaments (additive bloom, pixel-style)
  if (genome.glow > 0) {
    const lit = [...out.values()];
    const spread = genome.glow >= 1.5 ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const p of lit) if (p.pri >= 2) for (const [dx, dy] of spread) put(p.x + dx, p.y + dy, genome.glowCol, 1);
  }
  return [...out.values()].map(({ x, y, c }) => ({ x, y, c }));
}

// ── SVG still (rest pose) — the portable image asset, like core.js frameSVG ──
export function radialSVG(genome, scale, theta) {
  scale = scale || 12;
  const N = genome.size, side = N * scale;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#0a0b0e"/>`;
  for (const r of radialFrame(genome, theta || null, N)) s += `<rect x="${r.x * scale}" y="${r.y * scale}" width="${scale}" height="${scale}" fill="${r.c}"/>`;
  return s + `</svg>`;
}

// ── THE ANIMATOR: Kuramoto-coupled arm oscillators. Pure fixed-timestep step() (reproducible from
// seed + #steps), exactly like the bee Swarm. order() returns the sync order parameter r∈[0,1]. ──
export class RadialCritter {
  constructor({ seed, genes } = {}) {
    this.genome = buildRadialGenome(seed || 'echino:0', genes);
    this.n = this.genome.arms;
    const rnd = rngFor((seed || 'echino:0') + '::kura');
    this.theta = new Float64Array(this.n);
    this.omega = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) { this.theta[i] = rnd() * TAU; this.omega[i] = this.genome.baseFreq * (0.7 + rnd() * 0.6); }
    this.K = this.genome.coupling;
    this.t = 0; this.acc = 0; this.H = 1 / 60;
  }
  setK(k) { this.K = Math.max(0, k); }
  _kura(h) {
    const n = this.n, th = this.theta, nx = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Math.sin(th[j] - th[i]); nx[i] = th[i] + (this.omega[i] + (this.K / n) * s) * h; }
    this.theta = nx;
  }
  step(dt) { this.acc += Math.min(dt, 0.1); while (this.acc >= this.H) { this._kura(this.H); this.acc -= this.H; this.t += this.H; } }
  order() { let x = 0, y = 0; for (let i = 0; i < this.n; i++) { x += Math.cos(this.theta[i]); y += Math.sin(this.theta[i]); } return Math.hypot(x, y) / this.n; }
  frame(N) { return radialFrame(this.genome, this.theta, N); }
}
