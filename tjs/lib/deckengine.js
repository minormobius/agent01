// deckengine.js — deck-aware motion + torque analysis. Given a deck and a device
// id, it plans a jerk-limited move on that device's joints and simulates the
// per-motor torque demand vs. the stepper pullout envelope — exactly like the
// single-machine engine, but the reflected load now includes EVERYTHING mounted
// on that device's carriage (transitively). Bolt two Z axes + tools onto an HBot
// and its belt motors feel the extra inertia; that is the point of the deck.
//
// Output `sim` is shaped for the generalized scope: dynamic axisKeys/motorKeys,
// per-key column arrays, a verdict, and a colour map. Pure module (node-safe).

import { planMove, makeEvaluator } from './scurve.js';
import { makeMotor, STEPPER_PRESETS } from './motor.js';
import { beltForces, rackingMoment, reflectedInertiaScrew, GRAVITY } from './kinematics.js';
import { DEVICE_TYPES, TOOLS } from './devices.js';

// Drivetrain constants (could become per-device params later).
const PULLEY_INERTIA = 3.0e-6, SCREW_INERTIA = 9.0e-6;
const SCREW_EFF = 0.9, BELT_FRIC_N = 2.0, SCREW_FRIC_N = 1.5;

const AXIS_PALETTE = ['#39d6c8', '#ffb454', '#7ee787', '#c08cff', '#ff7ab6', '#8ac6ff'];

// ---- mass model ------------------------------------------------------------
export function toolMass(dev) {
  const t = TOOLS[dev.tool] || TOOLS.none;
  return t.mass + (dev.payload ? t.payload : 0);
}
function ownMass(dev) {
  const p = dev.params || {};
  const base = dev.type === 'hbot' ? (p.beamMass || 0) + (p.carriageMass || 0) : (p.carriageMass || 0);
  return base + toolMass(dev);
}
// Total rigid mass of a device + its whole subtree (all of it translates when the
// device translates as a unit).
function rigidMass(deck, id) {
  const dev = deck.getDevice(id); if (!dev) return 0;
  let m = ownMass(dev);
  for (const c of deck.children(id)) m += rigidMass(deck, c.id);
  return m;
}
// Mass riding a device's carriage = sum of carriage-attached children's rigid mass.
export function carriageBorneMass(deck, id) {
  let m = 0;
  for (const c of deck.children(id)) if (c.mount.attach === 'carriage') m += rigidMass(deck, c.id);
  return m;
}

// ---- per-device joints + state --------------------------------------------
export function deviceJoints(dev) {
  if (dev.type === 'hbot') return ['x', 'y'];
  if (dev.type === 'linear') return ['p'];
  return [];
}
export function defaultState(dev) {
  if (dev.type === 'hbot') return { x: dev.params.bedX / 2, y: dev.params.bedY / 2 };
  if (dev.type === 'linear') return { p: 0 };
  return {};
}
function curState(deck, id, stateMap) {
  const dev = deck.getDevice(id);
  return { ...defaultState(dev), ...(stateMap[id] || dev.previewState || {}) };
}

// ---- planning --------------------------------------------------------------
export function planDeviceMove(deck, id, target, stateMap = {}) {
  const dev = deck.getDevice(id);
  if (!dev || !deviceJoints(dev).length) return null;
  const start = curState(deck, id, stateMap);
  const L = dev.params.limits;
  const axes = [];
  for (const k of deviceJoints(dev)) {
    const dist = (target[k] ?? start[k]) - start[k];
    if (Math.abs(dist) > 1e-9) axes.push({ key: k, distance: dist, vmax: L.vmax, amax: L.amax, jmax: L.jmax });
  }
  if (!axes.length) return null;
  const move = planMove(axes);
  move.start = start;
  move.deviceId = id;
  return move;
}

