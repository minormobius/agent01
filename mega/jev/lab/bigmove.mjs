// bigmove.mjs — the only question that matters if the P&L lives in a handful
// of windows: when a big move happened, were you on it or under it?
//
// Average return is the wrong scoreboard for that. Measured on 3.5 days of
// minute candles, the biggest 5% of hour-long windows carry 24% of all the
// movement, and a p95 hour-move pays 8.6x what a round trip costs AT ANY
// LEVERAGE — so the drag is affordable if, and only if, the allocation is
// right when it counts. These are the figures that say whether it was.
//
// Two numbers, both of which a flattering version of this page would omit:
//
//   CAPTURE   the signed move earned during big windows, as a share of the
//             move that was available. 100% means fully allocated the right
//             way; 0% means flat through it; negative means offsides.
//   OFFSIDES  how often the position was pointing the wrong way when a big
//             move arrived. This is the one that ruins a leveraged account,
//             and it is reported separately because a good capture average
//             can hide a few catastrophic wrong-way events.

export const DEFAULTS = { horizon: 60, topPct: 0.2, minWindows: 8 };

/**
 * @param {Array<{t:number, mid:number}>} ticks  the run's own price series
 * @param {Array<{t:number, pos:number}>} decisions  book.history
 *
 * Windows are NON-OVERLAPPING. Overlapping ones share almost all of their
 * data and inflate n enormously: an earlier pass of this analysis had a
 * momentum rule at 75.7% accuracy over 4,844 overlapping windows, which
 * collapsed to 4 independent windows once the stride was fixed. Any accuracy
 * quoted off overlapping windows is one event counted hundreds of times.
 */
export function captureStats(ticks, decisions, opts = {}) {
  const { horizon, topPct, minWindows } = { ...DEFAULTS, ...opts };
  if (!ticks?.length || ticks.length < horizon * 2) return null;

  // Position at any moment: the last decision at or before it.
  const hist = [...(decisions || [])].sort((a, b) => a.t - b.t);
  const posAt = (t) => {
    let p = 0;
    for (const d of hist) { if (d.t > t) break; p = d.pos; }
    return p;
  };

  const windows = [];
  for (let i = 0; i + horizon < ticks.length; i += horizon) {
    const a = ticks[i], b = ticks[i + horizon];
    if (!(a.mid > 0) || !(b.mid > 0)) continue;
    windows.push({ t: a.t, moveBps: (b.mid - a.mid) / a.mid * 1e4, pos: posAt(a.t) });
  }
  if (windows.length < minWindows) return { windows: windows.length, enough: false };

  const sorted = [...windows].map((w) => Math.abs(w.moveBps)).sort((x, y) => x - y);
  const cut = sorted[Math.floor(sorted.length * (1 - topPct))];
  const big = windows.filter((w) => Math.abs(w.moveBps) >= cut && cut > 0);
  if (!big.length) return { windows: windows.length, enough: false };

  const available = big.reduce((s, w) => s + Math.abs(w.moveBps), 0);
  // Earned is signed by the position AND its size, so being half-sized the
  // right way captures half. Being flat captures nothing, which is the point.
  const earned = big.reduce((s, w) => s + w.pos * w.moveBps, 0);
  const engaged = big.filter((w) => w.pos !== 0);
  const offsides = engaged.filter((w) => Math.sign(w.pos) !== Math.sign(w.moveBps));

  return {
    enough: true,
    windows: windows.length,
    horizon,
    big: big.length,
    cutBps: cut,
    availableBps: available,
    earnedBps: earned,
    // Capture can exceed 100% with leverage, and can go negative. Both are
    // real and neither is clipped.
    capture: available > 0 ? earned / available : 0,
    flatThrough: big.length - engaged.length,
    offsides: offsides.length,
    offsidesRate: engaged.length ? offsides.length / engaged.length : 0,
    worstOffsideBps: offsides.length ? Math.max(...offsides.map((w) => Math.abs(w.moveBps))) : 0,
    // The comparison that decides whether any of this was worth doing.
    shareOfAllMovement: (() => {
      const total = windows.reduce((s, w) => s + Math.abs(w.moveBps), 0);
      return total > 0 ? available / total : 0;
    })(),
  };
}

/** One line for the page, refusing to speak when the sample cannot carry it. */
export function describe(s) {
  if (!s) return 'not enough price history yet.';
  if (!s.enough) return `${s.windows} non-overlapping windows so far — too few to rank.`;
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  return `${s.big} of ${s.windows} windows moved more than ${s.cutBps.toFixed(0)}bp and carried ` +
    `${pct(s.shareOfAllMovement)} of all the movement. Captured ${pct(s.capture)} of it; ` +
    `flat through ${s.flatThrough}; offsides on ${s.offsides} (${pct(s.offsidesRate)} of the ones it was in).`;
}
