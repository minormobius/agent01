// wormhole — WORMHOLE_CHARTS, an in-house publication-quality SVG chart library.
//
// Dependency-free, deterministic, renders to SVG strings (worker/browser/node).
// Built to real-figure standards so it can outlive the joke: when we want to
// plot REAL data, this is the library. Nothing here knows the data is fabricated.
//
// Design follows the dataviz method: colour assigned by job, not cycled;
// Okabe–Ito colourblind-safe categorical palette (validated), viridis sequential,
// blue–gray–red diverging with a neutral midpoint; thin marks, recessive axes,
// a legend whenever ≥2 series, direct value labels only where they help.
//
// Charts: scatterFit, violin, box, ridgeline, histogram, groupedBar, heatmap,
// waterfall, forest, qq. Each takes {…, width, height} and returns an <svg> str.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var C = NS.WORMHOLE_CHARTS = NS.WORMHOLE_CHARTS || {};
  var ST = NS.WORMHOLE_STATS;
  if (!ST) throw new Error("charts.js requires stats.js (WORMHOLE_STATS) first");

  // ---------- theme ----------
  var FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  var INK = "#1a1a1a", MUTE = "#6b6b6b", GRID = "#e8e8e8", SPINE = "#4a4a4a";
  // Okabe–Ito, validated (see palette validation): blue, vermillion, green, purple, orange, sky
  var CAT = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#000000"];
  var VIRIDIS = ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"];
  var DIVERGE = ["#2166ac", "#67a9cf", "#d1e5f0", "#efefef", "#fddbc7", "#ef8a62", "#b2182b"]; // blue → neutral → red

  function cat(i) { return CAT[i % CAT.length]; }

  function hex2rgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgb2hex(r) { return "#" + r.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join(""); }
  function ramp(anchors, t) {
    t = Math.max(0, Math.min(1, t));
    var s = t * (anchors.length - 1), i = Math.floor(s), f = s - i;
    if (i >= anchors.length - 1) return anchors[anchors.length - 1];
    var a = hex2rgb(anchors[i]), b = hex2rgb(anchors[i + 1]);
    return rgb2hex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  function seq(t) { return ramp(VIRIDIS, t); }
  function div(t) { return ramp(DIVERGE, (t + 1) / 2); } // t in [-1,1]
  // relative luminance → choose black/white text on a fill
  function inkOn(hex) { var c = hex2rgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); var L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return L > 0.42 ? "#111" : "#fff"; }

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; }); }
  function niceNum(range, round) {
    var exp = Math.floor(Math.log10(range || 1)), frac = (range || 1) / Math.pow(10, exp), nice;
    if (round) nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
    else nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
    return nice * Math.pow(10, exp);
  }
  function ticksNice(lo, hi, n) {
    n = n || 5;
    if (lo === hi) { lo -= 1; hi += 1; }
    var step = niceNum((hi - lo) / (n - 1), true);
    var nlo = Math.floor(lo / step) * step, nhi = Math.ceil(hi / step) * step, t = [];
    for (var v = nlo; v <= nhi + step * 1e-6; v += step) t.push(+(Math.round(v / step) * step).toFixed(10));
    return { ticks: t, min: nlo, max: nhi, step: step };
  }
  function fmt(v, step) {
    if (v === 0) return "0";
    var dec = step ? Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) : 0;
    // k-notation only for genuinely large magnitudes on a coarse scale — never
    // for years or counts (a 1850 tick must read "1850", not "1.9k").
    if (Math.abs(v) >= 10000 && step >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k";
    return dec > 0 ? v.toFixed(Math.min(dec, 3)) : String(Math.round(v));
  }
  function scale(d0, d1, r0, r1) { var m = (r1 - r0) / ((d1 - d0) || 1); return function (v) { return r0 + (v - d0) * m; }; }
  function T(x, y, s, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="' + FONT + '" font-size="' + (o.size || 9) +
      '" fill="' + (o.fill || INK) + '" text-anchor="' + (o.anchor || "start") + '"' +
      (o.weight ? ' font-weight="' + o.weight + '"' : "") +
      (o.rotate ? ' transform="rotate(' + o.rotate + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"' : "") +
      (o.style ? ' font-style="' + o.style + '"' : "") + ">" + esc(s) + "</text>";
  }
  function L(x1, y1, x2, y2, o) {
    o = o || {};
    return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
      '" stroke="' + (o.stroke || SPINE) + '" stroke-width="' + (o.w || 1) + '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + (o.cap ? ' stroke-linecap="' + o.cap + '"' : "") + "/>";
  }
  function svg(w, h, body, label) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" role="img"' +
      (label ? ' aria-label="' + esc(label) + '"' : "") + ' style="width:100%;height:auto;display:block;font-family:' + FONT + '">' +
      '<rect width="' + w + '" height="' + h + '" fill="#ffffff"/>' + body + "</svg>";
  }

  // shared cartesian axes. returns {body, sx, sy, m, iw, ih}
  function axes(o) {
    var w = o.width, h = o.height;
    var m = Object.assign({ l: 46, r: 14, t: 14, b: 36 }, o.margin || {});
    var iw = w - m.l - m.r, ih = h - m.t - m.b;
    var xt = o.xticks || ticksNice(o.xmin, o.xmax, o.xn || 5);
    var yt = o.yticks || ticksNice(o.ymin, o.ymax, o.yn || 5);
    var sx = scale(xt.min, xt.max, m.l, m.l + iw);
    var sy = scale(yt.min, yt.max, m.t + ih, m.t);
    var b = "";
    // gridlines (recessive, horizontal only)
    if (o.grid !== false) yt.ticks.forEach(function (v) { b += L(m.l, sy(v), m.l + iw, sy(v), { stroke: GRID, w: 1 }); });
    // spines
    b += L(m.l, m.t, m.l, m.t + ih, { stroke: SPINE, w: 1 });
    b += L(m.l, m.t + ih, m.l + iw, m.t + ih, { stroke: SPINE, w: 1 });
    // x ticks
    if (!o.xcat) xt.ticks.forEach(function (v) {
      var x = sx(v); if (x < m.l - 0.5 || x > m.l + iw + 0.5) return;
      b += L(x, m.t + ih, x, m.t + ih + 3.5, { stroke: SPINE, w: 1 });
      b += T(x, m.t + ih + 13, fmt(v, xt.step), { anchor: "middle", fill: MUTE });
    });
    // category x labels
    if (o.xcat) o.xcat.forEach(function (lab, i) {
      var x = m.l + iw * (i + 0.5) / o.xcat.length;
      b += T(x, m.t + ih + 14, lab, { anchor: "middle", fill: INK, size: 9.5 });
    });
    // y ticks
    yt.ticks.forEach(function (v) {
      var y = sy(v); if (y < m.t - 0.5 || y > m.t + ih + 0.5) return;
      b += L(m.l - 3.5, y, m.l, y, { stroke: SPINE, w: 1 });
      b += T(m.l - 6, y + 3, fmt(v, yt.step), { anchor: "end", fill: MUTE });
    });
    // axis titles
    if (o.xlabel) b += T(m.l + iw / 2, h - 4, o.xlabel, { anchor: "middle", size: 10.5, fill: INK });
    if (o.ylabel) b += '<text x="12" y="' + (m.t + ih / 2).toFixed(1) + '" font-family="' + FONT + '" font-size="10.5" fill="' + INK +
      '" text-anchor="middle" transform="rotate(-90 12 ' + (m.t + ih / 2).toFixed(1) + ')">' + esc(o.ylabel) + "</text>";
    return { body: b, sx: sx, sy: sy, m: m, iw: iw, ih: ih, xt: xt, yt: yt };
  }

  function legendBox(items) {
    return { lw: 15 + Math.max.apply(null, items.map(function (it) { return it.label.length; })) * 5.3 + 8, lh: items.length * 13 + 6 };
  }
  function legend(items, x, y, o) {
    o = o || {}; var box = legendBox(items), b = "", dy = 0;
    if (o.backing !== false) b += '<rect x="' + (x - 5).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" width="' + box.lw.toFixed(1) + '" height="' + box.lh + '" rx="3" fill="#ffffff" fill-opacity="0.74"/>';
    items.forEach(function (it) {
      b += '<rect x="' + x.toFixed(1) + '" y="' + (y + dy - 6.5).toFixed(1) + '" width="9" height="9" rx="1.5" fill="' + it.color + '"/>';
      b += T(x + 13, y + dy + 1, it.label, { size: 9, fill: INK });
      dy += 13;
    });
    return b;
  }
  // place the legend in whichever corner holds the fewest data points
  function legendSmart(items, ptsPx, m, iw, ih) {
    var box = legendBox(items), pad = 7;
    var cands = [
      { x: m.l + pad, y: m.t + pad + 6 },
      { x: m.l + iw - box.lw - pad + 5, y: m.t + pad + 6 },
      { x: m.l + pad, y: m.t + ih - box.lh - pad + 6 },
      { x: m.l + iw - box.lw - pad + 5, y: m.t + ih - box.lh - pad + 6 }
    ];
    function count(c) { var n = 0; ptsPx.forEach(function (p) { if (p.x >= c.x - 6 && p.x <= c.x + box.lw && p.y >= c.y - 10 && p.y <= c.y + box.lh) n++; }); return n; }
    var best = cands[1], bestN = Infinity;
    cands.forEach(function (c) { var n = count(c); if (n < bestN) { bestN = n; best = c; } });
    return legend(items, best.x, best.y);
  }

  // ============================================================
  // 1. scatter with OLS fit + 95% mean-response band + group colour
  // ============================================================
  C.scatterFit = function (o) {
    var w = o.width || 340, h = o.height || 232;
    var pts = o.points;
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var fit = ST.ols(xs.map(function (x) { return [x]; }), ys);
    var b0 = fit.beta[0], b1 = fit.beta[1];
    var xbar = ST.mean(xs), Sxx = xs.reduce(function (a, x) { return a + (x - xbar) * (x - xbar); }, 0) || 1;
    var A = axes({ width: w, height: h, xmin: ST.min(xs), xmax: ST.max(xs), ymin: ST.min(ys), ymax: ST.max(ys), xlabel: o.xlabel, ylabel: o.ylabel, margin: o.margin });
    var body = A.body;
    // CI band
    var band = [], k = 24, i;
    for (i = 0; i <= k; i++) {
      var xv = A.xt.min + (A.xt.max - A.xt.min) * i / k;
      var se = Math.sqrt(fit.sigma2 * (1 / xs.length + (xv - xbar) * (xv - xbar) / Sxx));
      band.push({ x: xv, yh: b0 + b1 * xv, se: se });
    }
    var up = band.map(function (p) { return A.sx(p.x).toFixed(1) + "," + A.sy(p.yh + 1.96 * p.se).toFixed(1); });
    var dn = band.slice().reverse().map(function (p) { return A.sx(p.x).toFixed(1) + "," + A.sy(p.yh - 1.96 * p.se).toFixed(1); });
    body += '<polygon points="' + up.concat(dn).join(" ") + '" fill="' + cat(0) + '" fill-opacity="0.12"/>';
    // points
    pts.forEach(function (p) {
      body += '<circle cx="' + A.sx(p.x).toFixed(1) + '" cy="' + A.sy(p.y).toFixed(1) + '" r="2.7" fill="' + cat(p.g || 0) +
        '" fill-opacity="0.82" stroke="#fff" stroke-width="0.6"/>';
    });
    // fit line
    var x0 = A.xt.min, x1 = A.xt.max;
    body += L(A.sx(x0), A.sy(b0 + b1 * x0), A.sx(x1), A.sy(b0 + b1 * x1), { stroke: INK, w: 1.6 });
    // annotation
    if (o.annot) body += T(A.m.l + 6, A.m.t + 11, o.annot, { size: 9.5, fill: INK, weight: 600 });
    // legend (placed away from the data)
    if (o.groups && o.groups.length > 1) {
      var ppx = pts.map(function (p) { return { x: A.sx(p.x), y: A.sy(p.y) }; });
      body += legendSmart(o.groups.map(function (g, i) { return { label: g, color: cat(i) }; }), ppx, A.m, A.iw, A.ih);
    }
    return svg(w, h, body, o.aria || "scatter plot with regression fit");
  };

  // ============================================================
  // 2. violin (KDE) by group, with inner quartile box + median
  // ============================================================
  C.violin = function (o) {
    var w = o.width || 340, h = o.height || 236, groups = o.groups;
    var all = [].concat.apply([], groups.map(function (g) { return g.values; }));
    var A = axes({ width: w, height: h, xmin: 0, xmax: 1, ymin: ST.min(all), ymax: ST.max(all), xcat: groups.map(function (g) { return g.label; }), ylabel: o.ylabel, xlabel: o.xlabel });
    var body = A.body;
    var slot = A.iw / groups.length, halfW = Math.min(slot * 0.42, 30);
    groups.forEach(function (g, gi) {
      var cx = A.m.l + slot * (gi + 0.5);
      var lo = ST.min(g.values), hi = ST.max(g.values), steps = 40, ys = [], i;
      for (i = 0; i <= steps; i++) ys.push(lo + (hi - lo) * i / steps);
      var dens = ST.kde(g.values, ys);
      var dmax = Math.max.apply(null, dens) || 1;
      var left = [], right = [];
      for (i = 0; i <= steps; i++) {
        var wv = (dens[i] / dmax) * halfW, yy = A.sy(ys[i]);
        right.push((cx + wv).toFixed(1) + "," + yy.toFixed(1));
        left.push((cx - wv).toFixed(1) + "," + yy.toFixed(1));
      }
      body += '<polygon points="' + right.concat(left.reverse()).join(" ") + '" fill="' + cat(gi) + '" fill-opacity="0.5" stroke="' + cat(gi) + '" stroke-width="1"/>';
      // inner box
      var q1 = ST.quantile(g.values, 0.25), q3 = ST.quantile(g.values, 0.75), med = ST.median(g.values);
      body += '<rect x="' + (cx - 3.2).toFixed(1) + '" y="' + A.sy(q3).toFixed(1) + '" width="6.4" height="' + Math.max(0.5, (A.sy(q1) - A.sy(q3))).toFixed(1) + '" fill="' + INK + '" fill-opacity="0.72"/>';
      body += '<circle cx="' + cx.toFixed(1) + '" cy="' + A.sy(med).toFixed(1) + '" r="2.2" fill="#fff"/>';
    });
    return svg(w, h, body, o.aria || "violin plot by group");
  };

  // ============================================================
  // 3. box-and-whisker by group
  // ============================================================
  C.box = function (o) {
    var w = o.width || 340, h = o.height || 232, groups = o.groups;
    var all = [].concat.apply([], groups.map(function (g) { return g.values; }));
    var A = axes({ width: w, height: h, xmin: 0, xmax: 1, ymin: ST.min(all), ymax: ST.max(all), xcat: groups.map(function (g) { return g.label; }), ylabel: o.ylabel });
    var body = A.body, slot = A.iw / groups.length, bw = Math.min(slot * 0.5, 34);
    groups.forEach(function (g, gi) {
      var cx = A.m.l + slot * (gi + 0.5);
      var q1 = ST.quantile(g.values, 0.25), q3 = ST.quantile(g.values, 0.75), med = ST.median(g.values);
      var iqr = q3 - q1, lo = Math.max(ST.min(g.values), q1 - 1.5 * iqr), hi = Math.min(ST.max(g.values), q3 + 1.5 * iqr);
      var col = cat(gi);
      body += L(cx, A.sy(hi), cx, A.sy(q3), { stroke: col, w: 1 });
      body += L(cx, A.sy(lo), cx, A.sy(q1), { stroke: col, w: 1 });
      body += L(cx - bw / 3, A.sy(hi), cx + bw / 3, A.sy(hi), { stroke: col, w: 1 });
      body += L(cx - bw / 3, A.sy(lo), cx + bw / 3, A.sy(lo), { stroke: col, w: 1 });
      body += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + A.sy(q3).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.5, A.sy(q1) - A.sy(q3)).toFixed(1) + '" fill="' + col + '" fill-opacity="0.28" stroke="' + col + '" stroke-width="1"/>';
      body += L(cx - bw / 2, A.sy(med), cx + bw / 2, A.sy(med), { stroke: col, w: 1.8 });
    });
    return svg(w, h, body, o.aria || "box plot by group");
  };

  // ============================================================
  // 4. ridgeline — stacked KDE ridges by group
  // ============================================================
  C.ridgeline = function (o) {
    var w = o.width || 340, h = o.height || 250, groups = o.groups;
    var all = [].concat.apply([], groups.map(function (g) { return g.values; }));
    var m = { l: 78, r: 14, t: 12, b: 34 };
    var iw = w - m.l - m.r, ih = h - m.t - m.b;
    var xt = ticksNice(ST.min(all), ST.max(all), 5);
    var sx = scale(xt.min, xt.max, m.l, m.l + iw);
    var body = "";
    xt.ticks.forEach(function (v) { var x = sx(v); body += L(x, m.t, x, m.t + ih, { stroke: GRID, w: 1 }); body += T(x, h - 20, fmt(v, xt.step), { anchor: "middle", fill: MUTE }); });
    var rowH = ih / groups.length, overlap = rowH * 1.5, steps = 60;
    for (var gi = groups.length - 1; gi >= 0; gi--) {
      var g = groups[gi], base = m.t + rowH * (gi + 1);
      var xs = [], i; for (i = 0; i <= steps; i++) xs.push(xt.min + (xt.max - xt.min) * i / steps);
      var dens = ST.kde(g.values, xs), dmax = Math.max.apply(null, dens) || 1;
      var pathTop = [], i2;
      for (i2 = 0; i2 <= steps; i2++) pathTop.push(sx(xs[i2]).toFixed(1) + "," + (base - (dens[i2] / dmax) * overlap).toFixed(1));
      var poly = sx(xt.min).toFixed(1) + "," + base.toFixed(1) + " " + pathTop.join(" ") + " " + sx(xt.max).toFixed(1) + "," + base.toFixed(1);
      // translucent fill so overlapping ridges read through, with a firm coloured edge
      body += '<polygon points="' + poly + '" fill="' + cat(gi) + '" fill-opacity="0.4" stroke="' + cat(gi) + '" stroke-width="1.2" stroke-opacity="0.92"/>';
      body += T(m.l - 8, base - 2, g.label, { anchor: "end", size: 9.5, fill: INK });
    }
    if (o.xlabel) body += T(m.l + iw / 2, h - 4, o.xlabel, { anchor: "middle", size: 10.5, fill: INK });
    return svg(w, h, body, o.aria || "ridgeline plot");
  };

  // ============================================================
  // 5. histogram with density overlay
  // ============================================================
  C.histogram = function (o) {
    var w = o.width || 340, h = o.height || 228, vals = o.values;
    var bins = ST.histogram(vals, o.bins);
    var maxN = Math.max.apply(null, bins.map(function (b) { return b.n; }));
    var A = axes({ width: w, height: h, xmin: bins[0].x0, xmax: bins[bins.length - 1].x1, ymin: 0, ymax: maxN, xlabel: o.xlabel, ylabel: o.ylabel || "count" });
    var body = A.body, col = cat(o.colorIndex || 0);
    bins.forEach(function (bn) {
      var x = A.sx(bn.x0), x2 = A.sx(bn.x1), y = A.sy(bn.n), y0 = A.sy(0);
      body += '<rect x="' + (x + 0.6).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0.5, x2 - x - 1.2).toFixed(1) + '" height="' + Math.max(0, y0 - y).toFixed(1) + '" fill="' + col + '" fill-opacity="0.55"/>';
    });
    if (o.density !== false) {
      var xs = [], i, steps = 60, binW = bins[0].x1 - bins[0].x0;
      for (i = 0; i <= steps; i++) xs.push(A.xt.min + (A.xt.max - A.xt.min) * i / steps);
      var dens = ST.kde(vals, xs);
      var scaleD = (vals.length * binW); // density → expected count
      var pts = xs.map(function (x, j) { return A.sx(x).toFixed(1) + "," + A.sy(dens[j] * scaleD).toFixed(1); });
      body += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + INK + '" stroke-width="1.4"/>';
    }
    return svg(w, h, body, o.aria || "histogram");
  };

  // ============================================================
  // 6. grouped bar
  // ============================================================
  C.groupedBar = function (o) {
    var w = o.width || 360, h = o.height || 232, cats = o.categories, series = o.series;
    var maxV = 0; series.forEach(function (s) { s.values.forEach(function (v) { if (v > maxV) maxV = v; }); });
    var A = axes({ width: w, height: h, xmin: 0, xmax: 1, ymin: 0, ymax: maxV, xcat: cats, ylabel: o.ylabel });
    var body = A.body, slot = A.iw / cats.length, gw = slot * 0.72, bw = gw / series.length;
    cats.forEach(function (c, ci) {
      var x0 = A.m.l + slot * ci + (slot - gw) / 2;
      series.forEach(function (s, si) {
        var v = s.values[ci], x = x0 + bw * si, y = A.sy(v), y0 = A.sy(0);
        body += '<rect x="' + (x + 0.6).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0.5, bw - 1.2).toFixed(1) + '" height="' + Math.max(0, y0 - y).toFixed(1) + '" rx="1" fill="' + cat(si) + '"/>';
      });
    });
    body += legend(series.map(function (s, i) { return { label: s.name, color: cat(i) }; }), A.m.l + A.iw - 84, A.m.t + 8);
    return svg(w, h, body, o.aria || "grouped bar chart");
  };

  // ============================================================
  // 7. heatmap — matrix, diverging or sequential, annotated + colourbar
  // ============================================================
  C.heatmap = function (o) {
    var mtx = o.matrix, rows = o.rowLabels || o.labels, cols = o.colLabels || o.labels;
    var n = mtx.length, mcols = mtx[0].length;
    var cell = o.cell || 30, gap = 1.4;
    var m = { l: o.labelW || 92, t: o.labelT || 58, r: 44, b: 10 };
    var w = o.width || (m.l + mcols * cell + m.r);
    var gridW = w - m.l - m.r, cw = (gridW - gap * (mcols - 1)) / mcols;
    var h = m.t + n * (cell + gap) + m.b, ch = cell;
    var diverging = o.diverging !== false;
    var dom = o.domain || (diverging ? [-1, 1] : [ST.min([].concat.apply([], mtx)), ST.max([].concat.apply([], mtx))]);
    var body = "";
    function color(v) {
      if (diverging) return div(Math.max(-1, Math.min(1, (v - (dom[0] + dom[1]) / 2) / ((dom[1] - dom[0]) / 2))));
      return seq((v - dom[0]) / ((dom[1] - dom[0]) || 1));
    }
    for (var i = 0; i < n; i++) for (var j = 0; j < mcols; j++) {
      var v = mtx[i][j], x = m.l + j * (cw + gap), y = m.t + i * (ch + gap), col = color(v);
      body += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + cw.toFixed(1) + '" height="' + ch.toFixed(1) + '" fill="' + col + '"/>';
      if (o.annot !== false) body += T(x + cw / 2, y + ch / 2 + 3, (Math.abs(v) < 1 ? v.toFixed(2).replace(/^0/, "").replace(/^-0/, "-") : v.toFixed(2)), { anchor: "middle", size: 8.5, fill: inkOn(col) });
    }
    // labels
    for (var r = 0; r < n; r++) body += T(m.l - 6, m.t + r * (ch + gap) + ch / 2 + 3, rows[r], { anchor: "end", size: 9, fill: INK });
    for (var c = 0; c < mcols; c++) body += T(m.l + c * (cw + gap) + cw / 2, m.t - 6, cols[c], { anchor: "start", size: 9, fill: INK, rotate: -40 });
    // colourbar
    var cbX = w - m.r + 12, cbY = m.t, cbH = Math.min(n * (ch + gap) - gap, 120), segs = 32;
    for (var s = 0; s < segs; s++) {
      var tt = s / (segs - 1), val = dom[1] - tt * (dom[1] - dom[0]);
      body += '<rect x="' + cbX + '" y="' + (cbY + tt * cbH).toFixed(1) + '" width="9" height="' + (cbH / segs + 0.6).toFixed(1) + '" fill="' + color(val) + '"/>';
    }
    body += T(cbX + 12, cbY + 4, fmt(dom[1], 0.1), { size: 8, fill: MUTE });
    body += T(cbX + 12, cbY + cbH, fmt(dom[0], 0.1), { size: 8, fill: MUTE });
    if (o.cblabel) body += T(cbX + 5, cbY - 8, o.cblabel, { size: 8.5, anchor: "middle", fill: MUTE });
    return svg(w, h, body, o.aria || "heatmap");
  };

  // ============================================================
  // 8. waterfall — cumulative contributions with connectors
  // ============================================================
  C.waterfall = function (o) {
    var w = o.width || 360, h = o.height || 236, items = o.items; // {label, value, kind?: 'total'}
    var run = 0, maxTop = 0;
    var geom = items.map(function (it) {
      if (it.kind === "total") { if (it.value > maxTop) maxTop = it.value; return { it: it, start: 0, end: it.value }; }
      var start = run; run += it.value; if (run > maxTop) maxTop = run; if (start > maxTop) maxTop = start;
      return { it: it, start: start, end: run };
    });
    // headroom above the tallest bar so value labels never truncate off the top
    var ymax = Math.max(maxTop, run, 1) * 1.16;
    var A = axes({ width: w, height: h, xmin: 0, xmax: 1, ymin: 0, ymax: ymax, xcat: items.map(function (it) { return it.label; }), ylabel: o.ylabel, grid: true, margin: { l: 46, r: 14, t: 20, b: 36 } });
    var body = A.body, slot = A.iw / items.length, bw = slot * 0.6;
    var prevX = null, prevY = null;
    geom.forEach(function (gm, i) {
      var cx = A.m.l + slot * (i + 0.5), x = cx - bw / 2;
      var top = Math.max(gm.start, gm.end), bot = Math.min(gm.start, gm.end);
      var col = (gm.it.kind === "total" || gm.it.kind === "residual") ? "#9a9a9a" : (gm.it.value >= 0 ? cat(2) : cat(1));
      body += '<rect x="' + x.toFixed(1) + '" y="' + A.sy(top).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.6, A.sy(bot) - A.sy(top)).toFixed(1) + '" fill="' + col + '" fill-opacity="0.82"/>';
      // value label
      body += T(cx, A.sy(top) - 4, (gm.it.kind === "total" ? "" : (gm.it.value >= 0 ? "+" : "")) + fmt(gm.it.value, 0.1), { anchor: "middle", size: 8.5, fill: INK });
      // connector
      if (prevX !== null && gm.it.kind !== "total") body += L(prevX, A.sy(gm.start), x, A.sy(gm.start), { stroke: MUTE, w: 0.8, dash: "2,2" });
      prevX = x + bw; prevY = A.sy(gm.end);
    });
    return svg(w, h, body, o.aria || "waterfall chart");
  };

  // ============================================================
  // 9. forest / coefficient plot with CIs
  // ============================================================
  C.forest = function (o) {
    var rows = o.rows, w = o.width || 360, h = o.height || (44 + rows.length * 26);
    var m = { l: o.labelW || 128, r: 46, t: 16, b: 34 };
    var lo = Math.min.apply(null, rows.map(function (r) { return r.lo; }).concat([o.ref != null ? o.ref : 0]));
    var hi = Math.max.apply(null, rows.map(function (r) { return r.hi; }).concat([o.ref != null ? o.ref : 0]));
    var xt = ticksNice(lo, hi, 5);
    var iw = w - m.l - m.r, ih = h - m.t - m.b;
    var sx = scale(xt.min, xt.max, m.l, m.l + iw);
    var body = "";
    xt.ticks.forEach(function (v) { var x = sx(v); body += L(x, m.t, x, m.t + ih, { stroke: GRID, w: 1 }); body += T(x, m.t + ih + 13, fmt(v, xt.step), { anchor: "middle", fill: MUTE }); });
    var ref = o.ref != null ? o.ref : 0;
    body += L(sx(ref), m.t, sx(ref), m.t + ih, { stroke: SPINE, w: 1, dash: "3,3" });
    var rowH = ih / rows.length;
    rows.forEach(function (r, i) {
      var y = m.t + rowH * (i + 0.5), col = (r.lo > ref || r.hi < ref) ? cat(0) : MUTE;
      body += L(sx(r.lo), y, sx(r.hi), y, { stroke: col, w: 1.4, cap: "round" });
      body += '<rect x="' + (sx(r.est) - 3).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" width="6" height="6" fill="' + col + '"/>';
      body += T(m.l - 8, y + 3, r.label, { anchor: "end", size: 9.5, fill: INK });
      body += T(m.l + iw + 6, y + 3, r.est.toFixed(2), { anchor: "start", size: 8.5, fill: MUTE });
    });
    if (o.xlabel) body += T(m.l + iw / 2, h - 4, o.xlabel, { anchor: "middle", size: 10.5, fill: INK });
    return svg(w, h, body, o.aria || "forest plot");
  };

  // ============================================================
  // 10. Q–Q plot (normal)
  // ============================================================
  C.qq = function (o) {
    var w = o.width || 300, h = o.height || 232, vals = o.values.slice().sort(function (a, b) { return a - b; });
    var n = vals.length, theo = [], i;
    for (i = 0; i < n; i++) theo.push(ST.normalQuantile((i + 0.5) / n));
    var A = axes({ width: w, height: h, xmin: ST.min(theo), xmax: ST.max(theo), ymin: ST.min(vals), ymax: ST.max(vals), xlabel: o.xlabel || "theoretical quantiles", ylabel: o.ylabel || "sample quantiles" });
    var body = A.body;
    // robust reference line through Q1/Q3
    var q1t = ST.normalQuantile(0.25), q3t = ST.normalQuantile(0.75);
    var q1 = ST.quantile(vals, 0.25), q3 = ST.quantile(vals, 0.75);
    var slope = (q3 - q1) / (q3t - q1t), icpt = q1 - slope * q1t;
    body += L(A.sx(A.xt.min), A.sy(icpt + slope * A.xt.min), A.sx(A.xt.max), A.sy(icpt + slope * A.xt.max), { stroke: INK, w: 1.4, dash: "4,3" });
    for (i = 0; i < n; i++) body += '<circle cx="' + A.sx(theo[i]).toFixed(1) + '" cy="' + A.sy(vals[i]).toFixed(1) + '" r="2.3" fill="' + cat(0) + '" fill-opacity="0.8" stroke="#fff" stroke-width="0.5"/>';
    return svg(w, h, body, o.aria || "normal quantile-quantile plot");
  };

  // ============================================================
  // 11. line / time series (multi-series, optional markers, smart legend)
  // ============================================================
  C.line = function (o) {
    var w = o.width || 360, h = o.height || 226, series = o.series;
    var allx = [], ally = [];
    series.forEach(function (s) { s.points.forEach(function (p) { allx.push(p.x); ally.push(p.y); }); });
    var A = axes({ width: w, height: h, xmin: ST.min(allx), xmax: ST.max(allx), ymin: ST.min(ally), ymax: ST.max(ally), xlabel: o.xlabel, ylabel: o.ylabel });
    var body = A.body;
    series.forEach(function (s, si) {
      var pl = s.points.map(function (p) { return A.sx(p.x).toFixed(1) + "," + A.sy(p.y).toFixed(1); });
      body += '<polyline points="' + pl.join(" ") + '" fill="none" stroke="' + cat(si) + '" stroke-width="1.6"/>';
      if (o.markers) s.points.forEach(function (p) { body += '<circle cx="' + A.sx(p.x).toFixed(1) + '" cy="' + A.sy(p.y).toFixed(1) + '" r="1.9" fill="' + cat(si) + '" stroke="#fff" stroke-width="0.5"/>'; });
    });
    if (series.length > 1) {
      var ppx = []; series.forEach(function (s) { s.points.forEach(function (p) { ppx.push({ x: A.sx(p.x), y: A.sy(p.y) }); }); });
      body += legendSmart(series.map(function (s, i) { return { label: s.name, color: cat(i) }; }), ppx, A.m, A.iw, A.ih);
    }
    return svg(w, h, body, o.aria || "time series");
  };

  // ============================================================
  // 12. spectrum / periodogram (power vs frequency, dominant peak marked)
  // ============================================================
  C.spectrum = function (o) {
    var w = o.width || 360, h = o.height || 226, f = o.freq, pw = o.power;
    var A = axes({ width: w, height: h, xmin: 0, xmax: ST.max(f), ymin: 0, ymax: ST.max(pw) * 1.1, xlabel: o.xlabel || "frequency (cycles per sample)", ylabel: o.ylabel || "spectral power" });
    var body = A.body;
    var line = f.map(function (fx, i) { return A.sx(fx).toFixed(1) + "," + A.sy(pw[i]).toFixed(1); });
    body += '<polygon points="' + A.sx(0).toFixed(1) + "," + A.sy(0).toFixed(1) + " " + line.join(" ") + " " + A.sx(ST.max(f)).toFixed(1) + "," + A.sy(0).toFixed(1) + '" fill="' + cat(0) + '" fill-opacity="0.16"/>';
    body += '<polyline points="' + line.join(" ") + '" fill="none" stroke="' + cat(0) + '" stroke-width="1.4"/>';
    var mi = 0; pw.forEach(function (p, i) { if (p > pw[mi]) mi = i; });
    body += L(A.sx(f[mi]), A.m.t, A.sx(f[mi]), A.m.t + A.ih, { stroke: cat(1), w: 1.2, dash: "3,3" });
    var period = o.period ? o.period[mi] : (1 / f[mi]);
    var peakX = A.sx(f[mi]), lblAnchor = (peakX > A.m.l + A.iw * 0.6) ? "end" : "start";
    body += T(peakX + (lblAnchor === "end" ? -4 : 4), A.m.t + 11, "period ≈ " + period.toFixed(1), { size: 9, fill: cat(1), weight: 600, anchor: lblAnchor });
    return svg(w, h, body, o.aria || "periodogram");
  };

  // ============================================================
  // 13. scree plot (variance explained per principal component)
  // ============================================================
  C.scree = function (o) {
    var w = o.width || 320, h = o.height || 222;
    var ex = o.explained.map(function (v) { return v * 100; }), k = ex.length;
    var A = axes({ width: w, height: h, xmin: 0, xmax: 1, ymin: 0, ymax: ST.max(ex) * 1.14, xcat: ex.map(function (_, i) { return "PC" + (i + 1); }), ylabel: o.ylabel || "% variance" });
    var body = A.body, slot = A.iw / k, bw = Math.min(slot * 0.5, 26), tops = [];
    ex.forEach(function (v, i) {
      var cx = A.m.l + slot * (i + 0.5), y = A.sy(v), y0 = A.sy(0);
      body += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, y0 - y).toFixed(1) + '" rx="1" fill="' + cat(0) + '" fill-opacity="0.5"/>';
      tops.push(cx.toFixed(1) + "," + y.toFixed(1));
    });
    body += '<polyline points="' + tops.join(" ") + '" fill="none" stroke="' + INK + '" stroke-width="1.3"/>';
    ex.forEach(function (v, i) { var cx = A.m.l + slot * (i + 0.5); body += '<circle cx="' + cx.toFixed(1) + '" cy="' + A.sy(v).toFixed(1) + '" r="2.4" fill="' + INK + '"/>'; body += T(cx, A.sy(v) - 6, v.toFixed(0) + "%", { anchor: "middle", size: 8.5, fill: MUTE }); });
    return svg(w, h, body, o.aria || "scree plot");
  };

  // ============================================================
  // 14. PCA biplot (scores coloured by group + variable loading vectors)
  // ============================================================
  C.biplot = function (o) {
    var w = o.width || 340, h = o.height || 300, scores = o.scores, loadings = o.loadings;
    var xs = scores.map(function (p) { return p.x; }), ys = scores.map(function (p) { return p.y; });
    var ext = Math.max(Math.abs(ST.min(xs)), Math.abs(ST.max(xs)), Math.abs(ST.min(ys)), Math.abs(ST.max(ys))) || 1;
    var A = axes({ width: w, height: h, xmin: -ext, xmax: ext, ymin: -ext, ymax: ext, xlabel: o.xlabel, ylabel: o.ylabel, grid: false });
    var body = A.body;
    body += L(A.sx(0), A.m.t, A.sx(0), A.m.t + A.ih, { stroke: "#ccc", w: 0.8, dash: "2,3" });
    body += L(A.m.l, A.sy(0), A.m.l + A.iw, A.sy(0), { stroke: "#ccc", w: 0.8, dash: "2,3" });
    scores.forEach(function (p) { body += '<circle cx="' + A.sx(p.x).toFixed(1) + '" cy="' + A.sy(p.y).toFixed(1) + '" r="2.5" fill="' + cat(p.g || 0) + '" fill-opacity="0.72" stroke="#fff" stroke-width="0.5"/>'; });
    var lext = Math.max.apply(null, loadings.map(function (l) { return Math.hypot(l.x, l.y); })) || 1, sc = ext * 0.82 / lext;
    loadings.forEach(function (l) {
      var x2 = A.sx(l.x * sc), y2 = A.sy(l.y * sc);
      body += L(A.sx(0), A.sy(0), x2, y2, { stroke: INK, w: 1.2 });
      body += '<circle cx="' + x2.toFixed(1) + '" cy="' + y2.toFixed(1) + '" r="1.6" fill="' + INK + '"/>';
      body += T(x2 + (l.x >= 0 ? 3 : -3), y2 + (l.y >= 0 ? -3 : 9), l.label, { anchor: (l.x >= 0 ? "start" : "end"), size: 8, fill: INK, weight: 600 });
    });
    if (o.groups && o.groups.length > 1) {
      var ppx = scores.map(function (p) { return { x: A.sx(p.x), y: A.sy(p.y) }; });
      body += legendSmart(o.groups.map(function (g, i) { return { label: g, color: cat(i) }; }), ppx, A.m, A.iw, A.ih);
    }
    return svg(w, h, body, o.aria || "PCA biplot");
  };

  // ============================================================
  // 15. cluster scatter (points coloured by cluster + centroid marks)
  // ============================================================
  C.clusterScatter = function (o) {
    var w = o.width || 340, h = o.height || 236, pts = o.points;
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var A = axes({ width: w, height: h, xmin: ST.min(xs), xmax: ST.max(xs), ymin: ST.min(ys), ymax: ST.max(ys), xlabel: o.xlabel, ylabel: o.ylabel, grid: false });
    var body = A.body;
    pts.forEach(function (p) { body += '<circle cx="' + A.sx(p.x).toFixed(1) + '" cy="' + A.sy(p.y).toFixed(1) + '" r="2.6" fill="' + cat(p.g || 0) + '" fill-opacity="0.68" stroke="#fff" stroke-width="0.5"/>'; });
    (o.centroids || []).forEach(function (c, i) {
      var x = A.sx(c.x), y = A.sy(c.y), s = 5;
      body += L(x - s, y - s, x + s, y + s, { stroke: "#fff", w: 3.4 }) + L(x - s, y + s, x + s, y - s, { stroke: "#fff", w: 3.4 });
      body += L(x - s, y - s, x + s, y + s, { stroke: cat(i), w: 2 }) + L(x - s, y + s, x + s, y - s, { stroke: cat(i), w: 2 });
    });
    if (o.groups && o.groups.length > 1) body += legendSmart(o.groups.map(function (g, i) { return { label: g, color: cat(i) }; }), pts.map(function (p) { return { x: A.sx(p.x), y: A.sy(p.y) }; }), A.m, A.iw, A.ih);
    return svg(w, h, body, o.aria || "cluster scatter");
  };

  // ============================================================
  // 16. dendrogram (agglomerative merge tree)
  // ============================================================
  C.dendrogram = function (o) {
    var w = o.width || 360, h = o.height || 244, root = o.root, order = o.order, labels = o.labels;
    var m = { l: 34, r: 14, t: 14, b: labels ? 66 : 28 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    var n = order.length, pos = {};
    order.forEach(function (leaf, i) { pos[leaf] = m.l + iw * (i + 0.5) / n; });
    var maxH = (root.height || 1) * 1.05, sy = scale(0, maxH, m.t + ih, m.t);
    var body = "";
    // y axis (distance)
    var yt = ticksNice(0, maxH, 4);
    yt.ticks.forEach(function (v) { if (v > maxH) return; var y = sy(v); body += L(m.l - 3, y, m.l, y, { stroke: SPINE, w: 1 }); body += T(m.l - 5, y + 3, fmt(v, yt.step), { anchor: "end", size: 8, fill: MUTE }); });
    body += L(m.l, m.t, m.l, m.t + ih, { stroke: SPINE, w: 1 });
    (function draw(node) {
      if (node.leaf !== undefined) return { x: pos[node.leaf], y: m.t + ih };
      var Lc = draw(node.left), Rc = draw(node.right), y = sy(node.height);
      body += L(Lc.x, Lc.y, Lc.x, y, { stroke: cat(0), w: 1.2 });
      body += L(Rc.x, Rc.y, Rc.x, y, { stroke: cat(0), w: 1.2 });
      body += L(Lc.x, y, Rc.x, y, { stroke: cat(0), w: 1.2 });
      return { x: (Lc.x + Rc.x) / 2, y: y };
    })(root);
    if (labels) order.forEach(function (leaf, i) { body += T(pos[leaf], m.t + ih + 12, labels[leaf], { rotate: -40, anchor: "end", size: 8, fill: INK }); });
    body += '<text x="11" y="' + (m.t + ih / 2).toFixed(1) + '" font-family="' + FONT + '" font-size="10" fill="' + INK + '" text-anchor="middle" transform="rotate(-90 11 ' + (m.t + ih / 2).toFixed(1) + ')">' + esc(o.ylabel || "distance") + "</text>";
    return svg(w, h, body, o.aria || "dendrogram");
  };

  // ============================================================
  // 17. ROC curve
  // ============================================================
  C.roc = function (o) {
    var w = o.width || 300, h = o.height || 240, pts = o.points;
    var A = axes({ width: w, height: h, xmin: 0, xmax: 1, ymin: 0, ymax: 1, xlabel: o.xlabel || "false-positive rate", ylabel: o.ylabel || "true-positive rate" });
    var body = A.body;
    body += L(A.sx(0), A.sy(0), A.sx(1), A.sy(1), { stroke: MUTE, w: 1, dash: "3,3" });
    var pl = pts.map(function (p) { return A.sx(p.fpr).toFixed(1) + "," + A.sy(p.tpr).toFixed(1); });
    body += '<polygon points="' + A.sx(0).toFixed(1) + "," + A.sy(0).toFixed(1) + " " + pl.join(" ") + " " + A.sx(1).toFixed(1) + "," + A.sy(0).toFixed(1) + '" fill="' + cat(0) + '" fill-opacity="0.1"/>';
    body += '<polyline points="' + pl.join(" ") + '" fill="none" stroke="' + cat(0) + '" stroke-width="1.7"/>';
    if (o.auc != null) body += T(A.m.l + A.iw - 6, A.m.t + A.ih - 8, "AUC = " + o.auc.toFixed(2), { anchor: "end", size: 10, fill: INK, weight: 600 });
    return svg(w, h, body, o.aria || "ROC curve");
  };

  // ============================================================
  // 18. Kaplan–Meier survival curve (step)
  // ============================================================
  C.kaplanMeier = function (o) {
    var w = o.width || 340, h = o.height || 236, pts = o.points, tmax = ST.max(pts.map(function (p) { return p.t; })) || 1;
    var A = axes({ width: w, height: h, xmin: 0, xmax: tmax, ymin: 0, ymax: 1, xlabel: o.xlabel || "time", ylabel: o.ylabel || "survival S(t)" });
    var body = A.body, seg = [];
    pts.forEach(function (p, i) {
      if (i === 0) { seg.push(A.sx(0).toFixed(1) + "," + A.sy(1).toFixed(1)); }
      else { seg.push(A.sx(p.t).toFixed(1) + "," + A.sy(pts[i - 1].s).toFixed(1)); seg.push(A.sx(p.t).toFixed(1) + "," + A.sy(p.s).toFixed(1)); }
    });
    body += '<polyline points="' + seg.join(" ") + '" fill="none" stroke="' + cat(0) + '" stroke-width="1.7"/>';
    if (o.median != null) {
      body += L(A.sx(0), A.sy(0.5), A.sx(o.median), A.sy(0.5), { stroke: cat(1), w: 1, dash: "3,3" });
      body += L(A.sx(o.median), A.sy(0.5), A.sx(o.median), A.sy(0), { stroke: cat(1), w: 1, dash: "3,3" });
      body += T(A.sx(o.median) + 4, A.sy(0.5) - 4, "median " + o.median.toFixed(1), { size: 9, fill: cat(1), weight: 600 });
    }
    return svg(w, h, body, o.aria || "Kaplan-Meier survival curve");
  };

  // ============================================================
  // 19. lollipop (ranking / one-value-per-category)
  // ============================================================
  C.lollipop = function (o) {
    var items = o.items.slice(); if (o.sort !== false) items.sort(function (a, b) { return b.value - a.value; });
    var w = o.width || 340, h = o.height || (28 + items.length * 18);
    var m = { l: o.labelW || 104, r: 34, t: 12, b: 30 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    var vmax = ST.max(items.map(function (i) { return i.value; })), vmin = Math.min(0, ST.min(items.map(function (i) { return i.value; })));
    var xt = ticksNice(vmin, vmax, 5), sx = scale(xt.min, xt.max, m.l, m.l + iw);
    var body = "";
    xt.ticks.forEach(function (v) { var x = sx(v); body += L(x, m.t, x, m.t + ih, { stroke: GRID, w: 1 }); body += T(x, m.t + ih + 13, fmt(v, xt.step), { anchor: "middle", fill: MUTE }); });
    body += L(sx(Math.max(xt.min, 0)), m.t, sx(Math.max(xt.min, 0)), m.t + ih, { stroke: SPINE, w: 1 });
    items.forEach(function (it, i) {
      var y = m.t + ih * (i + 0.5) / items.length, x0 = sx(Math.max(xt.min, 0)), x1 = sx(it.value);
      body += L(x0, y, x1, y, { stroke: cat(it.g || 0), w: 1.6 });
      body += '<circle cx="' + x1.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.2" fill="' + cat(it.g || 0) + '"/>';
      body += T(m.l - 8, y + 3, it.label, { anchor: "end", size: 9, fill: INK });
      body += T(x1 + (it.value >= 0 ? 6 : -6), y + 3, (typeof it.value === "number" ? (Math.abs(it.value) < 10 ? it.value.toFixed(2) : Math.round(it.value)) : it.value), { anchor: it.value >= 0 ? "start" : "end", size: 8, fill: MUTE });
    });
    if (o.xlabel) body += T(m.l + iw / 2, h - 4, o.xlabel, { anchor: "middle", size: 10.5, fill: INK });
    return svg(w, h, body, o.aria || "lollipop chart");
  };

  // ============================================================
  // 20. logistic curve (binary points + fitted sigmoid)
  // ============================================================
  C.logisticCurve = function (o) {
    var w = o.width || 340, h = o.height || 232, pts = o.points, curve = o.curve;
    var xs = pts.map(function (p) { return p.x; });
    var A = axes({ width: w, height: h, xmin: ST.min(xs), xmax: ST.max(xs), ymin: 0, ymax: 1, xlabel: o.xlabel, ylabel: o.ylabel || "P(class = 1)" });
    var body = A.body;
    body += L(A.m.l, A.sy(0.5), A.m.l + A.iw, A.sy(0.5), { stroke: MUTE, w: 0.8, dash: "2,3" });
    pts.forEach(function (p, i) { var jy = p.y === 1 ? 0.965 : 0.035; body += '<circle cx="' + A.sx(p.x).toFixed(1) + '" cy="' + (A.sy(jy) + ((i % 5) - 2) * 0.8).toFixed(1) + '" r="2" fill="' + cat(p.y ? 1 : 0) + '" fill-opacity="0.5"/>'; });
    var cl = curve.map(function (p) { return A.sx(p.x).toFixed(1) + "," + A.sy(p.p).toFixed(1); });
    body += '<polyline points="' + cl.join(" ") + '" fill="none" stroke="' + INK + '" stroke-width="1.7"/>';
    return svg(w, h, body, o.aria || "logistic regression curve");
  };

  C.CAT = CAT; C.seq = seq; C.div = div; C._axes = axes;
})();
