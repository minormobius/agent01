// tjs/brut/struct.selftest.mjs — node selftest for the structural kernel.
// Run: node tjs/brut/struct.selftest.mjs
//
// A structural solve is only worth having if it is right, and "it produced a
// number" is not evidence. So the finite-element core is checked against CLOSED
// FORM — the cantilever beam, the shear beam, the single-degree-of-freedom
// oscillator, all of which have exact answers — and the code layer is checked
// against the anchor values printed in ASCE 7-16's own tables. The rest checks
// that the physics points the right way: more hazard must mean more demand.

import { generate, resolveParams, TYPOLOGY_IDS, FLOOR_IDS, FLOOR_SYSTEMS, LATERAL_IDS, floorSystem } from './arch.js';
import {
  modal, condense, staticLateral, lateralModel, loads, gravity, seismic, wind, verify,
  newmark, quakeForcing, groundMotion, gustRecord, windForcing,
  spectrumParams, Sa, Kz, gustFactor, jacobiEig, solveSystem, liveFor,
  SEISMIC_SCENARIOS, WIND_SCENARIOS, MAT, G, SFRS, SOILS, foundation, TMD,
} from './struct.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol * Math.abs(b || 1), `${m} — got ${a}, want ${b} ±${(tol * 100).toFixed(1)}%`);

// A uniform cantilever discretised into n storeys, as a bare lateral model.
//
// `consistent` lumps the mass the way a CONTINUUM discretises: each element
// gives half its mass to each end node, so the tip carries m/2n and the half at
// the fixed base does not move at all. A real building is not like that — its
// mass really is a floor plate sitting at each level — so the building model
// uses plain per-level lumping and only these closed-form comparisons ask for
// the continuum convention. Mixing the two is worth 2–4% on ω₁, which is
// exactly the discrepancy that showed up the first time this ran.
function uniform(n, H, mTotal, EI, GA, consistent = false) {
  const h = H / n;
  const m = Array.from({ length: n }, (_, i) =>
    consistent ? (i === n - 1 ? mTotal / (2 * n) : mTotal / n) : mTotal / n);
  return {
    dir: 'x', n, h: Array(n).fill(h), y: Array.from({ length: n }, (_, i) => (i + 1) * h),
    m, EI: Array(n).fill(EI), GA: Array(n).fill(GA),
    height: H, B: 20, Lp: 20, loads: Array.from({ length: n }, () => ({ seismicW: (mTotal / n) * G, dead: (mTotal / n) * G, live: 0, area: 400 })),
  };
}

/* 1. LINEAR ALGEBRA — the two routines everything else stands on. */
{
  const A = [[4, 1, 0], [1, 3, 1], [0, 1, 2]];
  const x = solveSystem(A, [1, 2, 3]);
  const r = A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
  ok(Math.abs(r[0] - 1) < 1e-10 && Math.abs(r[1] - 2) < 1e-10 && Math.abs(r[2] - 3) < 1e-10, 'LU solve reproduces its right-hand side');
  // a matrix with known eigenvalues: diag(1,2,3) rotated stays {1,2,3}
  const e = jacobiEig([[2, 1, 0], [1, 2, 1], [0, 1, 2]]);
  // eigenvalues of this tridiagonal are 2−√2, 2, 2+√2
  near(e.values[0], 2 - Math.SQRT2, 1e-9, 'Jacobi eigenvalue 1');
  near(e.values[1], 2, 1e-9, 'Jacobi eigenvalue 2');
  near(e.values[2], 2 + Math.SQRT2, 1e-9, 'Jacobi eigenvalue 3');
  const v = e.vectors[0];
  const nrm = Math.hypot(...v);
  near(nrm, 1, 1e-9, 'Jacobi eigenvectors are unit length');
}

