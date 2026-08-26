const LOG_PI = Math.log(Math.PI);
const LOG_2 = Math.log(2);

function logGamma(x) {
  if (x <= 0) return NaN;
  if (x < 7) return logGamma(x + 1) - Math.log(x);
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  let tmp = x + 6.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = c[0];
  for (let i = 1; i < 9; i++) {
    ser += c[i] / (x + i);
  }
  return Math.log(ser * Math.sqrt(2 * Math.PI)) - tmp;
}

function logBeta(a, b) {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

function continuedFractionBeta(x, a, b, maxIter = 200, eps = 1e-15) {
  const fpmin = 1e-30;
  let aa = 0;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = logBeta(a, b);

  const switchPoint = (a + 1) / (a + b + 2);
  if (x > switchPoint) {
    const ib = incompleteBeta(1 - x, b, a);
    return 1 - ib;
  }

  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  const cf = continuedFractionBeta(x, a, b);
  return front * cf;
}

function betaPdf(x, a, b, lnBeta) {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta);
}

function inverseIncompleteBeta(y, a, b, tol = 1e-12, maxIter = 100) {
  if (y <= 0) return 0;
  if (y >= 1) return 1;

  const lnBeta = logBeta(a, b);
  let x = a / (a + b);

  const mode = (a > 1 && b > 1) ? (a - 1) / (a + b - 2) : (a <= 1 ? 0 : 1);
  if (y < 0.5) {
    x = Math.min(x, mode * 0.5);
  } else {
    x = Math.max(x, mode + (1 - mode) * 0.5);
  }

  let lo = 0, hi = 1;
  for (let iter = 0; iter < maxIter; iter++) {
    const ib = incompleteBeta(x, a, b);
    const err = ib - y;
    if (Math.abs(err) < tol) break;

    if (err > 0) hi = x; else lo = x;

    const pdf = betaPdf(x, a, b, lnBeta);
    if (pdf > 0) {
      const newtonStep = err / pdf;
      const xNewton = x - newtonStep;
      if (xNewton > lo && xNewton < hi) {
        x = xNewton;
      } else {
        x = (lo + hi) / 2;
      }
    } else {
      x = (lo + hi) / 2;
    }

    if (x <= lo) x = (lo + hi) / 2;
    if (x >= hi) x = (lo + hi) / 2;
    if (hi - lo < tol) break;
  }
  return x;
}

export function interval(x, n, alpha = 0.05) {
  if (n <= 0) throw new Error('n must be positive');
  if (x < 0 || x > n) throw new Error('x must be in [0, n]');
  if (alpha <= 0 || alpha >= 1) throw new Error('alpha must be in (0, 1)');

  const point = x / n;
  let lower, upper;

  if (x === 0) {
    lower = 0;
    upper = 1 - Math.pow(alpha / 2, 1 / n);
  } else if (x === n) {
    lower = Math.pow(alpha / 2, 1 / n);
    upper = 1;
  } else {
    lower = inverseIncompleteBeta(alpha / 2, x, n - x + 1);
    upper = inverseIncompleteBeta(1 - alpha / 2, x + 1, n - x);
  }

  return { lower, upper, point, x, n, alpha };
}