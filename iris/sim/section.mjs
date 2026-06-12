// iris/sim/section.mjs — the coupled cross-section solve.
//
// One circle, one steady state. The only energy input is the lights; the only energy output
// is the radiator skin. In between, the heat takes a deliberate path the user chose: it ends
// up in the floor's water reservoirs and is carried out through the shell by HEAT PIPES to
// the skin, where it radiates to space. That single constraint — heat in == heat out — pins
// every absolute temperature in the model. Everything else is a gradient hung off it:
//
//   ENERGY    F_light·(2πR_floor)  =  εσ(T_skin⁴ − T_space⁴)·(2πR_skin)   ⇒ solves T_skin.
//             reservoir = skin + heat-pipe ΔT;  floor air = reservoir + contact ΔT.
//             (heat flows OUTWARD, so T_floor > T_reservoir > T_skin, always.)
//
//   TEMP      T(r) = dry centrifugal adiabat hung from the floor, plus a radiative INVERSION
//             that warms the axis (the sun is on the axis). Adiabat: cp·T + Φ = const with
//             Φ = −½ω²r², so T_adiabat(r) = T_floor − ω²(R_floor²−r²)/2cp (cooler toward the
//             axis); the inversion adds invStrength·(1−r/R_floor) on top — crank it and "up"
//             flips from cold to hot.
//
//   PRESSURE  centrifugal hydrostatic balance dP/dr = ρ·ω²r with the LOCAL temperature:
//             d(lnP)/dr = ω²r/(Rd·T(r)). Integrated inward from the floor pressure.
//
//   HUMIDITY  vapour hung off the floor (RH_floor). Jets OFF → it stratifies (e-folds upward,
//             trapped under the inversion). Jets ON → the fountain mixes the column: vapour
//             goes well-mixed, CONSERVING total water. Fog is wherever RH ≥ 1.
//
//   WIND      a convective velocity scale w* = (B·z_i)^⅓ from the surface heat flux, choked
//             by the inversion's stability; plus the jet sheet when the jets are on; turned by
//             the (very strong, f = 2ω) Coriolis force. Reported as |U|(r) across the bore.
//
// Pure, zero-dep, deterministic; runs identically in node and the browser. SI throughout.

import { CIRCLE, gravityAt, omegaFor, axisReachSpeed } from '../shared/geometry.mjs';
import { simulate as fountainSim, inducedWind, jetMechanics } from './fountain.mjs';
import { defaultParams as ratchetParams, fillBasin } from './ratchet.mjs';

export const Rd = 287.05;          // dry-air gas constant, J/kg/K
export const Rv = 461.5;           // water-vapour gas constant
export const cp = 1005;            // dry-air heat capacity, J/kg/K
export const EPS = Rd / Rv;        // 0.622
export const SIGMA = 5.670374419e-8; // Stefan–Boltzmann, W/m²/K⁴

// Saturation vapour pressure (Tetens), Pa; T in K.
export function eSat(T) {
  const Tc = T - 273.15;
  return 610.78 * Math.exp((17.27 * Tc) / (Tc + 237.3));
}
// Saturation specific humidity (kg vapour / kg dry air) at T, P.
export function qSat(T, P) {
  const e = Math.min(eSat(T), 0.99 * P);
  return (EPS * e) / (P - e);
}

