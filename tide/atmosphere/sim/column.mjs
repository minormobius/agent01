// biome/atmosphere/sim/column.mjs — Module 2: a 1-D radial atmosphere column for the
// infinite O'Neill cylinder. Resolves the resource books Module 1 closed (cycles/) in the
// one dimension that matters here: RADIUS. The cylinder is symmetric along its axis and
// around it, so the only gradient is r — from the spin axis (r=0, "up") to the vegetated
// rim (r=R, "down", full gravity). This column is that radial profile of temperature,
// pressure, humidity and CO₂, evolving in time under a pulsable axial sun.
//
// Why radius is the whole story (and why the layout is counter-intuitive):
//   • Gravity is centrifugal: g(r) = ω²r. FULL at the rim, ZERO at the axis. Air pools at
//     the rim; pressure falls inward. For Island-Three scale (R=3200 m, ω chosen so the rim
//     feels 1 g) the drop is ~17% and the adiabatic temperature span is only ~16 K — there
//     is barely any thermodynamic room, which is why weather here is dew, not rain.
//   • "Up" wants to be HOT: the linear sun is on the axis, the cold sink is the shell
//     radiating to space at the rim — the inverse of Earth. Radiation builds a stable
//     INVERSION (warm aloft over cool at the surface) that suppresses vertical mixing.
//   • The trap: that same stratification starves the canopy of CO₂ — a photosynthesising
//     surface depletes its own boundary layer and stagnation won't resupply it. The only
//     pump inside the symmetry is the photoperiod thermal tide: pulsing the sun heats the
//     surface, destabilises the near-surface layer, and convectively ventilates the canopy.
//
// Method (idealised, in the Held–Suarez spirit): radiation is a Newtonian relaxation of
// potential temperature toward a prescribed radiative-equilibrium profile; dynamics is an
// explicit, stability-dependent vertical eddy diffusion (convective adjustment). Finite
// VOLUME on a rim-clustered grid in true cylindrical geometry (flux area ∝ r, the axis
// boundary is closed for free because its area is zero), so mass/heat/CO₂/water conserve to
// machine precision under the diffusion operator and change only by the surface exchange we
// prescribe (fed, in the full system, from Module 1's steady state). Potential temperature
// carries the centrifugal adiabat so that "well mixed" means uniform θ, not uniform T.
//
// Pure, zero-dep, deterministic; attaches to globalThis. Units: SI (m, s, K, Pa, kg).

import { CYLINDER } from '../../shared/geometry.mjs';
import { columnBeam } from './optics.mjs';

const Rd = 287.05;     // dry-air specific gas constant, J/kg/K
const Rv = 461.5;      // water-vapour specific gas constant
const cp = 1005;       // dry-air specific heat, J/kg/K
const Lv = 2.5e6;      // latent heat of vaporisation, J/kg
const EPS = Rd / Rv;   // 0.622, molar mass ratio
const M_AIR = 28.96, M_CO2 = 44.01;

// Saturation vapour pressure (Tetens), Pa, T in K.
export function eSat(T) {
  const Tc = T - 273.15;
  return 610.78 * Math.exp((17.27 * Tc) / (Tc + 237.3));
}
// Saturation mixing ratio (kg vapour / kg dry air) at temperature T and pressure P.
export const qSat = (T, P) => { const e = Math.min(eSat(T), 0.99 * P); return EPS * e / (P - e); };

