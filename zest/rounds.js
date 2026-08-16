// zest/rounds.js — the game rules, and the measurement hiding inside them.
//
// Pure. No DOM, no three.js. Selftested in rounds.selftest.mjs.
//
// The game is a fruit-ninja round, but the scoring is a psychophysics
// experiment with a scoreboard on it. Each round shows one ANCHOR post as a
// solid, then rains posts down; a post is RIPE if its shape is within τ of the
// anchor's, and the player's only information is what the shapes look like.
//
// So "did you learn to read the vectors?" has an actual answer: your precision
// against the round's base rate, with a one-sided binomial test attached. A
// pretty visualisation can always be defended by saying it feels meaningful.
// This one either beats chance or it does not.

/** Cosine between two coefficient vectors. Duplicated from embed-geometry so
 *  the rules module stays importable on its own. */
export function cos(a, b) {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na < 1e-20 || nb < 1e-20) return 0;
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * The similarity threshold that makes exactly `fraction` of the pool ripe.
 * Chosen as a QUANTILE of the observed similarities rather than a fixed number,
 * because absolute cosine values drift with the corpus and a fixed τ would
 * silently make some rounds impossible and others trivial.
 */
export function thresholdForFraction(sims, fraction) {
  if (!sims.length) return 1;
  const sorted = Float64Array.from(sims).sort();
  const f = Math.min(1, Math.max(0, fraction));
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((1 - f) * sorted.length)));
  return sorted[idx];
}

/**
 * Build a round: pick an anchor, rank the rest against it, mark the ripe ones.
 *
 * A good anchor is one whose similarity distribution is SPREAD — if everything
 * in the pool is equally close to the anchor there is nothing to read and the
 * round is a coin flip regardless of skill. We try several candidates and keep
 * the one with the widest gap between the ripe and unripe groups, which is the
 * same quantity (a separation) the geometry selftest measures.
 *
 * @param {Array<{id:string, unit:Float64Array}>} items
 * @param {{ripeFraction?:number, size?:number, candidates?:number, rng?:function}} opts
 */
export function buildRound(items, opts = {}) {
  const ripeFraction = opts.ripeFraction ?? 0.3;
  const size = Math.min(opts.size ?? 24, Math.max(0, items.length - 1));
  const candidates = opts.candidates ?? 8;
  const rng = opts.rng || Math.random;
  if (items.length < 4) throw new Error('buildRound: need at least 4 posts');

  let best = null;
  for (let c = 0; c < candidates; c++) {
    const ai = Math.floor(rng() * items.length);
    const anchor = items[ai];
    const rest = items.filter((_, i) => i !== ai);
    const sims = rest.map((it) => cos(anchor.unit, it.unit));
    const tau = thresholdForFraction(sims, ripeFraction);
    let hiSum = 0, hiN = 0, loSum = 0, loN = 0;
    for (const s of sims) {
      if (s >= tau) { hiSum += s; hiN++; } else { loSum += s; loN++; }
    }
    if (!hiN || !loN) continue;
    const gap = hiSum / hiN - loSum / loN;
    if (!best || gap > best.gap) best = { anchor, rest, sims, tau, gap };
  }
  if (!best) throw new Error('buildRound: no usable anchor');

  const scored = best.rest
    .map((it, i) => ({ item: it, sim: best.sims[i], ripe: best.sims[i] >= best.tau }))
    .sort(() => rng() - 0.5)
    .slice(0, size);

  // Guarantee the round is playable: at least two of each kind, or the base
  // rate is 0 or 1 and precision means nothing.
  const ripeCount = scored.filter((s) => s.ripe).length;
  if (ripeCount < 2 || ripeCount > scored.length - 2) {
    const ripe = best.rest.map((it, i) => ({ item: it, sim: best.sims[i], ripe: best.sims[i] >= best.tau }));
    const yes = ripe.filter((r) => r.ripe), no = ripe.filter((r) => !r.ripe);
    const wantYes = Math.max(2, Math.round(size * ripeFraction));
    const picked = yes.slice(0, wantYes).concat(no.slice(0, size - wantYes));
    return finalise(best, picked, rng);
  }
  return finalise(best, scored, rng);
}

