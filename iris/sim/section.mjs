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
//   HUMIDITY  SOLVED from the lakes (source) + the cold-sink dew point, not set. Jets OFF → it
//             stratifies (e-folds upward,
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

// material/empirical constants for the SOLVED inversion (greenhouse) + vapour scale height
// (turbulent mixing). These are physical properties, not design dials — the scenario knobs
// (lights, water, spin, geometry) drive the climate through them.
const KAPPA_SW = 0.012;            // sunlight absorbed per unit column water, m²/kg
const TAU_BASE = 0.02;             // CO₂ + dry-air baseline absorption optical depth
const MIX_EFF = 12;                // turbulent mixing efficiency (buoyancy-length multiplier)
const W_MIN = 0.2;                 // residual mixing velocity, m/s
const N_MIN = 1e-3;                // floor on the Brunt–Väisälä frequency, 1/s
const HQ_MIN = 40, HQ_MAX = 6000;  // clamp on the vapour scale height, m

// diurnal forcing
const DAY_S = 86400;               // seconds in a day
const RHO_W = 1000, C_W = 4186;    // water density, heat capacity (for the lakes' thermal mass)

// Photoperiod: a smooth day/night shape, 1 at noon (t=12 h), 0 at night; `dayLength` is the lit
// fraction of the day. (dayLength=1 ⇒ perpetual day, the steady case.)
function sunShape(tHour, dayLength) {
  if (dayLength >= 1) return 1;
  if (dayLength <= 0) return 0;
  const raw = Math.cos((2 * Math.PI * (tHour - 12)) / 24);   // +1 noon … −1 midnight
  const thr = Math.cos(Math.PI * dayLength);                 // lit when raw > thr
  return Math.max(0, (raw - thr) / (1 - thr));
}
// daily mean of the shape, so we can normalise the instantaneous flux to a fixed daily mean
function meanSunShape(dayLength, nS = 96) {
  let s = 0; for (let i = 0; i < nS; i++) s += sunShape(((i + 0.5) / nS) * 24, dayLength);
  return Math.max(s / nS, 1e-6);
}
// normalised instantaneous sun: averages to 1 over a day, so F_light keeps its "daily-mean" meaning
const sunNow = (tHour, dayLength) => sunShape(tHour, dayLength) / meanSunShape(dayLength);
// when do the fountains run? night = ventilate the stagnant dark hours (the tide insight)
function jetsScheduled(mode, tHour, dayLength) {
  const sf = sunShape(tHour, dayLength);
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  if (mode === 'day') return sf > 0.4;
  return sf < 0.15;                  // 'night' (default)
}

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

    F_light: 400,               // DAILY-MEAN light flux to the floor — the heat in, W/m²
    emissivity: 0.92,           // radiator emissivity
    T_space: 3,                 // deep-space sink, K
    pipeDeltaT: 5,              // reservoir above radiator: heat-pipe + shell drop, K
    floorDeltaT: 8,             // floor air above the reservoir sink, K

    timeHour: 12,               // time of day, h (0–24) — noon by default
    dayLength: 0.5,             // lit fraction of the day (photoperiod); 1 ⇒ perpetual day
    jetMode: 'night',           // when the fountains run: 'night'|'day'|'always'|'off'

    P_floor: 101325,            // habitat pressure at the floor, Pa

    jets: true,                 // fountains enabled (they then run per jetMode)
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

  // ── lakes: fill the ratchet basins with the water volume; topology sets the area ────
  const rp = { ...ratchetParams(), R_floor, teeth: p.teeth };
  const areaPerLength = p.waterVolume / Math.max(p.cylinderLength, 1);   // m² (cross-section)
  const fill = fillBasin(rp, areaPerLength / p.teeth);                   // one basin's share
  const lakeSurfaceArea = fill.surfaceArc * p.teeth * p.cylinderLength;  // m² of open water
  const lakeFrac = Math.min(1, (fill.surfaceArc * p.teeth) / (2 * Math.PI * R_floor)); // wetted floor

  // ── diurnal energy balance: the floor temperature LAGS the day/night sun ────────────
  // The daily-mean light still pins the mean temperature (the radiator sheds the daily mean),
  // but the floor has real thermal mass — the air column + the lake water — so its temperature
  // is a damped, phase-lagged diurnal wave, not an instant tracker. We integrate the floor
  // energy balance C·dT/dt = F(t) − radiate(T) to its periodic steady state. (dayLength=1 ⇒
  // constant sun ⇒ this reduces to the old in==out steady state.)
  const dTtot = p.pipeDeltaT + p.floorDeltaT;
  const Fnow = p.F_light * sunNow(p.timeHour, p.dayLength);             // instantaneous flux now
  const radOutFlux = (Tf) => p.emissivity * SIGMA * ((Tf - dTtot) ** 4 - p.T_space ** 4) * (R_skin / R_floor);
  const radMean = (p.F_light * R_floor) / R_skin;                      // mean flux the skin sheds
  const TfloorMean = Math.pow(p.T_space ** 4 + radMean / (p.emissivity * SIGMA), 0.25) + dTtot;
  // heat capacity per floor area: air column (P/g·cp) + lake water (depth·ρ·c over its area)
  const Cheat = (p.P_floor / p.gFloor) * cp + lakeFrac * fill.depthMax * RHO_W * C_W;
  const nStep = 96, dtStep = DAY_S / nStep;
  let Tf = TfloorMean, T_floor = TfloorMean;
  for (let day = 0; day < 3; day++) {                                  // settle to the periodic cycle
    for (let k = 0; k < nStep; k++) {
      const th = ((k + 0.5) / nStep) * 24;
      Tf += (((p.F_light * sunNow(th, p.dayLength)) - radOutFlux(Tf)) / Cheat) * dtStep;
      if (day === 2 && Math.abs(th - p.timeHour) <= 12 / nStep) T_floor = Tf;  // sample at the time
    }
  }
  const T_skin = T_floor - dTtot;
  const T_reservoir = T_floor - p.floorDeltaT;
  const powerIn = Fnow * 2 * Math.PI * R_floor;                        // instantaneous in, W/m
  const powerOut = radOutFlux(T_floor) * 2 * Math.PI * R_floor;        // instantaneous out, W/m
  const jetsOn = p.jets && jetsScheduled(p.jetMode, p.timeHour, p.dayLength);

  // ── the fountain (borrowed ballistic solver) — computed early so its induced breeze can
  // set the night-time mixing depth (when convection is off, the jets are the mixer) ──────
  const fp = {
    R: R_floor, omega, v0: p.jetExitSpeed, angleDeg: 12, nozzle: 'jet',
    flowRate: p.jetFlowRate, inversionDepth: 150, coriolis: true, dt: 0.08, maxT: 220,
  };
  const fsim = fountainSim(fp);
  const iw = inducedWind(fp, fsim);
  const breeze = jetsOn ? iw.wInversion : 0;          // the ambient fountain breeze, m/s

  // ── humidity SOURCE — solved, not set: the lakes ARE the cold reservoir water ──────
  // The lakes are the reservoir water that feeds the heat pipes, so their surface sits at the
  // cold reservoir temperature. They are therefore BOTH the evaporation source AND the
  // condenser: floor vapour can't exceed saturation over that cold water, e_sat(T_reservoir) —
  // the ceiling. With no open water the air is dry; more open water (lakeFrac) fills the floor
  // air toward that cold-water ceiling. (The vertical PROFILE is solved below; jets redistribute.)
  const eSatFloor = eSat(T_floor);
  const eCeiling = eSat(T_reservoir);                   // saturation over the cold lake water
  const lambda = (10 * lakeFrac) / (1 + 10 * lakeFrac); // approach to the ceiling vs open-water area
  const eSource = lambda * eCeiling;
  const RH_source = eSource / eSatFloor;                // ≤ e_sat(T_reservoir)/e_sat(T_floor)
  const qFloor = (EPS * eSource) / (p.P_floor - eSource);

  // ── radial grids + the convective scale (independent of the inversion) ──────────────
  const r = new Float64Array(N);      // radius, m
  const g = new Float64Array(N);      // gravity, m/s²
  const T = new Float64Array(N);      // temperature, K
  const P = new Float64Array(N);      // pressure, Pa
  const rho = new Float64Array(N);    // density, kg/m³
  const qStrat = new Float64Array(N); // stratified specific humidity, kg/kg
  for (let i = 0; i < N; i++) { r[i] = (R_floor * i) / (N - 1); g[i] = gravityAt(omega, r[i]); }
  const adiabatSpan = (w2 * R_floor * R_floor) / (2 * cp);     // floor→axis adiabatic cooling, K
  const Tadiabat = (rr) => T_floor - (w2 * (R_floor * R_floor - rr * rr)) / (2 * cp);
  const rhoFloor = p.P_floor / (Rd * T_floor);
  const buoyFlux = (p.gFloor / T_floor) * (Fnow / (rhoFloor * cp));        // m²/s³ (uses the sun NOW)
  const wStar = Math.cbrt(Math.max(0, buoyFlux) * R_floor);               // convective scale, m/s
  const integ2pi = (fn) => { let a = 0; for (let i = 1; i < N; i++) a += 0.5 * (fn(i - 1) + fn(i)) * (r[i] - r[i - 1]); return 2 * Math.PI * a; };

  // ── SOLVE the inversion AND the vapour scale height together (a small fixed point) ──
  // The axial sun is partly absorbed by the greenhouse gases — chiefly the water vapour iris
  // just solved — and that absorbed flux must be radiated from the warm axis to the cold floor,
  // which sets the INVERSION: σ(T_axis⁴ − T_floor⁴) = (1−e^−τ)·F_light, τ = κ·W + τ_base. The
  // same inversion's stability sets how deep turbulence carries the moisture — the VAPOUR SCALE
  // HEIGHT as a buoyancy length H_q ≈ MIX·w_mix/N — which sets the water column W, which sets τ.
  // Deeper moist layers thin as the inversion strengthens (negative feedback), so it converges.
  const state = (inv) => {
    for (let i = 0; i < N; i++) T[i] = Tadiabat(r[i]) + inv * (1 - r[i] / R_floor);
    let lnP = Math.log(p.P_floor); P[N - 1] = p.P_floor;
    for (let i = N - 2; i >= 0; i--) {
      const f0 = g[i] / (Rd * T[i]), f1 = g[i + 1] / (Rd * T[i + 1]);
      lnP -= 0.5 * (f0 + f1) * (r[i + 1] - r[i]); P[i] = Math.exp(lnP);
    }
    for (let i = 0; i < N; i++) rho[i] = P[i] / (Rd * T[i]);
    const stab = 1 / (1 + inv / Math.max(1, adiabatSpan));
    const Nbv = Math.sqrt(Math.max(0, (p.gFloor / T_floor) * (inv / R_floor)));   // Brunt–Väisälä
    // mixing velocity: convective (day) + the fountain breeze (the night mixer) + a residual
    const wMix = wStar * stab + (jetsOn ? 0.5 * breeze : 0) + W_MIN;
    const Hq = Math.max(HQ_MIN, Math.min(HQ_MAX, (MIX_EFF * wMix) / Math.max(Nbv, N_MIN)));
    for (let i = 0; i < N; i++) qStrat[i] = qFloor * Math.exp(-(R_floor - r[i]) / Hq);
    const tv = integ2pi((i) => qStrat[i] * rho[i] * r[i]);
    const W = tv / (2 * Math.PI * R_floor);                  // precipitable water, kg/m²
    const tau = KAPPA_SW * W + TAU_BASE;
    const absFrac = 1 - Math.exp(-tau);                      // sunlight absorbed in the air
    const Taxis = Math.pow(T_floor ** 4 + (absFrac * Fnow) / SIGMA, 0.25);   // sun absorbed NOW
    const invNew = Math.max(0, Taxis - (T_floor - adiabatSpan));
    return { stab, Nbv, Hq, totalVapor: tv, W, tau, absFrac, invNew };
  };
  let inv = 0, st = state(0);
  for (let it = 0; it < 12; it++) { st = state(inv); inv = inv + 0.6 * (st.invNew - inv); }
  st = state(inv);                                           // final consistent pass
  const invStrength = inv, stability = st.stab, BruntN = st.Nbv, humidityScale = st.Hq;
  const totalVapor = st.totalVapor, precipWater = st.W, opticalDepth = st.tau, absorbedFraction = st.absFrac;
  const dryMass = integ2pi((i) => rho[i] * r[i]);            // ∫ρ·2πr dr, to spread vapour when mixed

  const q = new Float64Array(N);
  if (jetsOn) {
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

  // Lake mist — the design's real fog. The bore air is sub-saturated against the WARM floor, so
  // bulk fog is rare; but the air over the COLD lake water nears saturation as the lakes grow
  // (its RH measured against the lake/reservoir temperature is λ). Above ~0.8 it condenses as
  // advection mist in a shallow layer hugging the lakes — dew/mist, not rain.
  const mist = lambda > 0.78;
  const mistDepth = mist ? Math.min(0.3 * humidityScale, 500) : 0;
  // condensation band for the observable = bulk fog ∪ lake mist
  const hasCond = hasFog || mist;
  const condInner = hasFog ? (mist ? Math.min(fogInner, R_floor - mistDepth) : fogInner)
    : (mist ? R_floor - mistDepth : null);
  const condOuter = hasFog ? fogOuter : (mist ? R_floor : null);

  // ── wind ───────────────────────────────────────────────────────────────────
  // wStar (convective scale) and stability come from the solve above; the inversion that chokes
  // convection is the SOLVED one.
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
      // time / diurnal forcing
      timeHour: p.timeHour, dayLength: p.dayLength, jetMode: p.jetMode,
      sunNow: sunNow(p.timeHour, p.dayLength), isDay: sunShape(p.timeHour, p.dayLength) > 0.15,
      F_inst: Fnow, jetsOn,
      // energy — INSTANTANEOUS in/out; the imbalance is stored/released by the floor's mass
      powerIn, powerOut, powerStored: powerIn - powerOut,
      energyResidual: Math.abs(powerIn - powerOut),   // ≠0 off-peak (storage); the daily mean closes
      TfloorMean,
      T_skin, T_reservoir, T_floor, T_axis: T[0],
      adiabatSpan, upIsHot: T[0] > T_floor,
      // the SOLVED inversion (radiative greenhouse) + its vapour scale height (turbulent mixing)
      invStrength, opticalDepth, absorbedFraction, precipWater, BruntN, vaporScaleHeight: humidityScale,
      // pressure
      P_floor: p.P_floor, P_axis: P[0], pRatio: P[N - 1] / P[0],
      // humidity (solved from lakes + redistributed by jets — not an input)
      qFloor, totalVapor, hasFog, lakeFrac, RH_source, lakeSatApproach: lambda,
      hasCond, mist, condInner, condOuter,
      fogInner: hasFog ? fogInner : null, fogOuter: hasFog ? fogOuter : null,
      RH_axis: RH[0], RH_floor_actual: RH[N - 1],
      // wind (ambient: convective + the fountain's induced breeze — never the jet exit speed)
      wStar, stability, fCor, RossbyFloor,
      maxWind, windFloor: U[N - 1], windAxis: U[0], jets: jetsOn, breeze,
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
  eSat, qSat, sunShape, sunNow, meanSunShape, jetsScheduled, defaultParams, solveSection,
};
if (typeof globalThis !== 'undefined') globalThis.IrisSection = API;
export default API;
