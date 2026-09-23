// cross.mjs — three tapes at once, and the one market question that has an
// answer you can check.
//
// WHY THIS EXISTS, and what it is NOT for.
//
// The P&L case for multi-asset dies on arithmetic before any code is written.
// Measured over 3.5 days of minute bars: BTC, ETH and SOL move in the same
// direction ~76% of the time, the leader changes in 61-70% of windows, and
// the median spread between best and worst is 4.1bp over a minute and 14.7bp
// over fifteen — against ~19bp for the two round trips a relative-value leg
// costs. There is no trade here, and this module does not build one.
//
// What multi-asset DOES buy is a market question that is DETERMINATE.
// "Which of these three is being bought hardest right now" has an answer
// computable from the tape. Every determinate question measured on this
// surface scored 93.8-100% and the >=0.9 confidence gate was 66/66 perfect on
// them. Every MARKET question scored ~50% and the gate fired 0 times in 342.
// The stated reason for that gap is that market questions are predictions and
// predictions have no determinate answer — and that explanation has never been
// tested, because no determinate market question was ever asked.
//
// So this module builds the test: determinate and predictive questions over
// the SAME state document, in the SAME call, with ground truth computed here.
// Either the gate fires — and the 0/342 was about the questions, not the
// domain — or it does not, which is the more interesting finding and would
// qualify a great deal of what this surface claims.
//
// Pure, dependency-free, identical in node and the browser.

/** Basis-point return over the trailing `w` bars, ending at index i. */
const retBps = (px, i, w) => (px[i] - px[i - w]) / px[i - w] * 1e4;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Per-asset figures at index `i`, over the given windows. Every one is
 * arithmetic done HERE so the judgement does not have to do it — the
 * 62.5%-versus-100% finding, applied per asset.
 *
 * Returns null when the series does not reach the longest window, for the
 * same reason `metrics.compute` does: a window the tape does not cover is not
 * a smaller window, it is an absent one.
 */
export function assetFigures(px, i, windows) {
  const longest = Math.max(...windows);
  if (i < longest || i >= px.length) return null;
  const f = { px: px[i] };
  for (const w of windows) {
    const win = px.slice(i - w, i + 1);
    const rs = [];
    for (let k = 1; k < win.length; k++) rs.push((win[k] - win[k - 1]) / win[k - 1] * 1e4);
    f[`ret${w}`] = retBps(px, i, w);
    f[`vol${w}`] = sd(rs);
    f[`range${w}`] = (Math.max(...win) - Math.min(...win)) / win[win.length - 1] * 1e4;
    f[`up${w}`] = rs.length ? rs.filter((x) => x > 0).length / rs.length : 0;
    const path = rs.reduce((s, x) => s + Math.abs(x), 0);
    f[`eff${w}`] = path > 1e-9 ? Math.abs(f[`ret${w}`]) / path : 0;
  }
  const lw = longest;
  const win = px.slice(i - lw, i + 1);
  f.mean = mean(win);
  const s = sd(win);
  f.z = s > 1e-9 ? (px[i] - mean(win)) / s : 0;
  const lo = Math.min(...win), hi = Math.max(...win);
  f.rangePos = hi - lo > 1e-9 ? (px[i] - lo) / (hi - lo) : 0.5;
  return f;
}

/**
 * The cross-section itself: the comparisons across assets, computed.
 *
 * `spreadBps` is the thing the P&L case turns on and it is reported whether or
 * not it flatters anything — it is what a relative-value leg would have to
 * cover, and on this universe it usually does not.
 */