function finalise(best, picked, rng) {
  const order = picked.map((p, i) => ({ p, k: rng() })).sort((a, b) => a.k - b.k).map((x) => x.p);
  const ripeCount = order.filter((o) => o.ripe).length;
  return {
    anchor: best.anchor,
    tau: best.tau,
    gap: best.gap,
    items: order,
    baseRate: order.length ? ripeCount / order.length : 0,
    ripeCount,
    total: order.length,
  };
}

/**
 * Score a played round.
 *
 * @param {Array<{ripe:boolean, sliced:boolean}>} plays  one per post that fell
 * @returns {{hits,falseAlarms,misses,correctRejections,sliced,precision,recall,
 *            baseRate,lift,accuracy,pValue,beatChance,score}}
 */
export function scoreRound(plays) {
  let hits = 0, falseAlarms = 0, misses = 0, correctRejections = 0;
  for (const p of plays) {
    if (p.sliced && p.ripe) hits++;
    else if (p.sliced && !p.ripe) falseAlarms++;
    else if (!p.sliced && p.ripe) misses++;
    else correctRejections++;
  }
  const sliced = hits + falseAlarms;
  const total = plays.length;
  const ripeTotal = hits + misses;
  const baseRate = total ? ripeTotal / total : 0;
  const precision = sliced ? hits / sliced : 0;
  const recall = ripeTotal ? hits / ripeTotal : 0;
  const accuracy = total ? (hits + correctRejections) / total : 0;

  // The honest question: of the posts you CHOSE to slice, were more of them
  // ripe than if you had sliced at random? Under the null "you cannot read the
  // shapes", each slice is an independent draw at the base rate, so hits is
  // Binomial(sliced, baseRate) and this is a one-sided exact test.
  const pValue = sliced ? binomTailAtLeast(hits, sliced, baseRate) : 1;

  return {
    hits, falseAlarms, misses, correctRejections, sliced, total,
    precision, recall, accuracy, baseRate,
    lift: baseRate > 0 ? precision / baseRate : 0,
    pValue,
    beatChance: pValue < 0.05 && precision > baseRate,
    score: hits * 100 - falseAlarms * 60 - misses * 15,
  };
}

/** P(X ≥ k) for X ~ Binomial(n, p). Exact, iterative, no factorial overflow. */
export function binomTailAtLeast(k, n, p) {
  if (n <= 0) return 1;
  if (p <= 0) return k <= 0 ? 1 : 0;
  if (p >= 1) return k <= n ? 1 : 0;
  if (k <= 0) return 1;
  if (k > n) return 0;
  let term = Math.pow(1 - p, n);   // P(X = 0)
  let tail = term;                 // running P(X ≤ i)
  for (let i = 0; i < k - 1; i++) {
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
    tail += term;
  }
  return Math.min(1, Math.max(0, 1 - tail));
}

/** A combo multiplier that rewards reading, not flailing. */
export function comboMultiplier(streak) {
  if (streak < 3) return 1;
  if (streak < 6) return 2;
  if (streak < 10) return 3;
  return 4;
}

/** Plain-English verdict on a round. Deliberately refuses to flatter. */
export function verdict(s) {
  if (s.sliced < 4) return { tone: 'thin', text: 'too few slices to tell whether you were reading or guessing' };
  if (!s.beatChance) {
    return {
      tone: 'chance',
      text: `you sliced ${(s.precision * 100).toFixed(0)}% ripe against a ${(s.baseRate * 100).toFixed(0)}% base rate — not distinguishable from guessing (p = ${s.pValue.toFixed(2)})`,
    };
  }
  return {
    tone: 'read',
    text: `${(s.precision * 100).toFixed(0)}% ripe against a ${(s.baseRate * 100).toFixed(0)}% base rate — ${s.lift.toFixed(1)}× chance, p = ${s.pValue < 0.001 ? '<0.001' : s.pValue.toFixed(3)}. You are reading the geometry.`,
  };
}
