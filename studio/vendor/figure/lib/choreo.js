// choreo.js — a dance, written as intent on a beat grid.
//
// A dance is a list of MOVES, each laid on bars of the song (4 beats to a bar):
//
//   { bar: 12, bars: 2, move: 'pump', side: 'r' }
//
// A move is a phrase a dancer knows (a sway, a step-touch, a fist pump, a point, a
// step-turn, a jump) and writes out as KEYFRAMES on beats: where each foot is planted,
// how far the body dips, how the arms are held and the hands shaped, the face. A frame
// between keyframes interpolates them: a foot that moves between two plants is a STEP (it
// lifts on an arc and lands, and never slides), the rest eases. Nothing is written in
// raw joint numbers for one body: feet are placed in the dancer's own hip widths, dips in
// its own leg lengths, so the same dance fits a chibi and an 8-head figure.
//
// The pelvis height is SOLVED per keyframe (settle.js: as high as the planted feet allow,
// less the dip), once, at compile time; per frame nothing heavier than solve() runs.
//
//   const D = compileDance(rig, script, { home: [x, z], facing })
//   const { pose, beat, key } = D.at(beat)          → solve(rig, pose)

import { settle, interpenetration } from './settle.js';
import { solve } from './rig.js';
import { buildBody, GROUPS } from './body.js';

const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => u * u * (3 - 2 * u);
const EASE = {
  smooth,
  linear: (u) => u,
  // a hit: arrives fast (two thirds of the way in the first third) and settles
  hit: (u) => 1 - Math.pow(1 - clamp01(u), 3),
  // held, then snaps at the end (a pose held until the next count)
  hold: (u) => (u < 0.75 ? 0 : smooth((u - 0.75) / 0.25)),
};

// ---- the vocabulary ------------------------------------------------------------------
// A keyframe (every field optional; missing fields carry over from the one before):
//   b        beat, from the move's start
//   feet     { l: [x, z, yaw?], r: [...] }  x in hip half-widths, z in k (head units at 7 heads)
//   dip      how far the pelvis drops below standing, in k (0.35 is a real bend)
//   lift     how far the pelvis RISES (a jump; the feet leave the ground with it)
//   turn     the body's yaw, radians (the feet do not turn with it: step them)
//   hip      side shift of the pelvis toward a foot, in hip half-widths (the weight)
//   lean, side, twist     the spine: forward bend, side bend, twist
//   head     { yaw, pitch, roll }
//   arms     { l: { raise, out, elbow, roll, wrist }, r: {...} }
//   hands    { l: gesture, r: gesture }      (hand.js)
//   face     an expression (face.js)
//   ease     how this keyframe is ARRIVED at: 'smooth' | 'hit' | 'linear' | 'hold'

const ARM = {
  down: { raise: 0.18, out: 1.4, elbow: 0.25 },
  relaxed: { raise: 0.25, out: 1.3, elbow: 0.45 },
  hips: { raise: 0.55, out: 1.55, elbow: 1.9, roll: 0.5 },              // fists near the hip bones
  clap: { raise: 1.05, out: 0.25, elbow: 1.25 },                          // the hands meet in front
  up: { raise: 2.75, out: 1.25, elbow: 0.2 },                             // straight up
  high: { raise: 2.3, out: 1.0, elbow: 0.35 },                            // up and forward
  pump: { raise: 2.55, out: 0.9, elbow: 0.55 },                           // a fist punched up
  cocked: { raise: 1.1, out: 1.5, elbow: 2.1 },                           // a fist drawn back to punch
  point: { raise: 1.55, out: 0.55, elbow: 0.12 },                         // at the audience, a little up
  wide: { raise: 1.45, out: 1.55, elbow: 0.2 },                           // out to the side
  shrug: { raise: 0.5, out: 1.35, elbow: 1.5, roll: -0.6 },               // palms up
  face: { raise: 1.7, out: 0.35, elbow: 2.35 },                           // hand by the eye (a peace sign)
  robot: { raise: 1.45, out: 1.5, elbow: 1.57 },                          // elbow square
  robotDown: { raise: 0.2, out: 1.4, elbow: 1.57 },
  reach: { raise: 1.35, out: 0.3, elbow: 0.15 },                          // reaching out to someone
  back: { raise: -0.35, out: 1.4, elbow: 0.2 },                           // swept back (loading a jump)
  bow: { raise: 0.4, out: 1.5, elbow: 0.3 },                              // hanging just off the legs
};
export const ARMS = ARM;

