// metrics.mjs — the compute-first layer.
//
// The single most load-bearing measurement in this whole surface: asked to
// SUM a column and then judge, Jev scored 62.5%; handed the sum and asked to
// judge, 100%, with high-confidence items going from 2/40 to 40/40. So the
// page never sends Jev a price series. It sends numbers computed here.
//
// Everything is derived from a ring of one-second ticks and is causal — no
// value may depend on a tick later than the one it is stamped with.

export const RING = 300;   // five minutes of one-second ticks

export function newRing(size = RING) { return { size, buf: [], }; }

export function push(ring, tick) {
  ring.buf.push(tick);
  if (ring.buf.length > ring.size) ring.buf.shift();
  return ring;
}

const last = (xs, n) => xs.slice(Math.max(0, xs.length - n));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Log returns between consecutive mids, in basis points. */
export function returnsBps(ticks) {
  const out = [];
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i - 1].mid > 0 && ticks[i].mid > 0) out.push(Math.log(ticks[i].mid / ticks[i - 1].mid) * 1e4);
  }
  return out;
}

/**
 * The whole metric set, as plain numbers. Windows are seconds.
 * Returns null until there is enough history to compute honestly, rather
 * than returning a confident-looking zero.
 */
export function compute(ring, { windows = [15, 60, 300] } = {}) {
  const t = ring.buf;
  if (t.length < 20) return null;
  const now = t[t.length - 1];

  const m = {
    mid: now.mid,
    mark: now.mark,
    // Where the mark sits against the oracle: the perp's own dislocation.
    markVsOracleBps: now.oracle > 0 ? (now.mark - now.oracle) / now.oracle * 1e4 : 0,
    spreadBps: now.spreadBps ?? 0,
    // Resting size within the top of book, as a ratio. >1 means more bid
    // than ask is showing.
    bookImbalance: now.bookImbalance ?? 1,
    fundingBps: (now.funding ?? 0) * 1e4,
    openInterest: now.openInterest ?? 0,
    premiumBps: (now.premium ?? 0) * 1e4,
    ticks: t.length,
  };

  for (const w of windows) {
    const win = last(t, w + 1);
    const r = returnsBps(win);
    const px = win.map((x) => x.mid);
    const key = `w${w}`;
    m[`${key}_retBps`] = px.length > 1 ? (px[px.length - 1] - px[0]) / px[0] * 1e4 : 0;
    m[`${key}_volBps`] = sd(r);
    m[`${key}_rangeBps`] = px.length ? (Math.max(...px) - Math.min(...px)) / px[px.length - 1] * 1e4 : 0;
    m[`${key}_upFrac`] = r.length ? r.filter((x) => x > 0).length / r.length : 0;
    // Path efficiency: |net move| / total distance travelled. High means
    // trending, low means churn. This is the regime number.
    const path = r.reduce((s, x) => s + Math.abs(x), 0);
    m[`${key}_efficiency`] = path > 1e-9 ? Math.abs(m[`${key}_retBps`]) / path : 0;
    // Aggressor flow: signed taker volume over the window, as a share.
    const buys = win.reduce((s, x) => s + (x.buyVol || 0), 0);
    const sells = win.reduce((s, x) => s + (x.sellVol || 0), 0);
    m[`${key}_takerSkew`] = buys + sells > 0 ? (buys - sells) / (buys + sells) : 0;
  }

  // Volatility now against volatility over the long window — the one
  // genuinely forecastable thing measured earlier (vol clusters), and the
  // one where a one-line persistence rule BEAT Jev. It is here as context
  // for a judgement, never as a prediction to be asked for.
  m.volRatio = m.w300_volBps > 1e-9 ? m.w15_volBps / m.w300_volBps : 1;

  // ---- LEVELS -------------------------------------------------------------
  // Everything above this line is a RATE: how fast, how far, which way. None
  // of it says WHERE. Without a level, a decision cannot tell selling into a
  // five-minute low from selling into a five-minute high, which is most of
  // what a person means by reading a chart.
  //
  // These are the moving averages, the bands and the range positions —
  // arithmetic done here so the judgement does not have to do it. That is
  // the 62.5%-versus-100% finding applied: hand over the result, never the
  // inputs to a computation.
  const px = t.map((x) => x.mid);
  const sma = (w) => mean(last(px, w));
  m.sma15 = sma(15); m.sma60 = sma(60); m.sma300 = sma(300);

  // Band position: how many standard deviations the current price sits from
  // its own mean, over each window. This is the Bollinger question asked as
  // a number — +2 means stretched high, -2 stretched low, 0 at the mean.
  for (const w of [60, 300]) {
    const win = last(px, w);
    const sd_ = sd(win), mu = mean(win);
    m[`z${w}`] = sd_ > 1e-9 ? (now.mid - mu) / sd_ : 0;
  }

  // The fast/slow cross, in basis points and in units of the slow window's
  // own noise — a 3bp gap means one thing in a quiet tape and another in a
  // wild one, and only the second form is comparable across regimes.
  m.maSpreadBps = m.sma60 > 0 ? (m.sma15 - m.sma60) / m.sma60 * 1e4 : 0;
  const sd60 = sd(last(px, 60));
  m.maSpreadZ = sd60 > 1e-9 ? (m.sma15 - m.sma60) / sd60 : 0;

  // Where in the recent range, 0 = the low of the window, 1 = the high.
  // Scale-free and instantly legible in a way a raw price is not.
  for (const w of [60, 300]) {
    const win = last(px, w);
    const lo = Math.min(...win), hi = Math.max(...win);
    m[`rangePos${w}`] = hi - lo > 1e-9 ? (now.mid - lo) / (hi - lo) : 0.5;
  }

  // How far the tape has come off its own extremes, and how long ago those
  // were set. A high made four minutes ago is a different fact from one made
  // four seconds ago, and nothing above carried the difference.
  const w300 = last(px, 300);
  const hi300 = Math.max(...w300), lo300 = Math.min(...w300);
  m.offHighBps = hi300 > 0 ? (now.mid - hi300) / hi300 * 1e4 : 0;
  m.offLowBps = lo300 > 0 ? (now.mid - lo300) / lo300 * 1e4 : 0;
  const idxHi = w300.lastIndexOf(hi300), idxLo = w300.lastIndexOf(lo300);
  m.secsSinceHigh = w300.length - 1 - idxHi;
  m.secsSinceLow = w300.length - 1 - idxLo;

  // Where the CURRENT short-window volatility sits inside the distribution
  // of short-window volatilities over the long window. A ratio says "1.2x";
  // a percentile says "calmer than 70% of the last five minutes", which is
  // the form a judgement can act on.
  const vols = [];
  for (let i = 15; i < t.length; i += 5) vols.push(sd(returnsBps(t.slice(i - 15, i))));
  m.volPctile = vols.length > 3
    ? vols.filter((v) => v < m.w15_volBps).length / vols.length : 0.5;

  return m;
}

