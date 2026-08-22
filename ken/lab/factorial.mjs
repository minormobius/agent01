/* ─────────────────────────────────────────────────────────────────────
   ken/lab/factorial.mjs — the bake-off, analysed with the right error term.

   CORRECTION TO WP1 §2.3. That section called our structure a split-plot
   (Yates 1935) and said a model comparison must be judged against the
   between-model error term. The structure claim is wrong: each race runs
   ONE brief, so there is no sub-plot factor and no second error term. The
   design is a 2 (harness) × 3 (model) factorial with two replicates,
   blocked by race.

   The consequence survives the correction, for a different reason. A
   cell-to-cell comparison must still be judged against the WITHIN-CELL
   replicate variance rather than against the spread of all runs, and no
   bake-off report has done that — because none reported a standard error
   at all.

   Outcomes are duration and patch size. Neither is quality: 23 of 23
   entries passed every automated check, so quality has no variance to
   analyse. These are process measures, and the variance components they
   give are the first measured on this apparatus.
   ───────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stats } from '../../packages/dataviz/index.mjs';
import { varianceComponents, mde } from './design.mjs';
import { mulberry32 } from './simulate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, '..', '..', 'bakeoff', 'results');
export const RACES = ['race-01', 'race-02'];

export function loadBakeoff(dir = RESULTS, races = RACES) {
  const out = [];
  for (const race of races) {
    const r = JSON.parse(readFileSync(join(dir, race, 'results.json'), 'utf8'));
    for (const e of r.entries) {
      out.push({
        race, cell: `${e.harness}|${e.model}`,
        harness: e.harness, model: e.model, sample: e.sample,
        seconds: e.seconds, patchBytes: e.patchBytes,
        // race-01 recorded two zero-byte patches beside real entry directories:
        // a collection failure, not a 0-byte diff. Flagged, never silently kept.
        patchValid: !(e.patchBytes === 0 && e.hasEntry),
      });
    }
  }
  return out;
}

// ── design matrix ─────────────────────────────────────────────────────
const HARNESS_REF = 'claude';
const MODEL_REF = 'kimi3';

function terms(rows) {
  const models = [...new Set(rows.map((r) => r.model))].filter((m) => m !== MODEL_REF).sort();
  const races = [...new Set(rows.map((r) => r.race))].slice(1);
  return { models, races };
}

/** Columns for a nested model, so sums of squares come from model comparison. */
function design(rows, include, t) {
  return rows.map((r) => {
    const x = [];
    if (include.race) for (const rc of t.races) x.push(r.race === rc ? 1 : 0);
    if (include.harness) x.push(r.harness === HARNESS_REF ? 0 : 1);
    if (include.model) for (const m of t.models) x.push(r.model === m ? 1 : 0);
    if (include.interaction) {
      const h = r.harness === HARNESS_REF ? 0 : 1;
      for (const m of t.models) x.push(h * (r.model === m ? 1 : 0));
    }
    return x;
  });
}

const rss = (rows, include, t, y) => {
  const X = design(rows, include, t);
  if (!X[0].length) {                      // intercept only
    const m = stats.mean(y);
    return { rss: y.reduce((a, v) => a + (v - m) ** 2, 0), k: 0 };
  }
  const fit = stats.ols(X, y);
  return { rss: fit.rss, k: X[0].length };
};

/**
 * Two-way factorial with a race block, by sequential model comparison.
 * Returns each term's sum of squares, df, mean square and F against the
 * residual, plus the residual standard deviation — the error term a
 * cell-to-cell comparison actually needs.
 */
export function factorialAnova(rows, { outcome = 'seconds' } = {}) {
  const use = outcome === 'patchBytes' ? rows.filter((r) => r.patchValid) : rows;
  const y = use.map((r) => Math.log(r[outcome]));
  const t = terms(use);

  const steps = [
    ['race', { race: true }],
    ['harness', { race: true, harness: true }],
    ['model', { race: true, harness: true, model: true }],
    ['harness × model', { race: true, harness: true, model: true, interaction: true }],
  ];

  let prev = rss(use, {}, t, y);
  const table = [];
  for (const [name, inc] of steps) {
    const cur = rss(use, inc, t, y);
    table.push({ term: name, ss: prev.rss - cur.rss, df: cur.k - prev.k });
    prev = cur;
  }
  const dfResid = use.length - 1 - prev.k;
  const msResid = prev.rss / dfResid;
  for (const row of table) {
    row.ms = row.ss / row.df;
    row.F = row.ms / msResid;
  }
  return {
    n: use.length, table,
    residual: { ss: prev.rss, df: dfResid, ms: msResid, sd: Math.sqrt(msResid) },
    outcome,
  };
}