/* 2. STATICS vs CLOSED FORM — a tip load on a uniform cantilever deflects
      PH³/3EI in flexure and PH/GA in shear. Both fall out of the same element,
      which is the whole point of using a Timoshenko beam. */
{
  const H = 60, P = 1e6;
  {
    const EI = 5e12, GA = 1e18;                       // flexure only
    const M = uniform(30, H, 1e6, EI, GA);
    const K = condense(M);
    const F = new Array(M.n).fill(0); F[M.n - 1] = P;
    const r = staticLateral(M, K, F);
    near(r.tip, (P * H ** 3) / (3 * EI), 0.01, 'cantilever tip deflection = PH³/3EI');
    near(r.baseMoment, P * H, 1e-9, 'base moment = P·H');
    near(r.baseShear, P, 1e-9, 'base shear = P');
  }
  {
    const EI = 1e20, GA = 4e9;                        // shear only
    const M = uniform(30, H, 1e6, EI, GA);
    const K = condense(M);
    const F = new Array(M.n).fill(0); F[M.n - 1] = P;
    const r = staticLateral(M, K, F);
    near(r.tip, (P * H) / GA, 0.01, 'shear-beam tip deflection = PH/GA');
    // a pure shear beam drifts uniformly; a cantilever does not
    const spread = Math.max(...r.driftRatio) / Math.min(...r.driftRatio);
    ok(spread < 1.02, `a shear beam drifts uniformly (spread ${spread.toFixed(3)})`);
  }
}

/* 3. DYNAMICS vs CLOSED FORM. */
{
  const H = 60, mTot = 3e6;
  // (a) uniform flexural cantilever: ω₁ = 1.875104² √(EI/(m′H⁴))
  {
    const EI = 5e12, GA = 1e18;
    const M = uniform(24, H, mTot, EI, GA, true);
    const md = modal(M);
    const mp = mTot / H;
    const w1 = (1.875104 ** 2) * Math.sqrt(EI / (mp * H ** 4));
    near(md.modes[0].omega, w1, 0.03, 'uniform cantilever ω₁ = 1.8751²√(EI/m′H⁴)');
    const w2 = (4.694091 ** 2) * Math.sqrt(EI / (mp * H ** 4));
    near(md.modes[1].omega, w2, 0.05, 'uniform cantilever ω₂ = 4.6941²√(EI/m′H⁴)');
  }
  // (b) uniform shear beam: ω_j = (2j−1)(π/2)√(GA/(m′H²))
  {
    const EI = 1e20, GA = 4e9;
    const M = uniform(24, H, mTot, EI, GA, true);
    const md = modal(M);
    const mp = mTot / H;
    const w1 = (Math.PI / 2) * Math.sqrt(GA / (mp * H * H));
    near(md.modes[0].omega, w1, 0.02, 'uniform shear beam ω₁ = (π/2)√(GA/m′H²)');
    near(md.modes[1].omega, 3 * w1, 0.05, 'uniform shear beam ω₂ = 3ω₁');
  }
  // (c) SDOF: one storey, pure shear ⇒ k = GA/h, T = 2π√(m/k)
  {
    const M = uniform(1, 4, 5e5, 1e20, 4e9);
    const md = modal(M);
    const k = 4e9 / 4;
    near(md.modes[0].T, 2 * Math.PI * Math.sqrt(5e5 / k), 0.01, 'SDOF period = 2π√(m/k)');
  }
}

/* 4. MODAL ALGEBRA — orthogonality, and the mass has to add up. Missing modal
      mass is the classic silent error in a response-spectrum analysis. */
{
  const M = uniform(15, 45, 2e6, 8e11, 6e9);
  const md = modal(M);
  let worst = 0;
  for (let i = 0; i < M.n; i++) {
    for (let j = 0; j < M.n; j++) {
      let s = 0;
      for (let k = 0; k < M.n; k++) s += md.modes[i].phi[k] * M.m[k] * md.modes[j].phi[k];
      worst = Math.max(worst, Math.abs(s - (i === j ? 1 : 0)));
    }
  }
  ok(worst < 1e-8, `modes are M-orthonormal (worst φᵢᵀMφⱼ error ${worst.toExponential(1)})`);
  const sum = md.modes.reduce((s, m) => s + m.meff, 0);
  near(sum, md.totalMass, 1e-8, 'Σ effective modal mass = total mass');
  ok(md.modes.every((m, i, a) => i === 0 || m.T <= a[i - 1].T + 1e-12), 'modes come out sorted by descending period');
  ok(md.modes[0].massRatio > 0.6, `mode 1 carries most of the mass (${(md.modes[0].massRatio * 100).toFixed(0)}%)`);
}

