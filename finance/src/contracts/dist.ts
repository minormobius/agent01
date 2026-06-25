// Helpers over the ReturnDist contract type. Both encodings (normal, sampled)
// expose mean + dispersion + a CDF, so downstream code (sizing, divergence,
// calibration) never branches on the encoding.

import type { ReturnDist } from "./schema";

const SQRT2 = Math.SQRT2;

// Abramowitz & Stegun 7.1.26 erf approximation (max err ~1.5e-7).
function erf(x: number): number {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number, mean: number, std: number): number {
  if (std <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (std * SQRT2)));
}

export function distMean(d: ReturnDist): number {
  if (d.kind === "normal") return d.mean;
  return d.samples.reduce((a, b) => a + b, 0) / d.samples.length;
}

export function distStd(d: ReturnDist): number {
  if (d.kind === "normal") return d.std;
  const m = distMean(d);
  const v = d.samples.reduce((a, b) => a + (b - m) * (b - m), 0) / d.samples.length;
  return Math.sqrt(Math.max(0, v));
}

/** P(return > threshold) under the distribution. */
export function probAbove(d: ReturnDist, threshold: number): number {
  if (d.kind === "normal") return 1 - normalCdf(threshold, d.mean, d.std);
  let c = 0;
  for (const s of d.samples) if (s > threshold) c++;
  return c / d.samples.length;
}

export function normalDist(horizon_steps: number, mean: number, std: number): ReturnDist {
  return { kind: "normal", horizon_steps, mean, std };
}
