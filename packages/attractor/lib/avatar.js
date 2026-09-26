// avatar.js — a body made of strange attractors, from a seed.
//
// The skeleton is packages/figure's (head units; y up, +z forward, +x the figure's left): its joints for
// any body spec, any pose, and its walk. Each part of the body is filled by an attractor from the
// bestiary, chosen by fit (a head wants a round one, a torso a broad one), its longest axis laid along
// the bone and its other two across it, scaled to the part. Left and right share one attractor, mirrored.
// A point is anchored on its part's surface and has a place in the attractor; `thought` (0..1) moves it
// from one to the other, and on the surface it swirls: round the part and back and forth along it.
//
// The seed chooses everything (body, attractors, palette, the swirl, how far the orbits reach), so a
// seed is a character; every choice can be overridden. Pure and deterministic: a function of (seed, t).

import { BESTIARY } from './bestiary.js';
import { realise, mulberry32 } from './space.js';

/** The parts: [name, from joint, to joint, radius at from, radius at to (head heights), class, side]. */
export const PARTS = [
  ['torso', 'pelvis', 'neck', 0.62, 0.58, 'torso', 0],
  ['head', 'headPivot', 'crown', 0.4, 0.4, 'head', 0],
  ['upper_l', 'shoulder_l', 'elbow_l', 0.2, 0.16, 'arm', 1], ['upper_r', 'shoulder_r', 'elbow_r', 0.2, 0.16, 'arm', -1],
  ['fore_l', 'elbow_l', 'wrist_l', 0.16, 0.12, 'arm', 1], ['fore_r', 'elbow_r', 'wrist_r', 0.16, 0.12, 'arm', -1],
  ['hand_l', 'wrist_l', 'fingers_l', 0.12, 0.1, 'end', 1], ['hand_r', 'wrist_r', 'fingers_r', 0.12, 0.1, 'end', -1],
  ['thigh_l', 'hip_l', 'knee_l', 0.3, 0.22, 'leg', 1], ['thigh_r', 'hip_r', 'knee_r', 0.3, 0.22, 'leg', -1],
  ['shin_l', 'knee_l', 'ankle_l', 0.22, 0.15, 'leg', 1], ['shin_r', 'knee_r', 'ankle_r', 0.22, 0.15, 'leg', -1],
  ['foot_l', 'heel_l', 'toe_l', 0.13, 0.1, 'end', 1], ['foot_r', 'heel_r', 'toe_r', 0.13, 0.1, 'end', -1],
];
/** How well an attractor's shape suits a class of part (higher is better), from its extents. */
const FIT = {
  head: ({ ext }) => ext[1] + ext[2] - 0.6 * Math.abs(ext[1] - ext[2]),          // round
  torso: ({ ext }) => 1 - Math.abs(ext[1] - 0.7) - Math.abs(ext[2] - 0.4),        // broad, some depth
  arm: ({ ext, dim }) => 0.4 + 0.3 * (dim - 1.5) - 0.3 * ext[2],                    // anything textured
  leg: ({ ext, dim }) => 0.5 + 0.3 * (dim - 1.5) - 0.2 * Math.abs(ext[1] - 0.6),
  end: ({ ext }) => 0.5 + ext[2],
};
export const PALETTES = {
  ember: [[1, 0.5, 0.18], [1, 0.78, 0.45]],
  coral: [[1, 0.42, 0.32], [1, 0.72, 0.6]],
  tide: [[0.2, 0.75, 1], [0.7, 0.95, 1]],
  verdigris: [[0.3, 1, 0.7], [0.85, 1, 0.8]],
  violet: [[0.62, 0.38, 1], [1, 0.75, 0.95]],
  gold: [[1, 0.78, 0.25], [1, 0.95, 0.7]],
  bone: [[0.9, 0.88, 0.82], [1, 1, 1]],
  spectrum: null,                                       // each part its own hue, round the wheel
};

/**
 * How the points are drawn, which changes what the eye reads. threads: few points with long streaks
 * (the attractor's own curves show); dust: many points, short streaks (a fine glowing sand); ribbons:
 * mid-length streaks held close to the surface (a skin of currents).
 */
