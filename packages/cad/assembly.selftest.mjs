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
import { flatten, solveAngles, modelOf, placeAt, xform, xformDir, alignZ, findFace, expectedTouch, expectations, periodOf } from './lib/assembly.js';
import { facesOf, kernels } from './agent/common.mjs';
import { clearances } from './lib/proximity.js';
import { clearanceAt, sweepClearance, verdictOf } from './lib/sweep.js';

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
// a PDS hands map keys back in DAG-CBOR order, not the author's: derived must not care
const shuffled = { ...doc, derived: Object.fromEntries(Object.entries(doc.derived).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))) };
const fs2 = await flatten(shuffled, benchRef);
check(Object.keys(shuffled.derived)[0] === 'px' && near(origin(modelOf(fs2.components[2], solveAngles(fs2.components, fs2.mates, fs2.drive, 1)))[0], 20), `derived resolves in dependency order whatever the key order (${Object.keys(shuffled.derived).join(', ')})`);
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

// ── 6. mates: travel as well as turning ─────────────────────────────────
{
  const box = (id, extra = {}) => ({ id, part: 'p', ...extra });
  const doc = { parts: { p: 'bench:arbor' }, components: [box('screw'), box('nut', { at: [0, 0, 10] }), box('plat', { at: [0, 0, 14] }), box('pinion', { at: [30, 0, 0] }), box('rack', { at: [30, 5, 0] }), box('pulley', { at: [60, 0, 0] }), box('twin', { at: [0, 0, 30] })],
    mates: [{ kind: 'screw', a: 'screw', b: 'nut', lead: 2 }, { kind: 'fixed', a: 'nut', b: 'plat' }, { kind: 'belt', a: 'screw', b: 'pinion', ra: 10, rb: 5 }, { kind: 'rack', a: 'pinion', b: 'rack', r: 4, axis: [1, 0, 0] }, { kind: 'belt', a: 'screw', b: 'pulley', za: 20, zb: 40 }, { kind: 'slider', a: 'nut', b: 'twin', ratio: 0.5 }],
    drive: { component: 'screw', rpm: 60 } };
  const f = await flatten(doc, benchRef);
  const at = (t) => { const a = solveAngles(f.components, f.mates, f.drive, t); const o = Object.fromEntries(f.components.map((c) => [c.id, origin(modelOf(c, a))])); return { a, o }; };
  const { a, o } = at(0.5); // half a turn
  check(near(a.theta, 180) && near(o.nut[2], 11) && near(a.get('nut'), 0), `screw: half a turn lifts the nut half a lead (z ${o.nut[2]}), and the nut does not turn`);
  check(near(o.plat[2], 15) && near(a.get('plat'), 0), `fixed carries travel as well as rotation (platform z ${o.plat[2]})`);
  check(near(a.get('pinion'), 360) && near(a.get('pulley'), 90), `belt: same sense, by radius (${a.get('pinion')}°) or by teeth (${a.get('pulley')}°)`);
  check(near(o.rack[0], 30 + 4 * Math.PI * 2), `rack: a pinion's full turn moves the rack 2πr along its axis (x ${o.rack[0].toFixed(4)})`);
  check(near(o.twin[2], 30.5), `slider: half the nut's travel (z ${o.twin[2]})`);
  // the other way round: drive the rack, the pinion turns; drive the nut, the screw turns
  const back = await flatten({ ...doc, drive: { component: 'rack', rpm: 60 } }, benchRef);
  const b = solveAngles(back.components, back.mates, back.drive, 0.25);
  check(near(b.get('rack'), 90) && near(b.get('pinion'), 0) && near(b.slide.get('rack')[0], 0) && near(b.slide.get('pinion')[0], 0), 'a driven rack turns (it is the root), which is not travel; mates only carry what the root has');
  const nutDrive = { parts: { p: 'bench:arbor' }, components: [box('screw'), box('nut')], mates: [{ kind: 'screw', a: 'screw', b: 'nut', lead: 4 }], drive: { component: 'screw', rpm: 30 } };
  const nd = await flatten(nutDrive, benchRef); const na = solveAngles(nd.components, nd.mates, nd.drive, 1);
  check(near(na.slide.get('nut')[2], 2), `lead 4 at half a turn is 2 mm of travel (${na.slide.get('nut')[2]})`);
  check(near(periodOf(f.drive), 1) && near(periodOf({ kind: 'escapement', beat: 0.5 }), 1) && periodOf(null) === 1, 'periodOf: a turn, two beats, or a second');
  const touch = expectedTouch(f.mates);
  check(touch('nut', 'screw') && touch('plat', 'nut') && !touch('rack', 'pinion'), 'expected touches are fixed and screw pairs, either order');
  const bad = async (d) => { try { await flatten(d, benchRef); return ''; } catch (e) { return e.message; } };
  check((await bad({ components: [box('a')], parts: { p: 'bench:arbor' }, mates: [{ kind: 'fixed', a: 'a', b: 'zz' }] })) === 'mate fixed a ↔ zz: no such component zz', 'a mate to a component that does not exist is named');
  check((await bad({ params: { L: 2 }, components: [box('a'), box('b')], parts: { p: 'bench:arbor' }, mates: [{ kind: 'screw', a: 'a', b: 'b', lead: 'L * q' }] })) === 'assembly: mate screw a ↔ b: lead: unknown parameter `q`', 'a mate number is an expression in the document scope, and a bad one is named');
}

