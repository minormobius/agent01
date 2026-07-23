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

  S.sum = sum; S.mean = mean; S.variance = variance; S.sd = sd; S.min = min; S.max = max;
  S.quantile = quantile; S.median = median; S.correlation = correlation;
  S.solve = solve; S.invert = invert; S.ols = ols;
  S.normalCdf = normalCdf; S.normalQuantile = normalQuantile; S.corrP = corrP;
  S.kde = kde; S.histogram = histogram; S.ecdf = ecdf;
})();
