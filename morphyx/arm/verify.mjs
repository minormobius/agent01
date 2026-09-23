#!/usr/bin/env node
// verify.mjs — the check the arm has been missing: does the DOCUMENT pose where
// the kinematics say it should, and does the hierarchy compose honestly?
//
//   node verify.mjs /path/to/cad
//
// Three things, and each one caught something real:
//
//  A. THE CHAIN. Every joint state, the document's own component positions
//     against fk(). The arm had 25 analytic checks on the DESIGN and nothing at
//     all confirming the document agreed with them.
//
//  B. THE GRIPPER ARRIVES INTACT. ../gripper posed standalone against the same
//     gripper four levels deep inside arm/robot, every component compared
//     relative to its own web. This is what would have caught the sub-assembly
//     anchor bug on the day it was introduced instead of a week later.
//
//  C. FRAME INDEPENDENCE. Displace a sub-assembly and assert every descendant
//     moves rigidly with it. A placement written as a world-frame expression to
//     work around a broken anchor passes every other check and fails this one —
//     which is precisely the trap the platform's own CHANGELOG warns about.
import fs from 'node:fs';
import path from 'node:path';
const cad = process.argv[2] || process.env.CAD || '/tmp/cad';
const { flatten, solveAngles, modelOf, gridStates } = await import(path.join(cad, 'lib/assembly.js'));
const { benchRef, facesOf } = await import(path.join(cad, 'agent/common.mjs'));
const here = path.dirname(new URL(import.meta.url).pathname);
const A = await import(path.join(here, 'arm.mjs'));
const G = await import(path.join(here, '..', 'gripper', 'gripper.mjs'));

let bad = 0, checked = 0;
const near = (got, want, tol, what) => { checked++; if (!(Math.abs(got - want) < tol)) { bad++; if (bad < 20) console.log(`  ✗ ${what}: ${got.toExponential(3)} vs ${want.toExponential(3)}`); } };
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
async function pose(doc, values) {
  const { components, mates, drive } = await flatten(doc, benchRef, { facesOf });
  const a = solveAngles(components, mates, drive, 0, values);
  return new Map(components.map((c) => { const m = modelOf(c, a); return [c.id, [m[12], m[13], m[14]]]; }));
}

// ── A. the chain against fk() ───────────────────────────────────────────────
console.log('— the chain, against fk() —');
{
  const doc = A.assembly();
  for (const st of gridStates((await flatten(doc, benchRef, { facesOf })).inputs, { steps: 3 })) {
    const P = await pose(doc, st.values);
    const { j1, j2, j3, j4, j5 } = st.values;
    const f = A.fk([j1, j2, j3, j4, j5]);
    const label = `j ${j1}/${j2}/${j3}/${j4}/${j5}`;
    // a sub-assembly is not a component, so these are real leaves whose own
    // origins sit on the joints: the upper arm at the shoulder, the forearm at
    // the elbow, the pitch shaft at the wrist centre.
    near(dist(P.get('yaw/upper-arm'), f.shoulder), 0, 1e-6, `${label}: shoulder`);
    near(dist(P.get('yaw/forearm[0]'), f.elbow), 0, 1e-6, `${label}: elbow`);
    near(dist(P.get('yaw/wrist/roll4/pitch5/pitch-shaft'), f.wrist), 0, 1e-6, `${label}: wrist centre`);
    // the parallelogram's whole claim: the forearm's angle is j3 and j2 never reaches it
    near(dist(P.get('yaw/forearm[0]'), P.get('yaw/wrist/roll4/pitch5/pitch-shaft')), A.D.L2, 1e-6, `${label}: elbow to wrist centre is L2`);
  }
  console.log(`  ${checked} comparisons, ${bad} off`);
}

// ── B. the gripper arrives intact ───────────────────────────────────────────
console.log('— the gripper, standalone vs four levels deep in arm/robot —');
{
  const before = checked, pre = 'shoulder/wrist/roll4/pitch5/gripper/';
  for (const [grip, roll] of [[0, 0], [7.5, 180], [15, 360]]) {
    const S = await pose(G.assembly('inputs'), { grip, roll });
    const R = await pose(A.robot(), { j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, grip, roll });
    const sr = S.get('motor-web'), rr = R.get(pre + 'motor-web');
    for (const [id, p] of S) {
      const q = R.get(pre + id); if (!q) continue;
      near(dist(p, sr), dist(q, rr), 1e-9, `grip ${grip} roll ${roll}: ${id} radius from the web`);
    }
  }
  console.log(`  ${checked - before} comparisons, ${bad} off in total`);
}

// ── C. frame independence ───────────────────────────────────────────────────
console.log('— frame independence: displace a sub-assembly, everything must follow —');
{
  const before = checked, SHIFT = [137, -91, 53];
  const base = A.robot();
  const moved = JSON.parse(JSON.stringify(base));
  const s = moved.components.find((c) => c.id === 'shoulder');
  s.at = [SHIFT[0], SHIFT[1], SHIFT[2]];
  const v = { j1: 0, j2: 17, j3: -40, j4: 30, j5: -25, grip: 7.5, roll: 90 };
  const P0 = await pose(base, v), P1 = await pose(moved, v);
  for (const [id, p] of P0) {
    if (!id.startsWith('shoulder')) continue;
    const q = P1.get(id); if (!q) continue;
    for (let k = 0; k < 3; k++) near(q[k] - p[k], SHIFT[k], 1e-9, `${id}[${'xyz'[k]}] follows its parent`);
  }
  console.log(`  ${checked - before} comparisons, ${bad} off in total`);
}
console.log(bad ? `\n${bad} of ${checked} comparisons are off` : `\nthe document poses where the kinematics say, the gripper arrives whole, and every child follows its parent`);
process.exit(bad ? 1 : 0);
