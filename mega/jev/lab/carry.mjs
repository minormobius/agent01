// carry.mjs — the funding cross-section, and the risk questions that have
// answers.
//
// WHY CARRY AND NOT DIRECTION. Everything else on this surface tried to
// predict which way price goes, and everything else failed honestly: 51.4% on
// six-hour windows, 51.7% on stream B, 31.1% on the cross-sectional predictive
// probes, the >=0.9 gate firing on nothing useful and the self-check returning
// p(have) = 0.046. Carry needs no prediction. The funding rate is PRINTED. The
// staking yield is PRINTED. The distance to liquidation is arithmetic over
// printed numbers. That is the exact shape where the same model fired the gate
// on 69.9% of questions and was right 97.1% of the time.
//
// WHAT THIS IS NOT. It does not trade, it holds no keys, and it opens nothing.
// It also is not a claim that the carry is free. Measured over 90 days of
// hourly funding, the worst peak-to-trough of collected funding was -0.016% on
// BTC and -0.247% on XMR, recovered in under three days of mean carry. Those
// numbers are small, and THAT IS THE WARNING, not the reassurance: carry is a
// short-volatility profile — steady small gains and rare large losses — and a
// 90-day window that happened to contain no crisis measures the gains and not
// the losses. The tail is not in this data. It is never in this data.
//
// Pure, dependency-free, identical in node and the browser.

/** Hyperliquid pays funding hourly. Everything here is annualised from that. */
export const HOURS_PER_YEAR = 24 * 365;
export const toAnnualPct = (hourlyRate) => hourlyRate * HOURS_PER_YEAR * 100;

/**
 * Hyperliquid's funding carries a fixed interest-rate component, so a perp
 * long pays a FLOOR of about 10.95%/yr essentially always. That is the
 * mechanism, not a market condition, and it is why the structure inverts:
 * be long via spot, be short via the perp.
 */
export const FUNDING_FLOOR_PCT = 10.95;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Everything a carry decision needs, computed from the funding history.
 *
 * `drawdown` is the one that matters and the one a flattering version would
 * omit: the worst peak-to-trough of the cumulative funding a short would have
 * collected. Mean carry is what it pays; this is what it can take back first.
 */
export function carryStats(hourlyRates, { current = null } = {}) {
  const r = hourlyRates.filter(Number.isFinite);
  if (r.length < 24) return null;
  const m = mean(r), s = sd(r);
  let cum = 0, peak = 0, dd = 0, run = 0, worstRun = 0;
  for (const x of r) {
    cum += x;
    if (cum > peak) { peak = cum; run = 0; } else { run++; worstRun = Math.max(worstRun, run); }
    dd = Math.max(dd, peak - cum);
  }
  const cur = current == null ? r[r.length - 1] : current;
  return {
    hours: r.length,
    meanPct: toAnnualPct(m),
    currentPct: toAnnualPct(cur),
    // How far the CURRENT print sits from this asset's own history, in its own
    // standard deviations. A 112%/yr print against a 33%/yr mean is not the
    // same opportunity as a steady 33%, and a single number cannot say which.
    z: s > 1e-12 ? (cur - m) / s : 0,
    negHoursPct: 100 * r.filter((x) => x < 0).length / r.length,
    drawdownPct: dd * 100,
    // UNDERWATER, not "length of the negative run" — the hours spent below the
    // previous high-water mark, which includes climbing back to it. That is
    // the number that matters to someone holding the position: a 50-hour
    // negative run that takes 100 more hours to earn back is 150 hours of
    // being behind, and calling it 50 would understate it threefold.
    underwaterHours: worstRun,
    // Days of mean carry needed to earn the worst drawdown back. Infinite when
    // the mean is not positive, which is the honest answer rather than a
    // large number.
    recoverDays: m > 0 ? (dd / m) / 24 : null,
    // Carry per unit of measured drawdown. PRE-COMPUTED on purpose: asking a
    // model to divide two numbers it was handed is the 62.5%-versus-100%
    // mistake, and this surface has made it once already.
    carryPerDrawdown: dd > 1e-9 ? toAnnualPct(m) / (dd * 100) : null,
  };
}