/**
 * A compact, labelled state document. Numbers only — no price series, ever.
 *
 * `levels: false` produces the pre-2026-09-18 document, which carried only
 * RATES. It is kept because it is the control the level block was measured
 * against, and a claim that more metrics helped is worth nothing without the
 * version that did not have them.
 */
export function stateDoc(m, pos, book, { levels = true, oracles = '', journal = '' } = {}) {
  const n = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const lines = [
    'BTC PERPETUAL, Hyperliquid. Live one-second book. All figures are already',
    'computed from the tick stream; bp = basis points (0.01%).',
    '',
    `mid ${n(m.mid, 1)}   mark-vs-oracle ${n(m.markVsOracleBps)}bp   spread ${n(m.spreadBps)}bp`,
    `funding ${n(m.fundingBps, 3)}bp   premium ${n(m.premiumBps)}bp   open interest ${n(m.openInterest, 0)}`,
    `top-of-book size ratio (bid/ask) ${n(m.bookImbalance)}`,
    '',
    'RATES — how fast, how far, which way.',
    'WINDOW      return   volatility   range   up-share   efficiency   taker-skew',
    ...[15, 60, 300].map((w) =>
      `last ${String(w).padStart(3)}s  ${n(m[`w${w}_retBps`]).padStart(7)}bp ${n(m[`w${w}_volBps`]).padStart(9)}bp ` +
      `${n(m[`w${w}_rangeBps`]).padStart(7)}bp ${n(m[`w${w}_upFrac`]).padStart(8)} ${n(m[`w${w}_efficiency`]).padStart(11)} ` +
      `${n(m[`w${w}_takerSkew`]).padStart(11)}`),
    '',
    // ONE volatility level, not two. A ratio and a percentile say the same
    // thing differently, and shipping both made the "is volatility high?"
    // probe go 93.8% -> 81.3%: two views of one fact is reconciliation work
    // handed back. The percentile is the more legible of the two, so the
    // ratio rides along on the same line rather than in a block of its own.
    `volatility right now sits at the ${n(m.volPctile * 100, 0)}th percentile of the last five minutes ` +
      `(100 = the most volatile it has been, 0 = the calmest), which is ${n(m.volRatio)}x the five-minute average`,
  ];

  if (levels) lines.push(
    '',
    'LEVELS — where the price actually is. Rates alone cannot tell selling into',
    'a five-minute low from selling into a five-minute high.',
    `mean price   last 15s ${n(m.sma15, 1)}   last 60s ${n(m.sma60, 1)}   last 300s ${n(m.sma300, 1)}`,
    `price vs its own 60s mean  ${n(m.z60)} standard deviations`,
    `price vs its own 300s mean ${n(m.z300)} standard deviations`,
    `15s mean minus 60s mean    ${n(m.maSpreadBps)}bp  (${n(m.maSpreadZ)} sd of the 60s window)`,
    `position in the last 60s range  ${n(m.rangePos60)}   (0 = the low, 1 = the high)`,
    `position in the last 300s range ${n(m.rangePos300)}`,
    `below the 300s high by ${n(Math.abs(m.offHighBps))}bp, set ${n(m.secsSinceHigh, 0)}s ago`,
    `above the 300s low by  ${n(Math.abs(m.offLowBps))}bp, set ${n(m.secsSinceLow, 0)}s ago`,
  );

  if (oracles) lines.push('', oracles);
  if (journal) lines.push('', journal);

  lines.push(
    '',
    'EFFICIENCY is |net move| / total distance travelled: near 1 means one',
    'direction held, near 0 means churn that went nowhere. TAKER-SKEW is signed',
    'aggressor volume: +1 all buying into the offer, -1 all selling into the bid.',
    'A STANDARD DEVIATION above is that window\'s own, so the figures stay',
    'comparable between a quiet tape and a wild one.',
    '',
    'CURRENT PAPER POSITION',
    `holding ${pos > 0 ? `LONG ${n(pos)}x` : pos < 0 ? `SHORT ${n(Math.abs(pos))}x` : 'FLAT'}`,
    `paper return so far ${n((book.jev.equity - 1) * 100)}%  over ${book.decisions} decisions`,
    `round-trip cost of changing position by 1x right now: about ${n(m.spreadBps / 2 + 4.5)}bp`,
  );
  return lines.join('\n');
}