const S = (side) => (side === 'l' ? 1 : -1);
const other = (s) => (s === 'l' ? 'r' : 'l');
const arms = (l, r) => ({ l: { ...ARM[l] }, r: { ...ARM[r] } });
const stance = (w = 1, zl = 0, zr = 0) => ({ l: [w, zl], r: [-w, zr] });

/** Each move: (opts) → keyframes over `beats` beats. `side` mirrors it; `n` is its length in beats. */
export const MOVES = {
  // standing, breathing: a weight shift every two beats
  idle: ({ n }) => {
    const k = [];
    for (let b = 0; b <= n; b += 2) k.push({ b, feet: stance(1), dip: 0.03, hip: (b / 2) % 2 ? 0.25 : -0.25, arms: arms('relaxed', 'relaxed'), hands: { l: 'relaxed', r: 'relaxed' }, side: (b / 2) % 2 ? 0.05 : -0.05, ease: 'smooth' });
    return k;
  },
  // the groove: a bounce down on every beat, up on the and
  groove: ({ n, arm = 'relaxed' }) => {
    const k = [];
    for (let b = 0; b <= n; b += 0.5) k.push({ b, feet: stance(1.1), dip: b % 1 ? 0.04 : 0.16, arms: arms(arm, arm), hands: { l: 'relaxed', r: 'relaxed' }, head: { pitch: b % 1 ? -0.05 : 0.08 }, ease: b % 1 ? 'smooth' : 'hit' });
    return k;
  },
  // weight side to side on 1 and 3, the arms swinging against it
  sway: ({ n }) => {
    const k = [];
    for (let b = 0; b <= n; b += 2) {
      const s = (b / 2) % 2 ? 'l' : 'r', g = S(s);
      k.push({ b, feet: stance(1.3), dip: 0.1, hip: g * 0.45, side: -g * 0.12, head: { roll: g * 0.12, yaw: g * 0.1 }, arms: { [s]: { ...ARM.relaxed, raise: 0.45 }, [other(s)]: { ...ARM.relaxed, raise: 0.1, elbow: 0.8 } }, hands: { l: 'relaxed', r: 'relaxed' }, ease: 'smooth' });
      k.push({ b: b + 1, dip: 0.04, ease: 'smooth' });
    }
    return k.filter((x) => x.b <= n);
  },
  // step out, touch in, and clap on the touch
  stepTouch: ({ n }) => {
    const k = [{ b: 0, feet: stance(1), dip: 0.05, arms: arms('relaxed', 'relaxed'), hands: { l: 'flat', r: 'flat' } }];
    for (let b = 1; b <= n; b++) {
      const s = b % 4 === 1 || b % 4 === 2 ? 'r' : 'l', g = S(s), out = b % 2 === 1;
      const feet = out ? { [s]: [g * 2.2, 0], [other(s)]: [-g * 0.9, 0] } : { [s]: [g * 2.2, 0], [other(s)]: [g * 1.35, 0.05] };
      k.push({ b, feet, hip: g * (out ? 0.6 : 1.3), dip: out ? 0.16 : 0.08, arms: out ? arms('relaxed', 'relaxed') : arms('clap', 'clap'), hands: { l: 'flat', r: 'flat' }, head: { yaw: g * 0.15 }, ease: 'hit' });
    }
    return k;
  },
  // "upping!": a fist punched up on 1 and 3, the other fist at the hip, knees dipping with it
  pump: ({ n, side = 'r' }) => {
    const k = [];
    for (let b = 0; b <= n; b++) {
      const up = b % 2 === 0;
      k.push({ b, feet: stance(1.35), dip: up ? 0.18 : 0.07, hip: S(side) * 0.3, arms: { [side]: { ...(up ? ARM.pump : ARM.cocked) }, [other(side)]: { ...ARM.hips } }, hands: { [side]: 'fist', [other(side)]: 'fist' }, lean: up ? -0.08 : 0.06, head: { pitch: up ? -0.25 : 0.05 }, face: 'shout', ease: up ? 'hit' : 'smooth' });
    }
    return k;
  },
  // a point at the audience, held two beats, then the other side
  point: ({ n, side = 'r' }) => {
    const k = [];
    for (let b = 0; b <= n; b += 2) {
      const s = (b / 2) % 2 ? other(side) : side, g = S(s);
      k.push({ b, feet: { [s]: [g * 1.6, 0.25], [other(s)]: [-g * 1.1, -0.1] }, hip: g * 0.5, dip: 0.1, turn: g * 0.18, arms: { [s]: { ...ARM.point }, [other(s)]: { ...ARM.hips } }, hands: { [s]: 'point', [other(s)]: 'fist' }, head: { yaw: -g * 0.1 }, face: 'wink', ease: 'hit' });
      k.push({ b: b + 1, dip: 0.04, ease: 'smooth' });
    }
    return k.filter((x) => x.b <= n);
  },
  // both arms up, swaying overhead
  wave: ({ n }) => {
    const k = [];
    for (let b = 0; b <= n; b += 2) {
      const g = (b / 2) % 2 ? 1 : -1;
      k.push({ b, feet: stance(1.4), dip: 0.08, hip: g * 0.4, side: -g * 0.2, arms: { l: { ...ARM.up, out: 1.25 + g * 0.35 }, r: { ...ARM.up, out: 1.25 - g * 0.35 } }, hands: { l: 'open', r: 'open' }, head: { pitch: -0.2, roll: g * 0.1 }, face: 'smile', ease: 'smooth' });
    }
    return k;
  },
  // the idol's hit: a peace sign by the eye, the hip popped, a wink
  idol: ({ n, side = 'r' }) => {
    const g = S(side);
    return [
      { b: 0, feet: { [side]: [g * 1.2, 0.1], [other(side)]: [-g * 1.0, -0.05] }, dip: 0.12, hip: g * 1.0, side: -g * 0.15, lean: 0.05, turn: -g * 0.15, arms: { [side]: { ...ARM.face }, [other(side)]: { ...ARM.hips } }, hands: { [side]: 'peace', [other(side)]: 'fist' }, head: { roll: -g * 0.2, pitch: 0.08 }, face: 'wink', ease: 'hit' },
      { b: n, dip: 0.1, ease: 'hold' },
    ];
  },
  // "forward, backward, repeat": a robot's step forward and back, the arms square on the beat
  robot: ({ n }) => {
    const k = [];
    for (let b = 0; b <= n; b++) {
      const fwd = Math.floor(b / 2) % 2 === 0, s = b % 2 ? 'l' : 'r';
      const z = fwd ? 0.35 : -0.25;
      k.push({ b, feet: { l: [1.1, s === 'l' ? z : 0], r: [-1.1, s === 'r' ? z : 0] }, dip: 0.08, arms: { [s]: { ...ARM.robot }, [other(s)]: { ...ARM.robotDown } }, hands: { l: 'flat', r: 'flat' }, head: { yaw: S(s) * 0.35 }, face: 'neutral', ease: 'hit' });
    }
    return k;
  },
  // a step-turn: a quarter turn on each beat, the feet stepping round it
  turn: ({ n, dir = 1 }) => {
    const k = [];
    for (let b = 0; b <= n; b++) {
      const a = dir * (b / n) * TAU, c = Math.cos(a), s = Math.sin(a);
      const at = (x, z) => [x * c + z * s, -x * s + z * c];      // a point in the dancer's frame, turned
      k.push({ b, feet: { l: at(1, 0), r: at(-1, 0) }, turn: a, dip: b % 2 ? 0.1 : 0.05, arms: arms('wide', 'wide'), hands: { l: 'open', r: 'open' }, head: { yaw: -dir * 0.3 }, face: 'smile', ease: 'linear' });
    }
    return k;
  },
  // a jump: down to load, up (the feet leave the floor), land soft
  jump: ({ n = 2 }) => [
    { b: 0, feet: stance(1.1), dip: 0.3, arms: arms('back', 'back'), hands: { l: 'open', r: 'open' }, lean: 0.25, ease: 'smooth' },
    { b: n * 0.4, feet: stance(1.1), lift: 0.35, dip: 0, arms: arms('up', 'up'), hands: { l: 'open', r: 'open' }, lean: -0.1, head: { pitch: -0.3 }, face: 'laugh', ease: 'hit' },
    { b: n * 0.75, feet: stance(1.1), lift: 0, dip: 0.28, arms: arms('high', 'high'), lean: 0.12, ease: 'smooth' },
    { b: n, feet: stance(1.1), dip: 0.08, arms: arms('relaxed', 'relaxed'), lean: 0, ease: 'smooth' },
  ],
  // a shrug, palms up ("safe enough, we reckoned")
  shrug: ({ n }) => [
    { b: 0, feet: stance(1.2), dip: 0.05, arms: arms('shrug', 'shrug'), hands: { l: 'open', r: 'open' }, head: { roll: 0.2, pitch: 0.05 }, face: 'sleepy', ease: 'hit' },
    { b: n, dip: 0.08, head: { roll: -0.15 }, ease: 'hold' },
  ],
  // reaching out to someone out of frame ("please don't let me go")
  reach: ({ n, side = 'r' }) => {
    const g = S(side);
    return [
      { b: 0, feet: { [side]: [g * 1.2, 0.6], [other(side)]: [-g * 1.1, -0.2] }, dip: 0.2, hip: g * 0.4, lean: 0.2, turn: g * 0.2, arms: { [side]: { ...ARM.reach }, [other(side)]: { ...ARM.relaxed } }, hands: { [side]: 'open', [other(side)]: 'relaxed' }, head: { pitch: -0.1 }, face: 'sad', ease: 'smooth' },
      { b: n, dip: 0.24, ease: 'hold' },
    ];
  },
  // frozen on the stop, whatever the body was doing
  freeze: ({ n }) => [{ b: 0, ease: 'hit' }, { b: n, ease: 'hold' }],
  // a bow: the arms swept back, the body folded
  bow: ({ n }) => [
    { b: 0, feet: stance(0.9), dip: 0.05, arms: arms('relaxed', 'relaxed'), lean: 0, face: 'smile', ease: 'smooth' },
    // the hands hang just off the legs as the body folds (straight down, they run into the thighs)
    { b: n * 0.5, feet: stance(0.9), dip: 0.1, arms: arms('bow', 'bow'), hands: { l: 'flat', r: 'flat' }, lean: 0.9, head: { pitch: 0.3 }, face: 'smile', ease: 'smooth' },
    { b: n, lean: 0.9, ease: 'hold' },
  ],
};

