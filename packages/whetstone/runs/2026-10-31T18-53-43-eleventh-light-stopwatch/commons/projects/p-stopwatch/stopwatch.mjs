// stopwatch.mjs — the study: one observer, a stopwatch, up to five mornings. (Modulo, day 1)
//
// study(clinic, { seed, alpha = 0.05, maxMornings = 5 }) → Promise<report>
//   report = { mornings, timed, estimate, lo, hi, verdict, reason }
//
// Design (README "The study" has the long form):
//  - The controller is a des model, `controller(clinic, opts, out)(sim)`, so the harness can record
//    and replay it. Sim time is the observer's minutes on duty: each morning starts where the last
//    one ended, and inside a morning a patient arriving at `arrive` is reached at base + arrive.
//  - Rule: in arrival order, time every patient who arrives at or after the moment the last timed
//    patient was seen. Greedy, no lookahead, no choice based on anything but arrivals and the
//    waits already timed. Whether patient X is timed is fixed before X's own wait is known, and the
//    clinic's differences are independent of each other and of waits, so the timed differences are
//    an i.i.d. sample of the one true mean. That is the whole argument for unbiasedness.
//  - The legality check uses the clinic's numbers exactly (arrive + wait), never accumulated sim
//    time, so float drift can't make us ask for a patient the clinic refuses.
//  - Fixed design: all maxMornings are used. Stopping early when the interval "looks decided" is
//    optional stopping: it biases the mean and breaks coverage. DECISION S-a.
//  - Interval: Hall's skew-corrected Student t on the timed differences, exact t quantile
//    (incomplete beta, bisection). n < 2 → (−∞, ∞) and 'cannot tell'. DECISION S-b.
//  - seed: passed to the Sim. The controller draws nothing random, so the report doesn't depend on
//    it; it is there so a later randomised rule stays reproducible. DECISION S-c.
import { Sim } from './tools/des/des.mjs';

// ---------------------------------------------------------------- Student t
function lgamma(x) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(a, b, x) {
  const TINY = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
export function ibeta(a, b, x) {   // regularized incomplete beta I_x(a, b)
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
export function tcdf(t, df) {
  const p = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t));
  return t >= 0 ? 1 - p : p;
}
export function tquantile(p, df) {  // p in (0.5, 1)
  let lo = 0, hi = 1;
  while (tcdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tcdf(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-12 * hi) break;
  }
  return (lo + hi) / 2;
}

// Plain Student t, kept for comparison (README "Measured").
export function tInterval(ds, alpha) {
  const n = ds.length, mean = ds.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1));
  const half = tquantile(1 - alpha / 2, n - 1) * sd / Math.sqrt(n);
  return { estimate: mean, lo: mean - half, hi: mean + half };
}

// Hall (1992) skew-corrected t: T = sqrt(n)·g(θ), θ = (mean − μ)/s, g(x) = x + γx²/3 + γ²x³/27 + γ/(6n),
// γ the sample skewness; g is monotone with a closed-form inverse. The estimate stays the sample mean
// (unbiased); only the interval bends toward the long tail. DECISION S-b: a tablet that sometimes
// starts its clock early gives a right-skewed difference, and plain t under-covers that (0.91 on
// exponential noise at n≈16; Hall 0.94). Measured in README.
export function interval(ds, alpha) {
  const n = ds.length;
  if (n === 0) return { estimate: NaN, lo: -Infinity, hi: Infinity };
  const mean = ds.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { estimate: mean, lo: -Infinity, hi: Infinity };
  const sd = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1));
  if (!(sd > 0)) return { estimate: mean, lo: mean, hi: mean };
  const g = ds.reduce((a, d) => a + (d - mean) ** 3, 0) / n / sd ** 3;
  const q = tquantile(1 - alpha / 2, n - 1) / Math.sqrt(n);
  const ginv = (y) => (Math.abs(g) < 1e-9 ? y : (3 / g) * (Math.cbrt(1 + g * (y - g / (6 * n))) - 1));
  return { estimate: mean, lo: mean - sd * ginv(q), hi: mean - sd * ginv(-q) };
}

// S3, in order, inclusive at ±2, strict at 0
export function verdictOf(lo, hi) {
  if (lo >= -2 && hi <= 2) return 'tablet reads true';
  if (lo > 0) return 'tablet reads long';
  if (hi < 0) return 'tablet reads short';
  return 'cannot tell';
}

