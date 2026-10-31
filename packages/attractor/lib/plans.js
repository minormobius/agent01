// plans.js — body plans other than the humanoid, as bones in 3D, for the attractors to fill.
//
// Ported from mega.mino.mobi/sprite (mega/sprite/{poly,quad,radial,axial,isopod}): the same genes, the
// same families, the same gaits (the shared traveling phase of sprite/wave.js: a phase that advances in
// time and lags along an ordered set of parts, the one idea under metachronal legs, undulating spines and
// pulsing arms). The sprites draw pixels, top-down or in profile; here each plan gives a list of bones
// [{ name, a, b, r0, r1, cls, side, ball }] in 3D (y up, +z the way it faces, feet on y = 0), and the
// order and count of the bones never changes with t, so a point keeps its bone.
//
// A plan: { families, defaults, rig(genes, seed) → R, pose(R, t) → { bones, size } }. `size` is the
// creature's rough extent, for the camera. Units are arbitrary (about a head); the camera fits them.

import { mulberry32 } from './space.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const B = (name, a, b, r0, r1, cls, side = 0, extra = {}) => ({ name, a, b, r0, r1, cls, side, ...extra });
// the shared wave (sprite/wave.js): left and right antiphase, a wave (or the tripod) running front to back
const legPhase = (p, side, pairs, t, speed = 1) => (side < 0 ? Math.PI : 0) + t * TAU * speed + p * Math.PI * (pairs <= 3 ? 1 : 0.55);
const gaitStep = (ph) => { const s = Math.sin(ph); return { swing: s, lift: Math.max(0, s) }; };

/** A walking leg of two bones: out from its attachment, up to a knee, down to a foot on the ground. */
function arthropodLeg(name, at, side, fan, phase, coxa, tibia, girth, stride = 0.32) {
  const { swing, lift } = gaitStep(phase), yaw = fan + stride * swing;
  const out = [side * Math.cos(yaw), 0, Math.sin(yaw)];
  const knee = add(add(at, mul(out, coxa * 0.8)), [0, coxa * 0.55, 0]);
  const foot = add(knee, mul(out, tibia * 0.55));
  foot[1] = lift * tibia * 0.25;
  return [B(`${name}.coxa`, at, knee, 0.12 * girth, 0.1 * girth, 'leg', side), B(`${name}.tibia`, knee, foot, 0.09 * girth, 0.05 * girth, 'leg', side)];
}

