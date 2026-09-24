// body.js — the figure's volumes, hung on a solved pose.
//
// The body is a signed distance field built from two primitives: ROUND CONES
// (a sphere swept to another sphere of a different radius — every limb is a
// chain of them following a thickness profile) and ELLIPSOIDS (the ribcage,
// belly, pelvis, skull, hands, feet). Within one GROUP the primitives melt into
// each other (a smooth minimum, radius k), which is what makes a shoulder flow
// into an arm; BETWEEN groups the union is hard, which is what keeps an arm
// that rests against the hip from fusing to it, and what draws the line where
// a forearm crosses the chest.
//
// The same list feeds the GPU (pack → a float texture) and this file's `sdf`,
// which the checks use in node: one body, measured and drawn.

import { add, sub, scale, dot, cross, norm, len, dist, apply, madd, lerp3, rotate as rotateV } from './vec.js';
import { buildHair } from './hair.js';

export const GROUPS = ['torso', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'hair', 'hair_back', 'tail_l', 'tail_r'];
export const HAIR_GROUPS = new Set([6, 7, 8, 9]);
const G = Object.fromEntries(GROUPS.map((g, i) => [g, i]));
export const CONE = 0, ELLIPSOID = 1, CAPPED = 2;   // CAPPED: an ellipsoid cut by a plane (the hairline)

// `side` (+1 left, −1 right, 0 centre): within a group the centre parts blend
// first, then each side blends onto the centre on its own, and the two are
// united. A smooth minimum is not associative, so blending the parts in one
// list order would make the left shoulder differ from the right.
const sideOf = (name) => /_l\d*$/.test(name) ? 1 : /_r\d*$/.test(name) ? -1 : 0;
const cone = (group, a, b, ra, rb, k, name) => ({ type: CONE, group: G[group], side: group === 'torso' || group === 'head' ? sideOf(name) : 0, a, b, ra, rb, k, name });
const ell = (group, c, F, r, k, name) => ({ type: ELLIPSOID, group: G[group], side: group === 'torso' || group === 'head' ? sideOf(name) : 0, a: c, F, r, k, name });

/** A limb segment from A to B, following a profile [[t, radius, offset?]...]. */
function chain(out, group, A, B, profile, k, name, offDir) {
  const pts = profile.map(([t, r, o = 0]) => [offDir && o ? madd(lerp3(A, B, t), offDir, o) : lerp3(A, B, t), r]);
  for (let i = 0; i < pts.length - 1; i++) out.push(cone(group, pts[i][0], pts[i + 1][0], pts[i][1], pts[i + 1][1], k, `${name}${i}`));
}