// DECISION S-d: the manager's answer (SPEC) is five mornings and no more. A caller passing
// maxMornings: 7 gets five, not a clinic that throws on the sixth.
export const MANAGER_LIMIT = 5;

const isReading = (x) => typeof x === 'number' && Number.isFinite(x);

// ---------------------------------------------------------------- the controller (a des model)
export function controller(clinic, { maxMornings = 5 } = {}, out = { mornings: 0, diffs: [] }) {
  return (sim) => {
    sim.process(function* observer() {
      for (let k = 1; k <= maxMornings; k++) {
        const patients = clinic.morning(k);
        out.mornings = k;
        sim.decide('morning', { k, patients: patients.length });
        const base = sim.now;
        let seen = -Infinity;            // when the last timed patient was seen, in clinic minutes
        for (const p of patients) {
          if (!(p.arrive >= seen)) continue;
          const wait = base + p.arrive - sim.now;
          if (wait > 0) yield sim.timeout(wait);
          sim.decide('time', { id: p.id, arrive: p.arrive });
          const w = clinic.time(p.id);
          // S-g (Modulo, day 3): a usable stopwatch wait is a number, finite and ≥ 0. Anything else
          // (null, '', '12', -1, Infinity: a walkout or a blank) means we don't know when the
          // observer is free, so `seen` is NaN and nobody else is timed that morning. Before this,
          // null/''/-1 made `seen = arrive + 0` and the next call was illegal; '12' crashed the sim.
          const okW = isReading(w) && w >= 0;
          seen = okW ? p.arrive + w : NaN;
          const tab = clinic.tablet(p.id);
          sim.decide('read', { id: p.id, stopwatch: w, tablet: tab });
          // A tablet reading that isn't a finite number (a blank row) is left out and counted.
          if (okW && isReading(tab)) out.diffs.push(tab - w); else out.missing = (out.missing || 0) + 1;
          if (okW && w > 0) yield sim.timeout(w);
        }
      }
    });
  };
}

export async function study(clinic, { seed = 1, alpha = 0.05, maxMornings = 5 } = {}) {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha must be in (0, 1)');
  if (!(Number.isInteger(maxMornings) && maxMornings >= 1)) throw new RangeError('maxMornings must be a positive integer');
  const out = { mornings: 0, diffs: [] };
  maxMornings = Math.min(maxMornings, MANAGER_LIMIT);
  const sim = new Sim({ seed });
  sim.decide = () => {};
  controller(clinic, { maxMornings }, out)(sim);
  sim.run();
  return report(out, alpha);
}

const r1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
export function report({ mornings, diffs, missing = 0 }, alpha) {
  const { estimate, lo, hi } = interval(diffs, alpha);
  const verdict = verdictOf(lo, hi);
  const pct = Math.round((1 - alpha) * 100);
  const n = diffs.length;
  let reason;
  if (n < 2) reason = `Only ${n} patient${n === 1 ? ' was' : 's were'} timed in ${mornings} mornings, too few for an interval.`;
  else {
    const what = {
      'tablet reads true': 'which lies within 2 minutes either way, so the tablet is close enough to the stopwatch',
      'tablet reads long': 'which lies wholly above zero, so the tablet records longer waits than the stopwatch',
      'tablet reads short': 'which lies wholly below zero, so the tablet records shorter waits than the stopwatch',
      'cannot tell': 'which includes zero and reaches past 2 minutes, so these mornings cannot settle it',
    }[verdict];
    reason = `Timed ${n} patients over ${mornings} mornings: the tablet minus the stopwatch averages ${r1(estimate)} min, ${pct}% interval ${r1(lo)} to ${r1(hi)}, ${what}.`;
  }
  // S-h (Modulo, day 3): the hole no interval closes (README, discrete 8/60 covers 0.80). If the
  // tablet goes badly wrong for 1 patient in 10, 0.9^n of samples contain none of them. When that
  // chance is above alpha, the reason says so with the number. Words only: estimate/interval unchanged.
  const blind = 0.9 ** n;
  if (n >= 2 && blind > alpha) reason += ` With only ${n} timed: if the tablet went badly wrong for 1 patient in 10, there is a ${Math.round(blind * 100)}% chance none of these ${n} was one of them, and the interval could not show it.`;
  if (missing) reason += ` ${missing} timed patient${missing === 1 ? ' had' : 's had'} no usable reading and ${missing === 1 ? 'is' : 'are'} left out.`;
  return { mornings, timed: n, estimate, lo, hi, verdict, reason };
}
