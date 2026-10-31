// figure.js — the figure and the staircase, as pure functions of t (seconds on the score's clock).
//
// A figure descends a straight flight, one tread per bar of the waltz: a foot lands on each downbeat
// of the choruses and interludes (bars 9–124: 116 treads), step over step, left and right. At bar
// 125 the trailing foot closes beside the other at the foot of the stairs; over the coda the figure
// straightens, turns to face us, and lifts its head. Nothing here draws: render.js projects these
// joints, and the selftest checks them (planted feet don't slide, no foot goes through a tread).
//
// Metres. x runs down the stairs, y up, z across (+z towards the viewer). Tread j is the flat at
// y = −j·RISE spanning x ∈ [j·RUN, (j+1)·RUN]; tread 0 is the landing at the top (x < RUN), and the
// last tread is the floor at the bottom (x onward).

import { sec, B, embody, song } from './score.js';
import { schedule } from '../lib/chipsing.js';
import { LEXICON } from './lexicon.js';

export const RISE = 0.17, RUN = 0.28, WIDTH = 1.1;
export const FIRST_BAR = 9, LAST_BAR = 124, STEPS = LAST_BAR - FIRST_BAR + 1;   // 116
export const HIP = 0.95, THIGH = 0.45, SHIN = 0.43, ANKLE = 0.07, FOOT = 0.21;
export const HALF_HIPS = 0.095, SHOULDERS = 0.19, UPPER_ARM = 0.29, FOREARM = 0.26;

/** When step k lands (k = 1..STEPS, then STEPS+1: the closing step at bar 125). */
const T = [];
for (let k = 1; k <= STEPS; k++) T[k] = sec(B(FIRST_BAR + k - 1));
T[STEPS + 1] = sec(B(LAST_BAR + 1));
T[0] = T[1] - (T[2] - T[1]);
export const LANDINGS = T;
/** The foot that steps at step k: odd steps the left (the near side, +z), even the right. */
export const sideOf = (k) => (k % 2 ? 1 : -1);
/** The tread step k lands on (the closing step lands beside the last). */
export const treadOf = (k) => Math.min(k, STEPS);

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
/** The foot's contact on tread j: the ankle over the back of the tread, the toes to its nose. */
export const footAt = (j, side) => [j * RUN + 0.085, -j * RISE + ANKLE, side * 0.1];

/** Which step is under way at t: the last landed, and how far to the next (0..1). */
export function progress(t) {
  if (t <= T[1] - (T[1] - T[0])) return { k: 0, u: 0 };
  let k = 0;
  while (k < STEPS + 1 && t >= T[k + 1]) k++;
  if (k >= STEPS + 1) return { k: STEPS + 1, u: 0 };
  return { k, u: clamp((t - T[k]) / (T[k + 1] - T[k])) };
}

/** A foot at t: { ankle, pitch (toe down, radians), planted } for side ±1. */
export function foot(side, t) {
  // this foot's steps: k with sideOf(k) === side, and step STEPS+1 is the left's
  let last = 0, next = null;
  for (let k = 1; k <= STEPS + 1; k++) if (sideOf(k) === side) { if (T[k] <= t) last = k; else { next = k; break; } }
  const from = footAt(last ? treadOf(last) : 0, side);
  if (next === null) return { ankle: from, pitch: 0, planted: true };
  const to = footAt(treadOf(next), side);
  if (next === STEPS + 1) to[2] = side * 0.1;
  // the swing: from just after the other foot lands to this one's landing. Before it, the foot rolls
  // up onto its toes (the heel rises about the ball), so the rear knee can bend without the shin raking back
  const start = T[next - 1] + 0.14 * (T[next] - T[next - 1]);
  const rollFrom = T[next - 1] - 0.45 * (T[next - 1] - T[Math.max(0, next - 2)]);
  const ROLL = next > 1 && next <= STEPS ? 0.55 : 0;
  const roll = (a) => [from[0] + FOOT * (1 - Math.cos(a)), from[1] + 0.7 * FOOT * Math.sin(a), from[2]];
  if (t < start) {
    const a = ROLL * smooth((t - rollFrom) / (start - rollFrom));
    return { ankle: roll(a), pitch: a, planted: a < 0.005 };
  }
  const s = clamp((t - start) / (T[next] - start));
  const f0 = roll(ROLL);
  // forward first, then down: over the nose of the tread between, then onto the next
  const sx = 1 - (1 - smooth(s)) ** 2.4, sy = smooth(s) ** 1.8, drop = to[1] - f0[1];
  const lift = drop < -0.01 ? 0.06 : 0.03;
  const ankle = [f0[0] + (to[0] - f0[0]) * sx, f0[1] + drop * sy + lift * Math.sin(Math.PI * s), f0[2] + (to[2] - f0[2]) * s];
  const pitch = ROLL * (1 - smooth(s * 1.4)) + (drop < -0.2 ? 0.25 * Math.sin(Math.PI * s) ** 0.6 : 0);
  return { ankle, pitch, planted: s >= 1 };
}