export function defaultParams() {
  return {
    R_floor: CIRCLE.R_floor,    // inner rim / habitat floor, m
    R_skin: CIRCLE.R_skin,      // outer radiator skin, m
    gFloor: CIRCLE.G0,          // target gravity at the floor (sets ω), m/s²

    F_light: 400,               // light flux delivered to the floor — the ONLY heat in, W/m²
    emissivity: 0.92,           // radiator emissivity
    T_space: 3,                 // deep-space sink, K
    pipeDeltaT: 5,              // reservoir above radiator: heat-pipe + shell drop, K
    floorDeltaT: 8,             // floor air above the reservoir sink, K

    invStrength: 25,            // radiative inversion: extra warmth at the axis vs adiabat, K
    P_floor: 101325,            // habitat pressure at the floor, Pa
    RH_floor: 0.7,              // relative humidity at the floor (0..1)
    humidityScale: 2000,        // vapour e-folding height when stratified (jets off), m

    jets: false,                // fountain jets on/off
    jetExitSpeed: 120,          // jet WATER exit speed at the nozzle, m/s (axis-reach is ωR≈198)
    jetFlowRate: 0.1,           // m³/s per lake nozzle (100 L/s) — sets the induced breeze
    teeth: 3,                   // lakes / ratchet basins

    waterVolume: 1.5e9,         // total habitat water, m³ (slider) — filled into the basins
    cylinderLength: 8000,       // axial length, m (turns per-metre areas into real km²)

    N: 200,                     // radial samples across the bore (axis→floor)
  };
}

