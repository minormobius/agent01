// hand.js — the hand: a palm, four fingers of three bones each, and a thumb, posed
// by GESTURE.
//
// Everything is in HAND LENGTHS (wrist crease to the middle fingertip) in the hand's
// own frame (rig.js F.hand_*): y is the back of the hand, z runs toward the fingers,
// and r, toward the thumb, is −x on the left hand and +x on the right. Built from r
// rather than x, the two hands mirror exactly.
//
// A gesture says what the hand does: a fist, a point, a peace sign, OK. It is not a
// table of angles for one hand. Solvers make it true for this hand:
//   close   a closed finger curls until its tip meets the palm, not through it
//   onto    the thumb's tip is solved onto a finger: a fingertip (OK), or the middle
//           bones of closed fingers (a fist), without passing through anything
//   thumb   otherwise, the thumb never passes through the fingers or the palm
//   rest    a placed hand's fingers curl or lift until they lie on what they rest on
//
// The anatomy, from the figure-drawing books: the knuckles lie on an arc, the middle
// finger is longest, the index and ring nearly equal, and the pinky's tip reaches the
// ring finger's last joint. Each finger's bones run about 0.46 : 0.30 : 0.24. The
// palm is a little longer than the middle finger is.

import { add, sub, scale, dot, norm, len, madd } from './vec.js';

export const FINGERS = ['index', 'middle', 'ring', 'pinky'];

// [toward the thumb, along the hand] of each knuckle, in hand lengths: an arc
const KNUCKLE = { index: [0.15, 0.445], middle: [0.05, 0.46], ring: [-0.05, 0.445], pinky: [-0.145, 0.405] };
const LENGTH = { index: 0.5, middle: 0.54, ring: 0.51, pinky: 0.4 };
const BONES = [0.46, 0.3, 0.24];
const SPLAY = { index: 1, middle: 0, ring: -0.6, pinky: -1.3 };   // how each finger fans, per unit of spread
const THUMB = { base: [0.12, -0.02, 0.09], bones: [0.25, 0.2, 0.17] };

const F4 = (a) => ({ index: a, middle: a, ring: a, pinky: a });
const CLOSED = [1.45, 1.65, 0.9];
const OVER = { spread: 0.25, opp: 1.1, mcp: 0.6, ip: 0.35 };     // the thumb laid over closed fingers (solved: `onto`)

/**
 * Each finger is [knuckle, middle joint, last joint] flexion in radians (+ curls toward
 * the palm). `spread` fans the fingers; `splay` overrides one finger's. The thumb:
 * `spread` swings it out from the index, `opp` turns it across in front of the palm,
 * `mcp` and `ip` curl it.
 */
export const GESTURES = {
  relaxed: { fingers: { index: [0.2, 0.3, 0.18], middle: [0.28, 0.42, 0.24], ring: [0.34, 0.5, 0.28], pinky: [0.4, 0.58, 0.32] }, spread: 0.06, thumb: { spread: 0.45, opp: 0.35, mcp: 0.15, ip: 0.15 } },
  open: { fingers: F4([0, 0.04, 0.02]), spread: 0.24, thumb: { spread: 0.95, opp: 0.1, mcp: 0, ip: 0 } },
  flat: { fingers: F4([0.02, 0.04, 0.02]), spread: 0.03, thumb: { spread: 0.35, opp: 0.1, mcp: 0.05, ip: 0.05 } },
  fist: { fingers: F4(CLOSED), close: true, spread: 0, thumb: OVER, onto: ['middle', 1] },
  point: { fingers: { ...F4(CLOSED), index: [0.03, 0.04, 0.02] }, close: true, spread: 0, thumb: OVER, onto: ['middle', 1] },
  peace: { fingers: { ...F4(CLOSED), index: [0.02, 0.03, 0.02], middle: [0.02, 0.03, 0.02] }, close: true, spread: 0, splay: { index: 0.2, middle: -0.12 }, thumb: OVER, onto: ['ring', 1] },
  thumbsUp: { fingers: F4(CLOSED), close: true, spread: 0, thumb: { spread: 1.25, opp: -0.1, mcp: 0, ip: 0 } },
  grip: { fingers: F4([0.9, 1.1, 0.6]), spread: 0.02, thumb: { spread: 0.3, opp: 0.9, mcp: 0.35, ip: 0.2 } },
  ok: { fingers: { index: [0.75, 0.9, 0.55], middle: [0.12, 0.15, 0.1], ring: [0.18, 0.2, 0.12], pinky: [0.25, 0.25, 0.15] }, spread: 0.14, onto: ['index', 2, 1], thumb: { spread: 0.6, opp: 0.6, mcp: 0.2, ip: 0.2 } },
};

