// stopwatch — how far is the tablet's wait from a stopwatch's? One observer, up to
// maxMornings mornings, an interval for the mean of (tablet − stopwatch), and a verdict.
// The controller is a des model run through the harness, so every choice it makes is in
// a log that can be replayed. Decisions are marked DECISION and listed in README.md.
import { record } from './harness.mjs';

const DAY = 1440; // sim minutes between the openings of successive mornings

// The model: one process that walks the mornings. `out.report` is set when it ends.
// DECISION (whom to time): greedy. Time the first patient who arrives at or after the
// moment the last timed one was seen. The choice uses only arrival times and the
// stopwatch waits already measured, never a tablet reading, so whether patient X is
// timed is independent of X's (tablet − stopwatch) difference, and the plain mean of
// the timed differences is unbiased. Choosing by tablet reading would select on the
// very error being measured.
// DECISION (when to stop): use every morning the manager gives. With ~2–3 timed patients
// a morning the sample is small, and any rule that stops on what the data say (the mean,
// or a lucky small spread) shifts the interval's coverage. A fixed design keeps the
// t-interval honest. The stop decision is still logged each morning, with its reason.
export function model(clinic, { alpha = 0.05, maxMornings = 5 } = {}, out = {}) {
  return (sim) => {
    sim.process(function* () {
      const diffs = [], pairs = [], untimedTablet = [];
      let mornings = 0;
      for (let k = 1; k <= maxMornings; k++) {
        const base = (k - 1) * DAY;
        if (base > sim.now) yield sim.timeout(base - sim.now);
        const patients = clinic.morning(k);
        mornings = k;
        sim.decide('morning', { k, patients: patients.length });
        let free = -Infinity;
        const timed = [];
        for (const p of patients) {
          if (!(p.arrive >= free)) continue;
          const at = base + p.arrive;
          if (at > sim.now) yield sim.timeout(at - sim.now);
          sim.decide('time', { k, id: p.id, arrive: p.arrive });
          const w = clinic.time(p.id);
          free = p.arrive + w;
          if (base + free > sim.now) yield sim.timeout(base + free - sim.now);
          sim.decide('seen', { k, id: p.id, wait: w });
          timed.push({ id: p.id, w });
        }
        const today = timed.map(({ id, w }) => clinic.tablet(id) - w);
        diffs.push(...today);
        timed.forEach(({ w }, i) => pairs.push({ w, d: today[i] }));
        const ids = new Set(timed.map((x) => x.id));
        for (const p of patients) if (!ids.has(p.id)) untimedTablet.push(clinic.tablet(p.id));
        sim.decide('tablet', { k, diffs: today });
        const last = k === maxMornings;
        sim.decide(last ? 'stop' : 'continue', { k, n: diffs.length, reason: last ? 'manager\'s limit reached' : 'fixed design: every morning offered is used' });
      }
      // The diagnostic is computed after the last morning and only reads; nothing in the
      // controller above sees it (ta-a63ca2).
      const diag = diagnose(pairs, untimedTablet, alpha);
      sim.decide('diagnostic', diag);
      out.report = summarise(diffs, mornings, alpha);
      if (diag.clause) out.report.reason = `${out.report.reason.replace(/\.$/, '')}; ${diag.clause}.`;
      sim.decide('report', out.report);
    });
  };
}

export async function studyLogged(clinic, { seed = 1, alpha = 0.05, maxMornings = 5 } = {}) {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha must be in (0, 1)');
  if (!(Number.isInteger(maxMornings) && maxMornings >= 1)) throw new RangeError('maxMornings must be an integer >= 1');
  const out = {};
  const log = await record(model(clinic, { alpha, maxMornings }, out), { seed });
  return { report: out.report, log };
}

export async function study(clinic, opts = {}) {
  return (await studyLogged(clinic, opts)).report;
}