// ---- compile and play ------------------------------------------------------------------

const KEYS = ['dip', 'lift', 'turn', 'hip', 'lean', 'side', 'twist'];
// an arm moved away from what it went into: lifted out to the side from the body (past
// straight sideways, `out` swings it BEHIND the body, into its back), lowered from the head
const away = (a, into) => (into === 'head' ? { ...a, raise: a.raise - 0.12, out: a.out + (Math.PI / 2 - a.out) * 0.2 } : { ...a, raise: a.raise + 0.1, out: a.out + (Math.PI / 2 - a.out) * 0.3 });

/**
 * One arm cleared of the body: the smallest change (raise it, lower it, open it toward the
 * side, or both) that takes it out. Lifting alone is wrong for an arm in front of a big
 * head: a chibi's point went further into its own head the higher it was lifted.
 */
function clearArm(arms, s, depthOf, tol) {
  let best = arms[s], bd = depthOf(arms);
  if (bd < tol) return best;
  const moves = [];
  for (const r of [0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.75]) for (const o of [0, 0.25, 0.5]) moves.push([r, o]);
  moves.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  for (const [dr, fo] of moves) {
    const a = { ...arms[s], raise: arms[s].raise + dr, out: arms[s].out + (Math.PI / 2 - arms[s].out) * fo };
    const d = depthOf({ ...arms, [s]: a });
    if (d < bd) { bd = d; best = a; }
    if (d < tol) return a;
  }
  return best;
}
const lerpArm = (a, b) => Object.fromEntries(['raise', 'out', 'elbow', 'roll', 'wrist'].map((x) => [x, ((a[x] || 0) + (b[x] || 0)) / 2]));
const HEAD = ['yaw', 'pitch', 'roll'];
const ARMK = ['raise', 'out', 'elbow', 'roll', 'wrist'];

