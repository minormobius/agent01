// scurve.js — seven-segment, jerk-limited (S-curve / "double-S") motion profiles.
//
// This is the soul of the gantry playground: every commanded move is a
// rest-to-rest trajectory whose jerk is bounded, so acceleration is continuous
// and the belts never get a step-change in force. The classic reference is
// Biagiotti & Melchiorri, "Trajectory Planning for Automatic Machines and
// Robots", ch. 3 (the trapezoidal-acceleration / double-S profile).
//
// A profile is built from up to seven phases of constant jerk:
//   1  +J   acceleration ramps up        0 -> A
//   2   0   constant acceleration        (cruise of accel)
//   3  -J   acceleration ramps down      A -> 0     (velocity reaches V)
//   4   0   constant velocity            (cruise)
//   5  -J   acceleration ramps down      0 -> -A
//   6   0   constant deceleration
//   7  +J   acceleration ramps up       -A -> 0     (velocity back to 0)
//
// Degenerate cases (no cruise, A never reached, tiny move) collapse phases to
// zero duration. The planner only computes the seven *durations*; an analytic
// integrator (makeEvaluator) turns them into p(t), v(t), a(t), j(t). Keeping the
// integrator dumb and the durations exact means correctness is easy to test:
// integrate the jerk and check the endpoint, the peak velocity, the peak accel.
//
// Pure module: no DOM, no three.js. Runs in node for unit tests, and is the
// single source of truth the scope and the 3D animation both read from.

const EPS = 1e-9;

// Plan a single-axis rest-to-rest move of signed `distance`, bounded by the
// (positive) limits vmax, amax, jmax. Returns a profile object:
//   { distance, sign, T, segs:[{dur, j}], vlim, alim, reached:{v,a} }
// where segs are the seven phases (constant jerk `j`, already signed), T is the
// total duration, and vlim/alim are the actual peak velocity/acceleration.
export function planAxis(distance, vmax, amax, jmax) {
  const sign = distance < 0 ? -1 : 1;
  const q = Math.abs(distance);

  // Trivial / zero move.
  if (q < EPS || vmax < EPS || amax < EPS || jmax < EPS) {
    return zeroProfile(distance);
  }

  let V = vmax, A = amax, J = jmax;

  // --- Step 1: acceleration sub-profile needed to reach V ---------------------
  // Does acceleration saturate at A before velocity reaches V?
  let Tj, Ta; // Tj = jerk-phase time, Ta = total accel time (0 -> V)
  if (V * J >= A * A) {
    // A is reached.
    Tj = A / J;
    Ta = Tj + V / A;
  } else {
    // A never reached — the accel ramps straight back down.
    Tj = Math.sqrt(V / J);
    Ta = 2 * Tj;
  }

  // --- Step 2: is the move long enough to cruise at V? ------------------------
  // Displacement of a symmetric accel (0 -> V) is V*Ta/2 (avg velocity = V/2).
  // Accel + decel together cover V*Ta. If q exceeds that, a cruise phase exists.
  let Tv; // cruise duration
  if (q >= V * Ta) {
    Tv = (q - V * Ta) / V;
  } else {
    // V is never reached. Re-solve for a lower peak velocity, no cruise.
    Tv = 0;
    if (q >= (2 * A * A * A) / (J * J)) {
      // A is still reached: solve  A*Ta^2 - A*Tj*Ta - q = 0  for Ta.
      Tj = A / J;
      Ta = Tj / 2 + 0.5 * Math.sqrt(Tj * Tj + 4 * q / A);
    } else {
      // A never reached either: q = 2*J*Tj^3  ->  Tj = cbrt(q / 2J).
      Tj = Math.cbrt(q / (2 * J));
      Ta = 2 * Tj;
    }
  }

  // Phase durations (decel mirrors accel for a rest-to-rest, symmetric move).
  const Tc = Math.max(0, Ta - 2 * Tj); // constant-accel cruise (0 when A not reached)
  const durs = [Tj, Tc, Tj, Tv, Tj, Tc, Tj];
  const baseJ = [J, 0, -J, 0, -J, 0, J].map((s) => s * sign);

  const segs = durs.map((dur, i) => ({ dur: Math.max(0, dur), j: baseJ[i] }));
  const T = segs.reduce((s, seg) => s + seg.dur, 0);

  // Actual peaks reached.
  const alim = J * Tj;          // accel peak = jerk * ramp time
  const vlim = alim * (Ta - Tj); // velocity peak gained over the accel half
  return {
    distance, sign, T, segs,
    vlim, alim,
    reached: { v: vlim < vmax - 1e-6, a: alim < amax - 1e-6 ? false : true },
  };
}

