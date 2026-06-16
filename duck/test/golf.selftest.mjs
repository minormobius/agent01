// golf.selftest.mjs — proves the golf-ball model is honest and the course model
// round-trips. Run: node duck/test/golf.selftest.mjs
//
// The two strong checks:
//   • REDUCTION (TEST 3): with drag, Magnus and spin off, stepBall must trace the
//     SAME trajectory as physics.js's free particle — i.e. the golf ball is the
//     proven rotating-frame integrator (straight in the inertial frame) with two
//     extra, clearly separable aerodynamic terms bolted on.
//   • MAGNUS (TEST 2): the Magnus force is perpendicular to velocity (does no
//     work) and backspin produces LIFT (a component along local up). Get that sign
//     wrong and a golf ball wouldn't carry.

import { vec3 } from '../js/math.js';
import { CYLINDERS, makeCylinder, stepFreeParticle, downDir } from '../js/physics.js';
import {
  BALL, CLUBS, launch, stepBall, floorToWorld, floorDistance, surfaceBasis,
  bearingTo, holed, heightAboveFloor, par, encodeCourse, decodeCourse, randomCourse,
  hazardAt,
} from '../js/golf.js';

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function check(name, cond, extra = '') {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${name}${extra ? '  — ' + extra : ''}`); }
}

// ── TEST 1 — launch: speed matches the club, elevation matches the loft ──
{
  const club = CLUBS.find((c) => c.id === 'iron');
  const { vel } = launch('earth', [0, 30, 0], { club, power: 1, aim: 0 });
  check('launch speed = club speed', approx(vec3.len(vel), club.speed, 1e-6), `|v|=${vec3.len(vel).toFixed(2)}`);
  // elevation above the horizontal (earth up = +Y) equals the loft
  const elev = Math.asin(vel[1] / vec3.len(vel)) * 180 / Math.PI;
  check('launch elevation = loft', approx(elev, club.loft, 1e-4), `elev=${elev.toFixed(2)}°`);
  // half power → half ball speed
  const half = launch('earth', [0, 30, 0], { club, power: 0.5, aim: 0 });
  check('power scales ball speed', approx(vec3.len(half.vel), club.speed * 0.5, 1e-6));
}

// ── TEST 2 — Magnus: perpendicular to v (no work), and backspin lifts ──
{
  const pos = [0, 50, 0];
  const { vel, spin } = launch('earth', pos, { club: CLUBS[0], power: 1, aim: 0 });
  const mag = vec3.cross([0, 0, 0], spin, vel);
  check('Magnus ⟂ velocity (does no work)', approx(vec3.dot(mag, vel), 0, 1e-6),
    `mag·v = ${vec3.dot(mag, vel).toExponential(2)}`);
  const up = vec3.scale([0, 0, 0], downDir([0, 0, 0], 'earth', pos), -1);
  check('backspin produces lift (Magnus has +up component)', vec3.dot(mag, up) > 0,
    `mag·up = ${vec3.dot(mag, up).toFixed(3)}`);
  // a putt (zero backspin, no sidespin) has no Magnus at all
  const putt = launch('earth', pos, { club: CLUBS.find((c) => c.id === 'putter'), power: 1, aim: 0 });
  check('putter has zero spin', vec3.len(putt.spin) === 0);
}

// ── TEST 3 — REDUCTION: spin/drag/Magnus off ⇒ exactly physics.js free particle ──
{
  const cyl = makeCylinder(CYLINDERS.find((c) => c.id === 'snug')); // fast spin = stiff test
  const dragK0 = BALL.dragK, magK0 = BALL.magnusK;
  BALL.dragK = 0; BALL.magnusK = 0;                                  // disable aerodynamics
  const b = { pos: [60, 20, 30], vel: [12, -4, 9], spin: [0, 0, 0] };
  const f = { pos: [60, 20, 30], vel: [12, -4, 9] };
  const dt = 1 / 240;
  let maxDiff = 0;
  for (let i = 0; i < 3000; i++) {
    stepBall(b, 'cylinder', cyl.omega, dt);
    stepFreeParticle(f, 'cylinder', cyl.omega, dt, 0);             // dragK = 0 → field only
    maxDiff = Math.max(maxDiff, vec3.len(vec3.sub([0, 0, 0], b.pos, f.pos)));
  }
  BALL.dragK = dragK0; BALL.magnusK = magK0;
  check('ball ≡ proven free particle when aerodynamics are off', maxDiff < 1e-9,
    `max position divergence = ${maxDiff.toExponential(2)} m over 3000 steps`);

  // opts.coriolis:false drops only the −2Ω×v term: one step should change velocity
  // by centrifugal·dt alone (the preview's "without Coriolis" ghost).
  BALL.dragK = 0; BALL.magnusK = 0;
  const g = { pos: [120, 40, 0], vel: [3, 5, 2], spin: [0, 0, 0] };
  const v0 = vec3.clone(g.vel);
  stepBall(g, 'cylinder', cyl.omega, dt, { coriolis: false });
  const w2 = cyl.omega * cyl.omega;
  const dvx = g.vel[0] - v0[0], dvy = g.vel[1] - v0[1];
  check('coriolis:false ⇒ centrifugal-only Δv', approx(dvx, w2 * 120 * dt, 1e-9) && approx(dvy, w2 * 40 * dt, 1e-9),
    `Δv=(${dvx.toExponential(2)},${dvy.toExponential(2)})`);
  BALL.dragK = dragK0; BALL.magnusK = magK0;
}

// ── TEST 4 — drag dissipates: a dragged ball loses speed it would otherwise keep ──
{
  // two identical Earth shots; one with drag, one without. Drag must land shorter.
  const shoot = (drag) => {
    const dragK0 = BALL.dragK; if (!drag) BALL.dragK = 0;
    const { vel, spin } = launch('earth', [0, 0.9, 0], { club: CLUBS[0], power: 1, aim: 0 });
    const b = { pos: [0, 0.9, 0], vel, spin };
    const dt = 1 / 240; let steps = 0;
    while (b.pos[1] > 0 && steps < 8000) { stepBall(b, 'earth', 0, dt); steps++; }
    BALL.dragK = dragK0;
    return Math.hypot(b.pos[0], b.pos[2]);                          // carry distance
  };
  const withDrag = shoot(true), noDrag = shoot(false);
  check('drag shortens the carry', withDrag < noDrag, `${withDrag.toFixed(0)} m vs ${noDrag.toFixed(0)} m`);
  check('a driver still carries a real distance', withDrag > 120 && withDrag < 1200, `${withDrag.toFixed(0)} m`);
}

// ── TEST 5 — floor geometry: arc length, lift, round-trip ──
{
  const R = 8000;
  // two points 0.1 rad apart at the same z: arc length = R·Δθ
  const d = floorDistance('cylinder', R, { u: 0, v: 100 }, { u: 0.1, v: 100 });
  check('cylinder distance = arc length R·Δθ', approx(d, R * 0.1, 1e-6), `${d.toFixed(1)} m`);
  // shortest arc wraps the seam (−ε vs +2π−ε is a small arc, not nearly a full lap)
  const seam = floorDistance('cylinder', R, { u: 0.01, v: 0 }, { u: Math.PI * 2 - 0.01, v: 0 });
  check('distance takes the SHORT way around the seam', approx(seam, R * 0.02, 1e-3), `${seam.toFixed(1)} m`);
  check('earth distance is planar', approx(floorDistance('earth', 0, { u: 3, v: 4 }, { u: 0, v: 0 }), 5));
  // lift then measure height: a point lifted 12 m sits 12 m above the floor
  const w = floorToWorld([0, 0, 0], 'cylinder', R, { u: 1.2, v: 300 }, 12);
  check('height above floor = lift', approx(heightAboveFloor('cylinder', R, w), 12, 1e-6));
}

// ── TEST 6 — bearing: pin straight ahead ⇒ ~0; to the right ⇒ positive ──
{
  const R = 3200;
  const tee = { u: 0, v: 200 };
  // straight down the cylinder length (+z) is the fwd reference ⇒ aim 0
  check('bearing to a pin dead ahead ≈ 0', approx(bearingTo('cylinder', R, tee, { u: 0, v: 500 }), 0, 1e-6));
  // the basis `right` at θ=0 points to −Y, so increasing θ is to the LEFT (a
  // negative aim) and decreasing θ is to the right (positive) — self-consistent,
  // and designer + play both read it through this same bearingTo, so the sign is
  // an internal convention, not a bug.
  const bL = bearingTo('cylinder', R, tee, { u: 0.05, v: 500 });
  const bR = bearingTo('cylinder', R, tee, { u: -0.05, v: 500 });
  check('increasing θ aims left (negative)', bL < 0, `${bL.toFixed(3)} rad`);
  check('decreasing θ aims right (positive)', bR > 0, `${bR.toFixed(3)} rad`);
  check('the two are mirror images', approx(bL, -bR, 1e-9));
  // earth: pin to the +x side of a tee facing −z ⇒ to the right ⇒ positive
  check('earth bearing right-handed', bearingTo('earth', 0, { u: 0, v: 0 }, { u: 50, v: -100 }) > 0);
}

// ── TEST 7 — hole capture: close + slow drops, far or fast does not ──
{
  const R = 900;
  const pin = { u: 0.2, v: 400 };
  const at = floorToWorld([0, 0, 0], 'cylinder', R, pin, 0);
  check('a slow ball in the cup is holed', holed('cylinder', R, at, pin, 1.0));
  check('a fast ball blows past the cup', !holed('cylinder', R, at, pin, 50));
  const off = floorToWorld([0, 0, 0], 'cylinder', R, { u: 0.2, v: 420 }, 0); // 20 m past
  check('a slow ball 20 m away is NOT holed', !holed('cylinder', R, off, pin, 1.0));
}

// ── TEST 8 — par thresholds ──
{
  check('short hole is a par 3', par(150) === 3);
  check('mid hole is a par 4', par(350) === 4);
  check('long hole is a par 5', par(500) === 5);
}

// ── TEST 9 — course encode/decode round-trips, and procedural is deterministic ──
{
  const geom = { mode: 'cylinder', R: 8000, len: 6000 };
  const c = randomCourse(7, 0, geom);
  const c2 = randomCourse(7, 0, geom);
  check('procedural course is deterministic', JSON.stringify(c) === JSON.stringify(c2));
  const code = encodeCourse(c);
  const back = decodeCourse(code);
  check('course survives encode→decode', back && back.tee.u === c.tee.u && back.pin.v === c.pin.v && back.par === c.par);
  check('decode rejects garbage', decodeCourse('not a real code!!') === null);
  // a hazard sits on the floor and is detected at its own centre
  if (c.hazards.length) {
    const h = c.hazards[0];
    check('hazardAt finds a disc at its centre', hazardAt('cylinder', geom.R, c.hazards, { u: h.u, v: h.v }) === h);
  } else { pass++; }
}

console.log(`\nduck/golf: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