/**
 * The script's moves as one list of full keyframes on absolute beats (every field filled
 * from the one before), each with its standing pelvis height solved for this body.
 */
export function compileDance(rig, script, { home = [0, 0], facing = 0, beatsPerBar = 4, mirror = false, clear = true } = {}) {
  const m = rig.m;
  let cur = { feet: stance(1), dip: 0, lift: 0, turn: 0, hip: 0, lean: 0, side: 0, twist: 0, head: { yaw: 0, pitch: 0, roll: 0 }, arms: arms('relaxed', 'relaxed'), hands: { l: 'relaxed', r: 'relaxed' }, face: 'smile' };
  const keys = [];
  for (const step of script) {
    const n = (step.bars ?? 1) * beatsPerBar, b0 = step.bar * beatsPerBar;
    const side = mirror && step.side ? other(step.side) : step.side;
    const ks = MOVES[step.move]({ ...step, side, n }).filter((k) => k.b <= n + 1e-9);
    // the move's first keyframe arrives a little after its downbeat when the one before ends
    // ON that beat (a held pose): the hold is kept, and the change takes half a beat
    const gap = ks.length > 1 ? ks[1].b - ks[0].b : n;
    for (const k of ks) {
      const shift = k === ks[0] && keys.length && Math.abs(keys[keys.length - 1].beat - b0) < 1e-9 ? Math.min(0.5, gap / 2) : 0;
      const nk = { ...cur, beat: b0 + k.b + shift, ease: k.ease || 'smooth', move: step.move };
      for (const f of KEYS) if (k[f] !== undefined) nk[f] = k[f];
      if (k.feet) nk.feet = { ...cur.feet, ...k.feet };
      if (k.head) nk.head = { ...cur.head, ...k.head };
      if (k.arms) nk.arms = { l: { roll: 0, wrist: 0, ...(k.arms.l || cur.arms.l) }, r: { roll: 0, wrist: 0, ...(k.arms.r || cur.arms.r) } };
      if (k.hands) nk.hands = { ...cur.hands, ...k.hands };
      if (k.face) nk.face = k.face;
      // a yaw is an angle: the nearest turn to the last one (after a full step-turn the body
      // faces front at 2π, and the next move's small yaw must not unwind it back through 0)
      nk.turn = cur.turn + Math.atan2(Math.sin(nk.turn - cur.turn), Math.cos(nk.turn - cur.turn));
      // later keyframes on the same beat replace earlier ones
      if (keys.length && Math.abs(keys[keys.length - 1].beat - nk.beat) < 1e-9) keys.pop();
      keys.push(nk);
      cur = nk;
    }
  }
  // a mirrored dancer: left for right (feet, arms, hands), and every lateral quantity negated
  if (mirror) for (const k of keys) {
    k.feet = { l: [-k.feet.r[0], k.feet.r[1], -(k.feet.r[2] || 0)], r: [-k.feet.l[0], k.feet.l[1], -(k.feet.l[2] || 0)] };
    k.arms = { l: k.arms.r, r: k.arms.l }; k.hands = { l: k.hands.r, r: k.hands.l };
    k.hip = -k.hip; k.turn = -k.turn; k.side = -k.side; k.twist = -k.twist;
    k.head = { ...k.head, yaw: -k.head.yaw, roll: -k.head.roll };
  }
  // where each foot is, in the stage's frame: the dancer's spot and facing
  const cf = Math.cos(facing), sf = Math.sin(facing);
  const place = ([x, z]) => { const lx = x * m.hipHalf, lz = z * m.k; return [home[0] + lx * cf + lz * sf, 0, home[1] - lx * sf + lz * cf]; };
  // the standing pelvis height for each keyframe's feet (settle: as high as they reach,
  // with the knees a hair soft, so the frames between two stances still reach)
  const heights = new Map();
  for (const k of keys) {
    const sig = JSON.stringify([k.feet, Math.round(k.turn * 100), Math.round(k.hip * 100)]);
    if (!heights.has(sig)) {
      const pose = poseOf(rig, k, { place, facing, standY: rig.rootY, home });
      heights.set(sig, settle(rig, pose, 0.975).root.pos[1]);
    }
    k.standY = heights.get(sig);
  }
  // arms clear of the body: each keyframe's arms, tried on THIS body, opened out from it
  // until they clear (a chibi's hands overhead meet its head; arms swept back in a bow meet
  // the folded torso). Memoised: a dance repeats its arm shapes.
  const own = { l: GROUPS.indexOf('arm_l'), r: GROUPS.indexOf('arm_r') };
  if (clear) {
    const memo = new Map();
    for (const k of keys) {
      const sig = JSON.stringify([k.arms, k.hands, Math.round(k.lean * 50), Math.round(k.side * 50), Math.round(k.twist * 50), Math.round(k.dip * 20)]);
      if (!memo.has(sig)) {
        const cleared = { l: { ...k.arms.l }, r: { ...k.arms.r } };
        const depth = (arms, s) => interpenetration(buildBody(solve(rig, poseOf(rig, { ...k, arms }, { place, facing, standY: k.standY, home })), { hair: false, clothes: false, hands: 'block' }), [own[s]]).depth;
        for (const s of ['l', 'r']) cleared[s] = clearArm(cleared, s, (arms) => depth(arms, s), 0.02 * m.k);
        memo.set(sig, cleared);
      }
      k.arms = memo.get(sig);
    }
    // and between keyframes: halfway from each to the next (a hip shifting into a hanging
    // hand happens in the move, not at its ends)
    for (let i = 0; i + 1 < keys.length; i++) {
      const A = keys[i], B = keys[i + 1];
      for (const s of ['l', 'r']) {
        for (let tries = 0; tries < 5; tries++) {
          const mid = { ...A, arms: { l: lerpArm(A.arms.l, B.arms.l), r: lerpArm(A.arms.r, B.arms.r) } };
          for (const f of KEYS) mid[f] = (A[f] + B[f]) / 2;
          mid.standY = (A.standY + B.standY) / 2;
          const P = solve(rig, poseOf(rig, mid, { place, facing, standY: mid.standY, home }));
          const pen = interpenetration(buildBody(P, { hair: false, clothes: false, hands: 'block' }), [own[s]]);
          if (pen.depth < 0.02 * m.k) break;
          for (const K of [A, B]) K.arms = { ...K.arms, [s]: away(K.arms[s], pen.into) };
        }
      }
    }
  }
  return { keys, place, facing, home, at: (beat) => danceAt(rig, keys, beat, { place, facing, home }) };
}

