// biome/sprite/myology.mjs — GROW a muscular system onto a skeleton and kill the failing arrangements.
//
// (a) know how muscles work [muscle.mjs] · (b) generate possible muscles · (c) solve stability to kill
// failures [mechanics.mjs], keeping the least-volume set that holds. Deterministic → one canonical
// musculature per beast. Two regimes:
//   • LIMB joints are (near) mono-articular → an agonist + antagonist per joint (decoupled).
//   • SPINE joints are coupled — a loaded bridge. We generate POLY-ARTICULAR candidates (one muscle
//     spanning many vertebrae, riding high on a dorsal cord for a big moment arm) and a greedy coupled
//     solve picks the cheapest cover: the long dorsal muscle EMERGES (the longissimus) because spanning
//     many joints with one belly beats many short ones — muscles invented from first principles. Then an
//     oracle-driven REPAIR loop adds short deep muscles (the multifidus) wherever the long ones fall short.
//
// Passive tissue (ligaments, the stay apparatus) carries a share first [mechanics.passiveFraction] — a
// boundary condition that lowers how much active muscle is needed.

import { standingDemand, evaluateStanding, spineChain, limbJoints, passiveFraction } from './mechanics.mjs';
import { candidatesForJoint, attachPos, momentArm, muscleLength } from './muscle.mjs';
import { solveForces } from './solver.mjs';

const JOINT_NAME = {
  humerus: 'shoulder', radioulna: 'elbow', metacarpal: 'carpus',
  femur: 'hip', tibia: 'stifle', metatarsal: 'hock', skull: 'neck',
};
const jointName = (id) => JOINT_NAME[id.includes('_') ? id.split('_')[1] : id] || id;
const limbOf = (id) => (id.includes('_') ? id.slice(0, 2) : 'axial');
const SAFE = 1.32;

export function growMuscles(sprite, opt = {}) {
  const D = standingDemand(sprite);
  const segOf = (id) => sprite.segs.find((s) => s.id === id);
  const margin = opt.margin ?? 0.12, antagFrac = opt.antagonist ?? 0.3;
  const muscles = [];
  const kills = { noLever: 0 };
  const log = [];

  // ── LIMBS + HEAD: per-joint agonist/antagonist ──────────────────────────────────────────────────
  const limbSet = new Set([...limbJoints(sprite), 'skull']);
  for (const jointId of Object.keys(D.required)) {
    if (!limbSet.has(jointId)) continue;
    const seg = segOf(jointId);
    const req = D.required[jointId] * (1 - passiveFraction(seg));
    const all = candidatesForJoint(D.W, seg, D.scale);
    kills.noLever += 24 - all.length;
    if (!all.length) { log.push(`${jointId}: no viable candidate`); continue; }
    const wantSign = Math.sign(req) || 1;
    const agoPool = all.filter((c) => Math.sign(c.r) === wantSign);
    const antPool = all.filter((c) => Math.sign(c.r) === -wantSign);
    if (!agoPool.length) { log.push(`${jointId}: no holding-side candidate — KILLED`); continue; }
    const best = (p) => p.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
    const ago = best(agoPool);
    const agoF = (Math.abs(req) * (1 + margin) * SAFE) / Math.abs(ago.r);
    muscles.push(mk(jointId, ago, agoF, 'agonist', jointName(jointId) + ' extensor', [jointId]));
    if (antPool.length) muscles.push(mk(jointId, best(antPool), agoF * antagFrac, 'antagonist', jointName(jointId) + ' flexor', [jointId]));
  }

  // ── SPINE: poly-articular cover + tone ──────────────────────────────────────────────────────────
  const sc = spineCandidates(sprite, D);
  if (sc) growSpine(sc, muscles, { margin });

  // ── REPAIR: drive the actual oracle to zero — add short deep muscles for any joint still not held ──
  repair(sprite, muscles, D, sc, { margin });

  // ── COUPLED REPAIR: a muscle carries ONE tension that must satisfy every joint it crosses, so the
  // per-joint grower is optimistic — the COUPLED force solve (solver.mjs) is the real test. Grow against
  // it: wherever solveForces leaves a joint unbalanced, add a local muscle that can supply that residual,
  // until the layout balances. Then size every capacity to its solved force so nothing is over-strength.
  if (opt.coupled !== false) coupledRepair(sprite, muscles, D, sc, { margin });

  const volume = muscles.reduce((s, m) => s + m.fmax * muscleLength(D.W, m), 0);
  return { muscles, kills, log, volume, demand: D };
}