// ── 7. repeat and place-by-feature: the lift from the bench ─────────────
{
  const lift = bench('lift');
  const f = await flatten(lift, benchRef, { facesOf });
  const ids = f.components.map((c) => c.id);
  check(ids.join() === 'screw,nut,platform,bolt[0],bolt[1],bolt[2],bolt[3]' && f.partTrees.size === 4, `repeat: 4 gives bolt[0]…bolt[3], one part build (${ids.join(', ')})`);
  const at = (t) => { const a = solveAngles(f.components, f.mates, f.drive, t); return Object.fromEntries(f.components.map((c) => [c.id, origin(modelOf(c, a))])); };
  const o0 = at(0), o1 = at(0.5);
  const onCircle = [0, 1, 2, 3].every((k) => near(Math.hypot(o0[`bolt[${k}]`][0], o0[`bolt[${k}]`][1]), 9) && near(o0[`bolt[${k}]`][2], 12));
  check(onCircle, `each bolt sits on a platform hole (radius R − 3 = 9) at the platform's plane less its offset (z ${o0['bolt[0]'][2]})`);
  check([0, 1, 2, 3].every((k) => near(o1[`bolt[${k}]`][2], 13)) && near(o1.platform[2], 15), 'the bolts ride up with the platform through the screw and fixed mates, with no mate of their own');
  const facesP = await facesOf(f.components[2].partKey, f.partTrees.get(f.components[2].partKey));
  check(findFace(facesP, 'pivot[3]')?.names.some((n) => n.startsWith('plate.pivot[3][')) && findFace(facesP, 'plate.end')?.geom.kind === 'plane' && !findFace(facesP, 'nope'), 'a face is found with or without its op prefix, and a circle by its loop name');
  // align: a bolt on a tilted plate stands along the plate's hole axis
  const tilted = { ...lift, components: lift.components.map((c) => (c.id === 'platform' ? { ...c, rotate: { axis: [1, 0, 0], deg: 30 } } : c)), mates: [], drive: null };
  const ft = await flatten(tilted, benchRef, { facesOf });
  const b0 = ft.components.find((c) => c.id === 'bolt[0]'); const A = solveAngles(ft.components, ft.mates, ft.drive, 0);
  const zdir = xformDir(modelOf(b0, A), [0, 0, 1]);
  check(near(zdir[0], 0) && near(zdir[1], -Math.sin(Math.PI / 6)) && near(zdir[2], Math.cos(Math.PI / 6)), `rotate.align turns the bolt's z onto the tilted bore axis (${zdir.map((v) => v.toFixed(3)).join(', ')})`);
  const az = alignZ([0, 0, -1]); check(near(xformDir(az, [0, 0, 1])[2], -1) && near(xformDir(alignZ([1, 0, 0]), [0, 0, 1])[0], 1), 'alignZ handles the antipode and a right angle');
  // references follow motion: a bolt on a turning plate orbits
  const spun = { ...lift, mates: [{ kind: 'fixed', a: 'screw', b: 'platform' }] };
  const fs3 = await flatten(spun, benchRef, { facesOf }); const S = solveAngles(fs3.components, fs3.mates, fs3.drive, 0.25); // 90°
  const p0 = origin(modelOf(fs3.components.find((c) => c.id === 'bolt[0]'), solveAngles(fs3.components, fs3.mates, fs3.drive, 0))), p1 = origin(modelOf(fs3.components.find((c) => c.id === 'bolt[0]'), S));
  check(near(p0[0], 9) && near(p0[1], 0) && near(p1[0], 0) && near(p1[1], 9), `a bolt placed on a plate that turns orbits with it ((${p0[0]}, ${p0[1]}) → (${p1[0].toFixed(6)}, ${p1[1]}))`);
  const bad = async (d) => { try { await flatten(d, benchRef, { facesOf }); return ''; } catch (e) { return e.message; } };
  check((await bad({ parts: { p: 'bench:plate' }, components: [{ id: 'b', part: 'p', at: '@a.end' }, { id: 'a', part: 'p' }] })).includes('no component `a` declared before this one'), 'a reference must point at an earlier component');
  check((await bad({ parts: { p: 'bench:plate' }, components: [{ id: 'a', part: 'p' }, { id: 'b', part: 'p', at: '@a.lid' }] })).includes('has no face named lid; it has plate.start'), 'a missing face is named, with what there is');
  let noFaces = ''; try { await flatten({ parts: { p: 'bench:plate' }, components: [{ id: 'a', part: 'p' }, { id: 'b', part: 'p', at: '@a.end' }] }, benchRef); } catch (e) { noFaces = e.message; }
  check(noFaces.includes('needs face geometry'), 'without facesOf a reference is an error, not a guess');
  check((await bad({ params: { n: 'x' }, parts: { p: 'bench:plate' }, components: [{ id: 'a', part: 'p', repeat: 'n' }] })).startsWith('assembly: param `n`'), 'a bad repeat count is named');
  const rep = await flatten({ params: { n: 3 }, parts: { p: 'bench:arbor' }, components: [{ id: 'a', part: 'p', repeat: 'n', at: ['i * 5', 0, 0], params: { L: '10 + i' } }] }, benchRef);
  check(rep.components.length === 3 && rep.partTrees.size === 3 && near(rep.components[2].place[12], 10) && JSON.parse(rep.partTrees.get(rep.components[1].partKey)).params.L === 11, 'i is in scope for at and for params, so repeated parts can differ');
}