export function defaultParams() {
  const R = CYLINDER.R_hab, g0 = CYLINDER.gFloor;   // habitat floor radius (m); floor gravity (~0.8 g)
  return {
    R, g0, omega: CYLINDER.omega,        // spin rate (1 g at the outer radius ⇒ ~0.8 g at the floor)
    N: 64,                               // radial cells
    stretch: 1.8,                        // grid clustering toward the rim (1 = uniform)

    P_rim: 101325,                       // surface pressure at the rim, Pa
    T_ref: 293.15,                       // reference / initial column temperature, K

    // radiation as Newtonian relaxation of θ toward a radiative-equilibrium profile that
    // encodes BOTH the stable aloft inversion (hot axis) and the diurnal surface signal
    // (a daytime warm bump → convection; a nighttime cool surface → fog). No separate
    // sensible-flux term, so heating can never out-run the relaxation (energetically safe).
    tau_rad: 6 * 3600,                   // relaxation timescale, s
    radInversion: 26,                    // daytime axis-vs-rim θ excess (the inversion), K
    invFloorNight: 0.4,                  // fraction of the inversion that persists unlit (stratification is "permanent")
    surfaceBump: 8,                      // daytime surface θ excess driving near-surface convection, K
    surfaceCool: 7,                      // nighttime surface θ deficit driving dew/fog, K
    surfaceScale: 150,                   // e-folding depth of the surface thermal signal, m
    dayLength: 86400,                    // forcing period, s
    photoperiod: 0.55,                   // fraction of the cycle the sun is lit

    // vertical mixing (eddy diffusivity), m²/s
    K_bg: 0.4,                           // background (molecular+residual) diffusivity
    K_conv: 55,                          // max convective diffusivity in unstable layers
    instabScale: 2e-4,                   // θ-gradient (K/m) that saturates convection

    // surface MASS exchange at the rim (would be fed by Module 1's steady state)
    ET_day: 5e-5,                        // daytime evapotranspiration, kg/m²/s
    ET_night: 4e-6,                      // nighttime baseline
    co2Resp: 2.5e-7,                     // surface CO₂ respiration source, kg/m²/s (always on; ~6 µmol/m²/s)
    co2Photo: 9e-7,                      // surface CO₂ photosynthetic sink when lit, kg/m²/s (~20 µmol/m²/s)
    co2_background_ppm: 600,             // initial well-mixed CO₂, ppmv
    RH_init: 0.6,                        // initial relative humidity
    surfaceLayer: 300,                   // depth (m) the surface exchange is mixed into
    dewSettle: 1.5e-4,                   // fog→surface settling rate, 1/s (gravitational fallout)

    // fog optics — the linear sun burning off the fog (Mie absorption; see optics.mjs)
    irradiance: 500,                     // canopy design irradiance, W/m² (≈half a sun)
    fogReff: 1e-5,                       // fog droplet effective radius, m (10 µm)
    fogSolarAbsorption: 0.2,             // fraction of fog extinction that is absorption (NIR) → burn-off

    // fountain momentum coupling (Module 2b): a mechanical near-surface eddy diffusivity the
    // jet injects, on top of buoyant convection. Active independent of stability — it is the
    // night-time ventilation pump. Set via Fountain.ventilationK(); 0 = no fountain.
    fountainK: 0,                        // m²/s added to faces within fountainDepth of the rim
    fountainDepth: 300,                  // m
    fountainMode: 'always',              // 'always' | 'day' | 'night' — when the jet runs (phase vs the light)
    fountainNightOnly: false,            // (back-compat) true ⇒ same as fountainMode:'night'
  };
}

// Build the rim-clustered cylindrical grid. Faces at r_f, cells between them. Cell 0 hugs
// the axis (r≈0), cell N-1 hugs the rim (r=R). The axis face has zero area ⇒ closed BC free.
export function buildGrid(p) {
  const { R, N, stretch } = p;
  const rf = new Array(N + 1);
  for (let f = 0; f <= N; f++) { const x = f / N; rf[f] = R * (1 - Math.pow(1 - x, stretch)); }
  const rc = new Array(N), vol = new Array(N), area = new Array(N + 1), dr = new Array(N + 1);
  for (let f = 0; f <= N; f++) area[f] = 2 * Math.PI * rf[f];          // flux area per unit length
  for (let i = 0; i < N; i++) {
    rc[i] = 0.5 * (rf[i] + rf[i + 1]);
    vol[i] = Math.PI * (rf[i + 1] * rf[i + 1] - rf[i] * rf[i]);        // annulus volume per unit length
  }
  for (let f = 1; f < N; f++) dr[f] = rc[f] - rc[f - 1];               // inter-centre distance for gradients
  dr[0] = rc[0]; dr[N] = R - rc[N - 1];
  // centrifugal adiabatic offset Δ(r)=ω²(R²-r²)/(2cp): T = θ − Δ(r). 0 at rim, max at axis.
  const w2 = p.omega * p.omega;
  const adiab = rc.map((r) => (w2 * (R * R - r * r)) / (2 * cp));
  return { rf, rc, vol, area, dr, adiab, N };
}

export function initState(p, g = buildGrid(p)) {
  const N = g.N;
  const T = new Array(N).fill(p.T_ref);
  // hydrostatic pressure (cold start) → density → humidity from RH_init → CO₂ from ppm
  const P = hydrostaticP(p, g, T, new Array(N).fill(0));
  const q = T.map((Ti, i) => p.RH_init * qSat(Ti, P[i]));
  const c = new Array(N).fill((p.co2_background_ppm * 1e-6) * (M_CO2 / M_AIR)); // ppmv → mass ratio
  const liquid = new Array(N).fill(0);
  return { t: 0, T, q, c, liquid, dewCollected: 0 };
}

