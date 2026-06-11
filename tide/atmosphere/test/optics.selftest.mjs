// Self-test for the Mie fog optics. Run: node biome/atmosphere/test/optics.selftest.mjs
// Checks the Mie extinction relation, Koschmieder visibility, and the beam march (canopy
// transmittance + the absorbed power that burns the fog), against hand computation.
import { mieBeta, visibility, columnBeam, RHO_W } from '../sim/optics.mjs';
import { defaultParams, buildGrid } from '../sim/column.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * (1 + Math.abs(b));

// ── 1. Mie extinction β = 3·Q·LWC / (4·ρ_w·r_eff) ────────────────────────────
{
  // 0.3 g/m³ fog, 10 µm droplets, Q=2 → β = 3·2·3e-4/(4·1000·1e-5) = 0.045 /m
  const beta = mieBeta(3e-4, 1e-5, 2);
  ok('Mie extinction matches 3Q·LWC/4ρr', near(beta, 0.045, 1e-6), `${beta.toFixed(4)} /m`);
  ok('β scales with liquid water content', near(mieBeta(6e-4, 1e-5), 2 * mieBeta(3e-4, 1e-5)));
  ok('β is inverse in droplet radius (bigger drops, thinner optically per gram)',
     mieBeta(3e-4, 5e-6) > mieBeta(3e-4, 2e-5));
}

// ── 2. Koschmieder visibility ────────────────────────────────────────────────
{
  ok('visibility = 3.912/β', near(visibility(0.045), 3.912 / 0.045), `${visibility(0.045).toFixed(0)} m`);
  ok('clear air (β→0) has unbounded visibility', visibility(0) === Infinity);
}

// ── 3. Beam march — clear column transmits fully; fog dims + absorbs ─────────
{
  const p = { ...defaultParams(), irradiance: 500, fogSolarAbsorption: 0.2 };
  const g = buildGrid(p);
  const N = g.N;
  // clear column (no liquid) → canopy gets all the light, no absorption
  const clear = columnBeam(p, g, new Array(N).fill(0), new Array(N).fill(1.0));
  ok('a clear column transmits ~100% to the canopy', near(clear.canopyTransmittance, 1, 1e-9),
     `${(clear.canopyTransmittance * 100).toFixed(0)}%`);
  ok('a clear column absorbs nothing', clear.absorbed.every((a) => a === 0));

  // a foggy near-surface layer dims the canopy and absorbs power (the burn)
  const liquid = new Array(N).fill(0);
  for (let i = N - 8; i < N; i++) liquid[i] = 3e-4;            // fog in the bottom cells
  const foggy = columnBeam(p, g, liquid, new Array(N).fill(1.0));
  ok('fog reduces canopy light below clear-sky', foggy.canopyTransmittance < clear.canopyTransmittance,
     `canopy light ${(foggy.canopyTransmittance * 100).toFixed(0)}%`);
  ok('fog absorbs solar power (the energy that burns it off)', foggy.absorbed.some((a) => a > 0));
  ok('fog has finite, low visibility', foggy.visibilityMin < 1e5 && foggy.visibilityMin > 0,
     `${foggy.visibilityMin.toFixed(0)} m`);
  // energy bookkeeping: absorbed ≤ the incoming line power
  const inPower = p.irradiance * 2 * Math.PI * p.R;
  const totalAbs = foggy.absorbed.reduce((a, b) => a + b, 0);
  ok('absorbed power never exceeds the beam', totalAbs <= inPower + 1e-6,
     `${(totalAbs / 1e6).toFixed(1)} of ${(inPower / 1e6).toFixed(1)} MW/m`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