// ── 8. proximity: clearance, crossing, containment, contact; the sweep finds a graze between samples ──
{
  const cube = (sz) => { const v = [[0, 0, 0], [sz, 0, 0], [sz, sz, 0], [0, sz, 0], [0, 0, sz], [sz, 0, sz], [sz, sz, sz], [0, sz, sz]]; return { pos: Float32Array.from(v.flat()), idx: Uint32Array.from([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]) }; };
  const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; const m = cube(2);
  const one = (bodies) => clearances(bodies).pairs[0];
  const apart = one([{ id: 'a', mesh: m, model: T(0, 0, 0) }, { id: 'b', mesh: m, model: T(5, 0, 0) }]);
  const diag = one([{ id: 'a', mesh: m, model: T(0, 0, 0) }, { id: 'b', mesh: m, model: T(3, 3, 0) }]);
  const cross = one([{ id: 'a', mesh: m, model: T(0, 0, 0) }, { id: 'b', mesh: m, model: T(1, 0.5, 0.5) }]);
  const inside = one([{ id: 'a', mesh: cube(6), model: T(0, 0, 0) }, { id: 'b', mesh: m, model: T(2, 2, 2) }]);
  const touch = one([{ id: 'a', mesh: m, model: T(0, 0, 0) }, { id: 'b', mesh: m, model: T(2, 0, 0) }]);
  check(near(apart.distance, 3) && !apart.intersecting && near(diag.distance, Math.SQRT2), `two cubes 3 mm apart, and corner to corner at √2 (${diag.distance.toFixed(4)})`);
  check(cross.intersecting && near(cross.penetration, 0.5) && cross.distance === 0, `crossing cubes: intersecting, ${cross.penetration} mm deep`);
  check(inside.contained === 'b in a' && near(inside.penetration, 2) && !inside.intersecting, `a cube inside a cube: contained, ${inside.penetration} mm deep`);
  check(touch.touching && touch.intersecting && touch.penetration === 0 && verdictOf(touch) === 'contact' && verdictOf(touch, () => false, 1) === 'close' && verdictOf(touch, () => true) === 'expected' && verdictOf(cross) === 'collision' && verdictOf(apart, () => false, 4) === 'close', 'face-to-face contact is contact (close only when a clearance is demanded), depth is collision, a mated touch is expected');
  const fitOf = (min, max) => () => ({ touch: false, fit: { min, max } });
  check(verdictOf(apart, fitOf(2.5, 3.5)) === 'fit' && verdictOf(apart, fitOf(3.5, 4)) === 'close' && verdictOf(apart, fitOf(1, 2)) === 'loose' && verdictOf(touch, fitOf(0, 0.1)) === 'fit' && verdictOf(touch, fitOf(0.05, 0.1)) === 'collision' && verdictOf(cross, fitOf(0, 1)) === 'collision', 'a designed fit is judged against its own [min, max]: fit, close, loose; contact within a fit that allows 0 passes');
  // the lift's real meshes: nut on screw is an expected touch, bolts and screw keep their distance
  const { engine } = await kernels();
  const lift = bench('lift'); const fl = await flatten(lift, benchRef, { facesOf });
  const meshes = new Map(); for (const [k, tr] of fl.partTrees) { const r = engine.build(tr, { kernel: 'truck' }); meshes.set(k, r.mesh); }
  const bodies = fl.components.map((c) => ({ id: c.id, mesh: meshes.get(c.partKey), comp: c }));
  const kin = { components: fl.components, mates: fl.mates, drive: fl.drive };
  const at0 = clearanceAt(bodies, kin, 0.3); const exp = expectedTouch(fl.mates);
  const ns = at0.pairs.find((p) => (p.a === 'screw' && p.b === 'nut') || (p.a === 'nut' && p.b === 'screw'));
  const sb = at0.pairs.filter((p) => [p.a, p.b].includes('screw') && [p.a, p.b].some((x) => x.startsWith('bolt')));
  check(ns && near(ns.distance, 0.1, 0.01) && verdictOf(ns, exp, 0.5) === 'close' && sb.length === 4 && sb.every((p) => p.distance > 6.69 && p.distance < 6.85), `at t = 0.3 the nut clears the screw by ${ns?.distance.toFixed(4)} mm (bore 1.3, shaft 1.2: 0.1 less the two chords' sagitta) and the bolts stand ${sb.map((p) => p.distance.toFixed(2)).join(', ')} mm from it (one faces its flat)`);
  // a graze between samples: a block passes 1 mm from a post at t = 0.07, which eight samples straddle
  const post = { units: 'mm', params: {}, features: [{ op: 'sketch', id: 's', loops: [{ name: 'p', rect: { c: [0, 0], w: 2, h: 2 } }] }, { op: 'extrude', id: 'p', profile: 's', depth: 2 }] };
  const graze = { params: {}, parts: { p: post }, components: [{ id: 'post', part: 'p' }, { id: 'block', part: 'p', at: ['4 - 3 * cos(2 * pi * (t - 0.07)) + 2', 0, 0] }, { id: 'drv', part: 'p', at: [50, 50, 0] }], drive: { component: 'drv', rpm: 60 } };
  const fg = await flatten(graze, benchRef); const gm = engine.build(fg.partTrees.get('p'), { kernel: 'truck' }).mesh;
  const gb = fg.components.map((c) => ({ id: c.id, mesh: gm, comp: c })); const gk = { components: fg.components, mates: fg.mates, drive: fg.drive };
  const pb = (r) => r.pairs.find((p) => [p.a, p.b].includes('post') && [p.a, p.b].includes('block'));
  const coarse = pb(sweepClearance(gb, gk, { instants: 8, period: 1, refine: false })), fine = pb(sweepClearance(gb, gk, { instants: 8, period: 1 }));
  check(coarse.distance > 1.15 && near(fine.distance, 1, 1e-3) && Math.abs(fine.t - 0.07) < 2e-3, `eight samples see ${coarse.distance.toFixed(3)} mm at best; the refined sweep finds the 1 mm graze at t = ${fine.t.toFixed(4)} s`);
  // reference components are for the eye only
  const withRef = { ...lift, components: [...lift.components, { id: 'ghost', part: 'nut', at: [0, 0, 'rise'], reference: true }] };
  const fr = await flatten(withRef, benchRef, { facesOf });
  check(fr.components.find((c) => c.id === 'ghost')?.reference === true && !fr.components.find((c) => c.id === 'nut').reference, 'a component marked reference is flagged for the tools to leave out (and hidden is not)');
}

