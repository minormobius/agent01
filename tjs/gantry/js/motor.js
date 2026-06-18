// motor.js — open-loop NEMA stepper model: the torque-speed pullout envelope and
// the per-instant feasibility check that turns a commanded motion profile into a
// verdict ("this move is deliverable" / "this move stalls").
//
// An open-loop stepper has no feedback: if the demanded torque ever exceeds what
// the motor can pull out at the current speed, it skips steps and the gantry
// loses position — a stall. Two things shrink the available torque as you go
// faster:
//   - back-EMF: the faster the rotor turns, the more the motor's own generated
//     voltage opposes the supply, so less current (hence torque) flows. With a
//     fixed supply voltage this gives the classic "constant-power" droop past a
//     corner speed: T_avail ≈ T_hold · n_corner / n.
//   - a hard ceiling (n_max) past which torque collapses to ~0.
//
// The DEMAND side, per the rigid-body model:
//     T_demand = (J_rotor + J_reflected)·|α|  +  T_load(gravity)  +  T_friction
// where α is rotor angular acceleration, J_reflected is the moved mass seen
// through the pulley/screw, gravity loads the Z lead screws, and friction
// opposes motion. Stall when |T_demand| > T_avail(|ω|); overspeed when n > n_max.
//
// Pure module — no DOM. Defaults are a generic NEMA 17 (0.44 N·m) / NEMA 23.

export const STEPPER_PRESETS = {
  'NEMA 17 (0.44 N·m)': {
    label: 'NEMA 17 · 0.44 N·m', holdingTorque: 0.44, rotorInertia: 5.4e-6,
    stepsPerRev: 200, microsteps: 16, cornerSpeed: 4.0, maxSpeed: 16.0,
    supplyVoltage: 24,
  },
  'NEMA 17 (0.59 N·m)': {
    label: 'NEMA 17 · 0.59 N·m', holdingTorque: 0.59, rotorInertia: 8.2e-6,
    stepsPerRev: 200, microsteps: 16, cornerSpeed: 3.2, maxSpeed: 14.0,
    supplyVoltage: 24,
  },
  'NEMA 23 (1.26 N·m)': {
    label: 'NEMA 23 · 1.26 N·m', holdingTorque: 1.26, rotorInertia: 2.8e-5,
    stepsPerRev: 200, microsteps: 16, cornerSpeed: 5.0, maxSpeed: 20.0,
    supplyVoltage: 36,
  },
  'NEMA 23 (3.0 N·m)': {
    label: 'NEMA 23 · 3.0 N·m', holdingTorque: 3.0, rotorInertia: 4.8e-4,
    stepsPerRev: 200, microsteps: 16, cornerSpeed: 3.5, maxSpeed: 15.0,
    supplyVoltage: 48,
  },
};

export function makeMotor(params) {
  const p = { ...STEPPER_PRESETS['NEMA 17 (0.44 N·m)'], ...params };

  // Available pullout torque (N·m) at rotor speed n (rev/s). Flat below the
  // corner, constant-power hyperbola above it, hard cutoff at n_max.
  function torqueAvailable(revPerSec) {
    const n = Math.abs(revPerSec);
    if (n <= p.cornerSpeed) return p.holdingTorque;
    if (n >= p.maxSpeed) return 0;
    const power = p.holdingTorque * (p.cornerSpeed / n); // constant-power droop
    // Blend the hyperbola to zero over the last stretch so it reaches 0 at n_max.
    const fade = 1 - (n - p.cornerSpeed) / (p.maxSpeed - p.cornerSpeed) * 0.0;
    return Math.max(0, power * fade);
  }

  // Smallest move-step the motor can command, in the driven axis's length unit.
  function stepResolution(unitPerRev) {
    return unitPerRev / (p.stepsPerRev * p.microsteps);
  }

  // Feasibility at one instant. Inputs in rotor units:
  //   omega   rad/s   rotor angular velocity
  //   alpha   rad/s²  rotor angular acceleration
  //   Jreflected kg·m²  load inertia reflected to the rotor
  //   loadTorque N·m   external load already in rotor terms (e.g. gravity), signed
  //   friction  N·m   Coulomb friction magnitude (opposes motion)
  function evaluate({ omega, alpha, Jreflected = 0, loadTorque = 0, friction = 0 }) {
    const n = omega / (2 * Math.PI); // rev/s
    const inertial = (p.rotorInertia + Jreflected) * alpha;
    const fric = friction * Math.sign(omega || alpha || 1);
    const demand = inertial + loadTorque + fric;
    const avail = torqueAvailable(n);
    const absDemand = Math.abs(demand);
    return {
      n, demand, absDemand, avail,
      utilization: avail > 0 ? absDemand / avail : Infinity,
      overspeed: Math.abs(n) > p.maxSpeed,
      stall: absDemand > avail + 1e-9,
      components: { inertial, gravity: loadTorque, friction: fric },
    };
  }

  return { params: p, torqueAvailable, stepResolution, evaluate };
}

if (typeof globalThis !== 'undefined') {
  globalThis.MOTOR = { makeMotor, STEPPER_PRESETS };
}
