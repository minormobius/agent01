// sprite/axial/axial.js — the AXIAL / vermiform critter kernel: worm / snake / eel, in pixels. The
// fifth unitary body plan (sixth overall, with the colonial swarm). Where polypods have many limbs,
// these have NONE — the body is a tapered tube along a spine, and locomotion is UNDULATION: a sine
// wave travels down the body (lateral, seen from the side), straight from the shared sprite/wave.js.
//
// Genes are continuous; worm/snake/eel are points. `fins` grows an eel's dorsal+caudal fins; the
// annular `segments` give a worm its rings vs a snake's banding; `chassis` makes a steel mech-worm.
// Same discipline: pure buildAxialGenome / axialFrame / axialSVG + AxialCritter (slither = f(t)).

import { rngFor, ramp } from './sprite-core.js';
import { TAU } from './wave.js';

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const DEFAULT_GENES = {
  length: 1.0,   // body length
  girth: 1.0,    // max body radius
  taper: 0.5,    // tail taper fraction (how far up the body the tail thins)
  amp: 1.0,      // undulation amplitude
  waves: 1.5,    // spatial wave count along the body
  headSize: 1.0, // head bulge
  fins: 0,       // 0..1 dorsal + caudal fins (eel)
  segments: 10,  // annular rings — worm (many) / snake (banding) / eel (few)
  chassis: 0,    // 0 organic .. 1 mechanical (mech-worm: steel segments + rivets + optic)
  cadence: 1.0,  // slither speed
  hue: 16,
  w: 62, h: 38,  // wide — the body lies horizontally, head right
};

export const FAMILIES = {
  worm:    { length: 0.82, girth: 1.1, taper: 0.5, amp: 0.5, waves: 1.9, headSize: 0.8, fins: 0, segments: 16, hue: 6 },
  snake:   { length: 1.25, girth: 0.78, taper: 0.7, amp: 1.15, waves: 1.6, headSize: 1.05, fins: 0, segments: 7, hue: 92 },
  eel:     { length: 1.18, girth: 0.95, taper: 0.62, amp: 1.35, waves: 1.3, headSize: 1.3, fins: 1, segments: 3, hue: 198 },
  mechworm:{ length: 1.0, girth: 1.0, taper: 0.5, amp: 0.7, waves: 1.6, headSize: 1.0, fins: 0, segments: 9, chassis: 1, hue: 210 },
};

export function buildAxialGenome(seed, genes = {}) {
  const g = { ...DEFAULT_GENES, ...genes };
  for (const k of ['length','girth','taper','amp','waves','headSize','cadence']) g[k] = clamp(+g[k], 0.3, 2);
  for (const k of ['fins','chassis']) g[k] = clamp(+g[k], 0, 1);
  g.segments = clamp(Math.round(g.segments), 0, 28);
  const rnd = rngFor(seed), w = g.w | 0, h = g.h | 0, mech = g.chassis > 0.5, unit = h * 0.16;
  const lenPx = g.length * w * 0.82;
  return {
    seed, w, h, genes: g, mech, unit,
    headX: w * 0.5 + lenPx / 2, tailX: w * 0.5 - lenPx / 2, centerY: h * 0.5,
    girth: g.girth * unit * 0.95,
    ramps: { fur: ramp(rnd, g.hue, mech ? 12 : 46, mech ? 4 : 16) },
    dark: ramp(rnd, g.hue, mech ? 8 : 30, 6)[0],
    eye: mech ? '#7fe0ff' : '#06070a', accent: ramp(rnd, mech ? 200 : (g.hue + 40) % 360, 70)[3],
  };
}

function radiusAt(i, G) {
  const tailF = smooth(0, clamp(G.genes.taper, 0.2, 0.85), i);     // thin at the tail, full by `taper`
  const body = 0.26 + 0.74 * tailF;
  const hb = G.genes.headSize * 0.45 * Math.exp(-Math.pow((i - 0.85) / 0.13, 2)); // head bulge
  const snout = i > 0.93 ? lerp(1, 0.42, (i - 0.93) / 0.07) : 1;   // taper to the snout tip
  return Math.max(0.8, G.girth * (body + hb) * snout);
}

