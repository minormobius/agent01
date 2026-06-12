// Self-test for the iris cross-section solve. Run: node iris/test/section.selftest.mjs
// The contract: heat in == heat out (it pins every temperature); heat flows OUTWARD so the
// floor is warmer than the radiator; pressure obeys centrifugal hydrostatic balance with the
// local temperature; the jets toggle redistributes water but CONSERVES it; fog is exactly
// where RH ≥ 1; turning the jets on can only add wind.
import { solveSection, defaultParams, eSat, qSat, Rd } from '../sim/section.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

// ── 1. Energy closes: in == out to machine precision (it pins T_skin) ────────
{
  const s = solveSection().summary;
  ok('heat in equals heat out (the steady state)', rel(s.powerIn, s.powerOut) < 1e-12,
     `${(s.powerIn / 1e6).toFixed(2)} MW/m in/out`);
  ok('energy residual is ~0', s.energyResidual < 1e-3);
  // double the lights ⇒ the radiator must run hotter
  const hot = solveSection({ F_light: 800 }).summary;
  ok('more lights ⇒ hotter radiator skin', hot.T_skin > s.T_skin,
     `${s.T_skin.toFixed(1)} → ${hot.T_skin.toFixed(1)} K`);
  ok('doubling lights still closes', rel(hot.powerIn, hot.powerOut) < 1e-12);
}

// ── 2. Heat flows outward: floor > reservoir > radiator skin ─────────────────
{
  const s = solveSection().summary;
  ok('floor warmer than reservoir warmer than skin (heat flows out)',
     s.T_floor > s.T_reservoir && s.T_reservoir > s.T_skin,
     `floor ${s.T_floor.toFixed(1)} > res ${s.T_reservoir.toFixed(1)} > skin ${s.T_skin.toFixed(1)} K`);
  // the reservoir/skin gap is exactly the heat-pipe ΔT we set
  ok('reservoir sits exactly pipeDeltaT above the skin',
     rel(s.T_reservoir - s.T_skin, defaultParams().pipeDeltaT) < 1e-12);
}

// ── 3. Temperature: the inversion is SOLVED from the greenhouse, not set ─────
{
  const s = solveSection();
  ok('axis temp = adiabatic axis + the solved inversion (consistent)',
     rel(s.T[0], s.summary.T_floor - s.summary.adiabatSpan + s.summary.invStrength) < 1e-9);
  ok('the adiabatic span is ω²R²/2cp (~19.5 K)',
     Math.abs(s.summary.adiabatSpan - 19.5) < 1.5, `${s.summary.adiabatSpan.toFixed(1)} K`);
  // the axial sun absorbed in the greenhouse lifts the axis above the cold adiabat → "up is hot"
  ok('"up is hot": the solved axis sits above the floor', s.summary.upIsHot && s.T[0] > s.summary.T_floor,
     `axis ${(s.T[0] - 273.15).toFixed(0)} vs floor ${(s.summary.T_floor - 273.15).toFixed(0)} °C`);
  const dim = solveSection({ F_light: 150 }).summary, bright = solveSection({ F_light: 800 }).summary;
  ok('more lights ⇒ more absorbed solar ⇒ a stronger inversion', bright.invStrength > dim.invStrength,
     `${dim.invStrength.toFixed(1)} → ${bright.invStrength.toFixed(1)} K`);
  // the greenhouse couples to the SOLVED water vapour: more water ⇒ deeper optical depth
  const dry = solveSection({ waterVolume: 1e8 }).summary, wet = solveSection({ waterVolume: 5e9 }).summary;
  ok('more water vapour ⇒ deeper greenhouse optical depth', wet.opticalDepth > dry.opticalDepth,
     `τ ${dry.opticalDepth.toFixed(3)} → ${wet.opticalDepth.toFixed(3)}`);
  ok('the vapour scale height is solved within bounds (a buoyancy length)',
     s.summary.vaporScaleHeight > 40 && s.summary.vaporScaleHeight <= 6000,
     `${s.summary.vaporScaleHeight.toFixed(0)} m`);
  ok('a stronger inversion is more stratified (higher Brunt–Väisälä N)', bright.BruntN > dim.BruntN,
     `N ${dim.BruntN.toFixed(4)} → ${bright.BruntN.toFixed(4)} /s`);
}

