// sprite/isopod/isopod.js — the ISOPOD critter kernel: pill-bug / woodlouse / giant deep-sea isopod
// / mech-pod. It lives exactly BETWEEN the axial and polypod plans, and is built from both: a
// SEGMENTED ARMORED BODY (axial's plates/seams, here as a top-down tapered oval of tergites) that
// grows ONE LEG PAIR PER SEGMENT (polypod's limbs + the SHARED metachronal gait from sprite/wave.js).
// That's the point the user spotted — axial and polypod aren't separate plans, they're a segmented
// spine ± a leg per segment, and the isopod is the hybrid that proves it.
//
// Same discipline: pure buildIsopodGenome / isopodFrame / isopodSVG + IsopodCritter. The body is
// rigid armour (no undulation) — locomotion is the leg wave, so it's axial's *segmentation* married
// to polypod's *gait*. `armor` works the plates, `tailFan` the uropods, `chassis` makes a mech-pod.

import { rngFor, ramp } from './sprite-core.js';
import { TAU, legPhase, gaitStep } from './wave.js';

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp = (a, b, t) => a + (b - a) * t;

export const DEFAULT_GENES = {
  segments: 7,    // body plates AND leg pairs (the hybrid identity)
  bodyLen: 1.0,   // body length (head→tail)
  bodyWide: 1.0,  // body width
  legLen: 1.0,    // leg length
  legGirth: 1.0,  // leg thickness
  armor: 1.0,     // plate/seam prominence
  antennae: 1.0,  // antenna length
  tailFan: 1.0,   // uropod tail-fan size
  chassis: 0,     // 0 organic .. 1 mechanical (mech-pod)
  cadence: 1.0,   // gait speed
  hue: 22,
  w: 44, h: 54,   // taller than wide (top-down, head up)
};

export const FAMILIES = {
  pillbug:   { segments: 7, bodyLen: 0.82, bodyWide: 1.08, legLen: 0.78, armor: 1.25, antennae: 0.65, tailFan: 0.55, hue: 214 },
  woodlouse: { segments: 7, bodyLen: 1.15, bodyWide: 0.84, legLen: 0.92, armor: 1.0, antennae: 1.25, tailFan: 0.85, hue: 28 },
  giant:     { segments: 8, bodyLen: 1.1, bodyWide: 1.22, legLen: 1.0, armor: 1.35, antennae: 0.85, tailFan: 1.45, hue: 36 },
  mechpod:   { segments: 6, bodyLen: 1.0, bodyWide: 1.0, legLen: 1.05, armor: 1.0, antennae: 0.8, tailFan: 0.8, chassis: 1, hue: 208 },
};

export function buildIsopodGenome(seed, genes = {}) {
  const g = { ...DEFAULT_GENES, ...genes };
  g.segments = clamp(Math.round(g.segments), 4, 11);
  for (const k of ['bodyLen','bodyWide','legLen','legGirth','armor','antennae','tailFan','cadence']) g[k] = clamp(+g[k], 0.3, 2);
  g.chassis = clamp(+g.chassis, 0, 1);
  const rnd = rngFor(seed), w = g.w | 0, h = g.h | 0, mech = g.chassis > 0.5, unit = Math.min(w, h) * 0.15;
  const span = g.bodyLen * h * 0.72;
  return {
    seed, w, h, genes: g, mech, unit, segs: g.segments,
    cx: w * 0.5, cy: h * 0.5, span, headY: h * 0.5 - span / 2, tailY: h * 0.5 + span / 2,
    baseW: g.bodyWide * w * 0.36, coxa: g.legLen * unit * 1.05, tibia: g.legLen * unit * 1.55,
    ramps: { fur: ramp(rnd, g.hue, mech ? 12 : 42, mech ? 4 : 14) },
    dark: ramp(rnd, g.hue, mech ? 8 : 28, 6)[0],
    eye: mech ? '#7fe0ff' : '#06070a', accent: ramp(rnd, mech ? 200 : (g.hue + 30) % 360, 70)[3],
  };
}

// half-width of the armoured oval at body fraction i (0 head .. 1 tail): broad head, widest pereon, tapering tail
const halfW = (i, G) => G.baseW * Math.sqrt(Math.max(0, 1 - Math.pow((i - 0.46) / 0.56, 2)));

