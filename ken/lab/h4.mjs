/* ─────────────────────────────────────────────────────────────────────
   ken/lab/h4.mjs — H4, exchangeability, on data already paid for.

   H4 (from /wp1): runs within a task are exchangeable — no drift, no order
   effect. Refuted by a non-zero slope, which would mean state is leaking
   into the measurement.

   THIS IS EXPLORATORY. The data was collected for another purpose, and by
   the time this module was written its outcome columns had already been
   looked at. Nothing here is a pre-registered test and none of it can be;
   a confirmatory version needs new runs. What it CAN do is establish
   whether the effect is worth designing against, which is what it is for.

   Outcome is turn DURATION, not quality: the loop recorded no quality
   scores at all (see /methods). Duration is a process measure, and
   exchangeability is a claim about the process.
   ───────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stats } from '../../packages/dataviz/index.mjs';
import { mulberry32 } from './simulate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP = join(HERE, '..', '..', '.github', 'loop');

const jsonl = (p) => readFileSync(p, 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).map((l) => JSON.parse(l));

/** Every recorded run, joined to the order that issued it. */
export function loadRuns(dir = LOOP) {
  const runs = jsonl(join(dir, 'runs.jsonl'));
  const issued = new Map(jsonl(join(dir, 'turns.jsonl')).map((t) => [t.turn, t]));
  const t0 = Math.min(...runs.map((r) => new Date(r.at).getTime()));
  return runs.map((r) => {
    const order = issued.get(r.turn);
    const start = new Date(order.at).getTime();
    return {
      turn: r.turn,
      bead: r.bead,
      dur: (new Date(r.at).getTime() - start) / 1000,
      hourUTC: new Date(start).getUTCHours(),
      elapsedH: (start - t0) / 3.6e6,
      probes: r.signals?.probes ?? null,
      gateFailed: r.gateFailed ? 1 : 0,
      infra: r.infra,
    };
  });
}

/** Runs shorter than this are treated as suspected infrastructure failures
 *  when the ledger does not say. Chosen from the known cases, not tuned:
 *  at 120s it catches 11 of 12 confirmed infra failures and misclassifies
 *  2 of 32 confirmed real ones. Any threshold from 90s to 200s gives the
 *  same split, so the result does not hinge on the number. */
export const INFRA_SECONDS = 120;

/**
 * Split the ledger three ways. The `infra` flag was added part-way through
 * the run, so 45 of 89 records predate it and cannot be classified from the
 * ledger alone.
 */
export function partition(runs) {
  const known = runs.filter((r) => r.infra === true);
  const confirmedReal = runs.filter((r) => r.infra === false);
  const unknown = runs.filter((r) => r.infra === undefined);
  const suspect = unknown.filter((r) => r.dur < INFRA_SECONDS);
  const clean = runs.filter((r) => r.infra !== true
    && !(r.infra === undefined && r.dur < INFRA_SECONDS));
  return {
    total: runs.length,
    knownInfra: known.length,
    confirmedReal: confirmedReal.length,
    unclassified: unknown.length,
    suspectedInfra: suspect.length,
    clean: clean.length,
    // false-positive rate of the rule on records where truth is known
    ruleFalsePositives: confirmedReal.filter((r) => r.dur < INFRA_SECONDS).length,
    ruleCatches: known.filter((r) => r.dur < INFRA_SECONDS).length,
    cleanRuns: clean,
    knownInfraRuns: known,
    confirmedRealRuns: confirmedReal,
  };
}

/** Beads with at least two clean runs, in turn order. */
export function repeatedBeads(clean) {
  const by = new Map();
  for (const r of clean) {
    if (!by.has(r.bead)) by.set(r.bead, []);
    by.get(r.bead).push(r);
  }
  return [...by.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([bead, v]) => ({ bead, runs: v.slice().sort((a, b) => a.turn - b.turn) }));
}

/** Within-bead fixed-effects slope of log duration on position in the sequence. */
function feSlope(groups) {
  const xs = [], ys = [];
  for (const g of groups) {
    const ord = g.runs.map((_, i) => i);
    const ly = g.runs.map((r) => Math.log(r.dur));
    const mo = stats.mean(ord), my = stats.mean(ly);
    for (let i = 0; i < ord.length; i++) { xs.push([ord[i] - mo]); ys.push(ly[i] - my); }
  }
  if (xs.length < 3) return null;
  const fit = stats.ols(xs, ys);
  return { slope: fit.beta[1], se: fit.se[1], n: xs.length, groups: groups.length, r2: fit.r2 };
}