// ---- polypod: ant / spider / crab / spiderbot (mega/sprite/poly) -------------------------------------
const polypod = {
  defaults: { legs: 4, segs: 2, bodyLen: 1, bodyWide: 1, legLen: 1, legGirth: 1, claws: 0, antennae: 0, chassis: 0, cadence: 1 },
  families: {
    ant: { legs: 3, segs: 3, bodyLen: 1.15, bodyWide: 0.75, legLen: 1.0, legGirth: 0.8, antennae: 1 },
    spider: { legs: 4, segs: 2, bodyLen: 1.0, bodyWide: 0.95, legLen: 1.3, legGirth: 0.85 },
    crab: { legs: 5, segs: 1, bodyLen: 0.7, bodyWide: 1.55, legLen: 0.85, legGirth: 1.1, claws: 1 },
    spiderbot: { legs: 4, segs: 2, bodyLen: 1.0, bodyWide: 0.9, legLen: 1.35, legGirth: 1.0, chassis: 1 },
  },
  rig(g) {
    const L = 2.4 * g.bodyLen, W = g.bodyWide, legs = clamp(Math.round(g.legs), 2, 6), segs = clamp(Math.round(g.segs), 1, 3);
    const layout = segs === 1 ? [{ z: 0, rz: 0.5 * L, rx: 0.36 * L * W, head: true, thorax: true }]
      : segs === 2 ? [{ z: 0.28 * L, rz: 0.2 * L, rx: 0.2 * L * W, head: true, thorax: true }, { z: -0.22 * L, rz: 0.32 * L, rx: 0.3 * L * W }]
      : [{ z: 0.42 * L, rz: 0.1 * L, rx: 0.1 * L * W, head: true }, { z: 0.14 * L, rz: 0.16 * L, rx: 0.12 * L * W, thorax: true }, { z: -0.3 * L, rz: 0.3 * L, rx: 0.22 * L * W }];
    return { g, L, legs, layout, coxa: 1.1 * g.legLen, tibia: 1.6 * g.legLen, y0: 0.9 * g.legLen };
  },
  pose(R, t) {
    const { g, L, legs, layout, coxa, tibia, y0 } = R, bones = [];
    const bob = 0.03 * Math.sin(t * TAU * 2 * g.cadence);
    for (const [i, s] of layout.entries()) bones.push(B(`seg${i}`, [0, y0 + bob, s.z - s.rz], [0, y0 + bob, s.z + s.rz], s.rx, s.rx * 0.9, s.head && layout.length > 1 ? 'head' : 'torso'));
    const th = layout.find((s) => s.thorax);
    for (let p = 0; p < legs; p++) {
      const f = legs > 1 ? p / (legs - 1) : 0.5, z = lerp(th.z + 0.7 * th.rz, th.z - 0.7 * th.rz, f), fan = lerp(0.85, -0.85, f);
      for (const side of [1, -1]) {
        const at = [side * th.rx * 0.85, y0 + bob, z];
        if (p === 0 && g.claws > 0.5) {
          // a claw: forward and out, then a pincer that opens and closes
          const e = add(at, [side * 0.35 * coxa, 0.2 * coxa, 0.75 * coxa]), open = 0.45 + 0.2 * Math.sin(t * TAU);
          bones.push(B(`claw${side}`, at, e, 0.16 * g.legGirth, 0.2 * g.legGirth, 'arm', side));
          for (const o of [-1, 1]) bones.push(B(`pincer${side}${o}`, e, add(e, [side * 0.2 * tibia * Math.sin(o * open), 0.1 * o * tibia, 0.45 * tibia * Math.cos(open)]), 0.12 * g.legGirth, 0.05 * g.legGirth, 'end', side));
        } else bones.push(...arthropodLeg(`leg${p}${side}`, at, side, fan, legPhase(p, side, legs, t, g.cadence), coxa, tibia, g.legGirth));
      }
    }
    if (g.antennae > 0.4) {
      const hd = layout.find((s) => s.head);
      for (const side of [1, -1]) {
        const sw = 0.18 * Math.sin(t * TAU + side), a = [side * hd.rx * 0.5, y0 + bob + hd.rx * 0.5, hd.z + hd.rz * 0.8];
        bones.push(B(`antenna${side}`, a, add(a, [side * (0.5 + sw) * g.antennae, 0.7 * g.antennae, 1.2 * g.antennae]), 0.05, 0.03, 'end', side));
      }
    }
    return { bones, size: Math.max(L, 2 * (coxa + tibia)) * 1.1 };
  },
};

