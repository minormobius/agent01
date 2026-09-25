// world.js — the episode at any moment: where everyone is, how they are posed, what the
// camera sees. A pure function of t (script.js is the clock), so ?t= stills, headless checks
// and the soundtrack all agree with the picture.
//
// The coral head's shape lives here too (bommieSDF), line for line with render.js's GLSL, so
// node can check that no fish swims into the building.

import { SET, PATHS, LOOKS, SHELL, SHOTS, LIGHT, LINES, FOLEY, DURATION, sayings } from './script.js';

// ---- small vector kit -----------------------------------------------------------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export { add, sub, mul, len, lerp3 };

/** A keyframed track at t: eased between keys, held before the first and after the last. */
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      const u = ease((t - t0) / Math.max(1e-6, t1 - t0));
      return Array.isArray(a) ? lerp3(a, b, u) : lerp(a, b, u);
    }
  }
  return keys[keys.length - 1][1];
}
/** The value of a step track (no easing): the last key at or before t. */
const step = (keys, t) => { let v = keys[0][1]; for (const [k, x] of keys) if (t >= k) v = x; return v; };

// ---- the building ---------------------------------------------------------------------
// A mound and three lumps, smoothly united, with a low wobble over the surface. render.js has
// the same numbers (keep them in step: the selftest renders nothing, but checks against this).
export const LUMPS = [
  [SET.bommie.c, SET.bommie.r],
  [[-1.0, 0.9, -0.7], [1.0, 0.8, 0.8]],        // the left shoulder (Nell's station sits on it)
  [[1.6, 0.7, -0.9], [1.0, 0.9, 0.9]],
  [[0.7, 2.1, -1.4], [0.9, 0.6, 0.8]],         // the roof Barry eats
];
function sdEll(p, c, r) {
  const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  const k0 = Math.hypot(...q), k1 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export function bommieSDF(p) {
  let d = 1e9;
  for (const [c, r] of LUMPS) d = smin(d, sdEll(p, c, r), 0.5);
  d += 0.06 * Math.sin(3.1 * p[0]) * Math.sin(2.7 * p[1] + 1.0) * Math.sin(3.3 * p[2]);
  return Math.max(d, -p[1]);                       // cut flat at the sand
}

// ---- paths: arc length, so gaits and fins are tied to distance, not to time -------------------
const HZ = 60;
const arcTables = {};
function arcTable(name) {
  if (arcTables[name]) return arcTables[name];
  const n = Math.ceil(DURATION * HZ) + 1, s = new Float32Array(n);
  let prev = track(PATHS[name], 0);
  for (let i = 1; i < n; i++) { const p = track(PATHS[name], i / HZ); s[i] = s[i - 1] + len(sub(p, prev)); prev = p; }
  return (arcTables[name] = s);
}
const arcAt = (table, t) => { const x = clamp(t * HZ, 0, table.length - 1), i = Math.floor(x), f = x - i; return i + 1 < table.length ? lerp(table[i], table[i + 1], f) : table[i]; };
/** The time at which a table first reaches arc length s (for footfalls: where was the body then?). */
function timeAtArc(table, s) {
  let lo = 0, hi = table.length - 1;
  if (s <= table[0]) return 0;
  if (s >= table[hi]) return hi / HZ;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m] < s) lo = m; else hi = m; }
  return (lo + (s - table[lo]) / Math.max(1e-9, table[hi] - table[lo])) / HZ;
}

const SAY = sayings();
/** How open a resident's mouth is at t (0..1): the envelope of the syllables it is saying. */
export function mouthAt(who, t) {
  let m = 0;
  for (const L of SAY) {
    if (L.who !== who || t < L.at - 0.1 || t > L.end + 0.2) continue;
    for (const s of L.syl) {
      const u = (t - s.at) / s.dur;
      if (u > -0.1 && u < 1.2) m = Math.max(m, s.open * Math.sin(Math.PI * clamp(u / 1.1)));
    }
  }
  return m;
}
/** Is the resident speaking at t (for the anemone's glow, a claw's gesture)? */
export const speaking = (who, t) => SAY.some((L) => L.who === who && t >= L.at - 0.05 && t <= L.end + 0.1);
export { SAY };

