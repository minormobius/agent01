#!/usr/bin/env node
// check.mjs — does anything in an assembly interfere, at a given time, or
// anywhere through a cycle? And how close does everything come?
//
//   node agent/check.mjs bench/clock.json [--t 0.5] [--eps 1e-4] [--json]
//   node agent/check.mjs bench/lift.json --sweep 24 [--period 1]
//   node agent/check.mjs bench/lift.json --sweep 24 --clearance 1
//
// Two instruments. Without --clearance: every distinct part is built with
// Manifold (milliseconds each), the components are posed through the
// kinematics, and every pair whose boxes overlap is intersected — the
// shared VOLUME, the definitive overlap. With --clearance d: the exact
// kernel's meshes are posed and lib/proximity.js measures every pair's
// nearest approach — the table a reviewer reads first — and any pair
// closer than d, crossing, or containing another fails the check.
// --sweep N samples N instants over one period of the drive (a turn of the
// driven component, two beats of an escapement, or --period seconds); with
// --clearance the minimum per pair is then chased between samples by a
// golden-section search, so a graze between two instants is found, not
// missed. Fixed-mated bores on their arbors and nuts on their screws are
// expected touches, a touch with no depth is contact (not a collision unless
// a clearance is demanded), and a document's `fits` say what clearance a
// pair is designed to keep — so design intent and a mistake read apart.
// Reference components are left out.
import { flatten, solveAngles, modelOf, expectedTouch, expectations, periodOf } from '../lib/assembly.js';
import { buildManifold } from '../lib/manifold-kernel.js';
import { interference } from '../lib/interfere.js';
import { clearanceAt, sweepClearance, verdictOf, OK_VERDICTS } from '../lib/sweep.js';
import { readDoc, isAssembly, benchRef, kernels, facesOf, arg, has } from './common.mjs';

const doc = readDoc(process.argv[2]);
if (!isAssembly(doc)) { console.error('not an assembly (no components)'); process.exit(2); }
const eps = Number(arg('--eps', '0.01')); // below 0.01 mm³ is polygon flank overlap at a mesh, not a clash
const sweep = has('--sweep') ? Math.max(2, Math.round(Number(arg('--sweep', '12')))) : 0;
const clearance = has('--clearance') ? Number(arg('--clearance', '0')) : null;
const { engine, manifold } = await kernels();
const { components, mates, drive, partTrees, fits } = await flatten(doc, benchRef, { facesOf });
const live = components.filter((c) => !c.reference);
const expected = expectedTouch(mates);
const expect = expectations(mates, fits);
const period = Number(arg('--period', String(periodOf(drive))));
const f4 = (x) => x.toFixed(4);
let out;

if (clearance === null) {
  const built = new Map();
  for (const [key, tree] of partTrees) {
    const r = buildManifold(manifold, engine.resolve(tree), { keep: true });
    if (!r.ok) { console.error(`${key}: ${r.error.op}: ${r.error.msg}`); continue; }
    built.set(key, r);
  }
  const poseAt = (t) => {
    const angles = solveAngles(components, mates, drive, t);
    const bodies = live.filter((c) => built.has(c.partKey)).map((c) => ({ id: c.id, manifold: built.get(c.partKey).manifold, bbox: built.get(c.partKey).bbox, model: modelOf(c, angles) }));
    const r = interference({ Manifold: manifold.Manifold }, bodies, { eps });
    return { t, tested: r.tested, ms: r.ms, pairs: r.pairs.map((p) => ({ ...p, fixed: expected(p.a, p.b) })) };
  };
  if (!sweep) {
    out = poseAt(Number(arg('--t', '0')));
    if (has('--json')) console.log(JSON.stringify(out, null, 1));
    else {
      console.log(`t = ${out.t} s · ${live.length} components · ${out.tested} overlapping pairs tested in ${out.ms.toFixed(0)} ms`);
      if (!out.pairs.length) console.log('no interference');
      for (const p of out.pairs) console.log(`${p.fixed ? '~' : '✗'} ${p.a} × ${p.b}  ${f4(p.volume)} mm³${p.fixed ? '  (expected touch: fixed- or screw-mated)' : ''}`);
    }
  } else {
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
      console.log(`${sweep} instants over ${period} s · ${live.length} components · up to ${tested} overlapping pairs per instant · ${ms.toFixed(0)} ms`);
      if (!pairs.length) console.log('no interference anywhere in the cycle — add --clearance <mm> for the nearest approach of every pair');
      for (const p of pairs) console.log(`${p.fixed ? '~' : '✗'} ${p.a} × ${p.b}  worst ${f4(p.volume)} mm³ at t = ${p.t.toFixed(3)} s${p.fixed ? '  (expected touch)' : ''}`);
    }
  }
  process.exit(out.pairs.some((p) => !p.fixed) ? 1 : 0);
}

// ── clearance: nearest approach per pair, from the exact meshes ──────────
const meshes = new Map();
for (const [key, tree] of partTrees) {
  // res 256: four times the arcs of the viewer's mesh, so a curved face's chord error is under 0.002 mm and a 1 mm gap reads 1.000
  const r = engine.build(tree, { kernel: 'truck', res: 256 });
  if (!r.ok) { console.error(`${key}: exact build failed: ${r.report.error?.op}: ${r.report.error?.msg} — clearance needs the exact mesh`); continue; }
  meshes.set(key, r.mesh);
}
const bodies = live.filter((c) => meshes.has(c.partKey)).map((c) => ({ id: c.id, mesh: meshes.get(c.partKey), comp: c }));
const kin = { components, mates, drive };
const SYMBOL = { collision: '✗', close: '!', loose: '!', expected: '~', fit: '=', contact: '·', clear: '✓' };
const verdict = (p) => SYMBOL[verdictOf(p, expect, clearance)];
const failing = (p) => !OK_VERDICTS.has(verdictOf(p, expect, clearance));
const WORD = { '=': ' (designed fit)', '~': ' (expected touch)', '·': ' (contact)' };
const row = (p) => `${verdict(p)} ${p.a} × ${p.b}  ${p.penetration > 0 ? `${p.contained ? p.contained : 'crossing'}, ${f4(p.penetration)} mm deep` : p.touching ? 'touching' : `${f4(p.distance)} mm`}${p.t !== undefined ? ` at t = ${p.t.toFixed(3)} s` : ''}${WORD[verdict(p)] || (verdictOf(p, expect, clearance) === 'loose' ? ' (looser than its fit)' : '')}`;
if (!sweep) {
  const r = clearanceAt(bodies, kin, Number(arg('--t', '0')), { within: Infinity, skip: () => false });
  out = { t: r.t, clearance, pairs: r.pairs, tested: r.tested, ms: r.ms };
  if (has('--json')) console.log(JSON.stringify(out, null, 1));
  else { console.log(`t = ${r.t} s · ${bodies.length} components · nearest approach of ${r.pairs.length} pairs in ${r.ms.toFixed(0)} ms · flagging under ${clearance} mm`); for (const p of r.pairs) console.log(row(p)); }
} else {
  const r = sweepClearance(bodies, kin, { instants: sweep, period, within: Infinity });
  out = { sweep, period, clearance, refined: r.refined, pairs: r.pairs, tested: r.tested, ms: r.ms };
  if (has('--json')) console.log(JSON.stringify(out, null, 1));
  else { console.log(`${sweep} instants over ${period} s, minima refined between samples · ${bodies.length} components · ${r.pairs.length} pairs · ${r.ms.toFixed(0)} ms · flagging under ${clearance} mm`); for (const p of r.pairs) console.log(row(p)); }
}
process.exit(out.pairs.some(failing) ? 1 : 0);