// Hydrostatic pressure on cell centres, marching inward from the rim face (P_rim), using the
// virtual temperature T_v = T(1+0.61 q) so humidity buoyancy is honest. dP/dr = ρ ω² r.
export function hydrostaticP(p, g, T, q) {
  const { rf, rc, N } = g; const w2 = p.omega * p.omega;
  const Pf = new Array(N + 1); Pf[N] = p.P_rim;
  for (let f = N - 1; f >= 0; f--) {
    const i = f;                                   // cell just inward of face f
    const Tv = T[i] * (1 + 0.61 * q[i]);
    // ∫ from r_{f+1} to r_f of ω²r/(Rd Tv) dr  (negative ⇒ P falls inward)
    const expo = -(w2 * (rf[f + 1] * rf[f + 1] - rf[f] * rf[f])) / (2 * Rd * Tv);
    Pf[f] = Pf[f + 1] * Math.exp(expo);
  }
  return rc.map((_, i) => 0.5 * (Pf[i] + Pf[i + 1]));
}

const sunlit = (p, t) => ((t % p.dayLength) / p.dayLength) < p.photoperiod ? 1 : 0;

// Eddy diffusivity at interior faces from static stability: unstable (θ rising outward toward
// the rim) ⇒ convective K, stable inversion ⇒ background K only. PLUS the fountain's mechanical
// mixing near the surface (momentum coupling), which works regardless of stability — the
// night-time ventilation pump.
export function eddyK(p, g, theta, lit = 1) {
  const { rc, dr, N } = g; const K = new Array(N + 1).fill(p.K_bg);
  K[0] = 0; K[N] = 0;                              // closed at axis & rim (surface exchange is separate)
  const mode = p.fountainNightOnly ? 'night' : (p.fountainMode || 'always');
  const fountainOn = p.fountainK > 0 &&
    (mode === 'always' || (mode === 'day' && lit === 1) || (mode === 'night' && lit === 0));
  for (let f = 1; f < N; f++) {
    const dThetaDr = (theta[f] - theta[f - 1]) / dr[f];   // >0 ⇒ unstable (hot air under cool)
    const conv = Math.max(0, Math.tanh(dThetaDr / p.instabScale));
    K[f] = p.K_bg + p.K_conv * conv;
    if (fountainOn && (p.R - 0.5 * (rc[f - 1] + rc[f])) <= p.fountainDepth) K[f] += p.fountainK;
  }
  return K;
}

// Tridiagonal (Thomas) solver for the implicit diffusion of one mass-conserving scalar.
// Exported for the conservation self-test: with closed boundaries it preserves Σ M_i χ_i.
export function diffuseImplicit(chi, M, cond, dt, N) {
  // (M_i/dt + Σ cond) χ_i − cond_f χ_{nb} = M_i/dt χ_i^n   ⇒ tridiagonal
  const a = new Array(N).fill(0), b = new Array(N), cc = new Array(N).fill(0), d = new Array(N);
  for (let i = 0; i < N; i++) {
    const lo = cond[i], hi = cond[i + 1];          // conductances at inner/outer faces
    a[i] = -lo; cc[i] = -hi; b[i] = M[i] / dt + lo + hi; d[i] = (M[i] / dt) * chi[i];
  }
  // forward sweep
  for (let i = 1; i < N; i++) { const w = a[i] / b[i - 1]; b[i] -= w * cc[i - 1]; d[i] -= w * d[i - 1]; }
  const x = new Array(N); x[N - 1] = d[N - 1] / b[N - 1];
  for (let i = N - 2; i >= 0; i--) x[i] = (d[i] - cc[i] * x[i + 1]) / b[i];
  return x;
}

