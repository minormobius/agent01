// oracles.mjs — deterministic strategies running on the same ticks.
//
// Two jobs, and the second is the interesting one.
//
//   1. They are the honest bar. Buy-and-hold and a random control are easy
//      to beat or lose to for reasons that have nothing to do with judgement.
//      "Can it beat a two-line moving-average cross" is the question a
//      skeptic asks first, so the page answers it.
//
//   2. Jev is SHOWN what each of them currently says. Every oracle's signal
//      is arithmetic — a cross, a z-score, a distance from a high — and
//      handing over computed results rather than the inputs to a computation
//      is the move that has worked every time on this surface.
//
// Because he sees them, beating them is no longer independent evidence. So
// the controls become `best` (follow whichever oracle is ahead ON PAST
// PERFORMANCE ONLY) and `majority` (average what they all say). The real
// question this layer asks is whether choosing between rules beats
// aggregating them mechanically.
//
// Thresholds are named constants, stated on the page, and NOT tuned. Every
// one of them is the textbook default for its rule; picking them to make a
// run look good is the failure mode this whole surface exists to avoid.

export const T = {
  Z_STRETCH: 1.5,      // sd from the mean before a reversion rule engages
  BREAK_EDGE: 0.9,     // share of the range that counts as "at the edge"
  EFF_TREND: 0.4,      // efficiency below which a trend rule sits out
  SKEW_STRONG: 0.35,   // aggressor imbalance that counts as one-sided
  CARRY_BP: 0.05,      // funding, in bp, worth leaning against
};

/** Each rule returns a conviction in [-1, +1]; the book scales it by the cap. */
export const ORACLES = [
  {
    id: 'ma_cross', name: 'MA cross',
    blurb: `15s mean against 60s mean, sized by the gap in sd of the 60s window`,
    rule: (m) => clamp(m.maSpreadZ),
    says: (m) => `fast mean ${m.maSpreadBps >= 0 ? 'above' : 'below'} slow by ` +
      `${Math.abs(m.maSpreadBps).toFixed(2)}bp (${m.maSpreadZ.toFixed(2)} sd)`,
  },
  {
    id: 'zscore_rev', name: 'Mean reversion',
    blurb: `fades price beyond ${T.Z_STRETCH} sd from its own 60s mean`,
    rule: (m) => (Math.abs(m.z60) < T.Z_STRETCH ? 0 : clamp(-m.z60 / 3)),
    says: (m) => (Math.abs(m.z60) < T.Z_STRETCH
      ? `price ${m.z60.toFixed(2)} sd from its mean — inside the band, no view`
      : `price stretched ${m.z60.toFixed(2)} sd, fading it`),
  },
  {
    id: 'breakout', name: 'Breakout',
    blurb: `buys the top ${((1 - T.BREAK_EDGE) * 100).toFixed(0)}% of the 60s range, sells the bottom`,
    rule: (m) => (m.rangePos60 >= T.BREAK_EDGE ? 1 : m.rangePos60 <= 1 - T.BREAK_EDGE ? -1 : 0),
    says: (m) => `sitting at ${(m.rangePos60 * 100).toFixed(0)}% of the 60s range`,
  },
  {
    id: 'momentum', name: 'Momentum',
    blurb: `follows the 60s move, but only while efficiency is over ${T.EFF_TREND}`,
    rule: (m) => (m.w60_efficiency < T.EFF_TREND ? 0 : clamp(m.w60_retBps / 10)),
    says: (m) => (m.w60_efficiency < T.EFF_TREND
      ? `efficiency ${m.w60_efficiency.toFixed(2)} — too much churn to follow`
      : `60s move ${m.w60_retBps.toFixed(1)}bp held at efficiency ${m.w60_efficiency.toFixed(2)}`),
  },
  {
    id: 'flow', name: 'Taker flow',
    blurb: `follows the aggressor imbalance once it passes ${T.SKEW_STRONG}`,
    rule: (m) => (Math.abs(m.w60_takerSkew) < T.SKEW_STRONG ? 0 : clamp(m.w60_takerSkew * 1.5)),
    says: (m) => `aggressors ${m.w60_takerSkew >= 0 ? 'lifting' : 'hitting'} at skew ${m.w60_takerSkew.toFixed(2)}`,
  },
  {
    id: 'carry', name: 'Funding carry',
    blurb: `leans against funding: paid to be short when longs are paying`,
    rule: (m) => (Math.abs(m.fundingBps) < T.CARRY_BP ? 0 : clamp(-m.fundingBps * 4)),
    says: (m) => `funding ${m.fundingBps.toFixed(3)}bp — ${m.fundingBps >= 0 ? 'longs pay' : 'shorts pay'}`,
  },
];

const clamp = (x) => (Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0);

/** Read every rule against one metric snapshot. */
export function readOracles(m, cap = 3) {
  if (!m) return [];
  return ORACLES.map((o) => {
    const conviction = clamp(o.rule(m));
    return { id: o.id, name: o.name, conviction,
      target: Math.round(conviction * cap * 100) / 100,
      says: o.says(m),
      side: conviction > 0.05 ? 'long' : conviction < -0.05 ? 'short' : 'flat' };
  });
}

/** Mechanical aggregation: the average of what they all say. */
export function majorityTarget(reads, cap = 3) {
  if (!reads.length) return 0;
  const mean = reads.reduce((s, r) => s + r.conviction, 0) / reads.length;
  return Math.round(clamp(mean) * cap * 100) / 100;
}

/**
 * Follow whichever rule is ahead — on PAST equity only. `equities` is a map
 * of oracle id to its equity as of the last decision, so nothing here can
 * see the bar it is about to trade. Before `warmup` decisions there is no
 * basis for a pick and it stays flat rather than guessing.
 */
export function bestOracleTarget(reads, equities, { warmup = 10, decisions = 0 } = {}) {
  if (decisions < warmup) return { target: 0, follows: null };
  let bestId = null, bestEq = -Infinity;
  for (const r of reads) {
    const e = equities[r.id];
    if (Number.isFinite(e) && e > bestEq) { bestEq = e; bestId = r.id; }
  }
  const pick = reads.find((r) => r.id === bestId);
  return { target: pick ? pick.target : 0, follows: bestId };
}

/** The block the state document carries, so Jev sees what the rules see. */
export function oracleDoc(reads) {
  if (!reads.length) return '';
  const long = reads.filter((r) => r.side === 'long').length;
  const short = reads.filter((r) => r.side === 'short').length;
  return [
    'WHAT THE RULE-BASED STRATEGIES SAY RIGHT NOW. Each is a fixed formula run',
    'on this same tape; none of them can see the future either.',
    ...reads.map((r) =>
      `${r.name.padEnd(15)} ${r.side.toUpperCase().padEnd(6)} ${String(r.target).padStart(6)}x   ${r.says}`),
    `tally: ${long} long, ${short} short, ${reads.length - long - short} flat`,
  ].join('\n');
}

/** Criteria for asking which rule fits — one option per oracle, plus none. */
export function oracleCriteria(reads) {
  const c = {};
  for (const r of reads) {
    const o = ORACLES.find((x) => x.id === r.id);
    c[r.id] = `${r.name}: ${o.blurb}. It currently reads ${r.side} (${r.says}).`;
  }
  c.none = 'None of them fits what the tape is doing: the rules that have a view are reading it wrong, ' +
    'or conditions suit no fixed rule at all.';
  return c;
}
