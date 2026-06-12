// tide/profile/sim/profile.mjs — the centrifugal barometer.
//
// The smallest honest model of the cylinder's air: given the radius, the spin, and how
// much air is in there (its non-spinning pressure), what is the GRAVITY profile and the
// PRESSURE profile from the axis out to the rim?
//
// Two facts, one dimension (radius r, axis r=0 → rim r=R):
//
//   • GRAVITY is centrifugal:  g(r) = ω² r.  Zero at the axis ("up"), full at the rim
//     ("down"). Nothing about the air changes this — it is pure kinematics of the spin.
//
//   • PRESSURE follows from hydrostatic balance in the rotating frame. The effective
//     gravity points outward with magnitude ω²r, so dP/dr = ρ·ω²r. For an ISOTHERMAL
//     ideal gas (ρ = P·M/(R_gas·T)) this integrates in closed form:
//
//         P(r) = P_axis · exp( S · (r/R)² ),     S = M ω² R² / (2 R_gas T) = v_rim² / 2c²
//
//     where v_rim = ωR is the rim speed and c = √(R_gas T / M) is the isothermal sound
//     speed. S is the one dimensionless number that governs the whole profile: the rim/axis
//     pressure ratio is exactly e^S. Air pools at the rim and thins toward the axis.
//
// What "non-spinning pressure" P0 fixes is the AMOUNT of air. Two readings, both supported:
//
//   • mode 'conserve' (default): P0 is the uniform pressure the SAME air would have at rest.
//     Spinning it up redistributes the gas (rimward) but conserves total moles, so the
//     area-weighted mean pressure stays P0. Closed form: P_axis = P0 · S/(e^S − 1).
//
//   • mode 'axis': P0 is taken as the pressure held on the axis; the rim rises from there.
//     P_axis = P0 directly. (Use when you're pinning the centreline, e.g. a vented core.)
//
// Pure, zero-dep, deterministic; runs identically in node and the browser. SI throughout
// (m, s, K, Pa, kg, mol). Attaches to globalThis for headless unit-testing.

export const R_GAS = 8.314462618; // universal gas constant, J/mol/K
export const M_AIR = 0.0289647;   // Earth sea-level air, kg/mol
export const G_EARTH = 9.80665;   // standard gravity, m/s² (for reporting g-units)

// ── unit helpers: spin can be given three honest ways ────────────────────────
export const omegaFromRpm = (rpm) => (rpm * 2 * Math.PI) / 60;        // rev/min → rad/s
export const rpmFromOmega = (omega) => (omega * 60) / (2 * Math.PI);
export const omegaFromRim = (vRim, R) => vRim / R;                    // rim speed → rad/s

// ── the two pointwise physics laws ───────────────────────────────────────────
// centrifugal gravity at radius r (m/s²)
export const gravityAt = (omega, r) => omega * omega * r;
// isothermal density at pressure P (kg/m³)
export const densityAt = (P, T, M = M_AIR) => (P * M) / (R_GAS * T);

// The governing dimensionless number S = M ω² R² / (2 R_gas T). Equivalently v_rim²/(2c²).
export function profileNumber({ R, omega, T, M = M_AIR }) {
  return (M * omega * omega * R * R) / (2 * R_GAS * T);
}

// S/(e^S − 1), the axis/P0 ratio in conserve mode — with a stable S→0 limit (→ 1).
function axisFactor(S) {
  if (Math.abs(S) < 1e-8) return 1 - S / 2;       // series; flat-air limit is 1
  return S / Math.expm1(S);                        // expm1 keeps precision for small S
}

export function defaultParams() {
  return {
    R: 8000,          // habitat-wall radius, m (the canonical tide build's floor)
    omega: 0.031321,  // spin rate, rad/s (≈0.299 rpm; 1 g at the 10 km outer skin)
    P0: 101325,       // non-spinning pressure, Pa (one Earth atmosphere of air in the bore)
    T: 293.15,        // temperature, K (isothermal column, 20 °C)
    M: M_AIR,         // mean molar mass, kg/mol
    mode: 'conserve', // 'conserve' (mass-conserving) | 'axis' (hold axis at P0)
    N: 240,           // radial samples (axis→rim inclusive)
  };
}

// Solve the whole radial profile. Returns sampled arrays + a closed-form summary.
export function solveProfile(input = {}) {
  const p = { ...defaultParams(), ...input };
  const { R, omega, P0, T, M, mode, N } = p;
  if (R <= 0) throw new Error('radius must be positive');
  if (T <= 0) throw new Error('temperature must be positive');
  if (N < 2) throw new Error('need at least 2 samples');

  const S = profileNumber({ R, omega, T, M });
  const PAxis = mode === 'axis' ? P0 : P0 * axisFactor(S);
  const PRim = PAxis * Math.exp(S);

  const r = new Float64Array(N);
  const g = new Float64Array(N);     // m/s²
  const gG = new Float64Array(N);    // in Earth g
  const P = new Float64Array(N);     // Pa
  const rho = new Float64Array(N);   // kg/m³
  for (let i = 0; i < N; i++) {
    const rr = (R * i) / (N - 1);
    const pr = PAxis * Math.exp(S * (rr / R) * (rr / R));
    r[i] = rr;
    g[i] = gravityAt(omega, rr);
    gG[i] = g[i] / G_EARTH;
    P[i] = pr;
    rho[i] = densityAt(pr, T, M);
  }

  // area-weighted mean pressure (closed form): P_axis·(e^S − 1)/S. == P0 in conserve mode.
  const meanP = S < 1e-8 ? PAxis : (PAxis * Math.expm1(S)) / S;
  // mass of air per unit length (kg/m): ∫ρ·2πr dr = (M/R_gas T)·πR²·meanP
  const massPerLength = ((M / (R_GAS * T)) * Math.PI * R * R) * meanP;

  const vRim = omega * R;
  const cIso = Math.sqrt((R_GAS * T) / M);     // isothermal sound speed, m/s
  const gRim = gravityAt(omega, R);

  return {
    params: p,
    r, g, gG, P, rho,
    summary: {
      S,                                  // the governing dimensionless number
      mode,
      omega,
      rpm: rpmFromOmega(omega),
      period: (2 * Math.PI) / omega,      // s per rotation
      vRim,                               // rim speed, m/s
      cIso,                               // isothermal sound speed, m/s
      machRim: vRim / cIso,               // rim speed in sound speeds
      gRim,                               // gravity at the rim, m/s²
      gRimG: gRim / G_EARTH,              // …in Earth g
      // radius at which gravity is exactly 1 g (Infinity if the spin never reaches it)
      rGravUnity: omega > 0 ? G_EARTH / (omega * omega) : Infinity,
      PAxis, PRim,
      ratio: PRim / PAxis,                // == e^S
      dropPct: (1 - PAxis / PRim) * 100,  // % the pressure falls axis-relative-to-rim
      meanP,                              // area-weighted mean (== P0 when conserving)
      massPerLength,                      // kg of air per metre of cylinder
    },
  };
}

// Attach for headless tests / inline page use without a bundler.
const API = {
  R_GAS, M_AIR, G_EARTH,
  omegaFromRpm, rpmFromOmega, omegaFromRim,
  gravityAt, densityAt, profileNumber,
  defaultParams, solveProfile,
};
if (typeof globalThis !== 'undefined') globalThis.TideProfile = API;
export default API;
