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

// ── 3. Temperature: the adiabat cools inward; the inversion can flip "up" ────
{
  const cold = solveSection({ invStrength: 0 });          // pure adiabat
  ok('no inversion ⇒ axis is colder than the floor (adiabatic)',
     cold.T[0] < cold.summary.T_floor && !cold.summary.upIsHot,
     `axis ${cold.T[0].toFixed(1)} vs floor ${cold.summary.T_floor.toFixed(1)} K`);
  ok('adiabatic span matches ω²R²/2cp',
     rel(cold.summary.T_floor - cold.T[0], cold.summary.adiabatSpan) < 1e-9,
     `${cold.summary.adiabatSpan.toFixed(1)} K`);
  const hot = solveSection({ invStrength: 40 });
  ok('a strong inversion makes "up" hot (axis above floor)', hot.summary.upIsHot,
     `axis ${hot.T[0].toFixed(1)} vs floor ${hot.summary.T_floor.toFixed(1)} K`);
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

// ── 5. Humidity: the jets toggle conserves total water; fog ⇔ RH ≥ 1 ─────────
{
  const off = solveSection({ jets: false, RH_floor: 0.9 });
  const on = solveSection({ jets: true, RH_floor: 0.9 });
  ok('jets on/off conserve total vapour mass (redistribution, not creation)',
     rel(on.summary.totalVapor, off.summary.totalVapor) < 1e-9,
     `${off.summary.totalVapor.toExponential(3)} kg/m`);
  ok('jets well-mix the humidity (uniform q)',
     Math.abs(on.q[0] - on.q[on.q.length - 1]) < 1e-12 && on.q[0] !== off.q[0]);
  // fog mask must agree with RH≥1 exactly
  let agree = true;
  for (let i = 0; i < off.RH.length; i++) if ((off.RH[i] >= 1) !== (off.fogMask[i] === 1)) agree = false;
  ok('fog mask is exactly the RH ≥ 1 set', agree);
  // a saturated cold axis under stratification should fog somewhere
  const wet = solveSection({ jets: false, RH_floor: 1.0, invStrength: 0, humidityScale: 1e9 });
  ok('a cold, well-stocked column condenses fog', wet.summary.hasFog);
}

// ── 6. Wind: jets only add speed; the inversion chokes convection ────────────
{
  const calm = solveSection({ jets: false });
  const blown = solveSection({ jets: true });
  let added = true;
  for (let i = 0; i < calm.U.length; i++) if (blown.U[i] < calm.U[i] - 1e-9) added = false;
  ok('turning the jets on never reduces the wind anywhere', added,
     `max ${calm.summary.maxWind.toFixed(1)} → ${blown.summary.maxWind.toFixed(1)} m/s`);
  const weak = solveSection({ invStrength: 60 });
  const strong = solveSection({ invStrength: 0 });
  ok('a stronger inversion chokes the convective wind', weak.summary.wStar * weak.summary.stability
     < strong.summary.wStar * strong.summary.stability);
  ok('rotation dominates (Rossby number ≪ 1)', calm.summary.RossbyFloor < 0.2,
     `Ro ≈ ${calm.summary.RossbyFloor.toFixed(3)}`);
  ok('wind is zero at the axis and at the floor with jets off',
     calm.U[0] < 1e-9 && calm.U[calm.U.length - 1] < 1e-9);
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