// ---- quadruped: hound / boar / bear / robot (mega/sprite/quad) ---------------------------------------
const quadruped = {
  defaults: { body: 1, depth: 1, leg: 1, neck: 1, head: 1, snout: 1, tail: 1, ear: 1, stance: 0.4, chassis: 0, stride: 1, cadence: 1 },
  families: {
    hound: { body: 1.0, depth: 0.82, leg: 1.15, neck: 0.95, head: 0.9, snout: 1.15, tail: 1.1, ear: 1.25, stance: 0.3 },
    boar: { body: 1.12, depth: 1.32, leg: 0.78, neck: 0.62, head: 1.2, snout: 1.35, tail: 0.4, ear: 0.8, stance: 0.28 },
    bear: { body: 1.12, depth: 1.42, leg: 0.92, neck: 0.55, head: 1.08, snout: 0.78, tail: 0.18, ear: 0.7, stance: 1.0 },
    robot: { body: 1.0, depth: 1.0, leg: 1.05, neck: 0.8, head: 0.95, snout: 0.7, tail: 0.5, ear: 0.5, stance: 0.45, chassis: 1 },
  },
  rig(g) {
    const Bl = 3.2 * g.body, R = 0.62 * g.depth, H = 1.9 * g.leg + 0.3;
    return { g, Bl, R, H, seg: H * 0.56 };
  },
  pose(Q, t) {
    const { g, Bl, R, H, seg } = Q, bones = [], bob = Math.sin(t * TAU * 2.3 * g.cadence) * R * 0.06;
    const sh = [0, H + bob, Bl / 2], hp = [0, H + bob, -Bl / 2];
    bones.push(B('trunk', hp, sh, R, R * 0.95, 'torso'));
    // legs: a two-bone IK from the joint to a foot on its gait (a trot: diagonals together)
    const leg = (name, j, side, ph, kneeFwd) => {
      const at = [side * R * 0.55, j[1] - R * 0.2, j[2]], { swing, lift } = gaitStep(ph);
      const foot = [at[0], lift * 0.3 * g.stride, at[2] + 0.45 * g.stride * swing];
      const d = [foot[0] - at[0], foot[1] - at[1], foot[2] - at[2]], dl = Math.hypot(...d), u = mul(d, 1 / dl);
      const x = Math.min(dl, 2 * seg - 1e-3) / 2, hgt = Math.sqrt(Math.max(0, seg * seg - x * x));
      const knee = add(add(at, mul(u, x)), [0, 0, kneeFwd * hgt]);
      bones.push(B(`${name}.upper`, at, knee, 0.28 * g.depth, 0.2, 'leg', side), B(`${name}.lower`, knee, foot, 0.18, 0.12 + 0.08 * g.stance, 'leg', side));
    };
    const ph = t * TAU * 1.15 * g.cadence;
    leg('fl', sh, 1, ph, -1); leg('fr', sh, -1, ph + Math.PI, -1); leg('hl', hp, 1, ph + Math.PI, 1); leg('hr', hp, -1, ph, 1);
    // neck up and forward, the head along its snout, ears, a tail curling up
    const nb = add(sh, [0, R * 0.45, R * 0.3]), hd = add(nb, [0, Math.sin(0.42) * 1.3 * g.neck, Math.cos(0.42) * 1.3 * g.neck]);
    bones.push(B('neck', nb, hd, R * 0.55, R * 0.4, 'torso'));
    const hr = 0.48 * g.head, snout = add(hd, [0, -0.15 * hr, hr * (0.9 + 0.7 * g.snout)]);
    bones.push(B('head', add(hd, [0, 0, -hr * 0.6]), snout, hr, hr * 0.55, 'head'));
    for (const side of [1, -1]) bones.push(B(`ear${side}`, add(hd, [side * hr * 0.45, hr * 0.6, -hr * 0.3]), add(hd, [side * hr * 0.6, hr * (0.6 + 0.9 * g.ear), -hr * 0.55]), 0.12, 0.04, 'end', side));
    let p = add(hp, [0, R * 0.3, -R * 0.2]), a = 2.6;
    for (let i = 0; i < 4; i++) {
      a += (g.tail > 0.85 ? -0.3 : 0.08) + 0.05 * Math.sin(t * TAU + i);
      const q = add(p, [0.05 * Math.sin(t * TAU * 1.3 + i), Math.sin(a) * 0.35 * g.tail, Math.cos(a) * 0.35 * g.tail]);
      bones.push(B(`tail${i}`, p, q, 0.2 * (1 - i * 0.2), 0.16 * (1 - i * 0.2), 'end'));
      p = q;
    }
    return { bones, size: Bl + 2 * H };
  },
};

