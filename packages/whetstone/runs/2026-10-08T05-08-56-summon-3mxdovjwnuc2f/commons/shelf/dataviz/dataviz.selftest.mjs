// packages/dataviz selftest — run before changing anything in this package:
//   node packages/dataviz/dataviz.selftest.mjs
//
// Two halves:
//   1. STATS — every estimator against a KNOWN ANSWER (a planted configuration
//      whose correct output is known analytically). This is the library's
//      correctness proof; it is why the charts can be trusted with real data.
//   2. CHARTS — every chart type renders a well-formed, deterministic <svg>
//      with no NaN coordinates on representative input.
//
// Consumers keep synced copies of stats.js/charts.js; `node
// scripts/sync-dataviz.mjs --check` proves those copies are byte-identical, so
// testing the canonical source here tests what they serve.

import { stats as ST, charts as C } from "./index.mjs";

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`); }
function series(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
// deterministic pseudo-noise so the tests never flake
function noise(i, k = 1) { return Math.sin(i * 12.9898 * k) * 43758.5453 % 1; }

// ═══════════════════════ 1. STATS ═══════════════════════

// descriptive
{
  const a = [2, 4, 4, 4, 5, 5, 7, 9];
  approx(ST.mean(a), 5, 1e-12, "mean");
  approx(ST.sd(a), 2.13809, 1e-4, "sd (sample)");
  approx(ST.median([3, 1, 2]), 2, 1e-12, "median (odd)");
  approx(ST.quantile([1, 2, 3, 4], 0.5), 2.5, 1e-12, "quantile type-7");
  approx(ST.min(a), 2, 1e-12, "min"); approx(ST.max(a), 9, 1e-12, "max");
  const h = ST.histogram([1, 1, 2, 9], 4);
  ok(h.reduce((s, b) => s + b.n, 0) === 4, "histogram preserves the count");
  ok(ST.ecdf([3, 1, 2]).map(p => p.x).join() === "1,2,3", "ecdf sorts");
  const r = ST.rank([10, 30, 20, 30]);
  ok(JSON.stringify(r) === JSON.stringify([1, 3.5, 2, 3.5]), "rank averages ties");
}

// correlation + OLS against an exact line
{
  const x = [1, 2, 3, 4, 5], y = [2, 4, 6, 8, 10];   // y = 2x
  approx(ST.correlation(x, y), 1, 1e-12, "correlation of a perfect line");
  approx(ST.correlation(x, y.map(v => -v)), -1, 1e-12, "correlation flips sign");
  const fit = ST.ols(x.map(v => [v]), y);
  approx(fit.beta[1], 2, 1e-9, "OLS slope");
  approx(fit.beta[0], 0, 1e-9, "OLS intercept");
  approx(fit.r2, 1, 1e-12, "OLS R² of an exact fit");
  // two predictors: y = 1 + 2a + 3b
  const rows = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
  const y2 = rows.map(([a, b]) => 1 + 2 * a + 3 * b);
  const f2 = ST.ols(rows, y2);
  approx(f2.beta[0], 1, 1e-8, "multi-OLS intercept");
  approx(f2.beta[1], 2, 1e-8, "multi-OLS β₁");
  approx(f2.beta[2], 3, 1e-8, "multi-OLS β₂");
}

// linear algebra
{
  const A = [[4, 7], [2, 6]], inv = ST.invert(A);
  approx(inv[0][0], 0.6, 1e-9, "invert [0][0]");
  approx(inv[1][1], 0.4, 1e-9, "invert [1][1]");
  const x = ST.solve([[2, 1], [1, 3]], [5, 10]);
  approx(x[0], 1, 1e-9, "solve x₀"); approx(x[1], 3, 1e-9, "solve x₁");
  const e = ST.jacobiEig([[2, 0], [0, 1]]);
  approx(e.values[0], 2, 1e-9, "eigenvalue 1"); approx(e.values[1], 1, 1e-9, "eigenvalue 2");
}

// normal distribution helpers
{
  approx(ST.normalCdf(0), 0.5, 1e-6, "normalCdf(0)");
  approx(ST.normalCdf(1.96), 0.975, 2e-3, "normalCdf(1.96)");
  approx(ST.normalQuantile(0.5), 0, 1e-6, "normalQuantile(0.5)");
  approx(ST.normalQuantile(0.975), 1.96, 1e-3, "normalQuantile(0.975)");
  ok(ST.corrP(0.99, 100) < 0.001, "corrP tiny for a strong correlation");
  ok(ST.corrP(0.01, 100) > 0.5, "corrP large for no correlation");
}

// PCA on a planted 2-factor structure
{
  const rows = series(200, i => { const a = Math.sin(i); return [a, a * 0.95 + 0.05 * Math.cos(i), Math.cos(i * 2.3)]; });
  const P = ST.pca(rows);
  ok(P.explained[0] > P.explained[1] && P.explained[1] > P.explained[2], "PCA variance is descending");
  approx(P.explained.reduce((a, b) => a + b, 0), 1, 1e-9, "PCA explained sums to 1");
  ok(Math.abs(P.loadings[0][0]) > 0.7 && Math.abs(P.loadings[0][1]) > 0.7, "PC1 loads on the correlated pair");
  ok(Math.abs(P.loadings[0][2]) < 0.3, "PC1 ignores the independent variable");
}

// classical MDS recovers a planted planar configuration exactly
{
  const pts = [[0, 0], [3, 0], [0, 4], [3, 4], [1.5, 2]];
  const D = pts.map(a => pts.map(b => ST.euclid(a, b)));
  const m = ST.cmdscale(D, 2);
  let maxErr = 0;
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts.length; j++) maxErr = Math.max(maxErr, Math.abs(D[i][j] - ST.euclid(m.coords[i], m.coords[j])));
  approx(maxErr, 0, 1e-6, "MDS reproduces planted distances");
  approx(m.stress, 0, 1e-6, "MDS stress of an exact embedding");
}

// k-means finds planted, well-separated centroids
{
  const rows = series(150, i => (i % 3 === 0 ? [0 + noise(i) * 0.2, 0] : i % 3 === 1 ? [10 + noise(i) * 0.2, 0] : [0, 10 + noise(i) * 0.2]));
  let seed = 1; const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const km = ST.kmeans(rows, 3, rand);
  ok(km.centroids.length === 3, "k-means returns k centroids");
  ok(new Set(km.assign).size === 3, "k-means uses all three clusters");
  // every planted group lands in exactly one cluster
  const g0 = new Set(rows.map((_, i) => i).filter(i => i % 3 === 0).map(i => km.assign[i]));
  ok(g0.size === 1, "k-means keeps a planted group together");
}

// hierarchical clustering: two tight, far-apart groups merge last
{
  const rows = [[0, 0], [0.1, 0], [0, 0.1], [20, 20], [20.1, 20], [20, 20.1]];
  const hc = ST.hclust(rows);
  ok(hc.order.length === 6, "hclust orders every leaf");
  ok(hc.height > 15, "hclust root height reflects the between-group distance");
  const firstThree = hc.order.slice(0, 3).every(i => i < 3) || hc.order.slice(0, 3).every(i => i >= 3);
  ok(firstThree, "hclust leaf order keeps the planted groups contiguous");
}

// logistic regression + ROC on a separable problem
{
  const xs = series(120, i => i / 12 - 5), y = xs.map(v => (v > 0 ? 1 : 0));
  const lg = ST.logistic(xs.map(v => [v]), y);
  ok(lg.w[1] > 0, "logistic slope is positive for a positive relation");
  const rc = ST.roc(lg.probs, y);
  approx(rc.auc, 1, 0.02, "ROC AUC of a separable problem");
  const chance = ST.roc(xs.map((_, i) => noise(i)), y);
  ok(chance.auc > 0.2 && chance.auc < 0.8, "ROC AUC of noise is near chance");
}

// Poisson regression recovers a planted rate
{
  const y = series(400, i => Math.round(4 + 2 * noise(i)));
  const po = ST.poisson(y.map(() => [0]), y);
  approx(po.rate, ST.mean(y), 0.35, "Poisson intercept recovers the mean rate");
}

// LDA separates separable classes
{
  const rows = [], lab = [];
  for (let i = 0; i < 80; i++) { const c = i % 2; rows.push([c * 3 + noise(i) * 0.4, c * 2 + noise(i, 2) * 0.4]); lab.push(c); }
  const L = ST.lda(rows, lab);
  approx(L.accuracy, 1, 0.05, "LDA accuracy on separable classes");
  ok(L.confusion[0][1] + L.confusion[1][0] <= 4, "LDA makes few errors");
}

// ANOVA: identical groups → η² ≈ 0; separated groups → η² ≈ 1
{
  approx(ST.anova([[1, 2, 3], [1, 2, 3], [1, 2, 3]]).eta2, 0, 1e-9, "ANOVA η² of identical groups");
  ok(ST.anova([[1, 1, 1], [9, 9, 9]]).eta2 > 0.99, "ANOVA η² of fully separated groups");
}

// chi-square: independence → 0; perfect association → large
{
  approx(ST.chiSquare([[25, 25], [25, 25]]).X2, 0, 1e-9, "χ² of an independent table");
  const cs = ST.chiSquare([[50, 0], [0, 50]]);
  approx(cs.X2, 100, 1e-6, "χ² of a perfectly associated table");
  approx(cs.cramersV, 1, 1e-6, "Cramér's V of a perfect association");
  ok(cs.df === 1, "χ² degrees of freedom");
}

// Spearman: monotone-but-nonlinear → 1
{
  approx(ST.spearman([1, 2, 3, 4, 5], [1, 8, 27, 64, 125]), 1, 1e-12, "Spearman of a monotone cubic");
  ok(Math.abs(ST.correlation([1, 2, 3, 4, 5], [1, 8, 27, 64, 125])) < 1, "…where Pearson is < 1");
}

// signal processing
{
  const s = series(120, t => Math.sin(2 * Math.PI * t / 12) + 0.3 * Math.sin(2 * Math.PI * t / 4));
  const pg = ST.periodogram(s);
  let mi = 0; pg.power.forEach((p, i) => { if (p > pg.power[mi]) mi = i; });
  approx(pg.period[mi], 12, 0.6, "periodogram finds the planted 12-sample period");
  const ac = ST.acf(series(120, t => Math.sin(2 * Math.PI * t / 10)), 25);
  let bi = 0; ac.values.forEach((v, i) => { if (v.r > ac.values[bi].r) bi = i; });
  ok(ac.values[bi].lag === 10, "acf peaks at the planted lag");
  const det = ST.detrend(series(50, i => 5 + 2 * i));
  ok(Math.max(...det.map(Math.abs)) < 1e-8, "detrend removes an exact linear trend");
  const cp = ST.changepoints(series(100, i => (i < 50 ? 0 : 5)), 3);
  ok(cp.points.length === 1 && cp.points[0] === 50, "changepoints finds a planted step");
  approx(cp.segments[0].mean, 0, 1e-9, "changepoint segment mean (before)");
  approx(cp.segments[1].mean, 5, 1e-9, "changepoint segment mean (after)");
}

// survival
{
  const km = ST.kaplanMeier([1, 2, 3, 4, 5], [1, 1, 1, 1, 1]);
  approx(km.points[km.points.length - 1].s, 0, 1e-9, "KM falls to 0 when all fail");
  ok(km.median === 3, "KM median of a uniform failure sequence");
  const noEvents = ST.kaplanMeier([1, 2, 3], [0, 0, 0]);
  approx(noEvents.points[noEvents.points.length - 1].s, 1, 1e-9, "KM stays at 1 under full censoring");
  const lr = ST.logRank([...series(60, i => 1 + (i % 10)), ...series(60, i => 20 + (i % 10))], series(120, () => 1), series(120, i => (i < 60 ? 0 : 1)));
  ok(lr.chi > 50, "log-rank detects strongly separated arms");
  const same = ST.logRank(series(60, i => 1 + (i % 10)), series(60, () => 1), series(60, i => i % 2));
  ok(same.chi < 4, "log-rank is small for interleaved identical arms");
}

// Mahalanobis + communities
{
  const rows = series(60, i => [Math.sin(i), Math.cos(i)]); rows.push([9, 9]);
  const md = ST.mahalanobis(rows);
  ok(md[md.length - 1] > 3 * ST.median(md.slice(0, -1)), "Mahalanobis flags a planted outlier");
  const nodes = ["a", "b", "c", "d", "e", "f"];
  const edges = [{ s: "a", t: "b" }, { s: "b", t: "c" }, { s: "c", t: "a" }, { s: "d", t: "e" }, { s: "e", t: "f" }, { s: "f", t: "d" }];
  const cm = ST.communities(nodes, edges, () => 0.5);
  ok(cm.k === 2, "communities recovers two disjoint triangles");
  approx(cm.modularity, 0.5, 0.05, "modularity of two equal cliques");
}

// KDE integrates to ≈1
{
  const sample = series(200, i => noise(i) * 4 - 2);
  const xs = series(200, i => -6 + i * 0.06);
  const dens = ST.kde(sample, xs);
  const area = dens.reduce((a, d) => a + d * 0.06, 0);
  approx(area, 1, 0.05, "KDE integrates to 1");
  ok(dens.every(d => d >= 0), "KDE is non-negative");
}

// ═══════════════════════ 2. CHARTS ═══════════════════════

const pts = series(80, i => ({ x: i / 8, y: 0.6 * (i / 8) + Math.sin(i) * 0.5 + 2, g: i % 3 }));
const groups = [
  { label: "A", values: series(60, i => 2 + Math.sin(i) + i * 0.01) },
  { label: "B", values: series(60, i => 3 + Math.cos(i) * 1.2) },
  { label: "C", values: series(60, i => 1.5 + Math.sin(i * 0.7)) },
];
const matrix = [
  [1, 0.7, -0.2, 0.1, -0.5], [0.7, 1, -0.1, 0.3, -0.4], [-0.2, -0.1, 1, 0.2, 0.1],
  [0.1, 0.3, 0.2, 1, -0.3], [-0.5, -0.4, 0.1, -0.3, 1],
];

const cases = {
  scatterFit: () => C.scatterFit({ points: pts, groups: ["A", "B", "C"], xlabel: "x", ylabel: "y", annot: "r = .61" }),
  violin: () => C.violin({ groups, ylabel: "y" }),
  box: () => C.box({ groups, ylabel: "y" }),
  ridgeline: () => C.ridgeline({ groups, xlabel: "y" }),
  histogram: () => C.histogram({ values: groups[0].values, xlabel: "y" }),
  groupedBar: () => C.groupedBar({ categories: ["P", "Q", "R"], series: [{ name: "s1", values: [3, 5, 2] }, { name: "s2", values: [4, 1, 6] }], ylabel: "n" }),
  heatmap: () => C.heatmap({ matrix, labels: ["Index", "Cov", "Riv", "T4", "T5"], diverging: true, domain: [-1, 1], cblabel: "r" }),
  waterfall: () => C.waterfall({ items: [{ label: "A", value: 40 }, { label: "B", value: 15 }, { label: "Sub", value: 10 }, { label: "Unexpl.", value: 35, kind: "residual" }], ylabel: "%" }),
  forest: () => C.forest({ rows: [{ label: "Cov", est: 0.6, lo: 0.5, hi: 0.7 }, { label: "Riv", est: 0.1, lo: -0.02, hi: 0.22 }], xlabel: "effect", ref: 0 }),
  qq: () => C.qq({ values: groups[0].values }),
  line: () => C.line({ series: [{ name: "a", points: series(50, i => ({ x: i, y: Math.sin(i / 5) + 2 })) }, { name: "b", points: series(50, i => ({ x: i, y: Math.cos(i / 5) + 2 })) }], xlabel: "t", ylabel: "y" }),
  spectrum: () => { const pg = ST.periodogram(series(120, t => Math.sin(2 * Math.PI * t / 12) + 1)); return C.spectrum({ freq: pg.freq, power: pg.power, period: pg.period }); },
  scree: () => C.scree({ explained: [0.52, 0.24, 0.13, 0.07, 0.04] }),
  biplot: () => { const rows = series(120, i => [Math.sin(i), Math.sin(i) * 0.9 + 0.1 * Math.cos(i), Math.cos(i * 2.1)]); const p = ST.pca(rows); return C.biplot({ scores: p.scores.map((s, i) => ({ x: s[0], y: s[1], g: i % 3 })), loadings: [0, 1, 2].map(j => ({ x: p.loadings[0][j], y: p.loadings[1][j], label: "V" + j })), groups: ["A", "B", "C"], xlabel: "PC1", ylabel: "PC2" }); },
  clusterScatter: () => C.clusterScatter({ points: series(90, i => ({ x: Math.sin(i) * 3 + (i % 3), y: Math.cos(i) * 3, g: i % 3 })), centroids: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: -1 }], groups: ["c1", "c2", "c3"], xlabel: "f1", ylabel: "f2" }),
  dendrogram: () => { const rows = series(12, i => [Math.sin(i), Math.cos(i * 1.3)]); const hc = ST.hclust(rows); return C.dendrogram({ root: hc.root, order: hc.order, labels: rows.map((_, i) => "i" + i), ylabel: "distance" }); },
  roc: () => { const sc = series(80, i => Math.sin(i)), lb = sc.map(v => (v > 0 ? 1 : 0)); const r = ST.roc(sc, lb); return C.roc({ points: r.points, auc: r.auc }); },
  kaplanMeier: () => { const km = ST.kaplanMeier(series(60, i => 1 + (i % 17)), series(60, i => (i % 4 ? 1 : 0))); return C.kaplanMeier({ points: km.points, median: km.median }); },
  kaplanMeierMulti: () => {
    const a = ST.kaplanMeier(series(40, i => 1 + (i % 11)), series(40, () => 1));
    const b = ST.kaplanMeier(series(40, i => 4 + (i % 15)), series(40, () => 1));
    return C.kaplanMeier({ curves: [{ name: "low", points: a.points }, { name: "high", points: b.points }] });
  },
  lollipop: () => C.lollipop({ items: [{ label: "aa", value: 3 }, { label: "bb", value: -1.2 }, { label: "cc", value: 5 }], xlabel: "score" }),
  logisticCurve: () => C.logisticCurve({ points: series(70, i => ({ x: i / 7, y: i > 35 ? 1 : 0 })), curve: series(30, i => ({ x: i / 3, p: 1 / (1 + Math.exp(-(i / 3 - 5))) })), xlabel: "x" }),
  stem: () => { const a = ST.acf(series(100, t => Math.sin(2 * Math.PI * t / 10)), 20); return C.stem({ values: a.values, ci: a.ci }); },
  stackedBar: () => C.stackedBar({ categories: ["P", "Q", "R"], series: [{ name: "s1", values: [3, 5, 2] }, { name: "s2", values: [4, 1, 6] }, { name: "s3", values: [2, 2, 2] }] }),
  network: () => C.network({ nodes: series(14, i => ({ id: "n" + i, g: i % 2, deg: 3 })), edges: series(18, i => ({ s: "n" + (i % 14), t: "n" + ((i * 3 + 1) % 14) })), groups: ["A", "B"] }),
  hexbin: () => C.hexbin({ points: series(300, i => ({ x: Math.sin(i) * 3 + Math.sin(i * 0.7), y: Math.cos(i * 1.1) * 3 })), xlabel: "x", ylabel: "y" }),
  lineSegments: () => C.line({ series: [{ name: "y", points: series(60, i => ({ x: i, y: i < 30 ? 1 : 4 })) }], vlines: [{ x: 30, label: "cp" }], segments: [{ x0: 0, x1: 30, y: 1 }, { x0: 30, x1: 59, y: 4 }], xlabel: "t", ylabel: "y" }),
};

for (const name of Object.keys(cases)) {
  let svg;
  try { svg = cases[name](); } catch (e) { failures++; console.error("  ✗ " + name + " threw: " + e.message); continue; }
  ok(typeof svg === "string" && svg.indexOf("<svg") === 0, name + ": returns an <svg> string");
  ok(svg.indexOf("viewBox") > 0, name + ": has a viewBox");
  ok(svg.indexOf("NaN") < 0, name + ": no NaN coordinates");
  ok(svg.indexOf("undefined") < 0, name + ": no undefined in output");
  ok(svg.trim().endsWith("</svg>"), name + ": closes the svg");
  ok(cases[name]() === svg, name + ": deterministic");
}

// colour helpers
ok(/^#[0-9a-f]{6}$/i.test(C.seq(0.5)), "sequential colour is a hex");
ok(/^#[0-9a-f]{6}$/i.test(C.div(-0.3)), "diverging colour is a hex");
ok(C.CAT.length >= 6, "categorical palette has >= 6 colours");

const nCharts = Object.keys(cases).length;
if (failures === 0) {
  console.log(`✓ packages/dataviz selftest passed (stats known-answer suite + ${nCharts} chart renders)`);
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
