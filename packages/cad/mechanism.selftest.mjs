#!/usr/bin/env node
// mechanism.selftest.mjs — the virtual-work instrument against closed forms.
//
// Every number here is one a person can derive on paper: a part on a rotor at
// radius r moves r·π/180 per degree; a prismatic joint with scale −1 moves its
// follower exactly one for one; a crank–slider's block moves at the derivative
// of r·cosθ + √(L² − r²sin²θ), and stops dead at top centre; a force on a jaw
// needs F·r of torque at the wrist. If the instrument and the paper disagree,
// one of them is wrong and it is not the paper.
import fs from 'node:fs';
import path from 'node:path';
import { flatten, periodOf } from './lib/assembly.js';
import { axesOf, axisNamed, rates, ratioOf, pointRate, spanRate, spanAt, effortFor, sweepRates } from './lib/mechanism.js';
import { benchRef, facesOf, ROOT } from './agent/common.mjs';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const bench = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', `${n}.json`), 'utf8'));
const t0 = Date.now();

// 1. the gripper's two inputs: one for one, and r·π/180
{
  const kin = await flatten(bench('grip'), benchRef, { facesOf });
  const axes = axesOf(kin);
  check(axes.map((a) => `${a.name}/${a.unit}`).join() === 'grip/mm,roll/deg' && !axes.some((a) => a.time), `a document's inputs are its axes: ${axes.map((a) => `${a.name} ${a.min}…${a.max} ${a.unit}`).join(', ')}`);
  const grip = axisNamed(kin, 'grip'), roll = axisNamed(kin, 'roll');
  const g = rates(kin, grip, { values: { grip: 6, roll: 0 } });
  const l = ratioOf(g, 'jaw-l'), r = ratioOf(g, 'jaw-r');
  check(near(r.d[0], 1) && near(l.d[0], -1) && near(r.speed, 1) && near(ratioOf(g, 'rotor').speed, 0) && near(ratioOf(g, 'base').speed, 0), `a prismatic joint on one input moves both jaws one for one and nothing else at all: d(jaw-r)/d(grip) = (${r.d.map((v) => +v.toFixed(6)).join(', ')}), d(jaw-l) = (${l.d.map((v) => +v.toFixed(6)).join(', ')})`);
  check(near(r.advantage, 1), `…so the mechanical advantage is ${r.advantage.toFixed(4)}: this linkage trades nothing`);
  // the jaws separate at 2 mm per mm, and ROLLING DOES NOT CHANGE THE GRIP
  const rr = rates(kin, roll, { values: { grip: 6, roll: 30 } });
  check(near(spanRate(g, 'jaw-l', 'jaw-r'), 2) && near(spanAt(g, 'jaw-l', 'jaw-r'), 24) && Math.abs(spanRate(rr, 'jaw-l', 'jaw-r')) < 1e-9, `the invariant an author writes an oracle for, as one number: the jaws are ${spanAt(g, 'jaw-l', 'jaw-r')} mm apart and open at ${spanRate(g, 'jaw-l', 'jaw-r')} mm per mm, and rolling changes that by ${spanRate(rr, 'jaw-l', 'jaw-r').toExponential(1)}`);
  // a part at radius r on a rotor must move exactly r·π/180 per degree
  for (const [g0, radius] of [[0, 6], [12, 18]]) {
    const rate = ratioOf(rates(kin, roll, { values: { grip: g0, roll: 45 } }), 'jaw-r').speed;
    check(near(rate, (radius * Math.PI) / 180, 1e-7), `at grip ${g0} the jaw sits at r = ${radius}, and a degree of roll moves it ${rate.toFixed(7)} mm against r·π/180 = ${((radius * Math.PI) / 180).toFixed(7)}`);
  }
  // statics: the torque at the wrist that holds a force at a jaw is F·r
  const hold = effortFor(rates(kin, roll, { values: { grip: 12, roll: 0 } }), [{ component: 'jaw-r', force: [0, 100, 0] }]);
  check(hold.unit === 'N·m' && near(hold.effort, 1.8, 1e-6), `100 N tangential at a jaw 18 mm out needs ${hold.effort.toFixed(4)} ${hold.unit} at the wrist — F·r, and the instrument does not need to be told that`);
  const push = effortFor(rates(kin, grip, { values: { grip: 6, roll: 0 } }), [{ component: 'jaw-r', force: [50, 0, 0] }, { component: 'jaw-l', force: [-50, 0, 0] }]);
  check(push.unit === 'N' && near(push.effort, 100, 1e-6), `and 50 N on each jaw is ${push.effort.toFixed(2)} ${push.unit} at the input: both jaws do work, and both are counted`);
  // travel: the integral of the rate over the whole input, which is the number
  // a person actually asks for — how far does the jaw go, end to end?
  const sg = sweepRates(kin, grip, { steps: 9 }), sr = sweepRates(kin, roll, { steps: 9, values: { grip: 12 } });
  const jr = sg.per.find((p) => p.id === 'jaw-r'), rotor = sr.per.find((p) => p.id === 'rotor');
  check(near(jr.travel, 12, 1e-6) && near(rotor.turned, 180, 1e-6) && near(sr.per.find((p) => p.id === 'jaw-r').travel, (18 * Math.PI) / 180 * 180, 1e-4), `over the whole of an input, the travel: the jaw runs ${jr.travel.toFixed(4)} mm over grip 0…12, the rotor turns ${rotor.turned.toFixed(2)}° over roll 0…180, and the jaw rides ${sr.per.find((p) => p.id === 'jaw-r').travel.toFixed(3)} mm round with it — an arc of r·π`);
}