const mk = (jointId, c, fmax, role, name, joints) =>
  ({ id: `${jointId}:${role}:${joints.length}`, name, joint: jointId, joints, a: c.a, b: c.b, fmax, role, limb: limbOf(jointId) });

// poly-articular spine candidates: dorsal (epaxial) cords riding high over the spine + ventral (hypaxial)
// at the centra, every span over [sacrum … presacral chain]. The dorsal cord has a leverage FLOOR so it
// keeps a moment arm even where neural spines are short (cervical, lumbar) — the nuchal-ligament trick.
function spineCandidates(sprite, D) {
  const chain = spineChain(sprite);
  if (chain.length < 3) return null;
  const seg = (id) => sprite.segs.find((s) => s.id === id);
  const W = D.W, anchor = ['sacrum', ...chain];
  const target = new Map();
  for (const id of chain) target.set(id, D.required[id] * (1 - passiveFraction(seg(id))));
  const cands = [], dorsalFloor = 0.18 * D.scale;
  const addSpan = (i, j, side) => {
    // dorsal cord rides the NEURAL-SPINE TIPS (real bony processes); ventral at the centrum underside
    const off = (s) => side < 0 ? -(Math.max(s.spine || 0, dorsalFloor) + D.scale * 0.05) : (D.scale * 0.16);
    const a = { bone: anchor[i], t: 0.5, d: off(seg(anchor[i])) };
    const b = { bone: anchor[j], t: 0.5, d: off(seg(anchor[j])) };
    const joints = anchor.slice(i + 1, j + 1), rOf = new Map();
    const pa = attachPos(W, a), pb = attachPos(W, b);
    for (const jid of joints) rOf.set(jid, momentArm(pa, pb, W[jid].base));
    cands.push({ a, b, joints, rOf, length: Math.hypot(pb.x - pa.x, pb.y - pa.y), side });
  };
  const N = anchor.length;
  // L=1 = single-joint muscles (interspinales / intertransversarii) — the only thing that can fix an
  // anti-correlated adjacent pair without disturbing its neighbour. Longer spans = the erector group.
  for (const L of [1, 2, 3, 4, 6, 8, N - 1]) for (let i = 0; i + L < N; i += Math.max(1, Math.floor(L / 3))) {
    addSpan(i, i + L, -1); addSpan(i, i + L, +1);
  }
  addSpan(0, N - 1, -1); addSpan(0, N - 1, +1);
  return { chain, cands, target, W, scale: D.scale };
}