/** How far each joint may bend, radians [least, most]: past these a finger is broken. */
export const LIMITS = { mcp: [-0.4, 1.6], pip: [-0.05, 1.9], dip: [-0.1, 1.3], thumb: { opp: [-0.3, 1.3], mcp: [-0.1, 1.0], ip: [-0.2, 1.4] } };

/** A gesture name, or an object in the same shape (fields default from `relaxed`). */
export function resolveGesture(g = 'relaxed') {
  const base = GESTURES.relaxed;
  const G = typeof g === 'string' ? GESTURES[g] : g;
  if (!G) throw new Error(`unknown gesture: ${g} (know: ${Object.keys(GESTURES).join(', ')})`);
  return { ...base, ...G, fingers: { ...base.fingers, ...(G.fingers || {}) }, thumb: { ...base.thumb, ...(G.thumb || {}) }, splay: G.splay || {} };
}

/** The hand's measures for this body: finger radii follow the palm's thickness. */
export function handMeasures(m) {
  const h = m.hand, fe = m.spec.femme || 0;
  const rs = (m.radii.hand / (0.1 * h)) * (1 - 0.1 * fe);        // the palm's half-thickness is ~0.1 hand
  const fl = 0.8 + 0.2 * Math.min(1, m.k);                          // a chibi's fingers are stubby
  // a finger is no thicker than its knuckles are apart (a chibi's chunky palm, not fused fingers)
  const rf = Math.min(rs, 1.08);
  return { h, rF: 0.046 * h * rf, rTip: 0.035 * h * rf, rT: 0.058 * h * rf, rTTip: 0.042 * h * rf, fl, tl: (1 + fl) / 2, palmR: [0.2 * h, m.radii.hand * 0.9, 0.235 * h] };
}

// ---------------------------------------------------------------- geometry --

/** The hand's own axes, and a point in hand lengths: [toward the thumb, back, along]. */
function axes(P, s) {
  const HF = P.F[`hand_${s}`], W = P.J[`wrist_${s}`], sg = s === 'l' ? 1 : -1;
  const r = scale(HF.x, -sg), y = HF.y, z = HF.z, h = P.rig.m.hand;
  const at = (a, b, c) => add(W, add(scale(r, a * h), add(scale(y, b * h), scale(z, c * h))));
  return { HF, W, r, y, z, h, at };
}

/** One finger's bones for three flexions and a splay: [{ a, b, ra, rb }] × 3. */
function fingerBones(A, M, name, flex, splay) {
  const [ko, kz] = KNUCKLE[name];
  let p = A.at(ko, -0.01, kz);
  let dir = norm(add(scale(A.z, Math.cos(splay)), scale(A.r, Math.sin(splay)))), dors = A.y;
  const L = LENGTH[name] * M.fl * A.h, out = [];
  let t = 0;
  for (let j = 0; j < 3; j++) {
    const c = Math.cos(flex[j]), sn = Math.sin(flex[j]);
    [dir, dors] = [add(scale(dir, c), scale(dors, -sn)), add(scale(dors, c), scale(dir, sn))];
    const l = L * BONES[j], b = madd(p, dir, l);
    const t1 = t + BONES[j];
    out.push({ a: p, b, ra: M.rF + (M.rTip - M.rF) * t, rb: M.rF + (M.rTip - M.rF) * t1 });
    p = b; t = t1;
  }
  return out;
}

