// aero.js — the ball, the air, and what happens when something hits it.
//
// No rendering, no game, no DOM. Everything here is either a measured number
// with a source, or arithmetic on one. Imported by game.js, by scene.js for
// the table dimensions, and by pong.selftest.mjs.
//
// Units are SI throughout: metres, seconds, kilograms, radians.

// ---------------------------------------------------------------------------
// The ball
// ---------------------------------------------------------------------------

// ITTF regulation: 40 mm plastic ball, 2.7 g. The mass and diameter are the
// rule, not a measurement of any particular ball.
export const BALL = {
  R: 0.020,
  m: 0.0027,
  A: Math.PI * 0.020 * 0.020,
};

// A table tennis ball is a THIN SHELL, not a solid sphere: I = (2/3)mR^2
// against a solid sphere's (2/5)mR^2. The tangential impulse needed to arrest
// the slip is -slip * m / (1 + mR^2/I), so the shell takes 0.400 m against the
// solid sphere's 0.286 m — 40% more.
//
// It is tempting to finish that sentence with "and correspondingly more spin",
// which is what this comment said until the selftest measured it. It is FALSE.
// The resulting spin is grip*slip/(f*R), and the shell's larger f more than
// eats its larger grip: 0.60*slip/R against a solid sphere's 0.71. A hollow
// ball takes MORE impulse and ends up spinning LESS. What the shell buys is
// linear — more of the brush goes into moving the ball and less into turning
// it. Table tennis is the spinniest sport for other reasons: tacky rubber with
// a friction coefficient near 1, and 2.7 g of mass behind a 40 mm frontal area,
// so the aerodynamic force per unit mass is enormous.
export const INERTIA_FACTOR = 2 / 3;

/// Everything the aerodynamic force does scales by this: F/m = SCALE * C * v^2.
/// 0.5 * rho * A / m, with rho = 1.21 kg/m^3 (dry air, 20 C, sea level).
export const AIR_RHO = 1.21;
export const AERO_SCALE = (0.5 * AIR_RHO * BALL.A) / BALL.m;

export const G = 9.81;

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------
//
// ITTF dimensions. The origin is the centre of the table at playing-surface
// height, x runs from the player's end (negative) to the opponent's (positive),
// y is across, z is up.

export const TABLE = {
  halfLength: 1.37,
  halfWidth: 0.7625,
  netHeight: 0.1525,
  // The net overhangs the table by 15.25 cm on each side.
  netHalfWidth: 0.7625 + 0.1525,
  height: 0.76, // above the floor; only the renderer cares
};

/// Where each bat's plane sits. Behind the end line, because you stand back.
export const PLAYER_X = -1.55;
export const RIVAL_X = 1.55;

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------
//
// Restitution and friction are quoted ranges from the table-tennis literature,
// not values measured here.
//
//   table: the ITTF ball test is a 30 cm drop rebounding 24-26 cm, which is a
//          normal restitution of sqrt(25/30) = 0.913. The surface is smooth and
//          slippery, so the friction is low and most fast bounces slide.
//   bat:   inverted rubber over sponge. Restitution around 0.9 for a passive
//          block; friction is high and tacky, quoted between 0.8 and 1.2.
export const CONTACT = {
  table: { e: 0.91, mu: 0.25 },
  bat: { e: 0.90, mu: 0.90 },
};

// ---------------------------------------------------------------------------
// Small vector helpers. Arrays of three, because that is what the renderer
// wants and converting twice a frame is silly.
// ---------------------------------------------------------------------------

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};

// ---------------------------------------------------------------------------
// The solver's answer
// ---------------------------------------------------------------------------

// Measured by solver/, the D2Q9 lattice Boltzmann in this directory: flow past
// a rotating cylinder at Re = 100 on a 512x256 lattice, D = 24 cells, averaged
// over 18000 steps after a 26000-step warm-up. `alpha` is the spin ratio
// omega*R/U. Reproduce with:
//
//   cd solver && cargo run --release --example sweep
//
// See README.md for what this is and is not. The short version: a 2D cylinder
// is not a 3D sphere and its Magnus force is far stronger, so the SHAPE of this
// curve is the solver's and the SCALE is calibrated to a real ball below.
export const CYLINDER = {
  source: 'solver/ (D2Q9 TRT LBM, Re=100, 512x256, D=24)',
  // [alpha, CL, CD, shedding rms CL, Strouhal]
  //
  // Only the positive half is stored. The solver produces both, and they agree
  // to four figures — CL(-1) = -2.5670 against CL(+1) = +2.5667 — so keeping
  // the mirror image would be storing the same numbers twice and inviting them
  // to disagree. The negative-alpha measurements are in the README, where they
  // serve as what they are: evidence the solver is not cheating.
  table: [
    [0.00, 0.0000, 1.5287, 0.2811, 0.1787],
    [0.25, 0.6269, 1.5151, 0.2766, 0.1787],
    [0.50, 1.2515, 1.4710, 0.2940, 0.1787],
    [0.75, 1.8944, 1.3973, 0.3078, 0.1800],
    [1.00, 2.5667, 1.2908, 0.3154, 0.1800],
    [1.25, 3.2784, 1.1473, 0.3111, 0.1787],
    [1.50, 4.3244, 0.9910, 0.2227, 0.1875],
    [1.75, 5.2543, 0.7187, 0.0177, 0.2450],
    [2.00, 6.5438, 0.6903, 0.0270, 0.2450],
  ],
};

