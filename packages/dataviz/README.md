# `packages/dataviz` — statistics + publication-quality SVG charts

Two standalone JS files, **no dependencies and no build step**, in the same
spirit as `packages/atproto/`. They render real figures from real numbers; they
know nothing about any particular project.

| File | What it is |
|---|---|
| **`stats.js`** | A dependency-free statistics core (`WORMHOLE_STATS`) |
| **`charts.js`** | 24 publication-quality SVG chart types (`WORMHOLE_CHARTS`) |
| **`index.mjs`** | ESM facade — `import { stats, charts } from '…/index.mjs'` |
| **`dataviz.selftest.mjs`** | Known-answer proofs for every estimator + a render of every chart |

## Using it

**From a module (Worker, node, bundled app):**

```js
import { stats, charts } from '../../packages/dataviz/index.mjs';

const fit = stats.ols(xs.map(x => [x]), ys);          // slope, SEs, R², AIC
const svg = charts.scatterFit({ points, xlabel: 'dose', ylabel: 'response' });
```

**From a plain `<script>` (no bundler):** the files attach to `globalThis`, so
load them in order and use the globals.

```html
<script src="/stats.js"></script>
<script src="/charts.js"></script>
<script>
  const svg = WORMHOLE_CHARTS.histogram({ values, xlabel: 'x' });
  document.getElementById('fig').innerHTML = svg;
</script>
```

**Static sites that serve these as assets** can't import across directories (the
browser fetches `/stats.js` from the site's own asset root), so they keep a
byte-identical copy in their own directory. Keep it honest with:

```bash
node scripts/sync-dataviz.mjs --check   # CI: fail if a copy has drifted
node scripts/sync-dataviz.mjs --write   # refresh copies from the canonical source
```

**Edit `packages/dataviz/`, never a copy.** Add new consumers to `CONSUMERS` in
that script. Current consumer: `wormhole/`.

## `stats.js`

Everything is a pure function over plain arrays.

- **Descriptive** — `sum` `mean` `variance` `sd` `min` `max` `quantile` (type-7)
  `median` `histogram` `ecdf` `kde` (Gaussian, Silverman bandwidth) `rank`
- **Inference** — `correlation` `spearman` `corrP` `normalCdf` `normalQuantile`
  `anova` (η², F) `chiSquare` (X², df, standardized residuals, Cramér's V)
  `logRank`
- **Models** — `ols` (k predictors via normal equations + Gaussian elimination;
  returns β, SEs, residuals, R², AIC) `logistic` `poisson` (log link) `lda`
  (two-class, with confusion matrix) `kaplanMeier` `roc` (curve + AUC)
- **Structure** — `jacobiEig` `pca` `cmdscale` (classical MDS + Kruskal stress)
  `kmeans` (Lloyd + k-means++) `hclust` (average linkage) `communities` (label
  propagation + modularity) `mahalanobis` `euclid` `solve` `invert`
- **Signal** — `detrend` `periodogram` (DFT) `acf` `changepoints` (binary
  segmentation)

## `charts.js`

Each function takes an options object (`{…, width, height}`) and returns an
`<svg>` **string** — so charts render server-side in a Worker, in node for
snapshot tests, or client-side by assigning to `innerHTML`.

`scatterFit` · `violin` · `box` · `ridgeline` · `histogram` · `groupedBar` ·
`heatmap` · `waterfall` · `forest` · `qq` · `line` · `spectrum` · `scree` ·
`biplot` · `clusterScatter` · `dendrogram` · `roc` · `kaplanMeier` · `lollipop` ·
`logisticCurve` · `stem` · `stackedBar` · `network` · `hexbin`

Design rules baked in (from the `dataviz` skill):

- **Colour by job, never cycled.** Categorical = Okabe–Ito (validated
  colourblind-safe: worst adjacent pair ΔE 11.0 deutan); sequential = viridis;
  diverging = blue–gray–red with a neutral midpoint.
- **Legends are placed in the emptiest quadrant** of the plot area, over a
  translucent backing, so they never sit on the data.
- Thin marks, recessive grid and axes, direct value labels only where they earn
  their place, `aria-label` on every figure.
- Axes auto-pick nice ticks; k-notation is reserved for genuinely large
  magnitudes so year axes read `1850`, not `1.9k`.

## Testing

```bash
node packages/dataviz/dataviz.selftest.mjs
```

The stats half is a **known-answer suite**: each estimator runs on a planted
configuration whose correct output is known analytically — MDS reproduces a
planted planar layout to 1e-6, `changepoints` finds a planted step exactly, the
periodogram recovers a seeded period, ANOVA gives η² ≈ 0 for identical groups and
≈ 1 for separated ones, `communities` recovers two disjoint triangles at Q = 0.5.
That suite is why the charts can be pointed at real data. The charts half renders
every type and asserts well-formed, deterministic SVG with no `NaN` coordinates.

Run it before changing anything here, and re-run `scripts/sync-dataviz.mjs
--write` afterwards so consumers pick the change up.
