// EXOGENEITY AS A MEASUREMENT, not a knob.
//
// In synthetic data, exogeneity is something you set. On real data it is
// something you must estimate. The lightweight estimator here asks a lead-lag
// question of the two implied-probability series for the same event:
//
//   does the prediction market LEAD the asset-implied probability
//   (PM carries information the asset hasn't priced yet -> exogenous/informative),
//   or LAG it (PM is a reflective, herding mirror -> endogenous)?
//
// score = max lead correlation - max lag correlation, in [-1, 1].
//   > 0  PM leads  -> exogenous-leaning
//   < 0  asset leads -> endogenous-leaning
//
// This is a proxy (directional cross-correlation), not full Granger causality,
// but it runs on exactly the pmProb / assetImplied series the harness already
// produces, so every run yields a verdict for free.

export interface ExogeneityResult {
  score: number;
  bestLag: number; // positive = PM leads by this many steps
  leadCorr: number;
  lagCorr: number;
  n: number;
  verdict: "exogenous-leaning" | "endogenous-leaning" | "inconclusive";
}

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

// corr(a[t], b[t+k]) over the overlap.
function corrLag(a: number[], b: number[], k: number): number {
  const x: number[] = [];
  const y: number[] = [];
  for (let t = 0; t + k >= 0 && t + k < b.length && t < a.length; t++) {
    if (t + k < 0) continue;
    x.push(a[t]);
    y.push(b[t + k]);
  }
  return pearson(x, y);
}

export function estimateExogeneity(
  pmRaw: (number | null)[],
  assetRaw: (number | null)[],
  maxLag = 10,
): ExogeneityResult | null {
  // align on indices where both are present
  const pm: number[] = [];
  const asset: number[] = [];
  for (let i = 0; i < pmRaw.length; i++) {
    if (pmRaw[i] != null && assetRaw[i] != null) {
      pm.push(pmRaw[i] as number);
      asset.push(assetRaw[i] as number);
    }
  }
  if (pm.length < 12) return null;

  let leadCorr = 0;
  let lagCorr = 0;
  let bestLag = 0;
  for (let k = 1; k <= maxLag; k++) {
    const lead = corrLag(pm, asset, k); // pm[t] predicts asset[t+k]
    const lag = corrLag(asset, pm, k); // asset[t] predicts pm[t+k]
    if (lead > leadCorr) {
      leadCorr = lead;
      bestLag = k;
    }
    if (lag > lagCorr) {
      lagCorr = lag;
      if (lag > leadCorr) bestLag = -k;
    }
  }
  const score = leadCorr - lagCorr;
  const verdict =
    Math.abs(score) < 0.05 ? "inconclusive" : score > 0 ? "exogenous-leaning" : "endogenous-leaning";
  return { score, bestLag, leadCorr, lagCorr, n: pm.length, verdict };
}