/** Rank the cross-section. Nothing here is a forecast; it is all a sort. */
export function rankCarry(byCoin) {
  const rows = Object.entries(byCoin)
    .filter(([, s]) => s && Number.isFinite(s.currentPct))
    .map(([coin, s]) => ({ coin, ...s }));
  if (!rows.length) return null;
  const byCurrent = [...rows].sort((a, b) => b.currentPct - a.currentPct);
  const withRatio = rows.filter((r) => Number.isFinite(r.carryPerDrawdown));
  return {
    rows: byCurrent,
    richest: byCurrent[0].coin,
    cheapest: byCurrent[byCurrent.length - 1].coin,
    bestRiskAdjusted: withRatio.length
      ? [...withRatio].sort((a, b) => b.carryPerDrawdown - a.carryPerDrawdown)[0].coin : null,
    mostStretched: [...rows].sort((a, b) => b.z - a.z)[0].coin,
    worstDrawdown: [...rows].sort((a, b) => b.drawdownPct - a.drawdownPct)[0].coin,
    spreadPct: byCurrent[0].currentPct - byCurrent[byCurrent.length - 1].currentPct,
    // Every one at the floor means the cross-section is carrying no information
    // today, which is a fact worth printing rather than hiding behind a rank.
    allAtFloor: rows.every((r) => Math.abs(r.currentPct - FUNDING_FLOOR_PCT) < 0.5),
  };
}

/**
 * A delta-neutral basis position, priced and risk-measured.
 *
 * `spotYieldPct` is what the long leg earns while held (an LST's staking
 * yield, zero for plain spot). `marginRatio` is the short leg's equity over
 * its notional, so 1/leverage.
 */
export function positionRisk({ fundingPct, spotYieldPct = 0, leverage = 1,
  maintenanceMarginPct = 2, roundTripBps = 10 }) {
  if (!(leverage > 0)) return null;
  const marginPct = 100 / leverage;
  // How far the SHORT leg can move against you before maintenance is breached.
  // A delta-neutral book is still liquidatable: the legs sit on different
  // venues and the perp margin does not know the spot leg exists.
  const moveToLiquidationPct = Math.max(0, marginPct - maintenanceMarginPct);
  const carryPct = (fundingPct + spotYieldPct) * leverage;
  return {
    leverage, marginPct, moveToLiquidationPct,
    grossCarryPct: fundingPct + spotYieldPct,
    leveredCarryPct: carryPct,
    // Days of carry the round trip costs, at this leverage.
    breakEvenDays: carryPct > 0 ? (roundTripBps / 100) / (carryPct / 365) : null,
    // The number that decides it: a rally of this size wipes the position out,
    // and it is what the levered carry is actually being paid for.
    ruinMovePct: moveToLiquidationPct,
  };
}

/** The state document. Numbers only, already computed. */
export function carryDoc(rank, { position = null, spot = null } = {}) {
  const n = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const lines = [
    'PERPETUAL FUNDING ACROSS ONE VENUE. A SHORT receives funding when it is',
    'positive; a LONG pays it. All figures already computed; %/yr throughout.',
    '',
    `Hyperliquid carries a fixed interest-rate component, so funding sits at a floor of about ${FUNDING_FLOOR_PCT}%/yr.`,
    'A perp long pays that floor essentially always, which is why the cheap way to be long is spot.',
    '',
    `${'asset'.padEnd(7)}${'funding now'.padStart(13)}${'90d mean'.padStart(10)}${'z vs own'.padStart(10)}` +
      `${'worst dd'.padStart(10)}${'recover'.padStart(9)}${'neg hrs'.padStart(9)}${'carry/dd'.padStart(10)}`,
    ...rank.rows.map((r) =>
      r.coin.padEnd(7) + `${n(r.currentPct, 1)}%`.padStart(13) + `${n(r.meanPct, 1)}%`.padStart(10) +
      n(r.z, 2).padStart(10) + `${n(r.drawdownPct, 3)}%`.padStart(10) +
      (r.recoverDays == null ? '—' : `${n(r.recoverDays, 1)}d`).padStart(9) +
      `${n(r.negHoursPct, 1)}%`.padStart(9) +
      (r.carryPerDrawdown == null ? '—' : n(r.carryPerDrawdown, 0)).padStart(10)),
    '',
    `spread across the cross-section: ${n(rank.spreadPct, 1)} points a year`,
    rank.allAtFloor ? 'every asset is at the funding floor today: the cross-section carries no information.' : null,
    '',
    'WORST DD is the peak-to-trough of cumulative funding a short would have collected, in % of',
    'notional. RECOVER is how long the mean carry takes to earn it back. CARRY/DD is the annual',
    'carry divided by that drawdown — higher is more carry per unit of measured pain.',
    '',
    'THE DRAWDOWNS ABOVE ARE SMALL AND THAT IS NOT REASSURANCE. Carry is a short-volatility',
    'profile: steady small gains, rare large losses. A 90-day window with no crisis in it measures',
    'the gains and not the losses, and the tail is not in this data.',
  ];
  if (spot) lines.push('',
    'THE LONG LEG (held as spot, so it pays no funding)',
    `liquid-staking yield while held: ${n(spot.yieldPct, 2)}%/yr`,
    `market ratio against the underlying: ${n(spot.ratio, 5)}`,
    spot.pegNote || null);
  if (position) lines.push('',
    'THE POSITION NOW',
    `short leg at ${n(position.leverage, 1)}x, margin ${n(position.marginPct, 1)}% of notional`,
    `an adverse move of ${n(position.moveToLiquidationPct, 1)}% liquidates it`,
    `carry at this leverage: ${n(position.leveredCarryPct, 1)}%/yr`,
    position.breakEvenDays == null ? null
      : `the round trip costs ${n(position.breakEvenDays, 1)} days of that carry`,
    'The two legs sit on different venues. The perp margin does not know the spot leg exists,',
    'so a delta-neutral book is still liquidatable on a rally.');
  return lines.filter((l) => l !== null).join('\n');
}