/** Permutation p for each term: shuffle the labels that term encodes. */
export function permuteF(rows, { outcome = 'seconds', perms = 5000, seed = 909 } = {}) {
  const observed = factorialAnova(rows, { outcome });
  const use = outcome === 'patchBytes' ? rows.filter((r) => r.patchValid) : rows;
  const rng = mulberry32(seed);
  const counts = observed.table.map(() => 0);

  for (let p = 0; p < perms; p++) {
    const shuffled = use.map((r) => ({ ...r }));
    // permute the (harness, model) assignment within race, holding the block
    for (const race of new Set(use.map((r) => r.race))) {
      const idx = shuffled.map((r, i) => (r.race === race ? i : -1)).filter((i) => i >= 0);
      const labels = idx.map((i) => ({ harness: shuffled[i].harness, model: shuffled[i].model }));
      for (let i = labels.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [labels[i], labels[j]] = [labels[j], labels[i]];
      }
      idx.forEach((i, k) => { shuffled[i].harness = labels[k].harness; shuffled[i].model = labels[k].model; });
    }
    const a = factorialAnova(shuffled, { outcome });
    a.table.forEach((row, i) => {
      if (row.term !== 'race' && row.F >= observed.table[i].F - 1e-12) counts[i]++;
    });
  }
  return observed.table.map((row, i) => ({
    term: row.term, F: row.F, df: row.df,
    p: row.term === 'race' ? null : counts[i] / perms,
  }));
}

/** Between-cell and within-cell components, per race and pooled. */
export function cellComponents(rows, { outcome = 'seconds' } = {}) {
  const use = outcome === 'patchBytes' ? rows.filter((r) => r.patchValid) : rows;
  const group = (subset) => {
    const by = new Map();
    for (const r of subset) {
      if (!by.has(r.cell)) by.set(r.cell, []);
      by.get(r.cell).push(Math.log(r[outcome]));
    }
    return [...by.values()].filter((v) => v.length > 0);
  };
  const out = { outcome, byRace: {} };
  for (const race of RACES) {
    const g = group(use.filter((r) => r.race === race));
    if (g.length >= 2 && g.some((v) => v.length > 1)) out.byRace[race] = varianceComponents(g);
  }
  out.pooled = varianceComponents(group(use));
  return out;
}

/**
 * What a cell-to-cell comparison could have detected, using the residual
 * standard deviation as the error term.
 */
export function contrastSensitivity(anovaResult, { nPerCell = 2 } = {}) {
  const sd = anovaResult.residual.sd;
  const se = sd * Math.sqrt(2 / nPerCell);
  const d = mde({ n: nPerCell });
  return {
    residualSdLog: sd,
    residualFactor: Math.exp(sd),
    seOfContrastLog: se,
    nPerCell,
    detectableD: d,
    // the smallest cell-to-cell duration ratio that design could resolve
    detectableRatio: Math.exp(d * sd),
    residualDf: anovaResult.residual.df,
  };
}

export function analyse(dir = RESULTS) {
  const rows = loadBakeoff(dir);
  const dur = factorialAnova(rows, { outcome: 'seconds' });
  return {
    n: rows.length,
    invalidPatches: rows.filter((r) => !r.patchValid).length,
    duration: {
      anova: dur,
      perm: permuteF(rows, { outcome: 'seconds' }),
      components: cellComponents(rows, { outcome: 'seconds' }),
      sensitivity: contrastSensitivity(dur),
    },
    patch: {
      anova: factorialAnova(rows, { outcome: 'patchBytes' }),
      components: cellComponents(rows, { outcome: 'patchBytes' }),
    },
  };
}