/** Every primitive of the body in pose `P` (from rig.solve). */
export function buildBody(P) {
  const { J, F, rig } = P;
  const m = rig.m, R = m.radii, kk = m.k;
  const out = [];
  const perp = (d, axis) => norm(sub(d, scale(axis, dot(d, axis))));

  // ---- torso
  out.push(ell('torso', add(J.pelvis, apply(F.pelvis, [0, 0.05 * kk - (m.pelvis.drop || 0), -0.03 * kk])), F.pelvis, m.pelvis.r, (m.pelvis.blend ?? 0.2) * kk, 'pelvis'));
  out.push(ell('torso', add(J.waist, apply(F.waist, [0, 0.05 * kk, 0])), F.waist, m.belly.r, 0.28 * kk, 'belly'));
  out.push(ell('torso', add(J.chest, apply(F.chest, [0, 0.06 * kk, 0.02 * kk])), F.chest, m.chest.r, 0.28 * kk, 'chest'));
  out.push(cone('torso', J.neck, J.headPivot, R.neck * 1.25, R.neck, 0.12 * kk, 'neck'));
  for (const s of ['l', 'r']) {
    const sg = s === 'l' ? 1 : -1;
    // the glutes, behind and below the hip joints
    const G = m.glutes;
    out.push(ell('torso', add(J.pelvis, apply(F.pelvis, [sg * G.x, -0.12 * kk - (m.pelvis.drop || 0), -0.2 * kk])), F.pelvis, [G.r, G.r * 1.08, G.r * 0.9], 0.18 * kk, `glute_${s}`));
    // the breasts: on the front of the ribcage, turned a little outward and down
    if (m.bust) {
      const b = m.bust;
      const F0 = F.chest;
      const Fb = { x: rotateV(rotateV(F0.x, F0.y, sg * 0.28), F0.x, 0.12), y: rotateV(rotateV(F0.y, F0.y, sg * 0.28), F0.x, 0.12), z: rotateV(rotateV(F0.z, F0.y, sg * 0.28), F0.x, 0.12) };
      const c = add(J.chest, apply(F0, [sg * b.x, (m.shoulderY - rig.chestY) - b.drop - 0.12 * kk, m.chest.r[2] * 0.6 + b.r * 0.45]));
      // a firm blend at the top (the upper slope), none underneath: the fold there is inked
      out.push(ell('torso', c, Fb, [b.r * 0.98, b.r * 0.94, b.r * 0.84], 0.1 * kk, `breast_${s}`));
    }
    // the trapezius slopes from high on the neck down to the point of the shoulder
    out.push(cone('torso', add(J.neck, apply(F.chest, [sg * 0.08 * m.wide, 0.22 * kk, -0.06])), madd(J[`shoulder_${s}`], F.chest.x, -sg * 0.06), R.neck * 0.9, R.deltoid * 0.62, 0.18 * kk, `trap_${s}`));
    out.push(cone('torso', J[`shoulder_${s}`], madd(J[`shoulder_${s}`], norm(sub(J[`elbow_${s}`], J[`shoulder_${s}`])), 0.18 * kk), R.deltoid, R.deltoid * 0.9, 0.16 * kk, `deltoid_${s}`));
    // the hip: from the joint a way down the thigh, so the torso's outline runs on into the leg
    // (with wide hips it is the widest point of the figure, at the height of the joints)
    const hipsW = m.spec.hips || 0;
    out.push(cone('torso', J[`hip_${s}`], madd(J[`hip_${s}`], norm(sub(J[`knee_${s}`], J[`hip_${s}`])), (0.25 + 0.4 * hipsW) * kk), R.thigh[0][1] * (0.98 + 0.06 * hipsW), R.thigh[0][1] * (0.95 - 0.02 * hipsW), (0.2 + 0.16 * hipsW) * kk, `hipcap_${s}`));
  }

  // ---- head: the skull, and the jaw tapering to the chin
  const w = m.head.width;
  out.push(ell('head', add(J.headPivot, apply(F.head, m.head.cranium.c)), F.head, [w / 2, 0.44, 0.47], 0.1, 'cranium'));
  const jw = m.head.jaw;
  out.push(cone('head', add(J.headPivot, apply(F.head, jw.top)), add(J.headPivot, apply(F.head, jw.chin)), jw.rt * w / 0.8, jw.rc, 0.22, 'jaw'));
  // the cheeks: fill between the skull and the jaw, so the face's outline runs clean to the chin
  out.push(ell('head', add(J.headPivot, apply(F.head, [0, 0.2, 0.02])), F.head, [0.34 * w / 0.8, 0.2, 0.3], 0.16, 'cheeks'));
  // the nose, a small wedge on the front of the face: it makes the profile, and the face draws the rest
  const skull = out.slice(-3);
  const frontZ = (y) => {                                   // where the face's front is, at height y (head frame)
    let z = 0.8;
    for (let i = 0; i < 60; i++) {
      const p = add(J.headPivot, apply(F.head, [0, y, z]));
      const d = smin(smin(primDist(skull[0], p), primDist(skull[1], p), 0.22), primDist(skull[2], p), 0.16);
      if (Math.abs(d) < 1e-5) break;
      z -= d;
    }
    return z;
  };
  const nv = (P.face?.noseV ?? 0.26) - m.head.pivotUp;
  const zf = frontZ(nv);
  out.push(cone('head', add(J.headPivot, apply(F.head, [0, nv + 0.05, zf - 0.02])), add(J.headPivot, apply(F.head, [0, nv - 0.004, zf + 0.018])), 0.016, 0.011, 0.05, 'nose'));
  // ears, at the eye line on the sides of the head
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    out.push(ell('head', add(J.headPivot, apply(F.head, [sg * (w / 2 - 0.035), (P.face?.eyeLine ?? 0.42) - m.head.pivotUp - 0.03, -0.06])), F.head, [0.035, 0.1, 0.06], 0.035, `ear_${s}`));
  }

  // ---- arms
  for (const s of ['l', 'r']) {
    const sg = s === 'l' ? 1 : -1, g = `arm_${s}`;
    const S = J[`shoulder_${s}`], E = J[`elbow_${s}`], W = J[`wrist_${s}`];
    chain(out, g, S, E, R.upperArm, 0.1 * kk, `upper_${s}`);
    chain(out, g, E, W, R.foreArm, 0.1 * kk, `fore_${s}`);
    // the hand: a mitten (palm and fingers), and the thumb on its own
    const HF = F[`hand_${s}`], h = m.hand;
    out.push(ell(g, madd(W, HF.z, 0.28 * h), HF, [0.21 * h, R.hand, 0.26 * h], 0.08 * kk, `palm_${s}`));
    // the fingers together, curled a little toward the palm
    // (the curl is written without an axis so it mirrors: HF.x flips handedness between sides)
    const cu = P.report?.[`curl_${s}`] ?? 0.35, c = Math.cos(cu), sn = Math.sin(cu);
    const curl = { x: HF.x, y: add(scale(HF.y, c), scale(HF.z, sn)), z: add(scale(HF.z, c), scale(HF.y, -sn)) };
    out.push(ell(g, add(madd(W, HF.z, 0.66 * h), scale(HF.y, -0.05 * h)), curl, [0.19 * h, R.hand * 0.7, 0.27 * h], 0.06 * kk, `fingers_${s}`));
    const thumbSide = scale(HF.x, -sg);
    out.push(cone(g, add(madd(W, HF.z, 0.12 * h), scale(thumbSide, 0.14 * h)), add(madd(W, HF.z, 0.5 * h), add(scale(thumbSide, 0.26 * h), scale(HF.y, -0.1 * h))), 0.075 * h, 0.05 * h, 0.06 * kk, `thumb_${s}`));
  }

  // ---- legs
  for (const s of ['l', 'r']) {
    const g = `leg_${s}`;
    const H = J[`hip_${s}`], K = J[`knee_${s}`], A = J[`ankle_${s}`], FF = F[`foot_${s}`];
    const thighDir = norm(sub(K, H)), shinDir = norm(sub(A, K));
    const front = perp(FF.z, shinDir);                   // the shin's front: toward the toes
    // the thigh's mass sits inside the hip joint (toward the midline), which is what
    // closes the gap at the crotch
    const inward = norm(sub(J.pelvis, H)), tf = perp(FF.z, thighDir);
    const th = R.thigh;
    const t0 = add(H, scale(perp(inward, thighDir), 0.1 * m.wide)), t1 = add(lerp3(H, K, th[1][0]), add(scale(tf, 0.03 * kk), scale(perp(inward, thighDir), 0.035 * m.wide)));
    out.push(cone(g, t0, t1, th[0][1], th[1][1], 0.14 * kk, `thigh_${s}0`));
    out.push(cone(g, t1, K, th[1][1], th[2][1], 0.14 * kk, `thigh_${s}1`));
    out.push(cone(g, madd(K, front, 0.035 * kk), madd(K, front, 0.035 * kk), 0.11 * m.thick, 0.11 * m.thick, 0.1 * kk, `kneecap_${s}`));
    chain(out, g, K, A, R.shin.map(([t, r], i) => [t, r, i === 1 ? -0.05 * kk : 0]), 0.14 * kk, `shin_${s}`, front);
    // the foot: heel to ball, a flattened ellipsoid, and the toes
    const rf = R.foot;
    // (lifted a hair: the smooth blend between the foot's parts bulges below each part)
    const heelC = add(J[`heel_${s}`], scale(FF.y, rf * 1.1)), ballC = add(J[`ball_${s}`], scale(FF.y, rf * 0.92));
    out.push(cone(g, A, heelC, 0.085 * m.thick, rf, 0.03 * kk, `ankle_${s}`));
    out.push(ell(g, lerp3(heelC, ballC, 0.5), FF, [0.15 * m.wide, rf * 0.88, dist(heelC, ballC) / 2 + rf * 0.7], 0.03 * kk, `foot_${s}`));
    out.push(cone(g, ballC, add(J[`toe_${s}`], scale(FF.y, rf * 0.55)), rf * 0.95, rf * 0.55, 0.03 * kk, `toes_${s}`));
  }
  // ---- hair: built last, on the body, so its locks can be kept off it
  if (P.hair) {
    const skin = out.filter((q) => q.group === G.head || q.group === G.torso);
    const capped = (group, c, F, r, n, d, k, name) => ({ type: CAPPED, group: G[group], side: 0, a: c, F, r, b: n, rb: d, k, name });
    const hp = buildHair(P, P.hair, skin, { sdf, ellipsoid: ell, cone, cappedEllipsoid: capped, accel: P.hairAccel || [0, 0, 0] });
    out.push(...hp.prims);
  }
  // grouped, centre parts first within a group, then the left parts, then the right
  const rank = (q) => q.group * 3 + (q.side === 0 ? 0 : q.side === 1 ? 1 : 2);
  out.sort((a, b) => rank(a) - rank(b));
  return out;
}

