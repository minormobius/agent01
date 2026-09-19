// telemetry.mjs — what Jev did, over time.
//
// Dependency-free ESM, pure: same samples in, same numbers out. Runs in the
// browser (app.js draws from it) and in node (the selftest).
//
// The point of this file: a decision model returns the SAME typed fields every
// tick, so the answers stack into clean time series with no parsing. `danger`
// is a score on one fixed scale forever; `withdraw` is always a number in
// 0..1. That is the thing a text model cannot give you without a scraper, and
// it is why "telemetry on the model's own answers" is even a sentence.
//
// A word on the profile below. It describes ONE RUN, from a handful of
// decisions. It is not a stable trait of the model, and the readout says so —
// every figure carries its sample size, and a correlation is only reported
// once there are enough points for it to mean anything.

export const TELEMETRY_VERSION = 1;

/** The signals we keep. Order is the display order. */
export const SIGNALS = [
  { key: 'health', label: 'Health', kind: 'world', domain: 'health', unit: 'hp',
    note: 'What it cost. The ground truth the model is reacting to.' },
  { key: 'depth', label: 'Depth', kind: 'world', domain: 'depth', unit: 'levels',
    note: 'How deep the delver actually got. Down is progress.' },
  { key: 'danger', label: 'Perceived danger', kind: 'answer', domain: 'score', unit: 'score',
    note: 'The `danger` score. What the model THINKS is happening — compare it against health.' },
  { key: 'confidence', label: 'Move confidence', kind: 'answer', domain: 'unit', unit: '0–1',
    note: 'How concentrated the `move` distribution was. Dips mark genuinely hard junctions.' },
  { key: 'aggression', label: 'Aggression', kind: 'answer', domain: 'unit', unit: 'P(engage)',
    note: 'Probability mass the `engage` choice put on melee or shoot, rather than avoiding.' },
  { key: 'level', label: 'Level', kind: 'world', domain: 'level', unit: 'lvl',
    note: 'Experience is earned by killing, looting and going deeper.' },
  { key: 'take_loot', label: 'Take loot', kind: 'answer', domain: 'unit', unit: 'noul' },
  { key: 'withdraw', label: 'Withdraw', kind: 'answer', domain: 'unit', unit: 'noul' },
];

/** Probability the `engage` choice put on acting (melee or shoot) at all. */
export function engageAggression(engage) {
  if (!engage) return null;
  const p = engage.probabilities;
  if (p && typeof p === 'object') {
    const act = (p.melee || 0) + (p.shoot || 0);
    if (Number.isFinite(act)) return Math.max(0, Math.min(1, act));
  }
  // no distribution? fall back to the pick itself
  if (engage.choice === 'melee' || engage.choice === 'shoot') return 1;
  if (engage.choice === 'avoid') return 0;
  return null;
}

export function newTelemetry() {
  return { version: TELEMETRY_VERSION, samples: [] };
}

/**
 * Record one tick. Everything is read out of the typed answer verbatim —
 * nothing is inferred, nothing is parsed.
 */
export function record(tel, { tick, answers = {}, run, world, usedFallback = false, latencyMs = null, source = null, inputTokens = null }) {
  const here = world?.rooms?.get(run.at);
  tel.samples.push({
    tick,
    // world truth
    health: run.hp,
    maxHealth: run.maxHp,
    gold: run.gold,
    depth: here ? here.depth : 0,
    room: run.at,
    // the model's own answers
    danger: answers.danger?.score ?? null,
    // `engage` is a CHOICE, so "how aggressive was it" is the probability mass
    // it put on acting rather than avoiding — a number derived from the typed
    // distribution, not from parsing a sentence.
    aggression: engageAggression(answers.engage),
    engage: answers.engage?.choice ?? null,
    use_item: answers.use_item?.choice ?? null,
    level_up: answers.level_up?.choice ?? null,
    level: run.char?.level ?? null,
    maxHp: run.maxHp,
    confidence: answers.move?.confidence ?? null,
    choice: answers.move?.choice ?? null,
    fight: answers.fight?.noul ?? null,
    take_loot: answers.take_loot?.noul ?? null,
    withdraw: answers.withdraw?.noul ?? null,
    // meta
    usedFallback: Boolean(usedFallback),
    latencyMs,
    source,
    inputTokens,
  });
  return tel;
}

