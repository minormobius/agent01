// wormhole — WORMHOLE_ANALYSIS, the paper story engine (unified onto the genome).
//
// A paper is no longer one technique — it is a LONGER ANALYTICAL STORY over a
// single generated DATASTREAM: a sequence of genome techniques, each answering a
// different question about the SAME fabricated data, ending in a SYNTHESIS figure
// that relates their findings. Because every technique operates on the shared
// stream, the cross-references in the synthesis are real (the clusters really do
// stratify the association; PC1 really does track the outcome).
//
// Datastreams and the techniques that apply to them:
//   multivariate — distribution · dependence · reduction(PCA) · clustering(k-means)
//                  · hierarchy · difference(ANOVA) · association(OLS) · classification(logit)
//   temporal     — distribution · trend(spectral/DFT) · association
//   grouped      — distribution · difference(ANOVA) · association
//   cohort       — distribution · survival(Kaplan–Meier) · association
// Across streams the paper set draws on all twelve genome techniques; technique
// labels/answer types come from WORMHOLE_GENOME so the two stay unified.
//
// Output is consumed by paper.js: {design, frame, reported, dataStatement,
// methodsFlow, table, resultsFlow (h3/p/fig/table), discussionFlow (the synthesis)}.
// Text uses @fig:ROLE@ / @tab@ / @place@ tokens the paper resolves. Deterministic.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var W = NS.WORMHOLE, ST = NS.WORMHOLE_STATS, CH = NS.WORMHOLE_CHARTS, GENOME = NS.WORMHOLE_GENOME;
  if (!W || !ST || !CH || !GENOME) throw new Error("analysis.js requires engine.js + stats.js + charts.js + genome.js");
  var A = NS.WORMHOLE_ANALYSIS = NS.WORMHOLE_ANALYSIS || {};

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; }); }
  function shortLabel(t) { var w = cap(t.split(" ")[0]); return w.length > 11 ? w.slice(0, 10) + "." : w; }
  function d2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function dot(x) { return d2(x).replace(/^0\./, ".").replace(/^-0\./, "-."); }
  function fmtP(p) { return p < 0.001 ? "< .001" : p < 0.01 ? "< .01" : p < 0.05 ? "< .05" : "= ." + String(Math.round(p * 100)).padStart(2, "0"); }
  function pv(x) { return Math.round(x * 100); }
  function affine(a, span, base) { var lo = ST.min(a), hi = ST.max(a), rg = (hi - lo) || 1; return a.map(function (x) { return (x - lo) / rg * span + base; }); }
  function col(rows, j) { return rows.map(function (r) { return r[j]; }); }

  // technique metadata from the genome (keeps papers + /lab unified)
  var TM = {}; GENOME.TECHNIQUES.forEach(function (t) { TM[t.id] = t; });
  function label(id) { return TM[id] ? TM[id].label : id; }

  function fig(role, svg, caption, readout, wide) { return { role: role, svg: svg, caption: caption, readout: readout, wide: !!wide }; }

  // ============================================================
  // DATASTREAM: multivariate survey (the workhorse — supports 8 techniques)
  // ============================================================
  function streamMultivariate(r, field) {
    var subj = field.subject, g = r.gauss || function () { return 0; };
    var gauss = function () { var u1 = Math.max(1e-9, r.f()), u2 = r.f(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    var terms = r.sample(subj.terms, Math.min(5, subj.terms.length));
    var p = terms.length, N = r.int(150, 320), K = r.int(2, 4);
    var loadA = [], loadB = []; for (var j = 0; j < p; j++) { loadA.push(gauss()); loadB.push(gauss()); }
    var gOff = []; for (var c = 0; c < K; c++) gOff.push([(r.f() - 0.5) * 3.2, (r.f() - 0.5) * 3.2]);
    var raw = [], gid = [];
    for (var i = 0; i < N; i++) { var gg = r.int(0, K - 1), fa = gOff[gg][0] + gauss(), fb = gOff[gg][1] + gauss(); var row = []; for (j = 0; j < p; j++) row.push(loadA[j] * fa + loadB[j] * fb + 0.6 * gauss()); raw.push(row); gid.push(gg); }
    // display-scale each column independently
    var rows = raw.map(function (r0) { return r0.slice(); });
    for (j = 0; j < p; j++) { var scaled = affine(col(raw, j), 6 + r.f() * 3, 0.5 + r.f()); for (i = 0; i < N; i++) rows[i][j] = scaled[i]; }
    var vars = terms.map(shortLabel);
    var outcomeIdx = 0, outcome = col(rows, outcomeIdx), outcomeName = cap(terms[0].split(" ")[0]) + "-index";
    // covariate = the variable most correlated with the outcome
    var covIdx = 1; for (j = 1; j < p; j++) if (Math.abs(ST.correlation(col(rows, j), outcome)) > Math.abs(ST.correlation(col(rows, covIdx), outcome))) covIdx = j;
    var med = ST.median(outcome), binary = outcome.map(function (v) { return v > med ? 1 : 0; });
    var P = ST.pca(rows), scores2 = P.scores.map(function (s) { return [s[0], s[1]]; });
    var km = ST.kmeans(scores2, K, r.f);
    return {
      kind: "multivariate", field: field, N: N, p: p, K: K, vars: vars, rows: rows,
      outcome: outcome, outcomeName: outcomeName, indexName: outcomeName,
      covIdx: covIdx, covName: terms[covIdx], binary: binary,
      pca: P, scores2: scores2, clusters: km.assign, kmCent: km.centroids,
      terms: terms,
      table: { caption: "Descriptive statistics of the " + outcomeName + "'s " + p + " constituent measures.", cols: ["Measure", "Mean", "SD", "Range"], rows: vars.map(function (v, jj) { var cc = col(rows, jj); return [v, d2(ST.mean(cc)), d2(ST.sd(cc)), d2(ST.min(cc)) + "–" + d2(ST.max(cc))]; }) }
    };
  }
  function clusterLabels(K) { var o = []; for (var i = 0; i < K; i++) o.push("cluster " + (i + 1)); return o; }

  var MV = {
    distribution: function (S, r) {
      return { tid: "distribution", intro: "We begin descriptively. The " + esc(S.outcomeName) + " (@fig:distribution:hist@) is " + (r.chance(0.5) ? "unimodal and roughly symmetric" : "mildly right-skewed"), figures: [
        fig("distribution:hist", CH.histogram({ values: S.outcome, xlabel: S.outcomeName }), "Distribution of the " + esc(S.outcomeName) + " across all " + S.N + " cases, with a kernel-density overlay.", "The bulk of cases fall in a single mode; the tails are light, so summary statistics are meaningful."),
        fig("distribution:qq", CH.qq({ values: S.outcome }), "Normal Q–Q plot of the " + esc(S.outcomeName) + ".", "Points track the reference line through the body of the distribution — a normal approximation is serviceable.")
      ], reported: { mean: d2(ST.mean(S.outcome)), sd: d2(ST.sd(S.outcome)) } };
    },
    dependence: function (S, r) {
      var M = S.vars.map(function (_, a) { return S.vars.map(function (_2, b) { return ST.correlation(col(S.rows, a), col(S.rows, b)); }); });
      var best = { v: 0, i: 0, j: 1 }; for (var a = 0; a < S.p; a++) for (var b = a + 1; b < S.p; b++) if (Math.abs(M[a][b]) > Math.abs(best.v)) best = { v: M[a][b], i: a, j: b };
      return { tid: "corr", intro: "The " + S.p + " measures are inter-correlated (@fig:dependence:heat@), motivating a dimensional summary", figures: [
        fig("dependence:heat", CH.heatmap({ matrix: M, labels: S.vars, diverging: true, domain: [-1, 1], cblabel: "r" }), "Pairwise Pearson correlations among the " + S.p + " measures.", "The strongest pair is " + esc(S.vars[best.i]) + "↔" + esc(S.vars[best.j]) + " (r = " + dot(best.v) + "); the redundancy among measures is what principal components exploit.", true)
      ], reported: { "strongest |r|": dot(Math.abs(best.v)) } };
    },
    reduction: function (S, r) {
      var scores = S.pca.scores.map(function (s, i) { return { x: s[0], y: s[1], g: S.clusters[i] }; });
      var loadings = S.vars.map(function (lab, j) { return { x: S.pca.loadings[0][j], y: S.pca.loadings[1][j], label: lab }; });
      var pc12 = pv(S.pca.explained[0] + S.pca.explained[1]);
      return { tid: "pca", intro: "Principal component analysis compresses the " + S.p + " measures (@fig:reduction:scree@, @fig:reduction:biplot@)", figures: [
        fig("reduction:scree", CH.scree({ explained: S.pca.explained.slice(0, Math.min(6, S.p)) }), "Scree plot of the principal components.", "The first two components carry " + pc12 + "% of the variance; the scree bends after PC2."),
        fig("reduction:biplot", CH.biplot({ scores: scores, loadings: loadings, groups: clusterLabels(S.K), xlabel: "PC1 (" + pv(S.pca.explained[0]) + "%)", ylabel: "PC2 (" + pv(S.pca.explained[1]) + "%)" }), "Biplot of case scores on PC1–PC2 (colour = cluster, ahead of §clustering), with variable loadings.", "Cases spread mainly along PC1; the loading vectors show which measures pull in which direction.", true)
      ], reported: { "PC1+PC2": pc12 + "%" } };
    },
    clustering: function (S, r) {
      var pts = S.scores2.map(function (s, i) { return { x: s[0], y: s[1], g: S.clusters[i] }; });
      var sizes = []; for (var c = 0; c < S.K; c++) sizes.push({ label: "cluster " + (c + 1), value: S.clusters.filter(function (x) { return x === c; }).length, g: c });
      return { tid: "kmeans", intro: "k-means on the component scores resolves " + S.K + " groups (@fig:clustering:scatter@)", figures: [
        fig("clustering:scatter", CH.clusterScatter({ points: pts, centroids: S.kmCent.map(function (c) { return { x: c[0], y: c[1] }; }), groups: clusterLabels(S.K), xlabel: "PC1", ylabel: "PC2" }), "k-means partition in principal-component space (× = centroids).", "The clusters are compact and largely separated along PC1, so the reduction and the partition tell one story."),
        fig("clustering:sizes", CH.lollipop({ items: sizes, xlabel: "cluster size" }), "Sizes of the " + S.K + " discovered clusters.", "The partition is " + (Math.max.apply(null, sizes.map(function (s) { return s.value; })) > S.N * 0.6 ? "unbalanced — one cluster dominates" : "reasonably balanced") + ".")
      ], reported: { k: S.K } };
    },
    hierarchy: function (S, r) {
      var m = Math.min(16, S.N), idx = []; for (var i = 0; i < m; i++) idx.push(Math.floor(i * S.N / m));
      var sub = idx.map(function (i) { return S.rows[i]; }), labels = idx.map(function (_, i) { return "c" + (i + 1); });
      var hc = ST.hclust(sub);
      var D = sub.map(function (a) { return sub.map(function (b) { return ST.euclid(a, b); }); });
      var Dord = hc.order.map(function (i) { return hc.order.map(function (j) { return D[i][j]; }); });
      return { tid: "hclust", intro: "An agglomerative tree over a case sample recovers nested structure (@fig:hierarchy:dendro@)", figures: [
        fig("hierarchy:dendro", CH.dendrogram({ root: hc.root, order: hc.order, labels: labels, ylabel: "distance" }), "Average-linkage dendrogram over a " + m + "-case sample.", "The tree's low branches echo the k-means partition — the two clustering methods broadly agree."),
        fig("hierarchy:heat", CH.heatmap({ matrix: Dord, rowLabels: hc.order.map(function (i) { return labels[i]; }), colLabels: hc.order.map(function (i) { return labels[i]; }), diverging: false, cblabel: "dist", cell: 18, labelW: 44, labelT: 40 }), "Distance matrix reordered by the dendrogram.", "Dark blocks on the diagonal are the tight groups the tree isolates.", true)
      ], reported: { "tree height": d2(hc.height) } };
    },
    difference: function (S, r) {
      var by = clusterLabels(S.K).map(function (lab, gi) { return { label: "C" + (gi + 1), values: S.outcome.filter(function (_, i) { return S.clusters[i] === gi; }) }; }).filter(function (b) { return b.values.length > 1; });
      var an = ST.anova(by.map(function (b) { return b.values; }));
      return { tid: "anova", intro: "The discovered clusters differ in the outcome (one-way ANOVA over the k-means groups; @fig:difference:violin@)", figures: [
        fig("difference:violin", CH.violin({ groups: by, ylabel: S.outcomeName }), "The " + esc(S.outcomeName) + " by discovered cluster.", "Between-cluster differences account for " + pv(an.eta2) + "% of the variance in the " + esc(S.outcomeName) + " (η² = " + dot(an.eta2) + ") — the partition is not arbitrary with respect to the outcome.")
      ], reported: { "η²": dot(an.eta2), F: d2(an.F) }, eta: an.eta2 };
    },
    association: function (S, r) {
      var cov = col(S.rows, S.covIdx), pts = cov.map(function (x, i) { return { x: x, y: S.outcome[i], g: S.clusters[i] }; });
      var rr = ST.correlation(cov, S.outcome), fit = ST.ols(cov.map(function (x) { return [x]; }), S.outcome);
      return { tid: "ols", intro: "Within the same cases, the " + esc(S.outcomeName) + " tracks " + esc(S.covName) + " (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, groups: clusterLabels(S.K), xlabel: cap(S.covName), ylabel: S.outcomeName, annot: "r = " + dot(rr) }), "OLS fit of the " + esc(S.outcomeName) + " on " + esc(S.covName) + ", coloured by cluster.", "The association is positive (r = " + dot(rr) + ", p " + fmtP(ST.corrP(rr, S.N)) + ") and holds within each cluster — it is not an artefact of the grouping.")
      ], reported: { r: dot(rr), slope: d2(fit.beta[1]), p: fmtP(ST.corrP(rr, S.N)), r2: dot(fit.r2) }, rr: rr };
    },
    classification: function (S, r) {
      var cov = col(S.rows, S.covIdx), lg = ST.logistic(cov.map(function (x) { return [x]; }), S.binary), rc = ST.roc(lg.probs, S.binary);
      var curve = []; for (var t = 0; t <= 40; t++) { var xv = ST.min(cov) + (ST.max(cov) - ST.min(cov)) * t / 40; var z = (xv - lg.mean[0]) / lg.sd[0]; curve.push({ x: xv, p: 1 / (1 + Math.exp(-(lg.w[0] + lg.w[1] * z))) }); }
      return { tid: "logistic", intro: "Treating a high-" + esc(S.outcomeName) + " flag as a label, " + esc(S.covName) + " predicts it (@fig:classification:logit@, @fig:classification:roc@)", figures: [
        fig("classification:logit", CH.logisticCurve({ points: cov.map(function (x, i) { return { x: x, y: S.binary[i] }; }), curve: curve, xlabel: cap(S.covName) }), "Fitted logistic curve for the high-" + esc(S.outcomeName) + " label against " + esc(S.covName) + ".", "The fitted probability rises smoothly with " + esc(S.covName) + "."),
        fig("classification:roc", CH.roc({ points: rc.points, auc: rc.auc }), "ROC curve for the classifier.", "Discrimination is " + (rc.auc > 0.8 ? "strong" : rc.auc > 0.65 ? "moderate" : "weak") + " (AUC = " + d2(rc.auc) + ").")
      ], reported: { AUC: d2(rc.auc) } };
    }
  };
  MV.stories = [
    ["dependence", "reduction", "difference"], ["distribution", "reduction", "association"],
    ["reduction", "clustering", "difference"], ["dependence", "clustering", "classification"],
    ["distribution", "clustering", "association"], ["reduction", "clustering", "difference"],
    ["dependence", "reduction", "classification"], ["distribution", "hierarchy", "difference"],
    ["reduction", "clustering", "association"]
  ];
  MV.synthesis = function (S, r) {
    var pc1 = col(S.pca.scores, 0), pts = pc1.map(function (x, i) { return { x: x, y: S.outcome[i], g: S.clusters[i] }; });
    var rr = ST.correlation(pc1, S.outcome);
    var means = clusterLabels(S.K).map(function (_, gi) { return ST.mean(S.outcome.filter(function (_2, i) { return S.clusters[i] === gi; }) || [0]); });
    var hi = means.indexOf(ST.max(means));
    return { role: "synth", label: "Synthesis", finding: "Taken together, the three analyses cohere: the principal axis, the k-means partition, and the outcome are one structure, not three.",
      figure: fig("synth", CH.scatterFit({ points: pts, groups: clusterLabels(S.K), xlabel: "PC1 (principal axis)", ylabel: S.outcomeName, annot: "r = " + dot(rr) }),
        "Synthesis: the " + esc(S.outcomeName) + " against the principal component, coloured by the discovered cluster — the reduction, the clustering, and the outcome on one plane.",
        "PC1 predicts the " + esc(S.outcomeName) + " (r = " + dot(rr) + "), and cluster " + (hi + 1) + " occupies the high-PC1, high-outcome corner: the axis that organises the measures is the same one along which the clusters separate and the outcome grows.") };
  };

  // ============================================================
  // DATASTREAM: temporal record
  // ============================================================
  function streamTemporal(r, field) {
    var subj = field.subject, terms = r.sample(subj.terms, 2);
    var gauss = function () { var u1 = Math.max(1e-9, r.f()), u2 = r.f(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    var Tn = r.int(80, 130), y0 = r.int(1790, 1900), period = r.pick([4, 5, 7, 11, 12, 22]), amp = 1 + r.f() * 1.4, ph = r.f() * 6.28, trend = (r.f() - 0.4) * 0.02;
    var raw = [], cyc = [], covRaw = [];
    for (var t = 0; t < Tn; t++) { var cc = amp * Math.sin(2 * Math.PI * t / period + ph); cyc.push(cc); raw.push(3 + trend * t + cc + (0.5 + r.f() * 0.6) * gauss()); covRaw.push(cc * (0.7 + r.f() * 0.5) + gauss()); }
    var series = affine(raw, 6, 1), cov = affine(covRaw, 8, 1);
    var pg = ST.periodogram(series), mi = 0; pg.power.forEach(function (pw, i) { if (pw > pg.power[mi]) mi = i; });
    var order = pg.power.map(function (_, i) { return i; }).sort(function (a, b) { return pg.power[b] - pg.power[a]; }).slice(0, 3);
    var tot = pg.power.reduce(function (a, b) { return a + b; }, 0) || 1;
    return {
      kind: "temporal", field: field, N: Tn, y0: y0, series: series, cov: cov, cyc: cyc, pg: pg, mi: mi,
      outcomeName: cap(terms[0].split(" ")[0]) + "-index", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-index", terms: terms,
      peakShare: pg.power[mi] / tot, period: pg.period[mi],
      table: { caption: "The three strongest spectral components of the " + cap(terms[0].split(" ")[0]) + "-index.", cols: ["Rank", "Period", "% power"], rows: order.map(function (i, k) { return ["#" + (k + 1), d2(pg.period[i]) + " yr", pv(pg.power[i] / tot) + "%"]; }) }
    };
  }
  var TS = {
    distribution: function (S, r) {
      return { tid: "distribution", intro: "The series' marginal distribution (@fig:distribution:hist@) sets a baseline", figures: [
        fig("distribution:hist", CH.histogram({ values: S.series, xlabel: S.outcomeName }), "Marginal distribution of the " + esc(S.outcomeName) + " over " + S.N + " years.", "The values are single-moded; the temporal structure is invisible at this marginal view — hence the spectral step.")
      ], reported: { mean: d2(ST.mean(S.series)) } };
    },
    trend: function (S, r) {
      var series = S.series.map(function (v, i) { return { x: S.y0 + i, y: v }; });
      return { tid: "spectral", intro: "Spectral analysis exposes a dominant cycle (@fig:trend:line@, @fig:trend:spec@)", figures: [
        fig("trend:line", CH.line({ series: [{ name: S.outcomeName, points: series }], xlabel: "year", ylabel: S.outcomeName }), "The " + esc(S.outcomeName) + " series, " + S.y0 + "–" + (S.y0 + S.N - 1) + ".", "A regular oscillation rides on a slow drift; the drift is removed before the transform.", true),
        fig("trend:spec", CH.spectrum({ freq: S.pg.freq, power: S.pg.power, period: S.pg.period }), "Periodogram of the detrended series.", "Power peaks at " + d2(S.period) + " years, carrying " + pv(S.peakShare) + "% of the detrended variance.")
      ], reported: { period: d2(S.period) + " yr", power: pv(S.peakShare) + "%" } };
    },
    association: function (S, r) {
      var pts = S.cov.map(function (x, i) { return { x: x, y: S.series[i], g: 0 }; }), rr = ST.correlation(S.cov, S.series);
      return { tid: "ols", intro: "The cycle co-moves with a contemporaneous covariate (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, xlabel: cap(S.covName), ylabel: S.outcomeName, annot: "r = " + dot(rr) }), "The " + esc(S.outcomeName) + " against " + esc(S.covName) + ", same years.", "The two move together (r = " + dot(rr) + "), consistent with a shared periodic driver.")
      ], reported: { r: dot(rr) }, rr: rr };
    }
  };
  TS.stories = [["distribution", "trend"], ["trend", "association"], ["distribution", "trend", "association"]];
  TS.synthesis = function (S, r) {
    var series = S.series.map(function (v, i) { return { x: S.y0 + i, y: v }; });
    var scale = (ST.sd(ST.detrend(S.series)) / (ST.sd(S.cyc) || 1)), fitLine = S.cyc.map(function (v, i) { return { x: S.y0 + i, y: ST.mean(S.series) + v * scale }; });
    var rr = ST.correlation(ST.detrend(S.series), S.cyc);
    return { role: "synth", label: "Synthesis", finding: "The recovered cycle, laid back over the raw series, accounts for its regular excursions.",
      figure: fig("synth", CH.line({ series: [{ name: "observed", points: series }, { name: "fitted cycle", points: fitLine }], xlabel: "year", ylabel: S.outcomeName }, true),
        "Synthesis: the observed series with the fitted " + d2(S.period) + "-year cycle overlaid.",
        "The single sinusoid the periodogram identified reproduces the series' peaks and troughs (r = " + dot(rr) + " with the detrended data) — description, spectrum, and covariate are one signal.", true) };
  };

  // ============================================================
  // DATASTREAM: grouped measurements
  // ============================================================
  function streamGrouped(r, field) {
    var subj = field.subject, terms = r.sample(subj.terms, 2);
    var gauss = function () { var u1 = Math.max(1e-9, r.f()), u2 = r.f(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    var K = r.int(3, 5), nPer = r.int(30, 60), names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].slice(0, K);
    var lat = names.map(function () { return (r.f() - 0.5) * 3; }), slope = 0.5 + r.f();
    var groups = [], covs = [], raw = [];
    for (var gi = 0; gi < K; gi++) { var vv = [], cv = []; for (var i = 0; i < nPer; i++) { var cvi = gauss(); cv.push(cvi); var y = lat[gi] + slope * cvi + gauss() * 0.8; vv.push(y); raw.push(y); } groups.push(vv); covs.push(cv); }
    var all = [].concat.apply([], groups), disp = affine(all, 5, 0.5), off = 0;
    var by = names.map(function (nm, gi) { var vals = []; for (var i = 0; i < groups[gi].length; i++) vals.push(disp[off++]); return { label: nm, values: vals }; });
    var covAll = affine([].concat.apply([], covs), 8, 1), o2 = 0, covBy = names.map(function (nm, gi) { var vv = []; for (var i = 0; i < groups[gi].length; i++) vv.push(covAll[o2++]); return vv; });
    return {
      kind: "grouped", field: field, N: nPer * K, K: K, names: names, by: by, covBy: covBy,
      outcomeName: cap(terms[0].split(" ")[0]) + "-index", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-index", kind2: r.pick(["site", "cohort", "workshop", "provenance"]), terms: terms,
      table: { caption: "The " + cap(terms[0].split(" ")[0]) + "-index by group.", cols: ["Group", "N", "Mean", "SD"], rows: by.map(function (b) { return [b.label, String(b.values.length), d2(ST.mean(b.values)), d2(ST.sd(b.values))]; }) }
    };
  }
  var GR = {
    distribution: function (S, r) {
      var all = [].concat.apply([], S.by.map(function (b) { return b.values; }));
      return { tid: "distribution", intro: "Pooling the groups, the outcome is unimodal (@fig:distribution:hist@)", figures: [
        fig("distribution:hist", CH.histogram({ values: all, xlabel: S.outcomeName }), "Pooled distribution of the " + esc(S.outcomeName) + ".", "The pooled shape hides the group structure the next step exposes.")
      ], reported: { mean: d2(ST.mean(all)) } };
    },
    difference: function (S, r) {
      var an = ST.anova(S.by.map(function (b) { return b.values; })), pooled = ST.sd([].concat.apply([], S.by.map(function (b) { return b.values; }))) || 1;
      var dm = S.by.map(function (a, i) { return S.by.map(function (b, j) { return i === j ? 0 : (ST.mean(a.values) - ST.mean(b.values)) / pooled; }); });
      var dmax = 0; dm.forEach(function (row) { row.forEach(function (v) { dmax = Math.max(dmax, Math.abs(v)); }); });
      return { tid: "anova", intro: "The " + S.K + " " + S.kind2 + "s differ (one-way ANOVA; @fig:difference:violin@, @fig:difference:heat@)", figures: [
        fig("difference:violin", CH.violin({ groups: S.by, ylabel: S.outcomeName }), "The " + esc(S.outcomeName) + " across " + S.K + " " + S.kind2 + "s.", "Between-" + S.kind2 + " variance is " + pv(an.eta2) + "% of the total (η² = " + dot(an.eta2) + ")."),
        fig("difference:heat", CH.heatmap({ matrix: dm, rowLabels: S.names, colLabels: S.names, diverging: true, domain: [-Math.max(1, dmax), Math.max(1, dmax)], cblabel: "d" }), "Pairwise Cohen's d between " + S.kind2 + "s.", "The sharpest contrast is d = " + d2(dmax) + ".", true)
      ], reported: { "η²": dot(an.eta2), F: d2(an.F) }, eta: an.eta2 };
    },
    association: function (S, r) {
      var xs = [].concat.apply([], S.covBy), ys = [].concat.apply([], S.by.map(function (b) { return b.values; })), gs = [];
      S.by.forEach(function (b, gi) { b.values.forEach(function () { gs.push(gi); }); });
      var pts = xs.map(function (x, i) { return { x: x, y: ys[i], g: gs[i] }; }), rr = ST.correlation(xs, ys);
      return { tid: "ols", intro: "A within-group covariate also moves the outcome (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, groups: S.names, xlabel: cap(S.covName), ylabel: S.outcomeName, annot: "r = " + dot(rr) }), "The " + esc(S.outcomeName) + " on " + esc(S.covName) + ", coloured by " + S.kind2 + ".", "The slope is positive (r = " + dot(rr) + ") and roughly parallel across " + S.kind2 + "s — group and covariate are additive.")
      ], reported: { r: dot(rr) }, rr: rr };
    }
  };
  GR.stories = [["distribution", "difference"], ["difference", "association"], ["distribution", "difference", "association"]];
  GR.synthesis = function (S, r) {
    var gm = ST.mean([].concat.apply([], S.by.map(function (b) { return b.values; }))), pooled = ST.sd([].concat.apply([], S.by.map(function (b) { return b.values; }))) || 1;
    var rows = S.by.map(function (b) { var d = (ST.mean(b.values) - gm) / pooled, se = ST.sd(b.values) / Math.sqrt(b.values.length) / pooled; return { label: b.label, est: d, lo: d - 1.96 * se, hi: d + 1.96 * se }; });
    return { role: "synth", label: "Synthesis", finding: "The group effects, gathered on one scale, show which groups actually drive the difference.",
      figure: fig("synth", CH.forest({ rows: rows, xlabel: "deviation from grand mean (SD)", ref: 0 }),
        "Synthesis: each group's standardized deviation from the grand mean (95% CI).",
        "Only the " + S.kind2 + "s whose intervals clear the grand-mean line move the ANOVA; the covariate acts on top of these level shifts, not instead of them."), reported: {} };
  };

  // ============================================================
  // DATASTREAM: cohort with durations
  // ============================================================
  function streamCohort(r, field) {
    var subj = field.subject, terms = r.sample(subj.terms, 2), rate = 0.06 + r.f() * 0.1;
    var times = [], events = [], cov = [], covRaw = [];
    var N = r.int(90, 180);
    for (var i = 0; i < N; i++) { var cr = (r.f() - 0.5) * 2; covRaw.push(cr); var lam = rate * Math.exp(0.4 * cr); var t = -Math.log(Math.max(1e-6, r.f())) / lam, cens = -Math.log(Math.max(1e-6, r.f())) / (rate * 0.6); if (t <= cens) { times.push(+t.toFixed(1)); events.push(1); } else { times.push(+cens.toFixed(1)); events.push(0); } }
    cov = affine(covRaw, 8, 1);
    var km = ST.kaplanMeier(times, events);
    return {
      kind: "cohort", field: field, N: N, times: times, events: events, cov: cov, km: km,
      outcomeName: cap(terms[0].split(" ")[0]) + " time", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-index", terms: terms,
      table: { caption: "Follow-up summary.", cols: ["Quantity", "Value"], rows: [["Cases", String(N)], ["Events", String(events.filter(function (e) { return e; }).length)], ["Censored", String(events.filter(function (e) { return !e; }).length)], ["Median survival", km.median != null ? d2(km.median) : "not reached"]] }
    };
  }
  var CO = {
    distribution: function (S, r) {
      return { tid: "distribution", intro: "Observed durations are right-skewed (@fig:distribution:hist@)", figures: [
        fig("distribution:hist", CH.histogram({ values: S.times, xlabel: "observed duration", colorIndex: 2 }), "Distribution of observed durations (events + censored).", "The long right tail is characteristic of waiting-time data and motivates a survival treatment rather than a mean.")
      ], reported: { median: d2(ST.median(S.times)) } };
    },
    survival: function (S, r) {
      return { tid: "survival", intro: "The Kaplan–Meier estimate tracks how survival falls (@fig:survival:km@)", figures: [
        fig("survival:km", CH.kaplanMeier({ points: S.km.points, median: S.km.median, xlabel: "time", ylabel: "survival S(t)" }), "Kaplan–Meier survival curve with the median marked.", "Median survival is " + (S.km.median != null ? d2(S.km.median) : "not reached") + "; censoring is handled by the estimator, not dropped.")
      ], reported: { "median survival": S.km.median != null ? d2(S.km.median) : "not reached" } };
    },
    association: function (S, r) {
      var pts = S.cov.map(function (x, i) { return { x: x, y: S.times[i], g: S.events[i] }; }), rr = ST.correlation(S.cov, S.times);
      return { tid: "ols", intro: "Duration co-varies with a baseline covariate (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, groups: ["censored", "event"], xlabel: cap(S.covName), ylabel: "duration", annot: "r = " + dot(rr) }), "Observed duration against " + esc(S.covName) + " (colour = event vs censored).", "Higher " + esc(S.covName) + " goes with " + (rr < 0 ? "shorter" : "longer") + " durations (r = " + dot(rr) + ") — a hazard signal the survival curve aggregates.")
      ], reported: { r: dot(rr) }, rr: rr };
    }
  };
  CO.stories = [["distribution", "survival"], ["survival", "association"], ["distribution", "survival", "association"]];
  CO.synthesis = function (S, r) {
    var pts = S.cov.map(function (x, i) { return { x: x, y: S.times[i], g: S.events[i] }; }), rr = ST.correlation(S.cov, S.times);
    return { role: "synth", label: "Synthesis", finding: "The covariate that shifts individual durations is the same one the survival curve integrates over.",
      figure: fig("synth", CH.scatterFit({ points: pts, groups: ["censored", "event"], xlabel: cap(S.covName), ylabel: "duration" }),
        "Synthesis: individual durations against " + esc(S.covName) + ", events and censored cases distinguished.",
        "The individual-level gradient (r = " + dot(rr) + ") and the population-level Kaplan–Meier curve are two views of one hazard: cases with higher " + esc(S.covName) + " leave the risk set sooner."), reported: {} };
  };

  var STREAMS = {
    multivariate: { w: 4, build: streamMultivariate, an: MV, designLabel: "a multivariate analysis" },
    temporal: { w: 2, build: streamTemporal, an: TS, designLabel: "a time-series analysis" },
    grouped: { w: 2, build: streamGrouped, an: GR, designLabel: "a comparative analysis" },
    cohort: { w: 2, build: streamCohort, an: CO, designLabel: "a survival analysis" }
  };

  function run(paperId, field) {
    field = field || W.generate(String(paperId).split(".")[0]);
    var r = W._Rand("analysis::" + paperId);
    r.gauss = function () { var u1 = Math.max(1e-9, r.f()), u2 = r.f(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    var keys = Object.keys(STREAMS);
    var kind = r.pickw(keys, function (k) { return STREAMS[k].w; });
    var def = STREAMS[kind], S = def.build(r, field), an = def.an;
    var story = r.pick(an.stories);
    var steps = story.map(function (key) { return an[key](S, r); });
    var synth = an.synthesis(S, r);

    // assemble the Results section as a story: lead → table → per-technique subsection → (synthesis lives in Discussion)
    var resultsFlow = [];
    var techNames = steps.map(function (s) { return label(s.tid); });
    resultsFlow.push({ t: "p", html: "We analysed the same " + S.N + " observations through " + steps.length + " lenses — " + techNames.join(", ") + " — building from description to inference (@tab@).", first: true });
    resultsFlow.push({ t: "table", caption: S.table.caption, cols: S.table.cols, rows: S.table.rows });
    steps.forEach(function (st, si) {
      resultsFlow.push({ t: "h3", text: (si + 1) + ". " + cap(label(st.tid)) });
      resultsFlow.push({ t: "p", html: st.intro + "." });
      st.figures.forEach(function (f) { resultsFlow.push({ t: "fig", role: f.role, svg: f.svg, caption: f.caption, wide: f.wide }); resultsFlow.push({ t: "p", html: f.readout }); });
    });

    var discussionFlow = [
      { t: "h3", text: "Synthesis" },
      { t: "p", html: synth.finding },
      { t: "fig", role: synth.figure.role, svg: synth.figure.svg, caption: synth.figure.caption, wide: synth.figure.wide },
      { t: "p", html: synth.figure.readout }
    ];

    // aggregate reported scalars for the shared narrative (prefer an inferential step)
    var infer = steps.filter(function (s) { return s.rr !== undefined || s.eta !== undefined; }).pop() || steps[steps.length - 1];
    var varEx = infer.eta !== undefined ? pv(infer.eta) : (S.pca ? pv(S.pca.explained[0] + S.pca.explained[1]) : (S.peakShare !== undefined ? pv(S.peakShare) : 40));
    var rr = infer.rr !== undefined ? Math.abs(infer.rr) : (infer.eta !== undefined ? Math.sqrt(infer.eta) : 0.5);
    var reported = {
      N: S.N, r: dot(rr), p: (infer.reported && infer.reported.p) || "< .01", varExplained: varEx,
      y0: r.int(field.field.founded, 2013), y1: 0, kappa: d2(0.62 + r.f() * 0.34),
      techniques: steps.map(function (s) { return s.tid; })
    };
    reported.y1 = reported.y0 + r.int(2, 9);

    var focal = { index: S.terms[0], rival: S.terms[Math.min(1, S.terms.length - 1)], cov: S.covName || S.terms[Math.min(1, S.terms.length - 1)] };
    var eq = kind === "temporal"
      ? { t: "eq", html: '<i>P</i>(<i>f</i>) = <span class="frac"><span class="num">2</span><span class="den">N</span></span> &#124;&sum;<sub><i>t</i></sub> <i>y<sub>t</sub></i> <i>e</i><sup>&minus;2&pi;<i>i f t</i></sup>&#124;<sup>2</sup>' }
      : kind === "cohort"
        ? { t: "eq", html: '<i>Ŝ</i>(<i>t</i>) = &prod;<sub><i>t<sub>i</sub></i> &le; <i>t</i></sub> (1 &minus; <i>d<sub>i</sub></i> / <i>n<sub>i</sub></i>)' }
        : { t: "eq", html: '<b>R</b> <i>v<sub>c</sub></i> = &lambda;<sub><i>c</i></sub> <i>v<sub>c</sub></i>,&nbsp;&nbsp; <i>y<sub>i</sub></i> = &beta;<sub>0</sub> + &beta;<sub>1</sub> <i>x<sub>i</sub></i> + &epsilon;<sub>i</sub>' };

    var dataStatement = kind === "multivariate" ? "<b>Attributes.</b> We measured " + S.p + " attributes of " + esc(field.subject.n) + " on " + S.N + " cases collected in @place@ (" + reported.y0 + "–" + reported.y1 + "), standardizing each before analysis."
      : kind === "temporal" ? "<b>Series.</b> We compiled the annual " + esc(S.outcomeName) + " for " + esc(field.subject.n) + " over " + S.N + " years (" + S.y0 + "–" + (S.y0 + S.N - 1) + "), with a contemporaneous covariate."
      : kind === "grouped" ? "<b>Sample.</b> We measured the " + esc(S.outcomeName) + " and a covariate on " + S.N + " instances of " + esc(field.subject.n) + " drawn from " + S.K + " " + S.kind2 + "s, in @place@ (" + reported.y0 + "–" + reported.y1 + ")."
        : "<b>Cohort.</b> We followed " + S.N + " instances of " + esc(field.subject.n) + " to an event or censoring, recording a baseline covariate (@place@, " + reported.y0 + "–" + reported.y1 + ").";

    return {
      design: kind, designLabel: def.designLabel,
      frame: { indexName: S.indexName, focal: focal, groupsLabel: S.kind2 || "group", nGroups: S.K || 1 },
      reported: reported,
      dataStatement: dataStatement,
      methodsFlow: [
        { t: "p", html: "We put one datastream through several techniques: " + steps.map(function (s) { return esc(label(s.tid)); }).join(", then ") + ". The core operations are" },
        eq
      ],
      table: { caption: S.table.caption, cols: S.table.cols, rows: S.table.rows },
      resultsFlow: resultsFlow,
      discussionFlow: discussionFlow
    };
  }

  A.run = run;
  A.streams = Object.keys(STREAMS);
})();
