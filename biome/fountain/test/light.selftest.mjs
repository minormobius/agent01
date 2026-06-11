// Self-test for the luminous-flux budget. Run: node biome/fountain/test/light.selftest.mjs
// Checks the line-source falloff, the unit conversions, and the headline numbers against
// hand computation: 1 sun at the rim is a ~20 MW/m axial lamp dumping heat at ~101 °C.
import {
  irradianceAtRadius, linePowerForIrradiance, ppfdFromPAR, parFromPPFD,
  budget, foodLightFloor, SUN_WM2,
} from '../sim/light.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * (1 + Math.abs(b));

// ── 1. Line source falls as 1/r (not 1/r²) ───────────────────────────────────
{
  const E1 = irradianceAtRadius(1e6, 1000), E2 = irradianceAtRadius(1e6, 2000);
  ok('irradiance halves when radius doubles (line source ∝ 1/r)', near(E2, E1 / 2),
     `${E1.toFixed(2)} → ${E2.toFixed(2)} W/m²`);
  ok('linePowerForIrradiance inverts irradianceAtRadius',
     near(irradianceAtRadius(linePowerForIrradiance(700, 3200), 3200), 700));
}

// ── 2. PAR ↔ PPFD conversions ────────────────────────────────────────────────
{
  ok('PPFD/PAR round-trips', near(parFromPPFD(ppfdFromPAR(450)), 450));
  // 1 sun → PAR 450 W/m² → ~2057 µmol/m²/s (matches "full sun ≈ 2000")
  ok('1 sun ≈ 2000 µmol/m²/s PPFD', Math.abs(ppfdFromPAR(SUN_WM2 * 0.45) - 2057) < 5,
     `${ppfdFromPAR(SUN_WM2 * 0.45).toFixed(0)} µmol/m²/s`);
}

// ── 3. The headline: 1 sun at the rim is a ~20 MW/m axial lamp ────────────────
{
  const b = budget({ suns: 1, R: 3200, L: 1000 });
  ok('1 sun ⇒ ≈20.1 MW per metre of length', Math.abs(b.linePower_MW_per_m - 20.106) < 0.05,
     `${b.linePower_MW_per_m.toFixed(2)} MW/m`);
  ok('…and ≈20.1 GW to light a 1 km cylinder', Math.abs(b.total_GW - 20.106) < 0.05,
     `${b.total_GW.toFixed(1)} GW`);
  ok('illuminance at the rim ≈ 105k lux', Math.abs(b.lux - 105000) < 100, `${(b.lux / 1000).toFixed(0)}k lux`);
}

// ── 4. Heat closure — the shell radiator temperature for the light load ───────
{
  const b = budget({ suns: 1, emissivity: 0.9 });
  ok('1 sun ⇒ external radiator ≈ 101 °C (all light becomes heat)',
     Math.abs(b.radiatorTemp_C - 101) < 2, `${b.radiatorTemp_C.toFixed(0)} °C`);
  ok('more light ⇒ hotter radiator (T ∝ E^¼)',
     budget({ suns: 2 }).radiatorTemp_K > budget({ suns: 1 }).radiatorTemp_K);
}

// ── 5. Food floor vs flood — the "LOT" made explicit ─────────────────────────
{
  const floor1 = foodLightFloor({ crew: 100 }), floor2 = foodLightFloor({ crew: 200 });
  ok('food light floor scales with crew', near(floor2.minLightPower_W, 2 * floor1.minLightPower_W),
     `${(floor1.minLightPower_W / 1e3).toFixed(0)} kW for 100 crew`);
  const b = budget({ suns: 1, R: 3200, L: 1000 });
  ok('flooding 1 km of canopy hugely over-provisions the bare food need', b.overbuildVsFood > 1000,
     `${b.overbuildVsFood.toFixed(0)}× the food floor`);
  ok('only a small lit area is needed for the calories themselves', b.foodLitArea_m2 < 2000 && b.foodLitArea_m2 > 100,
     `${b.foodLitArea_m2.toFixed(0)} m² of full-sun canopy feeds the crew`);
}

// ── 6. Target by PPFD resolves consistently ──────────────────────────────────
{
  const b = budget({ ppfd: 2057, R: 3200, L: 1000 });
  ok('a PPFD target reproduces the 1-sun budget', Math.abs(b.suns - 1) < 0.01,
     `${b.suns.toFixed(3)} suns`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