/** Column-oriented view, for plotting. */
export function series(tel) {
  const out = { tick: [] };
  for (const s of SIGNALS) out[s.key] = [];
  out.gold = [];
  for (const smp of tel.samples) {
    out.tick.push(smp.tick);
    for (const s of SIGNALS) out[s.key].push(smp[s.key]);
    out.gold.push(smp.gold);
  }
  return out;
}

// ------------------------------------------------------------------ stats ---
const defined = (xs) => xs.filter((v) => typeof v === 'number' && Number.isFinite(v));

export function mean(xs) {
  const v = defined(xs);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Pearson r over the pairs where BOTH values are present.
 * Returns null when there are too few points or either side is constant —
 * a correlation from 2 points, or against a flat line, is noise with a
 * decimal point on it.
 */
export function correlation(xs, ys, { minPairs = 5 } = {}) {
  const pairs = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const a = xs[i], b = ys[i];
    if (typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)) {
      pairs.push([a, b]);
    }
  }
  if (pairs.length < minPairs) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [a, b] of pairs) {
    const da = a - mx, db = b - my;
    sxy += da * db; sxx += da * da; syy += db * db;
  }
  // A side that never moved has no correlation to report. Testing `=== 0` is
  // NOT enough: summing (x - mean)^2 over a constant series leaves floating
  // point crumbs (measured: sxx = 5.9e-31 for a dead-flat run), so the guard
  // misses, the division is noise over noise, and it confidently reports
  // r = 1.00 from a series that never changed. Compare the spread against the
  // magnitude of the data instead, which is exact for genuinely constant
  // input and still catches "constant to within rounding".
  if (isFlat(pairs.map((p) => p[0])) || isFlat(pairs.map((p) => p[1]))) return null;
  if (!(sxx > 0) || !(syy > 0)) return null;

  const r = sxy / Math.sqrt(sxx * syy);
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r)); // rounding can nudge it past ±1
}

/** True when a series never meaningfully moves, relative to its own scale. */
function isFlat(vals) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return true;
  const scale = Math.max(Math.abs(lo), Math.abs(hi), 1e-12);
  return (hi - lo) <= 1e-9 * scale;
}

// ---------------------------------------------------------------- profile ---
const BANDS = [
  { max: 0.2, word: 'very low' },
  { max: 0.4, word: 'low' },
  { max: 0.6, word: 'middling' },
  { max: 0.8, word: 'high' },
  { max: 1.01, word: 'very high' },
];
const band = (v) => (v == null ? '—' : BANDS.find((b) => v < b.max).word);

/**
 * A descriptive profile of ONE run.
 *
 * Deliberately conservative: every trait reports the n it was computed from,
 * correlations are withheld below `minPairs`, and the summary sentence is
 * assembled from the numbers rather than written to flatter them.
 */
