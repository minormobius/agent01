// wormhole — WORMHOLE_ANALYSIS, the paper story engine (unified onto the genome).
//
// A paper is a LONGER ANALYTICAL STORY over a single generated DATASTREAM: a
// sequence of genome techniques, each answering a different question about the
// SAME fabricated data, usually ending in a SYNTHESIS figure that relates them.
// Because every technique operates on the shared stream, the cross-references in
// the synthesis are real (the clusters really do stratify the association; PC1
// really does track the outcome).
//
// STORY SHAPE varies. A paper samples a shape as well as a stream:
//   letter    — 1–2 techniques, no synthesis (a brief communication)
//   article   — 3 techniques + synthesis (the standard research paper)
//   monograph — 4–6 techniques + synthesis (the long-form study)
// Steps are drawn as an ascending subsequence of the stream's narrative `order`
// (descriptive → structural → inferential), so any sampled story still reads as
// an argument, and the last step is always drawn from the inferential half.
//
// Datastreams and the genome techniques they can apply:
//   multivariate — distribution · dependence · density2d · reduction(PCA) · mds
//                  · clustering(k-means) · hierarchy · anomaly · difference(ANOVA)
//                  · association(OLS) · lda · classification(logit)
//   temporal     — distribution · acf · changepoint · trend(spectral/DFT) · association
//   grouped      — distribution · difference(ANOVA) · chisq · association
//   cohort       — distribution · survival(Kaplan–Meier) · logrank · association
// Technique labels come from WORMHOLE_GENOME, so /lab and the papers name the
// same things; A.plan() reports which genome techniques a paper will use WITHOUT
// building any data, which is what makes the genome↔paper bridge cheap.
//
// Deterministic. Consumed by paper.js.

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
  function clusterLabels(K) { var o = []; for (var i = 0; i < K; i++) o.push("cluster " + (i + 1)); return o; }

  var TM = {}; GENOME.TECHNIQUES.forEach(function (t) { TM[t.id] = t; });
  function label(id) { return TM[id] ? TM[id].label : id; }
  function fig(role, svg, caption, readout, wide) { return { role: role, svg: svg, caption: caption, readout: readout, wide: !!wide }; }

  // ---------- story shapes ----------
  var SHAPES = {
    letter: { w: 3, min: 1, max: 2, synthesis: false, label: "Letter", kicker: "Brief communication" },
    article: { w: 6, min: 3, max: 3, synthesis: true, label: "Article", kicker: null },
    monograph: { w: 2, min: 4, max: 6, synthesis: true, label: "Monograph", kicker: "Extended study" }
  };

  // draw L steps as an ascending subsequence of `order`; the closing step always
  // comes from the inferential (back) half so the story lands on a result.
  function chooseSteps(r, order, L) {
    L = Math.max(1, Math.min(L, order.length));
    var half = Math.max(1, Math.floor(order.length / 2));
    var lastIdx = half + Math.floor(r.f() * (order.length - half));
    if (lastIdx < L - 1) lastIdx = L - 1;
    if (lastIdx > order.length - 1) lastIdx = order.length - 1;
    if (L === 1) return [order[lastIdx]];
    var pool = []; for (var i = 0; i < lastIdx; i++) pool.push(i);
    var chosen = r.sample(pool, L - 1).sort(function (a, b) { return a - b; });
    return chosen.concat([lastIdx]).map(function (i) { return order[i]; });
  }

  // ============================================================
  // DATASTREAM: multivariate survey
  // ============================================================
  function streamMultivariate(r, field) {
    var gauss = r.gauss;
    var terms = r.sample(field.subject.terms, Math.min(5, field.subject.terms.length));
    var p = terms.length, N = r.int(150, 320), K = r.int(2, 4);
    var loadA = [], loadB = []; for (var j = 0; j < p; j++) { loadA.push(gauss()); loadB.push(gauss()); }
    var gOff = []; for (var c = 0; c < K; c++) gOff.push([(r.f() - 0.5) * 3.2, (r.f() - 0.5) * 3.2]);
    var raw = [], gid = [];
    for (var i = 0; i < N; i++) { var gg = r.int(0, K - 1), fa = gOff[gg][0] + gauss(), fb = gOff[gg][1] + gauss(); var row = []; for (j = 0; j < p; j++) row.push(loadA[j] * fa + loadB[j] * fb + 0.6 * gauss()); raw.push(row); gid.push(gg); }
    var rows = raw.map(function (r0) { return r0.slice(); });
    for (j = 0; j < p; j++) { var sc = affine(col(raw, j), 6 + r.f() * 3, 0.5 + r.f()); for (i = 0; i < N; i++) rows[i][j] = sc[i]; }
    var vars = terms.map(shortLabel);
    var outcome = col(rows, 0), outcomeName = cap(terms[0].split(" ")[0]) + "-index";
    var covIdx = 1; for (j = 1; j < p; j++) if (Math.abs(ST.correlation(col(rows, j), outcome)) > Math.abs(ST.correlation(col(rows, covIdx), outcome))) covIdx = j;
    var med = ST.median(outcome), binary = outcome.map(function (v) { return v > med ? 1 : 0; });
    var P = ST.pca(rows), scores2 = P.scores.map(function (s) { return [s[0], s[1]]; });
    var km = ST.kmeans(scores2, K, r.f);
    return {
      kind: "multivariate", field: field, N: N, p: p, K: K, vars: vars, rows: rows, terms: terms,
      outcome: outcome, outcomeName: outcomeName, indexName: outcomeName,
      covIdx: covIdx, covName: terms[covIdx], binary: binary,
      pca: P, scores2: scores2, clusters: km.assign, kmCent: km.centroids,
      table: { caption: "Descriptive statistics of the " + outcomeName + "'s " + p + " constituent measures.", cols: ["Measure", "Mean", "SD", "Range"], rows: vars.map(function (v, jj) { var cc = col(rows, jj); return [v, d2(ST.mean(cc)), d2(ST.sd(cc)), d2(ST.min(cc)) + "–" + d2(ST.max(cc))]; }) }
    };
  }
  var MV = {
    order: ["distribution", "dependence", "density2d", "reduction", "mds", "clustering", "hierarchy", "anomaly", "difference", "association", "lda", "classification"],
    tid: { distribution: "distribution", dependence: "corr", density2d: "density2d", reduction: "pca", mds: "mds", clustering: "kmeans", hierarchy: "hclust", anomaly: "anomaly", difference: "anova", association: "ols", lda: "lda", classification: "logistic" },
    distribution: function (S) {
      return { intro: "We begin descriptively: the " + esc(S.outcomeName) + " (@fig:distribution:hist@) is unimodal", figures: [
        fig("distribution:hist", CH.histogram({ values: S.outcome, xlabel: S.outcomeName }), "Distribution of the " + esc(S.outcomeName) + " across all " + S.N + " cases, with a kernel-density overlay.", "The bulk of cases fall in a single mode, so summary statistics are meaningful and a normal working model is defensible."),
        fig("distribution:qq", CH.qq({ values: S.outcome }), "Normal Q–Q plot of the " + esc(S.outcomeName) + ".", "Points track the reference line through the body of the distribution; only the extreme tails depart.")
      ], reported: { mean: d2(ST.mean(S.outcome)), sd: d2(ST.sd(S.outcome)) } };
    },
    dependence: function (S) {
      var M = S.vars.map(function (_, a) { return S.vars.map(function (_2, b) { return ST.correlation(col(S.rows, a), col(S.rows, b)); }); });
      var best = { v: 0, i: 0, j: 1 }; for (var a = 0; a < S.p; a++) for (var b = a + 1; b < S.p; b++) if (Math.abs(M[a][b]) > Math.abs(best.v)) best = { v: M[a][b], i: a, j: b };
      return { intro: "The " + S.p + " measures are inter-correlated (@fig:dependence:heat@), motivating a dimensional summary", figures: [
        fig("dependence:heat", CH.heatmap({ matrix: M, labels: S.vars, diverging: true, domain: [-1, 1], cblabel: "r" }), "Pairwise Pearson correlations among the " + S.p + " measures.", "The strongest pair is " + esc(S.vars[best.i]) + "↔" + esc(S.vars[best.j]) + " (r = " + dot(best.v) + "); this redundancy is what a component analysis exploits.", true)
      ], reported: { "strongest |r|": dot(Math.abs(best.v)) } };
    },
    density2d: function (S) {
      var x = col(S.rows, S.covIdx), y = S.outcome, rr = ST.correlation(x, y);
      return { intro: "With " + S.N + " cases the raw scatter overplots, so we bin it (@fig:density2d:hex@)", figures: [
        fig("density2d:hex", CH.hexbin({ points: x.map(function (v, i) { return { x: v, y: y[i] }; }), xlabel: cap(S.covName), ylabel: S.outcomeName }), "Hexagonal binning of the " + esc(S.outcomeName) + " against " + esc(S.covName) + "; colour is cases per cell.", "Density concentrates along a single ridge (r = " + dot(rr) + ") rather than splitting into separate lobes — one population, not two.")
      ], reported: { r: dot(rr) } };
    },
    reduction: function (S) {
      var scores = S.pca.scores.map(function (s, i) { return { x: s[0], y: s[1], g: S.clusters[i] }; });
      var loadings = S.vars.map(function (lab, j) { return { x: S.pca.loadings[0][j], y: S.pca.loadings[1][j], label: lab }; });
      var pc12 = pv(S.pca.explained[0] + S.pca.explained[1]);
      return { intro: "Principal component analysis compresses the " + S.p + " measures (@fig:reduction:scree@, @fig:reduction:biplot@)", figures: [
        fig("reduction:scree", CH.scree({ explained: S.pca.explained.slice(0, Math.min(6, S.p)) }), "Scree plot of the principal components.", "The first two components carry " + pc12 + "% of the variance and the scree bends after PC2, so a two-dimensional summary is defensible."),
        fig("reduction:biplot", CH.biplot({ scores: scores, loadings: loadings, groups: clusterLabels(S.K), xlabel: "PC1 (" + pv(S.pca.explained[0]) + "%)", ylabel: "PC2 (" + pv(S.pca.explained[1]) + "%)" }), "Biplot of case scores on PC1–PC2 with variable loadings as vectors.", "Cases spread mainly along PC1; the loading vectors show which measures pull in which direction.", true)
      ], reported: { "PC1+PC2": pc12 + "%" } };
    },
    mds: function (S, r) {
      var m = Math.min(18, S.N), idx = []; for (var i = 0; i < m; i++) idx.push(Math.floor(i * S.N / m));
      var sub = idx.map(function (i2) { return S.rows[i2]; });
      var D = sub.map(function (a) { return sub.map(function (b) { return ST.euclid(a, b); }); });
      var md = ST.cmdscale(D, 2);
      var pts = md.coords.map(function (co, i2) { return { x: co[0], y: co[1], g: S.clusters[idx[i2]] }; });
      var shep = md.pairs.map(function (pr) { return { x: pr.orig, y: pr.emb, g: 0 }; });
      return { intro: "An ordination of case-to-case distances gives an assumption-light check on the same geometry (@fig:mds:map@)", figures: [
        fig("mds:map", CH.clusterScatter({ points: pts, groups: clusterLabels(S.K), xlabel: "MDS 1", ylabel: "MDS 2" }), "Classical multidimensional scaling of the case distance matrix (" + m + "-case sample).", "The MDS map reproduces the component picture without assuming linear structure — the same groups fall in the same relative positions."),
        fig("mds:shepard", CH.scatterFit({ points: shep, xlabel: "original distance", ylabel: "embedded distance" }), "Shepard plot: embedded against original distances (stress = " + dot(md.stress) + ").", "Distances survive the flattening with low stress, so the two-dimensional reading is not an artefact of the projection.")
      ], reported: { stress: dot(md.stress) } };
    },
    clustering: function (S) {
      var pts = S.scores2.map(function (s, i) { return { x: s[0], y: s[1], g: S.clusters[i] }; });
      var sizes = []; for (var c = 0; c < S.K; c++) sizes.push({ label: "cluster " + (c + 1), value: S.clusters.filter(function (x) { return x === c; }).length, g: c });
      return { intro: "k-means on the component scores resolves " + S.K + " groups (@fig:clustering:scatter@)", figures: [
        fig("clustering:scatter", CH.clusterScatter({ points: pts, centroids: S.kmCent.map(function (c) { return { x: c[0], y: c[1] }; }), groups: clusterLabels(S.K), xlabel: "PC1", ylabel: "PC2" }), "k-means partition in principal-component space (× = centroids).", "The clusters are compact and largely separated along PC1, so the reduction and the partition tell one story."),
        fig("clustering:sizes", CH.lollipop({ items: sizes, xlabel: "cluster size" }), "Sizes of the " + S.K + " discovered clusters.", "The partition is " + (Math.max.apply(null, sizes.map(function (s) { return s.value; })) > S.N * 0.6 ? "unbalanced — one cluster dominates the sample" : "reasonably balanced across the sample") + ".")
      ], reported: { k: S.K } };
    },
    hierarchy: function (S) {
      var m = Math.min(16, S.N), idx = []; for (var i = 0; i < m; i++) idx.push(Math.floor(i * S.N / m));
      var sub = idx.map(function (i2) { return S.rows[i2]; }), labels = idx.map(function (_, i2) { return "c" + (i2 + 1); });
      var hc = ST.hclust(sub);
      var D = sub.map(function (a) { return sub.map(function (b) { return ST.euclid(a, b); }); });
      var Dord = hc.order.map(function (i2) { return hc.order.map(function (j) { return D[i2][j]; }); });
      return { intro: "An agglomerative tree over a case sample recovers nested structure (@fig:hierarchy:dendro@)", figures: [
        fig("hierarchy:dendro", CH.dendrogram({ root: hc.root, order: hc.order, labels: labels, ylabel: "distance" }), "Average-linkage dendrogram over a " + m + "-case sample.", "The tree's low branches echo the flat partition — two clustering methods with different assumptions broadly agree."),
        fig("hierarchy:heat", CH.heatmap({ matrix: Dord, rowLabels: hc.order.map(function (i2) { return labels[i2]; }), colLabels: hc.order.map(function (i2) { return labels[i2]; }), diverging: false, cblabel: "dist", cell: 18, labelW: 44, labelT: 40 }), "Distance matrix reordered by the dendrogram.", "Dark blocks on the diagonal are the tight groups the tree isolates.", true)
      ], reported: { "tree height": d2(hc.height) } };
    },
    anomaly: function (S) {
      var md = ST.mahalanobis(S.rows), thresh = ST.quantile(md, 0.95);
      var flagged = md.filter(function (d) { return d > thresh; }).length;
      var pts = S.rows.map(function (row, i) { return { x: row[S.covIdx], y: S.outcome[i], g: md[i] > thresh ? 1 : 0 }; });
      return { intro: "Before modelling we screen for outliers by multivariate distance (@fig:anomaly:scatter@)", figures: [
        fig("anomaly:scatter", CH.clusterScatter({ points: pts, groups: ["typical", "flagged"], xlabel: cap(S.covName), ylabel: S.outcomeName }), "Cases flagged beyond the 95th-percentile Mahalanobis distance.", flagged + " cases sit beyond the cut; they are dispersed rather than forming their own cluster, so we retain them and report robustness instead of trimming."),
        fig("anomaly:hist", CH.histogram({ values: md, xlabel: "Mahalanobis distance", colorIndex: 2 }), "Distribution of Mahalanobis distances from the multivariate centre.", "The distance distribution has a modest right tail — no case dominates the covariance structure.")
      ], reported: { flagged: flagged } };
    },
    difference: function (S) {
      var by = clusterLabels(S.K).map(function (lab, gi) { return { label: "C" + (gi + 1), values: S.outcome.filter(function (_, i) { return S.clusters[i] === gi; }) }; }).filter(function (b) { return b.values.length > 1; });
      var an = ST.anova(by.map(function (b) { return b.values; }));
      return { intro: "The discovered clusters differ in the outcome (one-way ANOVA; @fig:difference:violin@)", figures: [
        fig("difference:violin", CH.violin({ groups: by, ylabel: S.outcomeName }), "The " + esc(S.outcomeName) + " by discovered cluster.", "Between-cluster differences account for " + pv(an.eta2) + "% of the variance in the " + esc(S.outcomeName) + " (η² = " + dot(an.eta2) + ") — the partition is not arbitrary with respect to the outcome.")
      ], reported: { "η²": dot(an.eta2), F: d2(an.F) }, eta: an.eta2 };
    },
    association: function (S) {
      var cov = col(S.rows, S.covIdx), pts = cov.map(function (x, i) { return { x: x, y: S.outcome[i], g: S.clusters[i] }; });
      var rr = ST.correlation(cov, S.outcome), fit = ST.ols(cov.map(function (x) { return [x]; }), S.outcome);
      return { intro: "Within the same cases, the " + esc(S.outcomeName) + " tracks " + esc(S.covName) + " (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, groups: clusterLabels(S.K), xlabel: cap(S.covName), ylabel: S.outcomeName, annot: "r = " + dot(rr) }), "OLS fit of the " + esc(S.outcomeName) + " on " + esc(S.covName) + ", coloured by cluster.", "The association is positive (r = " + dot(rr) + ", p " + fmtP(ST.corrP(rr, S.N)) + ") and holds within each cluster — it is not an artefact of the grouping.")
      ], reported: { r: dot(rr), slope: d2(fit.beta[1]), p: fmtP(ST.corrP(rr, S.N)), r2: dot(fit.r2) }, rr: rr };
    },
    lda: function (S) {
      var L = ST.lda(S.rows, S.binary);
      if (!L) return MV.association(S);
      return { intro: "A discriminant axis asks which combination of measures best splits high from low (@fig:lda:ridge@)", figures: [
        fig("lda:ridge", CH.ridgeline({ groups: [{ label: "low", values: L.s0 }, { label: "high", values: L.s1 }], xlabel: "discriminant score" }), "Distributions of the two halves along the fitted discriminant axis.", "The classes separate at " + pv(L.accuracy) + "% accuracy; the residual overlap is the irreducible ambiguity in the measures."),
        fig("lda:confusion", CH.heatmap({ matrix: L.confusion, rowLabels: ["true low", "true high"], colLabels: ["pred low", "pred high"], diverging: false, cblabel: "n", cell: 32, labelW: 66, labelT: 44 }), "Confusion matrix of the discriminant classifier.", "Errors are balanced between the classes, so the axis is not simply tracking one group's spread.")
      ], reported: { accuracy: dot(L.accuracy) } };
    },
    classification: function (S) {
      var cov = col(S.rows, S.covIdx), lg = ST.logistic(cov.map(function (x) { return [x]; }), S.binary), rc = ST.roc(lg.probs, S.binary);
      var curve = []; for (var t = 0; t <= 40; t++) { var xv = ST.min(cov) + (ST.max(cov) - ST.min(cov)) * t / 40; var z = (xv - lg.mean[0]) / lg.sd[0]; curve.push({ x: xv, p: 1 / (1 + Math.exp(-(lg.w[0] + lg.w[1] * z))) }); }
      return { intro: "Treating a high-" + esc(S.outcomeName) + " flag as a label, " + esc(S.covName) + " predicts it (@fig:classification:logit@, @fig:classification:roc@)", figures: [
        fig("classification:logit", CH.logisticCurve({ points: cov.map(function (x, i) { return { x: x, y: S.binary[i] }; }), curve: curve, xlabel: cap(S.covName) }), "Fitted logistic curve for the high-" + esc(S.outcomeName) + " label against " + esc(S.covName) + ".", "The fitted probability rises smoothly with " + esc(S.covName) + ", crossing one-half near the sample median."),
        fig("classification:roc", CH.roc({ points: rc.points, auc: rc.auc }), "ROC curve for the classifier.", "Discrimination is " + (rc.auc > 0.8 ? "strong" : rc.auc > 0.65 ? "moderate" : "weak") + " (AUC = " + d2(rc.auc) + ").")
      ], reported: { AUC: d2(rc.auc) } };
    },
    synthesis: function (S) {
      var pc1 = col(S.pca.scores, 0), pts = pc1.map(function (x, i) { return { x: x, y: S.outcome[i], g: S.clusters[i] }; });
      var rr = ST.correlation(pc1, S.outcome);
      var means = clusterLabels(S.K).map(function (_, gi) { var v = S.outcome.filter(function (_2, i) { return S.clusters[i] === gi; }); return v.length ? ST.mean(v) : 0; });
      var hi = means.indexOf(ST.max(means));
      return { finding: "Taken together the analyses cohere: the principal axis, the partition, and the outcome are one structure, not three.",
        figure: fig("synth", CH.scatterFit({ points: pts, groups: clusterLabels(S.K), xlabel: "PC1 (principal axis)", ylabel: S.outcomeName, annot: "r = " + dot(rr) }),
          "Synthesis: the " + esc(S.outcomeName) + " against the principal component, coloured by the discovered cluster — the reduction, the clustering, and the outcome on one plane.",
          "PC1 predicts the " + esc(S.outcomeName) + " (r = " + dot(rr) + "), and cluster " + (hi + 1) + " occupies the high-PC1, high-outcome corner: the axis that organises the measures is the same one along which the clusters separate and the outcome grows.") };
    }
  };

  // ============================================================
  // DATASTREAM: temporal record
  // ============================================================
  function streamTemporal(r, field) {
    var terms = r.sample(field.subject.terms, 2), gauss = r.gauss;
    var Tn = r.int(90, 150), y0 = r.int(1790, 1900), period = r.pick([4, 5, 7, 11, 12, 22]), amp = 1 + r.f() * 1.4, ph = r.f() * 6.28, trend = (r.f() - 0.4) * 0.02;
    var shift = r.int(Math.floor(Tn * 0.35), Math.floor(Tn * 0.7)), jump = (r.chance(0.5) ? 1 : -1) * (1.1 + r.f() * 1.3);
    var raw = [], cyc = [], covRaw = [];
    for (var t = 0; t < Tn; t++) {
      var cc = amp * Math.sin(2 * Math.PI * t / period + ph); cyc.push(cc);
      raw.push(3 + trend * t + cc + (t >= shift ? jump : 0) + (0.5 + r.f() * 0.6) * gauss());
      covRaw.push(cc * (0.7 + r.f() * 0.5) + gauss());
    }
    var series = affine(raw, 6, 1), cov = affine(covRaw, 8, 1);
    var pg = ST.periodogram(series), mi = 0; pg.power.forEach(function (pw, i) { if (pw > pg.power[mi]) mi = i; });
    var order = pg.power.map(function (_, i) { return i; }).sort(function (a, b) { return pg.power[b] - pg.power[a]; }).slice(0, 3);
    var tot = pg.power.reduce(function (a, b) { return a + b; }, 0) || 1;
    return {
      kind: "temporal", field: field, N: Tn, y0: y0, series: series, cov: cov, cyc: cyc, pg: pg, mi: mi, terms: terms,
      outcomeName: cap(terms[0].split(" ")[0]) + "-index", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-index",
      peakShare: pg.power[mi] / tot, period: pg.period[mi],
      table: { caption: "The three strongest spectral components of the " + cap(terms[0].split(" ")[0]) + "-index.", cols: ["Rank", "Period", "% power"], rows: order.map(function (i, k) { return ["#" + (k + 1), d2(pg.period[i]) + " yr", pv(pg.power[i] / tot) + "%"]; }) }
    };
  }
  var TS = {
    order: ["distribution", "acf", "changepoint", "trend", "association"],
    tid: { distribution: "distribution", acf: "acf", changepoint: "changepoint", trend: "spectral", association: "ols" },
    distribution: function (S) {
      return { intro: "The series' marginal distribution (@fig:distribution:hist@) sets a baseline", figures: [
        fig("distribution:hist", CH.histogram({ values: S.series, xlabel: S.outcomeName }), "Marginal distribution of the " + esc(S.outcomeName) + " over " + S.N + " years.", "The values are single-moded; the temporal structure is invisible at this marginal view — which is precisely why the series must be analysed as a series.")
      ], reported: { mean: d2(ST.mean(S.series)) } };
    },
    acf: function (S) {
      var ac = ST.acf(S.series, Math.min(28, Math.floor(S.N / 3)));
      var best = ac.values.reduce(function (a, b) { return b.r > a.r ? b : a; }, ac.values[0]);
      var sig = ac.values.filter(function (v) { return Math.abs(v.r) > ac.ci; }).length;
      return { intro: "Autocorrelation shows the record is not independent year to year (@fig:acf:stem@)", figures: [
        fig("acf:stem", CH.stem({ values: ac.values, ci: ac.ci }), "Autocorrelation function with the ±1.96/√n significance envelope.", sig + " lags exceed the envelope and the function peaks at lag " + best.lag + " (r = " + dot(best.r) + "): the series remembers its own past at a regular spacing, which anticipates the spectral result.")
      ], reported: { "peak lag": best.lag, r: dot(best.r) } };
    },
    changepoint: function (S) {
      var cp = ST.changepoints(S.series, 2);
      var series = S.series.map(function (v, i) { return { x: S.y0 + i, y: v }; });
      return { intro: "Segmentation asks whether the record also shifts level (@fig:changepoint:line@)", figures: [
        fig("changepoint:line", CH.line({ series: [{ name: S.outcomeName, points: series }], xlabel: "year", ylabel: S.outcomeName, vlines: cp.points.map(function (i) { return { x: S.y0 + i, label: "shift" }; }), segments: cp.segments.map(function (s) { return { x0: S.y0 + s.start, x1: S.y0 + s.end - 1, y: s.mean }; }) }), "The series with detected changepoints (dashed) and per-segment means (heavy lines).", cp.points.length ? "Binary segmentation locates " + cp.points.length + " level shift" + (cp.points.length > 1 ? "s" : "") + " (at " + cp.points.map(function (i) { return S.y0 + i; }).join(", ") + "); the record is piecewise stationary, so the cycle rides on steps rather than a smooth trend." : "No level shift survives the segmentation criterion — the record is stationary in mean and the oscillation is the whole story.", true)
      ], reported: { changepoints: cp.points.length } };
    },
    trend: function (S) {
      var series = S.series.map(function (v, i) { return { x: S.y0 + i, y: v }; });
      return { intro: "Spectral analysis exposes a dominant cycle (@fig:trend:line@, @fig:trend:spec@)", figures: [
        fig("trend:line", CH.line({ series: [{ name: S.outcomeName, points: series }], xlabel: "year", ylabel: S.outcomeName }), "The " + esc(S.outcomeName) + " series, " + S.y0 + "–" + (S.y0 + S.N - 1) + ".", "A regular oscillation rides on a slow drift; the drift is removed before the transform.", true),
        fig("trend:spec", CH.spectrum({ freq: S.pg.freq, power: S.pg.power, period: S.pg.period }), "Periodogram of the detrended series.", "Power peaks at " + d2(S.period) + " years, carrying " + pv(S.peakShare) + "% of the detrended variance; secondary peaks sit within the noise floor.")
      ], reported: { period: d2(S.period) + " yr", power: pv(S.peakShare) + "%" } };
    },
    association: function (S) {
      var pts = S.cov.map(function (x, i) { return { x: x, y: S.series[i], g: 0 }; }), rr = ST.correlation(S.cov, S.series);
      return { intro: "The record co-moves with a contemporaneous covariate (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, xlabel: cap(S.covName), ylabel: S.outcomeName, annot: "r = " + dot(rr) }), "The " + esc(S.outcomeName) + " against " + esc(S.covName) + ", same years.", "The two move together (r = " + dot(rr) + "), consistent with a shared periodic driver rather than coincidence.")
      ], reported: { r: dot(rr) }, rr: rr };
    },
    synthesis: function (S) {
      var series = S.series.map(function (v, i) { return { x: S.y0 + i, y: v }; });
      var sc = (ST.sd(ST.detrend(S.series)) / (ST.sd(S.cyc) || 1)), fitLine = S.cyc.map(function (v, i) { return { x: S.y0 + i, y: ST.mean(S.series) + v * sc }; });
      var rr = ST.correlation(ST.detrend(S.series), S.cyc);
      return { finding: "The recovered cycle, laid back over the raw series, accounts for its regular excursions.",
        figure: fig("synth", CH.line({ series: [{ name: "observed", points: series }, { name: "fitted cycle", points: fitLine }], xlabel: "year", ylabel: S.outcomeName }),
          "Synthesis: the observed series with the fitted " + d2(S.period) + "-year cycle overlaid.",
          "The single sinusoid the periodogram identified reproduces the series' peaks and troughs (r = " + dot(rr) + " with the detrended data) — description, autocorrelation, spectrum and covariate are one signal seen four ways.", true) };
    }
  };

  // ============================================================
  // DATASTREAM: grouped measurements
  // ============================================================
  function streamGrouped(r, field) {
    var terms = r.sample(field.subject.terms, 2), gauss = r.gauss;
    var K = r.int(3, 5), nPer = r.int(30, 60), names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].slice(0, K);
    var lat = names.map(function () { return (r.f() - 0.5) * 3; }), slope = 0.5 + r.f();
    var groups = [], covs = [];
    for (var gi = 0; gi < K; gi++) { var vv = [], cv = []; for (var i = 0; i < nPer; i++) { var cvi = gauss(); cv.push(cvi); vv.push(lat[gi] + slope * cvi + gauss() * 0.8); } groups.push(vv); covs.push(cv); }
    var all = [].concat.apply([], groups), disp = affine(all, 5, 0.5), off = 0;
    var by = names.map(function (nm, gi2) { var vals = []; for (var i2 = 0; i2 < groups[gi2].length; i2++) vals.push(disp[off++]); return { label: nm, values: vals }; });
    var covAll = affine([].concat.apply([], covs), 8, 1), o2 = 0;
    var covBy = names.map(function (nm, gi2) { var vv2 = []; for (var i3 = 0; i3 < groups[gi2].length; i3++) vv2.push(covAll[o2++]); return vv2; });
    return {
      kind: "grouped", field: field, N: nPer * K, K: K, names: names, by: by, covBy: covBy, terms: terms,
      outcomeName: cap(terms[0].split(" ")[0]) + "-index", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-index", kind2: r.pick(["site", "cohort", "workshop", "provenance"]),
      table: { caption: "The " + cap(terms[0].split(" ")[0]) + "-index by group.", cols: ["Group", "N", "Mean", "SD"], rows: by.map(function (b) { return [b.label, String(b.values.length), d2(ST.mean(b.values)), d2(ST.sd(b.values))]; }) }
    };
  }
  var GR = {
    order: ["distribution", "difference", "chisq", "association"],
    tid: { distribution: "distribution", difference: "anova", chisq: "chisq", association: "ols" },
    distribution: function (S) {
      var all = [].concat.apply([], S.by.map(function (b) { return b.values; }));
      return { intro: "Pooling the " + S.kind2 + "s, the outcome is unimodal (@fig:distribution:hist@)", figures: [
        fig("distribution:hist", CH.histogram({ values: all, xlabel: S.outcomeName }), "Pooled distribution of the " + esc(S.outcomeName) + ".", "The pooled shape is smooth and single-moded — it hides the " + S.kind2 + " structure the next step exposes.")
      ], reported: { mean: d2(ST.mean(all)) } };
    },
    difference: function (S) {
      var an = ST.anova(S.by.map(function (b) { return b.values; })), pooled = ST.sd([].concat.apply([], S.by.map(function (b) { return b.values; }))) || 1;
      var dm = S.by.map(function (a, i) { return S.by.map(function (b, j) { return i === j ? 0 : (ST.mean(a.values) - ST.mean(b.values)) / pooled; }); });
      var dmax = 0; dm.forEach(function (row) { row.forEach(function (v) { dmax = Math.max(dmax, Math.abs(v)); }); });
      return { intro: "The " + S.K + " " + S.kind2 + "s differ (one-way ANOVA; @fig:difference:violin@, @fig:difference:heat@)", figures: [
        fig("difference:violin", CH.violin({ groups: S.by, ylabel: S.outcomeName }), "The " + esc(S.outcomeName) + " across " + S.K + " " + S.kind2 + "s.", "Between-" + S.kind2 + " variance is " + pv(an.eta2) + "% of the total (η² = " + dot(an.eta2) + "), so the grouping carries real information."),
        fig("difference:heat", CH.heatmap({ matrix: dm, rowLabels: S.names, colLabels: S.names, diverging: true, domain: [-Math.max(1, dmax), Math.max(1, dmax)], cblabel: "d" }), "Pairwise Cohen's d between " + S.kind2 + "s.", "The sharpest contrast is d = " + d2(dmax) + "; adjacent " + S.kind2 + "s differ little, consistent with a smooth gradient rather than sharp discontinuities.", true)
      ], reported: { "η²": dot(an.eta2), F: d2(an.F) }, eta: an.eta2 };
    },
    chisq: function (S) {
      // discretize the covariate into terciles and cross-tabulate against group
      var allCov = [].concat.apply([], S.covBy);
      var t1 = ST.quantile(allCov, 1 / 3), t2 = ST.quantile(allCov, 2 / 3);
      var M = S.covBy.map(function (cv) { var row = [0, 0, 0]; cv.forEach(function (v) { row[v <= t1 ? 0 : v <= t2 ? 1 : 2]++; }); return row; });
      var cs = ST.chiSquare(M), colsL = ["low", "mid", "high"];
      var series = colsL.map(function (cl, j) { return { name: cl, values: S.names.map(function (_, i) { return M[i][j]; }) }; });
      return { intro: "Cross-tabulating " + S.kind2 + " against tercile of " + esc(S.covName) + " tests whether the two factors are independent (@fig:chisq:bars@)", figures: [
        fig("chisq:bars", CH.stackedBar({ categories: S.names, series: series }), "Composition of each " + S.kind2 + " by tercile of " + esc(S.covName) + ".", "The " + S.kind2 + "s do not share one profile (χ² = " + d2(cs.X2) + " on " + cs.df + " df, Cramér's V = " + dot(cs.cramersV) + ") — the covariate is distributed unevenly across them."),
        fig("chisq:resid", CH.heatmap({ matrix: cs.residuals, rowLabels: S.names, colLabels: colsL, diverging: true, cblabel: "resid", cell: 26, labelW: 62, labelT: 40 }), "Standardized residuals from independence.", "Warm cells mark the " + S.kind2 + "–tercile combinations that exceed expectation; these are where the dependence lives.", true)
      ], reported: { "χ²": d2(cs.X2), "Cramér's V": dot(cs.cramersV) } };
    },
    association: function (S) {
      var xs = [].concat.apply([], S.covBy), ys = [].concat.apply([], S.by.map(function (b) { return b.values; })), gs = [];
      S.by.forEach(function (b, gi) { b.values.forEach(function () { gs.push(gi); }); });
      var pts = xs.map(function (x, i) { return { x: x, y: ys[i], g: gs[i] }; }), rr = ST.correlation(xs, ys);
      return { intro: "A within-group covariate also moves the outcome (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, groups: S.names, xlabel: cap(S.covName), ylabel: S.outcomeName, annot: "r = " + dot(rr) }), "The " + esc(S.outcomeName) + " on " + esc(S.covName) + ", coloured by " + S.kind2 + ".", "The slope is positive (r = " + dot(rr) + ") and roughly parallel across " + S.kind2 + "s — group and covariate act additively rather than interacting.")
      ], reported: { r: dot(rr) }, rr: rr };
    },
    synthesis: function (S) {
      var gm = ST.mean([].concat.apply([], S.by.map(function (b) { return b.values; }))), pooled = ST.sd([].concat.apply([], S.by.map(function (b) { return b.values; }))) || 1;
      var rows = S.by.map(function (b) { var d = (ST.mean(b.values) - gm) / pooled, se = ST.sd(b.values) / Math.sqrt(b.values.length) / pooled; return { label: b.label, est: d, lo: d - 1.96 * se, hi: d + 1.96 * se }; });
      return { finding: "The group effects, gathered on one scale, show which " + S.kind2 + "s actually drive the difference.",
        figure: fig("synth", CH.forest({ rows: rows, xlabel: "deviation from grand mean (SD)", ref: 0 }),
          "Synthesis: each " + S.kind2 + "'s standardized deviation from the grand mean (95% CI).",
          "Only the " + S.kind2 + "s whose intervals clear the grand-mean line move the ANOVA; the covariate acts on top of these level shifts, not instead of them.") };
    }
  };

  // ============================================================
  // DATASTREAM: cohort with durations
  // ============================================================
  function streamCohort(r, field) {
    var terms = r.sample(field.subject.terms, 2), rate = 0.06 + r.f() * 0.1;
    var N = r.int(90, 180), times = [], events = [], covRaw = [];
    for (var i = 0; i < N; i++) {
      var cr = (r.f() - 0.5) * 2; covRaw.push(cr);
      var lam = rate * Math.exp(0.5 * cr);
      var t = -Math.log(Math.max(1e-6, r.f())) / lam, cens = -Math.log(Math.max(1e-6, r.f())) / (rate * 0.6);
      if (t <= cens) { times.push(+t.toFixed(1)); events.push(1); } else { times.push(+cens.toFixed(1)); events.push(0); }
    }
    var cov = affine(covRaw, 8, 1), km = ST.kaplanMeier(times, events);
    return {
      kind: "cohort", field: field, N: N, times: times, events: events, cov: cov, km: km, terms: terms,
      outcomeName: cap(terms[0].split(" ")[0]) + " time", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-index",
      table: { caption: "Follow-up summary.", cols: ["Quantity", "Value"], rows: [["Cases", String(N)], ["Events", String(events.filter(function (e) { return e; }).length)], ["Censored", String(events.filter(function (e) { return !e; }).length)], ["Median survival", km.median != null ? d2(km.median) : "not reached"]] }
    };
  }
  var CO = {
    order: ["distribution", "survival", "logrank", "association"],
    tid: { distribution: "distribution", survival: "survival", logrank: "logrank", association: "ols" },
    distribution: function (S) {
      return { intro: "Observed durations are right-skewed (@fig:distribution:hist@)", figures: [
        fig("distribution:hist", CH.histogram({ values: S.times, xlabel: "observed duration", colorIndex: 2 }), "Distribution of observed durations (events + censored).", "The long right tail is characteristic of waiting-time data and motivates a survival treatment rather than a mean.")
      ], reported: { median: d2(ST.median(S.times)) } };
    },
    survival: function (S) {
      return { intro: "The Kaplan–Meier estimate tracks how survival falls (@fig:survival:km@)", figures: [
        fig("survival:km", CH.kaplanMeier({ points: S.km.points, median: S.km.median, xlabel: "time", ylabel: "survival S(t)" }), "Kaplan–Meier survival curve with the median marked.", "Median survival is " + (S.km.median != null ? d2(S.km.median) : "not reached") + "; censoring is handled by the estimator rather than discarded.")
      ], reported: { "median survival": S.km.median != null ? d2(S.km.median) : "not reached" } };
    },
    logrank: function (S) {
      var med = ST.median(S.cov), grp = S.cov.map(function (v) { return v > med ? 1 : 0; });
      var tA = [], eA = [], tB = [], eB = [];
      S.times.forEach(function (t, i) { if (grp[i]) { tB.push(t); eB.push(S.events[i]); } else { tA.push(t); eA.push(S.events[i]); } });
      var kmA = ST.kaplanMeier(tA, eA), kmB = ST.kaplanMeier(tB, eB), lr = ST.logRank(S.times, S.events, grp);
      return { intro: "Splitting the cohort at the median of " + esc(S.covName) + " separates the curves (@fig:logrank:km@)", figures: [
        fig("logrank:km", CH.kaplanMeier({ curves: [{ name: "low " + shortLabel(S.covName), points: kmA.points }, { name: "high " + shortLabel(S.covName), points: kmB.points }] }), "Kaplan–Meier curves for cases below and above the median of " + esc(S.covName) + ".", "The arms separate from early follow-up (log-rank χ² = " + d2(lr.chi) + "): " + esc(S.covName) + " stratifies risk, not merely the eventual outcome."),
        fig("logrank:box", CH.box({ groups: [{ label: "low", values: tA }, { label: "high", values: tB }], ylabel: "observed duration" }), "Observed durations by stratum (censored cases included).", "The stratum medians differ in the direction the survival curves imply, so the split is not an artefact of censoring.")
      ], reported: { "χ² (log-rank)": d2(lr.chi) }, eta: Math.min(0.6, lr.chi / (lr.chi + S.N)) };
    },
    association: function (S) {
      var pts = S.cov.map(function (x, i) { return { x: x, y: S.times[i], g: S.events[i] }; }), rr = ST.correlation(S.cov, S.times);
      return { intro: "Duration co-varies with the baseline covariate case by case (@fig:association:scatter@)", figures: [
        fig("association:scatter", CH.scatterFit({ points: pts, groups: ["censored", "event"], xlabel: cap(S.covName), ylabel: "duration", annot: "r = " + dot(rr) }), "Observed duration against " + esc(S.covName) + " (colour = event vs censored).", "Higher " + esc(S.covName) + " goes with " + (rr < 0 ? "shorter" : "longer") + " durations (r = " + dot(rr) + ") — an individual-level hazard signal the survival curve aggregates.")
      ], reported: { r: dot(rr) }, rr: rr };
    },
    synthesis: function (S) {
      var pts = S.cov.map(function (x, i) { return { x: x, y: S.times[i], g: S.events[i] }; }), rr = ST.correlation(S.cov, S.times);
      return { finding: "The covariate that shifts individual durations is the same one the survival curve integrates over.",
        figure: fig("synth", CH.scatterFit({ points: pts, groups: ["censored", "event"], xlabel: cap(S.covName), ylabel: "duration" }),
          "Synthesis: individual durations against " + esc(S.covName) + ", events and censored cases distinguished.",
          "The individual-level gradient (r = " + dot(rr) + ") and the population-level survival curve are two views of one hazard: cases with higher " + esc(S.covName) + " leave the risk set sooner.") };
    }
  };

  // ============================================================
  // DATASTREAM: event counts across sites
  // ============================================================
  function streamCounts(r, field) {
    var terms = r.sample(field.subject.terms, 2);
    var K = r.int(3, 5), names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].slice(0, K);
    var perSite = r.int(28, 55), slope = 0.3 + r.f() * 0.45;
    var base = names.map(function () { return 0.7 + r.f() * 1.1; });
    var counts = [], xs = [], site = [];
    for (var g = 0; g < K; g++) {
      for (var i = 0; i < perSite; i++) {
        var x = r.gauss();
        var lam = Math.exp(base[g] + slope * x), k = 0, acc = 1, L = Math.exp(-lam);
        do { k++; acc *= r.f(); } while (acc > L);
        counts.push(k - 1); xs.push(x); site.push(g);
      }
    }
    var xd = affine(xs, 9, 1);
    var bySite = names.map(function (nm, gi) { return { label: nm, values: counts.filter(function (_, i2) { return site[i2] === gi; }) }; });
    return {
      kind: "counts", field: field, N: counts.length, K: K, names: names, counts: counts, xs: xd, site: site, bySite: bySite, terms: terms,
      outcomeName: cap(terms[0].split(" ")[0]) + " count", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-rate", kind2: r.pick(["site", "deposit", "register", "locality"]),
      table: { caption: "Event counts by site.", cols: ["Site", "N", "Mean count", "SD", "Max"], rows: bySite.map(function (b) { return [b.label, String(b.values.length), d2(ST.mean(b.values)), d2(ST.sd(b.values)), String(ST.max(b.values))]; }) }
    };
  }
  var CT = {
    order: ["distribution", "contingency", "ranking", "poisson"],
    tid: { distribution: "distribution", contingency: "contingency", ranking: "ranking", poisson: "poisson" },
    distribution: function (S) {
      return { intro: "Counts are non-negative and right-skewed (@fig:distribution:hist@)", figures: [
        fig("distribution:hist", CH.histogram({ values: S.counts, xlabel: S.outcomeName, colorIndex: 2 }), "Distribution of " + esc(S.outcomeName) + " across all " + S.N + " observations.", "The distribution is bounded below at zero with a long right tail — a Gaussian model would predict impossible negative counts, so a count model is required.")
      ], reported: { mean: d2(ST.mean(S.counts)), max: String(ST.max(S.counts)) } };
    },
    contingency: function (S) {
      var t1 = ST.quantile(S.counts, 1 / 3), t2 = ST.quantile(S.counts, 2 / 3);
      var M = S.names.map(function (_, gi) { var row = [0, 0, 0]; S.counts.forEach(function (c, i) { if (S.site[i] === gi) row[c <= t1 ? 0 : c <= t2 ? 1 : 2]++; }); return row; });
      var cs = ST.chiSquare(M), colsL = ["sparse", "moderate", "rich"];
      var series = colsL.map(function (cl, j) { return { name: cl, values: S.names.map(function (_, i) { return M[i][j]; }) }; });
      return { intro: "Cross-tabulating " + S.kind2 + " against count band asks whether yield is evenly spread (@fig:contingency:bars@)", figures: [
        fig("contingency:bars", CH.stackedBar({ categories: S.names, series: series }), "Composition of each " + S.kind2 + " by count band.", "The " + S.kind2 + "s do not share one profile (χ² = " + d2(cs.X2) + " on " + cs.df + " df, Cramér's V = " + dot(cs.cramersV) + "): richness is concentrated rather than uniform."),
        fig("contingency:heat", CH.heatmap({ matrix: M, rowLabels: S.names, colLabels: colsL, diverging: false, cblabel: "n", cell: 26, labelW: 62, labelT: 42 }), "Raw counts in the " + S.K + "×3 cross-tabulation.", "The heaviest cells sit off the diagonal of expectation, which is what the rate model has to explain.", true)
      ], reported: { "χ²": d2(cs.X2), "Cramér's V": dot(cs.cramersV) } };
    },
    ranking: function (S) {
      var rows = S.bySite.map(function (b) { var m = ST.mean(b.values), se = ST.sd(b.values) / Math.sqrt(b.values.length); return { label: b.label, est: m, lo: m - 1.96 * se, hi: m + 1.96 * se, se: se }; });
      var sorted = rows.slice().sort(function (a, b) { return b.est - a.est; });
      var overlap = sorted.length > 1 && sorted[1].hi >= sorted[0].lo;
      return { intro: "Ranking the " + S.kind2 + "s by mean count, with intervals, keeps the ordering honest (@fig:ranking:lolli@)", figures: [
        fig("ranking:lolli", CH.lollipop({ items: rows.map(function (x) { return { label: x.label, value: x.est }; }), xlabel: "mean " + S.outcomeName }), "The " + S.K + " " + S.kind2 + "s ranked by mean count.", esc(sorted[0].label) + " leads on the point estimate" + (overlap ? ", but its interval overlaps the runner-up — the lead is not decisive." : ", and its interval clears the runner-up.")),
        fig("ranking:forest", CH.forest({ rows: rows, xlabel: "mean count (95% CI)", ref: ST.mean(S.counts) }), "The same ranking with 95% confidence intervals; the dashed line is the pooled mean.", "Intervals that straddle the pooled mean mark " + S.kind2 + "s statistically indistinguishable from average — ranking them against each other would over-read the data.")
      ], reported: { top: sorted[0].label } };
    },
    poisson: function (S) {
      var po = ST.poisson(S.xs.map(function (v) { return [v]; }), S.counts);
      var ord = S.xs.map(function (_, i) { return i; }).sort(function (a, b) { return S.xs[a] - S.xs[b]; });
      var curve = ord.map(function (i) { return { x: S.xs[i], y: po.fitted[i] }; });
      var bins = 4, byBin = [];
      for (var b = 0; b < bins; b++) {
        var lo = ST.min(S.xs) + (ST.max(S.xs) - ST.min(S.xs)) * b / bins, hi = lo + (ST.max(S.xs) - ST.min(S.xs)) / bins;
        var sel = S.counts.filter(function (_, i) { return S.xs[i] >= lo && (b === bins - 1 ? S.xs[i] <= hi : S.xs[i] < hi); });
        byBin.push({ label: "Q" + (b + 1), value: sel.length ? ST.mean(sel) : 0 });
      }
      return { intro: "A Poisson regression models the rate on a log link (@fig:poisson:curve@)", figures: [
        fig("poisson:curve", CH.line({ series: [{ name: "fitted rate", points: curve }], xlabel: cap(S.covName), ylabel: "expected count" }), "Fitted Poisson rate across the range of " + esc(S.covName) + ".", "Counts rise multiplicatively with " + esc(S.covName) + " (log-link β = " + d2(po.w[1]) + "); the fitted rate stays positive by construction."),
        fig("poisson:bins", CH.lollipop({ items: byBin, sort: false, xlabel: "observed mean count" }), "Observed mean count by quartile of " + esc(S.covName) + ".", "The empirical quartile means climb monotonically, matching the fitted curve — the log-linear form is not imposed against the data.")
      ], reported: { "log-link β": d2(po.w[1]), "base rate": d2(po.rate) }, rr: 0.55, po: po };
    },
    synthesis: function (S) {
      var po = ST.poisson(S.xs.map(function (v, i) { return [v, S.site[i]]; }), S.counts);
      var obs = S.bySite.map(function (b) { return ST.mean(b.values); });
      var pred = S.names.map(function (_, gi) { var f = po.fitted.filter(function (_2, i) { return S.site[i] === gi; }); return f.length ? ST.mean(f) : 0; });
      return { finding: "The site ranking and the rate model are the same statement made two ways.",
        figure: fig("synth", CH.groupedBar({ categories: S.names, series: [{ name: "observed", values: obs }, { name: "model", values: pred }], ylabel: "mean " + S.outcomeName }),
          "Synthesis: observed mean count per " + S.kind2 + " against the count predicted by the fitted rate model.",
          "Observed and modelled means track each other closely across " + S.kind2 + "s: the uneven cross-tabulation, the ranking, and the log-linear rate are one structure — site level plus a shared covariate slope.") };
    }
  };

  // ============================================================
  // DATASTREAM: a network of entities
  // ============================================================
  function bfsDistances(ids, adj) {
    var idx = {}; ids.forEach(function (id, i) { idx[id] = i; });
    return ids.map(function (src) {
      var dist = {}; ids.forEach(function (id) { dist[id] = Infinity; });
      dist[src] = 0; var queue = [src], qi = 0;
      while (qi < queue.length) {
        var cur = queue[qi++];
        (adj[cur] || []).forEach(function (nb) { if (dist[nb] === Infinity) { dist[nb] = dist[cur] + 1; queue.push(nb); } });
      }
      return ids.map(function (id) { return dist[id]; });
    });
  }
  function streamNetwork(r, field) {
    var terms = r.sample(field.subject.terms, 2);
    var K = r.int(2, 4), per = r.int(6, 10), ids = [], nodeLabel = {};
    var stem = r.pick(["W", "S", "H", "L"]);
    for (var c = 0; c < K; c++) for (var i = 0; i < per; i++) { var id = "n" + c + "_" + i; ids.push(id); nodeLabel[id] = stem + (ids.length); }
    var edges = [];
    for (c = 0; c < K; c++) {
      for (i = 0; i < per; i++) for (var j = i + 1; j < per; j++) if (r.chance(0.45)) edges.push({ s: "n" + c + "_" + i, t: "n" + c + "_" + j });
      if (c > 0) edges.push({ s: "n" + c + "_0", t: "n" + (c - 1) + "_0" });   // keep the graph connected
    }
    var adj = {}; ids.forEach(function (id) { adj[id] = []; });
    edges.forEach(function (e) { adj[e.s].push(e.t); adj[e.t].push(e.s); });
    var deg = ids.map(function (id) { return adj[id].length; });
    var D = bfsDistances(ids, adj);
    var maxFinite = 1; D.forEach(function (row) { row.forEach(function (v) { if (v !== Infinity && v > maxFinite) maxFinite = v; }); });
    D = D.map(function (row) { return row.map(function (v) { return v === Infinity ? maxFinite + 1 : v; }); });
    var closeness = D.map(function (row) { var s = ST.sum(row); return s > 0 ? (ids.length - 1) / s : 0; });
    var cm = ST.communities(ids, edges, r.f);
    return {
      kind: "network", field: field, N: ids.length, K: K, ids: ids, edges: edges, adj: adj, deg: deg, D: D,
      closeness: closeness, cm: cm, nodeLabel: nodeLabel, terms: terms,
      outcomeName: "degree", covName: terms[1], indexName: cap(terms[0].split(" ")[0]) + "-network", kind2: "node",
      table: { caption: "Network summary.", cols: ["Quantity", "Value"], rows: [["Nodes", String(ids.length)], ["Edges", String(edges.length)], ["Mean degree", d2(ST.mean(deg))], ["Communities", String(cm.k)], ["Modularity", dot(cm.modularity)]] }
    };
  }
  var NW = {
    order: ["distribution", "community", "mds", "spearman", "ranking"],
    tid: { distribution: "distribution", community: "community", mds: "mds", spearman: "spearman", ranking: "ranking" },
    distribution: function (S) {
      return { intro: "The degree distribution describes how connection is spread (@fig:distribution:hist@)", figures: [
        fig("distribution:hist", CH.histogram({ values: S.deg, xlabel: "node degree", colorIndex: 2 }), "Degree distribution across the " + S.N + " nodes.", "Degree is unevenly distributed — a minority of nodes carry a disproportionate share of the edges, which is what makes the network worth partitioning.")
      ], reported: { nodes: S.N, edges: S.edges.length, "mean degree": d2(ST.mean(S.deg)) } };
    },
    community: function (S) {
      var nodes = S.ids.map(function (id, i) { return { id: id, g: S.cm.labels[id], deg: S.deg[i] }; });
      var sizes = []; for (var c = 0; c < S.cm.k; c++) sizes.push({ label: "community " + (c + 1), value: S.ids.filter(function (id) { return S.cm.labels[id] === c; }).length, g: c });
      return { intro: "Label propagation partitions the graph (@fig:community:graph@)", figures: [
        fig("community:graph", CH.network({ nodes: nodes, edges: S.edges, groups: sizes.map(function (s) { return s.label; }), sameCommunity: function (e) { return S.cm.labels[e.s] === S.cm.labels[e.t]; } }), "Force-directed layout coloured by detected community; within-community edges are drawn darker.", "The algorithm recovers " + S.cm.k + " communities at modularity " + dot(S.cm.modularity) + " — well above the zero expected of a random graph with the same degrees.", true),
        fig("community:sizes", CH.lollipop({ items: sizes, xlabel: "nodes per community" }), "Number of nodes assigned to each detected community.", "The partition is " + (Math.max.apply(null, sizes.map(function (s) { return s.value; })) > S.N * 0.6 ? "dominated by one large group" : "reasonably even") + ".")
      ], reported: { communities: S.cm.k, modularity: dot(S.cm.modularity) }, eta: Math.max(0.05, S.cm.modularity) };
    },
    mds: function (S) {
      var md = ST.cmdscale(S.D, 2);
      var pts = md.coords.map(function (co, i) { return { x: co[0], y: co[1], g: S.cm.labels[S.ids[i]] }; });
      var shep = md.pairs.map(function (pr) { return { x: pr.orig, y: pr.emb, g: 0 }; });
      return { intro: "Embedding the shortest-path distances places the graph in a plane (@fig:mds:map@)", figures: [
        fig("mds:map", CH.clusterScatter({ points: pts, groups: (function () { var o = []; for (var c = 0; c < S.cm.k; c++) o.push("community " + (c + 1)); return o; })(), xlabel: "MDS 1", ylabel: "MDS 2" }), "Classical scaling of the graph's shortest-path distance matrix, coloured by community.", "Communities occupy distinct regions of the embedding, so the partition is geometric and not merely a labelling artefact of the algorithm."),
        fig("mds:shepard", CH.scatterFit({ points: shep, xlabel: "graph distance", ylabel: "embedded distance" }), "Shepard plot (stress = " + dot(md.stress) + ").", "Path distances survive the flattening reasonably well; the discreteness of graph distance sets a floor on the achievable stress.")
      ], reported: { stress: dot(md.stress) } };
    },
    spearman: function (S) {
      var sp = ST.spearman(S.deg, S.closeness), pear = ST.correlation(S.deg, S.closeness);
      var rd = ST.rank(S.deg), rc = ST.rank(S.closeness);
      var pts = rd.map(function (v, i) { return { x: v, y: rc[i], g: S.cm.labels[S.ids[i]] }; });
      var moves = S.ids.map(function (id, i) { return { label: S.nodeLabel[id], value: rc[i] - rd[i] }; }).sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); }).slice(0, 8);
      return { intro: "Two centrality measures need not agree; rank correlation tests whether they do (@fig:spearman:scatter@)", figures: [
        fig("spearman:scatter", CH.scatterFit({ points: pts, xlabel: "rank by degree", ylabel: "rank by closeness", annot: "ρ = " + dot(sp) }), "Rank–rank scatter of degree against closeness centrality.", "The two measures agree monotonically (ρ = " + dot(sp) + " against Pearson r = " + dot(pear) + "): locally busy nodes are also globally central, so the choice of centrality is not load-bearing here."),
        fig("spearman:moves", CH.lollipop({ items: moves, xlabel: "rank displacement (closeness − degree)" }), "Nodes whose rank shifts most between the two measures.", "The displaced nodes are bridges: modest degree but short paths to everywhere, which degree alone would undervalue.")
      ], reported: { "Spearman ρ": dot(sp), "Pearson r": dot(pear) }, rr: sp };
    },
    ranking: function (S) {
      var rows = S.ids.map(function (id, i) { var est = S.deg[i], se = Math.sqrt(Math.max(1, est)); return { label: S.nodeLabel[id], est: est, lo: Math.max(0, est - 1.96 * se), hi: est + 1.96 * se }; })
        .sort(function (a, b) { return b.est - a.est; }).slice(0, 8);
      return { intro: "Ranking the best-connected nodes, with intervals, shows how firm the ordering is (@fig:ranking:forest@)", figures: [
        fig("ranking:forest", CH.forest({ rows: rows, xlabel: "degree (95% CI)", ref: ST.mean(S.deg) }), "The eight highest-degree nodes with intervals; the dashed line is mean degree.", "The leading nodes' intervals overlap heavily, so the identity of 'the' hub is not resolved by these data — only the leading set is.")
      ], reported: { top: rows[0].label, "top degree": String(rows[0].est) } };
    },
    synthesis: function (S) {
      var nodes = S.ids.map(function (id, i) { return { id: id, g: S.cm.labels[id], deg: S.deg[i] }; });
      var top = 0; for (var i = 1; i < S.deg.length; i++) if (S.deg[i] > S.deg[top]) top = i;
      var groups = []; for (var c = 0; c < S.cm.k; c++) groups.push("community " + (c + 1));
      return { finding: "Community and centrality are not independent readings of the graph — the hubs sit inside the communities they hold together.",
        figure: fig("synth", CH.network({ nodes: nodes, edges: S.edges, groups: groups, sameCommunity: function (e) { return S.cm.labels[e.s] === S.cm.labels[e.t]; } }),
          "Synthesis: the network with colour showing community and node size showing degree.",
          "The largest node (" + esc(S.nodeLabel[S.ids[top]]) + ", degree " + S.deg[top] + ") sits in community " + (S.cm.labels[S.ids[top]] + 1) + " rather than between communities: the partition, the embedding, and the centrality ranking describe one modular structure with internal hubs.", true) };
    }
  };

  var STREAMS = {
    multivariate: { w: 4, build: streamMultivariate, an: MV, designLabel: "a multivariate analysis" },
    temporal: { w: 2, build: streamTemporal, an: TS, designLabel: "a time-series analysis" },
    grouped: { w: 2, build: streamGrouped, an: GR, designLabel: "a comparative analysis" },
    cohort: { w: 2, build: streamCohort, an: CO, designLabel: "a survival analysis" },
    counts: { w: 2, build: streamCounts, an: CT, designLabel: "a count-data analysis" },
    network: { w: 2, build: streamNetwork, an: NW, designLabel: "a network analysis" }
  };
  var STREAM_KEYS = Object.keys(STREAMS), SHAPE_KEYS = Object.keys(SHAPES);

  // ---------- plan: which stream, shape and genome techniques, WITHOUT building data ----------
  // Draws randomness in exactly the same order as run(), so the two always agree.
  // This is what makes the genome↔paper bridge cheap enough to run in the browser.
  function plan(paperId) {
    var r = W._Rand("analysis::" + paperId);
    r.gauss = function () { var u1 = Math.max(1e-9, r.f()), u2 = r.f(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
    var kind = r.pickw(STREAM_KEYS, function (k) { return STREAMS[k].w; });
    var shapeKey = r.pickw(SHAPE_KEYS, function (k) { return SHAPES[k].w; });
    var shape = SHAPES[shapeKey], an = STREAMS[kind].an;
    var L = shape.min === shape.max ? shape.min : r.int(shape.min, shape.max);
    var steps = chooseSteps(r, an.order, L);
    return { design: kind, shape: shapeKey, steps: steps, techniques: steps.map(function (k) { return an.tid[k]; }), rand: r };
  }

  function run(paperId, field) {
    field = field || W.generate(String(paperId).split(".")[0]);
    var pl = plan(paperId), r = pl.rand;
    var def = STREAMS[pl.design], an = def.an, shape = SHAPES[pl.shape];
    var S = def.build(r, field);
    var steps = pl.steps.map(function (key) { var out = an[key](S, r); out.key = key; out.tid = an.tid[key]; return out; });
    var synth = shape.synthesis ? an.synthesis(S, r) : null;

    // Results as a story: lead → table → one subsection per technique (figures + readouts)
    var resultsFlow = [];
    var techNames = steps.map(function (s) { return label(s.tid); });
    var lead = steps.length === 1
      ? "We analysed the " + S.N + " observations by " + techNames[0] + " (@tab@)."
      : "We analysed the same " + S.N + " observations through " + steps.length + " lenses — " + techNames.join(", ") + " — building from description to inference (@tab@).";
    resultsFlow.push({ t: "p", html: lead, first: true });
    resultsFlow.push({ t: "table", caption: S.table.caption, cols: S.table.cols, rows: S.table.rows });
    steps.forEach(function (st, si) {
      resultsFlow.push({ t: "h3", text: (si + 1) + ". " + cap(label(st.tid)), tid: st.tid });
      resultsFlow.push({ t: "p", html: st.intro + "." });
      st.figures.forEach(function (f) {
        resultsFlow.push({ t: "fig", role: f.role, svg: f.svg, caption: f.caption, wide: f.wide });
        resultsFlow.push({ t: "p", html: f.readout });
      });
    });

    var discussionFlow = [];
    if (synth) {
      discussionFlow = [
        { t: "h3", text: "Synthesis" },
        { t: "p", html: synth.finding },
        { t: "fig", role: synth.figure.role, svg: synth.figure.svg, caption: synth.figure.caption, wide: synth.figure.wide },
        { t: "p", html: synth.figure.readout }
      ];
    }

    var infer = steps.filter(function (s) { return s.rr !== undefined || s.eta !== undefined; }).pop() || steps[steps.length - 1];
    var varEx = infer.eta !== undefined ? pv(infer.eta)
      : (S.pca ? pv(S.pca.explained[0] + S.pca.explained[1]) : (S.peakShare !== undefined ? pv(S.peakShare) : 40));
    var rr = infer.rr !== undefined ? Math.abs(infer.rr) : (infer.eta !== undefined ? Math.sqrt(infer.eta) : 0.5);
    var reported = {
      N: S.N, r: dot(rr), p: (infer.reported && infer.reported.p) || "< .01", varExplained: varEx,
      y0: r.int(field.field.founded, 2013), y1: 0, kappa: d2(0.62 + r.f() * 0.34),
      techniques: steps.map(function (s) { return s.tid; })
    };
    reported.y1 = reported.y0 + r.int(2, 9);

    var focal = { index: S.terms[0], rival: S.terms[Math.min(1, S.terms.length - 1)], cov: S.covName || S.terms[Math.min(1, S.terms.length - 1)] };
    var EQS = {
      temporal: '<i>P</i>(<i>f</i>) = <span class="frac"><span class="num">2</span><span class="den">N</span></span> &#124;&sum;<sub><i>t</i></sub> <i>y<sub>t</sub></i> <i>e</i><sup>&minus;2&pi;<i>i f t</i></sup>&#124;<sup>2</sup>',
      cohort: '<i>Ŝ</i>(<i>t</i>) = &prod;<sub><i>t<sub>i</sub></i> &le; <i>t</i></sub> (1 &minus; <i>d<sub>i</sub></i> / <i>n<sub>i</sub></i>)',
      counts: '<i>y<sub>i</sub></i> ~ Poisson(&mu;<sub><i>i</i></sub>),&nbsp;&nbsp; log&nbsp;&mu;<sub><i>i</i></sub> = &beta;<sub>0</sub> + &beta;<sub>1</sub> <i>x<sub>i</sub></i>',
      network: '<i>Q</i> = &sum;<sub><i>c</i></sub> [ <i>e<sub>c</sub></i>/<i>m</i> &minus; (<i>d<sub>c</sub></i>/2<i>m</i>)<sup>2</sup> ]',
      multivariate: '<b>R</b> <i>v<sub>c</sub></i> = &lambda;<sub><i>c</i></sub> <i>v<sub>c</sub></i>,&nbsp;&nbsp; <i>y<sub>i</sub></i> = &beta;<sub>0</sub> + &beta;<sub>1</sub> <i>x<sub>i</sub></i> + &epsilon;<sub>i</sub>'
    };
    var eq = { t: "eq", html: EQS[pl.design] || EQS.multivariate };

    var dataStatement = pl.design === "multivariate" ? "<b>Attributes.</b> We measured " + S.p + " attributes of " + esc(field.subject.n) + " on " + S.N + " cases collected in @place@ (" + reported.y0 + "–" + reported.y1 + "), standardizing each before analysis."
      : pl.design === "temporal" ? "<b>Series.</b> We compiled the annual " + esc(S.outcomeName) + " for " + esc(field.subject.n) + " over " + S.N + " years (" + S.y0 + "–" + (S.y0 + S.N - 1) + "), with a contemporaneous covariate."
        : pl.design === "grouped" ? "<b>Sample.</b> We measured the " + esc(S.outcomeName) + " and a covariate on " + S.N + " instances of " + esc(field.subject.n) + " drawn from " + S.K + " " + S.kind2 + "s, in @place@ (" + reported.y0 + "–" + reported.y1 + ")."
          : pl.design === "counts" ? "<b>Counts.</b> We recorded " + esc(S.outcomeName) + "s for " + S.N + " observations of " + esc(field.subject.n) + " across " + S.K + " " + S.kind2 + "s in @place@ (" + reported.y0 + "–" + reported.y1 + "), together with a continuous covariate."
            : pl.design === "network" ? "<b>Network.</b> We assembled a graph of " + S.N + " " + esc(field.subject.n) + " entities joined by " + S.edges.length + " co-occurrence edges (@place@, " + reported.y0 + "–" + reported.y1 + "), analysing it as an unweighted undirected network."
              : "<b>Cohort.</b> We followed " + S.N + " instances of " + esc(field.subject.n) + " to an event or censoring, recording a baseline covariate (@place@, " + reported.y0 + "–" + reported.y1 + ").";

    return {
      design: pl.design, designLabel: def.designLabel,
      shape: pl.shape, shapeLabel: shape.label, shapeKicker: shape.kicker,
      frame: { indexName: S.indexName, focal: focal, groupsLabel: S.kind2 || "group", nGroups: S.K || 1 },
      reported: reported,
      dataStatement: dataStatement,
      methodsFlow: [
        { t: "p", html: steps.length === 1
          ? "We applied one technique to this datastream: " + esc(label(steps[0].tid)) + ". The core operation is"
          : "We put one datastream through several techniques: " + steps.map(function (s) { return esc(label(s.tid)); }).join(", then ") + ". The core operations are" },
        eq
      ],
      table: { caption: S.table.caption, cols: S.table.cols, rows: S.table.rows },
      resultsFlow: resultsFlow,
      discussionFlow: discussionFlow
    };
  }

  // ---------- the genome → paper bridge ----------
  // Find a paper whose story uses a given genome technique. plan() is cheap (no
  // data, no figures), so scanning a few hundred seeds is fast enough to run in
  // the browser on demand. Returns null when no paper in range uses it — which is
  // the honest answer for genome-only techniques (they mark the roadmap).
  var bridgeCache = {};
  function findPaperUsing(tid, limit) {
    limit = limit || 400;
    if (bridgeCache[tid] !== undefined) return bridgeCache[tid];
    for (var i = 1; i <= limit; i++) {
      var id = i + ".f";
      if (plan(id).techniques.indexOf(tid) >= 0) { bridgeCache[tid] = id; return id; }
    }
    bridgeCache[tid] = null;
    return null;
  }
  // Which genome techniques can appear in papers at all (union over streams)?
  function paperTechniques() {
    var out = {};
    STREAM_KEYS.forEach(function (k) { var an = STREAMS[k].an; an.order.forEach(function (key) { out[an.tid[key]] = true; }); });
    return Object.keys(out);
  }

  A.run = run;
  A.plan = function (id) { var p = plan(id); return { design: p.design, shape: p.shape, steps: p.steps, techniques: p.techniques }; };
  A.findPaperUsing = findPaperUsing;
  A.paperTechniques = paperTechniques;
  A.streams = STREAM_KEYS;
  A.SHAPES = SHAPES;
})();
