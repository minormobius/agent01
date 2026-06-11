// biome/cycles/sim/stability.mjs — the analytic brain: "will this web survive?"
//
// A time-domain run tells you what happens over 600 days; this tells you the FATE of the
// steady state directly, from its linearization — the query an ecosystem-builder needs at
// interactive speed. Three classic results, all read off the community matrix J (the
// Jacobian of each species' growth with respect to every species' biomass, evaluated at
// equilibrium with the abiotic pools slaved at their steady values — the textbook
// community-matrix assumption that resources equilibrate fast):
//
//   • Asymptotic stability (May 1972): the equilibrium is stable iff every eigenvalue of J
//     has negative real part. The spectral abscissa α = max Re(λ) is the verdict; −1/α is
//     the RETURN TIME (how fast a small shock decays). A complex rightmost pair means the
//     return is oscillatory (predator–prey ringing); its period is 2π/|Im λ|.
//   • Reactivity (Neubert & Caswell 1997): even a stable web can AMPLIFY a shock before it
//     decays. The worst-case initial growth rate is λmax of the symmetric part (J+Jᵀ)/2;
//     if it's positive the web is "reactive" — robust on paper, twitchy in practice.
//   • Press perturbations (Bender et al. 1984): a sustained nudge to species j shifts the
//     whole equilibrium by the j-th column of −J⁻¹. Column magnitude ranks KEYSTONES — who,
//     when pressed, moves the most of the rest of the web.
//
// Built on the real model's own `derivatives()` via a numerical Jacobian, so this is the
// stability of the ACTUAL nonlinear system (Monod foraging, density dependence, pollination
// gating) linearized at its fixed point — not an idealized Lotka–Volterra stand-in. Pure,
// zero-dep (only cycles.mjs + linalg.mjs), node + browser. Mirrored by the Rust crate in
// cycles/solver/ for a native/WASM path; this JS version is the guaranteed one.

import { derivatives, step, defaultState } from './cycles.mjs';
import { inverse, eigGeneral, eigSymmetric } from './linalg.mjs';

const DAY = 86400;

// Integrate to a quasi-steady state. Returns the final state; the species biomasses are
// near their fixed point even if slow pools (food/litter) still drift gently.
export function findEquilibrium(p, s0, { days = 800, dtHours = 3 } = {}) {
  const dt = dtHours * 3600;
  const steps = Math.round((days * DAY) / dt);
  let s = s0;
  for (let i = 0; i < steps; i++) s = step(s, p, dt);
  return s;
}

// Which state variables form the "ecological subsystem" we linearize. Species PLUS the
// litter stock — because the decomposer's resource IS litter, so slaving litter would sever
// the decomposer↔litter consumer–resource loop and leave a spurious near-neutral mode. The
// genuinely fast/buffered pools (gases, water, dissolved nutrients) are held at equilibrium
// (the standard quasi-steady-state-resources assumption); food is slaved too — it's a pure
// downstream sink (crew eats it, it spoils) with no feedback to any species.
export const ecoVars = (p) => [...p.species.map((sp) => sp.id), 'litter'];

// Numerical Jacobian J[i][j] = ∂(dx_i/dt)/∂x_j (units 1/s), central difference, over the
// given variable list (default: the ecological subsystem). Off-list pools held fixed.
export function communityMatrix(s, p, { vars = ecoVars(p), relEps = 1e-5 } = {}) {
  const n = vars.length;
  const J = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const id = vars[j];
    const x = s[id];
    const h = relEps * Math.max(Math.abs(x), 1);
    const dPlus = derivatives({ ...s, [id]: x + h }, p).d;
    const dMinus = derivatives({ ...s, [id]: x - h }, p).d;
    for (let i = 0; i < n; i++) J[i][j] = (dPlus[vars[i]] - dMinus[vars[i]]) / (2 * h);
  }
  return { J, vars };
}

