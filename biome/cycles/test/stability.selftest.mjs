// Self-test for the stability solver. Run: node biome/cycles/test/stability.selftest.mjs
// Structural checks PLUS the load-bearing one: the eigenvalue-predicted relaxation rate is
// cross-checked against the ACTUAL time-domain decay of a perturbation — i.e. the linearized
// verdict is validated against the real nonlinear model it claims to summarise.
import { defaultParams, defaultState, step } from '../sim/cycles.mjs';
import { analyzeStability, findEquilibrium, communityMatrix, ecoVars } from '../sim/stability.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const DAY = 86400;

// ── 1. The default community is stable, and the analysis is self-consistent ──
{
  const p = defaultParams();
  const a = analyzeStability(p);
  ok('default community is asymptotically stable (all Re λ < 0)', a.stable && !a.marginal,
     `α = ${a.spectralAbscissa.toExponential(2)}/day`);
  ok('equilibrium is well-converged (residual small)', a.residual < 1e-2,
     `residual ${a.residual.toExponential(2)}/day`);
  ok('one eigenvalue per subsystem variable (species + litter)',
     a.eigenvalues.length === ecoVars(p).length, `${a.eigenvalues.length} eigenvalues`);
  // Σ Re(λ) = trace(J): a basic invariant of the spectrum
  const trace = a.communityMatrix.reduce((s, r, i) => s + r[i], 0) * DAY;
  const sumRe = a.eigenvalues.reduce((s, e) => s + e.re, 0);
  ok('Σ Re(λ) equals trace(J)', Math.abs(sumRe - trace) < 1e-6 * (1 + Math.abs(trace)),
     `Σ=${sumRe.toFixed(4)} trace=${trace.toFixed(4)}`);
  // complex eigenvalues come in conjugate pairs
  const ims = a.eigenvalues.map((e) => e.im).filter((x) => Math.abs(x) > 1e-9).sort((x, y) => x - y);
  ok('complex eigenvalues are conjugate pairs', ims.length % 2 === 0 &&
     ims.every((v, k) => k >= ims.length / 2 || Math.abs(v + ims[ims.length - 1 - k]) < 1e-9));
}

// ── 2. THE cross-check: predicted relaxation rate ≈ measured time-domain decay ─
// Perturb the equilibrium, integrate the real nonlinear model, measure how fast the
// perturbation shrinks, and compare to the spectral abscissa α from the Jacobian.
{
  const p = defaultParams();
  const sEq = findEquilibrium(p, defaultState(p), { days: 800 });
  const a = analyzeStability(p, { state: sEq, equilibrate: false });
  const vars = ecoVars(p);
  const relNorm = (s) => Math.sqrt(vars.reduce((acc, id) => acc + ((s[id] - sEq[id]) / Math.max(sEq[id], 1)) ** 2, 0));

  // 5% kick to the pollinator, then watch the whole subsystem relax
  let s = { ...sEq, pollinator: sEq.pollinator * 1.05 };
  const dt = 3 * 3600;
  const sample = {};
  const until = 260;
  for (let d = 0, i = 0; d <= until; i++) {
    s = step(s, p, dt);
    d = (i + 1) * dt / DAY;
    sample[Math.round(d)] = relNorm(s);
  }
  // slope of ln‖δ‖ between day 60 and day 220 (after the fast modes have died)
  const measured = (Math.log(sample[220]) - Math.log(sample[60])) / (220 - 60); // 1/day
  ok('measured decay rate matches the predicted spectral abscissa α',
     Math.abs(measured - a.spectralAbscissa) < 0.3 * Math.abs(a.spectralAbscissa),
     `measured ${measured.toExponential(2)}/day vs α ${a.spectralAbscissa.toExponential(2)}/day`);
  ok('the perturbation actually shrinks (stable in practice too)', sample[220] < sample[60] * 0.5,
     `‖δ‖ ${sample[60].toExponential(2)} → ${sample[220].toExponential(2)}`);
}

// ── 3. Keystone ranking is sensible (top-down predator control) ──────────────
{
  const a = analyzeStability(defaultParams());
  ok('press-perturbation matrix is finite (J invertible)', a.pressMatrix !== null && a.keystone !== null);
  ok('the predator is the strongest keystone (top-down control)',
     a.keystone[0].id === 'predator' && a.keystone[0].influence === 1,
     a.keystone.slice(0, 3).map((k) => `${k.id} ${k.influence.toFixed(2)}`).join(', '));
}

// ── 4. The solver can also detect LOSS of stability ──────────────────────────
// Strip the density-dependent mortality that damps the predator–prey loop; the interior
// equilibrium loses asymptotic stability (Hopf-style), which the spectrum should reveal as
// α rising toward/above zero (vs the strongly-negative α of the damped default).
{
  const damped = analyzeStability(defaultParams());
  const p = defaultParams();
  for (const sp of p.species) if (sp.kind === 'heterotroph') sp.capacityFrac = 0; // remove self-limitation
  const undamped = analyzeStability(p);
  ok('removing density dependence pushes α toward instability',
     undamped.spectralAbscissa > damped.spectralAbscissa,
     `α: ${damped.spectralAbscissa.toExponential(2)} → ${undamped.spectralAbscissa.toExponential(2)}/day`);
}

// ── 5. Determinism ───────────────────────────────────────────────────────────
{
  const a = analyzeStability(defaultParams());
  const b = analyzeStability(defaultParams());
  ok('analysis is deterministic',
     a.spectralAbscissa === b.spectralAbscissa && JSON.stringify(a.eigenvalues) === JSON.stringify(b.eigenvalues));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
