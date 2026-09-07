// puppet.js — a marionette on four strings. Deterministic, no rendering.
//
// THE DESIGN PROBLEM. The game is mimicry: you watch a puppet dance, and then
// you have to reproduce the INPUTS that produced it. That only works if the map
// from input to motion is legible, and legibility is two properties that pull
// against each other:
//
//   REPEATABLE   the same keys must produce the same dance, every time, or
//                there is nothing to learn — "Q means that" has to be true.
//   SEPARABLE    different keys must produce visibly DIFFERENT dances, or you
//                are guessing and the score is noise.
//
// A free ragdoll is bad at both. It is chaotic, so the same input twice does
// not look the same, and once it is thrashing every input looks like every
// other one. A MARIONETTE is good at both, and that is why it is a marionette:
// strings impose bounded, restoring, pendular motion. Pull and the limb rises
// along a path it always takes; let go and gravity brings it back the same way.
//
// Whether that actually holds is not something to assert. mimic.selftest.mjs
// measures both properties directly, and measures the thing that matters most —
// whether the DISTANCE between two dances grows with the distance between the
// inputs that made them. If it does not, pressing 90% of the right keys would
// not look 90% right, the player could never tell how close they were, and the
// game would be unfair in a way no amount of polish could fix.
//
//   Q  left hand      W  right hand      O  left foot      P  right foot
//
// Hold a string and that limb is drawn up toward the control bar. Release and
// it falls. The four strings also share a body: pulling both hands lifts the
// whole puppet on its centre string, and pulling one side leans it. That
// coupling is what makes a dance read as a dance rather than four independent
// flippers — and it is also the main threat to separability, which is exactly
// why the test measures it rather than trusting it.

export const KEYS = ['q', 'w', 'o', 'p'];
export const LIMB_NAMES = ['left hand', 'right hand', 'left foot', 'right foot'];

// Fixed step. Every number below is tuned against it, and the whole premise
// needs determinism, so the step is not negotiable at the call site.
export const STEP = 1 / 240;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Limb geometry, in puppet units (the figure is about 1.0 tall).
// Arms hang from the shoulders, legs from the hips.
export const RIG = {
  torsoLen: 0.34,
  headR: 0.085,
  shoulderY: 0.30, shoulderX: 0.115,
  hipY: -0.04, hipX: 0.070,
  upperArm: 0.155, foreArm: 0.150,
  thigh: 0.185, shin: 0.180,
  barY: 0.92,            // the control bar the strings run up to
};

// Per-limb dynamics. Arms are lighter and quicker than legs, which is both
// true of a real marionette and useful here: it makes an arm move and a leg
// move look different in TIME as well as in space, giving the player a second
// channel to read.
// Angles are measured from STRAIGHT DOWN, positive meaning outward and up on
// that limb's own side. So a raised arm is a large positive a1, not a negative
// one — an early version had the lift targets negative, which swung each limb
// across the body instead of up and produced a figure that sprawled rather
// than danced. The limb still rose, so a test that only checked "does the hand
// go up" passed it happily.
const LIMB = [
  { g: 15.5, pull: 46, damp: 5.2, sign: -1, rest1: 0.22, rest2: 0.16, lift1: 1.95, lift2: 0.35, kind: 'arm' },
  { g: 15.5, pull: 46, damp: 5.2, sign: 1, rest1: 0.22, rest2: 0.16, lift1: 1.95, lift2: 0.35, kind: 'arm' },
  { g: 11.0, pull: 30, damp: 6.4, sign: -1, rest1: 0.10, rest2: 0.10, lift1: 1.05, lift2: 0.85, kind: 'leg' },
  { g: 11.0, pull: 30, damp: 6.4, sign: 1, rest1: 0.10, rest2: 0.10, lift1: 1.05, lift2: 0.85, kind: 'leg' },
];

