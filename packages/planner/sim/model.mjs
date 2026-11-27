// The Milwaukee economy as a regional input-output model with a household loop.
//
//   x = A_r x + c(x) + d          output by sector (millions of current dollars)
//   c = θ · (μ ∘ p) · (ω·x + T)   local household purchases: wage income ω·x plus non-wage
//                                  income T (transfers, dividends, interest, rent), spent in
//                                  national PCE proportions p, of which share μ stays local
//   E = x / π                      jobs, from output per job
//
// A_r is the national domestic coefficient matrix regionalised by Flegg's location quotient
// (FLQ, δ = 0.3). d is everything the city's economy does not decide for itself — exports
// to the rest of the world, investment, government purchases — and it is NOT observed: it
// is the residual that makes each historical year's accounts balance. So:
//
//   * replaying history with the observed residual reproduces history exactly (an identity,
//     checked in sim/model.selftest.mjs) — that proves the books balance, not that the model
//     knows anything;
//   * the real test is FORECASTING d from information available at the time (national
//     growth by sector, plus a fitted local drift) and comparing to what happened. That is
//     sim/backtest.mjs.
import { SECTORS, N, IDX } from './sectors.mjs';
import { solve, matvec, zeros } from './linalg.mjs';
import { nat, cty, city } from './data.mjs';

export const DEFAULTS = {
  delta: 0.3,     // FLQ regional-size exponent (Flegg & Tohmo's central estimate)
  theta: 0.8,     // consumption out of personal income. US PCE / personal income ran 0.78-0.83 over 2002-2023; not in the data, so a stated assumption
};

const sum = a => a.reduce((s, v) => s + v, 0);

export function regionalise(y, p = DEFAULTS) {
  const n = nat[y], c = cty[y];
  const Er = sum(c.emp), En = sum(n.emp);
  const LQ = SECTORS.map((s, i) => s.noJobs ? 1 : (c.emp[i] / Er) / (n.emp[i] / En));
  const lambda = Math.log2(1 + Er / En) ** p.delta;
  const r = zeros(N, N).map((row, i) => row.map((_, j) => Math.min(1, i === j ? LQ[i] : lambda * LQ[i] / LQ[j])));
  return { LQ, lambda, r };
}

const regionalA = (y, r) => nat[y].A.map((row, i) => row.map((a, j) => a * (1 - nat[y].imp[i]) * r[i][j]));
const pceShares = y => { const v = nat[y].fd.pce; const t = sum(v); return v.map(x => x / t); };

// Calibrate one historical year: every quantity observed or derived, d by residual.
export function calibrate(y, p = DEFAULTS, base = null) {
  const c = cty[y];
  const { LQ, r } = base?.r ? { LQ: base.LQ, r: base.r } : regionalise(y, p);
  const Ar = regionalA(y, r);
  const x = c.out.slice();
  const wageShare = c.earningsResidence / sum(c.wages);           // QCEW wages -> residents' net earnings
  const omega = x.map((xi, i) => xi ? c.wages[i] * wageShare / xi : 0);
  const pce = pceShares(y);
  const mu = SECTORS.map((s, i) => (1 - nat[y].imp[i]) * Math.min(1, LQ[i]));
  const T = c.nonWage;
  const income = sum(omega.map((w, i) => w * x[i])) + T;
  const inter = matvec(Ar, x);
  let cons = pce.map((s, i) => p.theta * mu[i] * s * income);
  const adjusted = [];
  // Where local intermediate + local consumption would exceed the sector's output, the
  // quotients have over-localised it: cut μ for that sector until d >= 0.
  for (let i = 0; i < N; i++) {
    const room = x[i] - inter[i];
    if (cons[i] > room) { const m = Math.max(0, room) / (p.theta * pce[i] * income); adjusted.push(SECTORS[i].id); mu[i] = m; cons[i] = p.theta * m * pce[i] * income; }
  }
  const d = x.map((xi, i) => xi - inter[i] - cons[i]);
  return { year: y, x, E: c.emp.slice(), pi: c.pi.slice(), d, Ar, r, LQ, omega, mu, pce, T, theta: p.theta, muAdjusted: adjusted };
}

// Solve the economy for a given exogenous demand d, coefficients, and non-wage income.
export function solveEconomy({ Ar, omega, mu, pce, theta, T, d }) {
  const h = pce.map((s, i) => theta * mu[i] * s);                  // consumption per $ of income
  const M = Ar.map((row, i) => row.map((a, j) => (i === j ? 1 : 0) - a - h[i] * omega[j]));
  const rhs = d.map((di, i) => di + h[i] * T);
  return solve(M, rhs);
}

// One year forward. `drift` is a per-sector log growth of d over and above national growth.
// Uses only: the state at y, and national data for y+1 (a conditional forecast — the
// question is what Milwaukee does GIVEN the national economy, not forecasting the nation).
export function step(s, drift = new Array(N).fill(0)) {
  const y = s.year, y1 = y + 1, n0 = nat[y], n1 = nat[y1];
  const G = n1.out.map((v, i) => n0.out[i] ? v / n0.out[i] : 1);
  const gdpG = sum(n1.va) / sum(n0.va);
  const d = s.d.map((v, i) => v * G[i] * Math.exp(drift[i]));
  const T = s.T * gdpG;
  const Ar = regionalA(y1, s.r);
  const natPi = (n, i) => n.emp[i] ? n.out[i] / n.emp[i] : 0;
  const pi = s.pi.map((v, i) => natPi(n0, i) ? v * natPi(n1, i) / natPi(n0, i) : v);
  const omega = s.omega.map((w, i) => { const r0 = n0.comp[i] / n0.out[i], r1 = n1.comp[i] / n1.out[i]; return r0 ? w * r1 / r0 : w; });
  const x = solveEconomy({ Ar, omega, mu: s.mu, pce: pceShares(y1), theta: s.theta, T, d });
  const E = x.map((xi, i) => SECTORS[i].noJobs || !pi[i] ? 0 : xi / pi[i]);
  return { ...s, year: y1, x, E, pi, d, Ar, omega, pce: pceShares(y1), T };
}

export const cityJobs = (E, shares) => sum(E.map((e, i) => e * shares[i]));
export { sum };