/**
 * The probes. Determinate risk classifications, and predictive controls.
 *
 * The split is the experiment, exactly as in cross.mjs: same document, same
 * call, nothing differing but whether the answer exists yet. The determinate
 * ones are answerable from the table the document prints. The predictive ones
 * ask what funding will DO, which nothing in the state can support — and the
 * self-check should say so.
 *
 * Note what is NOT asked: "should we put this trade on". That is a weighing of
 * a future, and this surface measured five times over that the model declines
 * those and answers descriptions well. The harness owns the trade; the model
 * classifies the state.
 */
export function buildCarryProbes(rank, { selfCheck = false } = {}) {
  const opts = Object.fromEntries(rank.rows.map((r) => [r.coin, `${r.coin}.`]));
  const qs = {
    // ---- DETERMINATE: answerable from the printed table --------------------
    d_richest: { type: 'choice', criteria: opts,
      instructions: 'Which asset is paying the most funding right now?' },
    d_best_per_drawdown: { type: 'choice', criteria: opts,
      instructions: 'Which asset has the highest carry per unit of drawdown (the CARRY/DD column)?' },
    d_most_stretched: { type: 'choice', criteria: opts,
      instructions: "Which asset's funding right now is furthest above its own 90-day mean, measured in its own standard deviations (the z column)?" },
    d_worst_drawdown: { type: 'choice', criteria: opts,
      instructions: 'Which asset has suffered the largest worst-case funding drawdown?' },
    d_spread_over_20: { type: 'noul',
      instructions: 'Is the spread between the richest and cheapest funding wider than 20 points a year?',
      criteria: { true: 'Wider than 20 points.', false: '20 points or less.' } },
    // A genuine risk CLASSIFICATION, answerable from the table: a print far
    // above an asset's own history is a different thing from a steady one,
    // whether or not it turns out to persist.
    d_any_stretched: { type: 'noul',
      instructions: 'Is any asset\'s current funding more than 2 standard deviations above its own 90-day mean?',
      criteria: { true: 'At least one is more than 2 sd above its own mean.',
        false: 'None is more than 2 sd above its own mean.' } },

    // ---- PREDICTIVE: the control. Nothing in the state supports these ------
    p_richest_next: { type: 'choice', criteria: opts,
      instructions: 'Which asset will pay the most funding over the NEXT 24 hours?' },
    p_stays_positive: { type: 'noul',
      instructions: 'Will every asset above still have positive funding in 24 hours?',
      criteria: { true: 'All will still be positive.', false: 'At least one will have turned negative.' } },
    p_spread_widens: { type: 'noul',
      instructions: 'Will the spread between richest and cheapest be wider in 24 hours than it is now?',
      criteria: { true: 'It will widen.', false: 'It will not widen.' } },
  };
  if (!selfCheck) return qs;
  for (const [id, q] of Object.entries({ ...qs })) {
    qs[`have__${id}`] = { type: 'noul',
      instructions: `Does the state above actually contain the information needed to answer this question: "${q.instructions}"`,
      criteria: {
        true: 'The figures needed are present in the state, so the question can be answered from it.',
        false: 'The state does not contain what this question needs — answering it would require information that is not there.',
      } };
  }
  return qs;
}

/** Ground truth. Determinate from the table; predictive from bars it never saw. */
export function carryTruth(rank, forward = null) {
  const t = {
    d_richest: rank.richest,
    d_best_per_drawdown: rank.bestRiskAdjusted,
    d_most_stretched: rank.mostStretched,
    d_worst_drawdown: rank.worstDrawdown,
    d_spread_over_20: rank.spreadPct > 20,
    d_any_stretched: rank.rows.some((r) => r.z > 2),
  };
  if (forward) {
    const rows = rank.rows.filter((r) => Number.isFinite(forward[r.coin]));
    if (rows.length) {
      const byNext = [...rows].sort((a, b) => forward[b.coin] - forward[a.coin]);
      t.p_richest_next = byNext[0].coin;
      t.p_stays_positive = rows.every((r) => forward[r.coin] > 0);
      const spread = forward[byNext[0].coin] - forward[byNext[byNext.length - 1].coin];
      t.p_spread_widens = spread > rank.spreadPct;
    }
  }
  return t;
}
