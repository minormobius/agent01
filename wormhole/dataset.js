// wormhole — WORMHOLE_DATA, the coherent-dataset fabricator.
//
// The high bar: a paper's figures must not merely illustrate its claims — the
// FABRICATED DATASET IS the evidence, and every reported number is COMPUTED FROM
// IT. build() invents a plausible dataset for a paper (deterministically), then
// runs real statistics (WORMHOLE_STATS) over it: the correlation, the OLS slope
// and its CI, the per-subset table, the variance decomposition, ΔAIC. paper.js
// reads those numbers, and charts.js plots the very same arrays — so the scatter's
// cloud really does have r ≈ the r in the Results sentence.
//
// The data is fiction; the statistics done to it are honest. Deterministic from
// the paper id (same paper → same dataset, for ever). Depends on engine.js (field
// context: the subject's term vocabulary) and stats.js.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var W = NS.WORMHOLE, ST = NS.WORMHOLE_STATS;
  if (!W || !ST) throw new Error("dataset.js requires engine.js + stats.js");
  var D = NS.WORMHOLE_DATA = NS.WORMHOLE_DATA || {};

  var SUBSET_POOL = ["coastal", "upland", "urban", "rural", "early period", "late period",
    "northern", "southern", "documented", "vernacular", "lowland", "montane"];

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function shortLabel(term) { var w = cap(term.split(" ")[0]); return w.length > 11 ? w.slice(0, 10) + "." : w; }
  function standardize(a) { var m = ST.mean(a), s = ST.sd(a) || 1; return a.map(function (x) { return (x - m) / s; }); }
  function affine(a, targetSpan, base) {
    var lo = ST.min(a), hi = ST.max(a), rng = (hi - lo) || 1;
    return a.map(function (x) { return (x - lo) / rng * targetSpan + base; });
  }
  function fmtP(p) {
    if (p < 0.001) return "< .001";
    if (p < 0.01) return "< .01";
    if (p < 0.05) return "< .05";
    return "= ." + String(Math.round(p * 100)).padStart(2, "0");
  }
  function dec2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function dotDec(x) { return dec2(x).replace(/^0\./, ".").replace(/^-0\./, "-."); }

  function build(paperId, field) {
    field = field || W.generate(String(paperId).split(".")[0]);
    var subj = field.subject;
    var r = W._Rand("data::" + paperId);
    function gauss() { var u1 = Math.max(1e-9, r.f()), u2 = r.f(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }

    // focal terms: the concept the Index measures, the rival, the covariate
    var focalOrder = r.shuffle(subj.terms);
    var tIndex = focalOrder[0], tRival = focalOrder[1], tCov = focalOrder[2];
    var term4 = focalOrder[3] || subj.terms[0], term5 = focalOrder[4] || subj.terms[1];
    var indexName = cap(tIndex.split(" ")[0]) + "-index";

    var N = r.int(150, 420);
    var subsets = r.sample(SUBSET_POOL, 3);
    var subBase = r.shuffle([-(0.7 + r.f()), (r.f() - 0.5) * 0.5, (0.8 + r.f())]);

    var aCov = 0.75 + r.f() * 0.85;      // covariate drives the index (positive)
    var aRiv = 0.25 + r.f() * 0.55;      // rival contributes too (small → not reducible)
    var covRiv = 0.20 + r.f() * 0.40;    // covariate/rival share some variance
    var noise = 0.7 + r.f() * 0.8;

    var rawIdx = [], rawCov = [], rawRiv = [], e4 = [], e5 = [], sIdx = [];
    for (var i = 0; i < N; i++) {
      var s = r.int(0, 2);
      var zc = gauss();
      var zr = covRiv * zc + Math.sqrt(1 - covRiv * covRiv) * gauss();
      var idx = subBase[s] + aCov * zc + aRiv * zr + noise * gauss();
      sIdx.push(s); rawCov.push(zc); rawRiv.push(zr); rawIdx.push(idx);
      e4.push(0.5 * zc - 0.35 * zr + 0.85 * gauss());
      e5.push(-0.45 * idx + 0.7 * gauss());
    }

    // friendly display scales (affine; r and model fit are invariant to this)
    var idxDisp = affine(rawIdx, 4 + r.f() * 3, 0.3);
    var covDisp = affine(rawCov, 8 + r.f() * 6, 1 + r.f() * 3);

    // scatter points (covariate vs index), coloured by subset
    var points = [];
    for (i = 0; i < N; i++) points.push({ x: covDisp[i], y: idxDisp[i], g: sIdx[i] });

    // reported: correlation, slope + CI, R², p
    var rC = ST.correlation(covDisp, idxDisp);
    var ols1 = ST.ols(covDisp.map(function (x) { return [x]; }), idxDisp);
    var b1 = ols1.beta[1], se1 = ols1.se[1];
    var ciLo = b1 - 1.96 * se1, ciHi = b1 + 1.96 * se1;
    var pVal = ST.corrP(rC, N);

    // per-subset distributions + table
    var bySubset = subsets.map(function (lab, gi) {
      var vals = idxDisp.filter(function (_, k) { return sIdx[k] === gi; });
      if (!vals.length) vals = [ST.mean(idxDisp)];
      return { label: cap(lab), values: vals };
    });
    var tableRows = bySubset.map(function (b) {
      return [b.label, String(b.values.length), dec2(ST.mean(b.values)), dec2(ST.sd(b.values)),
        dec2(ST.min(b.values)) + "–" + dec2(ST.max(b.values))];
    });

    // correlation matrix among all five field measures (+ the Index)
    var cols = [idxDisp, covDisp, rawRiv, e4, e5];
    var corrLabels = ["Index", shortLabel(tCov), shortLabel(tRival), shortLabel(term4), shortLabel(term5)];
    var matrix = cols.map(function (a) { return cols.map(function (b) { return ST.correlation(a, b); }); });

    // forest: standardized effects on the (standardized) index
    var zy = standardize(idxDisp);
    var covS = standardize(covDisp), rivS = standardize(rawRiv);
    var d1 = sIdx.map(function (s) { return s === 1 ? 1 : 0; });
    var d2 = sIdx.map(function (s) { return s === 2 ? 1 : 0; });
    var rowsX = zy.map(function (_, k) { return [covS[k], rivS[k], d1[k], d2[k]]; });
    var full = ST.ols(rowsX, zy);
    var forestRows = [
      { label: shortLabel(tCov), est: full.beta[1], lo: full.beta[1] - 1.96 * full.se[1], hi: full.beta[1] + 1.96 * full.se[1] },
      { label: shortLabel(tRival), est: full.beta[2], lo: full.beta[2] - 1.96 * full.se[2], hi: full.beta[2] + 1.96 * full.se[2] },
      { label: "Subset: " + cap(subsets[1]), est: full.beta[3], lo: full.beta[3] - 1.96 * full.se[3], hi: full.beta[3] + 1.96 * full.se[3] },
      { label: "Subset: " + cap(subsets[2]), est: full.beta[4], lo: full.beta[4] - 1.96 * full.se[4], hi: full.beta[4] + 1.96 * full.se[4] }
    ];

    // variance decomposition (last-in ΔR²), normalized to the model's R²
    var R2f = Math.max(0.01, full.r2);
    function dropR2(keep) { return ST.ols(zy.map(function (_, k) { return keep.map(function (col) { return col[k]; }); }), zy).r2; }
    var cCov = Math.max(0.005, R2f - dropR2([rivS, d1, d2]));
    var cRiv = Math.max(0.005, R2f - dropR2([covS, d1, d2]));
    var cSub = Math.max(0.005, R2f - dropR2([covS, rivS]));
    var tot = cCov + cRiv + cSub;
    var scaleV = R2f / tot;
    var resid = 1 - R2f;
    var waterfallItems = [
      { label: shortLabel(tCov), value: +(cCov * scaleV * 100).toFixed(1) },
      { label: shortLabel(tRival), value: +(cRiv * scaleV * 100).toFixed(1) },
      { label: "Subset", value: +(cSub * scaleV * 100).toFixed(1) },
      { label: "Unexplained", value: +(resid * 100).toFixed(1), kind: "residual" }
    ];

    // ΔAIC: reductive (index ~ rival) vs two-factor (index ~ rival + covariate)
    var aicRed = ST.ols(rawRiv.map(function (x) { return [x]; }), idxDisp).aic;
    var aicTwo = ST.ols(rawRiv.map(function (x, k) { return [x, covDisp[k]]; }), idxDisp).aic;
    var dAIC = Math.max(2, aicRed - aicTwo);

    var y0 = r.int(field.field.founded, 2013), y1 = y0 + r.int(2, 9);

    return {
      id: String(paperId), N: N, subsets: subsets.map(cap), indexName: indexName,
      focal: { index: tIndex, rival: tRival, cov: tCov },
      points: points, bySubset: bySubset,
      corr: { matrix: matrix, labels: corrLabels },
      forestRows: forestRows, waterfallItems: waterfallItems,
      reported: {
        N: N, r: dotDec(Math.abs(rC)), rSigned: dotDec(rC), p: fmtP(pVal),
        beta: dec2(b1), ci: "95% CI [" + dec2(ciLo) + ", " + dec2(ciHi) + "]",
        r2: dotDec(ols1.r2), ciCrossesZero: (ciLo <= 0 && ciHi >= 0),
        mean: dec2(ST.mean(idxDisp)), sd: dec2(ST.sd(idxDisp)),
        lo: dec2(ST.min(idxDisp)), hi: dec2(ST.max(idxDisp)),
        kappa: dec2(0.62 + r.f() * 0.34), aic: (Math.round(dAIC * 10) / 10).toFixed(1),
        varExplained: Math.round(R2f * 100), y0: y0, y1: y1,
        table: { cols: ["Subset", "N", "Mean", "SD", "Range"], rows: tableRows }
      }
    };
  }

  D.build = build;
})();
