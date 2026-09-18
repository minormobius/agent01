#!/usr/bin/env node
// anchor-bug.mjs — minimal repro: an @anchor-placed component inside a
// sub-assembly gets the parent's transform applied TWICE.
//
//   node anchor-bug.mjs /path/to/cad
//
// Two identical pairs of parts. A sits at [100,0,0]; B is anchored to A's start
// face, rigid, with an offset of [0,50,0] — so B must always sit 50 mm in +Y
// from A. Once at the top level, once inside a sub-assembly placed at [0,0,200].
//
//   flat    A [100, 0,   0]    B [100, 50,   0]   correct
//   nest    A [100, 0, 200]    B [100, 50, 400]   the 200 is counted twice
//
// It is silent and it is severe. In morphyx/arm's robot document the gripper
// hangs four levels deep with a rotation at each, so the double application
// does not merely translate — the rotations compose the wrong way and its
// anchored parts scatter. At rest, with every joint at zero, the gripper's
// front wall landed at [600,−600,800] and a bushing at [34,76,1583], and the
// interference check reported NO INTERFERENCE because the strays were in empty
// space with nothing to hit. A false pass is worse than a failure.
//
// Everything placed with a plain `at: [x,y,z]` is correct throughout; only
// `at: '@component.face'` is affected.
import path from 'node:path';
const cad = process.argv[2] || process.env.CAD || '/tmp/cad';
const { flatten, solveAngles, modelOf } = await import(path.join(cad, 'lib/assembly.js'));
const { benchRef, facesOf } = await import(path.join(cad, 'agent/common.mjs'));

const bar = { $schema: 'com.minomobi.cad.tree#v1', units: 'mm', params: { d: 10, t: 20 },
  features: [{ op: 'sketch', id: 'f', plane: 'XY', loops: [{ name: 'o', circle: { c: [0, 0], r: 'd / 2' } }] },
    { op: 'extrude', id: 'e', profile: 'f', depth: 't' }] };
const pair = [{ id: 'A', part: 'bar', at: [100, 0, 0] },
  { id: 'B', part: 'bar', at: '@A.start', rigid: true, offset: [0, 50, 0] }];
const flat = { $schema: 'com.minomobi.cad.assembly#v1', name: 'flat', params: {}, derived: {}, parts: { bar }, components: pair };
const nest = { $schema: 'com.minomobi.cad.assembly#v1', name: 'nested', params: {}, derived: {}, parts: {},
  components: [{ id: 'sub', assembly: { _: 'inner', params: {}, derived: {}, parts: { bar }, components: pair }, at: [0, 0, 200] }] };

let bad = 0;
for (const [name, doc, expect] of [['flat', flat, [100, 50, 0]], ['nest', nest, [100, 50, 200]]]) {
  const { components, mates, drive } = await flatten(doc, benchRef, { facesOf });
  const a = solveAngles(components, mates, drive, 0);
  const P = (s) => { const c = components.find((x) => x.id.endsWith(s)); const m = modelOf(c, a); return [m[12], m[13], m[14]].map((v) => +v.toFixed(2)); };
  const got = P('B'), ok = got.every((v, i) => Math.abs(v - expect[i]) < 1e-6);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(5)}  A ${JSON.stringify(P('A'))}  B ${JSON.stringify(got)}  expected B ${JSON.stringify(expect)}`);
}
console.log(bad ? '\nthe sub-assembly placement is applied twice to an anchored component' : '\nanchors compose correctly');
process.exit(bad ? 1 : 0);