/* 5. NEWMARK vs CLOSED FORM. An undamped oscillator under a suddenly applied
      constant force overshoots to exactly twice its static deflection. */
{
  const k = 1e9, m = 1e6;
  const M = uniform(1, 4, m, 1e20, k * 4);
  const md = modal(M);
  const K = md.K;
  const P = 1e6;
  const dt = 0.002, n = Math.round(6 * (2 * Math.PI * Math.sqrt(m / k)) / dt);
  const r = newmark(M, K, md, { n, dt, at: () => [P] }, { zeta: 0 });
  near(r.peakU[0], (2 * P) / k, 0.01, 'step response peaks at 2× the static deflection');
  // and with damping it settles toward the static value
  const rd = newmark(M, K, md, { n: n * 3, dt, at: () => [P] }, { zeta: 0.1 });
  ok(rd.peakU[0] < (2 * P) / k, 'damping cuts the overshoot');
  ok(rd.peakU[0] > (P / k) * 1.2, 'but it still overshoots at 10% damping');
}

/* 6. THE CODE LAYER — anchors printed in ASCE 7-16 itself. */
{
  near(Kz(9.14, 'C'), 1.0, 0.02, 'Kz at 30 ft, exposure C = 1.00 (Table 26.10-1)');
  near(Kz(9.14, 'B'), 0.70, 0.05, 'Kz at 30 ft, exposure B ≈ 0.70');
  near(Kz(9.14, 'D'), 1.16, 0.04, 'Kz at 30 ft, exposure D ≈ 1.16');
  ok(Kz(100, 'C') > Kz(10, 'C'), 'velocity pressure grows with height');

  const S = spectrumParams('high', 'D');
  near(Sa(0, S), 0.4 * S.SDS, 1e-12, 'spectrum starts at 0.4·SDS');
  near(Sa(S.Ts, S), S.SDS, 1e-9, 'spectrum plateau is SDS up to Ts');
  near(Sa(2 * S.Ts, S), S.SDS / 2, 1e-9, 'spectrum falls as 1/T past Ts');
  near(Sa(2 * S.TL, S), (S.SD1 * S.TL) / (4 * S.TL * S.TL), 1e-9, 'spectrum falls as 1/T² past TL');
  ok(Sa(0.3, S) >= Sa(3.0, S), 'short-period demand exceeds long-period demand');

  // the gust factor must react to flexibility the way the code says
  const M = uniform(20, 80, 4e6, 4e12, 8e9);
  const stiff = gustFactor(M, 3.0, 50, 'C');
  const flex = gustFactor(M, 0.18, 50, 'C');
  ok(flex.Gf > stiff.Gf, `a flexible building gets a bigger gust factor (${flex.Gf.toFixed(2)} > ${stiff.Gf.toFixed(2)})`);
  ok(flex.Gf > 0.85 && flex.Gf < 2.0, `flexible Gf is in a sane band (${flex.Gf.toFixed(2)})`);
  ok(!stiff.flexible && flex.flexible, 'the n₁ < 1 Hz flexibility test triggers correctly');
}

/* 7. LOADS COME FROM THE ROOM SCHEDULE. This is the coupling that makes the
      solve about THIS building rather than a generic box: library stacks are
      heavier than flats, and a car park is lighter than either. */
{
  ok(liveFor('stacks') > liveFor('open office'), 'library stacks outweigh open office');
  ok(liveFor('open office') > liveFor('2-bed flat'), 'office outweighs housing');
  ok(liveFor('plant') > liveFor('WC'), 'plant rooms are the heaviest live load');
  ok(liveFor('nowt-like-this') > 0, 'an unknown programme still gets a load');

  const civic = generate(resolveParams({ s: 'loadmix', t: 'civic' }));
  const flats = generate(resolveParams({ s: 'loadmix', t: 'housing' }));
  const lc = loads(civic), lf = loads(flats);
  const perM2 = (l) => l.reduce((s, q) => s + q.live, 0) / l.reduce((s, q) => s + q.area, 0);
  ok(perM2(lc) > perM2(flats.levels.length ? lf : lf), `the civic hall carries more live load per m² than the housing slab (${(perM2(lc) / 1e3).toFixed(1)} vs ${(perM2(lf) / 1e3).toFixed(1)} kPa)`);
  for (const l of lc) {
    ok(l.dead > 0 && l.mass > 0 && isFinite(l.seismicW), `level ${l.level} has finite positive weight`);
    break;
  }
}