export const STYLES = {
  threads: (rnd) => ({ points: 700 + Math.floor(rnd() * 500), streak: 22 + Math.floor(rnd() * 16), lagStep: 0.018 }),
  dust: (rnd) => ({ points: 3500 + Math.floor(rnd() * 1500), streak: 1 + Math.floor(rnd() * 2), lagStep: 0.03 }),
  ribbons: (rnd) => ({ points: 1600 + Math.floor(rnd() * 600), streak: 8 + Math.floor(rnd() * 6), lagStep: 0.025, thought: 0.25 + 0.3 * rnd() }),
};
/** The character a seed makes. Everything it returns can be overridden before `build`. */
export function character(seed, over = {}) {
  const rnd = mulberry32((seed >>> 0) * 2654435761 + 1);
  const pick = (cls, avoid = []) => {
    const ranked = BESTIARY.filter((b) => !avoid.includes(b.key)).map((b) => ({ b, s: FIT[cls](b) + 0.6 * rnd() })).sort((x, y) => y.s - x.s);
    return ranked[Math.floor(rnd() * Math.min(12, ranked.length))].b.key;
  };
  // a species (one attractor for every limb) or a chimera (one per class)
  const kin = rnd() < 0.35;
  const parts = {};
  parts.torso = pick('torso'); parts.head = pick('head', [parts.torso]);
  const limb = pick('arm', [parts.torso, parts.head]);
  parts.arm = limb; parts.leg = kin ? limb : pick('leg', [parts.torso, parts.head, limb]); parts.end = kin ? limb : pick('end');
  const pal = Object.keys(PALETTES)[Math.floor(rnd() * Object.keys(PALETTES).length)];
  const style = ['threads', 'threads', 'dust', 'ribbons'][Math.floor(rnd() * 4)];
  return {
    seed,
    body: { heads: 6 + rnd() * 2.4, build: rnd(), mass: 0.3 + rnd() * 0.5, legs: rnd(), femme: rnd() },
    parts, kin, palette: pal, hue: rnd(),
    thought: 0.55 + 0.45 * rnd(),       // how far into their orbits (0 on the surface)
    reach: 1 + rnd() * 0.9,             // an orbit's size, in multiples of the part's radius
    speed: 0.6 + rnd() * 1.2,           // how fast the points run their attractors
    swirl: 0.4 + rnd() * 1.2,           // how fast they stream over the surface
    ...STYLES[style](rnd),
    style,
    ...over,
  };
}

/** Make a character drawable: its attractors realised (integrated once) and its points laid out. */
export function build(ch) {
  const cache = {};
  const cloud = (key) => (cache[key] ||= realise(key, 16000));
  const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const area = PARTS.map(([, , , r0, r1, cls]) => (cls === 'head' ? 1.1 : 1) * (r0 + r1) * (cls === 'torso' ? 2.4 : cls === 'end' ? 0.6 : 1.4));
  const total = area.reduce((a, b) => a + b, 0), points = [];
  PARTS.forEach((part, pi) => {
    const n = Math.round((ch.points * area[pi]) / total);
    for (let k = 0; k < n; k++) {
      const id = points.length + ch.seed * 7919;
      points.push({ part: pi, u: hash(id, 1), th: hash(id, 2) * Math.PI * 2, v: hash(id, 5) * 2 - 1, off: Math.floor(hash(id, 3) * 16000), rate: (90 + 60 * hash(id, 4)) * ch.speed, spin: (0.7 + 0.9 * hash(id, 6)) * (hash(id, 8) < 0.5 ? -1 : 1) * ch.swirl, drift: (0.05 + 0.12 * hash(id, 7)) * ch.swirl });
    }
  });
  const clouds = PARTS.map(([, , , , , cls]) => cloud(ch.parts[cls]));
  const hues = PARTS.map((_, i) => hsv((ch.hue + i * 0.07) % 1, 0.75, 1));
  const colours = PARTS.map((p, i) => (PALETTES[ch.palette] ? PALETTES[ch.palette][p[5] === 'head' ? 1 : 0] : hues[i]));
  return { ch, points, clouds, colours };
}
function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Each part's frame from a solved pose's joints J (and the pelvis frame F.pelvis for "forward"). */
export function frames(J, fwd = [0, 0, 1]) {
  return PARTS.map(([, a, b, r0, r1, cls, side]) => {
    if (cls === 'head') {
      const c = [(J.headPivot[0] + J.crown[0]) / 2, (J.headPivot[1] + J.crown[1]) / 2 + 0.05, (J.headPivot[2] + J.crown[2]) / 2];
      const up = unit(sub(J.crown, J.headPivot));
      return { o: c, d: up, L: 0, e1: fwd, e2: unit(cross(up, fwd)), r0, r1, head: true, side };
    }
    const A = J[a], Bj = J[b], v = sub(Bj, A), L = Math.hypot(v[0], v[1], v[2]) || 1e-6, d = [v[0] / L, v[1] / L, v[2] / L];
    const ref = Math.abs(d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) < 0.9 ? fwd : [0, 1, 0];
    const dr = ref[0] * d[0] + ref[1] * d[1] + ref[2] * d[2];
    const e1 = unit([ref[0] - d[0] * dr, ref[1] - d[1] * dr, ref[2] - d[2] * dr]), e2 = cross(d, e1);
    return { o: A, d, L, e1, e2, r0, r1, side };
  });
}

