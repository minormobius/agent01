// reduce.mjs — a session's cycles to one delta value and its uncertainty (README: Method).
import { mean, sd, stderr, linfit } from './stats.mjs';

export function deltas(cycles) {
  const std = cycles.filter((c) => c.kind === 'std');
  const fit = linfit(std.map((c) => c.t), std.map((c) => c.b / c.a));
  return cycles.filter((c) => c.kind === 'sample').map((c) => (c.b / c.a / (fit.a + fit.b * c.t) - 1) * 1000);
}

// Outlier rejection: drop points far from the mean until none are left to drop.
export function clean(ds, k = 2) {
  let kept = ds;
  for (;;) {
    const m = mean(kept), s = sd(kept);
    const next = kept.filter((d) => Math.abs(d - m) <= k * s);
    if (next.length === kept.length) return kept;
    kept = next;
  }
}

export function reduce(session) {
  const kept = clean(deltas(session.cycles));
  return { session: session.session, n: kept.length, delta_permil: mean(kept), se_permil: stderr(kept) };
}