/** The body's yaw: 0 faces down the stairs (+x); over the coda it turns to face us (+z). */
export function yaw(t) {
  return (Math.PI / 2) * 0.82 * smooth((t - sec(B(126))) / (sec(B(129)) - sec(B(126))));
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));

/** Two-bone IK: the knee (or elbow) between a and c, bending towards `toward`. */
function ik(a, c, l1, l2, toward) {
  let d = sub(c, a), dl = len(d);
  dl = Math.min(dl, l1 + l2 - 1e-4);
  const u = norm(d), x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const v = norm(sub(toward, mul(u, dot(toward, u))));
  return add(add(a, mul(u, x)), mul(v, h));
}

/** The whole figure at t: named joints in world metres, and the mouth (0..1). */
export function pose(t) {
  const { k, u } = progress(t);
  const p = Math.min(STEPS, k + smooth(u));
  const phi = yaw(t), fwd = [Math.cos(phi), 0, Math.sin(phi)], left = [-Math.sin(phi), 0, Math.cos(phi)], up = [0, 1, 0];
  const L = foot(1, t), R = foot(-1, t);
  // the pelvis rides between the feet, lower as it passes over the edge; stands up at the foot
  const beat = (t - T[1]) / (sec(B(10)) - sec(B(9))) * 3;          // beats since the first step
  const descending = t > T[0] && t < T[STEPS] + 0.3;
  const dip = descending ? 0.035 * Math.sin(Math.PI * smooth(u)) ** 2 + 0.01 : 0.012 * (1 - smooth((t - T[STEPS + 1]) / 1.5));
  const sway = 0.022 * Math.sin((2 * Math.PI * beat) / 6) * (descending ? 1 : 0.4);
  const breath = 0.006 * Math.sin(t * 1.9);
  // standing (the intro, the coda) the legs are nearly straight; going down, the knees give
  const walking = smooth((t - T[0] + 0.6) / 1.2) * (1 - smooth((t - T[STEPS + 1]) / 1.6));
  const height = HIP + (1 - walking) * 0.025;
  const pelvis = [p * RUN + 0.1 - 0.03 * walking, -p * RISE + height - dip + breath, sway];
  // at rest (the intro, the coda) the pelvis sits over the feet
  const hip = (s) => add(pelvis, add(mul(left, s * HALF_HIPS), [0, -0.06, 0]));
  const hipL = hip(1), hipR = hip(-1);
  const kneeL = ik(hipL, L.ankle, THIGH, SHIN, add(fwd, [0, 0.1, 0])), kneeR = ik(hipR, R.ankle, THIGH, SHIN, add(fwd, [0, 0.1, 0]));
  const toeOf = (f) => add(f.ankle, add(mul(fwdOf(f, fwd), FOOT * Math.cos(f.pitch)), [0, -ANKLE * 0.6 - FOOT * Math.sin(f.pitch) * 0.7, 0]));
  const toeL = toeOf(L);
  const toeR = toeOf(R);
  const heel = (f) => add(f.ankle, [-0.05 * fwdOf(f, fwd)[0], -ANKLE * 0.7 + 0.12 * Math.sin(f.pitch), -0.05 * fwdOf(f, fwd)[2]]);   // (toe down, heel up)
  const heelL = heel(L), heelR = heel(R);
  // the torso: a little lean back going down, twisting against the legs; at the end it lifts
  const end = smooth((t - sec(B(127))) / (sec(B(129)) - sec(B(127))));
  const lean = descending ? -0.04 : -0.01;
  const chest = add(pelvis, add(mul(fwd, lean), [0, 0.5 + 0.02 * end, 0]));
  const twist = 0.08 * Math.cos(Math.PI * p) * (descending ? 1 : 0);
  const sh = (s) => add(chest, add(mul(left, s * SHOULDERS * Math.cos(twist)), mul(fwd, -s * SHOULDERS * Math.sin(twist))));
  const shL = sh(1), shR = sh(-1);
  const neck = add(chest, [0, 0.1, 0]);
  const head = add(neck, add(mul(fwd, 0.03 - 0.03 * end), [0, 0.13, 0]));
  // arms: swinging against the legs; open a little for the last chord
  const swing = descending ? 0.24 * Math.cos(Math.PI * p) : 0;
  const open = 0.3 * end;
  const arm = (s, sw) => {
    const s0 = s > 0 ? shL : shR;
    const d1 = norm(add(add(mul(fwd, Math.sin(sw)), mul(up, -Math.cos(sw))), mul(left, s * (0.08 + open))));
    const elbow = add(s0, mul(d1, UPPER_ARM));
    const b = sw + 0.3 + 0.2 * end;
    const d2 = norm(add(add(mul(fwd, Math.sin(b)), mul(up, -Math.cos(b))), mul(left, s * (0.04 + open * 0.8))));
    return [elbow, add(elbow, mul(d2, FOREARM))];
  };
  const [elbowL, handL] = arm(1, swing), [elbowR, handR] = arm(-1, -swing);
  return {
    pelvis, hipL, hipR, kneeL, kneeR, ankleL: L.ankle, ankleR: R.ankle, toeL, toeR, heelL, heelR,
    chest, neck, head, shL, shR, elbowL, elbowR, handL, handR, fwd, left, planted: [L.planted, R.planted],
    mouth: mouth(t), lift: end,
  };
}
// a foot points where the body points (down the stairs, or turned with it once planted at the end)
function fwdOf(f, fwd) { return f.planted ? fwd : [1, 0, 0]; }

// ---- the mouth: open on each sung vowel, by how open the vowel is --------------------------------
const OPEN = { AA: 1, AO: 0.95, AW: 0.95, AY: 0.9, AE: 0.8, AH: 0.75, EH: 0.65, ER: 0.5, AX: 0.5, OW: 0.6, UW: 0.35, UH: 0.45, OY: 0.7, IY: 0.3, IH: 0.4, EY: 0.5 };
export const NOTES = schedule(song, LEXICON).filter((n) => n.midi !== null);
export function mouth(t) {
  // the note sounding (a held note continues its syllable's vowel)
  let lo = 0, hi = NOTES.length - 1, i = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (NOTES[mid].t <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
  if (i < 0) return 0;
  const n = NOTES[i], len = n.dur * (0.45 + 0.55 * Math.min(1, embody(n.t))) * 0.88;
  if (t > n.t + len) return 0;
  let syl = n.syl;
  for (let j = i; !syl && j >= 0; j--) syl = NOTES[j].syl;
  const a = OPEN[syl?.vowel] ?? 0.5, x = (t - n.t) / len;
  return a * Math.min(1, x * 12) * Math.min(1, (1 - x) * 8);
}