/** The thumb's bones: metacarpal, then two phalanges curling toward the little finger. */
function thumbBones(A, M, T) {
  const B = A.at(...THUMB.base);
  let dir = norm(add(scale(A.z, Math.cos(T.spread)), scale(A.r, Math.sin(T.spread))));
  dir = norm(add(scale(dir, Math.cos(T.opp)), scale(A.y, -Math.sin(T.opp))));
  const out = [];
  let p = B, t = 0;
  const flex = [0, T.mcp, T.ip];
  for (let j = 0; j < 3; j++) {
    if (flex[j]) {
      // it curls across the palm, toward the little finger's side
      const q = norm(sub(scale(A.r, -1), scale(dir, dot(scale(A.r, -1), dir))));
      dir = norm(add(scale(dir, Math.cos(flex[j])), scale(q, Math.sin(flex[j]))));
    }
    const l = THUMB.bones[j] * M.tl * A.h, b = madd(p, dir, l), t1 = t + 1 / 3;   // stubby fingers, a less stubby thumb
    out.push({ a: p, b, ra: M.rT + (M.rTTip - M.rT) * t, rb: M.rT + (M.rTTip - M.rT) * t1 });
    p = b; t = t1;
  }
  return out;
}

// distances, for the solvers (the same round cone and ellipsoid the renderer draws)
function segDist(p, s) {
  const ba = sub(s.b, s.a), t = Math.max(0, Math.min(1, dot(sub(p, s.a), ba) / (dot(ba, ba) || 1)));
  return len(sub(p, madd(s.a, ba, t))) - (s.ra + (s.rb - s.ra) * t);
}
function samples(s, n = 4) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([add(s.a, scale(sub(s.b, s.a), t)), s.ra + (s.rb - s.ra) * t]); }
  return out;
}
/** How deep bones go into a distance field (≥ 0; 0 = clear). */
function depthIn(bones, D) {
  let worst = 0;
  for (const s of bones) for (const [p, r] of samples(s)) worst = Math.max(worst, r - D(p));
  return worst;
}

/**
 * The hand, solved: palm, thenar pad, each finger's bones and the thumb's, with the
 * flexions actually used. `scene` (a distance function) is what a placed hand rests on.
 */
