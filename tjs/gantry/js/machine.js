// machine.js — the gantry as a configurable machine: geometry, masses, four
// steppers (A, B for the HBot plane; Z1, Z2 for the two lead-screw columns),
// per-axis commanded motion limits, and the two carriage tools.
//
// Its job is to turn a commanded point-to-point move into a fully-sampled
// dynamic analysis: for every instant, the Cartesian kinematics (pos/vel/acc/
// jerk), and for every motor the rotor speed, torque demand vs. available
// pullout torque, utilization, and stall/overspeed verdicts. The scope and the
// 3D animation both consume the result of simulate().
//
// Units: lengths in mm, time in s, mass in kg, torque in N·m, angles in rad.

import { planMove } from '../../lib/scurve.js';
import { makeMotor, STEPPER_PRESETS } from '../../lib/motor.js';
import {
  beltForces, rackingMoment, reflectedInertiaScrew, GRAVITY,
} from '../../lib/kinematics.js';

export const TOOLS = {
  gripper:  { label: 'Pneumatic gripper', mass: 0.16, payload: 0.05, actuation: 'jaw' },
  pipettor: { label: 'Single-channel pipettor', mass: 0.21, payload: 0.002, actuation: 'plunger' },
  none:     { label: 'Bare carriage', mass: 0.0, payload: 0.0, actuation: null },
};

export function defaultConfig() {
  return {
    geometry: {
      bedX: 300, bedY: 300,        // working envelope (mm)
      zTravel: 120,                // Z stroke (mm)
      pulleyTeeth: 20, beltPitch: 2, // GT2 20T -> pitch radius below
      leadScrew: 8,                // mm/rev (typical T8 lead screw)
      screwEfficiency: 0.9,        // lead-screw efficiency η
      gantrySpan: 320,             // belt-run separation for racking (mm)
    },
    mass: {
      beam: 1.8,        // moving cross-beam (translates in Y)
      carriage: 0.6,    // XY carriage block (translates in X)
      zStage: 0.45,     // each Z slider assembly
    },
    friction: {
      beltLinear: 2.0,  // Coulomb friction force on the XY belts (N)
      screwLinear: 1.5, // Coulomb friction force on each Z axis (N)
    },
    motors: {
      gantry: 'NEMA 17 (0.44 N·m)', // shared preset for A and B
      z1: 'NEMA 17 (0.44 N·m)',
      z2: 'NEMA 17 (0.44 N·m)',
    },
    pulleyInertia: 3.0e-6, // pulley + idler rotor inertia per gantry motor (kg·m²)
    screwInertia: 9.0e-6,  // lead-screw rotor inertia per Z motor (kg·m²)
    // Commanded motion limits per axis (the "intended" profile — the motor model
    // independently decides whether it is deliverable).
    // Defaults sit just inside the NEMA-17 envelope: a pure-diagonal move tops
    // out at vx+vy = 600 mm/s of belt = 15 rev/s, under the 16 rev/s ceiling.
    // Push vmax past ~320 and the diagonal starts to overspeed — by design.
    limits: {
      xy: { vmax: 300, amax: 4000, jmax: 120000 }, // mm/s, mm/s², mm/s³
      z:  { vmax: 80,  amax: 1500, jmax: 40000 },
    },
    tools: { z1: 'gripper', z2: 'pipettor' },
    payload: { z1: true, z2: false }, // is a part / liquid currently held?
  };
}

export class Machine {
  constructor(config = defaultConfig()) {
    this.cfg = config;
    this.pos = { x: 150, y: 150, z1: 0, z2: 0 }; // home-ish, Z at top (0 = retracted)
    this.tool = { z1: { open: true, plunge: 0 }, z2: { open: true, plunge: 0 } };
    this.rebuild();
  }

  rebuild() {
    const m = this.cfg.motors;
    this.motorA = makeMotor(STEPPER_PRESETS[m.gantry]);
    this.motorB = makeMotor(STEPPER_PRESETS[m.gantry]);
    this.motorZ1 = makeMotor(STEPPER_PRESETS[m.z1]);
    this.motorZ2 = makeMotor(STEPPER_PRESETS[m.z2]);
  }

  pulleyRadiusMm() {
    // GT2-style: pitch radius = (teeth * pitch) / (2π).
    const g = this.cfg.geometry;
    return (g.pulleyTeeth * g.beltPitch) / (2 * Math.PI);
  }

  toolMass(z) {
    const t = TOOLS[this.cfg.tools[z]] || TOOLS.none;
    const pay = this.cfg.payload[z] ? t.payload : 0;
    return t.mass + pay;
  }

  // Moving masses (kg): X = everything riding the beam; Y = the beam + that.
  movingMassX() {
    const mm = this.cfg.mass;
    return mm.carriage + 2 * mm.zStage + this.toolMass('z1') + this.toolMass('z2');
  }
  movingMassY() {
    return this.cfg.mass.beam + this.movingMassX();
  }
  movingMassZ(z) {
    return this.cfg.mass.zStage + this.toolMass(z);
  }