/* 8. THE PHYSICS POINTS THE RIGHT WAY across every typology. */
{
  const b = generate(resolveParams({ s: 'monotone', t: 'office' }));
  const M = lateralModel(b, 'x'), md = modal(M);
  const V = ['low', 'moderate', 'high', 'extreme'].map((k) =>
    seismic(b, M, md, spectrumParams(k, 'D')).baseShear);
  ok(V.every((v, i) => i === 0 || v >= V[i - 1] - 1e-6), `base shear rises with seismic hazard (${V.map((v) => (v / 1e6).toFixed(0)).join(' → ')} MN)`);

  const W = [40, 60, 80].map((v) => wind(b, M, md, { V: v, exposure: 'C' }).baseShear);
  ok(W.every((v, i) => i === 0 || v > W[i - 1]), 'base shear rises with wind speed');
  near(W[1] / W[0], (60 / 40) ** 2, 0.25, 'wind shear scales roughly with V² (gust factor moves the rest)');

  const eB = wind(b, M, md, { V: 60, exposure: 'B' }).baseShear;
  const eD = wind(b, M, md, { V: 60, exposure: 'D' }).baseShear;
  ok(eD > eB, 'open-water exposure D loads harder than suburban exposure B');

  // statics must balance whatever the load case
  const w = wind(b, M, md, { V: 60, exposure: 'C' });
  near(w.baseShear, w.forces.reduce((s, f) => s + f, 0), 1e-9, 'wind base shear = Σ storey forces');
  near(w.baseMoment, w.forces.reduce((s, f, i) => s + f * M.y[i], 0), 1e-9, 'wind base moment = Σ F·y');
}

/* 9. THE SOLVE RUNS ON EVERY BUILDING THE GENERATOR CAN MAKE, and reports
      finite, physically-ordered numbers for all of them. */
{
  let bad = 0, checked = 0, verdicts = {};
  for (const t of TYPOLOGY_IDS) {
    for (const s of ['a1', 'b2', 'c3']) {
      const b = generate(resolveParams({ s, t }));
      const v = verify(b, { seismicScenario: 'high', windScenario: 'cat3' });
      checked++;
      verdicts[v.verdict] = (verdicts[v.verdict] || 0) + 1;
      const S = v.summary;
      if (!isFinite(S.T1x) || S.T1x <= 0 || S.T1x > 20) bad++;
      if (!isFinite(S.baseShearEq) || S.baseShearEq <= 0) bad++;
      if (!isFinite(S.driftEq) || S.driftEq < 0) bad++;
      if (!(S.massTonnes > 0)) bad++;
      if (v.checks.some((c) => !isFinite(c.util))) bad++;
      // the modal analysis must reach the 90% mass the code demands
      for (const dir of ['x', 'z']) {
        const last = v.dirs[dir].md.modes[v.dirs[dir].md.modes.length - 1];
        if (last.cumRatio < 0.999) bad++;
      }
    }
  }
  ok(checked === TYPOLOGY_IDS.length * 3, `the sweep ran every typology (${checked})`);
  ok(bad === 0, `every solve returns finite, ordered results (${bad} bad)`);
  ok(Object.keys(verdicts).length >= 1, `verdicts: ${JSON.stringify(verdicts)}`);
}

/* 10. THE PERIOD IS IN THE RIGHT UNIVERSE — tested on SLENDER buildings, which
       is the only place the comparison is fair. ASCE's Ta = Ct·H^x is
       calibrated on normally-proportioned buildings and is deliberately LOW (a
       short period gives a high, conservative base shear). A 79 m wide, 37 m
       tall concrete box genuinely does come out at a quarter of it, and chasing
       that ratio down was a mistake the first time round: the diagnostic is a
       slenderness sweep, where the model has to track the empirical band as the
       building gets tall, and cross it around H/B ≈ 3. */
{
  const ratios = [];
  for (const n of [8, 14, 22, 32, 45]) {
    const b = generate(resolveParams({ s: 'slender', t: 'office', n: String(n), bx: '5', bz: '4', bay: '8' }));
    const M = lateralModel(b, 'x'), md = modal(M);
    const Ta = SFRS.Ct * Math.pow(M.height, SFRS.x);
    ratios.push({ n, H: M.height, T: md.T1, r: md.T1 / Ta, alpha: M.height * Math.sqrt(M.GA[0] / M.EI[0]) });
  }
  ok(ratios.every((q, i) => i === 0 || q.r > ratios[i - 1].r),
    `T₁/Ta rises with slenderness (${ratios.map((q) => q.r.toFixed(2)).join(' → ')})`);
  const tall = ratios[ratios.length - 1];
  ok(tall.r > 0.8 && tall.r < 2.5, `a 45-storey tower lands in the measured band (T₁/Ta = ${tall.r.toFixed(2)})`);
  // the old rule of thumb: a shear-wall tower is about n/15 seconds
  ok(Math.abs(tall.T - 45 / 15) < 1.2, `and near the n/15 rule of thumb (T₁ = ${tall.T.toFixed(2)} s for 45 storeys)`);
  ok(ratios.every((q, i) => i === 0 || q.alpha > ratios[i - 1].alpha),
    `α rises with slenderness — squat bends, tall racks (${ratios.map((q) => q.alpha.toFixed(1)).join(' → ')})`);

  let overCu = 0;
  for (const t of TYPOLOGY_IDS) {
    const b = generate(resolveParams({ s: 'period', t }));
    const M = lateralModel(b, 'x'), md = modal(M);
    const eq = seismic(b, M, md, spectrumParams('high', 'D'));
    if (eq.Tused > eq.Cu * SFRS.Ct * Math.pow(M.height, SFRS.x) + 1e-9) overCu++;
  }
  ok(overCu === 0, 'the design period never exceeds Cu·Ta, as §12.8.2 requires');
}

