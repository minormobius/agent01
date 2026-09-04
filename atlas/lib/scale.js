// scale.js — classification and colour for choropleths. No dependencies.
//
// Colour here follows the house dataviz rules (see the `dataviz` skill and
// packages/dataviz/README.md): SEQUENTIAL is one hue light→dark, DIVERGING is
// two hues around a NEUTRAL GREY midpoint, and neither is ever a rainbow.
// Interpolation happens in OKLab, not sRGB, so equal steps in the ramp look
// like equal steps to the eye — in sRGB a blue ramp goes muddy in the middle
// and the map grows a band that is not in the data.
//
// The classification question is the one that actually decides what a
// choropleth says. Quantile makes every class equally populous and therefore
// always looks "interesting"; equal-interval is honest about outliers and
// therefore often looks empty; Jenks minimises within-class variance and is the
// usual right answer for a county map. All three are here, and the map states
// which one it used, because a choropleth that hides its breaks is a rhetorical
// device.

/* global globalThis */
(function (root) {
  'use strict';

  // ------------------------------------------------------------- colour ----

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function hexToOklab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = srgbToLin(((n >> 16) & 255) / 255), g = srgbToLin(((n >> 8) & 255) / 255), b = srgbToLin((n & 255) / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  function oklabToHex([L, a, bb]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * bb) ** 3;
    const r = linToSrgb(clamp01(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
    const g = linToSrgb(clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
    const b = linToSrgb(clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s));
    const h = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  const mixOklab = (h1, h2, t) => {
    const a = hexToOklab(h1), b = hexToOklab(h2);
    return oklabToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  };

  /** Sample n colours along a list of anchor hexes, interpolating in OKLab. */
  function ramp(anchors, n) {
    if (n <= 1) return [anchors[anchors.length - 1]];
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (anchors.length - 1);
      const j = Math.min(anchors.length - 2, Math.floor(t));
      out.push(mixOklab(anchors[j], anchors[j + 1], t - j));
    }
    return out;
  }

  // The house palette, quoted from references/palette.md. Sequential is the
  // documented blue ramp; the diverging red arm is built to the SAME lightness
  // ladder as the blue arm so the two sides of the midpoint carry equal visual
  // weight — an unequal ladder is what makes a diverging map look like it has
  // an opinion.
  const PALETTE = {
    light: {
      surface: '#fcfcfb', ink: '#0b0b0b', muted: '#898781', grid: '#e1e0d9',
      sequential: ['#e8f1fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
      divergingLow: ['#184f95', '#256abf', '#3987e5', '#9ec5f4', '#dbe9fc'],
      neutral: '#f0efec',
      divergingHigh: ['#fad6d5', '#f0a3a2', '#e34948', '#c83938', '#9c2423'],
      nodata: '#e6e5e0',
    },
    dark: {
      surface: '#1a1a19', ink: '#ffffff', muted: '#898781', grid: '#2c2c2a',
      sequential: ['#10243d', '#173f78', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6', '#dfeafb'],
      divergingLow: ['#b7d3f6', '#6da7ec', '#3987e5', '#256abf', '#1a4d8f'],
      neutral: '#383835',
      divergingHigh: ['#8c2a2a', '#b23b3a', '#d0403f', '#e66767', '#f2b0b0'],
      nodata: '#2a2a28',
    },
  };
  // Both ramps run low→high. On the dark surface that means the LIGHT end is
  // the loud end, which is the inversion the dataviz reference calls for: a
  // ramp that recedes toward the surface at "near zero" either way.

  // ----------------------------------------------------- classification ----

  const asc = (a, b) => a - b;

  /** Type-7 quantile, matching packages/dataviz/stats.js so the two agree. */
  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const h = (sorted.length - 1) * p, lo = Math.floor(h);
    return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)]) - sorted[lo]);
  }

  /**
   * Fisher-Jenks natural breaks.
   *
   * The textbook dynamic program is O(k.n^2), and on a county map that is
   * 3,000 values by 7 classes = 31 million inner iterations, which measured
   * 121 ms EVERY TIME the measure changed. It also forced a sampling hack to
   * keep n down, which quietly changed the breaks.
   *
   * This is the same recurrence solved with the divide-and-conquer
   * optimisation. The cost of a segment is its sum of squared deviations,
   * which satisfies the quadrangle inequality, so the optimal split point is
   * monotone in the segment end: computing dp[k][mid] narrows the search range
   * for everything left and right of it. That takes the same exact answer from
   * O(k.n^2) to O(k.n.log n) — about 240,000 iterations here, and under a
   * millisecond. No sampling, so the breaks are now computed on every value.
   */
  function jenks(values, k) {
    const v = values.filter((x) => x != null && Number.isFinite(x)).sort(asc);
    const n = v.length;
    if (!n) return [];
    if (k >= n) return v.slice(0, k);

    // Prefix sums, so any segment's SSD is O(1). Values are centred on the
    // mean first: squaring raw dollars over a 3,000-element prefix sum loses
    // enough precision to reorder near-equal candidate splits.
    const mean = v.reduce((t, x) => t + x, 0) / n;
    const S1 = new Float64Array(n + 1), S2 = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const x = v[i] - mean;
      S1[i + 1] = S1[i] + x;
      S2[i + 1] = S2[i] + x * x;
    }
    // SSD of v[i..j] inclusive
    const ssd = (i, j) => {
      const m = j - i + 1;
      if (m <= 1) return 0;
      const s = S1[j + 1] - S1[i];
      return Math.max(0, (S2[j + 1] - S2[i]) - (s * s) / m);
    };

    let prev = new Float64Array(n);       // dp for k-1 classes, ending at j
    let cur = new Float64Array(n);
    const arg = [];                       // arg[c][j] = first index of class c
    for (let j = 0; j < n; j++) prev[j] = ssd(0, j);

    for (let c = 1; c < k; c++) {
      const a = new Int32Array(n);
      // solve dp[c][j] for j in [lo,hi] knowing the optimum lies in [oLo,oHi]
      const solve = (lo, hi, oLo, oHi) => {
        if (lo > hi) return;
        const mid = (lo + hi) >> 1;
        let best = Infinity, bestI = oLo;
        const top = Math.min(mid, oHi);
        for (let i = Math.max(1, oLo); i <= top; i++) {
          const cost = prev[i - 1] + ssd(i, mid);
          if (cost < best) { best = cost; bestI = i; }
        }
        cur[mid] = best; a[mid] = bestI;
        solve(lo, mid - 1, oLo, bestI);
        solve(mid + 1, hi, bestI, oHi);
      };
      solve(c, n - 1, c, n - 1);
      for (let j = 0; j < c; j++) { cur[j] = 0; a[j] = j; }
      arg.push(a);
      const t = prev; prev = cur; cur = t;
    }

    // walk the argmin table back to the class boundaries
    const breaks = new Array(k);
    let end = n - 1;
    for (let c = k - 1; c >= 1; c--) {
      const i = arg[c - 1][end];
      breaks[c] = v[i];
      end = i - 1;
      if (end < 0) end = 0;
    }
    breaks[0] = v[0];
    return breaks;
  }

  /**
   * Build a colour scale.
   * @param {number[]} values      the data (nulls/NaNs filtered out here)
   * @param {object}   opts
   *   method   'jenks' | 'quantile' | 'equal' | 'stddev'
   *   classes  number of classes (default 7)
   *   kind     'sequential' | 'diverging'
   *   center   diverging midpoint (default: the median)
   *   mode     'light' | 'dark'
   *   reverse  flip the ramp (for measures where low is the loud end)
   */
  function makeScale(values, opts = {}) {
    const {
      method = 'jenks', classes = 7, kind = 'sequential',
      mode = 'light', reverse = false, center = null,
    } = opts;
    const P = PALETTE[mode] || PALETTE.light;
    const clean = values.filter((v) => v != null && Number.isFinite(v)).sort(asc);
    if (!clean.length) {
      return { breaks: [], colors: [], colorOf: () => P.nodata, method, kind, empty: true, palette: P };
    }
    const lo = clean[0], hi = clean[clean.length - 1];

    let breaks, colors;
    if (kind === 'diverging') {
      const mid = center == null ? quantile(clean, 0.5) : center;
      const arm = Math.max(1, Math.floor(classes / 2));
      const belowV = clean.filter((v) => v < mid), aboveV = clean.filter((v) => v > mid);
      const bBreaks = [], aBreaks = [];
      for (let i = 0; i < arm; i++) bBreaks.push(belowV.length ? quantile(belowV, i / arm) : mid);
      for (let i = 1; i <= arm; i++) aBreaks.push(aboveV.length ? quantile(aboveV, (i - 1) / arm) : mid);
      breaks = [...bBreaks, mid, ...aBreaks];
      colors = [...ramp(P.divergingLow, arm), P.neutral, ...ramp(P.divergingHigh, arm)];
    } else {
      if (method === 'quantile') {
        breaks = Array.from({ length: classes }, (_, i) => quantile(clean, i / classes));
      } else if (method === 'equal') {
        breaks = Array.from({ length: classes }, (_, i) => lo + (hi - lo) * i / classes);
      } else if (method === 'stddev') {
        const mean = clean.reduce((s, v) => s + v, 0) / clean.length;
        const sd = Math.sqrt(clean.reduce((s, v) => s + (v - mean) ** 2, 0) / clean.length) || 1;
        const half = (classes - 1) / 2;
        breaks = Array.from({ length: classes }, (_, i) => mean + (i - half - 0.5) * sd);
        breaks[0] = lo;
      } else {
        breaks = jenks(clean, classes);
      }
      // strictly increasing, so a heavily tied distribution cannot produce two
      // classes with the same lower bound (which paints a class nobody can hit)
      for (let i = 1; i < breaks.length; i++) if (!(breaks[i] > breaks[i - 1])) breaks[i] = breaks[i - 1];
      colors = ramp(P.sequential, breaks.length);
    }
    if (reverse) colors = colors.slice().reverse();

    const colorOf = (v) => {
      if (v == null || !Number.isFinite(v)) return P.nodata;
      let i = breaks.length - 1;
      while (i > 0 && v < breaks[i]) i--;
      return colors[i];
    };

    return { breaks, colors, colorOf, method, kind, min: lo, max: hi, n: clean.length, palette: P, empty: false };
  }

  // ------------------------------------------------------------ formats ----

  const FORMATS = {
    plain: (v) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 2 })),
    usd:   (v) => (v == null ? '—' : (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B`
                  : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
                  : `$${Math.round(v).toLocaleString()}`)),
    usd0:  (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`),
    pct:   (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
    pct1:  (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`),
    count: (v) => (v == null ? '—' : Math.round(v).toLocaleString()),
    ratio: (v) => (v == null ? '—' : v.toFixed(2)),
    index: (v) => (v == null ? '—' : v.toFixed(1)),
  };

  const API = { PALETTE, makeScale, jenks, quantile, ramp, mixOklab, hexToOklab, oklabToHex, FORMATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_SCALE = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