export function profile(tel) {
  const s = series(tel);
  const n = tel.samples.length;

  const traits = [
    { key: 'aggression', label: 'Aggression', value: mean(s.aggression),
      basis: 'mean P(melee or shoot)', hi: 'picks fights', lo: 'avoids creatures' },
    { key: 'greed', label: 'Greed', value: mean(s.take_loot),
      basis: 'mean `take_loot` noul', hi: 'stops for every coin', lo: 'leaves gold behind' },
    { key: 'caution', label: 'Caution', value: mean(s.withdraw),
      basis: 'mean `withdraw` noul', hi: 'wants out', lo: 'presses deeper' },
    { key: 'decisiveness', label: 'Decisiveness', value: mean(s.confidence),
      basis: 'mean `move` confidence', hi: 'rarely hesitates', lo: 'often torn' },
    { key: 'threat_reading', label: 'Threat reading', value: scaled(mean(s.danger), 3),
      basis: 'mean `danger` score, scaled to 0–1', hi: 'sees menace everywhere', lo: 'reads rooms as safe' },
  ].map((t) => ({ ...t, band: band(t.value), n }));

  // Does it actually get more careful as it gets hurt? This is the one claim
  // worth making, and only if the numbers support it.
  const healthFrac = tel.samples.map((x) => (x.maxHealth ? x.health / x.maxHealth : null));
  const rHealthWithdraw = correlation(healthFrac, s.withdraw);
  const rHealthFight = correlation(healthFrac, s.aggression);
  const rDangerWithdraw = correlation(s.danger, s.withdraw);

  const findings = [];
  if (rHealthWithdraw != null) {
    findings.push({
      key: 'self_preservation',
      label: 'Self-preservation',
      r: rHealthWithdraw,
      text: rHealthWithdraw < -0.5
        ? `Strong: as health fell, the urge to withdraw rose (r = ${rHealthWithdraw.toFixed(2)}).`
        : rHealthWithdraw < -0.2
          ? `Present: withdrawal rises somewhat as health falls (r = ${rHealthWithdraw.toFixed(2)}).`
          : `Weak: withdrawal barely tracked health this run (r = ${rHealthWithdraw.toFixed(2)}).`,
    });
  }
  if (rHealthFight != null) {
    findings.push({
      key: 'picks_fights_when_healthy',
      label: 'Fights when able',
      r: rHealthFight,
      text: rHealthFight > 0.3
        ? `Yes: it took fights while healthy and avoided them when hurt (r = ${rHealthFight.toFixed(2)}).`
        : `Not clearly — willingness to fight did not track health (r = ${rHealthFight.toFixed(2)}).`,
    });
  }
  if (rDangerWithdraw != null) {
    findings.push({
      key: 'danger_drives_retreat',
      label: 'Danger drives retreat',
      r: rDangerWithdraw,
      text: rDangerWithdraw > 0.3
        ? `Yes: rooms it read as dangerous are the ones it wanted to leave (r = ${rDangerWithdraw.toFixed(2)}).`
        : `No: perceived danger and the wish to withdraw moved independently (r = ${rDangerWithdraw.toFixed(2)}).`,
    });
  }

  return {
    n,
    traits,
    findings,
    gate_firings: tel.samples.filter((x) => x.usedFallback).length,
    median_latency_ms: median(tel.samples.map((x) => x.latencyMs)),
    total_input_tokens: defined(tel.samples.map((x) => x.inputTokens)).reduce((a, b) => a + b, 0),
    summary: summarise(traits, n),
    // the honest caveat, carried with the data rather than left to the UI
    caveat: n < 8
      ? `Only ${n} decision(s) so far — too few to characterise anything. Let it run.`
      : `Describes this run of ${n} decisions, not the model in general.`,
  };
}

function scaled(v, max) {
  return v == null ? null : Math.max(0, Math.min(1, v / max));
}
function median(xs) {
  const v = defined(xs).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function summarise(traits, n) {
  if (n < 8) return 'Not enough decisions yet to say anything about how it plays.';
  const by = Object.fromEntries(traits.map((t) => [t.key, t.value ?? 0]));
  const bits = [];
  bits.push(by.caution > 0.5 ? 'cautious' : by.caution < 0.25 ? 'headstrong' : 'measured');
  bits.push(by.greed > 0.6 ? 'acquisitive' : by.greed < 0.3 ? 'indifferent to loot' : 'selective about loot');
  bits.push(by.aggression > 0.5 ? 'happy to fight' : 'avoids fights where it can');
  const decisive = by.decisiveness > 0.8 ? 'and rarely hesitates'
    : by.decisiveness < 0.55 ? 'and is often genuinely torn at junctions'
      : 'and hesitates at the harder junctions';
  return `Over ${n} decisions: ${bits.join(', ')}, ${decisive}.`;
}
