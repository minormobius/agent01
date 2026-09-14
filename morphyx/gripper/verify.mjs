// verify.mjs — the posed document against the closed form, everywhere.
//
// This is the check the travel bugs would have failed. In v4 and again in v9 a
// component was both placed by an expression and moved by a mate, and the links
// stretched — 40 mm becoming 34 — while every part still built and the
// interference gate stayed green, because a stretched linkage does not
// necessarily collide with anything. So: pose the real document through the
// kernel's own solver and compare it with `pose()`, which knows nothing about
// the document.
//
// Two invariants carry the whole thing:
//
//   * an arm pin stands exactly the link's length from its jaw pin, at every
//     grip and every roll — the linkage is a linkage;
//   * ROLLING DOES NOT CHANGE THE GRIP. Each jaw's distance from the roll axis
//     is a function of `grip` alone, and the pair's bearing is `roll` alone.
//     That is the property the whole v10 frame exists to have, and it is the
//     one a differential has to reproduce in the drivetrain.
//
// The grid checks the corners; a LISSAJOUS walks the interior. Two
// incommensurate rates sweep grip × roll densely without ever repeating a
// state, which is exactly the demo motion — and here it is 400 states of
// kinematics for the price of no geometry at all.
//
//   node verify.mjs /path/to/cad [--lissajous 400]
import fs from 'node:fs';
import path from 'node:path';
const cad = process.argv[2] || process.env.CAD || '/tmp/cad';
const { flatten, solveAngles, modelOf, gridStates } = await import(path.join(cad, 'lib/assembly.js'));
const { benchRef, facesOf } = await import(path.join(cad, 'agent/common.mjs'));
const here = path.dirname(new URL(import.meta.url).pathname);
const g = await import(path.join(here, 'gripper.mjs'));
const doc = JSON.parse(fs.readFileSync(path.join(here, 'gripper.json')));
const { components, mates, drive, inputs, warnings } = await flatten(doc, benchRef, { facesOf });
const D = g.D;
console.log(`${components.length} components, ${mates.length} joints, ${inputs.map((i) => i.name).join(' × ')}, ${warnings.length} warnings`);
for (const w of warnings) console.log(`  ! ${w.msg}`);

let bad = 0, checked = 0;
const near = (a, b, tol, what) => { checked++; if (!(Math.abs(a - b) < tol)) { bad++; if (bad < 25) console.log(`  ✗ ${what}: ${a.toFixed(5)} vs ${b.toFixed(5)}`); } };
const deg = (v) => (v * 180) / Math.PI;

function at(values) {
  const a = solveAngles(components, mates, drive, 0, values);
  const M = Object.fromEntries(components.map((c) => [c.id, modelOf(c, a)]));
  const P = (id) => [M[id][12], M[id][13], M[id][14]];
  const { grip, roll } = values;
  const p = g.pose(D.xpClosed + grip);
  // the linkage is still a linkage
  for (const k of [0, 1]) {
    const ap = P(`arm-pin[${k}]`), jp = P(`jaw-pin[${k}]`);
    near(Math.hypot(jp[0] - ap[0], jp[1] - ap[1], jp[2] - ap[2]), D.link, 1e-6, `grip ${grip} roll ${roll}: arm pin to jaw pin [${k}]`);
  }
  // rolling does not change the grip: each jaw's radius from the axis is grip alone
  for (const k of [0, 1]) {
    const c = P(`carrier[${k}]`);
    near(Math.hypot(c[0], c[2]), p.xf, 1e-6, `grip ${grip} roll ${roll}: carrier[${k}] off the axis`);
    near(c[1], 0, 1e-9, `grip ${grip} roll ${roll}: carrier[${k}] stays on its own plane`);
  }
  // and the pair's bearing is roll alone
  const c0 = P('carrier[0]');
  const turn = (a) => { const d = (((a % 360) + 540) % 360) - 180; return d; };   // the shortest way round, so 0 and 360 are the same place
  near(turn(deg(Math.atan2(-c0[2], c0[0])) - roll), 0, 1e-6, `grip ${grip} roll ${roll}: the jaw pair's bearing`);
  // the plunger rides the rotor: its centre stays on the axis at every roll
  for (const id of ['carriage', 'carriage-back', 'nut', 'rotor-plate']) near(Math.hypot(P(id)[0], P(id)[2]), 0, 1e-9, `grip ${grip} roll ${roll}: ${id} on the axis`);
  // and the stator does not move at all
  for (const id of ['motor-web', 'bearing-housing', 'shroud', 'motor']) { const q = P(id); near(Math.hypot(q[0], q[1], q[2]), 0, 1e-12, `roll ${roll}: ${id} is the stator`); }
}

console.log('— the grid, at its corners and middle —');
for (const st of gridStates(inputs, { steps: 3 })) at(st.values);
console.log(`  ${checked} comparisons, ${bad} off`);

const N = Number((process.argv.find((a) => a.startsWith('--lissajous')) || '').split('=')[1] || (process.argv.includes('--lissajous') ? process.argv[process.argv.indexOf('--lissajous') + 1] : 0)) || 200;
const before = checked;
console.log(`— a Lissajous through the interior, ${N} states —`);
const [gI, rI] = [inputs.find((i) => i.name === 'grip'), inputs.find((i) => i.name === 'roll')];
const PHI = (1 + Math.sqrt(5)) / 2;                       // incommensurate, so no state is ever revisited
for (let n = 0; n < N; n++) {
  const t = n / N;
  at({ grip: gI.min + (gI.max - gI.min) * (1 - Math.cos(2 * Math.PI * t)) / 2,
       roll: rI.min + (rI.max - rI.min) * (1 - Math.cos(2 * Math.PI * PHI * t)) / 2 });
}
console.log(`  ${checked - before} comparisons, ${bad} off in total`);
console.log(bad ? `${bad} MISMATCHES` : 'the document and the closed form agree at every grip and every roll');
process.exit(bad ? 1 : 0);
