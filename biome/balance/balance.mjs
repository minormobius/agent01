// biome/balance/balance.mjs — a BALANCE CONTROLLER for the rigid-body trunk. Last attempt failed because
// it simulated each leg's articulated dynamics (stiff → unstable). The robust way, used by real legged
// robots, is Virtual Model Control: treat the trunk as ONE rigid body, decide the wrench (force+torque)
// it needs to stay upright, then SOLVE for the ground-reaction forces the stance feet must push with to
// produce it. The legs are kinematic struts that deliver those forces — no articulated instability.
//
//   • trunk: rigid body (x, y, θ) under gravity.
//   • VMC: desired wrench = hold height + keep level + drive CoM (stand) or velocity (walk), all PD.
//   • distribute the wrench to the stance feet as GRFs (least-squares, pull-only + friction-cone clamp).
//   • gait: a 4-beat schedule lifts feet in turn and places them ahead (Raibert) → it walks.
//   • push it and it recovers; turn the legs "off" and gravity drops it.
// Coordinates: +x forward, +y DOWN (matches the skeleton). Gravity g > 0 is +y.

import { solve } from '../sprite/render.mjs';
import { segMasses } from '../sprite/mechanics.mjs';
import { GAIT } from '../sprite/render.mjs';

const cross = (r, f) => r.x * f.y - r.y * f.x;

