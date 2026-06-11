// Self-test for the 1-D radial atmosphere column. Run: node biome/atmosphere/test/column.selftest.mjs
// Checks the structural numbers the README commits to (17% pressure drop, ~16 K adiabat), the
// exact conservation of the diffusion kernel, and the four phenomena the module exists to show:
// a stable inversion, diurnal dew/fog, a daytime convective ventilation pump, and a CO₂ canopy
// trap that the pump relieves. Determinism and long-run boundedness too.
import {
  defaultParams, buildGrid, initState, step, snapshot, diffuseImplicit, qSat,
} from '../sim/column.mjs';
const cp = 1005; // dry-air specific heat (module-internal constant, mirrored for the adiabat check)

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const DAY = 86400;
const finite = (s) => [...s.T, ...s.q, ...s.c, ...s.liquid].every(Number.isFinite);

// run helper: integrate `days`, collecting snapshots every `sampleH` hours
function integrate(p, g, days, dtMin = 3, sampleH = 3) {
  const dt = dtMin * 60, steps = Math.round((days * DAY) / dt), every = Math.round((sampleH * 3600) / dt);
  let s = initState(p, g); const snaps = [];
  for (let k = 1; k <= steps; k++) { s = step(s, p, g, dt); if (k % every === 0) snaps.push(snapshot(s, p, g)); }
  return { s, snaps };
}

// ── 1. Structural — the 8 km-habitat numbers, reproduced by construction ─────
// A big cylinder has a LARGE thermodynamic span: ~32% pressure drop and a ~31 K adiabat
// axis→floor (with 1 g at the outer radius ⇒ ~0.8 g floor; vs ~17%/~16 K for Island-Three).
{
  const p = defaultParams(), g = buildGrid(p);
  const { s } = integrate(p, g, 12);
  const snap = snapshot(s, p, g);
  ok('pressure drop axis→floor ≈ 32% (large at 8 km)', snap.P_drop > 0.27 && snap.P_drop < 0.40,
     `${(snap.P_drop * 100).toFixed(1)}%`);
  // adiabatic offset at the axis = g_floor·R/(2cp) ≈ 31 K (θ − T at the innermost cell)
  const adiabAxis = g.adiab[0], target = (p.g0 * p.R) / (2 * cp);
  ok('centrifugal adiabat offset = g·R/2cp (~31 K) at the axis',
     Math.abs(adiabAxis - target) < 1 && Math.abs(target - 31) < 1.5,
     `${adiabAxis.toFixed(1)} K`);
  ok('floor gravity = ω²R ≈ 0.8 g (1 g placed at the outer radius)',
     Math.abs(p.omega * p.omega * p.R - p.g0) < 1e-9 && p.g0 / 9.81 > 0.7 && p.g0 / 9.81 < 0.9,
     `${(p.g0 / 9.81).toFixed(2)} g`);
}

// ── 1b. Fog optics — the linear sun burns off the daytime fog (Mie absorption) ──
{
  const g = buildGrid(defaultParams());
  const dayMinOD = (absFrac) => {
    const p = { ...defaultParams(), fogSolarAbsorption: absFrac };
    let s = initState(p, g);
    for (let k = 0; k < 16 * 720; k++) s = step(s, p, g, 120);
    let od = Infinity;
    for (let k = 0; k < 3 * 720; k++) { s = step(s, p, g, 120); const sn = snapshot(s, p, g); if (sn.sunlit) od = Math.min(od, sn.fogOpticalDepth); }
    return od;
  };
  const noBurn = dayMinOD(0), burn = dayMinOD(0.25);
  ok('Mie solar absorption thins the daytime fog (the sun burns it off)', burn < noBurn * 0.5,
     `day optical depth ${noBurn.toFixed(0)} → ${burn.toFixed(0)}`);
  // and the fog is a real near-surface deck, dense at night
  const p = defaultParams(); let s = initState(p, g);
  for (let k = 0; k < 16 * 720; k++) s = step(s, p, g, 120);
  while (((s.t % p.dayLength) / p.dayLength) < p.photoperiod) s = step(s, p, g, 120);
  for (let k = 0; k < 60; k++) s = step(s, p, g, 120);
  const night = snapshot(s, p, g);
  ok('night fog is a dense near-surface deck (low visibility)',
     night.fogThickness > 200 && night.fogThickness < 4000 && night.visibility_m < 500,
     `fog ${(night.fogThickness / 1000).toFixed(1)} km, visibility ${night.visibility_m.toFixed(0)} m`);
}

// ── 2. Saturation thermodynamics ─────────────────────────────────────────────
{
  ok('qSat increases with temperature', qSat(300, 1e5) > qSat(280, 1e5));
  ok('qSat increases as pressure falls', qSat(290, 8e4) > qSat(290, 1.0e5));
}

// ── 3. The diffusion kernel conserves Σ Mᵢ χᵢ exactly (closed boundaries) ─────
{
  const N = 20;
  const M = Array.from({ length: N }, (_, i) => 1 + 0.3 * Math.sin(i));   // arbitrary positive masses
  const cond = Array.from({ length: N + 1 }, () => 2.0);                  // fixed interior conductances
  cond[0] = 0; cond[N] = 0;                                               // closed at both ends
  const chi = Array.from({ length: N }, (_, i) => (i < N / 2 ? 1 : 0));   // a step profile to smear
  const before = chi.reduce((a, v, i) => a + M[i] * v, 0);
  let x = chi;
  for (let it = 0; it < 200; it++) x = diffuseImplicit(x, M, cond, 0.5, N);
  const after = x.reduce((a, v, i) => a + M[i] * v, 0);
  ok('implicit diffusion conserves Σ Mᵢχᵢ to machine precision',
     Math.abs(after - before) < 1e-10 * before, `Δ ${(after - before).toExponential(2)}`);
  const spread = Math.max(...x) - Math.min(...x);
  ok('…and it actually mixes (the step profile flattens toward uniform)', spread < 0.05,
     `final spread ${spread.toFixed(4)}`);
}