  // Build the axis list for a commanded move to `target` (any subset of x,y,z1,z2).
  planTo(target) {
    const L = this.cfg.limits;
    const axes = [];
    const add = (key, dist, lim) => { if (Math.abs(dist) > 1e-9) axes.push({ key, distance: dist, ...lim }); };
    add('x', (target.x ?? this.pos.x) - this.pos.x, L.xy);
    add('y', (target.y ?? this.pos.y) - this.pos.y, L.xy);
    add('z1', (target.z1 ?? this.pos.z1) - this.pos.z1, L.z);
    add('z2', (target.z2 ?? this.pos.z2) - this.pos.z2, L.z);
    if (axes.length === 0) return null;
    const move = planMove(axes);
    move.start = { ...this.pos };
    move.target = { ...this.pos, ...target };
    return move;
  }

  // Sample the dynamic state at time t within a planned move. Returns Cartesian
  // kinematics and per-motor torque telemetry.
  sample(move, t) {
    const s = move.start;
    const ev = move.evaluators;
    const get = (k, base) => {
      if (!ev[k]) return { p: base, v: 0, a: 0, j: 0 };
      const r = ev[k](t);
      return { p: base + r.p, v: r.v, a: r.a, j: r.j };
    };
    const X = get('x', s.x), Y = get('y', s.y);
    const Z1 = get('z1', s.z1), Z2 = get('z2', s.z2);

    const rMm = this.pulleyRadiusMm();
    const rM = rMm / 1000;

    // --- HBot plane: map Cartesian to belt A/B, then to motor torque ---------
    // Belt linear motion (mm units): a = x+y, b = x-y.
    const beltA = { v: X.v + Y.v, a: X.a + Y.a };
    const beltB = { v: X.v - Y.v, a: X.a - Y.a };
    const omegaA = beltA.v / rMm, alphaA = beltA.a / rMm; // rad/s, rad/s²
    const omegaB = beltB.v / rMm, alphaB = beltB.a / rMm;

    // Cartesian net inertial force (N): F = M * a (a converted mm->m).
    const Fx = this.movingMassX() * (X.a / 1000);
    const Fy = this.movingMassY() * (Y.a / 1000);
    const Fbelt = beltForces(Fx, Fy); // N per belt
    const fricBeltN = this.cfg.friction.beltLinear;

    const evalA = this.motorA.evaluate({
      omega: omegaA, alpha: alphaA, Jreflected: this.cfg.pulleyInertia,
      loadTorque: Fbelt.A * rM, friction: fricBeltN * rM,
    });
    const evalB = this.motorB.evaluate({
      omega: omegaB, alpha: alphaB, Jreflected: this.cfg.pulleyInertia,
      loadTorque: Fbelt.B * rM, friction: fricBeltN * rM,
    });

    // --- Z lead screws -------------------------------------------------------
    const lead = this.cfg.geometry.leadScrew;
    const k = (2 * Math.PI) / lead;        // rad per mm
    const leadM = (lead / 1000) / (2 * Math.PI); // m per rad
    const zEval = (Z, motor, which) => {
      const omega = Z.v * k, alpha = Z.a * k;
      const mz = this.movingMassZ(which);
      const Jref = reflectedInertiaScrew(mz, lead) + this.cfg.screwInertia;
      // Gravity always loads the screw (positive Z = downward stroke here, but
      // the motor must support the hanging mass regardless of direction).
      const gravTorque = (mz * GRAVITY * leadM) / this.cfg.geometry.screwEfficiency;
      return motor.evaluate({
        omega, alpha, Jreflected: Jref,
        loadTorque: gravTorque, friction: this.cfg.friction.screwLinear * leadM,
      });
    };
    const evalZ1 = zEval(Z1, this.motorZ1, 'z1');
    const evalZ2 = zEval(Z2, this.motorZ2, 'z2');

    const rack = rackingMoment(Fbelt.A, Fbelt.B, this.cfg.geometry.gantrySpan);

    return {
      t,
      cart: { x: X, y: Y, z1: Z1, z2: Z2 },
      motors: { A: evalA, B: evalB, Z1: evalZ1, Z2: evalZ2 },
      racking: rack,
    };
  }

  // Densely sample a whole move into column arrays for plotting + a verdict.
  simulate(move, n = 600) {
    const T = move.T || 1e-3;
    const out = {
      T, dt: T / n, time: new Array(n + 1),
      cart: { x: [], y: [], z1: [], z2: [] },
      motors: { A: [], B: [], Z1: [], Z2: [] },
      racking: [],
      verdict: { stall: {}, peakUtil: {}, overspeed: {}, anyStall: false },
    };
    const keys = ['A', 'B', 'Z1', 'Z2'];
    for (const k of keys) { out.verdict.stall[k] = false; out.verdict.peakUtil[k] = 0; out.verdict.overspeed[k] = false; }
    for (let i = 0; i <= n; i++) {
      const t = (T * i) / n;
      const s = this.sample(move, t);
      out.time[i] = t;
      for (const ax of ['x', 'y', 'z1', 'z2']) out.cart[ax].push(s.cart[ax]);
      out.racking.push(s.racking);
      for (const k of keys) {
        const e = s.motors[k];
        out.motors[k].push(e);
        if (e.stall) { out.verdict.stall[k] = true; out.verdict.anyStall = true; }
        if (e.overspeed) out.verdict.overspeed[k] = true;
        if (Number.isFinite(e.utilization)) out.verdict.peakUtil[k] = Math.max(out.verdict.peakUtil[k], e.utilization);
        else out.verdict.peakUtil[k] = Math.max(out.verdict.peakUtil[k], 99);
      }
    }
    return out;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.MACHINE = { Machine, defaultConfig, TOOLS };
}