export function isopodFrame(G, t) {
  t = t || 0;
  const W = G.w, H = G.h, N = G.segs, out = new Map();
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
  const fur = G.ramps.fur, near = fur[3], mid = fur[2], edge = fur[1], legc = fur[1];
  const iAt = (y) => (y - G.headY) / G.span;

  // a 2-segment leg (polypod's, via the shared gait) — drawn first so the body covers the attach
  const drawLeg = (ax, ay, outAng, bend, phase) => {
    const { swing, lift } = gaitStep(phase);
    const reach = 1 - 0.24 * lift, a1 = outAng + 0.30 * swing;
    const kx = ax + Math.cos(a1) * G.coxa * reach, ky = ay + Math.sin(a1) * G.coxa * reach;
    const a2 = a1 + bend * (0.8 + 0.1 * swing);
    const tx = kx + Math.cos(a2) * G.tibia * reach, ty = ky + Math.sin(a2) * G.tibia * reach;
    const wd = Math.max(1, Math.round(2 * G.genes.legGirth));
    thick(ax, ay, kx, ky, legc, wd, 2); thick(kx, ky, tx, ty, legc, Math.max(1, wd - 1), 2);
    if (G.mech) put(kx, ky, G.dark, 2.1);
    put(tx, ty, G.dark, 2.2);
  };
  // one leg pair per body segment (the polypod half), metachronal down the body (the shared wave)
  for (let s = 0; s < N; s++) {
    const i = (s + 0.5) / N, ay = lerp(G.headY, G.tailY, i), aw = halfW(i, G) * 0.92;
    const rOut = lerp(-0.18, 0.55, N > 1 ? s / (N - 1) : 0.5);   // front legs forward, rear legs back
    drawLeg(G.cx + aw, ay, rOut, 1, legPhase(s, 1, N, t, { speed: G.genes.cadence }));
    drawLeg(G.cx - aw, ay, Math.PI - rOut, -1, legPhase(s, -1, N, t, { speed: G.genes.cadence }));
  }

  // tail fan (uropods) behind the body
  if (G.genes.tailFan > 0.3) {
    const fl = G.genes.tailFan * G.unit * 1.6, ty = G.tailY;
    for (const a of [-0.5, -0.18, 0.18, 0.5]) thick(G.cx, ty - G.unit * 0.3, G.cx + Math.sin(a) * fl, ty + Math.cos(a) * fl, mid, 1, 2.4);
  }

  // ── THE ARMOURED BODY: a top-down oval of TERGITE PLATES (axial's segmentation). Each plate is lit
  //    at its leading (head) edge and darkens toward its trailing seam → segmented armour for free. ──
  for (let y = Math.floor(G.headY); y <= G.tailY; y++) {
    const i = iAt(y), hw = halfW(i, G); if (hw < 0.5) continue;
    const pl = (i * N) % 1;                                       // 0 front of plate .. 1 at the seam
    for (let x = Math.ceil(G.cx - hw); x <= G.cx + hw; x++) {
      const onEdge = Math.abs(x - G.cx) > hw - 1.3;
      put(x, y, onEdge ? edge : (pl < 0.22 ? near : pl > 0.82 ? edge : mid), 3);
    }
  }
  // crisp seam lines between plates (bowed backward like real tergites); prominence from `armor`
  for (let k = 1; k < N; k++) {
    const i = k / N, sy = lerp(G.headY, G.tailY, i), hw = halfW(i, G), wd = G.genes.armor > 1.1 ? 2 : 1;
    for (let x = Math.ceil(G.cx - hw * 0.96); x <= G.cx + hw * 0.96; x++) {
      const bow = 0.10 * (1 - Math.pow((x - G.cx) / (hw || 1), 2)) * G.unit;
      thick(x, sy + bow, x, sy + bow, G.dark, wd, 3.5);
      if (G.mech && (x === Math.ceil(G.cx - hw * 0.96) || x >= G.cx + hw * 0.96 - 1)) put(x, sy + bow, G.accent, 3.6); // rivets
    }
  }

  // HEAD (top): two eyes; mech gets an optic bar. Antennae sweep forward.
  const hy = G.headY + G.unit * 0.7, hw0 = halfW(0.06, G);
  if (G.mech) { for (let o = -1; o <= 1; o++) put(G.cx + o, hy, G.eye, 5); }
  else for (const s of [-1, 1]) put(G.cx + s * hw0 * 0.55, hy, G.eye, 5);
  if (G.genes.antennae > 0.3) {
    const al = G.genes.antennae * G.unit * 2.1;
    for (const s of [-1, 1]) {
      const bx = G.cx + s * hw0 * 0.5, by = G.headY + G.unit * 0.3;
      const a = -Math.PI / 2 + s * 0.55 + Math.sin(t * TAU + s) * 0.16;
      thick(bx, by, bx + Math.cos(a) * al, by + Math.sin(a) * al, mid, 1, 4.1);
    }
  }
  return [...out.values()].map(({ x, y, c }) => ({ x, y, c }));
}

export function isopodSVG(G, scale, t) {
  scale = scale || 11;
  const Wd = G.w * scale, Ht = G.h * scale;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" shape-rendering="crispEdges"><rect width="${Wd}" height="${Ht}" fill="#0a0b0e"/>`;
  for (const r of isopodFrame(G, t || 0)) s += `<rect x="${r.x * scale}" y="${r.y * scale}" width="${scale}" height="${scale}" fill="${r.c}"/>`;
  return s + `</svg>`;
}

export class IsopodCritter {
  constructor({ seed, genes } = {}) { this.genome = buildIsopodGenome(seed || 'iso:0', genes); this.t = 0; }
  step(dt) { this.t += Math.min(dt, 0.1); }
  frame() { return isopodFrame(this.genome, this.t); }
}
