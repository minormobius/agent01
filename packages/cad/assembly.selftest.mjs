// assembly.selftest.mjs — the assembly document as a function of time.
//
// Two things are proven here. First, that lib/expr.js IS the engine's
// expression language: a corpus of expressions is evaluated by both (the
// engine through cad_resolve on a featureless tree's params) and every
// value must agree to the last bit. Second, the kinematic schema: params,
// derived, t and theta in placements, sub-assembly scopes, component
// parameter overrides bound in the assembly, the drive's numbers as
// expressions, and the closed forms of a crank–slider at several instants.
// Static documents (train, clock) must pose exactly as before.
//
//   node packages/cad/assembly.selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './lib/engine.js';
import { evaluate, resolveParams } from './lib/expr.js';
import { flatten, solveAngles, modelOf, placeAt, xform } from './lib/assembly.js';

const here = path.dirname(new URL(import.meta.url).pathname);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const bench = (n) => JSON.parse(fs.readFileSync(path.join(here, 'bench', n + '.json'), 'utf8'));
const benchRef = async (ref) => (typeof ref === 'string' && ref.startsWith('bench:') ? bench(ref.slice(6)) : structuredClone(ref));

// ── 1. the two evaluators agree ──────────────────────────────────────────
const engine = await loadEngine(fs.readFileSync(path.join(here, 'cad.wasm')));
const corpus = {
  a: '1 + 2 * 3', b: '-t^2', c: '(1+2)*3', d: 'sin(deg(30))', e_: 'max(t, 10, 2)', f: '2^3^2', g: '-2^2', h: '1e3 + 2.5e-1 + .5',
  i: 'rad2deg(atan2(1, 1))', j: 'sqrt(L^2 - 3^2)', k: 'min(4, t, 9) / 3', l: 'floor(-2.5) + ceil(2.1) + round(2.5) + round(-2.5)',
  m: 'abs(-pi) * e', n: 'tan(0.3) + asin(0.3) + acos(0.3) + atan(0.3)', o: '+t - -t', p: 'a.b * 2', q: 'x_1 + 1', s: '((t))', u: '10 / 4 - 1',
};
const env = { t: 3, L: 5, 'a.b': 1.5, x_1: 2 };
const tree = { params: { ...env, ...corpus }, features: [] };
let resolved;
try { resolved = engine.resolve(JSON.stringify(tree)).resolved.params; } catch (e) { console.log(`✗ the engine refused the corpus: ${e.message}`); process.exit(1); }
let agree = 0, disagree = [];
for (const [k, src] of Object.entries(corpus)) {
  const js = evaluate(src, env), rs = resolved[k];
  if (Object.is(js, rs) || near(js, rs, 0)) agree++; else disagree.push(`${k}: \`${src}\` → js ${js} vs engine ${rs}`);
}
check(!disagree.length, `lib/expr.js agrees with the engine on ${agree} of ${Object.keys(corpus).length} expressions${disagree.length ? '\n    ' + disagree.join('\n    ') : ''}`);
const jsParams = resolveParams({ ...env, ...corpus });
check(Object.keys(corpus).every((k) => near(jsParams[k], resolved[k], 0)), 'resolveParams matches the engine\'s dependency-ordered resolution');
// the same errors, in the same words
const errs = [['', 'empty expression'], ['1 +', 'unexpected token None'], ['q', 'unknown parameter `q`'], ['sin(1, 2)', '`sin` takes 1 argument'], ['foo(1)', 'unknown function `foo`'], ['1 2', 'trailing input in `1 2`'], ['1/0', '`1/0` is not finite'], ['$', 'unexpected `$` in expression `$`'], ['atan2(1)', '`atan2` takes 2'], ['(1', 'expected `)`']];
let sameErr = 0;
for (const [src, want] of errs) {
  let js = ''; try { evaluate(src, {}); } catch (e) { js = e.message; }
  let rs = ''; try { engine.resolve(JSON.stringify({ params: { x: src }, features: [] })); } catch (e) { rs = e.message; }
  if (js === want && rs.includes(want)) sameErr++; else console.log(`    \`${src}\`: js "${js}" / engine "${rs}" / want "${want}"`);
}
check(sameErr === errs.length, `${sameErr} of ${errs.length} error messages are the engine's own words`);