export function crossSection(figs, { window = 60 } = {}) {
  const assets = Object.keys(figs).filter((a) => figs[a]);
  if (assets.length < 2) return null;
  const r = Object.fromEntries(assets.map((a) => [a, figs[a][`ret${window}`]]));
  const v = Object.fromEntries(assets.map((a) => [a, figs[a][`vol${window}`]]));
  const vals = assets.map((a) => r[a]);
  const avg = mean(vals);
  const byRet = [...assets].sort((a, b) => r[b] - r[a]);
  const byVol = [...assets].sort((a, b) => v[b] - v[a]);
  const signs = vals.map(Math.sign);
  return {
    window,
    assets,
    strongest: byRet[0],
    weakest: byRet[byRet.length - 1],
    mostVolatile: byVol[0],
    // Distance from the group's own average move: which one is doing its own
    // thing, rather than which one is simply up.
    mostDislocated: [...assets].sort((a, b) => Math.abs(r[b] - avg) - Math.abs(r[a] - avg))[0],
    allSameDirection: signs.every((s) => s === signs[0]) && signs[0] !== 0,
    spreadBps: Math.max(...vals) - Math.min(...vals),
    meanBps: avg,
    dispersionBps: sd(vals),
    returns: r,
  };
}

/**
 * The state document. Same shape as the lab's single-asset one — labelled
 * figures, no series, no prose about what it means — widened to three.
 *
 * `unit` labels the bars, because the maths is identical whatever a bar is but
 * a document that says "60s" when it means sixty minutes is handing the
 * judgement a lie about its own timescale. That mistake has already been made
 * once on this surface.
 */
export function crossDoc(figs, xs, { unit = 'm', windows = [15, 60], regime = null } = {}) {
  const n = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const assets = xs.assets;
  const lines = [
    `THREE PERPETUALS ON THE SAME CLOCK, Hyperliquid. Bars are 1${unit}.`,
    'Every figure below is already computed from the tape; bp = basis points (0.01%).',
    '',
    'PER ASSET',
    `${'asset'.padEnd(6)}${windows.map((w) => `ret${w}${unit}`.padStart(10)).join('')}` +
      `${windows.map((w) => `vol${w}${unit}`.padStart(10)).join('')}${'range'.padStart(10)}${'efficiency'.padStart(12)}` +
      `${'z'.padStart(8)}${'rangePos'.padStart(10)}`,
    ...assets.map((a) => {
      const f = figs[a];
      return a.padEnd(6) +
        windows.map((w) => `${n(f[`ret${w}`], 1)}bp`.padStart(10)).join('') +
        windows.map((w) => `${n(f[`vol${w}`], 2)}bp`.padStart(10)).join('') +
        `${n(f[`range${Math.max(...windows)}`], 1)}bp`.padStart(10) +
        n(f[`eff${Math.max(...windows)}`]).padStart(12) +
        n(f.z).padStart(8) + n(f.rangePos).padStart(10);
    }),
    '',
    'CROSS-SECTION',
    `spread between the best and worst ${xs.window}${unit} move: ${n(xs.spreadBps, 1)}bp`,
    `average ${xs.window}${unit} move across the three: ${n(xs.meanBps, 1)}bp`,
    `dispersion (sd of the three moves): ${n(xs.dispersionBps, 1)}bp`,
  ];
  // Display only, and labelled as such. The registered polarity is estimated
  // from 1h bars on a 24h stride — it moves 0.0003 over ten minutes — so it is
  // a standing fact about the week, not something any decision here can act
  // on, and it is never offered as an input to a question.
  if (regime) lines.push(
    '',
    'BACKGROUND (a multi-day fact, not a reading of the bars above)',
    `pooled 12h trend/reversion polarity across these three: r = ${n(regime.r, 3)} ` +
      `(${regime.r > 0 ? 'trending' : 'reverting'}), last updated ${regime.updated || 'unknown'}. ` +
      'It is re-estimated once a day and does not change within a session.');
  lines.push(
    '',
    'EFFICIENCY is |net move| / total distance travelled: near 1 means one direction held,',
    'near 0 means churn that went nowhere. Z is the distance from that asset\'s own mean in',
    'its own standard deviations. RANGEPOS is 0 at the window low and 1 at the window high.');
  return lines.join('\n');
}

/**
 * The probe set. Half determinate, half predictive, asked in ONE call against
 * ONE document — which is what makes the comparison clean: same state, same
 * moment, same model, nothing differing but whether the answer exists yet.
 *
 * Determinate questions are answerable from the figures printed above. The
 * predictive ones are the control and are expected to be refused; they are
 * here so that "the gate fires" and "the gate fires on anything" can be told
 * apart.
 */
