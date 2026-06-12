// iris/sim/fountain.mjs — the rotating-frame ballistic fountain, vendored from tide/fountain
// (the proven solver) and pinned to iris's own geometry. A water parcel launched inward from
// a rim lake feels only the two fictitious forces of the rotating frame, so its path is an
// exact, conserved ODE:
//
//   centrifugal:  a = +ω²r   (radially OUTWARD — "down" is the rim)
//   Coriolis:     a = −2Ω×v  (deflects sideways; |2ωv| is COMPARABLE to gravity here)
//
// This is what tells you whether a jet escapes to the axis (it does NOT unless its exit speed
// exceeds the axis-reaching speed ωR — below that it arcs back to the rim), and, through
// `inducedWind`, what ambient breeze the fountain actually drives in the cabin air — which is
// a few m/s, NOT the water's exit speed. SI units (m, s, m/s). Pure, zero-dep, node + browser.

import { CIRCLE } from '../shared/geometry.mjs';

const RHO_W = 1000, RHO_AIR = 1.2, ENTRAIN_ALPHA = 0.12, SOUND_SPEED = 343;

export function defaultParams() {
  return {
    R: CIRCLE.R_floor, omega: CIRCLE.omega,
    v0: 120,                  // jet exit speed, m/s (axis-reaching speed here is ωR ≈ 198)
    angleDeg: 12,             // azimuthal aim from radial-inward (+ = prograde / with spin)
    nozzle: 'jet',
    flowRate: 0.1,            // m³/s per nozzle (100 L/s)
    inversionDepth: 150,      // m — the near-surface inversion the breeze is read at
    coriolis: true,
    dt: 0.08, maxT: 200,
  };
}

export const NOZZLES = {
  jet:    { streams: 1,  spreadDeg: 0,   dropMm: 3.0,  tau: 60,  label: 'Jet — tight column, max reach' },
  fan:    { streams: 11, spreadDeg: 50,  dropMm: 1.2,  tau: 9,   label: 'Fan — aimed azimuthal sheet' },
  fansym: { streams: 17, spreadDeg: 120, dropMm: 1.0,  tau: 7,   symmetric: true, label: 'Symmetric fan' },
  mist:   { streams: 27, spreadDeg: 30,  dropMm: 0.15, tau: 0.9, label: 'Mist — fine aerating spray' },
};

// Specific mechanical energy in the rotating frame: ½|v|² − ½ω²r². Conserved when τ=∞.
export const specificEnergy = (x, y, vx, vy, omega) =>
  0.5 * (vx * vx + vy * vy) - 0.5 * omega * omega * (x * x + y * y);

function deriv(s, omega, invTau, coriolis) {
  const c = coriolis ? 1 : 0;
  return {
    x: s.vx, y: s.vy,
    vx: omega * omega * s.x + c * 2 * omega * s.vy - s.vx * invTau,
    vy: omega * omega * s.y - c * 2 * omega * s.vx - s.vy * invTau,
  };
}

// Integrate one parcel launched at the rim low point (0,−R) with speed v0 at azimuthal angle
// α (rad) from radial-inward. Returns the trajectory (rotating-frame x,y) and its metrics.
export function integrateParcel(p, v0, alphaRad, tau = Infinity) {
  const { R, omega, dt, maxT, coriolis } = p;
  const invTau = isFinite(tau) ? 1 / tau : 0;
  let s = { x: 0, y: -R, vx: v0 * Math.sin(alphaRad), vy: v0 * Math.cos(alphaRad) };
  const E0 = specificEnergy(s.x, s.y, s.vx, s.vy, omega);
  const traj = [[s.x, s.y]];
  let t = 0, minR = R, maxEdrift = 0, landed = false, reachedAxis = false;
  const rOf = (st) => Math.hypot(st.x, st.y);
  while (t < maxT) {
    const k1 = deriv(s, omega, invTau, coriolis);
    const s2 = { x: s.x + k1.x * dt / 2, y: s.y + k1.y * dt / 2, vx: s.vx + k1.vx * dt / 2, vy: s.vy + k1.vy * dt / 2 };
    const k2 = deriv(s2, omega, invTau, coriolis);
    const s3 = { x: s.x + k2.x * dt / 2, y: s.y + k2.y * dt / 2, vx: s.vx + k2.vx * dt / 2, vy: s.vy + k2.vy * dt / 2 };
    const k3 = deriv(s3, omega, invTau, coriolis);
    const s4 = { x: s.x + k3.x * dt, y: s.y + k3.y * dt, vx: s.vx + k3.vx * dt, vy: s.vy + k3.vy * dt };
    const k4 = deriv(s4, omega, invTau, coriolis);
    const prevR = rOf(s);
    s = {
      x: s.x + dt / 6 * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: s.y + dt / 6 * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
      vx: s.vx + dt / 6 * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
      vy: s.vy + dt / 6 * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
    };
    t += dt;
    const r = rOf(s);
    minR = Math.min(minR, r);
    if (invTau === 0) maxEdrift = Math.max(maxEdrift, Math.abs(specificEnergy(s.x, s.y, s.vx, s.vy, omega) - E0) / Math.abs(E0 || 1));
    traj.push([s.x, s.y]);
    if (prevR < R && r >= R && minR < R - 1) { landed = true; break; }   // arced back to the rim
    if (r < 30) { reachedAxis = true; break; }                           // only if v0 ≳ ωR
  }
  return {
    traj, landed, reachedAxis, flightTime: t,
    apexDepth: R - minR,                  // max inward penetration (m)
    apexRadius: minR,                     // smallest radius reached (m)
    energyDrift: maxEdrift,
  };
}

