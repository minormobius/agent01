#!/usr/bin/env node
// check.mjs — does anything in an assembly interfere, at a given time?
//
//   node agent/check.mjs bench/clock.json [--t 0.5] [--eps 1e-4] [--json]
//
// Builds every distinct part with Manifold (milliseconds each), poses the
// components through the kinematics at t seconds, and intersects every pair
// whose boxes overlap. Prints the interfering pairs with the shared volume.
import { flatten, solveAngles, modelOf } from '../lib/assembly.js';
import { buildManifold } from '../lib/manifold-kernel.js';
import { interference } from '../lib/interfere.js';
import { readDoc, isAssembly, benchRef, kernels, arg, has } from './common.mjs';

const doc = readDoc(process.argv[2]);
if (!isAssembly(doc)) { console.error('not an assembly (no components)'); process.exit(2); }
const t = Number(arg('--t', '0')), eps = Number(arg('--eps', '0.01')); // below 0.01 mm³ is polygon flank overlap at a mesh, not a clash
const { engine, manifold } = await kernels();
const { components, mates, drive, partTrees } = await flatten(doc, benchRef);
const built = new Map();
for (const [key, tree] of partTrees) {
  const r = buildManifold(manifold, engine.resolve(tree), { keep: true });
  if (!r.ok) { console.error(`${key}: ${r.error.op}: ${r.error.msg}`); continue; }
  built.set(key, r);
}
const angles = solveAngles(components, mates, drive, t);
const bodies = components.filter((c) => built.has(c.partKey)).map((c) => ({ id: c.id, manifold: built.get(c.partKey).manifold, bbox: built.get(c.partKey).bbox, model: modelOf(c, angles) }));
// mated pairs are expected to touch along a bore; report them but mark them
const mated = new Set(mates.filter((m) => m.kind === 'fixed').map((m) => [m.a, m.b].sort().join('|')));
const r = interference({ Manifold: manifold.Manifold }, bodies, { eps });
const out = { t, tested: r.tested, ms: r.ms, pairs: r.pairs.map((p) => ({ ...p, fixed: mated.has([p.a, p.b].sort().join('|')) })) };
if (has('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`t = ${t} s · ${components.length} components · ${r.tested} overlapping pairs tested in ${r.ms.toFixed(0)} ms`);
  if (!out.pairs.length) console.log('no interference');
  for (const p of out.pairs) console.log(`${p.fixed ? '~' : '✗'} ${p.a} × ${p.b}  ${p.volume.toFixed(4)} mm³${p.fixed ? '  (fixed-mated: a bore on its arbor)' : ''}`);
}
process.exit(out.pairs.some((p) => !p.fixed) ? 1 : 0);