/// The empirical relation used throughout the sports-ball literature for the
/// lift coefficient of a SPHERE:
///
///     C_L = 1 / (2 + v/(R*omega)) = alpha / (2*alpha + 1)
///
/// Kept here so the page can show where the solver's curve and this one part
/// company, rather than only where they were made to agree.
export const sphereRef = (a) => Math.abs(a) / (2 * Math.abs(a) + 1) * (a < 0 ? -1 : 1);

// --- from a cylinder to a ball ---------------------------------------------
//
// A 2D cylinder is not a 3D sphere, and pretending otherwise would be the one
// dishonest thing on this page. A cylinder's Magnus force is far stronger: the
// flow has nowhere to go around it, so the whole circulation is forced into the
// wake, while on a sphere it can spill off the sides. Everything about the
// SHAPE of the curve — where it grows, where it bends over — is the solver's,
// measured. The SCALE is one number, fitted so the ball's lift at a spin ratio
// of 1 matches the value real balls are measured at.
//
// The reference is the relation used throughout the sports-ball literature,
//
//     C_L = 1 / (2 + v/(R*omega)) = alpha / (2*alpha + 1)
//
// which gives 1/3 at alpha = 1 and saturates at 1/2. The README says what this
// costs and where the two curves disagree.
export const SPHERE_CL_AT_1 = 1 / 3;

/// Drag. The solver's cylinder drag FALLS with spin and eventually goes
/// negative, which is a real and documented property of a rotating cylinder and
/// is NOT what a sphere does. So this page does not use the solver for drag: it
/// uses a constant, the accepted subcritical value for a 40 mm ball. Using a
/// curve the solver measured for a different body, in the direction a ball does
/// not go, would have been worse than using no curve at all. Said here rather
/// than buried, because it is the one place the solver's answer was declined.
export const SPHERE_CD = 0.45;

// ---------------------------------------------------------------------------

/// Linear interpolation into a sorted [alpha, value] table, held flat outside.
function lerpTable(rows, col, a) {
  const n = rows.length;
  if (n === 0) return 0;
  if (a <= rows[0][0]) return rows[0][col];
  if (a >= rows[n - 1][0]) return rows[n - 1][col];
  let i = 0;
  while (i < n - 2 && rows[i + 1][0] < a) i++;
  const t = (a - rows[i][0]) / (rows[i + 1][0] - rows[i][0]);
  return rows[i][col] * (1 - t) + rows[i + 1][col] * t;
}

/// Spin ratio: surface speed over flight speed. The only argument the
/// coefficients take.
export function spinRatio(speed, spinMag) {
  if (speed < 0.05) return 0;
  return (BALL.R * spinMag) / speed;
}

/// The single fitted number, computed rather than typed so it cannot drift out
/// of step with the table above.
export const LIFT_SCALE = SPHERE_CL_AT_1 / lerpTable(CYLINDER.table, 1, 1.0);

/// Lift coefficient of the BALL at spin ratio `a`. Odd in `a` because the table
/// holds only the positive half — the solver produces both halves and they
/// agree to four figures, which is the evidence, and storing the mirror image
/// would only invite it to disagree.
export function clOf(a) {
  const s = a < 0 ? -1 : 1;
  return s * LIFT_SCALE * lerpTable(CYLINDER.table, 1, Math.abs(a));
}

/// Drag coefficient of the ball. Constant — see SPHERE_CD.
export function cdOf(_a) {
  return SPHERE_CD;
}

// ---------------------------------------------------------------------------
// Oblique impact with friction
// ---------------------------------------------------------------------------