// ---- distance functions: kept line for line with the GLSL in shader.js ------------

export function sdRoundCone(p, a, b, r1, r2) {
  const ba = sub(b, a), l2 = dot(ba, ba);
  if (l2 < 1e-10) return len(sub(p, a)) - r1;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pa = sub(p, a), y = dot(pa, ba), z = y - l2;
  const xv = sub(scale(pa, l2), scale(ba, y)), x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
export function sdEllipsoid(p, c, F, r) {
  const d = sub(p, c), q = [dot(d, F.x), dot(d, F.y), dot(d, F.z)];
  const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  const k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r);
}
export function smin(a, b, k) {
  if (k <= 0 || !Number.isFinite(a)) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const primDist = (q, p) => q.type === CONE ? sdRoundCone(p, q.a, q.b, q.ra, q.rb)
  : q.type === CAPPED ? Math.max(sdEllipsoid(p, q.a, q.F, q.r), dot(sub(p, q.a), q.b) - q.rb)
  : sdEllipsoid(p, q.a, q.F, q.r);

/** A sphere that contains the primitive: the renderer skips a primitive the ray is far from. */
export function boundOf(q) {
  if (q.type === CONE) { const c = lerp3(q.a, q.b, 0.5); return [c, dist(q.a, q.b) / 2 + Math.max(q.ra, q.rb)]; }
  return [q.a, Math.max(...q.r)];
}

/** Distance to each group, and the body. */
export function groupDists(prims, p) {
  const c = new Array(GROUPS.length).fill(Infinity), l = [...c], r = [...c], hasSide = new Array(GROUPS.length).fill(false);
  for (const q of prims) {
    const d = primDist(q, p), gi = q.group;
    if (q.side === 0) { c[gi] = smin(c[gi], d, q.k); l[gi] = c[gi]; r[gi] = c[gi]; }
    else { hasSide[gi] = true; if (q.side > 0) l[gi] = smin(l[gi], d, q.k); else r[gi] = smin(r[gi], d, q.k); }
  }
  return c.map((v, gi) => hasSide[gi] ? Math.min(l[gi], r[gi]) : v);
}
export function sdf(prims, p) { return Math.min(...groupDists(prims, p)); }

/** Pack for the GPU: 7 texels (RGBA32F) per primitive; the 7th is its bounding sphere. */
export const TEXELS = 7;
export function pack(prims) {
  const f = new Float32Array(prims.length * TEXELS * 4);
  prims.forEach((q, i) => {
    const o = i * TEXELS * 4;
    const b = q.b || q.a, F = q.F || { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, r = q.r || [1, 1, 1];
    const [bc, br] = boundOf(q);
    f.set([...q.a, q.ra ?? 0, ...b, q.rb ?? 0, q.type, q.group, q.k, q.side || 0, ...F.x, r[0], ...F.y, r[1], ...F.z, r[2], ...bc, br], o);
  });
  return f;
}

/** A bounding sphere per group, for the renderer to skip whole limbs. */
export function groupBounds(prims) {
  return GROUPS.map((_, gi) => {
    const qs = prims.filter((q) => q.group === gi);
    if (!qs.length) return null;
    const pts = [];
    for (const q of qs) {
      const rad = q.type === CONE ? Math.max(q.ra, q.rb) : Math.max(...q.r);
      pts.push([q.a, rad]); if (q.b && q.type === CONE) pts.push([q.b, rad]);
    }
    const c = scale(pts.reduce((s, [p]) => add(s, p), [0, 0, 0]), 1 / pts.length);
    const r = Math.max(...pts.map(([p, rad]) => dist(p, c) + rad)) + Math.max(...qs.map((q) => q.k));
    return { c, r, start: prims.indexOf(qs[0]), end: prims.indexOf(qs[qs.length - 1]) + 1 };
  });
}