function growSpine(sc, out, { margin }) {
  const { chain, cands } = sc;
  const residual = new Map(sc.target), tol = 1e-3;
  // greedy coupled cover: the cheapest relief per unit muscle length, sized where the muscle has leverage
  for (let iter = 0; iter < 40; iter++) {
    if (![...residual.values()].some((v) => Math.abs(v) > tol)) break;
    let best = null, bestScore = 0;
    for (const c of cands) {
      const maxR = Math.max(...c.joints.map((j) => Math.abs(c.rOf.get(j) || 0)), 1e-9);
      let help = 0; const sizing = [];
      for (const jid of c.joints) {
        const r = c.rOf.get(jid) || 0, res = residual.get(jid) || 0;
        if (Math.abs(res) <= tol || Math.sign(r) !== Math.sign(res) || Math.abs(r) < 0.35 * maxR) continue;
        help += Math.abs(res); sizing.push(Math.abs(res) / Math.abs(r));
      }
      if (help <= 0) continue;
      const score = help / c.length;
      if (score > bestScore) bestScore = score, best = { c, sizing };
    }
    if (!best) break;
    const F = Math.max(...best.sizing) * (1 + margin) * SAFE;
    out.push(spineMuscle(best.c, F, 'agonist', 'epaxial'));
    for (const jid of best.c.joints) residual.set(jid, (residual.get(jid) || 0) - F * (best.c.rOf.get(jid) || 0));
  }
  // antagonist tone: a light whole-span muscle on each side → every spine joint antagonised
  const sf = out.filter((m) => m.limb === 'axial').map((m) => m.fmax);
  const tone = 0.12 * (sf.length ? sf.reduce((a, b) => a + b, 0) / sf.length : 1) + 1e-4;
  const whole = (side) => cands.find((c) => c.side === side && c.joints.length === chain.length);
  for (const side of [-1, +1]) { const c = whole(side); if (c) out.push(spineMuscle(c, tone, side < 0 ? 'agonist' : 'antagonist', side < 0 ? 'epaxial' : 'hypaxial')); }
}

const spineMuscle = (c, fmax, role, group) =>
  ({ id: `spine:${group}:${c.joints[0]}-${c.joints.at(-1)}:${role}`,  // deterministic — no RNG (permalink contract)
    name: `${group} (${c.joints.length} vert)`, joint: c.joints[0], joints: c.joints, a: c.a, b: c.b, fmax, role, limb: 'axial' });

// Oracle-driven repair: while any joint isn't held, add the cheapest muscle that supplies its deficit on
// the holding side — short deep spine muscles (multifidus) or a limb agonist. The actual evaluateStanding
// (full coupling) is the feedback, so it converges to a genuinely standing solution.
function repair(sprite, out, D, sc, { margin }) {
  const segOf = (id) => sprite.segs.find((s) => s.id === id);
  const givenUp = new Set();
  for (let iter = 0; iter < 120; iter++) {
    const st = evaluateStanding(sprite, out);
    const bad = st.joints.filter((j) => !j.stable && !givenUp.has(j.id));
    if (!bad.length) break;
    const j = bad[0];
    // a joint may be unheld (needs more agonist) OR held-but-not-antagonised (needs a little opposite tone)
    let wantSign, needF;
    if (!j.held) { wantSign = j.holdSide === 'pos' ? 1 : -1; needF = j.need - j.cap[j.holdSide]; }
    else { const weak = j.cap.pos <= j.cap.neg ? 'pos' : 'neg'; wantSign = weak === 'pos' ? 1 : -1; needF = j.need * 0.12 + 1e-3; }
    if (needF <= 1e-6) { givenUp.add(j.id); continue; }
    const deficit = needF;
    let cand = null, rj = 0, spineJ = sc && sc.chain.includes(j.id);
    const levThresh = j.held ? 0.015 * D.scale : 0.06 * D.scale; // antagonist only needs to exist; agonist needs real lever
    if (spineJ) {                                   // spine joint → shortest strong-leverage deep candidate
      const opts = sc.cands.filter((c) => c.joints.includes(j.id)
        && Math.sign(c.rOf.get(j.id)) === wantSign && Math.abs(c.rOf.get(j.id)) > levThresh)
        .sort((a, b) => a.joints.length - b.joints.length || Math.abs(b.rOf.get(j.id)) - Math.abs(a.rOf.get(j.id)));
      if (opts.length) { cand = opts[0]; rj = cand.rOf.get(j.id); }
    } else {                                        // limb / head joint
      const all = candidatesForJoint(D.W, segOf(j.id), D.scale).filter((c) => Math.sign(c.r) === wantSign);
      if (all.length) { const c = all.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
        cand = { a: c.a, b: c.b, joints: [j.id], rOf: new Map([[j.id, c.r]]) }; rj = c.r; }
    }
    if (!cand || !rj) { givenUp.add(j.id); continue; } // can't fix this one — skip, keep repairing the rest
    const F = (deficit / Math.abs(rj)) * 1.1;
    out.push(spineJ
      ? { id: `spine:deep:${j.id}:${iter}`, name: `deep (${cand.joints.length} vert)`, joint: j.id, joints: cand.joints, a: cand.a, b: cand.b, fmax: F, role: 'agonist', limb: 'axial' }
      : { ...mk(j.id, cand, F, 'agonist', jointName(j.id) + ' deep', cand.joints), id: `${j.id}:deep:${iter}` });
  }
}