// Fan the nozzle's streams, integrate each, aggregate the apex.
export function simulate(p = defaultParams()) {
  const nz = NOZZLES[p.nozzle] ?? NOZZLES.jet;
  const alpha0 = nz.symmetric ? 0 : (p.angleDeg * Math.PI) / 180;
  const spread = (nz.spreadDeg * Math.PI) / 180;
  const streams = [];
  for (let i = 0; i < nz.streams; i++) {
    const frac = nz.streams === 1 ? 0 : (i / (nz.streams - 1) - 0.5);
    streams.push(integrateParcel(p, p.v0, alpha0 + frac * spread, nz.tau));
  }
  const apexDepth = Math.max(...streams.map((s) => s.apexDepth));
  return {
    nozzle: p.nozzle, streams, apexDepth,
    apexRadius: p.R - apexDepth,
    reachesAxis: streams.some((s) => s.reachedAxis),
    meanFlightTime: streams.reduce((a, s) => a + s.flightTime, 0) / streams.length,
  };
}

// INDUCED WIND — the air the jet actually drags along. The water jet is a momentum source in
// the air (F = ρ_w·Q·v₀); that momentum is handed to an entrained-air plume that spreads as
// b(h)=b₀+α·h (α≈0.12, the turbulent-jet constant). Conserving F = ρ_a·w²·πb² gives the
// centreline wind w(h)=√(F/(ρ_a π b²)), capped at the water speed. The point: away from the
// thin jet core the air speed collapses fast — a gale in the column, a fresh BREEZE at the
// inversion (a few m/s), calm aloft. THIS is the ambient wind the fountain makes, not v₀.
export function inducedWind(p, sim = simulate(p)) {
  const Q = p.flowRate, F = RHO_W * Q * p.v0;
  const b0 = Math.sqrt(Math.max(Q / Math.max(p.v0, 1e-9), 1e-9) / Math.PI);
  const top = Math.max(sim.apexDepth, 1);
  const wAt = (h) => {
    if (F <= 0 || h < 0 || h > top) return 0;
    const b = b0 + ENTRAIN_ALPHA * h;
    return Math.min(p.v0, Math.sqrt(F / (RHO_AIR * Math.PI * b * b)));
  };
  return {
    wAt, top,
    wMax: wAt(0),                          // in the jet core at the nozzle (≈ v₀) — not weather
    wInversion: wAt(Math.min(p.inversionDepth, top)),   // the breeze the canopy feels
    wApex: wAt(top),
  };
}

// Jet mechanics — the engineering cost of an exit speed: Mach vs cabin air, and the pump
// stagnation pressure ½ρv². (Industrial waterjet cutters run 300–600 MPa, so even sonic is fine.)
export function jetMechanics(v0) {
  return {
    mach: v0 / SOUND_SPEED,
    stagnationPressure_MPa: (0.5 * RHO_W * v0 * v0) / 1e6,
    sonic: v0 >= SOUND_SPEED,
  };
}

const Fountain = { defaultParams, NOZZLES, specificEnergy, integrateParcel, simulate, inducedWind, jetMechanics };
if (typeof globalThis !== 'undefined') globalThis.IrisFountain = Fountain;
export default Fountain;