/**
 * The order effect, with a permutation null. Under H4 the position labels
 * within a bead are exchangeable, so shuffling them inside each bead and
 * recomputing the slope gives the reference distribution directly. At this
 * sample size that is worth more than a t-statistic.
 */
export function orderEffect(clean, { perms = 20000, seed = 4242 } = {}) {
  const groups = repeatedBeads(clean);
  const obs = feSlope(groups);
  if (!obs) return null;

  const rng = mulberry32(seed);
  let atLeastAsExtreme = 0;
  for (let p = 0; p < perms; p++) {
    const shuffled = groups.map((g) => {
      const runs = g.runs.slice();
      for (let i = runs.length - 1; i > 0; i--) {           // Fisher–Yates
        const j = Math.floor(rng() * (i + 1));
        [runs[i], runs[j]] = [runs[j], runs[i]];
      }
      return { bead: g.bead, runs };
    });
    const s = feSlope(shuffled);
    if (s && Math.abs(s.slope) >= Math.abs(obs.slope) - 1e-12) atLeastAsExtreme++;
  }
  return {
    ...obs, perms,
    p: atLeastAsExtreme / perms,
    // a slope in log-seconds per position, reported as a multiplicative change
    perStepRatio: Math.exp(obs.slope),
  };
}

/**
 * Global drift: log duration against turn index, holding gate outcome fixed.
 *
 * The gate term is dropped when it has no variance. Without that guard a
 * subset containing only passes (or only failures) hands OLS a constant
 * column that duplicates the intercept, and the normal equations return a
 * slope of exactly zero with a standard error of exactly zero — a singular
 * fit wearing the costume of a null result. Found by a sensitivity check,
 * not by the maths.
 */
export function globalDrift(clean) {
  const gateVaries = new Set(clean.map((r) => r.gateFailed)).size > 1;
  const xs = clean.map((r) => (gateVaries ? [r.turn, r.gateFailed] : [r.turn]));
  const ys = clean.map((r) => Math.log(r.dur));
  const fit = stats.ols(xs, ys);
  const turns = clean.map((r) => r.turn);
  const span = Math.max(...turns) - Math.min(...turns);
  return {
    n: clean.length,
    slopePerTurn: fit.beta[1],
    slopeSe: fit.se[1],
    t: fit.beta[1] / fit.se[1],
    gateVaries,
    gateCoef: gateVaries ? fit.beta[2] : null,
    gateSe: gateVaries ? fit.se[2] : null,
    gateT: gateVaries ? fit.beta[2] / fit.se[2] : null,
    r2: fit.r2,
    // what the fitted drift amounts to across the whole run
    ratioAcrossRun: Math.exp(fit.beta[1] * span),
    span,
  };
}

/** Duration by hour of day, for the provider-load question. */
export function hourProfile(clean, { minN = 3 } = {}) {
  const by = new Map();
  for (const r of clean) {
    if (!by.has(r.hourUTC)) by.set(r.hourUTC, []);
    by.get(r.hourUTC).push(r.dur);
  }
  return [...by.entries()]
    .filter(([, v]) => v.length >= minN)
    .sort((a, b) => a[0] - b[0])
    .map(([hour, v]) => ({ hour, n: v.length, median: stats.median(v), mean: stats.mean(v) }));
}

/** Everything, for the report. */
export function analyse(dir = LOOP) {
  const runs = loadRuns(dir);
  const part = partition(runs);
  return {
    part,
    order: orderEffect(part.cleanRuns),
    drift: globalDrift(part.cleanRuns),
    hours: hourProfile(part.cleanRuns),
    medians: {
      knownInfra: stats.median(part.knownInfraRuns.map((r) => r.dur)),
      confirmedReal: stats.median(part.confirmedRealRuns.map((r) => r.dur)),
      clean: stats.median(part.cleanRuns.map((r) => r.dur)),
    },
  };
}