// Grow against the COUPLED solve. solveForces finds the pull-only tensions that balance every joint; any
// joint it leaves unbalanced needs a NEW local actuator with a moment arm in the residual's direction
// (a muscle can only push the joint torque one way per unit tension). Add the shortest such candidate,
// re-solve, repeat. Finally raise each muscle's capacity to ≥ its solved force so the set is feasible.
function coupledRepair(sprite, out, D, sc, { margin }) {
  const segOf = (id) => sprite.segs.find((s) => s.id === id);
  const givenUp = new Set(), tries = new Map();
  for (let iter = 0; iter < 80; iter++) {
    const s = solveForces(sprite, out);
    const bad = s.residual.filter((x) => x.unbalanced && !givenUp.has(x.id))
      .sort((a, b) => Math.abs(b.resid) - Math.abs(a.resid));
    if (!bad.length) break;
    const j = bad[0];
    const t = (tries.get(j.id) || 0) + 1; tries.set(j.id, t);
    if (t > 3) { givenUp.add(j.id); continue; }          // a joint that won't improve — stop hammering it
    const wantSign = -Math.sign(j.resid) || 1;           // tension here must drive A·F toward b (reduce residual)
    let cand = null, rj = 0; const spineJ = sc && sc.chain.includes(j.id);
    if (spineJ) {
      const opts = sc.cands.filter((c) => c.joints.includes(j.id)
        && Math.sign(c.rOf.get(j.id)) === wantSign && Math.abs(c.rOf.get(j.id)) > 0.04 * D.scale)
        .sort((a, b) => a.joints.length - b.joints.length || Math.abs(b.rOf.get(j.id)) - Math.abs(a.rOf.get(j.id)));
      if (opts.length) { cand = opts[0]; rj = cand.rOf.get(j.id); }
    } else {
      const all = candidatesForJoint(D.W, segOf(j.id), D.scale).filter((c) => Math.sign(c.r) === wantSign);
      if (all.length) { const c = all.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
        cand = { a: c.a, b: c.b, joints: [j.id], rOf: new Map([[j.id, c.r]]) }; rj = c.r; }
    }
    if (!cand || !rj) { givenUp.add(j.id); continue; }    // no actuator available for this residual — skip
    const F = (Math.abs(j.resid) / Math.abs(rj)) * (1 + margin);
    out.push(spineJ
      ? { id: `spine:cpl:${j.id}:${iter}`, name: `deep (${cand.joints.length} vert)`, joint: j.id, joints: cand.joints, a: cand.a, b: cand.b, fmax: F, role: 'agonist', limb: 'axial' }
      : { id: `${j.id}:cpl:${iter}`, name: jointName(j.id) + ' deep', joint: j.id, joints: cand.joints, a: cand.a, b: cand.b, fmax: F, role: 'agonist', limb: limbOf(j.id) });
  }
  // size capacities to the solved forces so no muscle is over-strength (feasible = balanced + strong enough)
  const s = solveForces(sprite, out);
  for (const m of out) { const F = s.forces.get(m.id) || 0; if (F * 1.25 + 1e-3 > m.fmax) m.fmax = F * 1.25 + 1e-3; }
}

export default { growMuscles };
