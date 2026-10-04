// stopwatch.mjs — reference: time every patient the one observer can, in arrival order, for all
// the mornings allowed; estimate the mean tablet − stopwatch difference with a t interval.
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const tcrit = (df) => (df <= 30 ? T975[df - 1] : 1.96 + 2.4 / df);

export async function study(clinic, { seed = 1, alpha = 0.05, maxMornings = 5 } = {}) {
  if (alpha !== 0.05) throw new Error('reference handles alpha 0.05 only');
  const diffs = [];
  let mornings = 0;
  for (let k = 1; k <= maxMornings; k++) {
    const pts = clinic.morning(k);
    mornings = k;
    let freeAt = -Infinity;
    for (const p of pts) {
      if (p.arrive < freeAt) continue;
      const w = clinic.time(p.id);
      freeAt = p.arrive + w;
      diffs.push(clinic.tablet(p.id) - w);
    }
  }
  const n = diffs.length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const h = n > 1 ? tcrit(n - 1) * sd / Math.sqrt(n) : Infinity;
  const lo = mean - h, hi = mean + h;
  const verdict = lo > 0 ? 'tablet reads long' : lo >= -2 && hi <= 2 ? 'tablet reads true' : 'cannot tell';
  return { mornings, timed: n, estimate: mean, lo, hi, verdict, reason: `${n} patients timed over ${mornings} mornings` };
}
