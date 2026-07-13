// sprite/quad/quad.js — the QUADRUPED critter kernel: boar / hound / bear / robot, in pixels.
// The THIRD body plan beside the humanoid (core.js) and the radial echinoderm (radial/radial.js).
// Where core.js is bilateral-but-frontal (mirror-x, a 2-leg swing, DIR8), a quadruped reads in
// PROFILE and needs articulated legs with a real gait — so this is a tiny 2D skeleton + 2-bone IK,
// animated by a diagonal-pair trot (the thing a 2-leg walkPose can't express).
//
// Same kernel discipline as the rest: a pure deterministic generator + still (buildQuadGenome /
// quadFrame / quadSVG) and a stateful animator (QuadCritter, gait = a closed-form f(t), reproducible
// from seed + #steps). Genes are continuous; boar/hound/bear/robot are just points in the space.
// `chassis` (organic↔mechanical) gives the robot varietal for free — boxier joints + a steel ramp.

import { rngFor, ramp } from './sprite-core.js';

const TAU = Math.PI * 2, HALF_PI = Math.PI / 2;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

export const DEFAULT_GENES = {
  body: 1.0,    // trunk length
  depth: 1.0,   // trunk thickness / robustness
  leg: 1.0,     // leg length
  neck: 1.0,    // neck length
  head: 1.0,    // head size
  snout: 1.0,   // muzzle length
  tail: 1.0,    // tail length
  ear: 1.0,     // ear size
  stance: 0.4,  // 0 = digitigrade (toe, hound) .. 1 = plantigrade (flat, bear)
  chassis: 0,   // 0 = organic .. 1 = mechanical (robot: boxy joints, steel ramp, antenna)
  stride: 1.0,  // gait amplitude
  cadence: 1.0, // gait speed
  hue: 28,      // hide / fur hue
  w: 52, h: 34, // profile grid (wider than tall)
};

// the four family points + the robot, as gene overlays (continuous space — these are just presets)
export const FAMILIES = {
  hound: { body: 1.0, depth: 0.82, leg: 1.15, neck: 0.95, head: 0.9, snout: 1.15, tail: 1.1, ear: 1.25, stance: 0.3, hue: 30 },
  boar:  { body: 1.12, depth: 1.32, leg: 0.78, neck: 0.62, head: 1.2, snout: 1.35, tail: 0.4, ear: 0.8, stance: 0.28, hue: 22 },
  bear:  { body: 1.12, depth: 1.42, leg: 0.92, neck: 0.55, head: 1.08, snout: 0.78, tail: 0.18, ear: 0.7, stance: 1.0, hue: 18 },
  robot: { body: 1.0, depth: 1.0, leg: 1.05, neck: 0.8, head: 0.95, snout: 0.7, tail: 0.5, ear: 0.5, stance: 0.45, chassis: 1, hue: 210 },
};

export function buildQuadGenome(seed, genes = {}) {
  const g = { ...DEFAULT_GENES, ...genes };
  for (const k of ['body','depth','leg','neck','head','snout','tail','ear','stance','chassis','stride','cadence'])
    g[k] = clamp(+g[k], k==='stance'||k==='chassis' ? 0 : 0.3, k==='stance'||k==='chassis' ? 1 : 2);
  const rnd = rngFor(seed);
  const w = g.w | 0, h = g.h | 0;
  const groundLine = h - 2.5;
  const legLen = g.leg * h * 0.46, u = legLen * 0.5, l = legLen * 0.5;
  const jointY = groundLine - legLen * 0.84;            // shoulders/hips sit a bent-leg above ground
  const cx = w * 0.46, bodyLen = g.body * w * 0.36;
  const hipX = cx - bodyLen / 2, shoulderX = cx + bodyLen / 2;  // faces +x (right)
  const trunkR = g.depth * h * 0.16;
  const mech = g.chassis > 0.5;
  const fur = ramp(rnd, g.hue, mech ? 10 : 40, mech ? 4 : 16);
  const dark = ramp(rnd, g.hue, mech ? 8 : 30, 6)[0];
  return {
    seed, w, h, genes: g, groundLine, u, l, legLen, jointY, hipX, shoulderX, trunkR, cx, mech,
    neckLen: g.neck * h * 0.30, headR: g.head * h * 0.16, snout: g.snout, tailLen: g.tail * w * 0.22,
    earSize: g.ear * h * 0.13, stance: g.stance, stride: g.stride,
    ramps: { fur }, dark,
    eye: mech ? '#ff6a6a' : '#06070a', accent: ramp(rnd, mech ? 200 : (g.hue + 40) % 360, 70)[3],
  };
}