// ---- the fish -------------------------------------------------------------------------
// species: body length, height, width; tail; swim beat (Hz at rest, per unit of speed)
export const SPECIES = {
  nell: { len: 0.62, h: 0.17, w: 0.11, tail: 0.16, beat: 1.4, perSpeed: 2.2 },
  dot: { len: 0.5, h: 0.24, w: 0.14, tail: 0.14, beat: 2.2, perSpeed: 2.6 },
  dash: { len: 0.46, h: 0.22, w: 0.13, tail: 0.13, beat: 2.6, perSpeed: 2.8 },
  barry: { len: 1.25, h: 0.52, w: 0.34, tail: 0.34, beat: 0.9, perSpeed: 1.2 },
};

function facingOf(name, t) {
  const v = sub(track(PATHS[name], t + 0.12), track(PATHS[name], t - 0.3));
  const speed = len(v) / 0.42;
  const look = LOOKS[name] ? step(LOOKS[name], t) : 'camera';
  const here = track(PATHS[name], t);
  let target;
  if (look === 'camera') target = add(here, [0.35, 0, 1]);
  else if (PATHS[look]) target = track(PATHS[look], t);
  else if (SET.props[look]) target = SET.props[look].at;
  else if (look === 'pip') target = SET.pip;
  else target = add(here, [0, 0, 1]);
  const toT = sub(target, here); toT[1] = 0;
  const lookDir = len(toT) > 1e-3 ? mul(toT, 1 / len(toT)) : [0, 0, 1];
  const move = [v[0], 0, v[2]];
  const moving = clamp((speed - 0.12) / 0.3);
  const dir = len(move) > 1e-4 ? lerp3(lookDir, mul(move, 1 / len(move)), moving) : lookDir;
  return { yaw: Math.atan2(dir[0], dir[2]), pitch: clamp(v[1] / Math.max(0.05, len(v)), -0.6, 0.6) * moving * 0.6, speed };
}

/** A fish at t: centre, yaw (0 faces the camera, +z), pitch, the swim wave's phase and size, the mouth. */
export function fishAt(name, t) {
  const sp = SPECIES[name];
  const pos = [...track(PATHS[name], t)];
  const { yaw, pitch, speed } = facingOf(name, t);
  // a hover bob; the arc length drives the tail, so a fish that goes faster beats faster
  const i = Object.keys(SPECIES).indexOf(name);
  pos[1] += 0.035 * Math.sin(t * 1.3 + i * 1.7) * (1 - clamp(speed / 1.5));
  const phase = 2 * Math.PI * (sp.beat * t + sp.perSpeed * arcAt(arcTable(name), t) / sp.len * 0.25);
  const amp = 0.05 + 0.12 * clamp(speed / 2);
  let mouth = mouthAt(name, t);
  // Barry bites the building
  let bite = 0;
  if (name === 'barry') for (const f of FOLEY) if (f.fx === 'crunch') { const u = (t - f.at + 0.12) / 0.3; if (u > 0 && u < 1) bite = Math.max(bite, Math.sin(Math.PI * u)); }
  mouth = Math.max(mouth, bite);
  return { name, pos, yaw, pitch, phase, amp, mouth, speed, ...sp };
}

// ---- Gus ------------------------------------------------------------------------------
const STRIDE = 0.2, LEGS = [
  // [side, fore/aft offset of the hip, of the foot's home, and the leg's phase]
  [1, 0.06, 0.16, 0.0], [1, -0.06, -0.08, 0.5], [-1, 0.06, 0.16, 0.5], [-1, -0.06, -0.08, 0.0],
];
// scrabbling: legs going nowhere (the conch). [t0, t1, extra arc per second]
const SCRABBLE = [[55.4, 59.6, 1.4], [44.2, 45.2, 0.6], [69.2, 69.9, 0.9]];
const scrabbleAt = (t) => SCRABBLE.reduce((s, [a, b, r]) => s + r * clamp(t - a, 0, b - a), 0);
let legTable = null;
function legArc() {
  if (legTable) return legTable;
  const base = arcTable('gus'), out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = base[i] + scrabbleAt(i / HZ);
  return (legTable = out);
}

