#!/usr/bin/env node
// mechanism.mjs — what the mechanism DOES, by virtual work. No geometry is
// built, no kernel runs: the poser the document already has is differenced
// against each input, and every velocity ratio, mechanical advantage, travel,
// dead point and holding force falls out of that.
//
//   node agent/mechanism.mjs bench/grip.json                       every axis, swept
//   node agent/mechanism.mjs bench/grip.json --input grip --at grip=6,roll=30
//   node agent/mechanism.mjs bench/grip.json --of jaw-r            the advantage curve
//   node agent/mechanism.mjs bench/grip.json --span jaw-l jaw-r    an invariant, as one number
//   node agent/mechanism.mjs bench/grip.json --point jaw-r=18,0,0  a point on a part
//   node agent/mechanism.mjs bench/grip.json --input roll --load jaw-r=0,100,0
//   node agent/mechanism.mjs bench/clock.json --steps 24 --json
//
// --load <comp>=<fx,fy,fz> (newtons) or <comp>@<N·m> (a torque about the
// part's own turn) gives the effort at the input that holds it: newtons for an
// input in mm, newton-metres for one in degrees, watts for a drive. It is
// LOSSLESS — friction is not modelled, so it is the floor, not the answer.
//
// An invariant is `--span a b` reading zero: "the link is a link", "rolling
// does not change the grip". A dead point is a rate passing through zero —
// self-locking, infinite advantage — and is reported per input.
import { flatten } from '../lib/assembly.js';
import { axesOf, axisNamed, rates, ratioOf, pointRate, spanRate, spanAt, effortFor, sweepRates } from '../lib/mechanism.js';
import { readDoc, isAssembly, benchRef, facesOf, arg, has } from './common.mjs';

const src = process.argv[2];
if (!src || src.startsWith('--')) { console.error('usage: node agent/mechanism.mjs <assembly.json> [--input NAME] [--at a=1,b=2] [--t s] [--steps N] [--of COMP] [--span A B] [--point COMP=x,y,z] [--load COMP=fx,fy,fz|COMP@nm] [--json]'); process.exit(2); }
const doc = readDoc(src);
if (!isAssembly(doc)) { console.error(`${src} is a part, not an assembly — a mechanism is what parts DO to each other. For one part's geometry: node agent/measure.mjs ${src}`); process.exit(2); }

const all = (flag) => process.argv.reduce((a, x, i) => (x === flag && process.argv[i + 1] ? [...a, process.argv[i + 1]] : a), []);
const pairAfter = (flag) => { const i = process.argv.indexOf(flag); return i < 0 ? null : [process.argv[i + 1], process.argv[i + 2]]; };
const values = Object.fromEntries((arg('--at', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), Number(v)]; }));
const loads = all('--load').map((spec) => {
  const [comp, rest] = spec.includes('@') ? spec.split('@') : spec.split('=');
  if (comp === undefined || rest === undefined) throw new Error(`--load ${spec}: write comp=fx,fy,fz or comp@<N·m>`);
  return spec.includes('@') ? { component: comp, torque: Number(rest) } : { component: comp, force: rest.split(',').map(Number) };
});
const t = Number(arg('--t', '0'));
const steps = has('--steps') ? Math.max(2, Math.round(Number(arg('--steps', '9')))) : null;
const json = has('--json');
const f = (x, n = 4) => (Number.isFinite(x) ? +x.toFixed(n) : x === Infinity ? '∞' : x);

const kin = await flatten(doc, benchRef, { facesOf });
for (const w of kin.warnings) console.error(`! ${w.msg}`);
const axes = axesOf(kin);
if (!axes.length) { console.error('this document has nothing to differentiate against: no `inputs` and no `drive`. A mechanism needs a degree of freedom.'); process.exit(2); }
const chosen = has('--input') ? [axisNamed(kin, arg('--input'))].filter(Boolean) : axes;
if (!chosen.length) { console.error(`no input named \`${arg('--input')}\`; this document has ${axes.map((a) => a.name).join(', ')}`); process.exit(2); }

const out = { document: src, axes: axes.map((a) => ({ name: a.name, unit: a.unit, min: a.min, max: a.max, time: !!a.time })), warnings: kin.warnings, per: [] };
const span = pairAfter('--span');
const point = arg('--point') ? (() => { const [c, p] = arg('--point').split('='); return { id: c, local: (p || '0,0,0').split(',').map(Number) }; })() : null;