/// Hit a ball against a flat surface.
///
///   vel, spin  the ball, before
///   n          unit normal of the surface, pointing towards the ball's side
///   V          velocity of the surface itself
///   e, mu      normal restitution and Coulomb friction
///
/// Returns `null` if the ball is not actually approaching the surface, so the
/// caller can tell a real contact from a grazing pass.
///
/// This is the textbook rigid-body treatment: a normal impulse set by the
/// restitution, and a tangential impulse that either arrests the slip entirely
/// (rolling contact) or saturates at the friction cone (sliding contact). Which
/// of the two happens is not a switch anyone sets — it falls out of the numbers,
/// and it is the difference between a bat, which grips, and the table, which
/// mostly does not.
export function impact(vel, spin, n, V, e, mu) {
  const rel = sub(vel, V);
  const vn = dot(rel, n);
  if (vn >= 0) return null; // moving away; no contact

  const vt = sub(rel, scale(n, vn));
  // Velocity of the ball's material point at the contact, which sits at -R*n
  // from the centre. spin x (-R n) is already tangential.
  const slip = sub(vt, scale(cross(spin, n), BALL.R));

  const Jn = BALL.m * (1 + e) * -vn;
  // 1/m + R^2/I = (1 + 1/INERTIA_FACTOR)/m for a shell => stick impulse below.
  const grip = 1 / (1 + 1 / INERTIA_FACTOR); // 0.4 for a shell, 2/7 for a solid
  const stickMag = BALL.m * grip * len(slip);

  let Jt;
  let sliding;
  if (stickMag <= mu * Jn || len(slip) < 1e-9) {
    Jt = scale(slip, -BALL.m * grip);
    sliding = false;
  } else {
    Jt = scale(norm(slip), -mu * Jn);
    sliding = true;
  }

  const J = add(scale(n, Jn), Jt);
  const outVel = add(vel, scale(J, 1 / BALL.m));
  // dOmega = (r x J)/I with r = -R n; the normal part of J contributes nothing.
  const Iinv = 1 / (INERTIA_FACTOR * BALL.m * BALL.R * BALL.R);
  const outSpin = add(spin, scale(cross(n, Jt), -BALL.R * Iinv));

  return { vel: outVel, spin: outSpin, sliding, Jn, slipIn: len(slip) };
}

// ---------------------------------------------------------------------------
// Flight
// ---------------------------------------------------------------------------

/// Acceleration of a ball in the air: gravity, drag along -v, and the Magnus
/// force along omega x v.
///
/// `noMagnus` exists for the selftest. The page's whole claim is that the
/// aerodynamics decides whether a shot is in or out, and the only way to
/// measure that claim is to fly the same shot with the lift switched off.
export function accel(vel, spin, noMagnus = false) {
  const speed = len(vel);
  const a = [0, 0, -G];
  if (speed < 1e-6) return a;
  const w = len(spin);
  const alpha = spinRatio(speed, w);
  const q = AERO_SCALE * speed * speed;

  const drag = scale(norm(vel), -q * cdOf(alpha));
  a[0] += drag[0];
  a[1] += drag[1];
  a[2] += drag[2];

  if (!noMagnus && w > 1e-6) {
    // omega x v, normalised: direction only. Magnitude is q * CL.
    const dir = norm(cross(spin, vel));
    const cl = q * clOf(alpha);
    a[0] += dir[0] * cl;
    a[1] += dir[1] * cl;
    a[2] += dir[2] * cl;
  }
  return a;
}

/// Spin decay. NOT from the solver — the solver measures the force on the
/// cylinder, not the torque, so this is an empirical exponential with a time
/// constant taken from the published observation that a table tennis ball loses
/// only a few percent of its spin per second of flight. Over the 0.4 s a shot
/// spends in the air it changes almost nothing, which is exactly why it was not
/// worth another half-hour of solver time to do properly. Said plainly here so
/// nobody mistakes it for a measurement.
export const SPIN_DECAY = 0.006; // per metre travelled

/// One flight substep, midpoint method. Small enough steps that the choice of
/// integrator does not matter much, but the midpoint is free.
export function flightStep(ball, dt, noMagnus = false) {
  const a1 = accel(ball.vel, ball.spin, noMagnus);
  const vMid = add(ball.vel, scale(a1, dt * 0.5));
  const a2 = accel(vMid, ball.spin, noMagnus);
  ball.pos = add(ball.pos, scale(add(ball.vel, scale(a2, dt * 0.5)), dt));
  ball.vel = add(ball.vel, scale(a2, dt));
  const decay = Math.exp(-SPIN_DECAY * len(ball.vel) * dt);
  ball.spin = scale(ball.spin, decay);
}
