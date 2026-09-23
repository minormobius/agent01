// candles.mjs — one-second ticks folded into OHLC buckets.
//
// Honest about what these are: the wick is the range of the one-second MID
// samples in the bucket, not every print that crossed in it. A real exchange
// candle would be wider. The page says so, because a chart that looks like
// an exchange candle and isn't is the kind of small lie that makes the rest
// of the numbers less believable.
//
// Buckets are aligned to absolute time (floor(t / size) * size) rather than
// to the first tick seen, so a candle does not slide sideways as ticks
// arrive and the same tape always produces the same candles.

export const BUCKET_MS = 5000;

export function toCandles(ticks, bucketMs = BUCKET_MS) {
  if (!Array.isArray(ticks) || !ticks.length || !(bucketMs > 0)) return [];
  const out = [];
  let cur = null;
  for (const k of ticks) {
    const px = k.mid;
    if (!Number.isFinite(px) || px <= 0) continue;
    const t0 = Math.floor(k.t / bucketMs) * bucketMs;
    if (!cur || cur.t0 !== t0) {
      cur = { t0, t1: t0 + bucketMs, o: px, h: px, l: px, c: px, n: 0 };
      out.push(cur);
    }
    cur.h = Math.max(cur.h, px);
    cur.l = Math.min(cur.l, px);
    cur.c = px;
    cur.n++;
  }
  return out;
}

/** Up candles are hollow, down candles filled — the encoding that predates colour. */
export const isUp = (c) => c.c >= c.o;

/** The extent a price axis must cover for these candles. */
export function extent(candles) {
  if (!candles.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const c of candles) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
  return lo <= hi ? { lo, hi } : null;
}