export function axialFrame(G, t) {
  t = t || 0;
  const W = G.w, H = G.h, out = new Map();
  const put = (x, y, c, pri) => {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = x + ',' + y, p = out.get(k); if (!p || pri >= p.pri) out.set(k, { x, y, c, pri });
  };
  const thick = (x0, y0, x1, y1, c, wd, pri) => {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy))), r = (wd - 1) / 2;
    for (let i = 0; i <= n; i++) { const x = x0 + dx * i / n, y = y0 + dy * i / n;
      for (let oy = -Math.ceil(r); oy <= Math.ceil(r); oy++) for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++)
        if (ox * ox + oy * oy <= r * r + 0.4) put(x + ox, y + oy, c, pri); }
  };

  // ── the spine: a traveling sine displaces the centerline; the wave runs head→tail (the slither) ──
  const M = 96, S = [];
  for (let k = 0; k <= M; k++) {
    const i = k / M, env = 0.35 + 0.65 * (1 - i);                  // tail whips more than the head
    const y = G.centerY + G.genes.amp * G.unit * 0.95 * env * Math.sin(TAU * G.genes.waves * i - t * TAU * G.genes.cadence * 0.85);
    S.push({ x: lerp(G.tailX, G.headX, i), y, r: radiusAt(i, G), i });
  }
  const norm = (k) => { const a = S[Math.max(0, k - 1)], b = S[Math.min(M, k + 1)]; let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; return { nx: -ty / l, ny: tx / l }; };

  const fur = G.ramps.fur, near = fur[3], mid = fur[2], belly = fur[1];
  // BODY fill — nearest-sample field over the spine gives a clean tapered tube
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (const s of S) { minX = Math.min(minX, s.x - s.r); maxX = Math.max(maxX, s.x + s.r); minY = Math.min(minY, s.y - s.r); maxY = Math.max(maxY, s.y + s.r); }
  for (let y = Math.floor(minY) - 1; y <= maxY + 1; y++) for (let x = Math.floor(minX) - 1; x <= maxX + 1; x++) {
    let best = 1e9, br = 0, bs = null;
    for (const s of S) { const d = Math.hypot(x - s.x, y - s.y); if (d - s.r < best - br) { best = d; br = s.r; bs = s; } }
    if (bs && best <= br) put(x, y, best > br - 1.3 ? belly : (y < bs.y ? near : mid), 3); // top lit, belly shaded edge
  }

  // ── EEL FINS: a dorsal SAIL rising straight from the back + a caudal paddle at the tail ──
  if (G.genes.fins > 0.35) {
    const fh = G.genes.fins * G.unit * 1.4;
    for (let k = Math.round(M * 0.18); k <= M * 0.8; k++) {        // continuous sail (step 1, vertical)
      const s = S[k], f = Math.sin((s.i - 0.18) / 0.62 * Math.PI); if (f <= 0) continue;
      const topY = s.y - s.r; thick(s.x, topY, s.x, topY - fh * f, mid, 1, 2.6);
    }
    const tl = S[0];                                              // caudal paddle
    for (const dy of [-1, 1]) thick(tl.x, tl.y, tl.x - G.unit * 1.3, tl.y + dy * G.unit * 1.5, mid, 1, 2.6);
  }

  // ── ANNULATION (derived): rings/bands across the tube, count = `segments`; mech → seams + rivets ──
  const seg = G.genes.segments;
  for (let n = 1; n < seg; n++) {
    const k = Math.round((n / seg) * M); const s = S[k]; if (!s || s.i > 0.92) continue;
    const { nx, ny } = norm(k), rr = s.r * 0.92, wd = seg <= 9 ? 2 : 1;
    thick(s.x - nx * rr, s.y - ny * rr, s.x + nx * rr, s.y + ny * rr, G.dark, wd, 3.5);
    if (G.mech) { put(s.x - nx * rr, s.y - ny * rr, G.accent, 3.6); put(s.x + nx * rr, s.y + ny * rr, G.accent, 3.6); }
  }

  // ── HEAD: eye (+catchlight), and a forked tongue for snakes (no fins, modest segments, organic) ──
  const head = S[Math.round(M * 0.86)], tip = S[M], nt = norm(M);
  put(head.x, head.y - head.r * 0.45, G.eye, 5);
  if (!G.mech) put(head.x - 0.6, head.y - head.r * 0.45 - 0.6, '#f3efe4', 5.1);
  if (!G.mech && G.genes.fins < 0.4 && seg < 12) {
    const tx = tip.x + G.unit * 0.5, ty = tip.y;
    for (const sgn of [-1, 1]) thick(tip.x, ty, tx + G.unit * 0.5, ty + nt.ny * sgn * G.unit * 0.5 + sgn * 0.5, G.accent, 1, 4.2);
  }

  return [...out.values()].map(({ x, y, c }) => ({ x, y, c }));
}

export function axialSVG(G, scale, t) {
  scale = scale || 10;
  const Wd = G.w * scale, Ht = G.h * scale;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" shape-rendering="crispEdges"><rect width="${Wd}" height="${Ht}" fill="#0a0b0e"/>`;
  for (const r of axialFrame(G, t || 0)) s += `<rect x="${r.x * scale}" y="${r.y * scale}" width="${scale}" height="${scale}" fill="${r.c}"/>`;
  return s + `</svg>`;
}

export class AxialCritter {
  constructor({ seed, genes } = {}) { this.genome = buildAxialGenome(seed || 'axial:0', genes); this.t = 0; }
  step(dt) { this.t += Math.min(dt, 0.1); }
  frame() { return axialFrame(this.genome, this.t); }
}
