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

  // ---- COVERAGE: never describe a window the tape does not reach ----------
  //
  // This used to compute all three windows from whatever was in the ring. At
  // the first decision — 21 ticks — that produced a document which said, with
  // a straight face, "last 300s return 5.553bp" (it was the 20-second return,
  // byte-identical to the 60s line printed above it), "position in the last
  // 300s range 1.00", and "below the 300s high by 0.0bp, set 0s ago" — the
  // last one structurally forced, because the maximum of a 20-tick buffer
  // whose newest tick is the highest can only ever be now.
  //
  // Three assertions, none of them measured, all leaning the same way, handed
  // to a model whose entire documented failure mode on this surface is being
  // given a badly-shaped input. A window is now reported only when the tape
  // actually covers it, and the document says how much tape there is.
  const covered = windows.filter((w) => t.length >= w);
  if (!covered.length) return null;
  const longW = covered[covered.length - 1];

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
    // What the document is allowed to talk about, and how much tape there is.
    windows: covered,
    longWindow: longW,
    tapeLen: t.length,
    warm: covered.length === windows.length,
  };

  for (const w of covered) {
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
  m.volRatio = m[`w${longW}_volBps`] > 1e-9 ? m[`w${covered[0]}_volBps`] / m[`w${longW}_volBps`] : 1;

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
  // A mean over a window the tape does not reach is the mean of the whole
  // tape wearing that window's label, so it is null rather than a number.
  for (const w of windows) m[`sma${w}`] = covered.includes(w) ? sma(w) : null;

  // Band position: how many standard deviations the current price sits from
  // its own mean, over each window. This is the Bollinger question asked as
  // a number — +2 means stretched high, -2 stretched low, 0 at the mean.
  for (const w of [60, 300]) {
    if (!covered.includes(w)) { m[`z${w}`] = null; continue; }
    const win = last(px, w);
    const sd_ = sd(win), mu = mean(win);
    m[`z${w}`] = sd_ > 1e-9 ? (now.mid - mu) / sd_ : 0;
  }

  // The fast/slow cross, in basis points and in units of the slow window's
  // own noise — a 3bp gap means one thing in a quiet tape and another in a
  // wild one, and only the second form is comparable across regimes.
  // Both null unless BOTH means exist. A fallback of 0 would have been just
  // as wrong in the other direction — "the fast and slow means are exactly
  // level" is a claim, not an absence — and letting a null through the
  // arithmetic printed a 4485.77 sd cross from a tape 21 seconds long.
  //
  // NULL means "the tape does not reach the 60s window". ZERO means "it does,
  // and the two means are level". Collapsing those two would make a dead-flat
  // tape — where every rule correctly has no view — indistinguishable from a
  // page that started four seconds ago.
  const haveCross = Number.isFinite(m.sma15) && Number.isFinite(m.sma60);
  const sd60 = sd(last(px, 60));
  m.maSpreadBps = !haveCross ? null : (m.sma60 > 0 ? (m.sma15 - m.sma60) / m.sma60 * 1e4 : 0);
  m.maSpreadZ = !haveCross ? null : (sd60 > 1e-9 ? (m.sma15 - m.sma60) / sd60 : 0);

  // Where in the recent range, 0 = the low of the window, 1 = the high.
  // Scale-free and instantly legible in a way a raw price is not.
  for (const w of [60, 300]) {
    if (!covered.includes(w)) { m[`rangePos${w}`] = null; continue; }
    const win = last(px, w);
    const lo = Math.min(...win), hi = Math.max(...win);
    m[`rangePos${w}`] = hi - lo > 1e-9 ? (now.mid - lo) / (hi - lo) : 0.5;
  }

  // How far the tape has come off its own extremes, and how long ago those
  // were set. A high made four minutes ago is a different fact from one made
  // four seconds ago, and nothing above carried the difference.
  // Against the longest window the tape actually covers, not against 300
  // regardless. The age of an extreme is bounded by the buffer that holds it,
  // so quoting a five-minute age off twenty seconds of tape is not a slightly
  // wrong number — it is a number that cannot exceed twenty.
  const wl = last(px, longW);
  const hiL = Math.max(...wl), loL = Math.min(...wl);
  m.offHighBps = hiL > 0 ? (now.mid - hiL) / hiL * 1e4 : 0;
  m.offLowBps = loL > 0 ? (now.mid - loL) / loL * 1e4 : 0;
  m.secsSinceHigh = wl.length - 1 - wl.lastIndexOf(hiL);
  m.secsSinceLow = wl.length - 1 - wl.lastIndexOf(loL);

  // Where the CURRENT short-window volatility sits inside the distribution
  // of short-window volatilities over the long window. A ratio says "1.2x";
  // a percentile says "calmer than 70% of the last five minutes", which is
  // the form a judgement can act on.
  const vols = [];
  for (let i = 15; i < t.length; i += 5) vols.push(sd(returnsBps(t.slice(i - 15, i))));
  // 0.5 used to be the fallback here, which is a measurement-shaped way of
  // saying "no idea": exactly average, printed as if it had been observed.
  // It is null now, and the document leaves the line out.
  m.volPctile = vols.length > 3
    ? vols.filter((v) => v < m[`w${covered[0]}_volBps`]).length / vols.length : null;

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
/**
 * `unit` labels the windows. The maths is identical whatever a "tick" is, so
 * the same code serves one-second ticks and one-minute candles — but the
 * document must not say "last 15s" when it means fifteen minutes, or the
 * judgement is being handed a lie about its own timescale.
 */
export function stateDoc(m, pos, book, { levels = true, oracles = '', journal = '', unit = 's', windows = null } = {}) {
  const n = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  // Default to the windows `compute` actually filled. A caller may still pass
  // its own — the minute-bar harness does — but it may not conjure a window
  // out of a tape that does not reach it.
  const all = windows || m.windows || [15, 60, 300];
  const W = all.filter((w) => Number.isFinite(m[`w${w}_retBps`]));
  const longW = m.longWindow ?? W[W.length - 1];
  const shortW = W[0];
  const lines = [
    'BTC PERPETUAL, Hyperliquid. Live one-second book. All figures are already',
    'computed from the tick stream; bp = basis points (0.01%).',
    '',
    `mid ${n(m.mid, 1)}   mark-vs-oracle ${n(m.markVsOracleBps)}bp   spread ${n(m.spreadBps)}bp`,
    `funding ${n(m.fundingBps, 3)}bp   premium ${n(m.premiumBps)}bp   open interest ${n(m.openInterest, 0)}`,
    `top-of-book size ratio (bid/ask) ${n(m.bookImbalance)}`,
    '',
    // How much tape there is, stated before any window is described. Without
    // this line a short document reads like a calm market rather than like a
    // page that has just started.
    Number.isFinite(m.tapeLen)
      ? `TAPE SO FAR ${m.tapeLen}${unit}` + (m.warm === false
        ? `. Windows longer than ${longW}${unit} are not covered yet and are left out below — nothing here describes them.`
        : '.')
      : null,
    '',
    'RATES — how fast, how far, which way.',
    'WINDOW      return   volatility   range   up-share   efficiency   taker-skew',
    ...W.map((w) =>
      `last ${String(w).padStart(3)}${unit}  ${n(m[`w${w}_retBps`]).padStart(7)}bp ${n(m[`w${w}_volBps`]).padStart(9)}bp ` +
      `${n(m[`w${w}_rangeBps`]).padStart(7)}bp ${n(m[`w${w}_upFrac`]).padStart(8)} ${n(m[`w${w}_efficiency`]).padStart(11)} ` +
      `${n(m[`w${w}_takerSkew`]).padStart(11)}`),
    '',
    // ONE volatility level, not two. A ratio and a percentile say the same
    // thing differently, and shipping both made the "is volatility high?"
    // probe go 93.8% -> 81.3%: two views of one fact is reconciliation work
    // handed back. The percentile is the more legible of the two, so the
    // ratio rides along on the same line rather than in a block of its own.
    // Omitted rather than defaulted when there are too few samples to rank
    // against: a printed "50th percentile" is a guess wearing a measurement's
    // clothes, and this whole surface exists to not do that.
    Number.isFinite(m.volPctile)
      ? `volatility right now sits at the ${n(m.volPctile * 100, 0)}th percentile of the last ${longW}${unit} ` +
        `(100 = the most volatile it has been, 0 = the calmest), which is ${n(m.volRatio)}x the ${longW}${unit} average`
      : null,
  ];

  if (levels) lines.push(
    '',
    'LEVELS — where the price actually is. Rates alone cannot tell selling into',
    `a ${longW}${unit} low from selling into a ${longW}${unit} high.`,
    `mean price   ${W.map((w) => `last ${w}${unit} ${n(m[`sma${w}`], 1)}`).join('   ')}`,
    ...[60, 300].filter((w) => Number.isFinite(m[`z${w}`]))
      .map((w) => `price vs its own ${w}${unit} mean  ${n(m[`z${w}`])} standard deviations`),
    Number.isFinite(m.maSpreadBps)
      ? `${shortW}${unit} mean minus ${W[1]}${unit} mean    ${n(m.maSpreadBps)}bp  (${n(m.maSpreadZ)} sd of the ${W[1]}${unit} window)`
      : null,
    ...[60, 300].filter((w) => Number.isFinite(m[`rangePos${w}`]))
      .map((w) => `position in the last ${w}${unit} range  ${n(m[`rangePos${w}`])}   (0 = the low, 1 = the high)`),
    `below the ${longW}${unit} high by ${n(Math.abs(m.offHighBps))}bp, set ${n(m.secsSinceHigh, 0)}${unit} ago`,
    `above the ${longW}${unit} low by  ${n(Math.abs(m.offLowBps))}bp, set ${n(m.secsSinceLow, 0)}${unit} ago`,
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
  // A null is a line that had nothing true to say, so it says nothing.
  return lines.filter((l) => l !== null).join('\n');
}
