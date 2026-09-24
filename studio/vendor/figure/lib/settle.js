// settle.js — the solvers that turn a pose's intent into a pose that holds up.
//
// A pose written for one body does not fit another: a hand meant to rest on
// the hip goes into it, feet placed for long legs cannot be reached by short
// ones, a big-headed figure reaching up tips over. So poses state intent and
// these make it true, on the body's own distance field:
//
//   onSurface  a point on a body group's surface near a guess, and its normal
//   settle     lower the pelvis until every planted foot is within reach
//   balance    shift the pelvis until the centre of mass is over the support
//   clearArms  swing relaxed (angle-posed) arms out until they clear the body

import { add, sub, scale, norm, dot, cross, len, lerp3 } from './vec.js';
import { solve, ankleFor } from './rig.js';
import { buildBody, groupDists, GROUPS, solidified, notOwnArm, sdf } from './body.js';

const gi = (name) => GROUPS.indexOf(name);

/** Walk from `guess` onto the surface of `group`: { p, n }. */
export function onSurface(prims, group, guess, also = null) {
  const g = gi(group);
  const d = also ? (q) => Math.min(groupDists(prims, q)[g], also(q)) : (q) => groupDists(prims, q)[g];
  let p = guess;
  for (let i = 0; i < 40; i++) {
    const e = 1e-4;
    const n = norm([d(add(p, [e, 0, 0])) - d(sub(p, [e, 0, 0])), d(add(p, [0, e, 0])) - d(sub(p, [0, e, 0])), d(add(p, [0, 0, e])) - d(sub(p, [0, 0, e]))]);
    const dist = d(p);
    if (Math.abs(dist) < 1e-5) return { p, n };
    p = sub(p, scale(n, dist));
  }
  const e = 1e-4;
  return { p, n: norm([d(add(p, [e, 0, 0])) - d(sub(p, [e, 0, 0])), d(add(p, [0, e, 0])) - d(sub(p, [0, e, 0])), d(add(p, [0, 0, e])) - d(sub(p, [0, 0, e]))]) };
}

/** Lower the pelvis until every planted foot is within `straight` of full reach. */
export function settle(rig, pose, straight = 0.985) {
  // (straight: the most a planted leg may unbend, of its full length)
  const m = rig.m;
  const P = solve(rig, pose);
  let y = P.J.pelvis[1];
  const reach = straight * (m.thighLen + m.shinLen);
  for (const s of ['l', 'r']) {
    const L = pose.legs?.[s];
    if (!L?.at) continue;
    const A = ankleFor(rig, L.at, L.yaw ?? (pose.root?.yaw || 0), L.pitch || 0, L.pivot || 'flat').ankle;
    const H = P.J[`hip_${s}`], off = sub(H, P.J.pelvis);
    const dx = H[0] - A[0], dz = H[2] - A[2];
    const yMax = A[1] - off[1] + Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz));
    y = Math.min(y, yMax);
  }
  return { ...pose, root: { ...(pose.root || {}), pos: [P.J.pelvis[0], y, P.J.pelvis[2]] } };
}

export function centreOfMass(prims) {
  let M = 0, c = [0, 0, 0];
  for (const q of prims) {
    if (q.group >= 6) continue;                 // hair weighs next to nothing: it does not move the balance
    let vol, p;
    if (q.type === 0) { const L = len(sub(q.a, q.b)); vol = (Math.PI * L * (q.ra * q.ra + q.ra * q.rb + q.rb * q.rb)) / 3 + (2 / 3) * Math.PI * (q.ra ** 3 + q.rb ** 3); p = lerp3(q.a, q.b, 0.5); }
    else { vol = (4 / 3) * Math.PI * q.r[0] * q.r[1] * q.r[2]; p = q.a; }
    M += vol; c = add(c, scale(p, vol));
  }
  return scale(c, 1 / M);
}

/** The ground points a pose stands on. */
export function supportPoints(rig, P, pose) {
  const pts = [];
  for (const s of ['l', 'r']) {
    const L = pose.legs?.[s];
    if (!L?.at) continue;
    const ks = L.pivot === 'ball' ? ['ball', 'toe'] : L.pivot === 'heel' ? ['heel'] : ['heel', 'ball', 'toe'];
    for (const k of ks) { const p = P.J[`${k}_${s}`]; pts.push([p[0] + 0.12 * rig.m.wide, p[2]], [p[0] - 0.12 * rig.m.wide, p[2]]); }
  }
  return pts;
}

