// physics.selftest.mjs — proves the two-frame physics kernel is honest.
//
//   node duck/test/physics.selftest.mjs
//
// The headline test (TEST 4) is the strong one: integrate a FREE particle in the
// cylinder's co-rotating frame using only cylinderAccel(), rotate the trajectory
// back into the inertial frame, and assert it comes out a STRAIGHT LINE at
// constant velocity. A free body must travel straight in an inertial frame, so if
// our centrifugal + Coriolis terms (or their signs) were wrong, this would bend.

import { vec3 } from '../js/math.js';
import {
  G0, CYLINDERS, makeCylinder, earthAccel, cylinderAccel,
  cylinderForces, invariant, toInertial, downDir,
} from '../js/physics.js';

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function check(name, cond, extra = '') {
  if (cond) { pass++; }
  else { fail++; console.error(`  ✗ ${name}${extra ? '  — ' + extra : ''}`); }
}

// RK4 step of a free particle under a frame's body acceleration only.
function accelFn(mode, omega) {
  return (pos, vel, out) => mode === 'cylinder'
    ? cylinderAccel(out, pos, vel, omega)
    : earthAccel(out);
}
function rk4(pos, vel, dt, A) {
  const a1 = [0, 0, 0], a2 = [0, 0, 0], a3 = [0, 0, 0], a4 = [0, 0, 0];
  const p2 = [0, 0, 0], v2 = [0, 0, 0], p3 = [0, 0, 0], v3 = [0, 0, 0], p4 = [0, 0, 0], v4 = [0, 0, 0];
  A(pos, vel, a1);
  vec3.scaleAndAdd(p2, pos, vel, dt / 2); vec3.scaleAndAdd(v2, vel, a1, dt / 2); A(p2, v2, a2);
  vec3.scaleAndAdd(p3, pos, v2, dt / 2); vec3.scaleAndAdd(v3, vel, a2, dt / 2); A(p3, v3, a3);
  vec3.scaleAndAdd(p4, pos, v3, dt); vec3.scaleAndAdd(v4, vel, a3, dt); A(p4, v4, a4);
  const np = [
    pos[0] + (dt / 6) * (vel[0] + 2 * v2[0] + 2 * v3[0] + v4[0]),
    pos[1] + (dt / 6) * (vel[1] + 2 * v2[1] + 2 * v3[1] + v4[1]),
    pos[2] + (dt / 6) * (vel[2] + 2 * v2[2] + 2 * v3[2] + v4[2]),
  ];
  const nv = [
    vel[0] + (dt / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]),
    vel[1] + (dt / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]),
    vel[2] + (dt / 6) * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]),
  ];
  return [np, nv];
}

// ── TEST 1 — canonical hoop numbers (research.js: 8 km / 0.8 g, ω≈0.0313) ──
{
  const cyl = makeCylinder(CYLINDERS.find((c) => c.id === 'hoop'));
  check('hoop ω ≈ 0.0313 rad/s', approx(cyl.omega, Math.sqrt(G0 / 10000), 1e-9));
  check('hoop floor gravity ≈ 0.8 g', approx(cyl.gFloor, 0.8 * G0, 1e-9), `got ${cyl.gFloor.toFixed(4)}`);
  check('hoop floor accel ≈ 7.848 m/s²', approx(cyl.gFloor, 7.848, 1e-3));
  check('hoop rim speed ≈ 250.6 m/s', approx(cyl.rimSpeed, cyl.omega * 8000, 1e-9));
  // every preset reproduces its target floor gravity
  for (const p of CYLINDERS) {
    const c = makeCylinder(p);
    check(`${p.id} floor = ${p.g} g`, approx(c.gFloor, p.g * G0, 1e-9), `got ${(c.gFloor / G0).toFixed(3)} g`);
  }
}

// ── TEST 2 — centrifugal points outward, vanishes on the axis ──
{
  const omega = 0.1;
  const out = [0, 0, 0];
  cylinderAccel(out, [50, 0, 0], [0, 0, 0], omega);   // at rest: Coriolis is zero
  check('centrifugal is purely outward (+x) on +x wall', out[0] > 0 && approx(out[1], 0) && approx(out[2], 0));
  check('centrifugal magnitude = ω²r', approx(out[0], omega * omega * 50));
  cylinderAccel(out, [0, 0, 123], [0, 0, 0], omega);  // on the axis
  check('no spin gravity on the axis', approx(out[0], 0) && approx(out[1], 0) && approx(out[2], 0));
  check('axial position feels nothing (z is free)', approx(out[2], 0));
}

