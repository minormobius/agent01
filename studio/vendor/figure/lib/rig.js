// rig.js — a pose, stated as intent, solved into joints and frames.
//
// A pose names what the figure is DOING: where the pelvis is and how it is
// turned, how the spine bends, where the head looks, where each foot is planted
// (by the point that touches the ground: heel, ball, or the whole sole), where
// each hand reaches, or plain angles where intent is angles (an arm swinging).
// solve() returns every joint's position and every segment's frame in world
// space, plus a report of anything it could not do (a hand that could not
// reach its target) — so a check can fail on it instead of a picture hiding it.
//
// Units are head heights; y up; the figure faces +z; its left is +x.

import { add, sub, scale, dot, cross, len, norm, dist, apply, ypr, rotate, rotateFrame, frameFrom, madd, IDENTITY } from './vec.js';
import { measure } from './proportion.js';
import { resolveFace } from './face.js';
import { hairColors } from './hair.js';

const SIDES = { l: 1, r: -1 };

/** Everything that does not change with the pose. */
export function makeRig(spec) {
  const m = measure(spec);
  const rootY = m.hipY + 0.08 * m.k - 0.005 * m.k;  // standing: the knees a hair soft, never locked
  const waistY = m.hipY + (m.neckBase - m.hipY) * 0.3;
  const chestY = m.hipY + (m.neckBase - m.hipY) * 0.64;
  const foot = {
    sole: [0, -m.ankleY, 0],                           // under the ankle: where a flat foot stands
    heel: [0, -m.ankleY, -0.2 * m.footLen],
    ball: [0, -m.ankleY, 0.6 * m.footLen],
    toe: [0, -m.ankleY + 0.035 * m.k, 0.84 * m.footLen],
  };
  return { m, rootY, waistY, chestY, foot, spec: m.spec };
}

/**
 * Where the ankle must be for the foot to touch `at` with the given pivot.
 * pitch > 0 lifts the toes (heel strike); pitch < 0 lifts the heel (push-off).
 */
export function footFrame(yaw = 0, pitch = 0) { return ypr(yaw, -pitch, 0); }
export function ankleFor(rig, at, yaw = 0, pitch = 0, pivot = 'flat') {
  const F = footFrame(yaw, pitch);
  const local = rig.foot[pivot === 'flat' ? 'sole' : pivot];
  return { ankle: sub(at, apply(F, local)), F };
}

/** Two-bone IK: root A, target T, bone lengths a and b, bend toward `pole`. */
export function twoBone(A, T, a, b, pole) {
  const d0 = dist(A, T);
  const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, d0));
  const t = norm(sub(T, A));
  let p = sub(pole, scale(t, dot(pole, t)));
  p = len(p) < 1e-6 ? norm(cross(t, [1, 0, 0])) : norm(p);
  const ca = (a * a + d * d - b * b) / (2 * a * d);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const mid = add(A, add(scale(t, a * ca), scale(p, a * sa)));
  const end = add(A, scale(t, d));
  return { mid, end, reached: d0 <= a + b - 1e-4 && d0 >= Math.abs(a - b), short: Math.max(0, d0 - (a + b)) };
}

/** Rotate `p` by the smallest rotation that takes unit `from` to unit `to`. */
function carry(p, from, to) {
  const ax = cross(from, to), s = len(ax), c = dot(from, to);
  if (s < 1e-8) return c > 0 ? p : rotate(p, Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], Math.PI);
  return rotate(p, scale(ax, 1 / s), Math.atan2(s, c));
}

export const REST = {
  root: {},
  arms: { l: { raise: 0.16, out: 1.35, elbow: 0.18 }, r: { raise: 0.16, out: 1.35, elbow: 0.18 } },
  legs: { l: {}, r: {} },
};