/** Shift the pelvis (the feet stay planted) until the weight is over the support (or over one foot). */
export function balance(rig, pose, { toward = 0.8, over = null, straight = 0.985 } = {}) {
  let p = pose;
  for (let i = 0; i < 8; i++) {
    const P = solve(rig, p);
    const com = centreOfMass(buildBody(P, { hair: false, clothes: false }));
    const pts = supportPoints(rig, P, over ? { legs: { [over]: p.legs[over] } } : p);
    if (pts.length < 2) return p;
    const c = pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length], [0, 0]);
    // aim at a point `toward` of the way from the COM's projection to the support's centre
    const dx = (c[0] - com[0]) * toward, dz = (c[1] - com[2]) * toward;
    if (Math.hypot(dx, dz) < 1e-3) break;
    const pos = P.J.pelvis;
    p = settle(rig, { ...p, root: { ...(p.root || {}), pos: [pos[0] + dx, (pose.root?.pos?.[1] ?? rig.rootY), pos[2] + dz] } }, straight);
  }
  return p;
}

/** Sample points on a primitive's surface. */
export function surfacePoints(q, n = 10) {
  const out = [];
  const axes = (d) => { const a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const u = norm(cross(d, a)); return [u, cross(d, u)]; };
  if (q.type === 0) {
    const d = sub(q.b, q.a), L = len(d); const dir = L > 1e-9 ? scale(d, 1 / L) : [0, 1, 0];
    const [u, v] = axes(dir);
    for (let i = 0; i <= 4; i++) { const t = i / 4, c = lerp3(q.a, q.b, t), rad = q.ra + (q.rb - q.ra) * t;
      for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; out.push(add(c, add(scale(u, Math.cos(a) * rad), scale(v, Math.sin(a) * rad)))); } }
  } else {
    for (let i = 1; i < 6; i++) for (let j = 0; j < n; j++) {
      const th = (i / 6) * Math.PI, ph = (j / n) * Math.PI * 2;
      const l = [q.r[0] * Math.sin(th) * Math.cos(ph), q.r[1] * Math.cos(th), q.r[2] * Math.sin(th) * Math.sin(ph)];
      out.push(add(q.a, add(add(scale(q.F.x, l[0]), scale(q.F.y, l[1])), scale(q.F.z, l[2]))));
    }
  }
  return out;
}

// limb roots sit in their sockets by design: they are not penetrations
export const ROOTS = new Set(['upper_l0', 'upper_r0', 'thigh_l0', 'thigh_r0']);

/**
 * The deepest any part of `only` groups (default: the limbs) goes into another
 * group: { depth, part, into }. Only points on the part's own group surface
 * count, not ones buried in its own blend.
 */
export function interpenetration(prims, only = null, parts = null) {
  // a limb's own socket (the hip cap a thigh sits in, the deltoid an arm hangs
  // from) wraps the limb by design: measure each limb against the body without it
  const SOCKET = { leg_l: 'hipcap_l', leg_r: 'hipcap_r', arm_l: 'deltoid_l', arm_r: 'deltoid_r' };
  const without = new Map();
  const bodyFor = (g) => {
    const sock = SOCKET[GROUPS[g]];
    if (!sock) return prims;
    if (!without.has(g)) without.set(g, prims.filter((q) => q.name !== sock));
    return without.get(g);
  };
  let worst = { depth: 0 };
  for (const q of prims) {
    if (ROOTS.has(q.name) || (parts && !parts.test(q.name))) continue;
    if (only ? !only.includes(q.group) : (q.group === gi('torso') || q.group === gi('head') || gi('hair') <= q.group)) continue;
    const body = bodyFor(q.group);
    for (const p of surfacePoints(q)) {
      const gd = groupDists(body, p);
      if (gd[q.group] > 0.01) continue;
      gd.forEach((d, g) => {
        // limbs may pass through hair: it is soft (and a hand seated against long hair once
        // floated off the hip it rested on); garments count when a group is asked about
        if (g === q.group || (g >= gi('hair') && (!only || g <= gi('tail_r')))) return;
        if (-d > worst.depth) worst = { depth: -d, part: q.name, into: GROUPS[g] };
      });
    }
  }
  return worst;
}

