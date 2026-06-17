// biome/sprite/solver.mjs — the STRUCTURAL FORCE SOLVE (the "Solve" button's engine). Given a skeleton
// and a set of muscles, find the muscle TENSIONS that hold the pose: forces F ≥ 0, each ≤ the muscle's
// capacity, that balance every joint's buckling torque. It's a box-constrained least-squares (resolve
// the redundant musculature) by projected coordinate descent — robust, allocation-free in the hot loop,
// and a natural Rust/WASM kernel later (kept JS-first so the lab always works without wasm).
//
//   minimise ‖A F − b‖²   subject to   0 ≤ F ≤ fmax
//     A[j][m] = moment arm of muscle m about joint j   ·   b[j] = torque muscle must supply at joint j
//
// Feasible (residual ≈ 0 everywhere + CoM over support) ⇒ it STANDS, and F is the force in each muscle.
// Infeasible ⇒ the leftover residual per joint is the unbalanced torque that makes that joint buckle —
// what the crumble animation plays out.

import { solve } from './render.mjs';
import { evaluateStanding, actuatedJoints, passiveFraction } from './mechanics.mjs';
import { attachPos, momentArm } from './muscle.mjs';

export function solveForces(sprite, muscles, opt = {}) {
  const W = solve(sprite, 0);
  const ev = evaluateStanding(sprite, muscles);          // gives per-joint required torque, CoM, GRF, support
  const joints = ev.joints, J = joints.length;
  const segOf = (id) => sprite.segs.find((s) => s.id === id);
  const b = joints.map((j) => j.required * (1 - passiveFraction(segOf(j.id)))); // passive tissue carries the rest

  // muscle columns: moment arm at each joint the muscle crosses
  const cols = muscles.map((m) => {
    const col = new Float64Array(J);
    const pa = attachPos(W, m.a), pb = attachPos(W, m.b);
    for (let k = 0; k < J; k++) if (m.joints.includes(joints[k].id)) col[k] = momentArm(pa, pb, W[joints[k].id].base);
    return col;
  });
  const fmax = muscles.map((m) => m.fmax);
  const norm = cols.map((c) => { let s = 0; for (const v of c) s += v * v; return s || 1; });

  // Solve for the tensions the LAYOUT needs (pull-only F ≥ 0, magnitude unbounded). This answers "can
  // these muscle LINES balance the joints at all?" — separate from "are they STRONG enough?" (capacity).
  const F = new Float64Array(muscles.length);
  const r = b.map((v) => -v);                            // residual A F − b, starting at −b (F = 0)
  for (let sweep = 0; sweep < 400; sweep++) {
    let maxD = 0;
    for (let m = 0; m < muscles.length; m++) {
      const c = cols[m]; let g = 0; for (let k = 0; k < J; k++) g += c[k] * r[k];
      let nf = F[m] - g / norm[m]; if (nf < 0) nf = 0;    // pull-only; no upper cap here
      const d = nf - F[m];
      if (d !== 0) { for (let k = 0; k < J; k++) r[k] += c[k] * d; F[m] = nf; if (Math.abs(d) > maxD) maxD = Math.abs(d); }
    }
    if (maxD < 1e-7) break;
  }

  const bscale = Math.max(...b.map((v) => Math.abs(v)), 1e-6);
  const residual = joints.map((j, k) => ({ id: j.id, resid: r[k], target: b[k], unbalanced: Math.abs(r[k]) > 0.03 * bscale + 1e-4 }));
  const forces = new Map(muscles.map((m, i) => [m.id, F[i]]));
  const overloaded = muscles.map((m, i) => ({ id: m.id, F: F[i], fmax: fmax[i] })).filter((x) => x.fmax > 0 && x.F > x.fmax * 1.001);
  const balanced = residual.every((x) => !x.unbalanced);  // the layout CAN hold the pose
  const feasible = ev.comOver && balanced && overloaded.length === 0; // …and the muscles are strong enough
  const totalForce = F.reduce((a, v) => a + v, 0);
  return { forces, residual, feasible, balanced, overloaded, totalForce, com: ev.com, comOver: ev.comOver, comFrac: ev.comFrac, contacts: ev.contacts, grf: ev.grf, joints };
}

// One relaxation step of a COLLAPSE: each joint that its muscles can't hold rotates the way gravity
// pushes it, by an amount ∝ how badly it's unsupported, CLAMPED to the joint's range of motion (so it
// folds like a body, not coiling into a ball). Mutates seg.rest in place; returns the total motion this
// step so the caller can stop when it settles.
export function collapseStep(sprite, muscles, rate = 0.05) {
  const st = evaluateStanding(sprite, muscles);
  let motion = 0;
  for (const j of st.joints) {
    const unbal = j.need - j.cap[j.holdSide];           // torque the muscles cannot supply
    if (unbal <= 1e-6) continue;
    const seg = sprite.segs.find((s) => s.id === j.id);
    if (!seg) continue;
    const dir = -Math.sign(j.required) || 1;            // gravity rotates opposite the muscle's needed torque
    const before = seg.rest || 0;
    let next = before + rate * dir * Math.min(1, unbal / (j.need + 1e-6));
    if (seg.rom) {                                       // clamp to the joint's range of motion
      const lo = (seg.rest0 || 0) + seg.rom[0], hi = (seg.rest0 || 0) + seg.rom[1];
      next = next < lo ? lo : (next > hi ? hi : next);
    }
    seg.rest = next; motion += Math.abs(next - before);
  }
  return motion;
}

export default { solveForces, collapseStep };
