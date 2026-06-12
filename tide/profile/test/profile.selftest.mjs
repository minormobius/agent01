// Self-test for the centrifugal barometer. Run: node tide/profile/test/profile.selftest.mjs
// The contract: gravity is ω²r (zero on the axis, full at the rim); pressure is the
// isothermal centrifugal barometer P(r)=P_axis·e^{S(r/R)²}; and "non-spinning pressure"
// fixes the air — conserve mode preserves total moles (area-weighted mean == P0).
import {
  defaultParams, solveProfile, profileNumber, gravityAt,
  omegaFromRpm, rpmFromOmega, omegaFromRim, R_GAS, M_AIR, G_EARTH,
} from '../sim/profile.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

// numeric area-weighted mean of a sampled profile: (2/R²)∫P·r dr by trapezoid
function numericMeanP(sol) {
  const { r, P } = sol; const R = r[r.length - 1];
  let acc = 0;
  for (let i = 1; i < r.length; i++) {
    const f0 = P[i - 1] * r[i - 1], f1 = P[i] * r[i];
    acc += 0.5 * (f0 + f1) * (r[i] - r[i - 1]);
  }
  return (2 / (R * R)) * acc;
}

// ── 1. Gravity is pure kinematics: ω²r, zero at axis, full at rim, monotone ──
{
  const s = solveProfile();
  const { r, g, summary } = s;
  ok('gravity is zero on the axis', g[0] === 0);
  ok('gravity at the rim is ω²R', rel(g[g.length - 1], summary.omega ** 2 * r[r.length - 1]) < 1e-12,
     `${g[g.length - 1].toFixed(4)} m/s²`);
  let mono = true;
  for (let i = 1; i < g.length; i++) if (g[i] < g[i - 1]) mono = false;
  ok('gravity increases monotonically outward', mono);
  ok('rim gravity reported in g matches m/s²', rel(summary.gRimG, summary.gRim / G_EARTH) < 1e-12);
  ok('gravityAt is exactly ω²r', gravityAt(0.03, 5000) === 0.03 * 0.03 * 5000);
}

// ── 2. The governing number S and the rim/axis ratio e^S ─────────────────────
{
  const p = { R: 8000, omega: 0.0313, P0: 101325, T: 293.15, M: M_AIR };
  const s = solveProfile(p);
  const S = profileNumber(p);
  const cIso = Math.sqrt((R_GAS * p.T) / p.M);
  ok('S equals v_rim²/(2c²)', rel(S, (p.omega * p.R) ** 2 / (2 * cIso * cIso)) < 1e-12,
     `S=${S.toFixed(4)}`);
  ok('rim/axis pressure ratio is exactly e^S', rel(s.summary.ratio, Math.exp(S)) < 1e-12,
     `ratio=${s.summary.ratio.toFixed(4)}`);
  ok('P(r) is the isothermal barometer at the rim',
     rel(s.P[s.P.length - 1], s.summary.PAxis * Math.exp(S)) < 1e-12);
}

// ── 3. Conserve mode conserves the air: area-weighted mean pressure == P0 ─────
{
  const s = solveProfile({ mode: 'conserve', P0: 101325, N: 4000 });
  ok('closed-form mean pressure equals P0 (mass conserved)',
     rel(s.summary.meanP, 101325) < 1e-12, `mean=${s.summary.meanP.toFixed(2)} Pa`);
  ok('numeric ∫P·dA/A also recovers P0 (to grid tolerance)',
     rel(numericMeanP(s), 101325) < 1e-4, `num=${numericMeanP(s).toFixed(1)} Pa`);
  ok('air pools rimward: axis below P0, rim above P0',
     s.summary.PAxis < 101325 && s.summary.PRim > 101325,
     `axis ${(s.summary.PAxis / 1000).toFixed(1)} kPa · rim ${(s.summary.PRim / 1000).toFixed(1)} kPa`);
  // mass/length must equal a static cylinder of uniform P0
  const massStatic = (M_AIR / (R_GAS * s.params.T)) * Math.PI * s.params.R ** 2 * 101325;
  ok('air mass per metre matches a static P0 bore', rel(s.summary.massPerLength, massStatic) < 1e-12);
}

// ── 4. Axis mode pins the centreline at P0 ───────────────────────────────────
{
  const s = solveProfile({ mode: 'axis', P0: 90000 });
  ok('axis mode: P(0) == P0 exactly', s.P[0] === 90000);
  ok('axis mode: mean pressure exceeds P0 (extra air added rimward)', s.summary.meanP > 90000);
}

// ── 5. No-spin limit: flat air, zero gravity, both modes agree ───────────────
{
  const a = solveProfile({ omega: 0, mode: 'conserve' });
  const b = solveProfile({ omega: 0, mode: 'axis' });
  let flat = true;
  for (let i = 0; i < a.P.length; i++) if (rel(a.P[i], a.params.P0) > 1e-9) flat = false;
  ok('ω=0 → pressure is flat at P0 everywhere', flat);
  ok('ω=0 → gravity is zero everywhere', a.g.every((v) => v === 0));
  ok('ω=0 → conserve and axis modes coincide', rel(a.summary.PAxis, b.summary.PAxis) < 1e-9);
  ok('ω=0 → S is zero and ratio is one', a.summary.S === 0 && a.summary.ratio === 1);
}

// ── 6. Linearity in P0 and determinism ───────────────────────────────────────
{
  const a = solveProfile({ P0: 50000 });
  const b = solveProfile({ P0: 100000 });
  let doubles = true;
  for (let i = 0; i < a.P.length; i++) if (rel(b.P[i], 2 * a.P[i]) > 1e-12) doubles = false;
  ok('pressure scales linearly with P0', doubles);
  const c = solveProfile({ P0: 50000 });
  ok('solver is deterministic', a.P.every((v, i) => v === c.P[i]));
}

// ── 7. Spin-unit conversions are mutually consistent ─────────────────────────
{
  ok('rpm↔omega round-trips', rel(rpmFromOmega(omegaFromRpm(2.5)), 2.5) < 1e-12);
  ok('rim-speed → omega gives back the rim speed', rel(omegaFromRim(120, 8000) * 8000, 120) < 1e-12);
  // 1 g at the outer 10 km skin ⇒ the canonical spin; the 8 km floor then sits below 1 g
  const s = solveProfile({ R: 8000, omega: Math.sqrt(G_EARTH / 10000) });
  ok('canonical build: 8 km floor sits below 1 g', s.summary.gRimG > 0.7 && s.summary.gRimG < 0.85,
     `floor ${s.summary.gRimG.toFixed(3)} g`);
  ok('radius of 1 g lands at the design ref (10 km)', rel(s.summary.rGravUnity, 10000) < 1e-9,
     `${(s.summary.rGravUnity / 1000).toFixed(2)} km`);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