/** How far an arm's surface stays from everything else (negative: how deep it goes in). */
function armClearance(rig, pose, s) {
  const prims = buildBody(solve(rig, pose), { hair: false, clothes: false });
  const arm = gi(`arm_${s}`);
  let worst = Infinity;
  // the arm and the hand's mass (not every finger bone: an arm swings clear by its palm)
  for (const q of prims) if (q.group === arm && !ROOTS.has(q.name) && !/^(index|middle|ring|pinky)\d_/.test(q.name)) {
    for (const p of surfacePoints(q, 8)) {
      const gd = groupDists(prims, p);
      if (gd[arm] > 0.01) continue;
      gd.forEach((d, g) => { if (g !== arm && g < gi('hair')) worst = Math.min(worst, d); });
    }
  }
  return worst;
}

/**
 * Arms posed by angle move to the nearest pose that clears the body by `gap`:
 * a small search over (raise, out), so an arm at the side swings out, an arm
 * overhead moves off the head, an arm swung back comes off the back.
 */
export function clearArms(rig, pose, { gap = 0.012 } = {}) {
  let p = pose;
  for (const s of ['l', 'r']) {
    const a = p.arms?.[s];
    if (!a || a.reach || a.hand) continue;
    let cur = armClearance(rig, p, s), step = 0.06;
    for (let i = 0; i < 60 && cur < gap; i++) {
      let best = null;
      for (const [dr, dout] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const arm = { ...p.arms[s], raise: (p.arms[s].raise ?? 0.16) + dr * step, out: (p.arms[s].out ?? 1.35) + dout * step * 2 };
        const q = { ...p, arms: { ...p.arms, [s]: arm } };
        const c = armClearance(rig, q, s);
        if (!best || c > best.c) best = { c, q };
      }
      if (best.c > cur) { p = best.q; cur = best.c; } else step /= 2;
    }
  }
  return p;
}

/**
 * A hand placed on the body: its palm on `group`'s surface near `guess`, the
 * fingers as close to `dir` as the surface allows. Returns the arm spec.
 */
export function handOn(rig, P, group, guess, dir) {
  const prims = buildBody(P, { hair: false });
  // the surface is what the hand will lie on: the body part, and the clothes over it (a
  // skirt as a solid; no sleeve, which is the arm's own). Aimed along the body under a
  // flared skirt, the fingers dug into the flare and the hand was pushed off the hip.
  const cloth = solidified(prims.filter((q) => q.group >= gi('top') && !/:(upper|fore)_[lr]\d$/.test(q.name)));
  const { p, n } = onSurface(prims, group, guess, cloth.length ? (x) => sdf(cloth, x) : null);
  const at = add(p, scale(n, rig.m.radii.hand * 1.1));
  // the fingers tilt a little off the surface: laid flat along a curve they would sink into it
  const d = norm(add(norm(sub(dir, scale(n, dot(dir, n)))), scale(n, 0.3)));
  return { hand: { at, palm: scale(n, -1), dir: d } };
}

/**
 * Push a placed hand out along its palm normal until no part of it is inside the body.
 * The HAND's parts only: a forearm that dips into a jacket is not the hand's to fix, and
 * pushing the hand to clear it once floated hands a full head off the knees they rested on.
 */
const HAND_PARTS = /^(palm|thenar|index\d|middle\d|ring\d|pinky\d|thumb\d)_/;
export function seatHand(rig, pose, s, { gap = 0.004 } = {}) {
  let p = pose;
  for (let i = 0; i < 10; i++) {
    const prims = buildBody(solve(rig, p), { hair: false });
    const keep = notOwnArm(s), own = gi(`arm_${s}`);
    const pen = interpenetration(solidified(prims.filter((q) => q.group === own || keep(q))), [own], HAND_PARTS);
    if (pen.depth <= gap / 2) break;
    const h = p.arms[s].hand, out = scale(h.palm, -1);
    // fingers that go in (past what their own joints can lift: a flared skirt) tip the hand up
    // off the surface, heel of the hand still down; the palm itself going in lifts the hand
    const hand = /^(index|middle|ring|pinky|thumb)\d_/.test(pen.part)
      ? { ...h, dir: norm(add(h.dir, scale(out, Math.min(0.4, 2 * pen.depth / rig.m.hand)))) }
      : { ...h, at: add(h.at, scale(out, pen.depth + gap)) };
    p = { ...p, arms: { ...p.arms, [s]: { ...p.arms[s], hand } } };
  }
  return p;
}