export function handPose(P, s, { scene = null } = {}) {
  const m = P.rig.m, M = handMeasures(m), A = axes(P, s);
  const spec = P.hands?.[s] || {};
  const G = resolveGesture(spec.gesture || (spec.placed ? 'flat' : 'relaxed'));
  const palm = { c: A.at(0, -0.005, 0.24), r: M.palmR };
  const palmD = (p) => { const d = sub(p, palm.c), q = [dot(d, A.r) / palm.r[0], dot(d, A.y) / palm.r[1], dot(d, A.z) / palm.r[2]]; const k0 = len(q); return (k0 - 1) * Math.min(...palm.r); };
  const fingers = {}, flexUsed = {}, rest = {};
  for (const name of FINGERS) {
    const splay = G.splay[name] ?? G.spread * SPLAY[name];
    let flex = G.fingers[name].slice();
    // close: a curled finger stops where its tip meets the palm
    if (G.close && flex[0] + flex[1] + flex[2] > 2) {
      const at = (t) => fingerBones(A, M, name, flex.map((x) => x * t), splay);
      const deep = (t) => depthIn(at(t).slice(1), palmD);
      if (deep(1) > 0.1 * M.rTip) {
        let lo = 0.3, hi = 1;
        for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (deep(mid) > 0.1 * M.rTip) hi = mid; else lo = mid; }
        flex = flex.map((x) => x * lo);
      }
    }
    // rest: a placed hand's finger lies on what it rests on, curling over it or lifting off it
    if (scene && spec.placed) {
      const base = flex.slice();
      const at = (t) => fingerBones(A, M, name, [base[0] + t, base[1] + 0.9 * Math.max(0, t), base[2] + 0.6 * Math.max(0, t)], splay);
      const clear = (t) => Math.min(...at(t).flatMap((b) => samples(b).map(([p, r]) => scene(p) - r)));
      let t;
      if (clear(-0.35) < 0) t = -0.35;
      else if (clear(1.3) > 0) t = 1.3;
      else { let lo = -0.35, hi = 1.3; for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (clear(mid) > 0) lo = mid; else hi = mid; } t = lo; }
      flex = [base[0] + t, base[1] + 0.9 * Math.max(0, t), base[2] + 0.6 * Math.max(0, t)];
      rest[name] = t >= 1.3 ? 'off the edge' : t <= -0.35 ? 'lifted' : 'on';     // curled all the way and nothing under it
    }
    fingers[name] = fingerBones(A, M, name, flex, splay);
    flexUsed[name] = flex;
  }
  // the thumb: solved onto a finger (onto), or kept out of the fingers and the palm
  let T = { ...G.thumb };
  const fingerBonesAll = Object.values(fingers).flat();
  const others = (p) => Math.min(...fingerBonesAll.map((b) => segDist(p, b)), scene && spec.placed ? scene(p) : Infinity);
  const through = (TT) => { const tb = thumbBones(A, M, TT); return Math.max(depthIn(tb.slice(1), others), depthIn(tb.slice(2), palmD)); };
  if (G.onto) {
    // [finger, bone, where along it (default: its middle)]: the thumb's pad lies on it
    const [fn, bi, tt = 0.5] = G.onto, bone = fingers[fn][bi];
    const target = add(bone.a, scale(sub(bone.b, bone.a), tt)), rTg = bone.ra + (bone.rb - bone.ra) * tt;
    const cost = (TT) => {
      const tb = thumbBones(A, M, TT);
      return Math.abs(len(sub(tb[2].b, target)) - (rTg + tb[2].rb)) + 3 * Math.max(depthIn(tb.slice(1), others), depthIn(tb.slice(2), palmD));
    };
    // descend from the gesture's own thumb and from a few others round it (the way to the
    // mark can run through the fingers, and one start can stall against them)
    const descend = (T0) => {
      let Tb = T0, best = cost(T0);
      for (let step = 0.2; step > 0.004; step /= 2) {
        for (let pass = 0; pass < 8; pass++) {
          let moved = false;
          for (const key of ['spread', 'opp', 'mcp', 'ip']) for (const sg of [1, -1]) {
            const lim = key === 'spread' ? [-0.2, 1.4] : LIMITS.thumb[key];
            const TT = { ...Tb, [key]: Math.max(lim[0], Math.min(lim[1], Tb[key] + sg * step)) };
            const c = cost(TT);
            if (c < best - 1e-7) { best = c; Tb = TT; moved = true; }
          }
          if (!moved) break;
        }
      }
      return [best, Tb];
    };
    let [best, Tb] = descend(T);
    for (const [ds, dop, fm] of [[0.3, 0.15, 1.3], [-0.2, 0.2, 1.4], [0.15, -0.2, 0.8], [0.4, 0.25, 0.6]]) {
      if (best < 0.01 * A.h) break;
      const [c, TT] = descend({ ...T, spread: T.spread + ds, opp: Math.min(1.3, T.opp + dop), mcp: Math.min(1, T.mcp * fm), ip: Math.min(1.4, T.ip * fm) });
      if (c < best) { best = c; Tb = TT; }
    }
    T = Tb;
  } else if (through(T) > 0.1 * M.rTTip) {
    // over, not through: turn it out of the palm a little, then uncurl it, until it clears
    let found = null;
    for (let d = 0; d <= 0.8 && !found; d += 0.1) for (const tf of [1, 0.75, 0.5, 0.25, 0]) {
      const TT = { ...T, opp: T.opp - d, mcp: T.mcp * tf, ip: T.ip * tf };
      if (through(TT) <= 0.1 * M.rTTip) { found = TT; break; }
    }
    T = found || { ...T, opp: T.opp - 0.8, mcp: 0, ip: 0 };
  }
  const thumb = thumbBones(A, M, T);
  const thenar = { c: add(thumb[0].a, scale(sub(thumb[0].b, thumb[0].a), 0.45)), dir: norm(sub(thumb[0].b, thumb[0].a)) };
  return { A, M, palm, palmD, fingers, thumb, thenar, flex: flexUsed, rest, thumbAngles: T, gesture: G };
}

