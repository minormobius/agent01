// biome/sprite/physics.mjs — REAL forward dynamics: a 2D rigid-body walker under gravity, feet UNLOCKED
// (they collide with the ground, they aren't pinned), joints driven by MUSCLE torque. Gravity pulls the
// body down every step; the musculature must actively hold the joints from buckling and push off the
// ground — if it doesn't, the thing falls. Nothing here is scripted kinematics.
//
// Reduced model for stability: trunk (one rigid body, most of the mass) + each leg as thigh + shank
// (2 bodies, 2 joints: hip + knee; the foot is the shank's distal tip, which is what touches the ground).
// 9 bodies, 8 actuated joints, 4 contact points. Integrator: semi-implicit Euler + an XPBD position
// solve for the pin joints and ground contacts (robust — it doesn't explode like stiff springs do).
//
// Muscle capacity per joint comes from the real grown muscles crossing it (Σ force × moment arm per
// side), so "the musculature holds, capped by its strength" is literal — over-command and the joint sags.

import { solve, GAIT } from './render.mjs';
import { segMasses, limbJoints } from './mechanics.mjs';
import { attachPos, momentArm } from './muscle.mjs';

const V = (x, y) => ({ x, y });
const rot = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

export function makeWalker(sprite, muscles, opt = {}) {
  const W = solve(sprite, 0);
  const mass = segMasses(sprite);
  const g = opt.g ?? 1200;                 // gravity (px/s²) — tuned to the skeleton's px scale
  const capScale = opt.capScale ?? 1500;   // muscle caps were sized for the static g=1 solve; rescale to gravity
  const ground = opt.ground ?? null;       // set after build from the rest pose

  // ── build bodies ──────────────────────────────────────────────────────────────────────────────
  const bodies = [];                       // {x,y,a, vx,vy,va, im, ii, len}
  const mk = (cx, cy, a, m, len) => { const I = Math.max(1e-3, m * len * len / 12); bodies.push({ x: cx, y: cy, a, vx: 0, vy: 0, va: 0, im: m > 0 ? 1 / m : 0, ii: I > 0 ? 1 / I : 0, len }); return bodies.length - 1; };

  // trunk: one body carrying every non-leg segment's mass, at their CoM
  let tmx = 0, tmy = 0, tm = 0;
  for (const s of sprite.segs) { if (s.leg) continue; const w = W[s.id], c = V((w.base.x + w.tip.x) / 2, (w.base.y + w.tip.y) / 2); tmx += mass[s.id] * c.x; tmy += mass[s.id] * c.y; tm += mass[s.id]; }
  const trunk = mk(tmx / tm, tmy / tm, 0, Math.max(0.5, tm), 120);

  const legBones = (lp) => lp[0] === 'F' ? ['humerus', 'radioulna', 'metacarpal'] : ['femur', 'tibia', 'metatarsal'];
  const skelJoint = { hip: { F: 'humerus', B: 'femur' }, knee: { F: 'radioulna', B: 'tibia' } };
  const legs = [];
  for (const lp of ['FN', 'FF', 'BN', 'BF']) {
    const bn = legBones(lp);
    const Hp = W[lp + '_' + bn[0]].base;                    // hip / shoulder
    const Kp = W[lp + '_' + bn[1]].base;                    // knee / elbow
    let Fp = null; for (const s of sprite.segs) if (s.id.startsWith(lp + '_k')) { const t = W[s.id].tip; if (!Fp || t.y > Fp.y) Fp = t; } // toe
    if (!Fp) Fp = W[lp + '_' + bn[2]].tip;
    const legMass = lp[0] === 'F' ? 0.05 : 0.06;
    const thighC = V((Hp.x + Kp.x) / 2, (Hp.y + Kp.y) / 2), thighLen = Math.hypot(Kp.x - Hp.x, Kp.y - Hp.y);
    const shankC = V((Kp.x + Fp.x) / 2, (Kp.y + Fp.y) / 2), shankLen = Math.hypot(Fp.x - Kp.x, Fp.y - Kp.y);
    const thigh = mk(thighC.x, thighC.y, Math.atan2(Kp.y - Hp.y, Kp.x - Hp.x), legMass * 0.5, thighLen);
    const shank = mk(shankC.x, shankC.y, Math.atan2(Fp.y - Kp.y, Fp.x - Kp.x), legMass * 0.5, shankLen);
    legs.push({ lp, thigh, shank, Hp, Kp, Fp, thighLen, shankLen });
  }

  // ── pin joints (shared world points) ─────────────────────────────────────────────────────────
  // anchor stored as a body-local offset from the body's com (in the body's rest frame)
  const localOf = (bi, wp) => { const b = bodies[bi]; return rot(V(wp.x - b.x, wp.y - b.y), -b.a); };
  const joints = [];                       // {a,b, la, lb, kind, name, capPos, capNeg, target0, q0}
  for (const L of legs) {
    joints.push({ a: trunk, b: L.thigh, la: localOf(trunk, L.Hp), lb: localOf(L.thigh, L.Hp), leg: L, kind: 'hip' });
    joints.push({ a: L.thigh, b: L.shank, la: localOf(L.thigh, L.Kp), lb: localOf(L.shank, L.Kp), leg: L, kind: 'knee' });
  }

  // ── muscle capacity per joint (from the real grown muscles) ─────────────────────────────────────
  const limbSet = new Set(limbJoints(sprite));
  for (const j of joints) {
    const skelId = j.leg.lp + '_' + skelJoint[j.kind][j.leg.lp[0]];
    let pos = 0, neg = 0;
    for (const m of muscles) if (m.joints.includes(skelId)) {
      const t = m.fmax * momentArm(attachPos(W, m.a), attachPos(W, m.b), W[skelId].base);
      if (t >= 0) pos += t; else neg += -t;
    }
    j.capPos = pos * capScale; j.capNeg = neg * capScale;
    j.q0 = bodies[j.b].a - bodies[j.a].a;                  // rest relative angle (the posture to hold)
  }

  const feetContacts = legs.map((L) => ({ body: L.shank, local: localOf(L.shank, L.Fp), leg: L.lp }));
  const groundY = ground ?? Math.max(...feetContacts.map((c) => { const b = bodies[c.body], w = rot(c.local, b.a); return b.y + w.y; }));

  // ── dynamics step ──────────────────────────────────────────────────────────────────────────────
  function worldPoint(bi, local) { const b = bodies[bi], w = rot(local, b.a); return V(b.x + w.x, b.y + w.y); }

  function step(dt, control) {
    // 1. external forces: gravity + muscle joint torques (capped by the joint's muscle capacity)
    for (const b of bodies) if (b.im > 0) b.vy += g * dt;
    const acts = new Map();
    for (const j of joints) {
      const q = bodies[j.b].a - bodies[j.a].a, qd = bodies[j.b].va - bodies[j.a].va;
      let tau = control ? control(j, q, qd) : 0;
      const cap = tau >= 0 ? j.capPos : j.capNeg;
      const used = Math.min(Math.abs(tau), cap); tau = Math.sign(tau) * used;
      acts.set(j, cap > 0 ? used / cap : 0);
      bodies[j.b].va += tau * bodies[j.b].ii * dt;          // muscle torque drives the relative rotation
      bodies[j.a].va -= tau * bodies[j.a].ii * dt;
    }
    // 2. integrate, remembering previous position (for XPBD velocity update)
    for (const b of bodies) { b.px = b.x; b.py = b.y; b.pa = b.a; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; }
    // 3. position solve: pin joints + ground contact (several iterations for stiffness)
    for (let it = 0; it < 12; it++) {
      for (const j of joints) solvePin(j);
      for (const c of feetContacts) solveContact(c, groundY);
    }
    // 4. velocities from the change (XPBD) + mild damping (settles the closed-loop jitter)
    for (const b of bodies) { b.vx = (b.x - b.px) / dt; b.vy = (b.y - b.py) / dt; b.va = (b.a - b.pa) / dt;
      b.vx *= 0.992; b.vy *= 0.992; b.va *= 0.985; }
    return { acts };
  }

  // point-to-point (pin) constraint: the proper 2×2 effective-mass solve (translation + rotation about
  // each com via the lever arm). C = pB − pA → 0. This is the standard rigid-body attachment; the earlier
  // hand-rolled angular term was wrong and spun the trunk.
  function solvePin(j) {
    const A = bodies[j.a], B = bodies[j.b];
    const ra = rot(j.la, A.a), rb = rot(j.lb, B.a);
    const Cx = (B.x + rb.x) - (A.x + ra.x), Cy = (B.y + rb.y) - (A.y + ra.y);
    const im = A.im + B.im;
    const k11 = im + A.ii * ra.y * ra.y + B.ii * rb.y * rb.y;
    const k12 = -A.ii * ra.x * ra.y - B.ii * rb.x * rb.y;
    const k22 = im + A.ii * ra.x * ra.x + B.ii * rb.x * rb.x;
    const det = k11 * k22 - k12 * k12; if (Math.abs(det) < 1e-12) return;
    const lx = -(k22 * Cx - k12 * Cy) / det;   // λ = −K⁻¹ C
    const ly = -(-k12 * Cx + k11 * Cy) / det;
    B.x += B.im * lx; B.y += B.im * ly; B.a += B.ii * (rb.x * ly - rb.y * lx);
    A.x -= A.im * lx; A.y -= A.im * ly; A.a -= A.ii * (ra.x * ly - ra.y * lx);
  }

  // ground: a foot contact point can't go below the ground line; friction damps its horizontal slide
  function solveContact(c, gy) {
    const b = bodies[c.body], r = rot(c.local, b.a), p = V(b.x + r.x, b.y + r.y);
    if (p.y <= gy) return;                                 // foot above the ground → no contact
    b.y -= (p.y - gy);                                     // firm non-penetration: plant the foot on the ground
    b.x -= (b.x - b.px);                                   // no-slip static friction while planted (feet release on lift)
  }

  // ── built-in gait controller: muscles PD-track a 4-beat walk pattern, capped by their strength. The
  // motion is produced by muscle torque against gravity + ground contact — real forward dynamics. ──
  let gphase = 0;
  function walkStep(dt, p = {}) {
    const cad = p.cadence ?? 2.0, kp = p.kp ?? 3e4, kd = p.kd ?? 2.5e3, hipAmp = p.hipAmp ?? 0.45, kneeAmp = p.kneeAmp ?? 0.7;
    gphase += cad * dt;
    const ctrl = (j, q, qd) => {
      const lp = j.leg.lp, u = (((gphase / (2 * Math.PI)) + GAIT.phase[lp]) % 1 + 1) % 1, stance = u < GAIT.duty, fore = lp[0] === 'F';
      let target = j.q0;
      if (j.kind === 'hip') { const sweep = stance ? 1 - 2 * (u / GAIT.duty) : -1 + 2 * ((u - GAIT.duty) / (1 - GAIT.duty)); target = j.q0 - hipAmp * sweep; }
      else { const lift = stance ? 0 : Math.sin(Math.PI * ((u - GAIT.duty) / (1 - GAIT.duty))); target = j.q0 + kneeAmp * lift * (fore ? -1 : 1); }
      return kp * (target - q) - kd * qd;
    };
    const r = step(dt, ctrl);
    const feet = feetContacts.map((c) => { const wp = worldPoint(c.body, c.local); return { leg: c.leg, x: wp.x, y: wp.y, contact: wp.y >= groundY - 2 }; });
    return { acts: r.acts, feet, phase: gphase };
  }

  return {
    bodies, legs, joints, feetContacts, groundY, trunk, step, walkStep, worldPoint, restTrunk: { x: tmx / tm, y: tmy / tm },
    trunkPos: () => ({ x: bodies[trunk].x, y: bodies[trunk].y, a: bodies[trunk].a }),
  };
}

export default { makeWalker };