// ── 4. A stable inversion forms (θ warms toward the axis) ────────────────────
{
  const p = defaultParams(), g = buildGrid(p);
  const { s } = integrate(p, g, 16);
  const prof = snapshot(s, p, g).profile;
  ok('potential temperature rises toward the axis (stable stratification)',
     prof[0].theta > prof[g.N - 1].theta + 3,
     `θ axis ${prof[0].theta.toFixed(1)} > θ rim ${prof[g.N - 1].theta.toFixed(1)}`);
}

// ── 5. Diurnal dew/fog — dew forms fastest at night (the cool-surface condensation) ──
{
  const p = defaultParams(), g = buildGrid(p);
  const { snaps } = integrate(p, g, 18, 3, 1);          // hourly snapshots
  const recent = snaps.filter((x) => x.day > 14);
  // dew-accumulation rate between consecutive samples, binned by the sun state of the interval
  const dayRates = [], nightRates = [];
  for (let i = 1; i < recent.length; i++) {
    const rate = (recent[i].dewCollected - recent[i - 1].dewCollected) / (recent[i].day - recent[i - 1].day);
    (recent[i].sunlit ? dayRates : nightRates).push(rate);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  ok('dew accumulates faster at night than by day (cool-surface dew)', mean(nightRates) > mean(dayRates) * 1.5,
     `night ${mean(nightRates).toExponential(1)} vs day ${mean(dayRates).toExponential(1)} kg/m/day`);
  // and mid-day the near-surface fog clears (surface cell unsaturated when warmest)
  const midday = recent.filter((x) => x.sunlit === 1).sort((a, b) => b.T_rim - a.T_rim)[0];
  ok('the surface fog clears at the warmest part of the day', midday.fogThickness < 50,
     `fog ${midday.fogThickness.toFixed(0)} m at T_rim ${midday.T_rim.toFixed(1)} K`);
}

// ── 6. The convective ventilation pump relieves the CO₂ canopy trap ──────────
{
  const g = buildGrid(defaultParams());
  const dayDeficit = (Kc) => {
    const p = { ...defaultParams(), K_conv: Kc };
    const { snaps } = integrate(p, g, 24, 3, 1);
    const lit = snaps.filter((x) => x.day > 12 && x.sunlit === 1);
    return lit.reduce((a, x) => a + x.co2_canopyDeficit_ppm, 0) / lit.length;
  };
  const off = dayDeficit(0), on = dayDeficit(55);
  ok('daytime convection ventilates the canopy (less CO₂ depletion than stagnant)',
     on < off && on > 0, `pumped ${on.toFixed(0)} ppm < stagnant ${off.toFixed(0)} ppm`);
}

// ── 6b. Momentum coupling — the fountain ventilates when buoyancy can't (night) ──
// With buoyant convection off (the night condition) and a thin, resolved surface layer, the
// fountain's mechanical mixing is the SOLE pump; it should sharply cut the canopy CO₂ swing.
{
  const g = buildGrid(defaultParams());
  const swing = (fountainK) => {
    const p = { ...defaultParams(), K_conv: 0, surfaceLayer: 120, fountainK, fountainDepth: 1500 };
    let s = initState(p, g); let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 24 * 720; k++) {
      s = step(s, p, g, 120);
      if (k > 12 * 720) { const c = snapshot(s, p, g).co2_rim_ppm; lo = Math.min(lo, c); hi = Math.max(hi, c); }
    }
    return hi - lo;
  };
  const off = swing(0), on = swing(200);
  ok('the fountain alone (no buoyant convection) buffers the canopy CO₂ swing', on < off * 0.7,
     `swing ${off.toFixed(0)} → ${on.toFixed(0)} ppm (${((1 - on / off) * 100).toFixed(0)}% relief)`);
}

// ── 7. Long-run boundedness — no blow-up over 40 model-days ───────────────────
{
  const p = defaultParams(), g = buildGrid(p);
  let s = initState(p, g); const dt = 180; let okrun = true;
  for (let k = 0; k < Math.round((40 * DAY) / dt); k++) {
    s = step(s, p, g, dt);
    if (!finite(s)) { okrun = false; break; }
  }
  const span = Math.max(...s.T) - Math.min(...s.T);
  ok('40-day run stays finite and physical', okrun && Math.min(...s.T) > 250 && Math.max(...s.T) < 330,
     `T ∈ [${Math.min(...s.T).toFixed(0)}, ${Math.max(...s.T).toFixed(0)}] K, span ${span.toFixed(1)} K`);
}

// ── 8. Determinism ───────────────────────────────────────────────────────────
{
  const p = defaultParams(), g = buildGrid(p);
  const a = integrate(p, g, 6).s, b = integrate(p, g, 6).s;
  ok('integration is deterministic', JSON.stringify(a.T) === JSON.stringify(b.T) &&
     a.dewCollected === b.dewCollected);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