export function step(s, p, g, dt) {
  const N = g.N;
  const T = s.T.slice(), q = s.q.slice(), c = s.c.slice(), liquid = s.liquid.slice();
  let dew = s.dewCollected;

  // diagnostics: pressure, density, mass, potential temperature
  const P = hydrostaticP(p, g, T, q);
  const rho = T.map((Ti, i) => P[i] / (Rd * Ti * (1 + 0.61 * q[i])));
  const M = g.vol.map((V, i) => rho[i] * V);                         // air mass per cell (per unit length)
  const theta = T.map((Ti, i) => Ti + g.adiab[i]);                  // carries the centrifugal adiabat
  const lit = sunlit(p, s.t);

  // face conductances G_f = A_f · ρ_f · K_f / dr_f
  const K = eddyK(p, g, theta, lit);
  const cond = new Array(N + 1).fill(0);
  for (let f = 1; f < N; f++) {
    const rhoF = 0.5 * (rho[f - 1] + rho[f]);
    cond[f] = (g.area[f] * rhoF * K[f]) / g.dr[f];
  }

  // implicit vertical mixing of θ, q, c (closed boundaries ⇒ exactly conservative)
  const thetaMix = diffuseImplicit(theta, M, cond, dt, N);
  const qMix = diffuseImplicit(q, M, cond, dt, N);
  const cMix = diffuseImplicit(c, M, cond, dt, N);
  for (let i = 0; i < N; i++) { theta[i] = thetaMix[i]; q[i] = qMix[i]; c[i] = cMix[i]; }

  // radiative relaxation of θ toward the equilibrium profile: a stable aloft inversion (hot
  // axis, partly persistent at night) plus a diurnal surface signal (warm bump by day for
  // convection, cool by night for dew). Relaxation can't be out-run, so this is energy-safe.
  const relax = 1 - Math.exp(-dt / p.tau_rad);
  for (let i = 0; i < N; i++) {
    const h = p.R - g.rc[i];
    const invAmp = p.radInversion * (p.invFloorNight + (1 - p.invFloorNight) * lit);
    const aloft = invAmp * (h / p.R);                               // 0 at rim → invAmp at axis (stable)
    const surf = (lit ? p.surfaceBump : -p.surfaceCool) * Math.exp(-h / p.surfaceScale);
    const thetaEq = p.T_ref + aloft + surf;
    theta[i] += (thetaEq - theta[i]) * relax;
  }

  // surface MASS exchange mixed into a finite-depth surface layer (robust to grid resolution;
  // each flux is shared over the layer's real mass M_sl, so the intensive change is uniform).
  const Arim = g.area[N];
  const inLayer = (i) => p.R - g.rc[i] <= p.surfaceLayer || i === N - 1;   // always include the rim cell
  let Msl = 0; for (let i = 0; i < N; i++) if (inLayer(i)) Msl += M[i];
  const ET = lit ? p.ET_day : p.ET_night;
  const co2Flux = p.co2Resp - lit * p.co2Photo;                     // net surface CO₂ (source − sink)
  const dQ = (ET * Arim * dt) / Msl, dC = (co2Flux * Arim * dt) / Msl;
  for (let i = 0; i < N; i++) if (inLayer(i)) { q[i] += dQ; c[i] += dC; }
  for (let i = 0; i < N; i++) { if (c[i] < 0) c[i] = 0; if (q[i] < 0) q[i] = 0; }

  // solar fog burn-off (Mie absorption): when lit, the linear sun's beam deposits absorbed
  // power in the fog, warming it (θ up) so the moist adjustment below evaporates the droplets.
  // The sun eats its own fog — strongest where the fog is thickest.
  if (lit && p.fogSolarAbsorption > 0) {
    const { absorbed } = columnBeam(p, g, liquid, rho);
    for (let i = 0; i < N; i++) theta[i] += (absorbed[i] * dt) / (M[i] * cp);
  }

  // back to temperature, then a MOIST ENTHALPY adjustment: condense/evaporate to the
  // consistent state where q = qSat(T) accounting for the latent-heat feedback on T, in one
  // step (the linearised factor 1 + (Lv/cp)·dqSat/dT prevents the overshoot that an explicit
  // condense-to-saturation would cause). Settled fog falls to the surface as collected dew.
  for (let i = 0; i < N; i++) {
    T[i] = theta[i] - g.adiab[i];
    const qs = qSat(T[i], P[i]);
    const dqsdT = Math.max(0, (qSat(T[i] + 0.01, P[i]) - qSat(T[i] - 0.01, P[i])) / 0.02);
    let d = (q[i] - qs) / (1 + (Lv / cp) * dqsdT);                  // >0 condense, <0 evaporate
    if (d < 0) d = Math.max(d, -liquid[i]);                         // can't evaporate absent fog
    q[i] -= d; liquid[i] += d; T[i] += (Lv * d) / cp;
    if (q[i] < 0) q[i] = 0; if (liquid[i] < 0) liquid[i] = 0;
    const fall = liquid[i] * (1 - Math.exp(-p.dewSettle * dt));     // gravitational fallout → dew
    liquid[i] -= fall; dew += fall * M[i];
  }

  return { t: s.t + dt, T, q, c, liquid, dewCollected: dew };
}

