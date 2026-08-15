// palm/baseline.js — turn raw readings into a place among other people.
//
// The dial is a PERCENTILE, never a probability. Nothing here can tell you that
// a post was written by a machine; what it can tell you is that your posting is
// more metronomic than 87% of the accounts you argue with, which is a claim the
// data actually supports. Absolute calibration would need paired human/AI
// training corpora and a false-positive budget — see the note at the top of
// axes.js — and inventing one would make the toy a liar.
//
// baseline.json is built offline by build-baseline.mjs. The browser only does
// the lookup.

import { AXES } from './axes.js';

/** Where `raw` falls in a 101-point quantile table, as 0..100. */
export function percentile(raw, table) {
  if (raw === null || raw === undefined || !table) return null;
  if (raw <= table[0]) return 0;
  if (raw >= table[100]) return 100;
  for (let i = 1; i <= 100; i++) {
    if (raw <= table[i]) {
      const span = table[i] - table[i - 1];
      const frac = span === 0 ? 0 : (raw - table[i - 1]) / span;
      return Math.round((i - 1 + frac) * 10) / 10;
    }
  }
  return 100;
}

// ── the dial ─────────────────────────────────────────────────────────────────
// Names and blurbs are editorial — rename freely. The BOUNDARIES are not: with a
// percentile composite (see below) each band's width IS its population share, so
// the numbers below say "4% of people are Wholly Pan, a third are Ordinary
// Primate". Change them and you are choosing how rare each verdict is.
export const BANDS = [
  { max: 4,   name: 'Wholly Pan',       blurb: 'goat-footed and unrepeatable. Nothing here could have been generated.' },
  { max: 16,  name: 'Feral',            blurb: 'you post the way weather happens.' },
  { max: 33,  name: 'Warm-Blooded',     blurb: 'irregular, embodied, occasionally asleep.' },
  { max: 66,  name: 'Ordinary Primate', blurb: 'a person on a website. The great middle of the species.' },
  { max: 83,  name: 'Augmented',        blurb: 'something in your posting keeps very good time.' },
  { max: 95,  name: 'Cyborg',           blurb: 'you have taken on the habits of the machines you talk to.' },
  { max: 100, name: 'The Loom',         blurb: 'you post like a scheduler. Prove you are alive.' },
];

export function band(score) {
  return BANDS.find((b) => score <= b.max) || BANDS[BANDS.length - 1];
}

/**
 * Score a set of readings against the baseline.
 *
 * Equal weights across the six. Weighting by anything cleverer would need a
 * ground truth for "how machine-like is this account really", which is exactly
 * the thing nobody here has — so the honest choice is the transparent one, and
 * the per-axis numbers are shown so the composite can be argued with.
 */
export function score(readings, baseline) {
  const axes = [];
  for (const a of AXES) {
    const r = readings.axes[a.key];
    const pct = percentile(r.raw, baseline.quantiles[a.key]);
    axes.push({
      key: a.key, label: a.label, line: a.line, gloss: a.gloss,
      machine: a.machine, animal: a.animal,
      raw: r.raw, pct, detail: r,
      // A budgeted axis that never filled its budget is measuring a shorter
      // corpus than the pool did, so its percentile is not a like-for-like
      // comparison. Say so rather than drawing it as if it were.
      soft: r.raw === null || r.short === true,
    });
  }
  const usable = axes.filter((a) => a.pct !== null && !a.soft);
  const rawMean = usable.length
    ? usable.reduce((s, a) => s + a.pct, 0) / usable.length
    : null;

  // ── the second normalisation, and why it is not optional ──────────────────
  // Averaging six near-uniform percentiles is the central limit theorem applied
  // to your own dial: the mean of six roughly independent U(0,100) draws has a
  // standard deviation near 12 rather than 29, so it piles up around 50. Measured
  // across the pool BEFORE this was added: 80% of accounts landed in two of the
  // seven bands, and `Wholly Pan` and `The Loom` were reached by nobody at all —
  // two verdicts that existed only in the source.
  //
  // So the mean is put back through the same treatment the axes got, against the
  // pool's distribution OF MEANS. The result is uniform on 0..100 by
  // construction, every band is reachable, and each band's width is honestly its
  // population share. It is the same operation twice, which is the point: a
  // percentile of percentiles is still a percentile.
  //
  // Older baselines have no composite table. Fall back to the raw mean rather
  // than refusing to score — a flat dial beats no dial — and say which happened.
  const table = baseline.quantiles && baseline.quantiles.__composite;
  const composite = rawMean === null ? null
    : Math.round(table ? percentile(rawMean, table) : rawMean);

  return {
    axes,
    composite,
    rawMean: rawMean === null ? null : Math.round(rawMean * 10) / 10,
    normalised: !!table,
    band: composite === null ? null : band(composite),
    measured: usable.length,
    total: AXES.length,
    pool: baseline.n,
    meta: readings.meta,
  };
}
