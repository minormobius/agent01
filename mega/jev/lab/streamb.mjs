// streamb.mjs — the opposite control. Thirty floats, nothing else.
//
// Stream A hands over computed results and asks for a judgement about what
// IS. Stream B hands over thirty raw numbers with no units, no labels, no
// mention of a market, and asks what comes NEXT. It deliberately breaks
// every rule the rest of this surface obeys, which is the point: the
// contrast is the experiment.
//
// Jev cannot return a free float — the primitives are choice, score and noul
// — but `score` over an ordered ladder IS a continuous number, so the shape
// survives: thirty in, one out.
//
// Measured before it was built, so the page can say what it is:
//
//   120 windows, raw prices      51.7% directional  (±9.0)   r = -0.000
//   120 windows, returns in bp   49.2% directional  (±8.9)   r = -0.176
//   150 contiguous minutes       51.0% directional
//
// And the arithmetic that decides it regardless of accuracy: a full flip
// costs 2 x cost x size, a correct call earns the move x size, so LEVERAGE
// CANCELS and only the holding period moves the break-even. At one minute
// that break-even is 148% — not hard, impossible.

export const LEVELS = [
  'much lower than the last value in the sequence',
  'lower than the last value',
  'slightly lower than the last value',
  'about the same as the last value',
  'slightly higher than the last value',
  'higher than the last value',
  'much higher than the last value',
];
/** Bucket centres in basis points, for turning the ladder back into a number. */
export const CENTRES = [-15, -8, -3, 0, 3, 8, 15];
export const LOOKBACK = 30;

export function forecastBps(score) {
  if (!Number.isFinite(score)) return 0;
  const i = Math.max(0, Math.min(CENTRES.length - 1, score));
  const lo = Math.floor(i), hi = Math.min(CENTRES.length - 1, lo + 1);
  return Math.round((CENTRES[lo] + (CENTRES[hi] - CENTRES[lo]) * (i - lo)) * 100) / 100;
}

/** Closes of the last `n` buckets of `bucketMs`, oldest first. Nothing else. */
export function closes(ticks, bucketMs, n = LOOKBACK) {
  const out = [];
  let cur = null;
  for (const k of ticks) {
    if (!(k.mid > 0)) continue;
    const t0 = Math.floor(k.t / bucketMs) * bucketMs;
    if (!cur || cur.t0 !== t0) { cur = { t0, c: k.mid }; out.push(cur); }
    cur.c = k.mid;
  }
  return out.slice(-n).map((x) => x.c);
}

/** The whole state document. Thirty numbers, one per line. That is all. */
export const stateFrom = (cs) => cs.map((x) => x.toFixed(1)).join('\n');

export const QUESTION = { next: { type: 'score',
  instructions: 'The next value in this sequence will be:', criteria: LEVELS } };

/**
 * Break-even directional accuracy for trading a forecast at this horizon.
 * `flip` true means reversing a full position (2x the size traded); false
 * means going flat and back (1x). Leverage does not appear because it
 * multiplies both sides — which is the finding, not an omission.
 */
export function breakEven({ meanAbsMoveBps, costBps = 4.7, flip = true }) {
  const m = meanAbsMoveBps;
  if (!(m > 0)) return Infinity;
  const traded = flip ? 2 : 1;
  return (traded * costBps + m) / (2 * m);
}

/** Mean |move| at a horizon, from a one-minute standard deviation. */
export const meanAbsAt = (minutes, sd1m = 6.0) => sd1m * Math.sqrt(minutes) * Math.sqrt(2 / Math.PI);

/** Slam `cap` in the forecast direction — unless the call is too small to bother. */
export function targetFrom(bps, cap, deadZoneBps = 0, current = 0) {
  if (!Number.isFinite(bps) || Math.abs(bps) < deadZoneBps) return current;
  if (bps === 0) return current;
  return Math.sign(bps) * cap;
}
