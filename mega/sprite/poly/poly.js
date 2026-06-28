// sprite/poly/poly.js — the POLYPOD critter kernel: ant / spiderbot / crab, in pixels. ONE generator
// for 6/8/10 legs — leg count is a gene, not three plans. Top-down view (legs splay around a bilateral
// body, hidden in profile); locomotion is a METACHRONAL WAVE gait drawn from the shared sprite/wave.js.
// A FOURTH body plan beside humanoid (frontal), quadruped (profile), radial (agnostic).
//
// Genes are continuous; ant/spider/crab/spiderbot are points. `claws` promotes the front pair to
// chelae (→ crab, 10 limbs); `antennae` → ant; `chassis` → spiderbot (boxy, steel, sensor optic).
// Same discipline: pure buildPolyGenome / polyFrame / polySVG + PolyCritter (gait = f(t), seeded).

import { rngFor, ramp } from '../core.js';
import { TAU, legPhase, gaitStep } from '../wave.js';

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp = (a, b, t) => a + (b - a) * t;

export const DEFAULT_GENES = {
  legs: 4,       // PAIRS of walking legs → 6 / 8 / 10 limbs (3 / 4 / 5)
  segs: 2,       // body segments: 1 (crab carapace) .. 3 (ant: head/thorax/gaster)
  bodyLen: 1.0,  // body length along the axis
  bodyWide: 1.0, // body width (crab is wide)
  legLen: 1.0,   // leg length
  legGirth: 1.0, // leg thickness
  claws: 0,      // 0..1 — front pair becomes pincers
  antennae: 0,   // 0..1 — head antennae
  chassis: 0,    // 0 organic .. 1 mechanical (spiderbot)
  cadence: 1.0,  // gait speed
  hue: 28,
  w: 46, h: 46,  // square-ish top-down grid (head up)
};

export const FAMILIES = {
  ant:       { legs: 3, segs: 3, bodyLen: 1.15, bodyWide: 0.75, legLen: 1.0, legGirth: 0.8, antennae: 1, hue: 24 },
  spider:    { legs: 4, segs: 2, bodyLen: 1.0, bodyWide: 0.95, legLen: 1.3, legGirth: 0.85, hue: 8 },
  crab:      { legs: 5, segs: 1, bodyLen: 0.7, bodyWide: 1.55, legLen: 0.85, legGirth: 1.1, claws: 1, hue: 14 },
  spiderbot: { legs: 4, segs: 2, bodyLen: 1.0, bodyWide: 0.9, legLen: 1.35, legGirth: 1.0, chassis: 1, hue: 208 },
};

// body segment layouts (positions along the axis 0..1, head→tail; rx/ry are relative radii)
const SEG_LAYOUT = {
  1: [{ fy: 0.50, rx: 1.00, ry: 0.66 }],                                              // crab carapace
  2: [{ fy: 0.32, rx: 0.60, ry: 0.50 }, { fy: 0.74, rx: 0.82, ry: 0.64 }],            // ceph + abdomen
  3: [{ fy: 0.15, rx: 0.40, ry: 0.38 }, { fy: 0.45, rx: 0.48, ry: 0.40 }, { fy: 0.80, rx: 0.72, ry: 0.62 }], // ant
};

export function buildPolyGenome(seed, genes = {}) {
  const g = { ...DEFAULT_GENES, ...genes };
  g.legs = clamp(Math.round(g.legs), 3, 6);
  g.segs = clamp(Math.round(g.segs), 1, 3);
  for (const k of ['bodyLen','bodyWide','legLen','legGirth','cadence']) g[k] = clamp(+g[k], 0.4, 2);
  for (const k of ['claws','antennae','chassis']) g[k] = clamp(+g[k], 0, 1);
  const rnd = rngFor(seed);
  const w = g.w | 0, h = g.h | 0, mech = g.chassis > 0.5;
  const unit = h * 0.165;
  const fur = ramp(rnd, g.hue, mech ? 12 : 44, mech ? 4 : 14);
  return {
    seed, w, h, genes: g, mech, unit,
    cx: w * 0.5, cy: h * 0.47, span: g.bodyLen * h * 0.52,
    bodyW: g.bodyWide, segs: g.segs, legs: g.legs,
    coxa: g.legLen * unit * 1.0, tibia: g.legLen * unit * 1.5, girth: g.legGirth,
    ramps: { fur }, dark: ramp(rnd, g.hue, mech ? 8 : 28, 5)[0],
    eye: mech ? '#7fe0ff' : '#06070a', accent: ramp(rnd, mech ? 200 : (g.hue + 30) % 360, 70)[3],
  };
}

