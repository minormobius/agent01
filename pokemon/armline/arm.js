// arm.js — the AR4 MK3, as a real URDF kinematic chain.
//
// THE ARM IS NOT INVENTED. Every number below is transcribed from the AR4's
// published robot description:
//
//   Annin Robotics AR4 MK3, via the ar4_ros_driver ROS 2 package
//   https://github.com/ycheng517/ar4_ros_driver  —  MIT licence
//   annin_ar4_description/urdf/ar_macro.xacro        (joint origins and axes)
//   annin_ar4_description/config/mk3.yaml            (joint limits, l6_length)
//   annin_ar4_description/urdf/ar_gripper_macro.xacro (the two-jaw gripper)
//
// The AR4 is open-source hardware — Annin Robotics publish the CAD, the
// firmware and the description package — which is why it is the arm here. What
// is transcribed is the KINEMATICS: the joint origins, the joint axes, the
// travel limits and the 1.0472 rad/s joint speed limit. The visual shells in
// scene.js are ours, built to the real link lengths; the STL meshes are not
// vendored, because they are megabytes and this surface ships as static assets
// with no build step.
//
// A URDF joint is two things in sequence: a fixed <origin xyz rpy> that places
// the joint frame in its parent, and then a rotation of q about <axis>. That is
// exactly what jointMatrix() below does, in that order, so the chain here is
// the chain in the file rather than a DH approximation of it. URDF rpy is
// fixed-axis roll-pitch-yaw, i.e. Rz(yaw) * Ry(pitch) * Rx(roll).

const DEG = Math.PI / 180;

// ------------------------------------------------------------------ mat4 --
// Column-vector convention: v' = M * v, row-major storage m[row*4+col].

export function mIdent() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mMul(a, b) {
  const o = new Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c]
        + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
    }
  }
  return o;
}

export function mTrans(x, y, z) {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}

// URDF rpy: Rz(yaw) * Ry(pitch) * Rx(roll).
export function mRPY(r, p, y) {
  const cr = Math.cos(r), sr = Math.sin(r);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cy = Math.cos(y), sy = Math.sin(y);
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, 0,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, 0,
    -sp, cp * sr, cp * cr, 0,
    0, 0, 0, 1,
  ];
}

// Rotation of angle about an arbitrary unit axis (Rodrigues).
export function mAxis(ax, ay, az, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay, 0,
    t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax, 0,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c, 0,
    0, 0, 0, 1,
  ];
}

export function mApply(m, x, y, z) {
  return {
    x: m[0] * x + m[1] * y + m[2] * z + m[3],
    y: m[4] * x + m[5] * y + m[6] * z + m[7],
    z: m[8] * x + m[9] * y + m[10] * z + m[11],
  };
}

// ------------------------------------------------------- the AR4 MK3 chain --
// Straight out of ar_macro.xacro. `origin` is the URDF <origin>, `axis` the
// URDF <axis>, `min`/`max` the MK3 limits from mk3.yaml. Every joint on this
// arm is limited to 1.0472 rad/s, which is 60 deg/s.

export const JOINT_SPEED = 1.0472;          // rad/s, from the URDF. All six.
export const L6_LENGTH = 0.041;             // m, mk3.yaml

export const JOINTS = [
  { name: 'joint_1', xyz: [0, 0, 0], rpy: [Math.PI, 0, 0], axis: [0, 0, 1], min: -170 * DEG, max: 170 * DEG },
  { name: 'joint_2', xyz: [0, 0.0642, -0.16977], rpy: [1.5708, 0, -1.5708], axis: [0, 0, -1], min: -42 * DEG, max: 90 * DEG },
  { name: 'joint_3', xyz: [0, -0.305, 0.007], rpy: [0, 0, 3.1416], axis: [0, 0, -1], min: -89 * DEG, max: 52 * DEG },
  { name: 'joint_4', xyz: [0, 0, 0], rpy: [1.5708, 0, -1.5708], axis: [0, 0, -1], min: -180 * DEG, max: 180 * DEG },
  { name: 'joint_5', xyz: [0, 0, -0.22263], rpy: [Math.PI, 0, -1.5708], axis: [1, 0, 0], min: -105 * DEG, max: 105 * DEG },
  { name: 'joint_6', xyz: [0, 0, L6_LENGTH], rpy: [0, 0, 3.1416], axis: [0, 0, 1], min: -180 * DEG, max: 180 * DEG },
];

// ee_joint is fixed and identity; then the gripper. From ar_gripper_macro.xacro:
// the base is rolled -90 deg, and each jaw sits 36 mm out along -y and slides
// 0..14 mm along -x. So the point between the closed jaws — the grasp point —
// is 36 mm beyond the flange plus the finger reach.
export const GRIPPER = {
  baseRPY: [-1.5708, 0, 0],
  jawOffset: 0.036,          // m, jaw origin along -y of the gripper base
  jawTravel: 0.014,          // m, per jaw; the pair opens 28 mm
  fingerLen: 0.028,          // m, our shell — the URDF carries this as a mesh
};

// The tool centre point: between the fingertips.
export const TCP_OFFSET = GRIPPER.jawOffset + GRIPPER.fingerLen * 0.5;

export function jointMatrix(j, q) {
  // <origin> first, then the rotation about <axis>. Order matters and this is
  // the order URDF specifies.
  const o = mMul(mTrans(j.xyz[0], j.xyz[1], j.xyz[2]), mRPY(j.rpy[0], j.rpy[1], j.rpy[2]));
  return mMul(o, mAxis(j.axis[0], j.axis[1], j.axis[2], q));
}

/** Frames for every joint, plus the flange and the tool point.
 *  `q` is six joint angles in radians. Returns { frames, flange, tcp }. */
export function forward(q) {
  const frames = [];
  let m = mIdent();
  for (let i = 0; i < JOINTS.length; i++) {
    m = mMul(m, jointMatrix(JOINTS[i], q[i] || 0));
    frames.push(m);
  }
  const flange = m;
  const gripBase = mMul(flange, mRPY(GRIPPER.baseRPY[0], GRIPPER.baseRPY[1], GRIPPER.baseRPY[2]));
  const tcp = mApply(gripBase, 0, -TCP_OFFSET, 0);
  return { frames, flange, gripBase, tcp };
}

export function clampToLimits(q) {
  return q.map((v, i) => Math.max(JOINTS[i].min, Math.min(JOINTS[i].max, v)));
}

/** Move `q` toward `target` at the arm's real joint speed limit, for dt
 *  seconds. Every joint moves at up to JOINT_SPEED independently, which is
 *  what an ordinary joint-space move does — it is NOT time-synchronised, so
 *  the joints arrive at different moments and the tool sweeps a curve.
 *  Returns the new angles and whether it has arrived. */
export function servo(q, target, dt, speed = JOINT_SPEED) {
  const out = new Array(q.length);
  let arrived = true;
  const step = speed * dt;
  for (let i = 0; i < q.length; i++) {
    const d = target[i] - q[i];
    if (Math.abs(d) <= step) out[i] = target[i];
    else { out[i] = q[i] + Math.sign(d) * step; arrived = false; }
  }
  return { q: clampToLimits(out), arrived };
}

/** Reach of the tool point, for sanity and for laying out the scene. */
export function reachEnvelope() {
  let max = 0;
  for (let a = -1.5; a <= 1.6; a += 0.05) {
    for (let b = -1.5; b <= 0.9; b += 0.05) {
      const { tcp } = forward([0, a, b, 0, 0, 0]);
      max = Math.max(max, Math.hypot(tcp.x, tcp.y));
    }
  }
  return max;
}
