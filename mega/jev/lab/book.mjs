// book.mjs — the paper book. No orders, no keys, no exchange account: this
// simulates a position against a live price and charges it for the privilege.
//
// Everything that makes a trading demo dishonest is a missing line in this
// file, so they are all here and none of them are optional:
//
//   * costs are charged on every size change, at a taker fee plus half the
//     observed spread. A strategy that flips every tick should bleed, and
//     here it does.
//   * two baselines run on the identical tick stream. Buy-and-hold is the
//     one people quote; the RANDOM baseline, forced to trade exactly as
//     often, is the one that actually tests whether the decisions carry
//     information. Beating buy-and-hold in a downtrend is not a result.
//   * the run counter is persisted by the caller and displayed. Every
//     configuration you try is a trial, and the measured lesson (127 metric
//     subsets against a no-signal target: best in-sample 69.7%, out of
//     sample 51.1%, rank correlation -0.112) is that picking the best run
//     out of many is not better than picking at random.

export const ACTIONS = ['buy', 'hold', 'sell', 'bail'];

// The exposure ladder. Discrete levels are what Jev's `score` primitive
// takes, and the type is what enforces the ceiling — it can never return a
// level off the end, so it can never ask for 50x. The VALUE it returns is
// the expectation over the distribution across those levels, so the output
// is continuous: measured on six real states the ladder produced 0.17, 0.63,
// 0.86, 0.90, 0.94 and 1.28 where a `choice` over the identical quanta
// collapsed to the extreme -3x on five of the six. Continuum and quanta are
// not a choice here; score is both.
export const LADDER = [-3, -2, -1, 0, 1, 2, 3];

export const DEFAULT_RESPONSE = {
  // Conviction inside this band of the middle rung is no view at all.
  deadZone: 0.25,
  // And once there IS a view, the smallest position allowed, as a fraction
  // of the cap. This is NOT a fitted number: a round trip costs about 10bp
  // of the size traded, so a 0.2x position needs a 50bp move just to pay for
  // itself. Positions too small to cover their own round trip are a way of
  // paying to be almost flat.
  floor: 0.6,
};

/**
 * Ladder score (0 … LADDER.length-1) → signed leverage, clamped to cap.
 *
 * With `deadZone: 0, floor: 0` this is the plain linear interpolation across
 * the rungs, which is what shipped first and is kept as the control.
 */
export function exposureFromScore(score, cap = 3, response = {}) {
  if (!Number.isFinite(score)) return 0;
  const { deadZone, floor } = { ...DEFAULT_RESPONSE, ...response };
  const mid = (LADDER.length - 1) / 2;
  const i = Math.min(LADDER.length - 1, Math.max(0, score));
  const u = (i - mid) / mid;                       // -1 … +1
  const r2 = (x) => Math.round(Math.max(-cap, Math.min(cap, x)) * 100) / 100;
  if (!deadZone && !floor) {
    const lo = Math.floor(i), hi = Math.min(LADDER.length - 1, lo + 1);
    return r2(LADDER[lo] + (LADDER[hi] - LADDER[lo]) * (i - lo));
  }
  // NO VIEW is not the same as a view that the right position is flat, and
  // conflating them was a real bug: mapping the dead zone to 0 forced a full
  // exit every time conviction dipped, and exits are exempt from the
  // deadband, so the setting meant to cut turnover doubled it. `null` means
  // "nothing new to say" and the caller keeps what it has. Genuinely wanting
  // to be flat is the middle rung ARRIVED at from outside the zone, or bail.
  if (Math.abs(u) < deadZone) return null;
  const past = (Math.abs(u) - deadZone) / Math.max(1e-9, 1 - deadZone);
  return r2(Math.sign(u) * cap * (floor + (1 - floor) * Math.min(1, past)));
}

/**
 * The leverage analogue of the latch. Every resize costs |delta| x (fee +
 * half spread), so a score wobbling 1.4 → 1.6 → 1.3 would bleed on nothing.
 * Move only when the target is far enough away to be worth the trip — and
 * always when the target is flat, because getting out stays cheap.
 */
export function applyDeadband(target, current, band = 0.35) {
  if (target === 0) return 0;
  return Math.abs(target - current) < band ? current : target;
}

