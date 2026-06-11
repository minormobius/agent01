// biome/fountain/sim/fountain.mjs — the 2D azimuthal cross-section: a jet from the rim
// low point ("Fond du Lac"), thrown inward toward the axis, curved by the spin.
//
// Module 2 resolved the cylinder in radius; this resolves the OTHER free dimension —
// azimuth — by looking straight down the axis. In that cross-section the physics is
// exact and cheap: a water parcel in flight feels only the rotating frame's two
// fictitious forces, so its trajectory is a clean ODE we can integrate and CONSERVE.
//
//   centrifugal:  a = +ω² r   (radially OUTWARD — "down" is the rim)
//   Coriolis:     a = −2 Ω × v   (deflects sideways; |2ωv| is COMPARABLE TO GRAVITY here)
//
// In rotating Cartesian (x,y) with Ω = ω ẑ:
//   ax = ω²x + 2ω·vy − vx/τ
//   ay = ω²y − 2ω·vx − vy/τ          (τ = effective drag time; ∞ ⇒ ballistic)
//
// Why this single actuator solves two stagnations (the design this models):
//   • STAGNANT WATER — the jet sprays Fond-du-Lac water through air: O₂ in (oxidises
//     residual BOD, drives nitrification → mineral-N back to Module 1), volatiles out,
//     axial-sun UV on the droplets. Aeration polish the reeds can't do.
//   • STAGNANT AIR — the rising column entrains and lofts surface air through the
//     inversion. The crisp test is geometric: does the parcel's apex clear the ~150 m
//     inversion depth from Module 2? If yes, it ventilates — and it runs at NIGHT, when
//     the photoperiod thermal pump is off and stagnation is worst.
//   • DISTRIBUTION — Coriolis (2ωv ~ g) turns a point jet into a curved SHEET that lays
//     water down over a broad azimuthal arc. The spin is the sprinkler; the slight
//     azimuthal grade collects the runoff back to the low point. Loop closed.
//
// Pure, zero-dep, deterministic; attaches to globalThis. SI units (m, s, m/s).

const G_PER = (omega) => omega * omega;   // centrifugal coefficient ω²

export function defaultParams() {
  const R = 3200, g0 = 9.81;              // rim radius (m); rim gravity (1 g)
  return {
    R, g0, omega: Math.sqrt(g0 / R),      // ω so the rim feels 1 g (≈0.0554 rad/s)
    v0: 70,                                // jet exit speed, m/s
    angleDeg: 25,                          // azimuthal aim from radial-inward (+ = prograde / with spin)
    nozzle: 'fan',                         // 'jet' | 'fan' | 'mist'
    flowRate: 0.1,                         // m³/s per nozzle (100 L/s)
    inversionDepth: 150,                   // m — the near-surface inversion to clear (from Module 2)
    coriolis: true,                        // toggle (off ⇒ pure radial fountain, returns to launch)
    dt: 0.02, maxT: 60,                    // integrator step / cap (s)
  };
}

// Nozzle presets. `tau` is the EFFECTIVE drag relaxation time (s) — not raw Stokes, since a
// coherent jet stays ballistic far past where its drops' Reynolds number would allow; it
// folds in jet coherence + breakup. `dropMm` is the post-breakup droplet diameter, used only
// for the aeration metric (gas exchange ∝ surface/volume ∝ 1/dropMm). `streams`/`spreadDeg`
// fan the launch azimuthally.
export const NOZZLES = {
  jet:  { streams: 1,  spreadDeg: 0,  dropMm: 3.0,  tau: 60,  label: 'Jet — tight column, max reach' },
  fan:  { streams: 11, spreadDeg: 50, dropMm: 1.2,  tau: 9,   label: 'Fan — azimuthal sheet' },
  mist: { streams: 27, spreadDeg: 30, dropMm: 0.15, tau: 0.9, label: 'Mist — fine aerating spray' },
};

// Specific mechanical energy in the rotating frame: ½|v|² − ½ω²r². Conserved when τ=∞
// (the centrifugal potential is −½ω²r²; Coriolis does no work). The conservation test.
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