// ── 2. the crank–slider from the bench, against its closed form ─────────
const doc = bench('crank');
const { components, mates, drive, partTrees, params } = await flatten(doc, benchRef);
const byId = Object.fromEntries(components.map((c) => [c.id, c]));
check(components.length === 3 && partTrees.size === 3 && drive.kind === 'rpm' && drive.rpm === 30, `crank: ${components.length} components, ${partTrees.size} distinct parts, ${drive.rpm} rpm`);
check(params.r === 10 && params.L === 30 && params.gap === 0.6, 'the document params resolve');
check(!byId.crank.dynamic && byId.rod.dynamic && byId.block.dynamic, 'components whose placement is an expression are marked dynamic; the crank is not');
const crankTree = JSON.parse(partTrees.get(byId.crank.partKey)), rodTree = JSON.parse(partTrees.get(byId.rod.partKey));
check(crankTree.params.length === 10 && rodTree.params.length === 30 && rodTree.params.boss === 1.6, `component params bound in the assembly scope: crank length ${crankTree.params.length}, rod length ${rodTree.params.length}`);
const origin = (m) => xform(m, [0, 0, 0]);
let poseOk = true;
for (const t of [0, 0.25, 0.5, 0.8, 1.3, 2]) {
  const angles = solveAngles(components, mates, drive, t);
  const theta = (30 * 360 * t) / 60;
  const th = (theta * Math.PI) / 180, px = 10 * Math.cos(th), py = 10 * Math.sin(th), reach = Math.sqrt(30 * 30 - py * py), xs = px + reach;
  const rod = origin(modelOf(byId.rod, angles)), block = origin(modelOf(byId.block, angles));
  const tip = xform(modelOf(byId.rod, angles), [30, 0, 0]); // the rod's far end lands on the block's centre
  const ok = near(angles.theta, theta) && near(rod[0], px) && near(rod[1], py) && near(block[0], xs) && near(block[1], 0) && near(tip[0], xs, 1e-9) && near(tip[1], 0, 1e-9);
  if (!ok) { poseOk = false; console.log(`    t=${t}: theta ${angles.theta} rod (${rod[0]}, ${rod[1]}) block ${block[0]} tip (${tip[0]}, ${tip[1]}) vs px ${px} py ${py} xs ${xs}`); }
}
check(poseOk, 'the rod follows the crank pin, its far end sits on the block, and the block slides along x, at six instants');
const a0 = solveAngles(components, mates, drive, 0), a1 = solveAngles(components, mates, drive, 1);
check(near(origin(modelOf(byId.block, a0))[0], 40) && near(origin(modelOf(byId.block, a1))[0], 20), `top dead centre at t = 0 (x = ${origin(modelOf(byId.block, a0))[0]}), bottom at t = 1 (x = ${origin(modelOf(byId.block, a1))[0]})`);
check(near(placeAt(byId.block, 0.5, 90)[12], Math.sqrt(800)), 'placeAt takes t and theta directly (theta = 90°: the pin is on y, the block at sqrt(L² − r²))');

// ── 3. sub-assembly scopes, t without a drive, theta from an escapement ──
const sub = { name: 'arm', params: { len: 8 }, derived: { swing: '20 * sin(t * pi)' }, parts: { p: 'bench:arbor' }, components: [{ id: 'tip', part: 'p', at: ['len', 0, 0], rotate: { axis: [0, 0, 1], deg: 'swing' } }] };
const top = { name: 'top', params: { d: 5, dd: 'd * 2' }, derived: { lift: 't * 3' }, components: [{ id: 'arm', assembly: sub, at: ['dd', 0, 'lift'] }] };
const f2 = await flatten(top, benchRef);
const tipAt = (t) => origin(modelOf(f2.components[0], solveAngles(f2.components, f2.mates, f2.drive, t)));
check(f2.components[0].id === 'arm/tip' && near(tipAt(0)[0], 18) && near(tipAt(0)[2], 0) && near(tipAt(2)[2], 6) && near(tipAt(0.5)[0], 18) && near(solveAngles(f2.components, [], null, 7).theta, 0), 'a sub-assembly keeps its own params and derived, its placement is evaluated in the parent scope, and t runs without a drive (theta = 0)');
const clock = bench('clock');
const fc = await flatten(clock, benchRef);
const esc = solveAngles(fc.components, fc.mates, fc.drive, 0.5);
check(near(esc.theta, esc.get(fc.drive.wheel)), `an escapement's theta is the wheel's angle (${esc.theta.toFixed(3)}°)`);

// ── 4. static documents pose exactly as before ───────────────────────────
for (const n of ['train', 'clock']) {
  const f = await flatten(bench(n), benchRef);
  const angles = solveAngles(f.components, f.mates, f.drive, 0.7);
  const still = f.components.every((c) => !c.dynamic && c.place.every(Number.isFinite) && modelOf(c, angles).every(Number.isFinite));
  check(still && angles.t === 0.7, `${n}: no component is dynamic; ${f.components.length} placements are numbers, and the angles carry t`);
}

// ── 5. errors name the component and the field ──────────────────────────
const bad = async (d) => { try { await flatten(d, benchRef); return ''; } catch (e) { return e.message; } };
check((await bad({ components: [{ id: 'x', part: 'p', at: [0, 'nope', 0] }], parts: { p: 'bench:arbor' } })) === 'assembly x: at[1]: unknown parameter `nope`', 'an unknown name in `at` says which component and which element');
check((await bad({ name: 'm', derived: { a: 'b + 1' }, components: [] })) === 'm: derived `a`: unknown parameter `b`', 'a bad derived is named');
check((await bad({ params: { a: 'b', b: 'a' }, components: [] })).startsWith('assembly: param `'), 'a cycle in params is an error, not a hang');
check((await bad({ name: 'd', components: [], drive: { component: 'q', rpm: 'v' } })) === 'drive: rpm: unknown parameter `v`', 'a bad drive number is named');
const early = { components: [{ id: 'x', part: 'p', at: ['sqrt(1 - t)', 0, 0] }], parts: { p: 'bench:arbor' } };
const fe = await flatten(early, benchRef);
let late = ''; try { modelOf(fe.components[0], solveAngles(fe.components, [], null, 4)); } catch (e) { late = e.message; }
check(late === 'assembly x: at[0]: `sqrt(1 - t)` is not finite', `an expression that fails later in time fails at that instant, by name (${late})`);
// a component override the assembly cannot evaluate is the part's own expression
const pass = await flatten({ params: { L: 12 }, components: [{ id: 'a', part: 'p', params: { pin_z: 'L / 2', r_body: 'r_pivot * 3' } }], parts: { p: 'bench:arbor' } }, benchRef);
const pt = JSON.parse(pass.partTrees.get(pass.components[0].partKey)).params;
check(pt.pin_z === 6 && pt.r_body === 'r_pivot * 3' && near(engine.resolve(pass.partTrees.get(pass.components[0].partKey)).resolved.params.r_body, 0.45), 'an override the assembly can evaluate is bound there; one it cannot is handed to the part, which evaluates it');

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ assembly selftest passed');
process.exit(fails ? 1 : 0);
