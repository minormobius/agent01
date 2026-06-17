// biome/sprite/gait.mjs — WALK by contracting muscles (forward dynamics, treadmill-style).
//
// Statics asks "what tensions hold this pose?". This asks the opposite: drive the muscles and let the
// motion fall out. Each LIMB joint is a little dynamical system — muscle torque accelerates it,
// q̈ = τ/I — and the muscles are driven by a controller that tracks the walk rhythm (a CPG keyed to the
// kinematic gait). So the legs move BECAUSE muscles pull, capped by each muscle's strength: a muscle too
// weak to hit the target torque lags, which is honest. On a treadmill the body is pinned (no balance
// problem — like a gait-lab harness), the trunk muscles hold the spine, and the legs cycle in place.
//
// Returns, per step, the muscle ACTIVATIONS (0..1) so the lab can light up the firing pattern.

import { solve, CLIPS } from './render.mjs';
import { limbJoints } from './mechanics.mjs';
import { attachPos, momentArm } from './muscle.mjs';

export function makeGait(sprite, muscles, opt = {}) {
  const work = structuredClone(sprite); work.clip = 'static';   // our own mutable pose; static = no kinematic clip
  const seg = (id) => work.segs.find((s) => s.id === id);
  const W0 = solve(work, 0);
  const limbs = limbJoints(work), limbSet = new Set(limbs);

  // per limb-joint: its muscles + rest-pose moment arm (cheap; arms drift a little as it swings — fine)
  const byJoint = {}; for (const id of limbs) byJoint[id] = [];
  for (const m of muscles) for (const jid of m.joints) if (limbSet.has(jid)) {
    byJoint[jid].push({ id: m.id, r: momentArm(attachPos(W0, m.a), attachPos(W0, m.b), W0[jid].base), fmax: m.fmax });
  }

  const rest0 = {}; for (const s of work.segs) rest0[s.id] = s.rest || 0;
  const q = {}, v = {}; for (const id of limbs) { q[id] = 0; v[id] = 0; }

  const kp = opt.kp ?? 80, I = opt.I ?? 1.0, cadence = opt.cadence ?? 2.4;
  const kd = opt.kd ?? 2 * Math.sqrt(kp * I) * 1.05;            // ≈ critical damping → tracks without ringing
  let phase = 0;

  function step(dt) {
    phase = (phase + dt * cadence) % (Math.PI * 2);
    const clip = CLIPS.walk(phase, work);                       // target rhythm: per-joint angle + body bob
    const act = new Map();
    for (const jid of limbs) {
      const target = clip.angles[jid] || 0;
      const tauDes = kp * (target - q[jid]) - kd * v[jid];       // PD demand
      const want = Math.sign(tauDes) || 1;
      let best = null;                                           // the muscle (pull-only) on the demanded side
      for (const mm of byJoint[jid]) if (Math.sign(mm.r) === want && (!best || Math.abs(mm.r) > Math.abs(best.r))) best = mm;
      let torque = 0;
      if (best && best.fmax > 0) {
        const Fneed = Math.min(best.fmax, Math.abs(tauDes) / (Math.abs(best.r) || 1)); // capped by strength
        torque = Fneed * best.r;
        act.set(best.id, Fneed / best.fmax);
      }
      v[jid] += dt * torque / I;                                // q̈ = τ/I  (damping is folded into tauDes)
      q[jid] += dt * v[jid];
      const s = seg(jid);
      if (s.rom) { if (q[jid] < s.rom[0]) { q[jid] = s.rom[0]; if (v[jid] < 0) v[jid] = 0; }
        else if (q[jid] > s.rom[1]) { q[jid] = s.rom[1]; if (v[jid] > 0) v[jid] = 0; } }
    }
    // apply the pose: limbs from the dynamics, the rest (spine/tail/neck) rides the gait kinematically
    for (const s of work.segs) {
      if (limbSet.has(s.id)) s.rest = rest0[s.id] + q[s.id];
      else if (clip.angles[s.id] != null) s.rest = rest0[s.id] + clip.angles[s.id];
    }
    return { activations: act, bob: clip.bob || 0, phase };
  }

  return { sprite: work, step, phase: () => phase };
}

export default { makeGait };