// segment ellipses in absolute coords (and which one the legs hang off)
function segments(G) {
  const layout = SEG_LAYOUT[G.segs], top = G.cy - G.span / 2;
  const segs = layout.map(s => ({
    x: G.cx, y: top + s.fy * G.span,
    rx: s.rx * G.unit * 1.6 * G.bodyW, ry: s.ry * G.unit * 1.6,
  }));
  const thoraxIdx = G.segs === 3 ? 1 : 0;   // ant: middle; spider/crab: first
  return { segs, thorax: segs[thoraxIdx], head: segs[0] };
}

export function polyFrame(G, t) {
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
  const fur = G.ramps.fur, near = fur[3], mid = fur[2], legc = fur[1];
  const { segs, thorax, head } = segments(G);
  const P = G.legs, pairs = P;

  // a 2-segment leg with the gait sweep + recovery retract; mech → a knee block
  const drawLeg = (ax, ay, outAng, bend, phase, col) => {
    const { swing, lift } = gaitStep(phase);
    const reach = 1 - 0.24 * lift, a1 = outAng + 0.32 * swing;
    const kx = ax + Math.cos(a1) * G.coxa * reach, ky = ay + Math.sin(a1) * G.coxa * reach;
    const a2 = a1 + bend * (0.85 + 0.12 * swing);
    const tx = kx + Math.cos(a2) * G.tibia * reach, ty = ky + Math.sin(a2) * G.tibia * reach;
    const wd = Math.max(1, Math.round(2 * G.girth));
    thick(ax, ay, kx, ky, col, wd, 2); thick(kx, ky, tx, ty, col, Math.max(1, wd - 1), 2);
    if (G.mech) put(kx, ky, G.dark, 2.1);                 // knee servo
    put(tx, ty, G.dark, 2.2);                             // foot
  };
  // a forward pincer claw (replaces the front pair on a crab)
  const drawClaw = (ax, ay, outAng, side) => {
    const a1 = outAng - side * 0.35, ex = ax + Math.cos(a1) * G.coxa * 1.1, ey = ay + Math.sin(a1) * G.coxa * 1.1;
    thick(ax, ay, ex, ey, legc, Math.max(2, Math.round(3 * G.girth)), 2);
    const open = 0.45 + 0.2 * Math.sin(t * TAU);          // the pincer opens & closes
    const r = G.tibia * 0.7;
    thick(ex, ey, ex + Math.cos(a1 - open) * r, ey + Math.sin(a1 - open) * r, mid, 2, 2.1);
    thick(ex, ey, ex + Math.cos(a1 + open) * r, ey + Math.sin(a1 + open) * r, mid, 2, 2.1);
  };

  // LEGS (drawn first; the body covers their attach points). pairs fan front→back along the thorax.
  const t0 = thorax.y - thorax.ry * 0.7, t1 = thorax.y + thorax.ry * 0.7;
  for (let p = 0; p < pairs; p++) {
    const f = pairs > 1 ? p / (pairs - 1) : 0.5;
    const ay = lerp(t0, t1, f), ar = thorax.rx * 0.85;
    const rOut = lerp(-0.85, 0.85, f);                    // right side: front up, back down
    const phR = legPhase(p, 1, pairs, t, { speed: G.genes.cadence }), phL = legPhase(p, -1, pairs, t, { speed: G.genes.cadence });
    if (p === 0 && G.genes.claws > 0.5) {
      drawClaw(G.cx + ar, ay, rOut, 1); drawClaw(G.cx - ar, ay, Math.PI - rOut, -1);
    } else {
      drawLeg(G.cx + ar, ay, rOut, 1, phR, legc);
      drawLeg(G.cx - ar, ay, Math.PI - rOut, -1, phL, legc);
    }
  }

  // BODY segments (filled ellipses, shaded edge), over the leg attach points
  for (const s of segs) for (let y = Math.floor(s.y - s.ry); y <= s.y + s.ry; y++) for (let x = Math.floor(s.x - s.rx); x <= s.x + s.rx; x++) {
    const ex = (x - s.x) / s.rx, ey = (y - s.y) / s.ry, d = ex * ex + ey * ey;
    if (d <= 1) put(x, y, d > 0.72 ? mid : near, 3);
  }

  // BODY PATTERNING — DERIVED from the polypod's own elements, no new gene (cf. the radial eye). The
  // abdomen carries one transverse band per LEG PAIR (arthropod tergites track segments), a dorsal
  // midline, and the thorax shows a segment tick at each leg attachment. chassis swaps the organic
  // bands for panel seams + hazard chevron + accent rivets; the band colour is the body hue's darkest.
  {
    const abdomen = segs.reduce((a, s) => (s.rx * s.ry > a.rx * a.ry ? s : a), segs[0]);
    const pdark = G.mech ? G.dark : fur[0];
    // band count = leg pairs, but capped by body height so a short wide carapace doesn't crowd
    const nB = G.mech ? Math.min(3, Math.ceil(P / 2)) : clamp(Math.round(2 * abdomen.ry / 5), 2, P);
    for (let y = Math.floor(abdomen.y - abdomen.ry); y <= abdomen.y + abdomen.ry; y++)
      for (let x = Math.floor(abdomen.x - abdomen.rx); x <= abdomen.x + abdomen.rx; x++) {
        const exn = (x - abdomen.x) / abdomen.rx, eyn = (y - abdomen.y) / abdomen.ry;
        if (exn * exn + eyn * eyn > 0.9) continue;                  // inside, off the rim
        if (Math.abs(x - abdomen.x) < 0.8) { put(x, y, pdark, 3.6); continue; }  // dorsal midline
        const bow = G.mech ? 0 : 0.08 * (1 - exn * exn);           // organic bands bow backward
        const v = (y - (abdomen.y - abdomen.ry)) / (2 * abdomen.ry) - bow, frac = (v * nB) % 1;
        if (v > 0.08 && v < 0.95 && frac >= 0 && frac < (G.mech ? 0.1 : 0.16)) put(x, y, pdark, 3.6);
      }
    if (thorax !== abdomen) for (let p = 0; p < P; p++) {          // thorax tick per leg row (skip if
      const ay = lerp(t0, t1, P > 1 ? p / (P - 1) : 0.5);          // the body is one segment — bands suffice)
      thick(thorax.x - thorax.rx * 0.55, ay, thorax.x + thorax.rx * 0.55, ay, pdark, 1, 3.6);
    }
    if (G.mech) {                                                  // rivets + a hazard chevron
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) put(abdomen.x + dx * abdomen.rx * 0.66, abdomen.y + dy * abdomen.ry * 0.66, G.accent, 3.7);
      const hy = head.y + head.ry * 0.2; put(head.x, hy, G.accent, 4.2); put(head.x - 1, hy - 1, G.accent, 4.2); put(head.x + 1, hy - 1, G.accent, 4.2);
    }
  }

  // ANTENNAE (ant) — two waving feelers from the head, forward (up)
  if (G.genes.antennae > 0.4) {
    const al = G.unit * 2.0 * G.genes.antennae;
    for (const s of [-1, 1]) {
      const bx = head.x + s * head.rx * 0.5, by = head.y - head.ry * 0.7;
      const a = -Math.PI / 2 + s * 0.5 + Math.sin(t * TAU + s) * 0.18;
      thick(bx, by, bx + Math.cos(a) * al, by + Math.sin(a) * al, mid, 1, 3.1);
    }
  }

  // EYES / sensor on the head front
  if (G.mech) { for (let o = -1; o <= 1; o++) put(head.x + o, head.y - head.ry * 0.4, G.eye, 5); }
  else if (G.genes.claws > 0.5) {                        // crab eyestalks
    for (const s of [-1, 1]) { const ex = head.x + s * head.rx * 0.55, ey = head.y - head.ry * 0.6;
      thick(head.x + s * head.rx * 0.4, head.y - head.ry * 0.3, ex, ey - G.unit * 0.6, mid, 1, 4.1); put(ex, ey - G.unit * 0.6, G.eye, 5); }
  } else { for (const s of [-1, 1]) put(head.x + s * Math.max(1, head.rx * 0.4), head.y - head.ry * 0.3, G.eye, 5); }

  return [...out.values()].map(({ x, y, c }) => ({ x, y, c }));
}

export function polySVG(G, scale, t) {
  scale = scale || 11;
  const Wd = G.w * scale, Ht = G.h * scale;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" shape-rendering="crispEdges"><rect width="${Wd}" height="${Ht}" fill="#0a0b0e"/>`;
  for (const r of polyFrame(G, t || 0)) s += `<rect x="${r.x * scale}" y="${r.y * scale}" width="${scale}" height="${scale}" fill="${r.c}"/>`;
  return s + `</svg>`;
}

export class PolyCritter {
  constructor({ seed, genes } = {}) { this.genome = buildPolyGenome(seed || 'poly:0', genes); this.t = 0; }
  step(dt) { this.t += Math.min(dt, 0.1); }
  frame() { return polyFrame(this.genome, this.t); }
}