/* 11. TIME HISTORY — seeded, so "this building in this earthquake" is a
       permalink, and physically consistent with the spectrum analysis. */
{
  const b = generate(resolveParams({ s: 'shake', t: 'office' }));
  const M = lateralModel(b, 'x'), md = modal(M);
  const gm1 = groundMotion(b.seed, 'high');
  const gm2 = groundMotion(b.seed, 'high');
  ok(gm1.a.length === gm2.a.length && gm1.a.every((v, i) => v === gm2.a[i]), 'the ground motion is a function of the seed');
  const other = groundMotion(b.seed + '!', 'high');
  ok(other.a.some((v, i) => v !== gm1.a[i]), 'a different seed shakes differently');
  let peak = 0;
  for (const v of gm1.a) peak = Math.max(peak, Math.abs(v));
  near(peak, SEISMIC_SCENARIOS.high.pga * G, 1e-6, 'the record is scaled to the scenario PGA');
  ok(Math.abs(gm1.a[0]) < peak * 0.2 && Math.abs(gm1.a[gm1.n - 1]) < peak * 0.5, 'the record ramps up and decays (Jennings envelope)');

  const r = newmark(M, md.K, md, quakeForcing(M, gm1), { frames: 60 });
  ok(isFinite(r.maxDrift) && r.maxDrift > 0, `the time history produces a drift (${r.maxDrift.toFixed(4)})`);
  ok(r.maxDrift < 0.2, 'and it is not a divergent one');
  ok(r.trace.length > 10 && r.trace.every((f) => f.u.every(Number.isFinite)), 'the animation trace is finite');
  // a bigger quake must shake it harder
  const rl = newmark(M, md.K, md, quakeForcing(M, groundMotion(b.seed, 'low')), { frames: 20 });
  ok(r.maxDrift > rl.maxDrift, 'the M7 record drives more drift than the low-seismicity one');

  const w = wind(b, M, md, { V: 66, exposure: 'C' });
  const rec = gustRecord(b.seed, M, w);
  const rw = newmark(M, md.K, md, windForcing(M, rec), { zeta: MAT.dampingWind, frames: 60 });
  ok(isFinite(rw.maxDrift) && rw.maxDrift > 0, `the gust history produces a drift (${rw.maxDrift.toExponential(2)})`);
  ok(rw.peakU[M.n - 1] > 0, 'and the top of the building actually moves');
}

/* 12. DETERMINISM. Same building, same options ⇒ the same report, or the
       structural numbers on a permalink mean nothing. */
{
  const b = generate(resolveParams({ s: 'det-struct', t: 'lab' }));
  const strip = (v) => JSON.stringify(v.checks) + JSON.stringify(v.summary);
  ok(strip(verify(b, {})) === strip(verify(b, {})), 'the same building verifies identically');
  const other = verify(b, { seismicScenario: 'extreme' });
  ok(strip(other) !== strip(verify(b, {})), 'a different hazard gives a different report');
}