// 2-bone IK: joint J + foot target → knee + (reachable) foot. kneeSign sets which way the knee folds.
function legIK(jx, jy, u, l, fx, fy, kneeSign) {
  let dx = fx - jx, dy = fy - jy, d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(u - l) + 0.01, u + l - 0.01);
  const base = Math.atan2(dy, dx);
  const k = Math.acos(clamp((u * u + d * d - l * l) / (2 * u * d), -1, 1));
  const up = base - kneeSign * k;
  return { kx: jx + Math.cos(up) * u, ky: jy + Math.sin(up) * u, fx: jx + Math.cos(base) * d, fy: jy + Math.sin(base) * d };
}
// foot target along a walk cycle: lifts + swings forward in the first half, plants + drags back in the second
function footTarget(jx, groundY, reach, p, step) {
  return { fx: jx - step * Math.cos(p), fy: groundY - Math.max(0, Math.sin(p)) * reach * 0.30 };
}

// ── THE FRAME: genome + gait time t → [{x,y,c}] cells. Pure given (genome, t). ──
export function quadFrame(genome, t, faceLeft) {
  t = t || 0;
  const W = genome.w, H = genome.h, out = new Map();
  const put = (x, y, c, pri) => {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = x + ',' + y, prev = out.get(k); if (!prev || pri >= prev.pri) out.set(k, { x, y, c, pri });
  };
  const thick = (x0, y0, x1, y1, c, wdt, pri) => {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const rad = (wdt - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + dx * i / n, y = y0 + dy * i / n;
      for (let oy = -Math.ceil(rad); oy <= Math.ceil(rad); oy++) for (let ox = -Math.ceil(rad); ox <= Math.ceil(rad); ox++)
        if (ox * ox + oy * oy <= rad * rad + 0.4) put(x + ox, y + oy, c, pri);
    }
  };
  const fr = genome.ramps.fur, near = fr[3], farc = fr[1], mid = fr[2];
  const phase = leg => t * TAU * 1.15 + leg;
  const reach = genome.legLen, step = genome.stride * reach * 0.28;
  const bob = Math.sin(t * TAU * 2.3) * genome.trunkR * 0.06;
  const sh = { x: genome.shoulderX, y: genome.jointY + bob }, hp = { x: genome.hipX, y: genome.jointY + bob };

  // a leg: IK from a joint to its gait foot target; mech → boxier (a knee block + straight shanks)
  const drawLeg = (jx, jy, ph, kneeSign, col, wdt, pri) => {
    const ft = footTarget(jx, genome.groundLine, reach, ph, step);
    const ik = legIK(jx, jy, genome.u, genome.l, ft.fx, ft.fy, kneeSign);
    thick(jx, jy, ik.kx, ik.ky, col, wdt, pri);
    thick(ik.kx, ik.ky, ik.fx, ik.fy, col, wdt, pri);
    if (genome.mech) put(ik.kx, ik.ky, genome.dark, pri + 0.1);      // knee servo
    // foot: a flat paw (plantigrade) or a small toe/hoof (digitigrade)
    const fw = 1 + Math.round(genome.stance * 2);
    for (let o = 0; o <= fw; o++) put(ik.fx + o - fw / 2, genome.groundLine + (ft.fy >= genome.groundLine - 0.5 ? 0.5 : 0), genome.dark, pri + 0.1);
  };

  // FAR legs first (behind, darker, nudged toward the head); trot = diagonal pairs
  drawLeg(sh.x + 1.5, sh.y, phase(Math.PI), 1, farc, genome.mech ? 2 : 3, 2);
  drawLeg(hp.x + 1.5, hp.y, phase(0), -1, farc, genome.mech ? 2 : 3, 2);

  // tail — a tapered, curling plume (y is DOWN, so a bushy tail curls UP). Multi-segment so it arcs.
  {
    const up = genome.genes.tail > 0.85, segs = 5, L = genome.tailLen / segs;
    let tx = hp.x, ty = hp.y - genome.trunkR * 0.35, a = Math.PI + (up ? 0.12 : -0.12);
    const curl = (up ? 0.62 : -0.16) / segs + Math.sin(t * TAU) * 0.04;
    for (let i = 0; i < segs; i++) {
      a += curl; const nx = tx + Math.cos(a) * L, ny = ty + Math.sin(a) * L;
      thick(tx, ty, nx, ny, mid, Math.max(1, 3 - i * 0.55), 3); tx = nx; ty = ny;
    }
  }

  // TRUNK — a capsule between hip and shoulder, belly sagging a touch
  {
    const r = genome.trunkR;
    const ax = hp.x, ay = hp.y - r * 0.2, bx = sh.x, by = sh.y - r * 0.2;
    const vx = bx - ax, vy = by - ay, vlen2 = vx * vx + vy * vy || 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let tt = ((x - ax) * vx + (y - ay) * vy) / vlen2; tt = clamp(tt, 0, 1);
      const px = ax + vx * tt, py = ay + vy * tt, dd = Math.hypot(x - px, y - py);
      const rr = r * (1 + 0.12 * Math.sin(tt * Math.PI));           // a little barrel
      if (dd <= rr) put(x, y, dd > rr - 1.2 ? mid : near, 3);       // shaded edge
    }
  }

  // NECK + HEAD (toward +x / front)
  const nb = { x: sh.x + genome.trunkR * 0.45, y: sh.y - genome.trunkR * 0.45 };
  const hd = { x: nb.x + Math.cos(-0.42) * genome.neckLen, y: nb.y + Math.sin(-0.42) * genome.neckLen };
  thick(nb.x, nb.y, hd.x, hd.y, near, Math.max(2, genome.trunkR * 0.7), 3);
  {
    const R = genome.headR, sn = 0.8 + genome.snout * 0.5;
    for (let y = -R; y <= R; y++) for (let x = -R * sn; x <= R; x++) {
      if ((x / sn) * (x / sn) + y * y <= R * R) put(hd.x + x, hd.y + y, near, 4);  // elongate toward snout (+x)
    }
    put(hd.x + R * (0.7 + genome.snout * 0.6), hd.y + R * 0.3, genome.dark, 4.1);  // snout tip / nose
    // ear: a triangular nub on the back-top of the head (organic) or a thin antenna (mech)
    const ex0 = hd.x - R * 0.45, ey0 = hd.y - R * 0.72;
    if (genome.mech) {
      const al = R * 0.95; thick(ex0, ey0, ex0, ey0 - al, mid, 1, 4.1); put(ex0, ey0 - al, genome.accent, 5);
    } else {
      const eh = clamp(genome.earSize * R * 0.6, 2, R);
      for (let i = 0; i <= eh; i++) { const ww = 1.5 * (1 - i / eh); for (let o = -ww; o <= ww; o++) put(ex0 + o, ey0 - i, mid, 4.1); }
    }
    put(hd.x + R * 0.25, hd.y - R * 0.05, genome.eye, 5);                          // eye
    put(hd.x + R * 0.25 - 0.5, hd.y - R * 0.05 - 0.5, '#f3efe4', 5.1);             // catchlight
  }

  // NEAR legs in front (lighter), occluding the trunk edge
  drawLeg(sh.x, sh.y, phase(0), 1, near, genome.mech ? 3 : 3, 5);
  drawLeg(hp.x, hp.y, phase(Math.PI), -1, near, genome.mech ? 3 : 3, 5);

  let cells = [...out.values()];
  if (faceLeft) cells = cells.map(c => ({ x: W - 1 - c.x, y: c.y, c: c.c }));
  return cells.map(({ x, y, c }) => ({ x, y, c }));
}

export function quadSVG(genome, scale, t, faceLeft) {
  scale = scale || 12;
  const Wd = genome.w * scale, Ht = genome.h * scale;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" shape-rendering="crispEdges"><rect width="${Wd}" height="${Ht}" fill="#0a0b0e"/>`;
  for (const r of quadFrame(genome, t || 0, faceLeft)) s += `<rect x="${r.x * scale}" y="${r.y * scale}" width="${scale}" height="${scale}" fill="${r.c}"/>`;
  return s + `</svg>`;
}

// ── THE ANIMATOR: gait is a closed-form f(t); step() just advances it (× cadence). ──
export class QuadCritter {
  constructor({ seed, genes } = {}) { this.genome = buildQuadGenome(seed || 'quad:0', genes); this.t = 0; this.face = false; }
  step(dt) { this.t += Math.min(dt, 0.1) * this.genome.genes.cadence; }
  frame() { return quadFrame(this.genome, this.t, this.face); }
}
