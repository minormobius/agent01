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
import { buildBody, sdf, groupDists, GROUPS, CONE, primDist } from './body.js';
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
  const prims = buildBody(P);
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

export function checkPoses(spec) {
  const rig = makeRig(spec), m = rig.m;
  const out = [];
  for (const [name, fn] of Object.entries(POSES)) {
    const pose = fn(rig);
    const P = solve(rig, pose);
    const prims = buildBody(P);
    out.push(r(`${name}: every limb reaches`, !P.report.unreached.length, P.report.unreached.map((u) => `${u.limb} ${u.short.toFixed(3)}`).join(', ') || 'yes', 'all'));
    // a placed hand rests ON the body: its palm may press in by its own softness, no more
    const pen = interpenetration(prims);
    const wrists = ['l', 'r'].map((s) => P.report[`wrist_${s}`] || 0);
    out.push(r(`${name}: wrists bend within reach`, Math.max(...wrists) < 1.4, +(Math.max(...wrists) * 180 / Math.PI).toFixed(0), '< 80°'));
    out.push(r(`${name}: no limb through another`, pen.depth < 0.04 * m.k, +pen.depth.toFixed(3), `< ${(0.04 * m.k).toFixed(2)} heads`, pen.part ? `${pen.part} into ${pen.into}` : ''));
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
  const out = { proportion: checkProportion(spec), walk: checkWalk(spec), poses: checkPoses(spec) };
  if (spec.face) out.face = checkFace(spec);
  return out;
}

// ---- faces ---------------------------------------------------------------------------
import { resolveFace, eyeOutline, browLine, lids, EXPRESSIONS } from './face.js';

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
  for (const ex of Object.keys(EXPRESSIONS)) {
    const p = resolveFace(spec.face || {}, ex);
    for (const side of [1, -1]) {
      const o = eyeOutline(p, side, 120);
      for (const [u, v] of [...o.top, ...o.bot]) { const f = facing(u, v); if (f < worstFacing) { worstFacing = f; where.facing = ex; } }
      // the brow above the lash line (the lash is at most ~0.03 above the lid)
      const top = o.top;
      for (const [bu, bv] of browLine(p, side, 40)) {
        let near = null;
        for (const t of top) if (!near || Math.abs(t[0] - bu) < Math.abs(near[0] - bu)) near = t;
        if (Math.abs(near[0] - bu) < p.eyeW * 0.3) { const gap = bv - near[1] - 0.03 * p.lash; if (gap < worstBrow) { worstBrow = gap; where.brow = ex; } }
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