/* 13. GRAVITY TAKEDOWN accumulates downward and lands on the ground floor. */
{
  const b = generate(resolveParams({ s: 'takedown', t: 'office' }));
  const M = lateralModel(b, 'x');
  const gv = gravity(b, M);
  const byLevel = {};
  for (const c of gv.columns) byLevel[c.level] = Math.max(byLevel[c.level] || 0, c.P);
  const levels = Object.keys(byLevel).map(Number).sort((a, c) => a - c);
  ok(byLevel[levels[0]] > byLevel[levels[levels.length - 1]], 'the ground-floor column is the most loaded');
  ok(gv.worst.level <= 1, `the governing column is at the bottom (level ${gv.worst.level})`);
  ok(gv.phiPn > 0 && gv.maxP > 0 && gv.maxUtil > 0, 'the column check has a real demand and capacity');
  ok(gv.required > 0.2 && gv.required < 3, `the required section size is plausible (${gv.required.toFixed(2)} m)`);
}

/* 14. THE FLOOR SYSTEM IS THE WEIGHT. This is the whole reason the systems
       exist: modelling every floor as 420 mm of solid concrete made every
       building about twice as heavy as it should be, and that mass went
       straight into the seismic base shear. */
{
  const at8 = (id) => floorSystem({ floor: id, bay: 8, floorH: 4.2 });
  const w = Object.fromEntries(FLOOR_IDS.map((id) => [id, at8(id).weight]));
  ok(w.composite < w['pt-flat'], `a composite deck is lighter than a PT plate (${(w.composite / 1e3).toFixed(1)} < ${(w['pt-flat'] / 1e3).toFixed(1)} kPa)`);
  ok(w['pt-flat'] < w['flat-slab'], `a PT plate is lighter than a flat slab (${(w['pt-flat'] / 1e3).toFixed(1)} < ${(w['flat-slab'] / 1e3).toFixed(1)} kPa)`);
  ok(Object.values(w).every((q) => q > 2.5e3 && q < 9e3), `every floor system lands in a real range (${Object.values(w).map((q) => (q / 1e3).toFixed(1)).join(', ')} kPa)`);
  ok(at8('flat-slab').depth < at8('double-tee').depth, 'a double-tee is deeper than a flat slab');
  // deeper floors span further — that is what you buy with the depth
  ok(FLOOR_SYSTEMS['double-tee'].maxSpan > FLOOR_SYSTEMS['flat-slab'].maxSpan, 'precast spans further than a flat slab');

  // and it moves the answer: the SAME building on two floor systems
  const base = resolveParams({ s: 'floors', t: 'office', bay: '8' });
  const heavy = verify(generate({ ...base, floor: 'flat-slab' }), { seismicScenario: 'high' });
  const light = verify(generate({ ...base, floor: 'composite' }), { seismicScenario: 'high' });
  ok(light.summary.massTonnes < heavy.summary.massTonnes * 0.92,
    `swapping to a composite deck takes real mass out (${heavy.summary.massTonnes} → ${light.summary.massTonnes} t)`);
  ok(light.summary.baseShearEq < heavy.summary.baseShearEq,
    `and the seismic base shear follows the mass down (${(heavy.summary.baseShearEq / 1e6).toFixed(0)} → ${(light.summary.baseShearEq / 1e6).toFixed(0)} MN)`);
  ok(light.summary.T1x < heavy.summary.T1x, 'a lighter building on the same frame has a shorter period');

  // the storey height follows the floor: a 1.2 m double-tee cannot fit a 2.9 m storey
  for (const t of TYPOLOGY_IDS) {
    const b = generate(resolveParams({ s: 'fit-' + t, t }));
    const FSx = floorSystem(b.params);
    ok(FSx.clear > 1.9, `${t}: the storey height leaves usable headroom (${FSx.clear.toFixed(2)} m under a ${FSx.depth.toFixed(2)} m floor)`);
  }
}

/* 15. 'OPEN' IS AIR. A pilotis undercroft and an open car-park deck are holes,
       not walls — counting them as solid concrete made the open storeys the
       stiffest and heaviest in the building. */
{
  const p = resolveParams({ s: 'pilotis-test', t: 'housing', pil: '1' });
  const open = generate(p);
  const closed = generate({ ...p, pilotis: false });
  const lo = loads(open), lc = loads(closed);
  ok(lo[0].clad < lc[0].clad, `an open ground storey is clad lighter than a closed one (${(lo[0].clad / 1e6).toFixed(2)} < ${(lc[0].clad / 1e6).toFixed(2)} MN)`);
  const Mo = lateralModel(open, 'x'), Mc = lateralModel(closed, 'x');
  ok(Mo.GA[0] < Mc.GA[0], 'and it is softer, because a hole is not a shear wall');
}