// ── 4. Pressure: centrifugal hydrostatic balance with the local temperature ──
{
  const s = solveSection({ N: 4000 });
  const { r, P, T, g } = s;
  ok('pressure rises monotonically outward (air pools at the rim)', (() => {
    for (let i = 1; i < P.length; i++) if (P[i] < P[i - 1]) return false; return true;
  })(), `axis ${(s.summary.P_axis / 1000).toFixed(1)} → floor ${(s.summary.P_floor / 1000).toFixed(1)} kPa`);
  ok('floor pressure equals the input P_floor', P[P.length - 1] === s.params.P_floor);
  // check d(lnP)/dr == g/(Rd·T) at an interior point (the hydrostatic ODE)
  const i = Math.floor(P.length * 0.5);
  const dlnP = (Math.log(P[i + 1]) - Math.log(P[i - 1])) / (r[i + 1] - r[i - 1]);
  ok('d(lnP)/dr satisfies the hydrostatic equation', rel(dlnP, g[i] / (Rd * T[i])) < 1e-4,
     `${dlnP.toExponential(2)} vs ${(g[i] / (Rd * T[i])).toExponential(2)}`);
}

// ── 5. Humidity is SOLVED from the lakes; jets redistribute it; fog ⇔ RH ≥ 1 ──
{
  const off = solveSection({ jets: false });
  const on = solveSection({ jets: true });
  ok('jets on/off conserve total vapour mass (redistribution, not creation)',
     rel(on.summary.totalVapor, off.summary.totalVapor) < 1e-9,
     `${off.summary.totalVapor.toExponential(3)} kg/m`);
  ok('jets well-mix the humidity (uniform q)',
     Math.abs(on.q[0] - on.q[on.q.length - 1]) < 1e-12 && on.q[0] !== off.q[0]);
  // floor humidity is NOT an input — it follows the lake coverage
  const dry = solveSection({ waterVolume: 1.5e8 });
  const wet = solveSection({ waterVolume: 3e9 });
  ok('bigger lakes ⇒ a more humid floor (solved, not set)',
     wet.summary.RH_floor_actual > dry.summary.RH_floor_actual,
     `${(dry.summary.RH_floor_actual * 100).toFixed(0)}% → ${(wet.summary.RH_floor_actual * 100).toFixed(0)}%`);
  ok('floor RH sits between the cold-sink dew point and saturation',
     wet.summary.RH_source > 0.4 && wet.summary.RH_source <= 1);
  // jets VENTILATE: they loft floor moisture, drying the floor and wetting aloft
  ok('jets dry the floor and wet the axis (ventilation)',
     on.RH[on.RH.length - 1] < off.RH[off.RH.length - 1] && on.RH[0] > off.RH[0],
     `floor ${(off.RH[off.RH.length-1]*100).toFixed(0)}→${(on.RH[on.RH.length-1]*100).toFixed(0)}%`);
  // fog mask must agree with bulk RH≥1 exactly
  let agree = true;
  for (let i = 0; i < off.RH.length; i++) if ((off.RH[i] >= 1) !== (off.fogMask[i] === 1)) agree = false;
  ok('fog mask is exactly the bulk RH ≥ 1 set', agree);
  // the design's real fog is mist over the cold lakes: it appears as the lakes grow, not before
  const misty = solveSection({ waterVolume: 5e9 }).summary;
  ok('big lakes ⇒ mist over the cold lake water (the design\'s fog)', misty.mist && misty.hasCond);
  const arid = solveSection({ waterVolume: 4e7 }).summary;
  ok('few lakes ⇒ no condensation (dry, no mist)', !arid.hasCond);
}