for (const axis of chosen) {
  const at = axis.time ? t : (values[axis.name] ?? axis.default ?? 0);
  const r = rates(kin, axis, { values, t });
  const sweep = sweepRates(kin, axis, { steps, values, t });
  const sec = { axis: axis.name, unit: axis.unit, min: axis.min, max: axis.max, at, steps: sweep.samples.length, moving: sweep.moving.map((p) => ({ id: p.id, rate: p.max, min: p.min, turn: p.turn, travel: p.travel, turned: p.turned, net: p.net, netTurn: p.netTurn, advantage: p.max > 1e-12 ? 1 / p.max : Infinity, deadAt: p.deadAt })), still: sweep.per.filter((p) => !p.moves).map((p) => p.id) };
  // an invariant holds over the WHOLE input, not at the one state asked about:
  // a span rate reading zero at a dead point says nothing, so the span is
  // measured at every sample and the worst of them is what decides
  if (span) {
    const each = sweep.samples.map((x) => ({ at: x.at, distance: spanAt(x, span[0], span[1]), rate: spanRate(x, span[0], span[1]) }));
    const worst = each.reduce((a, b) => (Math.abs(b.rate) > Math.abs(a.rate) ? b : a));
    sec.span = { between: span, at: spanAt(r, span[0], span[1]), rate: spanRate(r, span[0], span[1]), worst: worst.rate, worstAt: worst.at, min: Math.min(...each.map((x) => x.distance)), max: Math.max(...each.map((x) => x.distance)), invariant: Math.abs(worst.rate) < 1e-9 };
  }
  if (point) { const pr = pointRate(r, point.id, point.local); sec.point = { id: point.id, local: point.local, at: pr.at, d: pr.d, speed: pr.speed }; }
  if (loads.length) sec.effort = effortFor(r, loads);
  if (has('--of')) sec.curve = sweep.samples.map((s) => { const q = ratioOf(s, arg('--of')); return { at: s.at, rate: q.rate, advantage: q.advantage, turn: q.dturn }; });
  out.per.push(sec);

  if (json) continue;
  console.log(`\n${axis.name}  ${f(axis.min)}…${f(axis.max)} ${axis.unit}${axis.time ? '  (one period of the drive)' : ''}  ·  ${sweep.samples.length} states, ${sec.moving.length} of ${sweep.per.length} components moving`);
  console.log(`  ${'part'.padEnd(18)} ${'rate'.padStart(12)}  ${'advantage'.padStart(10)}  ${'travel'.padStart(11)}  ${'turn'.padStart(11)}`);
  for (const m of sec.moving) console.log(`  ${m.id.padEnd(18)} ${String(f(m.rate)).padStart(12)}  ${String(m.rate > 1e-12 ? f(m.advantage, 3) : '—').padStart(10)}  ${String(f(m.travel, 3)).padStart(11)}  ${String(f(m.turned, 2)).padStart(11)}°${m.deadAt.length ? `   dead at ${m.deadAt.map((x) => f(x, 3)).join(', ')}` : ''}`);
  console.log(`  rate is mm (or °) per ${axis.unit}, at the fastest state; advantage is its reciprocal — a part moving half as far carries twice the force; travel and turn are over the whole of the input, end to end.`);
  if (sec.still.length) console.log(`  still: ${sec.still.join(', ')}`);
  if (sec.span) console.log(`  span ${span[0]}…${span[1]}: ${f(sec.span.at)} mm here, ${f(sec.span.min)}…${f(sec.span.max)} mm over the input, changing at ${f(sec.span.rate, 6)} mm per ${axis.unit} here and at most ${f(sec.span.worst, 6)} (at ${f(sec.span.worstAt, 3)} ${axis.unit})${sec.span.invariant ? '  — AN INVARIANT: it does not change anywhere on this input' : ''}`);
  if (sec.point) console.log(`  ${point.id} at (${point.local.join(', ')}): now at (${sec.point.at.map((x) => f(x, 3)).join(', ')}) mm, moving ${f(sec.point.speed)} mm per ${axis.unit}`);
  if (sec.effort) console.log(`  effort to hold ${loads.map((l) => `${l.component} ${l.force ? `(${l.force.join(', ')}) N` : `${l.torque} N·m`}`).join(' + ')}: ${f(sec.effort.effort)} ${sec.effort.unit} at ${axis.name} — lossless, so a floor`);
  if (sec.curve) { console.log(`  ${arg('--of')} through the input:`); for (const c of sec.curve) console.log(`    ${String(f(c.at, 3)).padStart(9)} ${axis.unit}   ${String(f(c.rate)).padStart(11)}   advantage ${f(c.advantage, 3)}`); }
}
if (json) console.log(JSON.stringify(out, null, 1));
