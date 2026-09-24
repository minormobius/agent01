// util.js — the small arithmetic every part of the picture shares.

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0 before a, 1 after b, linear between. */
export const span = (t, a, b) => clamp((t - a) / (b - a));
/** Smoothstep. */
export const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
/** Ease out: fast start, gentle arrival — how a thing grows. */
export const grow = (x) => { x = clamp(x); return 1 - (1 - x) * (1 - x) * (1 - x); };

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A monotone curve through [t, v] keys (Fritsch–Carlson). Growth never runs
 * backwards and never overshoots a key, which a plain spline would do.
 */
export function monotone(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); m[i] = s * a * d[i]; m[i + 1] = s * b * d[i]; }
  }
  return (t) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (t - xs[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i]
      + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

// ---- colour, as [r, g, b] 0..255 ---------------------------------------------

export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** A cyclic palette: `stops` is [[phase, colour], ...] over [0, 1). */
export function cyclic(stops, x) {
  x = ((x % 1) + 1) % 1;
  for (let i = 0; i < stops.length; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[(i + 1) % stops.length];
    const end = p1 <= p0 ? p1 + 1 : p1;
    const xx = x < p0 ? x + 1 : x;
    if (xx >= p0 && xx <= end) return mix(c0, c1, ease((xx - p0) / (end - p0)));
  }
  return stops[0][1];
}