// ---- radial: a floating basket-star or jelly (mega/sprite/radial) -------------------------------------
const radial = {
  defaults: { arms: 5, depth: 3, splay: 0.52, taper: 0.64, reach: 0.92, writhe: 0.5, waveDelay: 0.7, coupling: 1.4, baseFreq: 1.1 },
  families: {
    starfish: { arms: 5, depth: 1, splay: 0.3, taper: 0.8, reach: 1, writhe: 0.35 },
    basket: { arms: 5, depth: 4, splay: 0.55, taper: 0.66, reach: 0.95, writhe: 0.55 },
    jelly: { arms: 8, depth: 2, splay: 0.3, taper: 0.8, reach: 1.1, writhe: 0.7, coupling: 2.5 },
    brittle: { arms: 6, depth: 0, reach: 1.1, writhe: 0.8 },
  },
  rig(g, seed) {
    const rnd = mulberry32(seed * 31 + 7), arms = clamp(Math.round(g.arms), 3, 9), depth = clamp(Math.round(g.depth), 0, 4);
    // one seeded arm tree, rotated for every arm: a stalk, then bifurcating each generation
    const node = (gen) => ({ gen, rel: 0, kids: gen < depth ? (gen === 0 ? [node(gen + 1)] : [node(gen + 1), node(gen + 1)]).map((k, i, all) => ({ ...k, rel: (all.length === 1 ? 0 : i ? 1 : -1) * g.splay * (0.6 + rnd() * 0.8) })) : [] });
    const tree = node(0), total = Array.from({ length: depth + 1 }, (_, i) => g.taper ** i).reduce((a, b) => a + b, 0);
    const len0 = (3.2 * g.reach) / total;
    // each arm its own oscillator; strong coupling pulls them into step (a Kuramoto flavour)
    const phase0 = Array.from({ length: arms }, () => rnd() * TAU * Math.exp(-g.coupling));
    return { g, arms, tree, len0, phase0, disc: 0.55, y0: 3.4 };
  },
  pose(R, t) {
    const { g, arms, tree, len0, phase0, disc, y0 } = R, bones = [];
    const bob = 0.15 * Math.sin(t * TAU * 0.3);
    bones.push(B('disc', [0, y0 + bob, 0], [0, y0 + bob, 0], disc, disc, 'head', 0, { ball: true }));
    for (let a = 0; a < arms; a++) {
      const base = (a * TAU) / arms, ap = t * TAU * g.baseFreq * 0.5 + phase0[a];
      const walk = (n, p, ang, el) => {
        const local = ap - n.gen * g.waveDelay;
        const h = ang + n.rel + g.writhe * 0.5 * Math.sin(local), e = el - 0.28 - 0.1 * n.gen + g.writhe * 0.35 * Math.cos(local);
        const len = len0 * g.taper ** n.gen, q = add(p, [Math.cos(h) * Math.cos(e) * len, Math.sin(e) * len, Math.sin(h) * Math.cos(e) * len]);
        bones.push(B(`arm${a}.${n.gen}.${bones.length}`, p, q, 0.2 * 0.8 ** n.gen, 0.16 * 0.8 ** n.gen, n.gen ? 'end' : 'arm'));
        for (const k of n.kids) walk(k, q, h, e);
      };
      walk(tree, [Math.cos(base) * disc, y0 + bob, Math.sin(base) * disc], base, 0.1);
    }
    return { bones, size: 2 * (disc + 3.2 * g.reach) };
  },
};

// ---- axial: worm / snake / eel / mechworm (mega/sprite/axial) -----------------------------------------
const axial = {
  defaults: { length: 1, girth: 1, taper: 0.5, amp: 1, waves: 1.5, headSize: 1, fins: 0, segments: 10, chassis: 0, cadence: 1 },
  families: {
    worm: { length: 0.82, girth: 1.1, taper: 0.5, amp: 0.5, waves: 1.9, headSize: 0.8, fins: 0, segments: 16 },
    snake: { length: 1.25, girth: 0.78, taper: 0.7, amp: 1.15, waves: 1.6, headSize: 1.05, fins: 0, segments: 7 },
    eel: { length: 1.18, girth: 0.95, taper: 0.62, amp: 1.35, waves: 1.3, headSize: 1.3, fins: 1, segments: 3 },
    mechworm: { length: 1.0, girth: 1.0, taper: 0.5, amp: 0.7, waves: 1.6, headSize: 1.0, fins: 0, segments: 9, chassis: 1 },
  },
  rig(g) { return { g, L: 7 * g.length, M: 16 }; },
  pose(R, t) {
    const { g, L, M } = R, bones = [], pts = [];
    const radius = (i) => 0.42 * g.girth * (i < 1 - g.taper ? 0.3 + 0.7 * (i / Math.max(0.01, 1 - g.taper)) : 1) * (i > 0.85 ? 1 + 0.35 * (g.headSize - 1) + 0.15 : 1);
    for (let k = 0; k <= M; k++) {
      const i = k / M, env = 0.35 + 0.65 * (1 - i);
      const x = g.amp * 0.8 * env * Math.sin(TAU * g.waves * i - t * TAU * g.cadence * 0.85);
      pts.push([x, radius(i) + (i > 0.85 ? (i - 0.85) * 2.2 : 0), lerp(-L / 2, L / 2, i)]);
    }
    for (let k = 0; k < M; k++) bones.push(B(`spine${k}`, pts[k], pts[k + 1], radius(k / M), radius((k + 1) / M), k >= M - 2 ? 'head' : 'torso'));
    if (g.fins > 0.35) for (let k = 3; k < M - 3; k += 2) { const f = Math.sin(((k / M - 0.18) / 0.62) * Math.PI); if (f > 0) bones.push(B(`fin${k}`, pts[k], add(pts[k], [0, 0.9 * g.fins * f, 0]), 0.08, 0.03, 'end')); }
    else for (let k = 3; k < M - 3; k += 2) bones.push(B(`fin${k}`, pts[k], pts[k], 0.01, 0.01, 'end'));   // (the count never changes)
    return { bones, size: L * 1.05 };
  },
};