/* 16. THE FOUNDATION IS CHOSEN BY THE GROUND, not by the designer. Rock takes
       pads; soft clay forces piles; the ladder is bearing, then settlement. */
{
  const b = generate(resolveParams({ s: 'ground', t: 'office' }));
  const picked = {}, settle = {}, press = {};
  for (const sc of ['B', 'C', 'D', 'E']) {
    const v = verify(b, { siteClass: sc, seismicScenario: 'moderate', windScenario: 'coastal' });
    picked[sc] = v.foundation.type; settle[sc] = v.foundation.settle; press[sc] = v.foundation.pMax;
  }
  ok(picked.B === 'pads', `rock takes pad footings (${picked.B})`);
  ok(picked.E === 'piled raft', `soft clay forces piles (${picked.E})`);
  ok(settle.E > settle.B, `soft ground settles more (${(settle.E * 1000).toFixed(0)} vs ${(settle.B * 1000).toFixed(0)} mm)`);
  ok(SOILS.B.q > SOILS.E.q * 10, 'rock carries an order of magnitude more than soft clay');

  // the pieces of the foundation check are all real numbers
  const v = verify(b, { siteClass: 'D' });
  const f = v.foundation;
  ok(f.N > 0 && f.area > 0 && isFinite(f.e), 'the foundation has a load, an area and an eccentricity');
  ok(f.pMax >= f.pMin, 'peak bearing pressure is not below the minimum');
  ok(f.slidingCap > 0, 'there is friction to resist sliding');
  ok(v.checks.some((c) => c.id === 'bearing') && v.checks.some((c) => c.id === 'settle') && v.checks.some((c) => c.id === 'sliding'),
    'bearing, settlement and sliding all reach the verification schedule');
  // more overturning must push the resultant further out
  const calm = foundation(b, v.dirs.x.M, v.gravity, 1e6, 1e5);
  const storm = foundation(b, v.dirs.x.M, v.gravity, 4e9, 4e7);
  ok(storm.e > calm.e, 'a bigger overturning moment moves the resultant off centre');
}

/* 17. SKYSCRAPER TECH actually stiffens. Each lateral system is a real term in
       the FE, so on the SAME building each one has to move the period the way
       its name says it does. */
{
  const base = resolveParams({ s: 'tall', t: 'office', n: '30', bx: '5', bz: '4', bay: '8' });
  const T = {};
  for (const lat of LATERAL_IDS) {
    const b = generate({ ...base, lateral: lat });
    T[lat] = modal(lateralModel(b, 'x')).T1;
  }
  ok(T.frame > T['core-frame'], `adding a core stiffens a bare frame (${T.frame.toFixed(2)} → ${T['core-frame'].toFixed(2)} s)`);
  ok(T.outrigger < T['core-frame'], `outriggers stiffen the core (${T['core-frame'].toFixed(2)} → ${T.outrigger.toFixed(2)} s)`);
  ok(T['framed-tube'] < T['core-frame'], `a framed tube stiffens it (${T['framed-tube'].toFixed(2)} s)`);
  ok(T.diagrid < T['core-frame'], `a diagrid stiffens it most per kilo (${T.diagrid.toFixed(2)} s)`);
  ok(Object.values(T).every((q) => q > 0.3 && q < 12), `every system gives a sane tower period (${Object.values(T).map((q) => q.toFixed(1)).join(', ')} s)`);

  // and a tuned mass damper calms it without stiffening it
  const plain = generate({ ...base, tmd: false });
  const damped = generate({ ...base, tmd: true });
  const vp = verify(plain, { windScenario: 'cat4' }), vd = verify(damped, { windScenario: 'cat4' });
  ok(Math.abs(vp.summary.T1x - vd.summary.T1x) < 1e-9, 'a TMD does not change the period — it is mass on springs, not stiffness');
  ok(vd.summary.milliG < vp.summary.milliG,
    `but it cuts the sway people feel (${vp.summary.milliG.toFixed(1)} → ${vd.summary.milliG.toFixed(1)} milli-g)`);
  ok(TMD.addedDamping > 0.02 && TMD.addedDamping < 0.06, 'the added damping is in the band a real TMD delivers');
}

console.log(`\nbrut/struct: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