export function buildProbes(xs, { selfCheck = false } = {}) {
  const opts = Object.fromEntries(xs.assets.map((a) => [a, `${a} is the one.`]));
  const w = `${xs.window} bars`;
  const qs = {
    // ---- DETERMINATE: the answer is in the document -----------------------
    d_strongest: { type: 'choice', instructions: `Over the trailing ${w}, which asset has the largest return?`, criteria: opts },
    d_weakest: { type: 'choice', instructions: `Over the trailing ${w}, which asset has the smallest return?`, criteria: opts },
    d_most_volatile: { type: 'choice', instructions: `Over the trailing ${w}, which asset has the highest volatility?`, criteria: opts },
    d_most_dislocated: { type: 'choice', instructions: `Which asset's trailing ${w} return is furthest from the average of the three?`, criteria: opts },
    d_all_same_direction: { type: 'noul', instructions: `Are all three trailing ${w} returns the same direction — all up, or all down?`,
      criteria: { true: 'All three moved the same way.', false: 'At least one moved against the others.' } },
    d_spread_over_20: { type: 'noul', instructions: `Is the spread between the best and worst trailing ${w} move wider than 20bp?`,
      criteria: { true: 'The spread exceeds 20 basis points.', false: 'It is 20 basis points or less.' } },

    // ---- PREDICTIVE: the control. The answer is not in the document -------
    p_strongest_next: { type: 'choice', instructions: `Over the NEXT ${w}, which asset will have the largest return?`, criteria: opts },
    p_weakest_next: { type: 'choice', instructions: `Over the NEXT ${w}, which asset will have the smallest return?`, criteria: opts },
    p_all_same_next: { type: 'noul', instructions: `Over the NEXT ${w}, will all three returns be the same direction?`,
      criteria: { true: 'All three will move the same way.', false: 'At least one will move against the others.' } },
    p_widen_next: { type: 'noul', instructions: `Over the NEXT ${w}, will the spread between best and worst be wider than it is now?`,
      criteria: { true: 'The spread will widen.', false: 'The spread will not widen.' } },
  };
  if (!selfCheck) return qs;

  // THE ESCALATION PRIMITIVE, asked here for the first time on market data
  // with computed ground truth. Measured elsewhere on this surface: reading
  // the ANSWER's confidence separated answerable from unanswerable by 0.0
  // points, while asking "is the information here?" as its own question
  // separated them by 62. Breadth is free, so every probe carries its own.
  //
  // This is the question the gate SHOULD be reading. Whether it beats plain
  // confidence on a market document is exactly what is unknown.
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

/**
 * Ground truth, computed. The determinate answers come from the same numbers
 * the document carries; the predictive ones come from bars the document has
 * never seen, which is the only honest way to score a forecast.
 */
export function groundTruth(figs, xs, forward) {
  const t = {
    d_strongest: xs.strongest,
    d_weakest: xs.weakest,
    d_most_volatile: xs.mostVolatile,
    d_most_dislocated: xs.mostDislocated,
    d_all_same_direction: xs.allSameDirection,
    d_spread_over_20: xs.spreadBps > 20,
  };
  if (forward) {
    const vals = xs.assets.map((a) => forward[a]);
    const signs = vals.map(Math.sign);
    const byRet = [...xs.assets].sort((a, b) => forward[b] - forward[a]);
    t.p_strongest_next = byRet[0];
    t.p_weakest_next = byRet[byRet.length - 1];
    t.p_all_same_next = signs.every((s) => s === signs[0]) && signs[0] !== 0;
    t.p_widen_next = (Math.max(...vals) - Math.min(...vals)) > xs.spreadBps;
  }
  return t;
}

/** Read one answer into a comparable value, whatever primitive it used. */
export function readAnswer(a) {
  if (!a) return { value: null, confidence: null };
  if (typeof a.noul === 'number') return { value: a.noul > 0.5, confidence: Math.max(a.noul, 1 - a.noul) };
  if (a.choice !== undefined) return { value: a.choice, confidence: a.confidence ?? null };
  if (typeof a.score === 'number') return { value: a.score, confidence: a.confidence ?? null };
  return { value: null, confidence: null };
}

export const isDeterminate = (id) => id.startsWith('d_');