export function makeBalancer(sprite, opt = {}) {
  const W = solve(sprite, 0);
  const mass = segMasses(sprite);
  const g = opt.g ?? 1400;

  // trunk inertial properties
  let cx = 0, cy = 0, M = 0;
  const mid = (id) => ({ x: (W[id].base.x + W[id].tip.x) / 2, y: (W[id].base.y + W[id].tip.y) / 2 });
  for (const s of sprite.segs) { const c = mid(s.id); cx += mass[s.id] * c.x; cy += mass[s.id] * c.y; M += mass[s.id]; }
  cx /= M; cy /= M;
  let I = 0; for (const s of sprite.segs) { const c = mid(s.id); I += mass[s.id] * ((c.x - cx) ** 2 + (c.y - cy) ** 2); }
  I = Math.max(I, 1e-3);

  // legs: hip anchor (local to trunk) + rest foot, in rest frame
  const legBone = (lp) => lp[0] === 'F' ? 'humerus' : 'femur';
  const legs = ['FN', 'FF', 'BN', 'BF'].map((lp) => {
    const hip = W[lp + '_' + legBone(lp)].base;
    let foot = null; for (const s of sprite.segs) if (s.id.startsWith(lp + '_k')) { const t = W[s.id].tip; if (!foot || t.y > foot.y) foot = t; }
    if (!foot) foot = W[lp + '_metatarsal']?.tip || hip;
    const reach = Math.hypot(foot.x - hip.x, foot.y - hip.y);
    return { lp, hipL: { x: hip.x - cx, y: hip.y - cy }, restFootL: { x: foot.x - cx, y: foot.y - cy },
      foot: { ...foot }, stance: true, plantX: foot.x, seg: reach, thigh: reach * 0.52, shank: reach * 0.5 };
  });
  const groundY = Math.max(...legs.map((l) => l.foot.y));
  const standH = groundY - cy;                      // CoM height above the ground when standing

  const trunk = { x: cx, y: cy, a: 0, vx: 0, vy: 0, va: 0 };
  let phase = 0, xTarget = cx;

  const rotL = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
  const hipWorld = (l) => { const r = rotL(l.hipL, trunk.a); return { x: trunk.x + r.x, y: trunk.y + r.y }; };

  // ── distribute a desired trunk wrench (Fx,Fy,T about the CoM) to stance feet as GRFs ──
  function distribute(stance, Fx, Fy, T) {
    const N = stance.length; if (!N) return [];
    // A (3×2N) f = b ; min-norm f = Aᵀ(AAᵀ)⁻¹ b
    const r = stance.map((l) => ({ x: l.foot.x - trunk.x, y: l.foot.y - trunk.y }));
    // AAᵀ (3×3): rows are [Fx eq],[Fy eq],[T eq]
    let m00 = N, m01 = 0, m02 = 0, m11 = N, m12 = 0, m22 = 0;
    for (const ri of r) { m02 += -ri.y; m12 += ri.x; m22 += ri.y * ri.y + ri.x * ri.x; }
    m00 += 1e-3; m11 += 1e-3; m22 += 1 + m22 * 1e-3;     // Tikhonov regularisation → no blow-up when feet are near-collinear
    const inv = inv3([[m00, m01, m02], [m01, m11, m12], [m02, m12, m22]]);
    if (!inv) { const f = (-Fy) / N; return r.map(() => ({ x: 0, y: f })); }
    const lam = mul3(inv, [Fx, Fy, T]);              // λ = (AAᵀ)⁻¹ b
    return r.map((ri) => ({ x: lam[0] - ri.y * lam[2], y: lam[1] + ri.x * lam[2] })); // f = Aᵀλ
  }

  function step(dt, p = {}) {
    const walk = p.mode === 'walk', vT = walk ? (p.vTarget ?? 90) : 0;
    phase += (walk ? (p.cadence ?? 2.0) : 0) * dt;

    // gait schedule: which feet are planted (stand → all)
    for (const l of legs) {
      if (!walk) { l.stance = true; continue; }
      const u = (((phase / (2 * Math.PI)) + GAIT.phase[l.lp]) % 1 + 1) % 1;
      const st = u < GAIT.duty;
      if (st && !l.stance) l.plantX = hipWorld(l).x;     // (re)plant under the hip
      l.stance = st; l.swingU = st ? 0 : (u - GAIT.duty) / (1 - GAIT.duty);
    }
    const stance = legs.filter((l) => l.stance);
    // swing feet: arc to a Raibert placement ahead of the hip; stance feet stay where planted
    for (const l of legs) {
      const hw = hipWorld(l);
      if (l.stance) { l.foot.y = groundY; /* planted x stays */ }
      else {
        const place = hw.x + 0.5 * trunk.vx * (GAIT.duty / (p.cadence ?? 2.0)) * 2 + 0.08 * (trunk.vx - vT);
        const t = l.swingU; l.foot.x = lerp(l._lx ?? l.foot.x, place, Math.min(1, t * 1.6));
        l.foot.y = groundY - Math.sin(Math.PI * t) * (l.seg * 0.28);  // lift arc
        l._lx = l.foot.x;
      }
    }

    // ── VMC: the wrench the trunk wants. Gains are TARGET ACCELERATIONS scaled by M / I, so pitch is
    // controlled regardless of the trunk's inertia (raw Kp was negligible against a large I → drift). ──
    const targetY = groundY - standH;                    // hold standing height
    const wn2 = 42, dmp = 13;                            // ≈ critically damped at ω ≈ 6.5 rad/s
    let Fy = -M * (g + wn2 * (trunk.y - targetY) + dmp * trunk.vy);   // support weight + height PD (−y = up)
    let T = -I * (wn2 * trunk.a + dmp * trunk.va);                    // keep level (θ → 0)
    let Fx;
    if (walk) { Fx = M * 4 * (vT - trunk.vx); xTarget = trunk.x; }
    else { Fx = -M * (22 * (trunk.x - xTarget) + 9 * trunk.vx); }     // stand: hold CoM over the start
    // NB: an external push is applied to the trunk below but NOT fed to the controller — it must recover
    // from the resulting state error (that's the whole point of the demo).

    // distribute to stance feet, clamp to pull-only (feet push up: fy ≤ 0) + friction cone
    let f = distribute(stance, Fx, Fy, T);
    const mu = 0.9, Fclamp = 6 * M * g;                  // bound each foot force (pull-only + friction cone + magnitude)
    f = f.map((fi) => { let fy = Math.max(-Fclamp, Math.min(0, fi.y)); const lim = mu * (-fy); const fx = Math.max(-lim, Math.min(lim, fi.x)); return { x: fx, y: fy }; });

    // ── integrate the trunk under gravity + the (clamped) GRFs + the push ──
    let netX = (p.push || 0), netY = M * g, netT = 0;
    for (let i = 0; i < stance.length; i++) { const fi = f[i], ri = { x: stance[i].foot.x - trunk.x, y: stance[i].foot.y - trunk.y };
      netX += fi.x; netY += fi.y; netT += cross(ri, fi); }
    if (p.legsOff) { netX = (p.push || 0); netY = M * g; netT = 0; }   // muscles/legs off → only gravity
    trunk.vx += (netX / M) * dt; trunk.vy += (netY / M) * dt; trunk.va += (netT / I) * dt;
    trunk.vx *= 0.999; trunk.vy *= 0.999; trunk.va *= 0.99;
    trunk.x += trunk.vx * dt; trunk.y += trunk.vy * dt; trunk.a += trunk.va * dt;

    // GRF magnitudes (for viz: "muscle effort")
    const grf = stance.map((l, i) => ({ lp: l.lp, x: l.foot.x, y: l.foot.y, fx: f[i].x, fy: f[i].y, mag: Math.hypot(f[i].x, f[i].y) }));
    return { trunk: { ...trunk }, legs: legs.map((l) => ({ lp: l.lp, hip: hipWorld(l), foot: { ...l.foot }, stance: l.stance, thigh: l.thigh, shank: l.shank })), grf, com: { x: trunk.x, y: trunk.y }, groundY };
  }

  return { step, trunk, legs, groundY, com0: { x: cx, y: cy }, M, restCom: { x: cx, y: cy } };
}

// ── small helpers ──
function lerp(a, b, t) { return a + (b - a) * t; }
function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [gg, h, i] = m[2];
  const A = e * i - f * h, Bv = -(d * i - f * gg), C = d * h - e * gg;
  const det = a * A + b * Bv + c * C; if (Math.abs(det) < 1e-9) return null;
  const id = 1 / det;
  return [[A * id, (c * h - b * i) * id, (b * f - c * e) * id],
          [Bv * id, (a * i - c * gg) * id, (c * d - a * f) * id],
          [C * id, (b * gg - a * h) * id, (a * e - b * d) * id]];
}
function mul3(m, v) { return [m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2], m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2], m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]]; }

export default { makeBalancer };