// 2. the crank–slider against calculus, and its dead points
{
  const kin = await flatten(bench('crank'), benchRef);
  const axes = axesOf(kin);
  check(axes.length === 1 && axes[0].name === 't' && axes[0].unit === 's' && near(axes[0].max, periodOf(kin.drive)), `a driven document differentiates against time: ${axes[0].name} over ${axes[0].max} s`);
  // x(θ) = r cos θ + √(L² − r² sin²θ), and θ = 180·t degrees at 30 rpm
  const r = 10, L = 30, w = Math.PI; // rad/s
  const dxdt = (t) => { const th = w * t; return (-r * Math.sin(th) - (r * r * Math.sin(th) * Math.cos(th)) / Math.sqrt(L * L - r * r * Math.sin(th) ** 2)) * w; };
  for (const t of [0.13, 0.37, 0.61]) {
    const got = ratioOf(rates(kin, axes[0], { t }), 'block').d[0];
    check(near(got, dxdt(t), 2e-5), `at t = ${t} s the block moves ${got.toFixed(5)} mm/s against the closed form's ${dxdt(t).toFixed(5)}`);
  }
  const sweep = sweepRates(kin, axes[0], { steps: 12 });
  const block = sweep.per.find((p) => p.id === 'block');
  check(block.deadAt.length === 2 && block.deadAt.every((x) => near(x % 1, 0, 1e-9)), `the slider stops dead twice a turn, at t = ${block.deadAt.map((x) => +x.toFixed(3)).join(' and ')} s — top and bottom centre, where the advantage is infinite and a period's ends are the same state`);
  check(sweep.moving[0].id === 'block' || sweep.moving[0].id === 'rod', `and the sweep ranks what moves: ${sweep.moving.map((m) => `${m.id} ${m.max.toFixed(1)}`).join(', ')} mm/s`);
}

// 3. it costs nothing: no meshes, no kernel, two poses per rate
{
  const kin = await flatten(bench('clock'), benchRef, { facesOf });
  const axis = axesOf(kin)[0];
  const t1 = Date.now();
  const s = sweepRates(kin, axis, { steps: 24 });
  const ms = Date.now() - t1;
  const minute = s.per.find((p) => p.id === 'minute-hand'), hour = s.per.find((p) => p.id === 'hour-hand');
  // An escapement does not run at its average: the wheel is locked for most of
  // a beat and slides over the rest, so every number below is read off ONE
  // state — the fastest sample — and the ratios asserted are the ones the
  // motion works guarantee at every state, not the mean the clock face keeps.
  const fast = s.samples.reduce((a, b) => (Math.abs(b.of.get('minute-hand').dturn) > Math.abs(a.of.get('minute-hand').dturn) ? b : a));
  const dm = fast.of.get('minute-hand').dturn, dh = fast.of.get('hour-hand').dturn;
  // a hand pinned at its own boss does not travel: its TURN is the motion
  check(near(minute.max, 0, 1e-9) && minute.moves && near(minute.turn, Math.abs(dm), 1e-12) && near(dm / dh, 12, 1e-9), `a hand pinned at its boss has a rate of zero and turns instead: at its fastest the minute hand runs ${Math.abs(dm).toFixed(4)} °/s and the hour hand a twelfth of that, exactly — the motion works' 12:1, at whatever speed the escapement happens to be letting through — and the sweep still calls both of them moving`);
  // and the number a clock is actually judged on: how far the hands advanced,
  // end to end. Twelve uniform samples cannot integrate an impulsive motion,
  // so this is read from the two END poses, exactly — 30 escape teeth make
  // 12° a beat, the minute hand 0.1°, and the hour hand a twelfth of that.
  const esc = s.per.find((p) => p.id === 'escape');
  check(near(Math.abs(minute.netTurn), 0.2, 1e-9) && near(minute.netTurn / hour.netTurn, 12, 1e-9) && near(Math.abs(esc.netTurn), 24, 1e-9), `over one period — two beats — the escape wheel steps ${Math.abs(esc.netTurn)}° (two of thirty teeth), the minute hand advances ${Math.abs(minute.netTurn)}° and the hour hand ${Math.abs(hour.netTurn).toFixed(5)}°, a twelfth of it. Sampling cannot integrate an escapement; two end poses do not have to.`);
  const tip = pointRate(fast, 'minute-hand', [24, 0, 0]);
  check(near(tip.speed, 24 * Math.abs(dm) * (Math.PI / 180), 1e-9) && ms < 2000, `and the TIP of that hand, 24 mm out, moves ${tip.speed.toFixed(6)} mm/s — r·ω at the same state, from the same two poses. ${kin.components.length} components over 24 states in ${ms} ms, with no geometry built at all`);
}

console.log(`\n${Date.now() - t0} ms`);
console.log(fails ? `✗ ${fails} failing` : '✓ mechanism selftest passed');
process.exit(fails ? 1 : 0);
