// wormhole — FLORA, the marginalia engine.
//
// Grows a watercolour garden in the margins of a page. One seed → one margin,
// for ever: the same paper always wears the same flowers. Inspired by the
// tikz-flora idea (flora grown in the margins of LaTeX documents), written
// from scratch as a procedural engine so the space of margins can be explored.
//
// It is a small GRAMMAR of a margin, in three layers:
//
//   1. GENOME   — genome(seed) draws the margin's traits: an ink palette, a
//                 growth HABIT (climbing, meander, twining, frame, scatter),
//                 symmetry, the species that bloom (rosettes, cosmos, bells,
//                 umbels, forget-me-nots, globes, berries, ferns, buds), the
//                 leaf forms, the fauna (birds, butterflies, moths) and the
//                 ornaments (gilt sparkles, dotted guide rules, star plates).
//                 Pass a second "biome" seed and the palette + species are
//                 drawn from it, so papers in one field share a flora while
//                 each paper is its own specimen.
//   2. LAYOUT   — grow(genome, page) lays main stems down the margins, walks
//                 them by arc length emitting leaves, side branches and
//                 blossoms, then fills the free margin with sprigs, fauna and
//                 ornaments. Every placed thing is checked against the TEXT
//                 BOX and kept out of it: the garden never touches the prose.
//   3. PAINT    — everything is drawn as SVG with the watercolour baked into
//                 the geometry (wobbled outlines, gradient washes, darkened
//                 edges, translucent inner streaks), so it is cheap to render,
//                 prints as vectors, and is a pure string — node can test it.
//
// Pure, deterministic, self-contained (no imports, no DOM). Attaches to
// globalThis.WORMHOLE_FLORA like the other wormhole modules.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var F = NS.WORMHOLE_FLORA = NS.WORMHOLE_FLORA || {};

  // ---------- seeded PRNG (same lineage as engine.js) ----------
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function Rand(seed) {
    var next = mulberry32(xmur3(String(seed))());
    var r = {
      f: next,
      range: function (a, b) { return a + (b - a) * next(); },
      int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },
      chance: function (p) { return next() < p; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      sign: function () { return next() < 0.5 ? -1 : 1; },
      pickw: function (pairs) { // [[value, weight], ...]
        var t = 0, i; for (i = 0; i < pairs.length; i++) t += pairs[i][1];
        var x = next() * t;
        for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
        return pairs[pairs.length - 1][0];
      },
      sample: function (arr, n) {
        var a = arr.slice(), out = [];
        while (out.length < n && a.length) out.push(a.splice(Math.floor(next() * a.length), 1)[0]);
        return out;
      },
    };
    return r;
  }

  // ---------- the inks ----------
  // Each ink is [deep, mid, light]. bloom inks paint flowers/fauna, leaf inks
  // paint foliage; small is the forget-me-not/umbel colour, accent the gilt.
  var PALETTES = [
    { id: "florilegium", name: "Florilegium", genus: "Violacea",
      bloom: [["#4b1d78", "#8a4fd0", "#dccaf6"], ["#7a1650", "#c2408a", "#f4c8de"], ["#0f4f63", "#2a8aa6", "#c2e7f1"]],
      leaf: [["#1e5e3a", "#3f9a5e", "#d2ebcd"], ["#4a5418", "#8a9a30", "#e6edbd"], ["#1d3f8a", "#4a78d0", "#d2def7"]],
      stem: "#6b7468", small: "#3550b8", accent: "#c9a24a" },
    { id: "indigo", name: "Indigo nocturne", genus: "Indigofera",
      bloom: [["#16246e", "#3552c8", "#cbd6f8"], ["#1b3a8a", "#5b82e0", "#e0e9fb"], ["#2a2a7a", "#6e6ed8", "#e2e2fa"]],
      leaf: [["#1b2f6b", "#4565c0", "#cdd8f4"], ["#2b4a8a", "#6a8ccc", "#dde6f5"]],
      stem: "#59616e", small: "#2a44b0", accent: "#c4a050" },
    { id: "autumn", name: "Autumn herbal", genus: "Ferruginea",
      bloom: [["#7a2412", "#c8512a", "#f6d0b8"], ["#7a4a08", "#d89a2a", "#f8e4b4"], ["#4a1838", "#8e3a6a", "#eecbdd"]],
      leaf: [["#4a5214", "#8c9632", "#e8edc2"], ["#6a3a14", "#b0703a", "#f2dbc0"]],
      stem: "#6e5f4a", small: "#a8451f", accent: "#b88a2e" },
    { id: "verdigris", name: "Verdigris", genus: "Aeruginosa",
      bloom: [["#0e4a48", "#2a9a8e", "#c8eee6"], ["#7a3a1a", "#c8743a", "#f5d7be"], ["#7a6420", "#cfae4a", "#f7eec8"]],
      leaf: [["#164a3a", "#3a8c6a", "#d0e9dc"], ["#2a5a5a", "#5a9a96", "#d9edeb"]],
      stem: "#5e6a62", small: "#1e7a72", accent: "#b8963a" },
    { id: "madder", name: "Rose madder", genus: "Rubiacea",
      bloom: [["#7a1030", "#d0406a", "#fbd4df"], ["#8a2a48", "#e07a96", "#fce3ea"], ["#5a1a40", "#a64a80", "#f2d4e6"]],
      leaf: [["#3a5a3e", "#7a9a7a", "#e0eadd"], ["#4a6a2a", "#8aaa4a", "#e6f0cf"]],
      stem: "#6e6a62", small: "#c03a6a", accent: "#c49a52" },
    { id: "sepia", name: "Sepia herbarium", genus: "Sepiacea",
      bloom: [["#3a2414", "#7a5434", "#eadbc8"], ["#4a2e1a", "#96704a", "#f0e4d3"]],
      leaf: [["#3a2c1a", "#7a6444", "#e8dfcc"], ["#2e2a1e", "#66604a", "#e4e0d0"]],
      stem: "#5a4a38", small: "#6a4a2a", accent: "#8a6a3a" },
    { id: "kingfisher", name: "Kingfisher", genus: "Alcedinia",
      bloom: [["#0a4a7a", "#1f8ad0", "#c8e8fb"], ["#8a3a08", "#e8741a", "#fcdfc0"], ["#141e5a", "#3a4aa8", "#d3d9f3"]],
      leaf: [["#1a5a5a", "#3a9a8a", "#d0efe7"], ["#24406a", "#4a78aa", "#d7e4f3"]],
      stem: "#5e6670", small: "#1f6ad0", accent: "#c8963a" },
    { id: "iris", name: "Iris & saffron", genus: "Iridacea",
      bloom: [["#3a1a78", "#6a3ad0", "#ded3fa"], ["#8a6008", "#e8b81a", "#fcf1bd"], ["#2a2a6a", "#5a5ab8", "#dcdcf5"]],
      leaf: [["#2a5a2a", "#5a9a3a", "#dbedc8"], ["#3a5a4a", "#6a9a7a", "#dbede2"]],
      stem: "#646a5e", small: "#5a3ad0", accent: "#c9a23a" },
  ];

  var HABITS = {
    climbing: { epithet: "scandens", label: "climbing" },
    meander:  { epithet: "serpens", label: "meandering" },
    twining:  { epithet: "volubilis", label: "twining" },
    frame:    { epithet: "circumcincta", label: "framing" },
    scatter:  { epithet: "dispersa", label: "scattered" },
  };
  var SPECIES = ["rosette", "cosmos", "bell", "umbel", "forgetmenot", "globe", "berries", "fern", "bud", "tendril"];
  var SPECIES_LABEL = {
    rosette: "rosettes", cosmos: "cosmos", bell: "bells", umbel: "umbels", forgetmenot: "forget-me-nots",
    globe: "globes", berries: "berries", fern: "ferns", bud: "buds", tendril: "tendrils",
  };
  var LEAVES = ["lanceolate", "ovate", "oak", "round", "willow", "serrate"];

  // ---------- 1. GENOME ----------
  // overrides (optional): { palette: <id>, habit: <name> } — the herbarium's
  // dials. Everything else still follows the seed.
  function genome(seed, biomeSeed, overrides) {
    seed = String(seed == null ? "1" : seed);
    var b = Rand("flora-biome:" + String(biomeSeed == null ? seed : biomeSeed));
    var r = Rand("flora-specimen:" + seed);
    var palette = b.pick(PALETTES);
    // the biome fixes the palette and the species pool; the specimen draws
    // from that pool, so one field's papers are cousins, not clones
    var pool = b.sample(SPECIES, b.int(5, 7));
    if (pool.indexOf("rosette") < 0 && pool.indexOf("cosmos") < 0) pool[0] = b.chance(0.6) ? "rosette" : "cosmos";
    var species = r.sample(pool, r.int(3, Math.min(5, pool.length)));
    // guarantee one showy bloom so every margin has a centre of gravity
    if (species.indexOf("rosette") < 0 && species.indexOf("cosmos") < 0) species.unshift(pool.indexOf("rosette") >= 0 ? "rosette" : "cosmos");
    var habit = r.pickw([["climbing", 34], ["meander", 20], ["twining", 16], ["frame", 16], ["scatter", 14]]);
    var leaves = b.sample(LEAVES, b.int(1, 3));
    var g = {
      seed: seed,
      biome: String(biomeSeed == null ? seed : biomeSeed),
      palette: palette,
      habit: habit,
      mirror: r.chance(0.35),
      species: species,
      leaves: leaves,
      density: r.range(0.75, 1.3),
      bloomScale: r.range(0.85, 1.2),
      wave: r.range(0.6, 1.4),
      fauna: {
        bird: r.chance(0.55),
        butterfly: r.chance(0.7),
        moth: r.chance(0.25),
      },
      ornaments: {
        sparkles: r.chance(0.75),
        guide: r.chance(0.5),
        plates: r.chance(0.3),
      },
    };
    if (overrides) {
      var op = overrides.palette && PALETTES.filter(function (p) { return p.id === overrides.palette; })[0];
      if (op) g.palette = palette = op;
      if (overrides.habit && HABITS[overrides.habit]) g.habit = habit = overrides.habit;
    }
    g.name = palette.genus + " " + HABITS[habit].epithet + (g.mirror ? " var. symmetrica" : "");
    return g;
  }

  function describe(g) {
    var fauna = [];
    if (g.fauna.bird) fauna.push("birds");
    if (g.fauna.butterfly) fauna.push("butterflies");
    if (g.fauna.moth) fauna.push("moths");
    return {
      name: g.name,
      palette: g.palette.name,
      habit: HABITS[g.habit].label + (g.mirror ? ", mirrored" : ""),
      species: g.species.map(function (s) { return SPECIES_LABEL[s]; }),
      leaves: g.leaves.slice(),
      fauna: fauna,
      line: g.palette.name + " · " + HABITS[g.habit].label + " habit · " +
        g.species.map(function (s) { return SPECIES_LABEL[s]; }).join(", ") +
        (fauna.length ? " · with " + fauna.join(" & ") : ""),
    };
  }

  // ---------- geometry ----------
  function n1(x) { return Math.round(x * 10) / 10; }
  function pt(p) { return n1(p[0]) + "," + n1(p[1]); }
  // Catmull-Rom → cubic Bézier, open or closed
  function smooth(pts, closed) {
    var n = pts.length;
    if (n < 2) return "";
    var d = "M" + pt(pts[0]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += "C" + pt(c1) + " " + pt(c2) + " " + pt(p2);
    }
    return d + (closed ? "Z" : "");
  }

  // closed organic outline: quadratic through edge midpoints — two numbers per
  // vertex fewer than Catmull-Rom, and a softer brush edge
  function blob(pts) {
    var n = pts.length;
    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    var d = "M" + pt(mid(pts[n - 1], pts[0]));
    for (var i = 0; i < n; i++) d += "Q" + pt(pts[i]) + " " + pt(mid(pts[i], pts[(i + 1) % n]));
    return d + "Z";
  }

  // A blade outline in LOCAL coords: base at (0,0), tip at (L,0). profile(t)
  // gives the half-width fraction; the wobble is the watercolour's ragged edge.
  function blade(r, L, Wd, profile, wob, steps) {
    steps = steps || 9;
    var up = [], lo = [];
    for (var i = 1; i < steps; i++) {
      var t = i / steps, w = profile(t) * Wd / 2;
      up.push([t * L + r.range(-wob, wob), w * (1 + r.range(-0.09, 0.09))]);
      lo.push([t * L + r.range(-wob, wob), -w * (1 + r.range(-0.09, 0.09))]);
    }
    return [[0, 0]].concat(up, [[L, 0]], lo.reverse());
  }
  function scalePts(pts, sx, sy, dx) { return pts.map(function (p) { return [p[0] * sx + (dx || 0), p[1] * sy]; }); }

  var PROFILES = {
    lanceolate: function (t) { return Math.pow(Math.sin(Math.PI * t), 0.9) * (1 - 0.3 * t); },
    ovate: function (t) { return Math.sin(Math.PI * Math.pow(t, 0.72)); },
    round: function (t) { return Math.pow(Math.sin(Math.PI * t), 0.55); },
    willow: function (t) { return Math.pow(Math.sin(Math.PI * t), 1.2) * 0.62; },
    oak: function (t) { return Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.78 + 0.26 * Math.sin(t * Math.PI * 7)); },
    serrate: function (t) { return Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.9 + 0.12 * ((Math.floor(t * 16) % 2) ? 1 : -1)); },
    petalBroad: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.75); },
    petalThin: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.6); },
    bell: function (t) { return 0.35 + 0.65 * Math.pow(t, 0.8) * (t < 0.92 ? 1 : (1 - t) / 0.08 * 0.6 + 0.4); },
    wing: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.45)), 0.7); },
    hindwing: function (t) { return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.8); },
  };

  // sample a smooth path through control points every ~step px
  function resample(ctrl, step) {
    // densify via Catmull-Rom evaluation
    var out = [];
    for (var i = 0; i < ctrl.length - 1; i++) {
      var p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      var seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      var k = Math.max(2, Math.ceil(seg / step));
      for (var j = 0; j < k; j++) {
        var t = j / k, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(ctrl[ctrl.length - 1]);
    // attach arc length + tangent angle
    var s = 0;
    return out.map(function (p, i) {
      if (i > 0) s += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]);
      var a = out[Math.max(0, i - 1)], c = out[Math.min(out.length - 1, i + 1)];
      return { x: p[0], y: p[1], s: s, ang: Math.atan2(c[1] - a[1], c[0] - a[0]) };
    });
  }

  // a tapering filled ribbon along sampled points (w0 at start → w1 at end)
  function ribbon(samples, w0, w1) {
    var L = [], R = [], total = samples[samples.length - 1].s || 1;
    for (var i = 0; i < samples.length; i++) {
      var q = samples[i], w = (w0 + (w1 - w0) * (q.s / total)) / 2;
      var nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
      L.push([q.x + nx * w, q.y + ny * w]);
      R.push([q.x - nx * w, q.y - ny * w]);
    }
    return blob(L.concat(R.reverse()));
  }

  // ---------- 2. LAYOUT + 3. PAINT ----------
  function grow(g, page, opts) {
    if (typeof g !== "object") g = genome(g);
    opts = opts || {};
    var W = page.width, H = page.height;
    var box = page.box; // the text block: {x0, y0, x1, y1}
    var gap = page.gap == null ? 6 : page.gap;
    var pfx = (opts.idPrefix || "fl") + xmur3(g.seed + "|" + g.biome)().toString(36).slice(0, 5);
    var r = Rand("flora-layout:" + g.seed + ":" + Math.round(W) + "x" + Math.round(H));
    var P = g.palette;
    var leafBloom = P.id === "sepia" ? 0.15 : 0.38;

    var mL = box.x0, mR = W - box.x1, mT = box.y0, mB = H - box.y1;
    var mSide = Math.min(mL, mR);
    // everything scales with how much margin there is to grow in
    var S = Math.max(0.32, Math.min(1.15, mSide / 96)) * g.bloomScale;
    var animated = opts.animate !== false;

    var items = [];        // placed circles {x,y,r,kind}
    var layers = { back: [], stems: [], leaves: [], blooms: [], fauna: [] };
    var counts = {};

    function inText(x, y, rad) {
      // circle vs the text rect grown by the gap
      var dx = Math.max(box.x0 - gap - x, 0, x - box.x1 - gap);
      var dy = Math.max(box.y0 - gap - y, 0, y - box.y1 - gap);
      return Math.hypot(dx, dy) < rad;
    }
    function offPage(x, y, rad) { return x - rad < 1 || y - rad < 1 || x + rad > W - 1 || y + rad > H - 1; }
    function fits(x, y, rad) { return !inText(x, y, rad) && !offPage(x, y, rad); }
    function crowded(x, y, rad, kinds, slack) {
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        if (kinds && kinds.indexOf(it.kind) < 0) continue;
        if (Math.hypot(it.x - x, it.y - y) < (it.r + rad) * (slack || 1)) return true;
      }
      return false;
    }
    function order(y) { return Math.max(0, Math.min(1, y / H)); }
    function wrap(layer, y, inner, cls) {
      layers[layer].push(animated
        ? '<g class="' + (cls || "fb") + '" style="--o:' + order(y).toFixed(3) + '">' + inner + "</g>"
        : "<g>" + inner + "</g>");
    }
    function tf(x, y, deg, s) {
      return 'transform="translate(' + n1(x) + " " + n1(y) + ")" + (deg ? " rotate(" + n1(deg) + ")" : "") + (s && s !== 1 ? " scale(" + (Math.round(s * 1000) / 1000) + ")" : "") + '"';
    }
    var DEG = 180 / Math.PI;

    // ---- gradient defs ----
    var defs = [];
    function lin(id, stops) {
      // opts.flat: no gradients, for the same kind of consumer — the middle stop stands in
      if (opts.flat) return stops[Math.floor(stops.length / 2)][1];
      defs.push('<linearGradient id="' + pfx + id + '" x1="0" y1="0" x2="1" y2="0">' +
        stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : "") + "/>"; }).join("") +
        "</linearGradient>");
      return "url(#" + pfx + id + ")";
    }
    var gB = P.bloom.map(function (k, i) {
      return {
        ink: k,
        out: lin("b" + i, [[0, k[0]], [0.55, k[1]], [1, k[2]]]),       // deep base → pale tip
        inn: lin("bi" + i, [[0, k[2]], [0.5, k[1]], [1, k[0]]]),       // pale base → deep tip
        two: lin("bt" + i, [[0, k[0]], [0.5, k[1]], [1, P.bloom[(i + 1) % P.bloom.length][1]]]), // two-tone
      };
    });
    var gL = P.leaf.map(function (k, i) {
      return { ink: k, out: lin("l" + i, [[0, k[0]], [0.5, k[1]], [1, k[2]]]), inn: lin("li" + i, [[0, k[1]], [0.6, k[2]], [1, k[1]]]) };
    });

    // ---- the blade library: wobbled prototype outlines ----
    // Each (profile, variant) outline is drawn once at unit size and reused,
    // scaled, by every leaf and petal of that form. Blades are written out as
    // real paths (not nested <use>): whole flowers are themselves instanced
    // below, and a <use> inside a <use> makes the browser clone shadow trees
    // by the tens of thousands — that cost a 1.5 s first paint.
    var pr = Rand("flora-protos:" + g.seed), protos = {}, VARIANTS = 8;
    function proto(form, steps, v) {
      var key = form + (steps || 9) + "_" + v;
      if (!protos[key]) {
        var pts = blade(pr, 100, 100, PROFILES[form], 2.2, steps || 9);
        var fl = [];
        for (var f = 0; f < 6; f++) { var tx = pr.range(15, 85); fl.push([tx, pr.range(-0.6, 0.6) * PROFILES[form](tx / 100) * 50]); }
        protos[key] = { pts: pts, inner: scalePts(pts, 0.62, 0.42, 18), flecks: fl };
      }
      return protos[key];
    }
    function sc(v) { return Math.round(v * 1000) / 1000; }
    // a watercolour blade: wash + pooled edge, inner streak, granulation, vein
    function blade2(form, L, Wd, fill, ink, o) {
      o = o || {};
      var p = proto(form, o.steps, r.int(0, VARIANTS - 1)), sx = L / 100, sy = Wd / 100;
      function S2(pts) { return pts.map(function (q) { return [q[0] * sx, q[1] * sy]; }); }
      var s = '<path d="' + blob(S2(p.pts)) + '" fill="' + fill + '" fill-opacity="' + (o.op || 0.86) + '"' +
        (o.edge === 0 ? "" : ' stroke="' + ink[0] + '" stroke-width="' + (o.edge || 0.55) + '" stroke-opacity="0.42"') + "/>";
      if (o.streak !== false && L > 7) s += '<path d="' + blob(S2(p.inner)) + '" fill="' + ink[2] + '" fill-opacity="0.32"/>';
      if (o.speck && L > 9) s += '<path d="' + S2(p.flecks).map(function (q) { return "M" + pt(q) + "h0"; }).join("") + '" stroke="#fff" stroke-linecap="round" stroke-width="' + n1(Math.max(0.5, L * 0.035)) + '" stroke-opacity="0.7"/>';
      if (o.vein) s += '<path d="M0,0Q' + n1(L * 0.5) + "," + n1(o.bend || 0) + " " + n1(L * 0.9) + ',0" fill="none" stroke="' + ink[2] + '" stroke-width="0.5" stroke-opacity="0.6"/>';
      return s;
    }

    // ---- painters (all return SVG strings in local coords) ----
    // a watercolour blade: wash + pooled edge + inner streak + optional vein
    function wash(pts, fill, ink, o) {
      o = o || {};
      // one element carries wash + pooled edge (fill and stroke together)
      var s = '<path d="' + blob(pts) + '" fill="' + fill + '" fill-opacity="' + (o.op || 0.86) + '" stroke="' + ink[0] + '" stroke-width="' + (o.edge || 0.55) + '" stroke-opacity="0.42"/>';
      if (o.streak !== false && (o.L || 10) > 7) {
        var inner = scalePts(pts, 0.62, 0.42, (o.L || 10) * 0.18);
        s += '<path d="' + blob(inner) + '" fill="' + ink[2] + '" fill-opacity="0.32"/>';
      }
      if (o.vein) s += '<path d="M0,0 Q' + n1(o.L * 0.5) + "," + n1(o.bend || 0) + " " + n1(o.L * 0.9) + ',0" fill="none" stroke="' + ink[2] + '" stroke-width="0.5" stroke-opacity="0.6"/>';
      return s;
    }

    function leaf(x, y, deg, L, form) {
      form = form || r.pick(g.leaves);
      // like the reference, foliage borrows the flowers' inks a good third of the time
      var k = r.chance(leafBloom) ? r.pick(gB) : r.pick(gL);
      var Wd = L * (form === "willow" ? 0.34 : form === "round" ? 0.62 : form === "oak" ? 0.58 : 0.44);
      var fill = r.chance(0.75) ? k.out : k.inn;
      return "<g " + tf(x, y, deg) + ">" + blade2(form, L, Wd, fill, k.ink, { steps: form === "oak" || form === "serrate" ? 14 : 9, vein: true, bend: r.range(-1.5, 1.5), op: 0.93, speck: true }) + "</g>";
    }

    function petalRing(n, L, Wd, profile, kset, mode, spin, wob) {
      var s = "";
      for (var i = 0; i < n; i++) {
        var a = spin + i * 360 / n + r.range(-6, 6);
        var Li = L * r.range(0.88, 1.08);
        var fill = mode === "two" ? kset.two : mode === "inn" ? kset.inn : kset.out;
        s += '<g transform="rotate(' + n1(a) + ')">' + blade2(profile, Li, Wd * r.range(0.9, 1.1), fill, kset.ink, { vein: Li > 9, bend: r.range(-1, 1), op: 0.8 }) + "</g>";
      }
      return s;
    }
    function stamens(rad, n, col, dot) {
      var s = "";
      for (var i = 0; i < n; i++) {
        var a = r.f() * Math.PI * 2, d = rad * Math.sqrt(r.f());
        s += '<circle cx="' + n1(Math.cos(a) * d) + '" cy="' + n1(Math.sin(a) * d) + '" r="' + n1(dot) + '" fill="' + col + '" fill-opacity="0.85"/>';
      }
      return s;
    }

    function rosette(x, y, size) {
      var k = r.pick(gB), n = r.pick([5, 5, 5, 6, 4]);
      var mode = r.pickw([["out", 3], ["two", 2], ["inn", 1]]);
      var s = petalRing(n, size, size * 0.95, "petalBroad", k, mode, r.range(0, 360));
      if (r.chance(0.5)) s += petalRing(n, size * 0.55, size * 0.5, "petalBroad", k, "out", r.range(0, 360));
      s += '<circle r="' + n1(size * 0.16) + '" fill="' + k.ink[2] + '" fill-opacity="0.9"/>';
      s += stamens(size * 0.2, 9, P.accent, Math.max(0.5, size * 0.03));
      s += '<circle r="' + n1(size * 0.06) + '" fill="' + k.ink[0] + '"/>';
      return "<g " + tf(x, y, 0) + ">" + s + "</g>";
    }
    function cosmos(x, y, size) {
      var k = r.pick(gB), n = r.int(8, 13);
      var s = petalRing(n, size, size * 0.38, "petalThin", k, r.chance(0.5) ? "out" : "inn", r.range(0, 360));
      s += '<circle r="' + n1(size * 0.2) + '" fill="' + P.accent + '" fill-opacity="0.8"/>';
      s += stamens(size * 0.18, 12, k.ink[0], Math.max(0.45, size * 0.035));
      return "<g " + tf(x, y, 0) + ">" + s + "</g>";
    }
    function bell(x, y, deg, size) {
      var k = r.pick(gB);
      var pts = blade(r, size, size * 0.9, PROFILES.bell, size * 0.02, 10);
      var s = wash(pts, k.inn, k.ink, { L: size, vein: true });
      // the bell mouth: three little scallops
      var m = size * 0.45;
      s += '<path d="M' + n1(size) + "," + n1(-m) + " q" + n1(size * 0.12) + "," + n1(m / 3) + " 0," + n1(m * 2 / 3) +
        " q" + n1(size * 0.12) + "," + n1(m / 3) + " 0," + n1(m * 2 / 3) + " q" + n1(size * 0.12) + "," + n1(m / 3) + " 0," + n1(m * 2 / 3) +
        '" fill="' + k.ink[1] + '" fill-opacity="0.55" stroke="' + k.ink[0] + '" stroke-width="0.5" stroke-opacity="0.4"/>';
      s += '<path d="M' + n1(-size * 0.15) + ",0 L0,0" + '" stroke="' + P.stem + '" stroke-width="1"/>';
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function bud(x, y, deg, size) {
      var k = r.pick(gB);
      var s = blade2("ovate", size, size * 0.55, k.out, k.ink, {});
      var lk = r.pick(gL);
      s += '<g transform="translate(0 ' + n1(size * 0.12) + ')">' + blade2("lanceolate", size * 0.45, size * 0.22, lk.out, lk.ink, { streak: false, steps: 6 }) + "</g>";
      s += '<g transform="translate(0 ' + n1(-size * 0.12) + ')">' + blade2("lanceolate", size * 0.45, size * 0.22, lk.out, lk.ink, { streak: false, steps: 6 }) + "</g>";
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    // the fan of spokes ending in dots — Queen-Anne's-lace seen side on
    function umbel(x, y, deg, size) {
      var n = r.int(7, 12), spread = r.range(70, 130), s = "";
      var col = r.chance(0.6) ? P.small : r.pick(gB).ink[1];
      for (var i = 0; i < n; i++) {
        var a = (-spread / 2 + spread * i / (n - 1) + r.range(-4, 4)) / DEG;
        var L = size * r.range(0.75, 1.05);
        var ex = Math.cos(a) * L, ey = Math.sin(a) * L;
        s += '<path d="M0,0 Q' + n1(ex * 0.5) + "," + n1(ey * 0.4) + " " + n1(ex) + "," + n1(ey) + '" fill="none" stroke="' + col + '" stroke-width="0.55" stroke-opacity="0.75"/>';
        s += '<circle cx="' + n1(ex) + '" cy="' + n1(ey) + '" r="' + n1(Math.max(0.7, size * r.range(0.05, 0.09))) + '" fill="' + col + '" fill-opacity="0.85"/>';
      }
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function tinyFlower(x, y, rad, col, ctr) {
      var s = "";
      for (var i = 0; i < 5; i++) {
        var a = i * Math.PI * 2 / 5 + r.range(-0.2, 0.2);
        s += '<circle cx="' + n1(x + Math.cos(a) * rad) + '" cy="' + n1(y + Math.sin(a) * rad) + '" r="' + n1(rad * 0.85) + '" fill="' + col + '" fill-opacity="0.7"/>';
      }
      return s + '<circle cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + n1(rad * 0.5) + '" fill="' + ctr + '"/>';
    }
    // a curved stalk of forget-me-nots with dot-buds at the tip
    function forgetmenot(x, y, deg, size) {
      var s = "", bend = r.range(-0.5, 0.5) * size;
      var col = P.small, n = r.int(3, 6);
      s += '<path d="M0,0 Q' + n1(size * 0.5) + "," + n1(bend) + " " + n1(size) + "," + n1(bend * 0.6) + '" fill="none" stroke="' + P.stem + '" stroke-width="0.6"/>';
      for (var i = 0; i < n; i++) {
        var t = 0.3 + 0.7 * i / n, px = size * t, py = bend * (2 * t * (1 - t)) + bend * 0.6 * t * t + r.range(-3, 3) * S;
        s += tinyFlower(px, py, Math.max(0.8, size * 0.07) * r.range(0.8, 1.2), col, P.accent);
      }
      for (var j = 0; j < 3; j++) s += '<circle cx="' + n1(size * (1.02 + j * 0.06)) + '" cy="' + n1(bend * 0.6 + r.range(-2, 2)) + '" r="' + n1(Math.max(0.6, size * 0.04)) + '" fill="' + col + '" fill-opacity="0.8"/>';
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function globe(x, y, size) {
      var k = r.pick(gB), s = '<circle r="' + n1(size) + '" fill="' + k.ink[2] + '" fill-opacity="0.45"/>';
      var n = Math.round(14 + size * 1.2);
      for (var i = 0; i < n; i++) {
        var a = r.f() * Math.PI * 2, d = size * Math.sqrt(r.f()) * 0.92;
        var c = d > size * 0.6 ? k.ink[1] : k.ink[0];
        s += '<circle cx="' + n1(Math.cos(a) * d) + '" cy="' + n1(Math.sin(a) * d) + '" r="' + n1(Math.max(0.6, size * r.range(0.1, 0.17))) + '" fill="' + c + '" fill-opacity="0.7"/>';
      }
      s += '<circle cx="' + n1(-size * 0.3) + '" cy="' + n1(-size * 0.35) + '" r="' + n1(size * 0.22) + '" fill="#fff" fill-opacity="0.45"/>';
      return "<g " + tf(x, y, 0) + ">" + s + "</g>";
    }
    function berries(x, y, deg, size) {
      var k = r.pick(gB), s = "", n = r.int(3, 7);
      for (var i = 0; i < n; i++) {
        var bx = size * r.range(0.3, 1), by = r.range(-0.45, 0.45) * size, br = Math.max(1, size * r.range(0.14, 0.22));
        s += '<path d="M0,0 Q' + n1(bx * 0.6) + "," + n1(by * 0.2) + " " + n1(bx) + "," + n1(by) + '" fill="none" stroke="' + P.stem + '" stroke-width="0.5"/>';
        s += '<circle cx="' + n1(bx) + '" cy="' + n1(by) + '" r="' + n1(br) + '" fill="' + k.ink[1] + '" fill-opacity="0.85" stroke="' + k.ink[0] + '" stroke-width="0.4" stroke-opacity="0.5"/>';
        s += '<circle cx="' + n1(bx - br * 0.35) + '" cy="' + n1(by - br * 0.35) + '" r="' + n1(br * 0.3) + '" fill="#fff" fill-opacity="0.55"/>';
      }
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function fern(x, y, deg, size) {
      var k = r.pick(gL), s = "", n = r.int(6, 9), bend = r.range(-0.25, 0.25) * size;
      s += '<path d="M0,0 Q' + n1(size * 0.5) + "," + n1(bend) + " " + n1(size) + "," + n1(bend * 0.3) + '" fill="none" stroke="' + k.ink[0] + '" stroke-width="0.7" stroke-opacity="0.8"/>';
      for (var i = 1; i <= n; i++) {
        var t = i / (n + 1), px = size * t, py = bend * 2 * t * (1 - t) + bend * 0.3 * t * t;
        var L = size * 0.32 * (1 - t * 0.75);
        [1, -1].forEach(function (side) {
          s += '<g transform="translate(' + n1(px) + " " + n1(py) + ") rotate(" + n1(side * r.range(45, 62)) + ')">' + blade2("lanceolate", L, L * 0.38, k.out, k.ink, { steps: 5, streak: false, edge: 0 }) + "</g>";
        });
      }
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }
    function tendril(x, y, deg, size) {
      var pts = [], turns = r.range(1.4, 2.4), dir = r.sign();
      for (var i = 0; i <= 28; i++) {
        var t = i / 28, a = dir * t * turns * Math.PI * 2, rad = size * 0.35 * (1 - t * 0.8);
        pts.push([size * 0.6 * t + Math.sin(a) * rad * t, (1 - Math.cos(a)) * rad * t * dir]);
      }
      return "<g " + tf(x, y, deg) + '><path d="' + smooth(pts, false) + '" fill="none" stroke="' + P.stem + '" stroke-width="0.6" stroke-opacity="0.85"/></g>';
    }

    // ---- fauna ----
    function bird(x, y, facing, size) {
      var k = r.pick(gB), k2 = r.pick(gB);
      var body = blade(r, size, size * 0.52, PROFILES.ovate, size * 0.01, 10).map(function (p) { return [p[0] - size * 0.5, p[1]]; });
      var s = '<g transform="scale(' + facing + ',1)">';
      // tail
      s += '<path d="M' + n1(-size * 0.42) + ",0 L" + n1(-size * 0.95) + "," + n1(-size * 0.12) + " L" + n1(-size * 0.9) + "," + n1(size * 0.08) + 'Z" fill="' + k2.ink[0] + '" fill-opacity="0.8"/>';
      s += '<g transform="scale(-1,1)">' + wash(body.map(function (p) { return [-p[0], p[1]]; }), k.inn, k.ink, { L: size }) + "</g>";
      s += '<circle cx="' + n1(size * 0.42) + '" cy="' + n1(-size * 0.2) + '" r="' + n1(size * 0.2) + '" fill="' + k.ink[1] + '" fill-opacity="0.9"/>';
      // breast blush
      s += '<ellipse cx="' + n1(size * 0.18) + '" cy="' + n1(size * 0.1) + '" rx="' + n1(size * 0.22) + '" ry="' + n1(size * 0.14) + '" fill="' + k.ink[2] + '" fill-opacity="0.7"/>';
      // wing
      var wing = blade(r, size * 0.62, size * 0.3, PROFILES.lanceolate, 0.2, 8);
      s += '<g transform="translate(' + n1(size * 0.22) + "," + n1(-size * 0.06) + ') rotate(186)">' + wash(wing, k2.out, k2.ink, { L: size * 0.62, vein: true }) + "</g>";
      s += '<path d="M' + n1(size * 0.6) + "," + n1(-size * 0.24) + " l" + n1(size * 0.16) + "," + n1(size * 0.05) + " l" + n1(-size * 0.15) + "," + n1(size * 0.05) + 'Z" fill="' + P.accent + '"/>';
      s += '<circle cx="' + n1(size * 0.48) + '" cy="' + n1(-size * 0.25) + '" r="' + n1(Math.max(0.6, size * 0.04)) + '" fill="#111"/>';
      // feet
      s += '<path d="M0,' + n1(size * 0.22) + " l" + n1(-size * 0.04) + "," + n1(size * 0.14) + " M" + n1(size * 0.1) + "," + n1(size * 0.22) + " l0," + n1(size * 0.14) + '" stroke="' + P.stem + '" stroke-width="0.6"/>';
      return "<g " + tf(x, y, 0) + ">" + s + "</g></g>";
    }
    function butterfly(x, y, deg, size, moth) {
      var k = r.pick(gB), k2 = r.pick(gB), s = "";
      var fore = blade(r, size, size * (moth ? 0.5 : 0.62), PROFILES.wing, size * 0.02, 10);
      var hind = blade(r, size * 0.72, size * 0.6, PROFILES.hindwing, size * 0.02, 10);
      var persp = r.range(0.55, 0.9); // a three-quarter view: the far wings foreshortened
      [[1, 1], [-1, persp]].forEach(function (side) {
        var sx = side[0], sc = side[1];
        s += '<g transform="scale(' + n1(sc) + ',1)">';
        s += '<g transform="rotate(' + (sx > 0 ? -38 : -142) + ')">' + wash(fore, moth ? k.inn : k.out, k.ink, { L: size, vein: true }) + "</g>";
        s += '<g transform="rotate(' + (sx > 0 ? 28 : 152) + ')">' + wash(hind, k2.out, k2.ink, { L: size * 0.72, vein: true }) + "</g>";
        s += '<circle cx="' + n1(sx * size * 0.45) + '" cy="' + n1(-size * 0.42) + '" r="' + n1(size * 0.07) + '" fill="' + (moth ? k.ink[0] : "#fff") + '" fill-opacity="0.7"/>';
        s += "</g>";
      });
      s += '<ellipse rx="' + n1(size * 0.06) + '" ry="' + n1(size * 0.42) + '" fill="#2a2430" fill-opacity="0.85"/>';
      s += '<path d="M0,' + n1(-size * 0.38) + " q" + n1(-size * 0.1) + "," + n1(-size * 0.3) + " " + n1(-size * 0.22) + "," + n1(-size * 0.4) +
        " M0," + n1(-size * 0.38) + " q" + n1(size * 0.1) + "," + n1(-size * 0.3) + " " + n1(size * 0.22) + "," + n1(-size * 0.4) + '" fill="none" stroke="#2a2430" stroke-width="0.5"/>';
      return "<g " + tf(x, y, deg) + ">" + s + "</g>";
    }

    // ---- ornaments ----
    function sparkle(x, y, size, col) {
      var q = size * 0.12;
      return '<path d="M' + n1(x) + "," + n1(y - size) + " Q" + n1(x + q) + "," + n1(y - q) + " " + n1(x + size) + "," + n1(y) +
        " Q" + n1(x + q) + "," + n1(y + q) + " " + n1(x) + "," + n1(y + size) + " Q" + n1(x - q) + "," + n1(y + q) + " " + n1(x - size) + "," + n1(y) +
        " Q" + n1(x - q) + "," + n1(y - q) + " " + n1(x) + "," + n1(y - size) + 'Z" fill="' + col + '" fill-opacity="0.85"/>';
    }
    function plate(x, y, w) {
      var h = w * 1.5, k = P.bloom[0];
      var id = "pl" + counts.plate;
      defs.push('<linearGradient id="' + pfx + id + '" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="' + k[0] + '"/><stop offset="1" stop-color="' + k[1] + '"/></linearGradient>');
      var s = '<rect x="' + n1(x - w / 2) + '" y="' + n1(y - h / 2) + '" width="' + n1(w) + '" height="' + n1(h) + '" rx="1.5" fill="url(#' + pfx + id + ')" stroke="' + P.accent + '" stroke-width="1"/>';
      s += '<rect x="' + n1(x - w / 2 + 2) + '" y="' + n1(y - h / 2 + 2) + '" width="' + n1(w - 4) + '" height="' + n1(h - 4) + '" rx="1" fill="none" stroke="' + P.accent + '" stroke-width="0.4" stroke-opacity="0.8"/>';
      s += sparkle(x, y, w * 0.32, "#fff");
      for (var i = 0; i < 5; i++) s += '<circle cx="' + n1(x + r.range(-w / 2 + 3, w / 2 - 3)) + '" cy="' + n1(y + r.range(-h / 2 + 3, h / 2 - 3)) + '" r="0.5" fill="#fff" fill-opacity="0.8"/>';
      return s;
    }

    // ---- what grows at a branch tip ----
    function bloomAt(x, y, deg, size, sp) {
      switch (sp) {
        case "rosette": return { svg: rosette(x, y, size), r: size * 1.05, layer: "blooms" };
        case "cosmos": return { svg: cosmos(x, y, size * 0.95), r: size, layer: "blooms" };
        case "bell": return { svg: bell(x, y, deg, size * 0.85), r: size * 0.6, layer: "blooms", tip: true };
        case "bud": return { svg: bud(x, y, deg, size * 0.7), r: size * 0.45, layer: "blooms", tip: true };
        case "umbel": return { svg: umbel(x, y, deg, size * 0.9), r: size * 0.7, layer: "blooms", tip: true };
        case "forgetmenot": return { svg: forgetmenot(x, y, deg, size * 1.1), r: size * 0.7, layer: "blooms", tip: true };
        case "globe": return { svg: globe(x, y, size * 0.42), r: size * 0.45, layer: "blooms" };
        case "berries": return { svg: berries(x, y, deg, size * 0.7), r: size * 0.55, layer: "blooms", tip: true };
        case "fern": return { svg: fern(x, y, deg, size * 1.3), r: size * 0.8, layer: "leaves", tip: true };
        // a tendril on its own reads as a scribble: it curls beside a bud
        case "tendril": return { svg: tendril(x, y, deg + r.range(-50, 50), size * 1.1) + bud(x, y, deg, size * 0.6), r: size * 0.55, layer: "blooms", tip: true };
      }
      return null;
    }
    // the radius a tip-anchored thing reaches from its anchor
    function reach(b, x, y, deg, size) {
      if (!b.tip) return { x: x, y: y, r: b.r };
      var a = deg / DEG, d = b.r * 0.9;
      return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: b.r };
    }

    // ---- main stems by habit ----
    var stems = []; // arrays of samples
    var step = 10;
    function sideStem(side, phase, ampMul, x0frac) {
      var mW = side < 0 ? mL : mR;
      var cx = side < 0 ? mL * (x0frac || 0.5) : box.x1 + mR * (1 - (x0frac || 0.5));
      var amp = mW * 0.16 * g.wave * (ampMul || 1);
      var wl = r.range(180, 340) / g.wave;
      var top = r.range(mT * 0.25, mT * 0.8), bot = H - r.range(4, mB * 0.4);
      var ctrl = [], y;
      // base curl: start along the bottom margin, sweeping round into the side
      if (g.habit !== "frame" && r.chance(0.75) && mB > 20) {
        var inward = side < 0 ? 1 : -1;
        var reachX = (box.x1 - box.x0) * r.range(0.12, 0.35);
        var by = H - mB * r.range(0.35, 0.6);
        ctrl.push([cx + inward * (mW * 0.5 + reachX), by + r.range(-4, 4)]);
        ctrl.push([cx + inward * (mW * 0.5 + reachX * 0.45), by + r.range(-3, 3)]);
        ctrl.push([cx + inward * mW * 0.15, by - mB * 0.1]);
      } else {
        ctrl.push([cx, bot]);
      }
      for (y = ctrl[ctrl.length - 1][1] - wl / 4; y > top; y -= wl / 4) {
        var x = cx + Math.sin((y / wl) * Math.PI * 2 + phase) * amp + r.range(-amp, amp) * 0.25;
        ctrl.push([x, y]);
      }
      // the climbing tip nods over toward the text (but not into it)
      ctrl.push([cx + (side < 0 ? 1 : -1) * mW * 0.18, top - r.range(0, mT * 0.2)]);
      // clamp to the margin
      ctrl = ctrl.map(function (p) {
        var lo = 3, hi = W - 3;
        if (p[1] > box.y0 - gap && p[1] < box.y1 + gap) { if (side < 0) hi = box.x0 - gap - 3; else lo = box.x1 + gap + 3; }
        return [Math.max(lo, Math.min(hi, p[0])), p[1]];
      });
      // stems run bottom→top; reverse so samples go base → tip
      return resample(ctrl, step);
    }
    function frameStem() {
      var inset = Math.min(mL, mR, mT, mB) * 0.42, rad = Math.min(mL, mR) * 1.2;
      var x0 = mL * 0.42, x1 = W - mR * 0.42, y0 = mT * 0.45, y1 = H - mB * 0.45, ctrl = [];
      function jig(v) { return v + r.range(-inset, inset) * 0.25; }
      var i, n;
      // left side, bottom → top
      n = Math.max(3, Math.round((y1 - y0) / 180));
      for (i = 0; i <= n; i++) ctrl.push([jig(x0) + Math.sin(i * 1.7) * mL * 0.08 * g.wave, y1 - rad * 0.3 - (y1 - y0 - rad * 0.6) * i / n]);
      // top, left → right
      n = Math.max(3, Math.round((x1 - x0) / 160));
      for (i = 0; i <= n; i++) ctrl.push([x0 + rad * 0.3 + (x1 - x0 - rad * 0.6) * i / n, jig(y0)]);
      // right side, top → bottom
      n = Math.max(3, Math.round((y1 - y0) / 180));
      for (i = 0; i <= n; i++) ctrl.push([jig(x1) + Math.sin(i * 1.3) * mR * 0.08 * g.wave, y0 + rad * 0.3 + (y1 - y0 - rad * 0.6) * i / n]);
      // bottom, right → left
      n = Math.max(3, Math.round((x1 - x0) / 160));
      for (i = 0; i <= n; i++) ctrl.push([x1 - rad * 0.3 - (x1 - x0 - rad * 0.6) * i / n, jig(y1)]);
      ctrl.push(ctrl[0]);
      ctrl = ctrl.map(function (p) {
        var x = p[0], y = p[1];
        if (y > box.y0 - gap && y < box.y1 + gap) { if (x < W / 2) x = Math.min(x, box.x0 - gap - 3); else x = Math.max(x, box.x1 + gap + 3); }
        if (x > box.x0 - gap && x < box.x1 + gap) { if (y < H / 2) y = Math.min(y, box.y0 - gap - 3); else y = Math.max(y, box.y1 + gap + 3); }
        return [Math.max(3, Math.min(W - 3, x)), Math.max(3, Math.min(H - 3, y))];
      });
      return resample(ctrl, step);
    }

    var phase = r.range(0, Math.PI * 2);
    // a frame needs four margins; on a page with no head or foot (the print
    // frame) it climbs instead
    var habit = g.habit === "frame" && (mT < 24 || mB < 24) ? "climbing" : g.habit;
    if (habit === "climbing" || habit === "meander") {
      var amp = habit === "meander" ? 2 : 1;
      stems.push(sideStem(-1, phase, amp));
      stems.push(sideStem(1, g.mirror ? Math.PI - phase : r.range(0, 7), amp));
    } else if (habit === "twining") {
      stems.push(sideStem(-1, phase, 1.4, 0.5));
      stems.push(sideStem(-1, phase + Math.PI, 1.4, 0.5));
      stems.push(sideStem(1, g.mirror ? Math.PI - phase : phase + 1, 1.4, 0.5));
      stems.push(sideStem(1, g.mirror ? -phase : phase + 1 + Math.PI, 1.4, 0.5));
    } else if (habit === "frame") {
      stems.push(frameStem());
    }

    // ======================= the thicket =======================
    // Everything below draws by INSTANCE: each species/leaf/spray is built a
    // handful of times as a prototype in <defs> and then stamped with <use>.
    // That is what lets a margin carry thousands of things for ~100 bytes each.
    var LIB = {}, libR = Rand("flora-lib:" + g.seed + ":" + g.biome), U = 20;
    function lib(kind, nVar, build) {
      var key = kind + "#" + r.int(0, nVar - 1);
      if (!LIB[key]) {
        var save = r; r = libR;
        var svg = build();
        r = save;
        var id = pfx + "k" + Object.keys(LIB).length;
        defs.push('<g id="' + id + '">' + svg + "</g>");
        LIB[key] = id; LIBSVG[id] = svg;
      }
      return LIB[key];
    }
    // opts.inline writes each instance out in full instead of <use> — for
    // consumers that can't resolve references (some SVG→raster tools)
    var LIBSVG = {};
    function use(id, x, y, deg, s) {
      return opts.inline ? "<g " + tf(x, y, deg, s) + ">" + LIBSVG[id] + "</g>" : '<use href="#' + id + '" ' + tf(x, y, deg, s) + "/>";
    }

    // bands: each layer is cut into horizontal bands that fade in top-down
    var BAND = 140, bands = { back: {}, stems: {}, leaves: {}, blooms: {}, fauna: {} };
    function add(layer, y, svg) {
      var b = Math.max(0, Math.floor(y / BAND));
      (bands[layer][b] = bands[layer][b] || []).push(svg);
    }

    // per-kind spatial lists (only heroes/fauna/plates ever ask "is it crowded?")
    var byKind = {};
    function place(x, y, rad, kind, solid) {
      var it = { x: x, y: y, r: rad, kind: kind };
      items.push(it); (byKind[kind] = byKind[kind] || []).push(it);
      counts[kind] = (counts[kind] || 0) + 1;
      mark(x, y, rad * (solid == null ? 1 : solid)); // wiry things paint less than their footprint
    }
    function crowdedK(x, y, rad, kinds, slack) {
      for (var k = 0; k < kinds.length; k++) {
        var L = byKind[kinds[k]] || [];
        for (var i = 0; i < L.length; i++) if (Math.hypot(L[i].x - x, L[i].y - y) < (L[i].r + rad) * (slack || 1)) return true;
      }
      return false;
    }

    // coverage grid over the margins: the fill pass plants until it is painted
    var CELL = 9, gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL), cov = new Uint8Array(gw * gh);
    var marginCells = [];
    for (var cy = 0; cy < gh; cy++) for (var cx = 0; cx < gw; cx++) {
      var px = (cx + 0.5) * CELL, py = (cy + 0.5) * CELL;
      if (!inText(px, py, CELL * 0.5) && px < W && py < H) marginCells.push(cy * gw + cx);
    }
    function mark(x, y, rad) {
      var rr = rad * 0.72, x0 = Math.max(0, Math.floor((x - rr) / CELL)), x1 = Math.min(gw - 1, Math.floor((x + rr) / CELL));
      var y0 = Math.max(0, Math.floor((y - rr) / CELL)), y1 = Math.min(gh - 1, Math.floor((y + rr) / CELL));
      for (var j = y0; j <= y1; j++) for (var i = x0; i <= x1; i++)
        if (Math.hypot((i + 0.5) * CELL - x, (j + 0.5) * CELL - y) <= rr + CELL * 0.5) cov[j * gw + i] = 1;
    }
    function coverage() { var c = 0; for (var i = 0; i < marginCells.length; i++) c += cov[marginCells[i]]; return marginCells.length ? c / marginCells.length : 1; }

    // ---- extra prototypes the thicket needs ----
    // wiry stalks fanning out, ending in dense clusters of dot-flowers
    function dotspray() {
      var s = "", n = r.int(2, 4), col = r.chance(0.7) ? P.small : r.pick(gB).ink[1], spread = r.range(50, 110);
      for (var i = 0; i < n; i++) {
        var a = (-spread / 2 + spread * (n === 1 ? 0.5 : i / (n - 1)) + r.range(-8, 8)) / DEG;
        var L = U * r.range(0.6, 1.05), ex = Math.cos(a) * L, ey = Math.sin(a) * L, bend = r.range(-3, 3);
        s += '<path d="M0,0Q' + n1(ex * 0.5 - Math.sin(a) * bend) + "," + n1(ey * 0.5 + Math.cos(a) * bend) + " " + n1(ex) + "," + n1(ey) + '" fill="none" stroke="' + P.stem + '" stroke-width="0.45" stroke-opacity="0.85"/>';
        var m = r.int(4, 9);
        for (var j = 0; j < m; j++) {
          var t = r.range(0.55, 1.1), qx = ex * t + r.range(-2.2, 2.2), qy = ey * t + r.range(-2.2, 2.2);
          s += r.chance(0.3) ? tinyFlower(qx, qy, r.range(0.7, 1.1), col, P.accent)
            : '<circle cx="' + n1(qx) + '" cy="' + n1(qy) + '" r="' + n1(r.range(0.55, 1.15)) + '" fill="' + col + '" fill-opacity="' + n1(r.range(0.55, 0.95)) + '"/>';
        }
      }
      return s;
    }
    // a stalk with alternating leaves — a sprig of foliage
    function leafspray() {
      var s = '<path d="M0,0Q' + n1(U * 0.5) + "," + n1(r.range(-2, 2)) + " " + n1(U) + ',0" fill="none" stroke="' + P.stem + '" stroke-width="0.7"/>';
      var n = r.int(3, 6);
      for (var i = 0; i < n; i++) {
        var t = 0.2 + 0.8 * i / n, sd = i % 2 ? 1 : -1;
        s += leaf(U * t, 0, sd * r.range(30, 60), U * r.range(0.32, 0.5) * (1 - t * 0.35));
      }
      return s + leaf(U, 0, r.range(-10, 10), U * 0.4);
    }

    // species → {proto builder, footprint radius at size U, tip-anchored?, layer}
    var SP = {
      rosette: { b: function () { return rosette(0, 0, U); }, r: 1.05, tip: false, layer: "blooms" },
      cosmos: { b: function () { return cosmos(0, 0, U * 0.95); }, r: 1, tip: false, layer: "blooms" },
      bell: { b: function () { return bell(0, 0, 0, U * 0.85); }, r: 0.6, tip: true, layer: "blooms" },
      bud: { b: function () { return bud(0, 0, 0, U * 0.7); }, r: 0.42, tip: true, layer: "blooms" },
      umbel: { b: function () { return umbel(0, 0, 0, U * 0.9); }, r: 0.65, tip: true, layer: "blooms" },
      forgetmenot: { b: function () { return forgetmenot(0, 0, 0, U * 1.1); }, r: 0.7, tip: true, layer: "blooms" },
      globe: { b: function () { return globe(0, 0, U * 0.42); }, r: 0.45, tip: false, layer: "blooms" },
      berries: { b: function () { return berries(0, 0, 0, U * 0.7); }, r: 0.5, tip: true, layer: "blooms" },
      fern: { b: function () { return fern(0, 0, 0, U * 1.3); }, r: 0.75, tip: true, layer: "leaves" },
      tendril: { b: function () { return tendril(0, 0, r.range(-50, 50), U * 1.1) + bud(0, 0, 0, U * 0.6); }, r: 0.55, tip: true, layer: "blooms" },
      dotspray: { b: dotspray, r: 0.62, tip: true, layer: "blooms" },
      leafspray: { b: leafspray, r: 0.62, tip: true, layer: "leaves" },
    };
    // how much of its footprint each thing actually paints (for the coverage grid)
    var SOLID = { dotspray: 0.35, umbel: 0.35, forgetmenot: 0.4, tendril: 0.35, leafspray: 0.5, fern: 0.5, berries: 0.5, bell: 0.6, bud: 0.55, globe: 0.9, rosette: 0.9, cosmos: 0.85 };
    LEAVES.forEach(function (f) {
      SP["leaf:" + f] = { b: function () { return leaf(0, 0, 0, U, f); }, r: 0.5, tip: true, layer: "leaves" };
    });
    // footprint of an instance: tip-anchored things reach out along their angle
    function foot(sp, x, y, deg, size) {
      var d = SP[sp], rad = d.r * size;
      if (!d.tip) return { x: x, y: y, r: rad };
      var a = deg / DEG;
      return { x: x + Math.cos(a) * rad * 0.95, y: y + Math.sin(a) * rad * 0.95, r: rad };
    }
    // try to set a thing down; shrinks to fit the margin; returns its footprint or null
    function put(sp, x, y, deg, size, kind, layer, allowEdge) {
      for (var k = 0; k < 4; k++) {
        var f = foot(sp, x, y, deg, size);
        var ok = allowEdge ? !inText(f.x, f.y, f.r) && f.x > -f.r * 0.4 && f.x < W + f.r * 0.4 && f.y > -f.r * 0.4 && f.y < H + f.r * 0.4
          : fits(f.x, f.y, f.r);
        if (ok && !inText(x, y, 1)) {
          var nv = sp.indexOf("leaf") === 0 || sp === "dotspray" || sp === "leafspray" ? 8 : 6;
          add(layer || SP[sp].layer, y, use(lib(sp, nv, SP[sp].b), x, y, deg, size / U));
          place(f.x, f.y, f.r, kind || "bloom", SOLID[sp] || (sp.indexOf("leaf:") === 0 ? 0.6 : 0.8));
          return f;
        }
        size *= 0.75;
        if (size < 3) break;
      }
      return null;
    }

    // taste: who appears how often
    var showy = g.species.filter(function (s) { return s === "rosette" || s === "cosmos"; });
    var minor = g.species.filter(function (s) { return s !== "rosette" && s !== "cosmos"; });
    if (!minor.length) minor = ["bud"];
    var heroSp = showy.length ? showy : ["rosette"];
    function leafSp() { return "leaf:" + r.pick(g.leaves); }
    function smallBloom() { return r.chance(0.07) ? r.pick(heroSp) : r.pick(minor); }
    function anyThing() {
      return r.pickw([[leafSp(), 3.4], ["dotspray", 3.4], [smallBloom(), 1.6], ["leafspray", 1.4], ["forgetmenot", 1], ["umbel", 0.8]]);
    }

    // ---- stems: the habit's main vines, plus companions so no stem is alone ----
    if (habit !== "scatter" && habit !== "frame") {
      // a thinner companion vine on each side, out of phase
      stems.push(sideStem(-1, phase + 2.1, 0.8, r.range(0.35, 0.65)));
      stems.push(sideStem(1, phase + 4.2, 0.8, r.range(0.35, 0.65)));
    } else if (habit === "frame") {
      stems.push(sideStem(-1, phase + 1.3, 1.1, 0.55));
      stems.push(sideStem(1, phase + 2.9, 1.1, 0.45));
    } else {
      // scatter: no vine, but a ground of low stems along the foot
    }
    var stemW = Math.max(1.3, 4.2 * S);
    stems.forEach(function (sm, si) {
      var main = si < (habit === "twining" ? 4 : habit === "frame" ? 1 : 2);
      var w0 = main ? stemW : stemW * 0.55, w1 = habit === "frame" && si === 0 ? w0 * 0.8 : w0 * 0.35;
      add("stems", 0, '<path d="' + ribbon(sm, w0, w1) + '" fill="' + P.stem + '" fill-opacity="0.85"/>');
      // the brush's second pass: a darker hairline beside the wash, and a wet highlight
      add("stems", 0, '<path d="' + smooth(sm.filter(function (_, i) { return i % 3 === 0; }).map(function (q) {
        return [q.x + Math.sin(q.ang) * w0 * 0.5, q.y - Math.cos(q.ang) * w0 * 0.5];
      }), false) + '" fill="none" stroke="' + P.stem + '" stroke-opacity="0.55" stroke-width="' + n1(Math.max(0.4, w0 * 0.18)) + '"/>');
      add("stems", 0, '<path d="' + smooth(sm.filter(function (_, i) { return i % 3 === 0; }).map(function (q) {
        return [q.x - Math.sin(q.ang) * w0 * 0.15, q.y + Math.cos(q.ang) * w0 * 0.15];
      }), false) + '" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="' + n1(Math.max(0.4, w0 * 0.2)) + '"/>');
      sm.forEach(function (q, i) { if (i % 2 === 0) place(q.x, q.y, w0 * 0.6, "stem"); });
    });

    // a branch: a curved stalk carrying leaves and blooms, which may branch again
    function branch(x, y, deg, len, depth) {
      var a = deg / DEG, bend = r.range(-0.35, 0.35);
      var ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      var mx = x + Math.cos(a + bend) * len * 0.55, my = y + Math.sin(a + bend) * len * 0.55;
      if (!fits(ex, ey, 2) || !fits(mx, my, 2)) {
        len *= 0.55; ex = x + Math.cos(a) * len; ey = y + Math.sin(a) * len;
        mx = x + Math.cos(a + bend) * len * 0.55; my = y + Math.sin(a + bend) * len * 0.55;
        if (!fits(ex, ey, 2) || !fits(mx, my, 2)) return false;
      }
      var w = Math.max(0.5, stemW * (depth === 0 ? 0.42 : 0.26));
      add("stems", y, '<path d="M' + n1(x) + "," + n1(y) + "Q" + n1(mx) + "," + n1(my) + " " + n1(ex) + "," + n1(ey) + '" fill="none" stroke="' + P.stem + '" stroke-width="' + n1(w) + '" stroke-linecap="round" stroke-opacity="0.85"/>');
      place(mx, my, 1, "stem"); place(ex, ey, 1, "stem");
      // things along the branch
      var along = r.int(1, 3);
      for (var i = 0; i < along; i++) {
        var t = r.range(0.25, 0.85), qx = (1 - t) * (1 - t) * x + 2 * t * (1 - t) * mx + t * t * ex, qy = (1 - t) * (1 - t) * y + 2 * t * (1 - t) * my + t * t * ey;
        var ad = deg + r.sign() * r.range(35, 75);
        if (r.chance(0.6)) put(leafSp(), qx, qy, ad, r.range(16, 34) * S, "leaf");
        else put(r.chance(0.6) ? "dotspray" : smallBloom(), qx, qy, ad, r.range(12, 22) * S);
      }
      // the tip
      var tipDeg = deg + bend * DEG * 0.8;
      if (depth < 2 && r.chance(0.55)) {
        branch(ex, ey, tipDeg + r.sign() * r.range(25, 50), len * r.range(0.5, 0.75), depth + 1);
        if (r.chance(0.5)) branch(ex, ey, tipDeg - r.sign() * r.range(25, 50), len * r.range(0.45, 0.7), depth + 1);
      } else {
        var sp = r.chance(0.1) ? r.pick(heroSp) : smallBloom();
        put(sp, ex, ey, tipDeg, (sp === "rosette" || sp === "cosmos" ? r.range(13, 22) : r.range(14, 24)) * S);
      }
      return true;
    }

    // walk every stem by arc length, emitting something every few pixels
    var spacing = 11 / g.density / Math.max(0.7, S);
    stems.forEach(function (sm) {
      var total = sm[sm.length - 1].s, k = 0, side = r.sign();
      for (var s = r.range(2, spacing); s < total - 4; s += spacing * r.range(0.6, 1.4)) {
        while (k < sm.length - 1 && sm[k].s < s) k++;
        var q = sm[k], tdeg = q.ang * DEG;
        side = r.chance(0.7) ? -side : side;
        var ad = tdeg + side * r.range(30, 72);
        var act = r.pickw([["leaf", 4.2], ["branch", 2.2], ["spray", 2], ["bloom", 1.2], ["pair", 1]]);
        if (act === "leaf") put(leafSp(), q.x, q.y, ad, r.range(20, 44) * S, "leaf") || put(leafSp(), q.x, q.y, tdeg - side * r.range(30, 72), r.range(18, 36) * S, "leaf");
        else if (act === "pair") { put(leafSp(), q.x, q.y, tdeg + 50, r.range(16, 30) * S, "leaf"); put(leafSp(), q.x, q.y, tdeg - 50, r.range(16, 30) * S, "leaf"); }
        else if (act === "branch") branch(q.x, q.y, ad, r.range(22, 64) * S, 0) || branch(q.x, q.y, tdeg - side * r.range(30, 72), r.range(18, 44) * S, 0);
        else if (act === "spray") put(r.chance(0.7) ? "dotspray" : "leafspray", q.x, q.y, ad, r.range(16, 30) * S);
        else put(smallBloom(), q.x, q.y, ad, r.range(13, 22) * S);
      }
    });

    // ---- heroes: big showy blossoms with their own leaves, allowed to spill off the page edge ----
    var heroBase = Math.max(9, Math.min(Math.max(mL, mR) * 0.5, 62 * S));
    function hero(x, y, sz) {
      var sp = r.pick(heroSp);
      // leaves behind first, fanned around
      var nl = r.int(3, 5), a0 = r.range(0, 360);
      for (var j = 0; j < nl; j++) put(leafSp(), x, y, a0 + j * 360 / nl + r.range(-20, 20), sz * r.range(1.1, 1.6), "leaf", "leaves", true);
      put("bud", x, y, r.range(0, 360), sz * 0.8, "bloom", "blooms", true);
      add("blooms", y, use(lib(sp, 6, SP[sp].b), x, y, r.range(0, 360), sz / U));
      place(x, y, sz, "hero");
    }
    [[0, mL, -1], [box.x1, W, 1]].forEach(function (span) {
      var mW = span[1] - span[0];
      if (mW < 18) return;
      var n = Math.max(1, Math.round(H / 520 * g.density));
      for (var i = 0; i < n; i++) {
        var sz = heroBase * r.range(0.7, 1.05);
        for (var t = 0; t < 30; t++) {
          // centre may sit past the outer page edge by a third of the bloom
          var x = span[2] < 0 ? r.range(-sz * 0.3, mW - sz - gap) : r.range(box.x1 + gap + sz, W + sz * 0.3);
          var y = r.range(H * i / n, H * (i + 1) / n);
          if (inText(x, y, sz) || y < -sz * 0.3 || y > H + sz * 0.3 || crowdedK(x, y, sz, ["hero"], 1.05) || crowdedK(x, y, sz, ["fauna"], 1)) continue;
          hero(x, y, sz); break;
        }
      }
    });
    // and a couple for the head and foot strips, when they are deep enough
    [[0, mT], [box.y1, H]].forEach(function (span) {
      var mH = span[1] - span[0];
      if (mH < 50) return;
      var n = Math.max(1, Math.round((box.x1 - box.x0) / 260 * g.density));
      for (var i = 0; i < n; i++) {
        var sz = Math.min(heroBase, mH * 0.42) * r.range(0.7, 1);
        for (var t = 0; t < 20; t++) {
          var x = r.range(box.x0 + (box.x1 - box.x0) * i / n, box.x0 + (box.x1 - box.x0) * (i + 1) / n), y = r.range(span[0], span[1]);
          if (!fits(x, y, sz * 1.02) || crowdedK(x, y, sz, ["hero"], 1.05)) continue;
          hero(x, y, sz); break;
        }
      }
    });

    // ---- the foot garden: plants rising from the bottom edge (and, smaller, hanging from the top) ----
    if (mB > 40) {
      for (var gx = r.range(10, 40); gx < W - 10; gx += r.range(34, 70) * Math.max(0.7, S)) {
        branch(gx, H - r.range(2, mB * 0.2), -90 + r.range(-35, 35), Math.min(mB * r.range(0.55, 0.95), 120 * S), 0);
      }
    }
    if (mT > 50) {
      for (var tx = r.range(20, 60); tx < W - 20; tx += r.range(60, 120) * Math.max(0.7, S)) {
        branch(tx, r.range(2, mT * 0.25), 90 + r.range(-50, 50), mT * r.range(0.4, 0.7), 1);
      }
    }
    // scatter has no vine: sprigs rise all down the side margins instead
    if (habit === "scatter") {
      [[0, mL], [box.x1, W]].forEach(function (span) {
        for (var y = r.range(10, 40); y < H; y += r.range(26, 48) * Math.max(0.7, S)) {
          branch(r.range(span[0] + 4, span[1] - 4), y, -90 + r.range(-55, 55), r.range(20, 50) * S, 0);
        }
      });
    }

    // ---- fauna, before the fill so the fill tucks in around them ----
    if (g.fauna.bird && mSide > 26) {
      var nb = Math.max(1, Math.round(H / 1000)), placedB = 0;
      for (var bi = 0; bi < 80 && placedB < nb; bi++) {
        var bsz = Math.min(30 * S, mSide * 0.48), bx, by;
        if (stems.length) { var sm = r.pick(stems), qq = sm[r.int(0, sm.length - 1)]; bx = qq.x; by = qq.y - bsz * 0.36; }
        else { bx = r.range(0, W); by = r.range(0, H); }
        if (!fits(bx, by, bsz * 0.75) || crowdedK(bx, by, bsz * 0.8, ["hero", "fauna"], 1)) continue;
        add("fauna", by, bird(bx, by, bx < W / 2 ? 1 : -1, bsz));
        place(bx, by, bsz * 0.8, "fauna"); placedB++;
      }
    }
    [["butterfly", 520, false], ["moth", 1300, true]].forEach(function (f) {
      if (!g.fauna[f[0]] || mSide < 22) return;
      var nf = Math.max(1, Math.round(H / f[1])), got = 0;
      for (var i = 0; i < 120 && got < nf; i++) {
        var fsz = Math.min(17 * S, mSide * 0.28) * r.range(0.8, 1.2), x = r.range(0, W), y = r.range(0, H);
        if (!fits(x, y, fsz * 1.1) || crowdedK(x, y, fsz * 1.1, ["hero", "fauna"], 1)) continue;
        add("fauna", y, butterfly(x, y, r.range(-35, 35), fsz, f[2]));
        place(x, y, fsz * 1.1, "fauna"); got++;
      }
    });
    if (g.ornaments.plates && mSide > 34) {
      var npl = Math.max(1, Math.round(H / 1100));
      counts.plate = 0;
      for (var pi = 0; pi < 60 && counts.plate < npl; pi++) {
        var pw = Math.min(24 * S, mSide * 0.3), x = r.range(0, W), y = r.range(0, H);
        if (!fits(x, y, pw) || crowdedK(x, y, pw, ["hero", "fauna", "plate"], 1.2)) continue;
        add("fauna", y, plate(x, y, pw));
        place(x, y, pw, "plate");
      }
    }

    // ---- the fill: keep planting into bare margin until it is painted ----
    // not wall-to-wall: the paper should still breathe between the sprays
    var target = Math.min(0.85, 0.6 + 0.14 * g.density);
    var order2 = marginCells.slice();
    for (var oi = order2.length - 1; oi > 0; oi--) { var oj = Math.floor(r.f() * (oi + 1)), tmp = order2[oi]; order2[oi] = order2[oj]; order2[oj] = tmp; }
    var covered = Math.round(coverage() * marginCells.length), want2 = target * marginCells.length;
    for (var pass = 0; pass < 1; pass++) {
      for (var ci = 0; ci < order2.length && covered < want2; ci++) {
        var cell = order2[ci];
        if (cov[cell]) continue;
        if (ci % 40 === 0) covered = Math.round(coverage() * marginCells.length);
        var fx = (cell % gw + r.range(0.1, 0.9)) * CELL, fy = (Math.floor(cell / gw) + r.range(0.1, 0.9)) * CELL;
        var sp2 = anyThing();
        var sz2 = (sp2.indexOf("leaf:") === 0 ? r.range(14, 32) : r.range(12, 26)) * Math.max(0.6, S);
        // anchor slightly behind the bare cell so the thing reaches into it
        var dg = r.range(0, 360);
        if (!put(sp2, fx - Math.cos(dg / DEG) * sz2 * 0.4, fy - Math.sin(dg / DEG) * sz2 * 0.4, dg, sz2, "fill")) {
          if (!put("dotspray", fx, fy, dg, sz2 * 0.7, "fill")) cov[cell] = 1; // too tight for anything: leave it to the paper
        }
      }
    }

    // ---- ornaments on top of nothing: gilt sparkles, guide rules ----
    if (g.ornaments.guide && mSide > 30) {
      [3.5, W - 3.5].forEach(function (gx) {
        add("back", 0, '<line x1="' + gx + '" y1="' + n1(Math.max(4, mT * 0.4)) + '" x2="' + gx + '" y2="' + n1(H - Math.max(4, mB * 0.4)) + '" stroke="' + P.accent + '" stroke-width="0.5" stroke-dasharray="1 3" stroke-opacity="0.8"/>');
        for (var y = r.range(40, 140); y < H - 20; y += r.range(110, 220)) {
          add("back", y, r.chance(0.5)
            ? '<path d="M' + gx + "," + n1(y - 5) + " L" + n1(gx + 2.6) + "," + n1(y) + " L" + gx + "," + n1(y + 5) + " L" + n1(gx - 2.6) + "," + n1(y) + 'Z" fill="#fff" stroke="' + P.accent + '" stroke-width="0.7"/>'
            : '<path d="M' + gx + "," + n1(y - 5) + " L" + gx + "," + n1(y + 5) + " M" + n1(gx - 2.5) + "," + n1(y - 1.5) + " L" + n1(gx + 2.5) + "," + n1(y - 1.5) + '" stroke="' + P.accent + '" stroke-width="0.6"/>');
        }
      });
    }
    if (g.ornaments.sparkles) {
      var ns = Math.round(marginCells.length * CELL * CELL / 2400 * g.density);
      for (var k2 = 0; k2 < ns; k2++) {
        var c2 = marginCells[r.int(0, marginCells.length - 1)], sx = (c2 % gw + r.f()) * CELL, sy = (Math.floor(c2 / gw) + r.f()) * CELL, ss = r.range(1.4, 4.2) * Math.max(0.6, S);
        if (!fits(sx, sy, ss)) continue;
        add("fauna", sy, r.chance(0.75) ? sparkle(sx, sy, ss, P.accent) : '<circle cx="' + n1(sx) + '" cy="' + n1(sy) + '" r="' + n1(ss * 0.3) + '" fill="' + P.accent + '"/>');
      }
    }

    // ---- assemble ----
    function layer(name, off) {
      var keys = Object.keys(bands[name]).map(Number).sort(function (a, b) { return a - b; });
      return '<g class="f-' + name + '">' + keys.map(function (b) {
        var inner = bands[name][b].join("");
        return animated ? '<g class="fb" style="--o:' + Math.min(1, b * BAND / H + off).toFixed(3) + '">' + inner + "</g>" : inner;
      }).join("") + "</g>";
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" class="flora" viewBox="0 0 ' + n1(W) + " " + n1(H) + '" width="' + n1(W) + '" height="' + n1(H) + '" aria-hidden="true">' +
      "<defs>" + defs.join("") + "</defs>" +
      layer("back", 0) + layer("stems", 0) + layer("leaves", 0.03) + layer("blooms", 0.06) + layer("fauna", 0.09) +
      "</svg>";
    // tiles (opts.tile = px): the same garden cut into horizontal SVGs, so a
    // page can insert them one at a time and paint its text first. Tile 0
    // carries the <defs> and the whole-length vines (it overflows visibly);
    // every band lives in the tile its top falls in.
    var tiles = null;
    if (opts.tile) {
      var T = Math.max(BAND, Math.round(opts.tile / BAND) * BAND), nT = Math.ceil(H / T);
      tiles = [];
      for (var ti = 0; ti < nT; ti++) {
        var y0 = ti * T, h0 = Math.min(T, H - y0), parts = "";
        ["back", "stems", "leaves", "blooms", "fauna"].forEach(function (name, li) {
          var off = [0, 0, 0.03, 0.06, 0.09][li], inner = "";
          Object.keys(bands[name]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (b) {
            if (b * BAND < y0 || b * BAND >= y0 + T) return;
            var body = bands[name][b].join("");
            inner += animated ? '<g class="fb" style="--o:' + Math.min(1, b * BAND / H + off).toFixed(3) + '">' + body + "</g>" : body;
          });
          if (inner) parts += '<g class="f-' + name + '">' + inner + "</g>";
        });
        tiles.push({ y: y0, h: h0, svg: '<svg xmlns="http://www.w3.org/2000/svg" class="flora tile" viewBox="0 ' + n1(y0) + " " + n1(W) + " " + n1(h0) + '" width="' + n1(W) + '" height="' + n1(h0) + '" overflow="visible" style="top:' + n1(y0) + 'px" aria-hidden="true">' +
          (ti === 0 ? "<defs>" + defs.join("") + "</defs>" : "") + parts + "</svg>" });
      }
    }
    return { svg: svg, tiles: tiles, items: items, counts: counts, genome: g, scale: S, coverage: coverage() };
  }


  F.PALETTES = PALETTES;
  F.HABITS = HABITS;
  F.SPECIES = SPECIES;
  F.genome = genome;
  F.describe = describe;
  F.grow = grow;
  F.kind = "flora";
  // the geometry core, shared with the other margin engines (serpent.js)
  F.core = { Rand: Rand, xmur3: xmur3, n1: n1, pt: pt, smooth: smooth, blob: blob, blade: blade,
    scalePts: scalePts, resample: resample, ribbon: ribbon, PROFILES: PROFILES };
})();
