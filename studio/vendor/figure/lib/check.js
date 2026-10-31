// check.js — what a figure-drawing teacher would circle in red, as numbers.
//
// Every check runs in node on the same distance field the renderer draws, so a
// green check means the picture has no such fault, not that some separate
// model hasn't. Each returns { name, ok, value, limit, detail }.
//
//   proportion   crown at `heads`, soles on the ground, left = mirrored right
//   walk         planted feet do not slide, never sink, swing feet clear the
//                ground, every limb reaches, knees bend forward, the pelvis moves smoothly
//   poses        every limb reaches, no limb passes through another, the planted
//                feet touch the ground, a standing pose's weight is over its feet

import { sub, add, scale, dot, dist, norm, len, apply, cross, lerp3 } from './vec.js';
import { makeRig, solve } from './rig.js';
import { buildBody, sdf, groupDists, GROUPS, CONE, RIBBON, primDist, solidified, notOwnArm } from './body.js';
import { walk } from './gait.js';
import { interpenetration } from './settle.js';
export { interpenetration };
import { POSES } from './poses.js';

const r = (name, ok, value, limit, detail = '') => ({ name, ok, value, limit, detail });

/** The height of the highest body surface along a vertical line. */
function surfaceTop(prims, x, z, from = 12) {
  let y = from;
  for (let i = 0; i < 400 && y > -1; i++) { const d = sdf(prims, [x, y, z]); if (d < 1e-4) return y; y -= Math.max(d, 1e-3); }
  return -Infinity;
}
/** The lowest body point, searched on a grid under the feet (the undersides, marched up to). */
function lowest(prims, P) {
  let lo = Infinity;
  for (const s of ['l', 'r']) {
    const c = lerp3(P.J[`heel_${s}`], P.J[`toe_${s}`], 0.5);
    for (let dx = -0.25; dx <= 0.25; dx += 0.05) for (let dz = -0.7; dz <= 0.7; dz += 0.05) {
      // march UP from below the ground: the first surface met is the underside
      let y = -0.5, hit = false;
      for (let i = 0; i < 2000; i++) { const d = sdf(prims, [c[0] + dx, y, c[2] + dz]); if (d < 1e-4) { hit = true; break; } y += Math.max(d, 5e-4); if (y > c[1] + 0.5) break; }
      if (hit) lo = Math.min(lo, y);
    }
  }
  return lo;
}

export function checkProportion(spec) {
  const rig = makeRig(spec), m = rig.m;
  const P = solve(rig, POSES.stand(rig));
  const prims = buildBody(P).filter((q) => q.group < GROUPS.indexOf('hair'));   // the body, not its hair (checkHair has that)
  const crown = surfaceTop(prims, P.J.crown[0], P.J.headPivot[2] - 0.02);
  const sole = lowest(prims, P);
  let asym = 0;
  for (let i = 0; i < 400; i++) {
    const p = [((i * 37) % 23) / 23 * 2 - 1, ((i * 11) % 71) / 71 * m.H, ((i * 7) % 13) / 13 - 0.5];
    asym = Math.max(asym, Math.abs(sdf(prims, p) - sdf(prims, [-p[0], p[1], p[2]])));
  }
  return [
    r('crown height = heads', Math.abs(crown - m.H) < 0.03, +crown.toFixed(3), `${m.H} ± 0.03`),
    r('soles on the ground', Math.abs(sole) < 0.012, +sole.toFixed(4), '0 ± 0.012'),
    r('left mirrors right', asym < 1e-6, asym, '< 1e-6'),
  ];
}

/** The world position of the point a planted foot pivots on, from the SOLVED pose. */
function pivotPoint(P, s, pivot) {
  if (pivot === 'heel') return P.J[`heel_${s}`];
  if (pivot === 'ball') return P.J[`ball_${s}`];
  const F = P.F[`foot_${s}`];
  return add(P.J[`ankle_${s}`], apply(F, P.rig.foot.sole));
}

export function checkWalk(spec, { frames = 96, cycles = 2, opt = {} } = {}) {
  const rig = makeRig(spec), m = rig.m;
  const T = walk(rig, 0, opt).cycle;
  let slip = 0, sink = Infinity, clear = Infinity, unreached = 0, kneeBack = 0, kneeMax = 0;
  const ys = [];
  const plants = { l: null, r: null };
  for (let i = 0; i < frames * cycles; i++) {
    const t = (i / frames) * T;
    const w = walk(rig, t, opt);
    const P = solve(rig, w.pose);
    unreached += P.report.unreached.length;
    ys.push(P.J.pelvis[1]);
    for (const s of ['l', 'r']) {
      const f = w.feet[s];
      const soles = ['heel', 'ball', 'toe'].map((k) => P.J[`${k}_${s}`][1] - (k === 'toe' ? 0.035 * m.k : 0));
      if (f.contact) {
        const p = pivotPoint(P, s, f.pivot);
        // the same footfall keeps the same heel strike point; a new one starts a new plant
        const key = `${f.point[2].toFixed(4)}`;
        if (plants[s] && plants[s].key === key) slip = Math.max(slip, dist([p[0], 0, p[2]], [plants[s].p[0], 0, plants[s].p[2]]) - Math.abs(plants[s].shift));
        if (!plants[s] || plants[s].key !== key) plants[s] = { key, p, shift: 0 };
        // pivots change within a footfall (heel → flat → ball): re-anchor at each change
        if (plants[s].pivot !== f.pivot) { plants[s].p = p; plants[s].pivot = f.pivot; }
        sink = Math.min(sink, Math.min(...soles));
      } else {
        plants[s] = null;
        // mid-swing only: at its ends the foot is leaving or meeting the ground on purpose
        if (f.swing > 0.15 && f.swing < 0.85) clear = Math.min(clear, Math.min(...soles));
      }
      // knee: flexion angle, and it must bend toward the toes
      const H = P.J[`hip_${s}`], K = P.J[`knee_${s}`], A = P.J[`ankle_${s}`];
      const flex = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(H, K)), norm(sub(A, K))))));
      kneeMax = Math.max(kneeMax, flex);
      const mid = lerp3(H, A, 0.5), fwd = P.F[`foot_${s}`].z;
      if (flex > 0.05 && dot(sub(K, mid), fwd) < -1e-6) kneeBack++;
    }
  }
  // the pelvis path: its bob, and how smoothly it moves (largest second difference per frame²)
  const bob = Math.max(...ys) - Math.min(...ys);
  let jerk = 0;
  for (let i = 1; i < ys.length - 1; i++) jerk = Math.max(jerk, Math.abs(ys[i + 1] - 2 * ys[i] + ys[i - 1]) * frames * frames / (T * T));
  return [
    r('planted feet do not slide', slip < 1e-6, slip, '< 1e-6 heads'),
    r('stance feet do not sink', sink > -1e-4, +sink.toFixed(5), '> −1e-4'),
    r('swing feet clear the ground', clear > 0.01, +clear.toFixed(4), '> 0.01 heads, mid-swing'),
    r('every limb reaches', unreached === 0, unreached, '0 frames'),
    r('knees bend forward', kneeBack === 0, kneeBack, '0 frames'),
    r('knee flexion in range', kneeMax < 1.31, +(kneeMax * 180 / Math.PI).toFixed(1), '< 75° (a walk peaks near 65°)'),
    r('pelvis bob', bob > 0.04 * m.k && bob < 0.25 * m.k, +bob.toFixed(3), `${(0.04 * m.k).toFixed(2)}–${(0.25 * m.k).toFixed(2)} heads`),
    r('pelvis moves smoothly', jerk < 20 * m.k, +jerk.toFixed(2), `< ${(20 * m.k).toFixed(1)} heads/s² vertical (≈ 0.5 g)`),
  ];
}

