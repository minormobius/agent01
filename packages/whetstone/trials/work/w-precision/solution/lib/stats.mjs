// stats.mjs — the small statistics the reduction needs.
export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function sd(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function stderr(xs) {
  return sd(xs) / Math.sqrt(xs.length);
}

// Ordinary least squares y = a + b·x.
export function linfit(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}
