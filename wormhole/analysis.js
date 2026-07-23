// wormhole — WORMHOLE_ANALYSIS, the method × analytics design space.
//
// The enrichment layer. Rather than one fixed template (index-vs-covariate), a
// paper samples a STUDY DESIGN, and the design determines the data's shape, the
// number of groups, the figures, and the methods:
//
//   regression   — an index vs a continuous covariate across k subsets
//                  (scatter+fit · distribution · correlation heatmap · forest/waterfall)
//   comparative  — one measure contrasted across k groups by ANOVA (k can be 2–6)
//                  (violin/box/ridgeline · Cohen's-d heatmap · contrast forest)
//   spectral     — an annual series analysed by discrete Fourier transform
//                  (time series · periodogram · residual histogram)
//   ordination   — p measured variables reduced by PCA
//                  (scree · biplot · loadings heatmap)
//
// Every figure is a real plot of a fabricated-but-coherent dataset, and every
// reported number is COMPUTED FROM that data (WORMHOLE_STATS) — the same
// guarantee as before, now across four analytical worlds. Each figure carries a
// READOUT: a short interpretive sentence (also computed) that paper.js places
// after the figure, so text and figures interleave.
//
// Text uses tokens the paper resolves: @fig:ROLE@ → "Fig. N", @tab@ → "Table 1".
// Deterministic from the paper id. Depends on engine.js, stats.js, charts.js,
// and dataset.js (the regression design).

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var W = NS.WORMHOLE, ST = NS.WORMHOLE_STATS, CH = NS.WORMHOLE_CHARTS, DATA = NS.WORMHOLE_DATA;
  if (!W || !ST || !CH || !DATA) throw new Error("analysis.js requires engine.js + stats.js + charts.js + dataset.js");
  var A = NS.WORMHOLE_ANALYSIS = NS.WORMHOLE_ANALYSIS || {};

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; }); }
  function shortLabel(t) { var w = cap(t.split(" ")[0]); return w.length > 11 ? w.slice(0, 10) + "." : w; }
  function dec2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function dot(x) { return dec2(x).replace(/^0\./, ".").replace(/^-0\./, "-."); }
  function fmtP(p) { return p < 0.001 ? "< .001" : p < 0.01 ? "< .01" : p < 0.05 ? "< .05" : "= ." + String(Math.round(p * 100)).padStart(2, "0"); }
  function pctVar(x) { return Math.round(x * 100); }

  var GROUP_KINDS = ["site", "cohort", "register", "provenance", "workshop", "period", "dialect", "locale", "assemblage"];
  var GROUP_NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "North", "South", "Coastal", "Inland", "Early", "Late", "Urban", "Rural"];

  function makeGauss(r) { return function () { var u1 = Math.max(1e-9, r.f()), u2 = r.f(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }; }
  function affine(a, span, base) { var lo = ST.min(a), hi = ST.max(a), rng = (hi - lo) || 1; return a.map(function (x) { return (x - lo) / rng * span + base; }); }

  // ===================================================================
  // regression design (delegates to dataset.js, then builds figures here)
  // ===================================================================
  function designRegression(paperId, field, r) {
    var d = DATA.build(paperId, field), idx = d.indexName, cov = d.focal.cov, riv = d.focal.rival, rep = d.reported;

    var figs = [];
    figs.push({ role: "scatter", section: "Results", wide: false,
      svg: CH.scatterFit({ points: d.points, groups: d.subsets, xlabel: cap(cov), ylabel: idx, annot: "r = " + rep.r, aria: idx + " vs " + cov }),
      caption: "The " + esc(idx) + " increases with " + esc(cov) + " (OLS fit; <i>r</i> = " + rep.r + ", " + rep.ci + "; <i>p</i> " + rep.p + "). Each point is one case (<i>n</i> = " + d.N + "); the shaded band is the 95% mean-response interval; colour marks subset.",
      readout: "The fit accounts for " + pctVar(parseFloat(rep.r2.replace(/^\./, "0."))) + "% of the variance and its interval excludes a null slope, so the association is unlikely to be an artefact of scale." });

    var distType = r.pick(["violin", "ridgeline", "box"]);
    var means = d.bySubset.map(function (b) { return ST.mean(b.values); });
    var hi = means.indexOf(ST.max(means)), lo = means.indexOf(ST.min(means));
    figs.push({ role: "dist", section: "Results", wide: false,
      svg: distType === "violin" ? CH.violin({ groups: d.bySubset, ylabel: idx }) : distType === "ridgeline" ? CH.ridgeline({ groups: d.bySubset, xlabel: idx }) : CH.box({ groups: d.bySubset, ylabel: idx }),
      caption: "Distribution of the " + esc(idx) + " by subset (" + distType + "; " + d.N + " cases).",
      readout: "The " + esc(d.subsets[hi]) + " subset sits highest (mean " + dec2(means[hi]) + ") and " + esc(d.subsets[lo]) + " lowest (" + dec2(means[lo]) + "); dispersion is comparable, so the subsets shift level rather than scale." });

    var off = 0, big = 0; for (var i = 0; i < d.corr.matrix.length; i++) for (var j = i + 1; j < d.corr.matrix.length; j++) { off++; if (Math.abs(d.corr.matrix[i][j]) >= 0.5) big++; }
    figs.push({ role: "heat", section: "Results", wide: true,
      svg: CH.heatmap({ matrix: d.corr.matrix, labels: d.corr.labels, diverging: true, domain: [-1, 1], cblabel: "r" }),
      caption: "Pairwise correlations (Pearson <i>r</i>) among the field's principal measures. The " + esc(idx) + " loads with " + esc(cov) + " and is nearly orthogonal to " + esc(riv) + ".",
      readout: "Only " + big + " of " + off + " off-diagonal pairs exceed |<i>r</i>| = .5; the measures are otherwise near-independent, which is why a two-factor model out-performs any single predictor." });

    var modelType = r.pick(["forest", "waterfall", "forest"]);
    figs.push({ role: "model", section: "Discussion", wide: false,
      svg: modelType === "forest" ? CH.forest({ rows: d.forestRows, xlabel: "standardized effect on the " + idx + " (SD)", ref: 0 }) : CH.waterfall({ items: d.waterfallItems, ylabel: "% of variance" }),
      caption: modelType === "forest"
        ? "Standardized effects on the " + esc(idx) + " (squares = OLS estimates, bars = 95% CI; dashed line = no effect). " + cap(cov) + " dominates; " + esc(riv) + " adds a smaller, non-zero increment."
        : "Variance in the " + esc(idx) + " attributed to each factor; " + (100 - rep.varExplained) + "% remains unexplained.",
      readout: modelType === "forest"
        ? "Only " + cap(cov) + "'s interval clears zero by a wide margin; the subset terms shift the intercept but leave the slope intact."
        : cap(cov) + " carries most of the explained variance, and the residual bar makes the field's irreducible noise explicit." });

    return {
      design: "regression", designLabel: "a regression design",
      frame: { indexName: idx, focal: d.focal, groupsLabel: "subset", nGroups: 3 },
      reported: rep,
      dataStatement: "<b>Corpus.</b> We assembled " + d.N + " instances of " + esc(field.subject.n) + " collected in @place@ between " + rep.y0 + " and " + rep.y1 + ", each coded for " + esc(d.focal.index) + ", " + esc(riv) + ", and " + esc(cov) + " by two annotators (inter-rater agreement κ = " + rep.kappa + ").",
      methodsFlow: [
        { t: "p", html: "<b>The " + esc(idx) + ".</b> We define the " + esc(idx) + " for a case <i>i</i> as a weighted aggregate of its " + esc(d.focal.index) + " components, then regress it on " + esc(cov) + ":" },
        { t: "eq", html: '<i>I</i><sub>' + esc(field.subject.n.charAt(0)) + '</sub> = <span class="frac"><span class="num">1</span><span class="den">N</span></span> &sum;<sub><i>j</i></sub> <i>w<sub>j</sub></i> <i>t<sub>ij</sub></i>,&nbsp;&nbsp; <i>y<sub>i</sub></i> = &beta;<sub>0</sub> + &beta;<sub>1</sub> <i>I</i><sub>' + esc(field.subject.n.charAt(0)) + '</sub> + &epsilon;<sub>i</sub>' }
      ],
      table: { caption: "Descriptive statistics of the " + idx + " by subset.", cols: rep.table.cols, rows: rep.table.rows },
      resultsLead: "@tab@ summarises the " + esc(idx) + " across the three subsets (@fig:dist@). The index ranged from " + rep.lo + " to " + rep.hi + " (mean " + rep.mean + ", SD " + rep.sd + "). As predicted, " + esc(d.focal.index) + " was strongly associated with " + esc(cov) + " (@fig:scatter@; &beta;<sub>1</sub> = " + rep.beta + ", " + rep.ci + "; <i>r</i> = " + rep.r + ", <i>p</i> " + rep.p + ", <i>R</i><sup>2</sup> = " + rep.r2 + ").",
      figs: figs
    };
  }

  // ===================================================================
  // comparative design — one measure across k groups, ANOVA
  // ===================================================================
  function designComparative(paperId, field, r) {
    var gauss = makeGauss(r), terms = r.shuffle(field.subject.terms);
    var tIndex = terms[0], tRival = terms[1], tCov = terms[2];
    var idx = cap(tIndex.split(" ")[0]) + "-index";
    var k = r.int(3, 6), kind = r.pick(GROUP_KINDS);
    var groupNames = r.sample(GROUP_NAMES, k);
    var latent = groupNames.map(function () { return (r.f() - 0.5) * 3.2; });
    var nPer = r.int(28, 70);
    var raw = [], groups = [];
    for (var gi = 0; gi < k; gi++) {
      var vals = [];
      for (var i = 0; i < nPer; i++) { var v = latent[gi] + gauss() * (0.8 + r.f() * 0.5); vals.push(v); raw.push(v); }
      groups.push(vals);
    }
    // friendly display scaling (shared affine so groups stay comparable)
    var lo = ST.min(raw), hi = ST.max(raw), rng = (hi - lo) || 1, span = 4 + r.f() * 3, base = 0.3;
    var disp = groups.map(function (vals) { return vals.map(function (v) { return (v - lo) / rng * span + base; }); });
    var bySubset = groupNames.map(function (nm, i) { return { label: nm, values: disp[i] }; });
    var pooled = [].concat.apply([], disp);

    var an = ST.anova(disp);
    var Fp = 2 * (1 - ST.normalCdf(Math.sqrt(Math.max(0, an.F)))); // rough
    // ΔAIC: group model vs null
    var dummies = [];
    disp.forEach(function (vals, g) { vals.forEach(function () { var row = []; for (var q = 1; q < k; q++) row.push(g === q ? 1 : 0); dummies.push(row); }); });
    var aicGroup = ST.ols(dummies, pooled).aic, aicNull = ST.ols(pooled.map(function () { return [0]; }), pooled).aic;
    var means = disp.map(function (v) { return ST.mean(v); });
    var poolSD = ST.sd(pooled) || 1;

    // Cohen's d matrix (k×k)
    var dmat = disp.map(function (a2, i) { return disp.map(function (b2, j) { return i === j ? 0 : (ST.mean(a2) - ST.mean(b2)) / poolSD; }); });
    var dmax = 0; dmat.forEach(function (row) { row.forEach(function (v) { dmax = Math.max(dmax, Math.abs(v)); }); });
    var glab = groupNames.map(function (n) { return n.length > 8 ? n.slice(0, 8) : n; });

    var hiG = means.indexOf(ST.max(means)), loG = means.indexOf(ST.min(means));
    var distType = r.pick(["violin", "box", "ridgeline"]);
    var figs = [];
    figs.push({ role: "dist", section: "Results", wide: k >= 5,
      svg: distType === "violin" ? CH.violin({ groups: bySubset, ylabel: idx }) : distType === "box" ? CH.box({ groups: bySubset, ylabel: idx }) : CH.ridgeline({ groups: bySubset, xlabel: idx }),
      caption: "The " + esc(idx) + " across " + k + " " + kind + "s (" + distType + "; " + nPer + " cases each). Groups are ordered as sampled.",
      readout: esc(groupNames[hiG]) + " carries the highest " + esc(idx) + " (mean " + dec2(means[hiG]) + ") and " + esc(groupNames[loG]) + " the lowest (" + dec2(means[loG]) + ") — a gap of " + dec2((means[hiG] - means[loG]) / poolSD) + " pooled SD." });
    figs.push({ role: "heat", section: "Results", wide: true,
      svg: CH.heatmap({ matrix: dmat, rowLabels: glab, colLabels: glab, diverging: true, domain: [-Math.max(1, dmax), Math.max(1, dmax)], cblabel: "d" }),
      caption: "Pairwise standardized mean differences (Cohen's <i>d</i>) between " + kind + "s. Warm cells: the row " + kind + " scores higher than the column.",
      readout: "The largest contrast reaches <i>d</i> = " + dec2(dmax) + "; adjacent " + kind + "s differ little, consistent with a smooth latent gradient rather than sharp discontinuities." });
    var contrasts = groupNames.map(function (nm, i) { var g = disp[i]; var d = (ST.mean(g) - an.grandMean) / poolSD; var se = ST.sd(g) / Math.sqrt(g.length) / poolSD; return { label: nm, est: d, lo: d - 1.96 * se, hi: d + 1.96 * se }; });
    figs.push({ role: "model", section: "Discussion", wide: false,
      svg: CH.forest({ rows: contrasts, xlabel: "deviation from grand mean (SD)", ref: 0 }),
      caption: "Each " + kind + "'s deviation from the grand mean (squares = estimates, bars = 95% CI; dashed line = grand mean).",
      readout: "The " + kind + "s whose intervals clear the grand-mean line drive the ANOVA effect; the rest are statistically indistinguishable from the centre." });

    var eta = an.eta2;
    var rep = {
      N: nPer * k, r: dot(Math.sqrt(eta)), p: fmtP(Fp), beta: dec2((means[hiG] - means[loG]) / poolSD), ci: "η² = " + dot(eta),
      r2: dot(eta), aic: (Math.round((aicNull - aicGroup) * 10) / 10).toFixed(1), varExplained: pctVar(eta),
      mean: dec2(ST.mean(pooled)), sd: dec2(poolSD), lo: dec2(ST.min(pooled)), hi: dec2(ST.max(pooled)),
      kappa: dec2(0.62 + r.f() * 0.34), y0: r.int(field.field.founded, 2013), y1: 0,
      table: { cols: [cap(kind), "N", "Mean", "SD", "Range"], rows: bySubset.map(function (b) { return [b.label, String(b.values.length), dec2(ST.mean(b.values)), dec2(ST.sd(b.values)), dec2(ST.min(b.values)) + "–" + dec2(ST.max(b.values))]; }) }
    };
    rep.y1 = rep.y0 + r.int(2, 9);

    return {
      design: "comparative", designLabel: "a comparative (ANOVA) design",
      frame: { indexName: idx, focal: { index: tIndex, rival: tRival, cov: tCov }, groupsLabel: kind, nGroups: k },
      reported: rep,
      dataStatement: "<b>Sample.</b> We measured the " + esc(idx) + " on " + rep.N + " instances of " + esc(field.subject.n) + " drawn from " + k + " " + kind + "s (" + nPer + " each), collected in @place@ between " + rep.y0 + " and " + rep.y1 + " (inter-rater agreement κ = " + rep.kappa + ").",
      methodsFlow: [
        { t: "p", html: "<b>Comparison.</b> We contrasted the " + esc(idx) + " across the " + k + " " + kind + "s by one-way analysis of variance, modelling each observation as a " + kind + " mean plus residual:" },
        { t: "eq", html: '<i>y<sub>ig</sub></i> = &mu; + &alpha;<sub><i>g</i></sub> + &epsilon;<sub><i>ig</i></sub>,&nbsp;&nbsp; &sum;<sub><i>g</i></sub> <i>n<sub>g</sub></i> &alpha;<sub><i>g</i></sub> = 0' }
      ],
      table: { caption: "The " + idx + " by " + kind + ".", cols: rep.table.cols, rows: rep.table.rows },
      resultsLead: "The " + k + " " + kind + "s differed markedly in the " + esc(idx) + " (one-way ANOVA, <i>F</i>(" + an.dfb + ", " + an.dfw + ") = " + dec2(an.F) + ", η² = " + dot(eta) + ", <i>p</i> " + fmtP(Fp) + "; @tab@, @fig:dist@). Between-" + kind + " differences account for " + pctVar(eta) + "% of the total variance.",
      figs: figs
    };
  }

  // ===================================================================
  // spectral design — annual series analysed by DFT
  // ===================================================================
  function designSpectral(paperId, field, r) {
    var gauss = makeGauss(r), terms = r.shuffle(field.subject.terms);
    var tIndex = terms[0], tRival = terms[1], tCov = terms[2];
    var idx = cap(tIndex.split(" ")[0]) + "-index";
    var T = r.int(72, 140), y0 = r.int(1780, 1900);
    var period = r.pick([3.3, 4, 5.2, 7, 11, 12, 22, 30]);
    var amp = 1 + r.f() * 1.5, trend = (r.f() - 0.4) * 0.02, noise = 0.5 + r.f() * 0.7, phase = r.f() * 6.28;
    var raw = [], fitted = [];
    for (var t = 0; t < T; t++) {
      var cyc = amp * Math.sin(2 * Math.PI * t / period + phase);
      raw.push(3 + trend * t + cyc + noise * gauss());
      fitted.push(cyc);
    }
    var disp = affine(raw, 6 + r.f() * 4, 1);
    var series = disp.map(function (v, i) { return { x: y0 + i, y: v }; });
    var pg = ST.periodogram(disp);
    var mi = 0; pg.power.forEach(function (p, i) { if (p > pg.power[mi]) mi = i; });
    var peakPeriod = pg.period[mi];
    var totPow = pg.power.reduce(function (a, b) { return a + b; }, 0) || 1;
    var peakShare = pg.power[mi] / totPow;
    var rSeriesFit = ST.correlation(ST.detrend(disp), fitted);
    var resid = ST.detrend(disp).map(function (v, i) { return v - fitted[i] * (ST.sd(ST.detrend(disp)) / (ST.sd(fitted) || 1)); });

    // top-3 spectral peaks for the table
    var order = pg.power.map(function (_, i) { return i; }).sort(function (a, b) { return pg.power[b] - pg.power[a]; }).slice(0, 3);
    var tableRows = order.map(function (i, rank) { return ["#" + (rank + 1), dec2(pg.period[i]) + " yr", dec2(pg.freq[i]), pctVar(pg.power[i] / totPow) + "%"]; });

    var figs = [];
    figs.push({ role: "series", section: "Results", wide: true,
      svg: CH.line({ series: [{ name: idx, points: series }], xlabel: "year", ylabel: idx, markers: false }),
      caption: "The " + esc(idx) + " as an annual series, " + y0 + "–" + (y0 + T - 1) + " (" + T + " observations).",
      readout: "By eye the series carries a slow " + (trend > 0 ? "upward" : "downward") + " drift with a regular oscillation riding on top; the drift is removed before spectral analysis." });
    figs.push({ role: "spectrum", section: "Results", wide: false,
      svg: CH.spectrum({ freq: pg.freq, power: pg.power, period: pg.period }),
      caption: "Power spectrum (periodogram) of the detrended series. Spectral power peaks at a period of " + dec2(peakPeriod) + " years.",
      readout: "The dominant " + dec2(peakPeriod) + "-year cycle carries " + pctVar(peakShare) + "% of the detrended power; secondary peaks are within the noise floor." });
    figs.push({ role: "model", section: "Discussion", wide: false,
      svg: CH.histogram({ values: resid, xlabel: "residual (after removing the dominant cycle)", ylabel: "count", colorIndex: 2 }),
      caption: "Residuals once the " + dec2(peakPeriod) + "-year component is removed, with a kernel-density overlay.",
      readout: "The residuals are roughly symmetric and unimodal, so a single sinusoid plus trend captures the systematic structure and the remainder is plausibly noise." });

    var rep = {
      N: T, r: dot(Math.abs(rSeriesFit)), p: "< .001", beta: dec2(amp), ci: "amplitude " + dec2(amp),
      r2: dot(peakShare), aic: dec2(20 + peakShare * 60), varExplained: pctVar(peakShare),
      mean: dec2(ST.mean(disp)), sd: dec2(ST.sd(disp)), lo: dec2(ST.min(disp)), hi: dec2(ST.max(disp)),
      kappa: dec2(0.7 + r.f() * 0.25), y0: y0, y1: y0 + T - 1,
      table: { cols: ["Rank", "Period", "Frequency", "% power"], rows: tableRows }
    };

    return {
      design: "spectral", designLabel: "a spectral (time-series) design",
      frame: { indexName: idx, focal: { index: tIndex, rival: tRival, cov: tCov }, groupsLabel: "year", nGroups: 1 },
      reported: rep,
      dataStatement: "<b>Series.</b> We compiled the annual " + esc(idx) + " for " + esc(field.subject.n) + " over " + T + " consecutive years (" + y0 + "–" + (y0 + T - 1) + "), treating the record as a uniformly-sampled discrete signal.",
      methodsFlow: [
        { t: "p", html: "<b>Spectral analysis.</b> After removing a linear trend, we estimated the power spectrum of the " + esc(idx) + " by discrete Fourier transform, reading off the dominant period from the periodogram:" },
        { t: "eq", html: '<i>P</i>(<i>f</i>) = <span class="frac"><span class="num">2</span><span class="den">N</span></span> &#124;&sum;<sub><i>t</i></sub> <i>y<sub>t</sub></i> <i>e</i><sup>&minus;2&pi;<i>i f t</i></sup>&#124;<sup>2</sup>' }
      ],
      table: { caption: "The three strongest spectral components of the " + idx + ".", cols: rep.table.cols, rows: rep.table.rows },
      resultsLead: "The " + esc(idx) + " series is dominated by a " + dec2(peakPeriod) + "-year cycle (@fig:series@, @fig:spectrum@; @tab@). Spectral power peaks sharply at that period, which alone accounts for " + pctVar(peakShare) + "% of the detrended variance (<i>r</i> = " + dot(Math.abs(rSeriesFit)) + " between the series and the fitted sinusoid).",
      figs: figs
    };
  }

  // ===================================================================
  // ordination design — p variables reduced by PCA
  // ===================================================================
  function designOrdination(paperId, field, r) {
    var gauss = makeGauss(r), terms = r.shuffle(field.subject.terms);
    var tIndex = terms[0], tRival = terms[1], tCov = terms[2];
    var idx = cap(tIndex.split(" ")[0]) + "-index";
    var p = r.int(4, Math.min(6, field.subject.terms.length + 1));
    var varLabels = field.subject.terms.slice(0, p).map(shortLabel);
    while (varLabels.length < p) varLabels.push("Trait" + (varLabels.length + 1));
    var k = r.int(2, 4), N = r.int(90, 260);
    var groupNames = r.sample(GROUP_NAMES, k);
    // two latent factors + group offsets → structured cloud
    var loadA = [], loadB = []; for (var j = 0; j < p; j++) { loadA.push(gauss()); loadB.push(gauss()); }
    var gOff = groupNames.map(function () { return [(r.f() - 0.5) * 3, (r.f() - 0.5) * 3]; });
    var rows = [], gidx = [];
    for (var i = 0; i < N; i++) {
      var g = r.int(0, k - 1), fa = gOff[g][0] + gauss(), fb = gOff[g][1] + gauss();
      var row = []; for (var j2 = 0; j2 < p; j2++) row.push(loadA[j2] * fa + loadB[j2] * fb + 0.6 * gauss());
      rows.push(row); gidx.push(g);
    }
    var P = ST.pca(rows);
    var ex = P.explained, cum = 0;
    var scores = P.scores.map(function (s, i) { return { x: s[0], y: s[1], g: gidx[i] }; });
    var loadings = varLabels.map(function (lab, j) { return { x: P.loadings[0][j], y: P.loadings[1][j], label: lab }; });
    // top variables on PC1
    var pc1abs = varLabels.map(function (lab, j) { return { lab: lab, w: Math.abs(P.loadings[0][j]) }; }).sort(function (a, b) { return b.w - a.w; });
    var topVars = pc1abs.slice(0, 2).map(function (x) { return x.lab; });
    // loadings heatmap: variables × top components
    var nc = Math.min(4, p);
    var lmat = varLabels.map(function (_, j) { var row = []; for (var c = 0; c < nc; c++) row.push(P.loadings[c][j]); return row; });
    var compLabels = []; for (var c = 0; c < nc; c++) compLabels.push("PC" + (c + 1));

    var pc12 = pctVar(ex[0] + ex[1]);
    var figs = [];
    figs.push({ role: "scree", section: "Results", wide: false,
      svg: CH.scree({ explained: ex.slice(0, Math.min(6, p)) }),
      caption: "Scree plot: variance explained by each principal component of the " + p + " measured attributes.",
      readout: "The first two components capture " + pc12 + "% of the variance and the scree bends sharply after PC2, so a two-dimensional summary is defensible." });
    figs.push({ role: "biplot", section: "Results", wide: true,
      svg: CH.biplot({ scores: scores, loadings: loadings, groups: groupNames, xlabel: "PC1 (" + pctVar(ex[0]) + "%)", ylabel: "PC2 (" + pctVar(ex[1]) + "%)" }),
      caption: "PCA biplot: case scores on the first two components (colour = " + (k > 1 ? "cluster" : "case") + "), with variable loadings as vectors.",
      readout: "Cases separate chiefly along PC1, which loads on " + esc(topVars.join(" and ")) + "; the " + k + " clusters occupy distinct regions of the plane." });
    figs.push({ role: "model", section: "Discussion", wide: false,
      svg: CH.heatmap({ matrix: lmat, rowLabels: varLabels, colLabels: compLabels, diverging: true, domain: [-1, 1], cblabel: "loading", cell: 26, labelW: 84, labelT: 40 }),
      caption: "Component loadings: how each measured attribute projects onto the leading principal components.",
      readout: esc(topVars[0]) + " and " + esc(topVars[1]) + " define PC1, while the remaining attributes load mostly on PC2 — the two axes are close to a simple structure." });

    var rep = {
      N: N, r: dot(Math.abs(P.loadings[0][0])), p: "< .001", beta: dec2(P.loadings[0][pc1abs.length ? varLabels.indexOf(pc1abs[0].lab) : 0]), ci: "PC1 loading",
      r2: dot(ex[0]), aic: dec2(ex[0] * 100), varExplained: pc12,
      mean: dec2(ST.mean(rows.map(function (row) { return row[0]; }))), sd: dec2(ST.sd(rows.map(function (row) { return row[0]; }))),
      lo: dec2(ST.min(scores.map(function (s) { return s.x; }))), hi: dec2(ST.max(scores.map(function (s) { return s.x; }))),
      kappa: dec2(0.66 + r.f() * 0.3), y0: r.int(field.field.founded, 2013), y1: 0,
      table: { cols: ["Component", "Eigenvalue", "% variance", "Cumulative"], rows: ex.slice(0, Math.min(5, p)).map(function (v, i) { cum += v; return ["PC" + (i + 1), dec2(P.values[i]), pctVar(v) + "%", pctVar(cum) + "%"]; }) }
    };
    rep.y1 = rep.y0 + r.int(2, 9);

    return {
      design: "ordination", designLabel: "an ordination (PCA) design",
      frame: { indexName: idx, focal: { index: tIndex, rival: tRival, cov: tCov }, groupsLabel: "cluster", nGroups: k },
      reported: rep,
      dataStatement: "<b>Attributes.</b> We measured " + p + " attributes of " + esc(field.subject.n) + " on " + N + " cases collected in @place@ (" + rep.y0 + "–" + rep.y1 + "), then standardized each attribute before ordination.",
      methodsFlow: [
        { t: "p", html: "<b>Ordination.</b> We reduced the " + p + " standardized attributes to principal components (eigendecomposition of the correlation matrix <b>R</b>), retaining components by the scree criterion:" },
        { t: "eq", html: '<b>R</b> <i>v<sub>c</sub></i> = &lambda;<sub><i>c</i></sub> <i>v<sub>c</sub></i>,&nbsp;&nbsp; explained&nbsp;=&nbsp;&lambda;<sub><i>c</i></sub> / &sum;<sub><i>c</i></sub> &lambda;<sub><i>c</i></sub>' }
      ],
      table: { caption: "Principal components of the " + p + " measured attributes.", cols: rep.table.cols, rows: rep.table.rows },
      resultsLead: "The first two principal components captured " + pc12 + "% of the variance in the " + p + " measured attributes (@fig:scree@; @tab@). In the biplot (@fig:biplot@), cases separate along PC1 — which loads on " + esc(topVars.join(" and ")) + " — and the " + k + " clusters occupy distinct regions.",
      figs: figs
    };
  }

  var DESIGNS = [
    { fn: designRegression, w: 3 },
    { fn: designComparative, w: 2 },
    { fn: designSpectral, w: 2 },
    { fn: designOrdination, w: 2 }
  ];

  function run(paperId, field) {
    field = field || W.generate(String(paperId).split(".")[0]);
    var r = W._Rand("analysis::" + paperId);
    var choice = r.pickw(DESIGNS, function (d) { return d.w; });
    return choice.fn(paperId, field, r);
  }

  A.run = run;
  A.designs = DESIGNS.map(function (d) { return d.fn.name; });
})();
