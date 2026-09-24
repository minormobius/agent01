// poses.js — named poses, written as INTENT against a rig.
//
// A pose here says what the figure is doing: weight on the right leg, the left
// hand on the hip, crouched with the hands on the knees. `posed(rig, name)`
// makes that true for THIS body with the solvers in settle.js: the pelvis
// lowers until the planted feet are in reach, the weight shifts over the feet,
// a hand is placed on the body's actual surface, relaxed arms swing out until
// they clear it. So the same pose fits a chibi and an 8-head figure, and the
// checks can hold every pose on every body.

import { add, apply, madd, scale, sub, norm } from './vec.js';
import { solve } from './rig.js';
import { settle, balance, clearArms, handOn, seatHand } from './settle.js';

const relaxed = (raise = 0.16, out = 1.35, elbow = 0.2) => ({ raise, out, elbow });

export const POSES = {
  stand: (rig) => {
    const m = rig.m;
    let p = { legs: { l: { at: [m.hipHalf, 0, 0] }, r: { at: [-m.hipHalf, 0, 0] } }, arms: { l: relaxed(), r: relaxed() } };
    return clearArms(rig, balance(rig, settle(rig, p, 0.998), { straight: 0.998 }));
  },

  // weight on the right leg: the pelvis tips, the shoulders answer the other way
  contrapposto: (rig) => {
    const m = rig.m;
    let p = {
      root: { pos: [-0.12 * m.k, rig.rootY, 0], roll: 0.09, yaw: -0.12 },
      spine: { side: -0.2, twist: 0.1 },
      head: { roll: 0.08, yaw: 0.15 },
      legs: { r: { at: [-0.2 * m.wide, 0, 0], yaw: -0.2 }, l: { at: [0.55 * m.wide, 0, 0.3 * m.k], yaw: 0.35 } },
      arms: { l: relaxed(0.12, 1.6, 0.25), r: relaxed(0.2, 1.2, 0.35) },
    };
    p = balance(rig, settle(rig, p), { over: 'r' });
    return clearArms(rig, p);
  },

  // the left hand on the hip: palm on the side of the pelvis, fingers forward and down
  handOnHip: (rig) => {
    const p = POSES.contrapposto(rig);
    const P = solve(rig, p);
    const m = rig.m;
    const guess = add(P.J.pelvis, apply(P.F.pelvis, [m.pelvis.r[0] + 0.2, 0.25 * m.k, 0]));
    const arm = handOn(rig, P, 'torso', guess, apply(P.F.pelvis, [0, -0.6, 1]));
    return seatHand(rig, { ...p, arms: { ...p.arms, l: { ...arm, pole: add(P.J.shoulder_l, apply(P.F.chest, [2, -0.3, -0.5])) } } }, 'l');
  },

  reachUp: (rig) => {
    const m = rig.m;
    let p = {
      root: { pos: [0.05 * m.k, rig.rootY, 0] },
      spine: { side: 0.12, bend: -0.12 },
      head: { pitch: -0.55, yaw: -0.2 },
      legs: { l: { at: [m.hipHalf + 0.05, 0, 0.1], pivot: 'flat' }, r: { at: [-m.hipHalf - 0.05, 0, -0.1], pivot: 'ball', pitch: -0.45 } },
      arms: { r: { raise: 2.85, out: 1.2, elbow: 0.15, gesture: 'open' }, l: relaxed(0.3, 1.5, 0.5) },
    };
    return clearArms(rig, balance(rig, settle(rig, p)));
  },

  crouch: (rig) => {
    const m = rig.m;
    let p = {
      root: { pos: [0, rig.rootY * 0.52, -0.5 * m.k], pitch: 0.35 },
      spine: { bend: 0.45 },
      head: { pitch: -0.5 },
      legs: { l: { at: [m.hipHalf * 1.9, 0, 0.2 * m.k], yaw: 0.35, pole: [3, 3, 4] }, r: { at: [-m.hipHalf * 1.9, 0, 0.2 * m.k], yaw: -0.35, pole: [-3, 3, 4] } },
      arms: { l: relaxed(), r: relaxed() },
    };
    p = balance(rig, settle(rig, p));
    return withHandsOnKnees(rig, p);
  },

  run: (rig) => {
    const m = rig.m;
    const p = {
      root: { pos: [0, rig.rootY - 0.12 * m.k, 0], pitch: 0.28, yaw: 0.15 },
      spine: { bend: 0.22, twist: -0.35 },
      head: { pitch: -0.4 },
      legs: { l: { at: [0.2 * m.k, 0, 0.35 * m.k], pivot: 'ball', pitch: -0.35 }, r: { flex: 1.25, knee: 1.9, out: 0.05, pitch: -0.3 } },
      arms: { l: { raise: 0.9, out: 0.4, elbow: 1.6, gesture: 'fist' }, r: { raise: -0.75, out: -0.4, elbow: 1.4, gesture: 'fist' } },
    };
    return clearArms(rig, settle(rig, p));
  },

  // on a seat at knee height: the pelvis on it, the feet planted ahead, hands on the knees
  sit: (rig) => {
    const m = rig.m;
    const seat = m.ankleY + m.shinLen * 0.95;
    let p = {
      root: { pos: [0, seat + 0.32 * m.k, -0.15 * m.k], pitch: 0.05 },
      spine: { bend: 0.4 },
      head: { pitch: 0.12, yaw: 0.3 },
      legs: { l: { at: [m.hipHalf * 1.3, 0, m.thighLen * 0.92], yaw: 0.15 }, r: { at: [-m.hipHalf * 1.1, 0, m.thighLen * 0.98], yaw: -0.08 } },
      arms: { l: relaxed(), r: relaxed() },
    };
    p = settle(rig, p);
    return { ...withHandsOnKnees(rig, p), seat };
  },

  lookBack: (rig) => {
    const m = rig.m;
    const p = {
      root: { yaw: 0.2 },
      spine: { twist: 0.7, bend: 0.05 },
      head: { yaw: 1.1, pitch: 0.1 },
      legs: { l: { at: [m.hipHalf, 0, 0.15 * m.k], yaw: 0.2 }, r: { at: [-m.hipHalf, 0, -0.2 * m.k], yaw: 0.1, pivot: 'ball', pitch: -0.3 } },
      arms: { l: relaxed(0.25, 2.2, 0.5), r: relaxed(0.3, 0.8, 0.4) },
    };
    return clearArms(rig, balance(rig, settle(rig, p)));
  },
};