/** buy → long, sell → short, bail → flat, hold → whatever we already were. */
export function targetPosition(action, current) {
  switch (action) {
    case 'buy': return 1;
    case 'sell': return -1;
    case 'bail': return 0;
    case 'hold': return current;
    default: return current;
  }
}

export const DEFAULT_RISK = {
  // Leverage introduces ruin, and a leveraged demo that cannot be ruined is
  // lying. A leg is liquidated when its equity falls to this fraction of its
  // starting value; it is forced flat, charged the exit, and takes no
  // further position for the rest of the run.
  maintenance: 0.0,
  cap: 3,
};

export const DEFAULT_COSTS = {
  // Hyperliquid taker fee, in basis points of notional. Configurable because
  // it is a real number that changes, not a constant of nature.
  feeBps: 4.5,
  // Crossing the book costs half the spread. Measured per tick from the
  // live book rather than assumed, so a thin market is charged for.
  payHalfSpread: true,
  // Extra pessimism, in bps, for the slippage a 1-second paper fill cannot
  // observe. Zero is a choice; it is not a safe one.
  slippageBps: 0,
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function newBook({ seed = 1, costs = {}, risk = {} } = {}) {
  const c = { ...DEFAULT_COSTS, ...costs };
  const rk = { ...DEFAULT_RISK, ...risk };
  // `gross` is the same leg's equity with every cost waived — the same
  // trades at the same moments, free. net minus gross IS the drag, exactly,
  // rather than inferred from a fee times a turnover.
  const mk = () => ({ pos: 0, equity: 1, gross: 1, turnover: 0, fills: 0, costPaid: 0,
    peak: 1, maxDD: 0, liquidated: false });
  return {
    costs: c,
    risk: rk,
    rnd: mulberry(seed),
    lastPx: null,
    ticks: 0,
    decisions: 0,
    jev: mk(),
    hold: mk(),
    rand: mk(),
    // Doing nothing. The reference that any turnover-reducing change has to
    // beat before it counts as an improvement: when the gross edge is near
    // zero, trading less always moves toward flat, and "closer to zero" is
    // not the same thing as "better".
    flat: mk(),
    // Stream B: thirty raw floats in, a forecast out, max leverage slammed
    // in that direction. Its own leg so the two streams are compared rather
    // than blended.
    streamb: mk(),
    // One leg per deterministic rule, plus the two mechanical controls that
    // matter once Jev has SEEN the rules: following whichever is ahead on
    // past performance, and averaging what they all say. Beating the rules
    // he was shown is not evidence; beating the mechanical way of combining
    // them is.
    oracles: {},
    best: mk(),
    majority: mk(),
    mkLeg: mk,
    history: [],          // one row per decision, for the chart and the table
    actions: { buy: 0, hold: 0, sell: 0, bail: 0 },
  };
}

/** Cost of moving from one position to another, as a fraction of equity. */
export function changeCost(book, from, to, spreadBps) {
  const delta = Math.abs(to - from);
  if (!delta) return 0;
  const half = book.costs.payHalfSpread ? Math.max(0, spreadBps || 0) / 2 : 0;
  return delta * (book.costs.feeBps + half + book.costs.slippageBps) / 1e4;
}

function applyTo(leg, book, ret, want, spreadBps) {
  // Mark to market at the OLD position — you earn the move you were holding
  // through, not the one you are about to take.
  leg.equity *= 1 + leg.pos * ret;
  leg.gross *= 1 + leg.pos * ret;

  // Ruin, modelled rather than assumed away. At 3x a 33% adverse move is the
  // whole account; the multiplier above can go negative, and an equity curve
  // that goes negative and keeps compounding is nonsense.
  if (!leg.liquidated && leg.equity <= book.risk.maintenance) {
    leg.equity = Math.max(0, book.risk.maintenance);
    leg.liquidated = true;
    leg.pos = 0;
    leg.fills++;
  }
  if (leg.liquidated) { leg.pos = 0; return; }

  leg.peak = Math.max(leg.peak, leg.equity);
  leg.maxDD = Math.max(leg.maxDD, leg.peak > 0 ? 1 - leg.equity / leg.peak : 0);

  if (want !== leg.pos) {
    const cost = changeCost(book, leg.pos, want, spreadBps);
    leg.equity *= 1 - cost;
    leg.costPaid += cost;
    leg.turnover += Math.abs(want - leg.pos);
    leg.fills++;
    leg.pos = want;
  }
}

/**
 * Advance one tick. `action` is null on ticks where no decision was taken —
 * the price still moves and the position still earns it.
 */
const clampCap = (book, x) => Math.max(-book.risk.cap, Math.min(book.risk.cap, x));

export function step(book, { px, spreadBps = 0, action = null, exposure = null, t = Date.now(), meta = {},
  oracleTargets = null, bestTarget = null, majorityTarget = null, streambTarget = null }) {
  if (!Number.isFinite(px) || px <= 0) return null;
  const ret = book.lastPx == null ? 0 : (px - book.lastPx) / book.lastPx;
  book.lastPx = px;
  book.ticks++;

  const decided = action != null;
  if (decided) {
    book.decisions++;
    book.actions[action] = (book.actions[action] || 0) + 1;
  }

  // `exposure` (a number) wins over `action` (a name) when both are given:
  // the ladder is the real instruction and the name is for the log.
  const wantJev = !decided ? book.jev.pos
    : Number.isFinite(exposure) ? Math.max(-book.risk.cap, Math.min(book.risk.cap, exposure))
    : targetPosition(action, book.jev.pos);
  // The control trades exactly as often as Jev does AND on the same ladder,
  // so the comparison is leverage-matched — otherwise it would measure size
  // rather than decisions.
  const wantRand = decided
    ? (Number.isFinite(exposure)
        ? LADDER[Math.floor(book.rnd() * LADDER.length)] * (book.risk.cap / 3)
        : targetPosition(ACTIONS[Math.floor(book.rnd() * ACTIONS.length)], book.rand.pos))
    : book.rand.pos;
  // Buy-and-hold is long at 1x from the first tick and never moves again. It
  // stays UNLEVERED deliberately: it is the reference, not a competitor, and
  // levering it would just be a second strategy nobody chose.
  const wantHold = 1;

  applyTo(book.jev, book, ret, wantJev, spreadBps);
  applyTo(book.rand, book, ret, wantRand, spreadBps);
  applyTo(book.hold, book, ret, wantHold, spreadBps);
  applyTo(book.flat, book, ret, 0, spreadBps);
  applyTo(book.streamb, book, ret,
    decided && Number.isFinite(streambTarget) ? clampCap(book, streambTarget) : book.streamb.pos, spreadBps);

  // The rules trade on exactly the same ticks, at exactly the same costs, and
  // only on decision ticks — so they are not quietly given a finer clock
  // than the thing they are the control for.
  for (const [id, target] of Object.entries(oracleTargets || {})) {
    if (!book.oracles[id]) book.oracles[id] = book.mkLeg();
    const leg = book.oracles[id];
    applyTo(leg, book, ret, decided ? clampCap(book, target) : leg.pos, spreadBps);
  }
  applyTo(book.best, book, ret,
    decided && Number.isFinite(bestTarget) ? clampCap(book, bestTarget) : book.best.pos, spreadBps);
  applyTo(book.majority, book, ret,
    decided && Number.isFinite(majorityTarget) ? clampCap(book, majorityTarget) : book.majority.pos, spreadBps);

  const row = {
    t, px, ret, action, spreadBps,
    pos: book.jev.pos,
    liquidated: book.jev.liquidated,
    jev: book.jev.equity, hold: book.hold.equity, rand: book.rand.equity,
    best: book.best.equity, majority: book.majority.equity, streamb: book.streamb.equity,
    ...meta,
  };
  if (decided) book.history.push(row);
  return row;
}

/** Percentage return of a leg, from its starting index of 1. */
export const pct = (leg) => (leg.equity - 1) * 100;

/**
 * What the run is worth saying out loud. Deliberately includes the things
 * that make a good-looking curve stop looking good.
 */
export function summary(book) {
  const n = book.history.length;
  const edgeVsHold = pct(book.jev) - pct(book.hold);
  const edgeVsRand = pct(book.jev) - pct(book.rand);
  const edgeVsMajority = pct(book.jev) - pct(book.majority);
  const edgeVsBest = pct(book.jev) - pct(book.best);

  // Per-decision standard error of the Jev-minus-random difference, from the
  // realised per-decision differences. Without this, "+0.4%" means nothing.
  const tAgainst = (key) => {
    const d = [];
    for (let i = 1; i < book.history.length; i++) {
      const a = book.history[i], b = book.history[i - 1];
      if (!Number.isFinite(a[key]) || !Number.isFinite(b[key]) || b[key] === 0) continue;
      d.push((a.jev / b.jev - 1) - (a[key] / b[key] - 1));
    }
    if (d.length < 2) return { t: 0, n: d.length };
    const mu = d.reduce((s, x) => s + x, 0) / d.length;
    const sd_ = Math.sqrt(d.reduce((s, x) => s + (x - mu) ** 2, 0) / (d.length - 1));
    const se = sd_ / Math.sqrt(d.length);
    return { t: se > 0 ? mu / se : 0, n: d.length };
  };
  const vsRand = tAgainst('rand');
  // Once Jev has been SHOWN the rules, beating them is not independent
  // evidence — he could be copying the best one. The sharp test is whether
  // his choosing beats the mechanical way of combining them, so the verdict
  // is read off THIS one and the random control becomes a sanity floor.
  const vsMajority = tAgainst('majority');
  const diffs = { length: vsRand.n };
  const tStat = vsRand.t;

  return {
    ticks: book.ticks, decisions: n,
    jev: pct(book.jev), hold: pct(book.hold), rand: pct(book.rand),
    edgeVsHold, edgeVsRand, edgeVsMajority, edgeVsBest,
    costPaid: book.jev.costPaid * 100,
    // The decomposition that found the problem: the same trades run free.
    gross: (book.jev.gross - 1) * 100,
    drag: (book.jev.gross - book.jev.equity) * 100,
    dragShareOfLoss: book.jev.equity < 1
      ? (book.jev.gross - book.jev.equity) / (1 - book.jev.equity) * 100 : null,
    fills: book.jev.fills,
    position: book.jev.pos,
    // The counterweight to a leveraged return. A 3x curve that finishes up
    // says nothing on its own; what it went through on the way is the part
    // leverage changes, so it is reported beside the return, not below it.
    maxDD: book.jev.maxDD * 100,
    holdMaxDD: book.hold.maxDD * 100,
    randMaxDD: book.rand.maxDD * 100,
    liquidated: book.jev.liquidated,
    grossExposure: Math.abs(book.jev.pos),
    best: pct(book.best), majority: pct(book.majority), streamb: pct(book.streamb),
    oracles: Object.fromEntries(Object.entries(book.oracles)
      .map(([id, leg]) => [id, { pct: pct(leg), pos: leg.pos, fills: leg.fills, maxDD: leg.maxDD * 100 }])),
    // Ranked so the page can show who is actually winning, Jev included, and
    // so a claim of an edge has to survive being put next to six rules.
    ranking: [
      ['jev', book.jev], ['best oracle', book.best], ['majority', book.majority],
      ['buy & hold', book.hold], ['random', book.rand], ['do nothing', book.flat],
      ['stream B', book.streamb],
      ...Object.entries(book.oracles),
    ].map(([id, leg]) => [id, pct(leg), leg.maxDD * 100, leg.fills])
      .sort((a, b) => b[1] - a[1]),
    actions: { ...book.actions },
    tStat, tStatVsMajority: vsMajority.t, nVsMajority: vsMajority.n,
    // The honest headline. At |t| < 2 the run says nothing whatever the
    // curve looks like, and it will say so on screen.
    verdict: book.jev.liquidated ? 'liquidated — the run ended in ruin'
      : diffs.length < 30 ? 'too few decisions to say anything'
      : Math.abs(vsMajority.t) < 2
        ? (Math.abs(tStat) < 2 ? 'indistinguishable from random, let alone from the rules'
          : 'beats random, but not the rules it was shown')
      : vsMajority.t > 0 ? 'beats averaging the rules on this run — one run'
      : 'loses to simply averaging the rules it was shown',
  };
}
