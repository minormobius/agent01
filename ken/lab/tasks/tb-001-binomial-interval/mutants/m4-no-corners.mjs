/* tb-001 · reference solution — Clopper–Pearson exact binomial intervals.

   THE REFERENCE IS NOT THE ANSWER KEY. It exists so the bank can ask two
   questions of a task before admitting it: does a correct solution pass
   every check, and does each seeded mutant fail at least one? A task that
   fails the first has an unsound check; one that fails the second has a
   coverage hole. Those are u and c from WP4, measured per task.

   Ken needs this for its own sake as well. Every rate the site reports —
   recall, catch rate, verdict accuracy, the floor arm — is a binomial
   proportion currently printed with no interval at all.

   Clopper–Pearson inverts the binomial test, so it is exact rather than
   asymptotic and conservative rather than nominal. Its two corners have
   closed forms with no special functions in them, which is what makes it
   checkable by hand:

       x = 0   upper = 1 - (alpha/2)^(1/n)
       x = n   lower = (alpha/2)^(1/n)
*/

/** Log gamma, Lanczos g=7 n=9. Standard coefficients. */
function lgamma(z) {
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = C[0];
  for (let i = 1; i < 9; i++) x += C[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized incomplete beta I_x(a,b), by the modified Lentz continued fraction. */
export function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  // the fraction converges fast only for x < (a+1)/(a+b+2); reflect otherwise
  if (x > (a + 1) / (a + b + 2)) return 1 - betaInc(1 - x, b, a);

  const TINY = 1e-30;
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2);
    let num;
    if (i === 0) num = 1;
    else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));

    d = 1 + num * d;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < TINY) c = TINY;
    const delta = c * d;
    f *= delta;
    if (Math.abs(1 - delta) < 1e-14) break;
  }
  return (front * (f - 1)) / a;
}

/** Inverse of betaInc in x, by bisection. Monotone, so bisection cannot miss. */
export function betaInv(p, a, b) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  /* 60 halvings, not 200: a double is exhausted by about 52, so the
     rest were pure cost. The first version spent them, and the bank's
     gate took 70 seconds. */
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaInc(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The Clopper–Pearson interval for x successes in n trials.
 *
 * The two corners are handled in closed form rather than by the general
 * branch, because betaInv with a shape parameter of 0 is undefined and
 * the general branch would return a plausible wrong number there.
 */
export function interval(x, n, alpha = 0.05) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`n must be a positive integer, got ${n}`);
  if (!Number.isInteger(x) || x < 0 || x > n) throw new Error(`x must be an integer in [0, ${n}], got ${x}`);
  if (!(alpha > 0 && alpha < 1)) throw new Error(`alpha must be in (0, 1), got ${alpha}`);
  const a = alpha / 2;
  const lower = betaInv(a, x, n - x + 1);
  const upper = betaInv(1 - a, x + 1, n - x);
  return { lower, upper, point: x / n, x, n, alpha };
}

/** Coverage of the interval at a stated true rate, by exact summation. */
export function coverage(p, n, alpha = 0.05) {
  let covered = 0;
  for (let x = 0; x <= n; x++) {
    const { lower, upper } = interval(x, n, alpha);
    if (p >= lower && p <= upper) covered += binomPmf(x, n, p);
  }
  return covered;
}

export function binomPmf(x, n, p) {
  if (p === 0) return x === 0 ? 1 : 0;
  if (p === 1) return x === n ? 1 : 0;
  const logC = lgamma(n + 1) - lgamma(x + 1) - lgamma(n - x + 1);
  return Math.exp(logC + x * Math.log(p) + (n - x) * Math.log(1 - p));
}
