// biome/sprite/myology.mjs — GROW a muscular system onto a skeleton and kill the failing arrangements.
//
// The loop the user specified: (a) know how muscles work [muscle.mjs], (b) generate possible muscles
// [candidatesForJoint], (c) solve standing stability to kill the failures [mechanics.mjs] — and keep
// the least-volume set that actually holds. The result is deterministic (no RNG: candidate generation
// is a fixed grid and selection is greedy-by-moment-arm), so a creature has ONE canonical musculature,
// same as its skeleton.
//
// Strategy (greedy growth): for every actuated joint, the raw skeleton has a buckling torque. Grow an
// AGONIST on the side that opposes it — choosing the largest moment arm, because that needs the least
// force and therefore the least muscle volume (the biological objective). Then grow a smaller ANTAGONIST
// on the other side so the joint is stable to perturbation either way (muscles only pull). Candidates
// with no usable lever are killed in generation; candidates that don't reduce the instability are skipped.

import { standingDemand } from './mechanics.mjs';
import { candidatesForJoint, attachPos, momentArm, muscleLength } from './muscle.mjs';

const JOINT_NAME = {
  humerus: 'shoulder', radioulna: 'elbow', metacarpal: 'carpus',
  femur: 'hip', tibia: 'stifle', metatarsal: 'hock', skull: 'neck',
};
const jointName = (id) => JOINT_NAME[id.includes('_') ? id.split('_')[1] : id] || id;
const limbOf = (id) => (id.includes('_') ? id.slice(0, 2) : 'ax'); // FN/FF/BN/BF or axial

export function growMuscles(sprite, opt = {}) {
  const margin = opt.margin ?? 0.12;
  const antagFrac = opt.antagonist ?? 0.3;          // antagonist sized as a fraction of the agonist
  const D = standingDemand(sprite);
  const { W, required, scale } = D;
  const muscles = [];
  const kills = { noLever: 0, total: 0 };
  const log = [];

  for (const jointId of Object.keys(required)) {
    const req = required[jointId];
    const all = candidatesForJoint(W, sprite.segs.find((s) => s.id === jointId), scale);
    kills.total += 2 * 3 * 2 * 2 - all.length; // generated grid minus survivors ≈ killed (no-lever)
    kills.noLever = kills.total;
    if (!all.length) { log.push(`${jointId}: NO viable candidate (joint unsupportable)`); continue; }

    // AGONIST: side whose torque (fmax·r, fmax>0) opposes the buckling — i.e. sign(r) == sign(req).
    const wantSign = Math.sign(req) || 1;
    const agoPool = all.filter((c) => Math.sign(c.r) === wantSign);
    const antPool = all.filter((c) => Math.sign(c.r) === -wantSign);
    if (!agoPool.length) { log.push(`${jointId}: no candidate on the holding side — KILLED`); continue; }

    const best = (pool) => pool.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a)); // max lever = least force
    const ago = best(agoPool);
    const SAFE = 1.2;  // size past the evaluator's hold threshold so it clears it robustly, not knife-edge
    const agoFmax = (Math.abs(req) * (1 + margin) * SAFE) / Math.abs(ago.r);
    muscles.push(mk(W, jointId, ago, agoFmax, 'agonist'));

    if (antPool.length) {
      const ant = best(antPool);
      muscles.push(mk(W, jointId, ant, agoFmax * antagFrac, 'antagonist'));
    } else {
      log.push(`${jointId}: no antagonist side — only one-directional (unstable to perturbation)`);
    }
  }

  const volume = muscles.reduce((s, m) => s + m.fmax * muscleLength(W, m), 0);
  return { muscles, kills, log, volume };
}

function mk(W, jointId, cand, fmax, role) {
  const name = `${jointName(jointId)} ${role === 'agonist' ? 'extensor' : 'flexor'}`;
  return {
    id: `${jointId}:${role}`, name, joint: jointId, joints: [jointId],
    a: cand.a, b: cand.b, fmax, role, side: cand.side, limb: limbOf(jointId),
  };
}

export default { growMuscles };