// ---- isopod: pill-bug / woodlouse / giant / mech-pod (mega/sprite/isopod) -----------------------------
const isopod = {
  defaults: { segments: 7, bodyLen: 1, bodyWide: 1, legLen: 1, legGirth: 1, armor: 1, antennae: 1, tailFan: 1, chassis: 0, cadence: 1 },
  families: {
    pillbug: { segments: 7, bodyLen: 0.82, bodyWide: 1.08, legLen: 0.78, armor: 1.25, antennae: 0.65, tailFan: 0.55 },
    woodlouse: { segments: 7, bodyLen: 1.15, bodyWide: 0.84, legLen: 0.92, armor: 1.0, antennae: 1.25, tailFan: 0.85 },
    giant: { segments: 8, bodyLen: 1.1, bodyWide: 1.22, legLen: 1.0, armor: 1.35, antennae: 0.85, tailFan: 1.45 },
    mechpod: { segments: 6, bodyLen: 1.0, bodyWide: 1.0, legLen: 1.05, armor: 1.0, antennae: 0.8, tailFan: 0.8, chassis: 1 },
  },
  rig(g) { const S = clamp(Math.round(g.segments), 4, 10); return { g, S, L: 4 * g.bodyLen, W: 1.1 * g.bodyWide, y0: 0.55 * g.legLen }; },
  pose(R, t) {
    const { g, S, L, W, y0 } = R, bones = [], dz = L / S;
    for (let s = 0; s < S; s++) {
      const u = (s + 0.5) / S, half = W * Math.sqrt(Math.max(0.15, 1 - (2 * u - 1) ** 2)), z = L / 2 - (s + 0.5) * dz;
      bones.push(B(`plate${s}`, [0, y0 + half * 0.35, z + dz / 2], [0, y0 + half * 0.35, z - dz / 2], half * 0.9, half * 0.9, s === 0 ? 'head' : 'torso'));
      for (const side of [1, -1]) bones.push(...arthropodLeg(`leg${s}${side}`, [side * half * 0.7, y0, z], side, lerp(0.5, -0.5, u), legPhase(s, side, S, t, g.cadence), 0.55 * g.legLen, 0.8 * g.legLen, 0.7 * g.legGirth, 0.25));
    }
    for (const side of [1, -1]) {
      const a = [side * 0.25, y0 + 0.3, L / 2], sw = 0.15 * Math.sin(t * TAU * 1.3 + side), m = add(a, [side * (0.5 + sw) * g.antennae, 0.3 * g.antennae, 0.9 * g.antennae]);
      bones.push(B(`antenna${side}`, a, m, 0.06, 0.04, 'end', side), B(`flagellum${side}`, m, add(m, [side * 0.6 * g.antennae, -0.1, 0.8 * g.antennae]), 0.04, 0.02, 'end', side));
      const b = [side * 0.3, y0 + 0.2, -L / 2];
      bones.push(B(`uropod${side}`, b, add(b, [side * 0.35 * g.tailFan, 0, -0.6 * g.tailFan]), 0.1 * g.tailFan, 0.05, 'end', side));
    }
    return { bones, size: L + 2.4 };
  },
};

export const PLANS = { polypod, quadruped, radial, axial, isopod };

/** The genes of a plan for a seed: a family, then every gene nudged (continuous: the families are points). */
export function planGenes(plan, seed, over = {}) {
  const P = PLANS[plan], rnd = mulberry32((seed >>> 0) * 40503 + plan.length);
  const fams = Object.keys(P.families), family = over.family && P.families[over.family] ? over.family : fams[Math.floor(rnd() * fams.length)];
  const g = { ...P.defaults, ...P.families[family] };
  for (const k of Object.keys(g)) if (typeof g[k] === 'number' && !['chassis', 'claws', 'antennae', 'fins'].includes(k)) g[k] *= 0.85 + 0.3 * rnd();
  return { family, genes: { ...g, ...(over.genes || {}) } };
}