// The body the four strings share.
const BODY = {
  leanSpring: 26, leanDamp: 5.0, leanFromArm: 0.19, leanFromLeg: 0.10,
  bobSpring: 34, bobDamp: 5.6, bobPerString: 0.052,
  swingSpring: 18, swingDamp: 4.2,   // the whole figure swinging on its centre string
};

export function createPuppet() {
  return {
    limbs: LIMB.map((L) => ({ a1: L.rest1, w1: 0, a2: L.rest2, w2: 0 })),
    lean: 0, leanV: 0,        // torso roll, radians
    bob: 0, bobV: 0,          // vertical lift, puppet units
    swing: 0, swingV: 0,      // whole-body pendulum about the centre string
    t: 0,
  };
}

/** One fixed step. `held` is four booleans. Semi-implicit Euler, which is
 *  stable here and — more to the point — is exactly reproducible: same start,
 *  same inputs, same trajectory to the last bit. */
export function step(p, held) {
  const dt = STEP;

  for (let i = 0; i < 4; i++) {
    const L = LIMB[i], s = p.limbs[i];
    const on = held[i] ? 1 : 0;

    // The string pulls the limb toward its raised shape; gravity pulls it back
    // toward hanging. Both are torques, so a half-raised limb caught between
    // them settles somewhere in between rather than snapping.
    const t1 = on * L.pull * (L.lift1 - s.a1) - (1 - on) * L.g * Math.sin(s.a1 - L.rest1) - L.damp * s.w1;
    const t2 = on * L.pull * 0.8 * (L.lift2 - s.a2) - (1 - on) * L.g * 0.85 * Math.sin(s.a2 - L.rest2) - L.damp * 0.9 * s.w2;
    s.w1 += t1 * dt; s.a1 += s.w1 * dt;
    s.w2 += t2 * dt; s.a2 += s.w2 * dt;
    // Joint stops, so a limb cannot wind past anything a puppet could do.
    if (s.a1 > 2.35) { s.a1 = 2.35; s.w1 = Math.min(0, s.w1); }
    if (s.a1 < -0.55) { s.a1 = -0.55; s.w1 = Math.max(0, s.w1); }
    if (s.a2 > 1.75) { s.a2 = 1.75; s.w2 = Math.min(0, s.w2); }
    if (s.a2 < -0.40) { s.a2 = -0.40; s.w2 = Math.max(0, s.w2); }
  }

  // The shared body. Left-hand pulls lean the puppet one way, right-hand the
  // other; both together lift it instead. Legs contribute less because they
  // are further from the centre string.
  let leanTarget = 0, lifts = 0;
  for (let i = 0; i < 4; i++) {
    const on = held[i] ? 1 : 0;
    const L = LIMB[i];
    leanTarget += on * L.sign * (L.kind === 'arm' ? BODY.leanFromArm : BODY.leanFromLeg);
    lifts += on;
  }
  p.leanV += (BODY.leanSpring * (leanTarget - p.lean) - BODY.leanDamp * p.leanV) * dt;
  p.lean += p.leanV * dt;
  p.lean = clamp(p.lean, -0.30, 0.30);

  const bobTarget = lifts * BODY.bobPerString;
  p.bobV += (BODY.bobSpring * (bobTarget - p.bob) - BODY.bobDamp * p.bobV) * dt;
  p.bob += p.bobV * dt;

  // The whole figure swings on its centre string, driven by how asymmetric the
  // pull is. This is the slowest thing on screen and it is what carries a dance
  // across its individual moves.
  //
  // Lean and swing STACK, so their clamps have to be read together: an early
  // pair (0.6 and 0.5) let the puppet reach 63 degrees off vertical, which does
  // not read as a marionette hanging from a bar, it reads as one falling over.
  // They are dialled back — but the body coupling is also what makes two
  // strings pulled together look different from either alone, so the selftest's
  // separability and correlation numbers were re-measured after the change
  // rather than assumed to survive it.
  p.swingV += (BODY.swingSpring * (leanTarget * 0.55 - p.swing) - BODY.swingDamp * p.swingV) * dt;
  p.swing += p.swingV * dt;
  p.swing = clamp(p.swing, -0.20, 0.20);

  p.t += dt;
  return p;
}

