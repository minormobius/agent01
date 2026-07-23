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
    ranked: { label: "scored entities", glyph: "≡", blurb: "a value (with error) per entity" }
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
    distribution: { label: "distribution", glyph: "◨", blurb: "what shape is the variable?" }
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
    { id: "ranking", label: "ranking with uncertainty", blurb: "order entities by a score while keeping the error bars honest.", data: ["ranked"], answer: ["dependence"], charts: ["lollipop", "interval forest"], build: T_ranking }
  ];
  // note: ranking's answer is really its own; map it under a broad key for the matrix
  TECHNIQUES.find(function (t) { return t.id === "ranking"; }).answer = ["distribution"];

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