/**
 * The hand as primitives, in the arm's group. `mk` builds them (body.js ell / cone).
 * `detail: 'block'` is the hand drawn small: fingers doing the same thing become one mass
 * per bone, and only a finger doing something else (a point, a V) stands apart, which is
 * how a hand is drawn at a distance. Four fingers a few pixels wide are four ink lines.
 */
export function buildHand(P, s, mk, opts = {}) {
  const H = handPose(P, s, opts), { A, M } = H, kk = P.rig.m.k, g = `arm_${s}`;
  const out = [];
  if (opts.detail === 'block') {
    out.push(mk.ellipsoid(g, H.palm.c, A.HF, [M.palmR[0], M.palmR[1], M.palmR[2]], 0.08 * kk, `palm_${s}`));
    const Ft = frameAlong(H.thenar.dir, A.y);
    out.push(mk.ellipsoid(g, H.thenar.c, Ft, [0.085 * A.h, 0.07 * A.h * (M.rT / (0.058 * A.h)), 0.14 * A.h], 0.05 * A.h, `thenar_${s}`));
    // neighbouring fingers that bend and fan alike are one mass: their own bones, melted
    // together (a smooth union wide enough to fill the gaps), so the mass still follows
    // the gesture; a finger doing something else stays apart
    const bend = (f) => H.flex[f].reduce((a, b) => a + b, 0);
    const fan = (f) => H.gesture.splay[f] ?? H.gesture.spread * SPLAY[f];
    const alike = (a, b) => Math.abs(bend(a) - bend(b)) < 0.35 && Math.abs(H.flex[a][0] - H.flex[b][0]) < 0.3 && Math.abs(fan(a) - fan(b)) < 0.15;
    const melt = Object.fromEntries(FINGERS.map((f, i) => [f, (i > 0 && alike(FINGERS[i - 1], f)) || (i < 3 && alike(f, FINGERS[i + 1]))]));
    for (const f of FINGERS) H.fingers[f].forEach((b, j) => out.push(mk.cone(g, b.a, b.b, b.ra, b.rb, melt[f] ? 1.5 * M.rF : j === 0 ? 0.03 * A.h : 0.3 * M.rTip, `${f}${j}_${s}`)));
    H.thumb.forEach((b, j) => { if (j) out.push(mk.cone(g, b.a, b.b, b.ra, b.rb, j === 1 ? 0.03 * A.h : 0.01 * A.h, `thumb${j}_${s}`)); });
    return out;
  }
  out.push(mk.ellipsoid(g, H.palm.c, A.HF, [M.palmR[0], M.palmR[1], M.palmR[2]], 0.08 * kk, `palm_${s}`));
  // the thenar pad: the thumb's muscle, along its metacarpal, into the palm
  const Ft = frameAlong(H.thenar.dir, A.y);
  out.push(mk.ellipsoid(g, H.thenar.c, Ft, [0.085 * A.h, 0.07 * A.h * (M.rT / (0.058 * A.h)), 0.14 * A.h], 0.05 * A.h, `thenar_${s}`));
  // bones: the first blends into the palm (a little webbing); the rest meet hard, as a limb's do
  for (const name of FINGERS) H.fingers[name].forEach((b, j) => out.push(mk.cone(g, b.a, b.b, b.ra, b.rb, j === 0 ? 0.03 * A.h : 0, `${name}${j}_${s}`)));
  H.thumb.forEach((b, j) => { if (j) out.push(mk.cone(g, b.a, b.b, b.ra, b.rb, j === 1 ? 0.03 * A.h : 0, `thumb${j}_${s}`)); });
  return out;
}

function frameAlong(z, upHint) {
  const y = norm(sub(upHint, scale(z, dot(upHint, z))));
  const x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  return { x, y, z };
}
