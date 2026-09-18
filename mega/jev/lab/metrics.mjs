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
  return m;
}

/** A compact, labelled state document. Numbers only — no price series. */
export function stateDoc(m, pos, book) {
  const n = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  return [
    'BTC PERPETUAL, Hyperliquid. Live one-second book. All figures are already',
    'computed from the tick stream; bp = basis points (0.01%).',
    '',
    `mid ${n(m.mid, 1)}   mark-vs-oracle ${n(m.markVsOracleBps)}bp   spread ${n(m.spreadBps)}bp`,
    `funding ${n(m.fundingBps, 3)}bp   premium ${n(m.premiumBps)}bp   open interest ${n(m.openInterest, 0)}`,
    `top-of-book size ratio (bid/ask) ${n(m.bookImbalance)}`,
    '',
    'WINDOW      return   volatility   range   up-share   efficiency   taker-skew',
    ...[15, 60, 300].map((w) =>
      `last ${String(w).padStart(3)}s  ${n(m[`w${w}_retBps`]).padStart(7)}bp ${n(m[`w${w}_volBps`]).padStart(9)}bp ` +
      `${n(m[`w${w}_rangeBps`]).padStart(7)}bp ${n(m[`w${w}_upFrac`]).padStart(8)} ${n(m[`w${w}_efficiency`]).padStart(11)} ` +
      `${n(m[`w${w}_takerSkew`]).padStart(11)}`),
    '',
    `short-vs-long volatility ratio ${n(m.volRatio)}`,
    '',
    'EFFICIENCY is |net move| / total distance travelled: near 1 means one',
    'direction held, near 0 means churn that went nowhere. TAKER-SKEW is signed',
    'aggressor volume: +1 all buying into the offer, -1 all selling into the bid.',
    '',
    'CURRENT PAPER POSITION',
    `holding ${pos > 0 ? 'LONG' : pos < 0 ? 'SHORT' : 'FLAT'}`,
    `paper return so far ${n((book.jev.equity - 1) * 100)}%  over ${book.decisions} decisions`,
    `round-trip cost of changing position right now: about ${n(m.spreadBps / 2 + 4.5)}bp`,
  ].join('\n');
}