// ---------------------------------------------------------------- the interval
export function summarise(diffs, mornings, alpha) {
  const n = diffs.length;
  const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);
  if (n < 2) {
    // DECISION: with fewer than two timed patients there is no spread to judge by, so the
    // interval is the whole line and the verdict is 'cannot tell'.
    const estimate = n ? diffs[0] : null;
    return { mornings, timed: n, estimate, lo: -Infinity, hi: Infinity, verdict: 'cannot tell',
      reason: `Only ${n} patient${n === 1 ? ' was' : 's were'} timed in ${mornings} morning${mornings === 1 ? '' : 's'}, too few to say anything.` };
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const ss = diffs.reduce((a, d) => a + (d - mean) ** 2, 0);
  const se = Math.sqrt(ss / (n - 1) / n);
  const h = tQuantile(1 - alpha / 2, n - 1) * se;
  const lo = mean - h, hi = mean + h;
  const verdict = verdictOf(lo, hi);
  const pct = Math.round((1 - alpha) * 1000) / 10;
  const why = {
    'tablet reads true': 'the whole interval is within 2 minutes of zero',
    'tablet reads long': 'the whole interval is above zero',
    'tablet reads short': 'the whole interval is below zero',
    'cannot tell': 'the interval includes zero and reaches beyond 2 minutes',
  }[verdict];
  return { mornings, timed: n, estimate: mean, lo, hi, verdict,
    reason: `${n} patients timed over ${mornings} mornings: the tablet differs from the stopwatch by ${fmt(mean)} min on average (${pct}% interval ${fmt(lo)} to ${fmt(hi)}); ${why}.` };
}

// ---------------------------------------------------------------- the diagnostic
// DECISION (ta-a63ca2): two read-only checks on SPEC's one assumption we lean on, that a
// patient's difference doesn't depend on their wait. They never change the interval or
// the verdict; at most they add one clause to `reason`.
//  drift: OLS slope of (tablet − stopwatch) on stopwatch wait among the timed, with its
//    1 − alpha t interval (n − 2 df). If the interval excludes 0, the clause says so. Under
//    SPEC's promise this fires about alpha of the time by chance; the clause says "may".
//  lean: mean tablet wait of the timed minus that of everyone not timed. The observer is
//    free more often in quiet stretches, so the timed wait less. Reported in the clause
//    when the timed waited LEAN_MIN minutes or more less than the rest by the tablet.
export const LEAN_MIN = 5;
export function diagnose(pairs, untimedTablet, alpha) {
  const n = pairs.length, out = { n, slope: null, slopeLo: null, slopeHi: null, lean: null, clause: null };
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  if (n >= 1 && untimedTablet.length >= 1) out.lean = mean(pairs.map((p) => p.w + p.d)) - mean(untimedTablet);
  if (n >= 3) {
    const mw = mean(pairs.map((p) => p.w)), md = mean(pairs.map((p) => p.d));
    let sxx = 0, sxy = 0;
    for (const { w, d } of pairs) { sxx += (w - mw) ** 2; sxy += (w - mw) * (d - md); }
    if (sxx > 0) {
      const b = sxy / sxx;
      let sse = 0;
      for (const { w, d } of pairs) sse += (d - md - b * (w - mw)) ** 2;
      const h = tQuantile(1 - alpha / 2, n - 2) * Math.sqrt(sse / (n - 2) / sxx);
      Object.assign(out, { slope: b, slopeLo: b - h, slopeHi: b + h });
    }
  }
  const f = (x) => Math.abs(Math.round(x * 10) / 10).toFixed(1);
  if (out.slope !== null && (out.slopeLo > 0 || out.slopeHi < 0)) {
    out.clause = `but take care: among the patients we timed, the tablet's error ${out.slope > 0 ? 'grew' : 'shrank'} by about ${f(out.slope * 10)} min for every 10 min of waiting, so it may not be one fixed amount, and the figure above is for the waits we timed`;
  } else if (out.lean !== null && out.lean <= -LEAN_MIN) {
    out.clause = `the patients we timed waited about ${f(out.lean)} min less than the others by the tablet, so if the tablet's error grows with the wait, this figure understates it`;
  }
  return out;
}

export function verdictOf(lo, hi) {
  if (lo >= -2 && hi <= 2) return 'tablet reads true';
  if (lo > 0) return 'tablet reads long';
  if (hi < 0) return 'tablet reads short';
  return 'cannot tell';
}

// ---------------------------------------------------------------- Student t
// CDF through the regularized incomplete beta (Lentz continued fraction), quantile by
// bisection. Checked against tables in test.mjs.
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  const FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
}
function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
export function tCdf(t, df) {
  const p = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t));
  return t >= 0 ? 1 - p : p;
}
export function tQuantile(p, df) {
  let lo = 0, hi = 1;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, df) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