/** The pose for one (interpolated) keyframe. */
function poseOf(rig, k, { place, facing, standY, home, feetAt = null, lifts = { l: 0, r: 0 } }) {
  const m = rig.m, yaw = facing + k.turn;
  const cf = Math.cos(facing), sf = Math.sin(facing);
  const hipX = k.hip * m.hipHalf * 0.5;
  const x = home[0] + hipX * cf, z = home[1] - hipX * sf;
  const y = standY - k.dip * m.k + k.lift * m.k;
  const legs = {};
  for (const s of ['l', 'r']) {
    const p = feetAt ? feetAt[s] : place(k.feet[s]);
    legs[s] = { at: [p[0], (p[1] || 0) + lifts[s] + k.lift * m.k * 1, p[2]], yaw: yaw + (k.feet[s][2] || 0), pivot: 'flat' };
  }
  return {
    root: { pos: [x, y, z], yaw, pitch: 0, roll: -k.hip * 0.04 },
    spine: { bend: k.lean, side: k.side, twist: k.twist },
    head: { ...k.head },
    legs,
    arms: { l: { ...k.arms.l, gesture: k.hands.l }, r: { ...k.arms.r, gesture: k.hands.r } },
    expression: k.face,
  };
}

/** The dance at a beat: keyframes interpolated, steps lifted on an arc. */
export function danceAt(rig, keys, beat, ctx) {
  const m = rig.m;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].beat <= beat) i++;
  const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
  const span = B.beat - A.beat;
  const u = span > 1e-9 ? clamp01((beat - A.beat) / span) : 1;
  const e = (EASE[B.ease] || smooth)(u);
  const k = { ...A };
  for (const f of KEYS) k[f] = lerp(A[f], B[f], e);
  k.standY = lerp(A.standY, B.standY, e);
  k.head = Object.fromEntries(HEAD.map((h) => [h, lerp(A.head[h] || 0, B.head[h] || 0, e)]));
  k.arms = Object.fromEntries(['l', 'r'].map((s) => [s, Object.fromEntries(ARMK.map((a) => [a, lerp(A.arms[s][a] || 0, B.arms[s][a] || 0, e)]))]));
  // hands and face change at the halfway mark (a hit changes on arrival)
  const flip = B.ease === 'hit' ? e > 0.6 : u > 0.5;
  k.hands = flip ? B.hands : A.hands;
  k.face = flip ? B.face : A.face;
  // feet: planted where A and B agree; a step between them lifts on an arc (the ground
  // contact moves along a line and rises as a sine, so it lands where it was put)
  const feetAt = {}, lifts = { l: 0, r: 0 }, moving = { l: false, r: false }, plant = { l: null, r: null };
  for (const s of ['l', 'r']) {
    const pa = ctx.place(A.feet[s]), pb = ctx.place(B.feet[s]);
    const d = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
    if (d < 1e-4) { feetAt[s] = pa; if (!A.lift && !B.lift) plant[s] = pa; continue; }
    const su = smooth(u);
    feetAt[s] = [lerp(pa[0], pb[0], su), 0, lerp(pa[2], pb[2], su)];
    lifts[s] = Math.sin(Math.PI * u) * Math.min(0.18 * m.k, 0.25 * d + 0.04 * m.k);
    moving[s] = true;
  }
  k.feet = { l: [...A.feet.l], r: [...A.feet.r] };
  k.feet.l[2] = lerp(A.feet.l[2] || 0, B.feet.l[2] || 0, e); k.feet.r[2] = lerp(A.feet.r[2] || 0, B.feet.r[2] || 0, e);
  const pose = poseOf(rig, k, { ...ctx, standY: k.standY, feetAt, lifts });
  // stepping: the whole interval between two plants that differ (not just while lifted)
  const stepping = { l: moving.l || A.lift > 0 || B.lift > 0, r: moving.r || A.lift > 0 || B.lift > 0 };
  // plant: where each foot is planted (null while it steps or jumps): a foot may only move
  // between two frames whose plants differ
  return { pose, beat, key: A, next: B, u, stepping, plant };
}

