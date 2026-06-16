// course.selftest.mjs — the procedural gate course + pass detection.
//
//   node duck/test/course.selftest.mjs
//
// Determinism, geometry sanity, and the crossing test: a synthetic path straight
// through a gate centre is detected; a backward pass and an off-axis miss are not.

import { vec3 } from '../js/math.js';
import { generateCourse, crossedGate } from '../js/course.js';

let pass = 0, fail = 0;
const approx = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
function check(name, cond, extra = '') {
  if (cond) pass++; else { fail++; console.error(`  ✗ ${name}${extra ? '  — ' + extra : ''}`); }
}

// ── determinism + shape ──
{
  const a = generateCourse({ mode: 'earth', seed: 5 });
  const b = generateCourse({ mode: 'earth', seed: 5 });
  check('earth course is deterministic for a seed', JSON.stringify(a) === JSON.stringify(b));
  const c = generateCourse({ mode: 'earth', seed: 6 });
  check('a different seed gives a different course', JSON.stringify(a) !== JSON.stringify(c));
  check('8 gates + a pad', a.gates.length === 8 && a.pad && a.pad.r > 0);
  check('every gate fwd is a unit vector', a.gates.every((g) => approx(vec3.len(g.fwd), 1, 1e-6)));
  check('every gate has positive radius', a.gates.every((g) => g.r > 0));
}

// ── the first gate is dead ahead of the spawn ──
{
  const sp = [0, 240, 0], sf = [0, 0, -1];
  const { gates } = generateCourse({ mode: 'earth', seed: 2, start: { pos: sp, fwd: sf } });
  const to = vec3.normalize([0, 0, 0], vec3.sub([0, 0, 0], gates[0].pos, sp));
  check('first gate lies along the spawn heading', vec3.dot(to, sf) > 0.98, `dot=${vec3.dot(to, sf).toFixed(3)}`);
  check('first gate is at the spawn altitude', approx(gates[0].pos[1], sp[1], 1e-6));
  // cylinder: spawn facing +z, first gate ahead in +z at the same radius
  const R = 900, len = 1400, csp = [0, -(R - 60), len * 0.15], csf = [0, 0, 1];
  const cc = generateCourse({ mode: 'cylinder', R, len, seed: 2, start: { pos: csp, fwd: csf } });
  check('cyl first gate is ahead (+z) of the spawn', cc.gates[0].pos[2] > csp[2]);
  check('cyl first gate keeps the spawn radius', approx(Math.hypot(cc.gates[0].pos[0], cc.gates[0].pos[1]), R - 60, 1e-6));
}

// ── cylinder course sits inside the hull, above the floor ──
{
  const R = 900, len = 1400;
  const { gates, pad } = generateCourse({ mode: 'cylinder', R, len, seed: 3 });
  check('cylinder gates are inside the hull (rho < R)', gates.every((g) => Math.hypot(g.pos[0], g.pos[1]) < R));
  check('cylinder gates clear the floor (rho < R−30)', gates.every((g) => Math.hypot(g.pos[0], g.pos[1]) < R - 30));
  check('gates advance down the axis (z increasing)', gates.every((g, i) => i === 0 || g.pos[2] >= gates[i - 1].pos[2]));
  check('pad sits on the floor (rho ≈ R−1)', approx(Math.hypot(pad.pos[0], pad.pos[1]), R - 1, 0.5));
  check('pad is within the modelled length', pad.pos[2] <= len - 5);
}

// ── the crossing test ──
{
  const gate = { pos: [0, 100, 0], fwd: [0, 0, -1], r: 16 };
  // dead-centre, travelling −Z (the +fwd direction)
  check('straight through the centre is a pass', crossedGate([0, 100, 20], [0, 100, -20], gate));
  // same geometry but travelling the OTHER way → not a forward pass
  check('passing backward does not count', !crossedGate([0, 100, -20], [0, 100, 20], gate));
  // crosses the plane but 30 m off-axis → misses the ring
  check('off-axis crossing misses the ring', !crossedGate([30, 100, 20], [30, 100, -20], gate));
  // just inside the rim
  check('a pass near the rim still counts', crossedGate([14, 100, 5], [14, 100, -5], gate));
  // just outside the rim
  check('a pass just outside the rim misses', !crossedGate([18, 100, 5], [18, 100, -5], gate));
  // a segment entirely on one side never triggers
  check('no crossing when both ends are in front', !crossedGate([0, 100, 10], [0, 100, 5], gate));
}

// ── flying each gate along its own axis clears all 12, in order ──
{
  const { gates } = generateCourse({ mode: 'cylinder', R: 900, len: 1400, seed: 9 });
  let idx = 0;
  for (const g of gates) {
    // a short, finely-sampled segment straight through this gate's centre
    const start = vec3.scaleAndAdd([0, 0, 0], g.pos, g.fwd, -10);
    let prev = start;
    const steps = 24;
    for (let s = 1; s <= steps; s++) {
      const cur = vec3.scaleAndAdd([0, 0, 0], g.pos, g.fwd, -10 + (20 * s) / steps);
      if (idx < gates.length && crossedGate(prev, cur, gates[idx])) idx++;
      prev = cur;
    }
  }
  check('flying through every centre clears all gates in order', idx === gates.length, `cleared ${idx}`);
}

console.log(`\nduck/course: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
