#!/usr/bin/env node
// check.mjs — does anything in an assembly interfere, at a given time, or
// anywhere through a cycle?
//
//   node agent/check.mjs bench/clock.json [--t 0.5] [--eps 1e-4] [--json]
//   node agent/check.mjs bench/lift.json --sweep 24 [--period 1]
//
// Builds every distinct part with Manifold (milliseconds each), poses the
// components through the kinematics at t seconds, and intersects every pair
// whose boxes overlap. Prints the interfering pairs with the shared volume.
// --sweep N samples N instants over one period of the drive (a turn of the
// driven component, two beats of an escapement, or --period seconds) and
// reports each pair's worst overlap and when it happened: the check for
// anything that moves. Fixed-mated bores on their arbors and nuts on their
// screws are expected touches, listed but not failed on.
import { flatten, solveAngles, modelOf, expectedTouch, periodOf } from '../lib/assembly.js';
import { buildManifold } from '../lib/manifold-kernel.js';
import { interference } from '../lib/interfere.js';
import { readDoc, isAssembly, benchRef, kernels, facesOf, arg, has } from './common.mjs';

const doc = readDoc(process.argv[2]);
if (!isAssembly(doc)) { console.error('not an assembly (no components)'); process.exit(2); }
const eps = Number(arg('--eps', '0.01')); // below 0.01 mm³ is polygon flank overlap at a mesh, not a clash
const sweep = has('--sweep') ? Math.max(2, Math.round(Number(arg('--sweep', '12')))) : 0;
const { engine, manifold } = await kernels();
const { components, mates, drive, partTrees } = await flatten(doc, benchRef, { facesOf });
const built = new Map();
for (const [key, tree] of partTrees) {
  const r = buildManifold(manifold, engine.resolve(tree), { keep: true });
  if (!r.ok) { console.error(`${key}: ${r.error.op}: ${r.error.msg}`); continue; }
  built.set(key, r);
}
const expected = expectedTouch(mates);
const poseAt = (t) => {
  const angles = solveAngles(components, mates, drive, t);
  const bodies = components.filter((c) => built.has(c.partKey)).map((c) => ({ id: c.id, manifold: built.get(c.partKey).manifold, bbox: built.get(c.partKey).bbox, model: modelOf(c, angles) }));
  const r = interference({ Manifold: manifold.Manifold }, bodies, { eps });
  return { t, tested: r.tested, ms: r.ms, pairs: r.pairs.map((p) => ({ ...p, fixed: expected(p.a, p.b) })) };
};

let out;
if (!sweep) {
  out = poseAt(Number(arg('--t', '0')));
  if (has('--json')) console.log(JSON.stringify(out, null, 1));
  else {
    console.log(`t = ${out.t} s · ${components.length} components · ${out.tested} overlapping pairs tested in ${out.ms.toFixed(0)} ms`);
    if (!out.pairs.length) console.log('no interference');
    for (const p of out.pairs) console.log(`${p.fixed ? '~' : '✗'} ${p.a} × ${p.b}  ${p.volume.toFixed(4)} mm³${p.fixed ? '  (expected touch: fixed- or screw-mated)' : ''}`);
  }
} else {
  const period = Number(arg('--period', String(periodOf(drive))));
  const worst = new Map(); let tested = 0, ms = 0;
  for (let k = 0; k < sweep; k++) {
    const r = poseAt((k * period) / sweep);
    tested = Math.max(tested, r.tested); ms += r.ms;
    for (const p of r.pairs) { const key = `${p.a}|${p.b}`; const w = worst.get(key); if (!w || p.volume > w.volume) worst.set(key, { ...p, t: r.t }); }
  }
  const pairs = [...worst.values()].sort((a, b) => b.volume - a.volume);
  out = { sweep, period, pairs, tested, ms };
  if (has('--json')) console.log(JSON.stringify(out, null, 1));
  else {
    console.log(`${sweep} instants over ${period} s · ${components.length} components · up to ${tested} overlapping pairs per instant · ${ms.toFixed(0)} ms`);
    if (!pairs.length) console.log('no interference anywhere in the cycle');
    for (const p of pairs) console.log(`${p.fixed ? '~' : '✗'} ${p.a} × ${p.b}  worst ${p.volume.toFixed(4)} mm³ at t = ${p.t.toFixed(3)} s${p.fixed ? '  (expected touch)' : ''}`);
  }
}
process.exit(out.pairs.some((p) => !p.fixed) ? 1 : 0);