export function run(p = defaultParams(), g = buildGrid(p), { days = 12, dtMin = 2, sampleHours = 6 } = {}) {
  const dt = dtMin * 60;
  const steps = Math.round((days * 86400) / dt);
  const every = Math.max(1, Math.round((sampleHours * 3600) / dt));
  let s = initState(p, g);
  const traj = [snapshot(s, p, g)];
  for (let i = 1; i <= steps; i++) { s = step(s, p, g, dt); if (i % every === 0) traj.push(snapshot(s, p, g)); }
  return traj;
}

// ── Diagnostics ──────────────────────────────────────────────────────────────
export function profile(s, p, g) {
  const P = hydrostaticP(p, g, s.T, s.q);
  return g.rc.map((r, i) => {
    const RH = s.q[i] / qSat(s.T[i], P[i]);
    return {
      r, altitude: p.R - r, T: s.T[i], theta: s.T[i] + g.adiab[i], P: P[i],
      rho: P[i] / (Rd * s.T[i] * (1 + 0.61 * s.q[i])),
      q: s.q[i], RH, co2_ppm: (s.c[i] * (M_AIR / M_CO2)) * 1e6, liquid: s.liquid[i],
    };
  });
}

export function snapshot(s, p, g) {
  const prof = profile(s, p, g);
  const T = prof.map((x) => x.T), Pp = prof.map((x) => x.P);
  const rim = prof[g.N - 1], axis = prof[0];
  // fog layer: contiguous near-surface cells holding actual liquid water (real fog, not just
  // saturated-but-clear air) — the depth of the stratus deck against the canopy wall.
  let fogCells = 0; for (let i = g.N - 1; i >= 0; i--) { if (prof[i].liquid > 1e-6) fogCells++; else break; }
  const fogThickness = fogCells > 0 ? (p.R - g.rf[g.N - fogCells]) : 0;
  // canopy CO₂ deficit: rim cell vs column mean (mass-weighted) — the dead-zone metric
  const Mtot = g.vol.reduce((a, V, i) => a + prof[i].rho * V, 0);
  const co2Mean = g.vol.reduce((a, V, i) => a + prof[i].co2_ppm * prof[i].rho * V, 0) / Mtot;
  // fog optics: how much of the sun reaches the canopy through the haze, and the visibility
  const rho = prof.map((x) => x.rho);
  const beam = columnBeam(p, g, s.liquid, rho);
  return {
    day: s.t / 86400, sunlit: sunlit(p, s.t),
    T_rim: rim.T, T_axis: axis.T, T_span: Math.max(...T) - Math.min(...T),
    P_drop: 1 - axis.P / rim.P,
    RH_rim: rim.RH, fogThickness, fogCells,
    co2_rim_ppm: rim.co2_ppm, co2_axis_ppm: axis.co2_ppm, co2_mean_ppm: co2Mean,
    co2_canopyDeficit_ppm: co2Mean - rim.co2_ppm,
    canopyLightFrac: beam.canopyTransmittance,        // fraction of the sun reaching the plants
    fogOpticalDepth: beam.opticalDepth, visibility_m: beam.visibilityMin,
    dewCollected: s.dewCollected, profile: prof,
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  'Radiation is Newtonian relaxation to a prescribed radiative-equilibrium inversion (Held–Suarez style), not a resolved radiative-transfer calculation.',
  'Vertical mixing is a static-stability eddy diffusivity (convective adjustment); no resolved winds, so Coriolis/rolls enter only as the magnitude of K.',
  'Latent heat is added to the air on condensation but the matching surface energy debit from evapotranspiration is not tracked (1-way water energy).',
  '1-D in radius only: azimuthal/axial structure (the Coriolis-organised bands the visualiser will show) is collapsed into the mixing coefficient.',
  'Surface exchange (sensible, ET, CO₂) is prescribed; in the coupled system it is set by Module 1’s steady state.',
  'The rim shell radiator and the axial sun are boundary forcings, not modelled bodies; the grid’s innermost cell has finite r (no axis singularity).',
];

const Atmosphere = {
  Rd, Rv, cp, Lv, M_AIR, M_CO2, eSat, qSat, defaultParams, buildGrid, initState,
  hydrostaticP, eddyK, step, run, profile, snapshot, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Atmosphere = Atmosphere;
export default Atmosphere;