/** Beats ↔ seconds for a song: `bpm`, and the time of beat 0 (the first downbeat). */
export function beatClock(bpm, t0 = 0) {
  const spb = 60 / bpm;
  return { bpm, t0, spb, beatAt: (t) => (t - t0) / spb, timeAt: (b) => t0 + b * spb };
}

/**
 * A dance compiled ahead (compileDance's keys, home and facing, e.g. saved as JSON by a build
 * step): the same `at(beat)`, without compiling in the browser. Compiling clears every arm
 * shape against THIS body with a solver, which is too slow to do for a cast on page load.
 */
export function playDance(rig, { keys, home = [0, 0], facing = 0 }) {
  const m = rig.m, cf = Math.cos(facing), sf = Math.sin(facing);
  const place = ([x, z]) => { const lx = x * m.hipHalf, lz = z * m.k; return [home[0] + lx * cf + lz * sf, 0, home[1] - lx * sf + lz * cf]; };
  return { keys, home, facing, place, at: (beat) => danceAt(rig, keys, beat, { place, facing, home }) };
}

/** Compiled keys, trimmed for shipping: numbers to 4 places. */
export function packKeys(keys) {
  const r4 = (x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : Array.isArray(x) ? x.map(r4) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, r4(v)])) : x);
  return keys.map((k) => r4(k));
}
