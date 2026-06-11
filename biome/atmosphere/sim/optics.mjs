// biome/atmosphere/sim/optics.mjs — Mie fog optics: how the linear sun burns off the fog.
//
// The fog that the cold surface breeds (Module 2) is an optical medium — a cloud of ~10 µm
// water droplets. The linear sun's light travels radially outward through it to the canopy,
// and two things happen, both of which this module quantifies:
//
//   • SCATTERING dims the view (low visibility) but barely steals energy — droplets in the
//     visible are near-perfect scatterers (single-scatter albedo ≈ 1). Extinction is the
//     Mie result β_ext = 3·Q·LWC / (4·ρ_w·r_eff) with Q≈2 in the geometric-optics limit
//     (size parameter 2πr/λ ≫ 1). Visibility follows Koschmieder, V = 3.912/β_ext.
//   • ABSORPTION is the burn-off. ~a third of the solar spectrum is near-IR (>1.4 µm) where
//     liquid water absorbs strongly, so a fraction f_abs of the extinction is real heating.
//     That deposited heat warms the air, drops the relative humidity, and evaporates the
//     droplets — the sun eating its own fog. The canopy meanwhile still gets most of its
//     light (forward-scattered), dimmed only by the absorption optical depth.
//
// We march the beam as TOTAL line power (W per metre of cylinder length); the 1/r geometric
// spreading is then automatic. Pure, zero-dep, deterministic.

export const RHO_W = 1000;        // liquid water density, kg/m³

// Mie extinction coefficient (1/m) for liquid-water content `lwc` (kg/m³) and effective
// droplet radius `reff` (m). Q is the extinction efficiency (≈2 for fog-sized droplets).
export const mieBeta = (lwc, reff, Q = 2) => (3 * Q * lwc) / (4 * RHO_W * reff);

// Koschmieder visibility (m) from an extinction coefficient.
export const visibility = (beta) => (beta > 0 ? 3.912 / beta : Infinity);

// March the linear-sun beam from the axis (cell 0) outward to the canopy (cell N−1) through
// the column's liquid water. Returns the per-cell absorbed power (W per metre of length),
// the canopy transmittance (fraction of irradiance reaching the plants), the extinction
// optical depth, and the worst-cell visibility. `liquid` is the per-cell liquid mixing
// ratio (kg/kg), `rho` the per-cell air density (kg/m³).
export function columnBeam(p, g, liquid, rho) {
  const N = g.N, reff = p.fogReff ?? 1e-5, fAbs = p.fogSolarAbsorption ?? 0.2;
  const absorbed = new Array(N).fill(0);
  let power = p.irradiance * 2 * Math.PI * p.R;     // total line power at the axis (W per m length)
  let tauExt = 0, tauAbs = 0, betaMax = 0;
  for (let i = 0; i < N; i++) {
    const lwc = Math.max(0, liquid[i]) * rho[i];
    const beta = mieBeta(lwc, reff);                // extinction (scattering-dominated)
    const betaAbs = beta * fAbs;                    // the absorbing part (near-IR)
    const dr = g.rf[i + 1] - g.rf[i];
    const a = power * (1 - Math.exp(-betaAbs * dr));
    absorbed[i] = a; power -= a;                    // only absorption removes energy from the beam
    tauExt += beta * dr; tauAbs += betaAbs * dr; betaMax = Math.max(betaMax, beta);
  }
  return {
    absorbed,
    canopyTransmittance: Math.exp(-tauAbs),         // fraction of E that reaches the canopy
    opticalDepth: tauExt,                           // total extinction optical depth (haziness)
    visibilityMin: visibility(betaMax),             // m, in the thickest fog cell
  };
}

const Optics = { RHO_W, mieBeta, visibility, columnBeam };
if (typeof globalThis !== 'undefined') globalThis.Optics = Optics;
export default Optics;