/** The body's frame on the sand at t: position, heading (yaw, 0 faces +z), forward and right. */
function gusBody(t) {
  const pos = track(PATHS.gus, t);
  const { yaw } = facingOfGus(t);
  const f = [Math.sin(yaw), 0, Math.cos(yaw)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  return { pos: [pos[0], 0, pos[2]], yaw, f, r };
}
function facingOfGus(t) {
  const v = sub(track(PATHS.gus, t + 0.1), track(PATHS.gus, t - 0.3));
  const speed = len(v) / 0.4;
  const look = step(LOOKS.gus, t), here = track(PATHS.gus, t);
  const target = look === 'camera' ? add(here, [0.2, 0, 1]) : PATHS[look] ? track(PATHS[look], t) : SET.props[look] ? SET.props[look].at : look === 'pip' ? SET.pip : add(here, [0, 0, 1]);
  const toT = sub(target, here); toT[1] = 0;
  const lookDir = len(toT) > 1e-3 ? mul(toT, 1 / len(toT)) : [0, 0, 1];
  const move = [v[0], 0, v[2]], moving = clamp((speed - 0.05) / 0.2);
  const dir = len(move) > 1e-4 ? lerp3(lookDir, mul(move, 1 / len(move)), moving) : lookDir;
  return { yaw: Math.atan2(dir[0], dir[2]), speed };
}
const inFrame = (B, v) => add(B.pos, add(mul(B.r, v[0]), add([0, v[1], 0], mul(B.f, v[2]))));

/**
 * Gus at t. Each leg's foot is planted where the body was when that step began, so a planted
 * foot cannot slide; between plants it swings on an arc. Returns joints in world space, his
 * shell, how far out of it he is, and whether he is hidden (inside the can).
 */
export function gusAt(t) {
  const B = gusBody(t);
  const shell = step(SHELL, t);
  const table = legArc(), s = arcAt(table, t);
  const legs = LEGS.map(([side, hipZ, homeZ, off], li) => {
    const u = s / STRIDE + off, k = Math.floor(u), frac = u - k;
    const plant = (kk) => { const tk = timeAtArc(table, (kk - off + 0.5) * STRIDE); const Bk = gusBody(tk); return inFrame(Bk, [side * 0.33, 0, homeZ]); };
    let foot;
    if (frac < 0.62) foot = plant(k);
    else { const w = ease((frac - 0.62) / 0.38); foot = lerp3(plant(k), plant(k + 1), w); foot[1] = 0.07 * Math.sin(Math.PI * w); }
    const hip = inFrame(B, [side * 0.12, 0.2, hipZ]);
    // the knee: up and out between the hip and the foot (a crab's leg arches)
    const mid = lerp3(hip, foot, 0.5);
    const outDir = sub(foot, hip); outDir[1] = 0;
    const o = len(outDir) > 1e-4 ? mul(outDir, 1 / len(outDir)) : B.r;
    const knee = add(mid, add([0, 0.13, 0], mul(o, 0.05)));
    return { hip, knee, foot, li, stance: frac < 0.62 };
  });
  // out of the shell: withdrawn before 12.6, then out; in the can only his eyes show
  const out = t < 12.2 ? 0 : t < 13.0 ? ease((t - 12.2) / 0.8) : 1;
  const inCan = shell === 'can';
  const dust = t < 66.1 ? 0 : t < 69.4 ? 1 : 1 - ease((t - 69.4) / 0.8);
  const shake = t > 69.4 && t < 70.1 ? Math.sin((t - 69.4) * 60) * 0.06 : 0;
  const dizzy = t > 44.2 && t < 46.4 ? Math.sin((t - 44.2) * 9) * 0.25 * (1 - (t - 44.2) / 2.2) : 0;
  const talk = mouthAt('gus', t);
  // the big claw gestures when he talks; eyestalks wag
  const claw = speaking('gus', t) ? 0.4 + 0.6 * talk : 0.1 + 0.05 * Math.sin(t * 1.7);
  return { ...B, yaw: B.yaw + shake + dizzy, legs, shell, out, inCan, dust, claw, talk, eyes: 0.1 * Math.sin(t * 2.3) + dizzy };
}

// ---- props ----------------------------------------------------------------------------
/** The shells and the can at t: position, yaw about y, and a roll/tilt about their own axis. */
export function propsAt(t) {
  const P = SET.props, G = gusAt(t);
  // the whelk: on Gus's back when he wears it, else where he left it
  const worn = G.shell === 'whelk';
  const whelk = worn
    ? { at: add(inFrame(G, [0, 0.26 * (0.7 + 0.3 * G.out), -0.26 * G.out - 0.04]), [0, 0, 0]), yaw: G.yaw, tilt: 0.35 }
    : { at: [P.whelk.at[0], 0.14, P.whelk.at[2]], yaw: P.whelk.yaw, tilt: -0.45 };   // door up, where he left it
  // the can: still, then rolling off with Gus inside (40.2–43.8), 3.6 s, ~0.9 units
  const rollU = ease((t - 40.2) / 3.6);
  const can = { at: [P.can.at[0] + 0.95 * rollU, P.can.r, P.can.at[2]], yaw: P.can.yaw, roll: (0.95 * rollU) / P.can.r + 0.1 * Math.sin(Math.max(0, t - 43.8) * 6) * Math.exp(-Math.max(0, t - 43.8) * 3) };
  if (t > 36.4 && t < 40.2) can.roll = 0.12 * Math.sin((t - 36.4) * 5) * (t < 38.6 ? 1 : 0.3);
  // the conch: lifted a hair and dropped, again and again
  let lift = 0;
  if (t > 55.4 && t < 59.6) { const u = ((t - 55.4) / 4.2) * 4; lift = 0.05 * Math.max(0, Math.sin(Math.PI * u)) * (u < 3.4 ? 1 : 0); }
  const conch = { at: [P.conch.at[0], 0.2 + lift, P.conch.at[2]], yaw: P.conch.yaw, tilt: 0.1 + lift * 2 };
  return { whelk, can, conch };
}

// ---- the anemone ----------------------------------------------------------------------
export function pipAt(t) {
  const talk = mouthAt('pip', t);
  return { at: SET.pip, sway: t, glow: 0.25 + 0.75 * talk, talk };
}

// ---- light, camera ---------------------------------------------------------------------
/** The day's phase as weights: { night, dawn, day, dusk } summing to 1. */
export function lightAt(t) {
  const w = { night: 0, dawn: 0, day: 0, dusk: 0 }, names = ['night', 'dawn', 'day', 'dusk'];
  let i = 0;
  while (i + 1 < LIGHT.length && LIGHT[i + 1][0] <= t) i++;
  if (i + 1 >= LIGHT.length) { w[names[LIGHT[i][1]]] = 1; return w; }
  const [t0, a] = LIGHT[i], [t1, b] = LIGHT[i + 1], u = ease((t - t0) / (t1 - t0));
  w[names[a]] += 1 - u; w[names[b]] += u;
  return w;
}

/** The camera at t: eye, target, vertical field of view (radians), and the shot's name. */
export function cameraAt(t) {
  let i = 0;
  while (i + 1 < SHOTS.length && SHOTS[i + 1][0] <= t) i++;
  const [t0, s] = SHOTS[i];
  const u = t - t0;
  let target = s.target;
  if (s.follow) {
    const p = s.follow === 'gus' ? gusAt(t).pos : fishAt(s.follow, t).pos;
    // a follow shot trails its subject a little, as an operator does
    const p0 = s.follow === 'gus' ? gusAt(Math.max(t0, t - 0.5)).pos : fishAt(s.follow, Math.max(t0, t - 0.5)).pos;
    target = add(lerp3(p0, p, 0.6), s.off || [0, 0, 0]);
  }
  const yaw = s.yaw + 0.025 * Math.sin(u * 0.35 + i), pitch = s.pitch + 0.01 * Math.sin(u * 0.27 + i * 2);
  const dist = s.dist * (1 + 0.015 * Math.sin(u * 0.22)) + (s.pullBack || 0) * ease(u / 20);
  const eye = add(target, [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist]);
  return { eye, target, fov: (s.fov * Math.PI) / 180, name: s.name };
}

// ---- particles (drawn in 2D over the picture) --------------------------------------------
/** Sand and bubbles at t, in world space: [{ p, r, a, kind }]. Closed-form in their age. */
export function particlesAt(t) {
  const out = [];
  for (const [fi, f] of FOLEY.entries()) {
    const age = t - f.at;
    if (f.fx === 'crunch' && age > 0 && age < 2.2) {
      // grit from each bite, drifting down from Barry's beak
      const B = fishAt('barry', f.at);
      const beak = add(B.pos, [Math.sin(B.yaw) * B.len * 0.5, -0.05, Math.cos(B.yaw) * B.len * 0.5]);
      for (let k = 0; k < 10; k++) {
        const h1 = hash(fi * 31 + k), h2 = hash(fi * 17 + k * 3), h3 = hash(fi * 7 + k * 11);
        out.push({ p: [beak[0] + (h1 - 0.5) * 0.3 + (h2 - 0.5) * age * 0.2, beak[1] - age * (0.25 + 0.2 * h3), beak[2] + (h3 - 0.5) * 0.3], r: 0.012 + 0.012 * h2, a: 1 - age / 2.2, kind: 'sand' });
      }
    }
    if (f.fx === 'poof' && age > 0 && age < 6) {
      // Barry's sand, all over Gus: a cloud that blooms, hangs, and settles
      const c = [-0.62, 0.55, 1.5];
      for (let k = 0; k < 160; k++) {
        const h1 = hash(k * 1.3), h2 = hash(k * 2.7 + 5), h3 = hash(k * 4.1 + 9), h4 = hash(k * 0.7 + 3);
        const spread = 0.55 * (1 - Math.exp(-age * 2.2)) * (0.4 + h4);
        const fall = Math.max(0, age - 0.6) * (0.05 + 0.1 * h3);
        out.push({ p: [c[0] + (h1 - 0.5) * 2 * spread, Math.max(0.02, c[1] + (h2 - 0.4) * spread * 1.2 - fall), c[2] + (h3 - 0.5) * 2 * spread], r: 0.008 + 0.014 * h4, a: 0.7 * Math.min(1, age * 4) * (1 - age / 6), kind: 'sand' });
      }
    }
    if (f.fx === 'bubbles' && age > 0 && age < 7) {
      for (let k = 0; k < 7; k++) {
        const h1 = hash(fi * 13 + k), h2 = hash(fi * 5 + k * 7), a2 = age - k * 0.35;
        if (a2 < 0) continue;
        const base = [-1.4 + 3.2 * hash(fi), 0.4, -0.6 + hash(fi * 3)];
        out.push({ p: [base[0] + 0.08 * Math.sin(a2 * 5 + k), base[1] + a2 * (0.55 + 0.2 * h1), base[2] + (h2 - 0.5) * 0.1], r: 0.02 + 0.025 * h2, a: 1 - a2 / 7, kind: 'bubble' });
      }
    }
  }
  return out;
}

/** Subtitles at t: the line being said, if any. */
export function subtitleAt(t) {
  for (const L of SAY) if (t >= L.at - 0.1 && t <= L.end + 0.9) return { who: L.who, text: L.text };
  return null;
}
export { LINES, DURATION };