// ---- torque sample ---------------------------------------------------------
function sampleDevice(deck, id, move, t, ctx) {
  const dev = deck.getDevice(id);
  const ev = move.evaluators, s = move.start;
  const get = (k) => { if (!ev[k]) return { p: s[k], v: 0, a: 0, j: 0 }; const r = ev[k](t); return { p: s[k] + r.p, v: r.v, a: r.a, j: r.j }; };

  if (dev.type === 'hbot') {
    const X = get('x'), Y = get('y');
    const p = dev.params;
    const rMm = (p.pulleyTeeth * p.beltPitch) / (2 * Math.PI), rM = rMm / 1000;
    const Mx = p.carriageMass + toolMass(dev) + ctx.borne;
    const My = p.beamMass + Mx;
    const beltA = { v: X.v + Y.v, a: X.a + Y.a }, beltB = { v: X.v - Y.v, a: X.a - Y.a };
    const Fx = Mx * (X.a / 1000), Fy = My * (Y.a / 1000);
    const Fb = beltForces(Fx, Fy);
    const A = ctx.motors.A.evaluate({ omega: beltA.v / rMm, alpha: beltA.a / rMm, Jreflected: PULLEY_INERTIA, loadTorque: Fb.A * rM, friction: BELT_FRIC_N * rM });
    const B = ctx.motors.B.evaluate({ omega: beltB.v / rMm, alpha: beltB.a / rMm, Jreflected: PULLEY_INERTIA, loadTorque: Fb.B * rM, friction: BELT_FRIC_N * rM });
    return { axes: { x: X, y: Y }, motors: { A, B }, racking: rackingMoment(Fb.A, Fb.B, p.bedX) };
  }

  // linear
  const P = get('p');
  const p = dev.params;
  const mass = p.carriageMass + toolMass(dev) + ctx.borne;
  const vertical = p.axis === 'z';
  if (p.drive === 'screw') {
    const k = (2 * Math.PI) / p.lead, leadM = (p.lead / 1000) / (2 * Math.PI);
    const Jref = reflectedInertiaScrew(mass, p.lead) + SCREW_INERTIA;
    const grav = vertical ? (mass * GRAVITY * leadM) / SCREW_EFF : 0;
    const M = ctx.motors.M.evaluate({ omega: P.v * k, alpha: P.a * k, Jreflected: Jref, loadTorque: grav, friction: SCREW_FRIC_N * leadM });
    return { axes: { p: P }, motors: { M }, racking: 0 };
  }
  // belt linear
  const rMm = (p.pulleyTeeth * p.beltPitch) / (2 * Math.PI), rM = rMm / 1000;
  const F = mass * (P.a / 1000);
  const grav = vertical ? mass * GRAVITY * rM : 0;
  const M = ctx.motors.M.evaluate({ omega: P.v / rMm, alpha: P.a / rMm, Jreflected: PULLEY_INERTIA, loadTorque: F * rM + grav, friction: BELT_FRIC_N * rM });
  return { axes: { p: P }, motors: { M }, racking: 0 };
}

// ---- full simulation -------------------------------------------------------
export function simulateDevice(deck, id, move, n = 600) {
  const dev = deck.getDevice(id);
  const preset = STEPPER_PRESETS[dev.params.motor] || STEPPER_PRESETS['NEMA 17 (0.44 N·m)'];
  const motors = dev.type === 'hbot'
    ? { A: makeMotor(preset), B: makeMotor(preset) }
    : { M: makeMotor(preset) };
  const ctx = { borne: carriageBorneMass(deck, id), motors };
  const axisKeys = deviceJoints(dev), motorKeys = Object.keys(motors);
  const T = move.T || 1e-3;
  const out = {
    T, dt: T / n, time: new Array(n + 1), axisKeys, motorKeys,
    axes: Object.fromEntries(axisKeys.map((k) => [k, []])),
    motors: Object.fromEntries(motorKeys.map((k) => [k, []])),
    racking: [],
    verdict: { stall: {}, peakUtil: {}, overspeed: {}, anyStall: false },
    colors: { axis: {}, motor: {} },
  };
  axisKeys.forEach((k, i) => out.colors.axis[k] = AXIS_PALETTE[i % AXIS_PALETTE.length]);
  motorKeys.forEach((k, i) => out.colors.motor[k] = AXIS_PALETTE[i % AXIS_PALETTE.length]);
  for (const k of motorKeys) { out.verdict.stall[k] = false; out.verdict.peakUtil[k] = 0; out.verdict.overspeed[k] = false; }

  for (let i = 0; i <= n; i++) {
    const t = (T * i) / n;
    const s = sampleDevice(deck, id, move, t, ctx);
    out.time[i] = t;
    for (const k of axisKeys) out.axes[k].push(s.axes[k]);
    out.racking.push(s.racking);
    for (const k of motorKeys) {
      const e = s.motors[k]; out.motors[k].push(e);
      if (e.stall) { out.verdict.stall[k] = true; out.verdict.anyStall = true; }
      if (e.overspeed) out.verdict.overspeed[k] = true;
      out.verdict.peakUtil[k] = Math.max(out.verdict.peakUtil[k], Number.isFinite(e.utilization) ? e.utilization : 99);
    }
  }
  return out;
}

// Sample only joint positions at time t (for the 3D animation, cheap).
export function jointStateAt(deck, id, move, t) {
  const dev = deck.getDevice(id);
  const ev = move.evaluators, s = move.start, out = {};
  for (const k of deviceJoints(dev)) out[k] = (s[k] || 0) + (ev[k] ? ev[k](t).p : 0);
  return out;
}

if (typeof globalThis !== 'undefined') {
  globalThis.DECKENGINE = { planDeviceMove, simulateDevice, jointStateAt, deviceJoints, defaultState, carriageBorneMass };
}