// The full analysis. Pass params; optionally a precomputed equilibrium state.
export function analyzeStability(p, { state, equilibrate = true, days = 800 } = {}) {
  const ids = p.species.map((sp) => sp.id);
  let s = state ?? defaultState(p);
  if (equilibrate) s = findEquilibrium(p, s, { days });

  const vars = ecoVars(p);
  const { J } = communityMatrix(s, p, { vars });
  const nsp = ids.length;

  // convergence residual: how close the subsystem is to its fixed point (per day, relative)
  const dEq = derivatives(s, p).d;
  const residual = Math.max(...vars.map((id) => Math.abs(dEq[id]) * DAY / Math.max(Math.abs(s[id]), 1)));

  // eigenvalues (convert 1/s → 1/day for human-readable times)
  const eig = eigGeneral(J).map((e) => ({ re: e.re * DAY, im: e.im * DAY }));
  const alpha = Math.max(...eig.map((e) => e.re));         // spectral abscissa, 1/day
  const rightmost = eig.reduce((a, b) => (b.re > a.re ? b : a), eig[0]);
  const stable = alpha < 0;
  const NEUTRAL = 1e-4; // |α| below this ⇒ effectively neutral (a barely-damped mode)

  // reactivity: λmax of the symmetric part (in 1/day)
  const sym = J.map((row, i) => row.map((v, k) => (v + J[k][i]) / 2));
  const reactivity = eigSymmetric(sym)[0] * DAY;

  // press-perturbation sensitivity S = −J⁻¹ (∂x*_i / ∂press_j). Keystone = how much pressing
  // species j moves the rest of the web; reported normalised to the strongest (relative
  // ranking is the meaningful part — absolute magnitudes scale with the slowest mode).
  let pressMatrix = null, keystone = null;
  try {
    const Jinv = inverse(J);
    pressMatrix = Jinv.map((row) => row.map((v) => -v));
    const raw = ids.map((id, j) => ({
      id,
      influence: pressMatrix.reduce((sum, row) => sum + Math.abs(row[j]), 0),
    }));
    const mx = Math.max(...raw.map((k) => k.influence), 1e-300);
    keystone = raw.map((k) => ({ id: k.id, influence: k.influence / mx })).sort((a, b) => b.influence - a.influence);
  } catch { /* singular: a species is decoupled or extinct */ }

  const speciesMatrix = J.slice(0, nsp).map((row) => row.slice(0, nsp)); // species×species block for display

  return {
    species: ids,
    vars,
    equilibrium: Object.fromEntries(ids.map((id) => [id, s[id]])),
    residual,                              // ≲1e-2 ⇒ well-converged equilibrium
    communityMatrix: J,                    // full subsystem, 1/s entries
    speciesMatrix,                         // species×species block, 1/s
    eigenvalues: eig,                      // 1/day
    spectralAbscissa: alpha,               // 1/day
    stable,
    marginal: Math.abs(alpha) < NEUTRAL,   // a near-zero rightmost mode: very slow drift
    returnTime: stable ? -1 / alpha : Infinity,        // days for a shock to decay to 1/e
    oscillatory: Math.abs(rightmost.im) > 1e-9,
    oscillationPeriod: Math.abs(rightmost.im) > 1e-9 ? (2 * Math.PI) / Math.abs(rightmost.im) : null, // days
    reactivity,                            // 1/day; >0 ⇒ transient amplification
    reactive: reactivity > 0,
    pressMatrix,                           // −J⁻¹ or null
    keystone,                              // ranked, normalised to [0,1], or null
    verdict: verdictText({ stable, alpha, reactivity, marginal: Math.abs(alpha) < NEUTRAL,
                           returnTime: stable ? -1 / alpha : Infinity }),
  };
}

function verdictText({ stable, alpha, reactivity, marginal, returnTime }) {
  if (!stable) return `Unstable — a small shock grows (α = +${alpha.toFixed(4)}/day). This web does not hold.`;
  const twitch = reactivity > 0 ? ' It is reactive: a shock amplifies briefly before settling.' : ' It absorbs shocks without overshoot.';
  if (marginal) return `Marginally stable — a near-neutral mode means perturbations drift back only very slowly (α ≈ ${alpha.toExponential(1)}/day).${twitch}`;
  const t = returnTime;
  const speed = t < 30 ? 'snaps back fast' : t < 180 ? 'recovers steadily' : 'recovers, but slowly';
  return `Stable — ${speed} (return time ≈ ${t.toFixed(0)} days).${twitch}`;
}

const Stability = { findEquilibrium, communityMatrix, analyzeStability };
if (typeof globalThis !== 'undefined') globalThis.Stability = Stability;
export default Stability;