// ── 6. Wind: realistic ambient speeds; the jet's exit speed is NOT the wind ──
{
  const calm = solveSection({ jets: false });
  const blown = solveSection({ jets: true });
  let added = true;
  for (let i = 0; i < calm.U.length; i++) if (blown.U[i] < calm.U[i] - 1e-9) added = false;
  ok('turning the jets on never reduces the wind anywhere', added,
     `max ${calm.summary.maxWind.toFixed(1)} → ${blown.summary.maxWind.toFixed(1)} m/s`);
  // the fix: ambient wind is a breeze, not the 120 m/s water jet
  ok('ambient wind stays a breeze even with the jets on (no hurricane)', blown.summary.maxWind < 25,
     `max ${blown.summary.maxWind.toFixed(1)} m/s vs exit ${blown.summary.jetExitSpeed} m/s`);
  ok('the in-jet core speed is ~the exit speed, kept SEPARATE from the wind',
     blown.summary.jetInducedCore > 10 * blown.summary.maxWind);
  const moreInv = solveSection({ F_light: 800 }).summary;   // brighter ⇒ stronger solved inversion
  const lessInv = solveSection({ F_light: 150 }).summary;
  ok('a stronger (solved) inversion lowers the convective stability factor',
     moreInv.stability < lessInv.stability,
     `${lessInv.stability.toFixed(2)} → ${moreInv.stability.toFixed(2)}`);
  ok('rotation dominates (Rossby number ≪ 1)', calm.summary.RossbyFloor < 0.2,
     `Ro ≈ ${calm.summary.RossbyFloor.toFixed(3)}`);
  ok('wind is zero at the axis and at the floor with jets off',
     calm.U[0] < 1e-9 && calm.U[calm.U.length - 1] < 1e-9);
}

// ── 6b. The jet is ballistic & Coriolis-bound: it arcs back, deeper with more speed ──
{
  const slow = solveSection({ jets: true, jetExitSpeed: 120 });
  ok('a sub-ωR jet does NOT reach the axis (it arcs back)', !slow.summary.jetReachesAxis
     && slow.summary.jetApexRadius > 100,
     `apex at r=${(slow.summary.jetApexRadius / 1000).toFixed(2)} km, ωR=${slow.summary.axisReachSpeed.toFixed(0)} m/s`);
  const fast = solveSection({ jets: true, jetExitSpeed: 180 });
  ok('a faster jet penetrates deeper (smaller apex radius)',
     fast.summary.jetApexRadius < slow.summary.jetApexRadius,
     `${(slow.summary.jetApexRadius / 1000).toFixed(2)} → ${(fast.summary.jetApexRadius / 1000).toFixed(2)} km`);
  ok('the axis-reach speed is ωR and the jet stays below it by default',
     slow.summary.jetExitSpeed < slow.summary.axisReachSpeed);
}

// ── 6c. Lakes: water volume fills the basins; topology sets the surface area ──
{
  const dry = solveSection({ waterVolume: 2e8 });
  const wet = solveSection({ waterVolume: 1.5e9 });
  ok('more water ⇒ larger lake surface area', wet.summary.lakeSurfaceArea > dry.summary.lakeSurfaceArea,
     `${(dry.summary.lakeSurfaceArea / 1e6).toFixed(1)} → ${(wet.summary.lakeSurfaceArea / 1e6).toFixed(1)} km²`);
  ok('more water ⇒ deeper lakes', wet.summary.lakeDepthMax > dry.summary.lakeDepthMax,
     `${dry.summary.lakeDepthMax.toFixed(0)} → ${wet.summary.lakeDepthMax.toFixed(0)} m`);
  ok('lakes are three (the ratchet basins)', wet.summary.teeth === 3);
  const flood = solveSection({ waterVolume: 1e11 });
  ok('past the basin capacity the lakes overflow into an annular sea', flood.summary.lakeOverflow);
  ok('a moderate fill does NOT overflow (topology holds it)', !wet.summary.lakeOverflow);
}

// ── 7. Determinism + spin geometry ───────────────────────────────────────────
{
  const a = solveSection({ F_light: 500 });
  const b = solveSection({ F_light: 500 });
  ok('solver is deterministic', a.P.every((v, i) => v === b.P[i]) && a.T.every((v, i) => v === b.T[i]));
  ok('1 g target ⇒ floor actually feels ~1 g', rel(a.summary.gFloorActual, 9.80665) < 1e-9,
     `${a.summary.gFloorActual.toFixed(3)} m/s²`);
  ok('rim speed = ωR is the axis-reach speed', rel(a.summary.vRim, a.omega * a.params.R_floor) < 1e-12,
     `${a.summary.vRim.toFixed(0)} m/s`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