/** Both palms on the tops of the knees, fingers over the kneecap. */
function withHandsOnKnees(rig, p) {
  const P = solve(rig, p);
  const arms = {};
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const K = P.J[`knee_${s}`], H = P.J[`hip_${s}`];
    const guess = add(madd(K, sub(H, K), 0.12), [0, 0.4, 0]);
    // the fingers continue the arm's line toward the knee: the wrist stays nearly straight
    const along = add(sub(K, P.J[`shoulder_${s}`]), scale(sub(K, H), 0.5));
    arms[s] = { ...handOn(rig, P, `leg_${s}`, guess, along), pole: add(P.J[`shoulder_${s}`], [sg * 1.5, -0.2, -1]) };
  }
  // then again with the fingers along the forearm the arm actually took
  let q = { ...p, arms };
  for (let it = 0; it < 2; it++) {
    const Q = solve(rig, q);
    const arms2 = {};
    for (const [s, sg] of [['l', 1], ['r', -1]]) {
      const K = Q.J[`knee_${s}`], H = Q.J[`hip_${s}`];
      const guess = add(madd(K, sub(H, K), 0.12), [0, 0.4, 0]);
      arms2[s] = { ...handOn(rig, P, `leg_${s}`, guess, sub(Q.J[`wrist_${s}`], Q.J[`elbow_${s}`])), pole: q.arms[s].pole };
    }
    q = { ...q, arms: arms2 };
  }
  return seatHand(rig, seatHand(rig, q, 'l'), 'r');
}

/** The list of names, for sheets and checks. */
export const NAMES = Object.keys(POSES);
