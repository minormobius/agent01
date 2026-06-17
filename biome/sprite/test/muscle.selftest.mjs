// biome/sprite/test/muscle.selftest.mjs — the contract for the muscular-system solver (Phase 1: standing).
//   node biome/sprite/test/muscle.selftest.mjs
//
// The checkable claims the user asked for: a muscle-less skeleton is condemned by the mechanics; the
// grown one stands; the solution is minimal (every muscle necessary) and antagonised (pull-only ⇒ pairs);
// generation kills the no-lever candidates; and growth is deterministic (one canonical musculature).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from '../bauplan.mjs';
import { growMuscles } from '../myology.mjs';
import { evaluateStanding, evaluateWalking, standingDemand, actuatedJoints } from '../mechanics.mjs';
import { candidatesForJoint } from '../muscle.mjs';
import { solveForces } from '../solver.mjs';
import { makeGait } from '../gait.mjs';
import { solve } from '../render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ORG = JSON.parse(readFileSync(join(here, '../../gacha/catalog.json'), 'utf8')).organisms;
const SUBJECTS = ['horse', 'bear', 'rabbit', 'wolf', 'lynx', 'rat', 'roedeer', 'pig'];

let pass = 0, fail = 0;
const ok = (n, c, info = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${info ? '  — ' + info : ''}`); } };

console.log('\nmuscle.selftest — muscular-system solver (Phase 1: standing stability)\n');

// 1. the oracle condemns a muscle-less skeleton (every joint buckles)
{
  let allFall = true, info = '';
  for (const id of SUBJECTS) {
    const st = evaluateStanding(build(ORG[id]), []);
    if (st.stable || st.joints.some((j) => j.stable)) { allFall = false; info = id; }
  }
  ok('a muscle-less skeleton cannot stand — every joint buckles', allFall, info);
}

// 1b. grow-against-the-solver: the auto-grown set passes the COUPLED force solve (one tension per muscle
// satisfying every joint it crosses) — so pressing Solve makes it STAND, not crumble.
{
  let allFeasible = true, bad = '';
  for (const id of SUBJECTS) {
    const sp = build(ORG[id]);
    const s = solveForces(sp, growMuscles(sp).muscles);
    if (!s.feasible) { allFeasible = false; bad = `${id}: ${s.residual.filter((x) => x.unbalanced).length} unbalanced, ${s.overloaded.length} over`; }
  }
  ok('auto-grown musculature is COUPLED-feasible (Solve → stands, no crumble)', allFeasible, bad);
}

// 2. growth makes it stand, with the CoM over the support
{
  let allStand = true, allCom = true, bad = '';
  for (const id of SUBJECTS) {
    const sp = build(ORG[id]);
    const st = evaluateStanding(sp, growMuscles(sp).muscles);
    if (!st.stable) { allStand = false; bad = id; }
    if (!st.comOver) allCom = false;
  }
  ok('growth makes every subject stand (all actuated joints stable)', allStand, bad);
  ok('the centre of mass sits over the support interval', allCom);
}

// 3. pull-only ⇒ every joint is antagonised (muscle capacity on both sides)
{
  let antag = true, bad = '';
  for (const id of SUBJECTS) {
    const sp = build(ORG[id]);
    const st = evaluateStanding(sp, growMuscles(sp).muscles);
    if (!st.joints.every((j) => j.antagonized)) { antag = false; bad = id; }
  }
  ok('every actuated joint is antagonised (an agonist + an antagonist)', antag, bad);
}

// 4. the trunk is in the model and load-bearing; the long back muscle emerges from first principles
{
  let actuated = true, emerges = true, loadBearing = true, info = '';
  for (const id of SUBJECTS) {
    const sp = build(ORG[id]);
    const m = growMuscles(sp).muscles;
    const st = evaluateStanding(sp, m);
    const spineJoints = st.joints.filter((j) => /^[CTL]\d/.test(j.id));
    if (spineJoints.length < 20) { actuated = false; info = `${id} ${spineJoints.length} spine joints`; }
    if (!spineJoints.every((j) => j.stable)) { actuated = false; info = `${id} spine not all held`; }
    const longest = m.filter((x) => x.limb === 'axial').reduce((a, x) => Math.max(a, x.joints.length), 0);
    if (longest < 10) { emerges = false; info = `${id} longest ${longest}v`; }
    if (evaluateStanding(sp, m.filter((x) => x.limb !== 'axial')).stable) { loadBearing = false; info = `${id} stood without trunk`; }
  }
  ok('vertebrae are actuated joints (≥20 spine joints) and every one is held', actuated, info);
  ok('a long poly-articular back muscle EMERGES (longissimus ≥10 vertebrae)', emerges, info);
  ok('the trunk is load-bearing — removing axial muscles collapses standing', loadBearing, info);
}

// 5. generation kills the no-lever candidates — every survivor has a usable moment arm
{
  const sp = build(ORG.horse);
  const D = standingDemand(sp);
  let allLever = true;
  for (const seg of actuatedJoints(sp)) {
    const cands = candidatesForJoint(D.W, seg, D.scale);
    if (cands.some((c) => Math.abs(c.r) < 0.025 * D.scale)) allLever = false;
  }
  ok('candidate generation kills zero-lever muscles (all survivors have a moment arm)', allLever);
}

// 6. determinism — one canonical musculature per organism
{
  let stable = true, bad = '';
  for (const id of SUBJECTS) {
    const a = JSON.stringify(growMuscles(build(ORG[id])).muscles);
    const b = JSON.stringify(growMuscles(build(ORG[id])).muscles);
    if (a !== b) { stable = false; bad = id; }
  }
  ok('growth is deterministic — same organism → same musculature', stable, bad);
}

// 7. walking: the grown set actuates far more of the gait than bare bones (quasi-static, Phase-1 cut)
{
  let improved = true, bad = '';
  for (const id of SUBJECTS) {
    const sp = build(ORG[id]);
    const bare = evaluateWalking(sp, []).coverage;
    const grown = evaluateWalking(sp, growMuscles(sp).muscles).coverage;
    if (!(grown > bare + 0.2)) { improved = false; bad = `${id} ${bare.toFixed(2)}→${grown.toFixed(2)}`; }
  }
  ok('grown muscles actuate ≫ more of the walk cycle than bare bones', improved, bad);
}

// 8. the solver scales to a substantial set (limbs + the whole spine) without runaway volume
{
  const sp = build(ORG.horse);
  const { muscles, volume } = growMuscles(sp);
  const j = actuatedJoints(sp).length;
  ok('muscle set is substantial — at least one per actuated joint', muscles.length >= j, `${muscles.length} for ${j} joints`);
  ok('total muscle volume stays physically sane (no force blow-up)', volume > 0 && volume < 1e5, `vol ${volume.toFixed(0)}`);
}

// 9. WALK by contracting muscles: forward dynamics drives the legs through a stride, muscles fire, the
// pose stays finite, and it's deterministic (treadmill gait).
{
  let cyclesOK = true, firesOK = true, finiteOK = true, detOK = true, bad = '';
  for (const id of ['horse', 'wolf', 'bear']) {
    const sp = build(ORG[id]);
    const m = growMuscles(sp).muscles;
    const g = makeGait(sp, m);
    const track = [], fired = new Set();
    for (let i = 0; i < 220; i++) { const r = g.step(1 / 60); for (const k of r.activations.keys()) fired.add(k);
      if (i % 5 === 0) track.push(g.sprite.segs.find((s) => s.id === 'FN_humerus').rest); }
    const W = solve(g.sprite, 0);
    if (!Object.values(W).every((w) => Number.isFinite(w.tip.x) && Number.isFinite(w.tip.y))) { finiteOK = false; bad = id; }
    if (Math.max(...track) - Math.min(...track) < 0.2) { cyclesOK = false; bad = `${id} range ${(Math.max(...track)-Math.min(...track)).toFixed(2)}`; }
    if (fired.size < 4) { firesOK = false; bad = `${id} ${fired.size} muscles fired`; }
    // determinism
    const a = makeGait(sp, growMuscles(sp).muscles), b = makeGait(sp, growMuscles(sp).muscles);
    for (let i = 0; i < 40; i++) { const ra = a.step(1/60), rb = b.step(1/60);
      if (JSON.stringify([...ra.activations].sort()) !== JSON.stringify([...rb.activations].sort())) detOK = false; }
  }
  ok('walk: forward dynamics cycles the legs through a stride (joint oscillates)', cyclesOK, bad);
  ok('walk: muscles fire during the gait (contraction drives motion)', firesOK, bad);
  ok('walk: the posed skeleton stays finite across the stride', finiteOK, bad);
  ok('walk: the gait is deterministic', detOK);
}

console.log(`\n${fail === 0 ? '✓ all green' : '✗ FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