/** Where every joint is, in puppet units, y up. Used by the renderer and — more
 *  importantly — by the selftest, which measures how far apart two dances are
 *  by comparing these points. Motion distance is measured on what you can SEE,
 *  not on the internal state, because what you can see is what the player has
 *  to work from. */
export function pose(p) {
  const c = Math.cos(p.swing), s = Math.sin(p.swing);
  const rot = (x, y) => ({ x: x * c - y * s, y: x * s + y * c });

  const lc = Math.cos(p.lean), ls = Math.sin(p.lean);
  const body = (x, y) => rot(x * lc - y * ls, x * ls + y * lc);

  const out = { points: {}, bob: p.bob };
  const hip = body(0, RIG.hipY);
  const neck = body(0, RIG.shoulderY + 0.055);
  out.points.hip = { x: hip.x, y: hip.y + p.bob };
  out.points.neck = { x: neck.x, y: neck.y + p.bob };
  const head = body(0, RIG.shoulderY + 0.055 + RIG.headR * 1.5);
  out.points.head = { x: head.x, y: head.y + p.bob };

  for (let i = 0; i < 4; i++) {
    const L = LIMB[i], st = p.limbs[i];
    const isArm = L.kind === 'arm';
    const rootLocal = isArm
      ? { x: L.sign * RIG.shoulderX, y: RIG.shoulderY }
      : { x: L.sign * RIG.hipX, y: RIG.hipY };
    const r = body(rootLocal.x, rootLocal.y);
    const root = { x: r.x, y: r.y + p.bob };

    // Angles are from straight down, positive swinging outward on that limb's
    // own side. The mirroring lives in the ANGLE (sign * a1) and nowhere else —
    // an early version also multiplied the sine by the same sign, which undid
    // the mirror and folded both sides of the puppet onto each other.
    const l1 = isArm ? RIG.upperArm : RIG.thigh;
    const l2 = isArm ? RIG.foreArm : RIG.shin;
    const A1 = p.swing + p.lean + L.sign * st.a1;
    const A2 = A1 + L.sign * st.a2;
    const mid = { x: root.x + Math.sin(A1) * l1, y: root.y - Math.cos(A1) * l1 };
    const end = { x: mid.x + Math.sin(A2) * l2, y: mid.y - Math.cos(A2) * l2 };
    out.points[`root${i}`] = root;
    out.points[`mid${i}`] = mid;
    out.points[`end${i}`] = end;
  }
  return out;
}

// The points a viewer actually reads a dance from: the four extremities plus
// the head. Weighted equally, because the player has no reason to care more
// about one hand than the other.
export const READ_POINTS = ['end0', 'end1', 'end2', 'end3', 'head'];

/** Root-mean-square distance between two poses, over the points a viewer reads.
 *  In puppet units, where the figure is about 1.0 tall. */
export function poseDistance(a, b) {
  let sum = 0;
  for (const k of READ_POINTS) {
    const p = a.points[k], q = b.points[k];
    sum += (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
  }
  return Math.sqrt(sum / READ_POINTS.length);
}

/** Run a held-key timeline and return the pose at every sample. `timeline` is
 *  a function (t) -> four booleans. */
export function perform(timeline, secs, sampleHz = 30) {
  const p = createPuppet();
  const out = [];
  const every = Math.max(1, Math.round((1 / sampleHz) / STEP));
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) {
    step(p, timeline(i * STEP));
    if (i % every === 0) out.push(pose(p));
  }
  return out;
}

/** Mean pose distance between two performances, sample for sample. */
export function performanceDistance(A, B) {
  const n = Math.min(A.length, B.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += poseDistance(A[i], B[i]);
  return sum / n;
}