// ── 9. the practitioner's findings ──────────────────────────────────────
{
  const lift = bench('lift');
  // a component placed on a face and also fixed-mated to that component moves once, not twice
  const doubled = { ...lift, mates: [...lift.mates, { kind: 'fixed', a: 'platform', b: 'bolt[0]' }] };
  const fd = await flatten(doubled, benchRef, { facesOf });
  const b0 = fd.components.find((c) => c.id === 'bolt[0]'); const z = origin(modelOf(b0, solveAngles(fd.components, fd.mates, fd.drive, 0.5)))[2];
  check(b0.anchoredTo === 'platform' && near(z, 13), `a bolt placed on the platform's hole and fixed-mated to it rides once (z ${z}, not 14)`);
  // travel carried by a fixed mate is turned into the follower's frame: a carriage sliding along its y carries a nut turned 90° along the nut's x
  const rig = { parts: { p: 'bench:arbor' }, components: [{ id: 'screw', part: 'p' }, { id: 'carriage', part: 'p', at: [0, 0, 5] }, { id: 'rider', part: 'p', at: [0, 0, 8], rotate: { axis: [0, 0, 1], deg: 90 } }], mates: [{ kind: 'screw', a: 'screw', b: 'carriage', lead: 4, axis: [0, 1, 0] }, { kind: 'fixed', a: 'carriage', b: 'rider' }], drive: { component: 'screw', rpm: 60 } };
  const fr = await flatten(rig, benchRef); const ar = solveAngles(fr.components, fr.mates, fr.drive, 0.5);
  const carriage = origin(modelOf(fr.components[1], ar)), rider = origin(modelOf(fr.components[2], ar)), local = ar.slide.get('rider');
  check(near(carriage[1], 2) && near(rider[1], 2) && near(rider[0], 0) && near(local[0], 2, 1e-9) && near(local[1], 0), `the carriage moves 2 mm along world y and so does its rider, whose own travel is along its x (${local.map((v) => +v.toFixed(3)).join(', ')})`);
  // i in derived
  const rep = await flatten({ params: { pitch: 5 }, derived: { xi: 'i * pitch', yi: 'sin(i) * 0' }, parts: { p: 'bench:arbor' }, components: [{ id: 'a', part: 'p', repeat: 3, at: ['xi', 'yi', 0] }] }, benchRef);
  check(rep.components.map((c) => c.place[12]).join() === '0,5,10', `derived may use i: three instances at x = ${rep.components.map((c) => c.place[12]).join(', ')}`);
  // designed fits from the document, with a wildcard for the repeat
  const ff = await flatten(lift, benchRef, { facesOf });
  const ex = expectations(ff.mates, ff.fits);
  check(ff.fits.length === 3 && ex('nut', 'screw').fit?.min === 0.05 && ex('platform', 'bolt[2]').fit?.max === 0.15 && ex('bolt[2]', 'platform').fit && !ex('screw', 'bolt[0]').fit && ex('nut', 'platform').touch, 'fits: screw–nut and platform–bolt[*] carry their designed clearance either way round; other pairs do not');
  const { engine } = await kernels();
  const meshes = new Map(); for (const [k, tr] of ff.partTrees) meshes.set(k, engine.build(tr, { kernel: 'truck', res: 256 }).mesh);
  const bodies = ff.components.map((c) => ({ id: c.id, mesh: meshes.get(c.partKey), comp: c }));
  const at = clearanceAt(bodies, { components: ff.components, mates: ff.mates, drive: ff.drive }, 0.3);
  const vs = Object.fromEntries(at.pairs.map((p) => [`${p.a}|${p.b}`, verdictOf(p, ex, 0.5)]));
  const ns = at.pairs.find((p) => [p.a, p.b].includes('screw') && [p.a, p.b].includes('nut'));
  check(vs['screw|nut'] === 'fit' && vs['platform|bolt[0]'] === 'fit' && vs['nut|platform'] === 'expected' && Object.values(vs).every((v) => ['fit', 'expected', 'clear'].includes(v)), `with fits declared and 0.5 mm demanded, the lift passes: ${[...new Set(Object.values(vs))].join(', ')}`);
  check(near(ns.distance, 0.1, 0.0025), `at res 256 the nut's clearance reads ${ns.distance.toFixed(4)} mm for a designed 0.1 (chord error under 0.0025)`);
}

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ assembly selftest passed');
process.exit(fails ? 1 : 0);