// Solve the whole cross-section. Returns radial arrays (axis→floor) + a closed-form summary.
export function solveSection(input = {}) {
  const p = { ...defaultParams(), ...input };
  const { R_floor, R_skin, N } = p;
  if (R_floor <= 0 || R_skin <= R_floor) throw new Error('need 0 < R_floor < R_skin');
  if (N < 2) throw new Error('need at least 2 samples');

  const omega = omegaFor(p.gFloor, R_floor);
  const w2 = omega * omega;

  // ── energy: in == out pins the temperatures ────────────────────────────────
  // F_light over the floor circumference radiates out over the (larger) skin circumference.
  const radFlux = (p.F_light * R_floor) / R_skin;     // W/m² the skin must shed
  const T_skin = Math.pow(p.T_space ** 4 + radFlux / (p.emissivity * SIGMA), 0.25);
  const T_reservoir = T_skin + p.pipeDeltaT;
  const T_floor = T_reservoir + p.floorDeltaT;
  const powerIn = p.F_light * 2 * Math.PI * R_floor;                                  // W/m
  const powerOut = p.emissivity * SIGMA * (T_skin ** 4 - p.T_space ** 4) * 2 * Math.PI * R_skin;

  // ── radial grids ───────────────────────────────────────────────────────────
  const r = new Float64Array(N);
  const g = new Float64Array(N);      // gravity, m/s²
  const T = new Float64Array(N);      // temperature, K
  const P = new Float64Array(N);      // pressure, Pa
  const rho = new Float64Array(N);    // density, kg/m³
  const adiabatSpan = (w2 * R_floor * R_floor) / (2 * cp);   // floor→axis adiabatic cooling, K

  for (let i = 0; i < N; i++) {
    const rr = (R_floor * i) / (N - 1);
    r[i] = rr;
    g[i] = gravityAt(omega, rr);
    const Tad = T_floor - (w2 * (R_floor * R_floor - rr * rr)) / (2 * cp);  // cooler inward
    T[i] = Tad + p.invStrength * (1 - rr / R_floor);                       // inversion warms axis
  }

  // pressure: integrate d(lnP)/dr = g/(Rd·T) inward from the floor (trapezoid in ln P)
  const f = new Float64Array(N);
  for (let i = 0; i < N; i++) f[i] = g[i] / (Rd * T[i]);
  let lnP = Math.log(p.P_floor);
  P[N - 1] = p.P_floor;
  for (let i = N - 2; i >= 0; i--) {
    lnP -= 0.5 * (f[i] + f[i + 1]) * (r[i + 1] - r[i]);   // r decreases ⇒ lnP decreases
    P[i] = Math.exp(lnP);
  }
  for (let i = 0; i < N; i++) rho[i] = P[i] / (Rd * T[i]);

  // ── humidity ───────────────────────────────────────────────────────────────
  const eFloor = p.RH_floor * eSat(T_floor);
  const qFloor = (EPS * eFloor) / (p.P_floor - eFloor);

  // stratified profile (jets off): vapour e-folds upward and is trapped near the floor
  const qStrat = new Float64Array(N);
  for (let i = 0; i < N; i++) qStrat[i] = qFloor * Math.exp(-(R_floor - r[i]) / p.humidityScale);

  // total vapour mass per unit length (∫ q·ρ·2πr dr) — the conserved quantity
  const vaporMass = (arr) => {
    let acc = 0;
    for (let i = 1; i < N; i++) {
      const a = arr[i - 1] * rho[i - 1] * r[i - 1], b = arr[i] * rho[i] * r[i];
      acc += 0.5 * (a + b) * (r[i] - r[i - 1]);
    }
    return 2 * Math.PI * acc;
  };
  const dryMass = (() => {           // ∫ ρ·2πr dr, to spread vapour over when well-mixed
    let acc = 0;
    for (let i = 1; i < N; i++) acc += 0.5 * (rho[i - 1] * r[i - 1] + rho[i] * r[i]) * (r[i] - r[i - 1]);
    return 2 * Math.PI * acc;
  })();
  const totalVapor = vaporMass(qStrat);

  const q = new Float64Array(N);
  if (p.jets) {
    const qMixed = totalVapor / dryMass;             // well-mixed, conserves the same water
    for (let i = 0; i < N; i++) q[i] = qMixed;
  } else {
    for (let i = 0; i < N; i++) q[i] = qStrat[i];
  }

  const RH = new Float64Array(N);
  const fogWater = new Float64Array(N);    // condensed water mixing ratio, kg/kg
  const fogMask = new Uint8Array(N);
  let fogInner = Infinity, fogOuter = -Infinity;     // radial band where fog lives
  for (let i = 0; i < N; i++) {
    const e = (q[i] * P[i]) / (EPS + q[i]);
    RH[i] = e / eSat(T[i]);
    const qs = qSat(T[i], P[i]);
    fogWater[i] = Math.max(0, q[i] - qs);
    if (RH[i] >= 1) {
      fogMask[i] = 1;
      fogInner = Math.min(fogInner, r[i]);
      fogOuter = Math.max(fogOuter, r[i]);
    }
  }
  const hasFog = fogOuter >= fogInner;

  // ── the fountain (borrowed ballistic solver) ───────────────────────────────
  // The jet's ballistic trajectory tells us whether it escapes to the axis (it does NOT
  // unless v0 ≥ the axis-reach speed ωR), and `inducedWind` tells us the AMBIENT breeze the
  // fountain drives — a few m/s, spread over a widening entrained-air plume — NOT the water's
  // exit speed. (The old model piped v0 straight into the wind field: that was the 140 m/s.)
  const fp = {
    R: R_floor, omega, v0: p.jetExitSpeed, angleDeg: 12, nozzle: 'jet',
    flowRate: p.jetFlowRate, inversionDepth: 150, coriolis: true, dt: 0.08, maxT: 220,
  };
  const fsim = fountainSim(fp);
  const iw = inducedWind(fp, fsim);
  const breeze = p.jets ? iw.wInversion : 0;          // the ambient fountain breeze, m/s

  // ── wind ───────────────────────────────────────────────────────────────────
  const rhoFloor = p.P_floor / (Rd * T_floor);
  const buoyFlux = (p.gFloor / T_floor) * (p.F_light / (rhoFloor * cp));    // m²/s³
  const wStar = Math.cbrt(Math.max(0, buoyFlux) * R_floor);                 // convective scale, m/s
  const stability = 1 / (1 + p.invStrength / Math.max(1, adiabatSpan));     // inversion chokes convection
  const fCor = 2 * omega;                                                   // Coriolis parameter, 1/s
  const breezeScale = Math.max(150, fsim.apexDepth);   // breeze decays over the plume's reach

  const Uconv = new Float64Array(N);
  const Ujet = new Float64Array(N);     // the ambient fountain-induced breeze (NOT the jet speed)
  const U = new Float64Array(N);
  let maxWind = 0;
  for (let i = 0; i < N; i++) {
    const x = r[i] / R_floor;
    Uconv[i] = wStar * stability * 4 * x * (1 - x);                 // 0 at axis & floor, peak mid-bore
    Ujet[i] = breeze * Math.exp(-(R_floor - r[i]) / breezeScale);  // strongest near the lakes, decays up
    U[i] = Math.hypot(Uconv[i], Ujet[i]);
    if (U[i] > maxWind) maxWind = U[i];
  }
  const RossbyFloor = maxWind / (fCor * R_floor);     // ≪1 here: rotation dominates

  // ── lakes: fill the ratchet basins with the water volume; topology sets the area ────
  const rp = { ...ratchetParams(), R_floor, teeth: p.teeth };
  const areaPerLength = p.waterVolume / Math.max(p.cylinderLength, 1);   // m² (cross-section)
  const fill = fillBasin(rp, areaPerLength / p.teeth);                   // one basin's share
  const lakeSurfaceArea = fill.surfaceArc * p.teeth * p.cylinderLength;  // m² of open water
  const jm = jetMechanics(p.jetExitSpeed);

  return {
    params: p, omega,
    r, g, T, P, rho, q, RH, fogWater, fogMask, Uconv, Ujet, U,
    jetTraj: fsim.streams[0].traj,    // rotating-frame [x,y] path for one lake (rotate per lake)
    lake: fill,                       // { rw, span, surfaceArc, depthMax, overflow }
    summary: {
      omega,
      rpm: (omega * 60) / (2 * Math.PI),
      period: (2 * Math.PI) / omega,
      gFloorActual: gravityAt(omega, R_floor),
      vRim: axisReachSpeed(omega, R_floor),
      // energy
      powerIn, powerOut,
      energyResidual: Math.abs(powerIn - powerOut),   // ~0 by construction
      T_skin, T_reservoir, T_floor, T_axis: T[0],
      adiabatSpan, upIsHot: T[0] > T_floor,
      // pressure
      P_floor: p.P_floor, P_axis: P[0], pRatio: P[N - 1] / P[0],
      // humidity
      qFloor, totalVapor, hasFog,
      fogInner: hasFog ? fogInner : null, fogOuter: hasFog ? fogOuter : null,
      RH_axis: RH[0], RH_floor_actual: RH[N - 1],
      // wind (ambient: convective + the fountain's induced breeze — never the jet exit speed)
      wStar, stability, fCor, RossbyFloor,
      maxWind, windFloor: U[N - 1], windAxis: U[0], jets: p.jets, breeze,
      // the fountain itself (water mechanics, kept separate from the weather)
      jetExitSpeed: p.jetExitSpeed, jetMach: jm.mach, jetSonic: jm.sonic,
      jetApexDepth: fsim.apexDepth, jetApexRadius: fsim.apexRadius,
      jetReachesAxis: fsim.reachesAxis, axisReachSpeed: axisReachSpeed(omega, R_floor),
      jetInducedCore: iw.wMax,        // in-plume speed at the nozzle (≈ v0) — for contrast
      // lakes (topology-aware fill)
      teeth: p.teeth, lakeSurfaceRadius: fill.rw, lakeDepthMax: fill.depthMax,
      lakeSpan: fill.span, lakeSurfaceArea, lakeOverflow: fill.overflow,
      waterVolume: p.waterVolume, lakeAreaFull: fill.areaFull * p.teeth * p.cylinderLength,
    },
  };
}

// Attach for headless tests / inline page use without a bundler.
const API = {
  Rd, Rv, cp, EPS, SIGMA,
  eSat, qSat, defaultParams, solveSection,
};
if (typeof globalThis !== 'undefined') globalThis.IrisSection = API;
export default API;