export function solve(rig, pose = {}) {
  const { m } = rig;
  const J = {}, F = {}, report = { unreached: [] };
  const P = { ...REST, ...pose };

  // ---- the pelvis and spine
  const r = P.root || {};
  const pelvisF = ypr(r.yaw || 0, r.pitch || 0, r.roll || 0);
  J.pelvis = r.pos ? [r.pos[0], r.pos[1] ?? rig.rootY, r.pos[2]] : [0, rig.rootY, 0];
  F.pelvis = pelvisF;
  const sp = P.spine || {};
  const bend = sp.bend || 0, side = sp.side || 0, twist = sp.twist || 0;
  F.waist = ypr(twist * 0.4, bend * 0.4, side * 0.4, pelvisF);
  J.waist = add(J.pelvis, apply(pelvisF, [0, rig.waistY - rig.rootY, -0.03 * m.k]));
  F.chest = ypr(twist * 0.6, bend * 0.6, side * 0.6, F.waist);
  J.chest = add(J.waist, apply(F.waist, [0, rig.chestY - rig.waistY, 0]));
  J.neck = add(J.chest, apply(F.chest, [0, m.neckBase - rig.chestY, -0.05 * m.k]));

  // ---- the head: angles, or a look at a point
  let hy = P.head?.yaw || 0, hp = P.head?.pitch || 0, hr = P.head?.roll || 0;
  const neckTopGuess = add(J.neck, apply(F.chest, [0, m.chin + m.head.pivotUp - m.neckBase, 0.02]));
  if (P.lookAt) {
    const d = sub(P.lookAt, add(neckTopGuess, apply(F.chest, [0, 0.45, 0])));
    const loc = [dot(d, F.chest.x), dot(d, F.chest.y), dot(d, F.chest.z)];
    hy = Math.max(-1.3, Math.min(1.3, Math.atan2(loc[0], loc[2])));
    hp = Math.max(-0.7, Math.min(0.8, -Math.atan2(loc[1], Math.hypot(loc[0], loc[2]))));
  }
  F.neck = ypr(hy * 0.4, hp * 0.4, hr * 0.4, F.chest);
  J.headPivot = add(J.neck, apply(F.neck, [0, m.chin + m.head.pivotUp - m.neckBase, 0.02]));   // the head sits at the chin, wherever the neck starts
  F.head = ypr(hy, hp, hr, F.chest);
  J.chin = add(J.headPivot, apply(F.head, [0, -m.head.pivotUp, 0.12]));
  J.crown = add(J.headPivot, apply(F.head, [0, 1 - m.head.pivotUp, -0.02]));

  // ---- arms
  for (const [s, sg] of Object.entries(SIDES)) {
    const a = P.arms?.[s] || {};
    const shoulder = add(J.chest, apply(F.chest, [sg * (m.shoulderHalf - 0.12 * m.wide), m.shoulderY - rig.chestY, -0.04 * m.k]));
    J[`clav_${s}`] = add(J.neck, apply(F.chest, [sg * 0.06, -0.04, 0.08]));
    J[`shoulder_${s}`] = shoulder;
    const back = apply(F.chest, [sg * 0.25, 0, -1]);
    let elbow, wrist, pole, placedHand = null;
    if (a.hand) {
      // a placed hand (like a planted foot): the palm's centre at `at`, the palm
      // facing `palm`, the fingers along `dir`; the wrist is where that puts it
      const HFp = frameFrom(scale(a.hand.palm, -1), a.hand.dir);
      placedHand = HFp;
      a.reach = sub(sub(a.hand.at, scale(HFp.z, 0.28 * m.hand)), scale(HFp.y, 0));
    }
    if (a.reach) {
      // IK: the wrist to a point, the elbow toward a pole (default: back and out)
      pole = a.pole ? norm(sub(a.pole, shoulder)) : norm(apply(F.chest, [sg * 0.6, -0.4, -1]));
      const ik = twoBone(shoulder, a.reach, m.upperArm, m.foreArm, pole);
      elbow = ik.mid; wrist = ik.end;
      if (!ik.reached) report.unreached.push({ limb: `arm_${s}`, short: ik.short });
    } else {
      const raise = a.raise ?? 0.16, out = a.out ?? 1.35, e = a.elbow ?? 0.18;
      const dl = [sg * Math.sin(raise) * Math.sin(out), -Math.cos(raise), Math.sin(raise) * Math.cos(out)];
      const u = apply(F.chest, dl);
      pole = norm(carry(back, apply(F.chest, [0, -1, 0]), u));
      if (a.roll) pole = rotate(pole, u, sg * a.roll);
      elbow = madd(shoulder, u, m.upperArm);
      const pp = norm(sub(pole, scale(u, dot(pole, u))));
      const fdir = add(scale(u, Math.cos(e)), scale(pp, -Math.sin(e)));
      wrist = madd(elbow, fdir, m.foreArm);
    }
    J[`elbow_${s}`] = elbow; J[`wrist_${s}`] = wrist;
    // the hand: along the forearm, bent at the wrist, the back of the hand away from the elbow's pole
    const fore = norm(sub(wrist, elbow));
    let HF;
    if (placedHand) HF = placedHand;
    else {
      let dorsal = norm(scale(cross(fore, pole), sg));
      if (a.pronate) dorsal = rotate(dorsal, fore, sg * a.pronate);
      HF = frameFrom(dorsal, fore);                     // y = back of the hand, z = toward the fingers
      if (a.wrist) HF = rotateFrame(HF, HF.x, -a.wrist);  // + flexes the palm down
    }
    F[`hand_${s}`] = HF;
    report[`curl_${s}`] = placedHand ? 0.05 : (a.curl ?? 0.35);
    // how far the wrist bends: the hand's direction against the forearm's
    report[`wrist_${s}`] = Math.acos(Math.max(-1, Math.min(1, dot(HF.z, fore))));
    J[`fingers_${s}`] = madd(wrist, HF.z, m.hand);
  }

  // ---- legs: a planted foot (by its contact), an ankle target, or angles
  for (const [s, sg] of Object.entries(SIDES)) {
    const L = P.legs?.[s] || {};
    const hip = add(J.pelvis, apply(F.pelvis, [sg * m.hipHalf, -0.08 * m.k, 0.02]));
    J[`hip_${s}`] = hip;
    let ankle, FF;
    if (L.at || L.ankle) {
      if (L.at) ({ ankle, F: FF } = ankleFor(rig, L.at, L.yaw ?? (r.yaw || 0), L.pitch || 0, L.pivot || 'flat'));
      else { ankle = L.ankle; FF = footFrame(L.yaw ?? (r.yaw || 0), L.pitch || 0); }
      const pole = L.pole ? norm(sub(L.pole, hip)) : norm(add(FF.z, F.pelvis.z));
      const ik = twoBone(hip, ankle, m.thighLen, m.shinLen, pole);
      J[`knee_${s}`] = ik.mid;
      if (!ik.reached) report.unreached.push({ limb: `leg_${s}`, short: ik.short });
      // a leg that could not reach carries its foot with it: the foot hangs, it does not tear
      if (dist(ik.end, ankle) > 1e-6) ankle = ik.end;
    } else {
      // angles: flex (thigh forward), out (thigh sideways), knee (bend), pitch (toes up)
      const flex = L.flex || 0, out = L.out || 0, kb = L.knee || 0;
      let u = apply(F.pelvis, [0, -1, 0]);
      u = rotate(u, F.pelvis.x, -flex);
      u = rotate(u, F.pelvis.z, -sg * out);
      const knee = madd(hip, u, m.thighLen);
      const fwd = norm(sub(F.pelvis.z, scale(u, dot(F.pelvis.z, u))));
      const sd = add(scale(u, Math.cos(kb)), scale(fwd, -Math.sin(kb)));
      J[`knee_${s}`] = knee;
      ankle = madd(knee, sd, m.shinLen);
      // the foot at a right angle to the shin, plus its own pitch: its toes turn with the
      // shin (the shin's front face), so a knee bent past 90° does not flip them back up
      // the thigh (the thigh's forward, squared against the shin, points there)
      const up = scale(sd, -1);
      FF = frameFrom(up, add(scale(fwd, Math.cos(kb)), scale(u, Math.sin(kb))));
      FF = rotateFrame(FF, FF.x, -(L.pitch || 0));
    }
    J[`ankle_${s}`] = ankle;
    F[`foot_${s}`] = FF;
    J[`heel_${s}`] = add(ankle, apply(FF, rig.foot.heel));
    J[`ball_${s}`] = add(ankle, apply(FF, rig.foot.ball));
    // the toes bend at the ball: with the heel up they stay flat on the ground
    // (a rigid foot pivoting on its ball would drive its toes into the floor)
    const toeBend = L.toes ?? Math.min(0, L.pitch || 0);
    const toeVec = sub(apply(FF, rig.foot.toe), apply(FF, rig.foot.ball));
    J[`toe_${s}`] = add(J[`ball_${s}`], rotate(toeVec, FF.x, toeBend));
  }
  // the face: who they are (the spec) and what they feel (the pose)
  // a masculine face follows the body; a chibi (drawn like a child) stays neutral
  const masc = (1 - (rig.spec.femme || 0)) * Math.min(1, Math.max(0, (m.H - 3.5) / 2));
  const face = rig.spec.face === undefined ? null : resolveFace(rig.spec.face, P.expression || 'neutral', P.gaze || null, { masc });
  // the hair: its style (the spec), and the head's acceleration (the pose) it lags behind
  const hair = rig.spec.hair || null;
  if (face && hair) face.colors.brow = hairColors(hair).shade;
  return { J, F, report, rig, face, hair, outfit: rig.spec.outfit || null, hairAccel: P.hairAccel || null };
}
