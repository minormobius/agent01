// wormhole — WORMHOLE_STATS, a tiny dependency-free statistics core.
//
// Shared by the charting library (charts.js) and the dataset fabricator
// (dataset.js). Deliberately generic and un-fictional: this is the in-house
// numerics we'd keep for real data. Pure functions, no state, node/browser/worker.
//
// Includes: descriptive stats, quantiles, correlation, ordinary least squares
// (k predictors, via normal equations + Gaussian elimination) with standard
// errors and R², a normal CDF/quantile pair, a Gaussian KDE (for violins /
// ridgelines), histogram binning, and an ECDF.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.WORMHOLE_STATS = NS.WORMHOLE_STATS || {};

  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : 0; }
  function variance(a) {
    if (a.length < 2) return 0;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - m; s += d * d; }
    return s / (a.length - 1);
  }
  function sd(a) { return Math.sqrt(variance(a)); }
  function min(a) { return Math.min.apply(null, a); }
  function max(a) { return Math.max.apply(null, a); }

  // type-7 quantile (numpy/R default)
  function quantile(a, p) {
    if (!a.length) return NaN;
    var s = a.slice().sort(function (x, y) { return x - y; });
    if (p <= 0) return s[0];
    if (p >= 1) return s[s.length - 1];
    var h = (s.length - 1) * p, lo = Math.floor(h);
    var frac = h - lo;
    return s[lo] + (s[lo + 1] - s[lo]) * frac;
  }
  function median(a) { return quantile(a, 0.5); }

  function correlation(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    var mx = mean(x), my = mean(y), sxy = 0, sx = 0, sy = 0;
    for (var i = 0; i < n; i++) {
      var dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sx += dx * dx; sy += dy * dy;
    }
    if (sx === 0 || sy === 0) return 0;
    return sxy / Math.sqrt(sx * sy);
  }

  // solve A x = b (A is n×n, row-major array of arrays). Gaussian elimination
  // with partial pivoting. Returns x, or null if singular.
  function solve(A, b) {
    var n = b.length, i, j, k;
    var M = A.map(function (row, r) { return row.slice().concat([b[r]]); });
    for (i = 0; i < n; i++) {
      var piv = i;
      for (k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
      if (Math.abs(M[piv][i]) < 1e-12) return null;
      var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      for (k = i + 1; k < n; k++) {
        var f = M[k][i] / M[i][i];
        for (j = i; j <= n; j++) M[k][j] -= f * M[i][j];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  // Ordinary least squares. rows: array of predictor-vectors (WITHOUT intercept);
  // y: outcomes. Adds an intercept column. Returns coefficients (beta[0]=intercept),
  // standard errors, residuals, RSS, R², n, k.
  function ols(rows, y) {
    var n = y.length, p = rows[0].length + 1, i, j, k;
    var X = rows.map(function (r) { return [1].concat(r); });
    // X'X and X'y
    var XtX = [], Xty = [];
    for (i = 0; i < p; i++) {
      XtX.push(new Array(p).fill(0));
      Xty.push(0);
    }
    for (i = 0; i < n; i++) {
      for (j = 0; j < p; j++) {
        Xty[j] += X[i][j] * y[i];
        for (k = 0; k < p; k++) XtX[j][k] += X[i][j] * X[i][k];
      }
    }
    var beta = solve(XtX, Xty);
    if (!beta) beta = new Array(p).fill(0);
    // residuals + RSS + TSS
    var my = mean(y), rss = 0, tss = 0, resid = [];
    for (i = 0; i < n; i++) {
      var yh = 0;
      for (j = 0; j < p; j++) yh += X[i][j] * beta[j];
      var e = y[i] - yh; resid.push(e); rss += e * e;
      var d = y[i] - my; tss += d * d;
    }
    var dof = Math.max(1, n - p);
    var sigma2 = rss / dof;
    // se from diagonal of sigma2 * (X'X)^-1 — invert via solving against identity
    var se = new Array(p).fill(0);
    var inv = invert(XtX);
    if (inv) for (j = 0; j < p; j++) se[j] = Math.sqrt(Math.max(0, sigma2 * inv[j][j]));
    return {
      beta: beta, se: se, resid: resid, rss: rss, tss: tss,
      r2: tss > 0 ? 1 - rss / tss : 0, n: n, k: p, sigma2: sigma2,
      aic: n * Math.log(rss / n) + 2 * p
    };
  }

  function invert(A) {
    var n = A.length, i, j, k;
    var M = A.map(function (row, r) {
      return row.slice().concat(Array.from({ length: n }, function (_, c) { return c === r ? 1 : 0; }));
    });
    for (i = 0; i < n; i++) {
      var piv = i;
      for (k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
      if (Math.abs(M[piv][i]) < 1e-12) return null;
      var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      var d = M[i][i];
      for (j = 0; j < 2 * n; j++) M[i][j] /= d;
      for (k = 0; k < n; k++) {
        if (k === i) continue;
        var f = M[k][i];
        for (j = 0; j < 2 * n; j++) M[k][j] -= f * M[i][j];
      }
    }
    return M.map(function (row) { return row.slice(n); });
  }

  // normal CDF (Abramowitz & Stegun 7.1.26 via erf)
  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function normalCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  // inverse normal CDF (Acklam)
  function normalQuantile(p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // two-sided p-value for a correlation r with n observations (t approx → normal)
  function corrP(r, n) {
    if (n < 3) return 1;
    var t = r * Math.sqrt((n - 2) / Math.max(1e-9, 1 - r * r));
    return 2 * (1 - normalCdf(Math.abs(t)));
  }

  // Gaussian kernel density estimate. Returns densities at each x in xs.
  function kde(samples, xs, h) {
    if (!h) {
      var s = sd(samples), iqr = quantile(samples, 0.75) - quantile(samples, 0.25);
      var a = Math.min(s, iqr / 1.349) || s || 1;
      h = 1.06 * a * Math.pow(samples.length, -0.2) || 1;
    }
    var inv = 1 / (h * Math.sqrt(2 * Math.PI));
    return xs.map(function (x) {
      var acc = 0;
      for (var i = 0; i < samples.length; i++) { var u = (x - samples[i]) / h; acc += Math.exp(-0.5 * u * u); }
      return inv * acc / samples.length;
    });
  }

  function histogram(samples, nbins) {
    var lo = min(samples), hi = max(samples);
    if (hi === lo) hi = lo + 1;
    nbins = nbins || Math.max(5, Math.round(Math.sqrt(samples.length)));
    var w = (hi - lo) / nbins, bins = [];
    for (var b = 0; b < nbins; b++) bins.push({ x0: lo + b * w, x1: lo + (b + 1) * w, n: 0 });
    for (var i = 0; i < samples.length; i++) {
      var idx = Math.min(nbins - 1, Math.floor((samples[i] - lo) / w));
      bins[idx].n++;
    }
    return bins;
  }

  function ecdf(samples) {
    var s = samples.slice().sort(function (a, b) { return a - b; });
    return s.map(function (v, i) { return { x: v, p: (i + 1) / s.length }; });
  }

  // symmetric-matrix eigendecomposition via cyclic Jacobi rotations.
  // Returns eigenvalues (descending) and matching eigenvectors (as columns).
  function jacobiEig(Ain) {
    var n = Ain.length, A = Ain.map(function (r) { return r.slice(); }), i, j, k;
    var V = []; for (i = 0; i < n; i++) { V.push([]); for (j = 0; j < n; j++) V[i].push(i === j ? 1 : 0); }
    for (var sweep = 0; sweep < 100; sweep++) {
      var off = 0; for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-16) break;
      for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-18) continue;
        var phi = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
        var c = Math.cos(phi), s = Math.sin(phi), akp, akq;
        for (k = 0; k < n; k++) { akp = A[k][p]; akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (k = 0; k < n; k++) { akp = A[p][k]; akq = A[q][k]; A[p][k] = c * akp - s * akq; A[q][k] = s * akp + c * akq; }
        for (k = 0; k < n; k++) { var vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    var vals = []; for (i = 0; i < n; i++) vals.push(A[i][i]);
    var ord = vals.map(function (_, i2) { return i2; }).sort(function (a, b) { return vals[b] - vals[a]; });
    return {
      values: ord.map(function (i2) { return vals[i2]; }),
      vectors: ord.map(function (i2) { return V.map(function (row) { return row[i2]; }); }) // vectors[c] = c-th eigenvector
    };
  }

  // PCA on a case × variable matrix (standardized → PCA of the correlation matrix).
  function pca(rows) {
    var n = rows.length, p = rows[0].length, i, j, k;
    var means = [], sds = [];
    for (j = 0; j < p; j++) { var col = rows.map(function (r) { return r[j]; }); means.push(mean(col)); sds.push(sd(col) || 1); }
    var Z = rows.map(function (r) { return r.map(function (v, jj) { return (v - means[jj]) / sds[jj]; }); });
    var Cm = []; for (j = 0; j < p; j++) Cm.push(new Array(p).fill(0));
    for (i = 0; i < n; i++) for (j = 0; j < p; j++) for (k = 0; k < p; k++) Cm[j][k] += Z[i][j] * Z[i][k] / (n - 1);
    var e = jacobiEig(Cm);
    var tot = e.values.reduce(function (a, v) { return a + Math.max(0, v); }, 0) || 1;
    var explained = e.values.map(function (v) { return Math.max(0, v) / tot; });
    var scores = Z.map(function (row) {
      return e.vectors.map(function (vec) { var s = 0; for (var jj = 0; jj < p; jj++) s += row[jj] * vec[jj]; return s; });
    });
    var loadings = e.vectors.map(function (vec, ci) { var Lr = Math.sqrt(Math.max(0, e.values[ci])); return vec.map(function (x) { return x * Lr; }); });
    return { values: e.values, vectors: e.vectors, explained: explained, scores: scores, loadings: loadings };
  }

  // remove a linear trend from a series (returns residuals)
  function detrend(y) {
    var f = ols(y.map(function (_, i) { return [i]; }), y);
    return y.map(function (v, i) { return v - (f.beta[0] + f.beta[1] * i); });
  }

  // one-sided periodogram (naive DFT) of a detrended signal.
  function periodogram(signal) {
    var y = detrend(signal), n = y.length, m = Math.floor(n / 2), out = { freq: [], power: [], period: [] };
    for (var kk = 1; kk <= m; kk++) {
      var re = 0, im = 0;
      for (var t = 0; t < n; t++) { var ang = 2 * Math.PI * kk * t / n; re += y[t] * Math.cos(ang); im += y[t] * Math.sin(ang); }
      out.freq.push(kk / n); out.power.push((re * re + im * im) * 2 / n); out.period.push(n / kk);
    }
    return out;
  }

  // one-way ANOVA over an array of groups (arrays). η² is the effect size.
  function anova(groups) {
    var all = [].concat.apply([], groups), gm = mean(all), ssb = 0, ssw = 0;
    groups.forEach(function (g) { var m = mean(g); ssb += g.length * (m - gm) * (m - gm); g.forEach(function (v) { ssw += (v - m) * (v - m); }); });
    var sst = ssb + ssw, k = groups.length, N = all.length;
    var F = (ssb / Math.max(1, k - 1)) / Math.max(1e-9, ssw / Math.max(1, N - k));
    return { eta2: sst > 0 ? ssb / sst : 0, F: F, ssb: ssb, ssw: ssw, dfb: k - 1, dfw: N - k, grandMean: gm };
  }

  S.sum = sum; S.mean = mean; S.variance = variance; S.sd = sd; S.min = min; S.max = max;
  S.quantile = quantile; S.median = median; S.correlation = correlation;
  S.solve = solve; S.invert = invert; S.ols = ols;
  S.normalCdf = normalCdf; S.normalQuantile = normalQuantile; S.corrP = corrP;
  S.kde = kde; S.histogram = histogram; S.ecdf = ecdf;
  function euclid(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

  // k-means (Lloyd) with k-means++ init. `rand` is a 0..1 generator for determinism.
  function kmeans(rows, k, rand, iters) {
    iters = iters || 40; var n = rows.length, dim = rows[0].length, i, j, c;
    var cent = [rows[Math.floor(rand() * n)].slice()];
    while (cent.length < k) {
      var d2 = rows.map(function (r) { var m = Infinity; cent.forEach(function (cc) { var e = euclid(r, cc); if (e < m) m = e; }); return m * m; });
      var tot = d2.reduce(function (a, b) { return a + b; }, 0) || 1, t = rand() * tot, acc = 0, pick = 0;
      for (i = 0; i < n; i++) { acc += d2[i]; if (acc >= t) { pick = i; break; } }
      cent.push(rows[pick].slice());
    }
    var assign = new Array(n).fill(0);
    for (var it = 0; it < iters; it++) {
      var changed = false;
      for (i = 0; i < n; i++) { var best = 0, bd = Infinity; for (c = 0; c < k; c++) { var e = euclid(rows[i], cent[c]); if (e < bd) { bd = e; best = c; } } if (assign[i] !== best) { assign[i] = best; changed = true; } }
      var sum = [], cnt = []; for (c = 0; c < k; c++) { sum.push(new Array(dim).fill(0)); cnt.push(0); }
      for (i = 0; i < n; i++) { cnt[assign[i]]++; for (j = 0; j < dim; j++) sum[assign[i]][j] += rows[i][j]; }
      for (c = 0; c < k; c++) if (cnt[c]) for (j = 0; j < dim; j++) cent[c][j] = sum[c][j] / cnt[c];
      if (!changed && it > 0) break;
    }
    var wss = 0; for (i = 0; i < n; i++) { var dd = euclid(rows[i], cent[assign[i]]); wss += dd * dd; }
    return { assign: assign, centroids: cent, k: k, wss: wss };
  }

  // agglomerative hierarchical clustering (average linkage). Returns the merge
  // tree root + a leaf order for a dendrogram. O(n^3); keep n small (≤ ~50).
  function hclust(rows) {
    var n = rows.length, i, j;
    var D = []; for (i = 0; i < n; i++) { D.push([]); for (j = 0; j < n; j++) D[i][j] = euclid(rows[i], rows[j]); }
    var clusters = []; for (i = 0; i < n; i++) clusters.push({ members: [i], leaf: i });
    var nextH = 0;
    function cd(a, b) { var s = 0, c = 0; a.members.forEach(function (x) { b.members.forEach(function (y) { s += D[x][y]; c++; }); }); return s / c; }
    while (clusters.length > 1) {
      var bi = 0, bj = 1, bd = Infinity;
      for (i = 0; i < clusters.length; i++) for (j = i + 1; j < clusters.length; j++) { var d = cd(clusters[i], clusters[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
      var A = clusters[bi], B = clusters[bj];
      var merged = { members: A.members.concat(B.members), left: A, right: B, height: bd };
      nextH = Math.max(nextH, bd);
      clusters = clusters.filter(function (_, ix) { return ix !== bi && ix !== bj; });
      clusters.push(merged);
    }
    var root = clusters[0], order = [];
    (function walk(node) { if (node.leaf !== undefined) { order.push(node.leaf); return; } walk(node.left); walk(node.right); })(root);
    return { root: root, order: order, height: nextH };
  }

  // logistic regression by gradient descent (predictors standardized internally).
  function logistic(rows, y, iters) {
    var n = rows.length, p = rows[0].length, i, j;
    var mn = [], sdv = []; for (j = 0; j < p; j++) { var col = rows.map(function (r) { return r[j]; }); mn.push(mean(col)); sdv.push(sd(col) || 1); }
    var Z = rows.map(function (r) { return r.map(function (v, jj) { return (v - mn[jj]) / sdv[jj]; }); });
    var w = new Array(p + 1).fill(0), lr = 0.3; iters = iters || 400;
    for (var it = 0; it < iters; it++) {
      var grad = new Array(p + 1).fill(0);
      for (i = 0; i < n; i++) { var z = w[0]; for (j = 0; j < p; j++) z += w[j + 1] * Z[i][j]; var pr = 1 / (1 + Math.exp(-z)), e = pr - y[i]; grad[0] += e; for (j = 0; j < p; j++) grad[j + 1] += e * Z[i][j]; }
      for (j = 0; j <= p; j++) w[j] -= lr * grad[j] / n;
    }
    var probs = Z.map(function (zr) { var s = w[0]; for (var jj = 0; jj < p; jj++) s += w[jj + 1] * zr[jj]; return 1 / (1 + Math.exp(-s)); });
    return { w: w, probs: probs, mean: mn, sd: sdv, Z: Z };
  }

  // ROC curve + AUC from scores and binary labels.
  function roc(scores, labels) {
    var idx = scores.map(function (_, i) { return i; }).sort(function (a, b) { return scores[b] - scores[a]; });
    var Pn = labels.reduce(function (a, b) { return a + b; }, 0), Nn = labels.length - Pn;
    var tp = 0, fp = 0, pts = [{ fpr: 0, tpr: 0 }], auc = 0, pf = 0, pt = 0;
    idx.forEach(function (i) {
      if (labels[i] === 1) tp++; else fp++;
      var tpr = tp / (Pn || 1), fpr = fp / (Nn || 1);
      auc += (fpr - pf) * (tpr + pt) / 2; pts.push({ fpr: fpr, tpr: tpr }); pf = fpr; pt = tpr;
    });
    return { points: pts, auc: auc };
  }

  // Kaplan–Meier survival estimator. events: 1 = event, 0 = censored.
  function kaplanMeier(times, events) {
    var order = times.map(function (t, i) { return { t: t, e: events[i] }; }).sort(function (a, b) { return a.t - b.t; });
    var atRisk = order.length, surv = 1, pts = [{ t: 0, s: 1 }], k = 0, median = null;
    while (k < order.length) {
      var t = order[k].t, d = 0, c = 0;
      while (k < order.length && order[k].t === t) { if (order[k].e) d++; else c++; k++; }
      if (d > 0) surv *= (atRisk - d) / atRisk;
      pts.push({ t: t, s: surv });
      if (median === null && surv <= 0.5) median = t;
      atRisk -= (d + c);
    }
    return { points: pts, median: median };
  }

  S.jacobiEig = jacobiEig; S.pca = pca; S.detrend = detrend; S.periodogram = periodogram; S.anova = anova;
  S.euclid = euclid; S.kmeans = kmeans; S.hclust = hclust; S.logistic = logistic; S.roc = roc; S.kaplanMeier = kaplanMeier;
})();