/** Volume-weighted centre of the primitives (overlaps counted twice: a guide, not a scale). */
export function centreOfMass(prims) {
  let M = 0, c = [0, 0, 0];
  for (const q of prims) {
    if (q.group >= 6) continue;                 // hair weighs next to nothing: it does not move the balance
    let vol, p;
    if (q.type === CONE) { const L = dist(q.a, q.b); vol = (Math.PI * L * (q.ra * q.ra + q.ra * q.rb + q.rb * q.rb)) / 3 + (2 / 3) * Math.PI * (q.ra ** 3 + q.rb ** 3); p = lerp3(q.a, q.b, 0.5); }
    else { vol = (4 / 3) * Math.PI * q.r[0] * q.r[1] * q.r[2]; p = q.a; }
    M += vol; c = add(c, scale(p, vol));
  }
  return scale(c, 1 / M);
}
function hull(pts) {
  pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (up.length >= 2 && x(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Signed distance from a ground point to the support polygon's edge (+ inside). */
function supportMargin(poly, p) {
  let inside = true, dmin = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const e = [b[0] - a[0], b[1] - a[1]], w = [p[0] - a[0], p[1] - a[1]];
    const cr = e[0] * w[1] - e[1] * w[0];
    if (cr < 0) inside = false;
    const t = Math.max(0, Math.min(1, (w[0] * e[0] + w[1] * e[1]) / (e[0] ** 2 + e[1] ** 2)));
    dmin = Math.min(dmin, Math.hypot(w[0] - e[0] * t, w[1] - e[1] * t));
  }
  return inside ? dmin : -dmin;
}

// which named poses stand on their feet (and so must balance over them)
export const STANDING = ['stand', 'contrapposto', 'handOnHip', 'reachUp', 'crouch', 'lookBack'];

/**
 * A foot points to the front of its shin. With the knee bent, the thigh squared against
 * the shin IS the shin's front, so the heel-to-toe line must lean that way (a knee bent
 * past 90° once flipped the foot to point back up the thigh). A straight leg is skipped.
 */
export function toesForward(P) {
  let worst = 1;
  for (const s of ['l', 'r']) {
    const H = P.J[`hip_${s}`], K = P.J[`knee_${s}`], A = P.J[`ankle_${s}`];
    const shin = norm(sub(A, K)), thigh = norm(sub(K, H));
    const front = sub(thigh, scale(shin, dot(thigh, shin)));
    if (len(front) < 0.2) continue;                               // under ~12° of bend
    worst = Math.min(worst, dot(norm(sub(P.J[`ball_${s}`], P.J[`heel_${s}`])), norm(front)));
  }
  return [worst > 0, +worst.toFixed(3), '> 0 (foot · the shin\'s front)'];
}

// A named pose on a body is solved once per spec, not once per check: the placed-hand poses
// seat their hands with several full body builds, and three checks walk every pose.
let poseCache = { key: null, poses: new Map() };
export function posed(rig, name) {
  const key = JSON.stringify(rig.spec);
  if (poseCache.key !== key) poseCache = { key, poses: new Map() };
  if (!poseCache.poses.has(name)) poseCache.poses.set(name, POSES[name](rig));
  return poseCache.poses.get(name);
}

export function checkPoses(spec) {
  const rig = makeRig(spec), m = rig.m;
  const out = [];
  for (const name of Object.keys(POSES)) {
    const pose = posed(rig, name);
    const P = solve(rig, pose);
    const prims = buildBody(P);
    out.push(r(`${name}: every limb reaches`, !P.report.unreached.length, P.report.unreached.map((u) => `${u.limb} ${u.short.toFixed(3)}`).join(', ') || 'yes', 'all'));
    // a placed hand rests ON the body: its palm may press in by its own softness, no more
    const pen = interpenetration(prims);
    const wrists = ['l', 'r'].map((s) => P.report[`wrist_${s}`] || 0);
    out.push(r(`${name}: wrists bend within reach`, Math.max(...wrists) < 1.4, +(Math.max(...wrists) * 180 / Math.PI).toFixed(0), '< 80°'));
    out.push(r(`${name}: no limb through another`, pen.depth < 0.04 * m.k, +pen.depth.toFixed(3), `< ${(0.04 * m.k).toFixed(2)} heads`, pen.part ? `${pen.part} into ${pen.into}` : ''));
    out.push(r(`${name}: toes forward of the shin`, ...toesForward(P)));
    const planted = ['l', 'r'].filter((s) => pose.legs?.[s]?.at);
    if (planted.length) {
      const miss = planted.length ? Math.max(...planted.map((s) => { const L = pose.legs[s]; return Math.abs(pivotPoint(P, s, L.pivot === 'heel' || L.pivot === 'ball' ? L.pivot : 'flat')[1]); })) : 0;
      out.push(r(`${name}: planted feet on the ground`, miss < 1e-3, +miss.toFixed(4), '< 1e-3'));
    }
    if (STANDING.includes(name)) {
      const pts = [];
      for (const s of planted) {
        const L = pose.legs[s];
        const ks = L.pivot === 'ball' ? ['ball', 'toe'] : L.pivot === 'heel' ? ['heel'] : ['heel', 'ball', 'toe'];
        for (const k of ks) { const p = P.J[`${k}_${s}`]; pts.push([p[0] + 0.12 * m.wide, p[2]], [p[0] - 0.12 * m.wide, p[2]]); }
      }
      const com = centreOfMass(prims);
      const margin = pts.length >= 3 ? supportMargin(hull(pts), [com[0], com[2]]) : -1;
      out.push(r(`${name}: weight over the feet`, margin > 0, +margin.toFixed(3), '> 0 (inside the support)'));
    }
  }
  return out;
}

export function checkAll(spec) {
  const out = { proportion: checkProportion(spec), silhouette: [...checkSilhouette(spec), ...checkForm(spec)], walk: checkWalk(spec), poses: checkPoses(spec) };
  if (spec.face) out.face = checkFace(spec);
  if (spec.hair) out.hair = checkHair(spec);
  if (spec.outfit) out.clothes = checkClothes(spec);
  out.hands = checkHands(spec);
  return out;
}

// ---- faces ---------------------------------------------------------------------------
import { resolveFace, eyeOutline, browLine, lids, EXPRESSIONS } from './face.js';
import { blendExpressions } from './liveface.js';

/**
 * The face's layout, for one identity under every expression:
 *   eyes on the front of the face (their surface faces forward, not round the side),
 *   eyes apart, brows clear of the eyes (with the lashes), the mouth between nose and chin.
 */
export function checkFace(spec) {
  const rig = makeRig({ ...spec, face: spec.face || {} }), m = rig.m;
  const P = solve(rig, POSES.stand(rig));
  const head = buildBody(P).filter((q) => q.group === GROUPS.indexOf('head'));
  const toWorld = (l) => add(P.J.headPivot, apply(P.F.head, l));
  // the front surface along the head's forward axis at face point (u, v), and how squarely it faces forward
  const facing = (u, v) => {
    let z = 0.9;
    const y = v - m.head.pivotUp;
    for (let i = 0; i < 80; i++) { const d = sdf(head, toWorld([u, y, z])); if (Math.abs(d) < 1e-5) break; z -= d; if (z < -0.5) return -1; }
    const e = 1e-4, p = [u, y, z];
    const g = [0, 1, 2].map((k) => { const a = [...p], b = [...p]; a[k] += e; b[k] -= e; return sdf(head, toWorld(a)) - sdf(head, toWorld(b)); });
    const n = apply(P.F.head, g); const L = Math.hypot(...n);
    return dot(n, P.F.head.z) / L;
  };
  let worstFacing = 1, worstGap = Infinity, worstBrow = Infinity, mouthOk = true, where = {};
  // every expression, and every one half turned into every other (a face alive passes
  // through them all, liveface.js), and half a blink
  const names = Object.keys(EXPRESSIONS);
  const states = [...names.map((n) => [n, n]), ...names.flatMap((a, i) => names.slice(i + 1).map((b) => [`${a}→${b}`, blendExpressions([[a, 1], [b, 1]])])), ['smile, half a blink', { ...EXPRESSIONS.smile, blink: 0.5 }]];
  for (const [ex, e] of states) {
    const p = resolveFace(spec.face || {}, e);
    for (const side of [1, -1]) {
      const o = eyeOutline(p, side, 120);
      for (const [u, v] of [...o.top, ...o.bot]) { const f = facing(u, v); if (f < worstFacing) { worstFacing = f; where.facing = ex; } }
      // the brow above the lash line (the lash is at most ~0.03 above the lid)
      const top = o.top;
      for (const [bu, bv] of browLine(p, side, 40)) {
        let near = null;
        for (const t of top) if (!near || Math.abs(t[0] - bu) < Math.abs(near[0] - bu)) near = t;
        const us = top.map(([u]) => u), over = bu >= Math.min(...us) && bu <= Math.max(...us);   // only where the brow is over the eye
        if (over && Math.abs(near[0] - bu) < p.eyeW * 0.3) { const gap = bv - near[1] - 0.03 * p.lash; if (gap < worstBrow) { worstBrow = gap; where.brow = ex; } }
      }
    }
    const inner = Math.min(...eyeOutline(p, 1).top.map(([u]) => u), ...eyeOutline(p, 1).bot.map(([u]) => u));
    worstGap = Math.min(worstGap, 2 * inner);
    const mouthBottom = p.mouthV - p.mouthOpen * 0.07 - 0.01, mouthTop = p.mouthV + p.mouthOpen * 0.01 + 0.01;
    if (!(mouthBottom > 0.02 && mouthTop < p.noseV - 0.04)) { mouthOk = false; where.mouth = ex; }
  }
  const p0 = resolveFace(spec.face || {}, 'neutral');
  return [
    r('face: eyes on the front of the face', worstFacing > 0.45, +worstFacing.toFixed(3), '> 0.45 (normal · forward)', where.facing ? `worst: ${where.facing}` : ''),
    r('face: the eyes stand apart', worstGap > p0.eyeW * 0.9, +worstGap.toFixed(3), `> ${(p0.eyeW * 0.9).toFixed(3)} (0.9 eye widths)`),
    r('face: brows clear the eyes', worstBrow > 0.01, +worstBrow.toFixed(3), '> 0.01 heads, every expression', where.brow ? `closest: ${where.brow}` : ''),
    r('face: mouth between nose and chin', mouthOk, mouthOk ? 'yes' : 'no', 'every expression', where.mouth || ''),
  ];
}

// ---- the silhouette ------------------------------------------------------------------

import REF from './ansur2.js';

/** The body's side-view depth at height y, arms left out: torso and legs only. */
export function depthAt(prims, y) {
  const keep = new Set(['torso', 'leg_l', 'leg_r'].map((g) => GROUPS.indexOf(g)));
  const qs = prims.filter((q) => keep.has(q.group));
  const near = (Z) => { let d = Infinity; for (let x = -0.9; x <= 0.9; x += 0.04) d = Math.min(d, sdf(qs, [x, y, Z])); return d; };
  const edge = (dir) => { let z = 2.5 * dir; for (let i = 0; i < 200; i++) { const d = near(z); if (d < 0.004) return z; z -= dir * Math.max(d * 0.9, 0.004); if (z * dir < -1) return 0; } return z; };
  return edge(1) - edge(-1);
}

/** The body's front-view width at height y, arms left out: torso and legs only. */
export function widthAt(prims, y) {
  const keep = new Set(['torso', 'leg_l', 'leg_r'].map((g) => GROUPS.indexOf(g)));
  const qs = prims.filter((q) => keep.has(q.group));
  // the nearest the body comes to the line x = X at height y, over its depth
  const near = (X) => { let d = Infinity; for (let z = -0.9; z <= 0.9; z += 0.04) d = Math.min(d, sdf(qs, [X, y, z])); return d; };
  // march in from each side, by the distance field's own step
  const edge = (dir) => { let x = 2.5 * dir; for (let i = 0; i < 200; i++) { const d = near(x); if (d < 0.004) return x; x -= dir * Math.max(d * 0.9, 0.004); if (x * dir < 0) return 0; } return x; };
  return edge(1) - edge(-1);
}

/**
 * Waist, hips and shoulders read off the silhouette, and whether they say what
 * the spec says: a feminine frame has a waist well in from its hips (a
 * waist-to-hip ratio under 0.8) and hips about as wide as its ribcage; a
 * masculine one has almost no waist (over 0.83) and shoulders wider than
 * its hips.
 */
export function checkSilhouette(spec) {
  const rig = makeRig(spec), m = rig.m;
  const P = solve(rig, POSES.stand(rig));
  const prims = buildBody(P);
  const scan = (a, b, pick) => { let best = null; for (let y = a; y <= b; y += 0.02 * m.k) { const w = widthAt(prims, y); if (!best || pick(w, best.w)) best = { y, w }; } return best; };
  const waist = scan(rig.waistY - 0.35 * m.k, rig.chestY - 0.2 * m.k, (a, b) => a < b);
  const hip = scan(m.hipY - 0.45 * m.k, rig.waistY - 0.2 * m.k, (a, b) => a > b);
  const chest = widthAt(prims, rig.chestY);
  const shoulders = widthAt(prims, m.shoulderY - 0.12 * m.k);        // across the deltoids (the arms left out)
  const whr = waist.w / hip.w, hc = hip.w / chest, sh = shoulders / hip.w;
  const fe = m.spec.femme;
  const out = [r('silhouette: waist and hips measured', waist.w > 0 && hip.w > waist.w * 0.9, `waist ${waist.w.toFixed(2)} · hips ${hip.w.toFixed(2)} · ribcage ${chest.toFixed(2)}`, 'heads, front view, arms left out')];
  // children, and chibi drawn like them, do not differ by sex in silhouette: judge from 5 heads up
  if (m.H < 5) return out;
  // the depths, from the side: waist, the buttocks' furthest, the chest's furthest
  const waistD = depthAt(prims, waist.y);
  let buttD = 0; for (let y = m.hipY - 0.35 * m.k; y <= m.hipY + 0.15 * m.k; y += 0.03 * m.k) buttD = Math.max(buttD, depthAt(prims, y));
  let chestD = 0; for (let y = rig.chestY - 0.4 * m.k; y <= rig.chestY + 0.3 * m.k; y += 0.03 * m.k) chestD = Math.max(chestD, depthAt(prims, y));
  const sex = fe >= 0.5 ? 'female' : 'male', R = REF[sex];
  // people's range (ANSUR II, 5th–95th percentile), widened where anime exaggerates
  const band = (name, v, [lo, med, hi], allow = [0, 0]) => r(`silhouette: ${name}`, v > lo - allow[0] && v < hi + allow[1], +v.toFixed(3), `${(lo - allow[0]).toFixed(2)}–${(hi + allow[1]).toFixed(2)} (people ${lo}–${hi}, median ${med}${allow[0] || allow[1] ? '; anime allowance' : ''})`);
  if (fe >= 0.6 || fe <= 0.1) {
    out.push(band(`waist to hips, ${sex} (WHR)`, whr, R.waist_to_hip_breadth, fe >= 0.6 ? [0.1, 0] : [0.02, 0]));
    out.push(band(`shoulders to hips, ${sex}`, sh, R.bideltoid_to_hip_breadth, [0.08, 0.2]));
    out.push(band(`buttocks to waist, in depth`, buttD / waistD, R.buttock_to_waist_depth, [0.05, 0.15]));
    out.push(band(`chest to waist, in depth`, chestD / waistD, R.chest_to_waist_depth, [0.05, fe >= 0.6 ? 0.3 : 0.05]));
  }
  return out;
}

// ---- hair ----------------------------------------------------------------------------
import { HAIR_GROUPS } from './body.js';
import { buildHair } from './hair.js';
import { eyeOutline as _eyes } from './face.js';

/**
 * The hair, on a standing figure: kept off the skin, clear of the eyes (the
 * bangs frame them, they do not cover them), mirror-symmetric when the style
 * is, and hanging where it should.
 */
export function checkHair(spec) {
  const rig = makeRig({ ...spec, face: spec.face || {} }), m = rig.m;
  const P = solve(rig, POSES.stand(rig));
  const prims = buildBody(P);
  const hair = prims.filter((q) => HAIR_GROUPS.has(q.group));
  const skin = prims.filter((q) => q.group === GROUPS.indexOf('head') || q.group === GROUPS.indexOf('torso'));
  const out = [];
  // 1. off the skin: every lock point (but the roots, which grow from it) outside the head and torso
  let deepest = 0, where = '';
  for (const q of hair) {
    if ((q.type !== CONE && q.type !== RIBBON) || /_0$/.test(q.name)) continue;
    const thick = q.type === RIBBON ? q.rb * q.r[0] : q.rb;   // a ribbon lies flat: its thickness faces the skin
    for (const p of [q.b, lerp3(q.a, q.b, 0.5)]) { const d = sdf(skin, p) - thick; if (-d > deepest) { deepest = -d; where = q.name; } }
  }
  out.push(r('hair: off the head and body', deepest < 0.02, +deepest.toFixed(3), '< 0.02 heads', where));
  // 2. the eyes seen through the bangs: straight-on rays at each eye's iris and corners hit the face first
  const O = P.J.headPivot, F = P.F.head, pu = m.head.pivotUp;
  let blocked = 0, total = 0;
  for (const side of [1, -1]) {
    const o = _eyes(P.face, side, 8);
    const pts = [o.top[4], o.bot[4], o.top[2], o.top[6], [(o.top[4][0] + o.bot[4][0]) / 2, (o.top[4][1] + o.bot[4][1]) / 2]];
    for (const [u, v] of pts) {
      total++;
      const start = add(O, apply(F, [u, v - pu, 1.5]));
      let t = 0, hitHair = false;
      for (let i = 0; i < 300; i++) {
        const p = add(start, scale(F.z, -t));
        const dh = sdf(hair, p), ds = sdf(skin, p);
        if (dh < 1e-3) { hitHair = true; break; }
        if (ds < 1e-3) break;
        t += Math.max(1e-3, Math.min(dh, ds) * 0.9);
        if (t > 3) break;
      }
      if (hitHair) blocked++;
    }
  }
  out.push(r('hair: the eyes show through the bangs', blocked === 0, `${total - blocked}/${total} eye points visible`, 'all'));
  // 3. symmetric styles are symmetric
  const asymStyle = spec.hair.bangs === 'swept' || (spec.hair.extras || []).includes('ahoge');
  if (!asymStyle) {
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      const p = add(O, [((i * 37) % 41) / 41 * 2 - 1, ((i * 13) % 53) / 53 * 3 - 2.2, ((i * 7) % 29) / 29 * 1.4 - 0.7]);
      worst = Math.max(worst, Math.abs(sdf(hair, p) - sdf(hair, [2 * O[0] - p[0], p[1], p[2]])));
    }
    out.push(r('hair: a symmetric style is mirror-symmetric', worst < 1e-3, +worst.toExponential(1), '< 1e-3'));
  }
  // 4. hanging locks end below where they start
  const built = buildHair(P, spec.hair, skin, { sdf, ellipsoid: (g, c, Fr, rr, k, name) => ({ type: 1, a: c, F: Fr, r: rr, k, name }), cone: (g, a, b, ra, rb, k, name) => ({ type: 0, a, b, ra, rb, k, name }), cappedEllipsoid: (g, c, Fr, rr, n, d, k, name) => ({ type: 2, a: c, F: Fr, r: rr, b: n, rb: d, k, name }) });
  const hang = built.locks.filter((l) => !/ahoge|bang/.test(l.name));
  const up = hang.filter((l) => l.pts.at(-1)[1] > l.pts[0][1] - 0.05);
  out.push(r('hair: the locks hang', !up.length, up.length ? up.map((l) => l.name).join(', ') : `${hang.length} locks`, 'every tip below its root'));
  return out;
}

// ---- the neck, and the smoothness of the legs ----------------------------------------

/** The outer edge of one leg in the front view at height y (the leg's group alone). */
function legEdge(legPrims, y, zc) {
  const near = (X) => { let d = Infinity; for (let z = zc - 0.5; z <= zc + 0.5; z += 0.03) d = Math.min(d, sdf(legPrims, [X, y, z])); return d; };
  let x = 2.5;
  for (let i = 0; i < 200; i++) { const d = near(x); if (d < 0.003) return x; x -= Math.max(d * 0.9, 0.003); if (x < -1) return NaN; }
  return x;
}

/** Count the turns of a profile (local extrema), ignoring wiggles smaller than `tol`. */
export function turns(vals, tol) {
  let n = 0, dir = 0, ref = vals[0];
  for (const v of vals) {
    if (dir >= 0 && v < ref - tol) { if (dir > 0) n++; dir = -1; ref = v; }
    else if (dir <= 0 && v > ref + tol) { if (dir < 0) n++; dir = 1; ref = v; }
    else if ((dir > 0 && v > ref) || (dir < 0 && v < ref)) ref = v;
  }
  return n;
}

/**
 * A neck that shows, and legs whose outline is smooth: the silhouette from the
 * chin down stays neck-narrow for a real stretch before the trapezius flares
 * it into the shoulders; and a leg's outer edge, ankle to hip, turns only where
 * a leg does (the calf out, the knee in, the thigh out), not at every part.
 */
export function checkForm(spec) {
  const rig = makeRig(spec), m = rig.m;
  const P = solve(rig, POSES.stand(rig));
  const prims = buildBody(P).filter((q) => q.group < GROUPS.indexOf('hair'));
  // the neck: from the chin down, until the silhouette passes 1.4× the neck's own diameter
  // (where the trapezius starts to flare it into the shoulders)
  const chin = P.J.chin[1];
  const flare = 2 * m.radii.neck * 1.4;
  let y = chin - 0.02;
  while (y > chin - 1.2 && widthAt(prims, y) < flare) y -= 0.01;
  const shown = chin - y;
  // the left leg's outer edge, ankle to hip
  const leg = prims.filter((q) => q.group === GROUPS.indexOf('leg_l'));
  const zc = P.J.knee_l[2];
  const ys = [], edge = [];
  for (let yy = P.J.ankle_l[1] + 0.05; yy < P.J.hip_l[1] - 0.1; yy += 0.02 * m.k) { const e = legEdge(leg, yy, zc); if (Number.isFinite(e)) { ys.push(yy); edge.push(e); } }
  const nTurns = turns(edge, 0.006 * m.k);
  const kn = Math.pow(m.k, 0.6);
  const [s5, s50, s95] = REF[m.spec.femme >= 0.5 ? 'female' : 'male'].acromion_below_chin;
  const sh = chin - (P.J.shoulder_l[1] + P.J.shoulder_r[1]) / 2;
  return [
    r('form: a neck shows', shown > 0.1 * kn, +shown.toFixed(3), `> ${(0.1 * kn).toFixed(2)} heads, chin to the traps' flare (0.02 was "neckless")`),
    r('form: shoulder line (ANSUR II)', sh > s5 * kn && sh < s95 * kn, +sh.toFixed(3), `${(s5 * kn).toFixed(2)}–${(s95 * kn).toFixed(2)} heads below the chin (people: ${s5}–${s95}, median ${s50})`),
    r('form: legs smooth in outline', nTurns <= 3, nTurns, '≤ 3 turns, ankle to hip (calf, knee, thigh)'),
  ];
}

// ---- clothes -------------------------------------------------------------------------
import { GARMENT_GROUPS } from './body.js';
import { bareParts } from './clothes.js';
import { surfacePoints } from './settle.js';

/**
 * Skin never shows through clothes. For each garment, every body part it covers:
 * sample that part's skin (where it is the body's real surface, inside the
 * garment's hems) and require the point to be inside the cloth. For a skirt, the
 * thighs above its hem likewise. In every pose, and through a walk.
 */
export function checkClothes(spec) {
  const rig = makeRig(spec);
  const bare = new Set(bareParts(spec.outfit));
  const cases = Object.keys(POSES).map((n) => [n, () => posed(rig, n)]);
  const T = walk(rig, 0).cycle;
  for (let i = 0; i < 8; i++) cases.push([`walk ${i}/8`, () => walk(rig, (i / 8) * T).pose]);
  const out = [];
  let worst = { depth: 0 }, samples = 0;
  for (const [name, make] of cases) {
    const P = solve(rig, make());
    const all = buildBody(P);
    const bodyOnly = all.filter((q) => q.group < GROUPS.indexOf('hair'));
    const gIdx = [...GARMENT_GROUPS];
    const worn = all.filter((q) => GARMENT_GROUPS.has(q.group)), wornD = (p) => sdf(worn, p);
    for (const g of gIdx) {
      const cloth = all.filter((q) => q.group === g);
      if (!cloth.length) continue;
      const clothD = (p) => sdf(cloth, p);
      // the parts this garment covers, and the planes it is cut by
      for (const c of cloth) {
        const base = c.name.includes(':') ? c.name.split(':')[1] : null;
        const q = base && bodyOnly.find((b) => b.name === base);
        if (!q) continue;
        for (const p of surfacePoints(q, 10)) {
          // only real skin (not buried in the body's own blend), well inside every hem
          const gd = groupDists(bodyOnly, p);
          if (Math.min(...gd) < -0.004 || gd[q.group] > 0.01) continue;
          if (c.clips.some((cl) => cl && cl[0] * p[0] + cl[1] * p[1] + cl[2] * p[2] - cl[3] > -0.03)) continue;
          samples++;
          const d = clothD(p);
          if (d > worst.depth) worst = { depth: d, part: base, garment: GROUPS[g], pose: name };
        }
      }
      // every part of the torso the garment's own region holds, covered or not, unless the
      // garment leaves it bare on purpose (bareParts: a tank's shoulders): a body part the
      // garment does not know (the bust's lower mass, once) pokes out through the cloth. Skin shows through where it lies outside the cloth, a cover of a part of
      // its own body group is right there, and it is inside that cover's hems (not a
      // hand resting on a shirt, not the bare skin past a hem)
      const own = new Map(cloth.map((c) => [c, c.name.includes(':') ? bodyOnly.find((b) => b.name === c.name.split(':')[1])?.group : undefined]));
      const groups = new Set([...own.values()].filter((x) => x !== undefined));
      const covered = new Set(cloth.map((c) => c.name.split(':')[1]));
      const bodyD = (p) => sdf(bodyOnly, p), e = 1e-3;
      const bodyN = (p) => norm([bodyD([p[0] + e, p[1], p[2]]) - bodyD([p[0] - e, p[1], p[2]]), bodyD([p[0], p[1] + e, p[2]]) - bodyD([p[0], p[1] - e, p[2]]), bodyD([p[0], p[1], p[2] + e]) - bodyD([p[0], p[1], p[2] - e])]);
      const toSkin = (p) => { for (let it = 0; it < 4; it++) { const d0 = bodyD(p), n = bodyN(p); p = [p[0] - n[0] * d0, p[1] - n[1] * d0, p[2] - n[2] * d0]; } return p; };
      for (const q of bodyOnly) {
        // the neck comes out of every neckline: it is what a collar is open for
        if (q.group !== 0 || !groups.has(0) || covered.has(q.name) || bare.has(q.name) || q.name === 'neck' || q.name === 'adamsApple') continue;
        const mine = cloth.filter((c) => own.get(c) === q.group);
        for (const p0 of surfacePoints(q, 8)) {
          // onto the skin itself: a part buried in the blend still shapes the skin over it
          const p = toSkin(p0);
          const gd = groupDists(bodyOnly, p);
          if (Math.abs(bodyD(p)) > 0.003 || gd[q.group] > 0.004) continue;
          const d = wornD(p);
          if (d < 0.004) continue;
          let best = null, bd = Infinity;
          for (const c of mine) { const cd = primDist(c, p); if (cd < bd) { bd = cd; best = c; } }
          if (!best || bd > 0.06) continue;
          if (best.clips.some((cl) => cl && cl[0] * p[0] + cl[1] * p[1] + cl[2] * p[2] - cl[3] > -0.03)) continue;
          // a hole, not a hem: cloth on at least two sides of it
          const n = bodyN(p);
          const t1 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(n, t1);
          const clad = (u, sg) => wornD(toSkin([p[0] + u[0] * sg * 0.06, p[1] + u[1] * sg * 0.06, p[2] + u[2] * sg * 0.06])) < 0;
          if ([[t1, 1], [t1, -1], [t2, 1], [t2, -1]].filter(([u, sg]) => clad(u, sg)).length < 2) continue;
          samples++;
          if (d > worst.depth) worst = { depth: d, part: q.name, garment: GROUPS[g], pose: name };
        }
      }
      // a skirt: the thighs above its hem stay inside it
      const skirt = cloth.find((q) => q.name === 'skirt');
      if (skirt) {
        // held against the skirt as a solid (it is drawn as a shell, and a thigh in it is inside)
        const solid = cloth.map((q) => (q === skirt ? { ...q, r: [q.r[0], q.r[1], 0] } : q));
        const solidD = (p) => sdf(solid, p);
        const hem = skirt.clips[0];
        for (const s of ['l', 'r']) for (const n of [`thigh_${s}0`, `thigh_${s}1`]) {
          // a draped leg (it left the cone) is covered to the drape's own hem, which the
          // cover check above already holds: a mini on a crouch leaves the knee bare
          if (cloth.some((q) => q.name === `bottom:${n}`)) continue;
          const q = bodyOnly.find((b) => b.name === n);
          for (const p of surfacePoints(q, 10)) {
            const gd = groupDists(bodyOnly, p);
            if (Math.min(...gd) < -0.004 || gd[q.group] > 0.01) continue;
            if (hem[0] * p[0] + hem[1] * p[1] + hem[2] * p[2] - hem[3] > -0.04) continue;
            samples++;
            const d = solidD(p);
            if (d > worst.depth) worst = { depth: d, part: n, garment: 'skirt', pose: name };
          }
        }
      }
    }
  }
  out.push(r('clothes: no skin shows through', worst.depth < 0.004, +worst.depth.toFixed(4), `< 0.004 heads, ${samples} skin samples over ${cases.length} poses`, worst.part ? `${worst.part} through ${worst.garment} (${worst.pose})` : ''));
  return out;
}

// ---- hands ---------------------------------------------------------------------------
import { GESTURES, FINGERS, LIMITS, handPose, handMeasures } from './hand.js';
import { RATIO } from './handref.js';

/**
 * The hand, in every gesture and where it rests:
 *   proportion  middle finger longest, index and ring nearly equal, the pinky's tip at
 *               the ring finger's last joint; the hand as long as the face (~0.75 head)
 *   gestures    every joint within its range; no finger through another, nor through
 *               the palm; what the gesture means holds (closed fingers meet the palm,
 *               the thumb's pad is on its mark, a pointing finger is straight)
 *   mirror      the left hand is the right hand's mirror image
 *   placed      a placed hand's fingers lie on what they rest on (not in it, not above it)
 */
export function checkHands(spec) {
  const rig = makeRig(spec), m = rig.m, out = [], M = handMeasures(m), h = m.hand;
  const armUp = (s, gesture) => { const base = POSES.stand(rig); return solve(rig, { ...base, arms: { ...base.arms, [s]: { raise: 1.25, out: 0.25, elbow: 1.35, gesture } } }); };
  const segD = (p, b) => { const ba = sub(b.b, b.a), t = Math.max(0, Math.min(1, dot(sub(p, b.a), ba) / (dot(ba, ba) || 1))); return len(sub(p, add(b.a, scale(ba, t)))) - (b.ra + (b.rb - b.ra) * t); };
  const pts = (b, n = 6) => Array.from({ length: n + 1 }, (_, i) => [add(b.a, scale(sub(b.b, b.a), i / n)), b.ra + (b.rb - b.ra) * i / n]);
  const depthInto = (bones, D) => Math.max(0, ...bones.flatMap((b) => pts(b).map(([p, r]) => r - D(p))));

  // proportion, on the open hand
  {
    const H = handPose(armUp('l', 'open'), 'l'), along = (p) => dot(sub(p, H.A.W), H.A.z) / h;
    const L = Object.fromEntries(FINGERS.map((f) => [f, H.fingers[f].reduce((s, b) => s + dist(b.a, b.b), 0)]));
    const ratio = L.index / L.ring, pinkyGap = along(H.fingers.pinky[2].b) + H.fingers.pinky[2].rb / h - along(H.fingers.ring[1].b);   // the pinky's pad, not its last bone's end
    out.push(r('hands: the middle finger longest', FINGERS.every((f) => L.middle >= L[f]), +(L.middle / h).toFixed(3), 'longest of the four'));
    out.push(r('hands: index to ring (2D:4D)', ratio > 0.9 && ratio < 1.02, +ratio.toFixed(3), '0.90–1.02 (people ~0.95–1.0)'));
    out.push(r("hands: pinky tip at the ring finger's last joint", Math.abs(pinkyGap) < 0.06, +pinkyGap.toFixed(3), '±0.06 hand'));
    // against people (handref.js): each digit's reach against the middle finger's (bones from
    // X-rays), and the thumb's breadth against the index finger's (943 hands)
    const reachOf = (bones) => bones.reduce((s, b) => s + dist(b.a, b.b), 0) + bones[bones.length - 1].rb;
    const midReach = reachOf(H.fingers.middle);
    for (const f of ['index', 'ring', 'pinky']) {
      const v = reachOf(H.fingers[f]) / midReach, want = RATIO.reach[f];
      out.push(r(`hands: ${f} reach, against the middle (Buryanov 2010)`, Math.abs(v - want) < 0.05, +v.toFixed(3), `${(want - 0.05).toFixed(3)}–${(want + 0.05).toFixed(3)} (people ${want.toFixed(3)})`));
    }
    const tr = reachOf(H.thumb.slice(1)) / midReach;
    out.push(r('hands: thumb reach, against the middle finger (Buryanov 2010)', Math.abs(tr - RATIO.reach.thumb) < 0.05, +tr.toFixed(3), `${(RATIO.reach.thumb - 0.05).toFixed(3)}–${(RATIO.reach.thumb + 0.05).toFixed(3)} (people ${RATIO.reach.thumb.toFixed(3)}: its knuckle to its tip)`));
    const tb = H.thumb[1].rb / H.fingers.index[0].rb;
    out.push(r('hands: thumb breadth, against the index (Hsiao 2015)', Math.abs(tb - RATIO.breadth.thumb) < 0.08, +tb.toFixed(3), `${(RATIO.breadth.thumb - 0.08).toFixed(3)}–${(RATIO.breadth.thumb + 0.08).toFixed(3)} (people ${RATIO.breadth.thumb.toFixed(3)}, at its IP joint and the index's middle knuckle)`));
    const pb = H.fingers.pinky[0].rb / H.fingers.index[0].rb;
    out.push(r('hands: little finger breadth, against the index (Hsiao 2015)', Math.abs(pb - RATIO.breadth.pinky) < 0.08, +pb.toFixed(3), `${(RATIO.breadth.pinky - 0.08).toFixed(3)}–${(RATIO.breadth.pinky + 0.08).toFixed(3)} (people ${RATIO.breadth.pinky.toFixed(3)})`));
    if (m.H >= 5) out.push(r('hands: a hand is as long as the face', h / 0.75 > 0.8 && h / 0.75 < 1.15, +(h / 0.75).toFixed(3), '0.80–1.15 of a face (0.75 head; people ~0.9–1.1, a small anime figure\'s hands run small)'));
  }
  // every gesture
  let limits = { worst: 0 }, cross = { d: 0 }, palm = { d: 0 }, meaning = [];
  for (const g of Object.keys(GESTURES)) {
    const P = armUp('l', g), H = handPose(P, 'l'), G = H.gesture;
    for (const f of FINGERS) H.flex[f].forEach((x, j) => {
      const [lo, hi] = [LIMITS.mcp, LIMITS.pip, LIMITS.dip][j], over = Math.max(lo - x, x - hi, 0);
      if (over > limits.worst) limits = { worst: over, where: `${g} ${f} joint ${j + 1}` };
    });
    for (const key of ['opp', 'mcp', 'ip']) { const [lo, hi] = LIMITS.thumb[key], x = H.thumbAngles[key], over = Math.max(lo - x, x - hi, 0); if (over > limits.worst) limits = { worst: over, where: `${g} thumb ${key}` }; }
    const bones = { ...H.fingers, thumb: H.thumb.slice(1) };
    for (const a of Object.keys(bones)) for (const b of Object.keys(bones)) {
      if (a >= b) continue;
      const d = depthInto(bones[a], (p) => Math.min(...bones[b].map((x) => segD(p, x))));
      if (d > cross.d) cross = { d, where: `${g}: ${a} into ${b}` };
    }
    for (const f of [...FINGERS, 'thumb']) {
      const d = depthInto(f === 'thumb' ? H.thumb.slice(2) : H.fingers[f].slice(1), H.palmD);
      if (d > palm.d) palm = { d, where: `${g}: ${f}` };
    }
    // what the gesture means
    if (G.close) for (const f of FINGERS) if (G.fingers[f][0] + G.fingers[f][1] > 2) {
      const tip = H.fingers[f][2].b, gap = H.palmD(tip) - H.fingers[f][2].rb;
      meaning.push([`${g}: ${f} closed on the palm`, gap < 0.08 * h, gap / h]);
    }
    if (G.onto) {
      const [fn, bi, tt = 0.5] = G.onto, bone = H.fingers[fn][bi], tb = H.thumb[2];
      const target = add(bone.a, scale(sub(bone.b, bone.a), tt)), gap = len(sub(tb.b, target)) - (bone.ra + (bone.rb - bone.ra) * tt + tb.rb);
      meaning.push([`${g}: the thumb on the ${fn}`, Math.abs(gap) < 0.03 * h, gap / h]);
    }
    for (const f of FINGERS) if (G.close && G.fingers[f][0] + G.fingers[f][1] < 0.2) {
      const bend = H.flex[f].reduce((a, b) => a + b, 0);
      meaning.push([`${g}: ${f} straight`, bend < 0.15, bend]);
    }
  }
  out.push(r('hands: every joint within its range', limits.worst < 1e-9, +limits.worst.toFixed(3), '0 rad past a limit', limits.where || ''));
  out.push(r('hands: no finger through another', cross.d < 0.2 * M.rTip, +(cross.d / h).toFixed(4), `< ${(0.2 * M.rTip / h).toFixed(4)} hand`, cross.where || ''));
  out.push(r('hands: nothing through the palm', palm.d < 0.2 * M.rTip, +(palm.d / h).toFixed(4), `< ${(0.2 * M.rTip / h).toFixed(4)} hand`, palm.where || ''));
  const bad = meaning.filter(([, ok]) => !ok);
  out.push(r('hands: each gesture means what it says', !bad.length, bad.length ? bad.map(([n, , v]) => `${n} ${v.toFixed(3)}`).join('; ') : meaning.length, 'fists closed, thumbs on their marks, pointing fingers straight'));
  // mirror: the same gesture on each side
  {
    const base = POSES.stand(rig);
    const P = solve(rig, { ...base, root: { ...(base.root || {}), yaw: 0, roll: 0 }, spine: {}, head: {}, arms: { l: { raise: 1.0, out: 0.5, elbow: 1.0, gesture: 'peace' }, r: { raise: 1.0, out: 0.5, elbow: 1.0, gesture: 'peace' } }, legs: { l: { at: [m.hipHalf, 0, 0] }, r: { at: [-m.hipHalf, 0, 0] } } });
    const L = handPose(P, 'l'), R = handPose(P, 'r');
    let worst = 0;
    for (const f of FINGERS) L.fingers[f].forEach((b, j) => { const c = R.fingers[f][j]; worst = Math.max(worst, Math.abs(b.b[0] + c.b[0]), Math.abs(b.b[1] - c.b[1]), Math.abs(b.b[2] - c.b[2])); });
    L.thumb.forEach((b, j) => { const c = R.thumb[j]; worst = Math.max(worst, Math.abs(b.b[0] + c.b[0]), Math.abs(b.b[1] - c.b[1]), Math.abs(b.b[2] - c.b[2])); });
    out.push(r('hands: left mirrors right', worst < 1e-6, +worst.toExponential(1), '< 1e-6 heads'));
  }
  // placed hands rest on what they are placed on
  let rest = { lo: Infinity, hi: -Infinity };
  for (const name of Object.keys(POSES)) {
    const P = solve(rig, posed(rig, name));
    for (const s of ['l', 'r']) {
      if (!P.hands?.[s]?.placed) continue;
      // what the hand was built against (body.js): everything but its own arm, the hair,
      // and (for the left, built first) the right hand
      const all = buildBody(P), own = GROUPS.indexOf(`arm_${s}`), hairG = GROUPS.indexOf('hair');
      const HR = /^(palm|thenar|index\d|middle\d|ring\d|pinky\d|thumb\d)_r$/;
      const scene = solidified(all.filter((q) => notOwnArm(s)(q) && !(q.group >= hairG && q.group <= hairG + 3) && !(s === 'l' && HR.test(q.name))));
      const D = (p) => sdf(scene, p);
      const H = handPose(P, s, { scene: D });
      for (const f of FINGERS) {
        if (H.rest[f] === 'off the edge') { rest.edge = (rest.edge || 0) + 1; continue; }   // curled right round, nothing under it
        const c = Math.min(...H.fingers[f].flatMap((b) => pts(b).map(([p, rr]) => D(p) - rr)));
        if (c < rest.lo) rest.lo = c, rest.loAt = `${name} ${s} ${f}`;
        if (c > rest.hi) rest.hi = c, rest.hiAt = `${name} ${s} ${f}`;
      }
    }
  }
  if (Number.isFinite(rest.lo)) out.push(r('hands: placed fingers rest on the surface', rest.lo > -0.015 * m.k && rest.hi < 0.03 * m.k, `${rest.lo.toFixed(3)}…${rest.hi.toFixed(3)}`, `−${(0.015 * m.k).toFixed(3)}…${(0.03 * m.k).toFixed(3)} heads (in … above)${rest.edge ? `; ${rest.edge} off an edge` : ''}`, rest.lo < -0.015 * m.k ? rest.loAt : rest.hi >= 0.03 * m.k ? rest.hiAt : ''));
  return out;
}

// ---- a dance ---------------------------------------------------------------------------
import { compileDance, liveDance } from './choreo.js';


/**
 * A dance, frame by frame (choreo.js): does the body hold up through all of it?
 *   planted feet never slide, and no foot goes into the floor
 *   every limb reaches
 *   no limb through another, no skin through the clothes     (sampled: `heavyEvery` frames)
 *   wrists within reach
 * Each check reports its worst value and WHERE it happened: the bar and beat, and the move.
 * `script` is the dance (moves on bars); `opts` go to compileDance (home, facing, mirror).
 */
export function checkDance(spec, script, { fps = 8, bpm = 120, from = 0, to = null, heavyEvery = 4, clothes = true, live = true, seed = 0, ...opts } = {}) {
  const rig = makeRig(spec), m = rig.m;
  const D0 = compileDance(rig, script, opts);
  // what plays is the dance alive (springs and breath over the keyframes): check that
  const D = live ? liveDance(D0, { spb: 60 / bpm, seed, rig }) : D0;
  const lastBeat = D.keys[D.keys.length - 1].beat;
  const b1 = to ?? lastBeat, db = (bpm / 60) / fps;
  const where = (b, k) => `bar ${Math.floor(b / 4)} beat ${(b % 4 + 1).toFixed(2)} (${k.move})`;
  const worst = { slide: { v: 0 }, sink: { v: 0 }, unreached: { v: 0, n: 0 }, pen: { v: 0 }, wrist: { v: 0 }, skin: { v: 0 } };
  let prev = null, frame = 0;
  const bare = new Set(bareParts(spec.outfit));
  for (let b = from; b <= b1 + 1e-9; b += db, frame++) {
    const { pose, key, stepping, plant } = D.at(b);
    const P = solve(rig, pose);
    // planted feet: the contact point stays put from one frame to the next
    for (const s of ['l', 'r']) {
      const c = P.J[`ball_${s}`], h = P.J[`heel_${s}`];
      for (const q of [c, h, P.J[`toe_${s}`]]) if (-q[1] > worst.sink.v) worst.sink = { v: -q[1], at: where(b, key), part: `${s} foot` };
      const same = plant[s] && prev?.plant[s] && plant[s][0] === prev.plant[s][0] && plant[s][2] === prev.plant[s][2];
      if (same) {
        const d = Math.max(Math.hypot(c[0] - prev.J[`ball_${s}`][0], c[2] - prev.J[`ball_${s}`][2]), Math.hypot(h[0] - prev.J[`heel_${s}`][0], h[2] - prev.J[`heel_${s}`][2]));
        if (d > worst.slide.v) worst.slide = { v: d, at: where(b, key), part: `${s} foot` };
      }
    }
    if (P.report.unreached.length) { worst.unreached.n++; const u = Math.max(...P.report.unreached.map((x) => x.short)); if (u > worst.unreached.v) worst.unreached = { ...worst.unreached, v: u, at: where(b, key), part: P.report.unreached[0].limb }; }
    for (const s of ['l', 'r']) { const w = P.report[`wrist_${s}`] || 0; if (w > worst.wrist.v) worst.wrist = { v: w, at: where(b, key), part: `${s} wrist` }; }
    if (frame % heavyEvery === 0) {
      const prims = buildBody(P);
      const pen = interpenetration(prims);
      if (pen.depth > worst.pen.v) worst.pen = { v: pen.depth, at: where(b, key), part: pen.part ? `${pen.part} into ${pen.into}` : '' };
      if (clothes && spec.outfit) {
        const bodyOnly = prims.filter((q) => q.group < GROUPS.indexOf('hair'));
        for (const g of GARMENT_GROUPS) {
          const cloth = prims.filter((q) => q.group === g);
          for (const c of cloth) {
            const base = c.name.includes(':') ? c.name.split(':')[1] : null;
            const q = base && !bare.has(base) && bodyOnly.find((x) => x.name === base);
            if (!q) continue;
            for (const p of surfacePoints(q, 6)) {
              const gd = groupDists(bodyOnly, p);
              if (Math.min(...gd) < -0.004 || gd[q.group] > 0.01) continue;
              if (c.clips.some((cl) => cl && cl[0] * p[0] + cl[1] * p[1] + cl[2] * p[2] - cl[3] > -0.03)) continue;
              const d = sdf(cloth, p);
              if (d > worst.skin.v) worst.skin = { v: d, at: where(b, key), part: `${base} through ${GROUPS[g]}` };
            }
          }
        }
      }
    }
    prev = { J: P.J, stepping, plant };
  }
  const k = m.k, out = [];
  const say = (w) => (w.at ? `${w.part} · ${w.at}` : '');
  out.push(r('dance: planted feet never slide', worst.slide.v < 1e-3, +worst.slide.v.toFixed(4), '< 0.001 heads a frame', say(worst.slide)));
  out.push(r('dance: no foot into the floor', worst.sink.v < 0.01, +worst.sink.v.toFixed(4), '< 0.01 heads', say(worst.sink)));
  out.push(r('dance: every limb reaches', worst.unreached.n === 0, worst.unreached.n ? `${worst.unreached.n} frames, worst ${worst.unreached.v.toFixed(3)}` : 'yes', 'all frames', say(worst.unreached)));
  out.push(r('dance: wrists bend within reach', worst.wrist.v < 1.4, +(worst.wrist.v * 180 / Math.PI).toFixed(0), '< 80°', say(worst.wrist)));
  out.push(r('dance: no limb through another', worst.pen.v < 0.04 * k, +worst.pen.v.toFixed(3), `< ${(0.04 * k).toFixed(2)} heads`, say(worst.pen)));
  if (clothes && spec.outfit) out.push(r('dance: no skin through the clothes', worst.skin.v < 0.004, +worst.skin.v.toFixed(4), '< 0.004 heads', say(worst.skin)));
  if (live) out.push(...motionChecks(D0, D, bpm));
  out.frames = frame;
  return out;
}

/**
 * The motion itself, not only the poses: does it move like a body?
 *   hits pop past their mark and settle (a puppet arrives dead on, a body overshoots)
 *   the forearm trails the upper arm (overlap: parts do not all move at once)
 */
function motionChecks(D0, D, bpm) {
  const spb = 60 / bpm, out = [];
  const series = (fn, a, b, step) => { const xs = []; for (let t = a; t <= b + 1e-9; t += step) xs.push(fn(t)); return xs; };
  let hits = 0, good = 0, worst = null;
  let arms = 0, trailing = 0, lags = [];
  for (let i = 1; i < D0.keys.length; i++) {
    const A = D0.keys[i - 1], B = D0.keys[i];
    for (const s of ['l', 'r']) {
      // a snug arrival (a hand brought against the face or body) comes in without springs, by design
      if (B.snug?.[s] || A.snug?.[s]) continue;
      const dr = B.arms[s].raise - A.arms[s].raise, de = B.arms[s].elbow - A.arms[s].elbow;
      // (an arm coming down to the side stops AT the body: it has no pop to give)
      if (B.ease === 'hit' && Math.abs(dr) > 0.35 && !(dr < 0 && B.arms[s].raise < 0.8)) {
        // from the key to a beat after it: how far past the mark, and how close by the end
        // until the next keyframe (at most a beat): past the mark, and how close at the end
        // only a HELD hit can settle: it is held until the keyframe before the arm next changes
        let j = i + 1;
        while (j + 1 < D0.keys.length && Math.abs(D0.keys[j + 1].arms[s].raise - B.arms[s].raise) < 1e-6 && Math.abs(D0.keys[j].arms[s].raise - B.arms[s].raise) < 1e-6) j++;
        const holdEnd = j < D0.keys.length && Math.abs(D0.keys[j].arms[s].raise - B.arms[s].raise) < 1e-6 ? D0.keys[j].beat : j < D0.keys.length ? B.beat + 0 : B.beat + 1;
        const end = Math.min(B.beat + 1, j >= D0.keys.length ? B.beat + 1 : holdEnd);
        if (end - B.beat < 0.5) continue;
        // (a hit's path arrives early, so its pop can come before the key's beat: from the move's start)
        const xs = series((b) => D.at(b).pose.arms[s].raise, A.beat, end, 0.05);
        const past = Math.max(...xs.map((x) => (x - B.arms[s].raise) * Math.sign(dr))) / Math.abs(dr);
        const settled = Math.abs(xs[xs.length - 1] - B.arms[s].raise) / Math.abs(dr);
        hits++;
        if (past > 0.02 && past < 0.25 && settled < 0.05) good++;
        else if (!worst) worst = `${A.move}→${B.move} at bar ${Math.floor(B.beat / 4)}: past ${(past * 100).toFixed(0)}%, off ${(settled * 100).toFixed(0)}% a beat later`;
      }
      if (Math.abs(dr) > 0.5 && Math.abs(de) > 0.3) {
        // the time each channel crosses half its move
        const half = (get, from, to) => { for (let b = A.beat; b <= B.beat + 1; b += 0.02) if ((get(b) - from) / (to - from) >= 0.5) return b * spb; return null; };
        const tr = half((b) => D.at(b).pose.arms[s].raise, A.arms[s].raise, B.arms[s].raise);
        const te = half((b) => D.at(b).pose.arms[s].elbow, A.arms[s].elbow, B.arms[s].elbow);
        if (tr == null || te == null) continue;
        arms++; lags.push(te - tr);
        if (te - tr > 0.02 && te - tr < 0.25) trailing++;
      }
    }
  }
  out.push(r('motion: hits pop past their mark and settle', hits === 0 || good / hits >= 0.9, `${good}/${hits}`, '≥ 90%: past it by 2–25% of the move, within 5% a beat later', worst || ''));
  const med = lags.sort((a, b) => a - b)[Math.floor(lags.length / 2)] ?? 0;
  out.push(r('motion: the forearm trails the upper arm', arms === 0 || trailing / arms >= 0.8, `${trailing}/${arms}`, '≥ 80% of big arm moves: the elbow reaches half its move 0.02–0.25 s after the shoulder', `median lag ${(med * 1000).toFixed(0)} ms`));
  return out;
}