function zeroProfile(distance) {
  return {
    distance, sign: distance < 0 ? -1 : 1, T: 0,
    segs: [], vlim: 0, alim: 0, reached: { v: false, a: false },
  };
}

// Given a profile, return a state sampler: t -> { p, v, a, j } relative to a
// start position of 0. Integrates the piecewise-constant jerk analytically, so
// it is exact (not an Euler step) and continuous in p, v, a.
export function makeEvaluator(profile) {
  // Precompute the (p, v, a) at the start of each segment by chaining.
  const marks = [];
  let p = 0, v = 0, a = 0, t0 = 0;
  for (const seg of profile.segs) {
    marks.push({ t0, p, v, a, j: seg.j, dur: seg.dur });
    const dt = seg.dur;
    p = p + v * dt + 0.5 * a * dt * dt + (seg.j * dt * dt * dt) / 6;
    v = v + a * dt + 0.5 * seg.j * dt * dt;
    a = a + seg.j * dt;
    t0 += dt;
  }
  const Tend = t0, pEnd = p;

  return function sample(t) {
    if (t <= 0) return { p: 0, v: 0, a: 0, j: profile.segs[0]?.j ?? 0 };
    if (t >= Tend) return { p: pEnd, v: 0, a: 0, j: 0 };
    // Find the active segment (linear scan — at most 7).
    let m = marks[0];
    for (let i = 0; i < marks.length; i++) {
      if (t >= marks[i].t0 && t < marks[i].t0 + marks[i].dur) { m = marks[i]; break; }
      m = marks[i];
    }
    const dt = t - m.t0;
    return {
      p: m.p + m.v * dt + 0.5 * m.a * dt * dt + (m.j * dt * dt * dt) / 6,
      v: m.v + m.a * dt + 0.5 * m.j * dt * dt,
      a: m.a + m.j * dt,
      j: m.j,
    };
  };
}

// Re-plan a single axis to take *exactly* a target duration T >= its natural
// minimum, by lowering the cruise velocity (monotonic: lower V -> longer move).
// Used to synchronize a multi-axis move so every axis starts and stops together.
export function planAxisTimed(distance, vmax, amax, jmax, targetT) {
  const natural = planAxis(distance, vmax, amax, jmax);
  if (targetT <= natural.T + 1e-6 || Math.abs(distance) < EPS) return natural;
  // Binary-search the velocity cap that stretches the move to targetT.
  let lo = 1e-6, hi = vmax;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const T = planAxis(distance, mid, amax, jmax).T;
    if (T > targetT) lo = mid; else hi = mid;
  }
  return planAxis(distance, (lo + hi) / 2, amax, jmax);
}

// Plan a coordinated multi-axis point-to-point move. `axes` is an array of
// { key, distance, vmax, amax, jmax }. Every axis is synchronized to the slowest
// ("bottleneck") axis's duration so the carriage starts and stops as one.
// Returns { T, profiles:{key->profile}, evaluators:{key->sampler}, bottleneck }.
export function planMove(axes) {
  const natural = {};
  let T = 0, bottleneck = null;
  for (const ax of axes) {
    const p = planAxis(ax.distance, ax.vmax, ax.amax, ax.jmax);
    natural[ax.key] = p;
    if (p.T > T) { T = p.T; bottleneck = ax.key; }
  }
  const profiles = {}, evaluators = {};
  for (const ax of axes) {
    const p = ax.key === bottleneck
      ? natural[ax.key]
      : planAxisTimed(ax.distance, ax.vmax, ax.amax, ax.jmax, T);
    profiles[ax.key] = p;
    evaluators[ax.key] = makeEvaluator(p);
  }
  return { T, profiles, evaluators, bottleneck };
}

// Attach to globalThis so the module unit-tests in plain node (borges pattern).
if (typeof globalThis !== 'undefined') {
  globalThis.SCURVE = { planAxis, planAxisTimed, planMove, makeEvaluator };
}