// Integrate one parcel launched at the rim low point (0,−R) with speed v0 at azimuthal
// angle α (rad) from radial-inward. Returns the trajectory and its metrics.
export function integrateParcel(p, v0, alphaRad, tau = Infinity) {
  const { R, omega, dt, maxT, coriolis } = p;
  const invTau = isFinite(tau) ? 1 / tau : 0;
  // inward unit at (0,−R) is (0,+1); prograde tangent is (+1,0)
  let s = { x: 0, y: -R, vx: v0 * Math.sin(alphaRad), vy: v0 * Math.cos(alphaRad) };
  const E0 = specificEnergy(s.x, s.y, s.vx, s.vy, omega);
  const traj = [[s.x, s.y]];
  let t = 0, minR = R, maxEdrift = 0, landed = false;
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
    // landing: came back out to the rim after going inward
    if (prevR < R && r >= R && minR < R - 1) { landed = true; break; }
    if (r < 30) break;                     // reached the axis region (only for v0 ≳ ωR)
  }
  // landing azimuth relative to launch (−π/2). prograde (with spin) is +Δθ.
  const launchTheta = -Math.PI / 2;
  const landTheta = Math.atan2(s.y, s.x);
  let dTheta = landTheta - launchTheta;
  while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
  while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
  return {
    traj, landed, flightTime: t,
    apexDepth: R - minR,                   // max inward penetration (m)
    driftArc: R * dTheta,                  // azimuthal landing displacement along the rim (m, signed)
    energyDrift: maxEdrift,                // ballistic conservation residual
  };
}

// Simulate the whole nozzle: fan the streams across the spread, integrate each, aggregate.
export function simulate(p = defaultParams()) {
  const nz = NOZZLES[p.nozzle] ?? NOZZLES.fan;
  const v0 = p.v0, alpha0 = (p.angleDeg * Math.PI) / 180;
  const spread = (nz.spreadDeg * Math.PI) / 180;
  const streams = [];
  for (let i = 0; i < nz.streams; i++) {
    const frac = nz.streams === 1 ? 0 : (i / (nz.streams - 1) - 0.5);   // −0.5..+0.5
    const res = integrateParcel(p, v0, alpha0 + frac * spread, nz.tau);
    streams.push(res);
  }
  const apexes = streams.map((s) => s.apexDepth);
  const drifts = streams.map((s) => s.driftArc);
  const apexDepth = Math.max(...apexes);
  const meanFlight = streams.reduce((a, s) => a + s.flightTime, 0) / streams.length;
  // aeration: gas exchange ∝ (surface/volume ∝ 1/dropMm) × contact time, normalised to a 3 mm / 1 s jet
  const aerationIndex = (1 / nz.dropMm) * meanFlight / ((1 / 3.0) * 1);
  // ventilation: lofted-air proxy ∝ jet momentum flux × how far the plume rises past the inversion
  const reach = Math.max(0, apexDepth / p.inversionDepth);
  const ventilationIndex = p.flowRate * 1000 * v0 * Math.min(reach, 3) / 1000; // relative
  return {
    nozzle: p.nozzle, streams,
    apexDepth, clearsInversion: apexDepth > p.inversionDepth,
    meanDriftArc: drifts.reduce((a, b) => a + b, 0) / drifts.length,
    spreadArc: Math.max(...drifts) - Math.min(...drifts),
    meanFlightTime: meanFlight,
    aerationIndex, ventilationIndex,
    waterThroughput_Lps: p.flowRate * 1000,
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  'Parcels are ballistic in the rotating frame with an effective drag time per nozzle; no parcel–parcel or jet–air momentum coupling (the air is treated as co-rotating).',
  'Drag τ is an effective coherence/breakup parameter, not raw Stokes — a coherent jet stays ballistic far past its droplets’ Reynolds limit.',
  'Aeration and ventilation are relative indices (gas-exchange ∝ surface×time; lofted air ∝ jet momentum×reach), not a resolved two-phase plume.',
  '2-D cross-section: axial structure is out of plane; the parcel never leaves its (r,θ) slice.',
  'No evaporation in flight; the water-mass handoff to Module 2’s humidity/dew is left to the coupling layer.',
];

const Fountain = {
  defaultParams, NOZZLES, specificEnergy, integrateParcel, simulate, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Fountain = Fountain;
export default Fountain;