// ── TEST 3 — Coriolis sign: moving "up" toward the axis deflects spinward ──
{
  const omega = 0.1;
  const { cf, cor } = cylinderForces([100, 0, 0], [-5, 0, 0], omega); // climbing inward (−x)
  check('climbing inward gives +y Coriolis (spinward deflection)', cor[1] > 0, `cor=${cor}`);
  check('centrifugal still outward while climbing', cf[0] > 0);
  // a body at rest has no Coriolis term, only centrifugal
  const f0 = cylinderForces([100, 0, 0], [0, 0, 0], omega);
  check('rest ⇒ zero Coriolis', approx(f0.cor[0], 0) && approx(f0.cor[1], 0));
}

// ── TEST 4 — THE PROOF: free fall in the rotating frame is straight in inertial ──
{
  const omega = 0.15;
  // drop a breadcrumb from the floor at rest in the rotating frame
  let pos = [200, 0, 0], vel = [0, 0, 0];
  const dt = 1 / 240;
  const A = accelFn('cylinder', omega);
  const samples = [];
  for (let i = 0; i <= 1200; i++) {
    const t = i * dt;
    samples.push([toInertial([0, 0, 0], pos, omega, t), t]);
    [pos, vel] = rk4(pos, vel, dt, A);
  }
  // fit a line through the inertial samples; residual must be ~0 (it's straight)
  const [p0] = samples[0];
  const [pN, tN] = samples[samples.length - 1];
  const dir = vec3.normalize([0, 0, 0], vec3.sub([0, 0, 0], pN, p0));
  let maxResid = 0;
  for (const [p] of samples) {
    const d = vec3.sub([0, 0, 0], p, p0);
    const along = vec3.dot(d, dir);
    const perp = vec3.len(vec3.sub([0, 0, 0], d, vec3.scale([0, 0, 0], dir, along)));
    maxResid = Math.max(maxResid, perp);
  }
  check('free particle is STRAIGHT in the inertial frame', maxResid < 0.05,
    `max perpendicular residual = ${maxResid.toExponential(2)} m over a ${vec3.len(vec3.sub([0,0,0],pN,p0)).toFixed(1)} m flight`);
  // and it must actually have moved (a real, non-degenerate trajectory)
  check('the trajectory is non-trivial', vec3.len(vec3.sub([0, 0, 0], pN, p0)) > 1, `flew ${tN.toFixed(1)} s`);
}

// ── TEST 5 — the Jacobi integral is conserved in the rotating frame ──
{
  const omega = 0.12;
  let pos = [150, 30, 0], vel = [4, -2, 1];
  const A = accelFn('cylinder', omega);
  const J0 = invariant('cylinder', pos, vel, omega);
  const dt = 1 / 240;
  for (let i = 0; i < 4000; i++) [pos, vel] = rk4(pos, vel, dt, A);
  const J1 = invariant('cylinder', pos, vel, omega);
  check('Jacobi integral conserved (rotating frame is conservative)',
    approx(J1, J0, 1e-3 * Math.max(1, Math.abs(J0))), `J0=${J0.toFixed(4)} J1=${J1.toFixed(4)}`);
}

// ── TEST 6 — earth ballistics conserve specific energy ──
{
  let pos = [0, 100, 0], vel = [12, 5, -3];
  const A = accelFn('earth', 0);
  const E0 = invariant('earth', pos, vel, 0);
  const dt = 1 / 240;
  for (let i = 0; i < 2000; i++) [pos, vel] = rk4(pos, vel, dt, A);
  const E1 = invariant('earth', pos, vel, 0);
  check('earth ballistic energy conserved', approx(E1, E0, 1e-4 * Math.max(1, Math.abs(E0))),
    `E0=${E0.toFixed(4)} E1=${E1.toFixed(4)}`);
}

// ── TEST 7 — downDir points the right way in both frames ──
{
  const d = [0, 0, 0];
  downDir(d, 'earth', [10, 20, 30]);
  check('earth down = −Y', approx(d[0], 0) && approx(d[1], -1) && approx(d[2], 0));
  downDir(d, 'cylinder', [0, 80, 5]);
  check('cylinder down = radially outward', approx(d[0], 0) && approx(d[1], 1) && approx(d[2], 0));
}

console.log(`\nduck/physics: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