const tri = (x) => 1 - Math.abs((((x % 2) + 2) % 2) - 1);
/**
 * Point i of a built avatar at time t: on its part's surface, swirling, moved `m` of the way into its
 * orbit (the part's attractor, `reach` × its radius). `lag` reads the orbit that much earlier (a streak).
 */
export function place(A, i, F, t, m, out, lag = 0) {
  const q = A.points[i], f = F[q.part], C = A.clouds[q.part], reach = A.ch.reach;
  let sx, sy, sz;
  if (f.head) {
    const v = 2 * tri((q.v + 1) / 2 + q.drift * t) - 1, th = q.th + q.spin * t * (1.2 - 0.6 * v * v);
    const c = Math.sqrt(Math.max(0, 1 - v * v)), a0 = c * Math.cos(th) * f.r0, a1 = v * f.r0 * 1.2, a2 = c * Math.sin(th) * f.r0;
    sx = f.o[0] + f.e1[0] * a0 + f.d[0] * a1 + f.e2[0] * a2; sy = f.o[1] + f.e1[1] * a0 + f.d[1] * a1 + f.e2[1] * a2; sz = f.o[2] + f.e1[2] * a0 + f.d[2] * a1 + f.e2[2] * a2;
  } else {
    const u = tri(q.u + q.drift * t), th = q.th + q.spin * t * (1 + 0.8 * Math.sin(2 * Math.PI * u));
    const r = f.r0 + (f.r1 - f.r0) * u, c = Math.cos(th) * r, s = Math.sin(th) * r, l = u * f.L;
    sx = f.o[0] + f.d[0] * l + f.e1[0] * c + f.e2[0] * s; sy = f.o[1] + f.d[1] * l + f.e1[1] * c + f.e2[1] * s; sz = f.o[2] + f.d[2] * l + f.e1[2] * c + f.e2[2] * s;
  }
  if (m <= 0.0005) { out[0] = sx; out[1] = sy; out[2] = sz; return out; }
  const k = ((Math.floor((t - lag) * q.rate) + q.off) % C.n + C.n) % C.n;
  const ax = C.p[k * 3], ay = C.p[k * 3 + 1], az = C.p[k * 3 + 2] * (f.side || 1);   // the right side mirrored
  let ox, oy, oz;
  if (f.head) {
    const R = f.r0 * reach;
    ox = f.o[0] + (f.e1[0] * ay + f.d[0] * ax * 1.2 + f.e2[0] * az) * R; oy = f.o[1] + (f.e1[1] * ay + f.d[1] * ax * 1.2 + f.e2[1] * az) * R; oz = f.o[2] + (f.e1[2] * ay + f.d[2] * ax * 1.2 + f.e2[2] * az) * R;
  } else {
    const u = (ax + 1) / 2, r = (f.r0 + (f.r1 - f.r0) * Math.min(1, Math.max(0, u))) * reach, l = u * f.L;
    ox = f.o[0] + f.d[0] * l + (f.e1[0] * ay + f.e2[0] * az) * r; oy = f.o[1] + f.d[1] * l + (f.e1[1] * ay + f.e2[1] * az) * r; oz = f.o[2] + f.d[2] * l + (f.e1[2] * ay + f.e2[2] * az) * r;
  }
  out[0] = sx + (ox - sx) * m; out[1] = sy + (oy - sy) * m; out[2] = sz + (oz - sz) * m;
  return out;
}
