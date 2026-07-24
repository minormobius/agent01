// wormhole — WORMHOLE_GENOME, the genome of the graph pack.
//
// Charts don't stand alone: they fall out of a path through a grammar of
// analysis — a DATA TYPE (what shape is the evidence) crossed with an ANSWER
// TYPE (what question is asked) selects a TECHNIQUE, and the technique yields
// its CHARTS. This module is that grammar as an inspectable, expandable data
// structure: DATA_TYPES × ANSWER_TYPES, and a registry of TECHNIQUES that live
// on the edges between them. Adding one technique row lights up new cells.
//
// Each technique can `build(seed)` a synthetic (fabricated) dataset, run the
// real statistic over it (WORMHOLE_STATS), and render its figures
// (WORMHOLE_CHARTS) with a computed one-line finding — the same
// figures-are-the-evidence contract as the paper engine, exposed on its own.
//
// Deterministic; self-contained (own PRNG) so it runs in worker/browser/node.
// Depends only on stats.js + charts.js. The /lab roulette renders from here.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var ST = NS.WORMHOLE_STATS, CH = NS.WORMHOLE_CHARTS;
  if (!ST || !CH) throw new Error("genome.js requires stats.js + charts.js");
  var G = NS.WORMHOLE_GENOME = NS.WORMHOLE_GENOME || {};

  // ---- seeded PRNG (self-contained) ----
  function xmur3(s) { var h = 1779033703 ^ s.length; for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function Rand(seed) {
    var nx = mulberry32(xmur3(String(seed))());
    var self = { f: nx, int: function (a, b) { return a + Math.floor(nx() * (b - a + 1)); }, pick: function (a) { return a[Math.floor(nx() * a.length)]; }, chance: function (p) { return nx() < p; },
      sample: function (a, k) { var pool = a.slice(), o = []; k = Math.min(k, pool.length); for (var i = 0; i < k; i++) { var j = Math.floor(nx() * pool.length); o.push(pool[j]); pool.splice(j, 1); } return o; },
      gauss: function () { var u1 = Math.max(1e-9, nx()), u2 = nx(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); } };
    return self;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dot(x) { var v = (Math.round(x * 100) / 100).toFixed(2); return v.replace(/^0\./, ".").replace(/^-0\./, "-."); }
  function d2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function fmtP(p) { return p < 0.001 ? "< .001" : p < 0.01 ? "< .01" : p < 0.05 ? "< .05" : "= ." + String(Math.round(p * 100)).padStart(2, "0"); }
  function affine(a, span, base) { var lo = ST.min(a), hi = ST.max(a), rg = (hi - lo) || 1; return a.map(function (x) { return (x - lo) / rg * span + base; }); }

  var NOUNS = ["porosity", "salinity", "albedo", "rugosity", "entropy", "turbidity", "viscosity", "luminance", "sinuosity", "density", "acidity", "chroma", "tempo", "cadence", "dispersal", "fecundity", "latency", "sonority", "torsion", "pallor"];
  var GROUPS = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta"];

  // ---- the two axes of the grammar ----
  var DATA_TYPES = {
    continuous: { label: "continuous pair", glyph: "∿", blurb: "two real-valued measurements per case" },
    grouped: { label: "grouped measure", glyph: "▟", blurb: "one measurement split across labelled groups" },
    categorical: { label: "two categoricals", glyph: "▦", blurb: "each case tagged on two nominal factors" },
    timeseries: { label: "time series", glyph: "↝", blurb: "one measurement indexed by time" },
    multivariate: { label: "multivariate", glyph: "⋮⋮", blurb: "many measurements per case" },
    distances: { label: "distance matrix", glyph: "◇", blurb: "pairwise similarity between items" },
    survival: { label: "durations", glyph: "⧖", blurb: "time-to-event with right-censoring" },
    labelled: { label: "labelled features", glyph: "◐", blurb: "features paired with a binary outcome" },
    univariate: { label: "one variable", glyph: "|", blurb: "a single measured quantity" },
    ranked: { label: "scored entities", glyph: "≡", blurb: "a value (with error) per entity" },
    counts: { label: "event counts", glyph: "#", blurb: "non-negative counts, often over exposure" },
    network: { label: "network", glyph: "⁂", blurb: "entities joined by edges" }
  };
  var ANSWER_TYPES = {
    association: { label: "association", glyph: "∝", blurb: "is X related to Y?" },
    difference: { label: "difference", glyph: "≠", blurb: "do the groups differ?" },
    trend: { label: "temporal", glyph: "↗", blurb: "is there a pattern over time?" },
    reduction: { label: "reduction", glyph: "⊙", blurb: "what latent axes organise it?" },
    clustering: { label: "clustering", glyph: "❋", blurb: "what natural groups exist?" },
    hierarchy: { label: "hierarchy", glyph: "⑃", blurb: "how do items nest?" },
    dependence: { label: "dependence", glyph: "⊞", blurb: "what is the correlation web?" },
    classification: { label: "classification", glyph: "⊘", blurb: "can we predict the label?" },
    survival: { label: "survival", glyph: "⤓", blurb: "how does risk unfold in time?" },
    distribution: { label: "distribution", glyph: "◨", blurb: "what shape is the variable?" },
    anomaly: { label: "anomaly", glyph: "⚠", blurb: "which cases are outliers?" }
  };

  // ---- technique builders ----
  function T_ols(r) {
    var xN = r.pick(NOUNS), yN = r.pick(NOUNS.filter(function (n) { return n !== xN; }));
    var n = r.int(90, 200), b = 0.5 + r.f() * 1.3, g = r.gauss;
    var rawx = [], rawy = [], sub = [];
    for (var i = 0; i < n; i++) { var x = g(); rawx.push(x); rawy.push(b * x + g() * (0.6 + r.f() * 0.6)); sub.push(r.int(0, 2)); }
    var xs = affine(rawx, 8 + r.f() * 5, 1), ys = affine(rawy, 5 + r.f() * 3, 0.4);
    var pts = xs.map(function (x, i) { return { x: x, y: ys[i], g: sub[i] }; });
    var rr = ST.correlation(xs, ys), fit = ST.ols(xs.map(function (x) { return [x]; }), ys);
    var resid = ys.map(function (y, i) { return y - (fit.beta[0] + fit.beta[1] * xs[i]); });
    return {
      data: n + " cases, each with " + xN + " and " + yN + ".",
      reported: { r: dot(rr), "R²": dot(fit.r2), slope: d2(fit.beta[1]), p: fmtP(ST.corrP(rr, n)) },
      finding: cap(yN) + " rises with " + xN + " (r = " + dot(rr) + ", p " + fmtP(ST.corrP(rr, n)) + "); the fit explains " + Math.round(fit.r2 * 100) + "% of the variance.",
      figures: [
        { svg: CH.scatterFit({ points: pts, groups: ["site A", "site B", "site C"], xlabel: xN, ylabel: yN, annot: "r = " + dot(rr) }), caption: "Ordinary least-squares fit of " + yN + " on " + xN + " with a 95% mean-response band." },
        { svg: CH.histogram({ values: resid, xlabel: "residual", colorIndex: 2 }), caption: "Residuals are centred and unimodal — the linear model is adequate." }
      ]
    };
  }

  function T_anova(r) {
    var yN = r.pick(NOUNS), k = r.int(3, 5), g = r.gauss;
    var names = r.sample(GROUPS, k), lat = names.map(function () { return (r.f() - 0.5) * 3; });
    var groups = names.map(function (nm, gi) { var v = []; for (var i = 0; i < r.int(30, 60); i++) v.push(lat[gi] + g() * (0.8 + r.f() * 0.4)); return v; });
    var all = [].concat.apply([], groups); var disp = affine(all, 5, 0.5);
    var off = 0, by = names.map(function (nm, gi) { var vals = []; for (var i = 0; i < groups[gi].length; i++) vals.push(disp[off++]); return { label: nm, values: vals }; });
    var an = ST.anova(by.map(function (b) { return b.values; })), pooled = ST.sd([].concat.apply([], by.map(function (b) { return b.values; }))) || 1;
    var dm = by.map(function (a, i) { return by.map(function (b, j) { return i === j ? 0 : (ST.mean(a.values) - ST.mean(b.values)) / pooled; }); });
    var dmax = 0; dm.forEach(function (row) { row.forEach(function (v) { dmax = Math.max(dmax, Math.abs(v)); }); });
    return {
      data: k + " groups of " + yN + " measurements.",
      reported: { groups: k, "η²": dot(an.eta2), F: d2(an.F) },
      finding: "The " + k + " groups differ in " + yN + " (η² = " + dot(an.eta2) + "); the sharpest contrast reaches d = " + d2(dmax) + ".",
      figures: [
        { svg: CH.violin({ groups: by, ylabel: yN }), caption: "Distribution of " + yN + " by group (violin with inner quartile box)." },
        { svg: CH.heatmap({ matrix: dm, rowLabels: names, colLabels: names, diverging: true, domain: [-Math.max(1, dmax), Math.max(1, dmax)], cblabel: "d" }), caption: "Pairwise standardized mean differences (Cohen's d) between groups." }
      ]
    };
  }

  function T_pca(r) {
    var p = r.int(4, 6), n = r.int(120, 220), g = r.gauss, labels = r.sample(NOUNS, p).map(function (s) { return cap(s).slice(0, 7); });
    var lA = [], lB = []; for (var j = 0; j < p; j++) { lA.push(g()); lB.push(g()); }
    var k = r.int(2, 3), gc = []; for (var c = 0; c < k; c++) gc.push([(r.f() - 0.5) * 3, (r.f() - 0.5) * 3]);
    var rows = [], gi = []; for (var i = 0; i < n; i++) { var gg = r.int(0, k - 1), fa = gc[gg][0] + g(), fb = gc[gg][1] + g(); var row = []; for (j = 0; j < p; j++) row.push(lA[j] * fa + lB[j] * fb + 0.6 * g()); rows.push(row); gi.push(gg); }
    var P = ST.pca(rows), pc12 = Math.round((P.explained[0] + P.explained[1]) * 100);
    var scores = P.scores.map(function (s, i) { return { x: s[0], y: s[1], g: gi[i] }; });
    var loadings = labels.map(function (lab, j) { return { x: P.loadings[0][j], y: P.loadings[1][j], label: lab }; });
    return {
      data: p + " variables measured on " + n + " cases.",
      reported: { variables: p, "PC1+PC2": pc12 + "%", "PC1": Math.round(P.explained[0] * 100) + "%" },
      finding: "Two components capture " + pc12 + "% of the variance; the cloud is essentially 2-dimensional.",
      figures: [
        { svg: CH.scree({ explained: P.explained.slice(0, Math.min(6, p)) }), caption: "Scree plot: variance explained per principal component." },
        { svg: CH.biplot({ scores: scores, loadings: loadings, groups: r.sample(GROUPS, k), xlabel: "PC1 (" + Math.round(P.explained[0] * 100) + "%)", ylabel: "PC2 (" + Math.round(P.explained[1] * 100) + "%)" }), caption: "Biplot: case scores on PC1–PC2 with variable loadings as vectors." }
      ]
    };
  }

  function T_spectral(r) {
    var yN = r.pick(NOUNS), Tn = r.int(80, 130), period = r.pick([4, 5, 7, 11, 12, 22]), amp = 1 + r.f() * 1.4, ph = r.f() * 6.28, g = r.gauss;
    var raw = []; for (var t = 0; t < Tn; t++) raw.push(3 + t * (r.f() - 0.4) * 0.02 + amp * Math.sin(2 * Math.PI * t / period + ph) + (0.5 + r.f() * 0.6) * g());
    var disp = affine(raw, 6, 1), series = disp.map(function (v, i) { return { x: 1900 + i, y: v }; });
    var pg = ST.periodogram(disp); var mi = 0; pg.power.forEach(function (pw, i) { if (pw > pg.power[mi]) mi = i; });
    var share = Math.round(pg.power[mi] / (pg.power.reduce(function (a, b) { return a + b; }, 0) || 1) * 100);
    return {
      data: Tn + " annual values of " + yN + ".",
      reported: { years: Tn, period: d2(pg.period[mi]) + " yr", power: share + "%" },
      finding: "The " + yN + " series is dominated by a " + d2(pg.period[mi]) + "-year cycle carrying " + share + "% of the detrended power.",
      figures: [
        { svg: CH.line({ series: [{ name: yN, points: series }], xlabel: "year", ylabel: yN }), caption: "The " + yN + " series over " + Tn + " years." },
        { svg: CH.spectrum({ freq: pg.freq, power: pg.power, period: pg.period }), caption: "Periodogram of the detrended series; the dominant period is marked." }
      ]
    };
  }

  function T_corr(r) {
    var p = 5, n = r.int(120, 220), g = r.gauss, labels = r.sample(NOUNS, p).map(function (s) { return cap(s).slice(0, 8); });
    var f1 = [], f2 = []; for (var i = 0; i < n; i++) { f1.push(g()); f2.push(g()); }
    var cols = []; for (var j = 0; j < p; j++) { var a = r.f() * 2 - 1, b = r.f() * 2 - 1; cols.push(f1.map(function (v, i) { return a * v + b * f2[i] + 0.7 * g(); })); }
    var M = cols.map(function (a) { return cols.map(function (b) { return ST.correlation(a, b); }); });
    var best = { v: 0, i: 0, j: 1 }; for (var a2 = 0; a2 < p; a2++) for (var b2 = a2 + 1; b2 < p; b2++) if (Math.abs(M[a2][b2]) > Math.abs(best.v)) best = { v: M[a2][b2], i: a2, j: b2 };
    return {
      data: p + " variables on " + n + " cases.",
      reported: { variables: p, "strongest |r|": dot(Math.abs(best.v)) },
      finding: "The correlation web is dominated by " + labels[best.i] + "↔" + labels[best.j] + " (r = " + dot(best.v) + ").",
      figures: [
        { svg: CH.heatmap({ matrix: M, labels: labels, diverging: true, domain: [-1, 1], cblabel: "r" }), caption: "Pairwise Pearson correlations among the " + p + " variables." },
        { svg: CH.scatterFit({ points: cols[best.i].map(function (x, i) { return { x: x, y: cols[best.j][i], g: 0 }; }), xlabel: labels[best.i], ylabel: labels[best.j], annot: "r = " + dot(best.v) }), caption: "The strongest pair, plotted with its regression fit." }
      ]
    };
  }

  function T_kmeans(r) {
    var k = r.int(2, 4), n = r.int(120, 200), g = r.gauss, cx = [];
    for (var c = 0; c < k; c++) cx.push([(r.f() - 0.5) * 8, (r.f() - 0.5) * 8]);
    var rows = []; for (var i = 0; i < n; i++) { var t = r.int(0, k - 1); rows.push([cx[t][0] + g() * 1.4, cx[t][1] + g() * 1.4]); }
    var km = ST.kmeans(rows, k, r.f);
    var pts = rows.map(function (row, i) { return { x: row[0], y: row[1], g: km.assign[i] }; });
    var sizes = []; for (c = 0; c < k; c++) sizes.push({ label: "cluster " + (c + 1), value: km.assign.filter(function (a) { return a === c; }).length, g: c });
    return {
      data: n + " cases in a 2-D feature space.",
      reported: { k: k, "within-SS": Math.round(km.wss) },
      finding: "k-means resolves " + k + " compact clusters; within-cluster scatter is " + Math.round(km.wss) + ".",
      figures: [
        { svg: CH.clusterScatter({ points: pts, centroids: km.centroids.map(function (c) { return { x: c[0], y: c[1] }; }), groups: sizes.map(function (s) { return s.label; }), xlabel: "feature 1", ylabel: "feature 2" }), caption: "k-means assignment (colour) with centroids marked ×." },
        { svg: CH.lollipop({ items: sizes, xlabel: "cluster size" }), caption: "Cluster sizes." }
      ]
    };
  }

  function T_hclust(r) {
    var m = r.int(10, 18), p = r.int(3, 5), g = r.gauss, labels = [];
    for (var i = 0; i < m; i++) labels.push(r.pick(GROUPS).slice(0, 3) + "-" + (i + 1));
    var k = r.int(2, 3), cx = []; for (var c = 0; c < k; c++) { var v = []; for (var j = 0; j < p; j++) v.push((r.f() - 0.5) * 5); cx.push(v); }
    var rows = []; for (i = 0; i < m; i++) { var t = r.int(0, k - 1); var row = []; for (j = 0; j < p; j++) row.push(cx[t][j] + g()); rows.push(row); }
    var hc = ST.hclust(rows);
    var D = rows.map(function (a) { return rows.map(function (b) { return ST.euclid(a, b); }); });
    var Dord = hc.order.map(function (i) { return hc.order.map(function (j) { return D[i][j]; }); });
    var ordLabels = hc.order.map(function (i) { return labels[i]; });
    return {
      data: m + " items described by " + p + " features.",
      reported: { items: m, "tree height": d2(hc.height) },
      finding: "Average-linkage clustering nests the " + m + " items into a small number of tight groups.",
      figures: [
        { svg: CH.dendrogram({ root: hc.root, order: hc.order, labels: labels, ylabel: "distance" }), caption: "Dendrogram (average linkage) over the " + m + " items." },
        { svg: CH.heatmap({ matrix: Dord, rowLabels: ordLabels, colLabels: ordLabels, diverging: false, cblabel: "dist", cell: 20, labelW: 62, labelT: 46 }), caption: "Distance matrix reordered by the dendrogram — blocks reveal the clusters." }
      ]
    };
  }

  function T_logistic(r) {
    var xN = r.pick(NOUNS), n = r.int(120, 220), b = 1.2 + r.f() * 1.6, g = r.gauss;
    var rawx = [], y = []; for (var i = 0; i < n; i++) { var x = g(); rawx.push(x); var pr = 1 / (1 + Math.exp(-(b * x))); y.push(r.f() < pr ? 1 : 0); }
    var xs = affine(rawx, 10, 0);
    var lg = ST.logistic(xs.map(function (x) { return [x]; }), y);
    var rc = ST.roc(lg.probs, y);
    var curve = []; for (var t = 0; t <= 40; t++) { var xv = ST.min(xs) + (ST.max(xs) - ST.min(xs)) * t / 40; var z = (xv - lg.mean[0]) / lg.sd[0]; curve.push({ x: xv, p: 1 / (1 + Math.exp(-(lg.w[0] + lg.w[1] * z))) }); }
    return {
      data: n + " cases: " + xN + " and a yes/no outcome.",
      reported: { n: n, AUC: d2(rc.auc) },
      finding: "Higher " + xN + " predicts the positive class (AUC = " + d2(rc.auc) + ").",
      figures: [
        { svg: CH.logisticCurve({ points: xs.map(function (x, i) { return { x: x, y: y[i] }; }), curve: curve, xlabel: xN }), caption: "Fitted logistic curve; points are the binary outcomes (jittered)." },
        { svg: CH.roc({ points: rc.points, auc: rc.auc }), caption: "ROC curve; the diagonal is chance." }
      ]
    };
  }

  function T_survival(r) {
    var n = r.int(80, 160), rate = 0.06 + r.f() * 0.1, g = r.f;
    var times = [], events = [];
    for (var i = 0; i < n; i++) { var t = -Math.log(Math.max(1e-6, g())) / rate, cens = -Math.log(Math.max(1e-6, g())) / (rate * 0.6); if (t <= cens) { times.push(+t.toFixed(1)); events.push(1); } else { times.push(+cens.toFixed(1)); events.push(0); } }
    var km = ST.kaplanMeier(times, events);
    return {
      data: n + " durations, " + events.filter(function (e) { return e; }).length + " events and the rest censored.",
      reported: { n: n, "median survival": km.median != null ? d2(km.median) : "not reached" },
      finding: "Median survival is " + (km.median != null ? d2(km.median) : "not reached") + "; risk accrues " + (rate > 0.11 ? "quickly" : "gradually") + ".",
      figures: [
        { svg: CH.kaplanMeier({ points: km.points, median: km.median, xlabel: "time", ylabel: "survival S(t)" }), caption: "Kaplan–Meier survival curve with the median marked." },
        { svg: CH.histogram({ values: times, xlabel: "observed duration", colorIndex: 2 }), caption: "Distribution of observed durations (events + censored)." }
      ]
    };
  }

  function T_distribution(r) {
    var xN = r.pick(NOUNS), n = r.int(140, 260), g = r.gauss, skew = r.chance(0.5);
    var vals = []; for (var i = 0; i < n; i++) { var v = g(); if (skew) v = Math.exp(v * 0.6); vals.push(v); }
    var disp = affine(vals, 8, 1);
    return {
      data: n + " measurements of " + xN + ".",
      reported: { n: n, mean: d2(ST.mean(disp)), SD: d2(ST.sd(disp)), skewed: skew ? "yes" : "no" },
      finding: "The distribution of " + xN + " is " + (skew ? "right-skewed — a normal model would misfit the tail" : "close to normal") + ".",
      figures: [
        { svg: CH.histogram({ values: disp, xlabel: xN }), caption: "Histogram of " + xN + " with a kernel-density overlay." },
        { svg: CH.qq({ values: disp }), caption: "Normal Q–Q plot; departure from the line flags non-normality." }
      ]
    };
  }

  function T_contingency(r) {
    var rN = r.int(3, 4), cN = r.int(3, 4), g = r.gauss;
    var rowsL = r.sample(GROUPS, rN), colsL = r.sample(["low", "mid", "high", "none", "some", "many"], cN);
    var M = []; for (var i = 0; i < rN; i++) { var row = []; for (var j = 0; j < cN; j++) row.push(r.int(2, 40) + (i === j ? r.int(10, 40) : 0)); M.push(row); }
    var series = colsL.map(function (cl, j) { return { name: cl, values: rowsL.map(function (_, i) { return M[i][j]; }) }; });
    return {
      data: "counts cross-tabulated on two " + rN + "×" + cN + " factors.",
      reported: { rows: rN, cols: cN },
      finding: "Counts concentrate on the diagonal — the two factors are associated, not independent.",
      figures: [
        { svg: CH.heatmap({ matrix: M, rowLabels: rowsL, colLabels: colsL, diverging: false, cblabel: "count", cell: 30, labelW: 70, labelT: 40 }), caption: "Contingency table as a heatmap of counts." },
        { svg: CH.groupedBar({ categories: rowsL, series: series, ylabel: "count" }), caption: "The same counts as grouped bars." }
      ]
    };
  }

  function T_ranking(r) {
    var kN = r.int(6, 10), metric = r.pick(NOUNS), g = r.gauss;
    var items = []; for (var i = 0; i < kN; i++) { var est = g() * 1.5; var se = 0.2 + r.f() * 0.5; items.push({ label: r.pick(GROUPS).slice(0, 3) + "-" + (i + 1), value: est, se: se }); }
    items.sort(function (a, b) { return b.value - a.value; });
    return {
      data: kN + " entities scored on " + metric + " with uncertainty.",
      reported: { entities: kN, "top": items[0].label },
      finding: items[0].label + " ranks highest on " + metric + ", but its interval overlaps the runner-up — the lead is not decisive.",
      figures: [
        { svg: CH.lollipop({ items: items.map(function (it) { return { label: it.label, value: it.value }; }), xlabel: metric + " (standardized)" }), caption: "Entities ranked by " + metric + "." },
        { svg: CH.forest({ rows: items.map(function (it) { return { label: it.label, est: it.value, lo: it.value - 1.96 * it.se, hi: it.value + 1.96 * it.se }; }), xlabel: metric + " (95% CI)", ref: 0 }), caption: "The same ranking with 95% confidence intervals — overlaps show which ranks are ambiguous." }
      ]
    };
  }

  function T_mds(r) {
    var m = r.int(12, 20), p = r.int(3, 5), g = r.gauss, k = r.int(2, 3);
    var labels = []; for (var i = 0; i < m; i++) labels.push(r.pick(GROUPS).slice(0, 3) + "-" + (i + 1));
    var cx = []; for (var c = 0; c < k; c++) { var v = []; for (var j = 0; j < p; j++) v.push((r.f() - 0.5) * 6); cx.push(v); }
    var rows = [], gi = [];
    for (i = 0; i < m; i++) { var t = r.int(0, k - 1); gi.push(t); var row = []; for (j = 0; j < p; j++) row.push(cx[t][j] + g()); rows.push(row); }
    var D = rows.map(function (a) { return rows.map(function (b) { return ST.euclid(a, b); }); });
    var md = ST.cmdscale(D, 2);
    var pts = md.coords.map(function (co, i2) { return { x: co[0], y: co[1], g: gi[i2] }; });
    var shep = md.pairs.map(function (pr) { return { x: pr.orig, y: pr.emb, g: 0 }; });
    return {
      data: "a " + m + "×" + m + " distance matrix between items.",
      reported: { items: m, stress: dot(md.stress) },
      finding: "Two MDS dimensions reproduce the distances with stress " + dot(md.stress) + " — the items lie close to a plane.",
      figures: [
        { svg: CH.clusterScatter({ points: pts, groups: r.sample(GROUPS, k), xlabel: "MDS 1", ylabel: "MDS 2" }), caption: "Classical multidimensional scaling of the distance matrix into two dimensions." },
        { svg: CH.scatterFit({ points: shep, xlabel: "original distance", ylabel: "embedded distance" }), caption: "Shepard plot: embedded against original distances; tight scatter means a faithful embedding." }
      ]
    };
  }

  function T_changepoint(r) {
    var yN = r.pick(NOUNS), Tn = r.int(80, 140), g = r.gauss, nCp = r.int(1, 2);
    var cuts = []; for (var c = 0; c < nCp; c++) cuts.push(r.int(Math.floor(Tn * 0.25), Math.floor(Tn * 0.75)));
    cuts.sort(function (a, b) { return a - b; });
    var levels = [0]; for (c = 0; c < nCp; c++) levels.push(levels[levels.length - 1] + (r.chance(0.5) ? 1 : -1) * (1.5 + r.f() * 2));
    var raw = []; for (var t = 0; t < Tn; t++) { var seg = 0; for (c = 0; c < cuts.length; c++) if (t >= cuts[c]) seg = c + 1; raw.push(levels[seg] + g() * 0.75); }
    var y = affine(raw, 6, 1), y0 = 1900;
    var cp = ST.changepoints(y, 3);
    var series = y.map(function (v, i) { return { x: y0 + i, y: v }; });
    return {
      data: Tn + " sequential observations of " + yN + ".",
      reported: { n: Tn, changepoints: cp.points.length, "at": cp.points.map(function (i) { return y0 + i; }).join(", ") || "none" },
      finding: cp.points.length ? "Binary segmentation locates " + cp.points.length + " level shift" + (cp.points.length > 1 ? "s" : "") + "; the series is piecewise stationary, not smoothly trending." : "No level shift survives the segmentation criterion — the series is stationary in mean.",
      figures: [
        { svg: CH.line({ series: [{ name: yN, points: series }], xlabel: "index", ylabel: yN, vlines: cp.points.map(function (i) { return { x: y0 + i, label: "shift" }; }), segments: cp.segments.map(function (s) { return { x0: y0 + s.start, x1: y0 + s.end - 1, y: s.mean }; }) }), caption: "The series with detected changepoints (dashed) and per-segment means (heavy lines)." },
        { svg: CH.lollipop({ items: cp.segments.map(function (s, i2) { return { label: "seg " + (i2 + 1), value: s.mean }; }), sort: false, xlabel: "segment mean" }), caption: "Segment means either side of the detected shifts." }
      ]
    };
  }

  function T_acf(r) {
    var yN = r.pick(NOUNS), Tn = r.int(90, 150), period = r.pick([5, 7, 9, 12]), g = r.gauss;
    var raw = []; for (var t = 0; t < Tn; t++) raw.push(Math.sin(2 * Math.PI * t / period) * (1 + r.f()) + g() * 0.6);
    var y = affine(raw, 6, 1), ac = ST.acf(y, Math.min(28, Math.floor(Tn / 3)));
    var sig = ac.values.filter(function (v) { return Math.abs(v.r) > ac.ci; }).length;
    var best = ac.values.reduce(function (a, b) { return b.r > a.r ? b : a; }, ac.values[0]);
    var lagPts = []; for (t = 0; t + best.lag < Tn; t++) lagPts.push({ x: y[t], y: y[t + best.lag], g: 0 });
    return {
      data: Tn + " sequential observations of " + yN + ".",
      reported: { n: Tn, "peak lag": best.lag, r: dot(best.r), "significant lags": sig },
      finding: "Autocorrelation peaks at lag " + best.lag + " (r = " + dot(best.r) + "): the series remembers its own past at that spacing.",
      figures: [
        { svg: CH.stem({ values: ac.values, ci: ac.ci }), caption: "Autocorrelation function; the shaded band is the ±1.96/√n significance envelope." },
        { svg: CH.scatterFit({ points: lagPts, xlabel: yN + " at t", ylabel: yN + " at t+" + best.lag }), caption: "Lag-" + best.lag + " scatter: each observation against its own value " + best.lag + " steps later." }
      ]
    };
  }

  function T_chisq(r) {
    var R = r.int(3, 4), Cn = r.int(2, 3);
    var rowsL = r.sample(GROUPS, R), colsL = r.sample(["low", "mid", "high", "absent", "present"], Cn);
    var M = []; for (var i = 0; i < R; i++) { var row = []; for (var j = 0; j < Cn; j++) row.push(r.int(4, 30) + (i % Cn === j ? r.int(12, 40) : 0)); M.push(row); }
    var cs = ST.chiSquare(M);
    var series = colsL.map(function (cl, j) { return { name: cl, values: rowsL.map(function (_, i2) { return M[i2][j]; }) }; });
    return {
      data: "a " + R + "×" + Cn + " contingency table of counts.",
      reported: { "χ²": d2(cs.X2), df: cs.df, "Cramér's V": dot(cs.cramersV), n: cs.n },
      finding: "The two factors are associated (χ² = " + d2(cs.X2) + " on " + cs.df + " df, V = " + dot(cs.cramersV) + ") — the rows do not share one profile.",
      figures: [
        { svg: CH.stackedBar({ categories: rowsL, series: series }), caption: "Composition of each row category as proportions." },
        { svg: CH.heatmap({ matrix: cs.residuals, rowLabels: rowsL, colLabels: colsL, diverging: true, cblabel: "resid", cell: 28, labelW: 66, labelT: 42 }), caption: "Standardized residuals (observed − expected)/√expected; warm cells exceed independence." }
      ]
    };
  }

  function T_logrank(r) {
    var n = r.int(60, 110), base = 0.06 + r.f() * 0.07, hr = 1.6 + r.f() * 1.6;
    var times = [], events = [], grp = [];
    for (var i = 0; i < 2 * n; i++) {
      var gi = i < n ? 0 : 1, lam = base * (gi ? hr : 1);
      var t = -Math.log(Math.max(1e-6, r.f())) / lam, cens = -Math.log(Math.max(1e-6, r.f())) / (base * 0.5);
      if (t <= cens) { times.push(+t.toFixed(1)); events.push(1); } else { times.push(+cens.toFixed(1)); events.push(0); }
      grp.push(gi);
    }
    var kmA = ST.kaplanMeier(times.filter(function (_, i2) { return grp[i2] === 0; }), events.filter(function (_, i2) { return grp[i2] === 0; }));
    var kmB = ST.kaplanMeier(times.filter(function (_, i2) { return grp[i2] === 1; }), events.filter(function (_, i2) { return grp[i2] === 1; }));
    var lr = ST.logRank(times, events, grp);
    var names = r.sample(GROUPS, 2);
    return {
      data: (2 * n) + " durations split between two arms, with censoring.",
      reported: { "χ² (log-rank)": d2(lr.chi), "median A": kmA.median != null ? d2(kmA.median) : "n/r", "median B": kmB.median != null ? d2(kmB.median) : "n/r" },
      finding: "The two arms separate (log-rank χ² = " + d2(lr.chi) + "): " + names[1] + " leaves the risk set faster throughout follow-up.",
      figures: [
        { svg: CH.kaplanMeier({ curves: [{ name: names[0], points: kmA.points }, { name: names[1], points: kmB.points }] }), caption: "Kaplan–Meier curves for the two arms; separation is visible from early follow-up." },
        { svg: CH.box({ groups: [{ label: names[0], values: times.filter(function (_, i2) { return grp[i2] === 0; }) }, { label: names[1], values: times.filter(function (_, i2) { return grp[i2] === 1; }) }], ylabel: "observed duration" }), caption: "Observed durations by arm (censored cases included)." }
      ]
    };
  }

  function T_poisson(r) {
    var xN = r.pick(NOUNS), n = r.int(120, 220), b = 0.25 + r.f() * 0.5, g = r.gauss;
    var xs = [], y = [];
    for (var i = 0; i < n; i++) {
      var x = g(); xs.push(x);
      var lam = Math.exp(1.1 + b * x), k = 0, pAcc = 1, L = Math.exp(-lam);
      do { k++; pAcc *= r.f(); } while (pAcc > L);
      y.push(k - 1);
    }
    var xd = affine(xs, 10, 1);
    var po = ST.poisson(xd.map(function (v) { return [v]; }), y);
    var pts = xd.map(function (v, i2) { return { x: v, y: y[i2], g: 0 }; });
    var order = xd.map(function (v, i2) { return i2; }).sort(function (a, b2) { return xd[a] - xd[b2]; });
    var curve = order.map(function (i2) { return { x: xd[i2], y: po.fitted[i2] }; });
    var bins = 4, byBin = [];
    for (var bI = 0; bI < bins; bI++) {
      var lo = ST.min(xd) + (ST.max(xd) - ST.min(xd)) * bI / bins, hi = lo + (ST.max(xd) - ST.min(xd)) / bins;
      var sel = y.filter(function (_, i2) { return xd[i2] >= lo && (bI === bins - 1 ? xd[i2] <= hi : xd[i2] < hi); });
      byBin.push({ label: "Q" + (bI + 1), value: sel.length ? ST.mean(sel) : 0 });
    }
    return {
      data: n + " event counts with a continuous predictor (" + xN + ").",
      reported: { n: n, "base rate": d2(po.rate), "log-link β": d2(po.w[1]) },
      finding: "Counts rise multiplicatively with " + xN + " (log-link β = " + d2(po.w[1]) + "); a Poisson model fits where a linear one would predict negatives.",
      figures: [
        { svg: CH.line({ series: [{ name: "fitted rate", points: curve }], xlabel: xN, ylabel: "count", markers: false }), caption: "Fitted Poisson rate across the predictor's range." },
        { svg: CH.lollipop({ items: byBin, sort: false, xlabel: "mean count" }), caption: "Observed mean count by quartile of the predictor — the rate climbs monotonically." }
      ]
    };
  }

  function T_lda(r) {
    var n = r.int(120, 220), p = r.int(3, 5), g = r.gauss, sep = 0.9 + r.f() * 1.3;
    var rows = [], y = [];
    var m0 = [], m1 = []; for (var j = 0; j < p; j++) { m0.push(g()); m1.push(m0[j] + (r.f() - 0.5) * 2 * sep); }
    for (var i = 0; i < n; i++) { var c = r.int(0, 1); var row = []; for (j = 0; j < p; j++) row.push((c ? m1[j] : m0[j]) + g()); rows.push(row); y.push(c); }
    var L = ST.lda(rows, y);
    var names = r.sample(GROUPS, 2);
    var cmLabels = ["pred " + names[0], "pred " + names[1]];
    return {
      data: n + " cases with " + p + " features and a known two-class label.",
      reported: { n: n, features: p, accuracy: dot(L.accuracy) },
      finding: "A single discriminant axis separates the classes at " + Math.round(L.accuracy * 100) + "% accuracy — the label is a linear function of the features.",
      figures: [
        { svg: CH.ridgeline({ groups: [{ label: names[0], values: L.s0 }, { label: names[1], values: L.s1 }], xlabel: "discriminant score" }), caption: "Class distributions along the fitted discriminant axis; the overlap is the error rate." },
        { svg: CH.heatmap({ matrix: L.confusion, rowLabels: ["true " + names[0], "true " + names[1]], colLabels: cmLabels, diverging: false, cblabel: "n", cell: 34, labelW: 74, labelT: 44 }), caption: "Confusion matrix of the discriminant classifier." }
      ]
    };
  }

  function T_spearman(r) {
    var m = r.int(14, 26), aN = r.pick(NOUNS), bN = r.pick(NOUNS.filter(function (x) { return x !== aN; })), g = r.gauss;
    var a = [], b = [];
    var mono = 0.6 + r.f() * 0.8;
    for (var i = 0; i < m; i++) { var v = g(); a.push(v); b.push(Math.pow(Math.abs(v), 1.6) * (v < 0 ? -1 : 1) * mono + g() * 0.5); }
    var pear = ST.correlation(a, b), sp = ST.spearman(a, b);
    var ra = ST.rank(a), rb = ST.rank(b);
    var pts = ra.map(function (v, i2) { return { x: v, y: rb[i2], g: 0 }; });
    var items = a.map(function (_, i2) { return { label: "e" + (i2 + 1), value: rb[i2] - ra[i2] }; }).sort(function (x, y2) { return Math.abs(y2.value) - Math.abs(x.value); }).slice(0, 8);
    return {
      data: m + " entities scored on two scales (" + aN + ", " + bN + ").",
      reported: { entities: m, "Spearman ρ": dot(sp), "Pearson r": dot(pear) },
      finding: "Rank agreement is strong (ρ = " + dot(sp) + ") even though the relation is non-linear — ranks travel where means do not.",
      figures: [
        { svg: CH.scatterFit({ points: pts, xlabel: "rank on " + aN, ylabel: "rank on " + bN, annot: "ρ = " + dot(sp) }), caption: "Rank–rank scatter; monotone agreement appears as a straight band." },
        { svg: CH.lollipop({ items: items, xlabel: "rank displacement (b − a)" }), caption: "Entities whose rank moves most between the two scales." }
      ]
    };
  }

  function T_community(r) {
    var k = r.int(2, 4), per = r.int(5, 9), nodes = [], edges = [], ids = [];
    for (var c = 0; c < k; c++) for (var i = 0; i < per; i++) ids.push("n" + c + "_" + i);
    ids.forEach(function (id) { nodes.push({ id: id, deg: 0 }); });
    // dense within community, sparse between
    for (c = 0; c < k; c++) {
      for (i = 0; i < per; i++) for (var j = i + 1; j < per; j++) if (r.chance(0.55)) edges.push({ s: "n" + c + "_" + i, t: "n" + c + "_" + j });
      if (c > 0) edges.push({ s: "n" + c + "_0", t: "n" + (c - 1) + "_0" });
    }
    var cm = ST.communities(ids, edges, r.f);
    var deg = {}; ids.forEach(function (id) { deg[id] = 0; });
    edges.forEach(function (e) { deg[e.s]++; deg[e.t]++; });
    nodes.forEach(function (nd) { nd.g = cm.labels[nd.id]; nd.deg = deg[nd.id]; });
    var sizes = []; for (c = 0; c < cm.k; c++) sizes.push({ label: "community " + (c + 1), value: ids.filter(function (id) { return cm.labels[id] === c; }).length, g: c });
    return {
      data: ids.length + " nodes joined by " + edges.length + " edges.",
      reported: { nodes: ids.length, edges: edges.length, communities: cm.k, modularity: dot(cm.modularity) },
      finding: "Label propagation recovers " + cm.k + " communities (modularity " + dot(cm.modularity) + "): the graph is modular, not uniformly connected.",
      figures: [
        { svg: CH.network({ nodes: nodes, edges: edges, groups: sizes.map(function (s) { return s.label; }), sameCommunity: function (e) { return cm.labels[e.s] === cm.labels[e.t]; } }), caption: "Force-directed layout, coloured by detected community; within-community edges are drawn darker." },
        { svg: CH.lollipop({ items: sizes, xlabel: "nodes per community" }), caption: "Community sizes." }
      ]
    };
  }

  function T_anomaly(r) {
    var n = r.int(120, 220), p = r.int(2, 4), g = r.gauss, nOut = r.int(3, 8);
    var rows = [];
    for (var i = 0; i < n; i++) { var row = []; for (var j = 0; j < p; j++) row.push(g()); rows.push(row); }
    for (i = 0; i < nOut; i++) { var row2 = []; for (var j2 = 0; j2 < p; j2++) row2.push(g() + (r.chance(0.5) ? 1 : -1) * (3.5 + r.f() * 2)); rows.push(row2); }
    var md = ST.mahalanobis(rows);
    var thresh = ST.quantile(md, 0.95);
    var flagged = md.filter(function (d) { return d > thresh; }).length;
    var pts = rows.map(function (row3, i2) { return { x: row3[0], y: row3.length > 1 ? row3[1] : md[i2], g: md[i2] > thresh ? 1 : 0 }; });
    return {
      data: (n + nOut) + " cases in a " + p + "-dimensional feature space.",
      reported: { n: n + nOut, "95th pct distance": d2(thresh), flagged: flagged },
      finding: flagged + " cases exceed the 95th-percentile Mahalanobis distance — the tail is heavier than a clean multivariate normal would give.",
      figures: [
        { svg: CH.clusterScatter({ points: pts, groups: ["typical", "flagged"], xlabel: "feature 1", ylabel: "feature 2" }), caption: "Cases in feature space; flagged outliers are those beyond the distance cut." },
        { svg: CH.histogram({ values: md, xlabel: "Mahalanobis distance", colorIndex: 2 }), caption: "Distribution of Mahalanobis distances; the right tail holds the anomalies." }
      ]
    };
  }

  function T_density2d(r) {
    var xN = r.pick(NOUNS), yN = r.pick(NOUNS.filter(function (v) { return v !== xN; }));
    var n = r.int(400, 900), g = r.gauss, rho = 0.3 + r.f() * 0.5;
    var xs = [], ys = [];
    for (var i = 0; i < n; i++) { var a = g(), b = rho * a + Math.sqrt(1 - rho * rho) * g(); xs.push(a); ys.push(b); }
    var xd = affine(xs, 9, 1), yd = affine(ys, 7, 1);
    var pts = xd.map(function (v, i2) { return { x: v, y: yd[i2] }; });
    var rr = ST.correlation(xd, yd);
    return {
      data: n + " cases measured on " + xN + " and " + yN + " — too many to plot as points.",
      reported: { n: n, r: dot(rr) },
      finding: "Binning reveals a single dense ridge (r = " + dot(rr) + ") that overplotted points would have hidden.",
      figures: [
        { svg: CH.hexbin({ points: pts, xlabel: xN, ylabel: yN }), caption: "Hexagonal binning of " + n + " cases; colour is count per cell." },
        { svg: CH.histogram({ values: xd, xlabel: xN }), caption: "Marginal distribution of " + xN + "." }
      ]
    };
  }

  var TECHNIQUES = [
    { id: "ols", label: "linear regression", blurb: "fit a straight line; test whether one measurement moves with another.", data: ["continuous"], answer: ["association"], charts: ["scatter + fit", "residual histogram"], build: T_ols },
    { id: "anova", label: "one-way ANOVA", blurb: "partition variance to ask whether group means differ.", data: ["grouped"], answer: ["difference"], charts: ["violin", "effect-size heatmap"], build: T_anova },
    { id: "pca", label: "principal component analysis", blurb: "rotate to the axes of greatest variance; compress many variables to a few.", data: ["multivariate"], answer: ["reduction"], charts: ["scree", "biplot"], build: T_pca },
    { id: "spectral", label: "spectral (Fourier) analysis", blurb: "decompose a series into cycles; read the dominant period off the spectrum.", data: ["timeseries"], answer: ["trend"], charts: ["time series", "periodogram"], build: T_spectral },
    { id: "corr", label: "correlation structure", blurb: "map the web of pairwise linear dependence among many variables.", data: ["multivariate"], answer: ["dependence"], charts: ["correlation heatmap", "top-pair scatter"], build: T_corr },
    { id: "kmeans", label: "k-means clustering", blurb: "partition cases into k compact groups around learned centroids.", data: ["multivariate"], answer: ["clustering"], charts: ["cluster scatter", "cluster sizes"], build: T_kmeans },
    { id: "hclust", label: "hierarchical clustering", blurb: "grow a tree of nested groups by repeatedly merging the closest items.", data: ["multivariate", "distances"], answer: ["hierarchy"], charts: ["dendrogram", "reordered distance heatmap"], build: T_hclust },
    { id: "logistic", label: "logistic regression", blurb: "model the probability of a yes/no outcome; score the classifier by ROC.", data: ["labelled"], answer: ["classification"], charts: ["logistic curve", "ROC"], build: T_logistic },
    { id: "survival", label: "survival analysis", blurb: "estimate how a population's survival falls over time under censoring.", data: ["survival"], answer: ["survival"], charts: ["Kaplan–Meier", "duration histogram"], build: T_survival },
    { id: "distribution", label: "distribution fit", blurb: "characterise the shape of a single variable and test it against normal.", data: ["univariate"], answer: ["distribution"], charts: ["histogram", "Q–Q"], build: T_distribution },
    { id: "contingency", label: "contingency analysis", blurb: "cross-tabulate two categorical factors and look for association.", data: ["categorical"], answer: ["association"], charts: ["count heatmap", "grouped bars"], build: T_contingency },
    { id: "ranking", label: "ranking with uncertainty", blurb: "order entities by a score while keeping the error bars honest.", data: ["ranked"], answer: ["distribution"], charts: ["lollipop", "interval forest"], build: T_ranking },
    { id: "mds", label: "multidimensional scaling", blurb: "place items in a plane so their distances survive the flattening.", data: ["distances"], answer: ["reduction"], charts: ["MDS map", "Shepard plot"], build: T_mds },
    { id: "changepoint", label: "changepoint detection", blurb: "find where a series shifts level rather than assuming it drifts.", data: ["timeseries"], answer: ["difference"], charts: ["series with shifts", "segment means"], build: T_changepoint },
    { id: "acf", label: "autocorrelation", blurb: "measure how strongly a series remembers its own past at each lag.", data: ["timeseries"], answer: ["dependence"], charts: ["ACF stem", "lag scatter"], build: T_acf },
    { id: "chisq", label: "chi-square independence", blurb: "test whether two categorical factors are independent, and see where they aren't.", data: ["categorical"], answer: ["difference"], charts: ["stacked proportions", "residual heatmap"], build: T_chisq },
    { id: "logrank", label: "log-rank comparison", blurb: "compare two survival curves accounting for censoring.", data: ["survival"], answer: ["difference"], charts: ["paired KM curves", "duration box"], build: T_logrank },
    { id: "poisson", label: "Poisson regression", blurb: "model counts on a log link so rates stay positive and multiplicative.", data: ["counts"], answer: ["association"], charts: ["fitted rate curve", "rate by quartile"], build: T_poisson },
    { id: "lda", label: "linear discriminant analysis", blurb: "find the one axis that best separates two known classes.", data: ["labelled"], answer: ["reduction"], charts: ["discriminant ridgeline", "confusion matrix"], build: T_lda },
    { id: "spearman", label: "rank correlation", blurb: "measure monotone agreement without assuming a straight line.", data: ["ranked"], answer: ["dependence"], charts: ["rank–rank scatter", "rank displacement"], build: T_spearman },
    { id: "community", label: "community detection", blurb: "partition a graph into groups denser inside than between.", data: ["network"], answer: ["clustering"], charts: ["network graph", "community sizes"], build: T_community },
    { id: "anomaly", label: "outlier detection", blurb: "score how far each case sits from the multivariate centre.", data: ["multivariate"], answer: ["anomaly"], charts: ["flagged scatter", "distance histogram"], build: T_anomaly },
    { id: "density2d", label: "bivariate density", blurb: "bin two continuous variables where points would overplot.", data: ["continuous"], answer: ["distribution"], charts: ["hexbin", "marginal histogram"], build: T_density2d }
  ];

  var BY_ID = {}; TECHNIQUES.forEach(function (t) { BY_ID[t.id] = t; });

  // build the (data type × answer type) occupancy matrix — the exposed genome
  function matrix() {
    var dt = Object.keys(DATA_TYPES), at = Object.keys(ANSWER_TYPES);
    return dt.map(function (d) {
      return { data: d, cells: at.map(function (a) { return { answer: a, techniques: TECHNIQUES.filter(function (t) { return t.data.indexOf(d) >= 0 && t.answer.indexOf(a) >= 0; }).map(function (t) { return t.id; }) }; }) };
    });
  }

  function run(id, seed) {
    var t = BY_ID[id] || TECHNIQUES[0];
    var out = t.build(Rand(t.id + "::" + (seed == null ? "1" : seed)));
    return {
      id: t.id, label: t.label, blurb: t.blurb,
      data: t.data, answer: t.answer, charts: t.charts,
      dataLabels: t.data.map(function (d) { return DATA_TYPES[d].label; }),
      answerLabels: t.answer.map(function (a) { return ANSWER_TYPES[a].label; }),
      dataStatement: out.data, reported: out.reported, finding: out.finding, figures: out.figures
    };
  }

  G.DATA_TYPES = DATA_TYPES;
  G.ANSWER_TYPES = ANSWER_TYPES;
  G.TECHNIQUES = TECHNIQUES.map(function (t) { return { id: t.id, label: t.label, blurb: t.blurb, data: t.data, answer: t.answer, charts: t.charts }; });
  G.matrix = matrix;
  G.run = run;
  G.ids = function () { return TECHNIQUES.map(function (t) { return t.id; }); };
})();
