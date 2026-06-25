// Small dependency-free numeric helpers shared by the harness metrics.

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs: number[], ddof = 0): number {
  const n = xs.length;
  if (n - ddof <= 0) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - ddof);
  return Math.sqrt(Math.max(0, v));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** logistic squash to (0,1) */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Sharpe ratio of a per-step return series (annualization left to caller). */
export function sharpe(returns: number[], ddof = 1): number {
  if (returns.length < 2) return 0;
  const s = std(returns, ddof);
  if (s === 0) return 0;
  return mean(returns) / s;
}
